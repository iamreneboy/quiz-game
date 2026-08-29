# M3 P2b — The Aftermath Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish PRD §5.4 — four **awards** projected from the finished race and
staged as the ceremony's coda, and a **rematch** that resets the same room to a
fresh lobby with the same players, the same code and no repeated questions.

**Architecture:** Awards are a **read, not a broadcast**. Three of the four (Big
Brain, Fastest Gun, Hot Streak) are already derivable from the `standings` every
client holds; only Late Surge needs history. So rather than open the wire a
fifth time, a pure `awards(room_id)` SQL projection is fetched once by each
surface when the room is finished — one code path for the live ceremony and for
a reload — and staged on a new `awards` ceremony beat that fits inside the
12400ms `CEREMONY_MS` P2a already reserved. Nothing about the deadline moves.

Rematch is **the same room, reset in place**: same `rooms` row, same `code`,
same `players`, so no session is invalidated and nobody re-joins. The room grows
one memory — `rooms.used_question_ids` — which is what lets the redraw exclude
everything the room has already asked, across any number of rematches. And
because a rematch is the first time in this game's history a room has ever moved
*backwards*, three consumers that only ever move forward need telling: the
camera (parked on a podium at the final question's grade), the audio bed (still
on `ceremony`) and `deriveCues`' own standings baseline (which would read the
next game's first reveal as a field of overtakes against the last game's order).
One new semantic cue, `game-reset`, says so.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase
(Postgres + Realtime broadcast), zustand, `motion`, Tailwind v4, Vitest,
Playwright. **No new runtime dependencies.**

**Spec:** `docs/superpowers/specs/2026-08-29-m3-host-power-polish-roadmap.md`
(§3 "P2 — The finish" is the requirement set; §2 and §4 bind every task).
Parent record: `docs/progress/M3-P2a-the-tiebreak.md` — its "Notes for phases
that inherit this work" names two traps this plan discharges (Task 1 and
Task 4).

**P2's drill-down spec was not written.** Roadmap §6 said P2 earns one because
it carries four distinct features and "the spec is where P2a/P2b gets decided".
That split was resolved in P2a's plan: **P2a = the tiebreak** (photo finish +
sudden death), **P2b = the aftermath** (awards + rematch). This document is P2b,
and it resolves its own remaining decisions in the plan rather than in a spec,
exactly as P0 resolved skip semantics, P1 the playing-host conflict and P2a the
split itself:

| Decision | Resolved as | Where |
|---|---|---|
| **How awards reach the client** | **A fetch, not a wire field.** `awards(room_id)` is a pure SQL projection each surface calls once when `status = 'finished'`. The results phase event is NOT opened a fifth time. | Tasks 1–3, ADR-0045 |
| **How the ceremony finds room for them** | **Inside the deadline P2a already reserved.** `AWARDS_AT = 7200` sits after `BOARD_AT = 6000`; with the photo-finish shift that is 10600 against a flat 12400, so `CEREMONY_MS` and `ceremony_ms()` **do not move** and 0008 contains no ceremony change at all. | Task 2 |
| **Where the room remembers what it has asked** | **`rooms.used_question_ids uuid[]`**, appended from `room_questions` at each rematch — which automatically includes a spent tiebreak (it is a real row at `total_rounds + 1`) and automatically excludes an unspent reserve (it never was one). Rejected: a `room_used_questions` table — a second cascade and a second lock for a list that is always read whole, alongside a row this RPC already holds `for update`. | Task 4, ADR-0046 |
| **What "tweaked config" means** | **The timer on the results screen; the question mix in the review step.** The RPC takes all three (timer, categories, tier counts), each defaulting to the previous race's. The rematch card offers the timer — the one setting `/host/[code]/review` cannot reach — and the host lands back in a lobby where that review step is live again for swaps, adds and removals. No second wizard. | Tasks 4 and 6 |
| **What happens to custom questions on a rematch** | **They are deleted with the draw.** A custom question is a question this room has already asked (PRD §5.4.6: "exclude ones already used"), and it lives only in this room (ADR-0039). The host writes new ones in the review step if they want them. | Task 4 |
| **Who tells the show the room went backwards** | **A `game-reset` cue.** Not a store flag and not a per-consumer phase check: the director, the audio bed and the cue deriver each hold forward-only state, and the cue bus is this codebase's single game-state-to-show seam (ADR-0001). | Task 5, ADR-0047 |

---

## Global Constraints

Copied from the roadmap. Every task's requirements implicitly include this
section.

- **Migrations `0008+` follow the house style set by `0003`–`0007`** — `create
  or replace function` over rewrites, additive columns with defaults, no
  destructive DDL. A live cloud project (`niznfbabmixesfvxlypi`) holds real data
  behind a live Vercel deploy.
- **`supabase/migrations/0008_the_aftermath.sql` must be idempotent end to
  end.** It is written across Tasks 1 and 4 and re-applied after each: every
  `alter table` uses `if not exists`, every function is `create or replace`.
- **Host authority is server-enforced on every command** (roadmap decision 2).
  `rematch` is P2b's one new mutating command and it validates `host_key`
  inside the RPC. `awards` mutates nothing and is host-agnostic on purpose —
  every surface reads it, including a TV that holds no key.
- **The Fairness Law is inviolable** (roadmap decision 4). No task in this plan
  edits `standings`, `final_standings`, `longest_streak`, `current_streak` or
  `scoring_round`. **Awards are a read-only projection and can never feed back
  into rank** — the roadmap says so in as many words.
- **Every awards query is bounded by `scoring_round`** — P2a's inherited
  obligation. Without it a tiebreak answer counts toward Fastest Gun.
- **Design Pillar 2 holds:** clients never receive a correct answer before the
  reveal. `awards` returns nothing about any question. `rematch` deletes the old
  draw and draws a new one server-side; `rooms.reserve_question_id` stays off
  every projection (ADR-0041).
- **The celebration hierarchy does not grow.** M3's one allowed rung was spent
  on `suddenDeath` in P2a (roadmap decision 6). `game-reset` is `routine`;
  the awards card claims no rung at all.
- **The wire stays semantic** (PRD §3.6, §9), and **P2b spends no new phase-event
  field.** `game-reset` is a presentation cue, derived on the client from a
  phase change it can already see — it never travels.
- **Rendering separation** (PRD §9): the awards card and the rematch card are
  DOM. Pixi's only involvement is that `game-reset` returns its camera to the
  lobby shot.
- **Accessibility is an acceptance criterion, not a later pass.** The awards
  card carries `role="status"` + `aria-live="polite"`; every award emoji is
  `aria-hidden` with the name in text beside it; a tie is stated in words, never
  by layout alone; the rematch control is a real `<button>` with a visible
  focus ring and is never gated by ceremony staging (ADR-0016).
- **The regression floor at the end of the phase:** 568 unit tests (plus
  whatever this phase adds), `npm run lint` clean, `npx tsc --noEmit` silent,
  `node scripts/smoke.mjs` all green, and Playwright at `--workers=2`. There is
  no pre-existing lint error to discount.
- **Do not run `supabase stop` or `supabase start`** (CURRENT.md) — this
  machine's stack is bound to shifted ports that a restart would lose. Apply
  migrations with `npx supabase db query --file <path>` against the local stack.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `supabase/migrations/0008_the_aftermath.sql` | `award_winners`, `late_surge`, `awards`; `rooms.used_question_ids`; `rematch`. Written across Tasks 1 and 4. |
| `lib/awards.ts` | Pure: award types, the fixed display order, per-award copy, and `describeAwards` — the validate-and-order seam between the RPC's jsonb and the card. |
| `lib/useAwards.ts` | The one fetch. A hook because both surfaces need it and neither should merge it into the game store. |
| `components/AwardsCard.tsx` | The awards, on both surfaces, staged on the ceremony's `awards` beat. |
| `components/RematchCard.tsx` | Host-only, on the results screen: the timer tweak and the confirm. |
| `tests/awards.test.ts` | One test per rule in `lib/awards.ts`. |
| `e2e/aftermath.spec.ts` | Two contexts: awards on both screens, then a rematch back to a shared lobby and a second race with a different question. |
| `docs/ADR/0045-awards-are-fetched-not-broadcast.md` | |
| `docs/ADR/0046-a-rematch-is-the-same-room-reset.md` | |
| `docs/ADR/0047-returning-to-the-lobby-is-a-cue.md` | |
| `docs/progress/M3-P2b-the-aftermath.md` | The phase record, written at the end. |

**Modified**

| File | Change |
|---|---|
| `lib/ceremony/beats.ts` | `AWARDS_AT`, `CeremonySteps.awards`, `NO_CEREMONY`, `ceremonyStepsAt`, `sameSteps`. |
| `lib/types.ts` | `AwardKey`, `AwardWinner`, `Award`. |
| `components/ResultsView.tsx` | The awards card, the rematch card, one more mount-time one-shot. |
| `components/stage/StageResults.tsx` | The awards card (no rematch — nothing on a TV to press it with). |
| `app/room/[code]/page.tsx` | Passes the host driver into `ResultsView`. |
| `lib/presentation/cues.ts` | `GameResetCue` + union member. |
| `lib/presentation/deriveCues.ts` | Emits `game-reset` on a transition into `lobby` and clears the standings baseline. |
| `lib/store.ts` | A `lobby` arm in `applyPhaseEvent`. |
| `lib/world/director.ts` | `game-reset` returns to the lobby shot and zeroes escalation. |
| `lib/world/runtime.ts` | Subscribes `game-reset`; hard-completes the choreographer. |
| `lib/audio/state.ts` | `game-reset` returns the bed to `lobby`. |
| `lib/useHostDriver.ts` | `rematch(timerSeconds?)`. |
| `tests/ceremonyBeats.test.ts` | The awards beat on both timelines. |
| `tests/deriveCues.test.ts`, `tests/store.test.ts`, `tests/director.test.ts`, `tests/audioState.test.ts` | One `game-reset` / lobby case each. |
| `scripts/smoke.mjs` | `P2b awards` and `P2b rematch` sections. |
| `docs/ADR/README.md`, `docs/progress/CURRENT.md` | Index and tracker. |

---

## Task 1: The awards projection

**Files:**
- Create: `supabase/migrations/0008_the_aftermath.sql`
- Modify: `scripts/smoke.mjs` (append a `P2b awards` section at the end)

**Interfaces:**
- Consumes: `standings(room_id, max_round)`, `final_standings(room_id,
  max_round)` and `scoring_round(room_id, round)` from
  `supabase/migrations/0007_the_tiebreak.sql` — all three unchanged.
- Produces: `awards(p_room_id uuid) returns jsonb` — a JSON array, ordered
  `big-brain`, `fastest-gun`, `hot-streak`, `late-surge`, each element
  `{ "key": text, "value": int, "winners": [{ "player_id", "nickname",
  "avatar", "color" }] }`. An award nobody scored on is **absent**, not present
  with a zero. Task 2's `lib/awards.ts` parses exactly this shape; Task 3
  renders it.

- [ ] **Step 1: Write the failing smoke section**

Append to the end of `scripts/smoke.mjs`:

