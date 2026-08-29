// End-to-end smoke test against local Supabase. Run: node scripts/smoke.mjs
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
async function rpcFails(name, args, pattern) {
  const { error } = await sb.rpc(name, args);
  assert.ok(error, `${name} should have failed (${pattern})`);
  assert.match(error.message, pattern, `${name} error`);
}

// ---- Lobby lifecycle ----
const room = await rpc('create_room', {
  p_timer_seconds: 5,
  p_categories: ['ai-tech', 'fuel'],
  p_tier_counts: [2, 1, 0, 0],
});
assert.match(room.code, /^[A-HJ-KM-NP-Z]{5}$/, 'room code format');
assert.equal(room.total_rounds, 3);

const host = await rpc('join_room', {
  p_code: room.code, p_nickname: 'Ada', p_avatar: 'robot', p_color: '#f59e0b',
  p_host_key: room.host_key,
});
assert.equal(host.player.is_host, true);

const p2 = await rpc('join_room', {
  p_code: room.code.toLowerCase(), p_nickname: 'Grace', p_avatar: 'duck', p_color: '#38bdf8',
});
assert.equal(p2.player.is_host, false);

await rpcFails('join_room',
  { p_code: room.code, p_nickname: 'Ada', p_avatar: 'cat', p_color: '#fff' },
  /nickname taken/i);
await rpcFails('join_room',
  { p_code: 'ZZZZZ', p_nickname: 'X', p_avatar: 'cat', p_color: '#fff' },
  /room not found/i);
await rpcFails('create_room',
  { p_timer_seconds: 5, p_categories: ['fuel'], p_tier_counts: [50, 0, 0, 0] },
  /not enough questions/i);

let state = await rpc('get_room_state', { p_code: room.code });
assert.equal(state.room.status, 'lobby');
assert.equal(state.players.length, 2);
assert.equal(state.question, null);
assert.ok(state.room.server_now, 'server_now present');

console.log('✅ lobby smoke passed');

// ---- Game flow ----
// Room with a known 1-question draw so we can force correctness deterministically:
// seed has exactly 2 tier-1 'fuel' questions; draw both -> 2 rounds.
const g = await rpc('create_room', {
  p_timer_seconds: 5, p_categories: ['fuel'], p_tier_counts: [2, 0, 0, 0],
});
const h = await rpc('join_room', { p_code: g.code, p_nickname: 'Host', p_avatar: 'robot', p_color: '#f59e0b', p_host_key: g.host_key });
const a = await rpc('join_room', { p_code: g.code, p_nickname: 'Alice', p_avatar: 'duck', p_color: '#38bdf8' });

await rpcFails('start_game', { p_room_id: g.room_id, p_host_key: h.player_key }, /invalid host key/i);

let evt = await rpc('start_game', { p_room_id: g.room_id, p_host_key: g.host_key });
assert.equal(evt.phase, 'countdown');
assert.equal(evt.round, 1);

evt = await rpc('advance_phase', { p_room_id: g.room_id, p_host_key: g.host_key });
assert.equal(evt.phase, 'read');
assert.ok(evt.payload.prompt, 'read payload has prompt');
assert.equal(evt.payload.options.length, 4);
assert.equal(evt.payload.correct_index, undefined, 'correct answer must not leak');

// Answering during READ must fail
await rpcFails('submit_answer',
  { p_room_id: g.room_id, p_player_key: h.player_key, p_round: 1, p_choice_index: 0 },
  /not accepting answers/i);

evt = await rpc('advance_phase', { p_room_id: g.room_id, p_host_key: g.host_key });
assert.equal(evt.phase, 'answer');

// Both tier-1 fuel questions have correct_index 0 in the seed.
await rpc('submit_answer', { p_room_id: g.room_id, p_player_key: h.player_key, p_round: 1, p_choice_index: 0 }); // Host correct
await rpc('submit_answer', { p_room_id: g.room_id, p_player_key: a.player_key, p_round: 1, p_choice_index: 1 }); // Alice wrong
await rpcFails('submit_answer',
  { p_room_id: g.room_id, p_player_key: a.player_key, p_round: 1, p_choice_index: 0 },
  /already answered/i);

evt = await rpc('advance_phase', { p_room_id: g.room_id, p_host_key: g.host_key });
assert.equal(evt.phase, 'reveal');
assert.equal(evt.payload.correct_index, 0);
assert.deepEqual(evt.payload.counts, [1, 1, 0, 0]);
assert.equal(evt.payload.fastest.nickname, 'Host');
assert.ok(evt.payload.fun_fact !== undefined);

