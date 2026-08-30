// The question bank's rules — the machine that keeps it honest (M3 P4).
//
// Plain .mjs on purpose: this runs under bare `node` as a CLI (npm's `pretest`)
// AND is imported by a Vitest suite. tsconfig has allowJs, so the .ts test
// imports it and `tsc --noEmit` infers types from the JSDoc below.

import { readFileSync } from 'node:fs';

/** Hand-mirror of lib/rank.ts's CATEGORIES. tests/questionBank.test.ts pins them equal. */
export const CATEGORY_KEYS = ['screen-break', 'ai-tech', 'corporate', 'rewind', 'online', 'fuel'];
export const CATEGORY_LABELS = {
  'screen-break': ['🎬', 'Screen Break'],
  'ai-tech': ['🤖', 'AI & Tech'],
  'corporate': ['💼', 'Corporate Survival'],
  'rewind': ['📼', 'Rewind'],
  'online': ['🐸', 'Extremely Online'],
  'fuel': ['☕', 'Fuel'],
};

/**
 * A RATCHET. It shipped at 2 — the floor the pre-P4 bank of 48 met — and was
 * raised to 10 when the bank reached 240 (M3 P4, Task 9). Never lower it:
 * PRD §12's launch bank is 10 per tier per category, and `create_room`'s own
 * availability check is what a lower number would quietly re-break.
 */
export const MIN_PER_CELL = 10;

/** Hand-mirror of lib/draw.ts, which mirrors add_custom_question's own limits. */
export const MAX_PROMPT_CHARS = 200;
export const MAX_OPTION_CHARS = 80;
export const MAX_FUN_FACT_CHARS = 240;

/**
 * Balance: how far a correct-answer slot may sit from an even quarter.
 * A fraction alone is meaningless on a small set — a floor of 3 keeps the rule
 * from crying about noise in an 8-question category while still binding hard at
 * 40 and 240.
 */
export const BALANCE_TOLERANCE_BANK = 0.05;
export const BALANCE_TOLERANCE_CATEGORY = 0.10;
export const BALANCE_TOLERANCE_FLOOR = 3;

/**
 * The length tell. A bare "is the correct option the longest" fires on 40% of
 * the pre-P4 bank and is almost all one- and two-character noise (`Clippy`
 * beating `Binky` is not a tell). Requiring a MARGIN over EVERY distractor cuts
 * that to 12.5% and leaves exactly the padded ones — which is the AI-authoring
 * giveaway this rule exists to catch.
 */
export const TELL_MARGIN_CHARS = 4;
export const MAX_TELL_SHARE_BANK = 0.20;
export const MAX_TELL_SHARE_CATEGORY = 0.30;

/**
 * ...and the aggregate that catches a bank which pads by one character
 * everywhere, slipping under the margin. 1.00 is neutral; the pre-P4 bank sits
 * at 1.131.
 */
export const MAX_LENGTH_RATIO_BANK = 1.15;

/**
 * @typedef {{ category: string, tier: number, prompt: string, options: string[],
 *   correctIndex: number, funFact: string, source: string }} BankQuestion
 * @typedef {{ rule: string, where: string, message: string }} Violation
 */

const RECORD_KEYS = ['tier', 'prompt', 'options', 'correctIndex', 'funFact'];

/** Case, edge space, run-together space and trailing punctuation are not identity. */
export function normalizePrompt(prompt) {
  return String(prompt).trim().toLowerCase().replace(/\s+/g, ' ').replace(/[?.!…]+$/, '');
}

/** Read the six JSON files and attach the category (from the filename) and a locator. */
export function loadBank(dir = 'supabase/questions') {
  return CATEGORY_KEYS.flatMap(category => {
    const raw = JSON.parse(readFileSync(`${dir}/${category}.json`, 'utf8'));
    return raw.map((q, i) => ({ ...q, category, source: `${category}[${i}]` }));
  });
}

const isStr = v => typeof v === 'string';
const isInt = v => Number.isInteger(v);

