/**
 * The staging runtime (spec §3): the only cueBus subscriber outside
 * lib/world/runtime.ts, and the only clock the question surface has.
 *
 * Not unit-tested by design — every decision it makes lives in a pure module
 * that is (beats.ts, tension.ts, staging.ts).
 */
import { on } from '@/lib/presentation/cueBus';
import { msUntil } from '@/lib/serverTime';
import { loadSession } from '@/lib/session';
import { useGameStore } from '@/lib/store';
import { useSettings } from '@/lib/useSettings';
import { beatFor, beatTotalMs } from './beats';
import { stagingAt } from './staging';
import { tensionAt, tensionStep } from './tension';
import { useStaging } from './useStaging';

/** CSS custom properties the ticker owns. Nothing else may write them. */
const TENSION_VAR = '--tension';
const TIMER_VAR = '--timer-frac';

function setVar(name: string, value: number): void {
  document.documentElement.style.setProperty(name, value.toFixed(4));
}

export function startStagingRuntime(code: string): () => void {
  const { publish, announce } = useStaging.getState();

  // Resolved lazily: the session is written when the visitor joins, which can
  // happen after this runtime starts. Same reasoning as PixiStage's lazy read,
  // but this one is cheap to repeat — it only runs on a store change, not per
  // frame.
  const isLocalPlayerPlaying = (): boolean => {
    const { players } = useGameStore.getState();
    const playerId = loadSession(code)?.playerId;
    if (!playerId) return true; // not joined yet: nothing to disable
    const me = players.find(p => p.id === playerId);
    return me ? me.is_playing : true;
  };

  const unsubscribe = on('answer-locked', cue => {
    const option = useGameStore.getState().question?.options[cue.choiceIndex];
    announce(option ? `Locked in: ${option}` : 'Locked in');
  });

  const computeAndPublishDiscrete = () => {
    const { room, myAnswer } = useGameStore.getState();
    const remainingMs = room?.ends_at ? msUntil(room.ends_at) : null;
    const timerSeconds = room?.timer_seconds ?? 0;
    publish(
      stagingAt({
        phase: room?.phase ?? null,
        round: room?.round ?? 0,
        remainingMs,
        timerSeconds,
        myAnswer,
        isPlaying: isLocalPlayerPlaying(),
      }),
    );
    return { room, myAnswer, remainingMs, timerSeconds };
  };

  // Bootstrap once, the instant `room` is first known, rather than waiting
  // for the next animation frame. `useGameStore` starts with room `null` and
  // only resolves once the realtime channel's async SUBSCRIBED round-trip
  // lands (lib/useRoomChannel.ts) — without this, a reload or late join mid-
  // round renders one committed frame of `idle` before its first tick, and
  // the READ entrance choreography plays as if it had just started.
  //
  // Deliberately one-shot: every OTHER phase transition is left to the rAF
  // loop below, whose one-frame lag is what lets a genuinely fresh READ beat
  // render "nothing yet" before "badges", which is what AnimatePresence needs
  // to treat the badges as entering rather than already there.
  let bootstrapped = false;
  const tryBootstrap = (room: ReturnType<typeof useGameStore.getState>['room']) => {
    if (bootstrapped || room === null) return;
    bootstrapped = true;
    computeAndPublishDiscrete();
  };
  tryBootstrap(useGameStore.getState().room); // covers room already set before this runs
  const unsubscribeStore = useGameStore.subscribe(state => tryBootstrap(state.room));

  let frame = 0;
  const tick = () => {
    frame = requestAnimationFrame(tick);

    const { room, myAnswer, remainingMs, timerSeconds } = computeAndPublishDiscrete();
    const beat = beatFor(room?.phase ?? null);
    if (beat !== 'answer') {
      setVar(TENSION_VAR, 0);
      setVar(TIMER_VAR, 0);
      return;
    }

    const totalMs = beatTotalMs(beat, timerSeconds);
    setVar(TIMER_VAR, totalMs > 0 && remainingMs !== null ? remainingMs / totalMs : 0);

    // Once you have locked in, the vignette FREEZES at its current intensity
    // (spec §5): you are out of the decision, but the room is not.
    if (myAnswer !== null) return;

    const raw = tensionAt(remainingMs, totalMs);
    // `reduced` gets three discrete levels rather than a ramp — a continuous
    // write there is per-frame work with no visible result, because
    // [data-profile='reduced'] suppresses transitions globally.
    const reduced = useSettings.getState().profile === 'reduced';
    setVar(TENSION_VAR, reduced ? tensionStep(raw) / 3 : raw);
  };

  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    unsubscribe();
    unsubscribeStore();
    setVar(TENSION_VAR, 0);
    setVar(TIMER_VAR, 0);
  };
}
