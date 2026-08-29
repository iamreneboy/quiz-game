# ADR-0037: The wire's third opening — `status`, `paused_remaining_ms`, `total_rounds`

- **Status:** Accepted
- **Date:** 2026-08-29
- **Phase:** M3 P0 — Host authority & the control strip

## Context

M2's roadmap forbade protocol changes; M3's roadmap inverts that but keeps the
bar ADR-0018 and ADR-0028 set — every new payload field earns a written
justification, and the wire stays semantic.

`phase_event` is the only thing that reaches every client. Pause needs it to
carry three things it did not.

## Decision

`phase_event` gains `status`, `paused_remaining_ms` and `total_rounds`. All
three are optional on the client type with documented fallbacks, so a pre-0005
database degrades rather than throws — the same treatment `picks` and
`current_streak` got in ADR-0018.

### `status`

`lib/store.ts` derived status from phase: `e.phase === 'results' ? 'finished'
: 'playing'`. A paused room's phase does not change, so that inference cannot
represent a pause at all — and worse, it would actively overwrite `'paused'`
back to `'playing'` on the very event announcing the pause. Status has to be
stated, not inferred.

### `paused_remaining_ms`

Freeze-and-shift clears `phase_ends_at`, and `ends_at: null` is read everywhere
as *beat settled*: `elapsedIn(totalMs, null)` returns `totalMs`. Without the
remainder, pausing mid-ANSWER would blank the timer ring's numeral
(`secondsLeft` is null when `remainingMs` is null) and drop `tensionAt` to 0 —
the room would go calm and finished-looking at the exact moment it is meant to
hold its breath. The remainder is what makes a freeze a freeze, and it is
game meaning, not a renderer concept: "this much of the question is still owed."

### `total_rounds`

`skip_question` shortens the track mid-game (ADR-0038). `total_rounds` was
previously fixed at room creation and delivered once, by `get_room_state`;
after a skip that snapshot is stale on every client that does not reload.

## Consequences

- `RoomInfo.status` widens to `'lobby' | 'playing' | 'paused' | 'finished'`.
  Every consumer that compared against `'playing'` now has a fourth case to
  consider; `useHostDriver`'s scheduling guard and `advance_phase`'s status
  check both already do the right thing with it, which is why the status enum
  was chosen over a side flag.
- `total_rounds` is mutable at runtime. `lib/presentation/deriveCues.ts` must
  treat a change in it as a beat change, because a skip during READ alters
  neither phase nor round.
- The three fields are additive; no existing field changed meaning, so
  `question_public`, `build_reveal` and `standings` are untouched and the
  Fairness Law is not in the blast radius.