/** The six per-question rules. */
export function validateQuestion(q) {
  /** @type {Violation[]} */
  const out = [];
  const where = `${q.source} "${String(q.prompt).slice(0, 48)}"`;
  const add = (rule, message) => out.push({ rule, where, message });

  // shape
  const extra = Object.keys(q).filter(k => ![...RECORD_KEYS, 'category', 'source'].includes(k));
  if (extra.length > 0) add('shape', `unexpected key(s): ${extra.join(', ')}`);
  if (!isStr(q.prompt)) add('shape', 'prompt must be a string');
  if (!isStr(q.funFact)) add('shape', 'funFact must be a string');
  if (!Array.isArray(q.options) || q.options.length !== 4 || !q.options.every(isStr)) {
    add('shape', 'options must be exactly four strings');
  }

  // bounds / tier / category
  if (!isInt(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) {
    add('bounds', `correctIndex must be an integer 0-3, got ${JSON.stringify(q.correctIndex)}`);
  }
  if (!isInt(q.tier) || q.tier < 1 || q.tier > 4) {
    add('tier', `tier must be an integer 1-4, got ${JSON.stringify(q.tier)}`);
  }
  if (!CATEGORY_KEYS.includes(q.category)) {
    add('category', `unknown category "${q.category}"`);
  }

  // text
  if (isStr(q.prompt)) {
    const p = q.prompt.trim();
    if (p.length === 0) add('text', 'prompt is empty');
    if (p.length > MAX_PROMPT_CHARS) {
      add('text', `prompt is ${p.length - MAX_PROMPT_CHARS} chars over ${MAX_PROMPT_CHARS}`);
    }
  }
  if (Array.isArray(q.options) && q.options.every(isStr)) {
    q.options.forEach((o, i) => {
      const t = o.trim();
      if (t.length === 0) add('text', `option ${i} is empty`);
      if (t.length > MAX_OPTION_CHARS) {
        add('text', `option ${i} is ${t.length - MAX_OPTION_CHARS} chars over ${MAX_OPTION_CHARS}`);
      }
    });
    if (new Set(q.options.map(o => o.trim().toLowerCase())).size < q.options.length) {
      add('text', 'two options are the same');
    }
  }

  // fun-fact
  if (isStr(q.funFact)) {
    const f = q.funFact.trim();
    if (f.length === 0) add('fun-fact', 'fun fact is missing');
    if (f.length > MAX_FUN_FACT_CHARS) {
      add('fun-fact', `fun fact is ${f.length - MAX_FUN_FACT_CHARS} chars over ${MAX_FUN_FACT_CHARS}`);
    }
  }

  return out;
}

/**
 * Can this record be counted?
 *
 * The aggregate rules index into `options` by `correctIndex`, so a record that
 * failed `shape` or `bounds` would crash them — and a crash is a worse report
 * than a violation list, because it hides every OTHER defect in the bank behind
 * a stack trace. Statistics over a malformed record are meaningless anyway; the
 * per-question rules have already named it.
 */
function isCountable(q) {
  return Array.isArray(q.options) && q.options.length === 4 && q.options.every(isStr)
    && isInt(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex <= 3
    && isInt(q.tier) && q.tier >= 1 && q.tier <= 4;
}

/** True when the correct option beats EVERY distractor by TELL_MARGIN_CHARS or more. */
function isLengthTell(q) {
  const lens = q.options.map(o => o.length);
  const correct = lens[q.correctIndex];
  const best = Math.max(...lens.filter((_, i) => i !== q.correctIndex));
  return correct - best >= TELL_MARGIN_CHARS;
}

function statsFor(allRows) {
  const rows = allRows.filter(isCountable);
  const counts = [0, 0, 0, 0];
  const cells = {};
  let tells = 0, correctChars = 0, distractorChars = 0;
  for (const q of rows) {
    counts[q.correctIndex] += 1;
    cells[q.tier] = (cells[q.tier] ?? 0) + 1;
    if (isLengthTell(q)) tells += 1;
    correctChars += q.options[q.correctIndex].length;
    distractorChars +=
      q.options.filter((_, i) => i !== q.correctIndex).reduce((a, o) => a + o.length, 0) / 3;
  }
  return {
    n: rows.length, counts, cells, tells,
    tellShare: rows.length === 0 ? 0 : tells / rows.length,
    lengthRatio: distractorChars === 0 ? 1 : correctChars / distractorChars,
  };
}

export function bankStats(bank) {
  const byCategory = {};
  for (const key of CATEGORY_KEYS) byCategory[key] = statsFor(bank.filter(q => q.category === key));
  return { total: bank.length, byCategory, bank: statsFor(bank) };
}

function checkBalance(rule, where, s, tolerance) {
  /** @type {Violation[]} */
  const out = [];
  if (s.n === 0) return out;
  const even = s.n / 4;
  const slack = Math.max(BALANCE_TOLERANCE_FLOOR, tolerance * s.n);
  s.counts.forEach((c, i) => {
    if (Math.abs(c - even) > slack) {
      out.push({
        rule, where,
        message: `correct answer sits at option ${i} ${c} times; an even split is ` +
          `${even.toFixed(1)} and the tolerance is ±${slack.toFixed(1)} (counts ${s.counts.join('/')})`,
      });
    }
  });
  return out;
}

/** Per-question rules for every entry, then the four aggregate rules. */
export function validateBank(bank) {
  /** @type {Violation[]} */
  const out = [];
  for (const q of bank) out.push(...validateQuestion(q));

  // unique-prompt — bank-wide, ACROSS categories. Deliberately stricter than
  // the database's uq_questions_category_prompt: two categories asking the same
  // question is a bank defect even though Postgres would take it.
  const seen = new Map();
  for (const q of bank) {
    const key = normalizePrompt(q.prompt);
    if (seen.has(key)) {
      out.push({
        rule: 'unique-prompt', where: q.source,
        message: `duplicate prompt, first seen at ${seen.get(key)}: "${String(q.prompt).slice(0, 60)}"`,
      });
    } else {
      seen.set(key, q.source);
    }
  }

  const stats = bankStats(bank);

  // coverage
  for (const key of CATEGORY_KEYS) {
    const s = stats.byCategory[key];
    for (const tier of [1, 2, 3, 4]) {
      const n = s.cells[tier] ?? 0;
      if (n < MIN_PER_CELL) {
        out.push({
          rule: 'coverage', where: `${key} tier ${tier}`,
          message: `holds ${n} question(s); the floor is ${MIN_PER_CELL}`,
        });
      }
    }
  }

  // balance
  out.push(...checkBalance('balance', 'bank', stats.bank, BALANCE_TOLERANCE_BANK));
  for (const key of CATEGORY_KEYS) {
    out.push(...checkBalance('balance', key, stats.byCategory[key], BALANCE_TOLERANCE_CATEGORY));
  }

  // length-tell
  if (stats.bank.tellShare > MAX_TELL_SHARE_BANK) {
    out.push({
      rule: 'length-tell', where: 'bank',
      message: `the correct option is ${TELL_MARGIN_CHARS}+ chars longer than every ` +
        `distractor in ${(stats.bank.tellShare * 100).toFixed(1)}% of questions ` +
        `(cap ${MAX_TELL_SHARE_BANK * 100}%)`,
    });
  }
  if (stats.bank.lengthRatio > MAX_LENGTH_RATIO_BANK) {
    out.push({
      rule: 'length-tell', where: 'bank',
      message: `correct options average ${stats.bank.lengthRatio.toFixed(3)}x the length of ` +
        `distractors (cap ${MAX_LENGTH_RATIO_BANK})`,
    });
  }
  for (const key of CATEGORY_KEYS) {
    const s = stats.byCategory[key];
    if (s.tellShare > MAX_TELL_SHARE_CATEGORY) {
      out.push({
        rule: 'length-tell', where: key,
        message: `${(s.tellShare * 100).toFixed(1)}% of this category's questions have a ` +
          `padded correct option (cap ${MAX_TELL_SHARE_CATEGORY * 100}%)`,
      });
    }
  }

  return out;
}

export function formatViolations(violations) {
  if (violations.length === 0) return '';
  return violations.map(v => `  [${v.rule}] ${v.where}\n      ${v.message}`).join('\n');
}

/** The statistics tables `--report` prints. Read these while authoring. */
export function formatReport(bank) {
  const s = bankStats(bank);
  const lines = [
    `bank: ${s.total} questions`,
    '',
    'category        n   t1 t2 t3 t4   correct@0/1/2/3   tell%   len ratio',
  ];
  for (const key of CATEGORY_KEYS) {
    const c = s.byCategory[key];
    lines.push(
      `${key.padEnd(14)} ${String(c.n).padStart(3)}   ` +
      [1, 2, 3, 4].map(t => String(c.cells[t] ?? 0).padStart(2)).join(' ') + '   ' +
      c.counts.join('/').padStart(15) + '   ' +
      `${(c.tellShare * 100).toFixed(1)}%`.padStart(5) + '   ' +
      c.lengthRatio.toFixed(3)
    );
  }
  lines.push(
    `${'BANK'.padEnd(14)} ${String(s.bank.n).padStart(3)}   ` +
    [1, 2, 3, 4].map(t => String(s.bank.cells[t] ?? 0).padStart(2)).join(' ') + '   ' +
    s.bank.counts.join('/').padStart(15) + '   ' +
    `${(s.bank.tellShare * 100).toFixed(1)}%`.padStart(5) + '   ' +
    s.bank.lengthRatio.toFixed(3),
    '',
    `caps: tell ${MAX_TELL_SHARE_BANK * 100}% bank / ${MAX_TELL_SHARE_CATEGORY * 100}% category, ` +
    `len ratio ${MAX_LENGTH_RATIO_BANK} bank, min ${MIN_PER_CELL} per cell`
  );
  return lines.join('\n');
}
