import { describe, it, expect } from 'vitest';
import {
  EMPTY_DRAFT, MAX_FUN_FACT_CHARS, MAX_OPTION_CHARS, MAX_PROMPT_CHARS,
  tierCounts, trimDraft, validateCustomQuestion,
} from '../lib/draw';
import type { CustomQuestionDraft } from '../lib/draw';
import type { Tier } from '../lib/types';

const CATS = ['fuel', 'ai-tech'];

const good: CustomQuestionDraft = {
  category: 'fuel',
  tier: 1,
  prompt: 'Which mug on the third shelf is haunted?',
  options: ['The chipped one', 'The tall one', 'The novelty one', 'None of them'],
  correctIndex: 2,
  funFact: 'It plays a jingle at 3pm.',
};

describe('validateCustomQuestion', () => {
  it('accepts a complete draft', () => {
    expect(validateCustomQuestion(good, CATS)).toBeNull();
  });

  it('accepts a draft with no fun fact — it is optional', () => {
    expect(validateCustomQuestion({ ...good, funFact: '   ' }, CATS)).toBeNull();
  });

  it('rejects a category the room did not choose', () => {
    expect(validateCustomQuestion({ ...good, category: 'rewind' }, CATS))
      .toMatch(/categor/i);
  });

  it('rejects a blank prompt, whitespace included', () => {
    expect(validateCustomQuestion({ ...good, prompt: '   ' }, CATS))
      .toMatch(/write the question/i);
  });

  it('rejects an over-long prompt and says by how much', () => {
    const prompt = 'x'.repeat(MAX_PROMPT_CHARS + 7);
    expect(validateCustomQuestion({ ...good, prompt }, CATS)).toMatch(/7 characters too long/);
  });

  it('rejects a missing option', () => {
    expect(validateCustomQuestion({ ...good, options: ['a', 'b', '', 'd'] }, CATS))
      .toMatch(/all four options/i);
  });

  it('rejects an over-long option', () => {
    const options = ['a', 'b', 'c', 'x'.repeat(MAX_OPTION_CHARS + 1)];
    expect(validateCustomQuestion({ ...good, options }, CATS)).toMatch(/each option/i);
  });

  it('rejects two options that differ only in case', () => {
    expect(validateCustomQuestion({ ...good, options: ['Tea', 'tea', 'c', 'd'] }, CATS))
      .toMatch(/the same/i);
  });

  it('rejects a draft with no correct answer marked', () => {
    expect(validateCustomQuestion({ ...good, correctIndex: null }, CATS))
      .toMatch(/correct answer/i);
  });

  it('rejects a correct index outside the four options', () => {
    expect(validateCustomQuestion({ ...good, correctIndex: 4 }, CATS))
      .toMatch(/correct answer/i);
  });

  it('rejects an out-of-range tier', () => {
    expect(validateCustomQuestion({ ...good, tier: 9 as Tier }, CATS))
      .toMatch(/difficulty/i);
  });

  it('rejects an over-long fun fact', () => {
    const funFact = 'x'.repeat(MAX_FUN_FACT_CHARS + 3);
    expect(validateCustomQuestion({ ...good, funFact }, CATS)).toMatch(/3 characters too long/);
  });

  it('validates the trimmed draft, so padded input is accepted', () => {
    expect(validateCustomQuestion(
      { ...good, prompt: `  ${good.prompt}  `, options: good.options.map(o => ` ${o} `) },
      CATS,
    )).toBeNull();
  });

  it('rejects the empty draft', () => {
    expect(validateCustomQuestion(EMPTY_DRAFT, CATS)).not.toBeNull();
  });
});

describe('trimDraft', () => {
  it('trims the prompt, every option and the fun fact, and leaves the rest alone', () => {
    const trimmed = trimDraft({
      ...good, prompt: '  p  ', options: [' a', 'b ', ' c ', 'd'], funFact: ' f ',
    });
    expect(trimmed.prompt).toBe('p');
    expect(trimmed.options).toEqual(['a', 'b', 'c', 'd']);
    expect(trimmed.funFact).toBe('f');
    expect(trimmed.correctIndex).toBe(2);
    expect(trimmed.category).toBe('fuel');
  });
});

describe('tierCounts', () => {
  it('tallies a draw into the four stepper slots', () => {
    expect(tierCounts([{ tier: 1 }, { tier: 1 }, { tier: 3 }, { tier: 4 }] as { tier: Tier }[]))
      .toEqual([2, 0, 1, 1]);
  });

  it('returns four zeroes for an empty draw', () => {
    expect(tierCounts([])).toEqual([0, 0, 0, 0]);
  });
});
