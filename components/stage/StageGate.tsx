'use client';
import { useState } from 'react';

/**
 * The one tap a broadcast screen gets (spec decision 6).
 *
 * Browsers refuse to start audio until a user gesture, and a chrome-free TV
 * screen never receives one — so without this the whole show is silent. It
 * needs NO audio API: lib/audio/runtime.ts already registers
 * `document.addEventListener('pointerdown', unlock, { once: true })`, so any
 * tap satisfies the policy on its way past.
 *
 * Opaque, and covers the show until tapped. That is deliberate: a screen with
 * no sound and no explanation is a worse failure than one asking to be
 * started. The runtimes mount and run behind it regardless, so dismissing it
 * at round 4 lands at round 4's true position rather than replaying from the
 * top — every beat's position comes from the server's `ends_at` (ADR-0014),
 * never from how long a component has been mounted.
 */
export default function StageGate({ code }: { code: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <button
      type="button"
      data-testid="stage-gate"
      onClick={() => setDismissed(true)}
      className="fixed inset-0 z-50 grid w-full place-items-center bg-void/95 backdrop-blur-sm
        focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-neon-cyan"
    >
      <span className="flex flex-col items-center gap-6">
        <span className="font-display text-[0.6875rem] font-semibold uppercase tracking-[0.28em] text-neon-cyan">
          Circuit Break Broadcast
        </span>
        <span className="font-display text-display font-black tracking-[0.2em] text-ink">
          {code}
        </span>
        <span className="font-display text-hero font-black uppercase tracking-[0.14em] text-warning">
          Tap to start the show
        </span>
        <span className="text-sm text-ink-mute">Sound starts with your first tap.</span>
      </span>
    </button>
  );
}
