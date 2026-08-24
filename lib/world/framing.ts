/**
 * Framing (spec §5) — turns marker positions into a camera target.
 *
 * Pure. Deliberately independent of viewport aspect: the shot is chosen in
 * world units, and layout decides how tall the window showing it is.
 */
import {
  HORIZON_FRACTION,
  MARKER_ROW_HEIGHT,
  MAX_STACK_RISE,
  RIG_BOTTOM,
  RIG_TOP,
  SEGMENT_WIDTH,
  segmentToWorldX,
  worldScale,
  worldXToScreen,
  worldYToScreen,
  type CameraState,
  type MarkerAnchor,
  type TrackMetrics,
  type Viewport,
} from './geometry';
import { MIN_SPAN_SEGMENTS, clampCamera, spanLimits } from './camera';
import { BLOCK_HEIGHTS, BLOCK_WIDTH, podiumX } from './podium';
import { AVATAR_HEIGHT } from './content/roster';

export type FramingMode =
  | 'startLine'
  | 'establishing'
  | 'pack'
  | 'packTight'
  | 'packWide'
  | 'emphasis'
  | 'podium'
  | 'podiumRoom';

export interface FramingInput {
  anchors: readonly MarkerAnchor[];
  metrics: TrackMetrics;
  viewport: Viewport;
  /** Never dropped from frame when the field can't all fit. */
  localPlayerId: string | null;
  emphasisIds: readonly string[];
}

/** Breathing room on each side of the framed group, in world units. */
const PACK_PADDING = SEGMENT_WIDTH * 0.9;
const EMPHASIS_PADDING = SEGMENT_WIDTH * 0.6;
const START_LINE_SEGMENTS = 5;

/** The stage's establishing-width pack shot: the world is the whole backdrop there. */
const STAGE_PACK_PADDING = SEGMENT_WIDTH * 1.8;

/** Breathing room above the winner's head in the podium shot. */
export const PODIUM_TOP_PAD = AVATAR_HEIGHT * 0.15;

/**
 * The ceremony shot: three block widths plus breathing room on each side.
 *
 * `clampCamera` widens this to camera.ts's MIN_SPAN if it is tighter, which is
 * the desired floor — the podium is the closest the camera ever gets.
 */
const PODIUM_SPAN = BLOCK_WIDTH * 3 + PACK_PADDING * 2;

/** Where the leader sits across the frame when the field overflows: 0.5 == centre. */
const LEADER_BIAS = 0.8;

/**
 * World units visible ABOVE the ground line — the number this pipeline never
 * computed.
 *
 * `worldScale` picks pixels-per-unit from viewport WIDTH alone
 * (geometry.ts:122), then every vertical measurement is taken in that scale
 * against `horizonY = height * HORIZON_FRACTION`. So how much world fits above
 * the ground line depends on the aspect ratio, and nothing downstream knew it.
 * Both of P6b's framing defects are this number being too small.
 */
export function headroom(viewport: Viewport, span: number): number {
  return (viewport.height * HORIZON_FRACTION * span) / viewport.width;
}

/**
 * The floor under `stackRiseLimit`. Half a marker row: below this a stack stops
 * reading as a ladder at all, and a compressed-but-visible stack beats a flat
 * heap. Where the floor binds, rigs CAN clip — `offscreenPlayerIds` names them
 * (spec §3.3).
 */
export const STACK_RISE_FLOOR = MARKER_ROW_HEIGHT / 2;

/**
 * How far a tie stack may rise, derived from the viewport instead of assumed.
 *
 * This finishes the derivation `MAX_STACK_RISE`'s own docstring starts: it
 * works out 324 units of headroom at MIN_SPAN, subtracts the rig's 135-unit
 * reach, and then ASSUMES 16:9 and freezes the answer at 179.2. Here the same
 * arithmetic runs against the real viewport.
 *
 * MIN_SPAN rather than the live span is deliberate: the tightest shot the
 * camera can ever take is the worst case, so the limit never depends on the
 * camera state it would otherwise feed back into.
 */
export function stackRiseLimit(viewport: Viewport): number {
  const available =
    headroom(viewport, MIN_SPAN_SEGMENTS * SEGMENT_WIDTH) - Math.abs(RIG_TOP);
  return Math.min(MAX_STACK_RISE, Math.max(STACK_RISE_FLOOR, available));
}

/**
 * The podium's span, widened if the canvas is too SHORT to hold the winner.
 *
 * The podium has no compression lever — the block heights ARE the ceremony —
 * so where a stack compresses, this widens: a wider span means a smaller
 * scale, which means more world fits above the ground line.
 *
 * Only a short canvas triggers it. At a full-height 16:9 viewport the required
 * span is 649.4 against PODIUM_SPAN's 921.6, so the shot is untouched; it is
 * the 50vh results retreat (1280x360 and friends) that forces the widen.
 */
function podiumSpanFor(viewport: Viewport): number {
  const needed = BLOCK_HEIGHTS[1] + Math.abs(RIG_TOP) + PODIUM_TOP_PAD;
  const required = (needed * viewport.width) / (viewport.height * HORIZON_FRACTION);
  return Math.max(PODIUM_SPAN, required);
}

