# M2 P5a — Podium ceremony Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the game's terminal screen-swap with a produced podium ceremony on the Pixi canvas — blocks rising bronze → silver → gold, a winner spotlight, and budget-governed confetti.

**Architecture:** The podium is a **fourth anchor layout** beside `gridAnchors` / `startLineAnchors` / `markerAnchors`, so the entire existing avatar pipeline (rigs, flair, medals, movement grammar, YOU ring) renders the ceremony unchanged. Beat position derives from a server `ends_at` that migration 0004 adds to the results phase, making the ceremony obey ADR-0014 exactly as every P3 beat does. Confetti runs in its own pool, governed by the existing `VfxAllowance` ladder.

**Tech Stack:** Next.js (App Router) · TypeScript · PixiJS v8 · Zustand · Vitest · Playwright · Supabase (Postgres RPCs) · Tailwind v4

**Spec:** `docs/superpowers/specs/2026-08-23-m2-p5a-podium-ceremony-design.md`

## Global Constraints

- **NEVER run `supabase stop` or `supabase start`.** Windows/Hyper-V reserves TCP 54024–54423, which covers every default Supabase port. The running stack is bound to shifted ports recorded in the gitignored `.env.local` (currently `127.0.0.1:55321`); a restart binds the reserved defaults, fails, and loses the working stack.
- **Apply migrations with `docker exec`, never the CLI's start/reset commands.** The database container is `supabase_db_quiz-game`. This is how P3b applied migration 0003.
- **Semantic events only.** No coordinates, sprite frames, or renderer concepts on the wire (PRD §3.6, §9).
- **Rendering separation.** Pixi owns the world; HTML/React owns everything readable and interactive. Accessibility never depends on canvas (PRD §9).
- **The cue vocabulary does not change in this phase.** `lib/presentation/cues.ts` and `lib/presentation/deriveCues.ts` are not modified. The existing `podium` cue is already consumed by P4 and needs no new consumer (ADR-0001).
- **`standings()`' sort must stay byte-identical:** `correct desc → speed_points desc → longest_streak desc → player_id asc`. This is the Fairness Law (ADR-0018).
- **Run the e2e suite as `npm run test:e2e -- --workers=2`.** The default worker count is flaky under load on this machine.
- **Unit tests are `npm test` (Vitest).** Canvas internals are not unit-tested; the tested seam is pure-module-in → pure-value-out.
- **Never put an opacity/transform Tailwind class on an element whose `motion` `variants` animate the same property** — inline animated styles outrank the class (ADR-0017). Not directly exercised in P5a, but Task 7 touches a component P5b will animate.

---

### Task 1: Migration 0004 — the ceremony's clock and scoreboard

**Files:**
- Create: `supabase/migrations/0004_ceremony.sql`
- Modify: `lib/types.ts:5`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `Standing.answered?: number`, `Standing.avg_answer_ms?: number | null`. A `results` phase whose `ends_at` is `now() + 9 seconds`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0004_ceremony.sql`:

```sql
-- M2 P5a — the ceremony's clock and its scoreboard.
-- Roadmap decision 4 exception, argued in docs/ADR/0027 and docs/ADR/0028.
-- Additive only: two functions replaced, no schema change, no data migration.

-- ============ advance_phase ============
-- Byte-identical to 0002_rpcs.sql except for ONE arm of v_ends: the results
-- phase now carries a deadline.
--
-- The results phase is TERMINAL, so this deadline means "when the ceremony has
-- finished playing", not "when the next phase begins" — there is no next phase.
-- It is inert for game state: useHostDriver returns early on BOTH
-- `status !== 'playing'` and `phase === 'results'` (lib/useHostDriver.ts:35),
-- and advance_phase itself raises 'game finished' when status = 'finished'.
-- Nothing schedules and nothing advances; the client reads it purely as an
-- animation anchor (ADR-0014).
create or replace function advance_phase(p_room_id uuid, p_host_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_phase text;
  v_round int;
  v_status text := 'playing';
  v_ends timestamptz;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;
  if v_room.status = 'finished' then raise exception 'game finished'; end if;
  if v_room.status <> 'playing' then raise exception 'game not started'; end if;

  v_round := v_room.current_round;
  case v_room.phase
    when 'countdown' then v_phase := 'read';
    when 'read'      then v_phase := 'answer';
    when 'answer'    then v_phase := 'reveal';
    when 'reveal'    then v_phase := 'track';
    when 'track' then
      if v_room.current_round >= v_room.total_rounds then
        v_phase := 'results'; v_status := 'finished';
      else
        v_phase := 'read'; v_round := v_room.current_round + 1;
      end if;
    else raise exception 'cannot advance from phase %', v_room.phase;
  end case;

  v_ends := case v_phase
    when 'read'    then now() + interval '3 seconds'
    when 'answer'  then now() + make_interval(secs => v_room.timer_seconds)
    when 'reveal'  then now() + interval '5 seconds'
    when 'track'   then now() + interval '4 seconds'
    when 'results' then now() + interval '9 seconds'
    else null
  end;

  update rooms set phase = v_phase, current_round = v_round,
    status = v_status, phase_ends_at = v_ends
  where id = p_room_id returning * into v_room;

  return phase_event(v_room);
end $$;

-- ============ standings ============
-- Byte-identical to 0003_reveal_picks.sql except for two added projection
-- fields. The sort is the Fairness Law and MUST NOT change (ADR-0018).
--
-- The room's timer arrives as a SCALAR SUBQUERY, not a join: this query groups
-- by p.id, and adding `rooms` to the from-list would put a new column into that
-- grouping's scope. The whole point of this migration is that the query's shape
-- is untouched and only the projection grows.
create or replace function standings(p_room_id uuid, p_max_round int) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(row order by row->'correct' desc, row->'speed_points' desc, row->'longest_streak' desc, row->>'player_id' asc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'player_id', p.id, 'nickname', p.nickname, 'avatar', p.avatar, 'color', p.color,
      'correct', count(a.*) filter (where a.is_correct),
      'speed_points', coalesce(sum(a.speed_points) filter (where a.is_correct), 0),
      'longest_streak', longest_streak(p_room_id, p.id, p_max_round),
      'current_streak', current_streak(p_room_id, p.id, p_max_round),
      'answered', count(a.*),
      'avg_answer_ms', case when count(a.*) = 0 then null else round(avg(
          (select r.timer_seconds from rooms r where r.id = p_room_id) * 1000
          - a.time_remaining_ms
        ))::int end
    ) as row
    from players p
    left join answers a on a.player_id = p.id and a.room_id = p_room_id and a.round <= p_max_round
    where p.room_id = p_room_id and p.is_playing
    group by p.id
  ) s;
$$;
```

- [ ] **Step 2: Apply the migration to the running stack**

Run:

```bash
docker exec -i supabase_db_quiz-game psql -U postgres -d postgres < supabase/migrations/0004_ceremony.sql
```

Expected: two `CREATE FUNCTION` lines, no errors.

**Do NOT run `supabase start`, `supabase stop`, or `supabase db reset`** (Global Constraints).

- [ ] **Step 3: Verify the new fields against real data**

Run:

```bash
docker exec -i supabase_db_quiz-game psql -U postgres -d postgres -c \
  "select jsonb_pretty(standings(id, current_round)) from rooms order by created_at desc limit 1;"
```

Expected: each element carries `answered` and `avg_answer_ms`. A player who has answered shows an integer `avg_answer_ms`; a player who has not shows `"avg_answer_ms": null` alongside `"answered": 0`.

If no room exists yet, play one round via `npm run dev` first — a synthetic check is not sufficient here, because the bug this catches (a scalar subquery landing in the wrong scope) only shows against real grouped rows.

- [ ] **Step 4: Add the optional client fields**

In `lib/types.ts`, replace the `Standing` interface:

```ts
export interface Standing {
  player_id: string; nickname: string; avatar: string; color: string;
  correct: number; speed_points: number; longest_streak: number; current_streak: number;
  /** Rounds this player actually submitted. Absent against a pre-0004 database. */
  answered?: number;
  /** Mean ms from question open to submission; null when `answered` is 0. */
  avg_answer_ms?: number | null;
}
```

Optional on purpose — the ADR-0018 fallback shape. P5a never reads them; P5b renders `—` when they are absent.

- [ ] **Step 5: Verify nothing regressed**

Run: `npm test`
Expected: PASS, unchanged count.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0004_ceremony.sql lib/types.ts
git commit -m "feat(p5a): give results a deadline and standings two stat fields"
```

---

### Task 2: Ceremony beat timing

**Files:**
- Create: `lib/ceremony/beats.ts`
- Test: `tests/ceremonyBeats.test.ts`

**Interfaces:**
- Consumes: `elapsedIn(totalMs: number, remainingMs: number | null): number` from `lib/staging/beats.ts:68`.
- Produces: `CEREMONY_MS`, `BRONZE_AT`, `SILVER_AT`, `GOLD_AT`, `SPOTLIGHT_AT`, `CONFETTI_AT`, `BOARD_AT`, `CeremonySteps`, `NO_CEREMONY`, `ceremonyStepsAt(elapsedMs: number): CeremonySteps`, `sameSteps(a, b): boolean`.

- [ ] **Step 1: Write the failing test**

