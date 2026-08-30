'use client';
import { motion } from 'motion/react';
import { useGameStore } from '@/lib/store';
import { avatarEmoji } from '@/lib/avatars';
import { joinUrl } from '@/lib/qr';
import { useOrigin } from '@/lib/useOrigin';
import { DURATION, EASE } from '@/lib/presentation/tokens';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import HudCorners from '@/components/ui/HudCorners';
import JoinQr from '@/components/host/JoinQr';
import PlayerConnection from '@/components/PlayerConnection';
import StageLink from '@/components/lobby/StageLink';

/**
 * The lobby's readable half (M2 P2 spec §7), on the P0 design system as of
 * M3 P5a — the last M1-era screen to cross over.
 *
 * The Pixi start line carries the formation; this strip carries the names, so
 * nothing readable depends on canvas (PRD §9). At lights-out the formation
 * rolls up to the line (lib/world/choreographer.ts's beginCountdownRollUp)
 * while this panel lifts away (app/room/[code]/page.tsx's stage seam).
 *
 * `Starting grid — {n} joined` and the start-button copy are asserted verbatim
 * in e2e/game-flow.spec.ts and e2e/world.spec.ts — do not reword them.
 */

const heading =
  'font-display text-[0.6875rem] font-semibold uppercase tracking-[0.28em] text-neon-cyan';

/**
 * Entrance only, no exit: leaving is the room page's job, because the lobby
 * hands off to the countdown rather than unmounting on its own. Replaying this
 * on a reload is CORRECT — a lobby has no beat position to land in, unlike
 * every `ends_at`-staged component CURRENT.md warns about.
 */
const rise = {
  hidden: { opacity: 0, y: 20 },
  show: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.settle / 1000, ease: EASE.settle, delay: index * 0.06 },
  }),
};

export default function LobbyView({
  code, isHost, onStart, startError,
}: { code: string; isHost: boolean; onStart: () => void; startError: string | null }) {
  const players = useGameStore(s => s.players);
  const playing = players.filter(p => p.is_playing);
  const origin = useOrigin();
  const join = origin ? joinUrl(origin, code) : null;

  return (
    <main className="relative mx-auto flex min-h-screen max-w-3xl flex-col justify-end gap-6 p-6">
      <motion.div custom={0} initial="hidden" animate="show" variants={rise}>
        <Panel className="relative flex items-center justify-center gap-6 p-6">
          <HudCorners />
          <div className="text-center">
            <p className="text-ink-dim">
              Join at <b className="text-ink">{origin ? new URL(origin).host : ''}</b> with code
            </p>
            <p className="font-display text-display font-black tracking-[0.2em] text-warning">
              {code}
            </p>
          </div>
          <JoinQr url={join} className="h-28 w-28" />
        </Panel>
      </motion.div>

      <motion.section custom={1} initial="hidden" animate="show" variants={rise}>
        <Panel className="p-4">
          <h2 className={`${heading} mb-3`}>Starting grid — {players.length} joined</h2>
          <ul data-testid="lobby-roster" className="flex flex-wrap gap-2">
            {players.map(p => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-full border border-haze/50
                  bg-night/60 py-1 pl-1 pr-3"
              >
                <span
                  className="grid h-7 w-7 place-items-center rounded-full text-base"
                  style={{ backgroundColor: `${p.color}33`, boxShadow: `inset 0 0 0 2px ${p.color}` }}
                  aria-hidden
                >
                  {avatarEmoji(p.avatar)}
                </span>
                <span className="text-sm font-semibold text-ink">{p.nickname}</span>
                {p.is_host && (
                  <span className="font-display text-xs font-bold uppercase tracking-[0.14em] text-warning">
                    {p.is_playing ? 'Host' : 'MC'}
                  </span>
                )}
                <PlayerConnection playerId={p.id} />
                {p.joined_late && (
                  <span
                    data-testid="late-badge"
                    className="shrink-0 rounded-full bg-neon-cyan/15 px-1.5 py-0.5
                      font-display text-[10px] font-semibold uppercase tracking-[0.14em]
                      text-neon-cyan"
                  >
                    Joined late
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      </motion.section>

      {isHost && (
        <motion.a
          custom={2}
          initial="hidden"
          animate="show"
          variants={rise}
          data-testid="lobby-review-link"
          href={`/host/${code}/review`}
          className="rounded-panel border border-haze/50 bg-night/55 p-4 text-center text-sm
            font-semibold text-ink-dim backdrop-blur-xl ease-snap duration-(--dur-cut)
            transition-[border-color,color]
            hover:border-neon-cyan hover:text-neon-cyan
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-cyan"
        >
          Review the draw — swap a question or add your own
        </motion.a>
      )}

      {isHost && (
        <motion.div custom={3} initial="hidden" animate="show" variants={rise}>
          <StageLink code={code} />
        </motion.div>
      )}

      {isHost ? (
        <motion.div custom={4} initial="hidden" animate="show" variants={rise} className="space-y-2">
          {startError && <p className="text-center text-wrong">{startError}</p>}
          <Button size="lg" className="w-full" onClick={onStart} disabled={playing.length < 2}>
            {playing.length < 2 ? 'Need at least 2 players' : 'Start the race'}
          </Button>
          <p className="text-center text-xs text-ink-dim">3+ players recommended</p>
        </motion.div>
      ) : (
        <motion.p
          custom={4}
          initial="hidden"
          animate="show"
          variants={rise}
          className="text-center text-ink-dim"
        >
          Waiting for the host to start…
        </motion.p>
      )}
    </main>
  );
}
