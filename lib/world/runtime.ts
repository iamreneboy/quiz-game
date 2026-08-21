/**
 * The world runtime (spec §3): the ONLY module wired to the cue bus.
 *
 * Owns the director, camera and choreographer state, converts them into a
 * WorldFrameState each tick, and hands that to the scene. Not unit-tested by
 * design — every decision it makes lives in a pure module that is.
 */
import type { Application, Renderer } from 'pixi.js';
import { on } from '@/lib/presentation/cueBus';
import type { CueType } from '@/lib/presentation/cues';
import type { Profile } from '@/lib/presentation/profile';
import { useGameStore } from '@/lib/store';
import {
  beginMove,
  clampCamera,
  driftOffset,
  isMoveComplete,
  sampleMove,
  shouldRetarget,
  type CameraMove,
} from './camera';
import {
  avatarStates,
  beginSequence,
  bufferCue,
  completeSequence,
  initialChoreographerState,
  notePlayerJoined,
  type ChoreographerState,
} from './choreographer';
import {
  activeIntent,
  reduceCue,
  seedDirector,
  tickDirector,
  type DirectorState,
} from './director';
import { flairFor } from './flair';
import { frameTarget, offscreenPlayerIds } from './framing';
import { gridAnchors, markerAnchors, trackMetrics, type CameraState } from './geometry';
import { createFrameSampler } from './perf';
import type { WorldScene } from './render/WorldScene';
import { useWorldView } from './useWorldView';
import { allowanceFor, initialBudgetState, stepBudget, type BudgetState } from './vfxBudget';
import { gradeState, quantizeZoneWeights, zoneWeights } from './zones';

/** Cue types the world acts on. P1 owned the camera set; P2 adds the drama set. */
const SUBSCRIBED: CueType[] = [
  'phase-countdown',
  'phase-read',
  'phase-answer',
  'phase-track',
  'overtake',
  'lead-changed',
  'final-question',
  'player-advanced',
  'streak-tier',
  'streak-broken',
  'player-joined',
];

export interface WorldRuntimeOptions {
  app: Application<Renderer>;
  scene: WorldScene;
  profile: Profile;
  localPlayerId: string | null;
}

export function createWorldRuntime(options: WorldRuntimeOptions): { destroy(): void } {
  const { app, scene, profile, localPlayerId } = options;
  const startedAt = performance.now();
  const sampler = createFrameSampler();
  let lastFrameAt = startedAt;
  let lastPublishAt = startedAt;

  // Seed from the store: the cue bridge emitted the current beat before this
  // subscriber existed, so a mid-game reload must establish its own base shot.
  let director: DirectorState = seedDirector(useGameStore.getState().room?.phase ?? 'lobby');
  let camera: CameraState | null = null;
  let move: CameraMove | null = null;
  let choreo: ChoreographerState = initialChoreographerState;
  let budget: BudgetState = initialBudgetState;

  const unsubscribes = SUBSCRIBED.map(type =>
    on(type, cue => {
      const now = performance.now();
      director = reduceCue(director, cue, now);

      const { room, standings, players } = useGameStore.getState();
      const metrics = trackMetrics(room?.total_rounds ?? 12);
      const anchors = room?.phase === 'lobby'
        ? gridAnchors(players, metrics)
        : markerAnchors(standings ?? [], metrics);

      if (cue.type === 'phase-track') {
        choreo = beginSequence(choreo, anchors, now);
      } else if (cue.type === 'phase-read' || cue.type === 'phase-countdown') {
        // A new beat hard-completes anything still in flight (spec §4).
        choreo = completeSequence(choreo);
      } else if (cue.type === 'player-joined') {
        choreo = notePlayerJoined(choreo, cue.playerId, now);
      } else {
        choreo = bufferCue(choreo, cue, anchors);
      }
    }),
  );

  const tick = () => {
    const now = performance.now();
    sampler.push(now - lastFrameAt);
    lastFrameAt = now;

    const { room, standings, players } = useGameStore.getState();

    director = tickDirector(director, now);
    const intent = activeIntent(director);

    const metrics = trackMetrics(room?.total_rounds ?? 12);
    const inLobby = (room?.phase ?? 'lobby') === 'lobby';
    const anchors = inLobby
      ? gridAnchors(players, metrics)
      : markerAnchors(standings ?? [], metrics);
    const viewport = { width: app.screen.width, height: app.screen.height };

    const target = clampCamera(
      frameTarget(intent.mode, {
        anchors,
        metrics,
        viewport,
        localPlayerId,
        emphasisIds: intent.emphasisIds,
      }),
      metrics,
    );

    if (!camera) {
      camera = target;
    } else if (shouldRetarget(move, target)) {
      move = beginMove(camera, target, intent.style, profile, now);
    }

    if (move) {
      camera = sampleMove(move, now);
      if (isMoveComplete(move, now)) move = null;
    }

    const elapsedMs = now - startedAt;
    const shown: CameraState = {
      centerX: camera.centerX + driftOffset(elapsedMs, camera, profile),
      span: camera.span,
    };

    const progress = room && room.total_rounds > 0 ? room.round / room.total_rounds : 0;

    const blended = zoneWeights(shown.centerX, metrics);

    const allowance = allowanceFor(budget.level);
    const avatars = avatarStates(
      choreo, anchors, flairFor(standings ?? [], anchors), allowance, now, profile,
    );

    // Spec §6: the arena reaction is a WORLD reaction, so it turns P1's
    // existing grade dial rather than being only a burst on one avatar.
    const arena = avatars.some(a => a.vfx.some(v => v.kind === 'arena'));
    const escalation = Math.max(director.escalation, arena ? 0.75 : 0);

    scene.setPlayers(useGameStore.getState().players);
    scene.applyFrame({
      camera: shown,
      viewport,
      metrics,
      // Reduced profile switches zones hard instead of crossfading (spec §9).
      zones: profile === 'reduced' ? quantizeZoneWeights(blended) : blended,
      grade: gradeState(progress, escalation),
      avatars,
      allowance,
      localPlayerId,
      elapsedMs,
    });

    useWorldView.getState().setOffscreen(offscreenPlayerIds(anchors, shown, viewport));

    if (now - lastPublishAt >= 500) {
      lastPublishAt = now;
      const stats = sampler.stats();
      budget = stepBudget(budget, stats, profile);
      useWorldView.getState().setFrameStats(stats);
    }
  };

  app.ticker.add(tick);

  return {
    destroy() {
      app.ticker.remove(tick);
      for (const off of unsubscribes) off();
      useWorldView.getState().setOffscreen([]);
    },
  };
}
