import { useGameStore } from '@/lib/store';
import type { Cue, CueOf, CueType } from './cues';
import { deriveCues, initialDerivationState, type CueSource, type DerivationState } from './deriveCues';

/**
 * The presentation-event bus: a ~30-line typed emitter, no dependency.
 *
 * Pixi (P1+), `motion`-driven UI (P3) and Howler (P4) subscribe here and
 * nowhere else. Deliberately framework-free so it is unit-testable in Node.
 */

type AnyHandler = (cue: Cue) => void;

const handlers = new Map<CueType, Set<AnyHandler>>();

/** Subscribe to one cue type. Returns an unsubscribe function. */
export function on<T extends CueType>(type: T, handler: (cue: CueOf<T>) => void): () => void {
  const set = handlers.get(type) ?? new Set<AnyHandler>();
  handlers.set(type, set);
  const wrapped = handler as AnyHandler;
  set.add(wrapped);
  return () => {
    set.delete(wrapped);
  };
}

/** Deliver a cue to its subscribers. Safe to unsubscribe from inside a handler. */
export function emit(cue: Cue): void {
  const set = handlers.get(cue.type);
  if (!set || set.size === 0) return;
  for (const handler of [...set]) handler(cue);
}

/** Drop every subscription. Tests only. */
export function clearCueBus(): void {
  handlers.clear();
}

/**
 * Subscribe to the game store, run the pure deriver on every change and emit
 * the resulting cues. Mounted once, in the room page. Returns a teardown.
 */
export function startCueBridge(): () => void {
  let state: DerivationState = initialDerivationState;

  const step = (prev: CueSource, next: CueSource) => {
    const result = deriveCues(prev, next, state);
    state = result.nextState;
    for (const cue of result.cues) {
      if (process.env.NODE_ENV === 'development') console.debug('[cue]', cue.type, cue);
      emit(cue);
    }
  };

  // Seed from whatever the store already holds (e.g. a mid-game reload).
  const current = useGameStore.getState();
  step(current, current);

  return useGameStore.subscribe((next, prev) => step(prev, next));
}
