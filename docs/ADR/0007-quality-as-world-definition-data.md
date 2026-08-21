# ADR-0007: Quality is world-definition data, not construction flags

- **Status:** Accepted
- **Date:** 2026-08-21
- **Phase:** P1 — Track world

## Context

Everything profile-dependent in the world's visual output — layer count, ambient (flicker/pulse/sweep) density, grade complexity — needs to differ between the `high` and `reduced` performance profiles (ADR-0004). The straightforward approach would bake profile checks into the renderer's construction code (`WorldScene`/`ParallaxLayer` conditionally build different Pixi object graphs depending on `profile` at `new WorldScene(...)` time). Spec §9/§2 (decision 8) flags this as something P2 needs to be able to change without destroying and rebuilding the canvas, since P2 introduces a runtime quality watchdog (this phase explicitly does not — see ADR-0004).

## Decision

Every layer in a `WorldDefinition` (`lib/world/definition.ts`, `lib/world/content/nightRace.ts`) carries a `layerTier: 'core' | 'rich'` field as *data*, not a construction-time branch. `layersForProfile(definition, profile)` (`definition.ts`) is a pure function that filters a zone's layer list down to just `core` layers for `reduced` and all layers for `high` — the renderer (`WorldScene`, `ParallaxLayer`) always consumes whatever layer list it's handed and has no profile-awareness of its own beyond what's already been filtered in. Ambient effects (`AmbientSpec` on a layer) are likewise data attached to the layer, not a separate construction path.

## Consequences

- Adding, removing, or reclassifying a layer's tier is purely a data edit in `nightRace.ts` — no renderer code changes, and `tests/worldDefinition.test.ts` can assert the profile ladder (fewer layers under `reduced`) without ever constructing a Pixi `WorldScene`.
- P2's quality watchdog (out of this phase's scope) can, in principle, swap which layers are active by re-deriving a filtered layer list and handing it to a still-alive scene/renderer, rather than needing to tear down and reconstruct `WorldScene` — the data/render split this ADR establishes is what makes that a future additive change instead of a rework.
- This phase does not itself implement any mid-session re-filtering (ADR-0004 — profile is stable for the life of a render pass) — `layersForProfile` is only ever called once, at scene construction, from the profile resolved at that time.
