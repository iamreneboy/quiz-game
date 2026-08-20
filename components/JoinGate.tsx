'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { saveSession } from '@/lib/session';
import { AVATARS, COLORS } from '@/lib/avatars';

export default function JoinGate({ code, onJoined }: { code: string; onJoined: () => void }) {
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[1].key);
  const [color, setColor] = useState(COLORS[1]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true); setError(null);
    const { data, error: err } = await supabase.rpc('join_room', {
      p_code: code, p_nickname: nickname, p_avatar: avatar, p_color: color,
    });
    if (err) { setError(err.message); setBusy(false); return; }
    saveSession(code, { roomId: data.room_id, playerId: data.player_id, playerKey: data.player_key });
    onJoined();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-black">
        Joining room <span className="text-amber-400 tracking-widest">{code}</span>
      </h1>
      <input
        value={nickname} onChange={e => setNickname(e.target.value)} maxLength={20}
        placeholder="Your nickname"
        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
      />
      <div className="flex flex-wrap gap-2">
        {AVATARS.map(a => (
          <button key={a.key} onClick={() => setAvatar(a.key)} title={a.label}
            className={`h-12 w-12 rounded-xl text-2xl ${avatar === a.key ? 'bg-amber-400/20 ring-2 ring-amber-400' : 'bg-slate-900'}`}>
            {a.emoji}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        {COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)}
            className={`h-8 w-8 rounded-full ${color === c ? 'ring-2 ring-white' : ''}`}
            style={{ backgroundColor: c }} />
        ))}
      </div>
      {error && <p className="text-rose-400">{error}</p>}
      <button
        onClick={join}
        disabled={busy || nickname.trim().length < 1}
        className="w-full rounded-xl bg-amber-400 py-4 text-lg font-bold text-slate-950 disabled:opacity-40"
      >
        {busy ? 'Joining…' : 'Join game'}
      </button>
    </main>
  );
}
