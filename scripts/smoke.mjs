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

// ---- P1: the draw ----
// Two rooms, because the one thing that must differ is what the HOST is.
// Same categories and mix in both so the only variable is `is_playing`.
const drawArgs = {
  p_timer_seconds: 10, p_categories: ['fuel', 'ai-tech'], p_tier_counts: [2, 1, 0, 0],
};

// -- an MC-only host is trusted with the answers: they read them aloud.
const mcRoom = await rpc('create_room', drawArgs);
const mc = await rpc('join_room', {
  p_code: mcRoom.code, p_nickname: 'Emcee', p_avatar: 'robot', p_color: '#f59e0b',
  p_host_key: mcRoom.host_key, p_is_playing: false,
});
assert.equal(mc.player.is_playing, false);

const mcDraw = await rpc('get_room_draw', {
  p_room_id: mcRoom.room_id, p_host_key: mcRoom.host_key,
});
assert.equal(mcDraw.answers_visible, true, 'an MC-only host sees the answers');
assert.equal(mcDraw.total_rounds, 3);
assert.equal(mcDraw.timer_seconds, 10);
assert.deepEqual(mcDraw.categories, ['fuel', 'ai-tech'], 'the room remembers its pool');
assert.equal(mcDraw.questions.length, 3);
for (const q of mcDraw.questions) {
  assert.ok(Number.isInteger(q.correct_index), 'every question carries its answer');
  assert.ok('fun_fact' in q, 'every question carries its fun fact');
  assert.equal(q.is_custom, false);
  assert.equal(q.options.length, 4);
}
// Rounds are 1..N contiguous and ordered easy -> hard. Every later draw RPC
// preserves this invariant, so it is asserted once here and re-asserted after
// each mutation.
assert.deepEqual(mcDraw.questions.map(q => q.round), [1, 2, 3]);
assert.deepEqual(
  [...mcDraw.questions.map(q => q.tier)].sort((a, b) => a - b),
  mcDraw.questions.map(q => q.tier),
  'the draw runs easy -> hard');

// -- a host who is ALSO RACING must never receive a correct answer (Design
//    Pillar 2). The key is ABSENT, not null: a null would still be a key.
const playRoom = await rpc('create_room', drawArgs);
const playHost = await rpc('join_room', {
  p_code: playRoom.code, p_nickname: 'Racer', p_avatar: 'duck', p_color: '#38bdf8',
  p_host_key: playRoom.host_key, p_is_playing: true,
});
assert.equal(playHost.player.is_playing, true);

const playDraw = await rpc('get_room_draw', {
  p_room_id: playRoom.room_id, p_host_key: playRoom.host_key,
});
assert.equal(playDraw.answers_visible, false, 'a racing host does not see the answers');
assert.equal(playDraw.questions.length, 3, 'but they still see the whole draw');
for (const q of playDraw.questions) {
  assert.ok(q.prompt.length > 0, 'the prompt is there, or veto means nothing');
  assert.equal(q.options.length, 4);
  assert.equal('correct_index' in q, false, 'correct_index must be absent, not null');
  assert.equal('fun_fact' in q, false, 'the fun fact gives the answer away');
}
assert.equal(
  JSON.stringify(playDraw).includes('correct_index'), false,
  'no correct_index anywhere in the payload a racing host receives');

// -- redaction holds on every mutation's response too, not just the initial
//    draw: a racing host must never see the answer from a swap, a remove, or
//    even the question they just wrote themselves.
const playSwapped = await rpc('swap_question', {
  p_room_id: playRoom.room_id, p_host_key: playRoom.host_key, p_round: 1,
});
assert.equal(JSON.stringify(playSwapped).includes('correct_index'), false,
  'a swap must not leak the answer to a racing host');
assert.equal(JSON.stringify(playSwapped).includes('fun_fact'), false,
  'a swap must not leak the fun fact to a racing host');

