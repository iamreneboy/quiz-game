# M2 P6b — Broadcast Direction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Direct the stage view for a television — give the world-framing pipeline a vertical contract, give the stage its own camera shot book and broadcast layout, and clear the two debt entries living in the same code.

**Architecture:** `worldScale` picks scale from viewport **width** alone, so the world units visible above the ground line (`headroom`) is a quantity the pipeline never computes. Both open framing defects are that number being too small. Stacks compress via a viewport-derived rise limit that `geometry.ts` receives as a plain number (keeping it viewport-free by contract); the podium widens via a vertical fit in `framing.ts`. On top of that, `director.ts` gains a role-selected shot book, and the stage DOM becomes a title-safe broadcast frame that rescales by overriding existing Tailwind theme vars in a `[data-surface="stage"]` scope.

**Tech Stack:** Next.js (App Router), React 19 + `motion/react`, Tailwind CSS v4.3.3, Pixi.js, Zustand, Vitest, Playwright, Supabase.

**Spec:** [`docs/superpowers/specs/2026-08-24-m2-p6b-broadcast-direction-design.md`](../specs/2026-08-24-m2-p6b-broadcast-direction-design.md)

## Global Constraints

- **Read `AGENTS.md` first.** This is not the Next.js in your training data; consult `node_modules/next/dist/docs/` before writing framework code.
- **`geometry.ts` must stay viewport-free.** It takes numbers, never a `Viewport`. The viewport-aware derivation lives in `framing.ts` (spec decision 4).
- **16:9 must not move.** `stackRiseLimit(1920×1080) === MAX_STACK_RISE` and `frameTarget('podium')` span `=== PODIUM_SPAN` at 1920×1080, asserted by exact equality.
- **Do not run `supabase stop` / `supabase start`.** Windows reserves TCP 54024–54423; the running stack matches gitignored `.env.local` on 553xx ports and a restart will fail and lose it.
- **`npm run lint` must be clean.** There is no longer a pre-existing error to discount (fixed 2026-08-24).
- **e2e runs as `npm run test:e2e -- --workers=2`.** The default worker count is flaky on this machine.
- **Never verify VFX or framing in headless Chromium.** It falls back to SwiftShader, idles near 16fps and pins the VFX budget at `minimal` before a test starts. Headed browser only.
- **ADR-0017:** a property animated by a `motion` variant must not also carry a Tailwind class for that property — the inline style silently outranks it.
- **ADR-0019:** the options grid transforms *in place* into the distribution; nothing may change position at reveal.
- **Exact world constants** (do not re-derive, do not round): `AVATAR_HEIGHT` 128, `RIG_TOP` −135, `RIG_HALF_WIDTH` 45, `SEGMENT_WIDTH` 320, `HORIZON_FRACTION` 0.72, `MARKER_ROW_HEIGHT` 64, `MAX_STACK_RISE` 179.2, `MIN_SPAN` 800, `MAX_SPAN` 4480, `PACK_PADDING` 288, `EMPHASIS_PADDING` 192, `BLOCK_HEIGHTS[1]` 108.8, `BLOCK_WIDTH` 115.2, `PODIUM_SPAN` 921.6, `GRID_LEAD_IN` 40, `GRID_EDGE_MARGIN` 67.5.

**Deviation from spec §1:** the spec lists 7 tasks and folds the whole vertical-framing contract into task 1. This plan splits that into **Task 1 (stacks)** and **Task 2 (podium)** because a reviewer can meaningfully reject one while approving the other. Eight tasks total; scope is identical.

---

## File Structure

| File | Responsibility after this phase |
|---|---|
| `lib/world/framing.ts` | **All viewport-aware framing math.** Gains `headroom`, `stackRiseLimit`, the podium vertical fit, and the `packTight`/`packWide`/`podiumRoom` modes. |
| `lib/world/geometry.ts` | Pure world-space layout. Anchor builders take a rise limit as a number. `TRACK_MARGIN`/`GRID_COLUMN_WIDTH` become derived. |
| `lib/world/camera.ts` | Span limits, clamping, tweening. Gains the `push` move style. |
| `lib/world/director.ts` | Cue → camera intent reducer. Gains `ShotBook`, `SHOT_BOOKS`, and `role` on `DirectorState`. |
| `lib/world/podium.ts` | Ceremony anchor layout. Forwards the rise limit. |
| `lib/world/vfxBudget.ts` | VFX degradation ladder. Gains `initialBudgetFor(profile)`. |
| `lib/world/runtime.ts` | Per-frame orchestration. Gains `role`, seeds the budget, threads the rise limit. |
| `app/globals.css` | Token source of truth. Gains `--dur-push`, `--horizon-fraction`, and the `[data-surface="stage"]` override block. |
| `components/PixiStage.tsx` | Canvas host + band publishing. Gains the stage's horizontal ceremony split. |
| `components/LowerThird.tsx` | Callout. Gains `variant: 'card' | 'strip'`. |
| `components/stage/StageBroadcast.tsx` | The stage's title-safe broadcast frame. |
| `components/stage/StageOptions.tsx` | Answers as a floor row; distribution fills columns bottom-up. |
| `components/stage/StageResults.tsx` | Results column sized off `--ceremony-panel`. |

---

## Task 1: The stack rise limit

**Files:**
- Modify: `lib/world/framing.ts`
- Modify: `lib/world/geometry.ts:144-146` (`stackPitch`), `:154-190` (`markerAnchors`), `:203-213` (`startLineAnchors`), `:236-263` (`gridAnchors`)
- Modify: `lib/world/podium.ts:125-140` (`podiumAnchors`)
- Modify: `lib/world/runtime.ts:105-120` (`fieldAnchors`), `:190-191`
- Test: `tests/framing.test.ts`, `tests/geometry.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `headroom(viewport: Viewport, span: number): number` — exported from `lib/world/framing.ts`
  - `stackRiseLimit(viewport: Viewport): number` — exported from `lib/world/framing.ts`
  - `STACK_RISE_FLOOR: number` (32) — exported from `lib/world/framing.ts`
  - `stackPitch(rowCount: number, riseLimit?: number): number`
  - `markerAnchors(standings, metrics, riseLimit?: number): MarkerAnchor[]`
  - `startLineAnchors(players, metrics, riseLimit?: number): MarkerAnchor[]`
  - `gridAnchors(players, metrics, riseLimit?: number): MarkerAnchor[]`
  - `podiumAnchors(standings, metrics, steps, riseLimit?: number): MarkerAnchor[]`

Every `riseLimit` parameter defaults to `MAX_STACK_RISE`, so existing callers and the ~40 existing tests keep compiling and keep asserting today's behaviour.

- [ ] **Step 1: Write the failing tests for `headroom` and `stackRiseLimit`**

Add to `tests/framing.test.ts`. Extend the existing import from `@/lib/world/framing` with `headroom`, `stackRiseLimit`, `STACK_RISE_FLOOR`, and add `MAX_STACK_RISE` to the existing `@/lib/world/geometry` import.

```ts
describe('headroom', () => {
  it('reproduces the 16:9 derivation MAX_STACK_RISE was written against', () => {
    // geometry.ts's MAX_STACK_RISE docstring: "324 at 16:9" at MIN_SPAN.
    expect(headroom({ width: 1920, height: 1080 }, 800)).toBeCloseTo(324, 6);
  });

  it('shrinks as the viewport gets wider for the same span', () => {
    expect(headroom({ width: 2560, height: 1080 }, 800)).toBeCloseTo(243, 6);
    expect(headroom({ width: 3440, height: 1440 }, 800)).toBeCloseTo(241.116, 3);
  });
});

