'use client';
import { useGameStore } from '@/lib/store';
import { isPaused } from '@/lib/pause';

/**
 * Why the show stopped (M3 P0).
 *
 * The same component on all three surfaces. The stage view is read-only but
 * must still say why nothing is happening, and rendering it inside
 * `[data-surface="stage"]` rescales it for a television with no variant prop —
 * every size here resolves through a theme variable that scope overrides
 * (ADR-0035).
 *
 * Read-only everywhere, host included: the controls live on the strip, so
 * there is exactly one place a command can be issued from.
 */
export default function PauseCard() {
  const room = useGameStore(s => s.room);
  if (!isPaused(room)) return null;

  return (
    <div
      data-testid="pause-card"
      className="pointer-events-auto fixed inset-0 z-20 grid place-items-center
        bg-void/70 p-6 backdrop-blur-sm"
    >
      <div
        role="status"
        aria-live="polite"
        className="max-w-md rounded-panel border border-haze bg-night/80 px-8 py-7 text-center"
      >
        <p className="font-display text-[0.6875rem] font-semibold uppercase tracking-[0.28em] text-warning">
          Race suspended
        </p>
        <p className="mt-2 font-display text-hero font-black text-ink">Paused</p>
        <p className="mt-3 text-sm text-ink-dim">
          The host stopped the clock. Nothing is lost — the question resumes
          exactly where it left off.
        </p>
      </div>
    </div>
  );
}
