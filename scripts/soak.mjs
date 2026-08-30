// PRD §11: "A full 12-question game with 10 players completes without a
// desync or stall." Run: npm run soak
//
// Ten browsers is the wrong instrument. This machine cannot sustain two
// concurrent Pixi/WebGL contexts under load (CURRENT.md), so ten Playwright
// contexts would measure SwiftShader rather than the game. Desync and stall
// are PROTOCOL failures — a broadcast that never lands, an answer the server
// rejects, a deadline that drifts — and the protocol is fully reachable from
// supabase-js in Node with no renderer at all.
//
// The script plays the host itself. That is not a simplification: the host
// client IS a timer plus advance_phase (lib/useHostDriver.ts), and this is the
// same loop with the same guard against a re-entrant call.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

const PLAYERS = 10;
const ROUNDS = 12;
const TIMER_SECONDS = 5; // shortens the run; the assertions are unaffected

// ---- Room and roster -------------------------------------------------------
const room = await rpc('create_room', {
  p_timer_seconds: TIMER_SECONDS,
  p_categories: ['ai-tech', 'fuel', 'corporate'],
  p_tier_counts: [4, 4, 3, 1],
});
if (room.total_rounds !== ROUNDS) throw new Error(`expected ${ROUNDS} rounds`);

// A non-racing MC host, so the answer key is readable (ADR-0040) — the same
// shape scripts/smoke.mjs uses, and the reason it can assert on correctness at
// all now that the bank no longer has a predictable correct_index. The MC
// never races (host authority runs on `room.host_key`, not a player key), so
// nothing here needs `join_room`'s own return value — only the join itself.
await rpc('join_room', {
  p_code: room.code, p_nickname: 'MC', p_avatar: 'robot', p_color: '#f59e0b',
  p_host_key: room.host_key, p_is_playing: false,
});
const draw = await rpc('get_room_draw', { p_room_id: room.room_id, p_host_key: room.host_key });
const key = draw.questions.map(q => q.correct_index);

const racers = [];
for (let i = 0; i < PLAYERS; i++) {
  racers.push(await rpc('join_room', {
    p_code: room.code, p_nickname: `Racer${i}`, p_avatar: 'duck', p_color: '#38bdf8',
  }));
}

// ---- Ten sockets, each recording every phase event it is told about --------
//
// The host gets its OWN channel, and this is load-bearing rather than tidy:
// Supabase broadcast defaults to `self: false`, so a sender never receives its
// own message. Broadcasting through one of the racers' channels would leave
// that racer missing all 50 events and fail the desync assertion for a reason
// that has nothing to do with the game.
//
// Each socket gets its OWN `createClient(...)`, not a shared one — found live
// while getting this working, and a harness bug rather than a game one, in
// the same spirit as the two below. `RealtimeClient.channel(topic)` dedupes by
// topic and returns the SAME channel object if one already exists
// (node_modules/@supabase/realtime-js's own doc comment says so); eleven
// `sb.channel('room:CODE')` calls on one shared client collapse into a single
// channel; the first `.subscribe()` resolves and the other ten calls on that
// already-joined channel never fire `SUBSCRIBED` again, hanging the
// `Promise.all` forever. A browser sidesteps this by construction — each
// Playwright context is its own JS realm with its own client — which is
// exactly what a fresh `createClient` reproduces here.
function subscribe(onPhase) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return new Promise((resolve, reject) => {
    const ch = client.channel(`room:${room.code}`);
    if (onPhase) ch.on('broadcast', { event: 'phase' }, ({ payload }) => onPhase(payload));
    ch.subscribe(status => {
      if (status === 'SUBSCRIBED') resolve({ client, ch });
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status));
    });
  });
}

const received = racers.map(() => []);
const sockets = await Promise.all(
  racers.map((_, i) => subscribe(payload => received[i].push({ at: Date.now(), payload }))),
);
const { client: hostClient, ch: hostChannel } = await subscribe(null);

// ---- The host loop ---------------------------------------------------------
const startedAt = Date.now();
const drift = [];
let sent = 0;

async function advance(fn, args) {
  const evt = await rpc(fn, args);
  sent++;
  // PRD §9: "clients render the countdown against server time offset, so
  // displayed timers drift < 250ms". The event carries both, so the drift a
  // client would render is measurable directly.
  if (evt.ends_at && evt.server_now) {
    drift.push(Math.abs(Date.now() - new Date(evt.server_now).getTime()));
  }
  await hostChannel.send({ type: 'broadcast', event: 'phase', payload: evt });
  return evt;
}

