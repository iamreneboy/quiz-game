import type { Tier } from './types';

/** Mirrors add_custom_question's own limits in 0006_the_draw.sql. */
export const MAX_PROMPT_CHARS = 200;
export const MAX_OPTION_CHARS = 80;
export const MAX_FUN_FACT_CHARS = 240;

/**
 * A custom question as the form holds it, before the server ever sees it.
 *
 * `correctIndex` is nullable here and not in the RPC: "which one is right" has
 * a real unanswered state in a form, and defaulting it to 0 would silently mark
 * the first option correct for a host who never chose.
 */
export interface CustomQuestionDraft {
  category: string;
  tier: Tier;
  prompt: string;
  options: string[];
  correctIndex: number | null;
  funFact: string;
}

export const EMPTY_DRAFT: CustomQuestionDraft = {
  category: '',
  tier: 1,
  prompt: '',
  options: ['', '', '', ''],
  correctIndex: null,
  funFact: '',
};

export function trimDraft(draft: CustomQuestionDraft): CustomQuestionDraft {
  return {
    ...draft,
    prompt: draft.prompt.trim(),
    options: draft.options.map(o => o.trim()),
    funFact: draft.funFact.trim(),
  };
}

/**
 * The first thing wrong with this draft, phrased for the host — or `null` when
 * it is ready to send.
 *
 * These rules mirror `add_custom_question`'s, which is the authority (roadmap
 * decision 2): this exists so the form can answer without a round trip, not so
 * the server can trust it.
 */
export function validateCustomQuestion(
  draft: CustomQuestionDraft,
  roomCategories: readonly string[],
): string | null {
  const d = trimDraft(draft);

  if (!roomCategories.includes(d.category)) return 'Pick one of this room\'s categories.';
  if (d.tier < 1 || d.tier > 4) return 'Pick a difficulty tier.';

  if (d.prompt.length < 1) return 'Write the question.';
  if (d.prompt.length > MAX_PROMPT_CHARS) {
    return `The question is ${d.prompt.length - MAX_PROMPT_CHARS} characters too long.`;
  }

  if (d.options.length !== 4 || d.options.some(o => o.length < 1)) {
    return 'Fill in all four options.';
  }
  if (d.options.some(o => o.length > MAX_OPTION_CHARS)) {
    return `Each option has to fit in ${MAX_OPTION_CHARS} characters.`;
  }
  if (new Set(d.options.map(o => o.toLowerCase())).size < 4) return 'Two options are the same.';

  if (d.correctIndex === null || d.correctIndex < 0 || d.correctIndex > 3) {
    return 'Mark the correct answer.';
  }

  if (d.funFact.length > MAX_FUN_FACT_CHARS) {
    return `The fun fact is ${d.funFact.length - MAX_FUN_FACT_CHARS} characters too long.`;
  }

  return null;
}

/** The draw tallied into the four slots the setup wizard's steppers use. */
export function tierCounts(
  questions: readonly { tier: Tier }[],
): [number, number, number, number] {
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  for (const q of questions) counts[q.tier - 1] += 1;
  return counts;
}
