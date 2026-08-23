# M2 P3b — Round Staging: the outcome half — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn REVEAL and TRACK from M1 placeholders into staged broadcast beats — an avatar-stacked distribution bar, a lower-third callout timed to the arena reaction, a bottom standings rail, and final-question escalation that lands on the run-up.

**Architecture:** Two new pure modules (`distribution.ts`, `callouts.ts`) carry every decision; `lib/staging/runtime.ts` stays the only staging cue subscriber and threads the callout accumulator the way `lib/world/runtime.ts` threads the choreographer's. The realtime payload opens once, additively, for `picks` and `current_streak`. The reveal is the existing answer-button grid transformed in place, not a second widget.

**Tech Stack:** Next.js (see `AGENTS.md` — read `node_modules/next/dist/docs/` before touching framework APIs), React, `motion`, Zustand, Vitest, Playwright, Supabase/Postgres RPCs.

**Spec:** `docs/superpowers/specs/2026-08-23-m2-p3b-round-outcome-design.md`

## Global Constraints

- **Read `docs/progress/CURRENT.md` before starting.** It carries the local-environment hazards below and the standing tech-debt list.
- **Never run `supabase stop` or `supabase start`.** Windows/Hyper-V reserves TCP 54024–54423, which covers every default Supabase port; the running stack is on 553xx per `.env.local` (gitignored) while `supabase/config.toml` is still at defaults. A restart binds the reserved defaults, fails, and loses the working stack. Apply migrations with `supabase migration up` or `psql` against the running stack.
- **`.env.local` is gitignored and is NOT copied into a fresh worktree.** Copy it by hand from the main checkout and verify the port matches the running stack before `npm run dev`.
- **Live verification must use a headed browser.** Headless Chromium falls back to SwiftShader, idles ~16fps, and pins the VFX budget at `minimal` before a test starts. Use `chromium.launch({ headless: false })` driven ad hoc — this project's convention for manual checks — not committed snapshot tests.
- **`motion` writes animated properties as inline styles, which unconditionally outrank a Tailwind class regardless of specificity.** Any state a `motion` component's own `variants`/`animate` touches must be expressed as the variant's target value, never as a co-located `opacity-*` class (ADR-0017).
- **A component that conditionally mounts on `useStaging`-derived state needs `AnimatePresence initial={false}`**, or its entrance replays on every reload and late join (ADR-0014).
- **Tailwind v4 arbitrary variants need `_` for spaces**: `[@media(hover:hover)_and_(pointer:fine)]:block`. Without them lightningcss reads `and(` as a function call and every page 500s — including when the malformed string only appears in a tracked markdown file, because Tailwind scans the project (mitigated by `@source not "../docs";` in `app/globals.css`, which must stay).
- **Design tokens:** `app/globals.css`'s `@theme` block is the source of truth; `lib/presentation/tokens.ts` hand-mirrors the canvas subset and `tests/tokens.test.ts` fails on drift. Use existing tokens (`--color-correct`, `--color-wrong`, `--color-warning`, `--color-ink-mute`, `--radius-panel`, `--dur-beat`, `--ease-snap`, …). Do not add new colors.
- **Verification gate for every task:** `npx tsc --noEmit` clean, `npm test` green, and `npx eslint <files you touched>` clean. Repo-root `npm run lint` is red on three pre-existing files and double-lints any `.claude/worktrees/` copy — scoped eslint on touched files is the gate.
- **Baselines to beat:** `npm test` 304 passing across 25 files; `npm run test:e2e` 18 passing across 7 files.
- **Commit after every task.** Conventional commits, `feat(p3b):` / `fix(p3b):` / `test(p3b):`.

---

### Task 1: The protocol opens — `picks` and `current_streak`

Roadmap decision 4's argued exception (spec §3). Two `create or replace`s, no schema change, no data migration.

**Files:**
- Create: `supabase/migrations/0003_reveal_picks.sql`
- Modify: `lib/types.ts:5-6`
- Modify: `tests/deriveCues.test.ts:20-30` (the `standing()` helper), `tests/cueBus.test.ts:102-103` (two `Standing` literals)
- Test: `tests/store.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `RevealPayload.picks: { player_id: string; choice_index: number }[]`, `Standing.current_streak: number`. Every later task depends on these two field names.

- [ ] **Step 1: Write the failing test**

Append to `tests/store.test.ts`:

```ts
describe('the P3b payload fields', () => {
  it('carries picks and current_streak through a reveal phase event', () => {
    useGameStore.setState({
      room: {
        id: 'r', code: 'ABCDE', status: 'playing', phase: 'answer', round: 1,
        total_rounds: 3, timer_seconds: 20, ends_at: null,
        server_now: new Date().toISOString(),
      },
    });

    useGameStore.getState().applyPhaseEvent({
      phase: 'reveal', round: 1, ends_at: null, server_now: new Date().toISOString(),
      payload: {
        correct_index: 2, fun_fact: null, counts: [1, 0, 2, 0], fastest: null,
        picks: [
          { player_id: 'p1', choice_index: 2 },
          { player_id: 'p2', choice_index: 0 },
          { player_id: 'p3', choice_index: 2 },
        ],
        standings: [
          {
            player_id: 'p1', nickname: 'A', avatar: 'duck', color: '#f59e0b',
            correct: 1, speed_points: 10, longest_streak: 1, current_streak: 1,
          },
        ],
      },
    });

    const { reveal, standings } = useGameStore.getState();
    expect(reveal!.picks).toHaveLength(3);
    expect(reveal!.picks[0]).toEqual({ player_id: 'p1', choice_index: 2 });
    expect(standings![0].current_streak).toBe(1);
  });

  it('does not throw on a pre-migration payload that omits both fields', () => {
    useGameStore.setState({
      room: {
        id: 'r', code: 'ABCDE', status: 'playing', phase: 'answer', round: 1,
        total_rounds: 3, timer_seconds: 20, ends_at: null,
        server_now: new Date().toISOString(),
      },
    });

    expect(() => {
      useGameStore.getState().applyPhaseEvent({
        phase: 'reveal', round: 1, ends_at: null, server_now: new Date().toISOString(),
        // Deliberately shaped like the OLD server: no picks, no current_streak.
        payload: {
          correct_index: 0, fun_fact: null, counts: [1, 0, 0, 0],
          fastest: null, standings: [],
        } as unknown as import('@/lib/types').RevealPayload,
      });
    }).not.toThrow();

    expect(useGameStore.getState().reveal!.picks).toBeUndefined();
  });
});
```

Match the existing imports at the top of `tests/store.test.ts`; add `describe`/`it`/`expect` from `vitest` only if they are not already imported.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/store.test.ts`
Expected: FAIL — TypeScript rejects `picks` and `current_streak` as unknown properties on `RevealPayload` / `Standing`.

- [ ] **Step 3: Add the two fields to the wire types**

In `lib/types.ts`, replace the `Standing` and `RevealPayload` lines:

```ts
export interface Standing { player_id: string; nickname: string; avatar: string; color: string; correct: number; speed_points: number; longest_streak: number; current_streak: number; }
export interface Pick { player_id: string; choice_index: number; }
export interface RevealPayload { correct_index: number; fun_fact: string|null; counts: number[]; picks: Pick[]; fastest: { player_id: string; nickname: string; time_remaining_ms: number }|null; standings: Standing[]; }
```

- [ ] **Step 4: Fix the two test helpers the new required fields break**

`tests/deriveCues.test.ts` — add the field to the `standing()` helper (the current run is not what these tests exercise, so it mirrors `streak`):

```ts
function standing(id: string, correct: number, speed = 0, streak = 0): Standing {
  return {
    player_id: id,
    nickname: id.toUpperCase(),
    avatar: 'duck',
    color: '#f59e0b',
    correct,
    speed_points: speed,
    longest_streak: streak,
    current_streak: streak,
  };
}
```

`tests/cueBus.test.ts:102-103` — add `current_streak` to both literals and `picks: []` to the reveal payload:

```ts
        correct_index: 0, fun_fact: null, counts: [1, 0, 0, 0], picks: [], fastest: null,
        standings: [
          { player_id: 'p1', nickname: 'A', avatar: 'duck', color: '#f59e0b', correct: 1, speed_points: 10, longest_streak: 1, current_streak: 1 },
          { player_id: 'p2', nickname: 'B', avatar: 'cat', color: '#38bdf8', correct: 0, speed_points: 0, longest_streak: 0, current_streak: 0 },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/store.test.ts tests/deriveCues.test.ts tests/cueBus.test.ts`
Expected: PASS. Then `npx tsc --noEmit` — clean.

- [ ] **Step 6: Write the migration**

Create `supabase/migrations/0003_reveal_picks.sql`:

```sql
-- M2 P3b — the one protocol opening (roadmap decision 4).
-- Additive only: two functions replaced, no schema change, no data migration.

-- ============ current_streak ============
-- longest_streak's loop, returning the TRAILING run rather than the best one.
-- The streak flame is persistent flair (ADR-0013) but `streak-tier` cues fire
-- only at 3/5/8, so a reload mid-streak used to lose the flame until the next
-- milestone. With the run on the wire, flairFor derives it like every other
-- piece of flair.
create or replace function current_streak(p_room_id uuid, p_player_id uuid, p_max_round int) returns int
language plpgsql stable set search_path = public as $$
declare
  r record;
  cur int := 0;
begin
  for r in
    select coalesce(a.is_correct, false) as ok
    from room_questions rq
    left join answers a on a.room_id = rq.room_id and a.round = rq.round
      and a.player_id = p_player_id
    where rq.room_id = p_room_id and rq.round <= p_max_round
    order by rq.round
  loop
    if r.ok then cur := cur + 1;
    else cur := 0;
    end if;
  end loop;
  return cur;
end $$;

-- ============ standings ============
-- Unchanged except for the added current_streak field. The sort is the
-- Fairness Law and must stay byte-identical: correct desc -> speed_points desc
-- -> longest_streak desc -> player_id asc.
create or replace function standings(p_room_id uuid, p_max_round int) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(row order by row->'correct' desc, row->'speed_points' desc, row->'longest_streak' desc, row->>'player_id' asc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'player_id', p.id, 'nickname', p.nickname, 'avatar', p.avatar, 'color', p.color,
      'correct', count(a.*) filter (where a.is_correct),
      'speed_points', coalesce(sum(a.speed_points) filter (where a.is_correct), 0),
      'longest_streak', longest_streak(p_room_id, p.id, p_max_round),
      'current_streak', current_streak(p_room_id, p.id, p_max_round)
    ) as row
    from players p
    left join answers a on a.player_id = p.id and a.room_id = p_room_id and a.round <= p_max_round
    where p.room_id = p_room_id and p.is_playing
    group by p.id
  ) s;
$$;

-- ============ build_reveal ============
-- Gains 'picks': who chose what, for the avatar-stacked distribution bar.
-- 'counts' STAYS even though picks subsumes it: it keeps the phase-reveal cue's
-- shape untouched (ADR-0001) and is the fallback for a client running against a
-- database that has not taken this migration.
create or replace function build_reveal(p_room_id uuid, p_round int) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'correct_index', q.correct_index,
    'fun_fact', q.fun_fact,
    'counts', (
      select jsonb_agg(c.cnt order by c.idx) from (
        select gs.idx, count(a.*) as cnt
        from generate_series(0, 3) gs(idx)
        left join answers a on a.room_id = p_room_id and a.round = p_round
          and a.choice_index = gs.idx
        group by gs.idx
      ) c),
    'picks', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'player_id', a.player_id, 'choice_index', a.choice_index)
             order by a.time_remaining_ms desc), '[]'::jsonb)
      from answers a
      where a.room_id = p_room_id and a.round = p_round),
    'fastest', (
      select jsonb_build_object('player_id', a.player_id, 'nickname', p.nickname,
                                'time_remaining_ms', a.time_remaining_ms)
      from answers a join players p on p.id = a.player_id
      where a.room_id = p_room_id and a.round = p_round and a.is_correct
      order by a.time_remaining_ms desc limit 1),
    'standings', standings(p_room_id, p_round))
  from room_questions rq join questions q on q.id = rq.question_id
  where rq.room_id = p_room_id and rq.round = p_round;
$$;
```

