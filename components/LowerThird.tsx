'use client';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStaging } from '@/lib/staging/useStaging';
import { ARENA_AT_MS, DRAMA_HOLD_MS } from '@/lib/presentation/timing';
import { EASE } from '@/lib/presentation/tokens';

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
export default function LowerThird() {
  const callout = useStaging(s => s.callout);
  const [visible, setVisible] = useState(false);

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
    const hide = setTimeout(() => setVisible(false), ARENA_AT_MS + DRAMA_HOLD_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [callout]);

  const isFinal = callout?.kind === 'final-question';

  return (
    <AnimatePresence>
      {callout && visible && (
        <motion.div
          key={callout.headline}
          data-testid="lower-third"
          data-kind={callout.kind}
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0, transition: { duration: 0.34, ease: EASE.settle } }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          className={`pointer-events-none mx-auto rounded-panel border backdrop-blur-md
            ${isFinal
              ? 'w-full border-warning/60 bg-warning/15 px-6 py-4 text-center'
              : 'border-haze/50 bg-abyss/80 px-5 py-3'}`}
        >
          <p
            className={`font-display font-black uppercase tracking-[0.14em]
              ${isFinal ? 'text-hero text-warning' : 'text-sm text-ink'}`}
          >
            {callout.headline}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
