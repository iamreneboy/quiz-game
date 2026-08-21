/**
 * Framing (spec §5) — turns marker positions into a camera target.
 *
 * Pure. Deliberately independent of viewport aspect: the shot is chosen in
 * world units, and layout decides how tall the window showing it is.
 */
import {
  SEGMENT_WIDTH,
  segmentToWorldX,
  worldXToScreen,
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
    case 'startLine':
      return clampCamera(
        { centerX: segmentToWorldX(0), span: START_LINE_SEGMENTS * SEGMENT_WIDTH },
        metrics,
      );

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

/** Players the camera can't include — the readout renders these as chevrons. */
export function offscreenPlayerIds(
  anchors: readonly MarkerAnchor[],
  camera: CameraState,
  viewport: Viewport,
): string[] {
  return anchors
    .filter(a => {
      const x = worldXToScreen(a.x, camera, viewport);
      return x < 0 || x > viewport.width;
    })
    .map(a => a.playerId);
}
