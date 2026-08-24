# Tied-Stack X-Offset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the P2 tech-debt entry "tied players share a compressed stack rather than offsetting in x" by pairing tied players two-per-row with a left/right `x` offset, instead of stacking one player per row.

**Architecture:** `MarkerAnchor.row` currently does double duty — visual vertical tier AND `flairFor`'s edge-holder signal (`row === 0`). Split it into `row` (visual tier, now shared by up to 2 players) and a new `rank` (unique 0-indexed speed-points order, what `flairFor` reads) plus a new `side` (`-1 | 0 | 1`, which half of the row, drives the `x` offset). `markerAnchors` in `lib/world/geometry.ts` is the only place that computes these; `flairFor` and `podiumAnchors` are updated to read the new fields.

**Tech Stack:** TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-24-tied-stack-offset-design.md`

## Global Constraints

- The x-offset magnitude is `RIG_HALF_WIDTH` (not a new literal) — reuses the same "adjacent rigs touch, never overlap" spacing `GRID_COLUMN_WIDTH` already uses elsewhere in this file.
- `stackPitch`'s own signature and internals do not change — only what callers pass as `rowCount` changes (`Math.ceil(n / 2)` instead of `n`).
- `gridAnchors` (the lobby starting-grid formation) is explicitly out of scope — it does not use `markerAnchors`'s tie-stacking path.
- `choreographer.ts` and `framing.ts` read `anchor.x`/`anchor.y` generically and need no code changes — verify this stays true (grep `\.row\b` in `lib/` after each task; only `flair.ts` and `podium.ts`'s doc comment should match).

---

### Task 1: `markerAnchors` computes `rank` and `side`, offsets tied pairs in x

**Files:**
- Modify: `lib/world/geometry.ts:100-192` (`MarkerAnchor` interface, `markerAnchors`)
- Modify: `tests/geometry.test.ts:111-258` (`markerAnchors` and `startLineAnchors` describe blocks)
- Modify: `tests/framing.test.ts:162,163,171,172,273` (manual `MarkerAnchor` literals — must satisfy the widened interface)

**Interfaces:**
- Produces: `MarkerAnchor` gains `rank: number` (0-indexed, unique per player within a segment's tie group, ordered by `speed_points` descending) and `side: -1 | 0 | 1`. `row` keeps its name and type (`number`) but now means "vertical tier," shared by up to 2 players.

- [ ] **Step 1: Write the failing tests for the new pairing contract**

Replace the two tests below in the `markerAnchors` describe block of `tests/geometry.test.ts` (they currently assert one-row-per-player):

Replace:
```ts
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
```
with:
```ts
  it('pairs the top two ranks into row 0, offset in x, edge-holder on the left', () => {
    const anchors = markerAnchors(
      [
        { player_id: 'slow', correct: 2, speed_points: 40 },
        { player_id: 'fast', correct: 2, speed_points: 90 },
        { player_id: 'mid', correct: 2, speed_points: 65 },
      ],
      metrics,
    );
    expect(anchors.map(a => a.playerId)).toEqual(['slow', 'fast', 'mid']);
    const ranks = Object.fromEntries(anchors.map(a => [a.playerId, a.rank]));
    expect(ranks).toEqual({ fast: 0, mid: 1, slow: 2 });

    const fast = anchors.find(a => a.playerId === 'fast')!;
    const mid = anchors.find(a => a.playerId === 'mid')!;
    const slow = anchors.find(a => a.playerId === 'slow')!;

    // Ranks 0 and 1 share row 0, offset left/right instead of stacked.
    expect(fast.row).toBe(0);
    expect(mid.row).toBe(0);
    expect(fast.y).toBe(0);
    expect(mid.y).toBe(0);
    expect(fast.side).toBe(-1);
    expect(mid.side).toBe(1);
    expect(mid.x - fast.x).toBe(2 * RIG_HALF_WIDTH);

    // Rank 2 is the odd one out: alone in row 1, centered.
    expect(slow.row).toBe(1);
    expect(slow.side).toBe(0);
    expect(slow.y).toBe(-MARKER_ROW_HEIGHT);
    expect(slow.x).toBe(2 * SEGMENT_WIDTH);
  });
