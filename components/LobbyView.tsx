'use client';
import { useState } from 'react';
import { useGameStore } from '@/lib/store';
import { avatarEmoji } from '@/lib/avatars';
import { joinUrl } from '@/lib/qr';
import { useOrigin } from '@/lib/useOrigin';
import JoinQr from '@/components/host/JoinQr';
import PlayerConnection from '@/components/PlayerConnection';

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
  const origin = useOrigin();
  const join = origin ? joinUrl(origin, code) : null;

  return (
    <main className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col justify-end gap-6 p-6">
      <header className="flex items-center justify-center gap-6">
        <div className="text-center">
          <p className="text-slate-400">
            Join at <b className="text-slate-200">{origin ? new URL(origin).host : ''}</b> with code
          </p>
          <p className="text-6xl font-black tracking-[0.2em] text-amber-400">{code}</p>
        </div>
        <JoinQr url={join} className="h-28 w-28" />
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
              <PlayerConnection playerId={p.id} />
            </li>
          ))}
        </ul>
      </section>

      {isHost && (
        <a
          data-testid="lobby-review-link"
          href={`/host/${code}/review`}
          className="rounded-2xl border border-white/10 bg-abyss/70 p-4 text-center text-sm
            font-semibold text-slate-300 hover:border-amber-400/60 hover:text-amber-400
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
        >
          Review the draw — swap a question or add your own
        </a>
      )}

      {isHost && <StageLink code={code} />}

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

/**
 * The way into the broadcast screen (PRD §1: a room hands out a join link, a
 * QR and a stage link).
 *
 * Host-only: a player tapping this on their phone would replace their own game
 * with a spectator view of it. The anchor carries a real href so it can be
 * copied, opened in a new tab, or dragged onto a second display — a button
 * that only calls `window.open` can do none of those.
 */
function StageLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/stage/${code}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied outright (insecure origin, permission
      // policy). The URL is on screen either way, so this is a silent no-op
      // rather than an error the host can do anything about.
    }
  }

  return (
    <section className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-abyss/70 p-4">
      <div className="min-w-0">
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">Stage view</h2>
        <p className="truncate text-sm text-slate-300">{url}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-slate-200"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <a
          data-testid="stage-link"
          href={`/stage/${code}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-bold text-slate-950"
        >
          Open
        </a>
      </div>
    </section>
  );
}