const playAdded = await rpc('add_custom_question', {
  p_room_id: playRoom.room_id, p_host_key: playRoom.host_key,
  p_category: 'fuel', p_tier: 1,
  p_prompt: 'Which vending machine button never works?',
  p_options: ['B4', 'C2', 'A1', 'D6'],
  p_correct_index: 0, p_fun_fact: 'Maintenance has known for three years.',
});
assert.equal(JSON.stringify(playAdded).includes('correct_index'), false,
  'a racing host does not even see the answer to their own custom question');
assert.equal(JSON.stringify(playAdded).includes('fun_fact'), false,
  'a racing host does not even see the fun fact for their own custom question');

const playRemoved = await rpc('remove_question', {
  p_room_id: playRoom.room_id, p_host_key: playRoom.host_key, p_round: 1,
});
assert.equal(JSON.stringify(playRemoved).includes('correct_index'), false,
  'a remove must not leak the answer to a racing host');
assert.equal(JSON.stringify(playRemoved).includes('fun_fact'), false,
  'a remove must not leak the fun fact to a racing host');

// -- host authority is server-enforced
await rpcFails('get_room_draw',
  { p_room_id: playRoom.room_id, p_host_key: playHost.player_key },
  /invalid host key/i);

// -- swap redraws one round from the same tier and category pool
const before = mcDraw.questions[0];
const swapped = await rpc('swap_question', {
  p_room_id: mcRoom.room_id, p_host_key: mcRoom.host_key, p_round: 1,
});
const after = swapped.questions[0];
assert.equal(swapped.total_rounds, 3, 'a swap does not change the track length');
assert.equal(after.round, 1);
assert.equal(after.tier, before.tier, 'a swap keeps the tier, so the draw stays easy -> hard');
assert.notEqual(after.prompt, before.prompt, 'a swap draws a DIFFERENT question');
assert.ok(drawArgs.p_categories.includes(after.category), 'and stays in the chosen pool');
assert.deepEqual(swapped.questions.map(q => q.round), [1, 2, 3]);

// -- a swap never repeats a question already in the room
const prompts = swapped.questions.map(q => q.prompt);
assert.equal(new Set(prompts).size, prompts.length, 'no duplicate prompts in the draw');

// -- a swap with nothing left to draw says so rather than silently doing nothing.
//    'fuel' tier 1 holds exactly 2 seeded questions; a room that takes both has
//    no third to swap in. (P4 raises the bank to >=10 per tier per category and
//    must revisit this assertion — the game-flow section above already carries
//    the same seed dependency.)
const tight = await rpc('create_room', {
  p_timer_seconds: 10, p_categories: ['fuel'], p_tier_counts: [2, 0, 0, 0],
});
await rpc('join_room', {
  p_code: tight.code, p_nickname: 'Tight', p_avatar: 'robot', p_color: '#f59e0b',
  p_host_key: tight.host_key, p_is_playing: false,
});
await rpcFails('swap_question',
  { p_room_id: tight.room_id, p_host_key: tight.host_key, p_round: 1 },
  /no other question/i);

// -- remove drops a round, renumbers the tail down, and shortens the track
const removed = await rpc('remove_question', {
  p_room_id: mcRoom.room_id, p_host_key: mcRoom.host_key, p_round: 1,
});
assert.equal(removed.total_rounds, 2, 'the track is one question shorter');
assert.deepEqual(removed.questions.map(q => q.round), [1, 2], 'the tail renumbered down');
assert.equal(removed.questions[0].prompt, swapped.questions[1].prompt,
  'round 2 became round 1');

// -- the last question cannot be removed
const lone = await rpc('create_room', {
  p_timer_seconds: 10, p_categories: ['fuel'], p_tier_counts: [1, 0, 0, 0],
});
await rpc('join_room', {
  p_code: lone.code, p_nickname: 'Lone', p_avatar: 'robot', p_color: '#f59e0b',
  p_host_key: lone.host_key, p_is_playing: false,
});
await rpcFails('remove_question',
  { p_room_id: lone.room_id, p_host_key: lone.host_key, p_round: 1 },
  /at least one question/i);