```

Replace:
```ts
  it('compresses a deep stack instead of growing it off the frame', () => {
    const tied = Array.from({ length: 8 }, (_, i) => ({
      player_id: `p${i}`, correct: 4, speed_points: 100 - i,
    }));
    const anchors = markerAnchors(tied, metrics);

    // Ordering survives compression: one row each, ranked by speed points.
    expect(anchors.map(a => a.row)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(anchors.map(a => a.y)).size).toBe(8);
    for (let i = 1; i < anchors.length; i++) {
      expect(anchors[i].y).toBeLessThan(anchors[i - 1].y);
    }

    const top = Math.min(...anchors.map(a => a.y));
    expect(-top).toBeLessThanOrEqual(MAX_STACK_RISE + 1e-9);
    // ...which is strictly tighter than the uncompressed stack would have been.
    expect(-top).toBeLessThan(7 * MARKER_ROW_HEIGHT);
  });
```
with:
```ts
  it('compresses a deep stack instead of growing it off the frame', () => {
    const tied = Array.from({ length: 8 }, (_, i) => ({
      player_id: `p${i}`, correct: 4, speed_points: 100 - i,
    }));
    const anchors = markerAnchors(tied, metrics);

    // Ordering survives compression: paired two-per-row, ranked by speed points.
    expect(anchors.map(a => a.rank)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(anchors.map(a => a.row)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    // 4 distinct y tiers, not 8 — half the rise of one-player-per-row.
    expect(new Set(anchors.map(a => a.y)).size).toBe(4);

    const top = Math.min(...anchors.map(a => a.y));
    expect(-top).toBeLessThanOrEqual(MAX_STACK_RISE + 1e-9);
    // ...which is strictly tighter than the uncompressed 4-row stack would have been.
    expect(-top).toBeLessThan(3 * MARKER_ROW_HEIGHT);
  });
```

Add a new test after the "leaves a shallow stack at full pitch" test:
```ts
  it('keeps a two-way tie at full pitch — pairing removes the need to stack it at all', () => {
    const anchors = markerAnchors(
      [
        { player_id: 'a', correct: 2, speed_points: 90 },
        { player_id: 'b', correct: 2, speed_points: 40 },
      ],
      metrics,
    );
    expect(anchors.every(a => a.row === 0)).toBe(true);
    expect(anchors.every(a => a.y === 0)).toBe(true);
    expect(anchors.map(a => a.side).sort()).toEqual([-1, 1]);
  });
```

Update the "keeps players on different segments in their own stacks" test to also assert `side`:
```ts
  it('keeps players on different segments in their own stacks', () => {
    const anchors = markerAnchors(
      [
        { player_id: 'a', correct: 1, speed_points: 10 },
        { player_id: 'b', correct: 4, speed_points: 10 },
      ],
      metrics,
    );
    expect(anchors.every(a => a.row === 0)).toBe(true);
    expect(anchors.every(a => a.side === 0)).toBe(true);
  });
```

Update `startLineAnchors`'s row-stacking test (3 players, all tied on zero):
```ts
  it('row-stacks the field, since everyone is tied on the line', () => {
    const anchors = startLineAnchors(roster, metrics);
    expect(anchors.map(a => a.row)).toEqual([0, 0, 1]);
    expect(anchors.map(a => a.side)).toEqual([-1, 1, 0]);
    expect(anchors.map(a => a.y)).toEqual([0, 0, -MARKER_ROW_HEIGHT]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- geometry.test.ts`
Expected: FAIL — `anchors[...].rank` and `anchors[...].side` are `undefined`, and the row/y assertions don't match current one-per-row behavior.

- [ ] **Step 3: Implement `rank`/`side` in `markerAnchors`**

In `lib/world/geometry.ts`, update the `MarkerAnchor` interface (around line 100):
```ts
export interface MarkerAnchor {
  playerId: string;
  /** World x of the segment this player occupies, offset by `side` if paired. */
  x: number;
  /** World y; 0 is the ground row, negative values stack upward. */
  y: number;
  /** Vertical tier within the segment's stack; a tier holds up to 2 players. */
  row: number;
  /** 0-indexed rank by speed points within the segment's tie group; 0 == edge-holder (flair.ts). */
  rank: number;
  /** Which half of the row: -1 left, 1 right, 0 unpaired/centered. */
  side: -1 | 0 | 1;
  segment: number;
}
```

Replace the `markerAnchors` function body's doc comment and implementation (lines ~149-192):
```ts
/**
 * Marker placement. Players tied on a segment pair up two-per-row, ordered
 * by speed points — PRD §6's tiebreak rule made visible — offset left/right
 * in x rather than stacked one-per-row, so a tie reads as a pack instead of
 * a ladder. `rank` is the unique ordering within the tie (rank 0 holds the
 * edge; P2 puts the turbo-flame there via `flairFor`). An odd leftover
 * (or a lone occupant) sits centered, alone in its row.
 */
export function markerAnchors(
  standings: readonly AnchorStanding[],
  metrics: TrackMetrics,
  riseLimit: number = MAX_STACK_RISE,
): MarkerAnchor[] {
  const bySegment = new Map<number, AnchorStanding[]>();
  for (const s of standings) {
    const segment = Math.min(Math.max(0, s.correct), metrics.segments);
    const group = bySegment.get(segment) ?? [];
    group.push(s);
    bySegment.set(segment, group);
  }

  const ranks = new Map<string, number>();
  const rows = new Map<string, number>();
  const sides = new Map<string, -1 | 0 | 1>();
  // Each segment's stack compresses independently: a two-way tie keeps the full
  // pitch even when another segment is holding six.
  const pitches = new Map<string, number>();
  for (const group of bySegment.values()) {
    // Stable: equal speed points keep standings order, which is already ranked.
    const ordered = [...group].sort((a, b) => b.speed_points - a.speed_points);
    const rowCount = Math.ceil(ordered.length / 2);
    const pitch = stackPitch(rowCount, riseLimit);
    const lastOdd = ordered.length % 2 === 1 ? ordered.length - 1 : -1;
    ordered.forEach((s, index) => {
      const side: -1 | 0 | 1 = index === lastOdd ? 0 : index % 2 === 0 ? -1 : 1;
      ranks.set(s.player_id, index);
      rows.set(s.player_id, Math.floor(index / 2));
      sides.set(s.player_id, side);
      pitches.set(s.player_id, pitch);
    });
  }

  return standings.map(s => {
    const segment = Math.min(Math.max(0, s.correct), metrics.segments);
    const row = rows.get(s.player_id) ?? 0;
    const side = sides.get(s.player_id) ?? 0;
    return {
      playerId: s.player_id,
      x: segmentToWorldX(segment) + side * RIG_HALF_WIDTH,
      y: row > 0 ? -row * (pitches.get(s.player_id) ?? MARKER_ROW_HEIGHT) : 0,
      row,
      rank: ranks.get(s.player_id) ?? 0,
      side,
      segment,
    };
  });
}
```

Also update the `MAX_STACK_RISE` doc comment's stale worst-case claim (around line 55-57): replace
```
 * Worth knowing: at MARKER_ROW_HEIGHT the rise only fits three rows at full
 * pitch, so a four-way tie is already compressing. That is intended — the
 * pitch is a soft preference, the rise is the hard cap.
```
with
```
 * Worth knowing: at MARKER_ROW_HEIGHT the rise only fits three rows at full
 * pitch. Ties pair two-per-row (markerAnchors), so that is four rows' worth
 * of headcount before compression starts — a seven-way tie is already
 * compressing. That is intended — the pitch is a soft preference, the rise
 * is the hard cap.
```

- [ ] **Step 4: Fix the two other `MarkerAnchor` literals that no longer typecheck**

`tests/framing.test.ts` constructs `MarkerAnchor` objects by hand in three places; add `rank` and `side` (values are irrelevant to what those tests check — `offscreenPlayerIds` and `frameTarget` don't read either field):

Line ~162-163:
```ts
      { playerId: 'ground', x: 4 * SEGMENT_WIDTH, y: 0, row: 0, rank: 0, side: 0, segment: 4 },
      { playerId: 'orbit', x: 4 * SEGMENT_WIDTH, y: -2000, row: 9, rank: 0, side: 0, segment: 4 },
```
Line ~171-172:
```ts
      { playerId: 'ground', x: 4 * SEGMENT_WIDTH, y: 0, row: 0, rank: 0, side: 0, segment: 4 },
      { playerId: 'basement', x: 4 * SEGMENT_WIDTH, y: 2000, row: 0, rank: 0, side: 0, segment: 4 },
```
Line ~273:
```ts
      anchors: [{ playerId: 'p1', x: 0, y: 0, row: 0, rank: 0, side: 0, segment: 0 }],
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- geometry.test.ts framing.test.ts`
Expected: PASS, all tests in both files.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/world/geometry.ts tests/geometry.test.ts tests/framing.test.ts
git commit -m "feat: pair tied stack rows two-per-row, offset in x"
```

---

### Task 2: `flairFor` reads `rank` instead of `row` for the edge-holder

**Files:**
- Modify: `lib/world/flair.ts:73`
- Modify: `tests/flair.test.ts:56` (test title only — the test body already goes through `markerAnchors` and needs no assertion changes)

**Interfaces:**
- Consumes: `MarkerAnchor.rank` (from Task 1).

- [ ] **Step 1: Confirm the existing test already exercises the new contract**

`tests/flair.test.ts`'s "the turbo flame" describe block builds its anchors via `markerAnchors(standings, metrics)` (not hand-built literals), so once Task 1 lands, `anchor.rank` is populated correctly and no test assertions need to change — only the misleading title does.

Run: `npm test -- flair.test.ts`
Expected: the "goes to the row-0 holder when a segment is contested" test currently PASSES (row 0 and rank 0 coincide for a 2-way tie, since both ranks land in row 0's pair) — confirm this before editing, so the later diff is a pure rename plus the source fix, not a behavior change hiding in a rename.

- [ ] **Step 2: Rename the test to describe the new contract**

In `tests/flair.test.ts`, change:
```ts
  it('goes to the row-0 holder when a segment is contested', () => {
```
to:
```ts
  it('goes to the rank-0 holder when a segment is contested', () => {
```

- [ ] **Step 3: Switch `flairFor`'s edge-holder check to `rank`**

In `lib/world/flair.ts`, change:
```ts
      edgeHolder: contested && anchor!.row === 0,
```
to:
```ts
      edgeHolder: contested && anchor!.rank === 0,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- flair.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add lib/world/flair.ts tests/flair.test.ts
git commit -m "fix: flairFor reads rank, not row, for the edge-holder"
```

---

### Task 3: `podiumAnchors` doc comment and `podium.test.ts` follow the same switch

**Files:**
- Modify: `lib/world/podium.ts:117-125` (doc comment only — `podiumAnchors`'s implementation already spreads the whole anchor through, no logic change needed)
- Modify: `tests/podium.test.ts:138-146`

**Interfaces:**
- Consumes: `MarkerAnchor.rank` (from Task 1).

- [ ] **Step 1: Update the test to assert `rank` instead of `row`**

Task 1 already made `markerAnchors` (and therefore `podiumAnchors`) populate `rank` correctly, so this is a same-behavior rename, not a red/green cycle: the old assertion (`row` values `[0, 1]`) would now read `[0, 0]` since both tied players land in row 0's pair, which is exactly why the check has to move to `rank`.

In `tests/podium.test.ts`, replace:
```ts
  it('preserves row, so two tied podium players do not both hold the edge', () => {
    // p1 and p2 tie on correct; markerAnchors gives them rows 0 and 1 on the
    // same segment. flairFor lights the turbo flame on row 0 only, and forcing
    // row 0 here would light it on both (lib/world/flair.ts:73).
    const tied = [standing('p1', 9, 500), standing('p2', 9, 200), standing('p3', 4)];
    const anchors = podiumAnchors(tied, metrics, settled);
    const rows = anchors.filter(a => a.playerId !== 'p3').map(a => a.row).sort();
    expect(rows).toEqual([0, 1]);
  });
```
with:
```ts
  it('preserves rank, so two tied podium players do not both hold the edge', () => {
    // p1 and p2 tie on correct; markerAnchors pairs them into row 0 with
    // ranks 0 and 1. flairFor lights the turbo flame on rank 0 only, and
    // forcing rank 0 here would light it on both (lib/world/flair.ts:73).
    const tied = [standing('p1', 9, 500), standing('p2', 9, 200), standing('p3', 4)];
    const anchors = podiumAnchors(tied, metrics, settled);
    const ranks = anchors.filter(a => a.playerId !== 'p3').map(a => a.rank).sort();
    expect(ranks).toEqual([0, 1]);
  });
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npm test -- podium.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 3: Update the doc comment in `podium.ts`**

In `lib/world/podium.ts`, replace:
```ts
/**
 * Where every racer stands during the ceremony.
 *
 * Only `x` and `y` are overridden. `row` and `segment` are carried through from
 * the finish-line layout on purpose: `flairFor` reads BOTH — `edgeHolder` is
 * `contested && row === 0`, where `contested` counts occupants of a `segment`
 * (lib/world/flair.ts:63-73). Forcing `row: 0` would light the turbo flame on
 * every podium player tied on `correct`, instead of the one holding the edge.
 */
```
with:
```ts
/**
 * Where every racer stands during the ceremony.
 *
 * Only `x` and `y` are overridden. `rank` and `segment` are carried through
 * from the finish-line layout on purpose: `flairFor` reads BOTH — `edgeHolder`
 * is `contested && rank === 0`, where `contested` counts occupants of a
 * `segment` (lib/world/flair.ts). Forcing `rank: 0` would light the turbo
 * flame on every podium player tied on `correct`, instead of the one holding
 * the edge.
 */
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS, all tests (no regressions in any file that touches `MarkerAnchor`, `markerAnchors`, `flairFor`, or `podiumAnchors`).

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors, zero lint problems.

- [ ] **Step 6: Commit**

```bash
git add lib/world/podium.ts tests/podium.test.ts
git commit -m "docs: podiumAnchors carries rank, not row, for flairFor"
```

---

### Task 4: Retire the tech-debt entry and do a final full verification

**Files:**
- Modify: `docs/progress/CURRENT.md` (remove the closed debt entry)

**Interfaces:** None — documentation and verification only.

- [ ] **Step 1: Remove the closed debt entry from `docs/progress/CURRENT.md`**

Delete this bullet from the "Tech debt / known issues" section:
```
- **Tied players share a compressed stack rather than offsetting in x** (P2). All-tied cases — the start line, the round-1 TRACK beat — are a tight heap of overlapping rigs. The stack is capped at `MAX_STACK_RISE` so everyone stays on canvas, which was the point, but the readable answer is two rigs per row offset in x. **Blocked on a contract change:** that requires `row` to stop meaning "unique rank within the segment", which `flairFor`'s edge-holder rule reads.
```

- [ ] **Step 2: Run the full verification suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: zero problems.

Run: `npm test`
Expected: all tests pass.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Get diagnostics on every file touched this plan**

Use the editor's `getDiagnostics` tool (or equivalent) on: `lib/world/geometry.ts`, `lib/world/flair.ts`, `lib/world/podium.ts`, `tests/geometry.test.ts`, `tests/framing.test.ts`, `tests/flair.test.ts`, `tests/podium.test.ts`, `docs/progress/CURRENT.md`.
Expected: no diagnostics reported.

- [ ] **Step 4: Commit**

```bash
git add docs/progress/CURRENT.md
git commit -m "docs: close the tied-stack compression tech debt"
```
