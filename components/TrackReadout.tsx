'use client';
import { useGameStore } from '@/lib/store';
import { loadSession } from '@/lib/session';
import { avatarEmoji } from '@/lib/avatars';
import { useWorldView } from '@/lib/world/useWorldView';

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * The accessible half of the track (spec §8). Pixi draws the world; this
 * carries the standings as real text, so readability never depends on canvas
 * (PRD §9). Replaces the DOM track picture that was `components/Track.tsx`.
 */
export default function TrackReadout({ code }: { code: string }) {
  const room = useGameStore(s => s.room);
  const standings = useGameStore(s => s.standings);
  const offscreen = useWorldView(s => s.offscreenPlayerIds);
  const myId = typeof window !== 'undefined' ? loadSession(code)?.playerId : null;

  if (!room || !standings) return null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-end gap-4 p-6 pb-10">
      <h2 className="text-center text-sm font-bold uppercase tracking-widest text-ink-mute">
        The track — after Q{room.round}
      </h2>

      <ol className="rounded-panel border border-haze/40 bg-abyss/70 p-2 backdrop-blur-md">
        {standings.map((s, rank) => (
          <li
            key={s.player_id}
            className={`flex items-center gap-3 rounded-control px-3 py-2 ${
              s.player_id === myId ? 'bg-haze/25' : ''
            }`}
          >
            <span className="w-6 text-center text-sm font-bold tabular-nums text-ink-mute">
              {rank < 3 ? MEDALS[rank] : rank + 1}
            </span>
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg"
              style={{ backgroundColor: `${s.color}33`, boxShadow: `inset 0 0 0 2px ${s.color}` }}
            >
              {avatarEmoji(s.avatar)}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold text-ink">
              {s.nickname}
              {s.player_id === myId && <span className="ml-2 text-xs text-ink-mute">you</span>}
            </span>
            {offscreen.includes(s.player_id) && (
              <span
                className="whitespace-nowrap text-xs text-warning"
                title="Outside the current camera shot"
              >
                off screen
              </span>
            )}
            <span className="tabular-nums text-sm text-ink-dim">
              {s.correct}/{room.total_rounds}
            </span>
          </li>
        ))}
      </ol>
    </main>
  );
}