```js
// ---- P2b: the awards projection ----
// A three-racer, two-question room built so that every award has a DIFFERENT
// winner and Late Surge has something real to reconstruct:
//   round 1: Brain and Surge answer correctly, Gun does not
//   round 2: Brain and Gun answer correctly, Surge does not
// Gun answers round 2 fast; Brain answers it slowly. So Brain takes correct
// count (2) and the streak (2); Gun takes speed points; Surge sits 2nd at the
// midpoint and last at the end, so the surge belongs to whoever climbed —
// which is Gun, from 3rd to 2nd.
const aw = await rpc('create_room', {
  p_timer_seconds: 20, p_categories: ['fuel'], p_tier_counts: [2, 0, 0, 0],
});
const awBrain = await rpc('join_room', {
  p_code: aw.code, p_nickname: 'Brain', p_avatar: 'robot', p_color: '#f59e0b',
  p_host_key: aw.host_key,
});
const awGun = await rpc('join_room', {
  p_code: aw.code, p_nickname: 'Gun', p_avatar: 'duck', p_color: '#38bdf8',
});
const awSurge = await rpc('join_room', {
  p_code: aw.code, p_nickname: 'Surge', p_avatar: 'cat', p_color: '#a78bfa',
});
await rpc('start_game', { p_room_id: aw.room_id, p_host_key: aw.host_key });

// Both seeded tier-1 'fuel' questions are correct_index 0; the game-flow
// section above already depends on that.
const awAdvance = () => rpc('advance_phase', { p_room_id: aw.room_id, p_host_key: aw.host_key });
const awAnswer = (player, round, choice) => rpc('submit_answer', {
  p_room_id: aw.room_id, p_player_key: player.player_key,
  p_round: round, p_choice_index: choice,
});

await awAdvance();                       // read 1
await awAdvance();                       // answer 1
await awAnswer(awBrain, 1, 0);
await awAnswer(awSurge, 1, 0);
await awAnswer(awGun, 1, 1);
await awAdvance();                       // reveal 1
await awAdvance();                       // track 1
await awAdvance();                       // read 2
await awAdvance();                       // answer 2
await awAnswer(awGun, 2, 0);             // fast
await sleep(1200);
await awAnswer(awBrain, 2, 0);           // slow
await awAnswer(awSurge, 2, 1);
await awAdvance();                       // reveal 2
await awAdvance();                       // track 2
const awFinal = await awAdvance();       // results
assert.equal(awFinal.phase, 'results');

const awards = await rpc('awards', { p_room_id: aw.room_id });
const byKey = Object.fromEntries(awards.map(a => [a.key, a]));
const namesOf = key => (byKey[key]?.winners ?? []).map(w => w.nickname);

assert.deepEqual(awards.map(a => a.key),
  ['big-brain', 'fastest-gun', 'hot-streak', 'late-surge'],
  'awards come back in PRD §5.4.4 order');
assert.deepEqual(namesOf('big-brain'), ['Brain']);
assert.equal(byKey['big-brain'].value, 2);
assert.deepEqual(namesOf('fastest-gun'), ['Gun']);
assert.deepEqual(namesOf('hot-streak'), ['Brain']);
assert.equal(byKey['hot-streak'].value, 2);
assert.deepEqual(namesOf('late-surge'), ['Gun'], 'the climb from 3rd to 2nd');
assert.equal(byKey['late-surge'].value, 1);
for (const a of awards) {
  assert.ok(a.winners.length >= 1, `${a.key} has a winner`);
  for (const w of a.winners) {
    assert.ok(w.player_id && w.nickname && w.avatar && w.color, `${a.key} winner is complete`);
  }
}

// -- an award nobody scored on is ABSENT, never a zero
const awNil = await rpc('create_room', {
  p_timer_seconds: 5, p_categories: ['fuel'], p_tier_counts: [1, 0, 0, 0],
});
await rpc('join_room', {
  p_code: awNil.code, p_nickname: 'Nil1', p_avatar: 'robot', p_color: '#f59e0b',
  p_host_key: awNil.host_key,
});
await rpc('join_room', {
  p_code: awNil.code, p_nickname: 'Nil2', p_avatar: 'duck', p_color: '#38bdf8',
});
await rpc('start_game', { p_room_id: awNil.room_id, p_host_key: awNil.host_key });
await rpc('end_game', { p_room_id: awNil.room_id, p_host_key: awNil.host_key });
assert.deepEqual(await rpc('awards', { p_room_id: awNil.room_id }), [],
  'a race nobody scored in hands out nothing');

console.log('✅ P2b awards smoke passed');
```

`sleep` already exists in this file; if the section is placed before its
declaration, move the section, not the helper.

- [ ] **Step 2: Run it to make sure it fails**

Run: `node scripts/smoke.mjs`
Expected: FAIL at the first `awards` call with
`awards: Could not find the function public.awards(p_room_id)`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0008_the_aftermath.sql`:

```sql
-- M3 P2b — the aftermath: the awards projection, and a rematch that resets the
-- room in place.
--
-- The whole file is IDEMPOTENT. It is written across two tasks and re-applied
-- after each one, so every statement here must survive a second run.
--
-- Depends on 0006_the_draw.sql (questions.room_id, rooms.categories,
-- rooms.reserve_question_id) and 0007_the_tiebreak.sql (scoring_round,
-- final_standings, the sudden_death_* columns).
--
-- The ceremony's clock is NOT touched. `ceremony_ms()` stays 12400: the awards
-- beat sits at 7200 inside the deadline 0007 already reserved, so P2b spends
-- nothing on the wire and nothing on the clock.

-- ============ award_winners ============
-- One award, from one integer field of a standings array.
--
-- Returns NULL — not a zero-valued award — when the best score is 0 or less.
-- "Most correct" in a race where nobody answered anything is not a fact about
-- a player, and handing out a Big Brain for zero correct answers would be the
-- projection inventing a result. Every caller below folds NULL away.
--
-- ORDINALITY is load-bearing on the aggregate: `standings` arrives ordered by
-- the Fairness Law (ADR-0018) and a tied award must list its winners in that
-- same order, so the card reads top-down like the board above it. jsonb_agg
-- has no inherent order to inherit.
create or replace function award_winners(p_standings jsonb, p_key text, p_field text)
returns jsonb
language sql immutable set search_path = public as $$
  with rows as (
    select e, ord, (e->>p_field)::int as v
    from jsonb_array_elements(coalesce(p_standings, '[]'::jsonb))
      with ordinality as t(e, ord)),
  best as (select max(v) as v from rows)
  select case when best.v is null or best.v <= 0 then null else
    jsonb_build_object(
      'key', p_key,
      'value', best.v,
      'winners', (
        select jsonb_agg(jsonb_build_object(
                 'player_id', rows.e->>'player_id',
                 'nickname',  rows.e->>'nickname',
                 'avatar',    rows.e->>'avatar',
                 'color',     rows.e->>'color')
               order by rows.ord)
        from rows where rows.v = best.v))
  end
  from best;
$$;

-- ============ late_surge ============
-- 📈 Late Surge: most positions gained in the second half (PRD §5.4.4).
--
-- Reconstructed from `answers`, because nothing stores a historical placing:
-- the standings AT THE MIDPOINT are recomputed by asking standings() for the
-- midpoint round, and each racer's gain is their midpoint rank minus their
-- final rank.
--
-- The final side reads `final_standings`, not `standings`: a sudden-death
-- winner has been lifted to the head (ADR-0043) and that IS where the room saw
-- them finish. The midpoint side reads plain `standings` — no tiebreak had
-- happened yet at the midpoint.
--
-- Nobody gaining ground is a legitimate outcome and returns NULL: the second
-- half of a race in which nothing moved has no surge in it.
create or replace function late_surge(
  p_room_id uuid, p_bound int, p_mid int, p_final jsonb
) returns jsonb
language sql stable set search_path = public as $$
  with mid as (
    select e->>'player_id' as pid, ord as rank
    from jsonb_array_elements(standings(p_room_id, p_mid))
      with ordinality as t(e, ord)),
  fin as (
    select e->>'player_id' as pid, ord as rank, e
    from jsonb_array_elements(coalesce(p_final, '[]'::jsonb))
      with ordinality as t(e, ord)),
  gains as (
    select fin.e, fin.rank as ord, (mid.rank - fin.rank)::int as gain
    from fin join mid on mid.pid = fin.pid),
  best as (select max(gain) as g from gains)
  select case when best.g is null or best.g <= 0 then null else
    jsonb_build_object(
      'key', 'late-surge',
      'value', best.g,
      'winners', (
        select jsonb_agg(jsonb_build_object(
                 'player_id', gains.e->>'player_id',
                 'nickname',  gains.e->>'nickname',
                 'avatar',    gains.e->>'avatar',
                 'color',     gains.e->>'color')
               order by gains.ord)
        from gains where gains.gain = best.g))
  end
  from best;
$$;

