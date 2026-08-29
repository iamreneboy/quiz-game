'use client';
import { motion } from 'motion/react';
import Panel from '@/components/ui/Panel';
import { DURATION, EASE } from '@/lib/presentation/tokens';
import { formatAccuracy, formatAvg, resultStats } from '@/lib/results/stats';
import type { Standing } from '@/lib/types';

/**
 * The headline (spec §5). Fades and lifts in first; the table's rows follow it
 * via their own `delayChildren` (components/ResultsTable.tsx).
 *
 * Like the table, this is ALWAYS rendered — never conditionally mounted — so
 * the winner is in the accessibility tree from the ceremony's first frame, and
 * so there is no mount for a reload to replay (spec decision 1). `instant`
 * settles it without an entrance; see the `settled` one-shot in ResultsView.
 *
 * The opacity and lift are variant targets, never Tailwind classes (ADR-0017).
 *
 * Unlike the table, the headline OMITS a stat it does not know rather than
 * printing a dash: a one-line summary reading "9/12 correct · — · — avg" is
 * worse than one reading "9/12 correct". The grid of dashes belongs in the
 * table, where the column header says what the dash is a dash FOR.
 */
export default function WinnerCard({
  winner, totalRounds, show, instant, suddenDeath = false,
}: {
  winner: Standing;
  totalRounds: number;
  /** The ceremony's `board` beat has landed (or the beat was over at mount). */
  show: boolean;
  /** Mounted past the beat — settle without playing the entrance. */
  instant: boolean;
  /** True when a sudden-death round decided first place (PRD §5.4.2). */
  suddenDeath?: boolean;
}) {
  const { accuracy, avgSeconds } = resultStats(winner);

  return (
    <motion.div
      data-testid="winner-card"
      initial={instant ? false : 'hidden'}
      animate={show ? 'shown' : 'hidden'}
      variants={{
        hidden: { opacity: 0, y: 24 },
        shown: {
          opacity: 1, y: 0,
          transition: { duration: DURATION.settle / 1000, ease: EASE.settle },
        },
      }}
    >
      <Panel className="px-6 py-7 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-mute">
          Race complete
        </p>
        <p className="mt-3 font-display text-hero font-black text-ink">
          <span aria-hidden="true">🏆 </span>
          <span style={{ color: winner.color }}>{winner.nickname}</span> wins
        </p>
        <p className="mt-2 text-sm tabular-nums text-ink-dim">
          {winner.correct}/{totalRounds} correct
          {accuracy !== null && <> · {formatAccuracy(accuracy)}</>}
          {avgSeconds !== null && <> · {formatAvg(avgSeconds)} avg</>}
        </p>
        {suddenDeath && (
          <p
            data-testid="winner-sudden-death"
            className="mt-2 text-[11px] font-bold uppercase tracking-[0.2em] text-neon-magenta"
          >
            Won on sudden death
          </p>
        )}
      </Panel>
    </motion.div>
  );
}
