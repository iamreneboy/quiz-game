'use client';
import { useState } from 'react';
import { useGameStore } from '@/lib/store';
import type { HostDriver } from '@/lib/useHostDriver';
import Button from './ui/Button';
import Panel from './ui/Panel';

/**
 * Run it back (PRD §5.4.6) — host-only, on the results screen.
 *
 * Two steps, like the control strip's end-race confirm: a rematch destroys the
 * standings the room is looking at, and a mis-tap during a ceremony would be
 * unrecoverable. The second step is also where the ONE tweak lives that the
 * review step cannot reach — the answer timer. The question mix is tweaked
 * where it belongs, in `/host/[code]/review`, which is live again the moment
 * this lands the room back in the lobby.
 *
 * Deliberately OUTSIDE every staged wrapper, exactly like ResultsView's "Back
 * to home" link: staging never gates input (ADR-0016), and a control that is
 * focusable but invisible is worse than one that is simply there.
 *
 * `isHost` gates what is drawn; permission is the `host_key` check inside the
 * RPC (roadmap decision 2).
 */
export default function RematchCard({ driver }: { driver: HostDriver }) {
  const room = useGameStore(s => s.room);
  const [open, setOpen] = useState(false);
  const [timer, setTimer] = useState<number | null>(null);

  if (!driver.isHost || !room) return null;

  const seconds = timer ?? room.timer_seconds;

  if (!open) {
    return (
      <div className="flex flex-col items-center gap-2">
        {driver.error && (
          <p data-testid="rematch-error" className="text-center text-sm text-wrong">
            {driver.error}
          </p>
        )}
        <Button data-testid="rematch" variant="ghost" onClick={() => setOpen(true)}>
          Rematch
        </Button>
      </div>
    );
  }

  return (
    <Panel className="space-y-4 p-5">
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink-mute">
          Run it back
        </h2>
        <p className="mt-1 text-sm text-ink-dim">
          Same racers, same room code, a fresh draw with none of the questions
          you have already played. Swap or add questions in the lobby.
        </p>
      </div>

      <label className="flex items-center justify-between gap-4 rounded-control border border-haze/40 bg-abyss/60 px-4 py-3">
        <span className="font-semibold text-ink">Answer timer: {seconds}s</span>
        <input
          data-testid="rematch-timer"
          type="range"
          min={5}
          max={20}
          value={seconds}
          aria-label="Answer timer seconds"
          onChange={e => setTimer(+e.target.value)}
          className="accent-neon-cyan"
        />
      </label>

      {driver.error && (
        <p data-testid="rematch-error" className="text-center text-sm text-wrong">
          {driver.error}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        <Button data-testid="rematch-cancel" variant="quiet" onClick={() => setOpen(false)}>
          Not now
        </Button>
        <Button data-testid="rematch-confirm" onClick={() => void driver.rematch(seconds)}>
          Start a new race
        </Button>
      </div>
    </Panel>
  );
}
