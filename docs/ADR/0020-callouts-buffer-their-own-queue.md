# ADR-0020: Callouts buffer their own queue rather than reading the choreographer's

- **Status:** Accepted
- **Date:** 2026-08-23
- **Phase:** P3b — Round staging: the outcome half

## Context

`lib/world/choreographer.ts`'s `ChoreographerState` already buffers drama cues at the REVEAL transition and resolves them into a movement/VFX sequence at `phase-track` (P2, [ADR-0009](0009-drama-buffered-to-the-track-beat.md)), arbitrated by the same `resolveTier` the lower third needs (P2, [ADR-0010](0010-exclusive-arena-reaction-subdued-avatar-vfx.md)). The lower third and the TRACK rail need to know the same thing at the same moment: which cue is this beat's headline, and which players' drama got subdued into a rail mark instead. Reading the choreographer's already-buffered queue directly would save roughly twenty lines of duplicated buffering logic.

But `ChoreographerState` lives in `lib/world/runtime.ts`'s closure, driving Pixi. The accessible surface — the rail is a real `<ol>` carrying every player as text specifically so readability never depends on canvas (PRD §9) — would then depend on renderer state to render its own accessible fallback. If the canvas renderer were ever disabled, degraded, or restructured (P6's stage view already plans a second renderer), the lower third and rail would either need to reach into Pixi's internals or lose their content. The dependency would run backwards: the accessible surface, whose entire job is to work when the canvas can't be trusted, would trust the canvas's bookkeeping to work.

## Decision

`lib/staging/callouts.ts` is its own pure accumulator — `bufferCallout`, `resolveCallout`, `clearCallout`, `resetCallouts` — buffering the identical drama cue types (`overtake`, `lead-changed`, `streak-tier`, `final-question`) independently of `ChoreographerState`. `lib/staging/runtime.ts` threads it exactly as `lib/world/runtime.ts` threads `ChoreographerState`: buffer on cue arrival, resolve on `phase-track`, using the same `resolveTier` function the choreographer calls on the same cues. Two accumulators, one arbitration function — they read the identical inputs through the identical decision logic, so they cannot disagree about which cue is the beat's headline, even though neither reads the other's state.

## Consequences

The lower third and the rail are provably independent of the world renderer: they would produce identical output if Pixi were deleted. The cost is real and accepted — the two queues can theoretically drift if `resolveTier`'s cue-type set and the choreographer's `DRAMA` set (`lib/world/choreographer.ts`) are ever edited independently, since nothing enforces they stay in sync beyond both being hand-maintained lists of the same four-ish cue types. A future phase changing which cues count as "drama" must update both.

`callout`, `deltas` and `escalated` are merged Zustand slices on `useStaging`, never part of the `StagingState` projection `stagingAt` returns (P3a decision 2) — `publish`'s shallow merge cannot clobber them, the same mechanism `announcement` already relies on. This is what keeps `stagingAt` memoryless: a reload's discrete state still derives entirely from `ends_at`, with the callout accumulator as a separate, explicitly-threaded piece of session-local memory rather than smuggled into the projection.
