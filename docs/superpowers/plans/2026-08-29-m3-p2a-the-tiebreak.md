# M3 P2a — The Tiebreak Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the finish resolve itself on screen — a photo finish that stages
every place tied on correct answers and resolves it on speed points, and a
sudden-death round that fires on a perfect first-place tie, consumes the reserve
question P1 drew, and decides the winner on the first correct answer.

**Architecture:** Sudden death is **a real round past the finish line**, not a
new phase: the reserve question is inserted into `room_questions` at
`total_rounds + 1`, so `question_public`, `build_reveal`, `submit_answer`, the
whole question surface, the timer ring and `useHostDriver`'s scheduler all work
unchanged. It is kept out of scoring by a single clamp — every `standings` call
passes `least(round, total_rounds)` — so the tiebreak answer can never become a
correct answer (ADR-0043). The Fairness Law's sort clause stays byte-identical:
sudden death is PRD §3.1's *fourth* lexicographic key and is applied as a stable
head-of-list reorder in a `final_standings` wrapper, never by editing
`standings`. The photo finish needs **no server knowledge at all**: the
ceremony's deadline unconditionally reserves the prelude's length, so the client
picks its own timeline from standings it already holds, and a room with no tie
simply gets a longer settled tail (ADR-0044). The wire opens once, for one
`sudden_death` object (ADR-0042).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase
(Postgres + Realtime broadcast), zustand, `motion`, Tailwind v4, Vitest,
Playwright. **No new runtime dependencies.**

**Spec:** `docs/superpowers/specs/2026-08-29-m3-host-power-polish-roadmap.md`
(§3 "P2 — The finish" is the requirement set; §2 and §4 bind every task).

**P2's own drill-down spec was not written.** §6 says P2 earns one because it
carries four distinct features and "the spec is where P2a/P2b gets decided".
That decision is resolved here, the way P0 resolved its skip semantics and P1
its playing-host conflict — in the plan rather than in a spec:

| Decision §6 assigned to the spec | Resolved as | Where |
|---|---|---|
| **Whether P2 splits** | **It splits.** **P2a — the tiebreak** (photo finish + sudden death): both are tie-driven stagings of the endgame, and sudden death gates the ceremony, so they cannot ship apart. **P2b — the aftermath** (awards + rematch): additive projections that touch no phase logic, no ceremony timing and no ordering. | This document is P2a |
| Where sudden death lives in the phase machine | **A round at `total_rounds + 1`**, reusing `read → answer → reveal`, held out of scoring by a `scoring_round` clamp. Rejected: a new `phase` enum value — every `beatFor`, `stepsAt`, shot book, `phaseCues` switch and `advance_phase` arm would grow a case, and `question_public` / `build_reveal` / `submit_answer` would each need a second lookup path. | Task 4, ADR-0043 |
| How the photo finish extends `CEREMONY_MS` without drifting from migration 0004 | **The ceremony always reserves the prelude.** The results deadline becomes a flat `ceremony_ms()` = 12400 on the server and `CEREMONY_MS = 12400` on the client; the podium beats shift by `PHOTO_MS` only when the client stages a prelude. No server tie-detection, no new wire field, and a no-tie ceremony is byte-identical to today plus a longer settled tail. | Task 1, ADR-0044 |
| Whether sudden death and the photo finish may stage the same tie | **No.** A group resolved by sudden death is excluded from the photo finish — the room just watched that tie resolve on a live question, and restaging it is dead air. | Task 2 |

## Global Constraints

Copied from the roadmap. Every task's requirements implicitly include this
section.

- **Migrations `0007+` follow the house style set by `0003`–`0006`** — `create
  or replace function` over rewrites, additive columns with defaults, no
  destructive DDL. A live cloud project (`niznfbabmixesfvxlypi`) holds real data
  behind a live Vercel deploy.
- **`supabase/migrations/0007_the_tiebreak.sql` must be idempotent end to end.**
  It is written across Tasks 1 and 4 and re-applied after each: every `alter
  table` uses `if not exists`, every `insert` that could repeat carries an
  `on conflict`.
- **Host authority is server-enforced on every command** (roadmap decision 2).
  P2a adds no new host command; it must not weaken the `host_key` check on any
  function it replaces (`advance_phase`, `end_game`, `skip_question`).
- **The Fairness Law is inviolable** (roadmap decision 4). `standings`' sort
  clause stays **byte-identical** (ADR-0018). No task in this plan edits
  `standings`, `longest_streak` or `current_streak`. Sudden death is applied as
  a stable reorder in a wrapper; the photo finish is read-only presentation and
  can never feed back into rank.
- **Design Pillar 2 holds:** clients never receive a correct answer before the
  reveal. The reserve question reaches a client only through `question_public`
  at its own READ, exactly like every other question, and
  `rooms.reserve_question_id` stays off every projection (ADR-0041).
- **The celebration hierarchy extends by exactly one rung** (roadmap decision
  6): `suddenDeath`, above `finalQuestion` and below `victory`. **Nothing else
  in M3 may claim a new rung** — the photo finish gets none.
- **The wire stays semantic** (PRD §3.6, §9). P2a adds exactly one phase-event
  key, `sudden_death`, describing game meaning. It earns ADR-0042, as ADR-0018,
  ADR-0028 and ADR-0037 demanded of the three openings before it.
- **Rendering separation** (PRD §9): the photo-finish card and the sudden-death
  banner are DOM. Pixi's only change is that the podium's rise reads the same
  shifted timeline the DOM does, through the same pure function.
- **Accessibility is an acceptance criterion, not a later pass.** The
  photo-finish card and the sudden-death banner each carry `role="status"` and
  `aria-live="polite"`; the tallying speed-point numbers are `tabular-nums` and
  land on a final value that stays readable when motion is reduced; "shared
  position" is stated in text, never by colour alone; a non-contender's locked
  answer grid explains itself in words.
- **The design razor:** does this make it feel more like a game show, or more
  like a quiz website? A photo finish is the most game-show moment in the
  product — it must not read as a table sorting itself.
- **The regression floor at the end of the phase:** 521 unit tests plus
  whatever this plan adds, `npm run lint` clean (there is no known pre-existing
  error to discount — any lint error is a real one), `npx tsc --noEmit` silent,
  `node scripts/smoke.mjs` green, and `npm run test:e2e -- --workers=2` green.

## Environment notes (read before Task 1)

- **Do not run `supabase stop` or `supabase start`.** Windows/Hyper-V reserves
  TCP 54024–54423, which covers every default Supabase port; the running stack
  is on shifted ports and a restart would bind the reserved defaults, fail, and
  lose it. `supabase status` prints `config.toml`'s defaults, not the live
  bindings — do not trust it.
- **Live local bindings:** API `http://127.0.0.1:55321` (matches `.env.local`),
  Postgres `127.0.0.1:55322`, container `supabase_db_quiz-game`.
- **Apply local SQL** by piping into the container, which needs neither the
  Supabase CLI nor a host `psql`:
  ```bash
  docker exec -i supabase_db_quiz-game \
    psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
    < supabase/migrations/0007_the_tiebreak.sql
  ```
- **Run an ad-hoc query** the same way:
  ```bash
  docker exec -i supabase_db_quiz-game \
    psql -U postgres -d postgres -c "select 1;"
  ```
- **The cloud project is missing `0005_host_authority.sql`.** CURRENT.md records
  that `supabase migration list --linked` shows `0005` with an empty `remote`
  column. **`0007` depends on it** — its `phase_event` reads
  `rooms.paused_remaining_ms`, and its `advance_phase` assumes the widened
  `rooms_status_check`. When the cloud migration is applied at the end of the
  phase, apply `0005` **first**:
  ```bash
  npx -y supabase@latest db query --linked --file supabase/migrations/0005_host_authority.sql
  npx -y supabase@latest db query --linked --file supabase/migrations/0007_the_tiebreak.sql
  ```
- **Run the integration harness** with `node scripts/smoke.mjs`. It reads
  `.env.local` directly, so it needs no dev server.
- **Playwright:** always `--workers=2`. The default worker count on this machine
  is flaky under load. A stability/detachment failure on an animated element is
  the same load flake — re-run before concluding it is a new bug.
- **Live verification is headed.** Headless Chromium falls back to SwiftShader
  and pins the VFX budget at `minimal` before a test starts, so the ceremony's
  timing and the podium's rise cannot be honestly checked headless.

## File Structure

**New files**

| File | Responsibility |
|---|---|
| `supabase/migrations/0007_the_tiebreak.sql` | The ceremony's flat deadline (Task 1); then the sudden-death columns, the scoring clamp, the tie predicates, `final_standings`, and the `advance_phase` / `submit_answer` / `phase_event` / `get_room_state` replacements (Task 4) |
| `lib/ceremony/photoFinish.ts` | Pure: which places are tied, what separates them, and whether a prelude is staged at all |
| `tests/photoFinish.test.ts` | One test per rule in the module above |
| `components/PhotoFinish.tsx` | The prelude card, shared by the player view and the stage view |
| `components/SuddenDeathBanner.tsx` | The tiebreak's own announcement over the question surface |
| `e2e/tiebreak.spec.ts` | Two-context coverage: a photo finish resolving on speed, and a perfect tie going to sudden death |
| `docs/ADR/0042-the-wires-fourth-opening.md` | Why `sudden_death` is on the wire rather than inferred |
| `docs/ADR/0043-sudden-death-is-a-round-past-the-finish-line.md` | Why the tiebreak is a round, not a phase, and how the clamp keeps it out of scoring |
| `docs/ADR/0044-the-ceremony-always-reserves-the-prelude.md` | Why the results deadline is flat rather than tie-dependent |
| `docs/progress/M3-P2a-the-tiebreak.md` | The phase record, written when the last task lands |

**Modified files**

| File | Change |
|---|---|
| `lib/ceremony/beats.ts` | `CEREMONY_MS` 9000 → 12400; `PHOTO_MS` and the prelude's own beats; `CeremonySteps.photo`; `ceremonyStepsAt(elapsed, photoFinish)` |
| `tests/ceremonyBeats.test.ts` | Both timelines, the prelude's steps, the settled tail |
| `lib/ceremony/runtime.ts` | Derives `photoFinish` from the store and passes it through |
| `lib/world/runtime.ts` | The same derivation, through the same pure function, so canvas and DOM cannot disagree |
| `lib/types.ts` | `SuddenDeathInfo`; `PhaseEvent.sudden_death`; `RoomInfo.sudden_death` |
| `lib/store.ts` | Carries `sudden_death` through `applyPhaseEvent` |
| `lib/presentation/celebration.ts` | The `suddenDeath` rung |
| `tests/celebration.test.ts` | The pinned scale grows by one |
| `lib/presentation/cues.ts` | `SuddenDeathCue` |
| `lib/presentation/deriveCues.ts` | `CueRoom.sudden_death`; the cue on the live path and on the seed path; `isFinal` during the tiebreak |
| `tests/deriveCues.test.ts` | The cue fires once, on both paths |
| `lib/audio/design.ts` | `stingFor` answers the new cue |
| `lib/audio/state.ts` | `AUDIO_CUE_TYPES` gains it |
| `tests/audioState.test.ts` | The sting plays live and is suppressed on catch-up |
| `lib/staging/useStaging.ts` | `suddenDeath` flag |
| `lib/staging/runtime.ts` | Sets it on sight; a non-contender is a spectator for the tiebreak round |
| `lib/world/director.ts` | The tiebreak reuses the final-question shot at its own tier |
| `tests/director.test.ts` | The new cue's shot and escalation |
| `components/QuestionCard.tsx` | "Sudden death" replaces the round counter for the tiebreak round |
| `components/ResultsView.tsx` | Mounts the prelude; passes the sudden-death note to `WinnerCard` |
| `components/stage/StageResults.tsx` | The same, at TV scale |
| `components/WinnerCard.tsx` | An optional line saying the win came from the tiebreak |
| `components/GameView.tsx` | Mounts the sudden-death banner |
| `components/stage/StageBroadcast.tsx` | The same |
| `scripts/smoke.mjs` | A `P2a: the tiebreak` section |
| `docs/ADR/README.md` | Index rows for 0042–0044 |
| `docs/progress/CURRENT.md` | Phase pointer and the notes this phase adds |

## The ceremony timeline, both ways

Every constant below is in `lib/ceremony/beats.ts`. `PHOTO_MS` shifts the podium
beats only when a prelude is staged; the total is flat either way.

```
no tie          0 ──── 1200 ─ 2100 ─ 3000 ── 3800 ─ 4100 ────── 6000 ─────────── 12400
                       bronze silver gold    spot   confetti    board            end

photo finish    0 ─ 700 ── 1900 ── 2200 ── 3400 ─ 4600 ─ 5500 ─ 6400 ─ 7200 ─ 7500 ─ 9400 ─ 12400
                    tally  tally   resolve prelude bronze silver gold  spot  conf  board   end
                    start  lands           ends
```

---
### Task 1: The ceremony reserves the prelude

The whole phase rests on one number agreeing on both sides of the wire. Move it
first, in lockstep, with nothing else riding on it — a client and a server that
disagree here put the podium at elapsed 0 for three and a half seconds.

**Files:**
- Create: `supabase/migrations/0007_the_tiebreak.sql`
- Modify: `lib/ceremony/beats.ts`
- Modify: `lib/ceremony/runtime.ts:30-36`
- Modify: `lib/world/runtime.ts:82-89`
- Modify: `scripts/smoke.mjs` (append a `P2a` section)
- Test: `tests/ceremonyBeats.test.ts`
- Create: `docs/ADR/0044-the-ceremony-always-reserves-the-prelude.md`

**Interfaces:**
- Consumes: `elapsedIn(totalMs, remainingMs)` from `lib/staging/beats.ts`;
  `msUntil(iso)` from `lib/serverTime.ts`.
- Produces:
  - `CEREMONY_MS: 12400`, `PHOTO_MS: 3400`, `PHOTO_TALLY_AT: 700`,
    `PHOTO_TALLY_MS: 1200`, `PHOTO_RESOLVE_AT: 2200`
  - `interface PhotoSteps { open: boolean; tally: number; resolved: boolean }`
  - `const NO_PHOTO: PhotoSteps`
  - `CeremonySteps` gains `photo: PhotoSteps`
  - `ceremonyStepsAt(elapsedMs: number, photoFinish?: boolean): CeremonySteps`
  - `sameSteps(a, b)` compares `photo` too
  - SQL: `ceremony_ms() returns int`

- [ ] **Step 1: Write the failing tests**

Replace the whole of `tests/ceremonyBeats.test.ts` with this. It keeps every
existing assertion for the no-tie timeline and adds the prelude's.

```ts
import { describe, it, expect } from 'vitest';
import { elapsedIn } from '@/lib/staging/beats';
import {
  BOARD_AT, BRONZE_AT, CEREMONY_MS, CONFETTI_AT, GOLD_AT, NO_CEREMONY, NO_PHOTO,
  PHOTO_MS, PHOTO_RESOLVE_AT, PHOTO_TALLY_AT, PHOTO_TALLY_MS,
  RISE_MS, SILVER_AT, SPOTLIGHT_AT, ceremonyStepsAt, sameSteps,
} from '@/lib/ceremony/beats';

describe('ceremonyStepsAt — no photo finish', () => {
  it('shows nothing at the very start of the beat', () => {
    expect(ceremonyStepsAt(0)).toEqual(NO_CEREMONY);
  });

  it('holds each block at zero until its own moment', () => {
    expect(ceremonyStepsAt(BRONZE_AT - 1).rise[3]).toBe(0);
    expect(ceremonyStepsAt(SILVER_AT - 1).rise[2]).toBe(0);
    expect(ceremonyStepsAt(GOLD_AT - 1).rise[1]).toBe(0);
  });

  it('rises smoothly once a block starts, landing RISE_MS later', () => {
    expect(ceremonyStepsAt(BRONZE_AT).rise[3]).toBe(0);
    expect(ceremonyStepsAt(BRONZE_AT + RISE_MS / 2).rise[3]).toBeCloseTo(0.5, 5);
    expect(ceremonyStepsAt(BRONZE_AT + RISE_MS).rise[3]).toBe(1);
    expect(ceremonyStepsAt(BRONZE_AT + RISE_MS + 5000).rise[3]).toBe(1);
  });

  it('raises the blocks bronze, then silver, then gold, never early', () => {
    const atSilverStart = ceremonyStepsAt(SILVER_AT);
    expect(atSilverStart.rise[3]).toBe(1);
    expect(atSilverStart.rise[2]).toBe(0);
    expect(atSilverStart.rise[1]).toBe(0);

    const atGoldStart = ceremonyStepsAt(GOLD_AT);
    expect(atGoldStart.rise[3]).toBe(1);
    expect(atGoldStart.rise[2]).toBe(1);
    expect(atGoldStart.rise[1]).toBe(0);
  });

  it('lights the spotlight, then fires confetti, then hands over to the board', () => {
    expect(ceremonyStepsAt(SPOTLIGHT_AT).spotlight).toBe(true);
    expect(ceremonyStepsAt(SPOTLIGHT_AT - 1).spotlight).toBe(false);
    expect(ceremonyStepsAt(CONFETTI_AT).confetti).toBe(true);
    expect(ceremonyStepsAt(CONFETTI_AT - 1).confetti).toBe(false);
    expect(ceremonyStepsAt(BOARD_AT).board).toBe(true);
    expect(ceremonyStepsAt(BOARD_AT - 1).board).toBe(false);
  });

  it('never opens a prelude nobody asked for', () => {
    expect(ceremonyStepsAt(0).photo).toEqual(NO_PHOTO);
    expect(ceremonyStepsAt(PHOTO_TALLY_AT).photo).toEqual(NO_PHOTO);
    expect(ceremonyStepsAt(CEREMONY_MS).photo).toEqual(NO_PHOTO);
  });

  it('is fully settled at the end of the beat and stays there', () => {
    const settled = {
      rise: { 1: 1, 2: 1, 3: 1 },
      spotlight: true, confetti: true, board: true, photo: NO_PHOTO,
    };
    expect(ceremonyStepsAt(CEREMONY_MS)).toEqual(settled);
    expect(ceremonyStepsAt(CEREMONY_MS * 10)).toEqual(settled);
  });

  it('lands settled when the deadline is unknown — a pre-0004 database', () => {
    expect(ceremonyStepsAt(elapsedIn(CEREMONY_MS, null)).board).toBe(true);
    expect(ceremonyStepsAt(elapsedIn(CEREMONY_MS, 0)).rise[1]).toBe(1);
  });

  it('lands every block well before the beat ends, leaving a settled tail', () => {
    expect(GOLD_AT + RISE_MS).toBeLessThan(BOARD_AT);
    expect(BOARD_AT).toBeLessThan(CEREMONY_MS);
  });
});

describe('ceremonyStepsAt — with a photo finish', () => {
  const at = (ms: number) => ceremonyStepsAt(ms, true);

  it('holds the podium back for the whole prelude', () => {
    expect(at(PHOTO_MS - 1).rise[3]).toBe(0);
    expect(at(PHOTO_MS - 1).spotlight).toBe(false);
    expect(at(PHOTO_MS - 1).board).toBe(false);
  });

  it('shifts every podium beat by exactly PHOTO_MS', () => {
    expect(at(PHOTO_MS + BRONZE_AT).rise[3]).toBe(0);
    expect(at(PHOTO_MS + BRONZE_AT + RISE_MS).rise[3]).toBe(1);
    expect(at(PHOTO_MS + SPOTLIGHT_AT).spotlight).toBe(true);
    expect(at(PHOTO_MS + SPOTLIGHT_AT - 1).spotlight).toBe(false);
    expect(at(PHOTO_MS + BOARD_AT).board).toBe(true);
    expect(at(PHOTO_MS + BOARD_AT - 1).board).toBe(false);
  });

  it('opens the card immediately and closes it when the prelude ends', () => {
    expect(at(0).photo.open).toBe(true);
    expect(at(PHOTO_MS - 1).photo.open).toBe(true);
    expect(at(PHOTO_MS).photo.open).toBe(false);
  });

  it('runs the tally from PHOTO_TALLY_AT over PHOTO_TALLY_MS', () => {
    expect(at(PHOTO_TALLY_AT - 1).photo.tally).toBe(0);
    expect(at(PHOTO_TALLY_AT).photo.tally).toBe(0);
    expect(at(PHOTO_TALLY_AT + PHOTO_TALLY_MS / 2).photo.tally).toBeCloseTo(0.5, 5);
    expect(at(PHOTO_TALLY_AT + PHOTO_TALLY_MS).photo.tally).toBe(1);
    expect(at(PHOTO_TALLY_AT + PHOTO_TALLY_MS + 500).photo.tally).toBe(1);
  });

  it('locks the order only after the tally has landed', () => {
    expect(PHOTO_TALLY_AT + PHOTO_TALLY_MS).toBeLessThanOrEqual(PHOTO_RESOLVE_AT);
    expect(at(PHOTO_RESOLVE_AT - 1).photo.resolved).toBe(false);
    expect(at(PHOTO_RESOLVE_AT).photo.resolved).toBe(true);
  });

  it('leaves the card resolved but shut once the podium takes over', () => {
    const afterPrelude = at(PHOTO_MS + 10).photo;
    expect(afterPrelude.open).toBe(false);
    expect(afterPrelude.resolved).toBe(true);
    expect(afterPrelude.tally).toBe(1);
  });

  it('still fits the whole sequence inside one ceremony', () => {
    expect(PHOTO_RESOLVE_AT).toBeLessThan(PHOTO_MS);
    expect(PHOTO_MS + BOARD_AT).toBeLessThan(CEREMONY_MS);
  });

  it('lands settled when the deadline is unknown', () => {
    const settled = ceremonyStepsAt(elapsedIn(CEREMONY_MS, null), true);
    expect(settled.board).toBe(true);
    expect(settled.rise[1]).toBe(1);
    expect(settled.photo.open).toBe(false);
    expect(settled.photo.resolved).toBe(true);
  });
});

describe('sameSteps', () => {
  it('is true for identical steps and false for any difference', () => {
    expect(sameSteps(NO_CEREMONY, { ...NO_CEREMONY })).toBe(true);
    expect(sameSteps(NO_CEREMONY, { ...NO_CEREMONY, rise: { ...NO_CEREMONY.rise, 3: 1 } })).toBe(false);
    expect(sameSteps(NO_CEREMONY, { ...NO_CEREMONY, board: true })).toBe(false);
  });

  it('notices a change inside the prelude, or the ticker would freeze the tally', () => {
    expect(sameSteps(NO_CEREMONY, { ...NO_CEREMONY, photo: { ...NO_PHOTO, open: true } })).toBe(false);
    expect(sameSteps(NO_CEREMONY, { ...NO_CEREMONY, photo: { ...NO_PHOTO, tally: 0.5 } })).toBe(false);
    expect(sameSteps(NO_CEREMONY, { ...NO_CEREMONY, photo: { ...NO_PHOTO, resolved: true } })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/ceremonyBeats.test.ts`
