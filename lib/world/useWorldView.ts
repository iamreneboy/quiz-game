import { create } from 'zustand';

/**
 * Presentation state that flows the other way: from the canvas back to HTML.
 * Only what the readout genuinely cannot compute for itself — which players the
 * camera could not include (spec §5 overflow rule).
 */
export interface WorldViewState {
  offscreenPlayerIds: string[];
  setOffscreen(ids: string[]): void;
}

export const useWorldView = create<WorldViewState>(set => ({
  offscreenPlayerIds: [],
  setOffscreen(ids) {
    // Written every frame by the runtime — bail unless it actually changed,
    // or every React consumer re-renders at 60fps.
    set(state =>
      state.offscreenPlayerIds.length === ids.length &&
      state.offscreenPlayerIds.every((id, i) => id === ids[i])
        ? state
        : { offscreenPlayerIds: ids },
    );
  },
}));
