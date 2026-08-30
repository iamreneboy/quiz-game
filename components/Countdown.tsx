'use client';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { msUntil } from '@/lib/serverTime';
import { DURATION, EASE } from '@/lib/presentation/tokens';

/**
 * The lights-out numeral, shared by the player surface (components/GameView.tsx)
 * and the broadcast surface (components/stage/StageBroadcast.tsx).
 *
 * One component rather than two: the copies this replaced were identical apart
 * from their wrapper, and each carried a comment saying so. The TV's scale
 * comes free from the [data-surface="stage"] token override (ADR-0035) —
 * `text-display` resolves differently inside that scope — so there is no
 * variant prop and no stage-only copy.
 *
 * The numeral is derived from the server deadline, so a client that opens or
 * reloads mid-countdown JOINS the count instead of restarting it. The pop is
 * keyed on the count, which means it replays once per number — that is the
 * point of it, and it is why this is not one of the mount-time-derivation
 * cases CURRENT.md warns about: there is no settled state to land in, only the
 * next number.
 *
 * aria-hidden: a screen reader ticking "three… two… one…" over the caller's
 * own status line is noise. The readable signal is the caller's.
 */
export default function Countdown({ endsAt }: { endsAt: string | null }) {
  const [n, setN] = useState(() => Math.max(1, Math.ceil(msUntil(endsAt) / 1000)));

  useEffect(() => {
    const id = setInterval(
      () => setN(Math.max(1, Math.ceil(msUntil(endsAt) / 1000))),
      100,
    );
    return () => clearInterval(id);
  }, [endsAt]);

  return (
    <motion.span
      key={n}
      data-testid="countdown"
      data-count={n}
      aria-hidden="true"
      initial={{ scale: 1.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: DURATION.beat / 1000, ease: EASE.settle }}
      className="block text-center font-display text-display font-black tabular-nums text-neon-cyan"
      style={{
        textShadow: '0 0 60px color-mix(in oklab, var(--color-neon-cyan) 55%, transparent)',
      }}
    >
      {n}
    </motion.span>
  );
}