Create `tests/ceremonyBeats.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { elapsedIn } from '@/lib/staging/beats';
import {
  BOARD_AT, BRONZE_AT, CEREMONY_MS, CONFETTI_AT, GOLD_AT, NO_CEREMONY,
  SILVER_AT, SPOTLIGHT_AT, ceremonyStepsAt, sameSteps,
} from '@/lib/ceremony/beats';

describe('ceremonyStepsAt', () => {
  it('shows nothing at the very start of the beat', () => {
    expect(ceremonyStepsAt(0)).toEqual(NO_CEREMONY);
  });

  it('raises the blocks bronze, then silver, then gold', () => {
    expect(ceremonyStepsAt(BRONZE_AT).risen).toBe(1);
    expect(ceremonyStepsAt(SILVER_AT).risen).toBe(2);
    expect(ceremonyStepsAt(GOLD_AT).risen).toBe(3);
  });

  it('holds a block down until its own moment', () => {
    expect(ceremonyStepsAt(BRONZE_AT - 1).risen).toBe(0);
    expect(ceremonyStepsAt(SILVER_AT - 1).risen).toBe(1);
    expect(ceremonyStepsAt(GOLD_AT - 1).risen).toBe(2);
  });

  it('lights the spotlight, then fires confetti, then hands over to the board', () => {
    expect(ceremonyStepsAt(SPOTLIGHT_AT).spotlight).toBe(true);
    expect(ceremonyStepsAt(SPOTLIGHT_AT - 1).spotlight).toBe(false);
    expect(ceremonyStepsAt(CONFETTI_AT).confetti).toBe(true);
    expect(ceremonyStepsAt(CONFETTI_AT - 1).confetti).toBe(false);
    expect(ceremonyStepsAt(BOARD_AT).board).toBe(true);
    expect(ceremonyStepsAt(BOARD_AT - 1).board).toBe(false);
  });

  it('is fully settled at the end of the beat and stays there', () => {
    const settled = { risen: 3, spotlight: true, confetti: true, board: true };
    expect(ceremonyStepsAt(CEREMONY_MS)).toEqual(settled);
    expect(ceremonyStepsAt(CEREMONY_MS * 10)).toEqual(settled);
  });

  it('lands settled when the deadline is unknown — a pre-0004 database', () => {
    // msUntil(null) is 0, and elapsedIn treats a null remaining as "beat over".
    expect(ceremonyStepsAt(elapsedIn(CEREMONY_MS, null)).board).toBe(true);
    expect(ceremonyStepsAt(elapsedIn(CEREMONY_MS, 0)).board).toBe(true);
  });

  it('runs every step well before the beat ends, leaving a settled tail', () => {
    expect(BOARD_AT).toBeLessThan(CEREMONY_MS);
  });
});

describe('sameSteps', () => {
  it('is true for identical steps and false for any difference', () => {
    expect(sameSteps(NO_CEREMONY, { ...NO_CEREMONY })).toBe(true);
    expect(sameSteps(NO_CEREMONY, { ...NO_CEREMONY, risen: 1 })).toBe(false);
    expect(sameSteps(NO_CEREMONY, { ...NO_CEREMONY, board: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ceremonyBeats.test.ts`
Expected: FAIL — cannot resolve `@/lib/ceremony/beats`.

- [ ] **Step 3: Write the implementation**

Create `lib/ceremony/beats.ts`:

```ts
/**
 * Ceremony beat timing (spec §5) — pure, no React, no store, no DOM.
 *
 * Beat position is derived from the server's `ends_at`, exactly as
 * lib/staging/beats.ts derives it (ADR-0014). Migration 0004 gives the results
 * phase a deadline for precisely this reason: a reload computes a large elapsed
 * and lands on a settled podium, so "jump to the end state rather than replay"
 * needs no storage, no flag and no special case — and the picture stays in step
 * with P4, which already suppresses the `fanfare` sting on a seeded cue batch
 * (ADR-0024).
 *
 * There is no ARRIVE step: the camera's cut to the podium fires on the
 * `phase-results` CUE, in lib/world/director.ts, not on an elapsed threshold.
 */

/**
 * Client-side mirror of migration 0004's results interval.
 *
 * Hand-maintained, exactly as lib/staging/beats.ts's NOMINAL_MS mirrors the
 * server's other phase durations — the server values are not importable from
 * the client. The failure mode is graceful: a moved server duration compresses
 * or completes the sequence early; it can never block or lock the surface.
 */
export const CEREMONY_MS = 9000;

export const BRONZE_AT = 1200;
export const SILVER_AT = 2100;
export const GOLD_AT = 3000;
export const SPOTLIGHT_AT = 3800;
export const CONFETTI_AT = 4100;
export const BOARD_AT = 6000;

/** Which parts of the ceremony have landed. Derived purely from elapsed. */
export interface CeremonySteps {
  /** Blocks landed, counted from bronze: 1 == bronze, 3 == all three. */
  risen: 0 | 1 | 2 | 3;
  spotlight: boolean;
  confetti: boolean;
  /** The band retreats and the results board rises (P5b consumes this). */
  board: boolean;
}

export const NO_CEREMONY: CeremonySteps = {
  risen: 0, spotlight: false, confetti: false, board: false,
};

export function ceremonyStepsAt(elapsedMs: number): CeremonySteps {
  // Bronze first, gold last: withholding the winner longest is the entire
  // point of a podium reveal.
  let risen: CeremonySteps['risen'] = 0;
  if (elapsedMs >= BRONZE_AT) risen = 1;
  if (elapsedMs >= SILVER_AT) risen = 2;
  if (elapsedMs >= GOLD_AT) risen = 3;

  return {
    risen,
    spotlight: elapsedMs >= SPOTLIGHT_AT,
    confetti: elapsedMs >= CONFETTI_AT,
    board: elapsedMs >= BOARD_AT,
  };
}

/** Equality guard for the store — without it every consumer re-renders at 60fps. */
export function sameSteps(a: CeremonySteps, b: CeremonySteps): boolean {
  return (
    a.risen === b.risen &&
    a.spotlight === b.spotlight &&
    a.confetti === b.confetti &&
    a.board === b.board
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ceremonyBeats.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/ceremony/beats.ts tests/ceremonyBeats.test.ts
git commit -m "feat(p5a): derive ceremony beats from the results deadline"
```

---

### Task 3: Podium anchor layout

**Files:**
- Create: `lib/world/podium.ts`
- Test: `tests/podium.test.ts`

**Interfaces:**
- Consumes: `CeremonySteps` (Task 2). `markerAnchors`, `segmentToWorldX`, `trackMetrics`, `AnchorStanding`, `MarkerAnchor`, `TrackMetrics` from `lib/world/geometry.ts`. `AVATAR_HEIGHT` from `lib/world/content/roster.ts`.
- Produces: `BLOCK_HEIGHTS`, `BLOCK_WIDTH`, `BLOCK_ORDER`, `podiumX(metrics)`, `blockX(place, metrics)`, `hasRisen(place, steps)`, `PodiumBlock`, `podiumBlocks(standings, metrics, steps): PodiumBlock[]`, `podiumAnchors(standings, metrics, steps): MarkerAnchor[]`.

**Two decisions this task must get right, both found by reading the existing code:**

1. **`podiumX` is the finish line itself**, not out in the run-off. `TRACK_MARGIN` is only 260 world units and `MIN_SPAN` is 800 (`camera.ts:12`), so `clampCamera` pins the camera's right edge at `maxX` — a podium sitting deep in the run-off would fall off the right of frame. This is the same root cause as the `TRACK_MARGIN` tech debt in `CURRENT.md`; the fix is to not depend on the run-off.
2. **`podiumAnchors` preserves each anchor's `row`.** `flairFor` computes `edgeHolder = contested && row === 0` (`flair.ts:73`). Two podium players tied on `correct` share a segment, so forcing `row: 0` would light a turbo flame on both.

- [ ] **Step 1: Write the failing test**

