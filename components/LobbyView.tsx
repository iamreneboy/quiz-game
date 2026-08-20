'use client';
import { useGameStore } from '@/lib/store';
import { avatarEmoji } from '@/lib/avatars';

export default function LobbyView({
  code, isHost, onStart, startError,
}: { code: string; isHost: boolean; onStart: () => void; startError: string | null }) {
  const players = useGameStore(s => s.players);
  const playing = players.filter(p => p.is_playing);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-6">
      <header className="text-center">
        <p className="text-slate-400">Join at <b className="text-slate-200">{typeof window !== 'undefined' ? window.location.host : ''}</b> with code</p>
        <p className="text-6xl font-black tracking-[0.2em] text-amber-400">{code}</p>
      </header>

      <section className="flex-1">
        <h2 className="mb-4 font-bold text-slate-300">
          Starting grid — {players.length} joined
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {players.map(p => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl bg-slate-900 p-3">
              <span className="grid h-10 w-10 place-items-center rounded-full text-xl"
                style={{ backgroundColor: `${p.color}33`, boxShadow: `inset 0 0 0 2px ${p.color}` }}>
                {avatarEmoji(p.avatar)}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{p.nickname}</p>
                {p.is_host && <p className="text-xs text-amber-400">{p.is_playing ? 'Host' : 'MC'}</p>}
              </div>
            </div>
          ))}
        </div>
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
