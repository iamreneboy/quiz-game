'use client';
import { useConnectionState } from '@/lib/usePresence';

/**
 * "Is this racer still here?" (PRD §9, M3 P3a).
 *
 * DOM, never canvas (cross-cutting constraint 2): the Pixi avatar is
 * deliberately untouched by this phase, so nothing readable about a drop
 * depends on the world rendering at all.
 *
 * Real text inside a live region, and never colour alone — a chip that said
 * "gone" only by turning an avatar grey would be invisible to a screen reader
 * and ambiguous to a colourblind viewer.
 *
 * Renders nothing at all for a connected player: this sits inside dense roster
 * rows, and a permanent "OK" badge on everyone would cost more than it says.
 */
export default function PlayerConnection({ playerId }: { playerId: string }) {
  const state = useConnectionState(playerId);
  if (state === 'connected') return null;

  const reconnecting = state === 'reconnecting';
  return (
    <span
      data-testid="connection-chip"
      data-state={state}
      role="status"
      aria-live="polite"
      className={
        'shrink-0 rounded-full px-1.5 py-0.5 font-display text-[10px] font-semibold ' +
        'uppercase tracking-[0.14em] ' +
        // `ink-dim`, not `ink-mute`: haze is the lightest ground the app paints
        // text on, and no ink-mute that still reads as muted clears AA there
        // (3.95:1 even after M3 P5b's lift). Every other chip on a haze ground
        // — DrawCard, QuestionCard, StageBroadcast — already uses ink-dim.
        (reconnecting ? 'bg-warning/15 text-warning' : 'bg-haze/40 text-ink-dim')
      }
    >
      {reconnecting ? 'Reconnecting…' : 'Dropped'}
    </span>
  );
}
