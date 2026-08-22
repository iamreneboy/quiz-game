# P2 — Avatars & motion

- **Status:** Complete
- **Completed:** 2026-08-22
- **Spec:** `docs/superpowers/specs/2026-08-22-m2-p2-avatars-motion-design.md` (parent: `docs/superpowers/specs/2026-08-21-m2-the-show-roadmap.md` §P2)
- **Plan:** `docs/superpowers/plans/2026-08-22-m2-p2-avatars-motion.md`
- **Branch:** `m2-p2-avatars-motion` @ `7d530d2` — not yet merged; see `superpowers:finishing-a-development-branch`

## Scope (from the spec)

Put contestants in the world P1 built. A procedural roster of twelve office characters on one shared rig; a movement grammar that turns a standings delta into a staged boost (anticipate → launch → travel → settle); a pure choreographer that buffers reveal-time drama and plays it at the TRACK beat; overtake, streak and ignition VFX arbitrated on the celebration hierarchy; top-three flair plus leader emphasis and edge-holder turbo; a runtime VFX budget that sheds particle output under frame pressure without touching `profile`; and a canvas-first lobby starting grid with idling avatars, `LobbyView` demoted to an accessible roster strip. Presentation-only — no schema, RPC, or realtime-protocol change.

## What was built

Executed via `subagent-driven-development` (fresh implementer + fresh reviewer per task) in an isolated worktree, 8 tasks:

| # | Task | Key files |
|---|---|---|
| 1 | Movement grammar | `lib/world/movement.ts` |
| 2 | Flair — medal, leader, edge-holder | `lib/world/flair.ts` |
| 3 | VFX budget watchdog | `lib/world/vfxBudget.ts` |
| 4 | The choreographer | `lib/world/choreographer.ts`, `lib/presentation/celebration.ts` |
| 5 | Grid anchors and start-line framing | `lib/world/geometry.ts`, `lib/world/framing.ts` |
| 6 | The avatar roster | `lib/world/content/roster.ts` |
| 7 | The rig, the renderer, and the VFX pool | `lib/world/render/{AvatarNode,Avatars,Vfx}.ts`, `lib/world/render/WorldScene.ts`; deletes `lib/world/render/Markers.ts` |
| 8 | Runtime wiring and the lobby roster strip | `lib/world/runtime.ts`, `components/LobbyView.tsx`, `e2e/world.spec.ts` |

Plus three fix passes on top: two task-scoped (`53c9f17` grid column spacing, `6ff0a05` the YOU ring), one integration pair caught after Task 8 (`e11856b` the pre-reveal hold, `02937ce` the start-line fallback), and one 13-finding pass from the final whole-branch review (`f54bd57`, below).

New pure/framework-free modules — `lib/world/{movement,flair,vfxBudget,choreographer,decals}.ts`, `lib/world/content/roster.ts`, plus additions to `geometry.ts` and `framing.ts` — are unit-tested and import `pixi.js` only via `import type`. `lib/world/render/**` and `lib/world/runtime.ts` remain deliberately unit-test-free (spec §9); the tested seam is cues-and-state-in → frame-state-out.

## Deviations from the plan (as shipped)

1. **Subdue is applied per effect, not per player.** The plan's wording admitted both readings. Applying the 0.6 multiplier once to a player's whole bundle produces the same screenshot in the single-effect case, so the wrong reading would not have been caught by eye. Recorded in [ADR-0010](../ADR/0010-exclusive-arena-reaction-subdued-avatar-vfx.md).
2. **The arena reaction fires only on `streak-tier` with `streak === 8`** when the streak milestone is the beat's headline, gated with `??=` so exactly one is ever awarded. The plan named the effect but not the gate.
3. **Two of the plan's own given tests were unreachable or wrong** and were replaced rather than carried: a trail-sample assertion that sampled the instant rather than `ANTICIPATE_MS + TRAVEL_MS / 2`, and an `expect(shot.centerX).toBeLessThan(0)` that no input could satisfy.
4. **An unused trailing `ctx` parameter** in the plan's literal signature was omitted rather than shipped dead.
5. **`beginSequence` gained a `profile` argument** (`beginSequence(state, anchors, now, profile)`). The plan hardcoded `staggerFor(index, 'high')` inside it, which made the profile-aware stagger branch dead in production.
6. **Overtake lightning fires at the computed crossing, not a fixed 60% of travel.** Spec §4 states the mechanism explicitly — sample the movement curve for where the passer's x crosses the passed player's. Both tracks are pure and in hand, and the 60ms stagger puts the two on different clocks, so 60% is not the crossing in general. Implemented as a pure `crossingTime(passer, passed, profile)` in `movement.ts` (8ms sampling, latest crossing wins, documented fallback for pairs that never cross). P4 will key a sound to this instant.
7. **`spanLimits.max` and `clampCamera`'s unclampable branch measure against world width, not `metrics.length`.** The final review suggested a special case in `clampCamera` for anchor extents; the implementer rejected it and fixed the root cause instead, correctly — the suggested fix would have left `total_rounds = 1` running at scale 4.0, re-breaking the very guarantee it was meant to protect. The lobby grid lives entirely in the run-off, which `metrics.length` excludes by definition.

