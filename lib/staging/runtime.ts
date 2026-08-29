/**
 * The staging runtime (spec §3): the only cueBus subscriber outside
 * lib/world/runtime.ts, and the only clock the question surface has.
 *
 * Not unit-tested by design — every decision it makes lives in a pure module
 * that is (beats.ts, tension.ts, staging.ts).
 */
import { on } from '@/lib/presentation/cueBus';
import { beatRemainingMs, isPaused } from '@/lib/pause';
import { useGameStore } from '@/lib/store';
import { useSettings } from '@/lib/useSettings';
import { viewerPlayerId, type ViewerRole } from '@/lib/viewer';
import { beatFor, beatTotalMs } from './beats';
import {
  bufferCallout, clearCallout, initialCalloutState, resetCallouts, resolveCallout,
  type CalloutState,
} from './callouts';
import { stagingAt } from './staging';
import { tensionAt, tensionStep } from './tension';
import { useStaging } from './useStaging';

/** CSS custom properties the ticker owns. Nothing else may write them. */
const TENSION_VAR = '--tension';
const TIMER_VAR = '--timer-frac';

function setVar(name: string, value: number): void {
  document.documentElement.style.setProperty(name, value.toFixed(4));
}

export function startStagingRuntime(code: string, role: ViewerRole): () => void {
  const { publish, announce, setCallout, setEscalated } = useStaging.getState();

  // Resolved lazily: a PLAYER's session is written when they join, which can
  // happen after this runtime starts. Cheap to repeat — it only runs on a
  // store change, not per frame. On the stage this never touches storage
  // (lib/viewer.ts) and always reports "playing", which is correct: the
  // tension vignette should ramp for the whole room.
  const isLocalPlayerPlaying = (): boolean => {
    const { players } = useGameStore.getState();
    const playerId = viewerPlayerId(role, code);
    if (!playerId) return true; // not joined yet, or a stage view: nothing to disable
    const me = players.find(p => p.id === playerId);
    return me ? me.is_playing : true;
  };

  const unsubscribe = on('answer-locked', cue => {
    const option = useGameStore.getState().question?.options[cue.choiceIndex];
    announce(option ? `Locked in: ${option}` : 'Locked in');
  });

  // ── Callouts: buffered at REVEAL, resolved at TRACK (ADR-0009) ───────────
  let callouts: CalloutState = initialCalloutState;

  const nameOf = (playerId: string): string => {
    const { players, standings } = useGameStore.getState();
    return (
      players.find(p => p.id === playerId)?.nickname ??
      standings?.find(s => s.player_id === playerId)?.nickname ??
      'A racer'
    );
  };

  const publishCallouts = () => {
    setCallout(callouts.callout, callouts.deltas);
    setEscalated(callouts.escalated);
  };

  const buffer = (cue: Parameters<typeof bufferCallout>[1]) => {
    callouts = bufferCallout(callouts, cue);
  };

  const unsubscribes = [
    on('overtake', buffer),
    on('lead-changed', buffer),
    on('streak-tier', buffer),
    // Escalation is set the instant this cue is SEEN, not deferred to its
    // resolution at phase-track: a reload seeding this cue can land directly
    // in the final round's READ, ANSWER or REVEAL, none of which trigger
    // resolveCallout, so waiting for arbitration would leave the world dark.
    // Still buffered too, so the normal in-batch flow keeps arbitrating it
    // against a same-beat overtake exactly as before.
    on('final-question', cue => {
      callouts = { ...bufferCallout(callouts, cue), escalated: true };
      publishCallouts();
    }),
    on('phase-track', () => {
      callouts = resolveCallout(callouts, nameOf, viewerPlayerId(role, code));
      publishCallouts();
    }),
    on('phase-read', () => {
      callouts = clearCallout(callouts);
      publishCallouts();
    }),
    on('phase-results', () => {
      callouts = resetCallouts();
      publishCallouts();
    }),
  ];

  const computeAndPublishDiscrete = () => {
    const { room, myAnswer } = useGameStore.getState();
    // The FROZEN remainder while paused, the live deadline otherwise — one
    // helper so the ring, the vignette and the audio ramp cannot disagree.
    const remainingMs = beatRemainingMs(room);
    const timerSeconds = room?.timer_seconds ?? 0;
    publish(
      stagingAt({
        phase: room?.phase ?? null,
        round: room?.round ?? 0,
        remainingMs,
        timerSeconds,
        myAnswer,
        isPlaying: isLocalPlayerPlaying(),
        paused: isPaused(room),
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
    for (const off of unsubscribes) off();
    setVar(TENSION_VAR, 0);
    setVar(TIMER_VAR, 0);
  };
}
