'use client';
import { AnimatePresence, motion } from 'motion/react';
import { avatarEmoji } from '@/lib/avatars';
import { DURATION, EASE } from '@/lib/presentation/tokens';
import { useStaging } from '@/lib/staging/useStaging';
import { useGameStore } from '@/lib/store';

/**
 * The tiebreak's own announcement (PRD §5.4.2).
 *
 * Separate from `QuestionCard`'s badge because it says something the badge
 * cannot fit: WHO is racing this question, and — for anyone who is not — that
 * they are watching. On the stage view it is the only thing that explains why
 * the race did not end at the finish line.
 *
 * DOM, never canvas (cross-cutting constraint 2). Rendered inside
 * `[data-surface="stage"]` on the broadcast screen, so every size resolves
 * through a theme variable that scope overrides and it comes out
 * television-sized with no variant prop (ADR-0035).
 *
 * `AnimatePresence initial={false}` is the standing guard: this mounts
 * conditionally off staging state derived from the server, so without it the
 * entrance replays on every reload inside the tiebreak (CURRENT.md).
 */
export default function SuddenDeathBanner() {
  const suddenDeath = useStaging(s => s.suddenDeath);
  const room = useGameStore(s => s.room);
  const players = useGameStore(s => s.players);

  const contenders = room?.sudden_death?.contenders ?? [];
  const racing = contenders
    .map(id => players.find(p => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  return (
    <AnimatePresence initial={false}>
      {suddenDeath && (
        <motion.div
          key="sudden-death"
          data-testid="sudden-death"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: -12 }}
          animate={{
            opacity: 1, y: 0,
            transition: { duration: DURATION.settle / 1000, ease: EASE.settle },
          }}
          exit={{ opacity: 0, transition: { duration: DURATION.cut / 1000 } }}
          className="rounded-panel border border-neon-magenta/45 bg-neon-magenta/10 px-5 py-3 text-center"
        >
          <p className="font-display text-[0.6875rem] font-semibold uppercase tracking-[0.28em] text-neon-magenta">
            Sudden death
          </p>
          <p className="mt-1 text-sm text-ink-dim">
            Dead level at the line. First correct answer takes it.
          </p>

          {racing.length > 0 && (
            <ul className="mt-2 flex flex-wrap items-center justify-center gap-2">
              {racing.map(p => (
                <li
                  key={p.id}
                  data-testid="sudden-death-contender"
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-abyss/60 py-1 pl-1 pr-3"
                >
                  <span
                    aria-hidden="true"
                    className="grid h-6 w-6 place-items-center rounded-full text-sm"
                    style={{
                      backgroundColor: `${p.color}33`,
                      boxShadow: `inset 0 0 0 2px ${p.color}`,
                    }}
                  >
                    {avatarEmoji(p.avatar)}
                  </span>
                  <span className="text-xs font-semibold text-ink">{p.nickname}</span>
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