## Deviations found during implementation (not anticipated by the plan)

- **The pre-reveal hold was missing, and it is the whole mechanism** (`e11856b`). Without it, `beginSequence` read both start and destination from the *post*-reveal anchors, so every movement track was zero-length: the sequence ran, the camera cut, the timing profiled correctly, and nothing moved. This survived seven task gates because no test observed *displacement*. Fixed in the pure module as `holdAnchors(state, anchors)`, called at the phase beats preceding reveal. Recorded in [ADR-0009](../ADR/0009-drama-buffered-to-the-track-beat.md) as a standing trap: verify travel distance, never that the sequence ran.
- **An empty field before the first reveal** (`02937ce`). Between the countdown and the first reveal there are no standings, so no anchors, so no avatars — during a beat that is full-band, not a strip. Fixed with a `startLineAnchors` fallback in `geometry.ts`.
- **The final whole-branch review found 1 Critical and 7 Important cross-task defects** that no task-scoped review could see, all fixed in `f54bd57`:
  - **Critical — the world was sized against a marker that no longer exists.** `MARKER_ROW_HEIGHT = 74` was P1's, sized for the 52-unit puck that Task 7 deleted; the rig it now stacks is 172 units tall. At 1280×720 with 8 tied players, rows 5/6/7 were fully off-canvas — and `offscreenPlayerIds` tested x only, so `TrackReadout` showed no off-screen marker for any of them. Three players simply vanished with no accessible fallback. Fixed by hoisting the rig envelope into `roster.ts` (`AVATAR_RIG_TOP/BOTTOM/HEIGHT`, `AVATAR_HALF_WIDTH`, `AVATAR_RIM_HALF_WIDTH`), deriving `MARKER_ROW_HEIGHT` from `AVATAR_HEIGHT`, capping the stack with a per-segment `stackPitch(rowCount)` compression against `MAX_STACK_RISE`, and making `offscreenPlayerIds` y-aware via a new `worldYToScreen` (rule: visible while *any* part of the rig is on canvas).
  - Mount points were applied in unscaled rig units, so every particle emitted from the wrong place.
  - A non-playing MC host was given a rig on the lobby grid and the start line, then vanished at the first reveal — `fieldAnchors` used the unfiltered roster for the pre-standings paths and standings for the rest.
  - The rearmost lobby grid column sat exactly on the camera's left bound and was clipped roughly 40% at 7+ players (`GRID_EDGE_MARGIN`).
  - With `total_rounds ≤ 2` — which spec §10 explicitly supports — the entire lobby grid was off-screen (deviation 7 above).
  - `minimal` promised static sprites and drew nothing, so `reduced`, which is pinned at `minimal`, was exactly the profile that lost all streak and edge-holder signalling. Fixed with a new pure `lib/world/decals.ts`.
  - Plus M-tier: contexts never released on `destroy`, a `#000000` accent falling through `||` to cyan, the YOU ring depending on an import race (fixed with `setLocal()` and a dedicated `localRing`), and `Vfx` recycling documented oldest-first but implemented as a plain ring cursor (`claim()`).
- **The re-review of that fix pass found one regression the pass itself had introduced** (`7d530d2`). Making the YOU ring re-markable added `private isLocal = false` — a class field initialiser, which runs *before* the constructor body, so the constructor's `setLocal(isLocal)` early-returned for every non-local rig and the accent underline was never drawn for 7 of 8 players. Spec decision 4 gives the accent exactly four surfaces (rim, shadow tint, boost trail, label underline); one of them had quietly gone. Fixed with a `boolean | null = null` sentinel, which keeps every draw on the one path and leaves the idempotence guard doing its real job for the per-frame re-mark. Confirmed live off the Pixi scene graph: a non-local rig's underline went from 0 `GraphicsContext` instructions to 1 (`fill`, 52×3 at −26,32) while the local rig stayed byte-identical (52×5).
  - The same round fixed three Minors: the readout's off-screen marker asserted a direction it never had (a fixed `◀`, already wrong for players off the right and newly wrong for players off the top once the check went y-aware) and is now non-directional; `PixiStage` re-read `localStorage` and re-parsed JSON *every tick, forever*, for anyone watching without joining — measured at 722 reads across 723 frames, now 10 across 721 behind a 500ms miss-only throttle; and a dead exported `UNCOMPRESSED_STACK_ROWS` was removed.

