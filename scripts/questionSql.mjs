// Bank -> SQL. Pure: no reads, no writes, no process exit.
//
// The bank's source of truth is supabase/questions/*.json (ADR-0053). This
// module renders it into the ONE statement that both supabase/seed.sql and the
// delivery migration carry.

import { CATEGORY_KEYS, CATEGORY_LABELS } from './questionRules.mjs';

/** A single-quoted SQL literal. Postgres escapes ' by doubling it. */
export function sqlString(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

/**
 * The upsert.
 *
 * ON CONFLICT names the PARTIAL unique index M3 P1 left behind
 * (uq_questions_category_prompt ... where room_id is null), so the predicate is
 * part of the conflict target — without it Postgres cannot infer the index and
 * raises. Every row this block inserts has a null room_id, so the arbiter
 * always applies.
 *
 * DO UPDATE, not DO NOTHING: this is how a factual correction reaches a cloud
 * project that already holds the row. The id is preserved, so
 * room_questions.question_id keeps pointing at a live row (ADR-0053).
 */
export function buildInsertBlock(bank) {
  const lines = [];
  for (const key of CATEGORY_KEYS) {
    const rows = bank.filter(q => q.category === key);
    if (rows.length === 0) continue;
    const [emoji, label] = CATEGORY_LABELS[key];
    lines.push(`-- ${emoji} ${label}`);
    for (const q of rows) {
      lines.push(
        `(${sqlString(q.category)},${q.tier},${sqlString(q.prompt)},` +
        `${sqlString(JSON.stringify(q.options))},${q.correctIndex},` +
        `${sqlString(q.funFact)}),`
      );
    }
  }
  // Trailing comma on the final value row becomes the start of ON CONFLICT.
  const last = lines.length - 1;
  lines[last] = lines[last].replace(/,$/, '');

  return [
    'insert into questions (category, tier, prompt, options, correct_index, fun_fact) values',
    ...lines,
    'on conflict (category, prompt) where room_id is null do update set',
    '  tier = excluded.tier,',
    '  options = excluded.options,',
    '  correct_index = excluded.correct_index,',
    '  fun_fact = excluded.fun_fact;',
  ].join('\n');
}

const GENERATED =
  '-- GENERATED FILE — do not edit by hand.\n' +
  '-- Source: supabase/questions/*.json. Regenerate with:\n' +
  '--   node scripts/build-questions-sql.mjs\n';

export function buildSeedFile(bank) {
  return `${GENERATED}\n${buildInsertBlock(bank)}\n`;
}

export function buildMigrationFile(bank) {
  const header =
    '-- M3 P4 — the bank reaches launch size.\n' +
    '--\n' +
    '-- Pure DML, no DDL, and IDEMPOTENT: the same upsert that seeds a fresh\n' +
    '-- local stack tops up a cloud project that already holds an earlier bank,\n' +
    '-- and re-running it is a no-op. Defines no function, so PostgREST needs no\n' +
    '-- schema reload after it.\n' +
    '--\n' +
    `${GENERATED.split('\n').slice(0, 3).join('\n')}\n`;
  return `${header}\n${buildInsertBlock(bank)}\n`;
}
