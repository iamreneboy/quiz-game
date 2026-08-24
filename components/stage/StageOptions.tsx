'use client';
import { motion } from 'motion/react';
import AvatarStack from '@/components/AvatarStack';
import { OPTION_IDENTITIES } from '@/lib/staging/options';
import { READ_OPTION_STAGGER, type OptionsMode, type RevealSteps } from '@/lib/staging/beats';
import type { DistributionRow } from '@/lib/staging/distribution';

/**
 * The four answers on a broadcast screen.
 *
 * Divs, not buttons: a stage view has no interaction affordances, so there is
 * nothing here to focus, disable, or press. The 1-4 keyboard shortcuts, the
 * lock state and the `spectating` fade all belong to the player surface and
 * are deliberately absent.
 *
 * What IS shared is the reveal: the options grid transforms in place into the
 * distribution (ADR-0019), because a separate results list would make the room
 * re-read four options they were just looking at.
 *
 * Opacity is a `motion` variant target and MUST NOT also be a Tailwind class —
 * inline animated styles outrank the class regardless of specificity
 * (ADR-0017).
 */
export default function StageOptions({
  options, mode, rows, revealSteps,
}: {
  options: string[];
  /** 'live' only during ANSWER: the server phase is the sole authority. */
  mode: OptionsMode;
  /** Present only in 'result' mode. */
  rows?: DistributionRow[];
  revealSteps?: RevealSteps;
}) {
  return (
    <motion.div
      /*
        Height is RESERVED, not grown. The distribution fills each column
        bottom-up at the reveal, and a row that resized then would move the
        answers at the most dramatic moment of the beat — exactly what
        ADR-0019 forbids.
      */
      className="grid h-[26cqh] grid-cols-4 gap-4"
      initial="hidden"
      animate="shown"
      variants={{ shown: { transition: { staggerChildren: READ_OPTION_STAGGER / 1000 } } }}
    >
      {options.map((opt, i) => {
        const { glyph, accent } = OPTION_IDENTITIES[i];
        const result = mode === 'result' ? rows?.[i] : undefined;
        const isCorrect = result?.correct ?? false;
        // In result mode the correct row is bright and the rest go quiet. No
        // red, no ✗ — tone is carried by treatment. Before the reveal, ANSWER
        // is full strength and READ is dimmed.
        const targetOpacity = result ? (isCorrect ? 1 : 0.62) : mode === 'live' ? 1 : 0.55;
        const share = revealSteps?.rows ? (result?.share ?? 0) : 0;

        return (
          <motion.div
            key={i}
            data-testid="stage-option"
            data-index={i}
            data-correct={isCorrect ? 'true' : undefined}
            data-share={result ? Math.round((result.share ?? 0) * 100) : undefined}
            variants={{ hidden: { opacity: 0, y: 14 }, shown: { opacity: targetOpacity, y: 0 } }}
            className={`relative flex flex-col justify-end overflow-hidden rounded-panel
              border border-white/10 border-l-4 bg-night/60 p-4 text-left font-semibold
              text-ink backdrop-blur-md transition-[border-color] duration-(--dur-cut) ease-snap`}
            style={{
              borderLeftColor: accent,
              backgroundColor: isCorrect
                ? 'color-mix(in oklab, var(--color-correct) 16%, transparent)'
                : undefined,
            }}
          >
            {/*
              The share as COLUMN HEIGHT. A room reads relative heights across a
              room faster than it reads four numbers.
            */}
            {result && (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 -z-10 transition-[height] duration-(--dur-beat) ease-snap"
                style={{
                  height: `${share * 100}%`,
                  backgroundColor: `color-mix(in oklab, ${isCorrect ? 'var(--color-correct)' : accent} 16%, transparent)`,
                }}
              />
            )}

            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid h-12 w-12 shrink-0 place-items-center rounded-control text-xl"
                style={{
                  backgroundColor: `color-mix(in oklab, ${accent} 14%, transparent)`,
                  color: accent,
                }}
              >
                {glyph}
              </span>
              <span className="min-w-0 flex-1 text-2xl leading-tight">{opt}</span>
            </div>

            {result && (
              <div className="mt-3 flex items-center justify-between gap-2">
                <AvatarStack
                  avatars={result.avatars}
                  overflow={result.overflow}
                  show={revealSteps?.stacks ?? false}
                />
                <span className="shrink-0 font-display text-3xl font-black tabular-nums text-ink-dim">
                  {result.count}
                </span>
              </div>
            )}
          </motion.div>
        );
      })}
    </motion.div>
  );
}