let evt = await advance('start_game', { p_room_id: room.room_id, p_host_key: room.host_key });

while (evt.phase !== 'results') {
  const wait = evt.ends_at ? new Date(evt.ends_at).getTime() - Date.now() : 0;
  if (wait > 0) await new Promise(r => setTimeout(r, wait));

  if (evt.phase === 'answer') {
    // A staircase: racer i is correct on every round after i, so the ten final
    // scores are 12, 11, 10 … 3 — all distinct. That is deliberate. Spreading
    // answers evenly across the four options instead would leave three racers
    // perfectly tied at the top and fire sudden death, which is real behaviour
    // but makes the run length nondeterministic and this a worse instrument.
    // The tiebreak has its own coverage in e2e/tiebreak.spec.ts.
    const round = evt.round;
    const correct = round <= key.length ? key[round - 1] : 0;
    await Promise.all(racers.map((racer, i) =>
      rpc('submit_answer', {
        p_room_id: room.room_id,
        p_player_key: racer.player_key,
        p_round: round,
        p_choice_index: round > i ? correct : (correct + 1) % 4,
      })
    ));
  }
  evt = await advance('advance_phase', { p_room_id: room.room_id, p_host_key: room.host_key });
}

const elapsedMs = Date.now() - startedAt;

// `hostChannel.send()` resolving confirms the server accepted the broadcast,
// not that it has already fanned out to all ten sockets — fan-out is
// asynchronous. Checking `received` the instant the loop exits raced that
// fan-out and failed once on the very last (`results`) broadcast during this
// script's own development. A short settle grace answers "did everyone
// EVENTUALLY receive every broadcast", which is what desync means; it is
// deliberately excluded from `elapsedMs` above, which measures the game itself.
await new Promise(r => setTimeout(r, 2000));

// ---- Assertions ------------------------------------------------------------
// 1. No desync: every socket saw every broadcast, in the same order.
const reference = received[0].map(r => `${r.payload.phase}:${r.payload.round}`);
received.forEach((got, i) => {
  const seen = got.map(r => `${r.payload.phase}:${r.payload.round}`);
  assert.equal(seen.length, sent, `Racer${i} received ${seen.length} of ${sent} phase events`);
  assert.deepEqual(seen, reference, `Racer${i} saw a different sequence`);
});

// 2. No stall: the run took about as long as the phases add up to.
//    Same arithmetic as lib/rank.ts's estimateDurationSeconds — restated here
//    rather than imported, because this is a .mjs script and that is a TS
//    module. A 60-second slack covers ten round trips per beat to Tokyo.
const nominal = 3 + ROUNDS * (3 + TIMER_SECONDS + 5 + 4);
assert.ok(elapsedMs < (nominal + 60) * 1000,
  `run took ${(elapsedMs / 1000).toFixed(1)}s against a ${nominal}s nominal`);

// 3. Timer drift stays inside PRD §9's 250ms.
const worstDrift = Math.max(...drift);
assert.ok(worstDrift < 250, `worst clock drift ${worstDrift}ms`);

// 4. Every client agrees on the final standings.
//
//    Taken from what each socket RECEIVED, not from ten identical refetches:
//    the RESULTS phase event carries final_standings in its `payload`
//    (supabase/migrations/0010_the_vanished_host.sql's phase_event), so this
//    compares ten independently delivered copies rather than one server answer
//    asked for ten times.
const finals = received.map(got => got[got.length - 1].payload);
finals.forEach((f, i) => assert.equal(f.phase, 'results', `Racer${i} ended on ${f.phase}`));
const canonical = JSON.stringify(finals[0].payload);
finals.forEach((f, i) =>
  assert.equal(JSON.stringify(f.payload), canonical, `Racer${i} saw different final standings`));
assert.equal(finals[0].payload.length, PLAYERS);

await Promise.all([
  ...sockets.map(s => s.client.removeChannel(s.ch)),
  hostClient.removeChannel(hostChannel),
]);

console.log(`✅ soak passed — ${PLAYERS} players, ${ROUNDS} rounds`);
console.log(`   phase broadcasts sent: ${sent}`);
console.log(`   broadcasts received:   ${received.map(r => r.length).join(', ')}`);
console.log(`   worst clock drift:     ${worstDrift}ms  (PRD §9 budget: 250ms)`);
console.log(`   wall clock:            ${(elapsedMs / 1000).toFixed(1)}s`);
