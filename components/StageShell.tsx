'use client';
import { AnimatePresence } from 'motion/react';
import { useStaging } from '@/lib/staging/useStaging';

/**
 * The persistent question surface (spec §7).
 *
 * Regions live here for the whole of READ → ANSWER → REVEAL so a beat change
 * animates its contents instead of unmounting the page. `data-beat` is the
 * stable hook the e2e suite keys on — assert on it, not on copy.
 *
 * In portrait the Pixi strip owns the top 28vh (components/PixiStage.tsx:10)
 * and this grid owns the rest: question centred in its own band, options
 * pinned toward the thumb. The offset is 28vh, matching the strip the canvas
 * actually draws — GameView's old `pt-[30vh]` was never aligned to it.
 *
 * The options slot is wrapped in `AnimatePresence initial={false}` per spec
 * §7: without it, AnswerButtons' own mount-in stagger has no way to tell
 * "just appeared" from "reloaded mid-beat" and replays on every mount,
 * confirmed live -- a reload mid-ANSWER re-ran the stagger on the buttons
 * that were already on screen. `initial={false}` only suppresses the
 * entrance for a child already present at THIS AnimatePresence's own first
 * mount, so a genuinely fresh READ (options arrive ~1s after the beat
 * starts, a full second after this shell mounts) still animates in.
 */
export default function StageShell({
  header, question, options, outcome,
}: {
  header: React.ReactNode;
  question: React.ReactNode;
  options: React.ReactNode;
  outcome: React.ReactNode;
}) {
  const beat = useStaging(s => s.beat);
  const announcement = useStaging(s => s.announcement);
  const escalated = useStaging(s => s.escalated);

  return (
    <main
      data-testid="stage-shell"
      data-beat={beat}
      data-escalated={escalated ? 'true' : undefined}
      className={`mx-auto grid min-h-screen w-full max-w-2xl gap-6 p-6
        ${beat === 'track'
          ? 'grid-rows-[1fr_auto] portrait:pt-6'
          : 'grid-rows-[auto_1fr_auto] portrait:pt-[28vh] landscape:bg-abyss/60 landscape:backdrop-blur-sm'}`}
    >
      {beat === 'track' ? (
        <>
          <div />
          <div className="min-w-0 space-y-4">{outcome}</div>
        </>
      ) : (
        <>
          <div className="flex flex-col items-center gap-4">{header}</div>
          <div className="flex flex-col justify-center">{question}</div>
          <div className="min-w-0 space-y-4">
            <AnimatePresence initial={false}>{options}</AnimatePresence>
            {outcome}
          </div>
        </>
      )}
      <p
        data-testid="stage-announcer"
        aria-live="polite"
        className="sr-only"
      >
        {announcement}
      </p>
    </main>
  );
}