evt = await rpc('advance_phase', { p_room_id: g.room_id, p_host_key: g.host_key });
assert.equal(evt.phase, 'track');
assert.equal(evt.payload[0].nickname, 'Host');
assert.equal(evt.payload[0].correct, 1);
assert.ok(evt.payload[0].speed_points > 0);
assert.equal(evt.payload[1].correct, 0);

// Round 2: both answer correctly; Alice answers "faster" is not controllable here,
// so just verify Host wins on correct count 2 vs 1... both would be 2/1? Host 2, Alice 1.
evt = await rpc('advance_phase', { p_room_id: g.room_id, p_host_key: g.host_key });
assert.equal(evt.phase, 'read');
assert.equal(evt.round, 2);
evt = await rpc('advance_phase', { p_room_id: g.room_id, p_host_key: g.host_key });
assert.equal(evt.phase, 'answer');
await rpc('submit_answer', { p_room_id: g.room_id, p_player_key: h.player_key, p_round: 2, p_choice_index: 0 });
await rpc('submit_answer', { p_room_id: g.room_id, p_player_key: a.player_key, p_round: 2, p_choice_index: 0 });
evt = await rpc('advance_phase', { p_room_id: g.room_id, p_host_key: g.host_key }); // reveal
evt = await rpc('advance_phase', { p_room_id: g.room_id, p_host_key: g.host_key }); // track
evt = await rpc('advance_phase', { p_room_id: g.room_id, p_host_key: g.host_key }); // results (last round)
assert.equal(evt.phase, 'results');
assert.equal(evt.payload[0].nickname, 'Host');
assert.equal(evt.payload[0].correct, 2);
assert.equal(evt.payload[0].longest_streak, 2);
assert.equal(evt.payload[1].correct, 1);
assert.equal(evt.payload[1].longest_streak, 1);

await rpcFails('advance_phase', { p_room_id: g.room_id, p_host_key: g.host_key }, /finished/i);

// Joining a started game must fail
await rpcFails('join_room', { p_code: g.code, p_nickname: 'Late', p_avatar: 'cat', p_color: '#fff' }, /already started/i);

console.log('✅ game-flow smoke passed');

// ---- P0: host authority ----
// A fresh 3-round room so skip has a tail to renumber and answers to discard.
const c = await rpc('create_room', {
  p_timer_seconds: 20, p_categories: ['fuel', 'ai-tech'], p_tier_counts: [3, 0, 0, 0],
});
const ch = await rpc('join_room', { p_code: c.code, p_nickname: 'Chief', p_avatar: 'robot', p_color: '#f59e0b', p_host_key: c.host_key });
const cp = await rpc('join_room', { p_code: c.code, p_nickname: 'Pat', p_avatar: 'duck', p_color: '#38bdf8' });

await rpc('start_game', { p_room_id: c.room_id, p_host_key: c.host_key });
await rpc('advance_phase', { p_room_id: c.room_id, p_host_key: c.host_key }); // read
let e = await rpc('advance_phase', { p_room_id: c.room_id, p_host_key: c.host_key }); // answer
assert.equal(e.phase, 'answer');
assert.equal(e.status, 'playing', 'phase_event carries status');
assert.equal(e.total_rounds, 3, 'phase_event carries total_rounds');

// -- pause freezes the remainder and clears the deadline
const paused = await rpc('pause_game', { p_room_id: c.room_id, p_host_key: c.host_key });
assert.equal(paused.status, 'paused');
assert.equal(paused.ends_at, null, 'a paused room has no live deadline');
assert.ok(paused.paused_remaining_ms > 15_000 && paused.paused_remaining_ms <= 20_000,
  `remainder should be most of the 20s timer, got ${paused.paused_remaining_ms}`);

// -- the status guard: no answers while paused
await rpcFails('submit_answer',
  { p_room_id: c.room_id, p_player_key: cp.player_key, p_round: 1, p_choice_index: 0 },
  /not accepting answers/i);

// -- advance_phase cannot run past a pause
await rpcFails('advance_phase', { p_room_id: c.room_id, p_host_key: c.host_key }, /not started/i);

// -- pause is idempotent: a second call must not overwrite the remainder with 0
const again = await rpc('pause_game', { p_room_id: c.room_id, p_host_key: c.host_key });
assert.equal(again.paused_remaining_ms, paused.paused_remaining_ms, 'double pause keeps the remainder');

