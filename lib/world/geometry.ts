/**
 * World geometry — the only place track coordinate math lives (spec §4).
 *
 * Pure and framework-free: no Pixi, no React, no store. Everything downstream
 * (camera, framing, scene, markers) converts through these functions so there
 * is exactly one definition of where a segment sits.
 *
 * It imports the rig ENVELOPE from `content/roster` — plain numbers, no Pixi
 * (roster's only pixi.js import is `import type { Graphics }`, which is erased)
 * — because a row pitch and a formation margin are meaningless unless they are
 * expressed against the thing being placed. The literals that used to stand in
 * for them silently drifted from the renderer and put avatars off-canvas.
 */
import {
  AVATAR_HALF_WIDTH,
  AVATAR_HEIGHT,
  AVATAR_RIG_BOTTOM,
  AVATAR_RIG_TOP,
} from './content/roster';

/** World units per track segment. One segment == one question. */
export const SEGMENT_WIDTH = 320;

/** Run-off in world units past the start and finish lines. */
export const TRACK_MARGIN = 260;

/**
 * Vertical gap between markers stacked on the same segment.
 *
 * Derived from the rig, never a literal: at half a body height the row behind
 * clears the head of the row in front (heads start ~0.6 * AVATAR_HEIGHT up, the
 * front row's label top sits 0.5 * AVATAR_HEIGHT - AVATAR_LABEL_Y up), and the
 * deliberate overlap is what makes a tied field read as a pack rather than a
 * ladder. Change the rig and this follows it.
 */
export const MARKER_ROW_HEIGHT = AVATAR_HEIGHT * 0.5;

/**
 * How far the topmost row of a stack may sit above the ground row.
 *
 * At the minimum camera span (camera.ts's MIN_SPAN_SEGMENTS * SEGMENT_WIDTH,
 * 800 units) a viewport shows `SPAN * HORIZON_FRACTION * height / width` world
 * units above the ground line — 324 at 16:9. A rig reaches |AVATAR_RIG_TOP|
 * (135) above its own feet, so a rise past ~189 units puts the top rig's head
 * off the canvas. 1.4 rig-heights (179) keeps the whole stack inside a 16:9
 * frame with room to spare.
 *
 * Deeper stacks COMPRESS their pitch to fit this rather than growing past it —
 * the same trade `gridAnchors` already makes against the run-off, and the
 * reason a widened camera is the wrong answer: eight rows at full pitch is
 * 448 units against a frame showing 800 units of WIDTH, so framing the stack
 * makes every rig unreadable. Anything a narrower frame still cannot hold is
 * named by `offscreenPlayerIds` and flagged in the readout.
 *
 * Worth knowing: at MARKER_ROW_HEIGHT the rise only fits three rows at full
 * pitch, so a four-way tie is already compressing. That is intended — the
 * pitch is a soft preference, the rise is the hard cap.
 */
export const MAX_STACK_RISE = AVATAR_HEIGHT * 1.4;

/** Topmost point of an avatar rig in world units, relative to its anchor. */
export const RIG_TOP = AVATAR_RIG_TOP;

/** Bottommost point of an avatar rig in world units, relative to its anchor. */
export const RIG_BOTTOM = AVATAR_RIG_BOTTOM;

/** Half-width of an avatar rig in world units. */
export const RIG_HALF_WIDTH = AVATAR_HALF_WIDTH;

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

/** The vertical twin of `worldXToScreen`; y = 0 is the ground line. */
export function worldYToScreen(worldY: number, camera: CameraState, viewport: Viewport): number {
  return horizonY(viewport) + worldY * worldScale(camera, viewport);
}

/**
 * Pitch for a stack of `rowCount` markers. Full pitch while the stack fits
 * MAX_STACK_RISE; compressed to exactly fill it once it does not, so a stack
 * can never grow off the top of the frame no matter how deep the tie.
 */
