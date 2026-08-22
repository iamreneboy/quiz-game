/**
 * Framing (spec §5) — turns marker positions into a camera target.
 *
 * Pure. Deliberately independent of viewport aspect: the shot is chosen in
 * world units, and layout decides how tall the window showing it is.
 */
import {
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
import { clampCamera, spanLimits } from './camera';

export type FramingMode = 'startLine' | 'establishing' | 'pack' | 'emphasis';

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

/** Where the leader sits across the frame when the field overflows: 0.5 == centre. */
const LEADER_BIAS = 0.8;

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
  // leader may be, and gets a chevron in the readout instead.
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

/**
 * Players the camera can't include — the readout renders these as chevrons.
 *
 * Both axes, deliberately. The camera is fitted on x alone, so for a long time
 * this only tested x — and a field bunched on one segment stacks UPWARD, which
 * meant row-stacked avatars could be drawn entirely above the canvas with the
 * readout reporting nobody missing.
 *
 * y needs the rig's vertical extent to be meaningful, and `framing.ts` must not
 * import renderer code, so it takes RIG_TOP/RIG_BOTTOM through `geometry.ts` —
 * plain world-unit constants re-exported from the roster CONTENT that
 * `AvatarNode` also draws from. A player counts as visible when any part of
 * that extent is on the canvas: the world band shrinks to 28vh during a
 * question (components/PixiStage.tsx), where a clipped head is by design and
 * chevroning the entire field would be noise.
 */
export function offscreenPlayerIds(
  anchors: readonly MarkerAnchor[],
  camera: CameraState,
  viewport: Viewport,
): string[] {
  const scale = worldScale(camera, viewport);
  return anchors
    .filter(a => {
      const x = worldXToScreen(a.x, camera, viewport);
      if (x < 0 || x > viewport.width) return true;
      const y = worldYToScreen(a.y, camera, viewport);
      return y + RIG_TOP * scale > viewport.height || y + RIG_BOTTOM * scale < 0;
    })
    .map(a => a.playerId);
}
