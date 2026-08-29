'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { supabase } from '@/lib/supabaseClient';
import { saveSession } from '@/lib/session';
import { CATEGORIES, TIER_NAMES, estimateDurationSeconds } from '@/lib/rank';
import { AVATARS, COLORS } from '@/lib/avatars';
import { DURATION, EASE } from '@/lib/presentation/tokens';
import type { Tier } from '@/lib/types';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

const sectionMotion = (index: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DURATION.settle / 1000, ease: EASE.settle, delay: index * 0.06 },
});

const sectionHeading =
  'font-display text-[0.6875rem] font-semibold uppercase tracking-[0.28em] text-neon-cyan';

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

export default function HostSetup() {
  const router = useRouter();
  const [cats, setCats] = useState<string[]>(CATEGORIES.map(c => c.key));
  const [counts, setCounts] = useState<[number, number, number, number]>([4, 4, 3, 1]);
  const [timer, setTimer] = useState(10);
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0].key);
  const [color, setColor] = useState(COLORS[0]);
  const [playing, setPlaying] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = counts.reduce((a, b) => a + b, 0);
  const mins = Math.round(estimateDurationSeconds(total, timer) / 60);

  const toggleCat = (key: string) =>
    setCats(c => (c.includes(key) ? c.filter(k => k !== key) : [...c, key]));

  const bump = (i: number, d: number) =>
    setCounts(c => {
      const n = [...c] as typeof c;
      n[i] = Math.max(0, Math.min(10, n[i] + d));
      return n;
    });

  async function create() {
    setBusy(true); setError(null);
    const { data: room, error: e1 } = await supabase.rpc('create_room', {
      p_timer_seconds: timer, p_categories: cats, p_tier_counts: counts,
    });
    if (e1) { setError(e1.message); setBusy(false); return; }
    const { data: joined, error: e2 } = await supabase.rpc('join_room', {
      p_code: room.code, p_nickname: nickname, p_avatar: avatar, p_color: color,
      p_host_key: room.host_key, p_is_playing: playing,
    });
    if (e2) { setError(e2.message); setBusy(false); return; }
    saveSession(room.code, {
      roomId: room.room_id, playerId: joined.player_id,
      playerKey: joined.player_key, hostKey: room.host_key,
    });
    router.push(`/host/${room.code}/review`);
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <motion.header {...sectionMotion(0)} className="relative">
        <p className={sectionHeading}>Race control</p>
        <h1 className="mt-2 font-display text-hero font-bold uppercase text-ink">New game</h1>
      </motion.header>

      <motion.section {...sectionMotion(1)} className="relative">
        <Panel className="relative space-y-4 p-6">
          <HudCorners />
          <h2 className={sectionHeading}>Categories</h2>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => {
              const on = cats.includes(c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleCat(c.key)}
                  className={
                    'rounded-full border px-4 py-2 text-sm font-semibold ease-snap duration-[var(--dur-cut)] ' +
                    'transition-[background-color,border-color,color] ' +
                    (on
                      ? 'border-neon-cyan bg-neon-cyan/10 text-neon-cyan'
                      : 'border-haze/70 text-ink-mute hover:border-haze hover:text-ink-dim')
                  }
                >
                  {c.emoji} {c.label}
                </button>
              );
            })}
          </div>
        </Panel>
      </motion.section>

      <motion.section {...sectionMotion(2)}>
        <Panel className="space-y-3 p-6">
          <h2 className={sectionHeading}>Question mix</h2>

          {([1, 2, 3, 4] as Tier[]).map((tier, i) => (
            <div
              key={tier}
              className="flex items-center justify-between rounded-control border border-haze/40 bg-abyss/60 px-4 py-3"
            >
              <span className="font-semibold text-ink">{TIER_NAMES[tier]}</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => bump(i, -1)}
                  className="h-8 w-8 rounded-lg border border-haze/70 font-bold text-ink-dim hover:border-neon-cyan hover:text-neon-cyan"
                >
                  −
                </button>
                <span className="w-6 text-center font-display font-bold tabular-nums text-ink">{counts[i]}</span>
                <button
                  type="button"
                  onClick={() => bump(i, +1)}
                  className="h-8 w-8 rounded-lg border border-haze/70 font-bold text-ink-dim hover:border-neon-cyan hover:text-neon-cyan"
                >
                  +
                </button>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between rounded-control border border-haze/40 bg-abyss/60 px-4 py-3">
            <span className="font-semibold text-ink">Answer timer: {timer}s</span>
            <input
              type="range"
              min={5}
              max={20}
              value={timer}
              aria-label="Answer timer seconds"
              onChange={e => setTimer(+e.target.value)}
              className="accent-neon-cyan"
            />
          </div>

          <p className="text-sm text-ink-dim">
            {total} questions · about {mins} min
          </p>
        </Panel>
      </motion.section>

      <motion.section {...sectionMotion(3)}>
        <Panel className="space-y-4 p-6">
          <h2 className={sectionHeading}>You</h2>

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

          <label className="flex items-center gap-2 text-sm text-ink-dim">
            <input
              type="checkbox"
              checked={playing}
              onChange={e => setPlaying(e.target.checked)}
              className="accent-neon-cyan"
            />
            I&apos;m playing too (uncheck to MC only)
          </label>
        </Panel>
      </motion.section>

      {error && <p className="text-wrong">{error}</p>}

      <Button
        size="lg"
        className="w-full"
        onClick={create}
        disabled={busy || total < 1 || cats.length < 1 || nickname.trim().length < 1}
      >
        {busy ? 'Creating…' : 'Create room'}
      </Button>
    </main>
  );
}
