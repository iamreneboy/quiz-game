# P1 — Track world

- **Status:** Complete
- **Completed:** 2026-08-21
- **Spec:** `docs/superpowers/specs/2026-08-21-m2-p1-track-world-design.md` (parent: `docs/superpowers/specs/2026-08-21-m2-the-show-roadmap.md` §P1)
- **Plan:** `docs/superpowers/plans/2026-08-21-m2-p1-track-world.md`
- **Branch:** `worktree-m2-p1-track-world` @ `ea7b1bd` — not yet merged; see `superpowers:finishing-a-development-branch`

## Scope (from the spec)

Replace the DOM-rendered racetrack (`components/Track.tsx`) with a PixiJS-rendered racetrack world: parallax environment zones that progress along the track (office park → neon city → stadium), a cue-driven camera director that frames the pack, emphasizes overtakes, and pushes in on the final question, a portrait "band" layout for phones, frame-time instrumentation for a measurable 60fps exit criterion, and an accessible HTML standings readout (`components/TrackReadout.tsx`) that carries the same information as real text so readability never depends on canvas. Presentation-only, same global constraints as P0.

## What was built

Executed via `subagent-driven-development` (fresh implementer + fresh reviewer per task) in an isolated worktree, 8 tasks:

| # | Task | Key files |
|---|---|---|
| 1 | Track geometry and marker anchors | `lib/world/geometry.ts` |
| 2 | Camera math and pack framing | `lib/world/camera.ts`, `lib/world/framing.ts` |
| 3 | Cue-driven camera director with tier preemption | `lib/world/director.ts` |
| 4 | Spatial zones, mood grade, night-race world definition | `lib/world/zones.ts`, `lib/world/definition.ts`, `lib/world/content/nightRace.ts` |
| 5 | Pixi scene renderer — parallax layers, track surface, grade | `lib/world/render/{ParallaxLayer,TrackSurface,Grade,WorldScene}.ts`, `components/PixiStage.tsx` |
| 6 | The runtime — wires cues/state into the renderer each frame | `lib/world/runtime.ts`, `lib/world/useWorldView.ts` |
| 7 | Position markers and the accessible track readout | `lib/world/render/Markers.ts`, `components/TrackReadout.tsx`; deletes `components/Track.tsx` |
| 8 | Portrait band, frame instrumentation, and e2e | `lib/world/perf.ts`, `components/PerfOverlay.tsx`, `e2e/world.spec.ts` |