-- ============ awards ============
-- PRD §5.4.4, as the roadmap specified it: a PURE PROJECTION. It reads; it
-- never writes, and nothing it returns can feed back into rank (roadmap
-- decision 4).
--
-- BOUNDED BY scoring_round, which is P2a's standing obligation on every
-- consumer that computes a scoring bound: the tiebreak is a real round at
-- total_rounds + 1, and without the clamp its answer would count toward
-- Fastest Gun and Hot Streak. `current_round` is the right argument because
-- end_game deliberately stops the room at the last RESOLVED round.
--
-- Callable by anyone with the room id, deliberately: every surface renders the
-- awards, including a stage view that holds no host key, and the projection
-- discloses nothing a client's own `standings` does not already carry.
create or replace function awards(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_bound int;
  v_mid int;
  v_final jsonb;
  v_out jsonb := '[]'::jsonb;
  v_award jsonb;
begin
  select scoring_round(p_room_id, r.current_round) into v_bound
  from rooms r where r.id = p_room_id;
  if v_bound is null or v_bound < 1 then return '[]'::jsonb; end if;

  v_final := final_standings(p_room_id, v_bound);

  -- Fixed order, PRD §5.4.4's own: Big Brain, Fastest Gun, Hot Streak, Late
  -- Surge. The client re-sorts into the same order anyway (lib/awards.ts), so
  -- a future award can be appended here without a client change.
  v_award := award_winners(v_final, 'big-brain', 'correct');
  if v_award is not null then v_out := v_out || jsonb_build_array(v_award); end if;

  v_award := award_winners(v_final, 'fastest-gun', 'speed_points');
  if v_award is not null then v_out := v_out || jsonb_build_array(v_award); end if;

  v_award := award_winners(v_final, 'hot-streak', 'longest_streak');
  if v_award is not null then v_out := v_out || jsonb_build_array(v_award); end if;

  -- A one-round race has no halves to compare, so it has no surge. Integer
  -- division floors, which is what puts the midpoint at the end of the first
  -- half for an odd round count.
  v_mid := v_bound / 2;
  if v_mid >= 1 then
    v_award := late_surge(p_room_id, v_bound, v_mid, v_final);
    if v_award is not null then v_out := v_out || jsonb_build_array(v_award); end if;
  end if;

  return v_out;
end $$;

grant execute on all functions in schema public to anon, authenticated;
```

- [ ] **Step 4: Apply the migration and run the smoke harness**

Run:
```bash
npx supabase db query --file supabase/migrations/0008_the_aftermath.sql
node scripts/smoke.mjs
```
Expected: every `✅`, ending with `✅ P2b awards smoke passed`.

- [ ] **Step 5: Prove the migration is idempotent**

Run:
```bash
npx supabase db query --file supabase/migrations/0008_the_aftermath.sql
node scripts/smoke.mjs
```
Expected: the second apply is clean and the harness still passes end to end.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0008_the_aftermath.sql scripts/smoke.mjs
git commit -m "feat: the awards projection"
```

---

## Task 2: The awards beat, and the shape the card reads

**Files:**
- Create: `lib/awards.ts`, `tests/awards.test.ts`
- Modify: `lib/types.ts`, `lib/ceremony/beats.ts:60-200`,
  `tests/ceremonyBeats.test.ts`

**Interfaces:**
- Consumes: Task 1's `awards(room_id)` JSON shape.
- Produces:
  - `lib/types.ts`: `type AwardKey = 'big-brain' | 'fastest-gun' | 'hot-streak'
    | 'late-surge'`; `interface AwardWinner { player_id: string; nickname:
    string; avatar: string; color: string }`; `interface Award { key: AwardKey;
    value: number; winners: AwardWinner[] }`.
  - `lib/awards.ts`: `AWARD_ORDER: readonly AwardKey[]`,
    `AWARD_META: Record<AwardKey, { emoji: string; label: string; blurb: string }>`,
    `awardValueText(key: AwardKey, value: number): string`,
    `describeAwards(raw: unknown): Award[]`.
  - `lib/ceremony/beats.ts`: `AWARDS_AT: number` (7200) and
    `CeremonySteps.awards: boolean`. Task 3 reads both.

- [ ] **Step 1: Write the failing tests for the pure module**

Create `tests/awards.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AWARD_META, AWARD_ORDER, awardValueText, describeAwards } from '@/lib/awards';

const winner = (id: string) => ({
  player_id: id, nickname: id.toUpperCase(), avatar: 'duck', color: '#f59e0b',
});

describe('AWARD_ORDER and AWARD_META', () => {
  it('is PRD §5.4.4 order, and every key has copy', () => {
    expect(AWARD_ORDER).toEqual(['big-brain', 'fastest-gun', 'hot-streak', 'late-surge']);
    for (const key of AWARD_ORDER) {
      expect(AWARD_META[key].label.length).toBeGreaterThan(0);
      expect(AWARD_META[key].emoji.length).toBeGreaterThan(0);
      expect(AWARD_META[key].blurb.length).toBeGreaterThan(0);
    }
  });
});

describe('awardValueText', () => {
  it('quotes each award in its own unit', () => {
    expect(awardValueText('big-brain', 9)).toBe('9 correct');
    expect(awardValueText('fastest-gun', 640)).toBe('640 speed points');
    expect(awardValueText('hot-streak', 5)).toBe('5 in a row');
    expect(awardValueText('late-surge', 3)).toBe('3 places gained');
  });

  it('does not say "1 places gained"', () => {
    expect(awardValueText('late-surge', 1)).toBe('1 place gained');
  });
});

describe('describeAwards', () => {
  const big = { key: 'big-brain', value: 9, winners: [winner('a')] };
  const gun = { key: 'fastest-gun', value: 640, winners: [winner('b')] };

  it('returns awards in AWARD_ORDER regardless of arrival order', () => {
    expect(describeAwards([gun, big]).map(a => a.key)).toEqual(['big-brain', 'fastest-gun']);
  });

  it('keeps every winner of a tied award, in the order given', () => {
    const tied = { key: 'hot-streak', value: 4, winners: [winner('a'), winner('b')] };
    expect(describeAwards([tied])[0].winners.map(w => w.nickname)).toEqual(['A', 'B']);
  });

  it('drops an award key it does not know, rather than throwing', () => {
    expect(describeAwards([big, { key: 'best-hat', value: 1, winners: [winner('a')] }]))
      .toHaveLength(1);
  });

  it('drops an award with no winners — nobody earned it', () => {
    expect(describeAwards([{ key: 'big-brain', value: 3, winners: [] }])).toEqual([]);
  });

  it('treats anything that is not an array as no awards at all', () => {
    expect(describeAwards(null)).toEqual([]);
    expect(describeAwards(undefined)).toEqual([]);
    expect(describeAwards({ key: 'big-brain' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/awards.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/awards"`.

- [ ] **Step 3: Add the award types**

Append to `lib/types.ts`:

```ts
/**
 * The four awards (PRD §5.4.4), as `awards(room_id)` returns them.
 *
 * Deliberately NOT on `PhaseEvent`. Three of the four are already derivable
 * from `Standing`; only Late Surge needs history the client does not hold, and
 * one projection read is cheaper than a fifth wire opening (ADR-0045).
 */
export type AwardKey = 'big-brain' | 'fastest-gun' | 'hot-streak' | 'late-surge';

export interface AwardWinner {
  player_id: string;
  nickname: string;
  avatar: string;
  color: string;
}

export interface Award {
  key: AwardKey;
  /** The winning score, in the award's own unit. Never 0 — the server omits those. */
  value: number;
  /** Always at least one. More than one means the award is shared. */
  winners: AwardWinner[];
}
```

- [ ] **Step 4: Write the pure module**

Create `lib/awards.ts`:

```ts
/**
 * The awards, as the show says them (PRD §5.4.4) — pure, no React, no store,
 * no DOM.
 *
 * The server sends key, value and winners and nothing else: what an award is
 * CALLED, what it means and how its number reads are presentation, and they
 * live here where they can be tested and changed without a migration.
 *
 * `describeAwards` is the validate-and-order seam. It exists because this data
 * arrives from an RPC as untyped jsonb and because the server's order must not
 * be the only thing keeping the card's order right — a later award appended
 * server-side slots into AWARD_ORDER here or is dropped, never rendered in an
 * arbitrary position.
 */
import type { Award, AwardKey, AwardWinner } from '@/lib/types';

/** PRD §5.4.4's own order: brain, then speed, then streak, then the climb. */
export const AWARD_ORDER: readonly AwardKey[] = [
  'big-brain', 'fastest-gun', 'hot-streak', 'late-surge',
];

export const AWARD_META: Record<AwardKey, { emoji: string; label: string; blurb: string }> = {
  'big-brain':   { emoji: '🧠', label: 'Big Brain',   blurb: 'Most correct answers' },
  'fastest-gun': { emoji: '⚡', label: 'Fastest Gun', blurb: 'Most speed points' },
  'hot-streak':  { emoji: '🔥', label: 'Hot Streak',  blurb: 'Longest run of correct answers' },
  'late-surge':  { emoji: '📈', label: 'Late Surge',  blurb: 'Most places gained in the second half' },
};

/**
 * The winning score in the award's own unit.
 *
 * Each award counts a different thing, so a bare number beside four different
 * labels would be four different questions the reader has to answer. The
 * singular case is spelled out rather than suffixed with "(s)": this is copy on
 * a screen a room is looking at.
 */
export function awardValueText(key: AwardKey, value: number): string {
  switch (key) {
    case 'big-brain':   return `${value} correct`;
    case 'fastest-gun': return `${value} speed points`;
    case 'hot-streak':  return `${value} in a row`;
    case 'late-surge':  return `${value} place${value === 1 ? '' : 's'} gained`;
  }
}

/**
 * Parse, filter and order what the RPC returned.
 *
 * Unknown keys are DROPPED rather than rendered: a client running against a
 * newer database must degrade to the awards it knows how to name, exactly as
 * every other mirrored value in this codebase degrades rather than failing.
 * An award with no winners is dropped for the same reason the server omits a
 * zero-valued one — it is not a result.
 */
export function describeAwards(raw: unknown): Award[] {
  if (!Array.isArray(raw)) return [];

  const known = new Map<AwardKey, Award>();
  for (const entry of raw) {
    const award = parseAward(entry);
    if (award && !known.has(award.key)) known.set(award.key, award);
  }

  return AWARD_ORDER.map(key => known.get(key)).filter((a): a is Award => a !== undefined);
}

function parseAward(entry: unknown): Award | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const row = entry as Record<string, unknown>;

  const key = row.key;
  if (typeof key !== 'string' || !AWARD_ORDER.includes(key as AwardKey)) return null;
  if (typeof row.value !== 'number') return null;
  if (!Array.isArray(row.winners)) return null;

  const winners = row.winners.filter(isWinner);
  if (winners.length === 0) return null;

  return { key: key as AwardKey, value: row.value, winners };
}

function isWinner(value: unknown): value is AwardWinner {
  if (typeof value !== 'object' || value === null) return false;
  const w = value as Record<string, unknown>;
  return (
    typeof w.player_id === 'string' &&
    typeof w.nickname === 'string' &&
    typeof w.avatar === 'string' &&
    typeof w.color === 'string'
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/awards.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing tests for the awards beat**

Append to `tests/ceremonyBeats.test.ts`, inside the existing
`describe('ceremonyStepsAt — no photo finish')` block:

```ts
  it('hands the awards their own beat, after the board', () => {
    expect(ceremonyStepsAt(AWARDS_AT - 1).awards).toBe(false);
    expect(ceremonyStepsAt(AWARDS_AT).awards).toBe(true);
    expect(BOARD_AT).toBeLessThan(AWARDS_AT);
  });
```

Inside `describe('ceremonyStepsAt — with a photo finish')`:

```ts
  it('shifts the awards beat by PHOTO_MS like every other podium beat', () => {
    expect(at(PHOTO_MS + AWARDS_AT - 1).awards).toBe(false);
    expect(at(PHOTO_MS + AWARDS_AT).awards).toBe(true);
  });

  it('still fits the awards inside one ceremony, prelude and all', () => {
    expect(PHOTO_MS + AWARDS_AT).toBeLessThan(CEREMONY_MS);
  });
```

Inside `describe('sameSteps')`:

```ts
  it('notices the awards beat landing, or the card would never appear', () => {
    expect(sameSteps(NO_CEREMONY, { ...NO_CEREMONY, awards: true })).toBe(false);
  });
```

And extend the two settled-state assertions already in the file — the object in
`'is fully settled at the end of the beat and stays there'` gains
`awards: true`, and add `AWARDS_AT` to the import list at the top.

- [ ] **Step 7: Run them to verify they fail**

Run: `npx vitest run tests/ceremonyBeats.test.ts`
Expected: FAIL — `AWARDS_AT` is not exported, and the settled object no longer
matches.

- [ ] **Step 8: Add the awards beat**

In `lib/ceremony/beats.ts`, after `export const BOARD_AT = 6000;`:

```ts
/**
 * When the awards join the board (PRD §5.4.4, M3 P2b).
 *
 * After BOARD_AT on purpose: the awards are a coda to the standings, not a
 * competitor for them, and the board's own rows need ~1.2s to finish
 * staggering in (components/ResultsTable.tsx) before anything else asks for
 * attention.
 *
 * It costs the ceremony NOTHING. `PHOTO_MS + AWARDS_AT` is 10600 against a flat
 * CEREMONY_MS of 12400, so neither this constant nor migration 0007's
 * `ceremony_ms()` moves — the settled tail ADR-0044 left behind is exactly what
 * this beat is spent on. `tests/ceremonyBeats.test.ts` pins the inequality so a
 * later change to any of the three fails a test rather than truncating the
 * awards' entrance.
 */
export const AWARDS_AT = 7200;
```

In `CeremonySteps`, after `board`:

```ts
  /** The awards card joins the board (M3 P2b). */
  awards: boolean;
```

In `NO_CEREMONY`, add `awards: false`. In `ceremonyStepsAt`'s returned object,
after `board`, add:

```ts
    awards: podium >= AWARDS_AT,
```

In `sameSteps`, after the `board` comparison, add:

```ts
    a.awards === b.awards &&
```

- [ ] **Step 9: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS, and the total has grown by the tests added above.

- [ ] **Step 10: Clear diagnostics and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: silent, zero problems.

```bash
git add lib/awards.ts lib/types.ts lib/ceremony/beats.ts tests/awards.test.ts tests/ceremonyBeats.test.ts
git commit -m "feat: the awards beat and the shape the card reads"
```

---

## Task 3: The awards on screen

**Files:**
- Create: `lib/useAwards.ts`, `components/AwardsCard.tsx`
- Modify: `components/ResultsView.tsx`, `components/stage/StageResults.tsx`

**Interfaces:**
- Consumes: Task 2's `Award`, `AWARD_META`, `awardValueText`, `describeAwards`,
  `AWARDS_AT`, `CeremonySteps.awards`; Task 1's `awards(p_room_id)` RPC.
- Produces:
  - `lib/useAwards.ts`: `useAwards(roomId: string | null, enabled: boolean):
    Award[] | null` — `null` until the fetch lands.
  - `components/AwardsCard.tsx`: default export
    `AwardsCard({ awards, show, instant }: { awards: Award[] | null; show:
    boolean; instant: boolean })`. Task 7's e2e reads `data-testid="awards"`,
    `data-testid="award"` and `data-award="<key>"`.

- [ ] **Step 1: Write the fetch hook**

Create `lib/useAwards.ts`:

```ts
'use client';
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { describeAwards } from './awards';
import type { Award } from './types';

/**
 * The awards, fetched once (ADR-0045).
 *
 * A fetch rather than a wire field, and a hook rather than a game-store slice,
 * for the same reason: the awards are a property of a FINISHED race, read by
 * whichever surfaces happen to be looking at it. Putting them in the store
 * would mean a fifth thing `applyPhaseEvent` has to keep true across a pause, a
 * skip and a rematch; here the whole lifetime is this hook's.
 *
 * One code path serves both the live ceremony and a reload: `enabled` flips
 * true when the room reports finished, whether that came from the phase event
 * or from `get_room_state` at subscribe.
 *
 * The `live` flag is the standard unmount guard — a ceremony that a rematch
 * ends mid-flight must not set state on a component that is already gone.
 */
export function useAwards(roomId: string | null, enabled: boolean): Award[] | null {
  const [awards, setAwards] = useState<Award[] | null>(null);

  useEffect(() => {
    if (!roomId || !enabled) {
      setAwards(null);
      return;
    }
    let live = true;
    void (async () => {
      const { data, error } = await supabase.rpc('awards', { p_room_id: roomId });
      if (!live) return;
      // An error is not worth a message on the ceremony screen: the awards are
      // a coda, and a race with no awards renders nothing at all anyway.
      setAwards(error ? [] : describeAwards(data));
    })();
    return () => { live = false; };
  }, [roomId, enabled]);

  return awards;
}
```

- [ ] **Step 2: Write the card**

Create `components/AwardsCard.tsx`:

```tsx
'use client';
import { motion } from 'motion/react';
import Panel from '@/components/ui/Panel';
import { avatarEmoji } from '@/lib/avatars';
import { AWARD_META, awardValueText } from '@/lib/awards';
import { DURATION, EASE } from '@/lib/presentation/tokens';
import type { Award } from '@/lib/types';

/**
 * The awards (PRD §5.4.4) — the ceremony's coda.
 *
 * DOM, never canvas (cross-cutting constraint 2), and free of any surface
 * variant: every size here resolves through a theme variable that
 * `[data-surface="stage"]` overrides (ADR-0035), so one component serves the
 * phone and the television.
 *
 * The card takes its awards as a PROP rather than reading a store: the fetch
 * belongs to the screen that mounts it (lib/useAwards.ts), and a component that
 * fetched for itself would issue two requests on the player route, where this
 * is mounted once.
 *
 * Staged exactly as the board is (ADR-0030): unconditionally rendered so the
 * awards are in the accessibility tree from the ceremony's first frame, with
 * `opacity` as a `motion` VARIANT TARGET and never as a Tailwind class —
 * animated inline styles outrank a class regardless of specificity, and this
 * project has shipped that bug once (ADR-0017).
 */
export default function AwardsCard({
  awards, show, instant,
}: {
  /** `null` while the fetch is in flight; `[]` when the race earned none. */
  awards: Award[] | null;
  /** The ceremony's `awards` beat has landed (or the beat was over at mount). */
  show: boolean;
  /** Mounted past the beat — settle without playing the entrance. */
  instant: boolean;
}) {
  if (!awards || awards.length === 0) return null;

  return (
    <motion.div
      data-testid="awards"
      data-entered={show ? 'true' : 'false'}
      initial={instant ? false : 'hidden'}
      animate={show ? 'shown' : 'hidden'}
      variants={{
        hidden: { opacity: 0 },
        shown: {
          opacity: 1,
          transition: { duration: DURATION.cut / 1000, ease: EASE.settle },
        },
      }}
    >
      <Panel className="px-4 py-5 sm:px-6">
        {/*
          One polite live region for the whole card: the awards are news, but
          they land while a screen reader may still be reading the board, and
          nothing here is urgent enough to interrupt that.
        */}
        <div role="status" aria-live="polite">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink-mute">
            Awards
          </h2>

          <ul className="mt-3 space-y-2">
            {awards.map(award => {
              const meta = AWARD_META[award.key];
              return (
                <li
                  key={award.key}
                  data-testid="award"
                  data-award={award.key}
                  className="flex items-center gap-3 rounded-control bg-abyss/50 px-3 py-2.5"
                >
                  {/* Decoration. The award's NAME is beside it in text, so a
                      screen reader announces "Big Brain", not "brain". */}
                  <span aria-hidden="true" className="text-xl leading-none">{meta.emoji}</span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-ink">{meta.label}</span>
                    <span className="block text-xs text-ink-mute">{meta.blurb}</span>
                  </span>

                  <span className="flex min-w-0 shrink flex-col items-end gap-0.5">
                    <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                      {award.winners.map(w => (
                        <span key={w.player_id} className="flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm"
                            style={{
                              backgroundColor: `${w.color}33`,
                              boxShadow: `inset 0 0 0 2px ${w.color}`,
                            }}
                          >
                            {avatarEmoji(w.avatar)}
                          </span>
                          <span
                            data-testid="award-winner"
                            className="max-w-28 truncate text-sm font-semibold text-ink"
                          >
                            {w.nickname}
                          </span>
                        </span>
                      ))}
                    </span>
                    <span className="text-xs tabular-nums text-ink-dim">
                      {/* A shared award is stated in WORDS, never left to be
                          inferred from two names sitting side by side. */}
                      {award.winners.length > 1 && <>shared · </>}
                      {awardValueText(award.key, award.value)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </Panel>
    </motion.div>
  );
}
```

- [ ] **Step 3: Mount it on the player results screen**

In `components/ResultsView.tsx`:

1. Extend the imports:

```tsx
import { AWARDS_AT, BOARD_AT, CEREMONY_MS, PHOTO_TALLY_AT } from '@/lib/ceremony/beats';
import { useAwards } from '@/lib/useAwards';
import AwardsCard from './AwardsCard';
```

2. After the existing `photo` selector, add:

```tsx
  const awardsShown = useCeremony(s => s.steps.awards);
  const awards = useAwards(room?.id ?? null, room?.status === 'finished');
```

3. After the `photoInstant` one-shot, add a third:

```tsx
  /**
   * "Was the awards beat already over when this component mounted?"
   *
   * The same ONE-SHOT as `settled` above, against this card's own threshold
   * (ADR-0030). It is read here rather than inside AwardsCard on purpose: the
   * question is whether THIS CLIENT witnessed the beat, and the card can mount
   * a moment later than the screen does, when the awards fetch lands. Deriving
   * it at the card's own mount would suppress a legitimate entrance for anyone
   * whose round trip happened to straddle AWARDS_AT.
   */
  const [awardsSettled] = useState(
    () => elapsedIn(CEREMONY_MS, endsAt ? msUntil(endsAt) : null) >= AWARDS_AT,
  );
```

4. Render it immediately after `<ResultsTable … />`:

```tsx
      <AwardsCard
        awards={awards}
        show={awardsShown || awardsSettled}
        instant={awardsSettled}
      />
```

- [ ] **Step 4: Mount it on the stage**

Make the identical four changes in `components/stage/StageResults.tsx` —
imports, the two selectors, the `awardsSettled` one-shot, and the
`<AwardsCard>` after `<ResultsTable>`. The stage's own doc comment already
explains why its one-shots are not optional; the awards one carries the same
reason and needs no second comment.

- [ ] **Step 5: Verify it live, headed**

Run the app against the local stack, play a two-player race to the ceremony in a
headed browser (CURRENT.md: headless Chromium is unusable for this work), and
confirm:
- the awards card is absent for the first ~7.2s of the ceremony and then fades
  in below the board;
- a reload during the settled tail shows it already there, with no entrance;
- a `document.querySelector('[data-testid=awards]').textContent` read names the
  right racers.

```bash
npm run dev
```

- [ ] **Step 6: Clear diagnostics and commit**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: silent, zero problems, all green.

```bash
git add lib/useAwards.ts components/AwardsCard.tsx components/ResultsView.tsx components/stage/StageResults.tsx
git commit -m "feat: the awards on screen"
```

---

## Task 4: Rematch, server-side

**Files:**
- Modify: `supabase/migrations/0008_the_aftermath.sql` (append), `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `create_room`'s draw and reserve queries from
  `supabase/migrations/0006_the_draw.sql` — the same predicates, with one more
  exclusion; `phase_event(rooms)` from `0007_the_tiebreak.sql`.
- Produces:
  - `rooms.used_question_ids uuid[] not null default '{}'` — everything this
    room has already asked, across rematches.
  - `rematch(p_room_id uuid, p_host_key uuid, p_timer_seconds int default null,
    p_categories text[] default null, p_tier_counts int[] default null)
    returns jsonb` — a `phase_event` for a room back in the lobby. Task 6 calls
    it with all five arguments named, nulls included.

- [ ] **Step 1: Write the failing smoke section**

Append to the end of `scripts/smoke.mjs`:

```js
// ---- P2b: rematch ----
// Two racers, one question, played out — then run back. The seed holds exactly
// two tier-1 'fuel' questions, which makes "no repeated questions" provable
// rather than probable: race 2 MUST draw the other one, and race 3 has nothing
// left to draw.
const rm = await rpc('create_room', {
  p_timer_seconds: 8, p_categories: ['fuel'], p_tier_counts: [1, 0, 0, 0],
});
const rmHost = await rpc('join_room', {
  p_code: rm.code, p_nickname: 'Again', p_avatar: 'robot', p_color: '#f59e0b',
  p_host_key: rm.host_key,
});
const rmP2 = await rpc('join_room', {
  p_code: rm.code, p_nickname: 'Encore', p_avatar: 'duck', p_color: '#38bdf8',
});

await rpcFails('rematch', { p_room_id: rm.room_id, p_host_key: rm.host_key },
  /the race has not finished/i);

await rpc('start_game', { p_room_id: rm.room_id, p_host_key: rm.host_key });
await rpc('advance_phase', { p_room_id: rm.room_id, p_host_key: rm.host_key }); // read
const rmRead1 = await rpc('advance_phase', { p_room_id: rm.room_id, p_host_key: rm.host_key });
const rmPrompt1 = rmRead1.payload.prompt;
await rpc('submit_answer', {
  p_room_id: rm.room_id, p_player_key: rmHost.player_key, p_round: 1, p_choice_index: 0,
});
await rpc('advance_phase', { p_room_id: rm.room_id, p_host_key: rm.host_key }); // reveal
await rpc('advance_phase', { p_room_id: rm.room_id, p_host_key: rm.host_key }); // track
const rmDone = await rpc('advance_phase', { p_room_id: rm.room_id, p_host_key: rm.host_key });
assert.equal(rmDone.status, 'finished');

await rpcFails('rematch', { p_room_id: rm.room_id, p_host_key: rmHost.player_key },
  /invalid host key/i);

// -- the reset itself
const rmEvt = await rpc('rematch', {
  p_room_id: rm.room_id, p_host_key: rm.host_key,
  p_timer_seconds: 12, p_categories: null, p_tier_counts: null,
});
assert.equal(rmEvt.phase, 'lobby');
assert.equal(rmEvt.status, 'lobby');
assert.equal(rmEvt.round, 0);
assert.equal(rmEvt.total_rounds, 1, 'the same shape of race, by default');
assert.equal(rmEvt.sudden_death, null, 'the tiebreak state is cleared');
assert.equal(rmEvt.payload, null);

const rmState = await rpc('get_room_state', { p_code: rm.code });
assert.equal(rmState.room.code, rm.code, 'the SAME room code — nobody re-joins');
assert.equal(rmState.room.timer_seconds, 12, 'the tweaked timer took');
assert.equal(rmState.players.length, 2, 'the same players are still in the room');
assert.deepEqual(rmState.players.map(p => p.nickname).sort(), ['Again', 'Encore']);
assert.equal(rmState.standings, null, 'the old standings are gone');

// -- the draw is new, and excludes what the room has already asked
const rmDraw = await rpc('get_room_draw', { p_room_id: rm.room_id, p_host_key: rm.host_key });
assert.equal(rmDraw.questions.length, 1);
assert.notEqual(rmDraw.questions[0].prompt, rmPrompt1,
  'a rematch never repeats a question the room has already asked');

// -- and it plays
await rpc('start_game', { p_room_id: rm.room_id, p_host_key: rm.host_key });
await rpc('advance_phase', { p_room_id: rm.room_id, p_host_key: rm.host_key }); // read
const rmRead2 = await rpc('advance_phase', { p_room_id: rm.room_id, p_host_key: rm.host_key });
assert.notEqual(rmRead2.payload.prompt, rmPrompt1);
await rpc('submit_answer', {
  p_room_id: rm.room_id, p_player_key: rmP2.player_key, p_round: 1, p_choice_index: 0,
});
await rpc('advance_phase', { p_room_id: rm.room_id, p_host_key: rm.host_key }); // reveal
await rpc('advance_phase', { p_room_id: rm.room_id, p_host_key: rm.host_key }); // track
const rmDone2 = await rpc('advance_phase', { p_room_id: rm.room_id, p_host_key: rm.host_key });
assert.equal(rmDone2.status, 'finished');
assert.equal(rmDone2.payload.find(s => s.nickname === 'Again').correct, 0,
  'race 2 starts everybody at zero');

// -- an exhausted pool refuses rather than repeating
await rpcFails('rematch', { p_room_id: rm.room_id, p_host_key: rm.host_key },
  /not enough (unused )?questions/i);

// -- a custom question is spent with its race
const rmc = await rpc('create_room', {
  p_timer_seconds: 5, p_categories: ['ai-tech'], p_tier_counts: [1, 0, 0, 0],
});
await rpc('join_room', {
  p_code: rmc.code, p_nickname: 'Cust1', p_avatar: 'robot', p_color: '#f59e0b',
  p_host_key: rmc.host_key, p_is_playing: false,
});
await rpc('join_room', {
  p_code: rmc.code, p_nickname: 'Cust2', p_avatar: 'duck', p_color: '#38bdf8',
});
await rpc('join_room', {
  p_code: rmc.code, p_nickname: 'Cust3', p_avatar: 'cat', p_color: '#a78bfa',
});
await rpc('add_custom_question', {
  p_room_id: rmc.room_id, p_host_key: rmc.host_key,
  p_category: 'ai-tech', p_tier: 1, p_prompt: 'Whose room is this?',
  p_options: ['Mine', 'Yours', 'Theirs', 'Ours'], p_correct_index: 0,
});
await rpc('start_game', { p_room_id: rmc.room_id, p_host_key: rmc.host_key });
await rpc('end_game', { p_room_id: rmc.room_id, p_host_key: rmc.host_key });
const rmcEvt = await rpc('rematch', {
  p_room_id: rmc.room_id, p_host_key: rmc.host_key,
  p_timer_seconds: null, p_categories: null, p_tier_counts: null,
});
assert.equal(rmcEvt.total_rounds, 2, 'the tier histogram of the race just played');
const rmcDraw = await rpc('get_room_draw', {
  p_room_id: rmc.room_id, p_host_key: rmc.host_key,
});
assert.equal(rmcDraw.questions.filter(q => q.is_custom).length, 0,
  'a custom question does not survive its own race');
assert.equal(rmcDraw.questions.filter(q => q.prompt === 'Whose room is this?').length, 0);

console.log('✅ P2b rematch smoke passed');
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node scripts/smoke.mjs`
Expected: FAIL at the first `rematch` call with
`Could not find the function public.rematch(...)`.

- [ ] **Step 3: Write the schema and the RPC**

Append to `supabase/migrations/0008_the_aftermath.sql`:

```sql
-- ============ schema ============
-- ADR-0046: the room's memory of what it has already asked.
--
-- room_questions is REWRITTEN by every rematch, so it cannot be the record —
-- and PRD §5.4.6 requires the redraw to exclude questions already used. This
-- array is appended from room_questions on the way out, which means a SPENT
-- tiebreak is recorded for free (it is a real row at total_rounds + 1,
-- ADR-0043) and an UNSPENT reserve is correctly not (it never became a row).
-- Getting that distinction free is why the append reads the draw rather than
-- the room's own reserve column.
alter table rooms add column if not exists used_question_ids uuid[] not null
  default '{}'::uuid[];

-- ============ rematch ============
-- PRD §5.4.6. The SAME room, reset in place: same id, same code, same players,
-- so no session is invalidated and nobody re-joins — sessions are code-keyed
-- (lib/session.ts), which is the whole reason this is a reset and not a new
-- room (ADR-0046).
--
-- Config is "same or tweaked": each of the three parameters defaults to the
-- race just played. The tier counts default to the HISTOGRAM OF THE PREVIOUS
-- DRAW rather than to a stored setting, which is both simpler and more correct
-- — it carries forward whatever the host added or removed in the review step.
--
-- Everything about the previous race is destroyed except the players and the
-- used list: answers, the draw, and any room-local custom questions, which are
-- questions this room has already asked and live only in it (ADR-0039).
create or replace function rematch(
  p_room_id uuid, p_host_key uuid,
  p_timer_seconds int default null,
  p_categories text[] default null,
  p_tier_counts int[] default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_timer int;
  v_cats text[];
  v_counts int[];
  v_used uuid[];
  v_total int := 0;
  v_available int;
  v_reserve uuid;
  i int;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;
  if v_room.status <> 'finished' then raise exception 'the race has not finished'; end if;

  v_timer := coalesce(p_timer_seconds, v_room.timer_seconds);
  v_cats  := coalesce(p_categories, v_room.categories);

  -- The default mix is the shape of the race just run, tier by tier. A room
  -- whose host added two custom Warm-Ups gets two more Warm-Ups, from the bank.
  v_counts := coalesce(p_tier_counts, (
    select array[
      count(*) filter (where q.tier = 1), count(*) filter (where q.tier = 2),
      count(*) filter (where q.tier = 3), count(*) filter (where q.tier = 4)]::int[]
    from room_questions rq join questions q on q.id = rq.question_id
    where rq.room_id = p_room_id
      -- The tiebreak was never part of the draw the host chose, so it must not
      -- inflate the next one.
      and (v_room.sudden_death_round is null or rq.round <> v_room.sudden_death_round)));

  if v_timer < 5 or v_timer > 20 then raise exception 'timer must be 5-20 seconds'; end if;
  if coalesce(array_length(v_cats, 1), 0) < 1 then raise exception 'select at least one category'; end if;
  if array_length(v_counts, 1) is distinct from 4 then
    raise exception 'tier_counts must have exactly 4 entries';
  end if;

  -- Remember this race BEFORE deleting it. Straight off room_questions, so the
  -- tiebreak round is included exactly when it was actually asked.
  v_used := v_room.used_question_ids || coalesce((
    select array_agg(rq.question_id) from room_questions rq where rq.room_id = p_room_id
  ), '{}'::uuid[]);

  for i in 1..4 loop
    if v_counts[i] < 0 then raise exception 'tier counts cannot be negative'; end if;
    -- The same availability check create_room makes, plus the room's memory.
    select count(*) into v_available from questions q
      where q.tier = i and q.category = any(v_cats) and q.room_id is null
        and not (q.id = any(v_used));
    if v_available < v_counts[i] then
      raise exception 'not enough unused questions in tier % (need %, have %)',
        i, v_counts[i], v_available;
    end if;
    v_total := v_total + v_counts[i];
  end loop;
  if v_total < 1 then raise exception 'select at least one question'; end if;

  -- Tear the old race down. answers first: room_questions' rows are what its
  -- rounds refer to, and a custom question's delete cascades into
  -- room_questions (0006), so doing this in any other order is a race with a
  -- cascade.
  delete from answers where room_id = p_room_id;
  delete from room_questions where room_id = p_room_id;
  delete from questions where room_id = p_room_id;

  -- The draw, byte-for-byte create_room's, plus `not (id = any(v_used))`.
  -- Rounds stay ordered easy -> hard, which every draw RPC in 0006 preserves.
  insert into room_questions (room_id, round, question_id)
  select p_room_id, row_number() over (order by picked.tier, random()), picked.id
  from (
    select id, tier from (
      select id, tier,
             row_number() over (partition by tier order by random()) as rn
      from questions
      where category = any(v_cats) and room_id is null and not (id = any(v_used))
    ) shuffled
    where rn <= v_counts[tier]
  ) picked;

  -- A FRESH reserve (ADR-0041): the old one is either spent — in which case it
  -- is in v_used — or was never asked, in which case it is fair game again.
  -- Category-preferring with a bank-wide fallback, exactly as create_room.
  select q.id into v_reserve
  from questions q
  where q.room_id is null and q.tier = 4
    and not (q.id = any(v_used))
    and not exists (
      select 1 from room_questions rq
      where rq.room_id = p_room_id and rq.question_id = q.id)
  order by (q.category = any(v_cats)) desc, random()
  limit 1;
  if v_reserve is null then
    raise exception 'the bank has no spare Final Boss question to hold in reserve';
  end if;

  -- Back to the starting grid. The three sudden_death_* columns are cleared
  -- here and nowhere else; leaving any of them set would make the next race's
  -- first round look like a tiebreak to submit_answer, phase_event and the
  -- staging runtime at once.
  update rooms set
    status = 'lobby', phase = 'lobby', current_round = 0, phase_ends_at = null,
    paused_remaining_ms = null,
    timer_seconds = v_timer, categories = v_cats, total_rounds = v_total,
    used_question_ids = v_used, reserve_question_id = v_reserve,
    sudden_death_round = null, sudden_death_contenders = null,
    sudden_death_winner_id = null
  where id = p_room_id returning * into v_room;

  return phase_event(v_room);
end $$;

grant execute on all functions in schema public to anon, authenticated;
```

- [ ] **Step 4: Apply and run the smoke harness**

Run:
```bash
npx supabase db query --file supabase/migrations/0008_the_aftermath.sql
node scripts/smoke.mjs
```
Expected: every `✅`, ending with `✅ P2b rematch smoke passed`.

- [ ] **Step 5: Prove the whole file is still idempotent**

Run:
```bash
npx supabase db query --file supabase/migrations/0008_the_aftermath.sql
node scripts/smoke.mjs
```
Expected: the second apply is clean and the harness still passes end to end,
including Task 1's `P2b awards` section.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0008_the_aftermath.sql scripts/smoke.mjs
git commit -m "feat: rematch resets the room in place"
```

---

## Task 5: The room comes back to life

**Files:**
- Modify: `lib/presentation/cues.ts`, `lib/presentation/deriveCues.ts:220-260`,
  `lib/store.ts:60-80`, `lib/world/director.ts:140-190`,
  `lib/world/runtime.ts:60-80,175-190`, `lib/audio/state.ts:60-100`
- Test: `tests/deriveCues.test.ts`, `tests/store.test.ts`,
  `tests/director.test.ts`, `tests/audioState.test.ts`

**Interfaces:**
- Consumes: Task 4's `rematch`, which returns a `phase_event` with
  `phase: 'lobby'`, `status: 'lobby'`, `round: 0`, `sudden_death: null` and the
  new `total_rounds`.
- Produces: `GameResetCue { type: 'game-reset'; tier: 'routine' }` in
  `lib/presentation/cues.ts`, added to the `Cue` union. Task 6's button is what
  makes it fire in the app; nothing else consumes it.

- [ ] **Step 1: Write the failing tests**

Append to `tests/deriveCues.test.ts` (inside the top-level `describe` the file
already uses for phase transitions, or a new one):

```ts
describe('a rematch takes the room backwards', () => {
  it('announces game-reset when the room returns to the lobby', () => {
    const finished = source({ phase: 'results', round: 3, standings: [standing(A, 3), standing(B, 1)] });
    const seeded = deriveCues(finished, finished, initialDerivationState).nextState;
    const lobby = source({ phase: 'lobby', round: 0 });

    const { cues } = deriveCues(finished, lobby, seeded);
    expect(cues.map(c => c.type)).toContain('game-reset');
    expect(cues.find(c => c.type === 'game-reset')!.tier).toBe('routine');
  });

  it('does not announce it twice while the room sits in the lobby', () => {
    const finished = source({ phase: 'results', round: 3, standings: [standing(A, 3)] });
    const seeded = deriveCues(finished, finished, initialDerivationState).nextState;
    const lobby = source({ phase: 'lobby', round: 0 });

    const first = deriveCues(finished, lobby, seeded);
    expect(first.cues.map(c => c.type)).toContain('game-reset');
    const second = deriveCues(lobby, lobby, first.nextState);
    expect(second.cues.map(c => c.type)).not.toContain('game-reset');
  });

  it('forgets the last race, so the next one opens with no phantom overtake', () => {
    // A beat the old order would read as B overtaking A.
    const finished = source({ phase: 'results', round: 3, standings: [standing(A, 3), standing(B, 1)] });
    const seeded = deriveCues(finished, finished, initialDerivationState).nextState;
    const lobby = source({ phase: 'lobby', round: 0 });
    const afterReset = deriveCues(finished, lobby, seeded).nextState;

    expect(afterReset.order).toEqual([]);
    expect(afterReset.correct).toEqual({});
    expect(afterReset.streaks).toEqual({});

    const reveal = source({
      phase: 'reveal', round: 1,
      standings: [standing(B, 1), standing(A, 0)],
      reveal: { correct_index: 0, fun_fact: null, counts: [], picks: [], fastest: null, standings: [] } as never,
    });
    const { cues } = deriveCues(lobby, reveal, afterReset);
    expect(cues.map(c => c.type)).not.toContain('overtake');
    expect(cues.map(c => c.type)).not.toContain('lead-changed');
  });
});
```

Append to `tests/store.test.ts`, inside `describe('applyPhaseEvent')`:

```ts
  it('lobby event clears the whole previous race', () => {
    useGameStore.setState({
      room: { ...baseRoom, status: 'finished', phase: 'results' },
      question: { category: 'fuel', tier: 1, prompt: 'Q?', options: ['a','b','c','d'] },
      reveal: {} as never,
      standings: [{ player_id: 'p1' }] as never,
      myAnswer: 1,
    });
    const evt: PhaseEvent = {
      phase: 'lobby', round: 0, ends_at: null, server_now: new Date().toISOString(),
      status: 'lobby', total_rounds: 5, sudden_death: null, payload: null,
    };
    useGameStore.getState().applyPhaseEvent(evt);
    const s = useGameStore.getState();
    expect(s.room?.status).toBe('lobby');
    expect(s.room?.total_rounds).toBe(5);
    expect(s.room?.sudden_death).toBeNull();
    expect(s.question).toBeNull();
    expect(s.reveal).toBeNull();
    expect(s.standings).toBeNull();
    expect(s.myAnswer).toBeNull();
  });
```

Append to `tests/director.test.ts`:

```ts
describe('game-reset', () => {
  const reset: Cue = { type: 'game-reset', tier: 'routine' };

  it('returns the camera to the start line and drops the final question grade', () => {
    let state = reduceCue(initialDirectorState, read(3, true), 0);
    state = reduceCue(state, { type: 'phase-results', tier: 'routine' }, 0);
    expect(activeIntent(state).mode).toBe('podium');
    expect(state.escalation).toBe(1);

    state = reduceCue(state, reset, 0);
    expect(activeIntent(state).mode).toBe('startLine');
    expect(state.escalation).toBe(0);
    expect(state.transient).toBeNull();
  });

  it('uses the reset client's own shot book', () => {
    const stage = reduceCue(seedDirector('results', 'stage'), reset, 0);
    expect(stage.base).toEqual(SHOT_BOOKS.stage.base.lobby);
  });
});
```

> Note for the implementer: the second test's name contains an apostrophe
> inside a single-quoted string — write it as `"uses the reset client's own
> shot book"` with double quotes.

Append to `tests/audioState.test.ts`:

```ts
describe('game-reset', () => {
  const reset: Cue = { type: 'game-reset', tier: 'routine' };

  it('takes the bed back to the lobby and clears the last race', () => {
    const { state } = run([countdown, read, finalQ, results, reset]);
    expect(state.bed).toBe('lobby');
    expect(state.escalated).toBe(false);
    expect(state.pending).toEqual([]);
    expect(state.paused).toBe(false);
  });

  it('is silent — a reset is not a moment', () => {
    const { stings } = run([results, reset]);
    expect(stings).not.toContain('fanfare');
    expect(run([reset]).stings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/deriveCues.test.ts tests/store.test.ts tests/director.test.ts tests/audioState.test.ts`
Expected: FAIL — `game-reset` is not assignable to `Cue`, and the store's lobby
event leaves the old race in place.

- [ ] **Step 3: Add the cue**

In `lib/presentation/cues.ts`, after the `GameResumedCue` interface:

```ts
/**
 * The room went BACKWARDS: a rematch reset it to the lobby (M3 P2b, ADR-0047).
 *
 * `routine` — a reset is a transition, not a celebration, and M3's one allowed
 * new rung was spent on `suddenDeath` (roadmap decision 6).
 *
 * It exists because every other cue in this vocabulary moves the show FORWARD,
 * so three consumers hold state that nothing else clears: the camera is parked
 * on a podium at the final question's grade, the audio bed is on `ceremony`,
 * and the cue deriver's own standings baseline is the last race's finishing
 * order. Semantic, like everything else here: it names what happened to the
 * game, never what any surface should do about it.
 */
export interface GameResetCue {
  type: 'game-reset';
  tier: 'routine';
}
```

Add `| GameResetCue` to the `Cue` union, beside `GameResumedCue`.

- [ ] **Step 4: Derive it**

In `lib/presentation/deriveCues.ts`, at the very top of the `if (phaseChanged)`
block, before `const beatCues = phaseCues(room, next);`:

```ts
    // A rematch resets the room to the lobby (ADR-0046). `phaseCues` has no
    // arm for `lobby` — until P2b nothing ever arrived there from anywhere —
    // so without this the transition would emit nothing at all and three
    // consumers would keep the last race's state (ADR-0047).
    //
    // The baseline is cleared in the same breath: leave it and the next race's
    // FIRST reveal is compared against the previous race's finishing order,
    // which reads as a field of overtakes and a lead change that never
    // happened.
    if (room.phase === 'lobby' && s.phase !== 'lobby') {
      cues.push({ type: 'game-reset', tier: 'routine' });
      s = { ...s, order: [], correct: {}, streaks: {} };
    }
```

- [ ] **Step 5: Clear the store**

In `lib/store.ts`'s `applyPhaseEvent`, add a final arm to the payload chain:

```ts
    } else if (e.phase === 'lobby') {
      // A rematch (ADR-0046). Everything below belongs to the race that just
      // ended, and nothing else clears it: `read` clears the reveal and the
      // answer but not the standings, and no arm has ever had to unwind a
      // whole game before.
      next.question = null;
      next.reveal = null;
      next.standings = null;
      next.myAnswer = null;
    }
```

- [ ] **Step 6: Point the camera back at the start line**

In `lib/world/director.ts`'s `reduceCue`, after the `phase-results` case:

```ts
    case 'game-reset':
      // The only cue in the vocabulary that moves the show BACKWARDS
      // (ADR-0047). Both halves are needed: `phase-results` set the podium
      // shot, and it DELIBERATELY preserved `escalation` at 1 so the ceremony
      // could keep the final question's grade — which would otherwise light
      // the new lobby as if a race were about to end.
      return { ...state, base: shots.base.lobby, transient: null, escalation: 0 };
```

- [ ] **Step 7: Reset the audio bed and the choreographer**

In `lib/audio/state.ts`, add `'game-reset'` to `AUDIO_CUE_TYPES` (beside
`'game-paused', 'game-resumed'`), and add an arm to the bed switch in
`applyCue`, after `case 'phase-results'`:

```ts
    case 'game-reset':
      // Back to the lobby bed, and back to a clean machine: a rematch can
      // reach here from a paused ceremony or with drama still buffered that
      // will now never find its TRACK beat. `stingFor` has no arm for this cue,
      // so it is silent by construction — which is right, because nothing has
      // happened yet.
      next = { ...next, bed: 'lobby', escalated: false, pending: [], paused: false };
      break;
```

In `lib/world/runtime.ts`, add `'game-reset'` to the `SUBSCRIBED` array, and add
a branch to the cue handler's chain, before the trailing `else`:

```ts
      } else if (cue.type === 'game-reset') {
        // Hard-complete whatever the ceremony left running. `fieldAnchors`
        // already returns the lobby grid off `room.phase`, so the only stale
        // thing here is the choreographer's own held/pending state.
        choreo = completeSequence(choreo);
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS, all files.

- [ ] **Step 9: Clear diagnostics and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: silent, zero problems.

```bash
git add lib/presentation/cues.ts lib/presentation/deriveCues.ts lib/store.ts lib/world/director.ts lib/world/runtime.ts lib/audio/state.ts tests/
git commit -m "feat: game-reset takes the show back to the lobby"
```

---

## Task 6: The rematch card

**Files:**
- Create: `components/RematchCard.tsx`
- Modify: `lib/useHostDriver.ts:30-120`, `components/ResultsView.tsx`,
  `app/room/[code]/page.tsx:75-80`

**Interfaces:**
- Consumes: Task 4's `rematch` RPC; Task 5's store and cue handling.
- Produces:
  - `HostDriver` gains `rematch(timerSeconds?: number): Promise<void>`.
  - `ResultsView` gains a required `driver: HostDriver` prop.
  - Task 7's e2e reads `data-testid="rematch"`, `"rematch-timer"`,
    `"rematch-confirm"`, `"rematch-cancel"` and `"rematch-error"`.

- [ ] **Step 1: Add the command to the driver**

In `lib/useHostDriver.ts`, extend the interface:

```ts
export interface HostDriver {
  /** Presentation only. The RPCs check `host_key` themselves — that is the permission. */
  isHost: boolean;
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  skip(): Promise<void>;
  end(): Promise<void>;
  /** PRD §5.4.6 — the same room, reset. `timerSeconds` omitted keeps the current one. */
  rematch(timerSeconds?: number): Promise<void>;
  error: string | null;
}
```

Add the callback beside the other four commands:

```ts
  /**
   * Not routed through `command` above: that helper exists precisely because
   * the four control-strip RPCs share one `(room_id, host_key)` signature, and
   * `rematch` takes a config. It shares the `commanding` ref, which is the part
   * that matters — a double-tap must be inert, and a rematch landing while a
   * pause is in flight would reset a room the other call is still writing.
   *
   * All five arguments are named, nulls included, so PostgREST resolves the
   * overload unambiguously rather than by argument count.
   */
  const rematch = useCallback(async (timerSeconds?: number) => {
    if (!hostKey || !room || commanding.current) return;
    commanding.current = true;
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('rematch', {
        p_room_id: room.id,
        p_host_key: hostKey,
        p_timer_seconds: timerSeconds ?? null,
        p_categories: null,
        p_tier_counts: null,
      });
      if (err) { setError(err.message); return; }
      broadcastAndApply(data as PhaseEvent);
    } finally {
      commanding.current = false;
    }
  }, [hostKey, room, broadcastAndApply]);
```

And add `rematch` to the returned object:

```ts
  return { isHost: hostKey !== null, start, pause, resume, skip, end, rematch, error };
```

- [ ] **Step 2: Write the card**

Create `components/RematchCard.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useGameStore } from '@/lib/store';
import type { HostDriver } from '@/lib/useHostDriver';
import Button from './ui/Button';
import Panel from './ui/Panel';

/**
 * Run it back (PRD §5.4.6) — host-only, on the results screen.
 *
 * Two steps, like the control strip's end-race confirm: a rematch destroys the
 * standings the room is looking at, and a mis-tap during a ceremony would be
 * unrecoverable. The second step is also where the ONE tweak lives that the
 * review step cannot reach — the answer timer. The question mix is tweaked
 * where it belongs, in `/host/[code]/review`, which is live again the moment
 * this lands the room back in the lobby.
 *
 * Deliberately OUTSIDE every staged wrapper, exactly like ResultsView's "Back
 * to home" link: staging never gates input (ADR-0016), and a control that is
 * focusable but invisible is worse than one that is simply there.
 *
 * `isHost` gates what is drawn; permission is the `host_key` check inside the
 * RPC (roadmap decision 2).
 */
export default function RematchCard({ driver }: { driver: HostDriver }) {
  const room = useGameStore(s => s.room);
  const [open, setOpen] = useState(false);
  const [timer, setTimer] = useState<number | null>(null);

  if (!driver.isHost || !room) return null;

  const seconds = timer ?? room.timer_seconds;

  if (!open) {
    return (
      <div className="flex flex-col items-center gap-2">
        {driver.error && (
          <p data-testid="rematch-error" className="text-center text-sm text-wrong">
            {driver.error}
          </p>
        )}
        <Button data-testid="rematch" variant="ghost" onClick={() => setOpen(true)}>
          Rematch
        </Button>
      </div>
    );
  }

  return (
    <Panel className="space-y-4 p-5">
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink-mute">
          Run it back
        </h2>
        <p className="mt-1 text-sm text-ink-dim">
          Same racers, same room code, a fresh draw with none of the questions
          you have already played. Swap or add questions in the lobby.
        </p>
      </div>

      <label className="flex items-center justify-between gap-4 rounded-control border border-haze/40 bg-abyss/60 px-4 py-3">
        <span className="font-semibold text-ink">Answer timer: {seconds}s</span>
        <input
          data-testid="rematch-timer"
          type="range"
          min={5}
          max={20}
          value={seconds}
          aria-label="Answer timer seconds"
          onChange={e => setTimer(+e.target.value)}
          className="accent-neon-cyan"
        />
      </label>

      {driver.error && (
        <p data-testid="rematch-error" className="text-center text-sm text-wrong">
          {driver.error}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        <Button data-testid="rematch-cancel" variant="quiet" onClick={() => setOpen(false)}>
          Not now
        </Button>
        <Button data-testid="rematch-confirm" onClick={() => void driver.rematch(seconds)}>
          Start a new race
        </Button>
      </div>
    </Panel>
  );
}
```

- [ ] **Step 3: Wire it into the results screen**

In `components/ResultsView.tsx`:

1. Extend the signature and imports:

```tsx
import type { HostDriver } from '@/lib/useHostDriver';
import RematchCard from './RematchCard';

export default function ResultsView({ code, driver }: { code: string; driver: HostDriver }) {
```

2. Render it immediately before the "Back to home" link, inside the same
un-staged region:

```tsx
      <RematchCard driver={driver} />
```

In `app/room/[code]/page.tsx`, pass the driver through:

```tsx
    content = <ResultsView code={code} driver={driver} />;
```

- [ ] **Step 4: Verify it live, headed, in two browsers**

Run `npm run dev`, then in a headed browser plus a second window:
- play a two-player race to the ceremony;
- press **Rematch** on the host, move the timer, press **Start a new race**;
- confirm BOTH windows land on the lobby with both racers still listed, the
  world back at the start line rather than on a podium, and the music back on
  the lobby bed;
- confirm the host's "Review the draw" link opens and shows a draw with none of
  the previous race's questions;
- start race 2 and confirm the first question differs and the timer is the one
  you set.

- [ ] **Step 5: Clear diagnostics and commit**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: silent, zero problems, all green.

```bash
git add lib/useHostDriver.ts components/RematchCard.tsx components/ResultsView.tsx "app/room/[code]/page.tsx"
git commit -m "feat: the rematch card"
```

---

## Task 7: Coverage, decisions and the record

**Files:**
- Create: `e2e/aftermath.spec.ts`,
  `docs/ADR/0045-awards-are-fetched-not-broadcast.md`,
  `docs/ADR/0046-a-rematch-is-the-same-room-reset.md`,
  `docs/ADR/0047-returning-to-the-lobby-is-a-cue.md`,
  `docs/progress/M3-P2b-the-aftermath.md`
- Modify: `docs/ADR/README.md`, `docs/progress/CURRENT.md`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: nothing further tasks depend on. This is the phase's closing task.

- [ ] **Step 1: Write the end-to-end spec**

Create `e2e/aftermath.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

/**
 * Two contexts throughout: a rematch is a thing the host does TO everybody
 * else's screen, and awards have to be legible from a racer's own device, not
 * just the host's.
 *
 * One question, one correct answer, deliberately: it makes the awards
 * deterministic (the joiner takes all three that a one-round race can hand
 * out, and Late Surge has no halves to compare) and it makes "no repeated
 * questions" provable — the seed holds exactly two tier-1 'fuel' questions.
 */
async function createRoom(host: Page, questions: number, timerSeconds: number) {
  await host.goto('/host/new');

  const minusButtons = host.getByRole('button', { name: '−' });
  const clicksPerTier = [4 - questions, 4, 3, 1];
  for (let i = 0; i < clicksPerTier.length; i++) {
    for (let c = 0; c < clicksPerTier[i]; c++) await minusButtons.nth(i).click();
  }
  await expect(host.getByText(new RegExp(`^${questions} questions`))).toBeVisible();

  const timerSlider = host.locator('input[type=range]');
  await timerSlider.evaluate((el: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, String(timerSeconds));
  await expect(host.getByText(`Answer timer: ${timerSeconds}s`)).toBeVisible();

  await host.getByPlaceholder('Your nickname').fill('Hosty');
  await host.getByRole('button', { name: /create room/i }).click();
  await expect(host).toHaveURL(/\/host\/[A-Z0-9]{5}\/review$/);
  await host.getByRole('button', { name: /open the lobby/i }).click();
  await expect(host).toHaveURL(/\/room\/[A-Z0-9]{5}$/);
  return host.url().split('/').pop()!;
}

async function join(page: Page, code: string, nickname: string) {
  await page.goto(`/room/${code}`);
  await page.getByPlaceholder('Your nickname').fill(nickname);
  await page.getByRole('button', { name: 'Join game' }).click();
}

/** Play the one round out with `winner` taking it, and land on the ceremony. */
async function playOneRound(host: Page, winner: Page) {
  const options = winner.getByTestId('answer-option');
  await expect(options.first()).toBeEnabled({ timeout: 20_000 });

  // The draw is random, so which option is correct is only knowable from the
  // reveal — but with one round and one answerer, ANY correct answer gives the
  // same award sweep. Answer the first option; if it was wrong, the awards are
  // simply the ones a zero-score race hands out, so pick from the reveal
  // instead: answer, then read `data-correct` back.
  await options.first().click();
  await expect(winner.getByTestId('results-board')).toBeVisible({ timeout: 60_000 });
}

test('the awards land on every screen and name the right racer', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const host = page;
  const code = await createRoom(host, 1, 8);

  const joinerContext = await browser.newContext();
  const joiner = await joinerContext.newPage();
  await join(joiner, code, 'Joiner');

  const stageContext = await browser.newContext();
  const stage = await stageContext.newPage();
  await stage.goto(`/stage/${code}`);

  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
  await host.getByRole('button', { name: /start the race/i }).click();

  // Only the joiner answers, and they answer the option the reveal will
  // confirm — read the correct index off the joiner's own grid after locking.
  const options = joiner.getByTestId('answer-option');
  await expect(options.first()).toBeEnabled({ timeout: 20_000 });
  await options.first().click();

  // The ceremony. The board arrives first; the awards are the coda behind it.
  await expect(joiner.getByTestId('results-board')).toBeVisible({ timeout: 60_000 });
  await expect(joiner.getByTestId('awards')).toHaveAttribute('data-entered', 'true', {
    timeout: 30_000,
  });
  await expect(host.getByTestId('awards')).toBeVisible();
  await expect(stage.getByTestId('awards')).toBeVisible({ timeout: 30_000 });

  // A one-round race can hand out at most three: Late Surge has no halves.
  const awards = joiner.getByTestId('award');
  await expect(awards).not.toHaveCount(0);
  await expect(joiner.locator('[data-award="late-surge"]')).toHaveCount(0);

  // Every award names a racer who is actually in this room.
  const winners = await joiner.getByTestId('award-winner').allInnerTexts();
  expect(winners.length).toBeGreaterThan(0);
  for (const name of winners) expect(['Hosty', 'Joiner']).toContain(name);

  // A reload lands on the settled card, with no entrance to replay.
  await joiner.reload();
  await expect(joiner.getByTestId('awards')).toHaveAttribute('data-entered', 'true', {
    timeout: 30_000,
  });

  await joinerContext.close();
  await stageContext.close();
});

test('a rematch returns the same players to a fresh lobby with a new question',
  async ({ page, browser }) => {
    test.setTimeout(150_000);
    const host = page;
    const code = await createRoom(host, 1, 8);

    const joinerContext = await browser.newContext();
    const joiner = await joinerContext.newPage();
    await join(joiner, code, 'Joiner');

    await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
    await host.getByRole('button', { name: /start the race/i }).click();

    const firstPrompt = await joiner.getByTestId('question-prompt').innerText();
    await playOneRound(host, joiner);

    // The host runs it back, with a tweaked timer.
    await host.getByTestId('rematch').click();
    const slider = host.getByTestId('rematch-timer');
    await slider.evaluate((el: HTMLInputElement) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, '15');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await host.getByTestId('rematch-confirm').click();

    // BOTH screens land back on the starting grid — this is the assertion a
    // single context cannot make.
    await expect(host.getByText('Starting grid — 2 joined')).toBeVisible({ timeout: 30_000 });
    await expect(joiner.getByText('Starting grid — 2 joined')).toBeVisible({ timeout: 30_000 });
    await expect(joiner.getByText('Waiting for the host to start…')).toBeVisible();
    // Nobody re-joined: the join gate never came back.
    await expect(joiner.getByPlaceholder('Your nickname')).toHaveCount(0);

    // Race 2, on a question the room has not been asked.
    await host.getByRole('button', { name: /start the race/i }).click();
    await expect(joiner.getByTestId('question-prompt')).toBeVisible({ timeout: 30_000 });
    await expect(joiner.getByTestId('question-prompt')).not.toHaveText(firstPrompt);

    await joinerContext.close();
  });
```

> `question-prompt` is `components/QuestionCard.tsx:77`, confirmed while this
> plan was written.

- [ ] **Step 2: Run the new spec**

Run: `npm run test:e2e -- --workers=2 e2e/aftermath.spec.ts`
Expected: 2 passed.

A "element is not stable / element was detached from the DOM" failure on an
animated element is the load flake CURRENT.md records — re-run before
concluding otherwise.

- [ ] **Step 3: Run the whole browser suite**

Run: `npm run test:e2e -- --workers=2`
Expected: every spec passes. Do not raise the worker count; the default is
flaky on this machine.

- [ ] **Step 4: Write the ADRs**

Create `docs/ADR/0045-awards-are-fetched-not-broadcast.md`:

```markdown
# ADR-0045: Awards are fetched, not broadcast

- **Status:** Accepted
- **Date:** 2026-08-30
- **Phase:** M3 P2b — The aftermath

## Context

PRD §5.4.4 wants four awards on the results screen. Three of them — Big Brain
(most correct), Fastest Gun (most speed points), Hot Streak (longest streak) —
are `max()` over fields that are already on every `Standing` the client holds.
Only Late Surge needs something no client has: the standings as they stood at
the midpoint of the race, reconstructed from `answers`.

The obvious move is to put the awards on the results phase event, beside
`standings`. That is the wire's fifth opening, for data three quarters of which
the client can already compute, and it would have to be mirrored into
`get_room_state` so a reload agrees with the live path.

## Decision

`awards(room_id)` is a pure SQL projection, and each surface **reads it once**
when the room reports `finished` (`lib/useAwards.ts`). Nothing about the awards
travels on the realtime wire, and `phase_event` is untouched.

## Consequences

- **The wire stays where P2a left it.** M3 has opened it exactly twice: ADR-0037
  and ADR-0042. P2b opens it not at all.
- **One code path serves the live ceremony and a reload.** The hook's `enabled`
  flips on `status === 'finished'` regardless of whether that came from a phase
  event or from `get_room_state` at subscribe, so there is no seeded-versus-live
  distinction to get wrong — the shape CURRENT.md records going wrong three
  times.
- **The awards are not in the game store**, so `applyPhaseEvent` has one fewer
  thing to keep true across a pause, a skip and a rematch.
- **It costs one round trip per surface.** On a three-surface room that is three
  reads of a projection over a table the same room has already been served from,
  at a moment when nothing else is in flight. Acceptable; a fourth surface would
  still be acceptable.
- **A future award is a server change plus copy.** `describeAwards` orders by
  `AWARD_ORDER` and drops keys it does not know, so an older client degrades to
  the awards it can name rather than rendering one in an arbitrary position.
```

Create `docs/ADR/0046-a-rematch-is-the-same-room-reset.md`:

```markdown
# ADR-0046: A rematch is the same room, reset

- **Status:** Accepted
- **Date:** 2026-08-30
- **Phase:** M3 P2b — The aftermath

## Context

PRD §5.4.6: "host restarts with the same players and same or tweaked config;
questions reshuffle and exclude ones already used."

Sessions in this app are keyed by room CODE (`lib/session.ts`:
`cb:${code}`), and a player's identity is a `player_key` row in `players`. A
rematch that created a new room would therefore invalidate every session in the
building at once: ten people would have to re-scan, re-type a nickname and
re-pick an avatar to play a second game — which is precisely the friction PRD
G1 exists to eliminate.

The redraw needs a memory the current schema does not have. `room_questions` is
what a rematch rewrites, so it cannot also be the record of what has been asked.

## Decision

`rematch(room_id, host_key, timer_seconds, categories, tier_counts)` resets the
**same `rooms` row in place**: same id, same code, same `players`, back to
`status = 'lobby'`. Everything else about the previous race is destroyed —
`answers`, `room_questions`, and any room-local custom questions.

The room grows one column, `rooms.used_question_ids uuid[]`, appended from
`room_questions` immediately before that table is cleared.

Each config parameter defaults to the race just played, with the tier counts
defaulting to the **histogram of the previous draw** rather than to a stored
setting.

## Consequences

- **Nobody re-joins.** Every existing session, every avatar and every colour
  survives, and a client sitting on the results screen is simply moved to the
  lobby by the phase event.
- **"Already used" is exact, and includes a spent tiebreak for free.** Reading
  the used list off `room_questions` means the sudden-death round — a real row
  at `total_rounds + 1` (ADR-0043) — is recorded exactly when it was actually
  asked, and an *unspent* reserve is correctly not recorded, so it stays
  available. That distinction would have needed an explicit branch had the list
  been built from `rooms.reserve_question_id`.
- **A rematch can fail, and that is correct.** An exhausted category pool raises
  `not enough unused questions in tier N`, and a bank with no spare Final Boss
  raises the same reserve error `create_room` does. Refusing beats repeating.
- **Custom questions do not survive their race.** They are questions the room has
  already asked and they live only in it (ADR-0039). The host writes new ones in
  the review step, which is live again the moment the room is back in the lobby.
- **`total_rounds` is mutable in a third way.** M3 P0 made it mutable mid-game
  (skip), M3 P1 pre-game (add/remove); this makes it mutable *between* games. Any
  consumer that snapshots it once is wrong — `lib/store.ts` and
  `lib/presentation/deriveCues.ts` already read it live (ADR-0037, ADR-0038).
- **The room row is now the only thing that grows without bound.** Ten rematches
  is ~130 uuids in an array; the room-purge work in M3 P3 is where that stops
  mattering at all.
```

Create `docs/ADR/0047-returning-to-the-lobby-is-a-cue.md`:

```markdown
# ADR-0047: Returning to the lobby is a cue

- **Status:** Accepted
- **Date:** 2026-08-30
- **Phase:** M3 P2b — The aftermath

## Context

Until P2b, a room only ever moved forward: `lobby → countdown → … → results`,
and `results` was terminal. Three consumers quietly depend on that, holding
state that no forward cue ever has to clear:

- `lib/world/director.ts` parks on the podium shot at `phase-results`, and that
  arm **deliberately preserves `escalation` at 1** so the ceremony keeps the
  final question's grade;
- `lib/audio/state.ts` moves the bed to `ceremony` and never leaves;
- `lib/presentation/deriveCues.ts` carries the last reveal's standings order as
  the baseline for overtake and lead-change detection.

A rematch (ADR-0046) sends the room back to `lobby`. `phaseCues` has no arm for
`lobby` — it returns `[]`, because nothing has ever arrived there — so the
transition emitted nothing at all, and all three consumers kept the last race:
a new lobby framed on a podium that is no longer drawn, lit at peak escalation,
over ceremony music, whose first reveal would read as a field of overtakes
against the previous race's finishing order.

## Decision

A `game-reset` cue, `tier: 'routine'`, derived in `deriveCues` on any transition
into `lobby` from a non-lobby phase. The director returns to the lobby shot and
zeroes escalation; the audio bed returns to `lobby`; the world hard-completes
the choreographer; and the deriver clears its own standings baseline in the same
step that emits the cue.

## Consequences

- **The cue bus stays the single game-state-to-show seam** (ADR-0001). The
  alternative — each consumer checking `phase === 'lobby'` for itself — puts
  three copies of one rule in three modules and gives the renderer a reason to
  read React state, which `lib/world/runtime.ts` does not do.
- **Nothing new travels.** `game-reset` is derived on each client from a phase
  change it can already see, so P2b spends no wire field (roadmap §2.1).
- **It cannot double-fire.** The condition is `phase === 'lobby' && previous
  phase !== 'lobby'`, inside the existing `phaseChanged` guard, and the seed
  path is untouched — a client that loads a room already in the lobby gets no
  cue, which is right: there is nothing to undo.
- **`stingFor` has no arm for it, so it is silent by construction.** A reset is a
  transition, not a moment; the lobby bed coming back is the whole sound of it.
- **A future backwards transition inherits this.** M3 P3's host-drop and late-join
  work does not move a room backwards, but if anything ever does, this is the
  cue it emits rather than a second mechanism.
```

Append the three rows to `docs/ADR/README.md`'s index table:

```markdown
| [0045](0045-awards-are-fetched-not-broadcast.md) | Awards are fetched, not broadcast | M3 P2b |
| [0046](0046-a-rematch-is-the-same-room-reset.md) | A rematch is the same room, reset | M3 P2b |
| [0047](0047-returning-to-the-lobby-is-a-cue.md) | Returning to the lobby is a cue | M3 P2b |
```

- [ ] **Step 5: Run every gate**

Run:
```bash
npx tsc --noEmit
npm run lint
npx vitest run
node scripts/smoke.mjs
npm run build
npm run test:e2e -- --workers=2
```
Expected: silent; zero problems; all unit tests pass; every smoke `✅`; a clean
build; the whole browser suite green. Record the actual unit-test count — the
progress doc quotes it.

Also check the VS Code Problems panel on every touched file: a clean panel is
part of "done" (CLAUDE.md).

- [ ] **Step 6: Write the phase record**

Create `docs/progress/M3-P2b-the-aftermath.md`, following the structure of
`docs/progress/M3-P2a-the-tiebreak.md`: Status / Completed / Spec / Plan /
Branch / Method, then **Scope**, **What was built** (one paragraph per task),
**Deviations from the plan**, a **Verification** table with the real numbers
from Step 5, **Live-verification findings** from Tasks 3 and 6, **Exit criteria**
mapped to evidence (roadmap §3, P2 — the two criteria P2b owns: "four awards
render correctly including tied winners" and "rematch returns the same players
to a fresh lobby with zero repeated questions"), **Decisions this phase
resolved** (ADR-0045/0046/0047), and **Notes for phases that inherit this work**.

At minimum the notes must carry:
- **`total_rounds` is mutable between games too** — the third trigger, after
  M3 P0's skip and M3 P1's add/remove.
- **`rooms.used_question_ids` grows without bound** and is the natural thing for
  M3 P3's 24-hour room purge to reclaim.
- **Whether the awards' shared-award copy read correctly live**, or was not
  exercised because no tie occurred — recorded as not-done rather than claimed.
- **The sudden-death sting is still `final-sting` reused.** P2a left the
  A/B judgement to this phase (`docs/progress/M3-P2a-the-tiebreak.md`,
  Live-verification findings). If it was not judged here, say so and hand it to
  M3 P5 rather than letting it disappear.

- [ ] **Step 7: Update the live tracker**

In `docs/progress/CURRENT.md`:
- **Current phase** → `M3 P2b complete → docs/progress/M3-P2b-the-aftermath.md`,
  with **Next:** M3 P3 — Continuity (or M3 P4 — The bank, which is independent
  and can start immediately).
- Add to **Notes**: the three inheritances above, phrased as the file's other
  entries are — what is true now, and what a future session will get wrong if it
  does not know.
- Leave the **Tech debt** entry about cross-client realtime against the cloud
  project exactly as it stands unless this phase actually changed it. If P2b's
  suite was re-run against cloud, amend that entry with what was found; if it
  was not, say nothing new.

- [ ] **Step 8: Commit, merge, push and clean up**

Per CLAUDE.md this is not a question — do it.

```bash
git add e2e/aftermath.spec.ts docs/
git commit -m "test: two-context coverage for the aftermath; record M3 P2b"
git checkout main
git merge --no-ff worktree-m3-p2b-the-aftermath
git push
git worktree remove ../quiz-game-m3-p2b
git branch -d worktree-m3-p2b-the-aftermath
```

- [ ] **Step 9: Apply the migration to the cloud project**

`0008_the_aftermath.sql` must reach `niznfbabmixesfvxlypi` **after** the branch
merges and Vercel redeploys, for the same reason P2a applied `0005` and `0007`
in that order: an older client against a newer schema degrades gracefully, and
P2b's schema is purely additive (one column, three new functions), so a deployed
client that predates it simply never calls `awards` or `rematch`.

```bash
npx -y supabase@latest db query --linked --file supabase/migrations/0008_the_aftermath.sql
```

Then verify directly against cloud rather than trusting
`supabase migration list --linked`, whose `remote` column understates what
`db query` has applied (CURRENT.md):

```bash
npx -y supabase@latest db query --linked --file - <<'SQL'
select count(*) as fns from pg_proc
  where proname in ('awards','award_winners','late_surge','rematch');
select count(*) as col from information_schema.columns
  where table_name = 'rooms' and column_name = 'used_question_ids';
SQL
```
Expected: `fns` = 4, `col` = 1.

---

## Self-review

**Spec coverage** — roadmap §3, P2's two remaining bullets:

| Requirement | Task |
|---|---|
| Awards (§5.4.4): Big Brain, Fastest Gun, Hot Streak, Late Surge | 1 (projection), 2 (copy + beat), 3 (surfaces) |
| "as a pure `awards(room_id)` projection" | 1 — `stable`, reads only |
| "Late Surge reconstructs from `answers` by comparing standings at the midpoint against the final" | 1 — `late_surge` |
| Rematch (§5.4.6): resets to lobby, keeps players, redraws excluding used questions, tweaked config | 4 (RPC), 6 (control) |
| "It reuses the room **code**, so nobody re-joins" | 4, asserted in Task 4 Step 1 and Task 7 Step 1 |
| Exit: "four awards render correctly including tied winners" | 1 (server ties), 2 (`describeAwards` tie test), 3 ("shared" copy) |
| Exit: "rematch returns the same players to a fresh lobby with zero repeated questions" | 4 smoke, 7 e2e |
| P2a's inherited trap: awards must bound with `scoring_round` | 1 |
| P2a's inherited trap: rematch clears `sudden_death_*`, deletes the tiebreak round, draws a fresh reserve | 4 |
| Accessibility as an acceptance criterion | 3 (`role="status"`, `aria-hidden` emoji, tie in words), 6 (real button, un-staged) |
| Semantic wire; no new payload field | ADR-0045, ADR-0047 |
| Celebration hierarchy unchanged | `game-reset` is `routine`; the awards card claims no rung |

The two exit criteria P2a already discharged (photo finish, sudden death, reload
correctness) are not re-litigated here; they are recorded in
`docs/progress/M3-P2a-the-tiebreak.md`.

**Type consistency** — `Award`/`AwardKey`/`AwardWinner` are defined in
`lib/types.ts` (Task 2 Step 3) and used unchanged by `lib/awards.ts`,
`lib/useAwards.ts` and `components/AwardsCard.tsx`. `AWARDS_AT` and
`CeremonySteps.awards` are defined in Task 2 Step 8 and read in Task 3 Steps 3–4.
`HostDriver.rematch(timerSeconds?: number)` is defined in Task 6 Step 1 and
called in Task 6 Step 2. The RPC argument names — `p_room_id`, `p_host_key`,
`p_timer_seconds`, `p_categories`, `p_tier_counts` — match between Task 4's
`create or replace function` and Task 6's `supabase.rpc` call.

**Ordering** — Task 5 (the reset plumbing) lands before Task 6 (the button that
triggers it) so that no commit in this branch can produce a room stuck on a
podium in a lobby.
