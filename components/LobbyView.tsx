'use client';
import { useGameStore } from '@/lib/store';
import { avatarEmoji } from '@/lib/avatars';

/**
 * The lobby's readable half (spec §7). The Pixi start line carries the
 * formation; this strip carries the names, so nothing readable depends on
 * canvas (PRD §9).
 *
 * `Starting grid — {n} joined` and the start-button copy are asserted verbatim
 * in e2e/game-flow.spec.ts and e2e/world.spec.ts — do not reword them.
 */
export default function LobbyView({
  code, isHost, onStart, startError,
}: { code: string; isHost: boolean; onStart: () => void; startError: string | null }) {
  const players = useGameStore(s => s.players);
  const playing = players.filter(p => p.is_playing);

  return (
    <main className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col justify-end gap-6 p-6">
      <header className="text-center">
        <p className="text-slate-400">
          Join at <b className="text-slate-200">{typeof window !== 'undefined' ? window.location.host : ''}</b> with code
        </p>
        <p className="text-6xl font-black tracking-[0.2em] text-amber-400">{code}</p>
      </header>

      <section className="rounded-2xl border border-white/10 bg-abyss/70 p-4 backdrop-blur-sm">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-slate-400">
          Starting grid — {players.length} joined
        </h2>
        <ul data-testid="lobby-roster" className="flex flex-wrap gap-2">
          {players.map(p => (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3"
            >
              <span
                className="grid h-7 w-7 place-items-center rounded-full text-base"
                style={{ backgroundColor: `${p.color}33`, boxShadow: `inset 0 0 0 2px ${p.color}` }}
                aria-hidden
              >
                {avatarEmoji(p.avatar)}
              </span>
              <span className="text-sm font-semibold">{p.nickname}</span>
              {p.is_host && (
                <span className="text-xs font-bold text-amber-400">{p.is_playing ? 'Host' : 'MC'}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {isHost ? (
        <div className="space-y-2">
          {startError && <p className="text-center text-rose-400">{startError}</p>}
          <button
            onClick={onStart}
            disabled={playing.length < 2}
            className="w-full rounded-xl bg-amber-400 py-4 text-lg font-bold text-slate-950 disabled:opacity-40"
          >
            {playing.length < 2 ? 'Need at least 2 players' : 'Start the race'}
          </button>
          <p className="text-center text-xs text-slate-500">3+ players recommended</p>
        </div>
      ) : (
        <p className="text-center text-slate-400">Waiting for the host to start…</p>
      )}
    </main>
  );
}
