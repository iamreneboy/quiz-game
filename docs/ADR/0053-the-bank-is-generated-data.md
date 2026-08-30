# ADR-0053: The question bank is generated data, and it ships as an upsert

- **Status:** Accepted
- **Date:** 2026-08-30
- **Phase:** M3 P4 — The bank

## Context

The bank had to grow from 48 questions to 240, and the roadmap asked for a
validator that could enforce rules no human reads reliably at that size: no
duplicate prompt bank-wide, correct answers spread evenly across the four
option slots, and no length tell (the correct option not systematically the
longest — the classic AI-authoring giveaway).

`supabase/seed.sql` was the only copy of the bank, and it is SQL. Every one of
those rules is a few lines against an array and a hand-rolled parser against
`insert … values` text. The cloud project already held the original 48 behind a
live deploy, so the 192 new ones had to arrive as a migration rather than a
reseed.

## Decision

**Six JSON files under `supabase/questions/`, one per category, are the bank.**
`supabase/seed.sql` and `supabase/migrations/0011_the_bank.sql` are both
generated from them by `scripts/build-questions-sql.mjs` and are never
hand-edited. A unit test compares `seed.sql` against what the generator would
produce, so the artifact cannot silently drift from its source.

**The generated statement is an upsert**, not an insert:

```sql
on conflict (category, prompt) where room_id is null do update set
  tier = excluded.tier, options = excluded.options,
  correct_index = excluded.correct_index, fun_fact = excluded.fun_fact;
```

The `where room_id is null` predicate is part of the conflict target because
M3 P1 narrowed `uq_questions_category_prompt` to a partial index (ADR-0039);
without the predicate Postgres cannot infer the index and raises.

## Consequences

- The validator becomes ten small functions over an array. `npm run pretest`
  runs it, so a structurally defective question cannot reach review.
- A factual correction to a question that has already shipped is now possible:
  edit the JSON, regenerate, ship the block. The row's `id` survives the update,
  so `room_questions.question_id` keeps pointing at a live row.
- The same file seeds a fresh local stack and tops up a cloud project holding an
  older bank. Re-running it is a no-op.
- **Never edit `supabase/seed.sql` by hand again** — the sync test will fail,
  and the next regeneration would discard the edit.
- The upsert *changes* rows it matches. Applying a bank migration while a game
  is live could change a drawn question's `correct_index` under a room mid-race.
  Apply content migrations when nothing is playing; rooms are purged at 24h, so
  the window is small and self-clearing.
- The prompt is now an identity key in two senses — the database's conflict
  target and the validator's `unique-prompt` rule. **Changing a prompt's text
  creates a new row rather than updating the old one**, and leaves the old one
  in any database that already has it. To reword a question in place, ship a
  `delete` alongside; to replace it outright, a new prompt is correct.
- **No test may encode what the bank contains.** With two questions per
  (category, tier) a test could say "both tier-1 fuel questions are
  correct_index 0"; at ten per cell it cannot. Five sections of
  `scripts/smoke.mjs` did exactly that and were reworked to read the answer key
  from `get_room_draw` behind a non-racing host, which ADR-0040 already permits.
  A test that needs to know an answer must ask for it.
