/**
 * World geometry — the only place track coordinate math lives (spec §4).
 *
 * Pure and framework-free: no Pixi, no React, no store. Everything downstream
 * (camera, framing, scene, markers) converts through these functions so there
 * is exactly one definition of where a segment sits.
 */

/** World units per track segment. One segment == one question. */
export const SEGMENT_WIDTH = 320;

/** Run-off in world units past the start and finish lines. */
export const TRACK_MARGIN = 260;

/** Vertical gap between markers stacked on the same segment. */
export const MARKER_ROW_HEIGHT = 74;

/** Ground line as a fraction of viewport height. */
export const HORIZON_FRACTION = 0.72;

export interface TrackMetrics {
  /** Question count, never below 1. */
  segments: number;
  /** World-unit distance from the start line to the finish line. */
  length: number;
  minX: number;
  maxX: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** Zoom is expressed as visible world span, which makes clamping obvious. */
export interface CameraState {
  centerX: number;
  span: number;
}

/** Structural subset of `Standing`; matched by shape so this module stays decoupled. */
export interface AnchorStanding {
  player_id: string;
  correct: number;
  speed_points: number;
}

export interface MarkerAnchor {
  playerId: string;
  /** World x of the segment this player occupies. */
  x: number;
  /** World y; 0 is the ground row, negative values stack upward. */
  y: number;
  /** 0 == edge-holder (highest speed points on this segment). */
  row: number;
  segment: number;
}

export function trackMetrics(totalRounds: number): TrackMetrics {
  const segments = Math.max(1, Math.floor(totalRounds));
  const length = segments * SEGMENT_WIDTH;
  return { segments, length, minX: -TRACK_MARGIN, maxX: length + TRACK_MARGIN };
}

export function segmentToWorldX(segment: number): number {
  return segment * SEGMENT_WIDTH;
}

/** Pixels per world unit. */
export function worldScale(camera: CameraState, viewport: Viewport): number {
  return viewport.width / camera.span;
}

export function worldXToScreen(worldX: number, camera: CameraState, viewport: Viewport): number {
  return viewport.width / 2 + (worldX - camera.centerX) * worldScale(camera, viewport);
}

export function horizonY(viewport: Viewport): number {
  return viewport.height * HORIZON_FRACTION;
}

/**
 * Marker placement. Players tied on a segment stack vertically, ordered by
 * speed points so row 0 holds the edge — PRD §6's tiebreak rule made visible.
 * (P2 puts the turbo-flame on row 0; P1 only establishes the ordering.)
 */
export function markerAnchors(
  standings: readonly AnchorStanding[],
  metrics: TrackMetrics,
): MarkerAnchor[] {
  const bySegment = new Map<number, AnchorStanding[]>();
  for (const s of standings) {
    const segment = Math.min(Math.max(0, s.correct), metrics.segments);
    const group = bySegment.get(segment) ?? [];
    group.push(s);
    bySegment.set(segment, group);
  }

  const rows = new Map<string, number>();
  for (const group of bySegment.values()) {
    // Stable: equal speed points keep standings order, which is already ranked.
    const ordered = [...group].sort((a, b) => b.speed_points - a.speed_points);
    ordered.forEach((s, index) => rows.set(s.player_id, index));
  }

  return standings.map(s => {
    const segment = Math.min(Math.max(0, s.correct), metrics.segments);
    const row = rows.get(s.player_id) ?? 0;
    return {
      playerId: s.player_id,
      x: segmentToWorldX(segment),
      y: row > 0 ? -row * MARKER_ROW_HEIGHT : 0,
      row,
      segment,
    };
  });
}