export function frameTarget(mode: FramingMode, input: FramingInput): CameraState {
  const { metrics } = input;

  switch (mode) {
    case 'startLine': {
      // With a lobby grid present, frame the formation; otherwise hold the
      // fixed establishing shot on the start line.
      if (input.anchors.length === 0) {
        return clampCamera(
          { centerX: segmentToWorldX(0), span: START_LINE_SEGMENTS * SEGMENT_WIDTH },
          metrics,
        );
      }
      return fit(input.anchors, PACK_PADDING, input);
    }

    case 'establishing':
      return clampCamera({ centerX: metrics.length / 2, span: metrics.length }, metrics);

    case 'emphasis': {
      const named = input.anchors.filter(a => input.emphasisIds.includes(a.playerId));
      if (named.length === 0) return frameTarget('pack', input);
      return fit(named, EMPHASIS_PADDING, input);
    }

    case 'podium':
      // Frames a PLACE, not a group: the podium is at a known world x, so this
      // shot needs no anchors and cannot be thrown off by a straggler still
      // standing back at segment 2.
      return clampCamera(
        { centerX: podiumX(metrics), span: podiumSpanFor(input.viewport) },
        metrics,
      );

    case 'podiumRoom': {
      // The ceremony shot for a room: the winner AND the field that did not
      // medal, who stand at markerAnchors near the finish line — which is where
      // the podium is, so this is a genuine fit rather than a wider constant.
      const half = (BLOCK_WIDTH * 3) / 2;
      const centre = podiumX(metrics);
      const xs = [centre - half, centre + half, ...input.anchors.map(a => a.x)];
      const lo = Math.min(...xs);
      const hi = Math.max(...xs);
      const span = Math.max(hi - lo + PACK_PADDING * 2, podiumSpanFor(input.viewport));
      return clampCamera({ centerX: (lo + hi) / 2, span }, metrics);
    }

    case 'packTight':
      if (input.anchors.length === 0) return frameTarget('establishing', input);
      return fit(input.anchors, EMPHASIS_PADDING, input);

    case 'packWide':
      if (input.anchors.length === 0) return frameTarget('establishing', input);
      return fit(input.anchors, STAGE_PACK_PADDING, input);

    case 'pack':
    default: {
      if (input.anchors.length === 0) return frameTarget('establishing', input);
      return fit(input.anchors, PACK_PADDING, input);
    }
  }
}

function fit(group: readonly MarkerAnchor[], padding: number, input: FramingInput): CameraState {
  const { metrics } = input;
  const limits = spanLimits(metrics);
  const xs = group.map(a => a.x);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const needed = hi - lo + padding * 2;

  if (needed <= limits.max) {
    return clampCamera({ centerX: (lo + hi) / 2, span: needed }, metrics);
  }

  // Overflow: hold the leader near the front of the frame, then pull back if
  // that would drop the local player. The local player is never dropped; the
  // leader may be, and is flagged off-screen in the readout instead.
  const span = limits.max;
  let centerX = hi - span * (LEADER_BIAS - 0.5);

  const local = input.localPlayerId
    ? group.find(a => a.playerId === input.localPlayerId)
    : undefined;
  if (local && local.x < centerX - span / 2 + padding) {
    centerX = local.x + span / 2 - padding;
  }

  return clampCamera({ centerX, span }, metrics);
}

export interface OffscreenPlayer {
  playerId: string;
  direction: 'left' | 'right' | 'top' | 'bottom';
}

/**
 * Players the camera can't include — the readout flags these as off screen,
 * with which side they fell off so the marker can point that way.
 *
 * Both axes, deliberately. The camera is fitted on x alone, so for a long time
 * this only tested x — and a field bunched on one segment stacks UPWARD, which
 * meant row-stacked avatars could be drawn entirely above the canvas with the
 * readout reporting nobody missing. x is checked first: a player can in
 * principle fall out on both axes at once, and the horizontal edge is the one
 * the camera actually chases, so it wins ties.
 *
 * y needs the rig's vertical extent to be meaningful, and `framing.ts` must not
 * import renderer code, so it takes RIG_TOP/RIG_BOTTOM through `geometry.ts` —
 * plain world-unit constants re-exported from the roster CONTENT that
 * `AvatarNode` also draws from. A player counts as visible when any part of
 * that extent is on the canvas: the world band shrinks to 28vh during a
 * question (components/PixiStage.tsx), where a clipped head is by design and
 * flagging the entire field would be noise.
 */
export function offscreenPlayerIds(
  anchors: readonly MarkerAnchor[],
  camera: CameraState,
  viewport: Viewport,
): OffscreenPlayer[] {
  const scale = worldScale(camera, viewport);
  const result: OffscreenPlayer[] = [];
  for (const a of anchors) {
    const x = worldXToScreen(a.x, camera, viewport);
    if (x < 0) {
      result.push({ playerId: a.playerId, direction: 'left' });
      continue;
    }
    if (x > viewport.width) {
      result.push({ playerId: a.playerId, direction: 'right' });
      continue;
    }
    const y = worldYToScreen(a.y, camera, viewport);
    if (y + RIG_TOP * scale > viewport.height) {
      result.push({ playerId: a.playerId, direction: 'bottom' });
      continue;
    }
    if (y + RIG_BOTTOM * scale < 0) {
      result.push({ playerId: a.playerId, direction: 'top' });
    }
  }
  return result;
}
