'use client';
import { useState } from 'react';
import { motion } from 'motion/react';
import { supabase } from '@/lib/supabaseClient';
import { saveSession } from '@/lib/session';
import type { JoinResult } from '@/lib/types';
import { AVATARS, COLORS } from '@/lib/avatars';
import { DURATION, EASE } from '@/lib/presentation/tokens';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

/** HUD viewfinder corners — echoes the landing page's signature on the hero panel. */
function HudCorners() {
  const arm = 'pointer-events-none absolute h-4 w-4 border-neon-cyan/70';
  return (
    <>
      <span aria-hidden className={`${arm} -left-1.5 -top-1.5 border-l-2 border-t-2`} />
      <span aria-hidden className={`${arm} -right-1.5 -top-1.5 border-r-2 border-t-2`} />
      <span aria-hidden className={`${arm} -bottom-1.5 -left-1.5 border-b-2 border-l-2`} />
      <span aria-hidden className={`${arm} -bottom-1.5 -right-1.5 border-b-2 border-r-2`} />
    </>
  );
}

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
    const result = data as JoinResult;
    saveSession(code, {
      roomId: result.room_id, playerId: result.player_id, playerKey: result.player_key,
    });
    onJoined();
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.settle / 1000, ease: EASE.settle }}
      >
        <p className="font-display text-[0.6875rem] font-semibold uppercase tracking-[0.42em] text-neon-cyan">
          Starting grid
        </p>
        <h1 className="mt-3 font-display text-hero font-bold uppercase text-ink">
          Joining room{' '}
          <span className="text-neon-magenta tracking-[0.18em]">{code}</span>
        </h1>
      </motion.div>

      <motion.div
        className="relative"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.settle / 1000, ease: EASE.settle, delay: 0.08 }}
      >
        <Panel className="relative space-y-5 p-6">
          <HudCorners />
          <Input
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            maxLength={20}
            placeholder="Your nickname"
            aria-label="Your nickname"
          />

          <div className="flex flex-wrap gap-2">
            {AVATARS.map(a => (
              <button
                key={a.key}
                type="button"
                onClick={() => setAvatar(a.key)}
                title={a.label}
                aria-pressed={avatar === a.key}
                className={
                  'h-12 w-12 rounded-control text-2xl ease-snap duration-[var(--dur-cut)] transition-[background-color,box-shadow] ' +
                  (avatar === a.key
                    ? 'bg-neon-cyan/15 ring-2 ring-neon-cyan'
                    : 'bg-abyss/70 hover:bg-night')
                }
              >
                {a.emoji}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            {COLORS.map((c, i) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Racer colour ${i + 1}`}
                aria-pressed={color === c}
                className={`h-8 w-8 rounded-full ${color === c ? 'ring-2 ring-ink' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          {error && <p className="text-wrong">{error}</p>}

          <Button
            size="lg"
            className="w-full"
            onClick={join}
            disabled={busy || nickname.trim().length < 1}
          >
            {busy ? 'Joining…' : 'Join game'}
          </Button>
        </Panel>
      </motion.div>
    </main>
  );
}