- **`turbo` at `lean` ships as particles, where §8's budget table says static sprite** — found by the live exit-criteria walkthrough, after the fix loop had closed. `ALLOWANCES.lean` sets `particles: true` and `staticDecals()` returns `[]` whenever particles are allowed, so the `lean` row of that one effect is not what the table specifies; measured at 171 amber particles at exactly 0.500 while the trail was correctly capped at 0.492. Left as built, deliberately. No signal is lost — the turbo is still drawn, at half rate — so the accessibility failure `decals.ts` exists to prevent (at `minimal` the funded `turbo: 0.5` and `streak: 0.5` rendered as *nothing*) does not recur here; what is lost is a frame saving on a device that has already shed a level. As shipped the ladder is also monotone — full particles, half particles, static — where the spec's version makes `lean` and `minimal` identical for turbo and spends a rung. And the fix is not local: `staticDecals` decides on a single `allowance.particles` boolean, so making turbo static at `lean` means adding a per-kind particle dimension to the allowance *and* suppressing turbo requests in the choreographer while still drawing the decal — a contract change to two pure modules plus the renderer, at phase close. Tech debt.

## Knowingly deferred / not built

- **The active streak tier does not survive a reload**, contradicting spec §4's own persistent/transient table. `streakTier` accumulates from cues inside `ChoreographerState`, and `streak-tier` cues fire only at the 3/5/8 milestones, so a player reloading at streak 6 loses their flame until the next milestone. The wire cannot fix it: `Standing` carries `longest_streak`, not the current run, and spec §2 forbade a protocol change this phase. Recorded as a known violation in [ADR-0013](../ADR/0013-persistent-vs-transient-vfx.md) and as tech debt in `CURRENT.md`. The fix is a `current_streak` field on `Standing`, owned by whichever phase next opens the protocol.
- **Tied rigs share a compressed stack rather than offsetting in x.** The Critical fix keeps all eight on canvas by compressing the pitch, which makes the all-tied cases (the start line, the round-1 TRACK beat) a tight heap of overlapping rigs. The readable answer is two players per row offset in x — but that requires `row` to stop meaning "unique rank within the segment", which `flairFor`'s edge-holder rule reads. That is a contract change to a pure module, not a fix. Tech debt.
- **The lobby → countdown transition teleports the whole field in one frame.** Spec §7 requires a stable starting-grid formation, not a roll-up-to-the-line move; inventing one at the end of the phase is new choreography, not a fix. Left as built.
- **The baked-texture cache is not namespaced per `Application`.** It is bounded at 12 entries and un-stalable precisely because the accent is a rim rather than baked, so it is correct today — but spec §3 says P6's stage view adds a second renderer, at which point the first app's GPU-bound textures would be handed to the second app's sprites. Recorded as a conditional in [ADR-0011](../ADR/0011-accent-is-a-rim-never-a-body-tint.md) rather than pre-solved.
- **The lobby grid's column spacing is compressed and same-row rigs overlap.** Reserving room to draw the rearmost rig whole cost 31% of the spacing (73 → 51 units, against a 76-unit rim). The root cause is `TRACK_MARGIN` — the last P1 constant still sized against the deleted puck, and the same failure mode as the Critical — but it sets the world's `minX`/`maxX`, so widening it at phase close would move the camera bounds and re-test framing. Tech debt.
- **`MAX_STACK_RISE` is derived at 16:9 and applied at every aspect.** Ultrawide loses the top of a deep stack (top head at +23.5 on 1920×1080, −227.8 on 2560×1080). Not a return of the Critical — those players are named by `offscreenPlayerIds` and marked in the readout — but the honest fix needs the viewport inside a pure, viewport-free module. Tech debt; P6's stage view is the phase that will care.
- **The off-screen marker no longer carries a direction.** Restoring one properly means `offscreenPlayerIds` returning a direction per player, which changes a pure module's return type, `useWorldView`'s state shape, and every caller and test. Tech debt.
- **The YOU ring can be late for a mid-session joiner** — the bound is `SESSION_RECHECK_MS` (500ms) **plus one ticker interval**, since the re-read happens on a tick; measured at 544ms including the join round-trip. Don't assert `< 500ms` against it. This is the deliberate cost of bounding the `localStorage` poll. The `storage` event was the alternative and was rejected correctly: it does not fire in the tab that wrote the value, which is exactly the tab that needs to notice.
- Several Minor findings and Notes were adjudicated and parked; none compound into anything real.

