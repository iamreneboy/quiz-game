'use client';
import { useGameStore } from '@/lib/store';
import { loadSession } from '@/lib/session';
import { avatarEmoji } from '@/lib/avatars';
import { useWorldView } from '@/lib/world/useWorldView';
import { useStaging } from '@/lib/staging/useStaging';
import LowerThird from './LowerThird';
import PlayerConnection from './PlayerConnection';

const MEDALS = ['🥇', '🥈', '🥉'];
const OFFSCREEN_ARROW = { left: '◀', right: '▶', top: '▲', bottom: '▼' } as const;

/**
 * The accessible half of the track (spec §8). Pixi draws the world; this
 * carries the standings as real text, so readability never depends on canvas
 * (PRD §9). Replaces the DOM track picture that was `components/Track.tsx`.
 */
export default function TrackReadout({ code }: { code: string }) {
  const room = useGameStore(s => s.room);
  const standings = useGameStore(s => s.standings);
  // The rail is built from standings, which carry no `joined_late` — the mark
  // is a property of the PLAYER, so it is looked up in the roster.
  const players = useGameStore(s => s.players);
  const offscreen = useWorldView(s => s.offscreenPlayerIds);
  const myId = typeof window !== 'undefined' ? loadSession(code)?.playerId : null;
  const deltas = useStaging(s => s.deltas);

  if (!room || !standings) return null;

  return (
    <div className="space-y-3">
      <LowerThird />

      <div className="rounded-panel border border-haze/40 bg-abyss/75 p-2 backdrop-blur-md">
        <h2 className="px-2 pb-1 text-center text-[11px] font-bold uppercase tracking-widest text-ink-mute">
          The track — after Q{room.round}
        </h2>

        <ol className="flex gap-2 overflow-x-auto sm:justify-center">
          {standings.map((s, rank) => {
            const gained = deltas.find(d => d.playerId === s.player_id)?.placesGained ?? 0;
            const off = offscreen.find(o => o.playerId === s.player_id);
            return (
              <li
                key={s.player_id}
                data-testid="rail-entry"
                className={`flex shrink-0 items-center gap-2 rounded-control px-2 py-1.5 ${
                  s.player_id === myId ? 'bg-haze/25' : ''
                }`}
              >
                <span className="text-sm font-bold tabular-nums text-ink-mute">
                  {rank < 3 ? MEDALS[rank] : rank + 1}
                </span>
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-base"
                  style={{ backgroundColor: `${s.color}33`, boxShadow: `inset 0 0 0 2px ${s.color}` }}
                >
                  {avatarEmoji(s.avatar)}
                </span>
                <span className="max-w-24 truncate text-sm font-semibold text-ink">{s.nickname}</span>
                <span className="tabular-nums text-sm text-ink-dim">{s.correct}</span>
                {gained > 0 && (
                  <span className="text-xs font-bold text-correct" title={`Gained ${gained}`}>
                    ▲{gained}
                  </span>
                )}
                {s.current_streak >= 3 && (
                  <span className="text-xs font-bold text-warning" title={`${s.current_streak} in a row`}>
                    🔥×{s.current_streak}
                  </span>
                )}
                {off && (
                  <span
                    className="text-xs text-warning"
                    title={`Outside the current camera shot (${off.direction})`}
                  >
                    {OFFSCREEN_ARROW[off.direction]}
                  </span>
                )}
                <PlayerConnection playerId={s.player_id} />
                {players.find(p => p.id === s.player_id)?.joined_late && (
                  <span
                    data-testid="late-badge"
                    className="shrink-0 text-xs font-bold text-neon-cyan"
                    title="Joined after the race started"
                  >
                    late
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