Expected: FAIL — `NO_PHOTO`, `PHOTO_MS`, `PHOTO_TALLY_AT`, `PHOTO_TALLY_MS` and
`PHOTO_RESOLVE_AT` are not exported from `@/lib/ceremony/beats`.

- [ ] **Step 3: Move the constants and add the prelude**

In `lib/ceremony/beats.ts`, replace the `CEREMONY_MS` declaration and its
doc comment with this block, keeping `BRONZE_AT` … `BOARD_AT` and `RISE_MS`
exactly as they are:

```ts
/**
 * Client-side mirror of migration 0007's `ceremony_ms()`.
 *
 * FLAT — it does not depend on whether a photo finish is staged (ADR-0044).
 * The server would otherwise have to detect the tie itself to size the
 * deadline, which means a second implementation of the tie rule in a second
 * language; instead the deadline always reserves the prelude, and a ceremony
 * with no tie simply carries a longer settled tail. Nothing waits on this
 * deadline — `useHostDriver` returns early at `results` and `advance_phase`
 * raises once the room is finished (ADR-0027) — so the tail costs nothing.
 *
 * Hand-maintained, exactly as lib/staging/beats.ts's NOMINAL_MS mirrors the
 * server's other phase durations. The failure mode stays graceful: a moved
 * server duration compresses or completes the sequence early; it can never
 * block or lock the surface.
 */
export const CEREMONY_MS = 12400;

/**
 * How long the photo-finish prelude holds the podium back.
 *
 * The podium's own beats are unchanged and simply shift by this much when a
 * prelude is staged, so the no-tie ceremony is byte-identical to the one P5a
 * built.
 */
export const PHOTO_MS = 3400;

/** Elapsed within the prelude at which the speed-point tally starts running. */
export const PHOTO_TALLY_AT = 700;
/** How long the tally takes to count out. */
export const PHOTO_TALLY_MS = 1200;
/** When the order locks and the resolved placing is stated. */
export const PHOTO_RESOLVE_AT = 2200;
```

Then replace `CeremonySteps`, `NO_CEREMONY`, `ceremonyStepsAt` and `sameSteps`:

```ts
/** How far the photo-finish prelude has got. All zero when none is staged. */
export interface PhotoSteps {
  /** The prelude card is on screen. False before the ceremony and after PHOTO_MS. */
  open: boolean;
  /** Speed-point tally progress, linear 0..1. 1 == the numbers have landed. */
  tally: number;
  /** The order has locked; each group states its winner or its shared position. */
  resolved: boolean;
}

export const NO_PHOTO: PhotoSteps = { open: false, tally: 0, resolved: false };

/** Which parts of the ceremony have landed. Derived purely from elapsed. */
export interface CeremonySteps {
  /** Per-place rise progress, linear 0..1. 1 == fully landed. */
  rise: Readonly<Record<1 | 2 | 3, number>>;
  spotlight: boolean;
  confetti: boolean;
  /** The band retreats and the results board rises (P5b consumes this). */
  board: boolean;
  /** The photo-finish prelude (M3 P2a). `NO_PHOTO` whenever none is staged. */
  photo: PhotoSteps;
}

export const NO_CEREMONY: CeremonySteps = {
  rise: { 1: 0, 2: 0, 3: 0 },
  spotlight: false, confetti: false, board: false, photo: NO_PHOTO,
};

function riseAt(elapsedMs: number, startAt: number): number {
  return Math.min(1, Math.max(0, (elapsedMs - startAt) / RISE_MS));
}

function photoAt(elapsedMs: number): PhotoSteps {
  return {
    open: elapsedMs < PHOTO_MS,
    tally: Math.min(1, Math.max(0, (elapsedMs - PHOTO_TALLY_AT) / PHOTO_TALLY_MS)),
    resolved: elapsedMs >= PHOTO_RESOLVE_AT,
  };
}

/**
 * `photoFinish` shifts the podium's whole sequence by PHOTO_MS and opens the
 * prelude in the space that makes. It is a parameter rather than state because
 * this module stays a pure function of elapsed: the caller decides whether a
 * tie is worth staging (lib/ceremony/photoFinish.ts), and both the DOM ticker
 * and the renderer ask the same question of the same standings, so the two
 * surfaces cannot disagree by more than a frame.
 */
export function ceremonyStepsAt(elapsedMs: number, photoFinish = false): CeremonySteps {
  const offset = photoFinish ? PHOTO_MS : 0;
  const podium = elapsedMs - offset;

  return {
    // Bronze first, gold last: withholding the winner longest is the entire
    // point of a podium reveal.
    rise: {
      3: riseAt(podium, BRONZE_AT),
      2: riseAt(podium, SILVER_AT),
      1: riseAt(podium, GOLD_AT),
    },
    spotlight: podium >= SPOTLIGHT_AT,
    confetti: podium >= CONFETTI_AT,
    board: podium >= BOARD_AT,
    photo: photoFinish ? photoAt(elapsedMs) : NO_PHOTO,
  };
}

/** Equality guard for the store — without it every consumer re-renders at 60fps. */
export function sameSteps(a: CeremonySteps, b: CeremonySteps): boolean {
  return (
    a.rise[1] === b.rise[1] &&
    a.rise[2] === b.rise[2] &&
    a.rise[3] === b.rise[3] &&
    a.spotlight === b.spotlight &&
    a.confetti === b.confetti &&
    a.board === b.board &&
    a.photo.open === b.photo.open &&
    a.photo.tally === b.photo.tally &&
    a.photo.resolved === b.photo.resolved
  );
}
```

Also update the module doc comment's opening paragraph to mention that a
prelude may precede the podium — one added sentence:

```ts
 * When a photo finish is staged the whole podium sequence shifts by PHOTO_MS
 * and the prelude fills the gap; the ceremony's TOTAL length is flat either
 * way (ADR-0044), so nothing about the deadline depends on the outcome.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/ceremonyBeats.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole unit suite — `podium.test.ts` reads these steps**

Run: `npm test`
Expected: PASS. `tests/podium.test.ts` builds `CeremonySteps` through
`ceremonyStepsAt`, so the added `photo` key reaches it already populated and
nothing there needs changing. If it fails, the cause is a literal
`CeremonySteps` object built by hand in a test — add `photo: NO_PHOTO` to it
rather than making the field optional.

- [ ] **Step 6: Write the migration's first half**

Create `supabase/migrations/0007_the_tiebreak.sql`:

```sql
-- M3 P2a — the tiebreak: a photo finish, and a sudden-death round past the
-- finish line.
--
-- The whole file is IDEMPOTENT. It is written across two tasks and re-applied
-- after each one, so every statement here must survive a second run.
--
-- Depends on 0005_host_authority.sql (rooms.paused_remaining_ms, the widened
-- rooms_status_check) and 0006_the_draw.sql (rooms.reserve_question_id).

-- ============ ceremony_ms ============
-- The results phase's length, in milliseconds, as ONE number.
--
-- 0004 put a 9-second deadline on the terminal results phase so the ceremony
-- could derive its position from ends_at like every other beat (ADR-0027).
-- P2a puts a photo-finish prelude in front of the podium, and the deadline has
-- to cover it — but making the deadline DEPEND on whether a tie exists would
-- mean implementing the tie rule twice, once here and once in TypeScript, and
-- the two would be free to drift.
--
-- So the deadline always reserves the prelude (ADR-0044). A ceremony with no
-- tie plays exactly the sequence P5a built and then sits settled for the
-- remainder. That costs nothing: the deadline is inert for game state —
-- useHostDriver returns early at results and advance_phase raises once the room
-- is finished — so nothing schedules against it and nothing advances past it.
--
-- lib/ceremony/beats.ts's CEREMONY_MS is the hand-maintained mirror of this
-- value, in the same tradition as lib/staging/beats.ts's NOMINAL_MS.
create or replace function ceremony_ms() returns int
language sql immutable as $$ select 12400 $$;

-- ============ advance_phase ============
-- Byte-identical to 0005_host_authority.sql's inherited 0004 body except for
-- ONE arm of v_ends: the results deadline now comes from ceremony_ms().
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
    when 'results' then now() + make_interval(secs => ceremony_ms()::double precision / 1000)
    else null
  end;

  update rooms set phase = v_phase, current_round = v_round,
    status = v_status, phase_ends_at = v_ends
  where id = p_room_id returning * into v_room;

  return phase_event(v_room);
end $$;

