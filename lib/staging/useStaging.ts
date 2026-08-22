import { create } from 'zustand';
import { initialStagingState, sameStaging, type StagingState } from './staging';

/**
 * The store the question surface reads. Written by lib/staging/runtime.ts's
 * ticker, which calls `publish` every frame — hence the equality guard: without
 * it every consumer would re-render at 60fps (spec decision 3).
 */
export interface StagingStore extends StagingState {
  /**
   * Text for the polite live region. Set from the `answer-locked` cue rather
   * than derived, because the lock must be announced ONCE at the moment it
   * happens — not re-announced on a re-render or on restore-from-storage.
   */
  announcement: string | null;
  publish(next: StagingState): void;
  announce(text: string): void;
}

export const useStaging = create<StagingStore>(set => ({
  ...initialStagingState,
  announcement: null,
  publish(next) {
    set(state => (sameStaging(state, next) ? state : next));
  },
  announce(text) {
    set({ announcement: text });
  },
}));
