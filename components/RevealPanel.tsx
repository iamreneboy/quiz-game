'use client';
import { AnimatePresence, motion } from 'motion/react';
import type { QuestionPublic, RevealPayload } from '@/lib/types';
import type { RevealSteps } from '@/lib/staging/beats';
import { EASE } from '@/lib/presentation/tokens';

/**
 * The reveal's caption (spec §5).
 *
 * The distribution itself is the options grid, transformed in place
 * (decision 3) — this carries only what the rows cannot: the textual
 * confirmation, the fastest stamp, and the fun fact. Timings come from
 * `steps`, which is derived from the server deadline, so a reload lands with
 * everything present and nothing replays (ADR-0014).
 */
export default function RevealPanel({
  reveal, question, steps,
}: {
  reveal: RevealPayload;
  question: QuestionPublic;
  steps: RevealSteps;
}) {
  return (
    <div className="space-y-3">
      <p className="text-center text-xs font-bold uppercase tracking-[0.14em] text-correct">
        Correct answer
        <span className="ml-2 normal-case tracking-normal text-ink">
          {question.options[reveal.correct_index]}
        </span>
      </p>

      <AnimatePresence initial={false}>
        {steps.fastest && reveal.fastest && (
          <motion.p
            key="fastest"
            initial={{ opacity: 0, scale: 1.18 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.34, ease: EASE.settle } }}
            exit={{ opacity: 0 }}
            className="text-center text-sm font-black uppercase tracking-widest text-warning"
          >
            Fastest ⚡ {reveal.fastest.nickname}
          </motion.p>
        )}

        {steps.fact && reveal.fun_fact && (
          <motion.p
            key="fact"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.34, ease: EASE.snap } }}
            exit={{ opacity: 0 }}
            className="rounded-control border border-haze/40 bg-abyss/70 p-3 text-center text-sm
              text-ink-dim backdrop-blur-md"
          >
            💡 {reveal.fun_fact}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