describe('stackRiseLimit', () => {
  it('is EXACTLY MAX_STACK_RISE at 16:9 — this phase must not move 16:9', () => {
    expect(stackRiseLimit({ width: 1920, height: 1080 })).toBe(MAX_STACK_RISE);
  });

  it('compresses on ultrawide, where the old constant clipped', () => {
    expect(stackRiseLimit({ width: 2560, height: 1080 })).toBeCloseTo(108, 6);
    expect(stackRiseLimit({ width: 3440, height: 1440 })).toBeCloseTo(106.116, 3);
  });

  it('never drops below the floor, even on a retreated 32:9 band', () => {
    // headroom is 162 there, so the raw derivation wants 27.
    expect(stackRiseLimit({ width: 1920, height: 540 })).toBe(STACK_RISE_FLOOR);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/framing.test.ts -t "headroom"`
Expected: FAIL — `headroom is not a function` / import errors for `stackRiseLimit`, `STACK_RISE_FLOOR`.

- [ ] **Step 3: Implement `headroom` and `stackRiseLimit`**

In `lib/world/framing.ts`, extend the existing `./geometry` import with `HORIZON_FRACTION`, `MARKER_ROW_HEIGHT`, `MAX_STACK_RISE`, and the `./camera` import with `MIN_SPAN_SEGMENTS`. Add after the `PODIUM_SPAN` / `LEADER_BIAS` constants:

```ts
/**
 * World units visible ABOVE the ground line — the number this pipeline never
 * computed.
 *
 * `worldScale` picks pixels-per-unit from viewport WIDTH alone
 * (geometry.ts:122), then every vertical measurement is taken in that scale
 * against `horizonY = height * HORIZON_FRACTION`. So how much world fits above
 * the ground line depends on the aspect ratio, and nothing downstream knew it.
 * Both of P6b's framing defects are this number being too small.
 */
export function headroom(viewport: Viewport, span: number): number {
  return (viewport.height * HORIZON_FRACTION * span) / viewport.width;
}

/**
 * The floor under `stackRiseLimit`. Half a marker row: below this a stack stops
 * reading as a ladder at all, and a compressed-but-visible stack beats a flat
 * heap. Where the floor binds, rigs CAN clip — `offscreenPlayerIds` names them
 * (spec section 3.3).
 */
export const STACK_RISE_FLOOR = MARKER_ROW_HEIGHT / 2;

/**
 * How far a tie stack may rise, derived from the viewport instead of assumed.
 *
 * This finishes the derivation `MAX_STACK_RISE`'s own docstring starts: it
 * works out 324 units of headroom at MIN_SPAN, subtracts the rig's 135-unit
 * reach, and then ASSUMES 16:9 and freezes the answer at 179.2. Here the same
 * arithmetic runs against the real viewport.
 *
 * MIN_SPAN rather than the live span is deliberate: the tightest shot the
 * camera can ever take is the worst case, so the limit never depends on the
 * camera state it would otherwise feed back into.
 */
export function stackRiseLimit(viewport: Viewport): number {
  const available =
    headroom(viewport, MIN_SPAN_SEGMENTS * SEGMENT_WIDTH) - Math.abs(RIG_TOP);
  return Math.min(MAX_STACK_RISE, Math.max(STACK_RISE_FLOOR, available));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/framing.test.ts -t "headroom"` then `npx vitest run tests/framing.test.ts -t "stackRiseLimit"`
Expected: PASS, 5 tests.

- [ ] **Step 5: Thread the limit through `geometry.ts`**

`stackPitch` gains the parameter; every anchor builder forwards it. Defaults preserve today's behaviour exactly.

```ts
export function stackPitch(rowCount: number, riseLimit: number = MAX_STACK_RISE): number {
  const rises = Math.max(1, rowCount - 1);
  return Math.min(MARKER_ROW_HEIGHT, riseLimit / rises);
}
```

In `markerAnchors`, add the third parameter and use it at the `stackPitch` call:

```ts
export function markerAnchors(
  standings: readonly AnchorStanding[],
  metrics: TrackMetrics,
  riseLimit: number = MAX_STACK_RISE,
): MarkerAnchor[] {
```
```ts
    const pitch = stackPitch(ordered.length, riseLimit);
```

In `startLineAnchors`, add the parameter and forward it:

```ts
export function startLineAnchors(
  players: readonly { id: string }[],
  metrics: TrackMetrics,
  riseLimit: number = MAX_STACK_RISE,
): MarkerAnchor[] {
  return markerAnchors(
    players.map(p => ({ player_id: p.id, correct: 0, speed_points: 0 })),
    metrics,
    riseLimit,
  );
}
```

In `gridAnchors`, add the parameter and use it at the `stackPitch(2)` call:

```ts
export function gridAnchors(
  players: readonly GridPlayer[],
  metrics: TrackMetrics,
  riseLimit: number = MAX_STACK_RISE,
): MarkerAnchor[] {
```
```ts
  const pitch = stackPitch(2, riseLimit);
```

- [ ] **Step 6: Thread the limit through `podium.ts`**

```ts
export function podiumAnchors(
  standings: readonly AnchorStanding[],
  metrics: TrackMetrics,
  steps: CeremonySteps,
  riseLimit: number = MAX_STACK_RISE,
): MarkerAnchor[] {
```

and at its `markerAnchors` call (`podium.ts:134`):

```ts
  return markerAnchors(standings, metrics, riseLimit).map(anchor => {
```

Add `MAX_STACK_RISE` to the existing `./geometry` import in `podium.ts`.

- [ ] **Step 7: Thread the limit through `runtime.ts`**

`fieldAnchors` gains the parameter and forwards it to all three builders:

```ts
function fieldAnchors(
  state: ReturnType<typeof useGameStore.getState>,
  metrics: TrackMetrics,
  steps: CeremonySteps,
  riseLimit: number,
): MarkerAnchor[] {
```
```ts
  if (phase === 'lobby') return gridAnchors(racers, metrics, riseLimit);
  if (phase === 'results' && standings?.length) return podiumAnchors(standings, metrics, steps, riseLimit);
  return standings?.length
    ? markerAnchors(standings, metrics, riseLimit)
    : startLineAnchors(racers, metrics, riseLimit);
```

Then swap the two lines in the tick so `viewport` is available (currently `anchors` is built at `:190`, one line *before* `viewport` at `:191`):

```ts
    const viewport = { width: app.screen.width, height: app.screen.height };
    const anchors = fieldAnchors(state, metrics, steps, stackRiseLimit(viewport));
```

Import `stackRiseLimit` from `./framing` in `runtime.ts`.

- [ ] **Step 8: Write the failing sweep test for the stack invariant**

Add to `tests/framing.test.ts`. This is the phase's regression floor.

```ts
/**
 * Continuous aspect sweep, 4:3 to 32:9, at a full-height viewport and at the
 * half-height a retreated results band produces. The math is pure, so this —
 * not the headed checks — is what stops a future change from silently
 * reintroducing the clip.
 */
const ASPECT_SWEEP: { width: number; height: number }[] = (() => {
  const out: { width: number; height: number }[] = [];
  for (let ratio = 4 / 3; ratio <= 32 / 9 + 1e-9; ratio += 0.05) {
    for (const height of [1080, 540]) {
      out.push({ width: Math.round(height * ratio), height });
    }
  }
  return out;
})();

describe('the vertical framing contract holds at every aspect', () => {
  it('an eight-way tie is either fully on canvas or reported off it', () => {
    const metrics = trackMetrics(12);
    const standings = Array.from({ length: 8 }, (_, i) => ({
      player_id: `p${i}`,
      correct: 3,
      speed_points: 100 - i,
    }));

    for (const view of ASPECT_SWEEP) {
      const limit = stackRiseLimit(view);
      const anchors = markerAnchors(standings, metrics, limit);
      const camera = frameTarget('pack', {
        anchors,
        metrics,
        viewport: view,
        localPlayerId: null,
        emphasisIds: [],
      });
      const scale = worldScale(camera, view);
      const topmost = Math.min(
        ...anchors.map(a => worldYToScreen(a.y, camera, view) + RIG_TOP * scale),
      );

      if (limit > STACK_RISE_FLOOR) {
        // Not floored: the derivation guarantees the head is on canvas.
        expect(topmost).toBeGreaterThan(-1e-6);
      } else if (topmost < 0) {
        // Floored and clipping: the readout MUST name someone. Silence is the bug.
        expect(offscreenPlayerIds(anchors, camera, view).length).toBeGreaterThan(0);
      }
    }
  });
});
```

- [ ] **Step 9: Run the sweep to verify it passes**

Run: `npx vitest run tests/framing.test.ts -t "vertical framing contract"`
Expected: PASS. If it fails at a wide aspect with `topmost` slightly negative while `limit > STACK_RISE_FLOOR`, the bug is in `stackRiseLimit` — not in the tolerance. Do not widen `-1e-6`.

- [ ] **Step 10: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS. Every pre-existing test still asserts today's behaviour, because every new parameter defaults to `MAX_STACK_RISE`.

- [ ] **Step 11: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both silent / zero problems.

- [ ] **Step 12: Commit**

```bash
git add lib/world/framing.ts lib/world/geometry.ts lib/world/podium.ts lib/world/runtime.ts tests/framing.test.ts
git commit -m "feat: derive the stack rise limit from the viewport

worldScale picks scale from width alone, so the world units visible above
the ground line depend on aspect ratio and nothing computed them.
MAX_STACK_RISE's docstring derives 179.2 at MIN_SPAN and then assumes
16:9, which clips a deep tie on any wider display.

headroom() names the missing quantity; stackRiseLimit() runs the same
arithmetic the docstring does against the real viewport. 16:9 is
bit-for-bit unchanged, asserted by exact equality. geometry.ts stays
viewport-free -- it takes the limit as a number."
```

---

## Task 2: The podium vertical fit and the room shot

**Files:**
- Modify: `lib/world/framing.ts`
- Test: `tests/framing.test.ts`

**Interfaces:**
- Consumes: `headroom(viewport, span)`, `ASPECT_SWEEP` (Task 1).
- Produces:
  - `PODIUM_TOP_PAD: number` (19.2) — exported from `lib/world/framing.ts`
  - `FramingMode` extended to `'startLine' | 'establishing' | 'pack' | 'packTight' | 'packWide' | 'emphasis' | 'podium' | 'podiumRoom'`

- [ ] **Step 1: Write the failing tests**

Add to `tests/framing.test.ts`. Extend the `@/lib/world/podium` import with `BLOCK_HEIGHTS` and `podiumAnchors`, and the `@/lib/world/framing` import with `PODIUM_TOP_PAD`. Add `ceremonySteps`-free literal steps as shown.

```ts
describe('the podium shot fits vertically', () => {
  const metrics = trackMetrics(12);

  it('is EXACTLY PODIUM_SPAN on a healthy full-height 16:9 canvas', () => {
    const target = frameTarget('podium', {
      anchors: [], metrics, viewport: { width: 1920, height: 1080 },
      localPlayerId: null, emphasisIds: [],
    });
    expect(target.span).toBe(921.6);
  });

  it('widens on the retreated band that was clipping the winner', () => {
    // CURRENT.md measured the winner's rig top at screen y = -79 on 1280x360.
    const target = frameTarget('podium', {
      anchors: [], metrics, viewport: { width: 1280, height: 360 },
      localPlayerId: null, emphasisIds: [],
    });
    expect(target.span).toBeCloseTo(1298.765, 3);
  });

  it('keeps the winner on canvas at every aspect, full height and retreated', () => {
    for (const view of ASPECT_SWEEP) {
      const camera = frameTarget('podium', {
        anchors: [], metrics, viewport: view, localPlayerId: null, emphasisIds: [],
      });
      const scale = worldScale(camera, view);
      // The winner stands on top of block 1; the rig reaches RIG_TOP above that.
      const winnerTop =
        worldYToScreen(-BLOCK_HEIGHTS[1], camera, view) + RIG_TOP * scale;
      expect(winnerTop).toBeGreaterThan(0);
    }
  });
});

describe('podiumRoom', () => {
  const metrics = trackMetrics(12);

  it('widens past the podium to hold the field that did not medal', () => {
    const anchors = anchorsFor(
      [['a', 12], ['b', 12], ['c', 11], ['d', 4]], 12,
    );
    const view = { width: 1920, height: 1080 };
    const room = frameTarget('podiumRoom', {
      anchors, metrics, viewport: view, localPlayerId: null, emphasisIds: [],
    });
    const tight = frameTarget('podium', {
      anchors, metrics, viewport: view, localPlayerId: null, emphasisIds: [],
    });
    expect(room.span).toBeGreaterThan(tight.span);
    expect(offscreenPlayerIds(anchors, room, view)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/framing.test.ts -t "podium"`
Expected: FAIL — the retreated case returns 921.6 (not 1298.765), the sweep gives a negative `winnerTop`, and `'podiumRoom'` is not a valid `FramingMode`.

- [ ] **Step 3: Add the vertical fit and the new modes**

In `lib/world/framing.ts`, extend the `./podium` import to `BLOCK_HEIGHTS, BLOCK_WIDTH, podiumX` and add `AVATAR_HEIGHT` from `./content/roster`. Widen the mode union:

```ts
export type FramingMode =
  | 'startLine'
  | 'establishing'
  | 'pack'
  | 'packTight'
  | 'packWide'
  | 'emphasis'
  | 'podium'
  | 'podiumRoom';
```

Add the padding constant beside the existing two, and the pad:

```ts
/** The stage's establishing-width pack shot: the world is the whole backdrop there. */
const STAGE_PACK_PADDING = SEGMENT_WIDTH * 1.8;

/** Breathing room above the winner's head in the podium shot. */
export const PODIUM_TOP_PAD = AVATAR_HEIGHT * 0.15;
```

Add the fit itself:

```ts
/**
 * The podium's span, widened if the canvas is too SHORT to hold the winner.
 *
 * The podium has no compression lever — the block heights ARE the ceremony —
 * so where a stack compresses, this widens: a wider span means a smaller
 * scale, which means more world fits above the ground line.
 *
 * Only a short canvas triggers it. At a full-height 16:9 viewport the required
 * span is 649.4 against PODIUM_SPAN's 921.6, so the shot is untouched; it is
 * the 50vh results retreat (1280x360 and friends) that forces the widen.
 */
function podiumSpanFor(viewport: Viewport): number {
  const needed = BLOCK_HEIGHTS[1] + Math.abs(RIG_TOP) + PODIUM_TOP_PAD;
  const required = (needed * viewport.width) / (viewport.height * HORIZON_FRACTION);
  return Math.max(PODIUM_SPAN, required);
}
```

Replace the `'podium'` case and add the three new cases in `frameTarget`'s switch:

```ts
    case 'podium':
      // Frames a PLACE, not a group: the podium is at a known world x, so this
      // shot needs no anchors and cannot be thrown off by a straggler still
      // standing back at segment 2.
      return clampCamera(
        { centerX: podiumX(metrics), span: podiumSpanFor(input.viewport) },
        metrics,
      );

    case 'podiumRoom': {
      // The ceremony shot for a room: the winner AND the field that did not
      // medal, who stand at markerAnchors near the finish line — which is where
      // the podium is, so this is a genuine fit rather than a wider constant.
      const half = (BLOCK_WIDTH * 3) / 2;
      const centre = podiumX(metrics);
      const xs = [centre - half, centre + half, ...input.anchors.map(a => a.x)];
      const lo = Math.min(...xs);
      const hi = Math.max(...xs);
      const span = Math.max(hi - lo + PACK_PADDING * 2, podiumSpanFor(input.viewport));
      return clampCamera({ centerX: (lo + hi) / 2, span }, metrics);
    }

    case 'packTight':
      if (input.anchors.length === 0) return frameTarget('establishing', input);
      return fit(input.anchors, EMPHASIS_PADDING, input);

    case 'packWide':
      if (input.anchors.length === 0) return frameTarget('establishing', input);
      return fit(input.anchors, STAGE_PACK_PADDING, input);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/framing.test.ts -t "podium"`
Expected: PASS, 4 tests.

- [ ] **Step 5: Run the full unit suite, typecheck and lint**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all pass. `tests/podium.test.ts` is unaffected — `podiumX` and the block layout are untouched.

- [ ] **Step 6: Commit**

```bash
git add lib/world/framing.ts tests/framing.test.ts
git commit -m "feat: fit the podium shot to the canvas height

Where a stack compresses, the podium widens -- it has no compression
lever, because the block heights are the ceremony. A wider span means a
smaller scale, which buys the vertical room a short canvas lacks.

Only a short canvas triggers it: at full-height 16:9 the required span is
649.4 against PODIUM_SPAN's 921.6, so the shot is unchanged. It is the
50vh results retreat that was clipping the winner at screen y = -79.

Also adds packTight/packWide/podiumRoom, which task 4's stage shot book
selects."
```

---

## Task 3: Widen the run-off so the lobby grid stops overlapping

**Files:**
- Modify: `lib/world/geometry.ts:22-26` (`TRACK_MARGIN`), `:216` (`GRID_COLUMN_WIDTH`)
- Test: `tests/geometry.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `TRACK_MARGIN` 377.5 (was 260), `GRID_COLUMN_WIDTH` derived as `RIG_HALF_WIDTH * 2` (still 90).

**Background — the arithmetic, verified:** `runOff = -GRID_LEAD_IN - minX - GRID_EDGE_MARGIN` = `-40 + 260 - 67.5` = **152.5**. Eight players is 4 columns, so `spacing = min(90, 152.5/3)` = **50.8**. Before `GRID_EDGE_MARGIN` existed it was `220/3` = **73.3**. That reproduces CURRENT.md's "73 → 51" exactly.

- [ ] **Step 1: Write the failing tests**

Add to `tests/geometry.test.ts`, importing `GRID_COLUMN_WIDTH`, `gridAnchors`, `trackMetrics` as needed.

```ts
describe('the lobby grid run-off', () => {
  const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));

  /** Distinct column x positions, front to back. */
  function columns(n: number): number[] {
    return [...new Set(gridAnchors(players(n), trackMetrics(12)).map(a => a.x))]
      .sort((a, b) => b - a);
  }

  it('holds full column spacing for an eight-player grid', () => {
    const xs = columns(8);
    expect(xs).toHaveLength(4);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i - 1] - xs[i]).toBeCloseTo(GRID_COLUMN_WIDTH, 6);
    }
  });

  it('spaces columns at least a full rig width apart, so rims never overlap', () => {
    const xs = columns(8);
    expect(xs[0] - xs[1]).toBeGreaterThanOrEqual(RIG_HALF_WIDTH * 2);
  });

  it('still compresses at the twenty-player maximum, by design', () => {
    // PRD section 13's ceiling. A fixed run-off cannot hold 10 columns at full
    // width; this is a narrowed debt entry, not a retired one.
    const xs = columns(20);
    expect(xs).toHaveLength(10);
    expect(xs[0] - xs[1]).toBeCloseTo(30, 6);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/geometry.test.ts -t "run-off"`
Expected: FAIL — spacing is 50.83, not 90.

- [ ] **Step 3: Derive `GRID_COLUMN_WIDTH` from the rig**

At `lib/world/geometry.ts:216`, replace the literal:

```ts
/**
 * Maximum column spacing of the starting grid, in world units; compresses to
 * fit the run-off.
 *
 * Exactly one rig width, so adjacent same-row rigs touch and never overlap.
 * Derived rather than a literal for the same reason MARKER_ROW_HEIGHT is:
 * change the rig and this follows it.
 */
export const GRID_COLUMN_WIDTH = RIG_HALF_WIDTH * 2;
```

- [ ] **Step 4: Move and derive `TRACK_MARGIN`**

`TRACK_MARGIN` currently sits at `:25`, above `RIG_HALF_WIDTH`, `GRID_LEAD_IN` and `GRID_EDGE_MARGIN`. A `const` referencing later `const`s at module scope throws a TDZ `ReferenceError` at import time, so the declaration **must move below `GRID_EDGE_MARGIN`**. It is only read inside `trackMetrics` (`:114`), which runs after module init, so moving it is safe.

Replace the declaration at `:25` with a pointer comment:

```ts
/* TRACK_MARGIN is declared below GRID_EDGE_MARGIN — it is derived from the
   grid constants, which are themselves derived from the rig. */
```

And add, immediately after `GRID_EDGE_MARGIN`:

```ts
/**
 * Run-off beyond each end of the track, in world units.
 *
 * Sized by what STANDS in it, not by a literal. The lobby grid lives entirely
 * in the run-off, and P1 sized this against a 52-unit marker puck that P2
 * replaced with a 90-unit rig — so once GRID_EDGE_MARGIN reserved room to draw
 * the rearmost rig whole, column spacing compressed from 73 to 51 and adjacent
 * rigs overlapped by about a third of their rim.
 *
 * Four columns is eight players, the shape this is sized for. Twenty players
 * (PRD section 13's maximum) still compresses to 30 units, which a fixed
 * run-off cannot avoid.
 */
export const TRACK_MARGIN =
  GRID_LEAD_IN + GRID_EDGE_MARGIN + 3 * GRID_COLUMN_WIDTH;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/geometry.test.ts -t "run-off"`
Expected: PASS, 3 tests.

- [ ] **Step 6: Re-verify the camera, which this moves**

`minX` goes −260 → −377.5, widening world bounds by 117.5. That changes `spanLimits` and the establishing shot. Run the whole world suite plus Task 1's sweep:

Run: `npx vitest run tests/geometry.test.ts tests/framing.test.ts tests/camera.test.ts tests/podium.test.ts tests/worldDefinition.test.ts tests/zones.test.ts`
Expected: PASS. If a test asserts a literal derived from the old `-260`, update the literal and note it in the commit — do not weaken the assertion.

- [ ] **Step 7: Run the full suite, typecheck and lint**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add lib/world/geometry.ts tests/geometry.test.ts
git commit -m "fix: size the run-off for the rig that stands in it

P1 sized TRACK_MARGIN against a 52-unit marker puck; P2 replaced it with
a 90-unit rig. Once GRID_EDGE_MARGIN reserved room to draw the rearmost
rig whole, eight-player column spacing fell from 73 to 51 units and
adjacent rims overlapped by about a third.

TRACK_MARGIN and GRID_COLUMN_WIDTH are now derived from the rig rather
than literals, restoring full 90-unit spacing at eight players. Twenty
players still compresses to 30 -- a fixed run-off cannot hold ten columns,
so the debt entry is narrowed rather than retired.

TRACK_MARGIN's declaration moves below the grid constants it now reads;
at its old position it would have hit the temporal dead zone."
```

---

## Task 4: The stage shot book

**Files:**
- Modify: `lib/world/camera.ts:20-24` (`MoveStyle`, `beginMove`)
- Modify: `lib/presentation/tokens.ts:41-46` (`DURATION`)
- Modify: `app/globals.css` (`--dur-push`)
- Modify: `lib/world/director.ts`
- Modify: `lib/world/runtime.ts:123-133` (`WorldRuntimeOptions`), `:144`
- Modify: `components/PixiStage.tsx` (pass `role` into `createWorldRuntime`)
- Test: `tests/director.test.ts`, `tests/tokens.test.ts`

**Interfaces:**
- Consumes: `FramingMode` including `'packTight' | 'packWide' | 'podiumRoom'` (Task 2).
- Produces:
  - `MoveStyle = 'cut' | 'drift' | 'push'`
  - `DURATION.push = 2600`
  - `ShotBook { base: Record<Phase, CameraIntent>; finalQuestionShot: CameraIntent; overtakeHoldMs: number; finalQuestionHoldMs: number }`
  - `SHOT_BOOKS: Record<ViewerRole, ShotBook>`
  - `STAGE_DRAMA_HOLD_MS = 2200` — exported from `lib/world/director.ts`, consumed by Task 5's `LowerThird`
  - `DirectorState` gains `role: ViewerRole`
  - `seedDirector(phase: Phase, role: ViewerRole): DirectorState`
  - `WorldRuntimeOptions` gains `role: ViewerRole`

- [ ] **Step 1: Write the failing tests**

Add to `tests/director.test.ts`, importing `SHOT_BOOKS`, `STAGE_DRAMA_HOLD_MS`, `seedDirector`, `activeIntent`.

```ts
describe('the stage shot book', () => {
  const stage = (phase: Parameters<typeof seedDirector>[0]) => seedDirector(phase, 'stage');

  it('frames READ and ANSWER wider than the player view does', () => {
    expect(activeIntent(stage('read')).mode).toBe('packWide');
    expect(activeIntent(stage('answer')).mode).toBe('packWide');
    expect(activeIntent(seedDirector('read', 'player')).mode).toBe('pack');
  });

  it('takes a room shot at the ceremony instead of the tight podium', () => {
    expect(activeIntent(stage('results')).mode).toBe('podiumRoom');
    expect(activeIntent(seedDirector('results', 'player')).mode).toBe('podium');
  });

  it('pushes in slowly on the final question rather than holding the pack', () => {
    const state = reduceCue(
      stage('read'), { type: 'final-question', tier: 'finalQuestion', round: 12 }, 0,
    );
    const shot = activeIntent(state);
    expect(shot.mode).toBe('packTight');
    expect(shot.style).toBe('push');

    const player = reduceCue(
      seedDirector('read', 'player'),
      { type: 'final-question', tier: 'finalQuestion', round: 12 }, 0,
    );
    expect(activeIntent(player).style).toBe('drift');
  });

  it('holds a transient longer on stage — a room needs longer than a thumb', () => {
    expect(SHOT_BOOKS.stage.overtakeHoldMs).toBe(STAGE_DRAMA_HOLD_MS);
    expect(SHOT_BOOKS.stage.overtakeHoldMs).toBeGreaterThan(SHOT_BOOKS.player.overtakeHoldMs);
  });

  it('finishes the push-in before the final-question transient expires', () => {
    // Otherwise the escalation reads as a cut that already happened.
    expect(SHOT_BOOKS.stage.finalQuestionHoldMs).toBeGreaterThan(DURATION.push);
  });

  it('defaults to player direction, so existing state is unchanged', () => {
    expect(initialDirectorState.role).toBe('player');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/director.test.ts -t "stage shot book"`
Expected: FAIL — `seedDirector` takes one argument, `SHOT_BOOKS` is not exported.

- [ ] **Step 3: Add the `push` move style**

In `lib/presentation/tokens.ts`:

```ts
export const DURATION = {
  cut: 120,
  beat: 260,
  settle: 460,
  drift: 1400,
  /** A move slow enough to read AS a move on a TV. Stage direction only. */
  push: 2600,
} as const;
```

In `app/globals.css`, beside the other duration properties:

```css
  --dur-push: 2600ms;
```

In `lib/world/camera.ts`:

```ts
export type MoveStyle = 'cut' | 'drift' | 'push';
```

and in `beginMove`, replace the body's duration/ease selection:

```ts
  // The reduced profile keeps cuts as cuts and shortens drifts to the same
  // length, so the camera still arrives but never lingers in motion. A push is
  // a drift that takes its time; reduced collapses it the same way.
  const isCut = style === 'cut' || profile === 'reduced';
  const durationMs = isCut
    ? DURATION.cut
    : style === 'push'
      ? DURATION.push
      : DURATION.drift;
  return {
    from,
    to,
    startedAt: now,
    durationMs,
    ease: isCut ? EASE.snap : EASE.drift,
  };
```

- [ ] **Step 4: Verify the token mirror still holds**

`tests/tokens.test.ts` asserts `DURATION` matches `app/globals.css`. Run it:

Run: `npx vitest run tests/tokens.test.ts`
Expected: PASS. If it fails, `--dur-push` is missing or misspelled in `globals.css`.

- [ ] **Step 5: Introduce the shot books**

In `lib/world/director.ts`, add the `ViewerRole` import and replace `BASE_BY_PHASE` and the two hold constants:

```ts
import type { ViewerRole } from '@/lib/viewer';

/**
 * A room watching a television needs longer to FIND an overtake than a thumb
 * glancing at a 28vh strip does.
 *
 * components/LowerThird.tsx imports this for the stage surface. That sharing is
 * the point: OVERTAKE_HOLD_MS and DRAMA_HOLD_MS are equal so the camera
 * transient and the callout last the SAME LENGTH (they do not overlap — the
 * callout deliberately lands ARENA_AT_MS later, on the arena beat). Give the
 * stage a longer camera hold without giving it the matching callout hold and
 * that relationship silently breaks.
 */
export const STAGE_DRAMA_HOLD_MS = 2200;

export interface ShotBook {
  base: Record<Phase, CameraIntent>;
  /** The shot the `final-question` cue punches in. */
  finalQuestionShot: CameraIntent;
  overtakeHoldMs: number;
  finalQuestionHoldMs: number;
}

const PLAYER_SHOTS: ShotBook = {
  base: {
    lobby: intent('startLine', 'drift'),
    countdown: intent('establishing', 'drift'),
    read: intent('pack', 'drift'),
    answer: intent('pack', 'drift'),
    // The reveal holds whatever shot the answer phase left; see reduceCue.
    reveal: intent('pack', 'drift'),
    track: intent('pack', 'cut'),
    // A cut to the podium is the broadcast move; a drift is a screensaver.
    results: intent('podium', 'cut'),
  },
  finalQuestionShot: intent('pack', 'drift', 'finalQuestion'),
  overtakeHoldMs: DRAMA_HOLD_MS,
  finalQuestionHoldMs: 2000,
};

/**
 * On a phone the world is a strip behind a question card, so a tight pack shot
 * is right. On a TV the world is the entire backdrop with the question laid
 * over it, and the same shot reads as a cropped detail instead of a wide.
 */
const STAGE_SHOTS: ShotBook = {
  base: {
    lobby: intent('startLine', 'drift'),
    countdown: intent('establishing', 'drift'),
    read: intent('packWide', 'drift'),
    answer: intent('packWide', 'drift'),
    reveal: intent('packWide', 'drift'),
    track: intent('packWide', 'cut'),
    results: intent('podiumRoom', 'cut'),
  },
  // Roadmap P1 named a slow push-in for the final question and it was never
  // built: today's transient is pack/drift over a pack base, i.e. a no-op.
  finalQuestionShot: intent('packTight', 'push', 'finalQuestion'),
  overtakeHoldMs: STAGE_DRAMA_HOLD_MS,
  finalQuestionHoldMs: 3200,
};

export const SHOT_BOOKS: Record<ViewerRole, ShotBook> = {
  player: PLAYER_SHOTS,
  stage: STAGE_SHOTS,
};
```

Delete the old `OVERTAKE_HOLD_MS` / `FINAL_QUESTION_HOLD_MS` exports only after Step 6 updates their uses; `tests/director.test.ts` imports `FINAL_QUESTION_HOLD_MS`, so keep it as `export const FINAL_QUESTION_HOLD_MS = PLAYER_SHOTS.finalQuestionHoldMs;`.

- [ ] **Step 6: Make the reducer role-aware**

```ts
export interface DirectorState {
  base: CameraIntent;
  transient: TransientIntent | null;
  /** 0..1; 1 during the final question. Drives the grade, not the camera. */
  escalation: number;
  /** Which shot book this client is directed by. Set once, at seed. */
  role: ViewerRole;
}

export const initialDirectorState: DirectorState = {
  base: PLAYER_SHOTS.base.lobby,
  transient: null,
  escalation: 0,
  role: 'player',
};

/** Base intent for a client that joined or reloaded mid-game. */
export function seedDirector(phase: Phase, role: ViewerRole = 'player'): DirectorState {
  return { ...initialDirectorState, role, base: SHOT_BOOKS[role].base[phase] };
}
```

In `reduceCue`, take the book from state once at the top and replace every `BASE_BY_PHASE.x` with `shots.base.x`, `OVERTAKE_HOLD_MS` with `shots.overtakeHoldMs`, and `FINAL_QUESTION_HOLD_MS` with `shots.finalQuestionHoldMs`:

```ts
export function reduceCue(state: DirectorState, cue: Cue, now: number): DirectorState {
  const shots = SHOT_BOOKS[state.role];
  switch (cue.type) {
    case 'phase-countdown':
      return { ...state, base: shots.base.countdown, escalation: 0 };
    ...
    case 'final-question':
      return {
        ...withTransient(state, shots.finalQuestionShot, shots.finalQuestionHoldMs, now),
        escalation: 1,
      };
```

- [ ] **Step 7: Thread `role` into the runtime**

In `lib/world/runtime.ts`, add to `WorldRuntimeOptions`:

```ts
  /** Selects the shot book. A TV is directed differently from a phone. */
  role: ViewerRole;
```

and at `:144`:

```ts
  let director: DirectorState = seedDirector(
    useGameStore.getState().room?.phase ?? 'lobby',
    options.role,
  );
```

In `components/PixiStage.tsx`, pass it at the `createWorldRuntime` call — the component already holds `role` as a prop.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/director.test.ts`
Expected: PASS, including all ~20 pre-existing assertions, which still exercise player direction through `initialDirectorState`.

- [ ] **Step 9: Run the full suite, typecheck and lint**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add lib/world/director.ts lib/world/camera.ts lib/world/runtime.ts lib/presentation/tokens.ts app/globals.css components/PixiStage.tsx tests/director.test.ts
git commit -m "feat: give the stage its own camera shot book

BASE_BY_PHASE was player-view direction reused verbatim on a television.
It becomes a ShotBook selected by ViewerRole: wider READ/ANSWER, a slow
push-in on the final question that roadmap P1 named and nobody built, a
podiumRoom ceremony shot, and longer transient holds.

STAGE_DRAMA_HOLD_MS is exported because LowerThird must import it. The
camera transient and the callout share one hold DURATION (they do not
overlap -- the callout lands ARENA_AT_MS later); lengthening one without
the other breaks that quietly. director.ts's comment said 'expire
together', which was misleading, and is corrected."
```

---

## Task 5: The title-safe broadcast frame

**Files:**
- Modify: `app/globals.css`
- Modify: `components/LowerThird.tsx`
- Modify: `components/stage/StageBroadcast.tsx`
- Test: `tests/tokens.test.ts`, `e2e/stage.spec.ts`

**Interfaces:**
- Consumes: `STAGE_DRAMA_HOLD_MS` (Task 4).
- Produces:
  - `LowerThird` accepts `variant?: 'card' | 'strip'` (default `'card'`)
  - The stage root carries `data-surface="stage"` and `data-testid="stage-broadcast"`
  - New test hooks: `data-testid="stage-floor"` on the options row, `data-variant` on the callout

- [ ] **Step 1: Write the failing token test for the horizon**

The callout strip must sit on the world's ground line, and `HORIZON_FRACTION` is a TypeScript constant. Add to `tests/tokens.test.ts`:

```ts
import { HORIZON_FRACTION } from '@/lib/world/geometry';

describe('the horizon is mirrored so DOM chrome can sit on the ground line', () => {
  it('--horizon-fraction matches geometry.ts', () => {
    expect(Number(cssVar('horizon-fraction'))).toBeCloseTo(HORIZON_FRACTION, 6);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/tokens.test.ts -t "horizon"`
Expected: FAIL — `--horizon-fraction is not defined in app/globals.css`.

- [ ] **Step 3: Add the horizon token and the stage scale block**

In `app/globals.css`, inside `@theme`:

```css
  /* Ground line as a fraction of canvas height. Mirrors HORIZON_FRACTION in
     lib/world/geometry.ts so DOM chrome can be pinned to the world's horizon;
     tests/tokens.test.ts fails if the two drift. */
  --horizon-fraction: 0.72;
```

Then, after the `@theme` block:

```css
/* ---------------------------------------------------------------------------
   The stage surface (P6b).

   ACTION AT A DISTANCE, ON PURPOSE. Every Tailwind v4 utility resolves through
   a theme variable -- `.p-8` is `calc(var(--spacing) * 8)`, `.text-hero` is
   `var(--text-hero)`, `.max-w-6xl` is `var(--container-6xl)`. Overriding those
   variables in this scope rescales type, spacing and container widths across
   StageQuestion, StageOptions, RevealPanel, WinnerCard and ResultsTable with no
   edits to any of them.

   The cost: INSIDE THIS SCOPE, `p-8` does not mean what it means anywhere else
   in the app. That is the trade for one type scale instead of two -- a parallel
   --stage-* namespace would have needed a variant prop or a stage-only copy of
   every shared component.

   Sized in cqi, so the unit is the stage container, not the window.
--------------------------------------------------------------------------- */
[data-surface='stage'] {
  container-type: size;

  --spacing: clamp(0.25rem, 0.3cqi, 0.5rem);
  --text-hero: clamp(2.25rem, 3.6cqi, 5rem);
  --text-display: clamp(4rem, 6.2cqi, 9rem);
  --container-4xl: 78cqi;
  --container-6xl: 90cqi;
}
```

- [ ] **Step 4: Run the token test to verify it passes**

Run: `npx vitest run tests/tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Give `LowerThird` its strip variant**

In `components/LowerThird.tsx`, import the stage hold and add the prop:

```ts
import { STAGE_DRAMA_HOLD_MS } from '@/lib/world/director';

export default function LowerThird({ variant = 'card' }: { variant?: 'card' | 'strip' } = {}) {
  const callout = useStaging(s => s.callout);
  const [visible, setVisible] = useState(false);
  const holdMs = variant === 'strip' ? STAGE_DRAMA_HOLD_MS : DRAMA_HOLD_MS;
```

Use `holdMs` in the hide timer, and add it to the effect's dependency array:

```ts
    const show = setTimeout(() => setVisible(true), ARENA_AT_MS);
    const hide = setTimeout(() => setVisible(false), ARENA_AT_MS + holdMs);
```
```ts
  }, [callout, holdMs]);
```

Replace the returned element's className and add the variant hook. The strip is full-bleed by design — a broadcast lower third runs to the edge, so it breaks out of the stage root's 5% title-safe inset with a negative margin:

```tsx
        <motion.div
          key={callout.headline}
          data-testid="lower-third"
          data-kind={callout.kind}
          data-variant={variant}
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0, transition: { duration: 0.34, ease: EASE.settle } }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          className={
            variant === 'strip'
              ? `pointer-events-none mx-[-5.26%] flex items-center gap-4 border-y
                 border-white/10 bg-linear-to-r from-abyss/95 via-abyss/85 to-transparent
                 py-4 pl-[5%] backdrop-blur-md
                 ${isFinal ? 'border-warning/60 from-warning/25 via-warning/10' : ''}`
              : `pointer-events-none mx-auto rounded-panel border backdrop-blur-md
                 ${isFinal
                   ? 'w-full border-warning/60 bg-warning/15 px-6 py-4 text-center'
                   : 'border-haze/50 bg-abyss/80 px-5 py-3'}`
          }
        >
```

`-mx-[5.26%]` is the inverse of a 5% inset (`0.05 / 0.95` = 5.26%), which is what cancels the parent's padding rather than merely reducing it.

Inside, the strip gets the accent bar and two-line block:

```tsx
          {variant === 'strip' && (
            <span
              aria-hidden="true"
              className={`h-10 w-1 shrink-0 ${isFinal ? 'bg-warning' : 'bg-neon-cyan'}`}
              style={{ boxShadow: '0 0 24px currentColor' }}
            />
          )}
          <p
            className={`font-display font-black uppercase tracking-[0.14em]
              ${isFinal ? 'text-hero text-warning' : variant === 'strip' ? 'text-hero text-ink' : 'text-sm text-ink'}`}
          >
            {callout.headline}
          </p>
```

- [ ] **Step 6: Recompose `StageBroadcast` as a title-safe frame**

In `components/stage/StageBroadcast.tsx`, replace the non-results return. The status bar stays top-left, the question is pinned high, the callout strip sits on the horizon, and the answers move to the floor.

```tsx
  return (
    <div
      data-testid="stage-broadcast"
      data-beat={beat}
      data-surface="stage"
      className="pointer-events-none fixed inset-0 z-10 p-[5%]"
    >
      <header className="flex items-start justify-between gap-6">
        <div className="flex items-center gap-3 font-display text-sm font-bold uppercase tracking-[0.14em]">
          {room && room.status !== 'lobby' && (
            <span className="text-ink-mute tabular-nums">
              Round {room.round}/{room.total_rounds}
            </span>
          )}
          {cat && (
            <span className="rounded-full border border-white/10 bg-haze/45 px-3 py-1.5 text-ink-dim">
              {cat.emoji} {cat.label}
            </span>
          )}
          {question && (
            <span className="rounded-full border border-warning/35 bg-warning/10 px-3 py-1.5 text-warning">
              {TIER_NAMES[question.tier]}
            </span>
          )}
        </div>
        {beat === 'answer' && <TimerRing />}
      </header>

      {/*
        The prompt sits high under the status bar rather than stacked above the
        answers, so the pack stays visible through the whole beat. On a phone
        the world is a strip behind a card; here it IS the backdrop.
      */}
      <div className="mt-[4cqh] flex flex-col items-center gap-6">
        {beat === 'idle' && room?.status === 'lobby' && <StageJoinPanel code={code} />}
        {beat === 'countdown' && <StageCountdown endsAt={room?.ends_at ?? null} />}
        {question && (beat === 'read' || beat === 'answer' || beat === 'reveal') && (
          <StageQuestion question={question} steps={steps} />
        )}
      </div>

      {/*
        Pinned to the world's ground line (--horizon-fraction mirrors
        HORIZON_FRACTION), translated up so the strip SITS on the horizon
        rather than straddling it.
      */}
      <div
        data-testid="stage-horizon"
        className="absolute inset-x-0 -translate-y-full"
        style={{ top: `calc(100% * var(--horizon-fraction))` }}
      >
        <LowerThird variant="strip" />
      </div>

      {/*
        The floor. Height is reserved from READ onward so the reveal can grow
        into it without reflowing (ADR-0019) — see StageOptions.
      */}
      <div
        data-testid="stage-floor"
        className="absolute inset-x-[5%] bottom-[5%] flex flex-col gap-4"
      >
        {question && (beat === 'read' || beat === 'answer' || beat === 'reveal') && (
          <>
            <AnimatePresence initial={false}>
              {steps.options && (
                <StageOptions
                  key="stage-options"
                  options={question.options}
                  mode={steps.optionsMode}
                  rows={rows}
                  revealSteps={revealSteps}
                />
              )}
            </AnimatePresence>
            {beat === 'reveal' && reveal && (
              <RevealPanel reveal={reveal} question={question} steps={revealSteps} />
            )}
          </>
        )}
      </div>
    </div>
  );
```

Also add `data-surface="stage"` to the `beat === 'results'` branch's root div, so the ceremony board rescales too.

> **Do not remove the `AnimatePresence initial={false}` wrapper.** `steps` is derived from the server deadline, so a stage view opening mid-READ gets `steps.options` already true. Without the guard the entrance replays on every reload — CURRENT.md tracks four occurrences of this exact trap.

- [ ] **Step 7: Write the e2e assertions**

Add to `e2e/stage.spec.ts`, inside the existing live-game test after the stage view reaches the read beat:

```ts
  // The broadcast frame: prompt high, answers on the floor, strip on the horizon.
  const frame = stage.getByTestId('stage-broadcast');
  await expect(frame).toHaveAttribute('data-surface', 'stage');

  const floor = stage.getByTestId('stage-floor');
  const question = stage.getByTestId('stage-question');
  const floorBox = await floor.boundingBox();
  const questionBox = await question.boundingBox();
  expect(floorBox).not.toBeNull();
  expect(questionBox).not.toBeNull();
  // The answers sit below the prompt, not stacked immediately under it.
  expect(floorBox!.y).toBeGreaterThan(questionBox!.y + questionBox!.height);

  // Title-safe: the frame's own padding keeps the status bar off the bezel.
  const viewport = stage.viewportSize()!;
  const header = stage.locator('[data-testid="stage-broadcast"] header');
  const headerBox = await header.boundingBox();
  expect(headerBox!.x).toBeGreaterThanOrEqual(viewport.width * 0.04);
```

- [ ] **Step 8: Run the e2e suite**

Run: `npm run test:e2e -- --workers=2 e2e/stage.spec.ts`
Expected: PASS.

- [ ] **Step 9: Typecheck, lint, full unit suite**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add app/globals.css components/LowerThird.tsx components/stage/StageBroadcast.tsx tests/tokens.test.ts e2e/stage.spec.ts
git commit -m "feat: compose the stage as a title-safe broadcast frame

StageBroadcast's centred max-w-6xl column was portrait logic inherited
from StageShell: on a wide TV it left the world as a strip along the top,
the same relationship the 28vh player view has, merely inverted.

Now the prompt sits high, the answers sit on the floor, and the callout
is a full-bleed strip on the world's ground line -- so the pack stays
visible through the beat.

The surface rescales by overriding existing theme vars in a
[data-surface=stage] scope. Every Tailwind v4 utility reads a var, so
shared components rescale untouched. Inside that scope p-8 does not mean
what it means elsewhere; globals.css says so at the block."
```

---

## Task 6: The reveal fills columns

**Files:**
- Modify: `components/stage/StageOptions.tsx`
- Test: `e2e/stage.spec.ts`

**Interfaces:**
- Consumes: `data-testid="stage-floor"` (Task 5).
- Produces: `data-testid="stage-option"` keeps `data-index` / `data-correct`; adds `data-share` carrying the rounded share percentage.

**Why columns:** at a fifth of the screen wide, a horizontal share fill plus an `AvatarStack` plus a count does not fit. Four side-by-side columns are already a bar chart, and letting the share fill them bottom-up honours ADR-0019 more literally than today's treatment — **no element changes position, only height.**

- [ ] **Step 1: Write the failing e2e assertion**

Add to `e2e/stage.spec.ts`, after the reveal lands:

```ts
  // ADR-0019: the options transform IN PLACE. Capture the row's geometry
  // during ANSWER and assert it is unchanged once the distribution is drawn.
  const optionBefore = await stage.getByTestId('stage-option').first().boundingBox();

  // ... advance to the reveal ...

  const revealed = stage.getByTestId('stage-option').first();
  await expect(revealed).toHaveAttribute('data-share', /\d+/);
  const optionAfter = await revealed.boundingBox();
  expect(optionAfter!.x).toBeCloseTo(optionBefore!.x, 0);
  expect(optionAfter!.y).toBeCloseTo(optionBefore!.y, 0);
  expect(optionAfter!.height).toBeCloseTo(optionBefore!.height, 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:e2e -- --workers=2 e2e/stage.spec.ts`
Expected: FAIL — no `data-share` attribute.

- [ ] **Step 3: Rebuild `StageOptions` as a floor row**

Replace the component body. The grid is four columns at every stage width, and the row reserves its full height from READ so the reveal grows into reserved space.

```tsx
export default function StageOptions({
  options, mode, rows, revealSteps,
}: {
  options: string[];
  /** 'live' only during ANSWER: the server phase is the sole authority. */
  mode: OptionsMode;
  /** Present only in 'result' mode. */
  rows?: DistributionRow[];
  revealSteps?: RevealSteps;
}) {
  return (
    <motion.div
      /*
        Height is RESERVED, not grown. The distribution fills each column
        bottom-up at the reveal, and a row that resized then would move the
        answers at the most dramatic moment of the beat — exactly what
        ADR-0019 forbids.
      */
      className="grid h-[26cqh] grid-cols-4 gap-4"
      initial="hidden"
      animate="shown"
      variants={{ shown: { transition: { staggerChildren: READ_OPTION_STAGGER / 1000 } } }}
    >
      {options.map((opt, i) => {
        const { glyph, accent } = OPTION_IDENTITIES[i];
        const result = mode === 'result' ? rows?.[i] : undefined;
        const isCorrect = result?.correct ?? false;
        const targetOpacity = result ? (isCorrect ? 1 : 0.62) : mode === 'live' ? 1 : 0.55;
        const share = revealSteps?.rows ? (result?.share ?? 0) : 0;

        return (
          <motion.div
            key={i}
            data-testid="stage-option"
            data-index={i}
            data-correct={isCorrect ? 'true' : undefined}
            data-share={result ? Math.round((result.share ?? 0) * 100) : undefined}
            variants={{ hidden: { opacity: 0, y: 14 }, shown: { opacity: targetOpacity, y: 0 } }}
            className={`relative flex flex-col justify-end overflow-hidden rounded-panel
              border border-white/10 border-l-4 bg-night/60 p-4 text-left font-semibold
              text-ink backdrop-blur-md transition-[border-color] duration-(--dur-cut) ease-snap`}
            style={{
              borderLeftColor: accent,
              backgroundColor: isCorrect
                ? 'color-mix(in oklab, var(--color-correct) 16%, transparent)'
                : undefined,
            }}
          >
            {/*
              The share as COLUMN HEIGHT. A room reads relative heights across a
              room faster than it reads four numbers.
            */}
            {result && (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 -z-10 transition-[height] duration-(--dur-beat) ease-snap"
                style={{
                  height: `${share * 100}%`,
                  backgroundColor: `color-mix(in oklab, ${isCorrect ? 'var(--color-correct)' : accent} 16%, transparent)`,
                }}
              />
            )}

            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid h-12 w-12 shrink-0 place-items-center rounded-control text-xl"
                style={{
                  backgroundColor: `color-mix(in oklab, ${accent} 14%, transparent)`,
                  color: accent,
                }}
              >
                {glyph}
              </span>
              <span className="min-w-0 flex-1 text-2xl leading-tight">{opt}</span>
            </div>

            {result && (
              <div className="mt-3 flex items-center justify-between gap-2">
                <AvatarStack
                  avatars={result.avatars}
                  overflow={result.overflow}
                  show={revealSteps?.stacks ?? false}
                />
                <span className="shrink-0 font-display text-3xl font-black tabular-nums text-ink-dim">
                  {result.count}
                </span>
              </div>
            )}
          </motion.div>
        );
      })}
    </motion.div>
  );
}
```

> **ADR-0017 check, do not skip:** `opacity` is animated by the `variants` prop, so it must **not** appear as a Tailwind class on this element — the inline animated style outranks the class regardless of specificity. The old `transition-[opacity,border-color]` class is therefore reduced to `transition-[border-color]`, and `height` on the fill is a plain CSS transition rather than a `motion` target, so the two never fight over the same property.

- [ ] **Step 4: Run the e2e suite to verify it passes**

Run: `npm run test:e2e -- --workers=2 e2e/stage.spec.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, unit suite**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: all pass. `tests/distribution.test.ts` is untouched — `distributionRows` is unchanged.

- [ ] **Step 6: Commit**

```bash
git add components/stage/StageOptions.tsx e2e/stage.spec.ts
git commit -m "feat: reveal the distribution as columns on the stage floor

At a fifth of the screen wide, a horizontal share fill plus an avatar
stack plus a count does not fit. Four side-by-side columns are already a
bar chart, so the share fills them bottom-up instead: a room reads
relative heights from across the room faster than four numbers, and the
faces stay, which is the part of the reveal that gets a laugh.

Honours ADR-0019 more literally than the horizontal treatment did --
nothing changes position, only height. The row reserves its full height
from READ so the reveal grows into reserved space."
```

---

## Task 7: Split the ceremony, and seed the confetti budget

**Files:**
- Modify: `lib/world/vfxBudget.ts`
- Modify: `lib/world/runtime.ts:148`
- Modify: `components/PixiStage.tsx:38-62`, `:160-172`
- Modify: `components/stage/StageBroadcast.tsx` (results branch)
- Modify: `components/stage/StageResults.tsx`
- Test: `tests/vfxBudget.test.ts`, `e2e/stage.spec.ts`

**Interfaces:**
- Consumes: `role: ViewerRole` on `WorldRuntimeOptions` (Task 4).
- Produces:
  - `initialBudgetFor(profile: Profile): BudgetState` — exported from `lib/world/vfxBudget.ts`
  - `--ceremony-panel` custom property, set on `documentElement` by `PixiStage` for the stage role only

- [ ] **Step 1: Write the failing budget test**

Add to `tests/vfxBudget.test.ts`:

```ts
describe('initialBudgetFor', () => {
  it('starts a reduced client at minimal, not full', () => {
    // A one-shot burst (confetti) fired before the first ~500ms tick has no
    // chance to self-correct the way continuous emitters do. A TV switched on
    // late lands mid-ceremony, which is the normal way to hit this.
    expect(initialBudgetFor('reduced')).toEqual({ level: 'minimal', cleanRuns: 0 });
  });

  it('starts every other profile where it starts today', () => {
    expect(initialBudgetFor('high')).toEqual(initialBudgetState);
  });

  it('agrees with what stepBudget would decide on its first tick', () => {
    for (const profile of ['high', 'reduced'] as const) {
      expect(stepBudget(initialBudgetFor(profile), { samples: 0, dropped: 0 }, profile))
        .toEqual(initialBudgetFor(profile));
    }
  });
});
```

`Profile` is `'high' | 'reduced'` (`lib/presentation/profile.ts:9`), so those two members are the whole union.

- [ ] **Step 2: Run it to verify it fails, then implement**

Run: `npx vitest run tests/vfxBudget.test.ts -t "initialBudgetFor"`
Expected: FAIL — not exported.

In `lib/world/vfxBudget.ts`, beside `initialBudgetState`:

```ts
/**
 * Where a client's budget STARTS, given its profile.
 *
 * `initialBudgetState` is always `full`, and every continuous emitter
 * self-corrects invisibly inside the ~500ms before the first `stepBudget`
 * tick. Confetti is one-shot: a client mounting straight into an
 * already-elapsed ceremony past CONFETTI_AT fires once, at whatever density
 * it happened to start with, and never gets a second chance.
 *
 * Mirrors stepBudget's own ceiling rule rather than inventing a second
 * mapping, so the seed and the first tick cannot disagree.
 */
export function initialBudgetFor(profile: Profile): BudgetState {
  if (profile === 'reduced') return { level: 'minimal', cleanRuns: 0 };
  return initialBudgetState;
}
```

In `lib/world/runtime.ts:148`:

```ts
  let budget: BudgetState = initialBudgetFor(options.profile);
```

- [ ] **Step 3: Run the budget test to verify it passes**

Run: `npx vitest run tests/vfxBudget.test.ts`
Expected: PASS.

- [ ] **Step 4: Make the ceremony band role-aware in `PixiStage`**

The player view keeps its vertical retreat unchanged. The stage keeps full height and narrows instead — which is why the stage never produces the 32:9 canvas that caused the podium clip in the first place.

Replace the band effect:

```tsx
  /**
   * The results band is the only one that MOVES within its phase, which is why
   * it is a custom property rather than a class (ADR-0015).
   *
   * The two surfaces move on DIFFERENT AXES. A player device retreats
   * vertically, halving the canvas height. A television splits horizontally
   * instead: the canvas keeps its full height and yields WIDTH to the board.
   * That is not just composition — a 1920x1080 TV mid-ceremony would otherwise
   * be a 1920x540 canvas, i.e. 32:9, which is precisely the shape the podium
   * shot had to be rescued from.
   */
  useEffect(() => {
    const root = document.documentElement;
    if (band !== 'podium') {
      root.style.removeProperty('--ceremony-band');
      root.style.removeProperty('--ceremony-panel');
      return;
    }
    if (role === 'stage') {
      root.style.setProperty('--ceremony-panel', board ? '56%' : '100%');
      return () => { root.style.removeProperty('--ceremony-panel'); };
    }
    root.style.setProperty('--ceremony-band', board ? '50vh' : '100vh');
    return () => { root.style.removeProperty('--ceremony-band'); };
  }, [band, board, role]);
```

And the host element's className, so the stage canvas keeps its height and animates width:

```tsx
      className={`pointer-events-none fixed left-0 top-0 z-0 transition-[height,width] duration-(--dur-settle) ease-settle ${
        band === 'podium' && role === 'stage'
          ? 'h-screen w-(--ceremony-panel)'
          : band === 'podium'
            ? 'h-(--ceremony-band) w-full'
            : band === 'strip'
              ? 'h-[28vh] w-full portrait:h-[28vh] landscape:h-screen'
              : 'h-screen w-full'
      }`}
```

> `inset-x-0` is replaced by `left-0` plus an explicit width, because the panel must shrink from the right rather than stay pinned to both edges.

- [ ] **Step 5: Move the stage's results board into the right-hand column**

In `components/stage/StageBroadcast.tsx`, replace the `beat === 'results'` branch. The board no longer needs a top spacer — it needs a left one, and it gets it by being positioned beside the panel:

```tsx
  if (beat === 'results') {
    return (
      <div
        data-testid="stage-broadcast"
        data-beat={beat}
        data-surface="stage"
        className="fixed inset-y-0 right-0 z-10 overflow-y-auto p-[5%]
          transition-[width] duration-(--dur-settle) ease-settle"
        style={{ width: 'calc(100% - var(--ceremony-panel, 100%))' }}
      >
        <StageResults />
      </div>
    );
  }
```

The `0px` fallback becomes `100%`: a client with no canvas at all gets the full width and the whole board immediately, which is the same intent the old `0px` height fallback had.

- [ ] **Step 6: Centre the board in its column**

In `components/stage/StageResults.tsx`, replace the wrapper className so it fills the column vertically instead of being capped at `max-w-4xl`:

```tsx
    <div
      data-testid="stage-results"
      data-entered={show ? 'true' : 'false'}
      className="flex h-full w-full flex-col justify-center gap-6"
    >
```

> Leave the `settled` lazy initializer exactly as it is. `lib/ceremony/runtime.ts` publishes from a `requestAnimationFrame` tick started in an effect, so `steps.board` reads false on first render even for a ceremony that ended minutes ago — and a TV switched on late is the normal case here (ADR-0030).

- [ ] **Step 7: Write the e2e assertion for the split**

Add to `e2e/stage.spec.ts`, once the game reaches results and the board has landed:

```ts
  // The stage splits horizontally: the canvas keeps full height and yields width.
  const canvas = stage.getByTestId('pixi-stage');
  const board = stage.getByTestId('stage-results');
  await expect(board).toHaveAttribute('data-entered', 'true');

  const viewport = stage.viewportSize()!;
  const canvasBox = await canvas.boundingBox();
  const boardBox = await board.boundingBox();

  // Full height, not retreated.
  expect(canvasBox!.height).toBeCloseTo(viewport.height, 0);
  // Board sits to the RIGHT of the canvas, never over it.
  expect(boardBox!.x).toBeGreaterThanOrEqual(canvasBox!.x + canvasBox!.width - 1);
```

- [ ] **Step 8: Run e2e, typecheck, lint, unit suite**

Run: `npm run test:e2e -- --workers=2 e2e/stage.spec.ts && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: all pass. `e2e/game-flow.spec.ts` covers the player ceremony and must still pass unchanged — the player retreat is untouched.

- [ ] **Step 9: Commit**

```bash
git add lib/world/vfxBudget.ts lib/world/runtime.ts components/PixiStage.tsx components/stage/StageBroadcast.tsx components/stage/StageResults.tsx tests/vfxBudget.test.ts e2e/stage.spec.ts
git commit -m "feat: split the stage ceremony horizontally, seed the vfx budget

The 50vh retreat was inherited from the player view and is the direct
cause of the podium clip: a 1920x1080 TV mid-ceremony becomes a 1920x540
canvas, i.e. 32:9. On the stage the canvas now keeps full height and
yields WIDTH instead, so the worst case stops existing there. The player
view's retreat is untouched, which is where the vertical fit still earns
its keep.

Board and podium still cannot overlap by construction -- StageResults
consumes the same published property (ADR-0015), now a width.

Also seeds the VFX budget from profile at construction. Confetti is the
one one-shot consumer, so a client mounting into an already-elapsed
ceremony had no chance to self-correct. A TV switched on late is the
normal way to hit it."
```

---

## Task 8: Live verification, ADRs, and the phase record

**Files:**
- Create: `docs/ADR/0033-the-vertical-framing-contract-is-two-levers.md`
- Create: `docs/ADR/0034-the-stage-ceremony-splits-horizontally.md`
- Create: `docs/ADR/0035-the-stage-rescales-by-scoped-token-override.md`
- Create: `docs/ADR/0036-the-shot-book-is-role-selected.md`
- Create: `docs/progress/P6b-broadcast-direction.md`
- Modify: `docs/progress/CURRENT.md`

> 0031 and 0032 are already taken by P6a (`the-viewer-role-is-explicit`, `the-stage-view-is-composed-not-configured`). Re-run `ls docs/ADR/` before creating files in case anything else landed first.

- [ ] **Step 1: Run every gate**

```bash
npx tsc --noEmit
npm run lint
npx vitest run
npm run build
npm run test:e2e -- --workers=2
```
Expected: all pass; lint reports zero problems.

- [ ] **Step 2: Headed check at 1920×1080**

Start the dev server (`npm run dev`) and drive a full game with a **headed** browser at 1920×1080. Headless Chromium falls back to SwiftShader and pins the VFX budget at `minimal`, so it cannot verify any of this.

Confirm and record:
- READ/ANSWER framing is visibly wider than the player view's.
- The final question pushes in slowly and is still moving when the callout lands.
- An overtake callout is a full-bleed strip on the horizon and holds noticeably longer than on a phone.
- The reveal fills columns without any answer changing position.
- At the ceremony the canvas keeps full height and narrows; the board arrives on the right; the winner's rig is **not** clipped.

- [ ] **Step 3: Headed check at 2560×1080 and 3440×1440**

Repeat Step 2 at both ultrawide sizes. The specific thing these prove that 16:9 cannot: **a deep tie stack is fully on canvas.** Force one by driving a round where four or more players finish level.

- [ ] **Step 4: Headed check of the player ceremony**

At 1920×1080, play to results in the **player** view (`/room/<code>`), which still retreats to 50vh. Confirm the winner's podium rig is unclipped — this is the surface the vertical fit exists for, and CURRENT.md has recorded it clipping since P5a.

- [ ] **Step 5: Headed check of the late-mount confetti**

Reload the stage view directly into an already-elapsed ceremony past `CONFETTI_AT` (4100ms) under a reduced profile. Confirm confetti density matches the profile rather than bursting full.

- [ ] **Step 6: Headed check of the eight-player lobby**

Join eight players and confirm adjacent same-row rigs no longer overlap.

- [ ] **Step 7: Write the four ADRs**

Follow the convention in `docs/ADR/README.md`. Each covers, at minimum:

1. **0031 — the vertical framing contract is two levers.** `headroom` as the missing quantity; why stacks compress and the podium widens; why ADR-0005's rejection of widening-for-ties still stands; why the limit is derived at `MIN_SPAN` (no circularity); the floor's honest trade — clip but report.
2. **0032 — the stage ceremony splits horizontally.** Why the axis differs by surface; that this removes the stage's 32:9 case *without* making the podium fit redundant, because the player retreat remains; that the podium renders smaller and that is the intended room shot.
3. **0033 — the stage rescales by scoped token override.** Tailwind v4 utilities all resolve through theme vars; one scale instead of two; the action-at-a-distance cost, stated plainly; why a parallel `--stage-*` namespace was rejected.
4. **0034 — the shot book is role-selected.** One reducer, not two; `role` on `DirectorState`; and the shared-hold invariant — the camera transient and the callout share one *duration*, and `STAGE_DRAMA_HOLD_MS` is exported so `LowerThird` cannot drift from it.

- [ ] **Step 8: Write `docs/progress/P6b-broadcast-direction.md`**

Match the structure of `docs/progress/P6a-stage-view.md`: scope, what was built, deviations, verification results (with the measured numbers from Steps 2–6), and anything discovered but left alone.

Record explicitly:
- The plan split spec §1's task 1 into two tasks.
- `director.ts`'s "expire together" comment was misleading and was corrected to "share one hold duration".
- The 20-player grid still compresses to 30 units — the `TRACK_MARGIN` debt is **narrowed, not retired**.

- [ ] **Step 9: Update `docs/progress/CURRENT.md`**

- Remove the P6b "next up" entry; set the current phase to none in progress with P6b as last completed.
- **Remove** the podium-clip entry and the `MAX_STACK_RISE` entry from tech debt — both are fixed.
- **Remove** the confetti budget entry — fixed.
- **Rewrite** the `TRACK_MARGIN` entry to say the eight-player grid is fixed and only the twenty-player compression remains.
- **Leave** the off-screen-marker-direction entry and the `advance_phase` 400 entry exactly as they are.
- Add a note describing the `[data-surface="stage"]` scope, so the next person to touch a shared component knows spacing and type mean something different inside it.

- [ ] **Step 10: Verify documentation diagnostics and commit**

Run `mcp__ide__getDiagnostics` on every touched file, markdown included, before committing.

```bash
git add docs/ADR/ docs/progress/
git commit -m "docs: record P6b, its ADRs, and the debt it closes

Four ADRs: the two-lever vertical framing contract, the stage ceremony's
horizontal split, the scoped token override that rescales the surface,
and the role-selected shot book with its shared-hold invariant.

Closes the podium-clip, MAX_STACK_RISE and confetti-budget debt entries.
Narrows the TRACK_MARGIN entry to the twenty-player case, which a fixed
run-off cannot fix."
```

- [ ] **Step 11: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill: merge to `main`, push to GitHub, and clean up the worktree.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §3.1 `headroom` | 1 |
| §3.2 stacks compress | 1 |
| §3.3 the floor trade | 1 (sweep asserts both branches) |
| §3.4 podium widens | 2 |
| §4.1 wider READ/ANSWER | 2 (modes), 4 (selection) |
| §4.2 push-in | 4 |
| §4.3 shared hold invariant | 4 (export), 5 (`LowerThird` consumes) |
| §4.4 `podiumRoom` | 2 (mode), 4 (selection) |
| §5.1 scoped token override | 5 |
| §5.2 `--horizon-fraction` | 5 |
| §5.3 `LowerThird` variant | 5 |
| §6 reveal as columns | 6 |
| §7 ceremony split | 7 |
| §8.1 `TRACK_MARGIN` | 3 |
| §8.2 confetti seed | 7 |
| §11.1 unit sweep | 1, 2, 3 |
| §11.2 headed checks | 8 |
| §11.3 gates | 8 (and every task) |
| §13 exit criteria 1–10 | all |
| §14 ADRs | 8 |

No gaps.

**Type consistency:** `stackRiseLimit(viewport)` returns `number` and is consumed as a number by `stackPitch`, `markerAnchors`, `startLineAnchors`, `gridAnchors`, `podiumAnchors`, `fieldAnchors` — one name, one type, defaulted to `MAX_STACK_RISE` at every boundary. `STAGE_DRAMA_HOLD_MS` is defined in Task 4 and imported in Task 5 under the same name. `--ceremony-panel` is written in Task 7's `PixiStage` and read in Task 7's `StageBroadcast`. `FramingMode`'s three new members are added in Task 2 and referenced in Task 4.

**Known non-blocking risk:** Task 5's `-mx-[5.26%]` cancels a 5% padding on the stage root. If Step 6's frame padding is ever changed, that inverse must change with it. Task 8 Step 2's headed check catches a mismatch by eye.
