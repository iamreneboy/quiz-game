'use client';
import { useEffect, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { useGameStore } from '@/lib/store';
import { useStaging } from '@/lib/staging/useStaging';
import { msUntil } from '@/lib/serverTime';
import { CATEGORIES, TIER_NAMES } from '@/lib/rank';
import { distributionRows } from '@/lib/staging/distribution';
import LowerThird from '@/components/LowerThird';
import TimerRing from '@/components/TimerRing';
import RevealPanel from '@/components/RevealPanel';
import StageJoinPanel from './StageJoinPanel';
import StageOptions from './StageOptions';
import StageQuestion from './StageQuestion';
import StageResults from './StageResults';

/**
 * The broadcast shell (spec §6) — the stage view's answer to StageShell.
 *
 * A separate file rather than a variant of StageShell, whose whole job is a
 * portrait-first grid that reserves the player view's 28vh canvas strip. Here
 * the canvas is full bleed at every phase and these regions sit OVER it:
 * a status bar along the top, the broadcast band across the lower third, and
 * the lower-third callout slot beneath it.
 *
 * `data-beat` is the stable hook the e2e suite keys on — assert on it, never
 * on copy.
 */
export default function StageBroadcast({ code }: { code: string }) {
  const beat = useStaging(s => s.beat);
  const room = useGameStore(s => s.room);
  const question = useGameStore(s => s.question);
  const reveal = useGameStore(s => s.reveal);
  const standings = useGameStore(s => s.standings);
  const steps = useStaging(s => s.steps);
  const revealSteps = useStaging(s => s.reveal);
  const cat = question ? CATEGORIES.find(c => c.key === question.category) : undefined;

  /**
   * `myId` is null: there is no local player on a broadcast screen, so no face
   * in a stack ever carries the "you are here" ring (spec §4).
   */
  const rows =
    reveal && question ? distributionRows(question.options, reveal, standings ?? [], null) : undefined;

  if (beat === 'results') {
    return (
      <div
        data-testid="stage-broadcast"
        data-beat={beat}
        className="fixed inset-0 z-10 overflow-y-auto p-8"
      >
        {/*
          Reserves exactly the height PixiStage is showing, so the board can
          never overlap the podium (ADR-0015: the band is published once and
          consumed, never re-derived). The 0px fallback is what a client with
          no canvas at all gets — the full board, immediately.
        */}
        <div
          aria-hidden="true"
          className="transition-[height] duration-(--dur-settle) ease-settle"
          style={{ height: 'var(--ceremony-band, 0px)' }}
        />
        <StageResults />
      </div>
    );
  }

  return (
    <div
      data-testid="stage-broadcast"
      data-beat={beat}
      className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-8"
    >
      <header className="flex items-start justify-between gap-6">
        <div className="flex items-center gap-3 font-display text-sm font-bold uppercase tracking-[0.14em]">
          {room && room.status !== 'lobby' && (
            <span className="text-ink-mute tabular-nums">
              Round {room.round}/{room.total_rounds}
            </span>
          )}
          {cat && (
            <span className="rounded-full border border-white/10 bg-haze/45 px-3 py-1.5 text-ink-dim">
              {cat.emoji} {cat.label}
            </span>
          )}
          {question && (
            <span className="rounded-full border border-warning/35 bg-warning/10 px-3 py-1.5 text-warning">
              {TIER_NAMES[question.tier]}
            </span>
          )}
        </div>
        {beat === 'answer' && <TimerRing />}
      </header>

      <div data-testid="stage-band" className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {beat === 'idle' && room?.status === 'lobby' && <StageJoinPanel code={code} />}
        {beat === 'countdown' && <StageCountdown endsAt={room?.ends_at ?? null} />}

        {question && (beat === 'read' || beat === 'answer' || beat === 'reveal') && (
          <>
            <StageQuestion question={question} steps={steps} />
            <AnimatePresence initial={false}>
              {steps.options && (
                <StageOptions
                  key="stage-options"
                  options={question.options}
                  mode={steps.optionsMode}
                  rows={rows}
                  revealSteps={revealSteps}
                />
              )}
            </AnimatePresence>
            {beat === 'reveal' && reveal && (
              <RevealPanel reveal={reveal} question={question} steps={revealSteps} />
            )}
          </>
        )}

        {/* Task 6 fills lobby. Task 7 fills track / results. */}
        <LowerThird />
      </div>
    </div>
  );
}

/**
 * The countdown at TV scale. Same one-interval shape as GameView's Countdown
 * (components/GameView.tsx) — the numeral comes from the server deadline, so
 * a stage view that opens mid-countdown joins it rather than restarting it.
 */
function StageCountdown({ endsAt }: { endsAt: string | null }) {
  const [n, setN] = useState(3);
  useEffect(() => {
    const id = setInterval(() => setN(Math.max(1, Math.ceil(msUntil(endsAt) / 1000))), 100);
    return () => clearInterval(id);
  }, [endsAt]);
  return (
    <p
      className="text-center font-display text-display font-black text-neon-cyan tabular-nums"
      style={{ textShadow: '0 0 60px color-mix(in oklab, var(--color-neon-cyan) 55%, transparent)' }}
    >
      {n}
    </p>
  );
}