Create `tests/podium.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ceremonyStepsAt, BRONZE_AT, SILVER_AT, GOLD_AT, NO_CEREMONY } from '@/lib/ceremony/beats';
import { trackMetrics, segmentToWorldX, type AnchorStanding } from '@/lib/world/geometry';
import {
  BLOCK_HEIGHTS, BLOCK_ORDER, blockX, hasRisen, podiumAnchors, podiumBlocks, podiumX,
} from '@/lib/world/podium';

const metrics = trackMetrics(12);
const settled = ceremonyStepsAt(GOLD_AT);

const standing = (id: string, correct: number, speed = 0): AnchorStanding => ({
  player_id: id, correct, speed_points: speed,
});

/** Already ranked, as `standings()` always returns them. */
const field = (n: number): AnchorStanding[] =>
  Array.from({ length: n }, (_, i) => standing(`p${i + 1}`, 10 - i));

describe('podium geometry', () => {
  it('places the podium on the finish line, inside the camera bounds', () => {
    expect(podiumX(metrics)).toBe(segmentToWorldX(metrics.segments));
    // The whole podium must sit left of maxX or clampCamera pushes it off frame.
    const rightmost = blockX(3, metrics);
    expect(rightmost).toBeLessThan(metrics.maxX);
  });

  it('arranges the blocks 2nd, 1st, 3rd from left to right', () => {
    expect(BLOCK_ORDER).toEqual([2, 1, 3]);
    expect(blockX(2, metrics)).toBeLessThan(blockX(1, metrics));
    expect(blockX(1, metrics)).toBeLessThan(blockX(3, metrics));
    expect(blockX(1, metrics)).toBe(podiumX(metrics));
  });

  it('makes the winner\'s block the tallest', () => {
    expect(BLOCK_HEIGHTS[1]).toBeGreaterThan(BLOCK_HEIGHTS[2]);
    expect(BLOCK_HEIGHTS[2]).toBeGreaterThan(BLOCK_HEIGHTS[3]);
  });
});

describe('hasRisen', () => {
  it('raises bronze first and gold last', () => {
    const bronze = ceremonyStepsAt(BRONZE_AT);
    expect(hasRisen(3, bronze)).toBe(true);
    expect(hasRisen(2, bronze)).toBe(false);
    expect(hasRisen(1, bronze)).toBe(false);

    const silver = ceremonyStepsAt(SILVER_AT);
    expect(hasRisen(2, silver)).toBe(true);
    expect(hasRisen(1, silver)).toBe(false);

    expect(hasRisen(1, settled)).toBe(true);
  });

  it('holds every block down before the ceremony starts', () => {
    for (const place of [1, 2, 3] as const) {
      expect(hasRisen(place, NO_CEREMONY)).toBe(false);
    }
  });
});

describe('podiumBlocks', () => {
  it('builds one block per place for a full field', () => {
    const blocks = podiumBlocks(field(8), metrics, settled);
    expect(blocks.map(b => b.place)).toEqual([1, 2, 3]);
    expect(blocks.map(b => b.playerId)).toEqual(['p1', 'p2', 'p3']);
  });

  it('drops blocks off the top for a short field', () => {
    expect(podiumBlocks(field(2), metrics, settled).map(b => b.place)).toEqual([1, 2]);
    expect(podiumBlocks(field(1), metrics, settled).map(b => b.place)).toEqual([1]);
  });

  it('reports an empty podium for an empty field', () => {
    expect(podiumBlocks([], metrics, settled)).toEqual([]);
  });
});

describe('podiumAnchors', () => {
  it('moves exactly three players onto the podium and leaves the rest behind', () => {
    const standings = field(8);
    const anchors = podiumAnchors(standings, metrics, settled);
    expect(anchors).toHaveLength(8);

    const onPodium = anchors.filter(a => a.x === blockX(1, metrics)
      || a.x === blockX(2, metrics) || a.x === blockX(3, metrics));
    expect(onPodium.map(a => a.playerId).sort()).toEqual(['p1', 'p2', 'p3']);

    // Everyone else holds the finish-line position they raced to.
    const fourth = anchors.find(a => a.playerId === 'p4')!;
    expect(fourth.x).toBe(segmentToWorldX(7));
    expect(fourth.y).toBe(0);
  });

  it('lifts a player only once their own block has risen', () => {
    const standings = field(3);
    const before = podiumAnchors(standings, metrics, NO_CEREMONY);
    expect(before.find(a => a.playerId === 'p1')!.y).toBe(0);

    const bronzeOnly = podiumAnchors(standings, metrics, ceremonyStepsAt(BRONZE_AT));
    expect(bronzeOnly.find(a => a.playerId === 'p3')!.y).toBe(-BLOCK_HEIGHTS[3]);
    expect(bronzeOnly.find(a => a.playerId === 'p1')!.y).toBe(0);

    const all = podiumAnchors(standings, metrics, settled);
    expect(all.find(a => a.playerId === 'p1')!.y).toBe(-BLOCK_HEIGHTS[1]);
    expect(all.find(a => a.playerId === 'p2')!.y).toBe(-BLOCK_HEIGHTS[2]);
  });

  it('stands a player in front of their block before it rises, not beside it', () => {
    const anchors = podiumAnchors(field(3), metrics, NO_CEREMONY);
    expect(anchors.find(a => a.playerId === 'p2')!.x).toBe(blockX(2, metrics));
  });

  it('preserves row, so two tied podium players do not both hold the edge', () => {
    // p1 and p2 tie on correct; markerAnchors gives them rows 0 and 1 on the
    // same segment. flairFor lights the turbo flame on row 0 only, and forcing
    // row 0 here would light it on both (lib/world/flair.ts:73).
    const tied = [standing('p1', 9, 500), standing('p2', 9, 200), standing('p3', 4)];
    const anchors = podiumAnchors(tied, metrics, settled);
    const rows = anchors.filter(a => a.playerId !== 'p3').map(a => a.row).sort();
    expect(rows).toEqual([0, 1]);
  });

  it('keeps segment intact, so occupancy still describes the race', () => {
    const anchors = podiumAnchors(field(3), metrics, settled);
    expect(anchors.find(a => a.playerId === 'p1')!.segment).toBe(10);
    expect(anchors.find(a => a.playerId === 'p2')!.segment).toBe(9);
  });

  it('handles a one-player game', () => {
    const anchors = podiumAnchors(field(1), metrics, settled);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].x).toBe(blockX(1, metrics));
    expect(anchors[0].y).toBe(-BLOCK_HEIGHTS[1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/podium.test.ts`
Expected: FAIL — cannot resolve `@/lib/world/podium`.

- [ ] **Step 3: Write the implementation**

Create `lib/world/podium.ts`:

```ts
/**
 * Podium layout (spec §6) — the ceremony's anchor layout. Pure.
 *
 * A FOURTH layout beside gridAnchors / startLineAnchors / markerAnchors, which
 * is exactly what lets the whole existing avatar pipeline — rigs, flair,
 * medals, the movement grammar, the YOU ring, the off-screen readout — render
 * the ceremony with no changes at all.
 */
import type { CeremonySteps } from '@/lib/ceremony/beats';
import { AVATAR_HEIGHT } from './content/roster';
import {
  markerAnchors,
  segmentToWorldX,
  type AnchorStanding,
  type MarkerAnchor,
  type TrackMetrics,
} from './geometry';

/** Block height per place, in world units. */
export const BLOCK_HEIGHTS: Record<1 | 2 | 3, number> = {
  1: AVATAR_HEIGHT * 0.85,
  2: AVATAR_HEIGHT * 0.55,
  3: AVATAR_HEIGHT * 0.3,
};

/** Block width in world units. Also the spacing between block centres. */
export const BLOCK_WIDTH = AVATAR_HEIGHT * 0.9;

/** Left-to-right placement: 2nd, 1st, 3rd — the real-world arrangement. */
export const BLOCK_ORDER: readonly (1 | 2 | 3)[] = [2, 1, 3];

/**
 * The podium sits ON the finish line, not out in the run-off.
 *
 * TRACK_MARGIN is 260 world units and camera.ts's MIN_SPAN is 800, so
 * `clampCamera` pins the camera's right edge to `metrics.maxX`: a podium placed
 * deep in the run-off would be framed off the right of the canvas. Same root
 * cause as the TRACK_MARGIN tech debt in CURRENT.md — avoided here rather than
 * inherited. The finish line is also simply where a podium belongs.
 */
export function podiumX(metrics: TrackMetrics): number {
  return segmentToWorldX(metrics.segments);
}

/** World x of a place's block centre. The winner's block is centred on podiumX. */
export function blockX(place: 1 | 2 | 3, metrics: TrackMetrics): number {
  const slot = BLOCK_ORDER.indexOf(place);
  return podiumX(metrics) + (slot - 1) * BLOCK_WIDTH;
}

/**
 * Whether a place's block has landed. `risen` counts from bronze, so place 3
 * needs 1, place 2 needs 2, and place 1 needs all 3.
 */
export function hasRisen(place: 1 | 2 | 3, steps: CeremonySteps): boolean {
  return steps.risen >= 4 - place;
}

export interface PodiumBlock {
  place: 1 | 2 | 3;
  playerId: string;
  /** World x of the block's centre. */
  x: number;
  height: number;
  risen: boolean;
}

/**
 * The blocks to draw. `standings` is already totally ordered by the Fairness
 * Law, so `slice(0, 3)` is deterministic and matches the medals `flairFor`
 * assigns — ties need no rule of their own here.
 */
export function podiumBlocks(
  standings: readonly AnchorStanding[],
  metrics: TrackMetrics,
  steps: CeremonySteps,
): PodiumBlock[] {
  return standings.slice(0, 3).map((s, index) => {
    const place = (index + 1) as 1 | 2 | 3;
    return {
      place,
      playerId: s.player_id,
      x: blockX(place, metrics),
      height: BLOCK_HEIGHTS[place],
      risen: hasRisen(place, steps),
    };
  });
}

/**
 * Where every racer stands during the ceremony.
 *
 * Only `x` and `y` are overridden. `row` and `segment` are carried through from
 * the finish-line layout on purpose: `flairFor` reads BOTH — `edgeHolder` is
 * `contested && row === 0`, where `contested` counts occupants of a `segment`
 * (lib/world/flair.ts:63-73). Forcing `row: 0` would light the turbo flame on
 * every podium player tied on `correct`, instead of the one holding the edge.
 */
export function podiumAnchors(
  standings: readonly AnchorStanding[],
  metrics: TrackMetrics,
  steps: CeremonySteps,
): MarkerAnchor[] {
  const blocks = new Map(
    podiumBlocks(standings, metrics, steps).map(block => [block.playerId, block]),
  );

  return markerAnchors(standings, metrics).map(anchor => {
    const block = blocks.get(anchor.playerId);
    // Outside the top three: hold the finish-line position you raced to.
    if (!block) return anchor;

    return {
      ...anchor,
      x: block.x,
      // Before the block lands, the player stands at ground level in front of
      // it — so the existing movement grammar animates the lift and this phase
      // adds no choreography code at all.
      y: block.risen ? -block.height : 0,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/podium.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Run the full suite for regressions**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/world/podium.ts tests/podium.test.ts
git commit -m "feat(p5a): add the podium anchor layout"
```

