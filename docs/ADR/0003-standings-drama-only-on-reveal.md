# ADR-0003: Standings drama derives only on the transition into `reveal`

- **Status:** Accepted
- **Date:** 2026-08-21
- **Phase:** P0 — Foundation & design system

## Context

`deriveCues` needs to turn a standings-array delta into drama cues (`player-advanced`, `overtake`, `lead-changed`, `streak-tier`, `streak-broken`). The room's `phase` cycles `read -> answer -> reveal -> track` (and `results` at the end), and the server republishes the **same** standings array across `reveal`, `track`, and `results` — only `reveal` is where the standings genuinely change. The M2 spec says deltas yield cues but doesn't pin down *when* in the phase cycle to run that diff.

## Decision

Standings drama is derived exactly once per round: only on the phase transition **into** `reveal`. `track` and `results` still emit their own phase-beat cue, but never re-run the standings diff.

## Consequences

- This is the specific rule that prevents double-celebration: deriving drama on every phase that carries a standings array (naively, all three) would fire `overtake`/`streak-tier`/etc. two or three times for the same event, since the accumulator would see "no change" on the repeats anyway — but a naive implementation keyed on "standings is present" rather than "phase is reveal" doesn't get that guarantee for free the way this rule does.
- Any later phase adding a new standings-derived cue must key it the same way — on the `reveal` transition, not on "standings changed" — or it risks reintroducing double-firing the moment a phase that repeats standings (there both are today, and future phases may add another) is in play.
- `tests/deriveCues.test.ts`'s "does not re-derive drama on track or results (no double celebration)" case is the regression guard for this rule; if it's ever weakened or removed, this decision is effectively reverted and should get a superseding ADR explaining why.
