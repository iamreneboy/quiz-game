# ADR-0044: The ceremony always reserves the prelude

- **Status:** Accepted
- **Date:** 2026-08-29
- **Phase:** M3 P2a — The tiebreak

## Context

The M3 roadmap (§3, P2) says the photo finish "extends `CEREMONY_MS` — a
hand-maintained mirror of migration `0004`'s 9-second results interval — so both
move in lockstep or the ceremony truncates."

The obvious reading is a variable deadline: detect the tie when the room enters
`results` and set `9s` or `12.4s` accordingly. That puts a second implementation
of the tie rule into PL/pgSQL, beside the TypeScript one the prelude needs
anyway to decide *which* places are tied and *what* separates them. Two
implementations of one rule, in two languages, free to drift — and the drift
would be invisible until a real tie happened in front of a real room.

Sending the answer over the wire instead (`photo_finish: boolean` on the results
phase event) removes the drift but adds a protocol field for something the
client can already compute from `standings`, which it holds in full.

## Decision

The results deadline is **flat**: `ceremony_ms()` returns 12400 unconditionally,
and `lib/ceremony/beats.ts`'s `CEREMONY_MS` mirrors it. The server never asks
whether a tie exists.

The client decides on its own, from the standings it already has, and
`ceremonyStepsAt(elapsed, photoFinish)` shifts the podium's beats by `PHOTO_MS`
when a prelude is staged. A ceremony with no tie plays exactly the sequence P5a
built, then sits settled for the remaining ~6.4 seconds.

## Consequences

- **The tie rule has exactly one implementation**, in
  `lib/ceremony/photoFinish.ts`, unit-tested, and read by both the DOM ticker
  and the renderer through the same pure function.
- **No protocol field was spent.** P2a's one wire opening (ADR-0042) is sudden
  death, which the client genuinely cannot derive.
- **A no-tie ceremony carries a longer settled tail, and it costs nothing.**
  The results deadline is inert for game state, guarded twice: `useHostDriver`
  returns early on both `status !== 'playing'` and `phase === 'results'`, and
  `advance_phase` raises `'game finished'` once the room is finished
  (ADR-0027). Nothing schedules against it; the client reads it purely as an
  animation anchor.
- **`CEREMONY_MS` stays a hand-maintained mirror, and the failure mode stays
  graceful.** A client on 12400 against a database still on 0004's 9 seconds
  computes `elapsedIn(12400, 9000) = 3400` at the phase's first frame and opens
  on an already-risen bronze and silver — the sequence compresses, exactly as
  `lib/staging/beats.ts` documents for every other mirrored duration. It cannot
  block or lock the surface. This is the state a deployed client is in between
  a Vercel deploy and the cloud migration, so it is a real window, not a
  hypothetical.
- **`PHOTO_MS` must stay smaller than the slack.** `PHOTO_MS + BOARD_AT` is
  9400 against a 12400 total; `tests/ceremonyBeats.test.ts` pins that
  inequality so a later change to either constant fails a test rather than
  truncating the board's entrance.
