# ADR-0036: The shot book is role-selected — one reducer, two books

- **Status:** Accepted
- **Date:** 2026-08-24
- **Phase:** P6b — broadcast direction

## Context

`lib/world/director.ts` turned P0 cues into camera intents through a single
module-scope table, `BASE_BY_PHASE`, plus two module-scope hold constants. That
table was written for the player view, where the world is a 28vh strip behind a
question card, and a tight `pack` shot is the right call.

P6a put the same table on a television, where the world is the **entire
backdrop** with the question laid over it. The same shot reads as a cropped
detail rather than a wide. Two further things were wrong on a TV specifically:

- Roadmap P1 named a **slow push-in on the final question** and it was never
  built. Today's transient is `pack`/`drift` over a `pack` base — a no-op that
  changes nothing visible.
- `OVERTAKE_HOLD_MS = DRAMA_HOLD_MS` (1200ms) is tuned for a thumb glancing at a
  strip. A room has to *find* the overtake on a large screen first.

## Decision

`BASE_BY_PHASE` becomes a `ShotBook`, and `SHOT_BOOKS: Record<ViewerRole,
ShotBook>` selects one. `DirectorState` gains `role`, set once at
`seedDirector(phase, role)` and defaulting to `'player'`; `reduceCue` reads
`SHOT_BOOKS[state.role]` at the top and every branch uses it.

**One reducer, not two.** The celebration hierarchy, the transient preemption
rule, the "reveal holds whatever the answer beat left" behaviour and the
"`phase-results` deliberately does not reset escalation" rule are all direction
policy that is identical on both surfaces. Only the shots differ, so only the
shots are in the book.

The stage book differs in four ways: `packWide` for READ/ANSWER/REVEAL/TRACK,
`podiumRoom` for the ceremony, a `packTight`/`push` final-question transient,
and longer holds (`STAGE_DRAMA_HOLD_MS` 2200, `finalQuestionHoldMs` 3200). The
new `push` move style is a `drift` that takes `DURATION.push` (2600ms) — slow
enough to read *as a move* on a television — and the reduced profile collapses
it to a cut exactly as it already collapses a drift.

`podiumRoom` frames the medalists *and* the field that did not medal, who stand
at `markerAnchors` near the finish line — which is where the podium is, so it is
a genuine fit rather than a wider constant.

**`STAGE_DRAMA_HOLD_MS` is exported, and `components/LowerThird.tsx` imports
it.** That sharing is the point. `OVERTAKE_HOLD_MS` and `DRAMA_HOLD_MS` are
equal so that the camera transient and the DOM callout last the **same
duration**; give the stage a longer camera hold without the matching callout
hold and that relationship breaks silently, because nothing tests it and nothing
looks wrong on a phone.

`director.ts`'s old comment said the two "expire together", which was
misleading — they do not overlap in time at all, since the callout deliberately
lands `ARENA_AT_MS` later, on the arena beat. The comment is corrected to say
they share one hold *duration*.

## Consequences

- **Existing player direction is unchanged**, and the ~20 pre-existing director
  tests still exercise it through `initialDirectorState`, whose `role` is
  `'player'`. `FINAL_QUESTION_HOLD_MS` survives as
  `PLAYER_SHOTS.finalQuestionHoldMs` so those tests keep their import.
- **`finalQuestionHoldMs` must stay greater than `DURATION.push`** on any book
  that uses a push, or the escalation reads as a cut that already happened. That
  is asserted, not just documented.
- Measured live at 1920×1080: the stage callout runs `variant="strip"` for
  1951–2462ms against the player card's 1344–1400ms, and the final-question
  push-in is still visibly moving 2.5s after the beat starts.
- A third role extends `ViewerRole`, which produces a compile error at
  `SHOT_BOOKS` — the same seam behaviour ADR-0031 chose deliberately.
- The cost is that "what shot does READ take" is now two answers instead of one.
  That is inherent to directing two surfaces; the alternative — a second
  reducer — would have duplicated the policy that genuinely is shared.
