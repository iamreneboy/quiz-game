# M2 P1 — Track World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the DOM track with a PixiJS world — a segmented racetrack, spatially staged parallax zones that progress office park → neon city → stadium, a global mood grade, ambient animation, and a cue-driven camera — plus an accessible HTML standings readout.

**Architecture:** All decision-making logic is pure and framework-free in `lib/world/` (geometry, camera math, framing, cue→intent direction, zone blending, frame sampling). A declarative `WorldDefinition` describes the night-race content as data. `WorldScene` renders that definition from a per-frame `WorldFrameState` and never reads the game store or the cue bus. A single `runtime.ts` is the only module wired to `cueBus`; it owns the director and camera state and ticks the scene. React contributes lifecycle and layout only.

**Tech Stack:** Next.js 16.3.1 (App Router, TypeScript strict), React 19.2, Tailwind CSS v4, PixiJS v8.20, `motion` v13, Zustand v5, Vitest v4, `@playwright/test` v1.62.

**Spec:** `docs/superpowers/specs/2026-08-21-m2-p1-track-world-design.md` (parent: `docs/superpowers/specs/2026-08-21-m2-the-show-roadmap.md` §P1, `docs/PRD.md` §8–§9).

## Global Constraints

- **Presentation-only.** No changes to `supabase/**`, `lib/store.ts`, `lib/types.ts`, `lib/useRoomChannel.ts`, `lib/useHostDriver.ts`, or any RPC/realtime payload. If a task appears to need one, stop and flag it — that is a roadmap decision-4 exception, not a quiet addition.
- **Do not modify `lib/presentation/**`.** The P0 cue vocabulary (`cues.ts`), derivation (`deriveCues.ts`), bus (`cueBus.ts`), celebration scale (`celebration.ts`), tokens (`tokens.ts`), and profile (`profile.ts`) are consumed, never redefined (ADR-0001). P1 adds no cue types.
- **The existing Playwright suite is the regression floor.** `e2e/landing.spec.ts`, `e2e/host-setup.spec.ts`, `e2e/join.spec.ts`, `e2e/settings.spec.ts` must pass **unmodified**. `e2e/game-flow.spec.ts` must pass **unmodified** — its `The track — after Q1` assertion is why `TrackReadout` keeps that heading verbatim.
- **`components/PixiStage.tsx`, `components/SettingsControl.tsx` and `components/PerfOverlay.tsx` must render OUTSIDE any `<main>` element.** `e2e/game-flow.spec.ts` selects the first answer option with `page.locator('main button').first()`; any extra button inside `<main>` breaks the full-game test.
- TypeScript `strict`; no `any` in committed code. `npm run lint` clean (one pre-existing unrelated error in `app/room/[code]/page.tsx:29` — see `docs/progress/CURRENT.md`; do not fix it here, and do not trust `npm run lint`'s count while a worktree exists under `.claude/worktrees/`).
- Unit tests are **pure Node** — no jsdom, no DOM globals, no `pixi.js` runtime import. Vitest picks up `tests/**/*.test.ts` only (`vitest.config.ts`, alias `@` → repo root). `lib/world/render/**`, `lib/world/runtime.ts`, and all components are deliberately **not** unit-tested; the tested seam is cues-and-state-in → frame-state-out.
- Type-only imports from `pixi.js` (`import type { Graphics } from 'pixi.js'`) are erased at compile time and are safe in unit-tested modules. A **value** import of `pixi.js` in any module reachable from `tests/**` will fail the suite.
- Reuse P0 tokens; do not introduce new colour or motion constants. `COLOR`, `RACER_COLORS`, `EASE`, `DURATION`, `CANVAS` come from `lib/presentation/tokens.ts`. Exact curve values: `snap [0.2, 0, 0, 1]` · `settle [0.34, 1.4, 0.5, 1]` · `drift [0.45, 0, 0.55, 1]`. Exact durations (ms): `cut 120`, `beat 260`, `settle 460`, `drift 1400`.
- Celebration hierarchy, fixed: `routine < streakMilestone < overtake < finalQuestion < victory`. Camera preemption uses `tierRank` from `lib/presentation/celebration.ts` — never a hand-rolled ordering.
- **Profile is stable for the life of a render pass** (ADR-0004). `useSettings(s => s.profile)` changes only on user action. P1 adds **no** automatic downgrade.
- Span limits, fixed: `MIN_SPAN_SEGMENTS = 2.5`, `MAX_SPAN_SEGMENTS = 14`. Zone overlap band: `0.12` of track length. Dropped-frame threshold: `20ms`.
- **Prerequisites for e2e:** Docker Desktop running and local Supabase up (`npx supabase start`) — `.env.local` points at `http://127.0.0.1:54321`. The dev server may already be running; `playwright.config.ts` reuses it outside CI.
- Out of scope (do not build): avatars or character art, movement grammar (boost/overshoot/squash), streak or overtake VFX, canvas medal flair, staged round choreography, answer-button restyling, audio, ceremony, stage view, automatic runtime profile downgrade, an always-on standings strip.

## File Structure

```
lib/world/
  geometry.ts          # CREATE: segment->world x, metrics, screen transform, marker anchors  (Task 1)
  camera.ts            # CREATE: camera state, span limits, clamping, bezier moves, drift     (Task 2)
  framing.ts           # CREATE: frameTarget() per mode, offscreen detection                  (Task 2)
  director.ts          # CREATE: cue -> camera intent reducer with tier preemption            (Task 3)
  zones.ts             # CREATE: zone blend weights + grade state                             (Task 4)
  definition.ts        # CREATE: WorldDefinition / ZoneSpec / LayerSpec types + helpers       (Task 4)
  content/
    nightRace.ts       # CREATE: the night-race world content (procedural draw fns)           (Task 4)
  render/
    ParallaxLayer.ts   # CREATE: one tiling layer at one parallax factor                      (Task 5)
    TrackSurface.ts    # CREATE: road, segment ticks, start/finish gates                      (Task 5)
    Grade.ts           # CREATE: full-screen mood-grade overlay                               (Task 5)
    WorldScene.ts      # CREATE: owns containers; applyFrame(WorldFrameState)                 (Task 5)
    Markers.ts         # CREATE: placeholder position pucks (P2 replaces)                     (Task 7)
  frame.ts             # CREATE: WorldFrameState type (shared by scene + runtime)             (Task 5)
  perf.ts              # CREATE: rolling frame-time sampler                                   (Task 8)
  runtime.ts           # CREATE: cueBus + store subscriber, director/camera owner, ticker     (Task 6)
  useWorldView.ts      # CREATE: tiny Zustand store — offscreen ids + frame stats             (Task 6)
components/
  PixiStage.tsx        # MODIFY: mount runtime (Task 5), band layout + ResizeObserver (Task 8)
  TrackReadout.tsx     # CREATE: replaces Track.tsx as the accessible standings panel         (Task 7)
  Track.tsx            # DELETE                                                               (Task 7)
  GameView.tsx         # MODIFY: render TrackReadout (Task 7), portrait band padding (Task 8)
  PerfOverlay.tsx      # CREATE: dev-only ?perf=1 readout                                     (Task 8)
app/
  room/[code]/page.tsx # MODIFY: unmount stage at results + pass code (Task 5), PerfOverlay (Task 8)
tests/
  geometry.test.ts     # CREATE                                                               (Task 1)
  camera.test.ts       # CREATE                                                               (Task 2)
  framing.test.ts      # CREATE                                                               (Task 2)
  director.test.ts     # CREATE                                                               (Task 3)
  zones.test.ts        # CREATE                                                               (Task 4)
  worldDefinition.test.ts # CREATE: well-formedness of the night-race content                 (Task 4)
  perf.test.ts         # CREATE                                                               (Task 8)
e2e/
  world.spec.ts        # CREATE: portrait band strip vs full height                           (Task 8)
```

**Deliberately not created:** no `lib/world/index.ts` barrel (direct imports keep the dependency graph readable), and no test files for `render/**`, `runtime.ts`, or components — that boundary is stated in the Global Constraints and in spec §10.

---

### Task 1: World geometry

**Files:**
- Create: `lib/world/geometry.ts`
- Test: `tests/geometry.test.ts`

**Interfaces:**
- Consumes: nothing. (`Standing` from `lib/types.ts` is matched structurally, not imported, so the module stays decoupled from game types.)
- Produces:
  - `SEGMENT_WIDTH = 320`, `TRACK_MARGIN = 260`, `MARKER_ROW_HEIGHT = 74`, `HORIZON_FRACTION = 0.72`
  - `interface TrackMetrics { segments: number; length: number; minX: number; maxX: number }`
  - `interface Viewport { width: number; height: number }`
  - `interface CameraState { centerX: number; span: number }`
  - `interface AnchorStanding { player_id: string; correct: number; speed_points: number }`
  - `interface MarkerAnchor { playerId: string; x: number; y: number; row: number; segment: number }`
  - `trackMetrics(totalRounds: number): TrackMetrics`
  - `segmentToWorldX(segment: number): number`
  - `worldScale(camera: CameraState, viewport: Viewport): number`
  - `worldXToScreen(worldX: number, camera: CameraState, viewport: Viewport): number`
  - `horizonY(viewport: Viewport): number`
  - `markerAnchors(standings: readonly AnchorStanding[], metrics: TrackMetrics): MarkerAnchor[]`

- [ ] **Step 1: Write the failing test**

Create `tests/geometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  SEGMENT_WIDTH,
  TRACK_MARGIN,
  MARKER_ROW_HEIGHT,
  trackMetrics,
  segmentToWorldX,
  worldScale,
  worldXToScreen,
  horizonY,
  markerAnchors,
} from '@/lib/world/geometry';

describe('trackMetrics', () => {
  it('lays the track out from a question count', () => {
    expect(trackMetrics(12)).toEqual({
      segments: 12,
      length: 12 * SEGMENT_WIDTH,
      minX: -TRACK_MARGIN,
      maxX: 12 * SEGMENT_WIDTH + TRACK_MARGIN,
    });
  });

  it('supports a one-question game', () => {
    const m = trackMetrics(1);
    expect(m.segments).toBe(1);
    expect(m.length).toBe(SEGMENT_WIDTH);
  });

  it('clamps a zero or negative question count to one segment', () => {
    expect(trackMetrics(0).segments).toBe(1);
    expect(trackMetrics(-4).segments).toBe(1);
  });
});

describe('segmentToWorldX', () => {
  it('places segment 0 at the origin and scales linearly', () => {
    expect(segmentToWorldX(0)).toBe(0);
    expect(segmentToWorldX(3)).toBe(3 * SEGMENT_WIDTH);
  });
});

describe('screen transform', () => {
  const viewport = { width: 800, height: 400 };
  const camera = { centerX: 1000, span: 2000 };

  it('maps the camera centre to the middle of the viewport', () => {
    expect(worldXToScreen(1000, camera, viewport)).toBe(400);
  });

  it('maps world units to pixels through the visible span', () => {
    expect(worldScale(camera, viewport)).toBe(0.4);
    expect(worldXToScreen(0, camera, viewport)).toBe(0);
    expect(worldXToScreen(2000, camera, viewport)).toBe(800);
  });

  it('puts the horizon below the vertical middle', () => {
    expect(horizonY(viewport)).toBeCloseTo(288, 5);
  });
});

describe('markerAnchors', () => {
  const metrics = trackMetrics(10);

  it('places each player at their correct-answer segment', () => {
    const anchors = markerAnchors(
      [{ player_id: 'a', correct: 3, speed_points: 10 }],
      metrics,
    );
    expect(anchors[0]).toMatchObject({ playerId: 'a', segment: 3, row: 0, y: 0 });
    expect(anchors[0].x).toBe(3 * SEGMENT_WIDTH);
  });

  it('stacks players tied on a segment, highest speed points on the edge', () => {
    const anchors = markerAnchors(
      [
        { player_id: 'slow', correct: 2, speed_points: 40 },
        { player_id: 'fast', correct: 2, speed_points: 90 },
        { player_id: 'mid', correct: 2, speed_points: 65 },
      ],
      metrics,
    );
    expect(anchors.map(a => a.playerId)).toEqual(['slow', 'fast', 'mid']);
    const rows = Object.fromEntries(anchors.map(a => [a.playerId, a.row]));
    expect(rows).toEqual({ fast: 0, mid: 1, slow: 2 });
    expect(anchors.find(a => a.playerId === 'mid')!.y).toBe(-MARKER_ROW_HEIGHT);
  });

  it('keeps players on different segments in their own stacks', () => {
    const anchors = markerAnchors(
      [
        { player_id: 'a', correct: 1, speed_points: 10 },
        { player_id: 'b', correct: 4, speed_points: 10 },
      ],
      metrics,
    );
    expect(anchors.every(a => a.row === 0)).toBe(true);
  });

  it('clamps a correct count beyond the finish line onto the last segment', () => {
    const anchors = markerAnchors(
      [{ player_id: 'a', correct: 99, speed_points: 0 }],
      trackMetrics(6),
    );
    expect(anchors[0].segment).toBe(6);
    expect(anchors[0].x).toBe(6 * SEGMENT_WIDTH);
  });

  it('returns an empty list for no standings', () => {
    expect(markerAnchors([], metrics)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/geometry.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/world/geometry"`.

- [ ] **Step 3: Write the implementation**

Create `lib/world/geometry.ts`:

```ts
/**
 * World geometry — the only place track coordinate math lives (spec §4).
 *
 * Pure and framework-free: no Pixi, no React, no store. Everything downstream
 * (camera, framing, scene, markers) converts through these functions so there
 * is exactly one definition of where a segment sits.
 */

/** World units per track segment. One segment == one question. */
export const SEGMENT_WIDTH = 320;

/** Run-off in world units past the start and finish lines. */
export const TRACK_MARGIN = 260;

/** Vertical gap between markers stacked on the same segment. */
export const MARKER_ROW_HEIGHT = 74;

/** Ground line as a fraction of viewport height. */
export const HORIZON_FRACTION = 0.72;

export interface TrackMetrics {
  /** Question count, never below 1. */
  segments: number;
  /** World-unit distance from the start line to the finish line. */
  length: number;
  minX: number;
  maxX: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** Zoom is expressed as visible world span, which makes clamping obvious. */
export interface CameraState {
  centerX: number;
  span: number;
}

/** Structural subset of `Standing`; matched by shape so this module stays decoupled. */
export interface AnchorStanding {
  player_id: string;
  correct: number;
  speed_points: number;
}

export interface MarkerAnchor {
  playerId: string;
  /** World x of the segment this player occupies. */
  x: number;
  /** World y; 0 is the ground row, negative values stack upward. */
  y: number;
  /** 0 == edge-holder (highest speed points on this segment). */
  row: number;
  segment: number;
}

export function trackMetrics(totalRounds: number): TrackMetrics {
  const segments = Math.max(1, Math.floor(totalRounds));
  const length = segments * SEGMENT_WIDTH;
  return { segments, length, minX: -TRACK_MARGIN, maxX: length + TRACK_MARGIN };
}

export function segmentToWorldX(segment: number): number {
  return segment * SEGMENT_WIDTH;
}

/** Pixels per world unit. */
export function worldScale(camera: CameraState, viewport: Viewport): number {
  return viewport.width / camera.span;
}

export function worldXToScreen(worldX: number, camera: CameraState, viewport: Viewport): number {
  return viewport.width / 2 + (worldX - camera.centerX) * worldScale(camera, viewport);
}

export function horizonY(viewport: Viewport): number {
  return viewport.height * HORIZON_FRACTION;
}

/**
 * Marker placement. Players tied on a segment stack vertically, ordered by
 * speed points so row 0 holds the edge — PRD §6's tiebreak rule made visible.
 * (P2 puts the turbo-flame on row 0; P1 only establishes the ordering.)
 */
export function markerAnchors(
  standings: readonly AnchorStanding[],
  metrics: TrackMetrics,
): MarkerAnchor[] {
  const bySegment = new Map<number, AnchorStanding[]>();
  for (const s of standings) {
    const segment = Math.min(Math.max(0, s.correct), metrics.segments);
    const group = bySegment.get(segment) ?? [];
    group.push(s);
    bySegment.set(segment, group);
  }

  const rows = new Map<string, number>();
  for (const group of bySegment.values()) {
    // Stable: equal speed points keep standings order, which is already ranked.
    const ordered = [...group].sort((a, b) => b.speed_points - a.speed_points);
    ordered.forEach((s, index) => rows.set(s.player_id, index));
  }

  return standings.map(s => {
    const segment = Math.min(Math.max(0, s.correct), metrics.segments);
    const row = rows.get(s.player_id) ?? 0;
    return {
      playerId: s.player_id,
      x: segmentToWorldX(segment),
      y: -row * MARKER_ROW_HEIGHT,
      row,
      segment,
    };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/geometry.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Confirm nothing regressed and types are clean**

```bash
npm test
npx tsc --noEmit
```
Expected: the full suite (55 P0 tests + 11 new) passes; `tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add lib/world/geometry.ts tests/geometry.test.ts
git commit -m "feat(world): track geometry and marker anchors"
```

---

### Task 2: Camera math and framing

**Files:**
- Create: `lib/world/camera.ts`
- Create: `lib/world/framing.ts`
- Test: `tests/camera.test.ts`
- Test: `tests/framing.test.ts`

**Interfaces:**
- Consumes: `CameraState`, `TrackMetrics`, `Viewport`, `MarkerAnchor`, `SEGMENT_WIDTH`, `segmentToWorldX`, `worldScale` from Task 1; `EASE`, `DURATION` from `lib/presentation/tokens.ts`; `Profile` from `lib/presentation/profile.ts`.
- Produces:
  - From `camera.ts`: `MIN_SPAN_SEGMENTS = 2.5`, `MAX_SPAN_SEGMENTS = 14`, `type MoveStyle = 'cut' | 'drift'`, `interface CameraMove { from: CameraState; to: CameraState; startedAt: number; durationMs: number; ease: [number, number, number, number] }`, `spanLimits(metrics): { min: number; max: number }`, `clampCamera(state, metrics): CameraState`, `cubicBezierEase(curve, progress): number`, `beginMove(from, to, style, profile, now): CameraMove`, `sampleMove(move, now): CameraState`, `isMoveComplete(move, now): boolean`, `driftOffset(elapsedMs, camera, profile): number`
  - From `framing.ts`: `type FramingMode = 'startLine' | 'establishing' | 'pack' | 'emphasis'`, `interface FramingInput { anchors: readonly MarkerAnchor[]; metrics: TrackMetrics; viewport: Viewport; localPlayerId: string | null; emphasisIds: readonly string[] }`, `frameTarget(mode, input): CameraState`, `offscreenPlayerIds(anchors, camera, viewport): string[]`

- [ ] **Step 1: Write the failing camera test**

Create `tests/camera.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { EASE, DURATION } from '@/lib/presentation/tokens';
import { SEGMENT_WIDTH, trackMetrics } from '@/lib/world/geometry';
import {
  MAX_SPAN_SEGMENTS,
  MIN_SPAN_SEGMENTS,
  beginMove,
  clampCamera,
  cubicBezierEase,
  driftOffset,
  isMoveComplete,
  sampleMove,
  spanLimits,
} from '@/lib/world/camera';

describe('spanLimits', () => {
  it('caps the widest shot at the track length for a short game', () => {
    const limits = spanLimits(trackMetrics(8));
    expect(limits.max).toBe(8 * SEGMENT_WIDTH);
    expect(limits.min).toBe(MIN_SPAN_SEGMENTS * SEGMENT_WIDTH);
  });

  it('caps the widest shot at MAX_SPAN_SEGMENTS for a long game', () => {
    const limits = spanLimits(trackMetrics(40));
    expect(limits.max).toBe(MAX_SPAN_SEGMENTS * SEGMENT_WIDTH);
  });

  it('never lets min exceed max on a one-segment track', () => {
    const limits = spanLimits(trackMetrics(1));
    expect(limits.min).toBeLessThanOrEqual(limits.max);
  });
});

describe('clampCamera', () => {
  const metrics = trackMetrics(12);

  it('keeps the view inside the track bounds', () => {
    const clamped = clampCamera({ centerX: -9999, span: 4 * SEGMENT_WIDTH }, metrics);
    expect(clamped.centerX).toBe(metrics.minX + 2 * SEGMENT_WIDTH);
  });

  it('clamps the far edge too', () => {
    const clamped = clampCamera({ centerX: 99999, span: 4 * SEGMENT_WIDTH }, metrics);
    expect(clamped.centerX).toBe(metrics.maxX - 2 * SEGMENT_WIDTH);
  });

  it('clamps the span into its limits before centring', () => {
    const clamped = clampCamera({ centerX: 1000, span: 999999 }, metrics);
    expect(clamped.span).toBe(spanLimits(metrics).max);
  });

  it('centres the whole track when the span exceeds the bounds width', () => {
    const metricsShort = trackMetrics(1);
    const clamped = clampCamera({ centerX: 0, span: spanLimits(metricsShort).max }, metricsShort);
    expect(clamped.centerX).toBeCloseTo((metricsShort.minX + metricsShort.maxX) / 2, 5);
  });
});

describe('cubicBezierEase', () => {
  it('pins the endpoints', () => {
    expect(cubicBezierEase(EASE.drift, 0)).toBe(0);
    expect(cubicBezierEase(EASE.drift, 1)).toBe(1);
    expect(cubicBezierEase(EASE.drift, -0.5)).toBe(0);
    expect(cubicBezierEase(EASE.drift, 2)).toBe(1);
  });

  it('is monotonic for a non-overshooting curve', () => {
    let previous = 0;
    for (let p = 0.1; p <= 1; p += 0.1) {
      const value = cubicBezierEase(EASE.snap, p);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('overshoots past 1 for the settle curve', () => {
    const samples = Array.from({ length: 19 }, (_, i) => cubicBezierEase(EASE.settle, (i + 1) / 20));
    expect(Math.max(...samples)).toBeGreaterThan(1);
  });
});

describe('moves', () => {
  const metrics = trackMetrics(12);
  const from = clampCamera({ centerX: 500, span: 4 * SEGMENT_WIDTH }, metrics);
  const to = clampCamera({ centerX: 2500, span: 6 * SEGMENT_WIDTH }, metrics);

  it('uses the cut duration and snap curve for a cut', () => {
    const move = beginMove(from, to, 'cut', 'high', 1000);
    expect(move.durationMs).toBe(DURATION.cut);
    expect(move.ease).toEqual(EASE.snap);
  });

  it('uses the drift duration and drift curve for a drift', () => {
    const move = beginMove(from, to, 'drift', 'high', 1000);
    expect(move.durationMs).toBe(DURATION.drift);
    expect(move.ease).toEqual(EASE.drift);
  });

  it('collapses a drift to the cut duration under the reduced profile', () => {
    const move = beginMove(from, to, 'drift', 'reduced', 1000);
    expect(move.durationMs).toBe(DURATION.cut);
  });

  it('samples the start and the end exactly', () => {
    const move = beginMove(from, to, 'drift', 'high', 1000);
    expect(sampleMove(move, 1000)).toEqual(from);
    expect(sampleMove(move, 1000 + DURATION.drift)).toEqual(to);
    expect(sampleMove(move, 9_999_999)).toEqual(to);
  });

  it('moves partway through the middle of a move', () => {
    const move = beginMove(from, to, 'drift', 'high', 1000);
    const mid = sampleMove(move, 1000 + DURATION.drift / 2);
    expect(mid.centerX).toBeGreaterThan(from.centerX);
    expect(mid.centerX).toBeLessThan(to.centerX);
  });

  it('reports completion only after the duration elapses', () => {
    const move = beginMove(from, to, 'cut', 'high', 1000);
    expect(isMoveComplete(move, 1000 + DURATION.cut - 1)).toBe(false);
    expect(isMoveComplete(move, 1000 + DURATION.cut)).toBe(true);
  });
});

describe('driftOffset', () => {
  const camera = { centerX: 1000, span: 4 * SEGMENT_WIDTH };

  it('is zero under the reduced profile', () => {
    expect(driftOffset(1234, camera, 'reduced')).toBe(0);
  });

  it('stays small relative to the visible span under the high profile', () => {
    for (let t = 0; t < 20_000; t += 137) {
      expect(Math.abs(driftOffset(t, camera, 'high'))).toBeLessThanOrEqual(camera.span * 0.02);
    }
  });

  it('oscillates rather than drifting away', () => {
    const samples = Array.from({ length: 400 }, (_, i) => driftOffset(i * 100, camera, 'high'));
    expect(Math.min(...samples)).toBeLessThan(0);
    expect(Math.max(...samples)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/camera.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/world/camera"`.

- [ ] **Step 3: Write `camera.ts`**

Create `lib/world/camera.ts`:

```ts
/**
 * Camera math (spec §5). Pure — no Pixi, no clock of its own; `now` is passed in.
 *
 * Targets change on discrete cue boundaries rather than every frame, so camera
 * motion is a duration-driven tween on P0's named curves rather than a spring.
 */
import { DURATION, EASE } from '@/lib/presentation/tokens';
import type { Profile } from '@/lib/presentation/profile';
import { SEGMENT_WIDTH, type CameraState, type TrackMetrics } from './geometry';

/** Never push closer than this — markers stop reading as a field. */
export const MIN_SPAN_SEGMENTS = 2.5;

/** Legibility cap on the widest shot (spec §5, accepted edge). */
export const MAX_SPAN_SEGMENTS = 14;

const DRIFT_AMPLITUDE = 0.015;
const DRIFT_PERIOD_MS = 11_000;

export type MoveStyle = 'cut' | 'drift';

export interface CameraMove {
  from: CameraState;
  to: CameraState;
  startedAt: number;
  durationMs: number;
  ease: [number, number, number, number];
}

export function spanLimits(metrics: TrackMetrics): { min: number; max: number } {
  const max = Math.min(metrics.length, MAX_SPAN_SEGMENTS * SEGMENT_WIDTH);
  return { min: Math.min(MIN_SPAN_SEGMENTS * SEGMENT_WIDTH, max), max };
}

export function clampCamera(state: CameraState, metrics: TrackMetrics): CameraState {
  const limits = spanLimits(metrics);
  const span = Math.min(Math.max(state.span, limits.min), limits.max);
  const half = span / 2;
  const boundsWidth = metrics.maxX - metrics.minX;

  // A span wider than the bounds can't be clamped to an edge — centre it instead.
  if (span >= boundsWidth) {
    return { centerX: (metrics.minX + metrics.maxX) / 2, span };
  }

  const centerX = Math.min(Math.max(state.centerX, metrics.minX + half), metrics.maxX - half);
  return { centerX, span };
}

/** Cubic-bezier with implicit p0=(0,0) and p3=(1,1); Newton-Raphson on x. */
export function cubicBezierEase(
  [x1, y1, x2, y2]: readonly [number, number, number, number],
  progress: number,
): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;

  const curve = (a: number, b: number, t: number) => {
    const u = 1 - t;
    return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
  };

  let t = progress;
  for (let i = 0; i < 8; i++) {
    const error = curve(x1, x2, t) - progress;
    if (Math.abs(error) < 1e-5) break;
    const u = 1 - t;
    const slope = 3 * u * u * x1 + 6 * u * t * (x2 - x1) + 3 * t * t * (1 - x2);
    if (Math.abs(slope) < 1e-6) break;
    t = Math.min(1, Math.max(0, t - error / slope));
  }

  return curve(y1, y2, t);
}

export function beginMove(
  from: CameraState,
  to: CameraState,
  style: MoveStyle,
  profile: Profile,
  now: number,
): CameraMove {
  // The reduced profile keeps cuts as cuts and shortens drifts to the same
  // length, so the camera still arrives but never lingers in motion.
  const isCut = style === 'cut' || profile === 'reduced';
  return {
    from,
    to,
    startedAt: now,
    durationMs: isCut ? DURATION.cut : DURATION.drift,
    ease: isCut ? EASE.snap : EASE.drift,
  };
}

export function sampleMove(move: CameraMove, now: number): CameraState {
  const elapsed = now - move.startedAt;
  if (elapsed <= 0) return move.from;
  if (elapsed >= move.durationMs) return move.to;

  const eased = cubicBezierEase(move.ease, elapsed / move.durationMs);
  return {
    centerX: move.from.centerX + (move.to.centerX - move.from.centerX) * eased,
    span: move.from.span + (move.to.span - move.from.span) * eased,
  };
}

export function isMoveComplete(move: CameraMove, now: number): boolean {
  return now - move.startedAt >= move.durationMs;
}

/** Ambient breathing on the camera. High profile only (spec §9 ladder). */
export function driftOffset(elapsedMs: number, camera: CameraState, profile: Profile): number {
  if (profile === 'reduced') return 0;
  return Math.sin((elapsedMs / DRIFT_PERIOD_MS) * Math.PI * 2) * camera.span * DRIFT_AMPLITUDE;
}
```

- [ ] **Step 4: Run the camera test to verify it passes**

Run: `npx vitest run tests/camera.test.ts`
Expected: PASS — 16 tests.

- [ ] **Step 5: Write the failing framing test**

Create `tests/framing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SEGMENT_WIDTH, markerAnchors, trackMetrics, type MarkerAnchor } from '@/lib/world/geometry';
import { spanLimits } from '@/lib/world/camera';
import { frameTarget, offscreenPlayerIds, type FramingInput } from '@/lib/world/framing';

const viewport = { width: 1280, height: 720 };

function input(anchors: MarkerAnchor[], segments: number, overrides: Partial<FramingInput> = {}): FramingInput {
  return {
    anchors,
    metrics: trackMetrics(segments),
    viewport,
    localPlayerId: null,
    emphasisIds: [],
    ...overrides,
  };
}

function anchorsFor(pairs: [string, number][], segments: number): MarkerAnchor[] {
  return markerAnchors(
    pairs.map(([player_id, correct]) => ({ player_id, correct, speed_points: 0 })),
    trackMetrics(segments),
  );
}

describe('frameTarget', () => {
  it('parks at the start line for the lobby', () => {
    const target = frameTarget('startLine', input([], 12));
    expect(target.centerX).toBeLessThan(6 * SEGMENT_WIDTH);
    expect(target.span).toBeLessThanOrEqual(spanLimits(trackMetrics(12)).max);
  });

  it('shows the whole track when establishing a short game', () => {
    const target = frameTarget('establishing', input([], 8));
    expect(target.span).toBe(spanLimits(trackMetrics(8)).max);
  });

  it('falls back to establishing when there are no anchors', () => {
    expect(frameTarget('pack', input([], 10))).toEqual(frameTarget('establishing', input([], 10)));
  });

  it('frames the pack between last place and the leader', () => {
    const anchors = anchorsFor([['a', 2], ['b', 5]], 12);
    const target = frameTarget('pack', input(anchors, 12));
    expect(target.centerX).toBeCloseTo(3.5 * SEGMENT_WIDTH, 5);
    expect(target.span).toBeGreaterThan(3 * SEGMENT_WIDTH);
  });

  it('does not push closer than the minimum span when everyone is tied', () => {
    const anchors = anchorsFor([['a', 4], ['b', 4], ['c', 4]], 12);
    const target = frameTarget('pack', input(anchors, 12));
    expect(target.span).toBeGreaterThanOrEqual(spanLimits(trackMetrics(12)).min);
  });

  it('keeps the local player in frame when the field outruns the max span', () => {
    const anchors = anchorsFor([['tail', 0], ['leader', 30]], 32);
    const target = frameTarget('pack', input(anchors, 32, { localPlayerId: 'tail' }));
    const limits = spanLimits(trackMetrics(32));
    expect(target.span).toBe(limits.max);
    const left = target.centerX - target.span / 2;
    const right = target.centerX + target.span / 2;
    expect(left).toBeLessThanOrEqual(0);
    expect(right).toBeGreaterThanOrEqual(0);
  });

  it('favours the leader when the field fits but is wide', () => {
    const anchors = anchorsFor([['tail', 0], ['leader', 30]], 32);
    const target = frameTarget('pack', input(anchors, 32, { localPlayerId: 'leader' }));
    const right = target.centerX + target.span / 2;
    expect(right).toBeGreaterThanOrEqual(30 * SEGMENT_WIDTH);
  });

  it('pushes in tight on the players named for emphasis', () => {
    const anchors = anchorsFor([['a', 1], ['b', 2], ['c', 9]], 12);
    const target = frameTarget('emphasis', input(anchors, 12, { emphasisIds: ['a', 'b'] }));
    expect(target.span).toBeLessThan(frameTarget('pack', input(anchors, 12)).span);
    expect(target.centerX).toBeCloseTo(1.5 * SEGMENT_WIDTH, 5);
  });

  it('falls back to the pack shot when the emphasised ids are unknown', () => {
    const anchors = anchorsFor([['a', 1], ['b', 2]], 12);
    expect(frameTarget('emphasis', input(anchors, 12, { emphasisIds: ['ghost'] })))
      .toEqual(frameTarget('pack', input(anchors, 12)));
  });

  it('produces the same shot regardless of viewport aspect', () => {
    const anchors = anchorsFor([['a', 2], ['b', 5]], 12);
    const wide = frameTarget('pack', input(anchors, 12));
    const tall = frameTarget('pack', input(anchors, 12, { viewport: { width: 390, height: 844 } }));
    expect(tall).toEqual(wide);
  });

  it('always returns a camera inside the track bounds', () => {
    for (const segments of [1, 2, 12, 40]) {
      for (const mode of ['startLine', 'establishing', 'pack', 'emphasis'] as const) {
        const anchors = anchorsFor([['a', 0], ['b', segments]], segments);
        const target = frameTarget(mode, input(anchors, segments, { emphasisIds: ['a'] }));
        const metrics = trackMetrics(segments);
        expect(target.span).toBeLessThanOrEqual(spanLimits(metrics).max);
        expect(target.centerX).toBeGreaterThanOrEqual(metrics.minX);
        expect(target.centerX).toBeLessThanOrEqual(metrics.maxX);
      }
    }
  });
});

describe('offscreenPlayerIds', () => {
  it('reports nobody when everyone fits', () => {
    const anchors = anchorsFor([['a', 2], ['b', 4]], 12);
    const camera = frameTarget('pack', input(anchors, 12));
    expect(offscreenPlayerIds(anchors, camera, viewport)).toEqual([]);
  });

  it('reports players outside the visible span', () => {
    const anchors = anchorsFor([['tail', 0], ['leader', 30]], 32);
    const camera = frameTarget('pack', input(anchors, 32, { localPlayerId: 'leader' }));
    expect(offscreenPlayerIds(anchors, camera, viewport)).toContain('tail');
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/framing.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/world/framing"`.

- [ ] **Step 7: Write `framing.ts`**

Create `lib/world/framing.ts`:

```ts
/**
 * Framing (spec §5) — turns marker positions into a camera target.
 *
 * Pure. Deliberately independent of viewport aspect: the shot is chosen in
 * world units, and layout decides how tall the window showing it is.
 */
import {
  SEGMENT_WIDTH,
  segmentToWorldX,
  worldXToScreen,
  type CameraState,
  type MarkerAnchor,
  type TrackMetrics,
  type Viewport,
} from './geometry';
import { clampCamera, spanLimits } from './camera';

export type FramingMode = 'startLine' | 'establishing' | 'pack' | 'emphasis';

export interface FramingInput {
  anchors: readonly MarkerAnchor[];
  metrics: TrackMetrics;
  viewport: Viewport;
  /** Never dropped from frame when the field can't all fit. */
  localPlayerId: string | null;
  emphasisIds: readonly string[];
}

/** Breathing room on each side of the framed group, in world units. */
const PACK_PADDING = SEGMENT_WIDTH * 0.9;
const EMPHASIS_PADDING = SEGMENT_WIDTH * 0.6;
const START_LINE_SEGMENTS = 5;

/** Where the leader sits across the frame when the field overflows: 0.5 == centre. */
const LEADER_BIAS = 0.8;

export function frameTarget(mode: FramingMode, input: FramingInput): CameraState {
  const { metrics } = input;

  switch (mode) {
    case 'startLine':
      return clampCamera(
        { centerX: segmentToWorldX(0), span: START_LINE_SEGMENTS * SEGMENT_WIDTH },
        metrics,
      );

    case 'establishing':
      return clampCamera({ centerX: metrics.length / 2, span: metrics.length }, metrics);

    case 'emphasis': {
      const named = input.anchors.filter(a => input.emphasisIds.includes(a.playerId));
      if (named.length === 0) return frameTarget('pack', input);
      return fit(named, EMPHASIS_PADDING, input);
    }

    case 'pack':
    default: {
      if (input.anchors.length === 0) return frameTarget('establishing', input);
      return fit(input.anchors, PACK_PADDING, input);
    }
  }
}

function fit(group: readonly MarkerAnchor[], padding: number, input: FramingInput): CameraState {
  const { metrics } = input;
  const limits = spanLimits(metrics);
  const xs = group.map(a => a.x);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const needed = hi - lo + padding * 2;

  if (needed <= limits.max) {
    return clampCamera({ centerX: (lo + hi) / 2, span: needed }, metrics);
  }

  // Overflow: hold the leader near the front of the frame, then pull back if
  // that would drop the local player. The local player is never dropped; the
  // leader may be, and gets a chevron in the readout instead.
  const span = limits.max;
  let centerX = hi - span * (LEADER_BIAS - 0.5);

  const local = input.localPlayerId
    ? group.find(a => a.playerId === input.localPlayerId)
    : undefined;
  if (local && local.x < centerX - span / 2 + padding) {
    centerX = local.x + span / 2 - padding;
  }

  return clampCamera({ centerX, span }, metrics);
}

/** Players the camera can't include — the readout renders these as chevrons. */
export function offscreenPlayerIds(
  anchors: readonly MarkerAnchor[],
  camera: CameraState,
  viewport: Viewport,
): string[] {
  return anchors
    .filter(a => {
      const x = worldXToScreen(a.x, camera, viewport);
      return x < 0 || x > viewport.width;
    })
    .map(a => a.playerId);
}
```

- [ ] **Step 8: Run the framing test to verify it passes**

Run: `npx vitest run tests/framing.test.ts`
Expected: PASS — 13 tests.

- [ ] **Step 9: Confirm the whole suite and types**

```bash
npm test
npx tsc --noEmit
```
Expected: 55 P0 + 11 (Task 1) + 16 + 13 = 95 tests passing; `tsc` clean.

- [ ] **Step 10: Commit**

```bash
git add lib/world/camera.ts lib/world/framing.ts tests/camera.test.ts tests/framing.test.ts
git commit -m "feat(world): camera math and pack framing"
```

---

### Task 3: The director — cues to camera intents

**Files:**
- Create: `lib/world/director.ts`
- Test: `tests/director.test.ts`

**Interfaces:**
- Consumes: `Cue` from `lib/presentation/cues.ts`; `CelebrationTier`, `tierRank` from `lib/presentation/celebration.ts`; `FramingMode` from Task 2's `framing.ts`; `MoveStyle` from Task 2's `camera.ts`.
- Produces:
  - `interface CameraIntent { mode: FramingMode; style: MoveStyle; tier: CelebrationTier; emphasisIds: readonly string[] }`
  - `interface DirectorState { base: CameraIntent; transient: TransientIntent | null; escalation: number }`
  - `interface TransientIntent extends CameraIntent { expiresAt: number }`
  - `initialDirectorState: DirectorState`
  - `seedDirector(phase: Phase): DirectorState`
  - `reduceCue(state: DirectorState, cue: Cue, now: number): DirectorState`
  - `tickDirector(state: DirectorState, now: number): DirectorState`
  - `activeIntent(state: DirectorState): CameraIntent`
  - `OVERTAKE_HOLD_MS = 1200`, `FINAL_QUESTION_HOLD_MS = 2000`

- [ ] **Step 1: Write the failing test**

Create `tests/director.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Cue } from '@/lib/presentation/cues';
import {
  FINAL_QUESTION_HOLD_MS,
  OVERTAKE_HOLD_MS,
  activeIntent,
  initialDirectorState,
  reduceCue,
  seedDirector,
  tickDirector,
} from '@/lib/world/director';

const read = (round: number, isFinal: boolean): Cue => ({
  type: 'phase-read',
  tier: 'routine',
  round,
  category: 'Corporate Survival',
  questionTier: 2,
  isFinal,
});

const overtake: Cue = { type: 'overtake', tier: 'overtake', playerId: 'a', passed: ['b', 'c'] };

describe('base intents', () => {
  it('starts parked at the start line', () => {
    expect(activeIntent(initialDirectorState).mode).toBe('startLine');
  });

  it('establishes on the countdown', () => {
    const state = reduceCue(initialDirectorState, { type: 'phase-countdown', tier: 'routine', endsAt: null }, 0);
    expect(activeIntent(state)).toMatchObject({ mode: 'establishing', style: 'drift' });
  });

  it('frames the pack while reading and answering', () => {
    let state = reduceCue(initialDirectorState, read(3, false), 0);
    expect(activeIntent(state).mode).toBe('pack');
    state = reduceCue(state, { type: 'phase-answer', tier: 'routine', round: 3, endsAt: null }, 0);
    expect(activeIntent(state)).toMatchObject({ mode: 'pack', style: 'drift' });
  });

  it('cuts to the pack at the track moment', () => {
    const state = reduceCue(initialDirectorState, { type: 'phase-track', tier: 'routine', round: 3 }, 0);
    expect(activeIntent(state)).toMatchObject({ mode: 'pack', style: 'cut' });
  });

  it('holds the base mode through the reveal', () => {
    const answering = reduceCue(initialDirectorState, { type: 'phase-answer', tier: 'routine', round: 3, endsAt: null }, 0);
    const revealing = reduceCue(answering, {
      type: 'phase-reveal', tier: 'routine', round: 3, correctIndex: 1, counts: [], fastest: null,
    }, 0);
    expect(activeIntent(revealing)).toEqual(activeIntent(answering));
  });

  it('seeds a base intent from a phase, for a mid-game reload', () => {
    expect(activeIntent(seedDirector('answer')).mode).toBe('pack');
    expect(activeIntent(seedDirector('lobby')).mode).toBe('startLine');
    expect(activeIntent(seedDirector('countdown')).mode).toBe('establishing');
  });
});

describe('transients and preemption', () => {
  it('punches in on an overtake and releases back to the base', () => {
    const base = reduceCue(initialDirectorState, { type: 'phase-answer', tier: 'routine', round: 3, endsAt: null }, 0);
    const punched = reduceCue(base, overtake, 1000);
    expect(activeIntent(punched)).toMatchObject({
      mode: 'emphasis',
      style: 'cut',
      tier: 'overtake',
      emphasisIds: ['a', 'b', 'c'],
    });

    const during = tickDirector(punched, 1000 + OVERTAKE_HOLD_MS - 1);
    expect(activeIntent(during).mode).toBe('emphasis');

    const after = tickDirector(punched, 1000 + OVERTAKE_HOLD_MS);
    expect(activeIntent(after)).toEqual(activeIntent(base));
  });

  it('emphasises both players on a lead change', () => {
    const state = reduceCue(initialDirectorState, {
      type: 'lead-changed', tier: 'overtake', playerId: 'new', previousLeaderId: 'old',
    }, 0);
    expect(activeIntent(state).emphasisIds).toEqual(['new', 'old']);
  });

  it('lets a higher tier preempt a live transient', () => {
    const punched = reduceCue(initialDirectorState, overtake, 0);
    const escalated = reduceCue(punched, { type: 'final-question', tier: 'finalQuestion', round: 12 }, 100);
    expect(activeIntent(escalated).tier).toBe('finalQuestion');
  });

  it('does not let an equal-or-lower tier cut a live transient short', () => {
    const escalated = reduceCue(initialDirectorState, { type: 'final-question', tier: 'finalQuestion', round: 12 }, 0);
    const attempted = reduceCue(escalated, overtake, 100);
    expect(activeIntent(attempted).tier).toBe('finalQuestion');
    expect(attempted.transient!.expiresAt).toBe(FINAL_QUESTION_HOLD_MS);
  });

  it('accepts a new transient once the previous one has expired', () => {
    const escalated = reduceCue(initialDirectorState, { type: 'final-question', tier: 'finalQuestion', round: 12 }, 0);
    const later = reduceCue(escalated, overtake, FINAL_QUESTION_HOLD_MS + 1);
    expect(activeIntent(later).tier).toBe('overtake');
  });

  it('a base cue does not clear a live transient', () => {
    const punched = reduceCue(initialDirectorState, overtake, 0);
    const next = reduceCue(punched, { type: 'phase-answer', tier: 'routine', round: 3, endsAt: null }, 100);
    expect(activeIntent(next).mode).toBe('emphasis');
    expect(activeIntent(tickDirector(next, OVERTAKE_HOLD_MS)).mode).toBe('pack');
  });
});

describe('escalation', () => {
  it('is zero for an ordinary question', () => {
    expect(reduceCue(initialDirectorState, read(3, false), 0).escalation).toBe(0);
  });

  it('rises for the final question and pushes in slowly', () => {
    const state = reduceCue(initialDirectorState, { type: 'final-question', tier: 'finalQuestion', round: 12 }, 0);
    expect(state.escalation).toBe(1);
    expect(activeIntent(state)).toMatchObject({ mode: 'pack', style: 'drift' });
  });

  it('resets when a non-final question is read', () => {
    const escalated = reduceCue(initialDirectorState, { type: 'final-question', tier: 'finalQuestion', round: 12 }, 0);
    expect(reduceCue(escalated, read(1, false), 5000).escalation).toBe(0);
  });
});

describe('ignored cues', () => {
  it('leaves the state untouched for cues later phases own', () => {
    const base = reduceCue(initialDirectorState, read(3, false), 0);
    const ignored: Cue[] = [
      { type: 'streak-tier', tier: 'streakMilestone', playerId: 'a', streak: 5 },
      { type: 'streak-broken', tier: 'routine', playerId: 'a' },
      { type: 'answer-locked', tier: 'routine', choiceIndex: 2 },
      { type: 'player-advanced', tier: 'routine', playerId: 'a', from: 1, to: 2 },
      { type: 'player-joined', tier: 'routine', playerId: 'a', nickname: 'A', avatar: 'duck', color: '#fff' },
      { type: 'phase-results', tier: 'routine' },
      { type: 'podium', tier: 'victory', top: [] },
    ];
    for (const cue of ignored) expect(reduceCue(base, cue, 500)).toBe(base);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/director.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/world/director"`.

- [ ] **Step 3: Write the implementation**

Create `lib/world/director.ts`:

```ts
/**
 * Camera direction (spec §5) — the pure reducer that turns P0 cues into camera
 * intents. This is where the celebration hierarchy is enforced on the camera:
 * a transient shot preempts a live one only if its tier is strictly higher.
 *
 * P1 consumes the P0 cue vocabulary and adds nothing to it (ADR-0001).
 */
import { tierRank, type CelebrationTier } from '@/lib/presentation/celebration';
import type { Cue } from '@/lib/presentation/cues';
import type { Phase } from '@/lib/types';
import type { MoveStyle } from './camera';
import type { FramingMode } from './framing';

export const OVERTAKE_HOLD_MS = 1200;
export const FINAL_QUESTION_HOLD_MS = 2000;

export interface CameraIntent {
  mode: FramingMode;
  style: MoveStyle;
  tier: CelebrationTier;
  emphasisIds: readonly string[];
}

export interface TransientIntent extends CameraIntent {
  expiresAt: number;
}

export interface DirectorState {
  base: CameraIntent;
  transient: TransientIntent | null;
  /** 0..1; 1 during the final question. Drives the grade, not the camera. */
  escalation: number;
}

const intent = (
  mode: FramingMode,
  style: MoveStyle,
  tier: CelebrationTier = 'routine',
  emphasisIds: readonly string[] = [],
): CameraIntent => ({ mode, style, tier, emphasisIds });

const BASE_BY_PHASE: Record<Phase, CameraIntent> = {
  lobby: intent('startLine', 'drift'),
  countdown: intent('establishing', 'drift'),
  read: intent('pack', 'drift'),
  answer: intent('pack', 'drift'),
  // The reveal holds whatever shot the answer phase left; see reduceCue.
  reveal: intent('pack', 'drift'),
  track: intent('pack', 'cut'),
  results: intent('establishing', 'drift'),
};

export const initialDirectorState: DirectorState = {
  base: BASE_BY_PHASE.lobby,
  transient: null,
  escalation: 0,
};

/** Base intent for a client that joined or reloaded mid-game. */
export function seedDirector(phase: Phase): DirectorState {
  return { ...initialDirectorState, base: BASE_BY_PHASE[phase] };
}

export function reduceCue(state: DirectorState, cue: Cue, now: number): DirectorState {
  switch (cue.type) {
    case 'phase-countdown':
      return { ...state, base: BASE_BY_PHASE.countdown, escalation: 0 };

    case 'phase-read':
      return {
        ...state,
        base: BASE_BY_PHASE.read,
        // `final-question` arrives alongside this cue and sets escalation to 1.
        escalation: cue.isFinal ? state.escalation : 0,
      };

    case 'phase-answer':
      return { ...state, base: BASE_BY_PHASE.answer };

    case 'phase-track':
      return { ...state, base: BASE_BY_PHASE.track };

    case 'final-question':
      return {
        ...withTransient(state, intent('pack', 'drift', 'finalQuestion'), FINAL_QUESTION_HOLD_MS, now),
        escalation: 1,
      };

    case 'overtake':
      return withTransient(
        state,
        intent('emphasis', 'cut', 'overtake', [cue.playerId, ...cue.passed]),
        OVERTAKE_HOLD_MS,
        now,
      );

    case 'lead-changed':
      return withTransient(
        state,
        intent('emphasis', 'cut', 'overtake', [cue.playerId, cue.previousLeaderId]),
        OVERTAKE_HOLD_MS,
        now,
      );

    // `phase-reveal` deliberately holds the current shot. Everything else in
    // the P0 vocabulary belongs to a later phase (spec §5).
    default:
      return state;
  }
}

function withTransient(
  state: DirectorState,
  next: CameraIntent,
  holdMs: number,
  now: number,
): DirectorState {
  const live = state.transient && state.transient.expiresAt > now ? state.transient : null;
  if (live && tierRank(next.tier) <= tierRank(live.tier)) return state;
  return { ...state, transient: { ...next, expiresAt: now + holdMs } };
}

/** Drops an expired transient so the camera returns to its base shot. */
export function tickDirector(state: DirectorState, now: number): DirectorState {
  if (!state.transient || state.transient.expiresAt > now) return state;
  return { ...state, transient: null };
}

export function activeIntent(state: DirectorState): CameraIntent {
  return state.transient ?? state.base;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/director.test.ts`
Expected: PASS — 15 tests.

Note on the `a base cue does not clear a live transient` case: `activeIntent` prefers `transient` while it lives, and `tickDirector` is what drops it. `reduceCue` never clears a transient early — only a strictly higher tier replaces it.

- [ ] **Step 5: Confirm the suite and types**

```bash
npm test
npx tsc --noEmit
```
Expected: 110 tests passing; `tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add lib/world/director.ts tests/director.test.ts
git commit -m "feat(world): cue-driven camera director with tier preemption"
```

---

### Task 4: Zones, grade, and the night-race world definition

**Files:**
- Create: `lib/world/zones.ts`
- Create: `lib/world/definition.ts`
- Create: `lib/world/content/nightRace.ts`
- Test: `tests/zones.test.ts`
- Test: `tests/worldDefinition.test.ts`

**Interfaces:**
- Consumes: `TrackMetrics` from Task 1; `COLOR` from `lib/presentation/tokens.ts`; `Profile` from `lib/presentation/profile.ts`.
- Produces:
  - From `zones.ts`: `type ZoneId = 'officePark' | 'neonCity' | 'stadium'`, `ZONE_ORDER: readonly ZoneId[]`, `ZONE_OVERLAP = 0.12`, `type ZoneWeights = Record<ZoneId, number>`, `zoneWeights(worldX, metrics): ZoneWeights`, `quantizeZoneWeights(weights): ZoneWeights`, `interface GradeState { intensity: number; hue: 'neutral' | 'neon' }`, `gradeState(progress, escalation): GradeState`
  - From `definition.ts`: `type LayerTier = 'core' | 'rich'`, `interface LayerDrawContext { width: number; height: number; color: typeof COLOR }`, `interface AmbientSpec { kind: 'flicker' | 'pulse' | 'sweep'; periodMs: number; amount: number }`, `interface LayerSpec { id: string; parallax: number; repeatWidth: number; height: number; anchorY: number; layerTier: LayerTier; draw(g: Graphics, ctx: LayerDrawContext): void; ambient?: AmbientSpec }`, `interface ZoneSpec { id: ZoneId; skyTop: number; skyBottom: number; layers: LayerSpec[] }`, `interface WorldDefinition { id: string; zones: ZoneSpec[]; road: { surface: number; edge: number; tick: number; finish: number } }`, `layersForProfile(zone, profile): LayerSpec[]`
  - From `content/nightRace.ts`: `NIGHT_RACE: WorldDefinition`

- [ ] **Step 1: Write the failing zones test**

Create `tests/zones.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { trackMetrics } from '@/lib/world/geometry';
import { ZONE_ORDER, gradeState, quantizeZoneWeights, zoneWeights } from '@/lib/world/zones';

const metrics = trackMetrics(12);
const at = (fraction: number) => zoneWeights(fraction * metrics.length, metrics);
const sum = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);

describe('zoneWeights', () => {
  it('names the three zones in track order', () => {
    expect(ZONE_ORDER).toEqual(['officePark', 'neonCity', 'stadium']);
  });

  it('always sums to one', () => {
    for (let f = -0.2; f <= 1.2; f += 0.02) expect(sum(at(f))).toBeCloseTo(1, 6);
  });

  it('is pure office park at the start line', () => {
    expect(at(0)).toEqual({ officePark: 1, neonCity: 0, stadium: 0 });
  });

  it('is pure stadium at the finish line', () => {
    expect(at(1)).toEqual({ officePark: 0, neonCity: 0, stadium: 1 });
  });

  it('clamps past the run-off at either end', () => {
    expect(at(-0.5)).toEqual(at(0));
    expect(at(1.5)).toEqual(at(1));
  });

  it('is pure neon city midway', () => {
    expect(at(0.5)).toEqual({ officePark: 0, neonCity: 1, stadium: 0 });
  });

  it('blends exactly half and half on each boundary', () => {
    const first = at(1 / 3);
    expect(first.officePark).toBeCloseTo(0.5, 6);
    expect(first.neonCity).toBeCloseTo(0.5, 6);

    const second = at(2 / 3);
    expect(second.neonCity).toBeCloseTo(0.5, 6);
    expect(second.stadium).toBeCloseTo(0.5, 6);
  });

  it('never mixes the first and last zone', () => {
    for (let f = 0; f <= 1; f += 0.01) {
      const w = at(f);
      expect(Math.min(w.officePark, w.stadium)).toBe(0);
    }
  });

  it('visits all three zones even on a one-question track', () => {
    const short = trackMetrics(1);
    expect(zoneWeights(0, short).officePark).toBe(1);
    expect(zoneWeights(short.length, short).stadium).toBe(1);
  });
});

describe('gradeState', () => {
  it('starts subdued and deepens across the game', () => {
    const start = gradeState(0, 0);
    const end = gradeState(1, 0);
    expect(start.intensity).toBeLessThan(end.intensity);
    expect(start.hue).toBe('neutral');
  });

  it('goes neon and near-maximum for the final question', () => {
    const final = gradeState(0.9, 1);
    expect(final.hue).toBe('neon');
    expect(final.intensity).toBeGreaterThan(gradeState(0.9, 0).intensity);
    expect(final.intensity).toBeLessThanOrEqual(1);
  });

  it('is monotonic in escalation', () => {
    let previous = -1;
    for (let e = 0; e <= 1; e += 0.1) {
      const value = gradeState(0.4, e).intensity;
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('clamps inputs outside 0..1', () => {
    expect(gradeState(-3, -3)).toEqual(gradeState(0, 0));
    expect(gradeState(9, 9)).toEqual(gradeState(1, 1));
  });
});

describe('quantizeZoneWeights', () => {
  it('collapses a blend to its dominant zone', () => {
    expect(quantizeZoneWeights({ officePark: 0.4, neonCity: 0.6, stadium: 0 }))
      .toEqual({ officePark: 0, neonCity: 1, stadium: 0 });
  });

  it('leaves an already-pure zone untouched', () => {
    const pure = { officePark: 0, neonCity: 0, stadium: 1 };
    expect(quantizeZoneWeights(pure)).toEqual(pure);
  });

  it('breaks an exact tie toward the earlier zone', () => {
    expect(quantizeZoneWeights({ officePark: 0.5, neonCity: 0.5, stadium: 0 }))
      .toEqual({ officePark: 1, neonCity: 0, stadium: 0 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/zones.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/world/zones"`.

- [ ] **Step 3: Write `zones.ts`**

Create `lib/world/zones.ts`:

```ts
/**
 * Spatial zone blending and the global mood grade (spec §6).
 *
 * Zones are laid end to end ALONG the track, so a stretched field can straddle
 * two of them. Ranges are proportional to track length, so a four-question game
 * still visits all three. The grade is deliberately separate from zone blending:
 * it is the single dial P3 turns for the final-question transformation.
 */
import type { TrackMetrics } from './geometry';

export type ZoneId = 'officePark' | 'neonCity' | 'stadium';

export const ZONE_ORDER: readonly ZoneId[] = ['officePark', 'neonCity', 'stadium'];

/** Crossfade band width, as a fraction of track length. */
export const ZONE_OVERLAP = 0.12;

export type ZoneWeights = Record<ZoneId, number>;

const BOUNDARIES = [1 / 3, 2 / 3];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function zoneWeights(worldX: number, metrics: TrackMetrics): ZoneWeights {
  const p = clamp01(worldX / metrics.length);
  const half = ZONE_OVERLAP / 2;
  const weights: ZoneWeights = { officePark: 0, neonCity: 0, stadium: 0 };

  for (const [index, boundary] of BOUNDARIES.entries()) {
    if (p >= boundary - half && p <= boundary + half) {
      const t = (p - (boundary - half)) / (half * 2);
      weights[ZONE_ORDER[index]] = 1 - t;
      weights[ZONE_ORDER[index + 1]] = t;
      return weights;
    }
  }

  const zone = p < BOUNDARIES[0] ? ZONE_ORDER[0] : p < BOUNDARIES[1] ? ZONE_ORDER[1] : ZONE_ORDER[2];
  weights[zone] = 1;
  return weights;
}

export interface GradeState {
  /** 0..1 overlay strength. */
  intensity: number;
  hue: 'neutral' | 'neon';
}

const GRADE_FLOOR = 0.22;
const GRADE_RANGE = 0.38;
const GRADE_PEAK = 0.92;

/**
 * @param progress   0..1 through the game (round / total_rounds)
 * @param escalation 0..1 from the director; 1 during the final question
 */
export function gradeState(progress: number, escalation: number): GradeState {
  const p = clamp01(progress);
  const e = clamp01(escalation);
  const base = GRADE_FLOOR + GRADE_RANGE * p;
  return { intensity: base + (GRADE_PEAK - base) * e, hue: e > 0 ? 'neon' : 'neutral' };
}

/**
 * Reduced profile: collapse a crossfade to a hard switch at the boundary, so
 * only one zone's layers ever draw (spec §9 ladder). Ties go to the earlier
 * zone, which keeps the switch stable as the camera creeps forward.
 */
export function quantizeZoneWeights(weights: ZoneWeights): ZoneWeights {
  let dominant: ZoneId = ZONE_ORDER[0];
  for (const zone of ZONE_ORDER) {
    if (weights[zone] > weights[dominant]) dominant = zone;
  }
  return { officePark: 0, neonCity: 0, stadium: 0, [dominant]: 1 };
}
```

- [ ] **Step 4: Run the zones test to verify it passes**

Run: `npx vitest run tests/zones.test.ts`
Expected: PASS — 16 tests.

- [ ] **Step 5: Write the failing world-definition test**

This is the guard that keeps the content module honest — it is what makes "quality is data, not construction flags" (spec decision 8) checkable.

Create `tests/worldDefinition.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { layersForProfile } from '@/lib/world/definition';
import { NIGHT_RACE } from '@/lib/world/content/nightRace';
import { ZONE_ORDER } from '@/lib/world/zones';

describe('the night-race world definition', () => {
  it('defines the three zones in track order', () => {
    expect(NIGHT_RACE.zones.map(z => z.id)).toEqual(ZONE_ORDER);
  });

  it('gives every zone five layers on the high profile', () => {
    for (const zone of NIGHT_RACE.zones) {
      expect(layersForProfile(zone, 'high')).toHaveLength(5);
    }
  });

  it('gives every zone exactly two layers on the reduced profile', () => {
    for (const zone of NIGHT_RACE.zones) {
      expect(layersForProfile(zone, 'reduced')).toHaveLength(2);
    }
  });

  it('keeps the reduced set as a subset of the high set', () => {
    for (const zone of NIGHT_RACE.zones) {
      const rich = layersForProfile(zone, 'high').map(l => l.id);
      for (const layer of layersForProfile(zone, 'reduced')) {
        expect(rich).toContain(layer.id);
      }
    }
  });

  it('orders layers back-to-front by parallax factor', () => {
    for (const zone of NIGHT_RACE.zones) {
      const factors = zone.layers.map(l => l.parallax);
      expect([...factors].sort((a, b) => a - b)).toEqual(factors);
    }
  });

  it('keeps parallax factors between the far sky and the ground', () => {
    for (const zone of NIGHT_RACE.zones) {
      for (const layer of zone.layers) {
        expect(layer.parallax).toBeGreaterThan(0);
        expect(layer.parallax).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives every layer a positive tile size and a draw function', () => {
    for (const zone of NIGHT_RACE.zones) {
      for (const layer of zone.layers) {
        expect(layer.repeatWidth).toBeGreaterThan(0);
        expect(layer.height).toBeGreaterThan(0);
        expect(typeof layer.draw).toBe('function');
      }
    }
  });

  it('uses unique layer ids within a zone', () => {
    for (const zone of NIGHT_RACE.zones) {
      expect(new Set(zone.layers.map(l => l.id)).size).toBe(zone.layers.length);
    }
  });

  it('only animates rich layers, so the reduced profile is static', () => {
    for (const zone of NIGHT_RACE.zones) {
      for (const layer of layersForProfile(zone, 'reduced')) {
        expect(layer.ambient).toBeUndefined();
      }
    }
  });

  it('gives every zone at least one ambient animator on the high profile', () => {
    for (const zone of NIGHT_RACE.zones) {
      expect(layersForProfile(zone, 'high').some(l => l.ambient)).toBe(true);
    }
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/worldDefinition.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/world/definition"`.

- [ ] **Step 7: Write `definition.ts`**

Note the `import type` on `Graphics` — a value import here would break the unit suite (Global Constraints).

Create `lib/world/definition.ts`:

```ts
/**
 * World-content types (spec §3, §6).
 *
 * A world is DATA: zones, layers, parallax factors, and draw functions. The
 * renderer knows how to draw a `WorldDefinition` and nothing about the night
 * race specifically — which is what makes the PRD §9 modular-bundle strategy
 * real rather than aspirational.
 *
 * Quality is expressed here as `layerTier`, not as renderer construction flags,
 * so P2's watchdog can change quality without destroying the canvas (decision 8).
 */
import type { Graphics } from 'pixi.js';
import type { Profile } from '@/lib/presentation/profile';
import { COLOR } from '@/lib/presentation/tokens';
import type { ZoneId } from './zones';

/** `core` renders on both profiles; `rich` is high-profile only. */
export type LayerTier = 'core' | 'rich';

export interface LayerDrawContext {
  /** Tile width in px — equal to the layer's `repeatWidth`. */
  width: number;
  height: number;
  color: typeof COLOR;
}

export interface AmbientSpec {
  kind: 'flicker' | 'pulse' | 'sweep';
  periodMs: number;
  /** Peak deviation, 0..1, applied to the layer's alpha or offset. */
  amount: number;
}

export interface LayerSpec {
  id: string;
  /** 0 -> pinned to the camera (far sky); 1 -> moves with the world (ground). */
  parallax: number;
  /** Width of one repeat tile, in world units. */
  repeatWidth: number;
  /** Tile height in px. */
  height: number;
  /** Vertical placement of the tile's bottom edge, as a fraction of the horizon. */
  anchorY: number;
  layerTier: LayerTier;
  draw(g: Graphics, ctx: LayerDrawContext): void;
  ambient?: AmbientSpec;
}

export interface ZoneSpec {
  id: ZoneId;
  skyTop: number;
  skyBottom: number;
  /** Ordered back to front by `parallax`. */
  layers: LayerSpec[];
}

export interface WorldDefinition {
  id: string;
  zones: ZoneSpec[];
  road: { surface: number; edge: number; tick: number; finish: number };
}

export function layersForProfile(zone: ZoneSpec, profile: Profile): LayerSpec[] {
  return profile === 'high' ? zone.layers : zone.layers.filter(l => l.layerTier === 'core');
}
```

- [ ] **Step 8: Write `content/nightRace.ts`**

Five layers per zone, exactly two of them `core`. Draw functions receive a `Graphics` and are called **once** at init to bake a `RenderTexture` (spec §6) — they must be deterministic, so use a seeded pseudo-random helper rather than `Math.random()`.

Create `lib/world/content/nightRace.ts`:

```ts
/**
 * The night-race world (PRD §8): office park -> neon city -> stadium.
 *
 * Every draw function runs ONCE at init to bake a tile texture; nothing here is
 * called per frame. Randomness is seeded so a tile looks the same on every
 * client and across reloads.
 */
import type { Graphics } from 'pixi.js';
import { COLOR } from '@/lib/presentation/tokens';
import type { LayerSpec, WorldDefinition, ZoneSpec } from '../definition';

/** Deterministic 0..1 sequence — a tiny LCG, seeded per layer. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function skyBand(g: Graphics, width: number, height: number, top: number, bottom: number): void {
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const color = mix(top, bottom, t);
    g.rect(0, (height * i) / steps, width, height / steps + 1).fill({ color });
  }
}

function mix(a: number, b: number, t: number): number {
  const ch = (v: number, shift: number) => (v >> shift) & 0xff;
  const r = Math.round(ch(a, 16) + (ch(b, 16) - ch(a, 16)) * t);
  const gr = Math.round(ch(a, 8) + (ch(b, 8) - ch(a, 8)) * t);
  const bl = Math.round(ch(a, 0) + (ch(b, 0) - ch(a, 0)) * t);
  return (r << 16) | (gr << 8) | bl;
}

/** Blocky skyline used by all three zones with different palettes and densities. */
function skyline(seed: number, fill: number, density: number, maxHeight: number) {
  return (g: Graphics, ctx: { width: number; height: number }): void => {
    const random = seeded(seed);
    let x = 0;
    while (x < ctx.width) {
      const w = 40 + random() * 70;
      const h = ctx.height * (0.35 + random() * maxHeight);
      g.rect(x, ctx.height - h, w, h).fill({ color: fill });
      if (random() < density) {
        // Lit windows, a fixed grid inside each block.
        for (let wy = ctx.height - h + 14; wy < ctx.height - 16; wy += 22) {
          for (let wx = x + 10; wx < x + w - 12; wx += 18) {
            if (random() < 0.45) {
              g.rect(wx, wy, 7, 10).fill({ color: COLOR.warning, alpha: 0.55 });
            }
          }
        }
      }
      x += w + 12 + random() * 26;
    }
  };
}

const officePark: ZoneSpec = {
  id: 'officePark',
  skyTop: COLOR.night,
  skyBottom: COLOR.dusk,
  layers: [
    {
      id: 'op-sky',
      parallax: 0.05,
      repeatWidth: 1600,
      height: 900,
      anchorY: 0,
      layerTier: 'core',
      draw: (g, ctx) => skyBand(g, ctx.width, ctx.height, COLOR.night, COLOR.dusk),
    },
    {
      id: 'op-hills',
      parallax: 0.18,
      repeatWidth: 1400,
      height: 320,
      anchorY: 0.62,
      layerTier: 'rich',
      draw: (g, ctx) => {
        const random = seeded(11);
        for (let x = -100; x < ctx.width + 100; x += 180) {
          const h = ctx.height * (0.45 + random() * 0.4);
          g.ellipse(x, ctx.height, 220, h).fill({ color: COLOR.abyss, alpha: 0.9 });
        }
      },
    },
    {
      id: 'op-blocks',
      parallax: 0.38,
      repeatWidth: 1200,
      height: 380,
      anchorY: 0.9,
      layerTier: 'core',
      draw: skyline(7, COLOR.abyss, 0.85, 0.35),
    },
    {
      id: 'op-windows',
      parallax: 0.38,
      repeatWidth: 1200,
      height: 380,
      anchorY: 0.9,
      layerTier: 'rich',
      draw: skyline(7013, COLOR.warning, 1, 0.3),
      ambient: { kind: 'flicker', periodMs: 5200, amount: 0.35 },
    },
    {
      id: 'op-carpark',
      parallax: 0.7,
      repeatWidth: 900,
      height: 160,
      anchorY: 1,
      layerTier: 'rich',
      draw: (g, ctx) => {
        const random = seeded(29);
        for (let x = 20; x < ctx.width - 40; x += 120) {
          g.rect(x, ctx.height - 44, 76, 30).fill({ color: COLOR.haze, alpha: 0.75 });
          g.rect(x + 24, ctx.height - 58, 30, 16).fill({ color: COLOR.haze, alpha: 0.6 });
          if (random() < 0.4) {
            g.circle(x + 88, ctx.height - 96, 5).fill({ color: COLOR.warning, alpha: 0.8 });
            g.rect(x + 86, ctx.height - 96, 4, 96).fill({ color: COLOR.haze, alpha: 0.5 });
          }
        }
      },
    },
  ],
};

const neonCity: ZoneSpec = {
  id: 'neonCity',
  skyTop: COLOR.void,
  skyBottom: COLOR.haze,
  layers: [
    {
      id: 'nc-sky',
      parallax: 0.05,
      repeatWidth: 1600,
      height: 900,
      anchorY: 0,
      layerTier: 'core',
      draw: (g, ctx) => skyBand(g, ctx.width, ctx.height, COLOR.void, COLOR.haze),
    },
    {
      id: 'nc-far',
      parallax: 0.2,
      repeatWidth: 1500,
      height: 520,
      anchorY: 0.8,
      layerTier: 'rich',
      draw: skyline(101, COLOR.abyss, 0.5, 0.55),
    },
    {
      id: 'nc-towers',
      parallax: 0.42,
      repeatWidth: 1300,
      height: 620,
      anchorY: 0.95,
      layerTier: 'core',
      draw: skyline(202, COLOR.night, 0.95, 0.6),
    },
    {
      id: 'nc-signs',
      parallax: 0.42,
      repeatWidth: 1300,
      height: 620,
      anchorY: 0.95,
      layerTier: 'rich',
      draw: (g, ctx) => {
        const random = seeded(303);
        const neons = [COLOR.neonCyan, COLOR.neonMagenta, COLOR.neonLime];
        for (let x = 40; x < ctx.width - 60; x += 150) {
          const color = neons[Math.floor(random() * neons.length)];
          const h = 24 + random() * 70;
          const y = ctx.height * (0.25 + random() * 0.4);
          g.rect(x, y, 12, h).fill({ color, alpha: 0.85 });
          g.rect(x - 5, y - 5, 22, h + 10).fill({ color, alpha: 0.18 });
        }
      },
      ambient: { kind: 'pulse', periodMs: 3400, amount: 0.28 },
    },
    {
      id: 'nc-barrier',
      parallax: 0.78,
      repeatWidth: 700,
      height: 140,
      anchorY: 1,
      layerTier: 'rich',
      draw: (g, ctx) => {
        for (let x = 0; x < ctx.width; x += 90) {
          g.rect(x, ctx.height - 40, 62, 26).fill({ color: COLOR.dusk });
          g.rect(x, ctx.height - 44, 62, 5).fill({ color: COLOR.neonCyan, alpha: 0.7 });
        }
      },
    },
  ],
};

const stadium: ZoneSpec = {
  id: 'stadium',
  skyTop: COLOR.abyss,
  skyBottom: COLOR.dusk,
  layers: [
    {
      id: 'st-sky',
      parallax: 0.05,
      repeatWidth: 1600,
      height: 900,
      anchorY: 0,
      layerTier: 'core',
      draw: (g, ctx) => skyBand(g, ctx.width, ctx.height, COLOR.abyss, COLOR.dusk),
    },
    {
      id: 'st-bowl',
      parallax: 0.24,
      repeatWidth: 1800,
      height: 560,
      anchorY: 0.92,
      layerTier: 'core',
      draw: (g, ctx) => {
        g.moveTo(0, ctx.height)
          .lineTo(ctx.width * 0.14, ctx.height * 0.3)
          .lineTo(ctx.width * 0.86, ctx.height * 0.3)
          .lineTo(ctx.width, ctx.height)
          .closePath()
          .fill({ color: COLOR.night });
        for (let y = ctx.height * 0.34; y < ctx.height * 0.92; y += 26) {
          g.rect(ctx.width * 0.16, y, ctx.width * 0.68, 12).fill({ color: COLOR.dusk, alpha: 0.8 });
        }
      },
    },
    {
      id: 'st-crowd',
      parallax: 0.24,
      repeatWidth: 1800,
      height: 560,
      anchorY: 0.92,
      layerTier: 'rich',
      draw: (g, ctx) => {
        const random = seeded(555);
        for (let y = ctx.height * 0.36; y < ctx.height * 0.9; y += 26) {
          for (let x = ctx.width * 0.17; x < ctx.width * 0.83; x += 13) {
            if (random() < 0.5) {
              g.circle(x, y + 6, 3.4).fill({ color: COLOR.gold, alpha: 0.14 + random() * 0.2 });
            }
          }
        }
      },
      ambient: { kind: 'flicker', periodMs: 2600, amount: 0.22 },
    },
    {
      id: 'st-floods',
      parallax: 0.36,
      repeatWidth: 900,
      height: 620,
      anchorY: 0.95,
      layerTier: 'rich',
      draw: (g, ctx) => {
        for (const x of [ctx.width * 0.2, ctx.width * 0.8]) {
          g.rect(x - 4, ctx.height * 0.16, 8, ctx.height * 0.5).fill({ color: COLOR.abyss });
          g.rect(x - 34, ctx.height * 0.1, 68, 22).fill({ color: COLOR.silver, alpha: 0.9 });
          g.moveTo(x - 34, ctx.height * 0.13)
            .lineTo(x - 150, ctx.height)
            .lineTo(x + 150, ctx.height)
            .lineTo(x + 34, ctx.height * 0.13)
            .closePath()
            .fill({ color: COLOR.silver, alpha: 0.07 });
        }
      },
      ambient: { kind: 'sweep', periodMs: 7200, amount: 0.4 },
    },
    {
      id: 'st-pitwall',
      parallax: 0.82,
      repeatWidth: 640,
      height: 150,
      anchorY: 1,
      layerTier: 'rich',
      draw: (g, ctx) => {
        for (let x = 0; x < ctx.width; x += 80) {
          g.rect(x, ctx.height - 46, 56, 32).fill({ color: COLOR.night });
          g.rect(x, ctx.height - 50, 56, 6).fill({ color: COLOR.gold, alpha: 0.75 });
        }
      },
    },
  ],
};

export const NIGHT_RACE: WorldDefinition = {
  id: 'night-race',
  zones: [officePark, neonCity, stadium],
  road: {
    surface: COLOR.abyss,
    edge: COLOR.haze,
    tick: COLOR.dusk,
    finish: COLOR.silver,
  },
};
```

Note on the palette: `COLOR` in `lib/presentation/tokens.ts` carries surfaces, neon accents, semantics and medals — there are **no** `ink` keys there (ink is CSS-only, for HTML text). Canvas code uses `COLOR.silver` where it wants bright neutral detail.

- [ ] **Step 9: Run the definition test to verify it passes**

Run: `npx vitest run tests/worldDefinition.test.ts`
Expected: PASS — 10 tests (running total 136). If the layer-count assertions fail, adjust the content (five layers per zone, exactly two `core`) rather than the test — the counts are the spec §9 ladder.

- [ ] **Step 10: Confirm the suite and types**

```bash
npm test
npx tsc --noEmit
```
Expected: 136 tests passing; `tsc` clean. `pixi.js` must appear only as `import type` in `definition.ts` and `content/nightRace.ts` — if the suite fails with a Pixi/WebGL error, a value import has crept in.

- [ ] **Step 11: Commit**

```bash
git add lib/world/zones.ts lib/world/definition.ts lib/world/content/nightRace.ts tests/zones.test.ts tests/worldDefinition.test.ts
git commit -m "feat(world): spatial zones, mood grade, and the night-race definition"
```

---

### Task 5: The scene renderer and a static mount

**Deliverable:** a real, visible world behind the game — correct track, correct zones, correct grade — framed by a camera that is computed but not yet cue-driven. Task 6 makes it move.

**Files:**
- Create: `lib/world/frame.ts`
- Create: `lib/world/render/ParallaxLayer.ts`
- Create: `lib/world/render/TrackSurface.ts`
- Create: `lib/world/render/Grade.ts`
- Create: `lib/world/render/WorldScene.ts`
- Modify: `components/PixiStage.tsx`
- Modify: `app/room/[code]/page.tsx:59`

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces:
  - From `frame.ts`: `interface WorldFrameState { camera: CameraState; viewport: Viewport; metrics: TrackMetrics; zones: ZoneWeights; grade: GradeState; anchors: readonly MarkerAnchor[]; localPlayerId: string | null; elapsedMs: number }`
  - From `WorldScene.ts`: `class WorldScene { constructor(app: Application, definition: WorldDefinition, profile: Profile); applyFrame(frame: WorldFrameState): void; destroy(): void }`
  - `PixiStage` gains a required `code: string` prop.

**No unit tests in this task** — these modules import Pixi at runtime (Global Constraints). Verification is the existing e2e canvas assertion plus screenshots.

- [ ] **Step 1: Write the frame-state type**

Create `lib/world/frame.ts`:

```ts
/**
 * The one-way seam between the runtime and the renderer (spec §3).
 *
 * `WorldScene` consumes this and nothing else — no store, no cue bus. That is
 * what lets P6's stage view be a second consumer with its own framing rather
 * than a second renderer.
 */
import type { CameraState, MarkerAnchor, TrackMetrics, Viewport } from './geometry';
import type { GradeState, ZoneWeights } from './zones';

export interface WorldFrameState {
  camera: CameraState;
  viewport: Viewport;
  metrics: TrackMetrics;
  /** Sampled at the camera centre — see the note in WorldScene. */
  zones: ZoneWeights;
  grade: GradeState;
  anchors: readonly MarkerAnchor[];
  /** Whose marker gets the "you" ring; null before the session is known. */
  localPlayerId: string | null;
  /** Milliseconds since the scene was created; drives ambient animation. */
  elapsedMs: number;
}
```

- [ ] **Step 2: Write `ParallaxLayer.ts`**

Create `lib/world/render/ParallaxLayer.ts`:

```ts
/**
 * One parallax layer: a tile baked ONCE into a RenderTexture, then only tiled
 * and translated (spec §6). No per-frame Graphics rebuilds — this is what keeps
 * the world at 60fps with procedural art, and keeps texture memory constant
 * regardless of track length.
 */
import { Application, Graphics, TilingSprite, type Texture } from 'pixi.js';
import { COLOR } from '@/lib/presentation/tokens';
import type { LayerSpec } from '../definition';
import { horizonY, worldScale, type CameraState, type Viewport } from '../geometry';

export class ParallaxLayer {
  readonly sprite: TilingSprite;
  private readonly texture: Texture;
  private readonly spec: LayerSpec;

  constructor(app: Application, spec: LayerSpec) {
    this.spec = spec;

    const g = new Graphics();
    spec.draw(g, { width: spec.repeatWidth, height: spec.height, color: COLOR });
    this.texture = app.renderer.generateTexture({
      target: g,
      // Bake at the tile's declared size so tiling never seams.
      frame: { x: 0, y: 0, width: spec.repeatWidth, height: spec.height },
    });
    g.destroy();

    this.sprite = new TilingSprite({ texture: this.texture, width: 1, height: spec.height });
  }

  /** @param weight zone blend weight, 0..1 */
  update(camera: CameraState, viewport: Viewport, weight: number, elapsedMs: number): void {
    const { spec } = this;
    this.sprite.visible = weight > 0.001;
    if (!this.sprite.visible) return;

    const scale = worldScale(camera, viewport);
    this.sprite.width = viewport.width;
    this.sprite.tileScale.set(scale);
    this.sprite.tilePosition.x = -camera.centerX * scale * spec.parallax;

    const ground = horizonY(viewport);
    this.sprite.y = ground * spec.anchorY - spec.height * scale;
    this.sprite.height = spec.height * scale;

    this.sprite.alpha = weight * this.ambientAlpha(elapsedMs);
    this.sprite.x = this.ambientOffsetX(elapsedMs, viewport);
  }

  private ambientAlpha(elapsedMs: number): number {
    const ambient = this.spec.ambient;
    if (!ambient || ambient.kind === 'sweep') return 1;
    const phase = Math.sin((elapsedMs / ambient.periodMs) * Math.PI * 2);
    return 1 - ambient.amount * 0.5 * (1 - phase);
  }

  private ambientOffsetX(elapsedMs: number, viewport: Viewport): number {
    const ambient = this.spec.ambient;
    if (!ambient || ambient.kind !== 'sweep') return 0;
    const phase = Math.sin((elapsedMs / ambient.periodMs) * Math.PI * 2);
    return phase * ambient.amount * viewport.width * 0.04;
  }

  destroy(): void {
    this.sprite.destroy();
    this.texture.destroy(true);
  }
}
```

- [ ] **Step 3: Write `TrackSurface.ts`**

Create `lib/world/render/TrackSurface.ts`:

```ts
/**
 * The road itself: surface band, one tick per segment, start and finish gates.
 *
 * Built once in WORLD space and thereafter only scaled and translated — the
 * segment count is fixed for the life of a room.
 */
import { Container, Graphics } from 'pixi.js';
import type { WorldDefinition } from '../definition';
import {
  MARKER_ROW_HEIGHT,
  horizonY,
  segmentToWorldX,
  worldScale,
  type CameraState,
  type TrackMetrics,
  type Viewport,
} from '../geometry';

const ROAD_DEPTH = 150;

export class TrackSurface {
  readonly container = new Container();

  constructor(definition: WorldDefinition, metrics: TrackMetrics) {
    const { road } = definition;
    const g = new Graphics();

    g.rect(metrics.minX, 0, metrics.maxX - metrics.minX, ROAD_DEPTH).fill({ color: road.surface });
    g.rect(metrics.minX, 0, metrics.maxX - metrics.minX, 5).fill({ color: road.edge });

    for (let segment = 0; segment <= metrics.segments; segment++) {
      const x = segmentToWorldX(segment);
      const isFinish = segment === metrics.segments;
      g.rect(x - 2, -MARKER_ROW_HEIGHT * 0.4, 4, ROAD_DEPTH + MARKER_ROW_HEIGHT * 0.4).fill({
        color: isFinish ? road.finish : road.tick,
        alpha: isFinish ? 0.95 : 0.35,
      });
    }

    // Chequered gate at the finish line.
    const finishX = segmentToWorldX(metrics.segments);
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 2; col++) {
        if ((row + col) % 2 === 0) continue;
        g.rect(finishX + col * 16 - 16, -170 + row * 26, 16, 26).fill({ color: road.finish, alpha: 0.9 });
      }
    }

    this.container.addChild(g);
  }

  update(camera: CameraState, viewport: Viewport): void {
    const scale = worldScale(camera, viewport);
    this.container.scale.set(scale);
    this.container.x = viewport.width / 2 - camera.centerX * scale;
    this.container.y = horizonY(viewport);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
```

- [ ] **Step 4: Write `Grade.ts`**

Create `lib/world/render/Grade.ts`:

```ts
/**
 * The global mood grade (spec §6): one full-screen overlay whose colour and
 * strength come from game progress plus escalation. Kept strictly separate from
 * zone blending — this is the dial P3 turns for the final question.
 */
import { Graphics } from 'pixi.js';
import { COLOR } from '@/lib/presentation/tokens';
import type { Profile } from '@/lib/presentation/profile';
import type { GradeState } from '../zones';
import type { Viewport } from '../geometry';

const GRADIENT_STEPS = 8;

export class Grade {
  readonly graphic = new Graphics();
  private lastKey = '';

  constructor(private readonly profile: Profile) {}

  update(grade: GradeState, viewport: Viewport): void {
    const key = `${grade.hue}:${grade.intensity.toFixed(3)}:${viewport.width}x${viewport.height}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const color = grade.hue === 'neon' ? COLOR.neonMagenta : COLOR.void;
    const peak = grade.intensity * (grade.hue === 'neon' ? 0.34 : 0.5);
    this.graphic.clear();

    // Ladder (spec §9): high gets a vignette-style gradient, reduced a flat tint.
    if (this.profile === 'reduced') {
      this.graphic.rect(0, 0, viewport.width, viewport.height).fill({ color, alpha: peak });
      return;
    }

    const band = viewport.height / GRADIENT_STEPS;
    for (let i = 0; i < GRADIENT_STEPS; i++) {
      // Heaviest at the top and bottom edges, lightest across the middle.
      const distance = Math.abs(i - (GRADIENT_STEPS - 1) / 2) / ((GRADIENT_STEPS - 1) / 2);
      this.graphic
        .rect(0, i * band, viewport.width, band + 1)
        .fill({ color, alpha: peak * (0.45 + 0.55 * distance) });
    }
  }

  destroy(): void {
    this.graphic.destroy();
  }
}
```

- [ ] **Step 5: Write `WorldScene.ts`**

Create `lib/world/render/WorldScene.ts`:

```ts
/**
 * The renderer (spec §3). Consumes a WorldDefinition and a per-frame
 * WorldFrameState; never reads the game store or the cue bus.
 *
 * Zone weights are sampled at the CAMERA CENTRE rather than per tile — a
 * deliberate simplification. Backdrop layers are wide and low-frequency, so a
 * single blend value reads as a smooth crossfade as the camera travels, at a
 * fraction of the cost of per-tile sampling.
 */
import { Application, Container, type Renderer } from 'pixi.js';
import type { Profile } from '@/lib/presentation/profile';
import { layersForProfile, type WorldDefinition } from '../definition';
import type { WorldFrameState } from '../frame';
import type { ZoneId } from '../zones';
import { Grade } from './Grade';
import { ParallaxLayer } from './ParallaxLayer';
import { TrackSurface } from './TrackSurface';

export class WorldScene {
  readonly root = new Container();
  private readonly backdrop = new Container();
  private readonly zoneLayers = new Map<ZoneId, ParallaxLayer[]>();
  private readonly grade: Grade;
  private track: TrackSurface | null = null;
  private trackSegments = -1;

  constructor(
    private readonly app: Application<Renderer>,
    private readonly definition: WorldDefinition,
    profile: Profile,
  ) {
    this.grade = new Grade(profile);
    this.root.addChild(this.backdrop);

    for (const zone of definition.zones) {
      const layers = layersForProfile(zone, profile).map(spec => new ParallaxLayer(app, spec));
      this.zoneLayers.set(zone.id, layers);
      for (const layer of layers) this.backdrop.addChild(layer.sprite);
    }

    this.root.addChild(this.grade.graphic);
    app.stage.addChild(this.root);
  }

  applyFrame(frame: WorldFrameState): void {
    for (const [zoneId, layers] of this.zoneLayers) {
      const weight = frame.zones[zoneId];
      for (const layer of layers) layer.update(frame.camera, frame.viewport, weight, frame.elapsedMs);
    }

    // The track is world content, so it must sit above the backdrop but below
    // the grade; rebuild only if the room's question count changed.
    if (this.trackSegments !== frame.metrics.segments) {
      this.track?.destroy();
      this.track = new TrackSurface(this.definition, frame.metrics);
      this.trackSegments = frame.metrics.segments;
      this.root.addChildAt(this.track.container, this.root.getChildIndex(this.grade.graphic));
    }
    this.track!.update(frame.camera, frame.viewport);

    this.grade.update(frame.grade, frame.viewport);
  }

  destroy(): void {
    for (const layers of this.zoneLayers.values()) for (const layer of layers) layer.destroy();
    this.zoneLayers.clear();
    this.track?.destroy();
    this.grade.destroy();
    this.app.stage.removeChild(this.root);
    this.root.destroy({ children: true });
  }
}
```

- [ ] **Step 6: Mount the scene from `PixiStage` with a static camera**

Replace the body of `components/PixiStage.tsx`. Keep the P0 lifecycle guarantees exactly: cancel flag for Strict Mode, dynamic import, `destroy` on teardown, `pointer-events: none`, `aria-hidden`, outside `<main>`.

```tsx
'use client';
import { useEffect, useRef } from 'react';
import { useSettings } from '@/lib/useSettings';
import { useGameStore } from '@/lib/store';
import { CANVAS } from '@/lib/presentation/tokens';
import { NIGHT_RACE } from '@/lib/world/content/nightRace';
import { markerAnchors, trackMetrics } from '@/lib/world/geometry';
import { clampCamera } from '@/lib/world/camera';
import { frameTarget } from '@/lib/world/framing';
import { gradeState, zoneWeights } from '@/lib/world/zones';

/**
 * Canvas lifecycle and layout. Pixi owns the world; HTML owns everything
 * readable and interactive (PRD §9), so accessibility never depends on canvas.
 *
 * P1 renders the world here with a camera framed from current standings.
 * Task 6 replaces the static framing below with the cue-driven runtime.
 */
export default function PixiStage({ code }: { code: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const hydrated = useSettings(s => s.hydrated);
  const profile = useSettings(s => s.profile);

  useEffect(() => {
    const host = hostRef.current;
    if (!hydrated || !host) return;

    let cancelled = false;
    let app: import('pixi.js').Application | null = null;
    let scene: import('@/lib/world/render/WorldScene').WorldScene | null = null;

    void (async () => {
      try {
        const { Application } = await import('pixi.js');
        const { WorldScene } = await import('@/lib/world/render/WorldScene');

        const instance = new Application();
        await instance.init({
          resizeTo: host,
          background: CANVAS.background,
          antialias: profile === 'high',
          resolution: Math.min(globalThis.devicePixelRatio || 1, CANVAS.maxResolution),
          autoDensity: true,
          preference: 'webgl',
        });

        if (cancelled) {
          instance.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
          return;
        }

        app = instance;
        scene = new WorldScene(instance, NIGHT_RACE, profile);
        host.appendChild(instance.canvas);

        const startedAt = performance.now();
        instance.ticker.add(() => {
          if (!scene) return;
          const { room, standings } = useGameStore.getState();
          const metrics = trackMetrics(room?.total_rounds ?? 12);
          const anchors = markerAnchors(standings ?? [], metrics);
          const viewport = { width: instance.screen.width, height: instance.screen.height };
          const camera = clampCamera(
            frameTarget(anchors.length > 0 ? 'pack' : 'establishing', {
              anchors, metrics, viewport, localPlayerId: null, emphasisIds: [],
            }),
            metrics,
          );
          const progress = room && room.total_rounds > 0 ? room.round / room.total_rounds : 0;
          scene.applyFrame({
            camera,
            viewport,
            metrics,
            zones: zoneWeights(camera.centerX, metrics),
            grade: gradeState(progress, 0),
            anchors,
            localPlayerId: null,
            elapsedMs: performance.now() - startedAt,
          });
        });
      } catch (error) {
        // A device with no usable WebGL context still gets the full HTML game.
        console.error('[PixiStage] failed to initialise the renderer', error);
      }
    })();

    return () => {
      cancelled = true;
      scene?.destroy();
      scene = null;
      if (app) {
        app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
        app = null;
      }
    };
  }, [hydrated, profile, code]);

  return (
    <div
      ref={hostRef}
      data-testid="pixi-stage"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
    />
  );
}
```

- [ ] **Step 7: Unmount the stage on the results screen and pass `code`**

In `app/room/[code]/page.tsx`, change line 59 from:

```tsx
      {room && <PixiStage />}
```

to:

```tsx
      {room && room.status !== 'finished' && <PixiStage code={code} />}
```

Spec decision 6: the world does not render on results in P1; P5 decides what the ceremony puts there.

- [ ] **Step 8: Verify the build and the regression floor**

```bash
npx tsc --noEmit
npm test
npm run build
npx playwright test
```
Expected: `tsc` clean; 136 unit tests pass; build succeeds; **14/14** e2e pass — including `game-flow.spec.ts`'s existing `[data-testid="pixi-stage"] canvas` assertion, now backed by a real scene.

- [ ] **Step 9: Visual smoke check**

With Supabase and the dev server up, drive a game with playwright-cli and screenshot the room during ANSWER and TRACK. Confirm by eye:
1. A road with one tick per question, and a chequered finish gate at the last tick.
2. A parallax backdrop that is clearly the office park early and clearly the stadium late.
3. Markers are absent — Task 7 adds them; the world alone is what this task delivers.
4. Switching Motion to `reduced` in the settings popover reloads the scene with visibly fewer backdrop layers and no ambient shimmer.

- [ ] **Step 10: Commit**

```bash
git add lib/world/frame.ts lib/world/render components/PixiStage.tsx "app/room/[code]/page.tsx"
git commit -m "feat(world): Pixi scene renderer with parallax zones, track, and grade"
```

---

### Task 6: The runtime — cues drive the camera

**Deliverable:** the camera establishes on countdown, frames the pack while reading and answering, cuts at the track moment, punches in on overtakes, and pushes in for the final question.

**Files:**
- Create: `lib/world/runtime.ts`
- Create: `lib/world/useWorldView.ts`
- Modify: `components/PixiStage.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–5; `on` from `lib/presentation/cueBus.ts`; `useGameStore` from `lib/store.ts`; `useSettings` is read by the caller, not here.
- Produces:
  - From `useWorldView.ts`: `interface WorldViewState { offscreenPlayerIds: string[]; setOffscreen(ids: string[]): void }`, `useWorldView`
  - From `runtime.ts`: `interface WorldRuntimeOptions { app: Application; scene: WorldScene; profile: Profile; localPlayerId: string | null }`, `createWorldRuntime(options): { destroy(): void }`

**Why this reads the store as well as the bus.** Cues carry *dramatic timing*; they deliberately do not carry positions (`player-advanced` has no speed points, so it cannot order a tied segment). Marker placement therefore reads `standings` and `room` from the store, exactly as `Track.tsx` does today and as P0's own `startCueBridge` does. ADR-0001's rule — the cue layer is the sole seam for **show timing** — is intact: no new event type, no new payload field.

- [ ] **Step 1: Write the world-view store**

Create `lib/world/useWorldView.ts`:

```ts
import { create } from 'zustand';

/**
 * Presentation state that flows the other way: from the canvas back to HTML.
 * Only what the readout genuinely cannot compute for itself — which players the
 * camera could not include (spec §5 overflow rule).
 */
export interface WorldViewState {
  offscreenPlayerIds: string[];
  setOffscreen(ids: string[]): void;
}

export const useWorldView = create<WorldViewState>(set => ({
  offscreenPlayerIds: [],
  setOffscreen(ids) {
    // Written every frame by the runtime — bail unless it actually changed,
    // or every React consumer re-renders at 60fps.
    set(state =>
      state.offscreenPlayerIds.length === ids.length &&
      state.offscreenPlayerIds.every((id, i) => id === ids[i])
        ? state
        : { offscreenPlayerIds: ids },
    );
  },
}));
```

- [ ] **Step 2: Write the runtime**

Create `lib/world/runtime.ts`:

```ts
/**
 * The world runtime (spec §3): the ONLY module wired to the cue bus.
 *
 * Owns the director and camera state, converts them into a WorldFrameState each
 * tick, and hands that to the scene. Not unit-tested by design — every decision
 * it makes lives in a pure module that is.
 */
import type { Application, Renderer } from 'pixi.js';
import { on } from '@/lib/presentation/cueBus';
import type { CueType } from '@/lib/presentation/cues';
import type { Profile } from '@/lib/presentation/profile';
import { useGameStore } from '@/lib/store';
import {
  beginMove,
  clampCamera,
  driftOffset,
  isMoveComplete,
  sampleMove,
  type CameraMove,
} from './camera';
import {
  activeIntent,
  reduceCue,
  seedDirector,
  tickDirector,
  type DirectorState,
} from './director';
import { frameTarget, offscreenPlayerIds } from './framing';
import { markerAnchors, trackMetrics, type CameraState } from './geometry';
import type { WorldScene } from './render/WorldScene';
import { useWorldView } from './useWorldView';
import { gradeState, quantizeZoneWeights, zoneWeights } from './zones';

/** Cue types P1 acts on. Everything else belongs to a later phase (spec §5). */
const SUBSCRIBED: CueType[] = [
  'phase-countdown',
  'phase-read',
  'phase-answer',
  'phase-track',
  'overtake',
  'lead-changed',
  'final-question',
];

/** World units of target change below which a new move is not worth starting. */
const RETARGET_EPSILON = 8;

export interface WorldRuntimeOptions {
  app: Application<Renderer>;
  scene: WorldScene;
  profile: Profile;
  localPlayerId: string | null;
}

export function createWorldRuntime(options: WorldRuntimeOptions): { destroy(): void } {
  const { app, scene, profile, localPlayerId } = options;
  const startedAt = performance.now();

  // Seed from the store: the cue bridge emitted the current beat before this
  // subscriber existed, so a mid-game reload must establish its own base shot.
  let director: DirectorState = seedDirector(useGameStore.getState().room?.phase ?? 'lobby');
  let camera: CameraState | null = null;
  let move: CameraMove | null = null;

  const unsubscribes = SUBSCRIBED.map(type =>
    on(type, cue => {
      director = reduceCue(director, cue, performance.now());
    }),
  );

  const tick = () => {
    const now = performance.now();
    const { room, standings } = useGameStore.getState();

    director = tickDirector(director, now);
    const intent = activeIntent(director);

    const metrics = trackMetrics(room?.total_rounds ?? 12);
    const anchors = markerAnchors(standings ?? [], metrics);
    const viewport = { width: app.screen.width, height: app.screen.height };

    const target = clampCamera(
      frameTarget(intent.mode, {
        anchors,
        metrics,
        viewport,
        localPlayerId,
        emphasisIds: intent.emphasisIds,
      }),
      metrics,
    );

    if (!camera) {
      camera = target;
    } else if (
      !move ||
      Math.abs(move.to.centerX - target.centerX) > RETARGET_EPSILON ||
      Math.abs(move.to.span - target.span) > RETARGET_EPSILON
    ) {
      move = beginMove(camera, target, intent.style, profile, now);
    }

    if (move) {
      camera = sampleMove(move, now);
      if (isMoveComplete(move, now)) move = null;
    }

    const elapsedMs = now - startedAt;
    const shown: CameraState = {
      centerX: camera.centerX + driftOffset(elapsedMs, camera, profile),
      span: camera.span,
    };

    const progress = room && room.total_rounds > 0 ? room.round / room.total_rounds : 0;

    const blended = zoneWeights(shown.centerX, metrics);

    scene.applyFrame({
      camera: shown,
      viewport,
      metrics,
      // Reduced profile switches zones hard instead of crossfading (spec §9).
      zones: profile === 'reduced' ? quantizeZoneWeights(blended) : blended,
      grade: gradeState(progress, director.escalation),
      anchors,
      localPlayerId,
      elapsedMs,
    });

    useWorldView.getState().setOffscreen(offscreenPlayerIds(anchors, shown, viewport));
  };

  app.ticker.add(tick);

  return {
    destroy() {
      app.ticker.remove(tick);
      for (const off of unsubscribes) off();
      useWorldView.getState().setOffscreen([]);
    },
  };
}
```

- [ ] **Step 3: Replace the static ticker in `PixiStage` with the runtime**

In `components/PixiStage.tsx`, delete the whole `const startedAt = ...; instance.ticker.add(...)` block added in Task 5 and the now-unused imports (`useGameStore`, `markerAnchors`, `trackMetrics`, `clampCamera`, `frameTarget`, `gradeState`, `zoneWeights`). Replace with the runtime, reading the local player id from the session:

Add near the other imports:

```tsx
import { loadSession } from '@/lib/session';
```

Add alongside `let scene`:

```tsx
    let runtime: { destroy(): void } | null = null;
```

Then, immediately after `host.appendChild(instance.canvas);`:

```tsx
        const { createWorldRuntime } = await import('@/lib/world/runtime');
        runtime = createWorldRuntime({
          app: instance,
          scene,
          profile,
          localPlayerId: loadSession(code)?.playerId ?? null,
        });
```

And in the cleanup, tear the runtime down **before** the scene:

```tsx
    return () => {
      cancelled = true;
      runtime?.destroy();
      runtime = null;
      scene?.destroy();
      scene = null;
      if (app) {
        app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
        app = null;
      }
    };
```

- [ ] **Step 4: Verify the build and the regression floor**

```bash
npx tsc --noEmit
npm run lint
npm test
npx playwright test
```
Expected: `tsc` clean; lint clean except the one pre-existing `app/room/[code]/page.tsx:29` error; 136 unit tests pass; 14/14 e2e pass.

- [ ] **Step 5: Verify camera direction against a real game**

Two browser contexts, a 3-question game, Supabase running. Confirm each beat by eye — this is the spec §12 exit criterion 3, and the only place it can be checked:

1. **Lobby** — camera parked at the start line, office park backdrop.
2. **Countdown** — widens to show the whole track.
3. **READ / ANSWER** — settles onto the pack and drifts gently; the drift is a slow lateral breath, not a scroll.
4. **REVEAL** — the shot **holds**; no new move begins.
5. **TRACK** — cuts (fast, ~120ms) rather than drifting.
6. **Overtake** — when one player passes another, the camera punches in on both for ~1.2s and then releases back to the pack shot.
7. **Final question** — slow push-in and the grade turns magenta.
8. **Reduced profile** — every move above still happens, but arrives at cut speed with no ambient drift.

Note any beat that misfires and fix it in the pure module that owns it (`director.ts` for what shot, `framing.ts` for where, `camera.ts` for how it moves) — never by special-casing inside `runtime.ts`.

- [ ] **Step 6: Commit**

```bash
git add lib/world/runtime.ts lib/world/useWorldView.ts components/PixiStage.tsx
git commit -m "feat(world): cue-driven camera runtime"
```

---

### Task 7: Markers and the accessible standings readout

**Deliverable:** players appear in the world, and `Track.tsx` is gone — replaced by an HTML panel that carries the standings as real text.

**Files:**
- Create: `lib/world/render/Markers.ts`
- Create: `components/TrackReadout.tsx`
- Delete: `components/Track.tsx`
- Modify: `lib/world/render/WorldScene.ts`
- Modify: `components/GameView.tsx:11,36`

**Interfaces:**
- Consumes: `MarkerAnchor`, `MARKER_ROW_HEIGHT` from Task 1; `RACER_COLORS`, `COLOR` from tokens; `useWorldView` from Task 6; `useGameStore`, `loadSession`, `avatarEmoji` from existing modules.
- Produces:
  - `class Markers { constructor(profile: Profile); sync(anchors: readonly MarkerAnchor[], players: readonly MarkerPlayer[], localPlayerId: string | null, now: number): void; update(camera: CameraState, viewport: Viewport, now: number): void; destroy(): void }` — P2 replaces this module against the same constructor and method signatures.
  - `WorldScene` gains `setPlayers(players: readonly MarkerPlayer[]): void` and renders markers inside `applyFrame`.
  - `interface MarkerPlayer { id: string; nickname: string; color: string }`
  - `components/TrackReadout.tsx` default export `TrackReadout({ code }: { code: string })`.

**Frozen copy:** the readout heading must remain exactly `The track — after Q{n}` — `e2e/game-flow.spec.ts` matches `/The track — after Q1/` and must not be edited (Global Constraints). The dash is an em dash.

- [ ] **Step 1: Write `Markers.ts`**

Create `lib/world/render/Markers.ts`:

```ts
/**
 * Placeholder position markers (spec §8).
 *
 * P1 draws pucks, not characters: P2 replaces this module with the real avatar
 * roster against the same anchor API, and owns the movement grammar (boost ->
 * overshoot -> settle), squash-and-stretch, trails, and streak VFX. Nothing
 * here should grow in that direction.
 */
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLOR, DURATION, EASE } from '@/lib/presentation/tokens';
import type { Profile } from '@/lib/presentation/profile';
import { cubicBezierEase } from '../camera';
import { horizonY, worldScale, type CameraState, type MarkerAnchor, type Viewport } from '../geometry';

export interface MarkerPlayer {
  id: string;
  nickname: string;
  /** CSS hex from the DB, e.g. '#38bdf8'. */
  color: string;
}

const PUCK_RADIUS = 26;

interface MarkerNode {
  container: Container;
  from: { x: number; y: number };
  to: { x: number; y: number };
  startedAt: number;
}

export class Markers {
  readonly container = new Container();
  private readonly nodes = new Map<string, MarkerNode>();

  constructor(private readonly profile: Profile) {}

  /** Rebuild puck graphics when the roster changes; retarget on every anchor change. */
  sync(
    anchors: readonly MarkerAnchor[],
    players: readonly MarkerPlayer[],
    localPlayerId: string | null,
    now: number,
  ): void {
    const seen = new Set<string>();

    for (const anchor of anchors) {
      seen.add(anchor.playerId);
      const player = players.find(p => p.id === anchor.playerId);
      if (!player) continue;

      let node = this.nodes.get(anchor.playerId);
      if (!node) {
        node = this.createNode(player, player.id === localPlayerId);
        this.nodes.set(anchor.playerId, node);
        this.container.addChild(node.container);
        node.from = { x: anchor.x, y: anchor.y };
        node.to = { x: anchor.x, y: anchor.y };
      }

      if (node.to.x !== anchor.x || node.to.y !== anchor.y) {
        node.from = this.positionAt(node, now);
        node.to = { x: anchor.x, y: anchor.y };
        node.startedAt = now;
      }
    }

    for (const [id, node] of this.nodes) {
      if (seen.has(id)) continue;
      node.container.destroy({ children: true });
      this.nodes.delete(id);
    }
  }

  update(camera: CameraState, viewport: Viewport, now: number): void {
    const scale = worldScale(camera, viewport);
    const originX = viewport.width / 2 - camera.centerX * scale;
    const ground = horizonY(viewport);

    for (const node of this.nodes.values()) {
      const position = this.positionAt(node, now);
      node.container.x = originX + position.x * scale;
      node.container.y = ground + position.y * scale;
      node.container.scale.set(scale);
    }
  }

  private positionAt(node: MarkerNode, now: number): { x: number; y: number } {
    // Reduced profile snaps; high eases with the settle curve. The full P2
    // movement grammar (anticipation, overshoot, trails) is NOT this.
    if (this.profile === 'reduced') return node.to;
    const elapsed = now - node.startedAt;
    if (elapsed >= DURATION.settle) return node.to;
    const t = cubicBezierEase(EASE.settle, elapsed / DURATION.settle);
    return {
      x: node.from.x + (node.to.x - node.from.x) * t,
      y: node.from.y + (node.to.y - node.from.y) * t,
    };
  }

  private createNode(player: MarkerPlayer, isLocal: boolean): MarkerNode {
    const container = new Container();
    const color = Number.parseInt(player.color.replace('#', ''), 16) || COLOR.neonCyan;

    const puck = new Graphics();
    puck.circle(0, -PUCK_RADIUS, PUCK_RADIUS).fill({ color: COLOR.abyss });
    puck.circle(0, -PUCK_RADIUS, PUCK_RADIUS).stroke({ color, width: 5 });
    if (isLocal) {
      puck.circle(0, -PUCK_RADIUS, PUCK_RADIUS + 7).stroke({ color: COLOR.silver, width: 3, alpha: 0.9 });
    }
    container.addChild(puck);

    const label = new Text({
      text: player.nickname,
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 20,
        fontWeight: '700',
        fill: COLOR.silver,
      }),
    });
    label.anchor.set(0.5, 0);
    label.y = 6;
    container.addChild(label);

    return { container, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, startedAt: 0 };
  }

  destroy(): void {
    for (const node of this.nodes.values()) node.container.destroy({ children: true });
    this.nodes.clear();
    this.container.destroy({ children: true });
  }
}
```

- [ ] **Step 2: Render markers from `WorldScene`**

In `lib/world/render/WorldScene.ts`:

Add imports:

```ts
import { Markers, type MarkerPlayer } from './Markers';
```

Add a field alongside `grade`:

```ts
  private readonly markers: Markers;
  private players: readonly MarkerPlayer[] = [];
```

In the constructor, after the backdrop loop and **before** adding the grade (markers are world content, so they sit under the grade):

```ts
    this.markers = new Markers(profile);
    this.root.addChild(this.markers.container);
```

Add a setter:

```ts
  setPlayers(players: readonly MarkerPlayer[]): void {
    this.players = players;
  }
```

At the end of `applyFrame`, after `this.grade.update(...)`:

```ts
    this.markers.sync(frame.anchors, this.players, frame.localPlayerId, frame.elapsedMs);
    this.markers.update(frame.camera, frame.viewport, frame.elapsedMs);
```

Add `this.markers.destroy();` to `destroy()`.

`WorldFrameState` already carries `localPlayerId` (Task 5) and `runtime.ts` already sets it (Task 6), so no change is needed there. In the same tick, keep the roster fresh:

```ts
    scene.setPlayers(useGameStore.getState().players);
```

placed immediately before `scene.applyFrame(...)`. `PlayerPublic` already has `id`, `nickname`, and `color`, so it satisfies `MarkerPlayer` structurally.

- [ ] **Step 3: Write `TrackReadout.tsx`**

Create `components/TrackReadout.tsx`:

```tsx
'use client';
import { useGameStore } from '@/lib/store';
import { loadSession } from '@/lib/session';
import { avatarEmoji } from '@/lib/avatars';
import { useWorldView } from '@/lib/world/useWorldView';

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * The accessible half of the track (spec §8). Pixi draws the world; this
 * carries the standings as real text, so readability never depends on canvas
 * (PRD §9). Replaces the DOM track picture that was `components/Track.tsx`.
 */
export default function TrackReadout({ code }: { code: string }) {
  const room = useGameStore(s => s.room);
  const standings = useGameStore(s => s.standings);
  const offscreen = useWorldView(s => s.offscreenPlayerIds);
  const myId = typeof window !== 'undefined' ? loadSession(code)?.playerId : null;

  if (!room || !standings) return null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-end gap-4 p-6 pb-10">
      <h2 className="text-center text-sm font-bold uppercase tracking-widest text-ink-mute">
        The track — after Q{room.round}
      </h2>

      <ol className="rounded-panel border border-haze/40 bg-abyss/70 p-2 backdrop-blur-md">
        {standings.map((s, rank) => (
          <li
            key={s.player_id}
            className={`flex items-center gap-3 rounded-control px-3 py-2 ${
              s.player_id === myId ? 'bg-haze/25' : ''
            }`}
          >
            <span className="w-6 text-center text-sm font-bold tabular-nums text-ink-mute">
              {rank < 3 ? MEDALS[rank] : rank + 1}
            </span>
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg"
              style={{ backgroundColor: `${s.color}33`, boxShadow: `inset 0 0 0 2px ${s.color}` }}
            >
              {avatarEmoji(s.avatar)}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold text-ink">
              {s.nickname}
              {s.player_id === myId && <span className="ml-2 text-xs text-ink-mute">you</span>}
            </span>
            {offscreen.includes(s.player_id) && (
              <span className="text-xs text-warning" title="Outside the current camera shot">
                ◀ off screen
              </span>
            )}
            <span className="tabular-nums text-sm text-ink-dim">
              {s.correct}/{room.total_rounds}
            </span>
          </li>
        ))}
      </ol>
    </main>
  );
}
```

- [ ] **Step 4: Swap it in and delete `Track.tsx`**

In `components/GameView.tsx`, change the import on line 11:

```tsx
import TrackReadout from './TrackReadout';
```

and line 36:

```tsx
  if (room.phase === 'track') return <TrackReadout code={code} />;
```

Then:

```bash
git rm components/Track.tsx
```

- [ ] **Step 5: Verify the regression floor — this is the task most likely to break it**

```bash
npx tsc --noEmit
npm run lint
npm test
npx playwright test
```
Expected: 14/14 e2e. If `game-flow.spec.ts` fails on `The track — after Q1`, the heading text or the em dash was altered — restore it verbatim. If it fails selecting the first answer option, a button leaked into `<main>` before the options (Global Constraints).

- [ ] **Step 6: Visual smoke check**

Drive a two-player game and confirm:
1. Two pucks sit on the road, ringed in each player's colour, nickname beneath, and the local player carries the extra silver ring.
2. On a correct answer the puck eases forward one segment; under the reduced profile it snaps.
3. Two players tied on a segment stack vertically, the higher speed-points player on the ground row.
4. The readout lists everyone with medals, `you`, and `correct/total`.

- [ ] **Step 7: Commit**

```bash
git add lib/world/render components/TrackReadout.tsx components/GameView.tsx lib/world/runtime.ts
git commit -m "feat(world): position markers and the accessible track readout"
```

---

### Task 8: Portrait band, frame instrumentation, and e2e

**Deliverable:** the phone layout the PRD asks for, plus the measurement that makes the 60fps exit criterion checkable.

**Files:**
- Create: `lib/world/perf.ts`
- Create: `components/PerfOverlay.tsx`
- Create: `e2e/world.spec.ts`
- Test: `tests/perf.test.ts`
- Modify: `lib/world/useWorldView.ts`
- Modify: `lib/world/runtime.ts`
- Modify: `components/PixiStage.tsx`
- Modify: `components/GameView.tsx`
- Modify: `app/room/[code]/page.tsx`

**Interfaces:**
- Consumes: Tasks 1–7.
- Produces:
  - `interface FrameStats { p50: number; p95: number; dropped: number; samples: number }`
  - `DROPPED_FRAME_MS = 20`
  - `createFrameSampler(windowSize?: number): { push(frameMs: number): void; stats(): FrameStats }`
  - `useWorldView` gains `frameStats: FrameStats | null` and `setFrameStats(stats)`.
  - `PixiStage` host element carries `data-band="strip" | "full"`.

- [ ] **Step 1: Write the failing perf test**

Create `tests/perf.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DROPPED_FRAME_MS, createFrameSampler } from '@/lib/world/perf';

describe('createFrameSampler', () => {
  it('reports nothing before any frames land', () => {
    expect(createFrameSampler().stats()).toEqual({ p50: 0, p95: 0, dropped: 0, samples: 0 });
  });

  it('reports the median of a steady 60fps stream', () => {
    const sampler = createFrameSampler();
    for (let i = 0; i < 120; i++) sampler.push(16.7);
    const stats = sampler.stats();
    expect(stats.p50).toBeCloseTo(16.7, 5);
    expect(stats.dropped).toBe(0);
    expect(stats.samples).toBe(120);
  });

  it('separates the tail from the median', () => {
    const sampler = createFrameSampler();
    for (let i = 0; i < 95; i++) sampler.push(16);
    for (let i = 0; i < 5; i++) sampler.push(90);
    const stats = sampler.stats();
    expect(stats.p50).toBe(16);
    expect(stats.p95).toBeGreaterThanOrEqual(16);
  });

  it('counts frames slower than the dropped threshold', () => {
    const sampler = createFrameSampler();
    sampler.push(DROPPED_FRAME_MS - 1);
    sampler.push(DROPPED_FRAME_MS);
    sampler.push(DROPPED_FRAME_MS + 40);
    expect(sampler.stats().dropped).toBe(2);
  });

  it('keeps only the most recent window', () => {
    const sampler = createFrameSampler(10);
    for (let i = 0; i < 10; i++) sampler.push(100);
    for (let i = 0; i < 10; i++) sampler.push(10);
    const stats = sampler.stats();
    expect(stats.samples).toBe(10);
    expect(stats.p50).toBe(10);
    expect(stats.dropped).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/perf.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/world/perf"`.

- [ ] **Step 3: Write `perf.ts`**

Create `lib/world/perf.ts`:

```ts
/**
 * Frame-time instrumentation (spec §9, decision 7).
 *
 * MEASUREMENT ONLY — nothing here changes the performance profile. ADR-0004
 * stands: the profile is a static startup heuristic plus a manual override.
 * P2, where load becomes variable with N avatars and particle systems, owns any
 * automatic downgrade.
 */

/** A frame slower than this is below 50fps and counts as dropped. */
export const DROPPED_FRAME_MS = 20;

export interface FrameStats {
  p50: number;
  p95: number;
  dropped: number;
  samples: number;
}

export function createFrameSampler(windowSize = 120) {
  const window: number[] = [];
  let dropped = 0;

  return {
    push(frameMs: number): void {
      window.push(frameMs);
      if (frameMs >= DROPPED_FRAME_MS) dropped++;
      if (window.length > windowSize) {
        const evicted = window.shift()!;
        if (evicted >= DROPPED_FRAME_MS) dropped--;
      }
    },

    stats(): FrameStats {
      if (window.length === 0) return { p50: 0, p95: 0, dropped: 0, samples: 0 };
      const sorted = [...window].sort((a, b) => a - b);
      const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
      return { p50: at(0.5), p95: at(0.95), dropped, samples: window.length };
    },
  };
}
```

- [ ] **Step 4: Run the perf test to verify it passes**

Run: `npx vitest run tests/perf.test.ts`
Expected: PASS — 5 tests. Total suite: 141.

- [ ] **Step 5: Publish frame stats from the runtime**

In `lib/world/useWorldView.ts`, extend the store:

```ts
import type { FrameStats } from './perf';
```

Add to the interface and the creator:

```ts
  frameStats: FrameStats | null;
  setFrameStats(stats: FrameStats): void;
```

```ts
  frameStats: null,
  setFrameStats(stats) {
    set({ frameStats: stats });
  },
```

In `lib/world/runtime.ts`, add:

```ts
import { createFrameSampler } from './perf';
```

Create the sampler beside `startedAt`:

```ts
  const sampler = createFrameSampler();
  let lastFrameAt = startedAt;
  let lastPublishAt = startedAt;
```

At the top of `tick`, after `const now = performance.now();`:

```ts
    sampler.push(now - lastFrameAt);
    lastFrameAt = now;
```

At the end of `tick`, throttled so React re-renders twice a second rather than sixty times:

```ts
    if (now - lastPublishAt >= 500) {
      lastPublishAt = now;
      useWorldView.getState().setFrameStats(sampler.stats());
    }
```

- [ ] **Step 6: Write the perf overlay**

Create `components/PerfOverlay.tsx`. It must render outside `<main>` and must not add a button (Global Constraints).

```tsx
'use client';
import { useSearchParams } from 'next/navigation';
import { useWorldView } from '@/lib/world/useWorldView';
import { DROPPED_FRAME_MS } from '@/lib/world/perf';

/** Dev-only frame readout behind `?perf=1` (spec §9). Measurement only. */
export default function PerfOverlay() {
  const enabled = useSearchParams().get('perf') === '1';
  const stats = useWorldView(s => s.frameStats);

  if (!enabled || !stats) return null;

  const fps = stats.p50 > 0 ? Math.round(1000 / stats.p50) : 0;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed bottom-3 left-3 z-50 rounded-control border border-haze/50 bg-void/85 px-3 py-2 font-mono text-xs text-ink-dim tabular-nums"
    >
      <div className={fps >= 55 ? 'text-correct' : 'text-warning'}>{fps} fps</div>
      <div>p50 {stats.p50.toFixed(1)}ms · p95 {stats.p95.toFixed(1)}ms</div>
      <div>
        dropped {stats.dropped}/{stats.samples} (&gt;{DROPPED_FRAME_MS}ms)
      </div>
    </div>
  );
}
```

Mount it in `app/room/[code]/page.tsx` beside `SettingsControl`, wrapped in Suspense because `useSearchParams` requires it:

```tsx
import { Suspense } from 'react';
import PerfOverlay from '@/components/PerfOverlay';
```

```tsx
      <SettingsControl />
      <Suspense fallback={null}>
        <PerfOverlay />
      </Suspense>
```

- [ ] **Step 7: Implement the portrait band**

In `components/PixiStage.tsx`, read the phase and derive the band:

```tsx
const STRIP_PHASES = new Set(['read', 'answer', 'reveal']);
```

Inside the component:

```tsx
  const phase = useGameStore(s => s.room?.phase ?? 'lobby');
  const band = STRIP_PHASES.has(phase) ? 'strip' : 'full';
```

(Re-add the `useGameStore` import removed in Task 6 Step 3.)

Replace the returned element:

```tsx
  return (
    <div
      ref={hostRef}
      data-testid="pixi-stage"
      data-band={band}
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-0 transition-[height] duration-(--dur-settle) ease-settle ${
        band === 'strip' ? 'h-[28vh] portrait:h-[28vh] landscape:h-screen' : 'h-screen'
      }`}
    />
  );
```

Landscape keeps full-bleed in every phase (spec §7); only portrait collapses to the strip.

The band's open/close needs no profile branch: `app/globals.css` already forces `transition-duration: 1ms` under `[data-profile='reduced']`, which satisfies the spec §9 ladder row for free.

**Pixi does not observe element resizes** — `resizeTo` listens for window resize only, so a CSS-driven band change would leave the renderer at the old size. Add a `ResizeObserver` inside the init effect, right after `host.appendChild(instance.canvas)`:

```tsx
        const observer = new ResizeObserver(() => instance.resize());
        observer.observe(host);
        resizeObserver = observer;
```

Declare `let resizeObserver: ResizeObserver | null = null;` beside `let runtime`, and disconnect it first in the cleanup:

```tsx
      resizeObserver?.disconnect();
      resizeObserver = null;
```

- [ ] **Step 8: Keep the question UI clear of the band**

In `components/GameView.tsx`, add portrait padding to the question `<main>` so text never sits under the strip. Change the `<main>` className on line 39 to:

```tsx
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-6 portrait:pt-[30vh]">
```

Leave `TrackReadout`'s own `<main>` alone — the band is full height during TRACK, and the readout already anchors to the bottom with `justify-end`.

- [ ] **Step 9: Write the e2e test**

Create `e2e/world.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

// The portrait band (spec §7): a compact strip while a question is on screen,
// full height at the track moment. Driven directly against a lobby room so the
// test stays fast — the band derives from phase, not from any game outcome.
test.describe('the world band in portrait', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('is full height before a question is on screen', async ({ page }) => {
    await page.goto('/host/new');
    await page.getByPlaceholder('Your nickname').fill('Bandy');
    await page.getByRole('button', { name: /create room/i }).click();
    await expect(page).toHaveURL(/\/room\/[A-Z0-9]{5}$/);

    const stage = page.locator('[data-testid="pixi-stage"]');
    await expect(stage).toHaveAttribute('data-band', 'full');
    await expect(stage.locator('canvas')).toBeAttached();

    const box = await stage.boundingBox();
    expect(box!.height).toBeGreaterThan(700);
  });
});
```

- [ ] **Step 10: Run the full verification set**

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
npx playwright test
```
Expected: `tsc` clean; lint clean except the pre-existing `app/room/[code]/page.tsx:29` error; 141 unit tests; build succeeds; **15/15** e2e (14 existing + the new band test).

- [ ] **Step 11: Measure the exit criterion**

Open a real game at `http://localhost:3000/room/<CODE>?perf=1` on the development laptop, high profile, landscape, full screen. Watch the overlay through a complete round including a TRACK moment.

Record the observed `p50`, `p95`, and dropped count in the phase progress document. Exit criterion 1 is met when p50 is at or under ~16.7ms with dropped frames in low single digits across a round. If it is not met, reduce layer counts in `content/nightRace.ts` (data, not code) and re-measure — do **not** add an automatic downgrade, which is P2's scope.

Repeat on a phone or with the reduced profile forced, and confirm the ladder visibly applies: fewer layers, no ambient shimmer, no camera drift, snapped marker movement.

- [ ] **Step 12: Commit**

```bash
git add lib/world/perf.ts lib/world/useWorldView.ts lib/world/runtime.ts components/PerfOverlay.tsx components/PixiStage.tsx components/GameView.tsx "app/room/[code]/page.tsx" tests/perf.test.ts e2e/world.spec.ts
git commit -m "feat(world): portrait band, frame instrumentation, and band e2e"
```

---

## Exit-criteria verification map

Run this after Task 8 and confirm every line before declaring P1 done.

| Spec §12 exit criterion | Where it is satisfied | How it is verified |
|---|---|---|
| 1. 60fps on a mid-range laptop, evidence-backed | Tasks 5, 8 | `?perf=1` overlay reading recorded in Task 8 Step 11 |
| 2. Degrades gracefully on mobile / reduced profile | Tasks 4, 5, 6, 7, 8 | `tests/worldDefinition.test.ts` layer-count ladder + Task 8 Step 11 reduced-profile pass |
| 3. Camera responds to phase cues | Tasks 2, 3, 6 | `tests/director.test.ts`, `tests/camera.test.ts`, `tests/framing.test.ts` + the eight-beat walkthrough in Task 6 Step 5 |
| 4. Environment progresses office park → neon city → stadium | Tasks 4, 5 | `tests/zones.test.ts` + Task 5 Step 9 screenshots |
| 5. DOM track replaced; standings readable as HTML | Task 7 | `components/Track.tsx` deleted; `game-flow.spec.ts` passes unmodified against `TrackReadout` |
| 6. Full Playwright suite passes | all | `npx playwright test` — 15/15 |

## Decisions this plan makes that the spec left open

Record these in the phase progress document; the first is ADR-worthy.

1. **The local player outranks the leader when the field overflows `MAX_SPAN`.** Spec §5 says the camera biases to include "both the leader and the local player" but does not say who wins when both cannot fit. `framing.ts` drops the leader before it drops you — being unable to see yourself is the worse failure — and the dropped player gets a chevron in the readout. Pinned by `tests/framing.test.ts`.
2. **Zone weights are sampled at the camera centre, not per tile.** A single blend value for the whole backdrop reads as a smooth crossfade because the layers are wide and low-frequency, at a fraction of the cost. Documented in `WorldScene`'s header.
3. **`lib/world/useWorldView.ts` is not in the spec's §3 module layout.** Offscreen ids and frame stats flow from canvas back to HTML, and a tiny store is the only clean way to do that without the readout reaching into Pixi.
4. **The runtime reads `standings`/`players` from the game store as well as subscribing to cues.** Cues carry dramatic timing, not positions — `player-advanced` has no speed points, so it cannot order a tied segment. No cue type or payload field was added, so ADR-0001 and roadmap decision 4 are intact.
5. **Camera motion is a duration-driven bezier tween, not a spring.** Targets change on discrete cue boundaries rather than every frame, so a tween on P0's existing `EASE`/`DURATION` tokens is both sufficient and reuses the shared motion vocabulary.
6. **`components/PerfOverlay.tsx` is an addition to the spec's module layout**, needed because `?perf=1` has to read the runtime's sampler from React.
