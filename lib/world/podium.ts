/**
 * Podium layout (spec §6) — the ceremony's anchor layout. Pure.
 *
 * A FOURTH layout beside gridAnchors / startLineAnchors / markerAnchors, which
 * is exactly what lets the whole existing avatar pipeline — rigs, flair,
 * medals, the movement grammar, the YOU ring, the off-screen readout — render
 * the ceremony with no changes at all.
 *
 * The rise itself is NOT the movement grammar, though: outside an active
 * choreographer Sequence (built by lib/world/beginSequence, wired only to the
 * `phase-track` cue), avatarStates copies an anchor's raw x/y straight through
 * with no smoothing (lib/world/choreographer.ts:295-297) — there is no cue at
 * a rise threshold to hang a Sequence on. So this module applies the easing
 * itself, the same layering lib/world/movement.ts uses (raw progress in, an
 * `EASE.settle`-eased position out) — the anchor's own y already moves
 * smoothly frame to frame, and "no smoothing downstream" is exactly what
 * lets that render correctly with zero choreography code.
 */
import { cubicBezierEase } from './camera';
import { EASE } from '@/lib/presentation/tokens';
import type { CeremonySteps } from '@/lib/ceremony/beats';
import { AVATAR_HEIGHT } from './content/roster';
import {
  markerAnchors,
  segmentToWorldX,
  type AnchorStanding,
  type MarkerAnchor,
  type TrackMetrics,
} from './geometry';

/** Block height per place, in world units. */
export const BLOCK_HEIGHTS: Record<1 | 2 | 3, number> = {
  1: AVATAR_HEIGHT * 0.85,
  2: AVATAR_HEIGHT * 0.55,
  3: AVATAR_HEIGHT * 0.3,
};

/** Block width in world units. Also the spacing between block centres. */
export const BLOCK_WIDTH = AVATAR_HEIGHT * 0.9;

/** Left-to-right placement: 2nd, 1st, 3rd — the real-world arrangement. */
export const BLOCK_ORDER: readonly (1 | 2 | 3)[] = [2, 1, 3];

/**
 * The podium sits ON the finish line, not out in the run-off.
 *
 * TRACK_MARGIN is 260 world units and camera.ts's MIN_SPAN is 800, so
 * `clampCamera` pins the camera's right edge to `metrics.maxX`: a podium placed
 * deep in the run-off would be framed off the right of the canvas. Same root
 * cause as the TRACK_MARGIN tech debt in CURRENT.md — avoided here rather than
 * inherited. The finish line is also simply where a podium belongs.
 */
export function podiumX(metrics: TrackMetrics): number {
  return segmentToWorldX(metrics.segments);
}

/** World x of a place's block centre. The winner's block is centred on podiumX. */
export function blockX(place: 1 | 2 | 3, metrics: TrackMetrics): number {
  const slot = BLOCK_ORDER.indexOf(place);
  return podiumX(metrics) + (slot - 1) * BLOCK_WIDTH;
}

/**
 * Whether a place's block has FULLY landed. `steps.rise` is linear progress
 * (lib/ceremony/beats.ts); this crosses 1 only once RISE_MS has elapsed since
 * the block's own moment, same as `riseProgress` below hitting its ceiling.
 */
export function hasRisen(place: 1 | 2 | 3, steps: CeremonySteps): boolean {
  return steps.rise[place] >= 1;
}

/**
 * Eased rise progress for one place. Reuses EASE.settle — the same curve
 * lib/world/movement.ts gives a travelling avatar — so a landing block
 * overshoots and settles with the same weight as everything else that lands
 * in this game, rather than a bespoke curve invented for this one moment.
 * Bezier-exact at the boundaries (0 at 0, 1 at 1), so a block at rest never
 * carries residual bounce.
 */
function easedRise(place: 1 | 2 | 3, steps: CeremonySteps): number {
  return cubicBezierEase(EASE.settle, steps.rise[place]);
}

export interface PodiumBlock {
  place: 1 | 2 | 3;
  playerId: string;
  /** World x of the block's centre. */
  x: number;
  height: number;
  /** Eased 0..1, briefly > 1 mid-landing (EASE.settle's overshoot). */
  riseProgress: number;
}

/**
 * The blocks to draw. `standings` is already totally ordered by the Fairness
 * Law, so `slice(0, 3)` is deterministic and matches the medals `flairFor`
 * assigns — ties need no rule of their own here.
 */
export function podiumBlocks(
  standings: readonly AnchorStanding[],
  metrics: TrackMetrics,
  steps: CeremonySteps,
): PodiumBlock[] {
  return standings.slice(0, 3).map((s, index) => {
    const place = (index + 1) as 1 | 2 | 3;
    return {
      place,
      playerId: s.player_id,
      x: blockX(place, metrics),
      height: BLOCK_HEIGHTS[place],
      riseProgress: easedRise(place, steps),
    };
  });
}

/**
 * Where every racer stands during the ceremony.
 *
 * Only `x` and `y` are overridden. `row` and `segment` are carried through from
 * the finish-line layout on purpose: `flairFor` reads BOTH — `edgeHolder` is
 * `contested && row === 0`, where `contested` counts occupants of a `segment`
 * (lib/world/flair.ts:63-73). Forcing `row: 0` would light the turbo flame on
 * every podium player tied on `correct`, instead of the one holding the edge.
 */
export function podiumAnchors(
  standings: readonly AnchorStanding[],
  metrics: TrackMetrics,
  steps: CeremonySteps,
): MarkerAnchor[] {
  const blocks = new Map(
    podiumBlocks(standings, metrics, steps).map(block => [block.playerId, block]),
  );

  return markerAnchors(standings, metrics).map(anchor => {
    const block = blocks.get(anchor.playerId);
    // Outside the top three: hold the finish-line position you raced to.
    if (!block) return anchor;

    return {
      ...anchor,
      x: block.x,
      // The SAME eased progress that sizes the block, so the rig and the
      // block it stands on move in exact lockstep — one curve, read twice,
      // never two independently-animated things that could drift apart.
      // Guarded rather than a bare product: height * 0 is IEEE -0, which
      // reads fine on screen but is a surprising value to hand back before
      // any rise has started.
      y: block.riseProgress > 0 ? -block.height * block.riseProgress : 0,
    };
  });
}
