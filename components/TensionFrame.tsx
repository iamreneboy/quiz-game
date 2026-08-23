'use client';
import { useStaging } from '@/lib/staging/useStaging';

/**
 * The ANSWER beat's closing vignette (spec §5, decision 4).
 *
 * Pressure lives in the margins: this sits above the world and below the
 * question surface and never touches either. It re-renders only when the beat
 * changes — its intensity comes from the `--tension` custom property the
 * staging ticker writes, so the ramp never passes through React.
 *
 * A sibling of the stage shell, not a descendant — mounted next to PixiStage
 * in app/room/[code]/page.tsx, so it reads escalation from the store itself
 * rather than a `[data-escalated]` ancestor selector, which would never match.
 */
export default function TensionFrame() {
  const beat = useStaging(s => s.beat);
  const escalated = useStaging(s => s.escalated);
  if (beat !== 'answer') return null;
  return (
    <div
      aria-hidden="true"
      className={escalated ? 'tension-frame tension-frame--final' : 'tension-frame'}
    />
  );
}
