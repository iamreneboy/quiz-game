# ADR-0006: Spatial zones plus a separate global mood grade

- **Status:** Accepted
- **Date:** 2026-08-21
- **Phase:** P1 — Track world

## Context

Spec §6/§8 (decision 3) wants the environment to visibly progress across a game — office park to neon city to stadium — while the world also needs to react to game-wide mood (escalation toward a final question, victory) independent of where any given player physically is on the track. A single mechanism for both would either force environment art to encode dramatic state (making zones impossible to reason about independently) or force dramatic mood to be per-position (making a game-wide beat like "final question" incoherent when players are spread across different zones).

## Decision

Two independent, orthogonal layers. **Spatial zones** (`lib/world/zones.ts`, `lib/world/content/nightRace.ts`) are laid end to end along the track's world-x axis and crossfade in a fixed-width overlap band (`ZONE_OVERLAP = 0.12` of track length). The blend weight is sampled once per frame at the **camera's centre**, not per layer or per tile (`zoneWeights(camera.centerX, metrics)` in `runtime.ts`, applied uniformly to every layer of every zone in `WorldScene.applyFrame`) — a deliberate simplification, since the backdrop layers are wide and low-frequency enough that a single blend value reads as a smooth crossfade as the camera travels, at a fraction of the cost of sampling per marker or per tile. A separate **mood grade** (`gradeState` in `zones.ts`, applied in `lib/world/render/Grade.ts`) is a scene-wide color/tint overlay driven by game progress and escalation cues (e.g. final question turning the grade magenta/neon), applied uniformly across the whole rendered frame regardless of which zone(s) are currently in view.

## Consequences

- Because the zone blend is sampled at camera centre rather than per marker, a stretched field where the leader and the last-place player are in genuinely different zones will show ONE blended backdrop for the whole frame — matching whatever's under the camera's current framing, not each player's individual position. This is an intentional legibility trade-off (see the plan's decision 2), not a per-player rendering feature.
- Zone content (`nightRace.ts`'s per-zone layer definitions) never needs to know about dramatic/cue state, and the grade never needs to know about track position — each can be tested, tuned, and reasoned about independently (`tests/zones.test.ts` covers both `zoneWeights`/`quantizeZoneWeights` and `gradeState` as separate pure functions with no shared state).
- Later phases adding new zones or new dramatic beats extend one axis without touching the other — a new zone doesn't need new grade logic, and a new escalation cue doesn't need new zone art.
- The two layers compose visually rather than being pre-baked together, so a single moment (e.g. a leader in the stadium during a "final question" grade) is the product of two independently-authored inputs, not a hand-authored combined asset — this keeps the content data-driven (see ADR-0007) instead of requiring per-combination art.
