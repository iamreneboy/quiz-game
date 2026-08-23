'use client';
import Link from 'next/link';
import { useGameStore } from '@/lib/store';
import { loadSession } from '@/lib/session';
import { avatarEmoji } from '@/lib/avatars';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function ResultsView({ code }: { code: string }) {
  const room = useGameStore(s => s.room);
  const standings = useGameStore(s => s.standings);
  const myId = typeof window !== 'undefined' ? loadSession(code)?.playerId : null;
  if (!room || !standings || standings.length === 0) return null;
  const winner = standings[0];

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      {/*
        Reserves exactly the height PixiStage is showing, so the board can
        never overlap the podium. The 0px fallback is what a client with no
        canvas at all gets — the full board, immediately.
        P5b replaces everything below this spacer.
      */}
      <div
        aria-hidden="true"
        className="shrink-0 transition-[height] duration-(--dur-settle) ease-settle"
        style={{ height: 'var(--ceremony-band, 0px)' }}
      />
      <header className="text-center">
        <p className="text-sm font-bold uppercase tracking-widest text-slate-500">Race complete</p>
        <p className="mt-2 text-4xl font-black">
          🏆 <span style={{ color: winner.color }}>{winner.nickname}</span> wins!
        </p>
        <p className="mt-1 text-slate-400">
          {winner.correct}/{room.total_rounds} correct
        </p>
      </header>

      <table className="w-full text-left">
        <thead className="text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="pb-2">#</th><th className="pb-2">Player</th>
            <th className="pb-2 text-right">Correct</th>
            <th className="pb-2 text-right">Speed</th>
            <th className="pb-2 text-right">Best streak</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => (
            <tr key={s.player_id}
              className={`border-t border-slate-800 ${s.player_id === myId ? 'bg-slate-900' : ''}`}>
              <td className="py-3 font-bold tabular-nums">{MEDALS[i] ?? i + 1}</td>
              <td className="py-3">
                <span className="mr-2">{avatarEmoji(s.avatar)}</span>
                <span className="font-semibold">{s.nickname}</span>
              </td>
              <td className="py-3 text-right font-bold tabular-nums">{s.correct}</td>
              <td className="py-3 text-right tabular-nums text-slate-400">{s.speed_points}</td>
              <td className="py-3 text-right tabular-nums text-slate-400">{s.longest_streak}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Link href="/" className="text-center font-bold text-amber-400 hover:underline">
        Back to home
      </Link>
    </main>
  );
}
