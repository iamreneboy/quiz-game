/**
 * The world runtime (spec §3): the ONLY module wired to the cue bus.
 *
 * Owns the director and camera state, converts them into a WorldFrameState each
 * tick, and hands that to the scene. Not unit-tested by design — every decision
 * it makes lives in a pure module that is.
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
  activeIntent,
  reduceCue,
  seedDirector,
  tickDirector,
  type DirectorState,
} from './director';
import { frameTarget, offscreenPlayerIds } from './framing';
import { markerAnchors, trackMetrics, type CameraState } from './geometry';
import type { WorldScene } from './render/WorldScene';
import { useWorldView } from './useWorldView';
import { gradeState, quantizeZoneWeights, zoneWeights } from './zones';

/** Cue types P1 acts on. Everything else belongs to a later phase (spec §5). */
const SUBSCRIBED: CueType[] = [
  'phase-countdown',
  'phase-read',
  'phase-answer',
  'phase-track',
  'overtake',
  'lead-changed',
  'final-question',
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

  // Seed from the store: the cue bridge emitted the current beat before this
  // subscriber existed, so a mid-game reload must establish its own base shot.
  let director: DirectorState = seedDirector(useGameStore.getState().room?.phase ?? 'lobby');
  let camera: CameraState | null = null;
  let move: CameraMove | null = null;

  const unsubscribes = SUBSCRIBED.map(type =>
    on(type, cue => {
      director = reduceCue(director, cue, performance.now());
    }),
  );

  const tick = () => {
    const now = performance.now();
    const { room, standings } = useGameStore.getState();

    director = tickDirector(director, now);
    const intent = activeIntent(director);

    const metrics = trackMetrics(room?.total_rounds ?? 12);
    const anchors = markerAnchors(standings ?? [], metrics);
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

    scene.setPlayers(useGameStore.getState().players);
    scene.applyFrame({
      camera: shown,
      viewport,
      metrics,
      // Reduced profile switches zones hard instead of crossfading (spec §9).
      zones: profile === 'reduced' ? quantizeZoneWeights(blended) : blended,
      grade: gradeState(progress, director.escalation),
      anchors,
      localPlayerId,
      elapsedMs,
    });

    useWorldView.getState().setOffscreen(offscreenPlayerIds(anchors, shown, viewport));
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
