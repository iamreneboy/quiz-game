# M2 P2 — Avatars & Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put twelve procedural characters in the P1 world with a staged movement grammar, overtake and streak VFX on the celebration hierarchy, top-three flair, and a lobby starting grid.

**Architecture:** A pure `choreographer` buffers drama cues from the reveal transition and compiles them into a timeline that plays at the TRACK beat, emitting one `AvatarFrameState[]` per frame. A stateless Pixi avatar layer applies that array to a shared rig whose per-character content is baked data. A pure VFX budget clamps particle output under frame pressure without ever touching the performance profile.

**Tech Stack:** TypeScript, PixiJS v8, Zustand, Vitest, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-22-m2-p2-avatars-motion-design.md`

## Global Constraints

- **No schema, RPC, or realtime-protocol change.** Roadmap decision 4. The server pins TRACK at 4s in `supabase/migrations/0002_rpcs.sql`; that is fixed budget, not a target.
- **`runtime.ts` stays the only `cueBus` subscriber.** ADR-0001.
- **Pure modules import no Pixi, no React, no store.** `choreographer`, `movement`, `flair`, `vfxBudget`, `geometry`, `framing` are framework-free and unit-tested. Canvas internals are not unit-tested.
- **`profile` is never written by this phase.** ADR-0004 stands unamended; the VFX budget clamps particle output only.
- **Preserve verbatim:** `Starting grid — {n} joined` (asserted in `e2e/game-flow.spec.ts:46` and `e2e/world.spec.ts:60`), the start button text `Start the race` / `Need at least 2 players`, and `The track — after Q{n}`.
- **Medal glow and leader scale are never shed by the budget.** Rank is information, not decoration.
- **Subdued means an intensity multiplier of `0.6`, never omission.** Only the arena reaction is all-or-nothing.
- Run `npm run test` (Vitest) and `npm run test:e2e` (Playwright) from the repo root. Lint with `npm run lint` — ignore the inflated count if a worktree exists under `.claude/worktrees/` (known issue in `docs/progress/CURRENT.md`).

---

### Task 1: Movement grammar

Pure sampling of the anticipate → launch → travel → settle curve. No Pixi, no state.

**Files:**
- Create: `lib/world/movement.ts`
- Test: `tests/movement.test.ts`

**Interfaces:**
- Consumes: `cubicBezierEase` from `lib/world/camera.ts`; `DURATION`, `EASE` from `lib/presentation/tokens.ts`; `Profile` from `lib/presentation/profile.ts`.
- Produces: `MovementTrack`, `MovementSample`, `sampleMovement()`, `staggerFor()`, and the constants `ANTICIPATE_MS`, `TRAVEL_MS`, `SETTLE_MS`, `MOVEMENT_MS`, `STAGGER_MS` — all consumed by Task 4.

- [ ] **Step 1: Write the failing test**

Create `tests/movement.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  ANTICIPATE_MS,
  MOVEMENT_MS,
  STAGGER_MS,
  TRAVEL_MS,
  sampleMovement,
  staggerFor,
  type MovementTrack,
} from '@/lib/world/movement';

const track: MovementTrack = {
  playerId: 'a',
  from: { x: 0, y: 0 },
  to: { x: 320, y: -74 },
  delayMs: 0,
};

describe('sampleMovement (high profile)', () => {
  it('holds at the origin before its staggered delay', () => {
    const delayed = { ...track, delayMs: 120 };
    const s = sampleMovement(delayed, 60, 'high');
    expect(s.x).toBe(0);
    expect(s.scaleX).toBe(1);
    expect(s.trail).toBe(0);
  });

  it('crouches during anticipation without moving', () => {
    const s = sampleMovement(track, ANTICIPATE_MS / 2, 'high');
    expect(s.x).toBe(0);
    expect(s.scaleX).toBeGreaterThan(1);
    expect(s.scaleY).toBeLessThan(1);
    expect(s.trail).toBe(0);
  });

  it('stretches and trails at launch', () => {
    const s = sampleMovement(track, ANTICIPATE_MS + 1, 'high');
    expect(s.scaleY).toBeGreaterThan(1);
    expect(s.scaleX).toBeLessThan(1);
    expect(s.trail).toBeGreaterThan(0.9);
  });

  it('overshoots the destination during travel', () => {
    // EASE.settle's [0.34, 1.4, 0.5, 1] rises above 1 before returning.
    const samples = [];
    for (let t = ANTICIPATE_MS; t <= ANTICIPATE_MS + TRAVEL_MS; t += 5) {
      samples.push(sampleMovement(track, t, 'high').x);
    }
    expect(Math.max(...samples)).toBeGreaterThan(track.to.x);
  });

  it('rests at the destination once the movement is over', () => {
    const s = sampleMovement(track, MOVEMENT_MS + 500, 'high');
    expect(s).toEqual({ x: 320, y: -74, scaleX: 1, scaleY: 1, trail: 0 });
  });

  it('lands with an impact squash that damps to rest', () => {
    const landing = sampleMovement(track, ANTICIPATE_MS + TRAVEL_MS + 1, 'high');
    expect(landing.scaleX).toBeGreaterThan(1);
    expect(landing.scaleY).toBeLessThan(1);
    const settled = sampleMovement(track, MOVEMENT_MS - 1, 'high');
    expect(settled.scaleX).toBeCloseTo(1, 1);
  });
});

describe('sampleMovement (reduced profile)', () => {
  it('snaps to the destination with no squash or trail', () => {
    for (const t of [0, ANTICIPATE_MS, ANTICIPATE_MS + TRAVEL_MS, MOVEMENT_MS]) {
      expect(sampleMovement(track, t, 'reduced')).toEqual({
        x: 320, y: -74, scaleX: 1, scaleY: 1, trail: 0,
      });
    }
  });
});

