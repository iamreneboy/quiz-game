import { create } from 'zustand';
import type { FrameStats } from './perf';
import type { OffscreenPlayer } from './framing';

/**
 * Presentation state that flows the other way: from the canvas back to HTML.
 * Only what the readout genuinely cannot compute for itself — which players the
 * camera could not include, and which side they fell off (spec §5 overflow
 * rule) — and frame timing for the dev-only perf overlay.
 */
export interface WorldViewState {
  offscreenPlayerIds: OffscreenPlayer[];
  setOffscreen(entries: OffscreenPlayer[]): void;
  frameStats: FrameStats | null;
  setFrameStats(stats: FrameStats): void;
}

export const useWorldView = create<WorldViewState>(set => ({
  offscreenPlayerIds: [],
  setOffscreen(entries) {
    // Written every frame by the runtime — bail unless it actually changed,
    // or every React consumer re-renders at 60fps.
    set(state =>
      state.offscreenPlayerIds.length === entries.length &&
      state.offscreenPlayerIds.every(
        (e, i) => e.playerId === entries[i].playerId && e.direction === entries[i].direction,
      )
        ? state
        : { offscreenPlayerIds: entries },
    );
  },
  frameStats: null,
  setFrameStats(stats) {
    set({ frameStats: stats });
  },
}));
