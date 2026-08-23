'use client';
import { useStaging } from '@/lib/staging/useStaging';

/**
 * The ANSWER beat's closing vignette (spec §5, decision 4).
 *
 * Pressure lives in the margins: this sits above the world and below the
 * question surface and never touches either. It re-renders only when the beat
 * changes — its intensity comes from the `--tension` custom property the
 * staging ticker writes, so the ramp never passes through React.
 */
export default function TensionFrame() {
  const beat = useStaging(s => s.beat);
  if (beat !== 'answer') return null;
  return <div aria-hidden="true" className="tension-frame" />;
}
