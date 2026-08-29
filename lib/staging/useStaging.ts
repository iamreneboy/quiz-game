import { create } from 'zustand';
import type { Callout, RailDelta } from './callouts';
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
  /** The beat's single headline (ADR-0010), or null. */
  callout: Callout | null;
  /** Below-headline drama, subdued into the rail. */
  deltas: RailDelta[];
  /** True from the final-question run-up until the results beat. */
  escalated: boolean;
  /** True for the tiebreak round only. Set on sight; cleared at the ceremony. */
  suddenDeath: boolean;
  publish(next: StagingState): void;
  announce(text: string): void;
  setCallout(callout: Callout | null, deltas: RailDelta[]): void;
  setEscalated(escalated: boolean): void;
  setSuddenDeath(on: boolean): void;
}

export const useStaging = create<StagingStore>(set => ({
  ...initialStagingState,
  announcement: null,
  callout: null,
  deltas: [],
  escalated: false,
  suddenDeath: false,
  publish(next) {
    set(state => (sameStaging(state, next) ? state : next));
  },
  announce(text) {
    set({ announcement: text });
  },
  setCallout(callout, deltas) {
    set({ callout, deltas });
  },
  setEscalated(escalated) {
    set({ escalated });
  },
  setSuddenDeath(on) {
    set(state => (state.suddenDeath === on ? state : { suddenDeath: on }));
  },
}));

if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  (window as unknown as { __staging: typeof useStaging }).__staging = useStaging;
}
