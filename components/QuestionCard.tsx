'use client';
import { AnimatePresence, motion } from 'motion/react';
import type { QuestionPublic } from '@/lib/types';
import type { StageSteps } from '@/lib/staging/beats';
import { useStaging } from '@/lib/staging/useStaging';
import { TIER_NAMES, CATEGORIES } from '@/lib/rank';
import { EASE } from '@/lib/presentation/tokens';

/**
 * The READ beat's announcement (spec §5): category and tier slam in from
 * opposite edges and lock, then the question rises under them.
 *
 * Visibility comes from `steps`, which is derived from the server deadline —
 * a client that joins or reloads mid-READ gets `steps` already true and
 * `motion` mounts it at rest instead of replaying the slam.
 */
const slam = (from: number) => ({
  hidden: { opacity: 0, x: from },
  shown: { opacity: 1, x: 0, transition: { duration: 0.46, ease: EASE.settle } },
});

export default function QuestionCard({
  question, round, totalRounds, steps,
}: {
  question: QuestionPublic;
  round: number;
  totalRounds: number;
  steps: StageSteps;
}) {
  const cat = CATEGORIES.find(c => c.key === question.category);
  const escalated = useStaging(s => s.escalated);

  return (
    <div className="space-y-4 text-center">
      <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.14em]">
        {escalated ? (
          <span className="rounded-full border border-warning/60 bg-warning/15 px-3 py-1.5 text-warning">
            Final question
          </span>
        ) : (
          <span className="text-ink-mute tabular-nums">Q{round}/{totalRounds}</span>
        )}
        <AnimatePresence initial={false}>
          {steps.badges && (
            <>
              <motion.span
                key="category"
                variants={slam(-40)} initial="hidden" animate="shown" exit="hidden"
                className="rounded-full border border-white/10 bg-haze/45 px-3 py-1.5 text-ink-dim"
              >
                {cat?.emoji} {cat?.label}
              </motion.span>
              <motion.span
                key="tier"
                variants={slam(40)} initial="hidden" animate="shown" exit="hidden"
                className="rounded-full border border-warning/35 bg-warning/10 px-3 py-1.5 text-warning"
              >
                {TIER_NAMES[question.tier]}
              </motion.span>
            </>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence initial={false}>
        {steps.question && (
          <motion.h2
            key={`${round}:${question.prompt}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.46, ease: EASE.snap } }}
            exit={{ opacity: 0 }}
            className="text-balance font-display text-2xl font-black leading-tight text-ink sm:text-hero"
          >
            {question.prompt}
          </motion.h2>
        )}
      </AnimatePresence>
    </div>
  );
}