describe('staggerFor', () => {
  it('offsets each player by a fixed step', () => {
    expect(staggerFor(0, 'high')).toBe(0);
    expect(staggerFor(3, 'high')).toBe(3 * STAGGER_MS);
  });

  it('is simultaneous under the reduced profile', () => {
    expect(staggerFor(3, 'reduced')).toBe(0);
  });

  it('keeps a full field inside the 4s TRACK beat', () => {
    expect(staggerFor(7, 'high') + MOVEMENT_MS).toBeLessThan(4000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/movement.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/world/movement"`

- [ ] **Step 3: Write the implementation**

Create `lib/world/movement.ts`:

```ts
/**
 * The movement grammar (spec §4): anticipate -> launch -> travel -> settle.
 *
 * Pure — no Pixi, no clock of its own. `elapsedMs` is measured from the start
 * of the SEQUENCE, not from this track's delay; the stagger is applied here.
 *
 * The overshoot in "boost -> move -> overshoot -> settle" is not hand-rolled:
 * EASE.settle's [0.34, 1.4, 0.5, 1] rises above 1 by construction, so the
 * P0 token supplies it.
 */
import { DURATION, EASE } from '@/lib/presentation/tokens';
import type { Profile } from '@/lib/presentation/profile';
import { cubicBezierEase } from './camera';

export const ANTICIPATE_MS = DURATION.cut; // 120
export const TRAVEL_MS = DURATION.settle; // 460
export const SETTLE_MS = DURATION.beat; // 260
export const MOVEMENT_MS = ANTICIPATE_MS + TRAVEL_MS + SETTLE_MS; // 840

/** Per-player offset so the eye can follow a field of eight. */
export const STAGGER_MS = 60;

const CROUCH_X = 0.1;
const CROUCH_Y = 0.12;
const STRETCH_X = 0.08;
const STRETCH_Y = 0.15;
const IMPACT = 0.06;

export interface MovementTrack {
  playerId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Stagger offset from the sequence start, in ms. */
  delayMs: number;
}

export interface MovementSample {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  /** Boost-trail emission, 0..1; non-zero only during travel. */
  trail: number;
}

const REST = { scaleX: 1, scaleY: 1, trail: 0 } as const;

/** Back-marker first, so a pass reads as the passer arriving after the passed. */
export function staggerFor(index: number, profile: Profile): number {
  return profile === 'reduced' ? 0 : index * STAGGER_MS;
}

export function sampleMovement(
  track: MovementTrack,
  elapsedMs: number,
  profile: Profile,
): MovementSample {
  const { from, to } = track;

  // Reduced snaps, matching P1's Markers and the spec §8 ladder.
  if (profile === 'reduced') return { x: to.x, y: to.y, ...REST };

  const t = elapsedMs - track.delayMs;
  if (t <= 0) return { x: from.x, y: from.y, ...REST };
  if (t >= MOVEMENT_MS) return { x: to.x, y: to.y, ...REST };

  if (t < ANTICIPATE_MS) {
    const k = t / ANTICIPATE_MS;
    return {
      x: from.x,
      y: from.y,
      scaleX: 1 + CROUCH_X * k,
      scaleY: 1 - CROUCH_Y * k,
      trail: 0,
    };
  }

  if (t < ANTICIPATE_MS + TRAVEL_MS) {
    const k = (t - ANTICIPATE_MS) / TRAVEL_MS;
    const eased = cubicBezierEase(EASE.settle, k);
    return {
      x: from.x + (to.x - from.x) * eased,
      y: from.y + (to.y - from.y) * eased,
      // Stretch peaks at launch and decays across the travel.
      scaleX: 1 - STRETCH_X * (1 - k),
      scaleY: 1 + STRETCH_Y * (1 - k),
      trail: 1 - k,
    };
  }

  // Landing: a damped squash starting at peak. The discontinuity against the
  // travel's end scale IS the impact — it is what sells the landing.
  const k = (t - ANTICIPATE_MS - TRAVEL_MS) / SETTLE_MS;
  const wobble = Math.cos(k * Math.PI * 2) * (1 - k);
  return {
    x: to.x,
    y: to.y,
    scaleX: 1 + IMPACT * wobble,
    scaleY: 1 - IMPACT * wobble,
    trail: 0,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/movement.test.ts`
Expected: PASS — 10 tests

- [ ] **Step 5: Commit**

```bash
git add lib/world/movement.ts tests/movement.test.ts
git commit -m "feat(world): avatar movement grammar"
```

---

### Task 2: Flair

Medals, leader emphasis, and the contested-edge turbo flame — all behind one gate.

**Files:**
- Create: `lib/world/flair.ts`
- Test: `tests/flair.test.ts`

**Interfaces:**
- Consumes: `MarkerAnchor` from `lib/world/geometry.ts`.
- Produces: `Flair`, `FlairStanding`, `flairFor()`, `LEADER_EMPHASIS` — consumed by Task 4 and Task 8.

- [ ] **Step 1: Write the failing test**

Create `tests/flair.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { LEADER_EMPHASIS, flairFor, type FlairStanding } from '@/lib/world/flair';
import { markerAnchors, trackMetrics } from '@/lib/world/geometry';

const metrics = trackMetrics(12);

function standing(id: string, correct: number, speed = 0): FlairStanding {
  return { player_id: id, correct, speed_points: speed };
}

describe('the start-line gate', () => {
  it('awards nothing while everyone is still on zero', () => {
    const standings = [standing('a', 0), standing('b', 0), standing('c', 0)];
    const flair = flairFor(standings, markerAnchors(standings, metrics));
    for (const id of ['a', 'b', 'c']) {
      expect(flair.get(id)).toEqual({ medal: null, emphasis: 1, edgeHolder: false });
    }
  });

  it('activates as soon as one player has advanced', () => {
    const standings = [standing('a', 1), standing('b', 0), standing('c', 0)];
    const flair = flairFor(standings, markerAnchors(standings, metrics));
    expect(flair.get('a')!.medal).toBe('gold');
    expect(flair.get('a')!.emphasis).toBe(LEADER_EMPHASIS);
  });
});

describe('medals', () => {
  it('follows standings order for the top three', () => {
    const standings = [standing('a', 3), standing('b', 2), standing('c', 1), standing('d', 0)];
    const flair = flairFor(standings, markerAnchors(standings, metrics));
    expect(flair.get('a')!.medal).toBe('gold');
    expect(flair.get('b')!.medal).toBe('silver');
    expect(flair.get('c')!.medal).toBe('bronze');
    expect(flair.get('d')!.medal).toBeNull();
  });

  it('handles a field smaller than the podium', () => {
    const standings = [standing('a', 2), standing('b', 1)];
    const flair = flairFor(standings, markerAnchors(standings, metrics));
    expect(flair.get('a')!.medal).toBe('gold');
    expect(flair.get('b')!.medal).toBe('silver');
  });
});

describe('leader emphasis', () => {
  it('enlarges only the leader', () => {
    const standings = [standing('a', 3), standing('b', 2)];
    const flair = flairFor(standings, markerAnchors(standings, metrics));
    expect(flair.get('a')!.emphasis).toBe(LEADER_EMPHASIS);
    expect(flair.get('b')!.emphasis).toBe(1);
  });
});

describe('the turbo flame', () => {
  it('goes to the row-0 holder when a segment is contested', () => {
    const standings = [standing('a', 2, 300), standing('b', 2, 100), standing('c', 1)];
    const flair = flairFor(standings, markerAnchors(standings, metrics));
    expect(flair.get('a')!.edgeHolder).toBe(true);
    expect(flair.get('b')!.edgeHolder).toBe(false);
  });

  it('is withheld from a player alone on a segment', () => {
    const standings = [standing('a', 2, 300), standing('b', 1, 100)];
    const flair = flairFor(standings, markerAnchors(standings, metrics));
    expect(flair.get('a')!.edgeHolder).toBe(false);
    expect(flair.get('b')!.edgeHolder).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/flair.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/world/flair"`

- [ ] **Step 3: Write the implementation**

Create `lib/world/flair.ts`:

```ts
/**
 * Top-three flair, leader emphasis, and the contested-edge turbo flame
 * (spec §5, PRD §6, §8). Pure.
 *
 * One gate governs all three: nothing is awarded until somebody has actually
 * advanced. At the start line everyone is tied on zero, rank 0 is arbitrary,
 * and handing out gold plus a turbo flame to whoever happens to sort first is
 * noise that undercuts the flair when it becomes real.
 */
import type { MarkerAnchor } from './geometry';

/** PRD §8: "the leader's avatar renders slightly larger". */
export const LEADER_EMPHASIS = 1.12;

/** Structural subset of `Standing`; matched by shape to stay decoupled. */
export interface FlairStanding {
  player_id: string;
  correct: number;
  speed_points: number;
}

export interface Flair {
  medal: 'gold' | 'silver' | 'bronze' | null;
  /** Scale multiplier; 1 for everyone but the leader. */
  emphasis: number;
  edgeHolder: boolean;
}

const MEDALS = ['gold', 'silver', 'bronze'] as const;
const NO_FLAIR: Flair = { medal: null, emphasis: 1, edgeHolder: false };

export function flairFor(
  standings: readonly FlairStanding[],
  anchors: readonly MarkerAnchor[],
): Map<string, Flair> {
  const flair = new Map<string, Flair>();
  const active = standings.some(s => s.correct > 0);

  if (!active) {
    for (const s of standings) flair.set(s.player_id, NO_FLAIR);
    return flair;
  }

  // A segment with one occupant is uncontested — nobody is holding an edge.
  const occupancy = new Map<number, number>();
  for (const a of anchors) occupancy.set(a.segment, (occupancy.get(a.segment) ?? 0) + 1);

  const rowByPlayer = new Map(anchors.map(a => [a.playerId, a]));

  standings.forEach((s, index) => {
    const anchor = rowByPlayer.get(s.player_id);
    const contested = anchor ? (occupancy.get(anchor.segment) ?? 0) > 1 : false;
    flair.set(s.player_id, {
      medal: index < MEDALS.length ? MEDALS[index] : null,
      emphasis: index === 0 ? LEADER_EMPHASIS : 1,
      edgeHolder: contested && anchor!.row === 0,
    });
  });

  return flair;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/flair.test.ts`
Expected: PASS — 7 tests

- [ ] **Step 5: Commit**

```bash
git add lib/world/flair.ts tests/flair.test.ts
git commit -m "feat(world): medal, leader and edge-holder flair"
```

---

### Task 3: VFX budget

The watchdog. Clamps particle output under sustained frame pressure and never touches `profile`.

**Files:**
- Create: `lib/world/vfxBudget.ts`
- Test: `tests/vfxBudget.test.ts`

**Interfaces:**
- Consumes: `FrameStats` from `lib/world/perf.ts`; `Profile` from `lib/presentation/profile.ts`.
- Produces: `VfxLevel`, `BudgetState`, `VfxAllowance`, `initialBudgetState`, `stepBudget()`, `allowanceFor()`, `DROP_THRESHOLD`, `RECOVERY_EVALUATIONS` — consumed by Tasks 4, 7 and 8.

- [ ] **Step 1: Write the failing test**

Create `tests/vfxBudget.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { FrameStats } from '@/lib/world/perf';
import {
  DROP_THRESHOLD,
  RECOVERY_EVALUATIONS,
  allowanceFor,
  initialBudgetState,
  stepBudget,
  type BudgetState,
} from '@/lib/world/vfxBudget';

const stats = (dropped: number): FrameStats => ({ p50: 16, p95: 18, dropped, samples: 120 });
const busy = stats(DROP_THRESHOLD + 1);
const clean = stats(0);

function run(state: BudgetState, series: FrameStats[], profile: 'high' | 'reduced' = 'high') {
  return series.reduce((s, f) => stepBudget(s, f, profile), state);
}

describe('downgrade', () => {
  it('sheds one level under sustained drops', () => {
    expect(stepBudget(initialBudgetState, busy, 'high').level).toBe('lean');
  });

  it('sheds to minimal and stops there', () => {
    const floored = run(initialBudgetState, [busy, busy, busy, busy]);
    expect(floored.level).toBe('minimal');
  });

  it('holds without shedding when drops are present but under threshold', () => {
    const held = stepBudget(initialBudgetState, stats(DROP_THRESHOLD), 'high');
    expect(held.level).toBe('full');
  });
});

describe('recovery is asymmetric', () => {
  it('needs consecutive clean evaluations before upgrading', () => {
    let state = stepBudget(initialBudgetState, busy, 'high');
    expect(state.level).toBe('lean');

    for (let i = 0; i < RECOVERY_EVALUATIONS - 1; i++) {
      state = stepBudget(state, clean, 'high');
      expect(state.level).toBe('lean');
    }

    state = stepBudget(state, clean, 'high');
    expect(state.level).toBe('full');
  });

  it('resets the recovery run on any dropped frame', () => {
    let state = stepBudget(initialBudgetState, busy, 'high');
    state = run(state, [clean, clean, clean, stats(1), clean, clean, clean]);
    expect(state.level).toBe('lean');
  });

  it('does not oscillate on an alternating series', () => {
    const alternating = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? busy : clean));
    const state = run(initialBudgetState, alternating);
    expect(state.level).toBe('minimal');
  });
});

describe('profile interaction', () => {
  it('pins reduced at minimal and never upgrades it', () => {
    const state = run(initialBudgetState, [clean, clean, clean, clean, clean], 'reduced');
    expect(state.level).toBe('minimal');
  });

  it('ignores an empty window', () => {
    const empty: FrameStats = { p50: 0, p95: 0, dropped: 0, samples: 0 };
    expect(stepBudget(initialBudgetState, empty, 'high')).toEqual(initialBudgetState);
  });
});

describe('allowanceFor', () => {
  it('caps the streak tier as the level falls', () => {
    expect(allowanceFor('full').maxStreakTier).toBe(8);
    expect(allowanceFor('lean').maxStreakTier).toBe(5);
    expect(allowanceFor('minimal').maxStreakTier).toBe(3);
  });

  it('drops particles only at minimal', () => {
    expect(allowanceFor('full').particles).toBe(true);
    expect(allowanceFor('lean').particles).toBe(true);
    expect(allowanceFor('minimal').particles).toBe(false);
  });

  it('sheds the trail before anything else', () => {
    expect(allowanceFor('lean').trail).toBeLessThan(allowanceFor('full').trail);
    expect(allowanceFor('minimal').trail).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/vfxBudget.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/world/vfxBudget"`

- [ ] **Step 3: Write the implementation**

Create `lib/world/vfxBudget.ts`:

```ts
/**
 * The VFX budget (spec §8) — this phase's answer to the runtime adaptation
 * ADR-0004 deferred to P2.
 *
 * It clamps PARTICLE OUTPUT ONLY. `useSettings().profile` is never written,
 * `WorldScene` is never reconstructed, and ADR-0004 stands unamended: the
 * profile remains a static startup heuristic plus a manual override.
 *
 * Medal glow and leader scale are absent from `VfxAllowance` by design — rank
 * is information, not decoration, so the budget structurally cannot shed it.
 */
import type { Profile } from '@/lib/presentation/profile';
import type { FrameStats } from './perf';

export type VfxLevel = 'minimal' | 'lean' | 'full';

/** Ascending, so a level's index is its rank. */
export const VFX_LEVELS: readonly VfxLevel[] = ['minimal', 'lean', 'full'];

/** 20% of perf.ts's 120-frame window. */
export const DROP_THRESHOLD = 24;

/** ~2s at runtime.ts's 500ms publish cadence. */
export const RECOVERY_EVALUATIONS = 4;

export interface BudgetState {
  level: VfxLevel;
  /** Consecutive clean evaluations since the last dropped frame. */
  cleanRuns: number;
}

export const initialBudgetState: BudgetState = { level: 'full', cleanRuns: 0 };

export interface VfxAllowance {
  /** false: draw static sprites instead of running particle systems. */
  particles: boolean;
  trail: number;
  streak: number;
  maxStreakTier: 0 | 3 | 5 | 8;
  /** Lightning and ignition bursts. */
  accent: number;
  arena: number;
  turbo: number;
}

const ALLOWANCES: Record<VfxLevel, VfxAllowance> = {
  full: { particles: true, trail: 1, streak: 1, maxStreakTier: 8, accent: 1, arena: 1, turbo: 1 },
  lean: { particles: true, trail: 0.5, streak: 0.6, maxStreakTier: 5, accent: 0.6, arena: 0.5, turbo: 0.5 },
  minimal: { particles: false, trail: 0, streak: 0.5, maxStreakTier: 3, accent: 0, arena: 0, turbo: 0.5 },
};

export function allowanceFor(level: VfxLevel): VfxAllowance {
  return ALLOWANCES[level];
}

function shift(level: VfxLevel, delta: number): VfxLevel {
  const index = VFX_LEVELS.indexOf(level) + delta;
  return VFX_LEVELS[Math.min(VFX_LEVELS.length - 1, Math.max(0, index))];
}

/**
 * Deliberately asymmetric so it cannot oscillate: one bad window sheds a level
 * immediately, but recovery needs RECOVERY_EVALUATIONS consecutive clean ones.
 * Same hysteresis instinct as `shouldRetarget` in camera.ts.
 */
export function stepBudget(state: BudgetState, stats: FrameStats, profile: Profile): BudgetState {
  if (profile === 'reduced') return { level: 'minimal', cleanRuns: 0 };
  if (stats.samples === 0) return state;

  if (stats.dropped > DROP_THRESHOLD) {
    return { level: shift(state.level, -1), cleanRuns: 0 };
  }

  if (stats.dropped > 0) {
    return { level: state.level, cleanRuns: 0 };
  }

  const cleanRuns = state.cleanRuns + 1;
  if (cleanRuns >= RECOVERY_EVALUATIONS) {
    return { level: shift(state.level, 1), cleanRuns: 0 };
  }
  return { level: state.level, cleanRuns };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/vfxBudget.test.ts`
Expected: PASS — 11 tests

- [ ] **Step 5: Commit**

```bash
git add lib/world/vfxBudget.ts tests/vfxBudget.test.ts
git commit -m "feat(world): VFX budget watchdog"
```

---

### Task 4: The choreographer

The phase's centre of gravity: buffer drama at reveal, compile a sequence at the TRACK beat, emit `AvatarFrameState[]` per frame.

**Files:**
- Create: `lib/world/choreographer.ts`
- Test: `tests/choreographer.test.ts`

**Interfaces:**
- Consumes: `Cue` from `lib/presentation/cues.ts`; `CelebrationTier`, `isSubdued`, `resolveTier` from `lib/presentation/celebration.ts`; `MarkerAnchor` from `lib/world/geometry.ts`; `Flair`, `LEADER_EMPHASIS` from Task 2; `VfxAllowance` from Task 3; `MovementTrack`, `MOVEMENT_MS`, `sampleMovement`, `staggerFor`, `ANTICIPATE_MS`, `TRAVEL_MS` from Task 1.
- Produces: `VfxKind`, `VfxRequest`, `AvatarFrameState`, `ChoreographerState`, `initialChoreographerState`, `bufferCue()`, `beginSequence()`, `completeSequence()`, `isSequenceRunning()`, `notePlayerJoined()`, `avatarStates()`, `SUBDUED_INTENSITY`, `ARENA_AT_MS`, `PULSE_MS` — consumed by Tasks 7 and 8.

- [ ] **Step 1: Write the failing test**

Create `tests/choreographer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Cue } from '@/lib/presentation/cues';
import { allowanceFor } from '@/lib/world/vfxBudget';
import { markerAnchors, trackMetrics, type MarkerAnchor } from '@/lib/world/geometry';
import { flairFor, type FlairStanding } from '@/lib/world/flair';
import { ANTICIPATE_MS, MOVEMENT_MS, TRAVEL_MS } from '@/lib/world/movement';
import {
  ARENA_AT_MS,
  PULSE_MS,
  SUBDUED_INTENSITY,
  avatarStates,
  beginSequence,
  bufferCue,
  completeSequence,
  initialChoreographerState,
  isSequenceRunning,
  notePlayerJoined,
} from '@/lib/world/choreographer';

const metrics = trackMetrics(12);
const full = allowanceFor('full');

const s = (id: string, correct: number, speed = 0): FlairStanding => ({
  player_id: id, correct, speed_points: speed,
});

const before = [s('a', 1), s('b', 1)];
const after = [s('a', 2), s('b', 1)];
const anchorsBefore = markerAnchors(before, metrics);
const anchorsAfter = markerAnchors(after, metrics);

const advanced: Cue = { type: 'player-advanced', tier: 'routine', playerId: 'a', from: 1, to: 2 };
const overtook: Cue = { type: 'overtake', tier: 'overtake', playerId: 'a', passed: ['b'] };
const streak8: Cue = { type: 'streak-tier', tier: 'streakMilestone', playerId: 'a', streak: 8 };

function frame(state: Parameters<typeof avatarStates>[0], anchors: readonly MarkerAnchor[], now: number) {
  return avatarStates(state, anchors, flairFor(after, anchors), full, now, 'high');
}

describe('buffering', () => {
  it('holds the pre-reveal anchors while drama is pending', () => {
    const buffered = bufferCue(initialChoreographerState, advanced, anchorsBefore);
    const states = frame(buffered, anchorsAfter, 0);
    // 'a' is drawn at segment 1, not the segment 2 the standings already say.
    expect(states.find(v => v.playerId === 'a')!.x).toBe(anchorsBefore[0].x);
  });

  it('ignores cues that carry no drama', () => {
    const ignored: Cue = { type: 'answer-locked', tier: 'routine', choiceIndex: 2 };
    expect(bufferCue(initialChoreographerState, ignored, anchorsBefore))
      .toBe(initialChoreographerState);
  });
});

describe('the sequence', () => {
  it('plays the movement from the held anchors to the live ones', () => {
    let state = bufferCue(initialChoreographerState, advanced, anchorsBefore);
    state = beginSequence(state, anchorsAfter, 1000);
    expect(isSequenceRunning(state, 1000)).toBe(true);

    const settled = frame(state, anchorsAfter, 1000 + MOVEMENT_MS);
    expect(settled.find(v => v.playerId === 'a')!.x).toBe(anchorsAfter[0].x);
  });

  it('clears the queue when it starts', () => {
    let state = bufferCue(initialChoreographerState, advanced, anchorsBefore);
    state = beginSequence(state, anchorsAfter, 0);
    expect(state.pending).toEqual([]);
  });

  it('emits a boost trail during travel and not after', () => {
    let state = bufferCue(initialChoreographerState, advanced, anchorsBefore);
    state = beginSequence(state, anchorsAfter, 0);

    const travelling = frame(state, anchorsAfter, ANTICIPATE_MS + 10);
    expect(travelling.find(v => v.playerId === 'a')!.vfx.some(v => v.kind === 'trail')).toBe(true);

    const done = frame(state, anchorsAfter, MOVEMENT_MS + 10);
    expect(done.find(v => v.playerId === 'a')!.vfx.some(v => v.kind === 'trail')).toBe(false);
  });

  it('plays nothing when nobody scored', () => {
    const state = beginSequence(initialChoreographerState, anchorsAfter, 0);
    expect(isSequenceRunning(state, 0)).toBe(false);
  });
});

describe('tier arbitration', () => {
  it('subdues a below-headline effect rather than dropping it', () => {
    let state = bufferCue(initialChoreographerState, advanced, anchorsBefore);
    state = bufferCue(state, streak8, anchorsBefore);
    state = bufferCue(state, overtook, anchorsBefore); // overtake outranks streakMilestone
    state = beginSequence(state, anchorsAfter, 0);

    const at = frame(state, anchorsAfter, ANTICIPATE_MS + TRAVEL_MS + 10);
    const inferno = at.find(v => v.playerId === 'a')!.vfx.find(v => v.kind === 'inferno');
    expect(inferno).toBeDefined();
    expect(inferno!.intensity).toBeCloseTo(SUBDUED_INTENSITY, 5);
  });

  it('awards the arena reaction only to the headline tier', () => {
    let outranked = bufferCue(initialChoreographerState, streak8, anchorsBefore);
    outranked = bufferCue(outranked, overtook, anchorsBefore);
    outranked = beginSequence(outranked, anchorsAfter, 0);
    const suppressed = frame(outranked, anchorsAfter, ARENA_AT_MS + 10);
    expect(suppressed.some(v => v.vfx.some(x => x.kind === 'arena'))).toBe(false);

    let headline = bufferCue(initialChoreographerState, streak8, anchorsBefore);
    headline = beginSequence(headline, anchorsAfter, 0);
    const fired = frame(headline, anchorsAfter, ARENA_AT_MS + 10);
    expect(fired.some(v => v.vfx.some(x => x.kind === 'arena'))).toBe(true);
  });
});

describe('interruption and reload', () => {
  it('hard-completes to the final anchors on a phase change', () => {
    let state = bufferCue(initialChoreographerState, advanced, anchorsBefore);
    state = beginSequence(state, anchorsAfter, 0);
    state = completeSequence(state);

    expect(isSequenceRunning(state, 10)).toBe(false);
    const states = frame(state, anchorsAfter, 10);
    expect(states.find(v => v.playerId === 'a')!.x).toBe(anchorsAfter[0].x);
    expect(states.find(v => v.playerId === 'a')!.vfx.some(v => v.kind === 'trail')).toBe(false);
  });

  it('keeps persistent flair through a hard-complete', () => {
    let state = bufferCue(initialChoreographerState, streak8, anchorsBefore);
    state = beginSequence(state, anchorsAfter, 0);
    state = completeSequence(state);
    const states = frame(state, anchorsAfter, 10);
    const a = states.find(v => v.playerId === 'a')!;
    expect(a.medal).toBe('gold');
    expect(a.vfx.some(v => v.kind === 'inferno')).toBe(true);
  });

  it('renders a reload (empty queue) at the live anchors with flair intact', () => {
    const states = frame(initialChoreographerState, anchorsAfter, 5000);
    const a = states.find(v => v.playerId === 'a')!;
    expect(a.x).toBe(anchorsAfter[0].x);
    expect(a.medal).toBe('gold');
    expect(a.vfx.some(v => v.kind === 'trail')).toBe(false);
  });
});

describe('persistent flair', () => {
  it('carries the medal glow unclamped at every budget level', () => {
    const anchors = anchorsAfter;
    const states = avatarStates(
      initialChoreographerState, anchors, flairFor(after, anchors),
      allowanceFor('minimal'), 0, 'high',
    );
    const glow = states.find(v => v.playerId === 'a')!.vfx.find(v => v.kind === 'glow');
    expect(glow!.intensity).toBe(1);
  });

  it('caps the streak kind at the allowance ceiling', () => {
    let state = bufferCue(initialChoreographerState, streak8, anchorsBefore);
    state = beginSequence(state, anchorsAfter, 0);
    const states = avatarStates(
      state, anchorsAfter, flairFor(after, anchorsAfter),
      allowanceFor('lean'), MOVEMENT_MS + 10, 'high',
    );
    const kinds = states.find(v => v.playerId === 'a')!.vfx.map(v => v.kind);
    expect(kinds).toContain('flame');
    expect(kinds).not.toContain('inferno');
  });

  it('extinguishes a broken streak', () => {
    let state = bufferCue(initialChoreographerState, streak8, anchorsBefore);
    state = beginSequence(state, anchorsAfter, 0);
    state = completeSequence(state);
    state = bufferCue(state, { type: 'streak-broken', tier: 'routine', playerId: 'a' }, anchorsAfter);
    state = beginSequence(state, anchorsAfter, 10_000);
    const states = frame(state, anchorsAfter, 10_000 + MOVEMENT_MS);
    expect(states.find(v => v.playerId === 'a')!.vfx.some(v => v.kind === 'inferno')).toBe(false);
  });
});

describe('the lobby ready pulse', () => {
  it('pops and rings the newly joined avatar', () => {
    const state = notePlayerJoined(initialChoreographerState, 'a', 500);
    const states = frame(state, anchorsAfter, 600);
    const a = states.find(v => v.playerId === 'a')!;
    expect(a.vfx.some(v => v.kind === 'pulse')).toBe(true);
    expect(a.emphasis).toBeGreaterThan(flairFor(after, anchorsAfter).get('a')!.emphasis);
  });

  it('expires after PULSE_MS', () => {
    const state = notePlayerJoined(initialChoreographerState, 'a', 0);
    const states = frame(state, anchorsAfter, PULSE_MS + 1);
    expect(states.find(v => v.playerId === 'a')!.vfx.some(v => v.kind === 'pulse')).toBe(false);
  });

  it('is suppressed under the reduced profile', () => {
    const state = notePlayerJoined(initialChoreographerState, 'a', 0);
    const states = avatarStates(
      state, anchorsAfter, flairFor(after, anchorsAfter), full, 10, 'reduced',
    );
    expect(states.find(v => v.playerId === 'a')!.vfx.some(v => v.kind === 'pulse')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/choreographer.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/world/choreographer"`

- [ ] **Step 3: Write the implementation**

Create `lib/world/choreographer.ts`:

```ts
/**
 * The choreographer (spec §4) — this phase's centre of gravity.
 *
 * Pure: no Pixi, no store, no cue bus. Drama cues arrive at the reveal
 * transition (ADR-0003) and are BUFFERED; avatars hold their pre-reveal
 * anchors until `phase-track`, so the world deliberately lags the standings by
 * one beat. That lag is what gives P1's TRACK camera cut something to cut to.
 */
import type { Cue } from '@/lib/presentation/cues';
import { isSubdued, resolveTier, type CelebrationTier } from '@/lib/presentation/celebration';
import type { Profile } from '@/lib/presentation/profile';
import { LEADER_EMPHASIS, type Flair } from './flair';
import type { MarkerAnchor } from './geometry';
import {
  ANTICIPATE_MS,
  MOVEMENT_MS,
  TRAVEL_MS,
  sampleMovement,
  staggerFor,
  type MovementTrack,
} from './movement';
import type { VfxAllowance } from './vfxBudget';

/** Below-headline effects are quieter, never absent (spec §4). */
export const SUBDUED_INTENSITY = 0.6;

/** When the arena reaction lands, measured from sequence start. */
export const ARENA_AT_MS = 1400;
const ARENA_HOLD_MS = 1200;

/** How long a scheduled instant stays "firing" for the renderer. */
const ACCENT_WINDOW_MS = 160;

/** Lobby ready pulse (PRD §5.2). */
export const PULSE_MS = 600;
const PULSE_POP = 0.18;

export type VfxKind =
  | 'trail' | 'lightning' | 'ignition' | 'arena' | 'pulse'
  | 'spark' | 'flame' | 'inferno' | 'turbo' | 'glow';

export interface VfxRequest {
  kind: VfxKind;
  mount: 'behind' | 'front' | 'crown';
  /** 0..1 after arbitration and budget clamping. Never emitted at 0. */
  intensity: number;
}

export interface AvatarFrameState {
  playerId: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  emphasis: number;
  medal: 'gold' | 'silver' | 'bronze' | null;
  edgeHolder: boolean;
  vfx: VfxRequest[];
}

export type StreakTier = 0 | 3 | 5 | 8;

interface Scheduled {
  playerId: string;
  atMs: number;
}

interface Sequence {
  startedAt: number;
  headline: CelebrationTier;
  tracks: MovementTrack[];
  lightnings: Scheduled[];
  ignitions: (Scheduled & { tier: StreakTier })[];
  /** The player whose effect earned the beat's exclusive arena reaction. */
  arenaPlayerId: string | null;
  leadChange: { playerId: string; previousLeaderId: string } | null;
  /** Cue tier per player, for the subdue multiplier. */
  tiers: Record<string, CelebrationTier>;
  durationMs: number;
}

export interface ChoreographerState {
  pending: Cue[];
  /** Captured when the first drama cue of a beat is buffered. */
  heldAnchors: readonly MarkerAnchor[] | null;
  sequence: Sequence | null;
  /** Persistent — survives between beats, extinguished only by streak-broken. */
  streakTier: Record<string, StreakTier>;
  /** Lobby ready pulses: playerId -> the moment they joined. */
  pulses: Record<string, number>;
}

export const initialChoreographerState: ChoreographerState = {
  pending: [],
  heldAnchors: null,
  sequence: null,
  streakTier: {},
  pulses: {},
};

const DRAMA = new Set<Cue['type']>([
  'player-advanced', 'overtake', 'lead-changed', 'streak-tier', 'streak-broken',
]);

/** Buffer a drama cue and capture the pre-reveal world on the first one. */
export function bufferCue(
  state: ChoreographerState,
  cue: Cue,
  liveAnchors: readonly MarkerAnchor[],
): ChoreographerState {
  if (!DRAMA.has(cue.type)) return state;
  return {
    ...state,
    pending: [...state.pending, cue],
    heldAnchors: state.heldAnchors ?? liveAnchors,
  };
}

/** Compile the queue into a timeline. Called on `phase-track`. */
export function beginSequence(
  state: ChoreographerState,
  liveAnchors: readonly MarkerAnchor[],
  now: number,
): ChoreographerState {
  if (state.pending.length === 0) {
    return { ...state, pending: [], heldAnchors: null, sequence: null };
  }

  const held = state.heldAnchors ?? liveAnchors;
  const heldById = new Map(held.map(a => [a.playerId, a]));
  const headline = resolveTier(state.pending);

  // Back-marker first: the passer then arrives AFTER the passed.
  const ordered = [...liveAnchors].sort((a, b) => a.x - b.x);
  const tracks: MovementTrack[] = ordered.map((anchor, index) => {
    const from = heldById.get(anchor.playerId) ?? anchor;
    return {
      playerId: anchor.playerId,
      from: { x: from.x, y: from.y },
      to: { x: anchor.x, y: anchor.y },
      delayMs: staggerFor(index, 'high'),
    };
  });
  const delayOf = new Map(tracks.map(t => [t.playerId, t.delayMs]));

  const lightnings: Scheduled[] = [];
  const ignitions: (Scheduled & { tier: StreakTier })[] = [];
  const streakTier: Record<string, StreakTier> = { ...state.streakTier };
  const tiers: Record<string, CelebrationTier> = {};
  let leadChange: Sequence['leadChange'] = null;
  let arenaPlayerId: string | null = null;

  for (const cue of state.pending) {
    switch (cue.type) {
      case 'player-advanced':
        tiers[cue.playerId] = maxTier(tiers[cue.playerId], cue.tier);
        break;

      case 'overtake':
        tiers[cue.playerId] = maxTier(tiers[cue.playerId], cue.tier);
        // The crossing lands mid-travel; that is when the accent reads.
        lightnings.push({
          playerId: cue.playerId,
          atMs: (delayOf.get(cue.playerId) ?? 0) + ANTICIPATE_MS + TRAVEL_MS * 0.6,
        });
        if (cue.tier === headline) arenaPlayerId ??= cue.playerId;
        break;

      case 'lead-changed':
        tiers[cue.playerId] = maxTier(tiers[cue.playerId], cue.tier);
        leadChange = { playerId: cue.playerId, previousLeaderId: cue.previousLeaderId };
        if (cue.tier === headline) arenaPlayerId ??= cue.playerId;
        break;

      case 'streak-tier':
        tiers[cue.playerId] = maxTier(tiers[cue.playerId], cue.tier);
        streakTier[cue.playerId] = cue.streak;
        ignitions.push({
          playerId: cue.playerId,
          atMs: (delayOf.get(cue.playerId) ?? 0) + ANTICIPATE_MS + TRAVEL_MS,
          tier: cue.streak,
        });
        if (cue.tier === headline) arenaPlayerId ??= cue.playerId;
        break;

      case 'streak-broken':
        streakTier[cue.playerId] = 0;
        break;
    }
  }

  const lastDelay = tracks.length > 0 ? Math.max(...tracks.map(t => t.delayMs)) : 0;
  const durationMs = Math.max(
    lastDelay + MOVEMENT_MS,
    arenaPlayerId ? ARENA_AT_MS + ARENA_HOLD_MS : 0,
  );

  return {
    pending: [],
    heldAnchors: null,
    pulses: state.pulses,
    streakTier,
    sequence: {
      startedAt: now, headline, tracks, lightnings, ignitions,
      arenaPlayerId, leadChange, tiers, durationMs,
    },
  };
}

/** Hard-complete: snap to final anchors, clear transients, keep persistent flair. */
export function completeSequence(state: ChoreographerState): ChoreographerState {
  return { ...state, pending: [], heldAnchors: null, sequence: null };
}

/** The lobby ready pulse (PRD §5.2) — an arrival, not drama, so it never queues. */
export function notePlayerJoined(
  state: ChoreographerState,
  playerId: string,
  now: number,
): ChoreographerState {
  return { ...state, pulses: { ...state.pulses, [playerId]: now } };
}

export function isSequenceRunning(state: ChoreographerState, now: number): boolean {
  return state.sequence !== null && now - state.sequence.startedAt < state.sequence.durationMs;
}

export function avatarStates(
  state: ChoreographerState,
  liveAnchors: readonly MarkerAnchor[],
  flair: ReadonlyMap<string, Flair>,
  allowance: VfxAllowance,
  now: number,
  profile: Profile,
): AvatarFrameState[] {
  const running = isSequenceRunning(state, now);
  const sequence = running ? state.sequence! : null;
  const elapsed = sequence ? now - sequence.startedAt : 0;
  const trackById = new Map(sequence?.tracks.map(t => [t.playerId, t]) ?? []);

  // While drama is pending but the beat has not started, the world is frozen
  // one step behind the standings.
  const positions = !running && state.pending.length > 0 && state.heldAnchors
    ? state.heldAnchors
    : liveAnchors;
  const positionById = new Map(positions.map(a => [a.playerId, a]));

  return liveAnchors.map(anchor => {
    const own = flair.get(anchor.playerId) ?? { medal: null, emphasis: 1, edgeHolder: false };
    const held = positionById.get(anchor.playerId) ?? anchor;
    const track = trackById.get(anchor.playerId);

    const sample = track
      ? sampleMovement(track, elapsed, profile)
      : { x: held.x, y: held.y, scaleX: 1, scaleY: 1, trail: 0 };

    const subdue = (tier: CelebrationTier): number =>
      sequence && isSubdued(tier, sequence.headline) ? SUBDUED_INTENSITY : 1;

    const ownSubdued = subdue(sequence?.tiers[anchor.playerId] ?? 'routine');
    const vfx: VfxRequest[] = [];

    // ── Persistent: derived from standings, survives a reload ──────────────
    if (own.medal) {
      // Never clamped by the budget — rank is information, not decoration.
      vfx.push({ kind: 'glow', mount: 'crown', intensity: 1 });
    }
    if (own.edgeHolder && allowance.turbo > 0) {
      vfx.push({ kind: 'turbo', mount: 'behind', intensity: allowance.turbo });
    }
    const streak = cappedStreak(state.streakTier[anchor.playerId] ?? 0, allowance.maxStreakTier);
    if (streak.kind && allowance.streak > 0) {
      vfx.push({ kind: streak.kind, mount: 'behind', intensity: allowance.streak * ownSubdued });
    }

    // ── Transient: alive only inside a sequence ────────────────────────────
    if (sequence) {
      const trail = sample.trail * allowance.trail * ownSubdued;
      if (trail > 0) vfx.push({ kind: 'trail', mount: 'behind', intensity: trail });

      if (firing(sequence.lightnings, anchor.playerId, elapsed) && allowance.accent > 0) {
        vfx.push({ kind: 'lightning', mount: 'front', intensity: allowance.accent * ownSubdued });
      }
      if (firing(sequence.ignitions, anchor.playerId, elapsed) && allowance.accent > 0) {
        vfx.push({ kind: 'ignition', mount: 'behind', intensity: allowance.accent * ownSubdued });
      }
      if (
        sequence.arenaPlayerId === anchor.playerId &&
        allowance.arena > 0 &&
        elapsed >= ARENA_AT_MS &&
        elapsed < ARENA_AT_MS + ARENA_HOLD_MS
      ) {
        // Exclusive: one per beat, headline tier only, never subdued.
        vfx.push({ kind: 'arena', mount: 'crown', intensity: allowance.arena });
      }
    }

    // ── Lobby ready pulse: an arrival, independent of any sequence ─────────
    const pulseAge = now - (state.pulses[anchor.playerId] ?? -Infinity);
    const pulsing = profile !== 'reduced' && pulseAge >= 0 && pulseAge < PULSE_MS;
    if (pulsing) {
      vfx.push({ kind: 'pulse', mount: 'crown', intensity: 1 - pulseAge / PULSE_MS });
    }

    const emphasis = emphasisFor(anchor.playerId, own, sequence, elapsed);

    return {
      playerId: anchor.playerId,
      x: sample.x,
      y: sample.y,
      scaleX: sample.scaleX,
      scaleY: sample.scaleY,
      emphasis: pulsing
        ? emphasis * (1 + PULSE_POP * (1 - pulseAge / PULSE_MS))
        : emphasis,
      medal: own.medal,
      edgeHolder: own.edgeHolder,
      vfx,
    };
  });
}

function maxTier(current: CelebrationTier | undefined, next: CelebrationTier): CelebrationTier {
  return current ? resolveTier([{ tier: current }, { tier: next }]) : next;
}

function cappedStreak(tier: StreakTier, ceiling: StreakTier): { kind: VfxKind | null } {
  const effective = Math.min(tier, ceiling) as StreakTier;
  if (effective >= 8) return { kind: 'inferno' };
  if (effective >= 5) return { kind: 'flame' };
  if (effective >= 3) return { kind: 'spark' };
  return { kind: null };
}

function firing(scheduled: readonly Scheduled[], playerId: string, elapsed: number): boolean {
  return scheduled.some(
    e => e.playerId === playerId && elapsed >= e.atMs && elapsed < e.atMs + ACCENT_WINDOW_MS,
  );
}

/**
 * A lead change is an exchange: the new leader swells while the old one drops,
 * both across the landing window, so the two read as one gesture.
 */
function emphasisFor(
  playerId: string,
  flair: Flair,
  sequence: Sequence | null,
  elapsed: number,
): number {
  const change = sequence?.leadChange;
  if (!change) return flair.emphasis;

  const start = ANTICIPATE_MS + TRAVEL_MS;
  const k = Math.min(1, Math.max(0, (elapsed - start) / (MOVEMENT_MS - start)));

  if (playerId === change.playerId) return 1 + (LEADER_EMPHASIS - 1) * k;
  if (playerId === change.previousLeaderId) return LEADER_EMPHASIS - (LEADER_EMPHASIS - 1) * k;
  return flair.emphasis;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/choreographer.test.ts`
Expected: PASS — 17 tests

- [ ] **Step 5: Commit**

```bash
git add lib/world/choreographer.ts tests/choreographer.test.ts
git commit -m "feat(world): drama choreographer with TRACK-beat sequencing"
```

---

### Task 5: Grid anchors and start-line framing

The lobby formation, plus the one camera change this phase makes.

**Files:**
- Modify: `lib/world/geometry.ts` (append `gridAnchors`)
- Modify: `lib/world/framing.ts:41-45` (`startLine` case)
- Test: `tests/geometry.test.ts` (append), `tests/framing.test.ts` (append)

**Interfaces:**
- Consumes: `TrackMetrics`, `MarkerAnchor`, `TRACK_MARGIN`, `MARKER_ROW_HEIGHT` from `lib/world/geometry.ts`.
- Produces: `GridPlayer`, `gridAnchors()` — consumed by Task 8. `frameTarget('startLine', …)` now frames the formation bounds.

- [ ] **Step 1: Write the failing tests**

In `tests/geometry.test.ts`, add `gridAnchors` and `type GridPlayer` to the **existing** `@/lib/world/geometry` import block at the top (`TRACK_MARGIN` and `trackMetrics` are already there), then append:

```ts
describe('gridAnchors', () => {
  const players = (n: number): GridPlayer[] =>
    Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));

  it('places everyone behind the start line', () => {
    for (const a of gridAnchors(players(8), trackMetrics(12))) {
      expect(a.x).toBeLessThan(0);
      expect(a.x).toBeGreaterThanOrEqual(-TRACK_MARGIN);
    }
  });

  it('staggers into two rows', () => {
    const anchors = gridAnchors(players(4), trackMetrics(12));
    expect(anchors[0].row).toBe(0);
    expect(anchors[1].row).toBe(1);
    expect(anchors[2].row).toBe(0);
    expect(anchors[1].y).toBeLessThan(anchors[0].y);
  });

  it('puts each pair further back than the last', () => {
    const anchors = gridAnchors(players(6), trackMetrics(12));
    expect(anchors[2].x).toBeLessThan(anchors[0].x);
    expect(anchors[4].x).toBeLessThan(anchors[2].x);
  });

  it('handles an empty lobby', () => {
    expect(gridAnchors([], trackMetrics(12))).toEqual([]);
  });

  it('keeps a single player on the front row', () => {
    const [only] = gridAnchors(players(1), trackMetrics(12));
    expect(only.row).toBe(0);
    expect(only.y).toBe(0);
  });
});
```

Append to `tests/framing.test.ts` (it already imports `frameTarget` and `trackMetrics`; add only the `gridAnchors` import):

```ts
import { gridAnchors } from '@/lib/world/geometry';

describe('startLine framing', () => {
  it('frames the grid formation when one is present', () => {
    const metrics = trackMetrics(12);
    const anchors = gridAnchors([{ id: 'a' }, { id: 'b' }, { id: 'c' }], metrics);
    const shot = frameTarget('startLine', {
      anchors, metrics, viewport: { width: 1280, height: 720 },
      localPlayerId: 'a', emphasisIds: [],
    });
    const lo = Math.min(...anchors.map(a => a.x));
    expect(shot.centerX - shot.span / 2).toBeLessThanOrEqual(lo);
    expect(shot.centerX).toBeLessThan(0);
  });

  it('falls back to a fixed shot with an empty grid', () => {
    const metrics = trackMetrics(12);
    const shot = frameTarget('startLine', {
      anchors: [], metrics, viewport: { width: 1280, height: 720 },
      localPlayerId: null, emphasisIds: [],
    });
    expect(shot.span).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/geometry.test.ts tests/framing.test.ts`
Expected: FAIL — `gridAnchors` is not exported from `@/lib/world/geometry`

- [ ] **Step 3: Write the implementation**

Append to `lib/world/geometry.ts`:

```ts
/** Structural subset of `PlayerPublic` for the lobby formation. */
export interface GridPlayer {
  id: string;
}

/** Column spacing of the starting grid, in world units. */
export const GRID_COLUMN_WIDTH = 90;

/** Gap between the front row and the start line. */
export const GRID_LEAD_IN = 40;

/**
 * The lobby starting grid (spec §7): a staggered two-row race formation in the
 * run-off `TRACK_MARGIN` already reserves, so eight players read as a grid
 * rather than a queue. Join order is grid order.
 */
export function gridAnchors(
  players: readonly GridPlayer[],
  metrics: TrackMetrics,
): MarkerAnchor[] {
  return players.map((player, index) => {
    const row = index % 2;
    const column = Math.floor(index / 2);
    const x = Math.max(
      metrics.minX,
      -GRID_LEAD_IN - column * GRID_COLUMN_WIDTH,
    );
    return {
      playerId: player.id,
      x,
      y: row > 0 ? -row * MARKER_ROW_HEIGHT : 0,
      row,
      segment: 0,
    };
  });
}
```

Replace the `startLine` case in `lib/world/framing.ts:41-45`:

```ts
    case 'startLine': {
      // With a lobby grid present, frame the formation; otherwise hold the
      // fixed establishing shot on the start line.
      if (input.anchors.length === 0) {
        return clampCamera(
          { centerX: segmentToWorldX(0), span: START_LINE_SEGMENTS * SEGMENT_WIDTH },
          metrics,
        );
      }
      return fit(input.anchors, PACK_PADDING, input);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/geometry.test.ts tests/framing.test.ts`
Expected: PASS — all existing cases plus 7 new

- [ ] **Step 5: Commit**

```bash
git add lib/world/geometry.ts lib/world/framing.ts tests/geometry.test.ts tests/framing.test.ts
git commit -m "feat(world): lobby grid anchors and start-line framing"
```

---

### Task 6: The avatar roster

Twelve characters as content. Data and draw functions only — no motion, no Pixi classes.

**Files:**
- Create: `lib/world/content/roster.ts`
- Test: `tests/roster.test.ts`

**Interfaces:**
- Consumes: `Graphics` type from `pixi.js`; `COLOR` from `lib/presentation/tokens.ts`; `AVATARS` from `lib/avatars.ts`.
- Produces: `AvatarSpec`, `AvatarDrawContext`, `IdleQuirk`, `ROSTER`, `specFor()`, `AVATAR_HEIGHT` — consumed by Task 7.

- [ ] **Step 1: Write the failing test**

Create `tests/roster.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AVATARS } from '@/lib/avatars';
import { ROSTER, specFor } from '@/lib/world/content/roster';

describe('roster coverage', () => {
  it('covers every key in lib/avatars.ts exactly once', () => {
    const rosterKeys = ROSTER.map(a => a.key).sort();
    const avatarKeys = AVATARS.map(a => a.key).sort();
    expect(rosterKeys).toEqual(avatarKeys);
  });

  it('falls back to a known spec for an unrecognised key', () => {
    expect(specFor('not-a-real-avatar')).toBe(ROSTER[0]);
  });

  it('resolves a real key to its own spec', () => {
    expect(specFor('duck').key).toBe('duck');
  });
});

describe('spec shape', () => {
  it('gives every character mounts, a quirk and a height', () => {
    for (const spec of ROSTER) {
      expect(spec.height).toBeGreaterThan(0);
      expect(spec.idle.periodMs).toBeGreaterThan(0);
      expect(spec.idle.amount).toBeGreaterThan(0);
      expect(spec.idle.amount).toBeLessThanOrEqual(1);
      expect(['bob', 'sway', 'pulse', 'tilt']).toContain(spec.idle.kind);
      for (const mount of ['behind', 'front', 'crown'] as const) {
        expect(typeof spec.mounts[mount].x).toBe('number');
        expect(typeof spec.mounts[mount].y).toBe('number');
      }
      expect(typeof spec.draw).toBe('function');
    }
  });

  it('varies the idle quirk across the roster', () => {
    expect(new Set(ROSTER.map(s => s.idle.kind)).size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/roster.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/world/content/roster"`

- [ ] **Step 3: Write the implementation**

Create `lib/world/content/roster.ts`:

```ts
/**
 * The avatar roster as CONTENT (spec §5), in the shape ADR-0007 established
 * for world layers: a draw function plus declarative data, never a code path.
 *
 * Bodies bake in their OWN natural colors. The player's accent color is applied
 * by the rig as a rim light, shadow tint, trail and label underline — never as
 * a body tint, which would make a coffee cup and a rubber duck the same orange
 * blob (spec decision 4).
 *
 * `key` matches lib/avatars.ts exactly: one roster, two renderers.
 */
import type { Graphics } from 'pixi.js';
import { COLOR } from '@/lib/presentation/tokens';

/** Baked texture height in px. Bodies are drawn into a box of this size. */
export const AVATAR_HEIGHT = 128;

export interface Point {
  x: number;
  y: number;
}

export interface IdleQuirk {
  kind: 'bob' | 'sway' | 'pulse' | 'tilt';
  periodMs: number;
  /** Peak deviation, 0..1. */
  amount: number;
}

export interface AvatarDrawContext {
  width: number;
  height: number;
  color: typeof COLOR;
}

export interface AvatarSpec {
  key: string;
  draw(g: Graphics, ctx: AvatarDrawContext): void;
  idle: IdleQuirk;
  /** Attachment points in rig-local units; origin is the character's feet. */
  mounts: { behind: Point; front: Point; crown: Point };
  height: number;
}

const MOUNTS = {
  behind: { x: -34, y: -46 },
  front: { x: 34, y: -46 },
  crown: { x: 0, y: -104 },
};

function base(
  key: string,
  idle: IdleQuirk,
  draw: AvatarSpec['draw'],
): AvatarSpec {
  return { key, idle, draw, mounts: MOUNTS, height: AVATAR_HEIGHT };
}

/** Rounded body block shared by most silhouettes. */
function body(g: Graphics, w: number, h: number, fill: number, stroke: number): void {
  g.roundRect(-w / 2, -h, w, h, 12).fill({ color: fill });
  g.roundRect(-w / 2, -h, w, h, 12).stroke({ color: stroke, width: 3 });
}

function eyes(g: Graphics, y: number): void {
  g.circle(-11, y, 5).fill({ color: 0xffffff });
  g.circle(11, y, 5).fill({ color: 0xffffff });
  g.circle(-10, y, 2.5).fill({ color: COLOR.void });
  g.circle(12, y, 2.5).fill({ color: COLOR.void });
}

export const ROSTER: readonly AvatarSpec[] = [
  base('coffee', { kind: 'bob', periodMs: 2600, amount: 0.05 }, (g, c) => {
    body(g, 62, 84, 0xf3ede4, 0xb9a894);
    g.roundRect(-34, -84, 68, 12, 6).fill({ color: 0xd9cbb8 });
    g.ellipse(38, -52, 12, 16).stroke({ color: 0xb9a894, width: 6 });
    eyes(g, -54);
  }),

  base('cactus', { kind: 'sway', periodMs: 3400, amount: 0.06 }, (g, c) => {
    body(g, 46, 96, 0x4c9a5a, 0x2f6b3c);
    g.roundRect(-40, -74, 22, 34, 10).fill({ color: 0x4c9a5a });
    g.roundRect(18, -86, 22, 40, 10).fill({ color: 0x4c9a5a });
    eyes(g, -62);
  }),

  base('duck', { kind: 'bob', periodMs: 2200, amount: 0.07 }, (g, c) => {
    g.ellipse(0, -38, 36, 38).fill({ color: 0xffd23f });
    g.circle(4, -78, 26).fill({ color: 0xffd23f });
    g.roundRect(22, -80, 24, 12, 5).fill({ color: 0xf07f1a });
    eyes(g, -84);
  }),

  base('robot', { kind: 'pulse', periodMs: 1800, amount: 0.04 }, (g, c) => {
    body(g, 66, 74, 0x9aa6c4, 0x5d6a8c);
    g.roundRect(-30, -104, 60, 34, 8).fill({ color: 0xc3cde6 });
    g.rect(-2, -128, 4, 24).fill({ color: 0x5d6a8c });
    g.circle(0, -132, 6).fill({ color: c.color.neonCyan });
    eyes(g, -88);
  }),

  base('cat', { kind: 'tilt', periodMs: 3000, amount: 0.05 }, (g, c) => {
    g.ellipse(0, -34, 34, 34).fill({ color: 0x6b5b4e });
    g.circle(0, -76, 30).fill({ color: 0x6b5b4e });
    g.poly([-28, -96, -14, -124, -4, -94]).fill({ color: 0x6b5b4e });
    g.poly([28, -96, 14, -124, 4, -94]).fill({ color: 0x6b5b4e });
    g.poly([-16, -46, 16, -46, 0, -22]).fill({ color: c.color.wrong });
    eyes(g, -80);
  }),

  base('clip', { kind: 'tilt', periodMs: 2400, amount: 0.08 }, (g, c) => {
    g.roundRect(-22, -104, 44, 104, 22).stroke({ color: 0xc9d3ea, width: 9 });
    g.roundRect(-10, -84, 20, 66, 10).stroke({ color: 0xc9d3ea, width: 9 });
    eyes(g, -66);
  }),

  base('plant', { kind: 'sway', periodMs: 3800, amount: 0.07 }, (g, c) => {
    g.poly([-26, 0, 26, 0, 20, -40, -20, -40]).fill({ color: 0xb2653f });
    g.ellipse(-20, -62, 18, 26).fill({ color: 0x3f8f52 });
    g.ellipse(20, -62, 18, 26).fill({ color: 0x3f8f52 });
    g.ellipse(0, -84, 16, 30).fill({ color: 0x4fa863 });
    eyes(g, -48);
  }),

  base('donut', { kind: 'pulse', periodMs: 2000, amount: 0.06 }, (g, c) => {
    g.circle(0, -50, 46).fill({ color: 0xe8b07a });
    g.circle(0, -50, 44).fill({ color: 0xf06fa8 });
    g.circle(0, -50, 16).fill({ color: COLOR.abyss });
    for (const [x, y] of [[-24, -70], [16, -74], [-8, -26], [26, -38]]) {
      g.roundRect(x, y, 12, 5, 2).fill({ color: 0xfff2b2 });
    }
    eyes(g, -58);
  }),

  base('bulb', { kind: 'pulse', periodMs: 1600, amount: 0.09 }, (g, c) => {
    g.circle(0, -74, 34).fill({ color: 0xffe9a3 });
    g.roundRect(-16, -44, 32, 30, 6).fill({ color: 0xa9b2c9 });
    g.rect(-16, -34, 32, 4).fill({ color: 0x7b8399 });
    eyes(g, -80);
  }),

  base('headset', { kind: 'bob', periodMs: 2800, amount: 0.05 }, (g, c) => {
    g.roundRect(-38, -104, 76, 20, 10).fill({ color: 0x3b4466 });
    g.roundRect(-44, -92, 22, 46, 10).fill({ color: 0x4d5878 });
    g.roundRect(22, -92, 22, 46, 10).fill({ color: 0x4d5878 });
    body(g, 54, 60, 0x2b3450, 0x4d5878);
    eyes(g, -44);
  }),

  base('juice', { kind: 'tilt', periodMs: 2600, amount: 0.06 }, (g, c) => {
    body(g, 54, 92, 0xf0f4ff, 0xb9c4e0);
    g.roundRect(-27, -92, 54, 26, 4).fill({ color: 0x6fc4d8 });
    g.rect(10, -122, 6, 34).fill({ color: c.color.wrong });
    eyes(g, -56);
  }),

  base('rocket', { kind: 'bob', periodMs: 1900, amount: 0.08 }, (g, c) => {
    g.poly([0, -128, 26, -60, -26, -60]).fill({ color: 0xe8eaf2 });
    body(g, 52, 60, 0xe8eaf2, 0xb0b6c8);
    g.poly([-26, -20, -46, 0, -26, 0]).fill({ color: c.color.wrong });
    g.poly([26, -20, 46, 0, 26, 0]).fill({ color: c.color.wrong });
    g.circle(0, -76, 12).fill({ color: c.color.neonCyan });
    eyes(g, -40);
  }),
];

export function specFor(key: string): AvatarSpec {
  return ROSTER.find(spec => spec.key === key) ?? ROSTER[0];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/roster.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Verify the roster type-checks against Pixi**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add lib/world/content/roster.ts tests/roster.test.ts
git commit -m "feat(world): procedural avatar roster content"
```

---

### Task 7: The rig, the renderer, and the VFX pool

Replaces `Markers.ts`. Canvas internals are not unit-tested (spec §9); verification is type-check, the existing suite, and a visual smoke check.

**Files:**
- Create: `lib/world/render/AvatarNode.ts`, `lib/world/render/Vfx.ts`, `lib/world/render/Avatars.ts`
- Delete: `lib/world/render/Markers.ts`
- Modify: `lib/world/render/WorldScene.ts`, `lib/world/frame.ts`

**Interfaces:**
- Consumes: `AvatarFrameState`, `VfxRequest`, `VfxKind` (Task 4); `AvatarSpec`, `specFor`, `AVATAR_HEIGHT` (Task 6); `VfxAllowance` (Task 3); `worldScale`, `horizonY`, `CameraState`, `Viewport` from `geometry.ts`.
- Produces: `AvatarPlayer`, `Avatars` class with `setPlayers()` / `apply()` / `destroy()`; `WorldFrameState` gains `avatars` and `allowance`.

- [ ] **Step 1: Extend the frame contract**

Modify `lib/world/frame.ts` — replace `anchors` with the choreographed states and carry the allowance:

```ts
import type { AvatarFrameState } from './choreographer';
import type { CameraState, TrackMetrics, Viewport } from './geometry';
import type { VfxAllowance } from './vfxBudget';
import type { GradeState, ZoneWeights } from './zones';

export interface WorldFrameState {
  camera: CameraState;
  viewport: Viewport;
  metrics: TrackMetrics;
  /** Sampled at the camera centre — see the note in WorldScene. */
  zones: ZoneWeights;
  grade: GradeState;
  /** Fully choreographed; the renderer applies these and decides nothing. */
  avatars: readonly AvatarFrameState[];
  /** Whether particle systems may run, and at what strength. */
  allowance: VfxAllowance;
  /** Whose avatar gets the "you" ring; null before the session is known. */
  localPlayerId: string | null;
  /** Milliseconds since the scene was created; drives ambient animation. */
  elapsedMs: number;
}
```

- [ ] **Step 2: Write the VFX pool**

Create `lib/world/render/Vfx.ts`:

```ts
/**
 * One pooled emitter for the whole scene (spec §8).
 *
 * The pool is allocated ONCE at construction and never grows: a budget change
 * alters emission rates, never allocation. Particles are recycled oldest-first
 * when the ceiling is reached.
 */
import { Container, Graphics } from 'pixi.js';
import { COLOR } from '@/lib/presentation/tokens';
import type { VfxKind, VfxRequest } from '../choreographer';
import type { VfxAllowance } from '../vfxBudget';

const MAX_PARTICLES = 240;
const LIFETIME_MS = 700;

const TINTS: Record<VfxKind, number> = {
  trail: COLOR.neonCyan,
  lightning: COLOR.neonLime,
  ignition: COLOR.warning,
  arena: COLOR.neonMagenta,
  pulse: COLOR.neonCyan,
  spark: COLOR.warning,
  flame: 0xff8a3d,
  inferno: COLOR.wrong,
  turbo: COLOR.warning,
  glow: COLOR.gold,
};

interface Particle {
  sprite: Graphics;
  bornAt: number;
  lifetimeMs: number;
  vx: number;
  vy: number;
}

export class Vfx {
  readonly container = new Container();
  private readonly pool: Particle[] = [];
  private cursor = 0;

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const sprite = new Graphics();
      sprite.circle(0, 0, 4).fill({ color: 0xffffff });
      sprite.visible = false;
      this.container.addChild(sprite);
      this.pool.push({ sprite, bornAt: -Infinity, lifetimeMs: LIFETIME_MS, vx: 0, vy: 0 });
    }
  }

  /**
   * @param x,y screen-space position of the request's mount point
   */
  emit(request: VfxRequest, x: number, y: number, scale: number, allowance: VfxAllowance, now: number): void {
    if (!allowance.particles) return;
    // Intensity is the emission probability per frame; 1 emits every frame.
    if (Math.random() > request.intensity) return;

    const particle = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;

    particle.sprite.tint = TINTS[request.kind];
    particle.sprite.visible = true;
    particle.sprite.x = x;
    particle.sprite.y = y;
    particle.sprite.scale.set(scale * (0.6 + Math.random() * 0.8));
    particle.sprite.alpha = request.intensity;
    particle.bornAt = now;
    particle.lifetimeMs = LIFETIME_MS * (0.6 + Math.random() * 0.6);
    particle.vx = (Math.random() - 0.5) * 40 - (request.mount === 'behind' ? 60 : 0);
    particle.vy = -20 - Math.random() * 60;
  }

  update(now: number, dtMs: number): void {
    for (const particle of this.pool) {
      if (!particle.sprite.visible) continue;
      const age = now - particle.bornAt;
      if (age >= particle.lifetimeMs) {
        particle.sprite.visible = false;
        continue;
      }
      const k = age / particle.lifetimeMs;
      particle.sprite.x += (particle.vx * dtMs) / 1000;
      particle.sprite.y += (particle.vy * dtMs) / 1000;
      particle.sprite.alpha = (1 - k) * 0.9;
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
```

- [ ] **Step 3: Write the rig**

Create `lib/world/render/AvatarNode.ts`:

```ts
/**
 * One avatar rig (spec §5). Every character has this same structure, back to
 * front, which is what lets one movement grammar drive twelve characters:
 *
 *   shadow -> flair glow -> body sprite -> accent rim -> label (+ YOU ring)
 *
 * VFX are emitted into the scene-level pool at this rig's mount points, so
 * particles are never parented to a moving node.
 */
import { Container, Graphics, Sprite, Text, TextStyle, type Application, type Texture } from 'pixi.js';
import { COLOR } from '@/lib/presentation/tokens';
import type { Profile } from '@/lib/presentation/profile';
import type { AvatarFrameState } from '../choreographer';
import { AVATAR_HEIGHT, type AvatarSpec } from '../content/roster';

const MEDAL_TINTS = { gold: COLOR.gold, silver: COLOR.silver, bronze: COLOR.bronze } as const;

/** Baked once per character key, shared by every player using it. */
const textures = new Map<string, Texture>();

function bake(app: Application, spec: AvatarSpec): Texture {
  const cached = textures.get(spec.key);
  if (cached) return cached;

  const g = new Graphics();
  spec.draw(g, { width: AVATAR_HEIGHT, height: AVATAR_HEIGHT, color: COLOR });
  const texture = app.renderer.generateTexture({ target: g });
  g.destroy();
  textures.set(spec.key, texture);
  return texture;
}

/** Drop every baked texture. Call only when the renderer is torn down. */
export function clearBakedAvatars(): void {
  for (const texture of textures.values()) texture.destroy(true);
  textures.clear();
}

export class AvatarNode {
  readonly container = new Container();
  private readonly glow = new Graphics();
  private readonly shadow = new Graphics();
  private readonly rim = new Graphics();
  private readonly bodyHolder = new Container();
  private readonly body: Sprite;
  private idlePhase = Math.random() * 10_000;

  constructor(
    app: Application,
    readonly spec: AvatarSpec,
    accent: number,
    nickname: string,
    isLocal: boolean,
    /**
     * Held at construction, exactly as P1's `Grade` and `Markers` do — the
     * static-per-render-pass pattern ADR-0004 established. The VFX budget is
     * the only thing in this phase that changes at runtime, and it never
     * touches the profile.
     */
    private readonly profile: Profile,
  ) {
    this.shadow.ellipse(0, 0, 34, 9).fill({ color: accent, alpha: 0.35 });
    this.container.addChild(this.shadow);
    this.container.addChild(this.glow);

    this.body = new Sprite(bake(app, spec));
    this.body.anchor.set(0.5, 1);
    this.bodyHolder.addChild(this.body);

    // The accent is a RIM, never a body tint (spec decision 4).
    this.rim.roundRect(-38, -AVATAR_HEIGHT, 76, AVATAR_HEIGHT, 14)
      .stroke({ color: accent, width: 3, alpha: 0.85 });
    this.bodyHolder.addChild(this.rim);
    this.container.addChild(this.bodyHolder);

    const label = new Text({
      text: nickname,
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 20,
        fontWeight: '700',
        fill: isLocal ? COLOR.silver : 0xc7cede,
      }),
    });
    label.anchor.set(0.5, 0);
    label.y = 8;
    this.container.addChild(label);

    const underline = new Graphics();
    underline.roundRect(-26, 32, 52, isLocal ? 5 : 3, 2).fill({ color: accent });
    this.container.addChild(underline);
  }

  /** @param state fully choreographed; this method decides nothing. */
  apply(state: AvatarFrameState, screenX: number, screenY: number, scale: number, elapsedMs: number): void {
    this.container.x = screenX;
    this.container.y = screenY;

    const idle = this.idleOffset(elapsedMs, state);
    this.container.scale.set(scale * state.emphasis);
    this.bodyHolder.scale.set(state.scaleX, state.scaleY);
    this.bodyHolder.y = idle.y;
    this.bodyHolder.rotation = idle.rotation;

    // The shadow reads the squash — this is what keeps a boost grounded.
    this.shadow.scale.set(state.scaleX, 1);
    this.shadow.alpha = 0.2 + 0.25 * state.scaleY;

    this.glow.clear();
    if (state.medal) {
      this.glow
        .circle(0, -AVATAR_HEIGHT / 2, AVATAR_HEIGHT * 0.62)
        .fill({ color: MEDAL_TINTS[state.medal], alpha: 0.22 });
    }
  }

  private idleOffset(elapsedMs: number, state: AvatarFrameState): { y: number; rotation: number } {
    // No idle animation at all under the reduced profile (spec §8 ladder).
    if (this.profile === 'reduced') return { y: 0, rotation: 0 };

    // Suppressed while a movement is in flight — a boosting character is not
    // idly bobbing. `scaleX !== 1` is the signal that the grammar is running.
    if (state.scaleX !== 1 || state.scaleY !== 1) return { y: 0, rotation: 0 };

    const { kind, periodMs, amount } = this.spec.idle;
    const phase = Math.sin(((elapsedMs + this.idlePhase) / periodMs) * Math.PI * 2);
    switch (kind) {
      case 'bob': return { y: phase * amount * 14, rotation: 0 };
      case 'sway': return { y: 0, rotation: phase * amount * 0.5 };
      case 'tilt': return { y: 0, rotation: phase * amount * 0.28 };
      case 'pulse': return { y: phase * amount * 5, rotation: 0 };
    }
  }

  mountPoint(which: 'behind' | 'front' | 'crown'): { x: number; y: number } {
    const point = this.spec.mounts[which];
    return { x: this.container.x + point.x, y: this.container.y + point.y };
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
```

- [ ] **Step 4: Write the avatar layer**

Create `lib/world/render/Avatars.ts`:

```ts
/**
 * The avatar layer (spec §3). Replaces P1's placeholder `Markers`.
 *
 * Dumb by contract: it maps AvatarFrameState[] onto rig nodes and owns NO
 * animation state. Every decision was already made by the choreographer.
 */
import { Container, type Application } from 'pixi.js';
import { COLOR } from '@/lib/presentation/tokens';
import type { Profile } from '@/lib/presentation/profile';
import type { AvatarFrameState } from '../choreographer';
import { specFor } from '../content/roster';
import { horizonY, worldScale, type CameraState, type Viewport } from '../geometry';
import type { VfxAllowance } from '../vfxBudget';
import { AvatarNode, clearBakedAvatars } from './AvatarNode';
import { Vfx } from './Vfx';

export interface AvatarPlayer {
  id: string;
  nickname: string;
  /** CSS hex from the DB, e.g. '#38bdf8'. */
  color: string;
  /** Roster key from lib/avatars.ts. */
  avatar: string;
}

export class Avatars {
  readonly container = new Container();
  private readonly vfx = new Vfx();
  private readonly nodes = new Map<string, AvatarNode>();
  private players: readonly AvatarPlayer[] = [];
  private lastFrameAt = 0;

  constructor(
    private readonly app: Application,
    private readonly profile: Profile,
  ) {
    this.container.addChild(this.vfx.container);
  }

  setPlayers(players: readonly AvatarPlayer[]): void {
    this.players = players;
  }

  apply(
    states: readonly AvatarFrameState[],
    camera: CameraState,
    viewport: Viewport,
    allowance: VfxAllowance,
    localPlayerId: string | null,
    elapsedMs: number,
  ): void {
    const scale = worldScale(camera, viewport);
    const originX = viewport.width / 2 - camera.centerX * scale;
    const ground = horizonY(viewport);
    const now = elapsedMs;
    const dtMs = this.lastFrameAt === 0 ? 16 : Math.min(64, now - this.lastFrameAt);
    this.lastFrameAt = now;

    const seen = new Set<string>();

    for (const state of states) {
      const player = this.players.find(p => p.id === state.playerId);
      if (!player) continue;
      seen.add(state.playerId);

      let node = this.nodes.get(state.playerId);
      if (!node) {
        const accent = Number.parseInt(player.color.replace('#', ''), 16) || COLOR.neonCyan;
        node = new AvatarNode(
          this.app, specFor(player.avatar), accent, player.nickname,
          player.id === localPlayerId, this.profile,
        );
        this.nodes.set(state.playerId, node);
        // Below the pool, so particles read in front of the characters.
        this.container.addChildAt(node.container, 0);
      }

      node.apply(state, originX + state.x * scale, ground + state.y * scale, scale, elapsedMs);

      for (const request of state.vfx) {
        // `glow` is drawn by the rig itself, not emitted as particles.
        if (request.kind === 'glow') continue;
        const mount = node.mountPoint(request.mount);
        this.vfx.emit(request, mount.x, mount.y, scale, allowance, now);
      }
    }

    for (const [id, node] of this.nodes) {
      if (seen.has(id)) continue;
      node.destroy();
      this.nodes.delete(id);
    }

    this.vfx.update(now, dtMs);
  }

  destroy(): void {
    for (const node of this.nodes.values()) node.destroy();
    this.nodes.clear();
    this.vfx.destroy();
    this.container.destroy({ children: true });
    clearBakedAvatars();
  }
}
```

- [ ] **Step 5: Swap the layer into the scene and delete the placeholder**

In `lib/world/render/WorldScene.ts`: replace the `Markers` import with `Avatars, type AvatarPlayer`, replace the `markers` field with `avatars = new Avatars(app, profile)` (constructed inside the constructor, where `profile` is in scope), keep its position in the `addChild` order exactly where `markers` sat, and change the two call sites:

```ts
  setPlayers(players: readonly AvatarPlayer[]): void {
    this.players = players;
  }
```

```ts
    this.avatars.setPlayers(this.players);
    this.avatars.apply(
      frame.avatars, frame.camera, frame.viewport,
      frame.allowance, frame.localPlayerId, frame.elapsedMs,
    );
```

The `TrackSurface` insertion in `applyFrame` uses `this.root.getChildIndex(this.markers.container)` — change it to `this.root.getChildIndex(this.avatars.container)`. Update `destroy()` to call `this.avatars.destroy()`.

Then delete the placeholder:

```bash
git rm lib/world/render/Markers.ts
```

- [ ] **Step 6: Type-check and run the full unit suite**

Run: `npx tsc --noEmit && npm run test`
Expected: no type errors; all Vitest suites pass. `runtime.ts` will still fail to type-check until Task 8 — if `tsc` reports errors *only* in `lib/world/runtime.ts`, that is expected at this point; anything else must be fixed now.

- [ ] **Step 7: Commit**

```bash
git add lib/world/render/ lib/world/frame.ts
git commit -m "feat(world): avatar rig, roster renderer and pooled VFX"
```

---

### Task 8: Runtime wiring and the lobby roster strip

Connects the choreographer to the cue bus, swaps the lobby to a canvas-first grid, and adds the e2e coverage.

**Files:**
- Modify: `lib/world/runtime.ts`
- Modify: `components/LobbyView.tsx`
- Test: `e2e/world.spec.ts` (append)

**Interfaces:**
- Consumes: everything produced by Tasks 1–7.
- Produces: no new exports. `createWorldRuntime` keeps its existing signature.

- [ ] **Step 1: Wire the runtime**

Modify `lib/world/runtime.ts`. Extend `SUBSCRIBED`, thread choreographer and budget state, and pass the new frame fields.

Replace the `SUBSCRIBED` constant:

```ts
/** Cue types the world acts on. P1 owned the camera set; P2 adds the drama set. */
const SUBSCRIBED: CueType[] = [
  'phase-countdown',
  'phase-read',
  'phase-answer',
  'phase-track',
  'overtake',
  'lead-changed',
  'final-question',
  'player-advanced',
  'streak-tier',
  'streak-broken',
  'player-joined',
];
```

Add the imports:

```ts
import {
  avatarStates,
  beginSequence,
  bufferCue,
  completeSequence,
  initialChoreographerState,
  notePlayerJoined,
  type ChoreographerState,
} from './choreographer';
import { flairFor } from './flair';
import { gridAnchors, markerAnchors, trackMetrics, type CameraState } from './geometry';
import { allowanceFor, initialBudgetState, stepBudget, type BudgetState } from './vfxBudget';
```

(The existing `markerAnchors, trackMetrics, type CameraState` import from `./geometry` is replaced by the line above.)

Add the threaded state next to `director`:

```ts
  let choreo: ChoreographerState = initialChoreographerState;
  let budget: BudgetState = initialBudgetState;
```

Replace the subscription block so drama cues buffer and `phase-track` starts the sequence:

```ts
  const unsubscribes = SUBSCRIBED.map(type =>
    on(type, cue => {
      const now = performance.now();
      director = reduceCue(director, cue, now);

      const { room, standings, players } = useGameStore.getState();
      const metrics = trackMetrics(room?.total_rounds ?? 12);
      const anchors = room?.phase === 'lobby'
        ? gridAnchors(players, metrics)
        : markerAnchors(standings ?? [], metrics);

      if (cue.type === 'phase-track') {
        choreo = beginSequence(choreo, anchors, now);
      } else if (cue.type === 'phase-read' || cue.type === 'phase-countdown') {
        // A new beat hard-completes anything still in flight (spec §4).
        choreo = completeSequence(choreo);
      } else if (cue.type === 'player-joined') {
        choreo = notePlayerJoined(choreo, cue.playerId, now);
      } else {
        choreo = bufferCue(choreo, cue, anchors);
      }
    }),
  );
```

In `tick()`, replace the anchor/frame block. `anchors` now comes from the grid in the lobby, flair and the allowance are derived, and the choreographer produces the avatar states:

```ts
    const { room, standings, players } = useGameStore.getState();
    const metrics = trackMetrics(room?.total_rounds ?? 12);
    const inLobby = (room?.phase ?? 'lobby') === 'lobby';
    const anchors = inLobby
      ? gridAnchors(players, metrics)
      : markerAnchors(standings ?? [], metrics);
```

Then, where `scene.setPlayers(...)` / `scene.applyFrame(...)` are called:

```ts
    const allowance = allowanceFor(budget.level);
    const avatars = avatarStates(
      choreo, anchors, flairFor(standings ?? [], anchors), allowance, now, profile,
    );

    // Spec §6: the arena reaction is a WORLD reaction, so it turns P1's
    // existing grade dial rather than being only a burst on one avatar.
    const arena = avatars.some(a => a.vfx.some(v => v.kind === 'arena'));
    const escalation = Math.max(director.escalation, arena ? 0.75 : 0);

    scene.setPlayers(useGameStore.getState().players);
    scene.applyFrame({
      camera: shown,
      viewport,
      metrics,
      zones: profile === 'reduced' ? quantizeZoneWeights(blended) : blended,
      grade: gradeState(progress, escalation),
      avatars,
      allowance,
      localPlayerId,
      elapsedMs,
    });
```

And in the 500ms publish block, step the budget:

```ts
    if (now - lastPublishAt >= 500) {
      lastPublishAt = now;
      const stats = sampler.stats();
      budget = stepBudget(budget, stats, profile);
      useWorldView.getState().setFrameStats(stats);
    }
```

- [ ] **Step 2: Verify the wiring type-checks and the unit suite is green**

Run: `npx tsc --noEmit && npm run test`
Expected: no type errors; all Vitest suites pass.

- [ ] **Step 3: Commit the runtime wiring**

```bash
git add lib/world/runtime.ts
git commit -m "feat(world): wire the choreographer and VFX budget into the runtime"
```

- [ ] **Step 4: Write the failing e2e test**

Append to `e2e/world.spec.ts` as a new top-level `test.describe`, following the join pattern the file already uses (`e2e/world.spec.ts:44-58`) — code from the URL, join via `/room/{code}`, `Your nickname` placeholder:

```ts
// The lobby's readable half (spec §7): the Pixi start line carries the
// formation, the HTML strip carries the names.
test.describe('the lobby roster strip', () => {
  test('lists joined players as text beside the canvas grid', async ({ page, browser }) => {
    const host = page;
    await host.goto('/host/new');
    await host.getByPlaceholder('Your nickname').fill('Hosty');
    await host.getByRole('button', { name: /create room/i }).click();
    await expect(host).toHaveURL(/\/room\/[A-Z0-9]{5}$/);
    const code = host.url().split('/').pop()!;

    await expect(host.getByText('Starting grid')).toBeVisible();

    const joiner = await (await browser.newContext()).newPage();
    await joiner.goto(`/room/${code}`);
    await joiner.getByPlaceholder('Your nickname').fill('Roster');
    await joiner.getByRole('button', { name: 'Join game' }).click();

    await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
    await expect(host.getByTestId('lobby-roster')).toContainText('Hosty');
    await expect(host.getByTestId('lobby-roster')).toContainText('Roster');

    // The world is full-bleed in the lobby — the grid is the establishing shot.
    await expect(host.locator('[data-testid="pixi-stage"]')).toHaveAttribute('data-band', 'full');
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npx playwright test e2e/world.spec.ts -g "lobby roster"`
Expected: FAIL — no element with `data-testid="lobby-roster"`

- [ ] **Step 6: Rewrite the lobby view**

Replace `components/LobbyView.tsx`:

```tsx
'use client';
import { useGameStore } from '@/lib/store';
import { avatarEmoji } from '@/lib/avatars';

/**
 * The lobby's readable half (spec §7). The Pixi start line carries the
 * formation; this strip carries the names, so nothing readable depends on
 * canvas (PRD §9).
 *
 * `Starting grid — {n} joined` and the start-button copy are asserted verbatim
 * in e2e/game-flow.spec.ts and e2e/world.spec.ts — do not reword them.
 */
export default function LobbyView({
  code, isHost, onStart, startError,
}: { code: string; isHost: boolean; onStart: () => void; startError: string | null }) {
  const players = useGameStore(s => s.players);
  const playing = players.filter(p => p.is_playing);

  return (
    <main className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col justify-end gap-6 p-6">
      <header className="text-center">
        <p className="text-slate-400">
          Join at <b className="text-slate-200">{typeof window !== 'undefined' ? window.location.host : ''}</b> with code
        </p>
        <p className="text-6xl font-black tracking-[0.2em] text-amber-400">{code}</p>
      </header>

      <section className="rounded-2xl border border-white/10 bg-abyss/70 p-4 backdrop-blur-sm">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-slate-400">
          Starting grid — {players.length} joined
        </h2>
        <ul data-testid="lobby-roster" className="flex flex-wrap gap-2">
          {players.map(p => (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3"
            >
              <span
                className="grid h-7 w-7 place-items-center rounded-full text-base"
                style={{ backgroundColor: `${p.color}33`, boxShadow: `inset 0 0 0 2px ${p.color}` }}
                aria-hidden
              >
                {avatarEmoji(p.avatar)}
              </span>
              <span className="text-sm font-semibold">{p.nickname}</span>
              {p.is_host && (
                <span className="text-xs font-bold text-amber-400">{p.is_playing ? 'Host' : 'MC'}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {isHost ? (
        <div className="space-y-2">
          {startError && <p className="text-center text-rose-400">{startError}</p>}
          <button
            onClick={onStart}
            disabled={playing.length < 2}
            className="w-full rounded-xl bg-amber-400 py-4 text-lg font-bold text-slate-950 disabled:opacity-40"
          >
            {playing.length < 2 ? 'Need at least 2 players' : 'Start the race'}
          </button>
          <p className="text-center text-xs text-slate-500">3+ players recommended</p>
        </div>
      ) : (
        <p className="text-center text-slate-400">Waiting for the host to start…</p>
      )}
    </main>
  );
}
```

Note the layout change: `justify-end` plus `relative z-10` puts the roster and controls at the bottom of the screen, over the P1 canvas rather than beside it — the grid formation needs the upper two-thirds.

- [ ] **Step 7: Run the new e2e test**

Run: `npx playwright test e2e/world.spec.ts -g "lobby roster"`
Expected: PASS

- [ ] **Step 8: Run the full regression suite**

Run: `npm run test && npm run test:e2e`
Expected: all Vitest suites pass; all Playwright tests pass, including both `Starting grid — 2 joined` assertions and `The track — after Q1`.

- [ ] **Step 9: Visual smoke check**

Start the dev server (`npm run dev`) and use playwright-cli to capture, at minimum: the lobby grid with 3+ players, an avatar mid-boost during the TRACK beat, a streak tier at 3 and at 8, and medal flair after several rounds. Confirm by eye that characters read as distinct silhouettes, the accent rim identifies the player, and the trail follows the boost. These are development artifacts — do not commit them as snapshot tests.

- [ ] **Step 10: Lint and commit**

```bash
npm run lint
git add components/LobbyView.tsx e2e/world.spec.ts
git commit -m "feat(lobby): canvas starting grid with an accessible roster strip"
```

---

## Closing out the phase

- [ ] **Verify every exit criterion in spec §11** against a real full game, not by impression. In particular: confirm the VFX budget sheds and recovers (force it by throttling CPU in devtools with `?perf=1` open) and that `useSettings().profile` never changes while it does.
- [ ] **Write the ADRs** listed in spec §13 — five of them — following `docs/ADR/README.md`. Next free number is 0009.
- [ ] **Create `docs/progress/P2-avatars-motion.md`** with scope, what was built, deviations, and verification results, following `docs/progress/P1-track-world.md`.
- [ ] **Update `docs/progress/CURRENT.md`**: last completed becomes P2, next up becomes P3 (spec already written at `docs/superpowers/specs/2026-08-22-m2-p2-avatars-motion-design.md`'s sibling — P3 has no spec yet, so point at the roadmap §P3).
