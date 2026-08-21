# M2 P1 — Track World

| | |
|---|---|
| Status | Approved design — ready for implementation planning |
| Parent | `docs/superpowers/specs/2026-08-21-m2-the-show-roadmap.md` (P1), `docs/PRD.md` §8–§9 |
| Date | 2026-08-21 |
| Baseline | P0 complete and merged (`c39c25c`): design tokens, celebration hierarchy, cue vocabulary + bus, performance profiles, empty `PixiStage`, restyled app shell. `Track.tsx` still renders the DOM track. |

## 1. Purpose

P1 builds the environment — a produced world before anyone races in it. A Pixi side-view segmented racetrack, spatially staged parallax backgrounds that progress office park → neon city → stadium, ambient world animation, and a camera system that later phases direct through presentation cues. It replaces `Track.tsx`'s DOM track rendering with a Pixi world plus an accessible HTML standings readout.

Presentation-only. No schema, RPC, or realtime-protocol change (roadmap decision 4 not triggered).

## 2. Decisions

1. **The world is an always-on backdrop.** The canvas renders behind every in-game phase, not only during TRACK moments, so the camera can drift during ANSWER as the roadmap requires. Question UI floats above it on a readability scrim.
2. **Auto-framed pack camera.** Segments have a fixed world width, so a longer game is a genuinely longer track. The camera frames the pack — last place to leader plus padding — zooming to fit and clamped inside track bounds. The world travels underneath the players rather than the track being scaled to fit the viewport.
3. **Spatial zones plus a global mood grade.** The three environments are laid end to end along the track itself and crossfade in overlap bands; a separate scene-wide grade layer is driven by game progress and escalation cues. A stretched field can straddle two zones — the leader under neon while the back marker is still in the car park.
4. **Portrait uses an adaptive band.** On phones the canvas is a strip across the top (~28vh) while a question is on screen and animates open to full-bleed at the TRACK moment. Readability on mobile is guaranteed by layout, not by scrim opacity.
5. **`Track.tsx` becomes an accessible standings readout, not a picture.** Pixi owns the world; a visible glass HTML panel carries rank, nickname, and score as real text. Its `The track — after Q{n}` heading is preserved verbatim so the existing e2e assertion survives.
6. **The world renders in the lobby too**, as an establishing shot with the camera parked at the start line. Results keeps P0 styling until P5 builds the ceremony.
7. **Frame-time instrumentation without automatic action.** P1 measures so the 60fps exit criterion is evidence-backed, but adds no runtime profile downgrade. ADR-0004 stands; P2 — where load becomes variable with N avatars and particle systems — owns automation.
8. **Quality is data, not construction flags.** Everything profile-dependent (layer count, ambient density, grade complexity) is selected as part of the world definition rather than baked into renderer construction, so P2's watchdog can change quality without destroying the canvas.

## 3. Module layout

```
lib/world/
  geometry.ts          # pure: segment -> world x, track bounds, world<->screen
  camera.ts            # pure: camera state, step(), clamping, span limits
  framing.ts           # pure: frameTarget(anchors, trackLength, viewport, mode)
  zones.ts             # pure: worldX + progress -> zone blend weights, grade state
  director.ts          # pure: cue -> camera intent reducer with tier preemption
  perf.ts              # rolling frame-time sampler (measurement only)
  content/
    nightRace.ts       # WorldDefinition: zone specs, layer specs, parallax factors
  render/
    WorldScene.ts      # owns Pixi containers; consumes WorldDefinition + WorldFrameState
    ParallaxLayer.ts   # one tiling layer at one parallax factor
    TrackSurface.ts    # road, segment ticks, start/finish
    Markers.ts         # P1 placeholder pucks — P2 replaces at the same anchor API
    Grade.ts           # global mood-grade overlay
  runtime.ts           # createWorldRuntime(): subscribes cueBus + store, ticks the scene
components/
  PixiStage.tsx        # lifecycle (existing role); now also mounts the runtime + band layout
  TrackReadout.tsx     # rewritten Track.tsx -> accessible standings panel
```

No new dependencies. `pixi.js@8.20.0` was installed in P0.

### Seams

- **`WorldScene` never reads the game store or the cue bus.** It consumes a `WorldDefinition` (content) and a per-frame `WorldFrameState` (camera, zone weights, grade, marker anchors). This is what lets P6's stage view be a second consumer with different framing rather than a second renderer.
- **`runtime.ts` is the only module wired to `cueBus`**, preserving ADR-0001's "the cue layer is the sole game-state-to-show seam."
- **Everything testable is pure.** `geometry`, `camera`, `framing`, `zones`, and `director` are framework-free and unit-tested. `WorldScene` and `runtime` are not unit-tested — matching the roadmap's rule that the tested seam is cues-in → presentation-state-out.
- **The portrait band is a React/CSS concern.** `PixiStage`'s host element changes height; Pixi's `resizeTo` follows; the camera reads the resulting viewport aspect and picks a framing mode. The scene contains no layout branching.