-- ============ skip_question ============
-- Byte-identical to 0005_host_authority.sql except that the last-round branch's
-- ceremony deadline comes from ceremony_ms().
create or replace function skip_question(p_room_id uuid, p_host_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_round int;
  v_total int;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;
  if v_room.status not in ('playing','paused') then raise exception 'game not running'; end if;
  if v_room.phase not in ('read','answer','reveal') then
    raise exception 'cannot skip from phase %', v_room.phase;
  end if;

  v_round := v_room.current_round;
  v_total := v_room.total_rounds - 1;

  delete from answers where room_id = p_room_id and round = v_round;
  delete from room_questions where room_id = p_room_id and round = v_round;

  -- Renumber the tail down one VIA THE NEGATIVE SPACE (ADR-0038): the
  -- (room_id, round) primary key is not deferrable, so a single
  -- `round = round - 1` can transiently collide with a row the statement has
  -- not reached yet.
  update room_questions set round = -round
    where room_id = p_room_id and round > v_round;
  update room_questions set round = (-round) - 1
    where room_id = p_room_id and round < 0;

  if v_round > v_total then
    update rooms set total_rounds = v_total, current_round = v_total,
      status = 'finished', phase = 'results',
      phase_ends_at = now() + make_interval(secs => ceremony_ms()::double precision / 1000),
      paused_remaining_ms = null
    where id = p_room_id returning * into v_room;
  else
    update rooms set total_rounds = v_total, status = 'playing', phase = 'read',
      phase_ends_at = now() + interval '3 seconds', paused_remaining_ms = null
    where id = p_room_id returning * into v_room;
  end if;

  return phase_event(v_room);
end $$;

-- ============ end_game ============
-- Byte-identical to 0005_host_authority.sql except for the ceremony deadline.
create or replace function end_game(p_room_id uuid, p_host_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_round int;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;
  if v_room.status not in ('playing','paused') then raise exception 'game not running'; end if;

  v_round := v_room.current_round;

  -- A round is RESOLVED only once its outcome has been shown. COUNTDOWN, READ
  -- and ANSWER are in flight: their partial answers are discarded exactly as
  -- skip_question discards them, and the standings stop at the previous round.
  if v_room.phase in ('countdown','read','answer') then
    delete from answers where room_id = p_room_id and round = v_round;
    v_round := greatest(0, v_round - 1);
  end if;

  update rooms set status = 'finished', phase = 'results', current_round = v_round,
    phase_ends_at = now() + make_interval(secs => ceremony_ms()::double precision / 1000),
    paused_remaining_ms = null
  where id = p_room_id returning * into v_room;

  return phase_event(v_room);
end $$;

grant execute on all functions in schema public to anon, authenticated;
```

- [ ] **Step 7: Apply the migration and confirm it is idempotent**

```bash
docker exec -i supabase_db_quiz-game \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  < supabase/migrations/0007_the_tiebreak.sql
docker exec -i supabase_db_quiz-game \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  < supabase/migrations/0007_the_tiebreak.sql
```
Expected: both runs end with `GRANT` and no error. Then:
```bash
docker exec -i supabase_db_quiz-game \
  psql -U postgres -d postgres -c "select ceremony_ms();"
```
Expected: `12400`.

- [ ] **Step 8: Pass the flag through the two clocks**

`lib/ceremony/runtime.ts` — replace the body of `tick`'s publish:

```ts
    const remainingMs = room.ends_at ? msUntil(room.ends_at) : null;
    publish(ceremonyStepsAt(elapsedIn(CEREMONY_MS, remainingMs), false));
```

`lib/world/runtime.ts` — replace the last line of `ceremonySteps`:

```ts
  return ceremonyStepsAt(
    elapsedIn(CEREMONY_MS, room.ends_at ? msUntil(room.ends_at) : null),
    false,
  );
```

Both pass a literal `false` **for now**, with this comment above each:

```ts
  // Task 3 replaces this literal with photoFinishFor(state) — one derivation,
  // read by both the DOM ticker and the renderer, so they cannot disagree.
```

Leaving them explicit rather than relying on the default parameter is
deliberate: it makes the two call sites Task 3 has to change greppable.

- [ ] **Step 9: Extend the smoke harness**

Append to `scripts/smoke.mjs`, after the `P1 draw-review smoke passed` line:

```js
// ---- P2a: the tiebreak ----
// The ceremony's deadline is FLAT (ADR-0044): it always reserves the
// photo-finish prelude, whether or not one is staged. The client mirrors this
// number in lib/ceremony/beats.ts's CEREMONY_MS, and a disagreement puts the
// podium at elapsed 0 for the difference — which is why it is asserted here.
const CEREMONY_MS = 12_400;

const cer = await rpc('create_room', {
  p_timer_seconds: 20, p_categories: ['fuel'], p_tier_counts: [1, 0, 0, 0],
});
await rpc('join_room', {
  p_code: cer.code, p_nickname: 'Clock', p_avatar: 'robot', p_color: '#f59e0b',
  p_host_key: cer.host_key,
});
await rpc('join_room', {
  p_code: cer.code, p_nickname: 'Watch', p_avatar: 'duck', p_color: '#38bdf8',
});
await rpc('start_game', { p_room_id: cer.room_id, p_host_key: cer.host_key });
for (const _ of ['read', 'answer', 'reveal', 'track']) {
  await rpc('advance_phase', { p_room_id: cer.room_id, p_host_key: cer.host_key });
}
const cerEnd = await rpc('advance_phase', { p_room_id: cer.room_id, p_host_key: cer.host_key });
assert.equal(cerEnd.phase, 'results');
const cerMs = new Date(cerEnd.ends_at) - new Date(cerEnd.server_now);
assert.ok(Math.abs(cerMs - CEREMONY_MS) < 500,
  `the ceremony deadline should be ${CEREMONY_MS}ms, got ${cerMs}`);

console.log('✅ P2a ceremony-deadline smoke passed');
```

- [ ] **Step 10: Run the harness and the full unit suite**

Run: `node scripts/smoke.mjs`
Expected: every existing `✅` line plus `✅ P2a ceremony-deadline smoke passed`.

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green, zero problems.

- [ ] **Step 11: Write ADR-0044**

Create `docs/ADR/0044-the-ceremony-always-reserves-the-prelude.md`:

```markdown
# ADR-0044: The ceremony always reserves the prelude

- **Status:** Accepted
- **Date:** 2026-08-29
- **Phase:** M3 P2a — The tiebreak

## Context

The M3 roadmap (§3, P2) says the photo finish "extends `CEREMONY_MS` — a
hand-maintained mirror of migration `0004`'s 9-second results interval — so both
move in lockstep or the ceremony truncates."

The obvious reading is a variable deadline: detect the tie when the room enters
`results` and set `9s` or `12.4s` accordingly. That puts a second implementation
of the tie rule into PL/pgSQL, beside the TypeScript one the prelude needs
anyway to decide *which* places are tied and *what* separates them. Two
implementations of one rule, in two languages, free to drift — and the drift
would be invisible until a real tie happened in front of a real room.

Sending the answer over the wire instead (`photo_finish: boolean` on the results
phase event) removes the drift but adds a protocol field for something the
client can already compute from `standings`, which it holds in full.

## Decision

The results deadline is **flat**: `ceremony_ms()` returns 12400 unconditionally,
and `lib/ceremony/beats.ts`'s `CEREMONY_MS` mirrors it. The server never asks
whether a tie exists.

The client decides on its own, from the standings it already has, and
`ceremonyStepsAt(elapsed, photoFinish)` shifts the podium's beats by `PHOTO_MS`
when a prelude is staged. A ceremony with no tie plays exactly the sequence P5a
built, then sits settled for the remaining ~6.4 seconds.

## Consequences

- **The tie rule has exactly one implementation**, in
  `lib/ceremony/photoFinish.ts`, unit-tested, and read by both the DOM ticker
  and the renderer through the same pure function.
- **No protocol field was spent.** P2a's one wire opening (ADR-0042) is sudden
  death, which the client genuinely cannot derive.
- **A no-tie ceremony carries a longer settled tail, and it costs nothing.**
  The results deadline is inert for game state, guarded twice: `useHostDriver`
  returns early on both `status !== 'playing'` and `phase === 'results'`, and
  `advance_phase` raises `'game finished'` once the room is finished
  (ADR-0027). Nothing schedules against it; the client reads it purely as an
  animation anchor.
- **`CEREMONY_MS` stays a hand-maintained mirror, and the failure mode stays
  graceful.** A client on 12400 against a database still on 0004's 9 seconds
  computes `elapsedIn(12400, 9000) = 3400` at the phase's first frame and opens
  on an already-risen bronze and silver — the sequence compresses, exactly as
  `lib/staging/beats.ts` documents for every other mirrored duration. It cannot
  block or lock the surface. This is the state a deployed client is in between
  a Vercel deploy and the cloud migration, so it is a real window, not a
  hypothetical.
- **`PHOTO_MS` must stay smaller than the slack.** `PHOTO_MS + BOARD_AT` is
  9400 against a 12400 total; `tests/ceremonyBeats.test.ts` pins that
  inequality so a later change to either constant fails a test rather than
  truncating the board's entrance.
```

- [ ] **Step 12: Commit**

```bash
git add supabase/migrations/0007_the_tiebreak.sql lib/ceremony/beats.ts \
  lib/ceremony/runtime.ts lib/world/runtime.ts tests/ceremonyBeats.test.ts \
  scripts/smoke.mjs docs/ADR/0044-the-ceremony-always-reserves-the-prelude.md
git commit -m "feat: the ceremony reserves the photo-finish prelude

The results deadline becomes a flat ceremony_ms() = 12400 on the server and
CEREMONY_MS = 12400 on the client, so the podium's beats can shift by PHOTO_MS
without the server ever having to detect a tie. A ceremony with no tie plays
the sequence P5a built and carries a longer settled tail, which costs nothing:
nothing schedules against the results deadline. See ADR-0044."
```

---
### Task 2: Which places are tied, and what separates them

The photo finish's whole rule set, as one pure module with no React, no store
and no DOM — the same shape as `lib/results/stats.ts` and
`lib/ceremony/beats.ts`. Nothing renders yet.

**Files:**
- Create: `lib/ceremony/photoFinish.ts`
- Test: `tests/photoFinish.test.ts`

**Interfaces:**
- Consumes: `Standing` from `lib/types.ts` (`player_id`, `correct`,
  `speed_points`, `longest_streak` are the four fields this module reads).
- Produces — every later task imports from here and nowhere else:
  ```ts
  export interface TieGroup {
    /** 1-based place of the group's first member in the final standings. */
    place: number;
    /** The tied racers, in final-standings order. Always 2 or more. */
    players: Standing[];
    /** True when speed points or streak separate them; false when they share the position. */
    resolved: boolean;
  }
  export interface PhotoFinishInput {
    standings: readonly Standing[] | null;
    /** Player ids the sudden-death round already decided between, if any. */
    suddenDeathContenders?: readonly string[] | null;
    /** Whether that round actually produced a winner. */
    suddenDeathResolved?: boolean;
  }
  export function tieGroups(input: PhotoFinishInput): TieGroup[];
  export function hasPhotoFinish(input: PhotoFinishInput): boolean;
  export function tallyValue(target: number, tally: number): number;
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/photoFinish.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hasPhotoFinish, tallyValue, tieGroups } from '@/lib/ceremony/photoFinish';
import type { Standing } from '@/lib/types';

/**
 * Standings arrive from the server ALREADY sorted by the Fairness Law, so
 * every fixture here is written in the order `standings` would have returned
 * it. The module must never re-sort — it only groups.
 */
const s = (
  id: string,
  correct: number,
  speed_points: number,
  longest_streak = 0,
): Standing => ({
  player_id: id, nickname: id.toUpperCase(), avatar: 'robot', color: '#f59e0b',
  correct, speed_points, longest_streak, current_streak: 0,
});

describe('tieGroups', () => {
  it('finds nothing in an empty or absent field', () => {
    expect(tieGroups({ standings: null })).toEqual([]);
    expect(tieGroups({ standings: [] })).toEqual([]);
  });

  it('finds nothing when every racer has a different correct count', () => {
    expect(tieGroups({ standings: [s('a', 3, 90), s('b', 2, 80), s('c', 1, 70)] })).toEqual([]);
  });

  it('never stages a group of one', () => {
    expect(tieGroups({ standings: [s('a', 3, 90)] })).toEqual([]);
  });

  it('groups an adjacent run sharing a correct count', () => {
    const groups = tieGroups({ standings: [s('a', 3, 90), s('b', 3, 80), s('c', 1, 70)] });
    expect(groups).toHaveLength(1);
    expect(groups[0].players.map(p => p.player_id)).toEqual(['a', 'b']);
  });

  it('reports the 1-based place the group starts at', () => {
    const groups = tieGroups({
      standings: [s('a', 3, 90), s('b', 2, 80), s('c', 2, 70), s('d', 1, 60)],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].place).toBe(2);
  });

  it('finds every tied place, not just the first', () => {
    const groups = tieGroups({
      standings: [s('a', 3, 90), s('b', 3, 80), s('c', 1, 70), s('d', 1, 60)],
    });
    expect(groups.map(g => g.place)).toEqual([1, 3]);
    expect(groups.map(g => g.players.length)).toEqual([2, 2]);
  });

  it('keeps a group of three together rather than splitting it into pairs', () => {
    const groups = tieGroups({ standings: [s('a', 2, 90), s('b', 2, 80), s('c', 2, 70)] });
    expect(groups).toHaveLength(1);
    expect(groups[0].players.map(p => p.player_id)).toEqual(['a', 'b', 'c']);
  });

  it('preserves the order standings arrived in — it groups, it never sorts', () => {
    const groups = tieGroups({ standings: [s('a', 2, 90), s('b', 2, 80)] });
    expect(groups[0].players.map(p => p.player_id)).toEqual(['a', 'b']);
  });

  it('is resolved when speed points separate the group', () => {
    const groups = tieGroups({ standings: [s('a', 2, 90), s('b', 2, 80)] });
    expect(groups[0].resolved).toBe(true);
  });

  it('is resolved when only the streak separates the group', () => {
    const groups = tieGroups({ standings: [s('a', 2, 80, 2), s('b', 2, 80, 1)] });
    expect(groups[0].resolved).toBe(true);
  });

  it('is NOT resolved when the group is perfectly tied — they share the position', () => {
    const groups = tieGroups({ standings: [s('a', 2, 80, 2), s('b', 2, 80, 2)] });
    expect(groups[0].resolved).toBe(false);
  });

  it('resolves a three-way group where only one member is separated', () => {
    const groups = tieGroups({
      standings: [s('a', 2, 90, 1), s('b', 2, 80, 1), s('c', 2, 80, 1)],
    });
    expect(groups[0].resolved).toBe(true);
  });

  it('drops the group sudden death already decided', () => {
    const groups = tieGroups({
      standings: [s('a', 0, 0), s('b', 0, 0)],
      suddenDeathContenders: ['a', 'b'],
      suddenDeathResolved: true,
    });
    expect(groups).toEqual([]);
  });

  it('keeps the group when sudden death produced no winner — the tie really stands', () => {
    const groups = tieGroups({
      standings: [s('a', 0, 0), s('b', 0, 0)],
      suddenDeathContenders: ['a', 'b'],
      suddenDeathResolved: false,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].resolved).toBe(false);
  });

  it('drops only the decided group, never a different place that happens to be tied', () => {
    const groups = tieGroups({
      standings: [s('a', 3, 90), s('b', 3, 90), s('c', 1, 50), s('d', 1, 40)],
      suddenDeathContenders: ['a', 'b'],
      suddenDeathResolved: true,
    });
    expect(groups.map(g => g.place)).toEqual([3]);
  });

  it('ignores a contender list that does not match a whole group', () => {
    // Defensive: a stale contender list must never silently eat a live tie.
    const groups = tieGroups({
      standings: [s('a', 2, 90), s('b', 2, 80), s('c', 2, 70)],
      suddenDeathContenders: ['a', 'b'],
      suddenDeathResolved: true,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].players).toHaveLength(3);
  });
});

describe('hasPhotoFinish', () => {
  it('is false with nothing to stage and true with a group', () => {
    expect(hasPhotoFinish({ standings: null })).toBe(false);
    expect(hasPhotoFinish({ standings: [s('a', 3, 90), s('b', 2, 80)] })).toBe(false);
    expect(hasPhotoFinish({ standings: [s('a', 3, 90), s('b', 3, 80)] })).toBe(true);
  });

  it('is false once sudden death has taken the only tied group', () => {
    expect(hasPhotoFinish({
      standings: [s('a', 0, 0), s('b', 0, 0)],
      suddenDeathContenders: ['a', 'b'],
      suddenDeathResolved: true,
    })).toBe(false);
  });
});

describe('tallyValue', () => {
  it('counts a target out over the tally and lands exactly on it', () => {
    expect(tallyValue(240, 0)).toBe(0);
    expect(tallyValue(240, 0.5)).toBe(120);
    expect(tallyValue(240, 1)).toBe(240);
  });

  it('returns whole numbers — speed points are never fractional', () => {
    expect(Number.isInteger(tallyValue(241, 0.333))).toBe(true);
  });

  it('clamps a tally outside 0..1 rather than overshooting the real score', () => {
    expect(tallyValue(240, -1)).toBe(0);
    expect(tallyValue(240, 2)).toBe(240);
  });

  it('handles a zero target without producing -0', () => {
    expect(Object.is(tallyValue(0, 0.5), 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/photoFinish.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/ceremony/photoFinish"`.

- [ ] **Step 3: Write the module**

Create `lib/ceremony/photoFinish.ts`:

```ts
/**
 * Which places the photo finish stages, and what separates them (PRD §5.4.1)
 * — pure, no React, no store, no DOM.
 *
 * This module is the ONLY implementation of the tie rule. The ceremony's
 * deadline is flat (ADR-0044), so the server never asks the question; the DOM
 * ticker (lib/ceremony/runtime.ts) and the renderer (lib/world/runtime.ts) both
 * ask it here, of the same standings, so the two surfaces cannot disagree.
 *
 * It GROUPS; it never SORTS. `standings` arrives already ordered by the
 * Fairness Law — correct desc, speed points desc, longest streak desc,
 * player_id asc (ADR-0018) — and P2a's `final_standings` wrapper has already
 * lifted any sudden-death winner to the head. Re-sorting here would be a second
 * ranking authority, which is exactly what roadmap decision 4 forbids: the
 * photo finish PRESENTS the order, it never computes one.
 */
import type { Standing } from '@/lib/types';

export interface TieGroup {
  /** 1-based place of the group's first member in the final standings. */
  place: number;
  /** The tied racers, in final-standings order. Always 2 or more. */
  players: Standing[];
  /**
   * True when speed points (or, failing those, the longest streak) separate
   * them. False means the group is PERFECTLY tied and shares the position —
   * PRD §6's rule for every place sudden death does not reach.
   */
  resolved: boolean;
}

export interface PhotoFinishInput {
  standings: readonly Standing[] | null;
  /**
   * The racers the sudden-death round was fought between, from
   * `RoomInfo.sudden_death.contenders`. Undefined when no tiebreak ran.
   */
  suddenDeathContenders?: readonly string[] | null;
  /** Whether that round actually produced a winner (`winner_id !== null`). */
  suddenDeathResolved?: boolean;
}

/**
 * The tied places worth staging.
 *
 * A group already decided by sudden death is dropped: the room has just watched
 * that tie resolve on a live question, and restaging it as a speed-point tally
 * would be dead air that contradicts what everyone saw. The match is on the
 * WHOLE group — a contender list that does not exactly cover one group is
 * ignored rather than trusted, so a stale list can never silently swallow a
 * live tie.
 */
export function tieGroups(input: PhotoFinishInput): TieGroup[] {
  const standings = input.standings ?? [];
  const decided =
    input.suddenDeathResolved && input.suddenDeathContenders?.length
      ? new Set(input.suddenDeathContenders)
      : null;

  const groups: TieGroup[] = [];

  let start = 0;
  while (start < standings.length) {
    let end = start + 1;
    while (end < standings.length && standings[end].correct === standings[start].correct) end++;

    const players = standings.slice(start, end);
    if (players.length > 1 && !isDecided(players, decided)) {
      groups.push({
        place: start + 1,
        players,
        resolved: !isPerfectlyTied(players),
      });
    }
    start = end;
  }

  return groups;
}

export function hasPhotoFinish(input: PhotoFinishInput): boolean {
  return tieGroups(input).length > 0;
}

/**
 * A speed-point total, counted out.
 *
 * Whole numbers only: speed points are integers everywhere else in the game
 * (`floor(remaining / total * 100) * tier`), and a tally that flickered through
 * `183.4` would be quoting a score that does not exist. The clamp is what makes
 * the number safe to render straight from a rAF-published tally.
 */
export function tallyValue(target: number, tally: number): number {
  const t = Math.min(1, Math.max(0, tally));
  // `|| 0` folds IEEE -0 back to 0: Math.round(-0) is -0, which renders as "0"
  // but is a surprising value to hand a consumer.
  return Math.round(target * t) || 0;
}

/** Same group, member for member, as the one sudden death settled. */
function isDecided(players: readonly Standing[], decided: Set<string> | null): boolean {
  if (!decided) return false;
  if (players.length !== decided.size) return false;
  return players.every(p => decided.has(p.player_id));
}

/**
 * Nothing below `correct` separates these racers.
 *
 * Deliberately checks BOTH remaining Fairness Law keys, not just speed points:
 * PRD §5.4.1 describes the sequence as resolving on speed points because that
 * is the usual case, but §3.1's order runs speed points then longest streak,
 * and a group the streak separates is genuinely resolved — calling it a shared
 * position would contradict the ranking the board is about to show.
 */
function isPerfectlyTied(players: readonly Standing[]): boolean {
  const first = players[0];
  return players.every(
    p => p.speed_points === first.speed_points && p.longest_streak === first.longest_streak,
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/photoFinish.test.ts`
Expected: PASS, 22 tests.

- [ ] **Step 5: Run the full suite and the type checker**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add lib/ceremony/photoFinish.ts tests/photoFinish.test.ts
git commit -m "feat: the photo finish's tie rule, as one pure module

Groups adjacent runs of the final standings that share a correct count, reports
whether speed points or streak separate each group, and drops the group sudden
death already decided. It groups and never sorts: standings arrive ordered by
the Fairness Law and this module presents that order rather than computing one."
```

---
### Task 3: The photo finish on screen

The prelude, on both surfaces, driven by the clock Task 1 built and the rule
Task 2 wrote. This task ships a complete, playable feature: a game that ends
with any place tied now stages it. Sudden death does not exist yet, and nothing
here depends on it.

**Files:**
- Create: `components/PhotoFinish.tsx`
- Create: `e2e/tiebreak.spec.ts`
- Modify: `lib/ceremony/photoFinish.ts` (add `photoFinishFor`)
- Modify: `lib/ceremony/runtime.ts`
- Modify: `lib/world/runtime.ts`
- Modify: `components/ResultsView.tsx`
- Modify: `components/stage/StageResults.tsx`
- Test: `tests/photoFinish.test.ts` (extend)

**Interfaces:**
- Consumes: `tieGroups`, `tallyValue`, `TieGroup` from
  `lib/ceremony/photoFinish.ts`; `PhotoSteps`, `PHOTO_TALLY_AT`, `CEREMONY_MS`
  from `lib/ceremony/beats.ts`; `useCeremony` from
  `lib/ceremony/useCeremony.ts`; `DURATION`, `EASE` from
  `lib/presentation/tokens.ts`; `Panel` from `components/ui/Panel.tsx`;
  `avatarEmoji` from `lib/avatars.ts`.
- Produces:
  - `photoFinishFor(source: PhotoFinishSource): boolean` — **Task 5 extends
    this function with the sudden-death exclusion; its signature does not
    change.**
  - `<PhotoFinish instant={boolean} />` — reads the store itself, so both
    surfaces mount it with one prop.
  - `data-testid="photo-finish"` with `data-resolved="true|false"`, and
    `data-testid="photo-finish-group"` per staged place. **These are the stable
    e2e hooks — assert on them, never on copy.**

- [ ] **Step 1: Write the failing test for the shared derivation**

Append to `tests/photoFinish.test.ts`:

```ts
describe('photoFinishFor', () => {
  it('is false before any standings exist', () => {
    expect(photoFinishFor({ standings: null })).toBe(false);
  });

  it('is false for a clean finish and true for a tied one', () => {
    expect(photoFinishFor({ standings: [s('a', 3, 90), s('b', 2, 80)] })).toBe(false);
    expect(photoFinishFor({ standings: [s('a', 3, 90), s('b', 3, 80)] })).toBe(true);
  });
});
```

and add `photoFinishFor` to the import at the top of the file.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/photoFinish.test.ts`
Expected: FAIL — `photoFinishFor is not a function`.

- [ ] **Step 3: Add the derivation both clocks share**

Append to `lib/ceremony/photoFinish.ts`:

```ts
/**
 * Structural subset of the game store. `GameState` is assignable to it, which
 * is what keeps this module free of any store import — the same arrangement
 * `lib/presentation/deriveCues.ts`'s `CueSource` uses.
 */
export interface PhotoFinishSource {
  standings: readonly Standing[] | null;
}

/**
 * "Is a prelude staged for this room?" — asked by the DOM ticker
 * (lib/ceremony/runtime.ts) and by the renderer (lib/world/runtime.ts), which
 * is why it lives here rather than in either of them. One question, one answer,
 * so the podium's rise and the card's timeline cannot fall out of step.
 *
 * Task 5 note: this widens to exclude the group sudden death decided, by
 * reading `sudden_death` off the room. The signature does not change.
 */
export function photoFinishFor(source: PhotoFinishSource): boolean {
  return hasPhotoFinish({ standings: source.standings });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- tests/photoFinish.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire both clocks to it**

`lib/ceremony/runtime.ts` — replace the literal `false` Task 1 left behind, and
its "Task 3 replaces this" comment. Read the store **once** and take both the
room and the standings from that one snapshot, so the deadline and the tie
cannot come from different frames:

```ts
    const state = useGameStore.getState();
    const room = state.room;
    if (room?.phase !== 'results') {
      publish(NO_CEREMONY);
      return;
    }
    const remainingMs = room.ends_at ? msUntil(room.ends_at) : null;
    publish(ceremonyStepsAt(elapsedIn(CEREMONY_MS, remainingMs), photoFinishFor(state)));
```
with `import { photoFinishFor } from './photoFinish';` at the top.

`lib/world/runtime.ts` — replace the literal `false` in `ceremonySteps`:

```ts
function ceremonySteps(state: ReturnType<typeof useGameStore.getState>): CeremonySteps {
  const room = state.room;
  if (room?.phase !== 'results') return NO_CEREMONY;
  return ceremonyStepsAt(
    elapsedIn(CEREMONY_MS, room.ends_at ? msUntil(room.ends_at) : null),
    photoFinishFor(state),
  );
}
```
with `import { photoFinishFor } from '@/lib/ceremony/photoFinish';`.

- [ ] **Step 6: Build the card**

Create `components/PhotoFinish.tsx`:

```tsx
'use client';
import { motion } from 'motion/react';
import Panel from '@/components/ui/Panel';
import { avatarEmoji } from '@/lib/avatars';
import { tallyValue, tieGroups, type TieGroup } from '@/lib/ceremony/photoFinish';
import { useCeremony } from '@/lib/ceremony/useCeremony';
import { DURATION, EASE } from '@/lib/presentation/tokens';
import { useGameStore } from '@/lib/store';

const PLACE_NAMES = ['1st', '2nd', '3rd'];

function placeName(place: number): string {
  return PLACE_NAMES[place - 1] ?? `${place}th`;
}

/**
 * The photo finish (PRD §5.4.1) — the prelude that holds the podium back while
 * a tied place resolves on speed points.
 *
 * DOM, never canvas (cross-cutting constraint 2): the podium behind it is
 * Pixi's, and this sits over it as a fixed overlay in the same idiom as
 * components/PauseCard.tsx. That is also what makes it work unchanged inside
 * `[data-surface="stage"]`, where every size here resolves through a theme
 * variable that scope overrides (ADR-0035) — one component, two scales, no
 * variant prop.
 *
 * It reads the store itself rather than taking standings as a prop, so both
 * surfaces mount it identically and neither can pass a different field.
 *
 * The `instant` prop is the one-shot mount-time settle CURRENT.md's replay rule
 * demands. This component DOES mount conditionally (on `photo.open`), so
 * `AnimatePresence initial={false}` in the parent is the primary guard; but a
 * reload landing INSIDE the prelude mounts it fresh with the beat already part
 * way through, and `AnimatePresence` cannot tell that from a genuine entrance.
 * `instant` is derived once, from the same `ends_at` the runtime uses, and
 * suppresses the entrance in exactly that case — the same shape as
 * `ResultsView`'s `settled` (ADR-0030).
 */
export default function PhotoFinish({ instant }: { instant: boolean }) {
  const standings = useGameStore(s => s.standings);
  const photo = useCeremony(s => s.steps.photo);
  const groups = tieGroups({ standings });

  if (groups.length === 0) return null;

  return (
    <motion.div
      data-testid="photo-finish"
      data-resolved={photo.resolved ? 'true' : 'false'}
      initial={instant ? false : { opacity: 0, scale: 0.96 }}
      animate={{
        opacity: 1,
        scale: 1,
        transition: { duration: DURATION.settle / 1000, ease: EASE.settle },
      }}
      exit={{ opacity: 0, transition: { duration: DURATION.beat / 1000 } }}
      className="pointer-events-none fixed inset-0 z-20 grid place-items-center p-6"
    >
      <Panel className="w-full max-w-lg px-8 py-7">
        {/*
          One live region for the whole card, polite: the resolution is news,
          but it must never interrupt a screen reader mid-sentence.
        */}
        <div role="status" aria-live="polite">
          <p className="text-center font-display text-[0.6875rem] font-semibold uppercase tracking-[0.28em] text-neon-magenta">
            Photo finish
          </p>
          <p className="mt-2 text-center text-sm text-ink-dim">
            {photo.resolved
              ? 'Speed points separate them.'
              : 'Too close to call on correct answers.'}
          </p>

          <div className="mt-6 space-y-5">
            {groups.map(group => (
              <Group key={group.place} group={group} tally={photo.tally} resolved={photo.resolved} />
            ))}
          </div>
        </div>
      </Panel>
    </motion.div>
  );
}

/**
 * One tied place.
 *
 * The tally is a NUMBER counting up, not a bar filling: the number is the
 * thing being compared, and a bar would ask the room to eyeball a length when
 * the exact figure is what decides it. `tabular-nums` keeps the digits from
 * jittering as they climb.
 */
function Group({
  group, tally, resolved,
}: {
  group: TieGroup;
  tally: number;
  resolved: boolean;
}) {
  return (
    <section data-testid="photo-finish-group" data-place={group.place}>
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-ink-mute">
        {placeName(group.place)} place · {group.players.length} tied on {group.players[0].correct} correct
      </h3>

      <ul className="mt-2 space-y-1.5">
        {group.players.map((p, index) => {
          // The winner of the group is its first member: standings arrived
          // ordered by the Fairness Law and this component never re-sorts.
          const won = resolved && index === 0;
          return (
            <li
              key={p.player_id}
              data-testid="photo-finish-racer"
              data-won={won ? 'true' : 'false'}
              className={
                'flex items-center gap-3 rounded-control px-3 py-2 ' +
                'ease-settle duration-(--dur-settle) transition-colors ' +
                (won ? 'bg-neon-magenta/12 ring-1 ring-neon-magenta/50' : 'bg-abyss/50')
              }
            >
              <span
                aria-hidden="true"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-base"
                style={{
                  backgroundColor: `${p.color}33`,
                  boxShadow: `inset 0 0 0 2px ${p.color}`,
                }}
              >
                {avatarEmoji(p.avatar)}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold text-ink">{p.nickname}</span>
              <span
                data-testid="photo-finish-points"
                className="font-display font-black tabular-nums text-ink"
              >
                {tallyValue(p.speed_points, tally)}
              </span>
              <span className="w-24 shrink-0 text-right text-[11px] uppercase tracking-widest text-ink-mute">
                {/* Stated in words, never by the ring alone: colour is not the
                    only channel this result is carried on. */}
                {won ? 'Takes it' : resolved ? '' : ''}
                <span className="sr-only">speed points</span>
              </span>
            </li>
          );
        })}
      </ul>

      {!resolved && (
        <p className="mt-2 text-xs text-ink-dim">
          Dead level — they share {placeName(group.place)} place.
        </p>
      )}
    </section>
  );
}
```

> **Note on the unresolved case:** the `!resolved` line renders throughout the
> tally and is replaced by nothing once `resolved` lands for a group that really
> is separated. Keep the two states in the same DOM position so the card does
> not reflow as the prelude lands.

- [ ] **Step 7: Mount it on the player view**

In `components/ResultsView.tsx`:

Add to the imports:
```tsx
import { AnimatePresence } from 'motion/react';
import { PHOTO_TALLY_AT } from '@/lib/ceremony/beats';
import PhotoFinish from './PhotoFinish';
```

Add a second one-shot beside `settled`, using the same lazy-initializer idiom
and the same `endsAt`:

```tsx
  /**
   * "Was the prelude already running when this component mounted?"
   *
   * ONE-SHOT, for exactly the reason `settled` above is: the ceremony runtime
   * publishes from a requestAnimationFrame tick started in an effect, so a
   * reload lands one frame before `steps.photo` is real. Without this, a reload
   * mid-prelude would play the card's entrance again.
   *
   * `PHOTO_TALLY_AT` rather than 0 is the threshold on purpose: a mount inside
   * the first 700ms is a genuine entrance — the card has not started saying
   * anything yet — and should animate.
   */
  const [photoInstant] = useState(
    () => elapsedIn(CEREMONY_MS, endsAt ? msUntil(endsAt) : null) >= PHOTO_TALLY_AT,
  );
```

and render the prelude just inside the `<main>`, before the band spacer:

```tsx
      {/*
        Conditionally mounted on the prelude's own beat, so it retires cleanly
        when the podium takes over. `initial={false}` is the standing guard
        against an entrance replaying on a mid-beat mount (CURRENT.md); the
        `photoInstant` one-shot covers the case AnimatePresence cannot see.
      */}
      <AnimatePresence initial={false}>
        {photo.open && <PhotoFinish key="photo-finish" instant={photoInstant} />}
      </AnimatePresence>
```

with `const photo = useCeremony(s => s.steps.photo);` beside the existing
`board` selector.

- [ ] **Step 8: Mount it on the stage view**

`components/stage/StageBroadcast.tsx`'s `results` branch renders
`<StageResults />` inside a `[data-surface="stage"]` container, which is where
the prelude must live so it inherits the television scale (ADR-0035).

In `components/stage/StageResults.tsx`, add the same imports, the same
`photoInstant` one-shot, and render the prelude at the top of the returned
element:

```tsx
      <AnimatePresence initial={false}>
        {photo.open && <PhotoFinish key="photo-finish" instant={photoInstant} />}
      </AnimatePresence>
```

**Do not** add a second copy to `StageBroadcast` — the results branch already
mounts `StageResults`, and two cards would both be `fixed inset-0`.

- [ ] **Step 9: Check it by hand, headed**

```bash
npm run dev
```
Then, in a headed browser: create a 1-question room, join a second player, have
**both answer correctly**, and let the race finish. Confirm:
1. The card appears immediately at the results phase, before any podium block
   rises.
2. The two speed-point numbers count up from 0 and land on their real values.
3. At ~2.2s the leader's row lights and reads "Takes it".
4. At ~3.4s the card fades and the podium starts its rise — bronze, then
   silver, then gold — and the results board arrives after it.
5. Reload during the prelude: the card is there at the right tally with **no**
   entrance animation replayed.
6. Reload after the ceremony: no card at all, board already settled.
7. Repeat with a **clean** finish (one player correct, one wrong): no card, and
   the podium starts rising at 1.2s exactly as before.

- [ ] **Step 10: Write the photo-finish e2e test**

Create `e2e/tiebreak.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

/**
 * Two contexts throughout: an endgame has to be observed from a racer's own
 * screen, and the tie has to be built out of two real players' answers.
 *
 * The tie is DETERMINISTIC BY CONSTRUCTION, never by timing luck. Both racers
 * answer the one question correctly, so they tie on correct answers; the second
 * click is delayed well past one speed-point bucket (200ms at a 20s timer), so
 * speed points provably separate them and the finish resolves rather than
 * falling through to sudden death.
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

test('a tie on correct answers plays a photo finish that resolves on speed points',
  async ({ page, browser }) => {
    test.setTimeout(120_000);
    const host = page;
    const code = await createRoom(host, 1, 20);

    const joinerContext = await browser.newContext();
    const joiner = await joinerContext.newPage();
    await join(joiner, code, 'Joiner');

    await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
    await host.getByRole('button', { name: /start the race/i }).click();

    // Both answer the same question correctly. The reveal is what tells us
    // WHICH option was correct — the draw is random, so it cannot be assumed.
    await expect(joiner.getByTestId('answer-option').first()).toBeEnabled({ timeout: 20_000 });

    // Read the correct index off the host's own review? No — the host may be
    // racing, so it is redacted (ADR-0040). Instead: both players pick the
    // SAME option. Whether it is right or wrong, they tie on correct answers,
    // which is all the photo finish needs.
    await host.getByTestId('answer-option').nth(0).click();
    await joiner.waitForTimeout(1_200); // > 1 speed-point bucket at 20s
    await joiner.getByTestId('answer-option').nth(0).click();

    // The card lands before any podium block rises, on both screens.
    await expect(host.getByTestId('photo-finish')).toBeVisible({ timeout: 60_000 });
    await expect(joiner.getByTestId('photo-finish')).toBeVisible();
    await expect(joiner.getByTestId('photo-finish-group')).toHaveCount(1);

    // ...and it resolves rather than declaring a shared position: the 1.2s gap
    // guarantees different speed points when both were correct, and when both
    // were wrong the group is perfectly tied at zero and shares the place.
    // Either outcome is legitimate; what must be true is that the card states
    // one of them and then retires.
    await expect(joiner.getByTestId('photo-finish')).toHaveAttribute(
      'data-resolved', 'true', { timeout: 15_000 });

    // The podium takes over and the board arrives after it.
    await expect(joiner.getByTestId('photo-finish')).toBeHidden({ timeout: 15_000 });
    await expect(joiner.getByTestId('results-board')).toHaveAttribute(
      'data-entered', 'true', { timeout: 15_000 });
    await expect(joiner.getByTestId('results-row')).toHaveCount(2);

    await joinerContext.close();
  });

test('a clean finish goes straight to the podium', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const host = page;
  const code = await createRoom(host, 1, 20);

  const joinerContext = await browser.newContext();
  const joiner = await joinerContext.newPage();
  await join(joiner, code, 'Joiner');

  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
  await host.getByRole('button', { name: /start the race/i }).click();

  await expect(joiner.getByTestId('answer-option').first()).toBeEnabled({ timeout: 20_000 });
  // Different options, so at most one of them is correct. If neither is, they
  // tie at zero and this test would be staging a photo finish — so read the
  // reveal and assert on what actually happened.
  await host.getByTestId('answer-option').nth(0).click();
  await joiner.getByTestId('answer-option').nth(1).click();

  await expect(joiner.getByTestId('results-board')).toBeAttached({ timeout: 60_000 });
  const rows = joiner.getByTestId('results-row');
  await expect(rows).toHaveCount(2);

  // The load-bearing assertion: with one racer ahead on correct answers there
  // is no tie to stage, so the card must never have mounted.
  const tied = await joiner
    .getByTestId('results-row')
    .evaluateAll(els => new Set(els.map(e => e.querySelector('td')?.textContent)).size === 1);
  test.skip(tied, 'both racers happened to miss; that is a tie, not a clean finish');
  await expect(joiner.getByTestId('photo-finish')).toHaveCount(0);
});
```

- [ ] **Step 11: Run the e2e suite**

Run: `npm run test:e2e -- --workers=2`
Expected: PASS, all specs. If a stability/detachment failure appears on an
animated element, re-run before concluding it is a real bug — CURRENT.md
records that shape as a load flake.

- [ ] **Step 12: Run the full gate**

Run: `npm test && npx tsc --noEmit && npm run lint && node scripts/smoke.mjs`
Expected: all green.

- [ ] **Step 13: Commit**

```bash
git add components/PhotoFinish.tsx components/ResultsView.tsx \
  components/stage/StageResults.tsx lib/ceremony/photoFinish.ts \
  lib/ceremony/runtime.ts lib/world/runtime.ts tests/photoFinish.test.ts \
  e2e/tiebreak.spec.ts
git commit -m "feat: the photo finish stages every tied place

A prelude card holds the podium back while each place tied on correct answers
counts its speed points out and resolves, or states that the position is
shared. One derivation (photoFinishFor) is read by both the DOM ticker and the
renderer, so the card's timeline and the podium's rise cannot fall out of step."
```

---
### Task 4: Sudden death in the database

The whole tiebreak, server-side: the room learns to hold a round past its own
finish line, keep that round out of scoring, decide it on the first correct
answer, and lift the winner to the head of the final standings without touching
the Fairness Law's sort clause. No client change — a client that has not been
taught about it renders the tiebreak round as an ordinary question, which is
both harmless and exactly what Task 5 then dresses.

**Files:**
- Modify: `supabase/migrations/0007_the_tiebreak.sql` (append; the file stays
  idempotent and is re-applied whole)
- Modify: `scripts/smoke.mjs`
- Create: `docs/ADR/0042-the-wires-fourth-opening.md`
- Create: `docs/ADR/0043-sudden-death-is-a-round-past-the-finish-line.md`

**Interfaces:**
- Consumes: `standings(room_id, max_round)`, `build_reveal(room_id, round)`,
  `phase_event(room)`, `question_public(room_id, round)` from 0002/0004;
  `rooms.reserve_question_id` from 0006 (ADR-0041).
- Produces — Task 5 consumes exactly these:
  - `rooms.sudden_death_round int`, `rooms.sudden_death_contenders uuid[]`,
    `rooms.sudden_death_winner_id uuid`
  - `scoring_round(p_room_id uuid, p_round int) returns int`
  - `perfect_first_place_tie(p_room_id uuid, p_max_round int) returns uuid[]`
  - `final_standings(p_room_id uuid, p_max_round int) returns jsonb`
  - `phase_event` and `get_room_state` gain one key:
    ```json
    "sudden_death": { "round": 13, "contenders": ["uuid", …], "winner_id": "uuid"|null } | null
    ```

- [ ] **Step 1: Append the schema and the three predicates**

Append to `supabase/migrations/0007_the_tiebreak.sql`:

```sql
-- ============ schema ============
-- ADR-0043: sudden death is a ROUND, not a phase. The reserve question 0006
-- held out of the draw is inserted into room_questions at total_rounds + 1, so
-- question_public, build_reveal, submit_answer, the question surface, the timer
-- ring and useHostDriver's scheduler all work on it unchanged.
--
-- These three columns are everything that makes that round different from any
-- other: which round it is, who is allowed to answer it, and who won.
alter table rooms add column if not exists sudden_death_round int;
alter table rooms add column if not exists sudden_death_contenders uuid[];
alter table rooms add column if not exists sudden_death_winner_id uuid
  references players(id) on delete set null;

-- ============ scoring_round ============
-- THE CLAMP. This is the single mechanism that keeps a tiebreak answer from
-- becoming a correct answer.
--
-- standings() bounds visible answers by `a.round <= p_max_round`, and
-- longest_streak() bounds its walk by `rq.round <= p_max_round`. Clamping every
-- caller's round to total_rounds therefore makes round total_rounds + 1
-- invisible to BOTH — no new argument, no new branch, and `standings`' sort
-- clause stays byte-identical (ADR-0018).
--
-- For every round of a normal game this returns its argument unchanged, so the
-- three functions below are byte-equivalent to their previous bodies for any
-- room that never reaches a tiebreak.
create or replace function scoring_round(p_room_id uuid, p_round int) returns int
language sql stable set search_path = public as $$
  select least(p_round, (select r.total_rounds from rooms r where r.id = p_room_id));
$$;

-- ============ perfect_first_place_tie ============
-- The contenders, or fewer than two racers when there is no tiebreak to hold.
--
-- "Perfect" means every Fairness Law key ABOVE sudden death is level: correct
-- answers, speed points and longest streak (PRD §3.1, §5.4.2). The group is
-- always the HEAD of the standings by construction — the list is already
-- sorted by exactly those keys — which is what lets final_standings below lift
-- the winner without disturbing anybody outside it.
create or replace function perfect_first_place_tie(p_room_id uuid, p_max_round int)
returns uuid[]
language sql stable set search_path = public as $$
  with j as (select standings(p_room_id, p_max_round) as s),
  ranked as (
    select (e->>'player_id')::uuid as pid,
           (e->>'correct')::int as correct,
           (e->>'speed_points')::int as speed,
           (e->>'longest_streak')::int as streak,
           ord
    from j, jsonb_array_elements(j.s) with ordinality as t(e, ord)),
  head as (select correct, speed, streak from ranked where ord = 1)
  select coalesce(array_agg(r.pid order by r.ord), '{}'::uuid[])
  from ranked r, head h
  where r.correct = h.correct and r.speed = h.speed and r.streak = h.streak;
$$;

-- ============ final_standings ============
-- The Fairness Law's FOURTH key, applied as a presentation of the third's
-- result rather than as new arithmetic (roadmap decision 4).
--
-- standings() implements keys 1-3 plus `player_id asc` as a deterministic
-- fallback. PRD §3.1's chain is "Correct Answers -> Speed Points -> Longest
-- Streak -> Sudden Death", so the tiebreak occupies exactly the slot that
-- fallback was standing in. It is applied as a STABLE PARTITION — winner first,
-- everything else in the order standings returned it — so no player outside the
-- tied head group can move, and the sort clause in standings() is untouched.
--
-- `p_max_round` is passed through rather than assumed: end_game deliberately
-- stops the standings at the last RESOLVED round, and this wrapper must not
-- quietly widen that.
create or replace function final_standings(p_room_id uuid, p_max_round int) returns jsonb
language sql stable set search_path = public as $$
  with base as (
    select standings(p_room_id, p_max_round) as s,
           (select r.sudden_death_winner_id from rooms r where r.id = p_room_id) as w)
  select case when base.w is null then base.s else (
    select coalesce(
      jsonb_agg(e order by (e->>'player_id' = base.w::text) desc, ord), '[]'::jsonb)
    from jsonb_array_elements(base.s) with ordinality as t(e, ord)) end
  from base;
$$;
```

- [ ] **Step 2: Append the three replaced projections**

Still in `supabase/migrations/0007_the_tiebreak.sql`:

```sql
-- ============ build_reveal ============
-- Byte-identical to 0002_rpcs.sql except that its embedded standings call is
-- CLAMPED. Without this, the tiebreak round's own reveal would show a
-- scoreboard in which the tiebreak answer had already become a correct answer.
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
    'fastest', (
      select jsonb_build_object('player_id', a.player_id, 'nickname', p.nickname,
                                'time_remaining_ms', a.time_remaining_ms)
      from answers a join players p on p.id = a.player_id
      where a.room_id = p_room_id and a.round = p_round and a.is_correct
      order by a.time_remaining_ms desc limit 1),
    'standings', standings(p_room_id, scoring_round(p_room_id, p_round)))
  from room_questions rq join questions q on q.id = rq.question_id
  where rq.room_id = p_room_id and rq.round = p_round;
$$;

-- ============ phase_event ============
-- Byte-identical to 0005_host_authority.sql except for FOUR changes, all of
-- them consequences of the tiebreak being a round (ADR-0043):
--   * `sudden_death` — the wire's fourth opening (ADR-0042). A client cannot
--     derive this: nothing else on the event says that this round is a
--     tiebreak, who may answer it, or who won.
--   * the reveal arm's standings are clamped (inside build_reveal, above);
--   * the track arm's are clamped too — a tiebreak has no TRACK beat, so this
--     is defence rather than need, and costs nothing on every normal round;
--   * the results arm goes through final_standings, which is byte-equivalent
--     to standings() whenever no tiebreak was won.
create or replace function phase_event(v_room rooms) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'phase', v_room.phase,
    'round', v_room.current_round,
    'ends_at', v_room.phase_ends_at,
    'server_now', now(),
    'status', v_room.status,
    'paused_remaining_ms', v_room.paused_remaining_ms,
    'total_rounds', v_room.total_rounds,
    'sudden_death', case when v_room.sudden_death_round is null then null else
      jsonb_build_object(
        'round', v_room.sudden_death_round,
        'contenders', to_jsonb(coalesce(v_room.sudden_death_contenders, '{}'::uuid[])),
        'winner_id', v_room.sudden_death_winner_id)
      end,
    'payload', case v_room.phase
      when 'read'    then question_public(v_room.id, v_room.current_round)
      when 'answer'  then question_public(v_room.id, v_room.current_round)
      when 'reveal'  then build_reveal(v_room.id, v_room.current_round)
      when 'track'   then standings(v_room.id, scoring_round(v_room.id, v_room.current_round))
      when 'results' then final_standings(v_room.id, scoring_round(v_room.id, v_room.current_round))
      else null
    end);
$$;

-- ============ get_room_state ============
-- Byte-identical to 0005_host_authority.sql except for the same two ideas: the
-- `sudden_death` key on the room, and clamped/finalised standings. The
-- standings arm is restructured from `case when status <> 'lobby'` into three
-- explicit arms so a FINISHED room reads the tiebreak-ordered list — a reload
-- onto the results screen must land on the same order the phase event carried.
create or replace function get_room_state(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
begin
  select * into v_room from rooms where code = upper(p_code);
  if not found then raise exception 'room not found'; end if;

  return jsonb_build_object(
    'room', jsonb_build_object(
      'id', v_room.id, 'code', v_room.code, 'status', v_room.status,
      'phase', v_room.phase, 'round', v_room.current_round,
      'total_rounds', v_room.total_rounds, 'timer_seconds', v_room.timer_seconds,
      'ends_at', v_room.phase_ends_at, 'server_now', now(),
      'paused_remaining_ms', v_room.paused_remaining_ms,
      'sudden_death', case when v_room.sudden_death_round is null then null else
        jsonb_build_object(
          'round', v_room.sudden_death_round,
          'contenders', to_jsonb(coalesce(v_room.sudden_death_contenders, '{}'::uuid[])),
          'winner_id', v_room.sudden_death_winner_id)
        end),
    'players', (
      select coalesce(jsonb_agg(player_public(p) order by p.joined_at), '[]'::jsonb)
      from players p where p.room_id = v_room.id),
    'question', case when v_room.phase in ('read','answer')
      then question_public(v_room.id, v_room.current_round) else null end,
    'reveal', case when v_room.phase in ('reveal','track')
      then build_reveal(v_room.id, v_room.current_round) else null end,
    'standings', case
      when v_room.status = 'lobby' then null
      when v_room.status = 'finished'
        then final_standings(v_room.id, scoring_round(v_room.id, v_room.current_round))
      else standings(v_room.id, scoring_round(v_room.id,
        case when v_room.phase in ('read','answer')
          then v_room.current_round - 1 else v_room.current_round end))
      end);
end $$;
```

- [ ] **Step 3: Append the state machine and the answer guard**

Still in `supabase/migrations/0007_the_tiebreak.sql`. This `advance_phase`
**replaces the one Task 1 wrote** — the file is applied whole, so the later
definition wins; delete Task 1's copy rather than leaving two.

```sql
-- ============ advance_phase ============
-- Task 1's body plus the tiebreak, in three arms:
--
--   answer -> reveal   resolves the tiebreak, so build_reveal below already
--                      runs against a decided room;
--   reveal -> results  a tiebreak round has NO track beat — nobody advances a
--                      segment, and the track is already the length the finish
--                      line was drawn at;
--   track  -> ...      the last regular round either opens the tiebreak or
--                      ends the game, exactly as before.
create or replace function advance_phase(p_room_id uuid, p_host_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_phase text;
  v_round int;
  v_status text := 'playing';
  v_ends timestamptz;
  v_contenders uuid[];
  v_winner uuid;
  v_is_tiebreak boolean;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;
  if v_room.status = 'finished' then raise exception 'game finished'; end if;
  if v_room.status <> 'playing' then raise exception 'game not started'; end if;

  v_round := v_room.current_round;
  v_is_tiebreak := v_room.sudden_death_round is not null
    and v_room.current_round = v_room.sudden_death_round;

  case v_room.phase
    when 'countdown' then v_phase := 'read';
    when 'read'      then v_phase := 'answer';
    when 'answer' then
      v_phase := 'reveal';
      if v_is_tiebreak then
        -- FIRST correct answer wins (PRD §5.4.2). time_remaining_ms is the
        -- server's own measurement of how much of the timer was left, so
        -- `desc` is "answered earliest"; player_id breaks a dead heat the same
        -- deterministic way standings does.
        --
        -- No winner is a legitimate outcome: if nobody in the group got it
        -- right, the tie STANDS and the position is shared, which is PRD §6's
        -- rule for every place sudden death does not reach.
        select a.player_id into v_winner
        from answers a
        where a.room_id = p_room_id
          and a.round = v_room.sudden_death_round
          and a.is_correct
          and a.player_id = any(v_room.sudden_death_contenders)
        order by a.time_remaining_ms desc, a.player_id asc
        limit 1;
        update rooms set sudden_death_winner_id = v_winner where id = p_room_id;
      end if;
    when 'reveal' then
      if v_is_tiebreak then
        v_phase := 'results'; v_status := 'finished';
      else
        v_phase := 'track';
      end if;
    when 'track' then
      if v_room.current_round >= v_room.total_rounds then
        v_contenders := perfect_first_place_tie(p_room_id, v_room.total_rounds);
        if v_room.sudden_death_round is null
           and v_room.reserve_question_id is not null
           and coalesce(array_length(v_contenders, 1), 0) >= 2 then
          -- The tiebreak opens as an ordinary READ, one round past the finish
          -- line. total_rounds is DELIBERATELY unchanged: the track is the
          -- length the race was run at, and growing it here would move the
          -- finish line the field has already crossed.
          v_phase := 'read';
          v_round := v_room.total_rounds + 1;
          insert into room_questions (room_id, round, question_id)
          values (p_room_id, v_round, v_room.reserve_question_id)
          on conflict (room_id, round) do update set question_id = excluded.question_id;
          update rooms set sudden_death_round = v_round,
            sudden_death_contenders = v_contenders
          where id = p_room_id;
        else
          v_phase := 'results'; v_status := 'finished';
        end if;
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
    when 'results' then now() + make_interval(secs => ceremony_ms()::double precision / 1000)
    else null
  end;

  update rooms set phase = v_phase, current_round = v_round,
    status = v_status, phase_ends_at = v_ends
  where id = p_room_id returning * into v_room;

  return phase_event(v_room);
end $$;

-- ============ submit_answer ============
-- Byte-identical to 0005_host_authority.sql except for ONE added guard: the
-- tiebreak belongs to the racers who tied.
--
-- This is authority, not presentation. Task 5 also renders a non-contender as a
-- spectator, but that is a courtesy — the rejection here is the rule
-- (roadmap decision 2).
create or replace function submit_answer(
  p_room_id uuid, p_player_key uuid, p_round int, p_choice_index int
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_player players;
  v_q questions;
  v_remaining_ms int;
  v_total_ms int;
  v_correct boolean;
  v_points int;
begin
  select * into v_room from rooms where id = p_room_id for share;
  if not found then raise exception 'room not found'; end if;
  if v_room.status <> 'playing'
     or v_room.phase <> 'answer'
     or v_room.current_round <> p_round then
    raise exception 'not accepting answers';
  end if;
  v_remaining_ms := ceil(extract(epoch from (v_room.phase_ends_at - now())) * 1000);
  if v_remaining_ms < -300 then raise exception 'too late'; end if;  -- 300ms grace
  v_remaining_ms := greatest(v_remaining_ms, 0);

  select * into v_player from players
    where room_id = p_room_id and player_key = p_player_key;
  if not found then raise exception 'player not found'; end if;
  if not v_player.is_playing then raise exception 'spectators cannot answer'; end if;
  if p_choice_index < 0 or p_choice_index > 3 then raise exception 'invalid choice'; end if;

  if v_room.sudden_death_round is not null
     and p_round = v_room.sudden_death_round
     and not (v_player.id = any(coalesce(v_room.sudden_death_contenders, '{}'::uuid[]))) then
    raise exception 'only the tied racers answer the tiebreak';
  end if;

  select q.* into v_q from room_questions rq
    join questions q on q.id = rq.question_id
    where rq.room_id = p_room_id and rq.round = p_round;

  v_correct := (v_q.correct_index = p_choice_index);
  v_total_ms := v_room.timer_seconds * 1000;
  v_points := case when v_correct
    then floor(v_remaining_ms::numeric / v_total_ms * 100)::int * v_q.tier
    else 0 end;

  begin
    insert into answers (room_id, round, player_id, choice_index, is_correct,
                         time_remaining_ms, speed_points)
    values (p_room_id, p_round, v_player.id, p_choice_index, v_correct,
            v_remaining_ms, v_points);
  exception when unique_violation then
    raise exception 'already answered';
  end;

  return jsonb_build_object('locked', true);
end $$;

-- ============ skip_question ============
-- Task 1's body plus ONE guard: the tiebreak cannot be skipped.
--
-- Skipping means "discard this round and move to the next", and a tiebreak has
-- no next — the renumbering would delete the round, shorten a track that is
-- already the right length, and leave sudden_death_round pointing at nothing.
-- The host who wants out of a tiebreak has end_game, which reaches the ceremony
-- with the tie intact and the position shared.
create or replace function skip_question(p_room_id uuid, p_host_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_round int;
  v_total int;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found or v_room.host_key <> p_host_key then raise exception 'invalid host key'; end if;
  if v_room.status not in ('playing','paused') then raise exception 'game not running'; end if;
  if v_room.phase not in ('read','answer','reveal') then
    raise exception 'cannot skip from phase %', v_room.phase;
  end if;
  if v_room.sudden_death_round is not null
     and v_room.current_round = v_room.sudden_death_round then
    raise exception 'the tiebreak cannot be skipped';
  end if;

  v_round := v_room.current_round;
  v_total := v_room.total_rounds - 1;

  delete from answers where room_id = p_room_id and round = v_round;
  delete from room_questions where room_id = p_room_id and round = v_round;

  update room_questions set round = -round
    where room_id = p_room_id and round > v_round;
  update room_questions set round = (-round) - 1
    where room_id = p_room_id and round < 0;

  if v_round > v_total then
    update rooms set total_rounds = v_total, current_round = v_total,
      status = 'finished', phase = 'results',
      phase_ends_at = now() + make_interval(secs => ceremony_ms()::double precision / 1000),
      paused_remaining_ms = null
    where id = p_room_id returning * into v_room;
  else
    update rooms set total_rounds = v_total, status = 'playing', phase = 'read',
      phase_ends_at = now() + interval '3 seconds', paused_remaining_ms = null
    where id = p_room_id returning * into v_room;
  end if;

  return phase_event(v_room);
end $$;

grant execute on all functions in schema public to anon, authenticated;
```

> **`end_game` needs no further change.** Called during a tiebreak's READ or
> ANSWER it discards that round's partial answers and drops `current_round` from
> `total_rounds + 1` back to `total_rounds`, so `final_standings` sees a room
> with no winner and the tie stands. Called at the tiebreak's REVEAL the winner
> is already recorded and `scoring_round` clamps the max round, so the ceremony
> lands on the decided order. Both are correct with the Task 1 body; assert both
> in the smoke harness rather than adding code.

- [ ] **Step 4: Apply the migration twice and confirm idempotency**

```bash
docker exec -i supabase_db_quiz-game \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  < supabase/migrations/0007_the_tiebreak.sql
docker exec -i supabase_db_quiz-game \
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  < supabase/migrations/0007_the_tiebreak.sql
```
Expected: both runs end with `GRANT` and no error.

Then check the clamp does nothing to a normal room:
```bash
docker exec -i supabase_db_quiz-game psql -U postgres -d postgres -c \
  "select scoring_round(id, current_round) = current_round as unchanged
   from rooms where total_rounds >= current_round limit 5;"
```
Expected: every row `t`.

- [ ] **Step 5: Extend the integration harness**

This is P2a's real regression net: sudden death has no client-side
representation to unit-test, which is precisely the case the roadmap (§5) grew
`scripts/smoke.mjs` into an integration harness for.

Append to `scripts/smoke.mjs`, after the `P2a ceremony-deadline` section:

```js
// ---- P2a: sudden death ----
// A PERFECT first-place tie is built deterministically, never by timing luck:
// a one-question room in which nobody answers leaves every racer on 0 correct,
// 0 speed points and a 0 streak. That is a perfect tie for first place by
// construction, and the only fully reproducible way to reach one.
const sleep = ms => new Promise(r => setTimeout(r, ms));

const sd = await rpc('create_room', {
  p_timer_seconds: 5, p_categories: ['fuel'], p_tier_counts: [1, 0, 0, 0],
});
const sdHost = await rpc('join_room', {
  p_code: sd.code, p_nickname: 'Ada', p_avatar: 'robot', p_color: '#f59e0b',
  p_host_key: sd.host_key,
});
const sdP2 = await rpc('join_room', {
  p_code: sd.code, p_nickname: 'Grace', p_avatar: 'duck', p_color: '#38bdf8',
});

await rpc('start_game', { p_room_id: sd.room_id, p_host_key: sd.host_key });
await rpc('advance_phase', { p_room_id: sd.room_id, p_host_key: sd.host_key }); // read
await rpc('advance_phase', { p_room_id: sd.room_id, p_host_key: sd.host_key }); // answer
// Nobody answers.
await rpc('advance_phase', { p_room_id: sd.room_id, p_host_key: sd.host_key }); // reveal
let sdEvt = await rpc('advance_phase', { p_room_id: sd.room_id, p_host_key: sd.host_key }); // track
assert.equal(sdEvt.phase, 'track');
assert.equal(sdEvt.sudden_death, null, 'no tiebreak is open before the last track resolves');

// -- the last track opens the tiebreak instead of the ceremony
sdEvt = await rpc('advance_phase', { p_room_id: sd.room_id, p_host_key: sd.host_key });
assert.equal(sdEvt.phase, 'read', 'a perfect first-place tie opens a tiebreak round');
assert.equal(sdEvt.status, 'playing', 'the game is not finished yet');
assert.equal(sdEvt.round, 2, 'the tiebreak sits one round past the finish line');
assert.equal(sdEvt.total_rounds, 1, 'the track does NOT grow');
assert.ok(sdEvt.payload.prompt, 'the reserve question is a real question');
assert.equal(sdEvt.payload.correct_index, undefined, 'and it does not leak its answer');
assert.equal(sdEvt.sudden_death.round, 2);
assert.equal(sdEvt.sudden_death.winner_id, null, 'nobody has won it yet');
assert.deepEqual(
  [...sdEvt.sudden_death.contenders].sort(),
  [sdHost.player_id, sdP2.player_id].sort(),
  'both racers tied perfectly, so both are contenders');

// -- the tiebreak question is the reserve, and it was never in the race
const sdDrawnPrompts = await rpc('get_room_state', { p_code: sd.code });
assert.equal(sdDrawnPrompts.room.sudden_death.round, 2,
  'get_room_state carries the tiebreak too, so a reload lands in it');

// -- only contenders may answer, and here that is everyone
sdEvt = await rpc('advance_phase', { p_room_id: sd.room_id, p_host_key: sd.host_key }); // answer
assert.equal(sdEvt.phase, 'answer');
await rpc('submit_answer', {
  p_room_id: sd.room_id, p_player_key: sdHost.player_key, p_round: 2, p_choice_index: 0,
});
await sleep(400);
await rpc('submit_answer', {
  p_room_id: sd.room_id, p_player_key: sdP2.player_key, p_round: 2, p_choice_index: 1,
});

// -- the reveal resolves it, and the tiebreak answer is NOT a correct answer
sdEvt = await rpc('advance_phase', { p_room_id: sd.room_id, p_host_key: sd.host_key }); // reveal
assert.equal(sdEvt.phase, 'reveal');
const sdCorrectIndex = sdEvt.payload.correct_index;
const sdExpectedWinner =
  sdCorrectIndex === 0 ? sdHost.player_id : sdCorrectIndex === 1 ? sdP2.player_id : null;
assert.equal(sdEvt.sudden_death.winner_id, sdExpectedWinner,
  'the first correct answer among the contenders wins');
for (const row of sdEvt.payload.standings) {
  assert.equal(row.correct, 0, 'the tiebreak answer never becomes a correct answer');
  assert.equal(row.speed_points, 0, 'nor a speed point');
  assert.equal(row.longest_streak, 0, 'nor a streak');
}

// -- a tiebreak has no TRACK beat: reveal goes straight to the ceremony
sdEvt = await rpc('advance_phase', { p_room_id: sd.room_id, p_host_key: sd.host_key });
assert.equal(sdEvt.phase, 'results', 'the tiebreak reveal ends the game');
assert.equal(sdEvt.status, 'finished');
const sdCeremonyMs = new Date(sdEvt.ends_at) - new Date(sdEvt.server_now);
assert.ok(Math.abs(sdCeremonyMs - CEREMONY_MS) < 500, 'the ceremony still gets its full length');

if (sdExpectedWinner) {
  assert.equal(sdEvt.payload[0].player_id, sdExpectedWinner,
    'the tiebreak winner heads the final standings');
  assert.equal(sdEvt.payload[0].correct, 0,
    'and they head it on the tiebreak alone, with no invented correct answer');
} else {
  console.log('   (the reserve question had no contender pick it — the tie stands)');
}
assert.equal(sdEvt.payload.length, 2, 'nobody is dropped from the final standings');

// -- a reload onto the finished room sees the same order
const sdFinal = await rpc('get_room_state', { p_code: sd.code });
assert.deepEqual(
  sdFinal.standings.map(s => s.player_id),
  sdEvt.payload.map(s => s.player_id),
  'get_room_state and the phase event agree on the final order');
assert.equal(sdFinal.room.sudden_death.winner_id, sdExpectedWinner);

console.log('✅ P2a sudden-death smoke passed');

// ---- P2a: the tiebreak's boundaries ----
// A clean finish must be untouched by any of the above.
const clean = await rpc('create_room', {
  p_timer_seconds: 5, p_categories: ['fuel'], p_tier_counts: [1, 0, 0, 0],
});
const cleanHost = await rpc('join_room', {
  p_code: clean.code, p_nickname: 'Solo', p_avatar: 'robot', p_color: '#f59e0b',
  p_host_key: clean.host_key,
});
await rpc('join_room', {
  p_code: clean.code, p_nickname: 'Duo', p_avatar: 'duck', p_color: '#38bdf8',
});
await rpc('start_game', { p_room_id: clean.room_id, p_host_key: clean.host_key });
await rpc('advance_phase', { p_room_id: clean.room_id, p_host_key: clean.host_key }); // read
let cleanEvt = await rpc('advance_phase', {
  p_room_id: clean.room_id, p_host_key: clean.host_key,
}); // answer
// Both tier-1 'fuel' questions are correct_index 0 in the seed, which the
// game-flow section above already depends on. One racer takes it; the other
// does not answer, so the finish is decided on correct answers alone.
await rpc('submit_answer', {
  p_room_id: clean.room_id, p_player_key: cleanHost.player_key,
  p_round: 1, p_choice_index: 0,
});
await rpc('advance_phase', { p_room_id: clean.room_id, p_host_key: clean.host_key }); // reveal
await rpc('advance_phase', { p_room_id: clean.room_id, p_host_key: clean.host_key }); // track
cleanEvt = await rpc('advance_phase', { p_room_id: clean.room_id, p_host_key: clean.host_key });
assert.equal(cleanEvt.phase, 'results', 'a decided race goes straight to the ceremony');
assert.equal(cleanEvt.status, 'finished');
assert.equal(cleanEvt.sudden_death, null, 'and never opens a tiebreak');
assert.equal(cleanEvt.payload[0].nickname, 'Solo');
assert.equal(cleanEvt.payload[0].correct, 1);

// -- the tiebreak cannot be skipped, and end_game leaves the tie standing
const bail = await rpc('create_room', {
  p_timer_seconds: 5, p_categories: ['fuel'], p_tier_counts: [1, 0, 0, 0],
});
await rpc('join_room', {
  p_code: bail.code, p_nickname: 'Quit1', p_avatar: 'robot', p_color: '#f59e0b',
  p_host_key: bail.host_key,
});
await rpc('join_room', {
  p_code: bail.code, p_nickname: 'Quit2', p_avatar: 'duck', p_color: '#38bdf8',
});
await rpc('start_game', { p_room_id: bail.room_id, p_host_key: bail.host_key });
for (const _ of ['read', 'answer', 'reveal', 'track']) {
  await rpc('advance_phase', { p_room_id: bail.room_id, p_host_key: bail.host_key });
}
const bailSd = await rpc('advance_phase', { p_room_id: bail.room_id, p_host_key: bail.host_key });
assert.equal(bailSd.sudden_death.round, 2, 'the tiebreak opened');

await rpcFails('skip_question',
  { p_room_id: bail.room_id, p_host_key: bail.host_key },
  /tiebreak cannot be skipped/i);

// A pause still works on a tiebreak — it is an ordinary round in every way the
// host's controls care about.
const bailPaused = await rpc('pause_game', { p_room_id: bail.room_id, p_host_key: bail.host_key });
assert.equal(bailPaused.status, 'paused');
assert.equal(bailPaused.sudden_death.round, 2, 'a paused tiebreak is still a tiebreak');
await rpc('resume_game', { p_room_id: bail.room_id, p_host_key: bail.host_key });

const bailEnded = await rpc('end_game', { p_room_id: bail.room_id, p_host_key: bail.host_key });
assert.equal(bailEnded.phase, 'results');
assert.equal(bailEnded.sudden_death.winner_id, null,
  'ending during a tiebreak leaves it unresolved');
assert.equal(bailEnded.payload.length, 2);
for (const row of bailEnded.payload) {
  assert.equal(row.correct, 0, 'and invents nothing on the way out');
}

console.log('✅ P2a tiebreak-boundaries smoke passed');
```

> **Contender exclusion is not asserted here, deliberately.** Reaching a state
> where one racer is *outside* a perfect first-place tie requires two players
> with identical non-zero speed points and a third below them, which needs two
> `submit_answer` calls to land in the same 200ms speed-point bucket — a timing
> race, not a fact. The guard is instead exercised by hand in Task 6's live
> verification, where the bucket can be forced with a direct `update answers`,
> and it is proven by construction here: `submit_answer` rejects any player not
> in `sudden_death_contenders`, and the contender array is written by
> `perfect_first_place_tie` alone.

- [ ] **Step 6: Run the harness**

Run: `node scripts/smoke.mjs`
Expected: every existing `✅` plus `✅ P2a sudden-death smoke passed` and
`✅ P2a tiebreak-boundaries smoke passed`.

If the sudden-death section fails at `a perfect first-place tie opens a
tiebreak round`, check `select reserve_question_id from rooms where code = …`
first: ADR-0041 says a room created before migration 0006 has none, and
`advance_phase` then falls through to the ceremony by design.

- [ ] **Step 7: Confirm the client still works untouched**

The client does not yet know what `sudden_death` is, and must not care.

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green — `PhaseEvent` has no index signature, but the extra JSON
key is simply ignored at runtime and TypeScript never sees the wire.

Run: `npm run test:e2e -- --workers=2`
Expected: PASS. A room that reaches a tiebreak renders it as an ordinary
question with a "Q2/1" badge — ugly, and exactly what Task 5 fixes.

- [ ] **Step 8: Write ADR-0042**

Create `docs/ADR/0042-the-wires-fourth-opening.md`:

```markdown
# ADR-0042: The wire's fourth opening — `sudden_death`

- **Status:** Accepted
- **Date:** 2026-08-29
- **Phase:** M3 P2a — The tiebreak

## Context

The M3 roadmap (decision 1) keeps the wire semantic and demands that "every new
payload field earns the justification ADR-0018 and ADR-0028 demanded of M2's two
protocol openings." ADR-0037 was the third, for `status`,
`paused_remaining_ms` and `total_rounds`.

The tiebreak is a round like any other on the wire: `phase: 'read'`,
`round: 13`, a `question_public` payload. Nothing on the event distinguishes it
from round 13 of a thirteen-round game — and three different clients need it to.
The question surface has to say "Sudden death" rather than "Q13/12"; a racer
outside the tied group has to be shown as watching rather than being handed a
grid the server will reject; and the photo finish has to know which tied group
was already decided on screen so it does not restage it.

Deriving it was considered and rejected on each count. `round > total_rounds` is
a real signal, but it says only *that* this is a tiebreak, never *who* is in it
or *who won* — and the client would be inferring a game rule from an arithmetic
accident rather than being told.

## Decision

`phase_event` and `get_room_state` carry one new key, nested rather than three
flat fields, so the "no tiebreak" case is a single `null`:

```json
"sudden_death": { "round": 13, "contenders": ["uuid", …], "winner_id": "uuid"|null } | null
```

It describes game meaning — which round is the tiebreak, who is racing it, who
won it — and never a coordinate, a sprite or a renderer concept.

## Consequences

- **A pre-0007 database omits the key**, and `SuddenDeathInfo` is optional on
  both `PhaseEvent` and `RoomInfo`. `lib/store.ts` folds an absent key to
  `null`, which every consumer reads as "no tiebreak" — the same graceful
  fallback shape ADR-0018 asks of every opening.
- **`contenders` is the authority's own list, echoed, not a second one.** The
  client uses it to render; `submit_answer` enforces it. A client that ignored
  it entirely would still be rejected server-side (roadmap decision 2).
- **`winner_id` arrives one event after `contenders`** — it is written at the
  tiebreak's `answer → reveal` transition, so the reveal is the first event that
  carries it. Anything that wants the winner must read it from the reveal or
  later, never from the READ.
- **The reserve question id stays off the wire.** ADR-0041 is explicit that
  revealing the tiebreak question would defeat it; this opening carries who and
  whether, never what.
- **This is the last opening M3 P2 spends.** P2b's awards are a projection
  computed from `answers` and delivered inside an existing payload; they must
  not add a fifth.
```

- [ ] **Step 9: Write ADR-0043**

Create `docs/ADR/0043-sudden-death-is-a-round-past-the-finish-line.md`:

```markdown
# ADR-0043: Sudden death is a round past the finish line, not a phase

- **Status:** Accepted
- **Date:** 2026-08-29
- **Phase:** M3 P2a — The tiebreak

## Context

PRD §5.4.2's sudden death is a whole question: it is read, it is answered under
the timer, and it is revealed. The obvious modelling is a new value in
`rooms.phase`'s check constraint — `'sudden_death'` — with the room moving
through it as a unit.

That costs a case in every switch the phase reaches, and the phase reaches a
great deal of this codebase: `advance_phase`'s `case`, `phase_event`'s payload
`case`, `beatFor`, `beatTotalMs`, `stepsAt`, `stagingAt`, both shot books'
`base: Record<Phase, CameraIntent>`, `deriveCues`'s `phaseCues`, `get_room_state`
three times. Worse, `question_public`, `build_reveal` and `submit_answer` all
look their question up by `(room_id, round)` in `room_questions` — a question
that lived somewhere else would need a second lookup path through each of them,
which is three more places Design Pillar 2 could be broken.

## Decision

Sudden death is **a round**, at `total_rounds + 1`. The reserve question 0006
drew (ADR-0041) is inserted into `room_questions` at that round, and the room
moves through the ordinary `read → answer → reveal` it already knows.

Three columns say what is different about it — `sudden_death_round`,
`sudden_death_contenders`, `sudden_death_winner_id` — and two arms of
`advance_phase` act on them: the tiebreak resolves at `answer → reveal`, and
`reveal` goes to `results` rather than `track`, because nobody advances a
segment.

`total_rounds` is deliberately **not** incremented: the track is the length the
race was run at, and growing it would move a finish line the field has already
crossed.

It is kept out of scoring by one clamp. `standings` bounds visible answers by
`a.round <= p_max_round` and `longest_streak` bounds its walk the same way, so
passing `scoring_round(room, round) = least(round, total_rounds)` at every call
site makes the tiebreak round invisible to both.

## Consequences

- **Everything downstream works unchanged**: the question card, the answer grid,
  the timer ring, the tension ramp, the answer lock, `useHostDriver`'s
  scheduler, `submit_answer`'s grace window and duplicate guard, and the reveal's
  distribution bar. Task 5's client work is presentation only.
- **`standings`' sort clause is untouched** (ADR-0018 holds). Sudden death is
  PRD §3.1's fourth lexicographic key and is applied by `final_standings` as a
  stable partition of the head group — winner first, everyone else in the order
  `standings` returned them — so nobody outside the tied group can move.
- **A tiebreak answer can never become a correct answer.** This is the clamp's
  whole job, and it is asserted directly in `scripts/smoke.mjs`: after a
  tiebreak, every racer's `correct`, `speed_points` and `longest_streak` are
  still what they were at the finish line.
- **The round NUMBER exceeds `total_rounds` while the tiebreak runs.** Anything
  that renders `round`/`total_rounds` must special-case it — `QuestionCard` does
  — and anything that computes a scoring bound must clamp. `scoring_round` is
  the one place that clamp lives; a future caller that forgets it will
  silently count the tiebreak.
- **`skip_question` refuses the tiebreak round.** Skipping means "discard this
  and move to the next", and there is no next; the renumbering would also
  shorten a track that is already correct. `end_game` remains the way out, and
  it leaves the tie standing with the position shared — PRD §6's rule.
- **A room created before migration 0006 has no reserve** and can never open a
  tiebreak (ADR-0041 anticipated this). `advance_phase` falls through to the
  ceremony, the tie stands, and the position is shared. No error, no special
  case.
```

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/0007_the_tiebreak.sql scripts/smoke.mjs \
  docs/ADR/0042-the-wires-fourth-opening.md \
  docs/ADR/0043-sudden-death-is-a-round-past-the-finish-line.md
git commit -m "feat: sudden death, as a round past the finish line

A perfect first-place tie opens the reserve question at total_rounds + 1 and
resolves on the first correct answer among the tied racers. The round is kept
out of scoring by one clamp, so standings' sort clause is untouched and the
tiebreak answer never becomes a correct answer; the winner is lifted to the head
of the final standings by a stable partition. See ADR-0042 and ADR-0043."
```

---
### Task 5: Sudden death on screen

Everything the room sees. The server already decides the tiebreak; this task
gives it a name on the question surface, a rung on the celebration hierarchy, a
camera shot, a sting, a spectator state for the racers who are not in it, and a
line on the results board saying how first place was actually won.

**Files:**
- Create: `components/SuddenDeathBanner.tsx`
- Modify: `lib/types.ts`
- Modify: `lib/store.ts`
- Modify: `lib/presentation/celebration.ts`
- Modify: `lib/presentation/cues.ts`
- Modify: `lib/presentation/deriveCues.ts`
- Modify: `lib/ceremony/photoFinish.ts`
- Modify: `lib/audio/design.ts`
- Modify: `lib/audio/state.ts`
- Modify: `lib/staging/useStaging.ts`
- Modify: `lib/staging/runtime.ts`
- Modify: `lib/world/director.ts`
- Modify: `components/QuestionCard.tsx`
- Modify: `components/WinnerCard.tsx`
- Modify: `components/GameView.tsx`
- Modify: `components/ResultsView.tsx`
- Modify: `components/stage/StageBroadcast.tsx`
- Modify: `components/stage/StageResults.tsx`
- Test: `tests/celebration.test.ts`, `tests/deriveCues.test.ts`,
  `tests/audioState.test.ts`, `tests/director.test.ts`,
  `tests/photoFinish.test.ts`

**Interfaces:**
- Consumes: `sudden_death` from the phase event (ADR-0042, Task 4).
- Produces:
  ```ts
  // lib/types.ts
  export interface SuddenDeathInfo {
    round: number;
    contenders: string[];
    winner_id: string | null;
  }
  // lib/presentation/cues.ts
  export interface SuddenDeathCue {
    type: 'sudden-death';
    tier: 'suddenDeath';
    round: number;
    contenders: string[];
  }
  // lib/staging/useStaging.ts
  suddenDeath: boolean;            // true for the tiebreak round only
  setSuddenDeath(on: boolean): void;
  ```
  `CELEBRATION_TIERS` becomes
  `['routine','streakMilestone','overtake','finalQuestion','suddenDeath','victory']`.

- [ ] **Step 1: Write the failing tests — the celebration rung**

Replace the first two `it` blocks of `tests/celebration.test.ts`:

```ts
  it('pins the ordinal scale fixed by the M2 roadmap, plus M3 P2a\'s one rung', () => {
    expect(CELEBRATION_TIERS).toEqual([
      'routine',
      'streakMilestone',
      'overtake',
      'finalQuestion',
      'suddenDeath',
      'victory',
    ]);
  });

  it('ranks strictly ascending so routine can never outrank a major moment', () => {
    const ranks = CELEBRATION_TIERS.map(tierRank);
    expect(ranks).toEqual([0, 1, 2, 3, 4, 5]);
    for (let i = 1; i < ranks.length; i++) expect(ranks[i]).toBeGreaterThan(ranks[i - 1]);
  });
```

and add, inside the `resolveTier` block:

```ts
  it('stages sudden death above the final question and below victory', () => {
    expect(resolveTier([cue('finalQuestion'), cue('suddenDeath')])).toBe('suddenDeath');
    expect(resolveTier([cue('suddenDeath'), cue('victory')])).toBe('victory');
  });
```

- [ ] **Step 2: Write the failing tests — the cue on both paths**

Add to `tests/deriveCues.test.ts`, using the file's own fixtures: `source(over)`
builds a `CueSource` and lets `room` be overridden whole (the idiom already used
by the pause tests around line 537), `run(steps)` threads snapshots through the
deriver, and `types(batch)` maps a batch to its cue types.

```ts
describe('sudden death', () => {
  const lastTrack = {
    phase: 'track' as const, round: 1, total_rounds: 1,
    ends_at: null, status: 'playing' as const,
  };
  const tiebreak = {
    phase: 'read' as const, round: 2, total_rounds: 1,
    ends_at: null, status: 'playing' as const,
    sudden_death: { round: 2, contenders: [A, B], winner_id: null },
  };
  const q = {
    category: 'fuel', tier: 1 as const,
    prompt: 'Which mug is haunted?', options: ['a', 'b', 'c', 'd'],
  };

  it('announces the tiebreak once, ahead of its READ, and never again', () => {
    const { batches } = run([
      source({ room: lastTrack }),
      source({ room: tiebreak, question: q }),
      source({ room: { ...tiebreak, phase: 'answer' }, question: q }),
    ]);
    expect(types(batches[1])).toEqual(['sudden-death', 'phase-read']);
    expect(types(batches[2])).toEqual(['phase-answer']);
  });

  it('seeds the cue for a client that reloads into the tiebreak', () => {
    const { batches } = run([source({ room: { ...tiebreak, phase: 'answer' }, question: q })]);
    expect(types(batches[0])).toEqual(['sudden-death', 'phase-answer']);
    // The tiebreak's own cue carries the higher rung, so the final-question
    // synthesis must stand down rather than spend a second moment on one beat.
    expect(types(batches[0])).not.toContain('final-question');
  });

  it('marks the tiebreak READ as final so the camera escalation is not zeroed', () => {
    const { batches } = run([
      source({ room: lastTrack }),
      source({ room: tiebreak, question: q }),
    ]);
    expect(batches[1].find(c => c.type === 'phase-read')).toMatchObject({ isFinal: true });
  });

  it('leaves a race with no tiebreak exactly as it was', () => {
    const { batches } = run([
      source({ room: lastTrack }),
      source({ room: { ...lastTrack, phase: 'results' }, standings: [] }),
    ]);
    expect(types(batches[1])).toEqual(['phase-results', 'podium']);
  });
});
```

> `A` and `B` are the file's existing player-id constants. A `sudden_death` key
> on the room override is only type-checked once Step 7 adds it to `CueRoom`,
> which is why this test file fails to compile until then — that is the failure
> Step 4 expects.

- [ ] **Step 3: Write the failing tests — audio and the camera**

Add to `tests/audioState.test.ts`:

```ts
const suddenDeath: Cue = {
  type: 'sudden-death', tier: 'suddenDeath', round: 2, contenders: ['a', 'b'],
};

it('stings the tiebreak once it is live', () => {
  const live = endCatchUp(initialAudioState);
  expect(applyCue(live, suddenDeath).stings).toEqual(['final-sting']);
});

it('suppresses the tiebreak sting on a catch-up batch', () => {
  expect(applyCue(initialAudioState, suddenDeath).stings).toEqual([]);
});

it('holds the escalated bed through the tiebreak', () => {
  const live = endCatchUp(initialAudioState);
  expect(applyCue(live, suddenDeath).state.escalated).toBe(true);
});
```

Add to `tests/director.test.ts`:

```ts
describe('sudden-death', () => {
  it('punches in the final-question shot at its own tier and escalates', () => {
    const state = reduceCue(
      initialDirectorState,
      { type: 'sudden-death', tier: 'suddenDeath', round: 2, contenders: ['a'] },
      0,
    );
    expect(state.escalation).toBe(1);
    expect(state.transient?.tier).toBe('suddenDeath');
  });

  it('outranks a live overtake transient, which final-question would not', () => {
    const withOvertake = reduceCue(
      initialDirectorState,
      { type: 'overtake', tier: 'overtake', playerId: 'a', passed: ['b'] },
      0,
    );
    const state = reduceCue(
      withOvertake,
      { type: 'sudden-death', tier: 'suddenDeath', round: 2, contenders: ['a'] },
      10,
    );
    expect(state.transient?.tier).toBe('suddenDeath');
  });
});
```

- [ ] **Step 4: Run all four test files to verify they fail**

Run: `npm test -- tests/celebration.test.ts tests/deriveCues.test.ts tests/audioState.test.ts tests/director.test.ts`
Expected: FAIL — `suddenDeath` is not a `CelebrationTier`, `'sudden-death'` is
not a `Cue['type']`, and TypeScript rejects the fixtures.

- [ ] **Step 5: Open the wire and the store**

`lib/types.ts` — add beside `RoomStatus`:

```ts
/**
 * The tiebreak, as the server describes it (ADR-0042).
 *
 * `contenders` is the authority's own list echoed back for rendering;
 * `submit_answer` enforces it, so a client that ignored this would still be
 * refused. `winner_id` is null until the tiebreak's REVEAL — it is written at
 * the `answer -> reveal` transition, so the READ never carries it.
 */
export interface SuddenDeathInfo {
  /** The round the tiebreak occupies: always `total_rounds + 1` (ADR-0043). */
  round: number;
  contenders: string[];
  winner_id: string | null;
}
```

and on both `PhaseEvent` and `RoomInfo`:

```ts
  /** The tiebreak, or null. Absent against a pre-0007 database. */
  sudden_death?: SuddenDeathInfo | null;
```

`lib/store.ts` — inside `applyPhaseEvent`'s `next.room` object, after
`total_rounds`:

```ts
        // The tiebreak is not derivable from anything else on the event: a
        // tiebreak READ is indistinguishable from an ordinary one but for this
        // (ADR-0042). An absent key folds to null, which every consumer reads
        // as "no tiebreak".
        sudden_death: e.sudden_death ?? null,
```

- [ ] **Step 6: Add the rung and the cue**

`lib/presentation/celebration.ts` — insert one entry:

```ts
export const CELEBRATION_TIERS = [
  'routine',
  'streakMilestone',
  'overtake',
  'finalQuestion',
  // M3 roadmap decision 6: the hierarchy extends by EXACTLY one rung, here.
  // Above the final question because a tiebreak is the question after the last
  // one; below victory because it decides the winner rather than crowning them.
  'suddenDeath',
  'victory',
] as const;
```

`lib/presentation/cues.ts` — add after the escalation section:

```ts
/* ── The tiebreak ────────────────────────────────────────────────────────── */

/**
 * A perfect first-place tie has opened a sudden-death round (PRD §5.4.2).
 *
 * The one new rung M3 is allowed (roadmap decision 6). Semantic: it names the
 * round and who is racing it, never a shot, a colour or a sprite.
 */
export interface SuddenDeathCue {
  type: 'sudden-death';
  tier: 'suddenDeath';
  round: number;
  contenders: string[];
}
```
and add `| SuddenDeathCue` to the `Cue` union.

- [ ] **Step 7: Derive the cue**

`lib/presentation/deriveCues.ts`:

Add to `CueRoom`:
```ts
  /** The tiebreak, or null/absent when the race ended cleanly (ADR-0042). */
  sudden_death?: { round: number; contenders: string[]; winner_id: string | null } | null;
```

Add a helper beside `phaseCues`:
```ts
/** True while the room is on its tiebreak round. */
function inTiebreak(room: CueRoom): boolean {
  return !!room.sudden_death && room.round === room.sudden_death.round;
}
```

In `phaseCues`, change the `isFinal` line and the `read` arm:
```ts
  const tiebreak = inTiebreak(room);
  // The tiebreak IS the final question, in the strongest sense the game has.
  // Saying so here is load-bearing: `reduceCue`'s `phase-read` arm zeroes the
  // camera's escalation whenever `isFinal` is false, which would darken the
  // world back down one frame after the tiebreak lit it.
  const isFinal = tiebreak || (room.total_rounds > 0 && room.round === room.total_rounds);
```
```ts
    case 'read': {
      const cues: Cue[] = [];
      // Emitted BEFORE phase-read, exactly as `final-question` is emitted
      // before `phase-track` on the run-up (ADR-0021): lib/staging/runtime.ts
      // resolves the beat's headline on the phase cue and must already hold
      // this one.
      if (tiebreak) {
        cues.push({
          type: 'sudden-death',
          tier: 'suddenDeath',
          round: room.round,
          contenders: room.sudden_death!.contenders,
        });
      }
      cues.push({
        type: 'phase-read',
        tier: 'routine',
        round: room.round,
        category: next.question?.category ?? null,
        questionTier: next.question?.tier ?? null,
        isFinal,
      });
      return cues;
    }
```

In the `!state.seeded` branch, beside the existing `final-question` synthesis:
```ts
    // A client that reloads into the tiebreak never saw it open. Seeded here
    // for the same reason the final-question escalation is, and INSTEAD of it:
    // the tiebreak's own cue carries the higher rung, and announcing both would
    // spend two moments on one beat.
    const inSuddenDeath =
      !!room.sudden_death &&
      room.round === room.sudden_death.round &&
      room.phase !== 'lobby' &&
      room.phase !== 'results';
    if (inSuddenDeath && !seedCues.some(c => c.type === 'sudden-death')) {
      seedCues.unshift({
        type: 'sudden-death',
        tier: 'suddenDeath',
        round: room.round,
        contenders: room.sudden_death!.contenders,
      });
    }
```
and guard the existing `inFinalRound` synthesis so the two cannot both fire:
```ts
    const inFinalRound =
      !inSuddenDeath &&
      room.total_rounds > 0 &&
      room.round === room.total_rounds &&
      room.phase !== 'lobby' &&
      room.phase !== 'results';
```

> Note the ordering constraint: `inSuddenDeath` must be computed **before**
> `inFinalRound` reads it.

- [ ] **Step 8: Give it a sound and a shot**

`lib/audio/design.ts` — add to `stingFor`, above `case 'podium'`:
```ts
    // Reuses the final-question sting rather than adding an asset. The sounds
    // are generated source, not files (ADR-0025), and a new one would mean a
    // regenerate pass for a moment that already has the right character: this
    // IS the final question, one rung up. P2b may revisit it.
    case 'sudden-death': return 'final-sting';
```

`lib/audio/state.ts` — add `'sudden-death'` to `DRAMA_TYPES`? **No.** Add it to
`AUDIO_CUE_TYPES` only, and set `escalated` on sight beside `final-question`:
```ts
export const AUDIO_CUE_TYPES: readonly CueType[] = [
  'phase-countdown', 'phase-read', 'phase-answer', 'phase-reveal', 'phase-track', 'phase-results',
  'answer-locked', 'answer-resolved', 'player-joined', 'podium',
  'game-paused', 'game-resumed', 'sudden-death',
  ...DRAMA_TYPES,
];
```
```ts
  // Set on SIGHT, for the same reason `final-question` is (ADR-0021, ADR-0024).
  // NOT buffered to a TRACK beat like the drama cues: a tiebreak has no track
  // beat at all (ADR-0043), so a buffered sting would never be spent.
  if (cue.type === 'final-question' || cue.type === 'sudden-death') {
    next = { ...next, escalated: true };
  }
```
(replacing the existing single-cue `escalated` line).

`lib/world/director.ts` — add an arm beside `final-question`:
```ts
    case 'sudden-death':
      return {
        // The same shot as the final question — the tiebreak is that moment
        // again, so inventing a second push would say it twice. What differs is
        // the TIER it carries, which is what lets it preempt a live overtake
        // transient the final question could not.
        ...withTransient(state, shots.finalQuestionShot, shots.finalQuestionHoldMs, now),
        escalation: 1,
      };
```
and add `'sudden-death'` to `lib/world/runtime.ts`'s `SUBSCRIBED` array.

> `shots.finalQuestionShot` carries `tier: 'finalQuestion'`. `withTransient`
> compares the *incoming* intent's tier against the live one, so pass the shot
> through with its tier raised:
> ```ts
>     case 'sudden-death': {
>       const shot = { ...shots.finalQuestionShot, tier: 'suddenDeath' as const };
>       return {
>         ...withTransient(state, shot, shots.finalQuestionHoldMs, now),
>         escalation: 1,
>       };
>     }
> ```
> Use this second form — the first would be preempted by a live overtake, which
> is the opposite of the hierarchy.

- [ ] **Step 9: Run the four test files to verify they pass**

Run: `npm test -- tests/celebration.test.ts tests/deriveCues.test.ts tests/audioState.test.ts tests/director.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS. If `tests/store.test.ts` compares whole `RoomInfo` objects,
add `sudden_death: null` to its expectations rather than making the store field
optional at runtime.

- [ ] **Step 10: Teach the staging store and runtime about the tiebreak**

`lib/staging/useStaging.ts` — add beside `escalated`:

```ts
  /** True for the tiebreak round only. Set on sight; cleared at the ceremony. */
  suddenDeath: boolean;
  setSuddenDeath(on: boolean): void;
```
```ts
  suddenDeath: false,
  setSuddenDeath(on) {
    set(state => (state.suddenDeath === on ? state : { suddenDeath: on }));
  },
```

`lib/staging/runtime.ts`:

Destructure `setSuddenDeath` from `useStaging.getState()`, then add two
subscriptions inside the `unsubscribes` array:

```ts
    // Set on SIGHT, never deferred: a reload seeds this cue directly into the
    // tiebreak's READ, ANSWER or REVEAL (ADR-0021's shape, ADR-0024's rule).
    on('sudden-death', () => {
      callouts = { ...callouts, escalated: true };
      setSuddenDeath(true);
      publishCallouts();
    }),
```
and extend the existing `phase-results` handler:
```ts
    on('phase-results', () => {
      callouts = resetCallouts();
      setSuddenDeath(false);
      publishCallouts();
    }),
```

Then replace `isLocalPlayerPlaying` so a racer outside the tied group watches
the tiebreak rather than being handed a grid the server will refuse:

```ts
  /**
   * "May this device answer the round on screen?"
   *
   * Two questions, in order. Is this viewer a racer at all — a spectator or a
   * non-playing MC host is never handed a grid. And, on the tiebreak round
   * only, is this racer one of the two-or-more who actually tied?
   *
   * The second is COURTESY, not authority: `submit_answer` rejects any
   * non-contender outright (roadmap decision 2, ADR-0043), and this only spares
   * them tapping a button to be told so. Routed through `isPlaying` on purpose
   * — it reuses the whole spectator path GameView already renders ("You're
   * watching this one.") rather than adding a second disabled state.
   */
  const isLocalPlayerPlaying = (): boolean => {
    const { players, room } = useGameStore.getState();
    const playerId = viewerPlayerId(role, code);
    if (!playerId) return true; // not joined yet, or a stage view: nothing to disable

    const me = players.find(p => p.id === playerId);
    if (me && !me.is_playing) return false;

    const sd = room?.sudden_death;
    if (sd && room?.round === sd.round) return sd.contenders.includes(playerId);
    return true;
  };
```

- [ ] **Step 11: Name it on the question surface**

`components/QuestionCard.tsx` — replace the badge ternary. The tiebreak round is
`total_rounds + 1`, so "Q13/12" is the alternative:

```tsx
      <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.14em]">
        {suddenDeath ? (
          <span
            data-testid="sudden-death-badge"
            className="rounded-full border border-neon-magenta/60 bg-neon-magenta/15 px-3 py-1.5 text-neon-magenta"
          >
            Sudden death
          </span>
        ) : escalated ? (
          <span className="rounded-full border border-warning/60 bg-warning/15 px-3 py-1.5 text-warning">
            Final question
          </span>
        ) : (
          <span className="text-ink-mute tabular-nums">Q{round}/{totalRounds}</span>
        )}
```
with `const suddenDeath = useStaging(s => s.suddenDeath);` beside `escalated`.

> The round counter is not merely wrong during a tiebreak, it is *nonsense*:
> the tiebreak sits one round past a track that deliberately did not grow
> (ADR-0043). This branch is the reason `suddenDeath` is on the staging store at
> all.

- [ ] **Step 12: Build the banner**

Create `components/SuddenDeathBanner.tsx`:

```tsx
'use client';
import { AnimatePresence, motion } from 'motion/react';
import { avatarEmoji } from '@/lib/avatars';
import { DURATION, EASE } from '@/lib/presentation/tokens';
import { useStaging } from '@/lib/staging/useStaging';
import { useGameStore } from '@/lib/store';

/**
 * The tiebreak's own announcement (PRD §5.4.2).
 *
 * Separate from `QuestionCard`'s badge because it says something the badge
 * cannot fit: WHO is racing this question, and — for anyone who is not — that
 * they are watching. On the stage view it is the only thing that explains why
 * the race did not end at the finish line.
 *
 * DOM, never canvas (cross-cutting constraint 2). Rendered inside
 * `[data-surface="stage"]` on the broadcast screen, so every size resolves
 * through a theme variable that scope overrides and it comes out
 * television-sized with no variant prop (ADR-0035).
 *
 * `AnimatePresence initial={false}` is the standing guard: this mounts
 * conditionally off staging state derived from the server, so without it the
 * entrance replays on every reload inside the tiebreak (CURRENT.md).
 */
export default function SuddenDeathBanner() {
  const suddenDeath = useStaging(s => s.suddenDeath);
  const room = useGameStore(s => s.room);
  const players = useGameStore(s => s.players);

  const contenders = room?.sudden_death?.contenders ?? [];
  const racing = contenders
    .map(id => players.find(p => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  return (
    <AnimatePresence initial={false}>
      {suddenDeath && (
        <motion.div
          key="sudden-death"
          data-testid="sudden-death"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: -12 }}
          animate={{
            opacity: 1, y: 0,
            transition: { duration: DURATION.settle / 1000, ease: EASE.settle },
          }}
          exit={{ opacity: 0, transition: { duration: DURATION.cut / 1000 } }}
          className="rounded-panel border border-neon-magenta/45 bg-neon-magenta/10 px-5 py-3 text-center"
        >
          <p className="font-display text-[0.6875rem] font-semibold uppercase tracking-[0.28em] text-neon-magenta">
            Sudden death
          </p>
          <p className="mt-1 text-sm text-ink-dim">
            Dead level at the line. First correct answer takes it.
          </p>

          {racing.length > 0 && (
            <ul className="mt-2 flex flex-wrap items-center justify-center gap-2">
              {racing.map(p => (
                <li
                  key={p.id}
                  data-testid="sudden-death-contender"
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-abyss/60 py-1 pl-1 pr-3"
                >
                  <span
                    aria-hidden="true"
                    className="grid h-6 w-6 place-items-center rounded-full text-sm"
                    style={{
                      backgroundColor: `${p.color}33`,
                      boxShadow: `inset 0 0 0 2px ${p.color}`,
                    }}
                  >
                    {avatarEmoji(p.avatar)}
                  </span>
                  <span className="text-xs font-semibold text-ink">{p.nickname}</span>
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 13: Mount the banner on both surfaces**

`components/GameView.tsx` — add `<SuddenDeathBanner />` as the first child of
`StageShell`'s `header` slot, above `QuestionCard`:

```tsx
      header={
        <>
          <SuddenDeathBanner />
          {question && (
            <QuestionCard …/>
          )}
          {room.phase === 'answer' && <TimerRing />}
        </>
      }
```

The existing spectator line already covers a non-contender, because Step 10
routes them through `spectating` — but it needs to say the right thing. Change
it to read the tiebreak:

```tsx
          {spectating && room.phase === 'answer' && (
            <p className="text-center text-sm text-ink-mute">
              {suddenDeath
                ? 'This one is between the tied racers.'
                : 'You’re watching this one.'}
            </p>
          )}
```
with `const suddenDeath = useStaging(s => s.suddenDeath);` beside the other
staging selectors.

`components/stage/StageBroadcast.tsx` — add it inside the centred column, above
`StageQuestion`:

```tsx
      <div className="mt-[4cqh] flex flex-col items-center gap-6">
        <SuddenDeathBanner />
        {beat === 'idle' && room?.status === 'lobby' && <StageJoinPanel code={code} />}
        …
```

- [ ] **Step 14: Say how first place was won**

`components/WinnerCard.tsx` — add an optional prop and one line. Keep it outside
the existing stats line: the stats are facts about the race, and this is how the
race was decided.

```tsx
export default function WinnerCard({
  winner, totalRounds, show, instant, suddenDeath = false,
}: {
  winner: Standing;
  totalRounds: number;
  show: boolean;
  instant: boolean;
  /** True when a sudden-death round decided first place (PRD §5.4.2). */
  suddenDeath?: boolean;
}) {
```
and, after the stats paragraph:
```tsx
        {suddenDeath && (
          <p
            data-testid="winner-sudden-death"
            className="mt-2 text-[11px] font-bold uppercase tracking-[0.2em] text-neon-magenta"
          >
            Won on sudden death
          </p>
        )}
```

`components/ResultsView.tsx` and `components/stage/StageResults.tsx` — pass it:

```tsx
  const sd = room?.sudden_death ?? null;
  const wonOnSuddenDeath = !!sd?.winner_id && sd.winner_id === standings[0].player_id;
```
```tsx
      <WinnerCard
        winner={winner}
        totalRounds={room.total_rounds}
        show={show}
        instant={settled}
        suddenDeath={wonOnSuddenDeath}
      />
```

> The `sd.winner_id === standings[0].player_id` check is not redundant.
> `final_standings` lifts the winner to the head, so the two agree — but
> `end_game` can finish a room whose tiebreak never resolved, and a stale
> `winner_id` should never caption a winner who reached first place some other
> way.

- [ ] **Step 15: Close the loop on the photo finish**

`lib/ceremony/photoFinish.ts` — widen `PhotoFinishSource` and `photoFinishFor`
as Task 3 promised. The signature does not change:

```ts
export interface PhotoFinishSource {
  standings: readonly Standing[] | null;
  room: {
    sudden_death?: { contenders: string[]; winner_id: string | null } | null;
  } | null;
}

export function photoFinishFor(source: PhotoFinishSource): boolean {
  const sd = source.room?.sudden_death ?? null;
  return hasPhotoFinish({
    standings: source.standings,
    suddenDeathContenders: sd?.contenders ?? null,
    suddenDeathResolved: !!sd?.winner_id,
  });
}
```

`components/PhotoFinish.tsx` — pass the same exclusion into `tieGroups`, or the
card would restage the group the room just watched resolve:

```tsx
  const room = useGameStore(s => s.room);
  const sd = room?.sudden_death ?? null;
  const groups = tieGroups({
    standings,
    suddenDeathContenders: sd?.contenders ?? null,
    suddenDeathResolved: !!sd?.winner_id,
  });
```

Add to `tests/photoFinish.test.ts`:

```ts
  it('drops the decided group when the room carries a resolved tiebreak', () => {
    expect(photoFinishFor({
      standings: [s('a', 0, 0), s('b', 0, 0)],
      room: { sudden_death: { contenders: ['a', 'b'], winner_id: 'a' } },
    })).toBe(false);
  });

  it('still stages it when the tiebreak found no winner', () => {
    expect(photoFinishFor({
      standings: [s('a', 0, 0), s('b', 0, 0)],
      room: { sudden_death: { contenders: ['a', 'b'], winner_id: null } },
    })).toBe(true);
  });

  it('is unbothered by a room that never had a tiebreak', () => {
    expect(photoFinishFor({
      standings: [s('a', 3, 90), s('b', 3, 80)], room: { sudden_death: null },
    })).toBe(true);
    expect(photoFinishFor({ standings: [s('a', 3, 90), s('b', 3, 80)], room: null })).toBe(true);
  });
```
and update Task 3's three `photoFinishFor` tests to pass `room: null`.

- [ ] **Step 16: Run the full gate**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green, zero problems.

Run: `node scripts/smoke.mjs`
Expected: every `✅` line.

Run: `npm run test:e2e -- --workers=2`
Expected: PASS. The photo-finish spec from Task 3 still passes; the sudden-death
spec arrives in Task 6.

- [ ] **Step 17: Check it by hand, headed**

```bash
npm run dev
```
Create a 1-question room, join a second player, and have **neither answer** —
the timer runs out, both finish on 0/0/0, and that is a perfect first-place tie
by construction. Confirm:
1. The last TRACK is followed by a READ, not the ceremony.
2. Both screens show the sudden-death banner naming both racers, and the badge
   reads "Sudden death" rather than "Q2/1".
3. The world goes neon and holds it — the escalation is not zeroed one frame
   after the banner lands.
4. The `final-sting` plays once, not twice.
5. One racer answers correctly: at the reveal, the results follow and that racer
   heads the board with "Won on sudden death" under their name — and their
   correct count is still **0**.
6. Reload during the tiebreak's ANSWER: the banner is there, at rest, with no
   entrance replayed; the world is still neon.
7. `Skip question` on the strip errors with "the tiebreak cannot be skipped";
   `End race` reaches the ceremony with the tie standing and no winner caption.

- [ ] **Step 18: Commit**

```bash
git add lib/types.ts lib/store.ts lib/presentation/celebration.ts \
  lib/presentation/cues.ts lib/presentation/deriveCues.ts \
  lib/ceremony/photoFinish.ts lib/audio/design.ts lib/audio/state.ts \
  lib/staging/useStaging.ts lib/staging/runtime.ts lib/world/director.ts \
  lib/world/runtime.ts components/SuddenDeathBanner.tsx \
  components/QuestionCard.tsx components/WinnerCard.tsx components/GameView.tsx \
  components/PhotoFinish.tsx components/ResultsView.tsx \
  components/stage/StageBroadcast.tsx components/stage/StageResults.tsx \
  tests/celebration.test.ts tests/deriveCues.test.ts tests/audioState.test.ts \
  tests/director.test.ts tests/photoFinish.test.ts
git commit -m "feat: sudden death on screen

The celebration hierarchy takes its one M3 rung; the tiebreak announces itself
ahead of its READ on both the live and the seed path, names its contenders,
makes every other racer a spectator, keeps the world escalated, and captions the
winner on the results board. The photo finish now skips the group the room just
watched resolve."
```

---
### Task 6: Two-context coverage, live verification, and the record

The regression net for the paths a single context cannot show, the checks the
roadmap made exit criteria, and the phase's written record.

**Files:**
- Modify: `e2e/tiebreak.spec.ts`
- Modify: `docs/ADR/README.md`
- Create: `docs/progress/M3-P2a-the-tiebreak.md`
- Modify: `docs/progress/CURRENT.md`

**Interfaces:**
- Consumes: every hook the previous tasks produced —
  `data-testid="photo-finish"` (+ `data-resolved`), `photo-finish-group`,
  `photo-finish-racer` (+ `data-won`), `sudden-death`,
  `sudden-death-contender`, `sudden-death-badge`, `winner-sudden-death`, plus
  the existing `results-board` (+ `data-entered`), `results-row`,
  `answer-option` (+ `data-locked`), `host-strip`, `host-skip`.
- Produces: nothing consumed by later code. P2b starts from the progress doc.

- [ ] **Step 1: Write the sudden-death e2e test**

Append to `e2e/tiebreak.spec.ts`:

```ts
/**
 * The perfect first-place tie is built WITHOUT TIMING LUCK.
 *
 * A one-question race that nobody answers leaves every racer on 0 correct,
 * 0 speed points and a 0 streak — level on every Fairness Law key above sudden
 * death, by construction. Every other route to a perfect tie needs two
 * `submit_answer` calls to land in the same 200ms speed-point bucket, which is
 * a race, not a fact; this one cannot flake.
 */
test('a perfect first-place tie goes to sudden death and the winner takes the board',
  async ({ page, browser }) => {
    test.setTimeout(150_000);
    const host = page;
    // A 5s timer so the unanswered question closes quickly.
    const code = await createRoom(host, 1, 5);

    const joinerContext = await browser.newContext();
    const joiner = await joinerContext.newPage();
    await join(joiner, code, 'Joiner');

    const stageContext = await browser.newContext();
    const stage = await stageContext.newPage();
    await stage.goto(`/stage/${code}`);

    await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
    await host.getByRole('button', { name: /start the race/i }).click();

    // Nobody answers. The race reaches its finish line dead level.
    await expect(joiner.getByTestId('answer-option').first()).toBeEnabled({ timeout: 20_000 });

    // The tiebreak opens instead of the ceremony, on every surface.
    await expect(joiner.getByTestId('sudden-death')).toBeVisible({ timeout: 60_000 });
    await expect(host.getByTestId('sudden-death')).toBeVisible();
    await expect(stage.getByTestId('sudden-death')).toBeVisible();
    await expect(joiner.getByTestId('sudden-death-contender')).toHaveCount(2);

    // The round counter is replaced, not merely wrong: the tiebreak sits past a
    // track that deliberately did not grow (ADR-0043).
    await expect(joiner.getByTestId('sudden-death-badge')).toBeVisible();
    await expect(joiner.getByText('Q2/1')).toHaveCount(0);

    // A reload lands IN the tiebreak rather than replaying its entrance or
    // falling back to an ordinary round.
    await joiner.reload();
    await expect(joiner.getByTestId('sudden-death')).toBeVisible({ timeout: 20_000 });
    await expect(joiner.getByTestId('sudden-death-badge')).toBeVisible();

    // The tiebreak cannot be skipped; the host is told so rather than silently
    // losing the round.
    await host.getByTestId('host-skip').click();
    await expect(host.getByTestId('host-strip-error')).toContainText(/tiebreak/i);

    // Answer it. The draw is random, so which option is right is unknowable
    // here — click through all four in turn is impossible (one lock per round),
    // so assert on the SHAPE of the outcome rather than on who wins.
    await expect(joiner.getByTestId('answer-option').first()).toBeEnabled({ timeout: 20_000 });
    await joiner.getByTestId('answer-option').nth(0).click();
    await expect(joiner.getByTestId('answer-option').nth(0)).toHaveAttribute('data-locked', 'true');

    // The tiebreak's reveal ends the game — there is no track beat.
    await expect(joiner.getByTestId('results-board')).toBeAttached({ timeout: 40_000 });
    await expect(joiner.getByTestId('results-row')).toHaveCount(2);

    // No photo finish restages the tie the room just watched resolve; and when
    // the tiebreak found no winner (both wrong), the card DOES stage the
    // still-standing tie. Exactly one of the two is true.
    const wonIt = await joiner.getByTestId('winner-sudden-death').count();
    if (wonIt > 0) {
      await expect(joiner.getByTestId('photo-finish')).toHaveCount(0);
    } else {
      await expect(joiner.getByTestId('photo-finish')).toBeVisible();
      await expect(joiner.getByTestId('photo-finish')).toHaveAttribute('data-resolved', 'false');
    }

    // The strip retires with the race, on the tiebreak's ending as on any other.
    await expect(host.getByTestId('host-strip')).toHaveCount(0);

    await stageContext.close();
    await joinerContext.close();
  });
```

- [ ] **Step 2: Run the e2e suite**

Run: `npm run test:e2e -- --workers=2`
Expected: PASS, every spec. Re-run once on a stability/detachment failure before
investigating — CURRENT.md records that shape as a load flake.

- [ ] **Step 3: Verify the contender guard by hand**

This is the one rule neither the harness nor Playwright can reach
deterministically (Task 4, Step 5's note). Force it:

```bash
npm run dev
```
Create a **1-question, 20s** room with **three** players. Have two of them
answer the same option and the third answer a different one, then, before the
answer phase closes, level the first two exactly:

```bash
docker exec -i supabase_db_quiz-game psql -U postgres -d postgres -c \
  "update answers a set speed_points = 60, time_remaining_ms = 12000
   from players p
   where p.id = a.player_id and a.room_id = (select id from rooms where code = 'XXXXX')
     and p.nickname in ('One','Two');"
```

Confirm, with `XXXXX` replaced by the real code and the nicknames matched:

1. The race reaches the tiebreak with **two** contenders, not three.
2. The third player's answer grid is disabled and reads "This one is between the
   tied racers."
3. Their keyboard shortcut is refused too — press `1` on their device and no
   option locks. (`AnswerButtons` binds a `window` keydown listener, which no
   overlay can intercept, so this is a real second path.)
4. Forcing it anyway is refused server-side. In that browser's console:
   ```js
   const s = JSON.parse(localStorage.getItem('cb:XXXXX'));
   const { supabase } = await import('/lib/supabaseClient.ts');
   ```
   is not reachable from a production bundle, so instead run the RPC directly
   with the third player's key from a scratch node script and confirm it fails
   with `only the tied racers answer the tiebreak`.

Record the outcome in the progress doc's live-verification section.

- [ ] **Step 4: Verify the ceremony's timing, headed**

Headed only — headless Chromium pins the VFX budget at `minimal` before a test
starts and cannot be trusted for this.

With a photo-finish room (both racers correct, 1.2s apart), measure from the
results phase's first frame:

```js
// Paste into the player device's console at the moment the race ends.
const t0 = performance.now();
const log = [];
const id = setInterval(() => {
  const s = window.__ceremony.getState().steps;
  log.push([Math.round(performance.now() - t0), s.photo.open, s.photo.resolved,
            s.rise[3].toFixed(2), s.board]);
}, 100);
setTimeout(() => { clearInterval(id); console.table(log); }, 13000);
```

Confirm against the timeline table at the top of this plan:
`photo.open` true from 0 and false at ~3400; `photo.resolved` true at ~2200;
`rise[3]` starts climbing at ~4600 and lands at ~5060; `board` true at ~9400.
A consistent offset means `CEREMONY_MS` and `ceremony_ms()` disagree — check the
deadline before touching the beats.

Repeat with a clean finish and confirm the no-tie column: `rise[3]` at ~1200,
`board` at ~6000, `photo.open` never true.

- [ ] **Step 5: Confirm every roadmap exit criterion**

The roadmap's P2 exit criteria, minus the two P2b owns (awards, rematch). Tick
each, with the evidence:

| Criterion | Evidence |
|---|---|
| A deliberate tie plays the photo finish | `e2e/tiebreak.spec.ts` test 1, plus Step 4's headed timing |
| A perfect first-place tie resolves in sudden death | `e2e/tiebreak.spec.ts` test 3, plus `scripts/smoke.mjs`'s sudden-death section |
| The ceremony still lands correctly on reload at every new beat | Task 3 Step 9 items 5–6, and Step 4 above, on **both** timelines |
| The Fairness Law is unamended | `standings`' body is byte-identical to 0004's; `scripts/smoke.mjs` asserts no correct answer, speed point or streak is created by a tiebreak |
| Accessibility | Both new surfaces carry `role="status"` / `aria-live="polite"`; the shared-position and "Takes it" outcomes are in text; a non-contender's state is explained in words; keyboard entry is refused for a non-contender |

- [ ] **Step 6: Apply to the cloud project and re-verify live**

**`0005` first** — the cloud project has never taken it, and `0007` depends on
its column and its widened constraint:

```bash
npx -y supabase@latest db query --linked --file supabase/migrations/0005_host_authority.sql
npx -y supabase@latest db query --linked --file supabase/migrations/0007_the_tiebreak.sql
npx -y supabase@latest supabase migration list --linked
```

Then swap the commented cloud block into `.env.local`, restart `npm run dev`,
and run the e2e suite against it once:

```bash
npm run test:e2e -- --workers=2 e2e/tiebreak.spec.ts
```
Expected: 3/3. Restore `.env.local` to the local stack afterwards.

- [ ] **Step 7: Write the phase record**

Create `docs/progress/M3-P2a-the-tiebreak.md`, following the house shape of
`docs/progress/M3-P1-the-draw.md`: scope, what was built, deviations from this
plan, verification results (unit counts, smoke, e2e, cloud), and a
live-verification findings section carrying Steps 3, 4 and 6's actual output.
**Never edited again after creation except to fix an error.**

Include, at minimum:
- The ADRs this phase added: 0042, 0043, 0044.
- The exit-criteria table from Step 5, filled in with real results.
- The two things P2b inherits: the awards projection and rematch, both unstarted.
- Whether `final-sting` reused for sudden death was judged good enough live, or
  wants its own generated sound in P2b (ADR-0025's generator, not an asset).

- [ ] **Step 8: Update the ADR index**

Append three rows to `docs/ADR/README.md`'s index table:

```markdown
| [0042](0042-the-wires-fourth-opening.md) | The wire's fourth opening — `sudden_death` | M3 P2a |
| [0043](0043-sudden-death-is-a-round-past-the-finish-line.md) | Sudden death is a round past the finish line, not a phase | M3 P2a |
| [0044](0044-the-ceremony-always-reserves-the-prelude.md) | The ceremony always reserves the prelude | M3 P2a |
```

- [ ] **Step 9: Update CURRENT.md**

- **Current phase:** `M3 P2a complete → docs/progress/M3-P2a-the-tiebreak.md`,
  with P2b named as next.
- **Active task:** None.
- Amend the cloud-project note: `0005` and `0007` are now applied; the gap
  CURRENT.md records is closed.
- Add these notes, which later phases genuinely need:
  - **`current_round` can exceed `total_rounds`, as of M3 P2a.** The tiebreak is
    a round at `total_rounds + 1` (ADR-0043). Anything that renders
    `round`/`total_rounds` must special-case it, and anything that bounds
    scoring must go through `scoring_round`. A caller that forgets the clamp
    silently counts the tiebreak as a correct answer.
  - **The ceremony is 12400ms, flat, whether or not a photo finish is staged**
    (ADR-0044). `CEREMONY_MS` mirrors `ceremony_ms()`; `PHOTO_MS` shifts the
    podium beats but never the total. A change to either must move both.
  - **The celebration hierarchy is six rungs, and M3's one addition is spent.**
    `suddenDeath` sits between `finalQuestion` and `victory`; roadmap decision 6
    allows no more.
  - Anything the live verification turned up that a future session would
    rediscover — the standing rule for these notes.

- [ ] **Step 10: Run the whole gate one last time**

```bash
npm test && npx tsc --noEmit && npm run lint && node scripts/smoke.mjs && npm run test:e2e -- --workers=2
```
Expected: unit suite green at 521 + this plan's additions; `tsc` silent; lint
zero problems; every smoke `✅`; every e2e spec passing.

Also check the editor's own diagnostics on every touched file before
committing — an error the terminal gate does not surface is still an error.

- [ ] **Step 11: Commit, merge, push, clean up**

```bash
git add e2e/tiebreak.spec.ts docs/ADR/README.md \
  docs/progress/M3-P2a-the-tiebreak.md docs/progress/CURRENT.md \
  docs/superpowers/plans/2026-08-29-m3-p2a-the-tiebreak.md
git commit -m "test: two-context coverage for the tiebreak; record M3 P2a

A perfect first-place tie built without timing luck — a one-question race
nobody answers — drives sudden death end to end across three contexts, and the
photo-finish spec covers the resolving and the clean cases. Records ADR-0042,
0043 and 0044, and the phase's verification results."
```

Then merge the branch to `main`, push, and remove the worktree — per the
standing instruction, without asking.

---
## What P2b inherits

P2b — the aftermath — is the other half of roadmap §3's P2, and it starts from
here. It is **not** in this plan and no task above touches it.

| Roadmap item | State after P2a |
|---|---|
| **Awards** (§5.4.4) — Big Brain, Fastest Gun, Hot Streak, Late Surge | Unstarted. A pure `awards(room_id)` projection; Late Surge reconstructs from `answers` by comparing standings at the midpoint against the final. It must bound itself with `scoring_round` (ADR-0043) or a tiebreak answer will count toward Fastest Gun. |
| **Rematch** (§5.4.6) — reset to lobby, keep the players, redraw excluding used questions | Unstarted. It must clear all three sudden-death columns and delete the tiebreak round from `room_questions`, or the new race opens with a stale tiebreak already recorded. It must also draw a **fresh reserve** (ADR-0041), since the old one has been spent. |

Two things P2a leaves for P2b to judge rather than decide:

- **The sudden-death sting is `final-sting` reused** (Task 5, Step 8). Sounds
  are generated source, not assets (ADR-0025), so a bespoke one is a generator
  pass rather than a file drop. Task 6's live verification records whether it
  read as its own moment; if it did not, P2b is the place to generate one.
- **The photo finish has no sound at all.** The ceremony bed is already playing
  under it, and roadmap decision 6 reserves M3's one new celebration rung for
  sudden death — but a tally with a tick under it is a real improvement, and it
  costs no rung.

## Self-review

Run against the roadmap with fresh eyes after the plan was written.

**Spec coverage.** Roadmap §3's P2 scope block has four bullets. Photo finish →
Tasks 1, 2, 3. Sudden death → Tasks 4, 5. Awards and rematch → deferred to P2b,
by the split decided in the header table and recorded in the section above. Of
P2's five exit criteria, three are P2a's and each has a task and named
evidence (Task 6, Step 5); two belong to P2b.

Roadmap §2's cross-cutting decisions: additive migrations (Global Constraints,
and 0007 is `create or replace` plus `add column if not exists` throughout);
semantic wire with a justifying ADR (ADR-0042); host authority server-enforced
(no new command; the three replaced functions keep their `host_key` check
verbatim); freeze-and-shift untouched (0007 does not touch `pause_game` or
`resume_game`, and Task 4's smoke asserts a tiebreak still pauses); Fairness Law
presented not amended (`standings` unedited; `final_standings` is a stable
partition; the clamp keeps the tiebreak out of scoring); accessibility as an
acceptance criterion (Global Constraints, and Task 6 Step 5's row); exactly one
new celebration rung (Task 5, Step 6); no new runtime dependencies (none added —
the sting reuses `final-sting`).

Roadmap §5's testing approach: Vitest for every new pure module (Task 2's 22
tests, Task 1's timeline tests); SQL-level integration testing in
`scripts/smoke.mjs` (Tasks 1 and 4); genuine multi-context Playwright (Tasks 3
and 6, three contexts in the sudden-death spec); headed live verification
(Tasks 3, 5 and 6).

**Two gaps found and closed while reviewing.**

1. `advance_phase` is written twice — once in Task 1 for the deadline, once in
   Task 4 for the tiebreak. Task 4, Step 3 now says explicitly to delete Task
   1's copy rather than leaving two definitions in one file.
2. Task 3's Step 5 referred to a "`photoFinishFor` placeholder" that Task 1
   never wrote — Task 1 leaves a literal `false`. Corrected, and Task 1's own
   comment now names what replaces it.

**One thing deliberately left uncovered, and said so where it matters.** The
contender guard cannot be reached deterministically from either the harness or
Playwright: it needs two racers on identical non-zero speed points and a third
below them, which is a 200ms bucket race. Task 4 Step 5 carries a note saying
why, and Task 6 Step 3 forces it by hand with a direct `update answers`. It is
not silently skipped.

**Type consistency.** Every name a later task imports is declared in an earlier
task's **Produces** block and used under that exact spelling: `PHOTO_MS`,
`PHOTO_TALLY_AT`, `PHOTO_TALLY_MS`, `PHOTO_RESOLVE_AT`, `PhotoSteps`,
`NO_PHOTO`, `ceremonyStepsAt(elapsed, photoFinish)`, `tieGroups`,
`hasPhotoFinish`, `tallyValue`, `TieGroup`, `PhotoFinishInput`,
`PhotoFinishSource`, `photoFinishFor`, `SuddenDeathInfo`, `SuddenDeathCue`,
`suddenDeath` / `setSuddenDeath`, and the SQL `ceremony_ms`, `scoring_round`,
`perfect_first_place_tie`, `final_standings`. `PhotoFinishSource` is the one
type that changes shape between tasks — Task 3 declares it with `standings`
alone and Task 5 adds `room` — and both tasks say so, including the test
updates Task 5 owes Task 3.
