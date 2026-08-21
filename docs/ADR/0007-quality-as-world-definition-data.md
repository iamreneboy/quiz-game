# ADR-0007: Quality is world-definition data, not construction flags

- **Status:** Accepted
- **Date:** 2026-08-21
- **Phase:** P1 — Track world

## Context

Everything profile-dependent in the world's visual output — layer count, ambient (flicker/pulse/sweep) density, grade complexity — needs to differ between the `high` and `reduced` performance profiles (ADR-0004). The straightforward approach would bake profile checks into the renderer's construction code (`WorldScene`/`ParallaxLayer` conditionally build different Pixi object graphs depending on `profile` at `new WorldScene(...)` time). Spec §9/§2 (decision 8) flags this as something P2 needs to be able to change without destroying and rebuilding the canvas, since P2 introduces a runtime quality watchdog (this phase explicitly does not — see ADR-0004).

## Decision

Every layer in a `WorldDefinition` (`lib/world/definition.ts`, `lib/world/content/nightRace.ts`) carries a `layerTier: 'core' | 'rich'` field as *data*, not a construction-time branch. `layersForProfile(zone, profile)` (`definition.ts`) is a pure function that filters a zone's layer list down to just `core` layers for `reduced` and all layers for `high` — which layers exist in the scene is decided by data, not by a renderer-side conditional. `WorldScene`'s constructor calls it once per zone and hands each `ParallaxLayer` a fixed spec; `ParallaxLayer` itself has no profile-awareness at all. Ambient effects (`AmbientSpec` on a layer) are likewise data attached to the layer, not a separate construction path.

This ADR covers *layer selection* specifically. It does not extend to every profile-dependent behaviour in the renderer: `Grade` and `Markers` each still hold `profile` as a readonly constructor field and branch on it directly (grade-transition complexity, and eased-vs-snapped marker movement, respectively) — that's the same static-per-render-pass pattern ADR-0004 already establishes for the rest of the app, not something this ADR changes or extends to those two classes.

## Consequences

- Adding, removing, or reclassifying a layer's tier is purely a data edit in `nightRace.ts` — no renderer code changes, and `tests/worldDefinition.test.ts` can assert the profile ladder (fewer layers under `reduced`) without ever constructing a Pixi `WorldScene`.
- P2's quality watchdog (out of this phase's scope) inherits a real constraint from this ADR, not a blank slate: swapping *which layers exist* mid-session would still require `WorldScene` to be reconstructed today, since `layersForProfile` only runs once, in the constructor, and there is no re-filter/re-diff path against a live `zoneLayers` map. Data-driven layer selection is what makes that reconstruction cheap and mechanical to add later — it does not mean live re-filtering already works.
- `Grade`/`Markers` holding `profile` at construction is intentionally out of this ADR's scope; a P2 watchdog that wants runtime quality changes to affect grade complexity or marker easing needs its own decision about whether those classes take `profile` as a live-updatable value instead — this ADR does not resolve that for them.
- This phase does not itself implement any mid-session re-filtering (ADR-0004 — profile is stable for the life of a render pass) — `layersForProfile` is only ever called once, at scene construction, from the profile resolved at that time.
