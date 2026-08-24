'use client';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStaging } from '@/lib/staging/useStaging';
import { ARENA_AT_MS, DRAMA_HOLD_MS } from '@/lib/presentation/timing';
import { EASE } from '@/lib/presentation/tokens';
import { STAGE_DRAMA_HOLD_MS } from '@/lib/world/director';

/**
 * The beat's single headline (spec §5, ADR-0010).
 *
 * It enters at ARENA_AT_MS — the same instant the world's arena reaction lands,
 * because both read the same constant. Announcing one thing while the stadium
 * reacts to another is the failure mode; sharing the constant closes it.
 *
 * The delay is a local timer rather than a derived step because the callout is
 * resolved by a cue, not by the deadline: it exists only for the beat in which
 * it was resolved, and a reload mid-TRACK correctly produces none at all.
 */
export default function LowerThird({ variant = 'card' }: { variant?: 'card' | 'strip' } = {}) {
  const callout = useStaging(s => s.callout);
  const [visible, setVisible] = useState(false);
  const holdMs = variant === 'strip' ? STAGE_DRAMA_HOLD_MS : DRAMA_HOLD_MS;

  useEffect(() => {
    if (!callout) {
      // Defensive only: the hide timer below already settles `visible` to
      // false well within a beat's own duration, so callout going null never
      // actually finds it still true. Deferred to a macrotask rather than
      // called synchronously, so this can't cascade a render mid-effect.
      const reset = setTimeout(() => setVisible(false), 0);
      return () => clearTimeout(reset);
    }
    const show = setTimeout(() => setVisible(true), ARENA_AT_MS);
    const hide = setTimeout(() => setVisible(false), ARENA_AT_MS + holdMs);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [callout, holdMs]);

  const isFinal = callout?.kind === 'final-question';

  return (
    <AnimatePresence>
      {callout && visible && (
        <motion.div
          key={callout.headline}
          data-testid="lower-third"
          data-kind={callout.kind}
          data-variant={variant}
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0, transition: { duration: 0.34, ease: EASE.settle } }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          className={
            variant === 'strip'
              ? `pointer-events-none mx-[-5.26%] flex items-center gap-4 border-y
                 border-white/10 bg-linear-to-r from-abyss/95 via-abyss/85 to-transparent
                 py-4 pl-[5%] backdrop-blur-md
                 ${isFinal ? 'border-warning/60 from-warning/25 via-warning/10' : ''}`
              : `pointer-events-none mx-auto rounded-panel border backdrop-blur-md
                 ${isFinal
                   ? 'w-full border-warning/60 bg-warning/15 px-6 py-4 text-center'
                   : 'border-haze/50 bg-abyss/80 px-5 py-3'}`
          }
        >
          {variant === 'strip' && (
            <span
              aria-hidden="true"
              className={`h-10 w-1 shrink-0 ${isFinal ? 'bg-warning' : 'bg-neon-cyan'}`}
              style={{ boxShadow: '0 0 24px currentColor' }}
            />
          )}
          <p
            className={`font-display font-black uppercase tracking-[0.14em]
              ${isFinal ? 'text-hero text-warning' : variant === 'strip' ? 'text-hero text-ink' : 'text-sm text-ink'}`}
          >
            {callout.headline}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
