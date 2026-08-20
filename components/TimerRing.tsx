'use client';
import { useEffect, useRef, useState } from 'react';
import { msUntil } from '@/lib/serverTime';

export default function TimerRing({ endsAt, totalMs }: { endsAt: string | null; totalMs: number }) {
  const [remaining, setRemaining] = useState(() => msUntil(endsAt));
  const raf = useRef(0);

  useEffect(() => {
    const tick = () => {
      setRemaining(msUntil(endsAt));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [endsAt]);

  const frac = totalMs > 0 ? Math.max(0, Math.min(1, remaining / totalMs)) : 0;
  const R = 28;
  const C = 2 * Math.PI * R;
  const secs = Math.ceil(remaining / 1000);

  return (
    <div className="relative h-16 w-16">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={R} fill="none" stroke="#1e293b" strokeWidth="6" />
        <circle cx="32" cy="32" r={R} fill="none"
          stroke={frac < 0.25 ? '#fb7185' : '#fbbf24'} strokeWidth="6"
          strokeDasharray={C} strokeDashoffset={C * (1 - frac)} strokeLinecap="round" />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-xl font-black tabular-nums">{secs}</span>
    </div>
  );
}
