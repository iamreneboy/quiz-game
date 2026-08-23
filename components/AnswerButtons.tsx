'use client';
import { useEffect } from 'react';
import { motion } from 'motion/react';
import AvatarStack from './AvatarStack';
import { READ_OPTION_STAGGER, type OptionsMode, type RevealSteps } from '@/lib/staging/beats';
import type { DistributionRow } from '@/lib/staging/distribution';

/**
 * The four answers (spec §6).
 *
 * Accents are fixed BY INDEX, not by content, so ▲ is always cyan across every
 * question in every round. Shape carries the identity, so nothing here depends
 * on color alone.
 *
 * Selection is expressed by form, not hue (spec decision 5): a dedicated
 * selection color would collide with option 1's cyan and make the "which
 * option" signal fight the "which is mine" signal.
 */
const OPTIONS = [
  { glyph: '▲', accent: 'var(--color-neon-cyan)' },
  { glyph: '◆', accent: 'var(--color-neon-magenta)' },
  { glyph: '●', accent: 'var(--color-neon-lime)' },
  { glyph: '■', accent: 'var(--color-warning)' },
] as const;

export default function AnswerButtons({
  options, mode, lockedChoice, spectating, onChoose, rows, revealSteps,
}: {
  options: string[];
  /** 'live' only during ANSWER: the server phase is the sole authority. */
  mode: OptionsMode;
  lockedChoice: number | null;
  spectating: boolean;
  onChoose: (i: number) => void;
  /** Present only in 'result' mode. */
  rows?: DistributionRow[];
  revealSteps?: RevealSteps;
}) {
  const live = mode === 'live';
  const disabled = !live || lockedChoice !== null || spectating;

  // 1-4 shortcuts. Live only while a choice can actually be made, and never
  // when a modifier is held — Ctrl+1 etc. belong to the browser.
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const index = ['1', '2', '3', '4'].indexOf(e.key);
      if (index === -1 || index >= options.length) return;
      e.preventDefault();
      onChoose(index);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disabled, options.length, onChoose]);

  return (
    <motion.div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      initial="hidden"
      animate="shown"
      variants={{ shown: { transition: { staggerChildren: READ_OPTION_STAGGER / 1000 } } }}
    >
      {options.map((opt, i) => {
        const { glyph, accent } = OPTIONS[i];
        const chosen = lockedChoice === i;
        const faded = lockedChoice !== null && !chosen;
        const result = mode === 'result' ? rows?.[i] : undefined;
        const isCorrect = result?.correct ?? false;
        // motion.button writes its variant's opacity as an inline style, which
        // would silently outrank a Tailwind opacity-* class — so the dimmed
        // (READ / faded) states are expressed through the variant itself.
        // In result mode the row's own state replaces the lock fade: the
        // correct row is bright, the rest are quiet. No red, no ✗ — tone is
        // carried by treatment (spec decision 2).
        const targetOpacity = result
          ? isCorrect ? 1 : 0.62
          : chosen ? 1 : faded ? 0.45 : live ? 1 : 0.55;

        return (
          <motion.button
            key={i}
            type="button"
            data-testid="answer-option"
            data-index={i}
            data-locked={chosen ? 'true' : undefined}
            disabled={disabled}
            onClick={() => onChoose(i)}
            variants={{ hidden: { opacity: 0, y: 12 }, shown: { opacity: targetOpacity, y: 0 } }}
            className={`flex items-center gap-3 rounded-control border border-white/10 border-l-4
              bg-night/60 text-left font-semibold text-ink backdrop-blur-md
              ${result ? 'relative min-h-11 overflow-hidden p-2.5' : 'min-h-14 p-4'}
              transition-[opacity,box-shadow,border-color] duration-(--dur-cut) ease-snap
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-cyan
              disabled:cursor-not-allowed
              ${live && !chosen && !faded ? 'enabled:hover:border-white/25' : ''}`}
            style={{
              borderLeftColor: accent,
              backgroundColor: isCorrect
                ? 'color-mix(in oklab, var(--color-correct) 16%, transparent)'
                : undefined,
              boxShadow: chosen ? `0 0 0 2px ${accent}, 0 0 34px -10px ${accent}` : undefined,
            }}
          >
            {result && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 -z-10 transition-[width] duration-(--dur-beat) ease-snap"
                style={{
                  width: `${(revealSteps?.rows ? result.share : 0) * 100}%`,
                  backgroundColor: `color-mix(in oklab, ${isCorrect ? 'var(--color-correct)' : accent} 12%, transparent)`,
                }}
              />
            )}
            <span
              aria-hidden="true"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm"
              style={
                chosen
                  ? { backgroundColor: accent, color: 'var(--color-void)' }
                  : { backgroundColor: `color-mix(in oklab, ${accent} 14%, transparent)`, color: accent }
              }
            >
              {glyph}
            </span>
            <span className="min-w-0 flex-1">{opt}</span>
            {result && (
              <>
                <AvatarStack
                  avatars={result.avatars}
                  overflow={result.overflow}
                  show={revealSteps?.stacks ?? false}
                />
                <span className="shrink-0 tabular-nums text-sm font-bold text-ink-dim">
                  {result.count}
                </span>
                {isCorrect && (
                  <span
                    className="shrink-0 rounded-full bg-correct/20 px-2 py-0.5 text-xs font-bold text-correct"
                  >
                    correct
                  </span>
                )}
              </>
            )}
            <span
              aria-hidden="true"
              className="hidden shrink-0 rounded border border-white/12 px-1.5 py-0.5 text-[10px]
                font-bold text-ink-mute [@media(hover:hover)_and_(pointer:fine)]:block"
            >
              {i + 1}
            </span>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
