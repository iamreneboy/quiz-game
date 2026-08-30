'use client';
import { useGameStore } from '@/lib/store';
import { isHostAbsent, isPaused } from '@/lib/pause';

/**
 * Why the show stopped (M3 P0, extended in M3 P3b).
 *
 * TWO STORIES, ONE CARD. A deliberate pause is reassuring — somebody is in
 * control and will be back in a moment. An absence pause is not the same
 * message at all, and a room told the wrong one either panics for no reason or
 * waits patiently for a host who is never coming back.
 *
 * The same component on all three surfaces. The stage view is read-only but
 * must still say why nothing is happening, and rendering it inside
 * `[data-surface="stage"]` rescales it for a television with no variant prop —
 * every size here resolves through a theme variable that scope overrides
 * (ADR-0035).
 *
 * Read-only everywhere, host included: the controls live on the strip, so there
 * is exactly one place a command can be issued from. The absence variant offers
 * no button on purpose — there is nothing a player could usefully press, and
 * the room recovers by itself the moment the host's tab comes back
 * (lib/useHostPresenceReporter.ts) or ends itself after five minutes
 * (`sweep_host_absence`).
 */
export default function PauseCard() {
  const room = useGameStore(s => s.room);
  if (!isPaused(room)) return null;

  const absent = isHostAbsent(room);

  return (
    <div
      data-testid="pause-card"
      data-reason={absent ? 'absence' : 'host'}
      className="pointer-events-auto fixed inset-0 z-20 grid place-items-center
        bg-void/70 p-6 backdrop-blur-sm"
    >
      <div
        role="status"
        aria-live="polite"
        className="max-w-md rounded-panel border border-haze bg-night/80 px-8 py-7 text-center"
      >
        <p className="font-display text-[0.6875rem] font-semibold uppercase tracking-[0.28em] text-warning">
          {absent ? 'Signal lost' : 'Race suspended'}
        </p>
        <p className="mt-2 font-display text-hero font-black text-ink">
          {absent ? 'Host disconnected' : 'Paused'}
        </p>
        <p className="mt-3 text-sm text-ink-dim">
          {absent
            ? 'We’ve lost the host. The race is held exactly where it stopped and picks up the moment they’re back.'
            : 'The host stopped the clock. Nothing is lost — the question resumes exactly where it left off.'}
        </p>
      </div>
    </div>
  );
}
