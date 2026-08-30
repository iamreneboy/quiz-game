import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CATEGORY_KEYS, MIN_PER_CELL, MAX_FUN_FACT_CHARS, MAX_OPTION_CHARS, MAX_PROMPT_CHARS,
  loadBank, normalizePrompt, validateBank, validateQuestion,
} from '../scripts/questionRules.mjs';
import { buildSeedFile } from '../scripts/questionSql.mjs';
import { CATEGORIES } from '../lib/rank';
import {
  MAX_FUN_FACT_CHARS as DRAFT_FUN_FACT, MAX_OPTION_CHARS as DRAFT_OPTION,
  MAX_PROMPT_CHARS as DRAFT_PROMPT,
} from '../lib/draw';

const good = {
  category: 'fuel', tier: 1,
  prompt: 'Which mug on the third shelf is haunted?',
  options: ['The chipped one', 'The tall one', 'The odd one', 'Not any of them'],
  correctIndex: 2,
  funFact: 'It plays a jingle at 3pm.',
  source: 'fixture[0]',
};

/** The set of rule ids a bank trips — the shape every aggregate case asserts on. */
const fired = (bank: unknown[]) =>
  new Set(validateBank(bank as never).map(v => v.rule));

/**
 * A synthetic bank that satisfies coverage, balance and length-tell.
 *
 * The `(i + (tier - 1) * 2) % 4` rotation is not decoration: a plain `i % 4`
 * leaves every tier's block spread 3/3/2/2 for an odd `perCell`, which at
 * perCell 10 lands the bank on 72/72/48/48 — exactly on the balance rule's
 * boundary, so the fixture would sit one rounding change away from failing for
 * a reason that has nothing to do with what each case is testing. Offsetting
 * alternate tiers by two makes every category and the bank exactly even.
 */
function evenBank(perCell = MIN_PER_CELL) {
  const bank = [];
  for (const category of CATEGORY_KEYS) {
    for (const tier of [1, 2, 3, 4]) {
      for (let i = 0; i < perCell; i++) {
        bank.push({
          ...good, category, tier,
          prompt: `${category} t${tier} number ${i}?`,
          correctIndex: (i + (tier - 1) * 2) % 4,
          source: `${category}[${i}]`,
        });
      }
    }
  }
  return bank;
}

describe('the per-question rules', () => {
  it('passes a well-formed question', () => {
    expect(validateQuestion(good as never)).toEqual([]);
  });

  it('fires `shape` on options that are not four strings', () => {
    const q = { ...good, options: ['a', 'b', 'c'] };
    expect(validateQuestion(q as never).map(v => v.rule)).toContain('shape');
  });

  it('fires `shape` on an unexpected key', () => {
    const q = { ...good, difficulty: 'hard' };
    expect(validateQuestion(q as never).map(v => v.rule)).toContain('shape');
  });

  it('fires `bounds` on a correctIndex outside 0-3', () => {
    expect(validateQuestion({ ...good, correctIndex: 4 } as never).map(v => v.rule))
      .toContain('bounds');
  });

  it('fires `tier` on a tier outside 1-4', () => {
    expect(validateQuestion({ ...good, tier: 5 } as never).map(v => v.rule))
      .toContain('tier');
  });

  it('fires `category` on a category the game does not have', () => {
    expect(validateQuestion({ ...good, category: 'sports' } as never).map(v => v.rule))
      .toContain('category');
  });

  it('fires `text` on an over-long prompt', () => {
    const q = { ...good, prompt: 'x'.repeat(MAX_PROMPT_CHARS + 1) };
    expect(validateQuestion(q as never).map(v => v.rule)).toContain('text');
  });

  it('fires `text` on an over-long option', () => {
    const q = { ...good, options: ['x'.repeat(MAX_OPTION_CHARS + 1), 'b', 'c', 'd'] };
    expect(validateQuestion(q as never).map(v => v.rule)).toContain('text');
  });

  it('fires `text` on two options that differ only in case', () => {
    const q = { ...good, options: ['Tea', 'tea', 'Coffee', 'Water'] };
    expect(validateQuestion(q as never).map(v => v.rule)).toContain('text');
  });

  it('fires `fun-fact` on a blank fun fact', () => {
    expect(validateQuestion({ ...good, funFact: '   ' } as never).map(v => v.rule))
      .toContain('fun-fact');
  });

  it('fires `fun-fact` on an over-long fun fact', () => {
    const q = { ...good, funFact: 'x'.repeat(MAX_FUN_FACT_CHARS + 1) };
    expect(validateQuestion(q as never).map(v => v.rule)).toContain('fun-fact');
  });
});

