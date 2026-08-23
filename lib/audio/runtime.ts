/**
 * The audio runtime (spec §7): the third and last cueBus subscriber.
 *
 * Not unit-tested by design — every decision it makes lives in state.ts or
 * design.ts, which are.
 */
import { on } from '@/lib/presentation/cueBus';
import { SOUNDS } from './manifest';
import { createMixer } from './mixer';
import { applyCue, AUDIO_CUE_TYPES, endCatchUp, initialAudioState, type AudioState } from './state';
import { DUCK_RELEASE_MS } from './design';
import { tierRank } from '@/lib/presentation/celebration';

export function startAudioRuntime(): () => void {
  const mixer = createMixer();
  let state: AudioState = initialAudioState;
  let catchUpScheduled = false;

  const syncBed = () => mixer.setBed(state.bed, state.escalated);
  syncBed(); // the lobby bed is the initial state, and has no cue of its own

  const unsubscribes = AUDIO_CUE_TYPES.map(type =>
    on(type, cue => {
      // The seed batch is emitted synchronously in one loop inside
      // startCueBridge, so a microtask queued on the FIRST cue runs only after
      // the entire batch has been applied. That is the exact boundary between
      // "catching up on a reload" and "the show is happening now".
      if (!catchUpScheduled) {
        catchUpScheduled = true;
        queueMicrotask(() => {
          state = endCatchUp(state);
        });
      }

      const step = applyCue(state, cue);
      state = step.state;
      syncBed();

      for (const id of step.stings) {
        mixer.play(id);
        if (tierRank(cue.tier) >= tierRank('overtake')) {
          mixer.duck(SOUNDS[id].durationMs + DUCK_RELEASE_MS);
        }
      }
    }),
  );

  const unlock = () => mixer.unlock();
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });

  return () => {
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('keydown', unlock);
    for (const off of unsubscribes) off();
    mixer.destroy();
  };
}