// -- host authority, and the lock once the race starts
await rpcFails('swap_question',
  { p_room_id: mcRoom.room_id, p_host_key: mc.player_key, p_round: 1 },
  /invalid host key/i);
await rpcFails('remove_question',
  { p_room_id: mcRoom.room_id, p_host_key: mc.player_key, p_round: 1 },
  /invalid host key/i);
await rpcFails('swap_question',
  { p_room_id: mcRoom.room_id, p_host_key: mcRoom.host_key, p_round: 99 },
  /no question at round/i);

await rpc('join_room', {
  p_code: mcRoom.code, p_nickname: 'Pair1', p_avatar: 'duck', p_color: '#38bdf8',
});
await rpc('join_room', {
  p_code: mcRoom.code, p_nickname: 'Pair2', p_avatar: 'cat', p_color: '#a78bfa',
});
await rpc('start_game', { p_room_id: mcRoom.room_id, p_host_key: mcRoom.host_key });
await rpcFails('get_room_draw',
  { p_room_id: mcRoom.room_id, p_host_key: mcRoom.host_key }, /locked/i);
await rpcFails('swap_question',
  { p_room_id: mcRoom.room_id, p_host_key: mcRoom.host_key, p_round: 1 }, /locked/i);
await rpcFails('remove_question',
  { p_room_id: mcRoom.room_id, p_host_key: mcRoom.host_key, p_round: 1 }, /locked/i);

// -- a custom question joins the draw at the end of its own tier block
const customRoom = await rpc('create_room', {
  p_timer_seconds: 10, p_categories: ['fuel', 'ai-tech'], p_tier_counts: [2, 1, 0, 0],
});
await rpc('join_room', {
  p_code: customRoom.code, p_nickname: 'Author', p_avatar: 'robot', p_color: '#f59e0b',
  p_host_key: customRoom.host_key, p_is_playing: false,
});
const customArgs = {
  p_room_id: customRoom.room_id, p_host_key: customRoom.host_key,
  p_category: 'fuel', p_tier: 1,
  p_prompt: 'Which mug on the third shelf is haunted?',
  p_options: ['The chipped one', 'The tall one', 'The novelty one', 'None of them'],
  p_correct_index: 2, p_fun_fact: 'It plays a jingle at 3pm and nobody knows why.',
};
const added = await rpc('add_custom_question', customArgs);
assert.equal(added.total_rounds, 4, 'the draw grew by one');
assert.deepEqual(added.questions.map(q => q.round), [1, 2, 3, 4]);
assert.deepEqual(
  [...added.questions.map(q => q.tier)].sort((a, b) => a - b),
  added.questions.map(q => q.tier),
  'the draw still runs easy -> hard');
const mine = added.questions.find(q => q.is_custom);
assert.ok(mine, 'the custom question is marked as the host\'s own');
assert.equal(mine.round, 3, 'placed at the end of the tier-1 block, before tier 2');
assert.equal(mine.prompt, customArgs.p_prompt);
assert.equal(mine.correct_index, 2);
assert.deepEqual(mine.options, customArgs.p_options);

// -- ADR-0039's whole point: one room's custom question is invisible to the
//    bank. 'fuel' tier 1 holds exactly 2 seeded questions, and the custom one
//    above is a third fuel tier-1 row -- if it leaked into the pool, this
//    would succeed. (P4 raises the bank and must revisit this assertion.)
await rpcFails('create_room',
  { p_timer_seconds: 10, p_categories: ['fuel'], p_tier_counts: [3, 0, 0, 0] },
  /not enough questions/i);

// -- validation, one message per rule
await rpcFails('add_custom_question', { ...customArgs, p_prompt: '   ' },
  /prompt must be/i);
await rpcFails('add_custom_question',
  { ...customArgs, p_prompt: 'A', p_options: ['a', 'b', 'c'] },
  /exactly 4 options/i);
