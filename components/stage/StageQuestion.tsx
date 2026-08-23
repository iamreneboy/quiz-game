'use client';
import { AnimatePresence, motion } from 'motion/react';
import type { QuestionPublic } from '@/lib/types';
import type { StageSteps } from '@/lib/staging/beats';
import { EASE } from '@/lib/presentation/tokens';

/**
 * The prompt, at the size a room reads it from.
 *
 * The category and tier badges live in StageBroadcast's status bar rather than
 * here — on a TV the persistent bar is where "what round is this" belongs,
 * and repeating them over the question would crowd the only line anyone is
 * actually reading.
 *
 * `AnimatePresence initial={false}` is required, not decorative: `steps` is
 * derived from the server deadline, so a stage view opening mid-READ gets
 * `steps.question` already true — correct state, but nothing about that says
 * the entrance should play. Without the guard it replays on every reload
 * (CURRENT.md tracks four occurrences of this trap).
 */
export default function StageQuestion({
  question, steps,
}: {
  question: QuestionPublic;
  steps: StageSteps;
}) {
  return (
    <AnimatePresence initial={false}>
      {steps.question && (
        <motion.h2
          key={question.prompt}
          data-testid="stage-question"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.46, ease: EASE.snap } }}
          exit={{ opacity: 0 }}
          className="text-balance text-center font-display text-hero font-black leading-tight
            text-ink lg:text-display"
        >
          {question.prompt}
        </motion.h2>
      )}
    </AnimatePresence>
  );
}
