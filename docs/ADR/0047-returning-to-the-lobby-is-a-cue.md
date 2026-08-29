# ADR-0047: Returning to the lobby is a cue

- **Status:** Accepted
- **Date:** 2026-08-30
- **Phase:** M3 P2b — The aftermath

## Context

Until P2b, a room only ever moved forward: `lobby → countdown → … → results`,
and `results` was terminal. Three consumers quietly depend on that, holding
state that no forward cue ever has to clear:

- `lib/world/director.ts` parks on the podium shot at `phase-results`, and that
  arm **deliberately preserves `escalation` at 1** so the ceremony keeps the
  final question's grade;
- `lib/audio/state.ts` moves the bed to `ceremony` and never leaves;
- `lib/presentation/deriveCues.ts` carries the last reveal's standings order as
  the baseline for overtake and lead-change detection.

A rematch (ADR-0046) sends the room back to `lobby`. `phaseCues` has no arm for
`lobby` — it returns `[]`, because nothing has ever arrived there — so the
transition emitted nothing at all, and all three consumers kept the last race:
a new lobby framed on a podium that is no longer drawn, lit at peak escalation,
over ceremony music, whose first reveal would read as a field of overtakes
against the previous race's finishing order.

## Decision

A `game-reset` cue, `tier: 'routine'`, derived in `deriveCues` on any transition
into `lobby` from a non-lobby phase. The director returns to the lobby shot and
zeroes escalation; the audio bed returns to `lobby`; the world hard-completes
the choreographer; and the deriver clears its own standings baseline in the same
step that emits the cue.

## Consequences

- **The cue bus stays the single game-state-to-show seam** (ADR-0001). The
  alternative — each consumer checking `phase === 'lobby'` for itself — puts
  three copies of one rule in three modules and gives the renderer a reason to
  read React state, which `lib/world/runtime.ts` does not do.
- **Nothing new travels.** `game-reset` is derived on each client from a phase
  change it can already see, so P2b spends no wire field (roadmap §2.1).
- **It cannot double-fire.** The condition is `phase === 'lobby' && previous
  phase !== 'lobby'`, inside the existing `phaseChanged` guard, and the seed
  path is untouched — a client that loads a room already in the lobby gets no
  cue, which is right: there is nothing to undo.
- **`stingFor` has no arm for it, so it is silent by construction.** A reset is a
  transition, not a moment; the lobby bed coming back is the whole sound of it.
- **The director's escalation reset is the half that is easy to get wrong.**
  `phase-read` with `isFinal: true` deliberately PRESERVES escalation rather
  than setting it — `final-question` is the cue that sets it — so a reader
  checking "does the podium hold escalation at 1?" must feed the real run-up
  sequence, not just a final READ. `tests/director.test.ts` does.
- **A future backwards transition inherits this.** M3 P3's host-drop and late-join
  work does not move a room backwards, but if anything ever does, this is the
  cue it emits rather than a second mechanism.
