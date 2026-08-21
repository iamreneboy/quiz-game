'use client';
import { useSearchParams } from 'next/navigation';
import { useWorldView } from '@/lib/world/useWorldView';
import { DROPPED_FRAME_MS } from '@/lib/world/perf';

/** Dev-only frame readout behind `?perf=1` (spec §9). Measurement only. */
export default function PerfOverlay() {
  const enabled = useSearchParams().get('perf') === '1';
  const stats = useWorldView(s => s.frameStats);

  if (!enabled || !stats) return null;

  const fps = stats.p50 > 0 ? Math.round(1000 / stats.p50) : 0;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed bottom-3 left-3 z-50 rounded-control border border-haze/50 bg-void/85 px-3 py-2 font-mono text-xs text-ink-dim tabular-nums"
    >
      <div className={fps >= 55 ? 'text-correct' : 'text-warning'}>{fps} fps</div>
      <div>p50 {stats.p50.toFixed(1)}ms · p95 {stats.p95.toFixed(1)}ms</div>
      <div>
        dropped {stats.dropped}/{stats.samples} (&gt;{DROPPED_FRAME_MS}ms)
      </div>
    </div>
  );
}
