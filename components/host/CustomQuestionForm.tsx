'use client';
import { useId, useState } from 'react';
import {
  EMPTY_DRAFT, MAX_FUN_FACT_CHARS, MAX_OPTION_CHARS, MAX_PROMPT_CHARS,
  trimDraft, validateCustomQuestion,
} from '@/lib/draw';
import type { CustomQuestionDraft } from '@/lib/draw';
import { CATEGORIES, TIER_NAMES } from '@/lib/rank';
import type { Tier } from '@/lib/types';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

/**
 * The host's own question (PRD §5.1 step 5, §7). It lives only in this room and
 * dies with it.
 *
 * `validateCustomQuestion` runs on submit, not on every keystroke: a form that
 * shouts "write the question" at the first character is hostile. The server
 * validates the same rules and is the authority — this only saves a round trip.
 */
export default function CustomQuestionForm({
  categories, busy, onSubmit, onCancel,
}: {
  categories: string[];
  busy: boolean;
  onSubmit(draft: CustomQuestionDraft): Promise<string | null>;
  onCancel(): void;
}) {
  const [draft, setDraft] = useState<CustomQuestionDraft>({
    ...EMPTY_DRAFT, category: categories[0] ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const correctName = useId();

  const set = <K extends keyof CustomQuestionDraft>(key: K, value: CustomQuestionDraft[K]) =>
    setDraft(d => ({ ...d, [key]: value }));

  const setOption = (i: number, value: string) =>
    setDraft(d => ({ ...d, options: d.options.map((o, j) => (j === i ? value : o)) }));

  async function submit() {
    const local = validateCustomQuestion(draft, categories);
    if (local) { setError(local); return; }
    setError(await onSubmit(trimDraft(draft)));
  }

  return (
    <Panel data-testid="draw-add-form" className="space-y-4 p-5">
      <h3 className="font-display text-[0.6875rem] font-semibold uppercase tracking-[0.28em] text-neon-cyan">
        Your own question
      </h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Category"
          value={draft.category}
          onChange={e => set('category', e.target.value)}
          options={categories.map(key => ({
            value: key,
            label: CATEGORIES.find(c => c.key === key)?.label ?? key,
          }))}
        />
        <Select
          label="Difficulty"
          value={String(draft.tier)}
          onChange={e => set('tier', Number(e.target.value) as Tier)}
          options={([1, 2, 3, 4] as Tier[]).map(t => ({
            value: String(t), label: TIER_NAMES[t],
          }))}
        />
      </div>

      <Input
        value={draft.prompt}
        onChange={e => set('prompt', e.target.value)}
        maxLength={MAX_PROMPT_CHARS}
        placeholder="The question"
        aria-label="The question"
      />

      <fieldset className="space-y-2">
        <legend className="font-display text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-ink-mute">
          Four options — mark the correct one
        </legend>
        {draft.options.map((option, i) => (
          <div key={i} className="flex items-center gap-3">
            <input
              type="radio"
              name={correctName}
              checked={draft.correctIndex === i}
              onChange={() => set('correctIndex', i)}
              aria-label={`Option ${OPTION_LETTERS[i]} is correct`}
              className="h-4 w-4 shrink-0 accent-correct focus-visible:outline-2
                focus-visible:outline-offset-2 focus-visible:outline-neon-cyan"
            />
            <Input
              value={option}
              onChange={e => setOption(i, e.target.value)}
              maxLength={MAX_OPTION_CHARS}
              placeholder={`Option ${OPTION_LETTERS[i]}`}
              aria-label={`Option ${OPTION_LETTERS[i]}`}
            />
          </div>
        ))}
      </fieldset>

      <Input
        value={draft.funFact}
        onChange={e => set('funFact', e.target.value)}
        maxLength={MAX_FUN_FACT_CHARS}
        placeholder="Fun fact for the reveal (optional)"
        aria-label="Fun fact for the reveal, optional"
      />

      <p
        data-testid="draw-add-error"
        role="status"
        aria-live="polite"
        className="min-h-5 text-sm text-wrong"
      >
        {error}
      </p>

      <div className="flex gap-2">
        <Button data-testid="draw-add-submit" disabled={busy} onClick={() => void submit()}>
          Add to the draw
        </Button>
        <Button variant="quiet" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Panel>
  );
}
