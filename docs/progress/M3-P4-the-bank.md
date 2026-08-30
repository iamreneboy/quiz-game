# M3 P4 — The bank

- **Status:** Complete. The bank stands at 240 questions, ten per tier per category, generated from JSON. `0011_the_bank.sql` applied to the cloud project and verified there by direct query; the full SQL integration harness re-run green against it. Every local gate green except one browser test that flaked under full-suite load and passes in isolation — named and analysed under Verification results rather than re-run into a green line.
- **Completed:** 2026-08-30
- **Spec:** `docs/superpowers/specs/2026-08-29-m3-host-power-polish-roadmap.md` (§3 "P4 — The bank")
- **Plan:** `docs/superpowers/plans/2026-08-30-m3-p4-the-bank.md`
- **Branch:** `m3-p4-the-bank` — isolated git worktree at `.claude/worktrees/m3-p4-the-bank`
- **Method:** `superpowers:executing-plans`, inline (no subagents, at the user's standing instruction), TDD on the validator, verified against the real local Supabase stack and then against the cloud project
- **ADR:** [ADR-0053](../ADR/0053-the-bank-is-generated-data.md)

## Scope (from the plan)

Take the bank to launch size and make a structurally defective question
impossible to commit. Two halves, deliberately in one plan rather than two
phases: the machine (Tasks 1–2, 9), and six mechanically identical content
tranches (Tasks 3–8).

**No runtime code was touched.** Nothing under `app/`, `components/` or `lib/`
changed. The wire did not open, the celebration hierarchy gained no rungs, and
the Fairness Law was not read.

## What was built

**The bank became data.** Six JSON files under `supabase/questions/`, one per
category, are now the single source of truth. `supabase/seed.sql` and
`supabase/migrations/0011_the_bank.sql` are both *generated* from them and are
never hand-edited. The inversion is what makes the validator tractable at all
(ADR-0053).

| File | What it is |
|---|---|
| `supabase/questions/*.json` | The bank. Six files, 40 records each. `category` is the filename, so it cannot disagree with itself. |
| `scripts/questionRules.mjs` | The loader, the thresholds, the ten rules, the statistics report. |
| `scripts/questionSql.mjs` | Pure: bank → the one `insert … on conflict … do update` block. |
| `scripts/validate-questions.mjs` | The CLI gate. Exit 1 on any violation; `--report` prints the tables. |
| `scripts/build-questions-sql.mjs` | Writes `seed.sql`, optionally a migration. Refuses to write an invalid bank. |
| `tests/questionBank.test.ts` | 25 cases: one per rule, the hand-mirror pins, the ratchet, "the real bank is clean", "`seed.sql` is in sync". |
| `supabase/migrations/0011_the_bank.sql` | The delivery artifact. Pure DML, idempotent. |

**The gate is held in two places**, because neither alone covers how this repo
is driven: `pretest` runs the CLI, so `npm test` cannot pass over a defective
bank; and `tests/questionBank.test.ts` asserts the same thing, so
`npx vitest run` cannot either.

**The ratchet worked as designed.** `MIN_PER_CELL` shipped at `2` in Task 2 —
the floor the pre-P4 bank of 48 already met — so the coverage rule was live and
green through all six content tranches. Task 9 raised it to `10` in a one-line
change, pinned by its own test. This is why the phase never had a span where
`npm test` was red or the gate was un-wired.

## The round-trip proof

Before extraction and after regeneration, the local bank checksummed identically:

```
48|d44878570900ab881d1054c2d2044ba0
```

`options::text` is jsonb's own normalized rendering, so the checksum compares
content rather than formatting. Identical counts and identical hash means no
legacy question was altered in the move from SQL to JSON — including the two
real decoding traps (`Ellen''s Oscar selfie`, where SQL escaping sat *inside* a
JSON literal, and the `…`/`—`/`¥`/`’` characters throughout).

## The final bank

`node scripts/validate-questions.mjs --report`, at 240:

```
category        n   t1 t2 t3 t4   correct@0/1/2/3   tell%   len ratio
screen-break    40   10 10 10 10       10/10/10/10    5.0%   1.003
ai-tech         40   10 10 10 10       10/10/10/10    2.5%   0.946
corporate       40   10 10 10 10       10/10/10/10    2.5%   1.020
rewind          40   10 10 10 10       10/10/10/10    2.5%   1.070
online          40   10 10 10 10       10/10/10/10    5.0%   1.079
fuel            40   10 10 10 10         12/9/9/10    0.0%   1.020
BANK           240   60 60 60 60       62/59/59/60    2.9%   1.021

caps: tell 20% bank / 30% category, len ratio 1.15 bank, min 10 per cell
```

The bank-wide length ratio fell from **1.131 → 1.021** and the tell share from
**12.5% → 2.9%** across the phase; every tranche moved the `BANK` row down
rather than up, which is the check the plan asked to watch. `rewind` carried the
worst legacy ratio at 1.344 over its original eight and finished at 1.070.
`fuel`'s `12/9/9/10` is the predicted consequence of its legacy `4/1/1/2` spread
plus the prescribed rotation, and sits inside the ±4 per-category tolerance
at n=40.

## Deviations from the plan

1. **`statsFor` crashed on the defect class it exists to catch.** The plan's
   module indexes `q.options[q.correctIndex]` in the aggregate pass, so a record
   that had already failed `shape` or `bounds` threw a `TypeError` instead of
   being reported — hiding every other defect in the bank behind a stack trace.
   Found by the plan's own Step 6, which breaks the bank on purpose. Fixed with
   an `isCountable` predicate: uncountable records are excluded from the
   statistics, never fed to them. Pinned by a new test case ("REPORTS rather
   than crashes on a record the aggregates cannot index"), which is the 25th.

2. **Five smoke sections encoded the old bank's contents and had to be
   reworked.** The plan anticipated this for the browser specs; it landed in
   `scripts/smoke.mjs` instead, and harder than expected. The sections rested on
   *"both tier-1 'fuel' questions are correct_index 0 in the seed"* — true at two
   per cell, false at ten. Two of them (`swap_question` exhaustion, the custom-
   question leak check) carried explicit `(P4 … must revisit this assertion)`
   comments; three did not and failed as tie-breaks or wrong answers.

   The fix is uniform and is now the house rule: **the host sits out as an MC,
   which by ADR-0040 is exactly what makes the answer key readable**, and the
   key is read from `get_room_draw` before `start_game` rather than assumed.
   An MC is excluded from standings, so each section's field of racers is
   unchanged.

   | Section | Was | Now |
   |---|---|---|
   | game flow | host raced, answered slot 0 | MC host; `gKey` read from the draw, both rounds |
   | P2a ceremony deadline | host raced, answered slot 0 | MC host; `cerKey` from the draw |
   | P2a tiebreak boundaries | host raced, answered slot 0 | MC host; `cleanKey` from the draw |
   | P2b awards | host was the racer "Brain" | MC "Ref" added; Brain/Gun/Surge race; `awKey[]` from the draw |
   | P2b rematch | pool exhausted by being 2 deep | exhaustion proved by *asking* for all ten (`p_tier_counts: [10,0,0,0]`) |
   | `swap_question` exhaustion | room took both of 2 | room takes all 10 |
   | custom-question leak | asked for 3 | asks for 11 |

   Net effect on coverage: the game-flow section no longer exercises a *racing*
   host, which P2b/P3a sections still do. Recorded in ADR-0053's consequences as
   a standing rule: no test may encode what the bank contains.

3. **The plan's two worked examples were used as real questions** — the FYI
   invite (Corporate T1) and the saffron/crocus question (Fuel T4). They are
   well-made and in voice; nothing was gained by writing around them.

4. **Corporate tier 1's rotation was corrected mid-task.** The first pass
   ordered its eight new records `3,1,2,3,0,1,2,3` rather than the prescribed
   `0,1,2,3,0,1,2,3`, landing the category on `9/10/10/11`. Inside tolerance,
   but not what the plan asked for; reverted and re-run to a clean
   `10/10/10/10`.

5. **Four fun facts were corrected in the human factual pass**, all in Screen
   Break, all authored wrong by me and caught by reading them back:
   - Harry Potter: claimed all four schools appear in the books. Ilvermorny does
     not — it came years later, outside the novels.
   - The Lion King: claimed "Mufasa" means "king" in Swahili. It does not;
     *Simba* is Swahili for lion. Rewritten to the claim that is true.
   - Mission: Impossible: claimed every instalment had a different director.
     False from the fifth onward. Narrowed to "the first five".
   - Iron Man casting: "the director threatened to walk" overstated the record;
     softened to what is documented.

   The other five tranches needed no corrections. This is the step the validator
   explicitly cannot do, and it earned its place.

## Verification results

Run in the worktree, against the real local Supabase stack.

| Gate | Command | Result |
|---|---|---|
| Bank | `node scripts/validate-questions.mjs` | `question bank OK — 240 questions` |
| Types | `npx tsc --noEmit` | silent |
| Lint | `npm run lint` | zero problems |
| Unit | `npm test` | **637 passed** (45 files) — 612 before this phase, +25 from `tests/questionBank.test.ts` |
| Gate fires | break a `correctIndex`, then `npm test` | exits non-zero **before Vitest runs**, printing `[bounds] fuel[0] … got 9` |
| Idempotence | `0011` applied twice | `INSERT 0 240` both times; final count **240**, not 480 |
| Per-cell, local | `select category, tier, count(*) …` | 24 rows, every one `10` |
| SQL integration | `node scripts/smoke.mjs` | all 12 sections pass, ending `✅ P4 bank smoke passed` |
| Browser | `npm run test:e2e -- --workers=1` | **41 passed, 1 failed** — see below |
| Browser, isolated | `npm run test:e2e -- --workers=1 e2e/world.spec.ts` | **3 passed (28.5s)** |

**The e2e failure, named rather than hidden.** In the full 42-test run
(14.3 minutes, one worker), `e2e/world.spec.ts:93 › the lobby roster strip ›
lists joined players as text over the full-bleed canvas grid` failed on
`getByText('Starting grid — 2 joined')` not becoming visible within 5s. Re-run
in isolation the whole file passes 3/3 in 28.5 seconds. This is the known
full-suite load flake CURRENT.md records — it is a Pixi-heavy canvas spec, this
phase changed no runtime code at all, and the assertion is on a lobby roster
that never touches the question bank. Reported as a flake, not as a green run.

## Cloud application

Applied to `niznfbabmixesfvxlypi` — the live project behind the Vercel deploy.

```
npx -y supabase@latest db query --linked --file supabase/migrations/0011_the_bank.sql
```

Migration 0011 is pure DML and defines no function, so PostgREST needed no
schema reload after it. The upsert topped the project up from the 48 rows it
already held; no row was duplicated, because the conflict target is the same
partial unique index M3 P1 left behind.

**Verified by direct query against the cloud project:** the per-cell count
returns **24 rows, every one reading 10** — 240 questions live. As CURRENT.md
warns, `supabase migration list --linked` still shows `0011` with an empty
`remote` column, because `db query --linked --file` does not write the migration
history table. The count is the truth, not that column.

**Then the exit criterion, against the cloud:** with `.env.local` swapped to the
cloud block, `node scripts/smoke.mjs` ran green end to end — all twelve
sections, ending `✅ P4 bank smoke passed`. A single-category room at ten per
tier is creatable against the deployed stack, not merely locally. `.env.local`
was restored to the local block afterwards.

## The exit criterion, in full

The roadmap's test was a single-category room taking ten questions from every
tier. Before this phase that raised `not enough questions in tier 1`. Now:

- `create_room({ categories: ['fuel'], tier_counts: [10,10,10,10] })` returns
  `total_rounds: 40`, and `get_room_state` agrees.
- Asking for eleven still fails, and still says so precisely:
  `not enough questions in tier 1 (need 11, have 10)`.

Both assertions run locally and against the cloud, as the last section of
`scripts/smoke.mjs`.

The pull recorded in CURRENT.md is released with it: a single-category room held
two rows per (category, tier) and so could only be rematched once before the
redraw legitimately refused. At ten per cell that ceiling is gone.

## Notes for phases that inherit this work

- **`supabase/questions/*.json` is the bank.** A new question goes there and
  nowhere else. Then `node scripts/build-questions-sql.mjs`.
- **`supabase/seed.sql` is generated and must never be hand-edited.** A unit
  test compares it against what the generator would produce, so an edit fails
  the suite; the next regeneration would discard it anyway.
- **`MIN_PER_CELL` is a ratchet at 10.** Its own test pins it. Lowering it
  re-breaks `create_room`'s availability check quietly.
- **No test may encode what the bank contains.** If a test needs to know an
  answer, it reads it from `get_room_draw` behind a non-racing host (ADR-0040).
  Five smoke sections were reworked to this shape; copy it rather than inventing
  a new way.
- **A reworded prompt is a new row, not an edit** — the prompt is the upsert's
  conflict target. To reword in place, ship a `delete` alongside.
- **Apply content migrations when nothing is playing.** The upsert changes rows
  it matches, so it could move a drawn question's `correct_index` under a live
  room. Rooms purge at 24h, so the window is small and self-clearing.
