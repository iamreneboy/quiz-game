/**
 * Frame-time instrumentation (spec §9, decision 7).
 *
 * MEASUREMENT ONLY — nothing here changes the performance profile. ADR-0004
 * stands: the profile is a static startup heuristic plus a manual override.
 * P2, where load becomes variable with N avatars and particle systems, owns any
 * automatic downgrade.
 */

/** A frame slower than this is below 50fps and counts as dropped. */
export const DROPPED_FRAME_MS = 20;

export interface FrameStats {
  p50: number;
  p95: number;
  dropped: number;
  samples: number;
}

export function createFrameSampler(windowSize = 120) {
  const window: number[] = [];
  let dropped = 0;

  return {
    push(frameMs: number): void {
      window.push(frameMs);
      if (frameMs >= DROPPED_FRAME_MS) dropped++;
      if (window.length > windowSize) {
        const evicted = window.shift()!;
        if (evicted >= DROPPED_FRAME_MS) dropped--;
      }
    },

    stats(): FrameStats {
      if (window.length === 0) return { p50: 0, p95: 0, dropped: 0, samples: 0 };
      const sorted = [...window].sort((a, b) => a - b);
      const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
      return { p50: at(0.5), p95: at(0.95), dropped, samples: window.length };
    },
  };
}
