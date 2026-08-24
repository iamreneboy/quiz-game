# Grid Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hold the lobby starting grid through the `countdown` phase and animate a staggered launch to the start line on `phase-read`, replacing the one-frame anchor teleport at `lobby → countdown`.

**Architecture:** Two pure additions plus one wiring change. `beginLaunch` joins `beginSequence` in `lib/world/choreographer.ts` as a second way to compile a `Sequence` — same movement grammar, no drama cues. `fieldAnchors` moves out of `lib/world/runtime.ts` into a new pure module `lib/world/field.ts` so its phase dispatch can be unit-tested, then gains `countdown` as a grid phase. The runtime's cue handler splits its shared `phase-read`/`phase-countdown` branch so countdown holds the grid and read launches from it.

**Tech Stack:** TypeScript, Vitest (`tests/**/*.test.ts` only — see `vitest.config.ts`), Playwright for e2e, Pixi.js for the world renderer. Path alias `@/` maps to the repo root.

**Spec:** [`docs/superpowers/specs/2026-08-24-grid-launch-design.md`](../specs/2026-08-24-grid-launch-design.md)

## Global Constraints

- **Deviation from spec §6, applied deliberately.** The spec said to export `fieldAnchors` from `lib/world/runtime.ts` and test it there. `runtime.ts:5-6` declares "Not unit-tested by design — every decision it makes lives in a pure module that is." Exporting a decision function for testing erodes that contract. Task 2 instead extracts `fieldAnchors` into a new pure module, which honors it. Everything else in the spec is implemented as written.
- `fieldAnchors` cannot live in `lib/world/geometry.ts`: it needs `podiumAnchors`, and `lib/world/podium.ts` already imports from `geometry.ts`. A new module above both is the only non-circular home.
- `npm run lint` is currently clean. Any lint error introduced is a real one — do not discount it (`docs/progress/CURRENT.md`).
- Run `getDiagnostics` on every touched file, markdown included, before every commit.
- **Do not run `supabase stop` or `supabase start`.** Local Supabase runs on shifted ports that are not in git; a restart binds Windows-reserved defaults, fails, and loses the working stack.
- `npm run test:e2e` must be run with `--workers=2`; the default worker count is flaky on this machine.
- Headless Chromium cannot be trusted for animation or frame-budget observation — it falls back to SwiftShader. Live verification uses a headed browser.
- Stagger constant is `STAGGER_MS = 60` (`lib/world/movement.ts:21`); `MOVEMENT_MS = 840`.

---

### Task 1: `beginLaunch` — the standing start

Pure function only. No runtime wiring in this task, so it lands green and self-contained.