describe('the aggregate rules', () => {
  it('passes an even synthetic bank', () => {
    expect(validateBank(evenBank() as never)).toEqual([]);
  });

  it('fires `unique-prompt` across DIFFERENT categories, which the database allows', () => {
    const bank = evenBank();
    bank[0].prompt = 'The same question?';
    bank.find(q => q.category === 'fuel')!.prompt = 'the same question';
    expect(fired(bank)).toContain('unique-prompt');
  });

  it('fires `coverage` when a cell is short', () => {
    const bank = evenBank().filter((_, i) => i !== 0);
    expect(fired(bank)).toContain('coverage');
  });

  it('fires `coverage` when a category has no questions at all', () => {
    const bank = evenBank().filter(q => q.category !== 'rewind');
    expect(fired(bank)).toContain('coverage');
  });

  it('fires `balance` when one slot holds far too many correct answers', () => {
    // Equal-length options so this fixture isolates `balance`. Left on the
    // default options, forcing every correct answer to slot 0 also pins the
    // correct option at 15 chars against a 12.67 distractor mean — a 1.184
    // ratio, which trips `length-tell` as well and muddies what the case proves.
    const options = ['a'.repeat(12), 'b'.repeat(12), 'c'.repeat(12), 'd'.repeat(12)];
    const bank = evenBank(10).map(q => ({ ...q, correctIndex: 0, options }));
    expect(fired(bank)).toContain('balance');
    expect(fired(bank)).not.toContain('length-tell');
  });

  it('fires `length-tell` when correct options are systematically padded', () => {
    const bank = evenBank(10).map(q => {
      const options = ['short', 'brief', 'terse', 'crisp'];
      options[q.correctIndex] = 'a conspicuously longer correct answer';
      return { ...q, options };
    });
    expect(fired(bank)).toContain('length-tell');
  });

  it('REPORTS rather than crashes on a record the aggregates cannot index', () => {
    // The aggregate rules read `options[correctIndex]`. A record that already
    // failed `shape`/`bounds` would throw there, and a stack trace hides every
    // other defect in the bank behind the first bad one — so uncountable
    // records are excluded from the statistics, not fed to them.
    const bank = evenBank();
    bank[0].correctIndex = 9;
    bank[1].options = ['only', 'three'] as never;
    expect(() => validateBank(bank as never)).not.toThrow();
    expect(fired(bank)).toContain('bounds');
    expect(fired(bank)).toContain('shape');
  });

  it('does NOT fire `length-tell` on one-character wins', () => {
    // Twenty-character distractors, a twenty-one-character correct option: the
    // margin is 1 (under TELL_MARGIN_CHARS) AND the ratio is 1.05 (under
    // MAX_LENGTH_RATIO_BANK). Both halves of the rule have to stay quiet, which
    // is why the strings are long — four-character distractors would clear the
    // margin and still trip the ratio at 1.25.
    const bank = evenBank(10).map(q => {
      const options = ['a'.repeat(20), 'b'.repeat(20), 'c'.repeat(20), 'd'.repeat(20)];
      options[q.correctIndex] = 'e'.repeat(21);
      return { ...q, options };
    });
    expect(fired(bank)).not.toContain('length-tell');
  });
});

describe('normalizePrompt', () => {
  it('ignores case, surrounding space, run-together space and trailing punctuation', () => {
    expect(normalizePrompt('  Who   ate  the  last   donut?  '))
      .toBe(normalizePrompt('who ate the last donut'));
  });
});

describe('the hand-mirrors', () => {
  it('CATEGORY_KEYS matches lib/rank.ts, in order', () => {
    expect(CATEGORY_KEYS).toEqual(CATEGORIES.map(c => c.key));
  });

  it('the text limits match lib/draw.ts, which mirrors add_custom_question', () => {
    expect(MAX_PROMPT_CHARS).toBe(DRAFT_PROMPT);
    expect(MAX_OPTION_CHARS).toBe(DRAFT_OPTION);
    expect(MAX_FUN_FACT_CHARS).toBe(DRAFT_FUN_FACT);
  });
});

describe('the real bank', () => {
  it('has no violations', () => {
    expect(validateBank(loadBank())).toEqual([]);
  });

  it('is in sync with supabase/seed.sql', () => {
    const onDisk = readFileSync('supabase/seed.sql', 'utf8').replace(/\r\n/g, '\n');
    expect(onDisk).toBe(buildSeedFile(loadBank()));
  });
});