export function stackPitch(rowCount: number): number {
  const rises = Math.max(1, rowCount - 1);
  return Math.min(MARKER_ROW_HEIGHT, MAX_STACK_RISE / rises);
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
  // Each segment's stack compresses independently: a two-way tie keeps the full
  // pitch even when another segment is holding six.
  const pitches = new Map<string, number>();
  for (const group of bySegment.values()) {
    // Stable: equal speed points keep standings order, which is already ranked.
    const ordered = [...group].sort((a, b) => b.speed_points - a.speed_points);
    const pitch = stackPitch(ordered.length);
    ordered.forEach((s, index) => {
      rows.set(s.player_id, index);
      pitches.set(s.player_id, pitch);
    });
  }

  return standings.map(s => {
    const segment = Math.min(Math.max(0, s.correct), metrics.segments);
    const row = rows.get(s.player_id) ?? 0;
    return {
      playerId: s.player_id,
      x: segmentToWorldX(segment),
      y: row > 0 ? -row * (pitches.get(s.player_id) ?? MARKER_ROW_HEIGHT) : 0,
      row,
      segment,
    };
  });
}

/**
 * Where the field stands before the first reveal. `standings` is null until a
 * round resolves (lib/store.ts:19), but the race has already started and the
 * countdown renders at the full band — so the avatars have to be somewhere.
 * Everyone is on segment 0, which is what `markerAnchors` already draws for a
 * field that is level.
 */
export function startLineAnchors(
  players: readonly { id: string }[],
  metrics: TrackMetrics,
): MarkerAnchor[] {
  return markerAnchors(
    players.map(p => ({ player_id: p.id, correct: 0, speed_points: 0 })),
    metrics,
  );
}

/** Structural subset of `PlayerPublic` for the lobby formation. */
export interface GridPlayer {
  id: string;
}

/** Maximum column spacing of the starting grid, in world units; compresses to fit the run-off. */
export const GRID_COLUMN_WIDTH = 90;

/** Gap between the front row and the start line. */
export const GRID_LEAD_IN = 40;

/**
 * How far inside the run-off the REARMOST column has to sit.
 *
 * `clampCamera` pins the camera's left edge to `metrics.minX`, so a formation
 * that reaches `minX` puts the rearmost rig's CENTRE on screen x = 0 and draws
 * half of it off-canvas. A rig's own half-width (RIG_HALF_WIDTH) is the
 * minimum; the extra half again absorbs the camera's ambient drift, which is
 * 1.5% of the span either way (camera.ts) — about 11 units at the lobby shot.
 */
export const GRID_EDGE_MARGIN = RIG_HALF_WIDTH * 1.5;

/**
 * The lobby starting grid (spec §7): a staggered two-row race formation in the
 * run-off `TRACK_MARGIN` already reserves, so eight players read as a grid
 * rather than a queue. The run-off is fixed, so column spacing compresses to
 * fit it rather than growing past it. Join order is grid order.
 */
export function gridAnchors(
  players: readonly GridPlayer[],
  metrics: TrackMetrics,
): MarkerAnchor[] {
  // The run-off is fixed, so the formation compresses to fit it rather than
  // clamping per column — a clamp piles every column past the margin onto the
  // same x, and the field can reach 20 (PRD section 13). The usable depth stops
  // GRID_EDGE_MARGIN short of the run-off so the rearmost rig is drawn whole.
  const columns = Math.ceil(players.length / 2);
  const runOff = Math.max(0, -GRID_LEAD_IN - metrics.minX - GRID_EDGE_MARGIN);
  const spacing = Math.min(GRID_COLUMN_WIDTH, runOff / Math.max(1, columns - 1));
  const rearmost = metrics.minX + GRID_EDGE_MARGIN;
  const pitch = stackPitch(2);

  return players.map((player, index) => {
    const row = index % 2;
    const column = Math.floor(index / 2);
    return {
      playerId: player.id,
      x: Math.max(rearmost, -GRID_LEAD_IN - column * spacing),
      y: row > 0 ? -row * pitch : 0,
      row,
      segment: 0,
    };
  });
}