## 4. World geometry

- Track length in world units = `total_rounds × SEGMENT_WIDTH`. Segment index equals a player's `correct` count, clamped to `total_rounds`.
- `segmentToWorldX(segment)` and `worldXToScreen(x, camera, viewport)` are the only conversions; nothing else does coordinate math.
- Degenerate cases are first-class: `total_rounds = 1` yields a single-segment track that still renders start line, finish line, and all three zones.
- Marker anchors are `{ playerId, x, y, scale }`, derived from standings. Players tied on a segment stack vertically, **ordered within the segment by speed points** per PRD §6. (The ordering rule lands in P1; the turbo-flame on the edge-holder is P2's.)

## 5. Camera system

Camera state is `{ centerX, span }` in world units. Zoom is expressed as *visible span* rather than a scale factor, which makes framing math direct and clamping obvious.

`step(state, target, dtMs, profile, style)` eases toward a target in one of two styles, both built from P0's tokens:

- **drift** — continuous, `EASE.drift`, `DURATION.drift`
- **cut** — `DURATION.cut` with `EASE.snap`

### Framing modes

| Mode | Target | Driven by |
|---|---|---|
| `startLine` | parked at segment 0 | lobby establishing shot |
| `establishing` | whole track | `phase-countdown` |
| `pack` | last place → leader, plus padding | `phase-read`, `phase-answer`, `phase-track` |
| `emphasis` | tight on named players | `overtake`, `lead-changed` |

### Span limits

`MIN_SPAN` is roughly 2.5 segments — the camera never pushes closer than that.

`MAX_SPAN = min(trackLength, 14 segments)`.

For any game up to 14 questions — including the 12-question default mix — the whole track always fits, and the "everyone stays on screen" property of the chosen framing model holds exactly. Beyond 14 segments the camera frames a 14-segment window biased to include both the leader and the local player; anyone outside that window is represented by an off-screen chevron in the HTML readout rather than a canvas marker. This is an accepted, explicitly-chosen edge, not an oversight.

Center is clamped so the view never leaves the track bounds plus a fixed margin.

### Direction

`director.ts` is a pure reducer over `{ base, transient }`. Cues map to intents; each transient intent carries a celebration tier and a duration and **preempts the base mode only if its tier is higher**. An `overtake` punch-in interrupts answer drift for ~1.2s and then releases back to `pack`; a `routine` cue never interrupts anything. The celebration hierarchy is therefore enforced at the camera, not only in VFX.

Cues that produce a camera intent in P1: `phase-countdown`, `phase-read`, `phase-answer`, `phase-track`, `overtake`, `lead-changed`, `final-question`.

`player-advanced` moves marker anchors but produces no camera intent of its own. `phase-reveal` produces none either — the base mode simply persists through REVEAL, so the world holds its pack framing while the HTML reveal panel is on screen. Everything else in the P0 vocabulary is owned by later phases and ignored here: `streak-tier`, `streak-broken`, `answer-locked`, `player-joined`, `podium`, `phase-results`. Unknown or unhandled cues are ignored without error.

`final-question` produces a slow push-in and hands the grade its escalated value.

## 6. Zones, parallax, and the grade

`WorldDefinition` describes zones declaratively. Each zone is an ordered list of layer specs: parallax factor, procedural draw function, tint, repeat width, and the profile at which the layer is included.

**Every layer is drawn once into a `RenderTexture` at init and thereafter only tiled and translated.** No per-frame `Graphics` rebuilds — this is what makes 60fps achievable with procedural art, and it keeps texture memory constant regardless of track length.

Zones occupy proportional ranges of track length with ~12% overlap bands. Inside a band, both zones' layers render simultaneously with alpha from `zoneWeights(worldX)`. Because ranges are proportional, a 4-question game still visits all three environments.

The **grade** is a single full-screen gradient sprite whose color and alpha derive from game progress plus escalation cues — the dial P3 turns for "lights dim, track goes neon," and P5 will want for the ceremony. It is kept strictly separate from zone blending.

**Ambient animation** (high profile only), all alpha/position tweens over pre-rendered textures:

- Office park — window lights flickering on a timer
- Neon city — sign-glow pulse, slow cloud drift
- Stadium — sweeping floodlight beams

## 7. Layout: landscape and the portrait band

**Landscape / desktop** — the canvas is full-bleed behind the game UI, `pointer-events: none`, as in P0. Question and answer UI sit on a readability scrim. Scrim strength is a token; contrast is verified against the stadium zone, which is the brightest worst case.

**Portrait** — `PixiStage`'s host element is a band across the top at ~28vh while a question is on screen, and animates to full height at the TRACK moment, returning to the band on the next `phase-read`. The question and answer buttons occupy solid ground below the band, so text is never rendered over moving pixels. The transition uses `DURATION.settle`/`EASE.settle`, and collapses to an instant change under the reduced profile.

Band height by phase, in portrait only:

| Phase | Band |
|---|---|
| `lobby`, `countdown`, `track` | full height — no question UI competing for space |
| `read`, `answer`, `reveal` | ~28vh strip |

**Results** — the canvas does not render on the results screen in P1 (decision 6); `PixiStage` unmounts when `room.status === 'finished'`, and P5 decides what the ceremony puts there.

Orientation and resize changes fire Pixi's `resizeTo`; the camera re-derives its framing mode from the new viewport aspect.

## 8. Markers and the readout

**`Markers.ts` (canvas, placeholder)** — a racer-colored ring with a dark fill, a nickname label, and a `YOU` ring for the local player. Markers ease to their anchor with `EASE.settle`. The full boost → overshoot → settle movement grammar, squash-and-stretch, and boost trails are deliberately **not** in P1; they are P2's, and P2 replaces this module against the same anchor API.

**`TrackReadout.tsx` (HTML, accessible)** — the rewritten `Track.tsx`. A glass panel over the world during the TRACK phase, rendered as a semantic list: rank, medal for the top three, nickname, correct/total, a `+1` delta flash on advancement, and an off-screen chevron where the camera can't include a player. The heading `The track — after Q{n}` is preserved verbatim.

Scope is held to today's behaviour: the full readout appears at the TRACK phase only. A condensed always-on standings strip is not in P1.

## 9. Performance

### Degradation ladder

| | high | reduced |
|---|---|---|
| Parallax layers | 5 per zone | 2 per zone (sky + midground) |
| Ambient animation | full | none — static textures |
| Idle camera drift | yes | none; eased moves and cuts only |
| Grade | gradient + blend mode | flat tint |
| Marker motion | eased settle | instant snap |
| Zone transition | alpha crossfade band | hard switch at the boundary |
| Portrait band open/close | eased | instant |
| `antialias` | on | off |

### Instrumentation

`perf.ts` keeps a rolling 120-frame window and exposes p50/p95 frame time and a dropped-frame count. A dev-only overlay behind `?perf=1` surfaces it. **Measurement only** — no automatic profile change (decision 7).

## 10. Testing

**Vitest units** (all pure modules):

- `geometry` — segment→x, `total_rounds = 1`, track bounds, screen conversion.
- `camera` — easing toward target, clamping to bounds, `MIN_SPAN`/`MAX_SPAN` limits, cut vs drift styles.
- `framing` — pack fit, single player, all players tied, spread beyond `MAX_SPAN` (leader-and-you bias), viewport aspect variation, empty standings.
- `zones` — blend weights at boundaries and across overlap bands, short tracks, grade value from progress and from `final-question`.
- `director` — cue→intent mapping, tier preemption, release back to base after a transient expires, unknown cues ignored.

**Playwright e2e**:

- All 14 existing tests stay green — the regression floor. `game-flow.spec.ts`'s track assertion now lands on `TrackReadout`'s preserved heading and needs no edit.
- New: a portrait-viewport test asserting the canvas band is a strip during ANSWER and full height during TRACK.

**Visual smoke**: playwright-cli screenshots at each zone and at the final-question grade, during development. Not committed as snapshot tests.

Canvas internals are not unit-tested.

## 11. Edge cases

| Case | Behaviour |
|---|---|
| Countdown, before any reveal | All markers at segment 0; `establishing` framing. |
| `total_rounds = 1` | Single-segment track; all three zones still render, compressed. |
| WebGL init failure | P0's existing handling — console error, full HTML game intact; the readout still carries standings. |
| Mid-game reload or late join | The runtime seeds from current store state; the P0 cue bridge already re-emits the current beat on seed. |
| Orientation / resize change | `resizeTo` fires; the camera re-derives its framing mode from the new aspect. |
| Pack spread beyond `MAX_SPAN` | Camera biases to include the leader and the local player; others get an off-screen chevron in the readout (§5). |

## 12. Exit criteria (from the roadmap)

1. The world renders at 60fps on a mid-range laptop, verified with `perf.ts` output rather than by impression.
2. It degrades gracefully on mobile and under the reduced profile, per the §9 ladder.
3. The camera responds to phase cues — establishing, pack framing, drift, cuts, overtake emphasis, final-question push-in.
4. Environment progression advances across a full game, office park → neon city → stadium.
5. `Track.tsx`'s DOM track is replaced; standings remain readable as HTML text.
6. The full Playwright e2e suite passes.

## 13. Out of scope

Avatars and character art, movement grammar, streak and overtake VFX, canvas medal flair (P2) · staged round choreography and answer-button restyling (P3) · audio (P4) · podium ceremony and results restyle (P5) · stage view (P6) · automatic runtime profile downgrade (P2) · an always-on standings strip · any schema, RPC, or realtime-protocol change.

## 14. Expected ADRs

Implementation is expected to record decisions 2 (auto-framed pack camera with a `MAX_SPAN` legibility cap), 3 (spatial zones plus a separate grade layer), and 8 (quality as world-definition data rather than construction flags) as ADRs, since each is a constraint later phases must respect.
