# ADR-0023: Audio escalation reuses the vignette's ramp

- **Status:** Accepted
- **Date:** 2026-08-23
- **Phase:** P4 — Audio identity

## Context

The roadmap asks for escalating ANSWER-phase music. P3a already publishes a
continuous tension ramp for the visual vignette — `tensionAt(remainingMs,
totalMs)` in `lib/staging/tension.ts` — frozen at lock-in and stepped on the
`reduced` profile.

## Decision

Audio calls the same pure `tensionAt` with the same inputs (`room.ends_at`,
`room.timer_seconds`, `myAnswer`) rather than deriving its own escalation, and
expresses escalation as layered stem gains (`round-drive`, `round-urgency`)
via `driveGain`/`urgencyGain` in `lib/audio/design.ts`. Alternatives
considered and rejected:

- Filter/rate modulation on one loop — pokes Howler's WebAudio internals, and
  a rate shift bends pitch along with tempo.
- Discrete loop swaps at tension thresholds — audible as a hard event rather
  than a build.

## Consequences

Escalation is free and can never drift from the picture — including the
freeze at lock-in and the reduced-profile stepping, both of which fall out of
reusing `tensionAt`/`tensionStep` rather than being reimplemented. The cost is
that the stems must be tempo- and length-locked by the generator (all loops
sit at 120 BPM, whole-bar lengths — see `scripts/audio/sounds.mjs`), which is
cheap because they are generated, and that they must be started in one tick
to stay sample-aligned (handled in `lib/audio/mixer.ts`'s `applyBedStems`).
