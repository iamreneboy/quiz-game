/**
 * The world runtime (spec §3): the ONLY module wired to the cue bus.
 *
 * Owns the director, camera and choreographer state, converts them into a
 * WorldFrameState each tick, and hands that to the scene. Not unit-tested by
 * design — every decision it makes lives in a pure module that is.
 */
import type { Application, Renderer } from 'pixi.js';
import { CEREMONY_MS, NO_CEREMONY, ceremonyStepsAt, type CeremonySteps } from '@/lib/ceremony/beats';
import { on } from '@/lib/presentation/cueBus';
import type { CueType } from '@/lib/presentation/cues';
import type { Profile } from '@/lib/presentation/profile';
import { msUntil } from '@/lib/serverTime';
import { elapsedIn } from '@/lib/staging/beats';
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
  holdAnchors,
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
import {
  gridAnchors,
  markerAnchors,
  startLineAnchors,
  trackMetrics,
  type CameraState,
  type MarkerAnchor,
  type TrackMetrics,
} from './geometry';
import { createFrameSampler } from './perf';
import { NO_CEREMONY_FRAME, type CeremonyFrameState } from './frame';
import { blockX, podiumAnchors, podiumBlocks } from './podium';
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
  'phase-results',
  'overtake',
  'lead-changed',
  'final-question',
  'player-advanced',
  'streak-tier',
  'streak-broken',
  'player-joined',
];

/**
 * The ceremony's position, computed straight from the server deadline.
 *
 * Deliberately NOT read from `useCeremony`: the renderer never depends on React
 * state. It is the same pure function that store's ticker calls, so the two
 * surfaces cannot disagree by more than a frame.
 */
function ceremonySteps(state: ReturnType<typeof useGameStore.getState>): CeremonySteps {
  const room = state.room;
  if (room?.phase !== 'results') return NO_CEREMONY;
  return ceremonyStepsAt(elapsedIn(CEREMONY_MS, room.ends_at ? msUntil(room.ends_at) : null));
}

/**
 * Where the field stands right now. Pure dispatch — every layout it picks from
 * lives in geometry.ts. Both the cue handler and `tick()` go through this so
 * they can never disagree.
 *
 * `standings?.length` rather than a null check on purpose: `standings` is null
 * until the first round resolves (lib/store.ts:19), and an empty array has to
 * take the same branch, otherwise round 1 renders an empty track through a
 * countdown that is drawn at the FULL band (components/PixiStage.tsx:10).
 */
function fieldAnchors(
  state: ReturnType<typeof useGameStore.getState>,
  metrics: TrackMetrics,
  steps: CeremonySteps,
): MarkerAnchor[] {
  const { room, standings, players } = state;
  // Only racers get a rig. A non-playing MC host is in `players` but not in
  // `standings` (supabase/migrations/0002_rpcs.sql, `where p.is_playing`), so
  // an unfiltered roster gave them an avatar on the grid and the start line —
  // shifting every other grid slot, since `gridAnchors` uses array index as
  // grid order — and then deleted it at the first reveal. This stays a filter
  // at the call site rather than a rule in geometry.ts on purpose: it is
  // selection of WHO is in the field, which the server already decides, not
  // track math, and both anchor functions are deliberately shape-agnostic.
  const racers = players.filter(p => p.is_playing);
  const phase = room?.phase ?? 'lobby';

  if (phase === 'lobby') return gridAnchors(racers, metrics);
  // The ceremony is a fourth layout, not a fourth renderer.
  if (phase === 'results' && standings?.length) return podiumAnchors(standings, metrics, steps);
  return standings?.length ? markerAnchors(standings, metrics) : startLineAnchors(racers, metrics);
}

export interface WorldRuntimeOptions {
  app: Application<Renderer>;
  scene: WorldScene;
  profile: Profile;
  /**
   * Read every tick rather than captured once: the runtime can be constructed
   * before the visitor's session has been saved, and a value fixed at
   * construction made the YOU ring depend on that race.
   */
  localPlayerId: () => string | null;
}

export function createWorldRuntime(options: WorldRuntimeOptions): { destroy(): void } {
  const { app, scene, profile } = options;
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

      const state = useGameStore.getState();
      const metrics = trackMetrics(state.room?.total_rounds ?? 12);
      const anchors = fieldAnchors(state, metrics, ceremonySteps(state));

      if (cue.type === 'phase-track') {
        choreo = beginSequence(choreo, anchors, now, profile);
      } else if (cue.type === 'phase-read' || cue.type === 'phase-countdown') {
        // A new beat hard-completes anything still in flight (spec §4).
        // completeSequence clears heldAnchors, so the hold comes after it.
        choreo = holdAnchors(completeSequence(choreo), anchors);
      } else if (cue.type === 'phase-answer') {
        // The last settled beat before the reveal — this is the world the
        // avatars hold while the standings run ahead of them (ADR-0003).
        choreo = holdAnchors(choreo, anchors);
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

    const state = useGameStore.getState();
    const { room, standings, players } = state;

    director = tickDirector(director, now);
    const intent = activeIntent(director);

    const metrics = trackMetrics(room?.total_rounds ?? 12);
    const steps = ceremonySteps(state);
    const anchors = fieldAnchors(state, metrics, steps);
    const viewport = { width: app.screen.width, height: app.screen.height };
    const localPlayerId = options.localPlayerId();

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

    const ceremony: CeremonyFrameState =
      room?.phase === 'results' && standings?.length
        ? {
            active: true,
            blocks: podiumBlocks(standings, metrics, steps),
            spotlight: steps.spotlight,
            spotlightX: blockX(1, metrics),
            confetti: steps.confetti,
          }
        : NO_CEREMONY_FRAME;

    scene.setPlayers(players);
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
      ceremony,
    });

    // Point the indicators where the avatars ARE, not where the standings say
    // they will end up — during a TRACK beat those differ for the whole travel.
    const avatarById = new Map(avatars.map(a => [a.playerId, a]));
    const travelling = anchors.map(anchor => {
      const avatar = avatarById.get(anchor.playerId);
      return avatar ? { ...anchor, x: avatar.x, y: avatar.y } : anchor;
    });
    useWorldView.getState().setOffscreen(offscreenPlayerIds(travelling, shown, viewport));

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
