'use client';
import { useStaging } from '@/lib/staging/useStaging';

/**
 * The ANSWER countdown (spec §5).
 *
 * One clock (spec decision 7): the sweep comes from `--timer-frac`, written by
 * the staging ticker, and the numeral from the store's whole-second value.
 * This component runs no rAF loop of its own — two clocks on one beat is how
 * the ring and the vignette drift apart.
 */
const R = 30;
const C = 2 * Math.PI * R; // 188.5

export default function TimerRing() {
  const secondsLeft = useStaging(s => s.secondsLeft);
  const step = useStaging(s => s.tensionStep);
  if (secondsLeft === null) return null;

  const hot = step >= 2;
  const stroke = hot ? 'var(--color-wrong)' : 'var(--color-warning)';

  return (
    <div className={`relative h-18.5 w-18.5 ${step >= 3 ? 'animate-pulse' : ''}`}>
      <svg viewBox="0 0 74 74" className="h-18.5 w-18.5 -rotate-90" aria-hidden="true">
        <circle cx="37" cy="37" r={R} fill="none" stroke="var(--color-dusk)" strokeWidth="7" />
        <circle
          cx="37" cy="37" r={R} fill="none"
          stroke={stroke} strokeWidth={hot ? 9 : 7} strokeLinecap="round"
          strokeDasharray={C}
          className="transition-[stroke,stroke-width] duration-(--dur-beat) ease-snap"
          style={{ strokeDashoffset: `calc(${C.toFixed(1)}px * (1 - var(--timer-frac, 0)))` }}
        />
      </svg>
      <span
        role="timer"
        aria-live="off"
        className="absolute inset-0 grid place-items-center font-display text-2xl font-black tabular-nums"
        style={{ color: stroke }}
      >
        {secondsLeft}
      </span>
    </div>
  );
}