## Verification

- `npx tsc --noEmit` — clean
- `npm test` — **259/259** (21 test files; P1 baseline was 218 across 20)
- `npx playwright test` — **17/17**
- `npx eslint` on every file this branch touched — clean. Repo-root `npm run lint` is red on three files this branch never touched; that is pre-existing P1 debt, tracked in `docs/progress/CURRENT.md`.
- `npm run build` — succeeds
- Manual: live A/B against the Pixi scene graph (`__PIXI_APP_INIT__`, headed, 1280×720, no source instrumentation), with the BEFORE side obtained by checking out the pre-fix tree, confirming each of the four geometry fixes by measurement rather than by eye — see below.

### Live A/B of the Critical fix (`02937ce` → `f54bd57`)

| Finding | Before | After |
|---|---|---|
| Critical (TRACK beat, 8 tied) | rows 5/6/7 at y −74 / −192 / −310, fully off-canvas, **no off-screen marker on any of them** | all 8 rigs on canvas, y 232…518 |
| Unscaled mounts | particle birth y **296** (the unscaled mount) | **247** (correct 248; 1px because the rig scale animates through the pulse pop) |
| Lobby edge margin | rearmost pair bounds-left −70 / −68 | +40 |
| `total_rounds = 1` | 7 of 8 off-canvas at scale 4.0 | all 8 visible at scale 1.6 |

### VFX budget measurement (spec §11 exit criterion 5)

Forced live in a **headed production build** — headless Chromium is unusable for this, since it falls back to SwiftShader, idles at ~16fps / `dropped 75/76`, and pins the budget at `minimal` before a test can begin. CDP CPU throttling is also the wrong instrument: the loop is GPU-bound. Headed plus a synthetic main-thread block is the combination that works.

- Baseline **130fps at `full`**, 56 particles live.
- Under a sustained main-thread block: shed to `minimal`, **0 particles**.
- After ~9s of clean frames: recovered, **56 particles** again.
- `window.__appInits` pinned at **1** throughout — the world was never reconstructed, and `profile` never moved. **ADR-0004 stands unamended.**

### Live exit-criteria walkthrough (spec §11 criteria 1–4)

Four runs on a **production build**, headed at 1280×720, one browser context per player, against the final commit. Everything below is read off the live Pixi scene graph (`__PIXI_APP_INIT__`, no source instrumentation) or off the wire — screenshots were supporting evidence only. World x is recovered camera-independently as `(rig.x − trackSurface.x) / trackSurface.scale.x`, which is byte-for-byte the transform `Avatars.apply` uses, so a camera cut on the same beat cannot contaminate it.

| Criterion | Evidence |
|---|---|
| **1** — semantic events only | 12 TRACK beats: every advancing player displaced **exactly 320.00** world units (`SEGMENT_WIDTH`) through **9–24 distinct intermediate positions** with a **+16.9-unit (5.3%) settle overshoot**; every non-advancing player moved **exactly 0.00**. Squash spans [0.881, 1.150]. The back-marker-first stagger measured **+0 / +62–70 / +122–129 ms**, travel starting `ANTICIPATE_MS` later. Two overtakes and a lead change rendered as a 1.000↔1.120 emphasis exchange; streak tiers 3/5/8 tinted in turn and stopped on the break. A regex sweep for coordinate- and renderer-shaped keys over the **union of every realtime frame and every REST response across a whole game** returned **zero** matches. |
| **2** — celebration hierarchy | On a beat carrying an overtake (headline) *and* a streak-5: lightning 21 emissions at **1.000**, streak flame 69 and ignition 11 at **exactly 0.600**, returning to 1.000 once the sequence ended. The same ignition measures **0.600 when an overtake outranks it and 1.000 when the milestone is the headline** — the multiplier, isolated. Arena magenta appeared in **one beat of nine** (156 particles, +1400…+2591 ms = `ARENA_AT_MS` + `ARENA_HOLD_MS`) and zero in the other eight, with the `Grade` overlay flipping to neon on the same frame and back when the window closed. |
| **3** — both profiles | The §8 degradation ladder verified **exact on every row** under `reduced`: instant snap with 0 intermediate positions, squash pinned at 1.000, quirks at 0 across 381 frames, no ready pulse, level pinned `minimal` with static decals drawn in place of particles, no stagger, flat mood grade — and medal glow and leader emphasis **1.120 still present**, which is the row the budget structurally cannot shed. All three budget levels were also observed under `high`. One divergence, below. |
| **4** — lobby | Grid at rows 0 / 64 and columns 0 / 90, formation stable as each player joined. Idle sway over **exactly [−0.0300, +0.0300] rad** (`amount × 0.5`) with independent phase per rig, while position, squash and emphasis held constant to 4 dp. Ready pulse **1.1798 → 1.000 over ~590 ms** (`PULSE_POP` 0.18, `PULSE_MS` 600) on the arriving rig only. `<ul data-testid="lobby-roster">` carries real text nodes, heading verbatim. |