**Files:**
- Modify: `lib/world/choreographer.ts` (add one export near `beginSequence`, ends line 242)
- Test: `tests/choreographer.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `MovementTrack`, `staggerFor`, `MOVEMENT_MS` from `./movement` (all already imported by `choreographer.ts`); `ChoreographerState`, `MarkerAnchor`, `Profile` (already in scope).
- Produces: `beginLaunch(state: ChoreographerState, liveAnchors: readonly MarkerAnchor[], now: number, profile: Profile): ChoreographerState` — consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

Add these imports to the existing import blocks at the top of `tests/choreographer.test.ts`. `gridAnchors` joins the existing `@/lib/world/geometry` import; `STAGGER_MS` joins the existing `@/lib/world/movement` import; `beginLaunch` joins the `@/lib/world/choreographer` import (keep that list alphabetical — it goes directly after `avatarStates`).

```ts
import { gridAnchors, markerAnchors, startLineAnchors, trackMetrics, type MarkerAnchor } from '@/lib/world/geometry';
import { ANTICIPATE_MS, MOVEMENT_MS, STAGGER_MS, TRAVEL_MS } from '@/lib/world/movement';
```

Append this describe block to the end of `tests/choreographer.test.ts`:

```ts
describe('the launch', () => {
  // Eight players fill the run-off exactly: metrics.minX is -TRACK_MARGIN and
  // TRACK_MARGIN reserves 3 * GRID_COLUMN_WIDTH beyond the lead-in, so
  // gridAnchors lays out 4 columns of 2. That is the widest grid the run-off
  // holds, which makes it the fixture that exercises the whole stagger ladder.
  const eight = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => ({ id }));
  const grid = gridAnchors(eight, metrics);
  const line = startLineAnchors(eight, metrics);
  const held = holdAnchors(initialChoreographerState, grid);

  it('moves the field from the grid to the start line', () => {
    const state = beginLaunch(held, line, 1000, 'high');
    const track = state.sequence!.tracks.find(t => t.playerId === 'a')!;
    expect(track.from.x).toBe(grid.find(a => a.playerId === 'a')!.x);
    expect(track.to.x).toBe(line.find(a => a.playerId === 'a')!.x);
  });

  it('staggers by column, pole position first', () => {
    const state = beginLaunch(held, line, 1000, 'high');
    const delays = eight.map(
      p => state.sequence!.tracks.find(t => t.playerId === p.id)!.delayMs,
    );
    // Two players per column, four columns, one STAGGER_MS apart.
    expect(delays).toEqual([
      0, 0,
      STAGGER_MS, STAGGER_MS,
      2 * STAGGER_MS, 2 * STAGGER_MS,
      3 * STAGGER_MS, 3 * STAGGER_MS,
    ]);
  });

  it('launches the column nearest the start line first', () => {
    const state = beginLaunch(held, line, 1000, 'high');
    const byDelay = [...state.sequence!.tracks].sort((a, b) => a.delayMs - b.delayMs);
    // Highest x is nearest the line, and it goes first.
    expect(byDelay[0].from.x).toBe(Math.max(...grid.map(a => a.x)));
    expect(byDelay[byDelay.length - 1].from.x).toBe(Math.min(...grid.map(a => a.x)));
  });

  it('runs for the last stagger plus one movement', () => {
    const state = beginLaunch(held, line, 1000, 'high');
    expect(state.sequence!.durationMs).toBe(3 * STAGGER_MS + MOVEMENT_MS);
  });

  it('carries no drama', () => {
    const { sequence } = beginLaunch(held, line, 1000, 'high');
    // 'routine' is load-bearing: avatarStates emits the boost trail at
    // subdue('routine'), so a higher headline would quiet the launch's own
    // trails to SUBDUED_INTENSITY.
    expect(sequence!.headline).toBe('routine');
    expect(sequence!.lightnings).toEqual([]);
    expect(sequence!.ignitions).toEqual([]);
    expect(sequence!.arenaPlayerId).toBeNull();
    expect(sequence!.leadChange).toBeNull();
  });

  it('settles the field at the start line', () => {
    const state = beginLaunch(held, line, 1000, 'high');
    const settled = frame(state, line, 1000 + state.sequence!.durationMs, []);
    expect(settled.find(v => v.playerId === 'a')!.x)
      .toBe(line.find(a => a.playerId === 'a')!.x);
  });

  it('is a no-op with no held anchors, so a reload never replays it', () => {
    // A reload seeds only the current phase's cues, so phase-countdown never
    // arrives and no grid hold is taken. from === to, and there is nothing
    // to play.
    const state = beginLaunch(initialChoreographerState, line, 1000, 'high');
    expect(state.sequence).toBeNull();
  });

  it('hard-completes a running sequence the way phase-read always has', () => {
    let state = bufferCue(initialChoreographerState, advanced, anchorsBefore);
    state = beginSequence(state, anchorsAfter, 1000, 'high');
    // Rounds 2+ reach READ from TRACK: beginSequence already cleared the hold.
    expect(state.heldAnchors).toBeNull();

    const launched = beginLaunch(state, anchorsAfter, 2000, 'high');
    expect(launched.sequence).toBeNull();
    expect(launched.pending).toEqual([]);
    expect(launched.heldAnchors).toEqual(anchorsAfter);
  });

  it('holds the new anchors so the pre-reveal safety net survives', () => {
    const state = beginLaunch(held, line, 1000, 'high');
    expect(state.heldAnchors).toEqual(line);
  });

  it('snaps for the reduced profile', () => {
    const state = beginLaunch(held, line, 1000, 'reduced');
    expect(state.sequence!.tracks.every(t => t.delayMs === 0)).toBe(true);
  });

  it('keeps the lobby ready pulses', () => {
    const pulsing = notePlayerJoined(held, 'a', 500);
    expect(beginLaunch(pulsing, line, 1000, 'high').pulses).toEqual({ a: 500 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/choreographer.test.ts`
Expected: FAIL — `beginLaunch is not a function` / TypeScript cannot resolve the import.

- [ ] **Step 3: Implement `beginLaunch`**

Insert into `lib/world/choreographer.ts` immediately after `beginSequence` (which ends at line 242) and before `completeSequence`:

```ts
/**
 * The standing start (ADR-0037): the move from the lobby grid to the start
 * line, played on `phase-read` when the countdown ends.
 *
 * Not a case inside `beginSequence`. That function compiles a QUEUE of drama
 * cues into accents and arbitrates a headline tier; a launch has no drama and
 * no queue. What the two genuinely share is the movement grammar, and they
 * share it the way the codebase shares everything else — through MovementTrack.
 */
export function beginLaunch(
  state: ChoreographerState,
  liveAnchors: readonly MarkerAnchor[],
  now: number,
  profile: Profile,
): ChoreographerState {
  // Same degraded fallback beginSequence and bufferCue use. Here it is also
  // the reload guard: a reload seeds only the current phase's cues, so
  // `phase-countdown` never arrives, no hold is taken, and from === to.
  const held = state.heldAnchors ?? liveAnchors;
  const heldById = new Map(held.map(a => [a.playerId, a]));
  const fromOf = (anchor: MarkerAnchor) => heldById.get(anchor.playerId) ?? anchor;

  // Grid order is RECOVERED from x rather than stored: gridAnchors places every
  // player in a column at one x (geometry.ts), so the distinct x values sorted
  // descending are the columns ordered nearest-the-line first. Pole launches
  // first — the reverse of beginSequence's back-marker-first sort, which exists
  // so a passer lands after the player it passed and means nothing at a
  // standing start. Staggering by column rather than by player also caps the
  // total stagger at the column count (the run-off holds four), so a
  // twenty-player field spreads no wider than an eight-player one.
  const columns = [...new Set(liveAnchors.map(a => fromOf(a).x))].sort((a, b) => b - a);

  let moves = false;
  const tracks: MovementTrack[] = liveAnchors.map(anchor => {
    const from = fromOf(anchor);
    if (from.x !== anchor.x || from.y !== anchor.y) moves = true;
    return {
      playerId: anchor.playerId,
      from: { x: from.x, y: from.y },
      to: { x: anchor.x, y: anchor.y },
      delayMs: staggerFor(columns.indexOf(from.x), profile),
    };
  });

  // Nothing to play. Strict equality is right rather than a tolerance: in every
  // no-op case `from` IS the live anchor (the `?? anchor` fallback), so no
  // float arithmetic separates them. Returning a zero-distance sequence instead
  // would keep isSequenceRunning true for its whole duration and suppress
  // avatarStates' freeze path for nothing.
  if (!moves) {
    return { ...state, pending: [], heldAnchors: liveAnchors, sequence: null };
  }

  return {
    pending: [],
    // The hold `phase-read` has always taken: redundant against `phase-answer`
    // in a normal run, and the safety net if that cue is ever missed.
    heldAnchors: liveAnchors,
    pulses: state.pulses,
    sequence: {
      startedAt: now,
      // Load-bearing, not filler: avatarStates emits the boost trail at
      // subdue('routine'), and any higher headline would quiet the launch's
      // own trails to SUBDUED_INTENSITY.
      headline: 'routine',
      tracks,
      lightnings: [],
      ignitions: [],
      arenaPlayerId: null,
      leadChange: null,
      durationMs: Math.max(...tracks.map(t => t.delayMs)) + MOVEMENT_MS,
    },
  };
}
```

Note on `Math.max(...tracks.map(...))`: `tracks` is never empty here, because an empty `liveAnchors` leaves `moves` false and returns at the guard above.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/choreographer.test.ts`
Expected: PASS, including all pre-existing cases in the file.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both silent / zero problems.

- [ ] **Step 6: Commit**

```bash
git add lib/world/choreographer.ts tests/choreographer.test.ts
git commit -m "feat: compile a standing start into a movement sequence"
```

---

### Task 2: Extract `fieldAnchors` into a pure module

Pure refactor. **No behavior change** — the tests written here pin today's dispatch so Task 3's change is visible as a diff in expectations.

**Files:**
- Create: `lib/world/field.ts`
- Create: `tests/field.test.ts`
- Modify: `lib/world/runtime.ts` (delete `fieldAnchors` at lines 91-127; adjust imports)

**Interfaces:**
- Consumes: `gridAnchors`, `markerAnchors`, `startLineAnchors`, `MarkerAnchor`, `TrackMetrics`, `AnchorStanding` from `./geometry`; `podiumAnchors` from `./podium`; `CeremonySteps` from `@/lib/ceremony/beats`; `Phase` from `@/lib/types`.
- Produces: `fieldAnchors(source: FieldSource, metrics: TrackMetrics, steps: CeremonySteps, riseLimit: number): MarkerAnchor[]` and `interface FieldSource` — consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

Create `tests/field.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { NO_CEREMONY } from '@/lib/ceremony/beats';
import type { Phase } from '@/lib/types';
import { fieldAnchors, type FieldSource } from '@/lib/world/field';
import { gridAnchors, startLineAnchors, markerAnchors, trackMetrics } from '@/lib/world/geometry';

const metrics = trackMetrics(12);

const players = [
  { id: 'a', is_playing: true },
  { id: 'b', is_playing: true },
  { id: 'mc', is_playing: false },
];
const racers = [{ id: 'a' }, { id: 'b' }];

const source = (phase: Phase, standings: FieldSource['standings'] = null): FieldSource => ({
  room: { phase },
  standings,
  players,
});

describe('fieldAnchors', () => {
  it('lays out the starting grid in the lobby', () => {
    expect(fieldAnchors(source('lobby'), metrics, NO_CEREMONY, 100))
      .toEqual(gridAnchors(racers, metrics, 100));
  });

  it('puts the field on the start line before the first reveal', () => {
    expect(fieldAnchors(source('read'), metrics, NO_CEREMONY, 100))
      .toEqual(startLineAnchors(racers, metrics, 100));
  });

  it('reads the standings once a round has resolved', () => {
    const standings = [
      { player_id: 'a', correct: 2, speed_points: 10 },
      { player_id: 'b', correct: 1, speed_points: 5 },
    ];
    expect(fieldAnchors(source('track', standings), metrics, NO_CEREMONY, 100))
      .toEqual(markerAnchors(standings, metrics, 100));
  });

  it('treats empty standings as not-yet-resolved', () => {
    // `standings` is null until the first round resolves, and an empty array
    // has to take the same branch or round 1 renders an empty track.
    expect(fieldAnchors(source('read', []), metrics, NO_CEREMONY, 100))
      .toEqual(startLineAnchors(racers, metrics, 100));
  });

  it('gives no rig to a non-playing host', () => {
    const anchors = fieldAnchors(source('lobby'), metrics, NO_CEREMONY, 100);
    expect(anchors.map(a => a.playerId)).toEqual(['a', 'b']);
  });

  it('defaults to the lobby with no room', () => {
    const anchors = fieldAnchors({ room: null, standings: null, players }, metrics, NO_CEREMONY, 100);
    expect(anchors).toEqual(gridAnchors(racers, metrics, 100));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/field.test.ts`
Expected: FAIL — cannot resolve `@/lib/world/field`.

- [ ] **Step 3: Create the module**

Create `lib/world/field.ts`. The body is moved verbatim from `runtime.ts:101-127`; only the parameter type changes, from the whole store state to a structural subset — the same idiom `lib/presentation/deriveCues.ts` uses for `CueRoom`/`CueSource`.

```ts
/**
 * Which layout the field is standing in right now. Pure dispatch — every
 * layout it picks from lives in geometry.ts or podium.ts.
 *
 * Lives here rather than in runtime.ts because it is a DECISION, and
 * runtime.ts is deliberately not unit-tested ("every decision it makes lives
 * in a pure module that is", runtime.ts:5). It cannot live in geometry.ts
 * either: it needs podiumAnchors, and podium.ts already imports geometry.
 */
import type { CeremonySteps } from '@/lib/ceremony/beats';
import type { Phase } from '@/lib/types';
import {
  gridAnchors,
  markerAnchors,
  startLineAnchors,
  type AnchorStanding,
  type MarkerAnchor,
  type TrackMetrics,
} from './geometry';
import { podiumAnchors } from './podium';

/** Structural subset of the game store this dispatch needs. */
export interface FieldSource {
  room: { phase: Phase } | null;
  standings: readonly AnchorStanding[] | null;
  players: readonly { id: string; is_playing: boolean }[];
}

/**
 * `standings?.length` rather than a null check on purpose: `standings` is null
 * until the first round resolves (lib/store.ts:19), and an empty array has to
 * take the same branch, otherwise round 1 renders an empty track through a
 * countdown that is drawn at the FULL band (components/PixiStage.tsx:10).
 */
export function fieldAnchors(
  source: FieldSource,
  metrics: TrackMetrics,
  steps: CeremonySteps,
  riseLimit: number,
): MarkerAnchor[] {
  const { room, standings, players } = source;
  // Only racers get a rig. A non-playing MC host is in `players` but not in
  // `standings` (supabase/migrations/0002_rpcs.sql, `where p.is_playing`), so
  // an unfiltered roster gave them an avatar on the grid and the start line —
  // shifting every other grid slot, since `gridAnchors` uses array index as
  // grid order — and then deleted it at the first reveal. This stays a filter
  // here rather than a rule in geometry.ts on purpose: it is selection of WHO
  // is in the field, which the server already decides, not track math, and
  // both anchor functions are deliberately shape-agnostic.
  const racers = players.filter(p => p.is_playing);
  const phase = room?.phase ?? 'lobby';

  if (phase === 'lobby') return gridAnchors(racers, metrics, riseLimit);
  // The ceremony is a fourth layout, not a fourth renderer.
  if (phase === 'results' && standings?.length) {
    return podiumAnchors(standings, metrics, steps, riseLimit);
  }
  return standings?.length
    ? markerAnchors(standings, metrics, riseLimit)
    : startLineAnchors(racers, metrics, riseLimit);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/field.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Point the runtime at the new module**

In `lib/world/runtime.ts`:

1. Delete the whole `fieldAnchors` function and its doc comment (lines 91-127, from `/**\n * Where the field stands right now.` through the closing `}`).
2. Add to the imports: `import { fieldAnchors } from './field';` (place it alphabetically among the relative imports, between `./director` and `./flair`).
3. Remove `gridAnchors`, `markerAnchors` and `startLineAnchors` from the `./geometry` import block — they are now only used by `field.ts`. Keep `trackMetrics`, `CameraState`, `MarkerAnchor`, `TrackMetrics`.
4. Remove `podiumAnchors` from the `./podium` import — keep `blockX` and `podiumBlocks`, which the tick still uses.

The two call sites (`runtime.ts:168` in the cue handler and `runtime.ts:207` in `tick`) already pass `state` as the first argument. `GameState` is structurally assignable to `FieldSource`, so neither call site changes.

- [ ] **Step 6: Verify nothing regressed**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc silent, lint zero problems, all tests pass (429 previously + Task 1's additions + 6 new).

- [ ] **Step 7: Commit**

```bash
git add lib/world/field.ts tests/field.test.ts lib/world/runtime.ts
git commit -m "refactor: move fieldAnchors into a pure, tested module"
```

---

### Task 3: Hold the grid through countdown and launch on read

The feature lands here. Both halves must ship together: the dispatch change alone would move the teleport onto the read beat without animating it.

**Files:**
- Modify: `lib/world/field.ts` (the phase dispatch)
- Modify: `tests/field.test.ts` (add a countdown case)
- Modify: `lib/world/runtime.ts:177-180` (split the shared cue branch)

**Interfaces:**
- Consumes: `beginLaunch` from Task 1, `fieldAnchors`/`FieldSource` from Task 2.
- Produces: nothing new — this task wires what the first two built.

- [ ] **Step 1: Write the failing test**

Add to the `fieldAnchors` describe block in `tests/field.test.ts`:

```ts
it('holds the starting grid through the countdown', () => {
  // ADR-0037: the grid is where you wait for the lights. The move to the
  // start line is the launch on phase-read, not a teleport on phase-countdown.
  expect(fieldAnchors(source('countdown'), metrics, NO_CEREMONY, 100))
    .toEqual(gridAnchors(racers, metrics, 100));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/field.test.ts`
Expected: FAIL — countdown currently returns `startLineAnchors`, so the deep-equal against `gridAnchors` mismatches on `x`.

- [ ] **Step 3: Add countdown to the grid branch**

In `lib/world/field.ts`, change:

```ts
  if (phase === 'lobby') return gridAnchors(racers, metrics, riseLimit);
```

to:

```ts
  // The countdown holds the grid (ADR-0037). `establishing` — the countdown's
  // shot in both books — ignores `anchors` entirely (framing.ts), so this
  // changes what stands in the shot, not the shot.
  if (phase === 'lobby' || phase === 'countdown') {
    return gridAnchors(racers, metrics, riseLimit);
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/field.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Split the cue branch**

In `lib/world/runtime.ts`, replace this branch (currently lines 177-180):

```ts
      } else if (cue.type === 'phase-read' || cue.type === 'phase-countdown') {
        // A new beat hard-completes anything still in flight (spec §4).
        // completeSequence clears heldAnchors, so the hold comes after it.
        choreo = holdAnchors(completeSequence(choreo), anchors);
      } else if (cue.type === 'phase-answer') {
```

with:

```ts
      } else if (cue.type === 'phase-countdown') {
        // A new beat hard-completes anything still in flight (spec §4).
        // completeSequence clears heldAnchors, so the hold comes after it.
        // What is held here is the GRID — fieldAnchors keeps the lobby
        // formation through this phase (ADR-0037), and the launch on
        // phase-read moves the field off it.
        choreo = holdAnchors(completeSequence(choreo), anchors);
      } else if (cue.type === 'phase-read') {
        // beginLaunch takes `choreo` raw, not completeSequence(choreo):
        // completeSequence clears heldAnchors, which is exactly the grid it
        // needs to launch FROM. It performs the equivalent hard-complete
        // itself. On rounds 2+ the hold is already null (beginSequence cleared
        // it), so this degenerates to precisely the old behavior.
        choreo = beginLaunch(choreo, anchors, now, profile);
      } else if (cue.type === 'phase-answer') {
```

Then add `beginLaunch` to the `./choreographer` import block, alphabetically after `avatarStates`:

```ts
import {
  avatarStates,
  beginLaunch,
  beginSequence,
  bufferCue,
  completeSequence,
  holdAnchors,
  initialChoreographerState,
  notePlayerJoined,
  type ChoreographerState,
} from './choreographer';
```

- [ ] **Step 6: Verify the whole suite**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: tsc silent, lint zero problems, all unit tests pass, build succeeds.

- [ ] **Step 7: Run the e2e suite**

Run: `npm run test:e2e -- --workers=2`
Expected: all pass (21 previously). `--workers=2` is required; the default count is flaky on this machine.

- [ ] **Step 8: Commit**

```bash
git add lib/world/field.ts tests/field.test.ts lib/world/runtime.ts
git commit -m "feat: hold the grid through countdown and launch on read"
```

---

### Task 4: Live verification and documentation

Nothing here changes behavior; it confirms it and records the decision.

**Files:**
- Create: `docs/ADR/0037-the-countdown-holds-the-grid.md`
- Create: `docs/progress/P7-grid-launch.md`
- Modify: `docs/progress/CURRENT.md`

**Interfaces:**
- Consumes: the shipped behavior from Task 3.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Verify live in a headed browser**

Start the dev server (`npm run dev`) and drive a real game. Headless Chromium falls back to SwiftShader and cannot be trusted for animation observation, so this is a headed browser throughout. Do not restart Supabase.

Record the result of each check in the progress doc written in Step 3:

1. Start a game with **more than 8 players** if practical (else 8) to exercise `gridAnchors`' row growth alongside the column stagger. Watch `countdown → read`: the field holds the grid for the full 3 seconds, then launches column-by-column with the column nearest the line moving first, and lands at the start line.
2. Reload mid-READ, mid-ANSWER, and mid-REVEAL. Each time the field must be settled at the start line with no launch replay and no console errors.
3. Reload mid-COUNTDOWN: the field is on the grid, and launches when READ arrives live.
4. Rounds 2+ `track → read`: unchanged from before this work.
5. Reduced-motion profile: the field snaps to the line, no launch, no console errors.
6. Both surfaces — the stage/TV view and the player view — and player-portrait specifically, to observe the canvas collapsing to a 28vh strip over the same window as the launch (spec §5, accepted).

If check 6 reads badly on a phone, record it as tech debt in `CURRENT.md`; it is explicitly not a blocker for this work.

- [ ] **Step 2: Write ADR-0037**

Read `docs/ADR/README.md` for the file's required shape, then create `docs/ADR/0037-the-countdown-holds-the-grid.md`. `0036-the-shot-book-is-role-selected.md` is the current high-water mark.

It must record:
- **Decision:** the countdown holds the lobby starting grid; the move to the start line is an animated launch on `phase-read`.
- **Why it reverses P2:** P2's spec §7 asked for a stable starting-grid formation and declined to build a roll-up-to-the-line move at the end of the lobby. That reasoning holds — this does not build one. It keeps the grid one beat longer instead, which gives spec §7's formation actual screen time and moves the single teleport onto the one beat where a launch is the motivated gesture.
- **Rejected alternatives:** a roll-up during the countdown (new choreography on a beat with nothing to say); generic interpolation of any `fieldAnchors` change (would also animate the podium layout and every reload seed, turning deliberate cuts into slides); launching from the countdown's `ends_at` so it completes before READ opens (needs an rAF trigger in a phase that has none).
- **The accepted trade (spec §5):** on player-portrait only, the launch runs inside the 460ms canvas collapse to a 28vh strip. The stage view and player-landscape have no resize.
- **Why the replay guard needed no new machinery:** this is the fifth appearance of the trap catalogued in `CURRENT.md`, and the first closed by an existing degradation. A reload seeds only the current phase's cues, so `phase-countdown` never arrives, `heldAnchors` stays null, and `beginLaunch`'s `heldAnchors ?? liveAnchors` fallback makes `from === to`. The guard is the *absence* of a seeded cue, not a derivation from `ends_at`.

- [ ] **Step 3: Write the progress doc**

Create `docs/progress/P7-grid-launch.md` following the shape of `docs/progress/P6b-broadcast-direction.md`: scope, what was built, deviations, verification results. Record:
- The deviation from spec §6: `fieldAnchors` was extracted into `lib/world/field.ts` rather than exported from `runtime.ts`, because `runtime.ts` declares itself not-unit-tested by design and exporting a decision for testing would erode that.
- The Step 1 live-verification findings, check by check.

- [ ] **Step 4: Update the tracker**

In `docs/progress/CURRENT.md`:
- Delete the *Intentionally skipped* entry about the lobby → countdown teleport. Leave the section reading `None.`
- Update *Current phase* to point at `P7 — Grid launch → docs/progress/P7-grid-launch.md` as the last completed phase.
- Add a *Notes* entry only if Step 1 surfaced something durable — in particular, that `[data-surface]`-independent choreography now runs concurrently with the strip collapse on player-portrait.

- [ ] **Step 5: Check diagnostics on every touched file**

Run `getDiagnostics` on `docs/ADR/0037-the-countdown-holds-the-grid.md`, `docs/progress/P7-grid-launch.md` and `docs/progress/CURRENT.md`. Markdown included — this is a standing project requirement.

- [ ] **Step 6: Commit**

```bash
git add docs/ADR/0037-the-countdown-holds-the-grid.md docs/progress/P7-grid-launch.md docs/progress/CURRENT.md
git commit -m "docs: record the grid launch and close P2's skipped teleport"
```

---

## Verification summary

| Spec section | Task |
|---|---|
| §1 Anchor dispatch | Task 2 (extract), Task 3 (countdown branch) |
| §2 The launch sequence | Task 1 |
| §3 Runtime wiring | Task 3 |
| §4 Guards | Task 1 (null-hold no-op, rounds 2+, reduced) |
| §5 The strip collision | Task 4 Step 1 check 6 |
| §6 Testing | Tasks 1-3 unit, Task 4 live |
| §7 Documentation | Task 4 |
