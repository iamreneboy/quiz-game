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
      /*
        Takes exactly the width PixiStage is NOT showing, so the board can
        never overlap the podium (ADR-0015: the split is published once and
        consumed, never re-derived). The 100% fallback is what a client with
        no canvas at all gets — the full width, and the whole board
        immediately, the same intent the old 0px height fallback had.
      */
      <div
        data-testid="stage-broadcast"
        data-beat={beat}
        data-surface="stage"
        className="fixed inset-y-0 right-0 z-10 overflow-y-auto p-[5%]
          transition-[width] duration-(--dur-settle) ease-settle"
        style={{ width: 'calc(100% - var(--ceremony-panel, 100%))' }}
      >
        <StageResults />
      </div>
    );
  }

  return (
    <div
      data-testid="stage-broadcast"
      data-beat={beat}
      data-surface="stage"
      className="pointer-events-none fixed inset-0 z-10 p-[5%]"
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

      {/*
        The prompt sits high under the status bar rather than stacked above the
        answers, so the pack stays visible through the whole beat. On a phone
        the world is a strip behind a card; here it IS the backdrop.
      */}
      <div className="mt-[4cqh] flex flex-col items-center gap-6">
        {beat === 'idle' && room?.status === 'lobby' && <StageJoinPanel code={code} />}
        {beat === 'countdown' && <StageCountdown endsAt={room?.ends_at ?? null} />}
        {question && (beat === 'read' || beat === 'answer' || beat === 'reveal') && (
          <StageQuestion question={question} steps={steps} />
        )}
      </div>

      {/*
        Pinned to the world's ground line (--horizon-fraction mirrors
        HORIZON_FRACTION), translated up so the strip SITS on the horizon
        rather than straddling it.
      */}
      <div
        data-testid="stage-horizon"
        className="absolute inset-x-0 -translate-y-full"
        style={{ top: `calc(100% * var(--horizon-fraction))` }}
      >
        <LowerThird variant="strip" />
      </div>

      {/*
        The floor. Anchored to its BOTTOM edge and ordered reveal-panel-first,
        so the answer columns stay put and the panel grows the floor upward
        into empty backdrop. The other order pushed the columns up by the
        panel's own height at the reveal, which ADR-0019 forbids — the e2e
        suite measures exactly that. StageOptions reserves its own height for
        the same reason.
      */}
      <div
        data-testid="stage-floor"
        className="absolute inset-x-[5%] bottom-[5%] flex flex-col gap-4"
      >
        {question && (beat === 'read' || beat === 'answer' || beat === 'reveal') && (
          <>
            {beat === 'reveal' && reveal && (
              <RevealPanel reveal={reveal} question={question} steps={revealSteps} />
            )}
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
          </>
        )}
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