Spot-checks on this phase's three defect sites, all clean: **3 rig containers in every one of 17,247 recorded frames**, no frame at any other count, so nobody is dropped across the first reveal; the non-playing MC host never appears as a rig label in any frame of any run, and the racers occupy grid indices 0/1/2 with no phantom slot; the accent underline is present on all three non-local rigs, tracking each player's own colour, while only the local rig adds the silver YOU ring and label fill.

**Divergence found — `turbo` at `lean`.** §8's budget table specifies the turbo flame as a *static sprite* at `lean` as well as at `minimal`. It ships as particles: `ALLOWANCES.lean` sets `particles: true`, and `staticDecals()` returns `[]` whenever particles are allowed, so at `lean` the turbo emits at `turbo: 0.5` and draws no static form — measured at 171 amber particles at exactly 0.500 while the trail was capped at 0.492. **Recorded, not fixed** — see the deviations section; the reasoning is that no signal is lost (only a frame saving), the shipped ladder is monotone where the spec's spends a rung, and the fix needs a per-kind particle dimension on the allowance plus choreographer suppression, i.e. a contract change to two pure modules at phase close.

**Verification gaps, stated as gaps.** Only the `sway` idle quirk was measured live — `bob`, `pulse` and `tilt` live in `AvatarNode.ts`'s switch, outside the test boundary by design, and are unverified. The negative arena case (streak-8 present, overtake headline → inferno without arena) could not be isolated live because the budget had shed to `minimal` by that beat, which zeroes `allowance.arena` independently; it is covered instead by `tests/choreographer.test.ts:101`, which buffers exactly that pair at profile `high` with no clamp. `lean`'s streak cap likewise has no runtime instance, only `tests/vfxBudget.test.ts:78`. Portrait, the 28vh band and mid-game reload were not exercised. Absolute frame numbers are one machine with four canvases.

## Exit criteria (spec §11)

- [x] A full game plays with movement, overtakes, streaks and flair rendered from semantic events only — no coordinates or renderer concepts on the wire — **live, measured**: 320.00-unit displacements, zero coordinate-shaped keys on the wire
- [x] Celebration hierarchy respected: below-headline effects subdued, exactly one arena reaction per beat — `tests/celebration.test.ts`, `tests/choreographer.test.ts` + **live**: 0.600 vs 1.000 on the same effect, one arena beat in nine
- [x] Both performance profiles work per the §8 ladder — `tests/vfxBudget.test.ts`, `tests/decals.test.ts` + the live runs above. **Met with one named deviation**: the `turbo @ lean` cell of the budget table ships as particles rather than a static sprite
- [x] Lobby starting grid shows idling avatars with the ready pulse; roster strip remains readable HTML — the roster-strip test added to `e2e/world.spec.ts` + **live**
- [x] VFX budget demonstrably sheds and recovers without `profile` changing — measurement above
- [x] Full Playwright suite passes — 17/17

## Related ADRs

[0009](../ADR/0009-drama-buffered-to-the-track-beat.md) · [0010](../ADR/0010-exclusive-arena-reaction-subdued-avatar-vfx.md) · [0011](../ADR/0011-accent-is-a-rim-never-a-body-tint.md) · [0012](../ADR/0012-vfx-budget-adapts-without-touching-profile.md) · [0013](../ADR/0013-persistent-vs-transient-vfx.md)