Plus one out-of-band content fix (caught during Task 5's visual check: `op-windows` was drawing solid gold blocks instead of lit-window accents) and a 5-finding fix pass from the final whole-branch review (below).

New pure/framework-free modules — `lib/world/{geometry,camera,framing,director,zones,definition}.ts` and `lib/world/content/nightRace.ts` — are unit-tested and import `pixi.js` only via `import type`. `lib/world/render/**`, `lib/world/runtime.ts`, and all components are deliberately not unit-tested; the tested seam is cues-and-state-in → frame-state-out.

## Deviations from the plan (as shipped)

1. `lib/world/geometry.ts`'s `markerAnchors` row-0 anchor: the plan's literal `y: -row * MARKER_ROW_HEIGHT` produces `-0` for row 0, which fails the plan's own given test under this project's vitest. Fixed with a `row > 0 ? ... : 0` guard.
2. `lib/world/camera.ts`'s `clampCamera`: the plan's literal `if (span >= boundsWidth)` is dead code (unreachable given `spanLimits().max <= metrics.length < boundsWidth` always) and fails the plan's own given test. Fixed to `if (span >= metrics.length)`.
3. `lib/world/render/ParallaxLayer.ts`: the plan's literal plain-object `frame: {x,y,width,height}` fails `tsc --strict` against the installed `pixi.js@8.20.x` (its `generateTexture` wants a `Rectangle` class instance). Fixed with `new Rectangle(...)`.
4. `lib/world/runtime.ts`'s retarget-hysteresis logic (`RETARGET_EPSILON` and its comparison) was, per the plan's own literal code, inlined in `runtime.ts` — "how the camera moves" decision logic that belongs in `camera.ts` per this task's architectural constraint, and untestable where the plan put it since `runtime.ts` is deliberately unit-test-free. Extracted into a pure, tested `shouldRetarget()` in `camera.ts` (commit `eed84da`).
5. Task 7's plan brief's own "Files" header omitted `lib/world/runtime.ts`, though its own Step 2/Step 7 text required a one-line addition there (`scene.setPlayers(...)`). Followed the step text over the header; not a deviation from intent, just from the header's own accuracy.

## Deviations found during implementation (not anticipated by the plan)

- **`op-windows` content bug** (Task 4's own literal code, caught during Task 5's visual check): the shared `skyline()` helper always drew a solid `fill`-colour building rect first; `op-windows` passed `COLOR.warning` as that fill, producing solid gold blocks instead of lit-window accents (spec §6's stated intent). Fixed with an added `windowsOnly` parameter that skips the base fill (commit `ffbf00d`).
- **Final whole-branch review found 3 real cross-task integration bugs** that no task-scoped review could see, since each was the product of two different tasks' code combining, not a defect visible in either task's diff alone (fix commit `ea7b1bd`):
  - `WorldScene.ts`'s track was inserted at the grade's child index instead of the markers' — the opaque road and finish gate painted over marker pucks and nickname labels. Fixed to insert below markers instead.
  - All 3 zone sky layers (`op-sky`/`nc-sky`/`st-sky`) had `anchorY: 0`, which per `ParallaxLayer.ts`'s anchor math placed them entirely above the visible viewport at every zoom level — the sky gradient never rendered, and reduced profile (2 core layers per zone, one of them the invisible sky) was effectively down to 1 visible layer. Fixed to `anchorY: 1`.
  - `PixiStage.tsx` had an unguarded second `await import(...)` — a fast unmount mid-fetch could leak the runtime's 7 `cueBus` subscriptions permanently (each mutating a dead director object thereafter). Fixed with a `cancelled` guard.
- **Same review found 2 spec-coverage gaps the plan never carried into any task**, fixed in the same pass:
  - Spec §7's landscape readability scrim (question/answer UI over the now-visible canvas) was never built by any task. Added a `landscape:`-scoped scrim to `GameView.tsx`'s question `<main>`, reusing the existing `bg-abyss` token.
  - `e2e/world.spec.ts` (as given in the plan) only asserted the lobby's full-height state, never the actual strip↔full band transition. Extended with a real 2-player-game test covering both states.
- **The review also caught 3 inaccuracies in this phase's own ADR drafts** (0006, 0007, 0008 — controller drafting errors, corrected directly, not implementer/reviewer work): ADR-0006 had claimed independent per-layer zone-weight sampling when the code samples a single blend at camera centre; ADR-0007 had a wrong function signature and overclaimed the renderer has no profile-awareness anywhere (`Grade`/`Markers` do hold `profile` at construction); ADR-0008 misattributed `LEADER_BIAS` to the wrong framing branch.

## Knowingly deferred / not built

- **The `+1` delta flash on advancement** (spec §8, `TrackReadout`'s listed contents) was never built by any task — the plan never carried it in. Confirmed the pre-P1 `Track.tsx` didn't have it either, so this is a dropped new requirement, not a regression. Left for a later phase.
- **Stadium-zone-specific visual verification** for the sky-visibility and scrim fixes was proxied via neon-city instead — two live-game attempts to isolate the stadium zone coincided with the final question's intentional grade-escalation tint, making zone identification by eye ambiguous. Neon city (also bright/colourful) was used as the explicitly-permitted fallback; office park was independently confirmed clean. The fix itself (`anchorY`, a data value applied identically to all 3 sky layers) has no zone-specific code path, so this is a verification-coverage gap, not a suspected defect.
- Several Minor findings from the final review were adjudicated and parked rather than fixed, since none compound into anything real: `lib/world/camera.ts`'s dead `boundsWidth` variable; `lib/world/content/nightRace.ts`'s unused `LayerSpec` import; `lib/world/perf.ts`'s local `window` variable shadowing the global (harmless, scoped); `ZoneSpec.skyTop`/`skyBottom` are unused dead data (each zone's `skyBand()` draw call hardcodes its own colours instead); `'flicker'`/`'pulse'` ambient kinds share identical code and no neon-city cloud-drift layer exists; the `sweep` ambient can leave a small (~1.6% at worst) uncovered screen edge; the offscreen chevron in `TrackReadout` can flicker on/off roughly every 5.5s from camera-drift oscillation crossing the frame boundary; `op-windows`/`op-blocks` use different seeds so window clusters don't align to the buildings drawn under them (cosmetic, already screenshot-approved); profile-dependent branching is spread across 7 call sites with no single index — worth a doc comment before P2's quality watchdog work, not a defect today.

## Verification

- `npx tsc --noEmit` — clean
- `npm test` — **150/150** (15 test files)
- `npx playwright test` — **16/16** (15 pre-existing + the extended `e2e/world.spec.ts` band-transition test)
- `npm run lint` — clean except the one pre-existing, unrelated `app/room/[code]/page.tsx` error (see `docs/progress/CURRENT.md` tech debt)
- `npm run build` — succeeds
- Manual: two-player game walkthroughs via `playwright-cli` at every task (marker rendering/tied-segment stacking, 8-beat camera walkthrough — 6/8 directly eye-witnessed, 2 code-verified against already-unit-tested paths due to manual-tool latency on short transient windows — reduced-motion profile ladder, portrait band collapse/reopen, post-fix z-order and sky-visibility confirmation)

### Performance measurement (spec §12 exit criterion 1)

Measured via the `?perf=1` overlay on the development laptop, landscape, full screen, 1400×900, through a 3-question round including multiple TRACK moments:
- **High profile:** p50 6.9ms, p95 7.0–7.1ms, dropped 0/120 samples, sustained ~145fps.
- **Reduced profile (forced):** p50 6.9–7.0ms, p95 7.1–7.2ms, dropped 0/120 samples, ~143–145fps. Ladder visually confirmed: fewer/flatter background layers, no ambient shimmer.

Both comfortably under the ~16.7ms target — no layer-count reduction in `content/nightRace.ts` was needed.

## Exit criteria (spec §12)

- [x] 60fps on a mid-range laptop, evidence-backed — measurement above
- [x] Degrades gracefully on mobile / reduced profile — layer-count ladder (`tests/worldDefinition.test.ts`) + reduced-profile pass above
- [x] Camera responds to phase cues — `tests/director.test.ts`, `tests/camera.test.ts`, `tests/framing.test.ts` + the manual 8-beat walkthrough
- [x] Environment progresses office park → neon city → stadium — `tests/zones.test.ts` + visual confirmation (post-fix)
- [x] DOM track replaced; standings readable as HTML — `Track.tsx` deleted, `TrackReadout` in place, `game-flow.spec.ts` passes unmodified
- [x] Full Playwright suite passes — 16/16

## Related ADRs

[0005](../ADR/0005-auto-framed-pack-camera.md) · [0006](../ADR/0006-spatial-zones-plus-mood-grade.md) · [0007](../ADR/0007-quality-as-world-definition-data.md) · [0008](../ADR/0008-local-player-outranks-leader-in-overflow.md)