// -- host authority is server-enforced
await rpcFails('resume_game', { p_room_id: c.room_id, p_host_key: ch.player_key }, /invalid host key/i);
await rpcFails('skip_question', { p_room_id: c.room_id, p_host_key: ch.player_key }, /invalid host key/i);
await rpcFails('end_game', { p_room_id: c.room_id, p_host_key: ch.player_key }, /invalid host key/i);

// -- resume shifts the deadline forward by exactly the frozen remainder
const resumed = await rpc('resume_game', { p_room_id: c.room_id, p_host_key: c.host_key });
assert.equal(resumed.status, 'playing');
assert.equal(resumed.paused_remaining_ms, null);
assert.equal(resumed.phase, 'answer', 'resume replays no beat');
assert.equal(resumed.round, 1, 'resume does not advance');
const shiftMs = new Date(resumed.ends_at) - new Date(resumed.server_now);
assert.ok(Math.abs(shiftMs - paused.paused_remaining_ms) < 1500,
  `resumed deadline should restore the remainder, got ${shiftMs}`);

// -- answers flow again after a resume
await rpc('submit_answer', { p_room_id: c.room_id, p_player_key: cp.player_key, p_round: 1, p_choice_index: 0 });

// -- skip discards the round, renumbers the tail and shortens the track
const skipped = await rpc('skip_question', { p_room_id: c.room_id, p_host_key: c.host_key });
assert.equal(skipped.phase, 'read', 'skip lands on the next READ');
assert.equal(skipped.round, 1, 'the round NUMBER is reused - the tail moved down');
assert.equal(skipped.total_rounds, 2, 'the track is one segment shorter');
assert.equal(skipped.status, 'playing', 'skipping a paused room resumes it');
assert.ok(skipped.payload.prompt, 'the new round has a real question');

// -- the discarded round left no answers behind
await rpc('advance_phase', { p_room_id: c.room_id, p_host_key: c.host_key }); // answer
await rpc('submit_answer', { p_room_id: c.room_id, p_player_key: cp.player_key, p_round: 1, p_choice_index: 0 });
e = await rpc('advance_phase', { p_room_id: c.room_id, p_host_key: c.host_key }); // reveal
assert.equal(e.payload.counts.reduce((a, b) => a + b, 0), 1,
  'exactly one answer for the reused round number');
// The reused round's question is drawn randomly from a category+tier pool that
// is NOT all correct_index 0 (unlike the fuel-only pair the game-flow smoke
// above relies on), so whether Pat's choice_index 0 was actually right has to
// be read off the reveal rather than assumed.
const patWasCorrect = e.payload.correct_index === 0;

// -- end_game reaches the ceremony from mid-round with resolved standings only
e = await rpc('advance_phase', { p_room_id: c.room_id, p_host_key: c.host_key }); // track (round 1 resolved)
e = await rpc('advance_phase', { p_room_id: c.room_id, p_host_key: c.host_key }); // read, round 2
e = await rpc('advance_phase', { p_room_id: c.room_id, p_host_key: c.host_key }); // answer, round 2
await rpc('submit_answer', { p_room_id: c.room_id, p_player_key: ch.player_key, p_round: 2, p_choice_index: 0 });

const ended = await rpc('end_game', { p_room_id: c.room_id, p_host_key: c.host_key });
assert.equal(ended.phase, 'results');
assert.equal(ended.status, 'finished');
assert.ok(ended.ends_at, 'the ceremony gets its 9s deadline');
assert.equal(ended.round, 1, 'the in-flight round is discarded, not counted');
const pat = ended.payload.find(s => s.nickname === 'Pat');
const chief = ended.payload.find(s => s.nickname === 'Chief');
assert.equal(pat.correct, patWasCorrect ? 1 : 0, 'the resolved round counts');
assert.equal(chief.correct, 0, "the in-flight round's answer was discarded");

// -- a finished game takes no more commands
await rpcFails('pause_game', { p_room_id: c.room_id, p_host_key: c.host_key }, /not running/i);
await rpcFails('skip_question', { p_room_id: c.room_id, p_host_key: c.host_key }, /not running/i);

// -- get_room_state exposes the paused remainder
const st = await rpc('get_room_state', { p_code: c.code });
assert.equal(st.room.paused_remaining_ms, null);

console.log('✅ P0 host-authority smoke passed');