- [ ] **Step 7: Apply the migration to the running local stack**

Run: `npx supabase migration up` (or apply the file with `psql` against the running stack).
**Do NOT run `supabase stop` / `supabase start`** — see Global Constraints.

Expected: the migration applies with no error. Verify the shape directly:

```sql
-- against any finished round in the local database
select build_reveal(id, 1) -> 'picks' from rooms limit 1;
select standings(id, 1) -> 0 -> 'current_streak' from rooms limit 1;
```

Expected: `picks` is a JSON array of `{player_id, choice_index}` (`[]` when nobody answered), and `current_streak` is an integer. There is no SQL test harness in this repo — this manual check IS the verification, and its output belongs in the phase record.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0003_reveal_picks.sql lib/types.ts tests/store.test.ts tests/deriveCues.test.ts tests/cueBus.test.ts
git commit -m "feat(p3b): open the wire for reveal picks and current_streak"
```

---

### Task 2: `distribution.ts` — the reveal's rows

Pure. No React, no store, no DOM. Every cap, ordering and fallback rule is decided and asserted here (spec §4 seams).

**Files:**
- Create: `lib/staging/distribution.ts`
- Test: `tests/distribution.test.ts`

**Interfaces:**
- Consumes: `RevealPayload`, `Standing` from Task 1.
- Produces: `distributionRows(options, reveal, standings, localPlayerId, cap?) => DistributionRow[]`, `STACK_CAP`, and the `DistributionRow` / `StackAvatar` types. Task 7 renders them.

**Deviation from the spec, flag it in the phase record:** spec §6 asks for a cap of 8 that drops to 4 below 640px. This ships **one cap of 6 at every width**, because an honest `+N` counter cannot be computed in CSS, and a `matchMedia` hook to vary it would put a second source of truth in the render path for a stack that overlaps anyway. Six overlapping 20px faces occupy ~80px — comfortable at 390px.

- [ ] **Step 1: Write the failing test**

Create `tests/distribution.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { STACK_CAP, distributionRows } from '@/lib/staging/distribution';
import type { RevealPayload, Standing } from '@/lib/types';

const OPTIONS = ['Paris', 'Rome', 'Berlin', 'Madrid'];

function standing(id: string, correct: number): Standing {
  return {
    player_id: id, nickname: id.toUpperCase(), avatar: 'duck', color: '#f59e0b',
    correct, speed_points: 0, longest_streak: 0, current_streak: 0,
  };
}

function reveal(over: Partial<RevealPayload> = {}): RevealPayload {
  return {
    correct_index: 0, fun_fact: null, counts: [0, 0, 0, 0], picks: [],
    fastest: null, standings: [], ...over,
  };
}

