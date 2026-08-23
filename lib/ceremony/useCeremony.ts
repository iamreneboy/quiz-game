import { create } from 'zustand';
import { NO_CEREMONY, sameSteps, type CeremonySteps } from './beats';

/**
 * The store the DOM ceremony consumers read — PixiStage's band and (in P5b)
 * the results board. Written by lib/ceremony/runtime.ts's ticker, which calls
 * `publish` every frame: hence the equality guard, without which every
 * consumer would re-render at 60fps. Same shape as useStaging.publish.
 *
 * lib/world/runtime.ts deliberately does NOT read this store — it calls
 * `ceremonyStepsAt` directly, so the renderer keeps its standing rule of never
 * depending on React state. Same pure function, so the two surfaces cannot
 * disagree by more than a frame.
 */
export interface CeremonyStore {
  steps: CeremonySteps;
  publish(next: CeremonySteps): void;
}

export const useCeremony = create<CeremonyStore>(set => ({
  steps: NO_CEREMONY,
  publish(next) {
    set(state => (sameSteps(state.steps, next) ? state : { steps: next }));
  },
}));

if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  (window as unknown as { __ceremony: typeof useCeremony }).__ceremony = useCeremony;
}
