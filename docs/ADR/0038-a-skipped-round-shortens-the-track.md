# ADR-0038: A skipped round shortens the track

- **Status:** Accepted
- **Date:** 2026-08-29
- **Phase:** M3 P0 — Host authority & the control strip

## Context

Track length is question count: `trackMetrics(totalRounds)` in
`lib/world/geometry.ts` makes `segments = total_rounds` and
`length = segments * SEGMENT_WIDTH`, and `markerAnchors` places a player on the
segment equal to their correct-answer count. So a host skipping a question is
not free — the M3 roadmap named this as the decision P0 owns.

Two candidates:

1. **Leave the round in place.** Delete only its answers, advance
   `current_round`, touch nothing else.
2. **Shorten the track.** Delete the round's question and answers, renumber the
   tail down one, decrement `total_rounds`.

## Decision

Option 2. `skip_question` deletes `room_questions` and `answers` for the current
round, renumbers every later round down by one, and decrements
`total_rounds`. The round *number* is reused, so the host lands on a fresh READ
at the same label with one fewer segment ahead of the field. If the skipped
round was the last one, the room goes straight to the ceremony.

The renumber runs as two passes through the negative round space, because the
`(room_id, round)` primary key is not deferrable and a single `round = round - 1`
can transiently collide with a row the statement has not reached yet.

## Consequences

- **The finish line stays reachable.** Under option 1 the maximum attainable
  correct count is `total_rounds - 1`, so nobody ever crosses the line the whole
  world metaphor is built around.
- **Streaks bridge the skip.** `longest_streak` and `current_streak` iterate
  `room_questions` in round order and treat a round with no answer as a miss.
  Under option 1 the skipped row survives and silently breaks every player's
  streak; deleting it is what keeps the sequence honest either way, and
  renumbering keeps it contiguous.
- **The track visibly shortens mid-race.** `trackMetrics` recomputes, the camera
  re-clamps and the finish line steps one segment closer. This is the price, and
  it reads as the host cutting the race short rather than as a glitch.
- **`total_rounds` is now mutable mid-game**, which it never was. Two consumers
  must respect that: `lib/store.ts` carries it on every phase event (ADR-0037),
  and `lib/presentation/deriveCues.ts` treats a change in it as a beat change,
  because a skip during READ changes neither phase nor round.
- **A skip that makes the current round the new final round does not fire the
  final-question run-up**, which normally rides the *previous* TRACK beat
  (ADR-0021). `deriveCues`' seed path already covers "in the final round without
  having seen the run-up"; the live path does not. Left as known behaviour for
  P0 — the escalation is missing, nothing is broken — and recorded in
  `docs/progress/CURRENT.md`.
- **P2's rematch must respect the shortened draw**: a room that skipped
  questions has fewer `room_questions` rows than it was created with.
