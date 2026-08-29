'use client';
import { motion } from 'motion/react';
import { CATEGORIES, TIER_NAMES } from '@/lib/rank';
import { EASE } from '@/lib/presentation/tokens';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import type { DrawQuestion } from '@/lib/types';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

/**
 * One round of the draw (PRD §5.1 step 5).
 *
 * The correct answer and the fun-fact are rendered only when the SERVER sent
 * them. `answersVisible` is not a second gate on the same data — for a racing
 * host those keys do not exist in the payload at all (ADR-0040) — it is what
 * lets the card explain the absence instead of just showing a gap.
 */
export default function DrawCard({
  question, answersVisible, busy, onSwap, onRemove, canRemove,
}: {
  question: DrawQuestion;
  answersVisible: boolean;
  busy: boolean;
  canRemove: boolean;
  onSwap(): void;
  onRemove(): void;
}) {
  const cat = CATEGORIES.find(c => c.key === question.category);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: EASE.settle }}
      data-testid="draw-card"
      data-round={question.round}
    >
      <Panel className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.14em]">
          <span className="tabular-nums text-ink-mute">Q{question.round}</span>
          <span className="rounded-full border border-white/10 bg-haze/45 px-3 py-1.5 text-ink-dim">
            {cat?.emoji} {cat?.label ?? question.category}
          </span>
          <span className="rounded-full border border-warning/35 bg-warning/10 px-3 py-1.5 text-warning">
            {TIER_NAMES[question.tier]}
          </span>
          {question.is_custom && (
            <span
              data-testid="draw-custom-badge"
              className="rounded-full border border-neon-magenta/50 bg-neon-magenta/10 px-3 py-1.5 text-neon-magenta"
            >
              Yours
            </span>
          )}
        </div>

        <p data-testid="draw-prompt" className="text-base font-semibold text-ink">
          {question.prompt}
        </p>

        <ul className="grid gap-1.5 sm:grid-cols-2">
          {question.options.map((option, i) => {
            const correct = answersVisible && question.correct_index === i;
            return (
              <li
                key={i}
                data-testid={correct ? 'draw-correct' : undefined}
                className={
                  'flex items-start gap-2 rounded-control border px-3 py-2 text-sm ' +
                  (correct
                    ? 'border-correct/60 bg-correct/10 text-correct'
                    : 'border-haze/40 bg-abyss/50 text-ink-dim')
                }
              >
                <span className="font-display font-bold">{OPTION_LETTERS[i]}</span>
                <span>{option}</span>
                {correct && <span aria-label="correct answer" className="ml-auto">✓</span>}
              </li>
            );
          })}
        </ul>

        {answersVisible && question.fun_fact && (
          <p data-testid="draw-fun-fact" className="text-sm text-ink-mute">
            💡 {question.fun_fact}
          </p>
        )}

        <div className="flex gap-2">
          <Button data-testid="draw-swap" variant="ghost" disabled={busy} onClick={onSwap}>
            Swap
          </Button>
          <Button
            data-testid="draw-remove"
            variant="quiet"
            disabled={busy || !canRemove}
            onClick={onRemove}
          >
            Remove
          </Button>
        </div>
      </Panel>
    </motion.li>
  );
}
