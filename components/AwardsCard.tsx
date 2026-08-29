'use client';
import { motion } from 'motion/react';
import Panel from '@/components/ui/Panel';
import { avatarEmoji } from '@/lib/avatars';
import { AWARD_META, awardValueText } from '@/lib/awards';
import { DURATION, EASE } from '@/lib/presentation/tokens';
import type { Award } from '@/lib/types';

/**
 * The awards (PRD §5.4.4) — the ceremony's coda.
 *
 * DOM, never canvas (cross-cutting constraint 2), and free of any surface
 * variant: every size here resolves through a theme variable that
 * `[data-surface="stage"]` overrides (ADR-0035), so one component serves the
 * phone and the television.
 *
 * The card takes its awards as a PROP rather than reading a store: the fetch
 * belongs to the screen that mounts it (lib/useAwards.ts), and a component that
 * fetched for itself would issue two requests on the player route, where this
 * is mounted once.
 *
 * Staged exactly as the board is (ADR-0030): unconditionally rendered so the
 * awards are in the accessibility tree from the ceremony's first frame, with
 * `opacity` as a `motion` VARIANT TARGET and never as a Tailwind class —
 * animated inline styles outrank a class regardless of specificity, and this
 * project has shipped that bug once (ADR-0017).
 */
export default function AwardsCard({
  awards, show, instant,
}: {
  /** `null` while the fetch is in flight; `[]` when the race earned none. */
  awards: Award[] | null;
  /** The ceremony's `awards` beat has landed (or the beat was over at mount). */
  show: boolean;
  /** Mounted past the beat — settle without playing the entrance. */
  instant: boolean;
}) {
  if (!awards || awards.length === 0) return null;

  return (
    <motion.div
      data-testid="awards"
      data-entered={show ? 'true' : 'false'}
      initial={instant ? false : 'hidden'}
      animate={show ? 'shown' : 'hidden'}
      variants={{
        hidden: { opacity: 0 },
        shown: {
          opacity: 1,
          transition: { duration: DURATION.cut / 1000, ease: EASE.settle },
        },
      }}
    >
      <Panel className="px-4 py-5 sm:px-6">
        {/*
          One polite live region for the whole card: the awards are news, but
          they land while a screen reader may still be reading the board, and
          nothing here is urgent enough to interrupt that.
        */}
        <div role="status" aria-live="polite">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink-mute">
            Awards
          </h2>

          <ul className="mt-3 space-y-2">
            {awards.map(award => {
              const meta = AWARD_META[award.key];
              return (
                <li
                  key={award.key}
                  data-testid="award"
                  data-award={award.key}
                  className="flex items-center gap-3 rounded-control bg-abyss/50 px-3 py-2.5"
                >
                  {/* Decoration. The award's NAME is beside it in text, so a
                      screen reader announces "Big Brain", not "brain". */}
                  <span aria-hidden="true" className="text-xl leading-none">{meta.emoji}</span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-ink">{meta.label}</span>
                    <span className="block text-xs text-ink-mute">{meta.blurb}</span>
                  </span>

                  <span className="flex min-w-0 shrink flex-col items-end gap-0.5">
                    <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                      {award.winners.map(w => (
                        <span key={w.player_id} className="flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm"
                            style={{
                              backgroundColor: `${w.color}33`,
                              boxShadow: `inset 0 0 0 2px ${w.color}`,
                            }}
                          >
                            {avatarEmoji(w.avatar)}
                          </span>
                          <span
                            data-testid="award-winner"
                            className="max-w-28 truncate text-sm font-semibold text-ink"
                          >
                            {w.nickname}
                          </span>
                        </span>
                      ))}
                    </span>
                    <span className="text-xs tabular-nums text-ink-dim">
                      {/* A shared award is stated in WORDS, never left to be
                          inferred from two names sitting side by side. */}
                      {award.winners.length > 1 && <>shared · </>}
                      {awardValueText(award.key, award.value)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </Panel>
    </motion.div>
  );
}
