'use client';
import { useGameStore } from '@/lib/store';
import { loadSession } from '@/lib/session';
import { avatarEmoji } from '@/lib/avatars';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Track({ code }: { code: string }) {
  const room = useGameStore(s => s.room);
  const standings = useGameStore(s => s.standings);
  const myId = typeof window !== 'undefined' ? loadSession(code)?.playerId : null;

  if (!room || !standings) return null;
  const total = room.total_rounds;

  // Group players by segment (correct count), keep standings order within a segment.
  const bySegment = new Map<number, typeof standings>();
  for (const s of standings) {
    const seg = Math.min(s.correct, total);
    if (!bySegment.has(seg)) bySegment.set(seg, []);
    bySegment.get(seg)!.push(s);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-6 p-6">
      <h2 className="text-center text-sm font-bold uppercase tracking-widest text-slate-500">
        The track — after Q{room.round}
      </h2>

      <div className="relative w-full overflow-x-auto rounded-2xl bg-slate-900 p-4">
        <div className="relative" style={{ minWidth: `${(total + 1) * 72}px`, minHeight: '220px' }}>
          {/* segment lines */}
          {Array.from({ length: total + 1 }, (_, i) => (
            <div key={i} className="absolute top-0 bottom-0 border-l border-dashed border-slate-700"
              style={{ left: `${(i / total) * 100}%` }}>
              <span className="absolute -top-1 left-1 text-xs text-slate-600 tabular-nums">
                {i === total ? '🏁' : i}
              </span>
            </div>
          ))}
          {/* avatars */}
          {standings.map(s => {
            const seg = Math.min(s.correct, total);
            const stack = bySegment.get(seg)!;
            const idx = stack.findIndex(x => x.player_id === s.player_id);
            const rank = standings.findIndex(x => x.player_id === s.player_id);
            return (
              <div key={s.player_id}
                className="absolute flex items-center gap-1 transition-all duration-1000 ease-out"
                style={{ left: `calc(${(seg / total) * 100}% + 6px)`, top: `${24 + idx * 44}px` }}>
                <span
                  className={`grid h-9 w-9 place-items-center rounded-full text-lg ${s.player_id === myId ? 'ring-2 ring-white' : ''}`}
                  style={{ backgroundColor: `${s.color}33`, boxShadow: `inset 0 0 0 2px ${s.color}` }}>
                  {avatarEmoji(s.avatar)}
                </span>
                <span className="max-w-24 truncate text-xs font-semibold">
                  {rank < 3 && <span className="mr-0.5">{MEDALS[rank]}</span>}
                  {s.nickname}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-center text-sm text-slate-400">
        {standings[0] && <>Leader: <b className="text-slate-200">{standings[0].nickname}</b> · {standings[0].correct}/{total} correct</>}
      </div>
    </main>
  );
}
