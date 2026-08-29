'use client';
import { useState } from 'react';
import { useGameStore } from '@/lib/store';
import type { HostDriver } from '@/lib/useHostDriver';
import Button from './ui/Button';

/**
 * The host's controls (PRD §4's host variant, M3 P0).
 *
 * Slim, fixed to the bottom, and OVER the player view rather than beside it:
 * the host is usually also racing, so this cannot cost the answer grid its
 * space. DOM, never canvas (cross-cutting constraint 2).
 *
 * `isHost` gates only what is drawn. Permission is the `host_key` check inside
 * each RPC (roadmap decision 2) — this component could be rendered for anyone
 * and every button would still fail server-side.
 */
export default function HostControlStrip({ driver }: { driver: HostDriver }) {
  const room = useGameStore(s => s.room);
  const [confirmingEnd, setConfirmingEnd] = useState(false);

  if (!room || room.status === 'lobby' || room.status === 'finished') return null;

  const paused = room.status === 'paused';
  // Skipping only makes sense while a question is in play. By TRACK the round
  // has already resolved; there is nothing left to discard.
  const canSkip = room.phase === 'read' || room.phase === 'answer' || room.phase === 'reveal';

  return (
    <div
      data-testid="host-strip"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-haze bg-abyss/90
        px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md"
    >
      {driver.error && (
        <p data-testid="host-strip-error" className="pb-2 text-center text-xs text-wrong">
          {driver.error}
        </p>
      )}

      {confirmingEnd ? (
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 flex-1 truncate text-xs text-ink-dim">
            End the race now and go to the results?
          </p>
          <Button
            data-testid="host-end-cancel"
            variant="ghost"
            onClick={() => setConfirmingEnd(false)}
          >
            Keep racing
          </Button>
          <Button
            data-testid="host-end-confirm"
            onClick={() => {
              setConfirmingEnd(false);
              void driver.end();
            }}
          >
            End race
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <Button
            data-testid={paused ? 'host-resume' : 'host-pause'}
            variant={paused ? 'primary' : 'ghost'}
            aria-pressed={paused}
            onClick={() => void (paused ? driver.resume() : driver.pause())}
          >
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button
            data-testid="host-skip"
            variant="ghost"
            disabled={!canSkip}
            onClick={() => void driver.skip()}
          >
            Skip question
          </Button>
          <Button
            data-testid="host-end"
            variant="quiet"
            onClick={() => setConfirmingEnd(true)}
          >
            End race
          </Button>
        </div>
      )}
    </div>
  );
}
