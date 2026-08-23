'use client';
import { motion } from 'motion/react';
import Panel from '@/components/ui/Panel';
import { avatarEmoji } from '@/lib/avatars';
import { DURATION, EASE } from '@/lib/presentation/tokens';
import { NO_VALUE, formatAccuracy, formatAvg, resultStats } from '@/lib/results/stats';
import { useSettings } from '@/lib/useSettings';
import type { Standing } from '@/lib/types';

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Per-row entrance delay (spec §6, "DURATION-scale delays"). A quarter of the
 * shortest named duration: a 20-player field (PRD §13) unrolls in 600ms, so a
 * full board is settled well inside the ceremony's remaining ~3s rather than
 * still arriving when the beat ends.
 */
const ROW_STAGGER_S = DURATION.cut / 4 / 1000;

/**
 * The full field (spec §5).
 *
 * ALWAYS RENDERED, never conditionally mounted (spec decision 1). `opacity: 0`
 * keeps the content in the accessibility tree, unlike `display: none` or
 * `visibility: hidden` — so the complete results are readable from the first
 * frame of the ceremony, which is the roadmap's exit criterion for this phase.
 *
 * The opacity is a `motion` variant target and MUST NOT also be a Tailwind
 * class: inline animated styles outrank a class regardless of specificity, and
 * this project has already shipped that bug once (ADR-0017, spec decision 2).
 *
 * Variant propagation is by React context, not by DOM nesting, so the plain
 * `Panel`, `<table>` and `<tbody>` between this wrapper and the rows are
 * transparent to it: each `motion.tr` registers against this wrapper and is
 * staggered by its `shown` transition. Same idiom as components/AvatarStack.tsx.
 */
export default function ResultsTable({
  standings, myId, show, instant,
}: {
  standings: Standing[];
  myId: string | null;
  /** The ceremony's `board` beat has landed (or the beat was over at mount). */
  show: boolean;
  /** Mounted past the beat — settle without playing the entrance. */
  instant: boolean;
}) {
  const reduced = useSettings(s => s.profile) === 'reduced';

  // The board is information, and information is the last thing a motion
  // preference should cost anyone (spec §6): `reduced` drops the stagger and
  // the run-on delay, so the rows appear together. The rows' lift is dropped by
  // MotionConfig's reducedMotion="always" (components/MotionProvider.tsx),
  // which suppresses transforms and keeps opacity.
  const enter = reduced
    ? { duration: DURATION.cut / 1000, ease: EASE.settle }
    : {
        duration: DURATION.cut / 1000,
        ease: EASE.settle,
        delayChildren: DURATION.beat / 1000,
        staggerChildren: ROW_STAGGER_S,
      };

  return (
    <motion.div
      data-testid="results-board"
      data-entered={show ? 'true' : 'false'}
      initial={instant ? false : 'hidden'}
      animate={show ? 'shown' : 'hidden'}
      variants={{ hidden: { opacity: 0 }, shown: { opacity: 1, transition: enter } }}
    >
      <Panel className="overflow-hidden px-2 py-4 sm:px-3">
        <table data-testid="results-table" className="w-full border-collapse text-left">
          <caption className="px-3 pb-3 text-left text-[11px] font-bold uppercase tracking-widest text-ink-mute">
            Final standings
          </caption>
          <thead>
            <tr className="text-[11px] uppercase tracking-widest text-ink-mute">
              <th scope="col" className="pb-2 pl-3 pr-2 text-left font-bold">Rank</th>
              <th scope="col" className="pb-2 pr-2 text-left font-bold">Player</th>
              <th scope="col" className="pb-2 pr-3 text-right font-bold">Correct</th>
              {/* Spec decision 4: below `sm` these three collapse under the
                  nickname. They are never abbreviated to fit (spec §7). */}
              <th scope="col" className="hidden pb-2 pr-3 text-right font-bold sm:table-cell">Accuracy</th>
              <th scope="col" className="hidden pb-2 pr-3 text-right font-bold sm:table-cell">Avg time</th>
              <th scope="col" className="hidden pb-2 pr-3 text-right font-bold sm:table-cell">Best streak</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, rank) => {
              const { accuracy, avgSeconds } = resultStats(s);
              const acc = formatAccuracy(accuracy);
              const avg = formatAvg(avgSeconds);
              const isMe = s.player_id === myId;

              return (
                <motion.tr
                  key={s.player_id}
                  data-testid="results-row"
                  aria-current={isMe ? 'true' : undefined}
                  variants={{
                    hidden: { opacity: 0, y: 8 },
                    shown: {
                      opacity: 1, y: 0,
                      transition: { duration: DURATION.beat / 1000, ease: EASE.settle },
                    },
                  }}
                  className={`border-t border-haze/30 align-top ${isMe ? 'bg-haze/25' : ''}`}
                >
                  {/* The medal is decoration; the rank NUMBER is the row
                      header's text, so a screen reader announces "1" rather
                      than "trophy" (spec §7). */}
                  <th scope="row" className="py-3 pl-3 pr-2 text-left font-normal">
                    {rank < 3 ? (
                      <>
                        <span aria-hidden="true" className="text-lg leading-none">{MEDALS[rank]}</span>
                        <span className="sr-only">{rank + 1}</span>
                      </>
                    ) : (
                      <span className="text-sm font-bold tabular-nums text-ink-mute">{rank + 1}</span>
                    )}
                  </th>

                  <td className="py-3 pr-2">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-base"
                        style={{
                          backgroundColor: `${s.color}33`,
                          boxShadow: `inset 0 0 0 2px ${s.color}`,
                        }}
                      >
                        {avatarEmoji(s.avatar)}
                      </span>
                      <span
                        data-testid="player-name"
                        className="block max-w-34 truncate font-semibold text-ink sm:max-w-56"
                      >
                        {s.nickname}
                      </span>
                    </span>
                    {/* Spec decision 4: narrow screens COLLAPSE, they do not
                        scroll. `sm:hidden` keeps this out of the accessibility
                        tree at widths where the columns themselves are shown,
                        so nothing is announced twice. */}
                    <span className="mt-1 block pl-9 text-xs tabular-nums text-ink-dim sm:hidden">
                      <Stat value={acc} /> · <Stat value={avg} /> avg · {s.longest_streak} streak
                    </span>
                  </td>

                  <td className="py-3 pr-3 text-right font-bold tabular-nums text-ink">{s.correct}</td>
                  <td className="hidden py-3 pr-3 text-right tabular-nums text-ink-dim sm:table-cell">
                    <Stat value={acc} />
                  </td>
                  <td className="hidden py-3 pr-3 text-right tabular-nums text-ink-dim sm:table-cell">
                    <Stat value={avg} />
                  </td>
                  <td className="hidden py-3 pr-3 text-right tabular-nums text-ink-dim sm:table-cell">
                    {s.longest_streak}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </motion.div>
  );
}

/**
 * A stat that may be unknown. The dash is decorative — announcing "em dash"
 * tells a screen-reader user nothing — so it is hidden and replaced with the
 * reason (spec §7).
 */
function Stat({ value }: { value: string }) {
  if (value !== NO_VALUE) return <>{value}</>;
  return (
    <>
      <span aria-hidden="true">{NO_VALUE}</span>
      <span className="sr-only">not answered</span>
    </>
  );
}