---

### Task 4: Confetti joins the VFX budget

**Files:**
- Modify: `lib/world/vfxBudget.ts:34-52`
- Test: `tests/vfxBudget.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `VfxAllowance.confetti: number` — `1` at `full`, `0.5` at `lean`, `0` at `minimal`.

- [ ] **Step 1: Write the failing test**

Append to `tests/vfxBudget.test.ts`:

```ts
describe('confetti allowance', () => {
  it('steps down the ladder with every other effect', () => {
    expect(allowanceFor('full').confetti).toBe(1);
    expect(allowanceFor('lean').confetti).toBe(0.5);
    expect(allowanceFor('minimal').confetti).toBe(0);
  });

  it('is zero on the reduced profile, which pins the budget at minimal', () => {
    const pinned = stepBudget(initialBudgetState, clean, 'reduced');
    expect(allowanceFor(pinned.level).confetti).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/vfxBudget.test.ts`
Expected: FAIL — `confetti` is `undefined`, not `1`.

- [ ] **Step 3: Write the implementation**

In `lib/world/vfxBudget.ts`, add to `VfxAllowance` (after `turbo: number;`):

```ts
  /**
   * Ceremony confetti density, 0..1. At 0 the ceremony draws a single static
   * gold wash instead of running a particle system — reduced motion should
   * cost the celebration its MOTION, not its existence.
   */
  confetti: number;
```

And extend the three allowance rows:

```ts
const ALLOWANCES: Record<VfxLevel, VfxAllowance> = {
  full: { turboParticles: true, streakParticles: true, trail: 1, streak: 1, maxStreakTier: 8, accent: 1, arena: 1, turbo: 1, confetti: 1 },
  lean: { turboParticles: false, streakParticles: true, trail: 0.5, streak: 0.6, maxStreakTier: 5, accent: 0.6, arena: 0.5, turbo: 0.5, confetti: 0.5 },
  minimal: { turboParticles: false, streakParticles: false, trail: 0, streak: 0.5, maxStreakTier: 3, accent: 0, arena: 0, turbo: 0.5, confetti: 0 },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/vfxBudget.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/world/vfxBudget.ts tests/vfxBudget.test.ts
git commit -m "feat(p5a): put confetti on the VFX budget ladder"
```

---

### Task 5: Camera direction for the ceremony

**Files:**
- Modify: `lib/world/framing.ts:22`, `lib/world/framing.ts:41-72`
- Modify: `lib/world/director.ts:44-53`, `lib/world/director.ts:66-111`
- Test: `tests/framing.test.ts`, `tests/director.test.ts`

**Interfaces:**
- Consumes: `podiumX`, `BLOCK_WIDTH` from `lib/world/podium.ts` (Task 3).
- Produces: `FramingMode` gains `'podium'`. `BASE_BY_PHASE.results` becomes `intent('podium', 'cut')`. `reduceCue` gains a `phase-results` branch that clears the transient and **holds** `escalation`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/framing.test.ts`:

```ts
describe('podium framing', () => {
  it('centres the finish line and holds the whole podium in frame', () => {
    const metrics = trackMetrics(12);
    const shot = frameTarget('podium', {
      anchors: [], metrics, viewport: { width: 1920, height: 1080 },
      localPlayerId: null, emphasisIds: [],
    });

    const left = shot.centerX - shot.span / 2;
    const right = shot.centerX + shot.span / 2;
    expect(left).toBeLessThan(blockX(2, metrics) - BLOCK_WIDTH / 2);
    expect(right).toBeGreaterThan(blockX(3, metrics) + BLOCK_WIDTH / 2);
  });

  it('needs no anchors — it frames a place, not a group', () => {
    const metrics = trackMetrics(12);
    const empty = frameTarget('podium', {
      anchors: [], metrics, viewport: { width: 1920, height: 1080 },
      localPlayerId: null, emphasisIds: [],
    });
    const full = frameTarget('podium', {
      anchors: [{ playerId: 'p1', x: 0, y: 0, row: 0, segment: 0 }],
      metrics, viewport: { width: 1920, height: 1080 },
      localPlayerId: 'p1', emphasisIds: [],
    });
    expect(empty).toEqual(full);
  });

  it('stays inside the world bounds on a short track', () => {
    const metrics = trackMetrics(1);
    const shot = frameTarget('podium', {
      anchors: [], metrics, viewport: { width: 1920, height: 1080 },
      localPlayerId: null, emphasisIds: [],
    });
    expect(shot.centerX - shot.span / 2).toBeGreaterThanOrEqual(metrics.minX - 0.001);
    expect(shot.centerX + shot.span / 2).toBeLessThanOrEqual(metrics.maxX + 0.001);
  });
});
```

Add to that file's imports: `import { BLOCK_WIDTH, blockX } from '@/lib/world/podium';` and ensure `trackMetrics` and `frameTarget` are already imported (they are).

Append to `tests/director.test.ts`:

```ts
describe('phase-results', () => {
  it('cuts to the podium', () => {
    const state = reduceCue(initialDirectorState, { type: 'phase-results', tier: 'routine' }, 0);
    expect(activeIntent(state).mode).toBe('podium');
    expect(activeIntent(state).style).toBe('cut');
  });

  it('HOLDS escalation rather than resetting it', () => {
    // escalation is still 1 from the final question, and a world dimmed to
    // neon at peak is exactly the grade a spotlight wants.
    const escalated = reduceCue(
      initialDirectorState, { type: 'final-question', tier: 'finalQuestion', round: 12 }, 0,
    );
    expect(escalated.escalation).toBe(1);

    const results = reduceCue(escalated, { type: 'phase-results', tier: 'routine' }, 5000);
    expect(results.escalation).toBe(1);
  });

  it('drops a live transient so a leftover shot cannot fight the cut', () => {
    const withTransient = reduceCue(
      initialDirectorState,
      { type: 'overtake', tier: 'overtake', playerId: 'p1', passed: ['p2'] },
      0,
    );
    expect(withTransient.transient).not.toBeNull();

    const results = reduceCue(withTransient, { type: 'phase-results', tier: 'routine' }, 10);
    expect(results.transient).toBeNull();
    expect(activeIntent(results).mode).toBe('podium');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/framing.test.ts tests/director.test.ts`
Expected: FAIL — `'podium'` is not assignable to `FramingMode`; `activeIntent(state).mode` is `'establishing'`.

- [ ] **Step 3: Add the framing mode**

In `lib/world/framing.ts`, add the import:

```ts
import { BLOCK_WIDTH, podiumX } from './podium';
```

Change the type on line 22:

```ts
export type FramingMode = 'startLine' | 'establishing' | 'pack' | 'emphasis' | 'podium';
```

Add the constant beside the other padding constants:

```ts
/**
 * The ceremony shot: three block widths plus breathing room on each side.
 *
 * `clampCamera` widens this to camera.ts's MIN_SPAN if it is tighter, which is
 * the desired floor — the podium is the closest the camera ever gets.
 */
const PODIUM_SPAN = BLOCK_WIDTH * 3 + PACK_PADDING * 2;
```

Add the case inside `frameTarget`, before `case 'pack'`:

```ts
    case 'podium':
      // Frames a PLACE, not a group: the podium is at a known world x, so this
      // shot needs no anchors and cannot be thrown off by a straggler still
      // standing back at segment 2.
      return clampCamera({ centerX: podiumX(metrics), span: PODIUM_SPAN }, metrics);
```

- [ ] **Step 4: Add the director branch**

In `lib/world/director.ts`, change the `results` row of `BASE_BY_PHASE`:

```ts
  // A cut to the podium is the broadcast move; a drift is a screensaver.
  results: intent('podium', 'cut'),
```

Add the case to `reduceCue`, before the `default`:

```ts
    case 'phase-results':
      return {
        ...state,
        base: BASE_BY_PHASE.results,
        // A live overtake transient outranks nothing here — it would simply
        // fight the cut — so the ceremony takes the frame outright.
        transient: null,
        // DELIBERATELY NOT RESET. `escalation` is still 1 from the final
        // question, and a world dimmed to neon at peak is exactly the grade a
        // spotlight wants. `phase-read` zeroes it; this must not. Do not
        // "fix" this to match the other branches.
        escalation: state.escalation,
      };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/framing.test.ts tests/director.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS, whole suite.

- [ ] **Step 6: Commit**

```bash
git add lib/world/framing.ts lib/world/director.ts tests/framing.test.ts tests/director.test.ts
git commit -m "feat(p5a): cut the camera to the podium at results"
```

---

### Task 6: Ceremony store and runtime

**Files:**
- Create: `lib/ceremony/useCeremony.ts`
- Create: `lib/ceremony/runtime.ts`
- Modify: `app/room/[code]/page.tsx:1-40`

**Interfaces:**
- Consumes: `CEREMONY_MS`, `NO_CEREMONY`, `ceremonyStepsAt`, `sameSteps`, `CeremonySteps` (Task 2). `elapsedIn` from `lib/staging/beats.ts`. `msUntil` from `lib/serverTime.ts`. `useGameStore` from `lib/store.ts`.
- Produces: `useCeremony` (Zustand store exposing `steps: CeremonySteps` and `publish(next)`), `startCeremonyRuntime(): () => void`.

Neither file is unit-tested: `runtime.ts` is impure by design, exactly as `lib/staging/runtime.ts` and `lib/audio/runtime.ts` are, and every decision it makes lives in `beats.ts`, which is.

- [ ] **Step 1: Write the store**

Create `lib/ceremony/useCeremony.ts`:

```ts
import { create } from 'zustand';
import { NO_CEREMONY, sameSteps, type CeremonySteps } from './beats';

/**
 * The store the DOM ceremony consumers read — PixiStage's band and (in P5b)
 * the results board. Written by lib/ceremony/runtime.ts's ticker, which calls
 * `publish` every frame: hence the equality guard, without which every
 * consumer would re-render at 60fps. Same shape as useStaging.publish.
 *
 * lib/world/runtime.ts deliberately does NOT read this store — it calls
 * `ceremonyStepsAt` directly, so the renderer keeps its standing rule of never
 * depending on React state. Same pure function, so the two surfaces cannot
 * disagree by more than a frame.
 */
export interface CeremonyStore {
  steps: CeremonySteps;
  publish(next: CeremonySteps): void;
}

export const useCeremony = create<CeremonyStore>(set => ({
  steps: NO_CEREMONY,
  publish(next) {
    set(state => (sameSteps(state.steps, next) ? state : { steps: next }));
  },
}));

if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  (window as unknown as { __ceremony: typeof useCeremony }).__ceremony = useCeremony;
}
```

- [ ] **Step 2: Write the runtime**

Create `lib/ceremony/runtime.ts`:

```ts
/**
 * The ceremony runtime — a clock, and nothing else.
 *
 * Not unit-tested by design: every decision it makes lives in beats.ts, which
 * is. Same arrangement as lib/staging/runtime.ts and lib/audio/runtime.ts.
 *
 * It subscribes to NO cues. The ceremony's position comes entirely from the
 * server's `ends_at`, which is what makes a reload land settled instead of
 * replaying (ADR-0014, and see ADR-0024 for why replaying would also desync
 * from P4's already-suppressed fanfare).
 */
import { msUntil } from '@/lib/serverTime';
import { elapsedIn } from '@/lib/staging/beats';
import { useGameStore } from '@/lib/store';
import { CEREMONY_MS, NO_CEREMONY, ceremonyStepsAt } from './beats';
import { useCeremony } from './useCeremony';

export function startCeremonyRuntime(): () => void {
  const { publish } = useCeremony.getState();

  let frame = 0;
  const tick = () => {
    frame = requestAnimationFrame(tick);

    const room = useGameStore.getState().room;
    if (room?.phase !== 'results') {
      publish(NO_CEREMONY);
      return;
    }

    // `ends_at ? msUntil(...) : null` mirrors lib/staging/runtime.ts:101. A
    // null deadline — a pre-0004 database — means "beat over", so the podium
    // renders settled rather than failing.
    const remainingMs = room.ends_at ? msUntil(room.ends_at) : null;
    publish(ceremonyStepsAt(elapsedIn(CEREMONY_MS, remainingMs)));
  };

  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    publish(NO_CEREMONY);
  };
}
```

- [ ] **Step 3: Mount it from the room page**

In `app/room/[code]/page.tsx`, add the import beside the other runtime imports:

```ts
import { startCeremonyRuntime } from '@/lib/ceremony/runtime';
```

And add the mount beside the existing three (after `startStagingRuntime`):

```ts
  useEffect(() => startCeremonyRuntime(), []);
```

Order does not matter for this one — unlike `startCueBridge`, it subscribes to no cues and seeds from the store on its first frame.

- [ ] **Step 4: Verify it ticks**

Run: `npm run dev`, play a game to completion (or open a finished room), and in the browser console:

```js
__ceremony.getState().steps
```

Expected: during the ceremony the values change over ~6 seconds and end at `{ risen: 3, spotlight: true, confetti: true, board: true }`. Reload the finished room: the steps read fully settled on the first frame, with no progression.

Then check any non-results phase:

Expected: `{ risen: 0, spotlight: false, confetti: false, board: false }`.

- [ ] **Step 5: Verify nothing regressed**

Run: `npm test` — Expected: PASS.
Run: `npx tsc --noEmit` — Expected: no errors.
Run: `npm run lint` — Expected: no NEW errors. `app/room/[code]/page.tsx` has one pre-existing `react-hooks/set-state-in-effect` error (recorded in `CURRENT.md`); leave it.

- [ ] **Step 6: Commit**

```bash
git add lib/ceremony/useCeremony.ts lib/ceremony/runtime.ts "app/room/[code]/page.tsx"
git commit -m "feat(p5a): publish ceremony steps from a results-phase clock"
```

---

### Task 7: The canvas survives into results, and the band retreats

**Files:**
- Modify: `components/PixiStage.tsx:10-33`, `components/PixiStage.tsx:126-136`
- Modify: `app/room/[code]/page.tsx:68`
- Modify: `components/ResultsView.tsx:16-17`

**Interfaces:**
- Consumes: `useCeremony` (Task 6).
- Produces: the CSS custom property `--ceremony-band` on `document.documentElement`, set only during the results phase (`100vh` before the board beat, `50vh` after) and removed otherwise. `data-band="podium"` on the stage element.

- [ ] **Step 1: Teach PixiStage the podium band**

In `components/PixiStage.tsx`, add the import:

```ts
import { useCeremony } from '@/lib/ceremony/useCeremony';
```

Replace the band derivation (currently lines 32-33):

```ts
  const phase = useGameStore(s => s.room?.phase ?? 'lobby');
  const board = useCeremony(s => s.steps.board);
  const band = phase === 'results' ? 'podium' : STRIP_PHASES.has(phase) ? 'strip' : 'full';
```

Add this effect immediately after, above the renderer effect:

```ts
  /**
   * The results band is the only one that MOVES within its phase, which is why
   * it is a custom property rather than a class (ADR-0015): P5b's results board
   * reads the same value for its top spacer, so the board physically cannot
   * overlap the podium. `strip` and `full` keep their class-based sizing — a
   * property buys nothing where the value is one of two constants.
   */
  useEffect(() => {
    const root = document.documentElement;
    if (band !== 'podium') {
      root.style.removeProperty('--ceremony-band');
      return;
    }
    root.style.setProperty('--ceremony-band', board ? '50vh' : '100vh');
    return () => { root.style.removeProperty('--ceremony-band'); };
  }, [band, board]);
```

Replace the returned element's className expression:

```tsx
    <div
      ref={hostRef}
      data-testid="pixi-stage"
      data-band={band}
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-0 transition-[height] duration-(--dur-settle) ease-settle ${
        band === 'podium'
          ? 'h-(--ceremony-band)'
          : band === 'strip'
            ? 'h-[28vh] portrait:h-[28vh] landscape:h-screen'
            : 'h-screen'
      }`}
    />
```

- [ ] **Step 2: Keep the renderer mounted through results**

In `app/room/[code]/page.tsx`, change line 68 from:

```tsx
      {room && room.status !== 'finished' && <PixiStage code={code} />}
```

to:

```tsx
      {/* Mounted through results: the podium ceremony is a canvas beat (P5a). */}
      {room && <PixiStage code={code} />}
```

The teardown path is unchanged — the renderer effect's cleanup still runs on unmount, profile change and room exit.

- [ ] **Step 3: Give the results screen its band spacer**

In `components/ResultsView.tsx`, wrap the existing `<main>` contents by replacing the opening `<main>` tag and adding a spacer as its first child:

```tsx
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      {/*
        Reserves exactly the height PixiStage is showing, so the board can
        never overlap the podium. The 0px fallback is what a client with no
        canvas at all gets — the full board, immediately.
        P5b replaces everything below this spacer.
      */}
      <div
        aria-hidden="true"
        className="shrink-0 transition-[height] duration-(--dur-settle) ease-settle"
        style={{ height: 'var(--ceremony-band, 0px)' }}
      />
      <header className="text-center">
```

and remove `min-h-screen justify-center` from the original `<main>` className (they fight the spacer). The rest of the component is untouched in this task.

- [ ] **Step 4: Verify by playing a game**

Run: `npm run dev` and play a game to completion in a **headed** browser.

Expected:
1. The canvas is still on screen at results — full height at first.
2. About 6 seconds in, the canvas shrinks to half the viewport and the old results table slides up into the space below it.
3. Reloading the finished room lands directly on the half-height canvas with the table already in place — no retreat animation replays.
4. In DevTools, `getComputedStyle(document.documentElement).getPropertyValue('--ceremony-band')` reads `50vh` at results and is empty during a round.

- [ ] **Step 5: Verify the e2e floor**

Run: `npm run test:e2e -- --workers=2`
Expected: PASS, with **no e2e changes needed**. This was checked while writing the plan: the three `data-band` assertions in `e2e/world.spec.ts` are at the lobby (`:16`, `:110`) and the track beat (`:80`), plus one `strip` assertion at reveal (`:76`) — none runs at the results phase, so none sees the new `podium` value. `e2e/game-flow.spec.ts:34` asserts the canvas is attached, which is now more true than before. If any of these DO fail, that is a real regression in band derivation — fix `PixiStage`, not the test.

- [ ] **Step 6: Commit**

```bash
git add components/PixiStage.tsx "app/room/[code]/page.tsx" components/ResultsView.tsx
git commit -m "feat(p5a): keep the canvas through results and retreat the band"
```

---

### Task 8: Draw the podium

**Files:**
- Create: `lib/world/render/Podium.ts`
- Modify: `lib/world/frame.ts:13-28`
- Modify: `lib/world/render/WorldScene.ts:20-78`
- Modify: `lib/world/runtime.ts:56-100`, `lib/world/runtime.ts:129-243`

**Interfaces:**
- Consumes: `podiumBlocks`, `PodiumBlock`, `blockX` (Task 3); `ceremonyStepsAt`, `CEREMONY_MS`, `NO_CEREMONY` (Task 2); `COLOR` from `lib/presentation/tokens.ts`.
- Produces: `WorldFrameState.ceremony: CeremonyFrameState` where

```ts
export interface CeremonyFrameState {
  active: boolean;
  blocks: readonly PodiumBlock[];
  spotlight: boolean;
  /** World x of the winner's block; meaningless when `blocks` is empty. */
  spotlightX: number;
  confetti: boolean;
}
```

  and `class Podium { readonly container: Container; update(frame: WorldFrameState): void; destroy(): void }`.

- [ ] **Step 1: Extend the frame state**

In `lib/world/frame.ts`, add the import and the interface, and the field on `WorldFrameState`:

```ts
import type { PodiumBlock } from './podium';

/** The ceremony's slice of the frame. `active` is false in every other phase. */
export interface CeremonyFrameState {
  active: boolean;
  blocks: readonly PodiumBlock[];
  spotlight: boolean;
  /** World x of the winner's block; meaningless when `blocks` is empty. */
  spotlightX: number;
  confetti: boolean;
}

export const NO_CEREMONY_FRAME: CeremonyFrameState = {
  active: false, blocks: [], spotlight: false, spotlightX: 0, confetti: false,
};
```

and inside `WorldFrameState`, after `elapsedMs`:

```ts
  /** The podium ceremony; `active` is false in every phase but results. */
  ceremony: CeremonyFrameState;
```

- [ ] **Step 2: Write the renderer**

Create `lib/world/render/Podium.ts`:

```ts
/**
 * The podium and its spotlight (spec §6, §7).
 *
 * Dumb by contract, exactly like `Avatars`: it maps a CeremonyFrameState onto
 * graphics and owns NO animation state. The blocks' rise is expressed as
 * anchors in lib/world/podium.ts and animated by the existing avatar movement
 * grammar; this class only draws where the frame says things are.
 *
 * The spotlight lives here rather than in `Grade` on purpose: Grade is a
 * FULL-SCREEN overlay with a two-value hue, which is the wrong shape for a cone
 * on one character.
 */
import { Container, Graphics } from 'pixi.js';
import { COLOR } from '@/lib/presentation/tokens';
import type { WorldFrameState } from '../frame';
import { BLOCK_WIDTH } from '../podium';
import { horizonY, worldScale } from '../geometry';

const PLACE_TINTS: Record<1 | 2 | 3, number> = {
  1: COLOR.gold,
  2: COLOR.silver,
  3: COLOR.bronze,
};

/** Spotlight cone height as a multiple of the winner's block height. */
const CONE_RISE = 6;

export class Podium {
  readonly container = new Container();
  private readonly blocks = new Graphics();
  private readonly spotlight = new Graphics();

  constructor() {
    // The cone sits BEHIND the blocks so it reads as light falling on them.
    this.container.addChild(this.spotlight);
    this.container.addChild(this.blocks);
    this.container.visible = false;
  }

  update(frame: WorldFrameState): void {
    const { ceremony, camera, viewport } = frame;
    this.container.visible = ceremony.active;
    if (!ceremony.active) return;

    const scale = worldScale(camera, viewport);
    const originX = viewport.width / 2 - camera.centerX * scale;
    const ground = horizonY(viewport);
    const toScreenX = (worldX: number) => originX + worldX * scale;

    this.blocks.clear();
    for (const block of ceremony.blocks) {
      // A block that has not risen is drawn at zero height: the rig standing in
      // front of it is at ground level, and the two come up together.
      const height = (block.risen ? block.height : 0) * scale;
      if (height <= 0) continue;

      const width = BLOCK_WIDTH * scale;
      const x = toScreenX(block.x) - width / 2;

      this.blocks
        .rect(x, ground - height, width, height)
        .fill({ color: COLOR.dusk })
        .stroke({ color: PLACE_TINTS[block.place], width: Math.max(1, 2 * scale), alpha: 0.9 });

      // A bright cap, so the block reads as a solid the rig stands ON.
      this.blocks
        .rect(x, ground - height, width, Math.max(1, 3 * scale))
        .fill({ color: PLACE_TINTS[block.place], alpha: 0.85 });
    }

    this.spotlight.clear();
    if (!ceremony.spotlight || ceremony.blocks.length === 0) return;

    const winner = ceremony.blocks.find(b => b.place === 1);
    if (!winner) return;

    const cx = toScreenX(ceremony.spotlightX);
    const top = ground - winner.height * CONE_RISE * scale;
    const halfTop = (BLOCK_WIDTH * 0.18) * scale;
    const halfBottom = (BLOCK_WIDTH * 1.1) * scale;

    this.spotlight
      .poly([
        cx - halfTop, top,
        cx + halfTop, top,
        cx + halfBottom, ground,
        cx - halfBottom, ground,
      ])
      .fill({ color: COLOR.gold, alpha: 0.14 });

    // A pool on the ground, so the light has somewhere to land.
    this.spotlight
      .ellipse(cx, ground, halfBottom, halfBottom * 0.18)
      .fill({ color: COLOR.gold, alpha: 0.22 });
  }

  destroy(): void {
    this.container.destroy({ children: true, context: true, style: true, texture: false });
  }
}
```

- [ ] **Step 3: Mount it in the scene**

In `lib/world/render/WorldScene.ts`, add the import:

```ts
import { Podium } from './Podium';
```

Add the field beside `avatars`:

```ts
  private readonly podium = new Podium();
```

In the constructor, add the podium **below** the avatars so rigs stand in front of their blocks — insert immediately before `this.avatars = new Avatars(...)`:

```ts
    this.root.addChild(this.podium.container);
```

In `applyFrame`, add the update immediately before `this.grade.update(...)`:

```ts
    this.podium.update(frame);
```

In `destroy`, add before `this.avatars.destroy();`:

```ts
    this.podium.destroy();
```

- [ ] **Step 4: Feed it from the runtime**

In `lib/world/runtime.ts`, add the imports:

```ts
import { CEREMONY_MS, NO_CEREMONY, ceremonyStepsAt, type CeremonySteps } from '@/lib/ceremony/beats';
import { msUntil } from '@/lib/serverTime';
import { elapsedIn } from '@/lib/staging/beats';
import { NO_CEREMONY_FRAME, type CeremonyFrameState } from './frame';
import { blockX, podiumAnchors, podiumBlocks } from './podium';
```

Add `'phase-results'` to `SUBSCRIBED`:

```ts
const SUBSCRIBED: CueType[] = [
  'phase-countdown',
  'phase-read',
  'phase-answer',
  'phase-track',
  'phase-results',
  'overtake',
  // ... rest unchanged
];
```

Add this helper above `fieldAnchors`:

```ts
/**
 * The ceremony's position, computed straight from the server deadline.
 *
 * Deliberately NOT read from `useCeremony`: the renderer never depends on React
 * state. It is the same pure function that store's ticker calls, so the two
 * surfaces cannot disagree by more than a frame.
 */
function ceremonySteps(state: ReturnType<typeof useGameStore.getState>): CeremonySteps {
  const room = state.room;
  if (room?.phase !== 'results') return NO_CEREMONY;
  return ceremonyStepsAt(elapsedIn(CEREMONY_MS, room.ends_at ? msUntil(room.ends_at) : null));
}
```

Change `fieldAnchors` to take the steps and add the results branch:

```ts
function fieldAnchors(
  state: ReturnType<typeof useGameStore.getState>,
  metrics: TrackMetrics,
  steps: CeremonySteps,
): MarkerAnchor[] {
  const { room, standings, players } = state;
  const racers = players.filter(p => p.is_playing);
  const phase = room?.phase ?? 'lobby';

  if (phase === 'lobby') return gridAnchors(racers, metrics);
  // The ceremony is a fourth layout, not a fourth renderer.
  if (phase === 'results' && standings?.length) return podiumAnchors(standings, metrics, steps);
  return standings?.length ? markerAnchors(standings, metrics) : startLineAnchors(racers, metrics);
}
```

Update **both** call sites. In the cue handler:

```ts
      const state = useGameStore.getState();
      const metrics = trackMetrics(state.room?.total_rounds ?? 12);
      const anchors = fieldAnchors(state, metrics, ceremonySteps(state));
```

In `tick()`, replace the existing `const anchors = fieldAnchors(state, metrics);` with:

```ts
    const steps = ceremonySteps(state);
    const anchors = fieldAnchors(state, metrics, steps);
```

Then build the ceremony frame slice — add immediately before the `scene.setPlayers(players)` call:

```ts
    const ceremony: CeremonyFrameState =
      room?.phase === 'results' && standings?.length
        ? {
            active: true,
            blocks: podiumBlocks(standings, metrics, steps),
            spotlight: steps.spotlight,
            spotlightX: blockX(1, metrics),
            confetti: steps.confetti,
          }
        : NO_CEREMONY_FRAME;
```

and add `ceremony,` to the `scene.applyFrame({ ... })` object, after `elapsedMs`.

- [ ] **Step 5: Verify the whole suite still passes**

Run: `npm test` — Expected: PASS.
Run: `npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 6: Verify by playing a game**

Run: `npm run dev`, play to completion in a **headed** browser.

Expected:
1. At results the camera cuts to the finish line and the world dims.
2. Three blocks appear in order — bronze (right), silver (left), gold (centre) — each with the corresponding rig lifted onto it.
3. The winner's rig is on the tallest, centre block, under a gold cone and ground pool.
4. Non-top-3 players remain back down the track, off frame.
5. Reloading lands on the finished podium with no rise animation.

Check a two-player and a one-player game too: fewer blocks, no crash.

- [ ] **Step 7: Commit**

```bash
git add lib/world/render/Podium.ts lib/world/frame.ts lib/world/render/WorldScene.ts lib/world/runtime.ts
git commit -m "feat(p5a): draw the podium and spotlight"
```

---

### Task 9: Confetti

**Files:**
- Create: `lib/world/render/Confetti.ts`
- Modify: `lib/world/render/WorldScene.ts`

**Interfaces:**
- Consumes: `WorldFrameState.ceremony` (Task 8), `VfxAllowance.confetti` (Task 4), `RACER_COLORS` and `COLOR` from `lib/presentation/tokens.ts`.
- Produces: `class Confetti { readonly container: Container; update(frame: WorldFrameState, dtMs: number): void; destroy(): void }`.

- [ ] **Step 1: Write the renderer**

Create `lib/world/render/Confetti.ts`:

```ts
/**
 * Ceremony confetti (spec §8).
 *
 * Its OWN pool, not `render/Vfx.ts`'s. That pool is 240 slots allocated once
 * at construction and medal glows are pushed through it (choreographer.ts:304),
 * so confetti at ceremony density would evict exactly the crowns the podium
 * exists to show. The physics disagree too: Vfx is avatar-mounted, upward,
 * sub-second and circular; confetti is viewport-wide, gravity-driven,
 * multi-second and rotating.
 *
 * The pool is allocated LAZILY, on the first frame that asks for confetti, so
 * the lobby and every round pay nothing for it.
 */
import { Container, Graphics } from 'pixi.js';
import { COLOR, RACER_COLORS } from '@/lib/presentation/tokens';
import type { WorldFrameState } from '../frame';

const MAX_PIECES = 180;
const LIFETIME_MS = 3200;
const PIECE_WIDTH = 7;
const PIECE_HEIGHT = 11;
const GRAVITY = 220;      // px/s^2
const FLUTTER_HZ = 1.6;

interface Piece {
  sprite: Graphics;
  age: number;
  lifetimeMs: number;
  vx: number;
  vy: number;
  spin: number;
  phase: number;
}

export class Confetti {
  readonly container = new Container();
  private pool: Piece[] = [];
  /** The static stand-in used when the budget forbids particles. */
  private readonly wash = new Graphics();
  private washAge = -1;
  private burstDone = false;

  constructor() {
    this.container.addChild(this.wash);
    this.wash.visible = false;
  }

  update(frame: WorldFrameState, dtMs: number): void {
    const { ceremony, allowance, viewport } = frame;

    if (!ceremony.active || !ceremony.confetti) {
      this.reset();
      return;
    }

    if (allowance.confetti <= 0) {
      this.updateWash(dtMs, viewport.width, viewport.height);
      return;
    }

    if (!this.burstDone) {
      this.burst(allowance.confetti, viewport.width, ceremony);
      this.burstDone = true;
    }

    this.step(dtMs, viewport.height);
  }

  /**
   * One burst, not a continuous emitter: the roadmap's confetti is a MOMENT.
   * A drizzle that never stops is what makes a ceremony feel cheap.
   */
  private burst(density: number, width: number, ceremony: WorldFrameState['ceremony']): void {
    const count = Math.round(MAX_PIECES * density);
    this.ensurePool(count);

    // Tint from the top three's accents plus gold, so the burst is specific to
    // who actually won rather than generic.
    const tints = ceremony.blocks.length > 0
      ? [COLOR.gold, ...RACER_COLORS.slice(0, 3)]
      : [COLOR.gold, ...RACER_COLORS];

    for (let i = 0; i < count; i++) {
      const piece = this.pool[i];
      piece.sprite.visible = true;
      piece.sprite.tint = tints[i % tints.length];
      piece.sprite.x = Math.random() * width;
      piece.sprite.y = -Math.random() * 200;
      piece.sprite.rotation = Math.random() * Math.PI * 2;
      piece.sprite.alpha = 1;
      piece.age = 0;
      piece.lifetimeMs = LIFETIME_MS * (0.7 + Math.random() * 0.6);
      piece.vx = (Math.random() - 0.5) * 90;
      piece.vy = 40 + Math.random() * 120;
      // No rotation at `lean`: the budget sheds motion before it sheds pieces.
      piece.spin = density >= 1 ? (Math.random() - 0.5) * 5 : 0;
      piece.phase = Math.random() * Math.PI * 2;
    }
  }

  private step(dtMs: number, height: number): void {
    const dt = dtMs / 1000;
    for (const piece of this.pool) {
      if (!piece.sprite.visible) continue;

      piece.age += dtMs;
      if (piece.age >= piece.lifetimeMs || piece.sprite.y > height + 40) {
        piece.sprite.visible = false;
        continue;
      }

      piece.vy += GRAVITY * dt;
      piece.phase += FLUTTER_HZ * dt * Math.PI * 2;
      piece.sprite.x += (piece.vx + Math.sin(piece.phase) * 40) * dt;
      piece.sprite.y += piece.vy * dt;
      piece.sprite.rotation += piece.spin * dt;

      // Fade only over the last quarter, so the air stays full while it lasts.
      const k = piece.age / piece.lifetimeMs;
      piece.sprite.alpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
    }
  }

  /**
   * The `minimal` stand-in: one gold wash that fades once, opacity only.
   *
   * Reduced motion should cost the celebration its MOTION, not its existence —
   * degrading to nothing deletes the moment the phase was built for.
   */
  private updateWash(dtMs: number, width: number, height: number): void {
    if (this.washAge < 0) {
      this.wash.clear().rect(0, 0, width, height).fill({ color: COLOR.gold });
      this.wash.visible = true;
      this.washAge = 0;
    }
    this.washAge += dtMs;
    const k = Math.min(1, this.washAge / 800);
    this.wash.alpha = 0.28 * (1 - k);
    if (k >= 1) this.wash.visible = false;
  }

  private ensurePool(count: number): void {
    for (let i = this.pool.length; i < count; i++) {
      const sprite = new Graphics();
      sprite
        .rect(-PIECE_WIDTH / 2, -PIECE_HEIGHT / 2, PIECE_WIDTH, PIECE_HEIGHT)
        .fill({ color: 0xffffff });
      sprite.visible = false;
      this.container.addChild(sprite);
      this.pool.push({
        sprite, age: 0, lifetimeMs: LIFETIME_MS, vx: 0, vy: 0, spin: 0, phase: 0,
      });
    }
  }

  private reset(): void {
    if (this.burstDone) {
      for (const piece of this.pool) piece.sprite.visible = false;
      this.burstDone = false;
    }
    if (this.washAge >= 0) {
      this.wash.visible = false;
      this.washAge = -1;
    }
  }

  destroy(): void {
    // `{ children: true }` alone strands every pooled Graphics' `_ownedContext`
    // in Pixi v8 — the same trap render/Vfx.ts documents at its destroy().
    this.container.destroy({ children: true, context: true, style: true, texture: false });
  }
}
```

- [ ] **Step 2: Mount it in the scene**

In `lib/world/render/WorldScene.ts`, add the import:

```ts
import { Confetti } from './Confetti';
```

Add the field and a frame-delta tracker beside the others:

```ts
  private readonly confetti = new Confetti();
  private lastFrameAt = 0;
```

In the constructor, add the confetti **above** the grade so pieces are not washed out by it — insert immediately before `this.root.addChild(this.grade.graphic);`:

```ts
    this.root.addChild(this.confetti.container);
```

In `applyFrame`, add immediately after `this.podium.update(frame);`:

```ts
    // Same dt derivation as Avatars.apply, including the 64ms clamp that keeps
    // a backgrounded tab from teleporting every piece off screen on return.
    const dtMs = this.lastFrameAt === 0 ? 16 : Math.min(64, frame.elapsedMs - this.lastFrameAt);
    this.lastFrameAt = frame.elapsedMs;
    this.confetti.update(frame, dtMs);
```

In `destroy`, add before `this.avatars.destroy();`:

```ts
    this.confetti.destroy();
```

- [ ] **Step 3: Verify the suite**

Run: `npm test` — Expected: PASS.
Run: `npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 4: Verify all three budget levels, headed**

Per `CURRENT.md`, headless Chromium falls back to SwiftShader and pins the budget at `minimal` before a test starts, so this MUST be done in a headed browser.

1. **`full`** — play to results in a headed browser on the default profile. Expected: a single dense burst of rotating pieces falling past the podium, thinning out after ~3 seconds and not repeating.
2. **`lean`** — force a downgrade by running a synthetic main-thread block (the technique used for P2's exit criterion 5) during the ceremony. Expected: roughly half as many pieces, no rotation.
3. **`minimal`** — switch the Motion setting to Reduced via `SettingsControl` and replay the ceremony. Expected: no falling pieces at all; a single gold wash fades out over ~0.8s. The podium and spotlight still appear.

4. **Reload into a finished room.** Expected: **one burst fires**, and only one. `ceremony.confetti` is already true on the first frame, so `burst()` runs once and `burstDone` prevents any repeat.

This is the one place P5a deliberately diverges from "a reload lands settled and replays nothing." The rest of the ceremony is a *position* — a block is up or it is not — and a reload lands at the true one. Confetti is an *event* with no settled state to land in: a viewer opening a finished room has not seen it, and the alternative is a podium under a permanently empty sky. Note that this differs from P4, which suppresses the `fanfare` sting on a seeded batch (ADR-0024) — audio and picture disagree here on purpose, because a repeated fanfare sounds like a bug and repeated confetti does not.

Confirm the burst does not fire a *second* time while the room stays open. If it does, `burstDone` is being reset — check `reset()` is only reached when `ceremony.active` or `ceremony.confetti` is false.

- [ ] **Step 5: Commit**

```bash
git add lib/world/render/Confetti.ts lib/world/render/WorldScene.ts
git commit -m "feat(p5a): fire ceremony confetti on its own budgeted pool"
```

---

### Task 10: Verify the phase and record the decisions

**Files:**
- Create: `docs/ADR/0026-the-podium-is-a-fourth-anchor-layout.md`
- Create: `docs/ADR/0027-the-results-phase-gets-a-deadline.md`
- Create: `docs/ADR/0028-the-wires-second-opening.md`
- Create: `docs/ADR/0029-confetti-gets-its-own-pool.md`
- Create: `docs/progress/P5a-podium-ceremony.md`
- Modify: `docs/ADR/README.md` (index rows)
- Modify: `docs/progress/CURRENT.md`

**Interfaces:**
- Consumes: everything above.
- Produces: no code.

- [ ] **Step 1: Run the full verification pass**

Run and record the actual output of each:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run test:e2e -- --workers=2
```

Expected: all pass. `npm run lint` still reports the one pre-existing `react-hooks/set-state-in-effect` error in `app/room/[code]/page.tsx` — that is recorded in `CURRENT.md` and is not this phase's to fix.

- [ ] **Step 2: Check every exit criterion from the spec**

Walk spec §14 and record a real result for each — not an assertion that it should work:

1. Ceremony plays: blocks rise bronze → silver → gold, spotlight, confetti.
2. Reload mid-ceremony lands at the true elapsed position; reload after lands settled.
3. Confetti degrades down the ladder and becomes an opacity-only wash on `reduced`, **verified headed**.
4. Fewer than three players produces a correct podium; a 20-player field frames the top three.
5. Against a pre-0004 database the results screen renders a settled podium rather than failing. Test this by temporarily reverting only `advance_phase` to its 0002 body in a scratch psql session, finishing a game, then re-applying 0004.
6. `standings()`' sort is byte-identical to its 0003 definition — diff the two function bodies.
7. `npm test` and `npm run test:e2e -- --workers=2` pass.

- [ ] **Step 3: Write the four ADRs**

Follow `docs/ADR/README.md`'s format exactly: `# ADR-NNNN: Title`, then **Status** / **Date** / **Phase**, then `## Context`, `## Decision`, `## Consequences`.

- **0026 — The podium is a fourth anchor layout.** Context: the ceremony needed avatars on blocks, and a second scene would have duplicated rigs, flair, medals and the movement grammar. Decision: express the podium as a layout `fieldAnchors` dispatches to, alongside `gridAnchors` / `startLineAnchors` / `markerAnchors`. Consequences: name what this constrains for M3's ceremony features (a photo-finish or an awards sequence is more anchor layouts and more beats, never a new renderer), and record that `podiumAnchors` must preserve `row` and `segment` because `flairFor` reads both.

- **0027 — The results phase gets a deadline.** Context: `ends_at` was null at results, so the ceremony could not derive beat position the ADR-0014 way; the alternatives were a device-local stored anchor (wrong across devices) or replaying on every mount (which would desync from P4's ADR-0024 sting suppression). Decision: `advance_phase` sets `now() + 9 seconds` for results. Consequences: the field means "ceremony deadline" only at this one terminal phase; it is inert because `useHostDriver` guards results twice; a pre-0004 client renders a settled podium via `msUntil(null) === 0`; and `CEREMONY_MS` is now a hand-maintained mirror in the `NOMINAL_MS` tradition.

- **0028 — The wire's second opening: `answered` and `avg_answer_ms`.** Context: the roadmap's results table asked for accuracy and average answer time; neither was derivable presentation-side (accuracy only from an unbroken session, average never — `picks` carries no timing). Decision: extend `standings()` additively, weighed **against ADR-0018's precedent** rather than argued fresh, and ride the same migration as 0027 so a database takes one deploy. Consequences: client fields are optional so a pre-migration server degrades to `—`; the Fairness Law sort is untouched; and state plainly that this is now the second opening and the third needs a stronger argument than either.

- **0029 — Confetti gets its own pool.** Context: `render/Vfx.ts` is 240 slots allocated once, and `kind: 'glow'` medal crowns go through it. Decision: a separate lazily-allocated pool with its own physics, governed by the same `VfxAllowance` ladder. Consequences: two pools to keep in sync on the budget, but the crowns can never be evicted; note the shared Pixi v8 `destroy({ context: true })` trap both pools must respect.

- [ ] **Step 4: Add the ADR index rows**

Append four rows to the table at the end of `docs/ADR/README.md`, matching the existing format exactly, with phase `P5a`.

- [ ] **Step 5: Write the phase progress doc**

Create `docs/progress/P5a-podium-ceremony.md` following the shape of `docs/progress/P4-audio-identity.md`: scope, what was built (one row per task), deviations from the plan, verification results with real command output, and any new tech debt.

Record at minimum:
- The `podiumX` change from the spec's `finish + TRACK_MARGIN * 0.45` to the finish line itself, and why (`clampCamera` against a 260-unit run-off).
- The `row`-preservation requirement in `podiumAnchors` and the `flairFor` double-edge-holder bug it prevents.
- That the confetti burst fires once for a viewer arriving at an already-finished room, and the reasoning for that deliberate divergence from P4's ADR-0024 sting suppression (Task 9 Step 4). If it turns out to read badly in practice, record that instead — the call is a judgement and the progress doc is where it gets made honestly.
- Whether the winner's rig head stays on canvas at non-16:9 aspect ratios. This is the same class as the `MAX_STACK_RISE` debt already in `CURRENT.md`; if ultrawide clips it, add it there rather than fixing it here.

- [ ] **Step 6: Update CURRENT.md**

- Move P5a out of "Next up" and into "Last completed", pointing at the new progress doc.
- Set "Next up" to P5b, pointing at `docs/superpowers/specs/2026-08-23-m2-p5b-results-board-design.md`.
- Resolve the ADR-0024 note: P5a's ceremony subscribes to no cues and derives from `ends_at`, so the seed-batch trap does not apply — say so plainly and say whether live verification confirmed it.
- Add any new tech debt found during Step 2.

- [ ] **Step 7: Commit**

```bash
git add docs/
git commit -m "docs(p5a): record the ceremony's four decisions and close the phase"
```

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: §3.1 → Task 1; §3.2 → Task 1; §4 module layout → Tasks 2, 3, 6, 8, 9; §5 beats → Task 2; §6 podium layout → Task 3; §7 camera and grade → Task 5 (framing, director, the escalation hold) and Task 8 (spotlight); §8 confetti → Tasks 4 and 9; §9 band handoff → Task 7; §10 runtime wiring → Tasks 6 and 8; §11 edge cases → covered by tests in Tasks 2, 3 and by the verification in Tasks 8, 9, 10; §12 testing → Tasks 2, 3, 4, 5 unit tests plus Task 10's full pass; §14 exit criteria → Task 10 Step 2; §15 ADRs → Task 10 Step 3.

**Two deviations from the spec, both deliberate and both flagged in-plan:**
1. `podiumX` is the finish line, not `finish + TRACK_MARGIN * 0.45` — the spec's value does not survive `clampCamera` against a 260-unit run-off. Task 3 carries the reasoning; Task 10 Step 5 records it.
2. `podiumAnchors` preserves `row` rather than forcing `0`, because `flairFor` derives `edgeHolder` from it. The spec did not name this; Task 3 tests it.

**Type consistency.** `CeremonySteps` (Task 2) is consumed unchanged by Tasks 3, 6, 8. `PodiumBlock` (Task 3) is the element type of `CeremonyFrameState.blocks` (Task 8). `hasRisen(place, steps)` and `blockX(place, metrics)` keep the same argument order everywhere. `VfxAllowance.confetti` (Task 4) is read only in Task 9. `NO_CEREMONY` (ceremony steps) and `NO_CEREMONY_FRAME` (frame slice) are deliberately distinct names for distinct types.