await rpcFails('add_custom_question',
  { ...customArgs, p_prompt: 'B', p_options: ['a', 'b', 'c', ' '] },
  /each option must be/i);
await rpcFails('add_custom_question',
  { ...customArgs, p_prompt: 'C', p_options: ['same', 'SAME', 'c', 'd'] },
  /must be different/i);
await rpcFails('add_custom_question', { ...customArgs, p_prompt: 'D', p_correct_index: 4 },
  /correct_index/i);
await rpcFails('add_custom_question', { ...customArgs, p_prompt: 'E', p_tier: 9 },
  /tier must be/i);
await rpcFails('add_custom_question', { ...customArgs, p_prompt: 'F', p_category: 'rewind' },
  /not in this room/i);
await rpcFails('add_custom_question', customArgs, /already has that question/i);
await rpcFails('add_custom_question',
  { ...customArgs, p_host_key: customRoom.room_id, p_prompt: 'G' },
  /invalid host key/i);

// -- swapping a custom question out replaces it with a bank draw and takes the
//    room-local row with it
const unswapped = await rpc('swap_question', {
  p_room_id: customRoom.room_id, p_host_key: customRoom.host_key, p_round: 3,
});
assert.equal(unswapped.total_rounds, 4, 'a swap still does not change the length');
assert.equal(unswapped.questions.some(q => q.is_custom), false,
  'the custom question is gone from the draw');
assert.equal(unswapped.questions.some(q => q.prompt === customArgs.p_prompt), false);
// The room-local row is gone too, so the same prompt can be written again.
await rpc('add_custom_question', customArgs);

// -- removing a custom question shortens the draw and deletes the row
const shrunk = await rpc('remove_question', {
  p_room_id: customRoom.room_id, p_host_key: customRoom.host_key,
  p_round: (await rpc('get_room_draw', {
    p_room_id: customRoom.room_id, p_host_key: customRoom.host_key,
  })).questions.find(q => q.is_custom).round,
});
assert.equal(shrunk.total_rounds, 4, 'back to the 3 bank rounds plus the swap-in');
assert.equal(shrunk.questions.some(q => q.is_custom), false);
assert.deepEqual(shrunk.questions.map(q => q.round), [1, 2, 3, 4]);

console.log('✅ P1 draw-review smoke passed');

// ---- P2a: the tiebreak ----
// The ceremony's deadline is FLAT (ADR-0044): it always reserves the
// photo-finish prelude, whether or not one is staged. The client mirrors this
// number in lib/ceremony/beats.ts's CEREMONY_MS, and a disagreement puts the
// podium at elapsed 0 for the difference — which is why it is asserted here.
const CEREMONY_MS = 12_400;

const cer = await rpc('create_room', {
  p_timer_seconds: 20, p_categories: ['fuel'], p_tier_counts: [1, 0, 0, 0],
});
await rpc('join_room', {
  p_code: cer.code, p_nickname: 'Clock', p_avatar: 'robot', p_color: '#f59e0b',
  p_host_key: cer.host_key,
});
await rpc('join_room', {
  p_code: cer.code, p_nickname: 'Watch', p_avatar: 'duck', p_color: '#38bdf8',
});
await rpc('start_game', { p_room_id: cer.room_id, p_host_key: cer.host_key });
for (let i = 0; i < 4; i += 1) {
  await rpc('advance_phase', { p_room_id: cer.room_id, p_host_key: cer.host_key });
}
const cerEnd = await rpc('advance_phase', { p_room_id: cer.room_id, p_host_key: cer.host_key });
assert.equal(cerEnd.phase, 'results');
const cerMs = new Date(cerEnd.ends_at) - new Date(cerEnd.server_now);
assert.ok(Math.abs(cerMs - CEREMONY_MS) < 500,
  `the ceremony deadline should be ${CEREMONY_MS}ms, got ${cerMs}`);

console.log('✅ P2a ceremony-deadline smoke passed');
