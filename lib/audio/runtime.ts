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
import { msUntil } from '@/lib/serverTime';
import { useGameStore } from '@/lib/store';
import { useSettings } from '@/lib/useSettings';
import { tensionAt, tensionStep } from '@/lib/staging/tension';
import { driveGain, DRIVE_STEM, REVEAL_DECAY_MS, urgencyGain, URGENCY_STEM } from './design';

export function startAudioRuntime(): () => void {
  const mixer = createMixer();
  let state: AudioState = initialAudioState;
  let catchUpScheduled = false;

  const syncBed = () => mixer.setBed(state.bed, state.escalated);
  syncBed(); // the lobby bed is the initial state, and has no cue of its own

  // Muting silences Howler globally but the state machine keeps running, so
  // unmuting mid-game lands on the right bed at the right point rather than
  // restarting a loop from bar one.
  mixer.setMuted(useSettings.getState().muted);
  const unsubscribeMute = useSettings.subscribe(settings => mixer.setMuted(settings.muted));

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

  // The ANSWER ramp. Deliberately re-reads the store for the CLOCK only —
  // exactly as lib/staging/runtime.ts does — and calls the same pure
  // `tensionAt` the vignette calls, so audio and picture cannot drift.
  let wasAnswer = false;
  let lastStep = -1;
  let frame = requestAnimationFrame(function tick() {
    frame = requestAnimationFrame(tick);

    const { room, myAnswer } = useGameStore.getState();
    if (room?.phase !== 'answer') {
      if (wasAnswer) {
        wasAnswer = false;
        lastStep = -1;
        mixer.setStemGain(DRIVE_STEM, 0, REVEAL_DECAY_MS);
        mixer.setStemGain(URGENCY_STEM, 0, REVEAL_DECAY_MS);
      }
      return;
    }
    wasAnswer = true;

    // Locked in: the gains FREEZE where they are. You are out of the decision,
    // the room is not (lib/staging/runtime.ts:151).
    if (myAnswer !== null) return;

    const totalMs = room.timer_seconds * 1000;
    const raw = tensionAt(room.ends_at ? msUntil(room.ends_at) : null, totalMs);

    if (useSettings.getState().profile === 'reduced') {
      // Three discrete levels, written only when the step changes: a
      // per-frame ramp there is work with no audible result.
      const step = tensionStep(raw);
      if (step === lastStep) return;
      lastStep = step;
      const t = step / 3;
      mixer.setStemGain(DRIVE_STEM, driveGain(t), 180);
      mixer.setStemGain(URGENCY_STEM, urgencyGain(t), 180);
      return;
    }

    mixer.setStemGain(DRIVE_STEM, driveGain(raw));
    mixer.setStemGain(URGENCY_STEM, urgencyGain(raw));
  });

  return () => {
    cancelAnimationFrame(frame);
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('keydown', unlock);
    for (const off of unsubscribes) off();
    unsubscribeMute();
    mixer.destroy();
  };
}
