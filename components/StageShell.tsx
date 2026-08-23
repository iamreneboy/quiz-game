'use client';
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

  return (
    <main
      data-testid="stage-shell"
      data-beat={beat}
      className="mx-auto grid min-h-screen w-full max-w-2xl grid-rows-[auto_1fr_auto] gap-6 p-6
        portrait:pt-[28vh] landscape:bg-abyss/60 landscape:backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-4">{header}</div>
      <div className="flex flex-col justify-center">{question}</div>
      <div className="space-y-4">
        {options}
        {outcome}
      </div>
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