describe('distributionRows', () => {
  it('returns one row per option and marks the correct one', () => {
    const rows = distributionRows(OPTIONS, reveal({ correct_index: 2 }), [], null);
    expect(rows).toHaveLength(4);
    expect(rows.map(r => r.index)).toEqual([0, 1, 2, 3]);
    expect(rows.map(r => r.correct)).toEqual([false, false, true, false]);
    expect(rows[0].option).toBe('Paris');
  });

  it('counts from picks when the payload carries them', () => {
    const rows = distributionRows(
      OPTIONS,
      reveal({
        counts: [99, 99, 99, 99], // deliberately wrong: picks must win
        picks: [
          { player_id: 'a', choice_index: 0 },
          { player_id: 'b', choice_index: 0 },
          { player_id: 'c', choice_index: 2 },
        ],
      }),
      [standing('a', 1), standing('b', 1), standing('c', 0)],
      null,
    );
    expect(rows.map(r => r.count)).toEqual([2, 0, 1, 0]);
  });

  it('falls back to counts, with empty stacks, on a pre-migration payload', () => {
    const legacy = { ...reveal({ counts: [3, 1, 0, 0] }) } as RevealPayload;
    delete (legacy as Partial<RevealPayload>).picks;

    const rows = distributionRows(OPTIONS, legacy, [], null);
    expect(rows.map(r => r.count)).toEqual([3, 1, 0, 0]);
    expect(rows.every(r => r.avatars.length === 0)).toBe(true);
    expect(rows.every(r => r.overflow === 0)).toBe(true);
  });

  it('scales share against the largest row, and stays at zero when nobody answered', () => {
    const rows = distributionRows(OPTIONS, reveal({ counts: [4, 2, 0, 0] }), [], null);
    expect(rows.map(r => r.share)).toEqual([1, 0.5, 0, 0]);

    const empty = distributionRows(OPTIONS, reveal(), [], null);
    expect(empty.every(r => r.share === 0)).toBe(true);
  });

  it('orders a stack by standings rank, not by pick order', () => {
    const rows = distributionRows(
      OPTIONS,
      reveal({
        picks: [
          { player_id: 'c', choice_index: 0 },
          { player_id: 'a', choice_index: 0 },
          { player_id: 'b', choice_index: 0 },
        ],
      }),
      [standing('a', 3), standing('b', 2), standing('c', 1)],
      null,
    );
    expect(rows[0].avatars.map(a => a.playerId)).toEqual(['a', 'b', 'c']);
  });

  it('caps the stack and reports the overflow', () => {
    const ids = Array.from({ length: STACK_CAP + 3 }, (_, i) => `p${i}`);
    const rows = distributionRows(
      OPTIONS,
      reveal({ picks: ids.map(id => ({ player_id: id, choice_index: 1 })) }),
      ids.map(id => standing(id, 0)),
      null,
    );
    expect(rows[1].count).toBe(STACK_CAP + 3);
    expect(rows[1].avatars).toHaveLength(STACK_CAP);
    expect(rows[1].overflow).toBe(3);
  });

  it('substitutes the local player into the last visible slot rather than cutting them', () => {
    const ids = Array.from({ length: STACK_CAP + 3 }, (_, i) => `p${i}`);
    const local = ids[ids.length - 1]; // ranked last, so normally cut
    const rows = distributionRows(
      OPTIONS,
      reveal({ picks: ids.map(id => ({ player_id: id, choice_index: 1 })) }),
      ids.map((id, i) => standing(id, ids.length - i)),
      local,
    );

    const shown = rows[1].avatars.map(a => a.playerId);
    expect(shown).toHaveLength(STACK_CAP);
    expect(shown[shown.length - 1]).toBe(local);
    expect(rows[1].avatars.find(a => a.playerId === local)!.isLocal).toBe(true);
    // The arithmetic still adds up: substitution replaces, it does not insert.
    expect(rows[1].overflow).toBe(3);
  });

  it('leaves a player who never answered out of every stack', () => {
    const rows = distributionRows(
      OPTIONS,
      reveal({ picks: [{ player_id: 'a', choice_index: 0 }] }),
      [standing('a', 1), standing('silent', 0)],
      null,
    );
    expect(rows.flatMap(r => r.avatars.map(a => a.playerId))).toEqual(['a']);
  });

  it('ignores a pick for an option index that does not exist', () => {
    const rows = distributionRows(
      OPTIONS,
      reveal({ picks: [{ player_id: 'a', choice_index: 7 }] }),
      [standing('a', 0)],
      null,
    );
    expect(rows.every(r => r.count === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/distribution.test.ts`
Expected: FAIL — `Cannot find module '@/lib/staging/distribution'`.

- [ ] **Step 3: Write the implementation**

Create `lib/staging/distribution.ts`:

```ts
/**
 * The REVEAL distribution (spec §5) — pure, no React, no store, no DOM.
 *
 * `picks` arrived with P3b's protocol opening (spec §3). `counts` is kept on
 * the wire as the fallback for a client running against a database that has
 * not taken the migration: no picks means no stacks, never an empty bar.
 */
import type { RevealPayload, Standing } from '@/lib/types';

/**
 * Faces per stack, at every width. The stack overlaps, so six 20px faces
 * occupy ~80px — comfortable at 390px. A width-varying cap would need
 * `matchMedia` in the render path, and an honest overflow count cannot be
 * computed in CSS.
 */
export const STACK_CAP = 6;

export interface StackAvatar {
  playerId: string;
  nickname: string;
  avatar: string;
  color: string;
  isLocal: boolean;
}

export interface DistributionRow {
  /** 0-3; the index the accent and glyph are fixed to (P3a decision 6). */
  index: number;
  option: string;
  count: number;
  /** 0..1 of the largest row. 0 when nobody answered. */
  share: number;
  correct: boolean;
  /** Empty when the payload carries no picks. */
  avatars: StackAvatar[];
  /** Pickers not shown in `avatars`. */
  overflow: number;
}

export function distributionRows(
  options: readonly string[],
  reveal: Pick<RevealPayload, 'correct_index' | 'counts' | 'picks'>,
  standings: readonly Standing[],
  localPlayerId: string | null,
  cap: number = STACK_CAP,
): DistributionRow[] {
  const picks = Array.isArray(reveal.picks) ? reveal.picks : null;
  const rank = new Map(standings.map((s, i) => [s.player_id, i]));
  const byId = new Map(standings.map(s => [s.player_id, s]));

  // Group pickers per option, ranked. An unknown player sorts after everyone
  // known, keeping the order total and stable.
  const pickersPer: string[][] = options.map(() => []);
  for (const pick of picks ?? []) {
    const bucket = pickersPer[pick.choice_index];
    if (bucket) bucket.push(pick.player_id);
  }
  for (const bucket of pickersPer) {
    bucket.sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity));
  }

  const counts = options.map((_, i) =>
    picks ? pickersPer[i].length : reveal.counts?.[i] ?? 0,
  );
  const largest = Math.max(0, ...counts);

  return options.map((option, index) => {
    const pickers = pickersPer[index];
    const shown = pickers.slice(0, cap);

    // You are always in the picture: a local player who would be cut replaces
    // the last visible face rather than being inserted, so `overflow` — and
    // therefore the arithmetic on screen — stays true.
    if (
      localPlayerId !== null &&
      pickers.includes(localPlayerId) &&
      !shown.includes(localPlayerId) &&
      shown.length > 0
    ) {
      shown[shown.length - 1] = localPlayerId;
    }

    return {
      index,
      option,
      count: counts[index],
      share: largest > 0 ? counts[index] / largest : 0,
      correct: index === reveal.correct_index,
      avatars: shown.map(id => {
        const s = byId.get(id);
        return {
          playerId: id,
          nickname: s?.nickname ?? '',
          avatar: s?.avatar ?? '',
          color: s?.color ?? 'var(--color-ink-mute)',
          isLocal: id === localPlayerId,
        };
      }),
      overflow: Math.max(0, pickers.length - cap),
    };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/distribution.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/staging/distribution.ts tests/distribution.test.ts
git commit -m "feat(p3b): derive the reveal distribution rows from picks"
```

---

### Task 3: `callouts.ts` — buffer at reveal, resolve at track

The accumulator that keeps the banner off the wrong beat. Drama cues arrive at the REVEAL transition (ADR-0009) but the world does not react until TRACK — a callout that fires on cue arrival fires one beat before the stadium.

**Files:**
- Create: `lib/staging/callouts.ts`
- Test: `tests/callouts.test.ts`

**Interfaces:**
- Consumes: `Cue` (`lib/presentation/cues.ts`), `CelebrationTier` / `resolveTier` (`lib/presentation/celebration.ts`).
- Produces: `initialCalloutState`, `bufferCallout(state, cue)`, `resolveCallout(state, nameOf, localPlayerId)`, `clearCallout(state)`, `resetCallouts()`, and the `Callout` / `RailDelta` / `CalloutState` types. Task 4 threads them; Task 8 renders them.

**Deviation from the spec, flag it in the phase record:** spec §4 sketches `RailDelta { playerId, placesGained, streak }`. `streak` is dropped — `current_streak` is already on every `Standing` the rail renders (Task 1), so carrying it here would be a second, staler source for the same number.

- [ ] **Step 1: Write the failing test**

Create `tests/callouts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  bufferCallout,
  clearCallout,
  initialCalloutState,
  resetCallouts,
  resolveCallout,
  type CalloutState,
} from '@/lib/staging/callouts';
import type { Cue } from '@/lib/presentation/cues';

const NAMES: Record<string, string> = { a: 'Ren', b: 'Sam', c: 'Kit' };
const nameOf = (id: string) => NAMES[id] ?? id;

const overtake = (playerId: string, passed: string[]): Cue =>
  ({ type: 'overtake', tier: 'overtake', playerId, passed });
const streak = (playerId: string, s: 3 | 5 | 8): Cue =>
  ({ type: 'streak-tier', tier: 'streakMilestone', playerId, streak: s });
const leadChanged = (playerId: string, previousLeaderId: string): Cue =>
  ({ type: 'lead-changed', tier: 'overtake', playerId, previousLeaderId });
const finalQuestion = (round: number): Cue =>
  ({ type: 'final-question', tier: 'finalQuestion', round });

function bufferAll(cues: Cue[], from: CalloutState = initialCalloutState): CalloutState {
  return cues.reduce(bufferCallout, from);
}

describe('bufferCallout', () => {
  it('holds drama rather than resolving it on arrival', () => {
    const state = bufferAll([overtake('a', ['b'])]);
    expect(state.pending).toHaveLength(1);
    expect(state.callout).toBeNull();
  });

  it('ignores cues that are not drama or escalation', () => {
    const state = bufferAll([
      { type: 'phase-reveal', tier: 'routine', round: 1, correctIndex: 0, counts: [], fastest: null },
      { type: 'player-advanced', tier: 'routine', playerId: 'a', from: 0, to: 1 },
    ]);
    expect(state.pending).toHaveLength(0);
  });
});

describe('resolveCallout', () => {
  it('names the single buffered cue at the track beat', () => {
    const state = resolveCallout(bufferAll([overtake('a', ['b'])]), nameOf, null);
    expect(state.callout).toEqual({
      kind: 'overtake', tier: 'overtake', playerId: 'a', headline: 'Ren passes Sam',
    });
    expect(state.pending).toHaveLength(0);
  });

  it('pluralises a multi-player pass', () => {
    const state = resolveCallout(bufferAll([overtake('a', ['b', 'c'])]), nameOf, null);
    expect(state.callout!.headline).toBe('Ren passes 2 racers');
  });

  it('picks the highest tier, so final question outranks an overtake', () => {
    const state = resolveCallout(
      bufferAll([overtake('a', ['b']), finalQuestion(8)]),
      nameOf,
      null,
    );
    expect(state.callout!.kind).toBe('final-question');
    expect(state.callout!.headline).toBe('FINAL QUESTION');
  });

  it('breaks a tie toward the local player', () => {
    const state = resolveCallout(
      bufferAll([overtake('a', ['c']), leadChanged('b', 'a')]),
      nameOf,
      'b',
    );
    expect(state.callout!.playerId).toBe('b');
    expect(state.callout!.headline).toBe('Sam takes the lead');
  });

  it('keeps the first buffered cue when the tie involves no local player', () => {
    const state = resolveCallout(
      bufferAll([overtake('a', ['c']), leadChanged('b', 'a')]),
      nameOf,
      null,
    );
    expect(state.callout!.playerId).toBe('a');
  });

  it('reports places gained per player as subdued rail deltas', () => {
    const state = resolveCallout(
      bufferAll([overtake('a', ['b', 'c']), overtake('b', ['c'])]),
      nameOf,
      null,
    );
    expect(state.deltas).toEqual([
      { playerId: 'a', placesGained: 2 },
      { playerId: 'b', placesGained: 1 },
    ]);
  });

  it('raises escalation on a final-question cue and keeps it raised', () => {
    const resolved = resolveCallout(bufferAll([finalQuestion(8)]), nameOf, null);
    expect(resolved.escalated).toBe(true);
    expect(clearCallout(resolved).escalated).toBe(true);
  });

  it('produces no callout on a beat with no drama', () => {
    const state = resolveCallout(initialCalloutState, nameOf, null);
    expect(state.callout).toBeNull();
    expect(state.deltas).toHaveLength(0);
  });

  it('names a streak milestone', () => {
    const state = resolveCallout(bufferAll([streak('c', 5)]), nameOf, null);
    expect(state.callout).toEqual({
      kind: 'streak-tier', tier: 'streakMilestone', playerId: 'c',
      headline: 'Kit is on fire — 5 in a row',
    });
  });
});

describe('clearCallout and resetCallouts', () => {
  it('drops the banner and the deltas at the next read', () => {
    const resolved = resolveCallout(bufferAll([overtake('a', ['b'])]), nameOf, null);
    const cleared = clearCallout(resolved);
    expect(cleared.callout).toBeNull();
    expect(cleared.deltas).toHaveLength(0);
  });

  it('drops escalation only at the results beat', () => {
    const escalated = resolveCallout(bufferAll([finalQuestion(8)]), nameOf, null);
    expect(escalated.escalated).toBe(true);
    expect(resetCallouts()).toEqual(initialCalloutState);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/callouts.test.ts`
Expected: FAIL — `Cannot find module '@/lib/staging/callouts'`.

- [ ] **Step 3: Write the implementation**

Create `lib/staging/callouts.ts`:

```ts
/**
 * Broadcast callouts (spec §5) — pure accumulator, threaded by
 * lib/staging/runtime.ts exactly as lib/world/runtime.ts threads
 * ChoreographerState.
 *
 * Drama cues arrive at the REVEAL transition (ADR-0009) but the world does
 * not react until TRACK, so they are BUFFERED here and resolved on
 * `phase-track`. A callout that fires on cue arrival fires one beat before
 * the stadium it is describing.
 *
 * The queue is deliberately duplicated rather than shared with the
 * choreographer (spec decision 6): both resolve the same cues with the same
 * `resolveTier`, so they cannot disagree, and the readable surface never
 * depends on renderer state (PRD §9).
 */
import { resolveTier, type CelebrationTier } from '@/lib/presentation/celebration';
import type { Cue } from '@/lib/presentation/cues';

export type CalloutKind = 'overtake' | 'lead-changed' | 'streak-tier' | 'final-question';

export interface Callout {
  kind: CalloutKind;
  tier: CelebrationTier;
  /** The broadcast line, already formatted. */
  headline: string;
  playerId: string | null;
}

/** Below-headline drama, subdued into the rail rather than dropped (ADR-0010). */
export interface RailDelta {
  playerId: string;
  placesGained: number;
}

export interface CalloutState {
  pending: Cue[];
  callout: Callout | null;
  deltas: RailDelta[];
  /** True from the final-question run-up until the results beat. */
  escalated: boolean;
}

export const initialCalloutState: CalloutState = {
  pending: [],
  callout: null,
  deltas: [],
  escalated: false,
};

const CALLABLE = new Set<Cue['type']>([
  'overtake', 'lead-changed', 'streak-tier', 'final-question',
]);

/**
 * `player-advanced` is deliberately absent: every correct answer produces one,
 * and a banner for a routine advance is exactly the noise the celebration
 * hierarchy exists to prevent (PRD §8).
 */
export function bufferCallout(state: CalloutState, cue: Cue): CalloutState {
  if (!CALLABLE.has(cue.type)) return state;
  return { ...state, pending: [...state.pending, cue] };
}

export function resolveCallout(
  state: CalloutState,
  nameOf: (playerId: string) => string,
  localPlayerId: string | null,
): CalloutState {
  if (state.pending.length === 0) {
    return { ...state, pending: [], callout: null, deltas: [] };
  }

  const headline = resolveTier(state.pending);
  const contenders = state.pending.filter(c => c.tier === headline);

  // One headline per beat (ADR-0010). Ties break toward the local player,
  // following ADR-0008's precedent for overflow.
  const chosen =
    contenders.find(c => 'playerId' in c && c.playerId === localPlayerId) ?? contenders[0];

  const deltas: RailDelta[] = state.pending
    .filter((c): c is Extract<Cue, { type: 'overtake' }> => c.type === 'overtake')
    .map(c => ({ playerId: c.playerId, placesGained: c.passed.length }));

  const escalated = state.escalated || state.pending.some(c => c.type === 'final-question');

  return { ...state, pending: [], callout: toCallout(chosen, nameOf), deltas, escalated };
}

/** The banner and its marks are one beat's worth; escalation outlives them. */
export function clearCallout(state: CalloutState): CalloutState {
  return { ...state, pending: [], callout: null, deltas: [] };
}

/** Everything goes, escalation included. The results beat is a new act. */
export function resetCallouts(): CalloutState {
  return initialCalloutState;
}

function toCallout(cue: Cue, nameOf: (playerId: string) => string): Callout | null {
  switch (cue.type) {
    case 'overtake':
      return {
        kind: 'overtake',
        tier: cue.tier,
        playerId: cue.playerId,
        headline:
          cue.passed.length === 1
            ? `${nameOf(cue.playerId)} passes ${nameOf(cue.passed[0])}`
            : `${nameOf(cue.playerId)} passes ${cue.passed.length} racers`,
      };

    case 'lead-changed':
      return {
        kind: 'lead-changed',
        tier: cue.tier,
        playerId: cue.playerId,
        headline: `${nameOf(cue.playerId)} takes the lead`,
      };

    case 'streak-tier':
      return {
        kind: 'streak-tier',
        tier: cue.tier,
        playerId: cue.playerId,
        headline: `${nameOf(cue.playerId)} is on fire — ${cue.streak} in a row`,
      };

    case 'final-question':
      return { kind: 'final-question', tier: cue.tier, playerId: null, headline: 'FINAL QUESTION' };

    default:
      return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/callouts.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Verify with eslint and commit**

```bash
npx eslint lib/staging/callouts.ts tests/callouts.test.ts
git add lib/staging/callouts.ts tests/callouts.test.ts
git commit -m "feat(p3b): buffer drama at reveal and resolve one headline at track"
```

---

### Task 4: The state layer — reveal steps, `optionsMode`, and the store slices

`beats.ts` learns the REVEAL sub-stagger, `StageSteps` swaps `optionsLive` for `optionsMode`, and `useStaging` gains the three merged slices the surface reads.

**Files:**
- Modify: `lib/staging/beats.ts`
- Modify: `lib/staging/staging.ts`
- Modify: `lib/staging/useStaging.ts`
- Modify: `lib/staging/runtime.ts`
- Modify: `components/GameView.tsx:73` (the `live` prop becomes `mode`), `components/AnswerButtons.tsx:26` (same)
- Test: `tests/beats.test.ts`, `tests/staging.test.ts`

**Interfaces:**
- Consumes: `initialCalloutState`, `bufferCallout`, `resolveCallout`, `clearCallout`, `resetCallouts`, `Callout`, `RailDelta` (Task 3).
- Produces: `OptionsMode = 'dim' | 'live' | 'result'`; `StageSteps { badges, question, options, optionsMode }`; `RevealSteps { rows, stacks, fastest, fact }`; `revealStepsAt(elapsedMs)`; `REVEAL_STACKS_AT`, `REVEAL_FASTEST_AT`, `REVEAL_FACT_AT`, `REVEAL_AVATAR_STAGGER`; `StagingState.reveal: RevealSteps`; store slices `callout`, `deltas`, `escalated` with actions `setCallout(callout, deltas)` and `setEscalated(escalated)`. Tasks 7 and 8 render all of it.

- [ ] **Step 1: Write the failing tests**

Append to `tests/beats.test.ts`:

```ts
describe('stepsAt — options mode', () => {
  it('shows the options dimmed and not live during READ', () => {
    const steps = stepsAt('read', READ_OPTIONS_AT);
    expect(steps.options).toBe(true);
    expect(steps.optionsMode).toBe('dim');
  });

  it('takes them live at ANSWER', () => {
    expect(stepsAt('answer', 0).optionsMode).toBe('live');
  });

  it('keeps them mounted as result rows at REVEAL, so they transform in place', () => {
    const steps = stepsAt('reveal', 0);
    expect(steps.options).toBe(true);
    expect(steps.optionsMode).toBe('result');
    expect(steps.question).toBe(true);
  });
});

describe('revealStepsAt', () => {
  it('opens with the rows alone', () => {
    expect(revealStepsAt(0)).toEqual({ rows: true, stacks: false, fastest: false, fact: false });
  });

  it('lands each element on its boundary, not before it', () => {
    expect(revealStepsAt(REVEAL_STACKS_AT - 1).stacks).toBe(false);
    expect(revealStepsAt(REVEAL_STACKS_AT).stacks).toBe(true);
    expect(revealStepsAt(REVEAL_FASTEST_AT - 1).fastest).toBe(false);
    expect(revealStepsAt(REVEAL_FASTEST_AT).fastest).toBe(true);
    expect(revealStepsAt(REVEAL_FACT_AT - 1).fact).toBe(false);
    expect(revealStepsAt(REVEAL_FACT_AT).fact).toBe(true);
  });

  it('is fully open for a late join or a reload, with nothing left to replay', () => {
    expect(revealStepsAt(NOMINAL_MS.reveal)).toEqual({
      rows: true, stacks: true, fastest: true, fact: true,
    });
  });

  it('is ordered so the fun fact never precedes the stacks', () => {
    expect(REVEAL_STACKS_AT).toBeLessThan(REVEAL_FASTEST_AT);
    expect(REVEAL_FASTEST_AT).toBeLessThan(REVEAL_FACT_AT);
    expect(REVEAL_FACT_AT).toBeLessThan(NOMINAL_MS.reveal);
  });
});
```

Extend the import at the top of `tests/beats.test.ts` with `revealStepsAt`, `REVEAL_STACKS_AT`, `REVEAL_FASTEST_AT`, `REVEAL_FACT_AT`.

Append to `tests/staging.test.ts`:

```ts
describe('stagingAt — the reveal beat', () => {
  it('derives reveal sub-steps from the deadline, so a reload does not replay', () => {
    const midway = stagingAt({
      phase: 'reveal', round: 2, remainingMs: 3000, timerSeconds: 20,
      myAnswer: 1, isPlaying: true,
    });
    // 5000 nominal - 3000 remaining = 2000 elapsed: everything has landed.
    expect(midway.reveal).toEqual({ rows: true, stacks: true, fastest: true, fact: true });
    expect(midway.steps.optionsMode).toBe('result');
  });

  it('opens the reveal with the rows alone at the top of the beat', () => {
    const fresh = stagingAt({
      phase: 'reveal', round: 2, remainingMs: 5000, timerSeconds: 20,
      myAnswer: 1, isPlaying: true,
    });
    expect(fresh.reveal.rows).toBe(true);
    expect(fresh.reveal.stacks).toBe(false);
  });

  it('closes the reveal steps on every other beat', () => {
    const answering = stagingAt({
      phase: 'answer', round: 2, remainingMs: 8000, timerSeconds: 20,
      myAnswer: null, isPlaying: true,
    });
    expect(answering.reveal).toEqual({ rows: false, stacks: false, fastest: false, fact: false });
  });

  it('treats a change of reveal step as a change worth publishing', () => {
    const a = stagingAt({ phase: 'reveal', round: 1, remainingMs: 5000, timerSeconds: 20, myAnswer: 0, isPlaying: true });
    const b = stagingAt({ phase: 'reveal', round: 1, remainingMs: 4500, timerSeconds: 20, myAnswer: 0, isPlaying: true });
    expect(sameStaging(a, b)).toBe(false);
  });
});
```

Ensure `sameStaging` is in `tests/staging.test.ts`'s import list.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/beats.test.ts tests/staging.test.ts`
Expected: FAIL — `revealStepsAt` is not exported, and `optionsMode` does not exist on `StageSteps`.

- [ ] **Step 3: Extend `beats.ts`**

In `lib/staging/beats.ts`, replace the `StageSteps` interface, the `NOTHING` constant and `stepsAt`, and append the reveal timings:

```ts
/** How the options are being presented. Live only ever means ANSWER. */
export type OptionsMode = 'dim' | 'live' | 'result';

/** Which staged elements are on screen. Derived purely from beat + elapsed. */
export interface StageSteps {
  badges: boolean;
  question: boolean;
  options: boolean;
  optionsMode: OptionsMode;
}

const NOTHING: StageSteps = {
  badges: false, question: false, options: false, optionsMode: 'dim',
};

export function stepsAt(beat: Beat, elapsedMs: number): StageSteps {
  switch (beat) {
    case 'read':
      return {
        badges: elapsedMs >= READ_BADGES_AT,
        question: elapsedMs >= READ_QUESTION_AT,
        options: elapsedMs >= READ_OPTIONS_AT,
        optionsMode: 'dim',
      };
    case 'answer':
      return { badges: true, question: true, options: true, optionsMode: 'live' };
    case 'reveal':
      // The options do NOT retire: they transform in place into result rows
      // (spec decision 3), which is what keeps the morph continuous.
      return { badges: true, question: true, options: true, optionsMode: 'result' };
    default:
      return NOTHING;
  }
}

/* ── REVEAL stagger (spec §5), in the P0 token durations ─────────────────── */

export const REVEAL_ROWS_AT = 0;
export const REVEAL_STACKS_AT = 300;
export const REVEAL_FASTEST_AT = 900;
export const REVEAL_FACT_AT = 1400;
/** Per-avatar delay handed to `motion`'s staggerChildren. */
export const REVEAL_AVATAR_STAGGER = 60;

/** Which parts of the reveal have landed. Same ends_at derivation as READ. */
export interface RevealSteps {
  rows: boolean;
  stacks: boolean;
  fastest: boolean;
  fact: boolean;
}

export const NO_REVEAL: RevealSteps = {
  rows: false, stacks: false, fastest: false, fact: false,
};

export function revealStepsAt(elapsedMs: number): RevealSteps {
  return {
    rows: elapsedMs >= REVEAL_ROWS_AT,
    stacks: elapsedMs >= REVEAL_STACKS_AT,
    fastest: elapsedMs >= REVEAL_FASTEST_AT,
    fact: elapsedMs >= REVEAL_FACT_AT,
  };
}
```

- [ ] **Step 4: Extend the projection in `staging.ts`**

In `lib/staging/staging.ts`: extend the import from `./beats` with `NO_REVEAL`, `revealStepsAt`, and `type RevealSteps`; add the field to `StagingState` and `initialStagingState`; and set it in `stagingAt` and compare it in `sameStaging`:

```ts
// in StagingState
  /** Which parts of the REVEAL beat have landed. Closed on every other beat. */
  reveal: RevealSteps;

// in initialStagingState
  reveal: NO_REVEAL,

// in stagingAt's returned object
    reveal: beat === 'reveal' ? revealStepsAt(elapsed) : NO_REVEAL,

// in sameStaging, alongside the existing steps comparisons
    a.steps.optionsMode === b.steps.optionsMode &&
    a.reveal.rows === b.reveal.rows &&
    a.reveal.stacks === b.reveal.stacks &&
    a.reveal.fastest === b.reveal.fastest &&
    a.reveal.fact === b.reveal.fact &&
```

Delete the now-stale `a.steps.optionsLive === b.steps.optionsLive` line.

- [ ] **Step 5: Add the three merged slices to the store**

In `lib/staging/useStaging.ts`, extend `StagingStore` and the `create` body:

```ts
import type { Callout, RailDelta } from './callouts';

export interface StagingStore extends StagingState {
  announcement: string | null;
  /** The beat's single headline (ADR-0010), or null. */
  callout: Callout | null;
  /** Below-headline drama, subdued into the rail. */
  deltas: RailDelta[];
  /** True from the final-question run-up until the results beat. */
  escalated: boolean;
  publish(next: StagingState): void;
  announce(text: string): void;
  setCallout(callout: Callout | null, deltas: RailDelta[]): void;
  setEscalated(escalated: boolean): void;
}
```

```ts
  // alongside `announcement: null`
  callout: null,
  deltas: [],
  escalated: false,

  // alongside `announce`
  setCallout(callout, deltas) {
    set({ callout, deltas });
  },
  setEscalated(escalated) {
    set({ escalated });
  },
```

These are merged slices, never part of the `StagingState` projection: `publish` calls `set(next)` with a `StagingState`, and Zustand's shallow merge leaves them untouched — the same mechanism `announcement` already relies on. Keeping them out of the projection is what preserves its memorylessness, which is what makes a reload correct with no special case (ADR-0014).

- [ ] **Step 6: Thread the accumulator in `runtime.ts`**

In `lib/staging/runtime.ts`, add the imports and, immediately after the existing `answer-locked` subscription, the callout wiring:

```ts
import {
  bufferCallout, clearCallout, initialCalloutState, resetCallouts, resolveCallout,
  type CalloutState,
} from './callouts';
```

```ts
  const { publish, announce, setCallout, setEscalated } = useStaging.getState();
```

```ts
  // ── Callouts: buffered at REVEAL, resolved at TRACK (ADR-0009) ───────────
  let callouts: CalloutState = initialCalloutState;

  const nameOf = (playerId: string): string => {
    const { players, standings } = useGameStore.getState();
    return (
      players.find(p => p.id === playerId)?.nickname ??
      standings?.find(s => s.player_id === playerId)?.nickname ??
      'A racer'
    );
  };

  const publishCallouts = () => {
    setCallout(callouts.callout, callouts.deltas);
    setEscalated(callouts.escalated);
  };

  const buffer = (cue: Parameters<typeof bufferCallout>[1]) => {
    callouts = bufferCallout(callouts, cue);
  };

  const unsubscribes = [
    on('overtake', buffer),
    on('lead-changed', buffer),
    on('streak-tier', buffer),
    on('final-question', buffer),
    on('phase-track', () => {
      callouts = resolveCallout(callouts, nameOf, loadSession(code)?.playerId ?? null);
      publishCallouts();
    }),
    on('phase-read', () => {
      callouts = clearCallout(callouts);
      publishCallouts();
    }),
    on('phase-results', () => {
      callouts = resetCallouts();
      publishCallouts();
    }),
  ];
```

Extend the returned teardown to unsubscribe them:

```ts
  return () => {
    cancelAnimationFrame(frame);
    unsubscribe();
    unsubscribeStore();
    for (const off of unsubscribes) off();
    setVar(TENSION_VAR, 0);
    setVar(TIMER_VAR, 0);
  };
```

**Ordering matters and Task 5 depends on it:** `final-question` must be dispatched *before* `phase-track` in the same cue batch, or the run-up card is resolved before it is buffered. Task 5 emits them in that order and asserts it.

- [ ] **Step 7: Update the two `optionsLive` call sites so the tree compiles**

`components/AnswerButtons.tsx` — change the prop:

```ts
export default function AnswerButtons({
  options, mode, lockedChoice, spectating, onChoose,
}: {
  options: string[];
  /** 'live' only during ANSWER: the server phase is the sole authority. */
  mode: OptionsMode;
  lockedChoice: number | null;
  spectating: boolean;
  onChoose: (i: number) => void;
}) {
  const live = mode === 'live';
  const disabled = !live || lockedChoice !== null || spectating;
```

Import the type: `import { READ_OPTION_STAGGER, type OptionsMode } from '@/lib/staging/beats';`. Everything below the `disabled` line keeps working unchanged — Task 7 adds the result rendering.

`components/GameView.tsx` — pass it through:

```tsx
          <AnswerButtons
            key="answer-buttons"
            options={question.options}
            mode={steps.optionsMode}
            lockedChoice={lockedChoice}
            spectating={spectating}
            onChoose={choose}
          />
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/beats.test.ts tests/staging.test.ts && npx tsc --noEmit`
Expected: PASS and clean. Then `npm test` — all green (existing `optionsLive` assertions in `tests/beats.test.ts` / `tests/staging.test.ts` must be updated to `optionsMode` if any remain).

- [ ] **Step 9: Commit**

```bash
git add lib/staging components/AnswerButtons.tsx components/GameView.tsx tests/beats.test.ts tests/staging.test.ts
git commit -m "feat(p3b): add reveal steps, options modes, and the callout slices"
```

---

### Task 5: The escalation moves to the run-up beat

`final-question` fires at the TRACK preceding the final round, so the final READ opens already hot and keeps every millisecond of its 2.1s reading time (spec decision 7).

**Files:**
- Create: `lib/presentation/timing.ts`
- Modify: `lib/presentation/deriveCues.ts`
- Modify: `lib/world/choreographer.ts` (import `ARENA_AT_MS` rather than defining it), `lib/world/director.ts` (`OVERTAKE_HOLD_MS` becomes a re-export)
- Test: `tests/deriveCues.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ARENA_AT_MS = 1400` and `DRAMA_HOLD_MS = 1200` from `lib/presentation/timing.ts`. Task 8 times the lower third with both.

- [ ] **Step 1: Write the failing test**

Append to `tests/deriveCues.test.ts`:

```ts
describe('final-question fires on the run-up beat', () => {
  const finalOf = (cues: Cue[]) => cues.filter(c => c.type === 'final-question');

  it('announces the final question when the PENULTIMATE track begins', () => {
    const cues = run([
      source({ phase: 'reveal', round: 2 }),
      source({ phase: 'track', round: 2 }),
    ]);
    expect(finalOf(cues)).toHaveLength(1);
    expect(finalOf(cues)[0]).toMatchObject({ tier: 'finalQuestion', round: 3 });
  });

  it('emits it BEFORE phase-track, so a listener that resolves on the track beat sees it', () => {
    const cues = run([
      source({ phase: 'reveal', round: 2 }),
      source({ phase: 'track', round: 2 }),
    ]);
    const types = cues.map(c => c.type);
    expect(types.indexOf('final-question')).toBeLessThan(types.indexOf('phase-track'));
  });

  it('no longer fires at the final READ, so it cannot double-announce', () => {
    const cues = run([
      source({ phase: 'track', round: 2 }),
      source({ phase: 'read', round: 3 }),
    ]);
    expect(finalOf(cues.filter((_, i) => i > 0))).toHaveLength(0);
  });

  it('fires exactly once across a whole game', () => {
    const cues = run([
      source({ phase: 'reveal', round: 2 }),
      source({ phase: 'track', round: 2 }),
      source({ phase: 'read', round: 3 }),
      source({ phase: 'answer', round: 3 }),
      source({ phase: 'reveal', round: 3 }),
      source({ phase: 'track', round: 3 }),
    ]);
    expect(finalOf(cues)).toHaveLength(1);
  });

  it('falls back to the countdown when the game is a single round', () => {
    const one = (phase: Phase, round: number) => ({
      ...source({ phase, round }),
      room: { phase, round, total_rounds: 1, ends_at: null },
    });
    const cues = run([one('lobby', 0), one('countdown', 1)]);
    expect(finalOf(cues)).toHaveLength(1);
  });

  it('seeds escalation for a client that reloads inside the final round', () => {
    const { cues } = deriveCues(
      source({ phase: 'answer', round: 3 }),
      source({ phase: 'answer', round: 3 }),
      initialDerivationState, // unseeded: this is a fresh client
    );
    expect(cues.filter(c => c.type === 'final-question')).toHaveLength(1);
  });
});
```

`run()` and `source()` already exist in this file; `Phase` is already imported.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/deriveCues.test.ts`
Expected: FAIL — `final-question` still arrives with the final `phase-read`.

- [ ] **Step 3: Move the emission in `deriveCues.ts`**

Replace the `read` and `track` cases inside `phaseCues`, and the `countdown` case, with:

```ts
    case 'countdown': {
      const cues: Cue[] = [];
      // A one-round game has no preceding TRACK to escalate on.
      if (room.total_rounds === 1 && room.round === 1) {
        cues.push({ type: 'final-question', tier: 'finalQuestion', round: room.round });
      }
      cues.push({ type: 'phase-countdown', tier: 'routine', endsAt: room.ends_at });
      return cues;
    }

    case 'read':
      // `final-question` no longer rides with the final READ: it fires one beat
      // earlier, on the run-up (spec decision 7), so the final question's own
      // announcement never spends its reading time.
      return [
        {
          type: 'phase-read',
          tier: 'routine',
          round: room.round,
          category: next.question?.category ?? null,
          questionTier: next.question?.tier ?? null,
          isFinal,
        },
      ];

    case 'track': {
      const cues: Cue[] = [];
      // The run-up: entering the PENULTIMATE round's track beat. Emitted
      // BEFORE phase-track, because lib/staging/runtime.ts resolves the beat's
      // headline on phase-track and must already hold this cue.
      if (room.total_rounds > 1 && room.round === room.total_rounds - 1) {
        cues.push({ type: 'final-question', tier: 'finalQuestion', round: room.round + 1 });
      }
      cues.push({ type: 'phase-track', tier: 'routine', round: room.round });
      return cues;
    }
```

Then extend the seed branch of `deriveCues` so a reload inside the final round still escalates. Replace the unseeded return's `cues` value:

```ts
  if (!state.seeded) {
    const seedCues = phaseCues(room, next);
    // A client that reloads or joins mid-final-round never saw the run-up, so
    // the escalation has to be seeded here or the world never goes neon.
    const inFinalRound =
      room.total_rounds > 0 &&
      room.round === room.total_rounds &&
      room.phase !== 'lobby' &&
      room.phase !== 'results';
    const alreadyAnnounced = seedCues.some(c => c.type === 'final-question');
    if (inFinalRound && !alreadyAnnounced) {
      seedCues.unshift({ type: 'final-question', tier: 'finalQuestion', round: room.round });
    }

    return {
      cues: seedCues,
      nextState: {
        seeded: true,
        phase: room.phase,
        round: room.round,
        playerIds: next.players.map(p => p.id),
        order: (next.standings ?? []).map(s => s.player_id),
        correct: correctMap(next.standings),
        streaks: {},
      },
    };
  }
```

`isFinal` stays on `PhaseReadCue` and is still consumed by `director.ts`'s `phase-read` case, which preserves escalation when it is true — that is what carries the dimmed lights from the run-up into the final READ.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/deriveCues.test.ts tests/director.test.ts`
Expected: PASS. If a director test asserted `final-question` arriving with the final read, update it to fire the cue on its own — the director's behavior is unchanged, only the emitter's timing moved.

- [ ] **Step 5: Extract the shared beat clock**

Create `lib/presentation/timing.ts`:

```ts
/**
 * The beat clock both domains read (spec §4 seams).
 *
 * Deliberately NOT in lib/presentation/tokens.ts: that file's contract is
 * "hand-mirror of the @theme block in app/globals.css", enforced by
 * tests/tokens.test.ts. These are choreography constants with no CSS
 * counterpart.
 *
 * The world's arena reaction and the DOM's lower third must land on the same
 * frame — announcing one thing while the stadium reacts to another is the
 * failure mode ADR-0010 exists to prevent — so neither domain owns the number.
 */

/** When a beat's reaction lands, measured from sequence start. */
export const ARENA_AT_MS = 1400;

/** How long a beat's drama holds: the camera transient and the callout alike. */
export const DRAMA_HOLD_MS = 1200;
```

In `lib/world/choreographer.ts`, delete the local `ARENA_AT_MS` definition and import it instead, keeping the existing re-export so P2's importers and tests are untouched:

```ts
import { ARENA_AT_MS } from '@/lib/presentation/timing';
export { ARENA_AT_MS };
```

In `lib/world/director.ts`, replace the `OVERTAKE_HOLD_MS` definition:

```ts
import { DRAMA_HOLD_MS } from '@/lib/presentation/timing';

/** The camera transient and the DOM callout expire together, by construction. */
export const OVERTAKE_HOLD_MS = DRAMA_HOLD_MS;
```

- [ ] **Step 6: Run the full suite**

Run: `npm test && npx tsc --noEmit`
Expected: all green, no new failures in `tests/choreographer.test.ts` or `tests/camera.test.ts` — the values did not change, only where they live.

- [ ] **Step 7: Commit**

```bash
git add lib/presentation/timing.ts lib/presentation/deriveCues.ts lib/world/choreographer.ts lib/world/director.ts tests/deriveCues.test.ts
git commit -m "feat(p3b): escalate on the run-up beat and share the beat clock"
```

---

### Task 6: The streak flame survives a reload (P2 debt)

`current_streak` is on the wire now, so `flairFor` derives the tier from standings like every other piece of flair and the accumulator inside `ChoreographerState` retires (spec §7.1).

**Files:**
- Modify: `lib/world/flair.ts`
- Modify: `lib/world/choreographer.ts:86-96,175,212-227,241,312`
- Modify: `tests/choreographer.test.ts:277`
- Test: `tests/flair.test.ts`

**Interfaces:**
- Consumes: `Standing.current_streak` (Task 1).
- Produces: `StreakTier` now originates in `lib/world/flair.ts` (re-exported from `choreographer.ts` for existing importers); `Flair` gains `streakTier: StreakTier`; `FlairStanding` gains `current_streak: number`; `streakTierFor(currentStreak)`.

- [ ] **Step 1: Write the failing test**

Append to `tests/flair.test.ts`:

```ts
describe('streak tier', () => {
  it('maps a run to its VFX tier at the published milestones', () => {
    expect(streakTierFor(0)).toBe(0);
    expect(streakTierFor(2)).toBe(0);
    expect(streakTierFor(3)).toBe(3);
    expect(streakTierFor(4)).toBe(3);
    expect(streakTierFor(5)).toBe(5);
    expect(streakTierFor(7)).toBe(5);
    expect(streakTierFor(8)).toBe(8);
    expect(streakTierFor(12)).toBe(8);
  });

  it('derives the tier from standings, so it survives a reload with no cue history', () => {
    const standings: FlairStanding[] = [
      { player_id: 'a', correct: 6, speed_points: 10, current_streak: 5 },
      { player_id: 'b', correct: 3, speed_points: 5, current_streak: 0 },
    ];
    const flair = flairFor(standings, markerAnchors(standings, metrics));
    expect(flair.get('a')!.streakTier).toBe(5);
    expect(flair.get('b')!.streakTier).toBe(0);
  });

  it('awards no streak flame before anyone has advanced', () => {
    const standings: FlairStanding[] = [
      { player_id: 'a', correct: 0, speed_points: 0, current_streak: 0 },
      { player_id: 'b', correct: 0, speed_points: 0, current_streak: 0 },
    ];
    const flair = flairFor(standings, markerAnchors(standings, metrics));
    expect(flair.get('a')!.streakTier).toBe(0);
  });
});
```

Extend this file's existing imports with `streakTierFor`, and add `current_streak` to every `FlairStanding` literal already in the file (TypeScript will point at each one).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/flair.test.ts`
Expected: FAIL — `streakTierFor` is not exported and `Flair` has no `streakTier`.

- [ ] **Step 3: Move the tier into `flair.ts`**

In `lib/world/flair.ts`:

```ts
/**
 * Consecutive-hit VFX tier: 3 spark trail, 5 flames, 8 inferno (PRD §8).
 * Defined here rather than in the choreographer because it is derived from
 * standings, which is what makes it survive a reload (ADR-0013).
 */
export type StreakTier = 0 | 3 | 5 | 8;

export function streakTierFor(currentStreak: number): StreakTier {
  if (currentStreak >= 8) return 8;
  if (currentStreak >= 5) return 5;
  if (currentStreak >= 3) return 3;
  return 0;
}

export interface FlairStanding {
  player_id: string;
  correct: number;
  speed_points: number;
  /** The CURRENT run, not the best one — `Standing.current_streak`. */
  current_streak: number;
}

export interface Flair {
  medal: 'gold' | 'silver' | 'bronze' | null;
  emphasis: number;
  edgeHolder: boolean;
  streakTier: StreakTier;
}

const NO_FLAIR: Flair = { medal: null, emphasis: 1, edgeHolder: false, streakTier: 0 };
```

And in the `standings.forEach` body, add the field:

```ts
    flair.set(s.player_id, {
      medal: index < MEDALS.length ? MEDALS[index] : null,
      emphasis: index === 0 ? LEADER_EMPHASIS : 1,
      edgeHolder: contested && anchor!.row === 0,
      streakTier: streakTierFor(s.current_streak),
    });
```

- [ ] **Step 4: Retire the accumulator in `choreographer.ts`**

Five edits:

1. Replace the local `StreakTier` definition with a re-export from flair (which the file already imports from):

```ts
import { LEADER_EMPHASIS, type Flair, type StreakTier } from './flair';
export type { StreakTier };
```

2. Delete the `streakTier` field from `ChoreographerState` (line ~87) and from `initialChoreographerState` (line ~96).

3. In `beginSequence`, delete `const streakTier: Record<string, StreakTier> = { ...state.streakTier };` (line ~175) and the `streakTier,` key in the returned object (line ~241).

4. In the cue loop, drop the bookkeeping but keep the transient effects — the ignition and the arena reaction are the *moment* of the milestone and still belong to the cue:

```ts
      case 'streak-tier':
        ignitions.push({
          playerId: cue.playerId,
          atMs: (delayOf.get(cue.playerId) ?? 0) + ANTICIPATE_MS + TRAVEL_MS,
          tier: cue.streak,
        });
        // The arena reaction belongs to streak-8 alone, and only when it is
        // the beat's headline (spec §4, §6) — otherwise the inferno still
        // ignites on the avatar but the world doesn't react.
        if (cue.streak === 8 && cue.tier === headline) arenaPlayerId ??= cue.playerId;
        break;

      case 'streak-broken':
        // Nothing to unwind: the flame is standings-derived now, so it goes
        // out on its own the moment `current_streak` returns to zero.
        break;
```

5. In `avatarStates`, take the tier from flair instead of from state (line ~312):

```ts
    const streak = cappedStreak(own.streakTier, allowance.maxStreakTier);
```

The `own` fallback literal a few lines above must gain the field too:

```ts
    const own = flair.get(anchor.playerId) ?? {
      medal: null, emphasis: 1, edgeHolder: false, streakTier: 0 as StreakTier,
    };
```

- [ ] **Step 5: Fix the choreographer test that asserted the retired field**

`tests/choreographer.test.ts:277` asserts `held.streakTier` equals `seeded.streakTier`. Delete that line — the property no longer exists, and the behaviour it guarded (persistent flair surviving a hold) is now covered by `tests/flair.test.ts`'s reload case. Add `current_streak` to the `FlairStanding` literals in this file and in `tests/decals.test.ts` where TypeScript flags them.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add lib/world/flair.ts lib/world/choreographer.ts tests/flair.test.ts tests/choreographer.test.ts tests/decals.test.ts
git commit -m "fix(p3b): derive the streak flame from standings so it survives a reload"
```

---

### Task 7: The REVEAL surface — result rows, avatar stacks, the stamp and the fact

The options grid transforms in place (spec decision 3). Nothing unmounts, so the morph is continuous.

**Files:**
- Create: `components/AvatarStack.tsx`
- Modify: `components/AnswerButtons.tsx`
- Modify: `components/RevealPanel.tsx`
- Modify: `components/GameView.tsx`

**Interfaces:**
- Consumes: `distributionRows`, `DistributionRow`, `StackAvatar` (Task 2); `RevealSteps`, `OptionsMode`, `REVEAL_AVATAR_STAGGER` (Task 4); `avatarEmoji` (`lib/avatars.ts`).
- Produces: `AnswerButtons` accepts `rows?: DistributionRow[]` and `revealSteps?: RevealSteps`; `RevealPanel` accepts `{ reveal, question, steps }`.

- [ ] **Step 1: Write the avatar stack**

Create `components/AvatarStack.tsx`:

```tsx
'use client';
import { motion } from 'motion/react';
import { avatarEmoji } from '@/lib/avatars';
import { REVEAL_AVATAR_STAGGER } from '@/lib/staging/beats';
import { EASE } from '@/lib/presentation/tokens';
import type { StackAvatar } from '@/lib/staging/distribution';

/**
 * The face pile under a distribution row (spec §5).
 *
 * Overlapping by design: six faces occupy ~80px, which is what lets one cap
 * serve every width. The local player's face carries a ring, the same "you are
 * here" language the track readout uses.
 */
export default function AvatarStack({
  avatars, overflow, show,
}: {
  avatars: StackAvatar[];
  overflow: number;
  /** False until the reveal's stack step has landed. */
  show: boolean;
}) {
  if (!show || avatars.length === 0) return null;

  return (
    <motion.span
      className="flex shrink-0 items-center pl-2"
      initial="hidden"
      animate="shown"
      variants={{ shown: { transition: { staggerChildren: REVEAL_AVATAR_STAGGER / 1000 } } }}
    >
      {avatars.map(a => (
        <motion.span
          key={a.playerId}
          title={a.nickname}
          variants={{
            hidden: { opacity: 0, scale: 0.6 },
            shown: { opacity: 1, scale: 1, transition: { duration: 0.26, ease: EASE.settle } },
          }}
          className="-ml-2 grid h-6 w-6 place-items-center rounded-full text-[13px] first:ml-0"
          style={{
            backgroundColor: `${a.color}33`,
            boxShadow: a.isLocal
              ? `inset 0 0 0 2px ${a.color}, 0 0 0 2px var(--color-ink)`
              : `inset 0 0 0 2px ${a.color}`,
          }}
        >
          {avatarEmoji(a.avatar)}
        </motion.span>
      ))}
      {overflow > 0 && (
        <span className="ml-1 text-xs font-bold tabular-nums text-ink-mute">+{overflow}</span>
      )}
    </motion.span>
  );
}
```

- [ ] **Step 2: Add the result mode to `AnswerButtons`**

Two changes inside `components/AnswerButtons.tsx`.

Extend the props (keeping the `mode` prop from Task 4):

```tsx
  rows,
  revealSteps,
}: {
  // …existing props…
  /** Present only in 'result' mode. */
  rows?: DistributionRow[];
  revealSteps?: RevealSteps;
```

Then, inside the `options.map` body, compute the result state and feed it into the same `motion.button` — the element identity must not change, or the morph becomes an unmount:

```tsx
        const result = mode === 'result' ? rows?.[i] : undefined;
        const isCorrect = result?.correct ?? false;
        // In result mode the row's own state replaces the lock fade: the
        // correct row is bright, the rest are quiet. No red, no ✗ — tone is
        // carried by treatment (spec decision 2).
        const targetOpacity = result
          ? isCorrect ? 1 : 0.62
          : chosen ? 1 : faded ? 0.45 : live ? 1 : 0.55;
```

Give the button its result background and keep the accent ring on your own pick:

```tsx
            style={{
              borderLeftColor: accent,
              backgroundColor: isCorrect
                ? 'color-mix(in oklab, var(--color-correct) 16%, transparent)'
                : undefined,
              boxShadow: chosen ? `0 0 0 2px ${accent}, 0 0 34px -10px ${accent}` : undefined,
            }}
```

And render the row's tail after the option text, before the existing keyboard-hint span:

```tsx
            {result && (
              <>
                <AvatarStack
                  avatars={result.avatars}
                  overflow={result.overflow}
                  show={revealSteps?.stacks ?? false}
                />
                <span className="shrink-0 tabular-nums text-sm font-bold text-ink-dim">
                  {result.count}
                </span>
                {isCorrect && (
                  <span
                    className="shrink-0 rounded-full bg-correct/20 px-2 py-0.5 text-xs font-bold text-correct"
                  >
                    correct
                  </span>
                )}
              </>
            )}
```

Compress the row once it stops being a touch target (spec §6 — this is what makes the portrait budget fit). In the button's class list, replace the fixed `min-h-14 … p-4` with a mode-dependent pair, leaving every other class untouched:

```tsx
            className={`flex items-center gap-3 rounded-control border border-white/10 border-l-4
              bg-night/60 text-left font-semibold text-ink backdrop-blur-md
              ${result ? 'relative min-h-11 overflow-hidden p-2.5' : 'min-h-14 p-4'}
              transition-[opacity,box-shadow,border-color] duration-(--dur-cut) ease-snap
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-cyan
              disabled:cursor-not-allowed
              ${live && !chosen && !faded ? 'enabled:hover:border-white/25' : ''}`}
```

`min-h-11` is 44px against `min-h-14`'s 56px — below the touch-target floor, which is correct only because the row is `disabled` in result mode.

The share bar goes behind the content as an absolutely-positioned fill. `relative overflow-hidden` is already in the result branch above; insert this as the button's first child:

```tsx
            {result && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 -z-10 transition-[width] duration-(--dur-beat) ease-snap"
                style={{
                  width: `${(revealSteps?.rows ? result.share : 0) * 100}%`,
                  backgroundColor: `color-mix(in oklab, ${isCorrect ? 'var(--color-correct)' : accent} 12%, transparent)`,
                }}
              />
            )}
```

Add the imports: `AvatarStack`, and `type DistributionRow` / `type RevealSteps`.

The buttons must be `disabled` throughout the reveal: `mode === 'result'` is not `'live'`, so the existing `disabled` expression already covers it. Do not change it — staging never gates input, and the server phase remains the sole authority (ADR-0016).

- [ ] **Step 3: Thin `RevealPanel` down to the stamp and the fact**

Replace `components/RevealPanel.tsx` entirely:

```tsx
'use client';
import { AnimatePresence, motion } from 'motion/react';
import type { QuestionPublic, RevealPayload } from '@/lib/types';
import type { RevealSteps } from '@/lib/staging/beats';
import { EASE } from '@/lib/presentation/tokens';

/**
 * The reveal's caption (spec §5).
 *
 * The distribution itself is the options grid, transformed in place
 * (decision 3) — this carries only what the rows cannot: the textual
 * confirmation, the fastest stamp, and the fun fact. Timings come from
 * `steps`, which is derived from the server deadline, so a reload lands with
 * everything present and nothing replays (ADR-0014).
 */
export default function RevealPanel({
  reveal, question, steps,
}: {
  reveal: RevealPayload;
  question: QuestionPublic;
  steps: RevealSteps;
}) {
  return (
    <div className="space-y-3">
      <p className="text-center text-xs font-bold uppercase tracking-[0.14em] text-correct">
        Correct answer
        <span className="ml-2 normal-case tracking-normal text-ink">
          {question.options[reveal.correct_index]}
        </span>
      </p>

      <AnimatePresence initial={false}>
        {steps.fastest && reveal.fastest && (
          <motion.p
            key="fastest"
            initial={{ opacity: 0, scale: 1.18 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.34, ease: EASE.settle } }}
            exit={{ opacity: 0 }}
            className="text-center text-sm font-black uppercase tracking-widest text-warning"
          >
            Fastest ⚡ {reveal.fastest.nickname}
          </motion.p>
        )}

        {steps.fact && reveal.fun_fact && (
          <motion.p
            key="fact"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.34, ease: EASE.snap } }}
            exit={{ opacity: 0 }}
            className="rounded-control border border-haze/40 bg-abyss/70 p-3 text-center text-sm
              text-ink-dim backdrop-blur-md"
          >
            💡 {reveal.fun_fact}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
```

The literal string `Correct answer` must survive — `e2e/game-flow.spec.ts:72` and `e2e/world.spec.ts:75` both assert it.

- [ ] **Step 4: Wire it up in `GameView`**

Add the imports and derive the rows:

```tsx
import { distributionRows } from '@/lib/staging/distribution';
```

```tsx
  const standings = useGameStore(s => s.standings);
  const revealSteps = useStaging(s => s.reveal);
  const myId = typeof window !== 'undefined' ? loadSession(code)?.playerId ?? null : null;

  const rows =
    reveal && question
      ? distributionRows(question.options, reveal, standings ?? [], myId)
      : undefined;
```

Pass them into the options slot and the new `steps` prop into `RevealPanel`:

```tsx
          <AnswerButtons
            key="answer-buttons"
            options={question.options}
            mode={steps.optionsMode}
            lockedChoice={lockedChoice}
            spectating={spectating}
            onChoose={choose}
            rows={rows}
            revealSteps={revealSteps}
          />
```

```tsx
          {room.phase === 'reveal' && question && reveal && (
            <RevealPanel reveal={reveal} question={question} steps={revealSteps} />
          )}
```

- [ ] **Step 5: Verify live in a headed browser**

Run `npm run dev`, then drive a real two-player game (host + one joiner) with a headed browser. At REVEAL, confirm by reading computed styles — not by eye alone:

- the four buttons are the *same DOM nodes* across the ANSWER → REVEAL transition (grab a handle before the transition and assert it is still connected after)
- the correct row's `backgroundColor` is the correct-green mix; no row is red
- stacks appear at ~300ms and the face count matches the number of players who picked that option
- a reload during REVEAL lands with rows, stacks, stamp and fact **already present** — sample `opacity`/`transform` every 40ms for the first 400ms and confirm no entrance curve runs
- at 390×844 the whole reveal fits without the page scrolling

Run: `npx tsc --noEmit && npm test && npx eslint components/AnswerButtons.tsx components/AvatarStack.tsx components/RevealPanel.tsx components/GameView.tsx`
Expected: clean and green.

- [ ] **Step 6: Commit**

```bash
git add components/AvatarStack.tsx components/AnswerButtons.tsx components/RevealPanel.tsx components/GameView.tsx
git commit -m "feat(p3b): transform the options grid into the reveal distribution"
```

---

### Task 8: The TRACK surface — the rail, the lower third, and escalation

TRACK folds into the shell, the canvas gets the frame, and the escalation lands on the run-up.

**Files:**
- Create: `components/LowerThird.tsx`
- Modify: `components/TrackReadout.tsx`
- Modify: `components/StageShell.tsx`
- Modify: `components/GameView.tsx`
- Modify: `components/QuestionCard.tsx`
- Modify: `components/TensionFrame.tsx`
- Modify: `app/globals.css` (the escalated frame)
- Test: `e2e/staging.spec.ts`

**Interfaces:**
- Consumes: `Callout`, `RailDelta` (Task 3); `useStaging`'s `callout` / `deltas` / `escalated` (Task 4); `ARENA_AT_MS`, `DRAMA_HOLD_MS` (Task 5); `Standing.current_streak` (Task 1).
- Produces: nothing later tasks depend on — this is the last task.

- [ ] **Step 1: Write the lower third**

Create `components/LowerThird.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStaging } from '@/lib/staging/useStaging';
import { ARENA_AT_MS, DRAMA_HOLD_MS } from '@/lib/presentation/timing';
import { EASE } from '@/lib/presentation/tokens';

/**
 * The beat's single headline (spec §5, ADR-0010).
 *
 * It enters at ARENA_AT_MS — the same instant the world's arena reaction lands,
 * because both read the same constant. Announcing one thing while the stadium
 * reacts to another is the failure mode; sharing the constant closes it.
 *
 * The delay is a local timer rather than a derived step because the callout is
 * resolved by a cue, not by the deadline: it exists only for the beat in which
 * it was resolved, and a reload mid-TRACK correctly produces none at all.
 */
export default function LowerThird() {
  const callout = useStaging(s => s.callout);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!callout) {
      setVisible(false);
      return;
    }
    const show = setTimeout(() => setVisible(true), ARENA_AT_MS);
    const hide = setTimeout(() => setVisible(false), ARENA_AT_MS + DRAMA_HOLD_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [callout]);

  const isFinal = callout?.kind === 'final-question';

  return (
    <AnimatePresence>
      {callout && visible && (
        <motion.div
          key={callout.headline}
          data-testid="lower-third"
          data-kind={callout.kind}
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0, transition: { duration: 0.34, ease: EASE.settle } }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          className={`pointer-events-none mx-auto rounded-panel border backdrop-blur-md
            ${isFinal
              ? 'w-full border-warning/60 bg-warning/15 px-6 py-4 text-center'
              : 'border-haze/50 bg-abyss/80 px-5 py-3'}`}
        >
          <p
            className={`font-display font-black uppercase tracking-[0.14em]
              ${isFinal ? 'text-hero text-warning' : 'text-sm text-ink'}`}
          >
            {callout.headline}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Restyle `TrackReadout` into the rail**

Replace the `return` block of `components/TrackReadout.tsx` (keep the file's existing imports and the `room`/`standings`/`offscreen`/`myId` reads, and add `const deltas = useStaging(s => s.deltas);` plus the `useStaging` import):

```tsx
  return (
    <div className="space-y-3">
      <LowerThird />

      <div className="rounded-panel border border-haze/40 bg-abyss/75 p-2 backdrop-blur-md">
        <h2 className="px-2 pb-1 text-center text-[11px] font-bold uppercase tracking-widest text-ink-mute">
          The track — after Q{room.round}
        </h2>

        <ol className="flex gap-2 overflow-x-auto sm:justify-center">
          {standings.map((s, rank) => {
            const gained = deltas.find(d => d.playerId === s.player_id)?.placesGained ?? 0;
            return (
              <li
                key={s.player_id}
                data-testid="rail-entry"
                className={`flex shrink-0 items-center gap-2 rounded-control px-2 py-1.5 ${
                  s.player_id === myId ? 'bg-haze/25' : ''
                }`}
              >
                <span className="text-sm font-bold tabular-nums text-ink-mute">
                  {rank < 3 ? MEDALS[rank] : rank + 1}
                </span>
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-base"
                  style={{ backgroundColor: `${s.color}33`, boxShadow: `inset 0 0 0 2px ${s.color}` }}
                >
                  {avatarEmoji(s.avatar)}
                </span>
                <span className="max-w-24 truncate text-sm font-semibold text-ink">{s.nickname}</span>
                <span className="tabular-nums text-sm text-ink-dim">{s.correct}</span>
                {gained > 0 && (
                  <span className="text-xs font-bold text-correct" title={`Gained ${gained}`}>
                    ▲{gained}
                  </span>
                )}
                {s.current_streak >= 3 && (
                  <span className="text-xs font-bold text-warning" title={`${s.current_streak} in a row`}>
                    🔥×{s.current_streak}
                  </span>
                )}
                {offscreen.includes(s.player_id) && (
                  <span className="text-xs text-warning" title="Outside the current camera shot">
                    ◦
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
```

Delete the `<main>` wrapper and its `min-h-screen` — the rail lives inside the shell now. Keep the heading string `The track — after Q{room.round}` exactly: `e2e/game-flow.spec.ts:74` and `e2e/world.spec.ts:79` both assert it, and preserving it is why they need no edit.

- [ ] **Step 3: Fold TRACK into the shell**

In `components/StageShell.tsx`, read the escalation and expose it, and give the track beat its own layout:

```tsx
  const escalated = useStaging(s => s.escalated);
```

```tsx
    <main
      data-testid="stage-shell"
      data-beat={beat}
      data-escalated={escalated ? 'true' : undefined}
      className={`mx-auto grid min-h-screen w-full max-w-2xl gap-6 p-6
        ${beat === 'track'
          ? 'grid-rows-[1fr_auto] portrait:pt-6'
          : 'grid-rows-[auto_1fr_auto] portrait:pt-[28vh] landscape:bg-abyss/60 landscape:backdrop-blur-sm'}`}
    >
```

At the track beat the shell renders only the outcome region, so the world keeps the frame:

```tsx
      {beat === 'track' ? (
        <>
          <div />
          <div className="space-y-4">{outcome}</div>
        </>
      ) : (
        <>
          <div className="flex flex-col items-center gap-4">{header}</div>
          <div className="flex flex-col justify-center">{question}</div>
          <div className="space-y-4">
            <AnimatePresence initial={false}>{options}</AnimatePresence>
            {outcome}
          </div>
        </>
      )}
```

Keep the announcer paragraph exactly where it is, after the branch.

In `components/GameView.tsx`, delete the early return `if (room.phase === 'track') return <TrackReadout code={code} />;` and render it into the outcome slot instead:

```tsx
          {room.phase === 'track' && <TrackReadout code={code} />}
```

`COUNTDOWN` stays a full-screen branch — spec §7.2.

- [ ] **Step 4: Add the escalated treatments**

In `components/QuestionCard.tsx`, take the escalation and swap the round chip:

```tsx
import { useStaging } from '@/lib/staging/useStaging';
```

```tsx
  const escalated = useStaging(s => s.escalated);
```

```tsx
        {escalated ? (
          <span className="rounded-full border border-warning/60 bg-warning/15 px-3 py-1.5 text-warning">
            Final question
          </span>
        ) : (
          <span className="text-ink-mute tabular-nums">Q{round}/{totalRounds}</span>
        )}
```

`TensionFrame` is a **sibling** of the stage shell, not a descendant — it is mounted at `app/room/[code]/page.tsx:64`, next to `PixiStage`. A `[data-escalated] .tension-frame` selector would never match. It also returns `null` outside the ANSWER beat. So the frame takes the escalation from the store itself, and the shell's own rim covers the other beats.

`components/TensionFrame.tsx`:

```tsx
export default function TensionFrame() {
  const beat = useStaging(s => s.beat);
  const escalated = useStaging(s => s.escalated);
  if (beat !== 'answer') return null;
  return (
    <div
      aria-hidden="true"
      className={escalated ? 'tension-frame tension-frame--final' : 'tension-frame'}
    />
  );
}
```

In `app/globals.css`, immediately after the existing `.tension-frame` rule (line ~121-131), add:

```css
/* The final question runs hot at the margins, never on the question or the
   options themselves (P3a decision 4). Deeper and warmer at every point on
   the same ramp -- it does not introduce a second clock. */
.tension-frame--final {
  opacity: calc(0.35 + var(--t) * 0.65);
  box-shadow:
    inset 0 0 calc(44px + var(--t) * 80px) calc(4px + var(--t) * 10px)
      color-mix(in oklab, var(--color-warning), var(--color-wrong) calc(var(--t) * 100%));
}

/* READ and REVEAL have no vignette, so the shell carries the rim there. */
[data-escalated='true'] {
  box-shadow: inset 0 0 0 2px color-mix(in oklab, var(--color-warning) 22%, transparent);
}
```

Both rules go in the same place and layer as the existing `.tension-frame` block. Add `components/TensionFrame.tsx` to this task's commit.

- [ ] **Step 5: Write the failing e2e assertions**

Append to `e2e/staging.spec.ts` a second test that plays one full round. Reuse the room-creation block at the top of the existing test verbatim (do not extract a helper in this task — the existing spec's setup is inline and matching it keeps the diff readable), then:

```ts
  // REVEAL: the options became result rows in place, and the correct one is
  // marked. The buttons are the same nodes -- they never unmounted.
  await expect(joiner.getByText('Correct answer')).toBeVisible({ timeout: 15_000 });
  await expect(joiner.getByTestId('answer-option')).toHaveCount(4);
  await expect(joiner.getByText('correct', { exact: true })).toBeVisible();

  // TRACK: the shell keeps the beat, the rail carries every player as text.
  await expect(
    joiner.locator('[data-testid="stage-shell"][data-beat="track"]'),
  ).toBeVisible({ timeout: 15_000 });
  await expect(joiner.getByTestId('rail-entry')).toHaveCount(2);
  await expect(joiner.getByText(/The track — after Q1/)).toBeVisible();
```

- [ ] **Step 6: Run the e2e suite**

Run: `npm run test:e2e`
Expected: 19+ passing across 7 files, with no regression in the existing 18. `e2e/world.spec.ts`'s `data-band` assertions must still pass — `track` was never in `STRIP_PHASES`, so the canvas band is unaffected by the fold-in.

- [ ] **Step 7: Verify live in a headed browser**

Play a full game (at least 3 rounds so a penultimate TRACK exists) with two players, headed, and confirm:

- the lower third appears ~1.4s into TRACK and leaves ~1.2s later, while the avatars are still settling
- exactly one banner per beat, even when an overtake and a streak milestone land together; the loser of that arbitration shows as a `▲n` or `🔥×n` mark in the rail instead
- on the penultimate TRACK the FINAL QUESTION card takes the beat, and any overtake that beat demotes to a rail mark
- from that moment the round chip reads **Final question** and the frame runs warm, while the question and the four options are visually identical to a normal round
- a reload during TRACK shows the rail with **no** banner
- a mid-final-round reload still shows the escalated chip and frame
- reloading mid-streak keeps the flame (Task 6's debt fix, visible on the canvas)
- `reduced` profile: no sustained travel on the banner, no per-frame writes

Run: `npx tsc --noEmit && npm test && npm run test:e2e && npx eslint components/LowerThird.tsx components/TrackReadout.tsx components/StageShell.tsx components/GameView.tsx components/QuestionCard.tsx`
Expected: all clean and green.

- [ ] **Step 8: Commit**

```bash
git add components/LowerThird.tsx components/TrackReadout.tsx components/StageShell.tsx components/GameView.tsx components/QuestionCard.tsx components/TensionFrame.tsx app/globals.css e2e/staging.spec.ts
git commit -m "feat(p3b): fold track into the shell with a rail, a lower third, and escalation"
```

---

## Closing the phase

After Task 8, before declaring the phase complete:

1. Walk spec §10's ten exit criteria one at a time, in a headed browser, and record the evidence for each — measured values, not impressions. P3a's phase record is the format to follow.
2. Run the full gate: `npx tsc --noEmit`, `npm test`, `npm run test:e2e`, `npm run build`, and scoped `npx eslint` over every touched file.
3. Confirm `git diff main --stat` shows exactly one file under `supabase/` — `0003_reveal_picks.sql`. Any other change there is out of scope.
4. Write `docs/progress/P3b-round-outcome.md` (scope, what was built, deviations — including the two flagged in Tasks 2 and 3 — verification results), and remove P3b's entry plus the two debt items it closes from `docs/progress/CURRENT.md`.
5. Write the four ADRs from spec §11 into `docs/ADR/`, numbered from 0018, following `docs/ADR/README.md`.
