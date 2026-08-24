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

/* TRACK_MARGIN is declared below GRID_EDGE_MARGIN — it is derived from the
   grid constants, which are themselves derived from the rig. */

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
 * pitch. Ties pair two-per-row (markerAnchors), so that is four rows' worth
 * of headcount before compression starts — a seven-way tie is already
 * compressing. That is intended — the pitch is a soft preference, the rise
 * is the hard cap.
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
  /** World x of the segment this player occupies, offset by `side` if paired. */
  x: number;
  /** World y; 0 is the ground row, negative values stack upward. */
  y: number;
  /** Vertical tier within the segment's stack; a tier holds up to 2 players. */
  row: number;
  /** 0-indexed rank by speed points within the segment's tie group; 0 == edge-holder (flair.ts). */
  rank: number;
  /** Which half of the row: -1 left, 1 right, 0 unpaired/centered. */
  side: -1 | 0 | 1;
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
export function stackPitch(rowCount: number, riseLimit: number = MAX_STACK_RISE): number {
  const rises = Math.max(1, rowCount - 1);
  return Math.min(MARKER_ROW_HEIGHT, riseLimit / rises);
}

/**
 * Marker placement. Players tied on a segment pair up two-per-row, ordered
 * by speed points — PRD §6's tiebreak rule made visible — offset left/right
 * in x rather than stacked one-per-row, so a tie reads as a pack instead of
 * a ladder. `rank` is the unique ordering within the tie (rank 0 holds the
 * edge; P2 puts the turbo-flame there via `flairFor`). An odd leftover
 * (or a lone occupant) sits centered, alone in its row.
 */
export function markerAnchors(
  standings: readonly AnchorStanding[],
  metrics: TrackMetrics,
  riseLimit: number = MAX_STACK_RISE,
): MarkerAnchor[] {
  const bySegment = new Map<number, AnchorStanding[]>();
  for (const s of standings) {
    const segment = Math.min(Math.max(0, s.correct), metrics.segments);
    const group = bySegment.get(segment) ?? [];
    group.push(s);
    bySegment.set(segment, group);
  }

  const ranks = new Map<string, number>();
  const rows = new Map<string, number>();
  const sides = new Map<string, -1 | 0 | 1>();
  // Each segment's stack compresses independently: a two-way tie keeps the full
  // pitch even when another segment is holding six.
  const pitches = new Map<string, number>();
  for (const group of bySegment.values()) {
    // Stable: equal speed points keep standings order, which is already ranked.
    const ordered = [...group].sort((a, b) => b.speed_points - a.speed_points);
    const rowCount = Math.ceil(ordered.length / 2);
    const pitch = stackPitch(rowCount, riseLimit);
    const lastOdd = ordered.length % 2 === 1 ? ordered.length - 1 : -1;
    ordered.forEach((s, index) => {
      const side: -1 | 0 | 1 = index === lastOdd ? 0 : index % 2 === 0 ? -1 : 1;
      ranks.set(s.player_id, index);
      rows.set(s.player_id, Math.floor(index / 2));
      sides.set(s.player_id, side);
      pitches.set(s.player_id, pitch);
    });
  }

  return standings.map(s => {
    const segment = Math.min(Math.max(0, s.correct), metrics.segments);
    const row = rows.get(s.player_id) ?? 0;
    const side = sides.get(s.player_id) ?? 0;
    return {
      playerId: s.player_id,
      x: segmentToWorldX(segment) + side * RIG_HALF_WIDTH,
      y: row > 0 ? -row * (pitches.get(s.player_id) ?? MARKER_ROW_HEIGHT) : 0,
      row,
      rank: ranks.get(s.player_id) ?? 0,
      side,
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
  riseLimit: number = MAX_STACK_RISE,
): MarkerAnchor[] {
  return markerAnchors(
    players.map(p => ({ player_id: p.id, correct: 0, speed_points: 0 })),
    metrics,
    riseLimit,
  );
}

/** Structural subset of `PlayerPublic` for the lobby formation. */
export interface GridPlayer {
  id: string;
}

/**
 * Maximum column spacing of the starting grid, in world units; compresses to
 * fit the run-off.
 *
 * Exactly one rig width, so adjacent same-row rigs touch and never overlap.
 * Derived rather than a literal for the same reason MARKER_ROW_HEIGHT is:
 * change the rig and this follows it.
 */
export const GRID_COLUMN_WIDTH = RIG_HALF_WIDTH * 2;

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
 * Run-off beyond each end of the track, in world units.
 *
 * Sized by what STANDS in it, not by a literal. The lobby grid lives entirely
 * in the run-off, and P1 sized this against a 52-unit marker puck that P2
 * replaced with a 90-unit rig — so once GRID_EDGE_MARGIN reserved room to draw
 * the rearmost rig whole, column spacing compressed from 73 to 51 and adjacent
 * rigs overlapped by about a third of their rim.
 *
 * Four columns at full spacing is what this reserves; `gridAnchors` holds
 * that cap for any field size (PRD §13's twenty-player maximum included) by
 * growing rows per column instead of compressing spacing past it.
 */
export const TRACK_MARGIN =
  GRID_LEAD_IN + GRID_EDGE_MARGIN + 3 * GRID_COLUMN_WIDTH;

/**
 * The lobby starting grid (spec §7): a staggered two-row race formation in the
 * run-off `TRACK_MARGIN` already reserves, so eight players read as a grid
 * rather than a queue. The run-off holds exactly four columns at full
 * `GRID_COLUMN_WIDTH` spacing (`TRACK_MARGIN`'s own `3 * GRID_COLUMN_WIDTH`
 * term reserves three gaps, i.e. four columns) — that cap stays fixed, and a
 * field too big for two rows of four grows a third, fourth, fifth row instead
 * of compressing column spacing. Deeper stacks compress their vertical pitch
 * to fit `riseLimit` rather than growing past it, the same trade
 * `markerAnchors` makes for a tied field. Join order is grid order.
 */
export function gridAnchors(
  players: readonly GridPlayer[],
  metrics: TrackMetrics,
  riseLimit: number = MAX_STACK_RISE,
): MarkerAnchor[] {
  const runOff = Math.max(0, -GRID_LEAD_IN - metrics.minX - GRID_EDGE_MARGIN);
  const maxColumns = Math.floor(runOff / GRID_COLUMN_WIDTH) + 1;
  const rowsPerColumn = Math.max(2, Math.ceil(players.length / maxColumns));
  const columns = Math.ceil(players.length / rowsPerColumn);
  const spacing = Math.min(GRID_COLUMN_WIDTH, runOff / Math.max(1, columns - 1));
  const rearmost = metrics.minX + GRID_EDGE_MARGIN;
  const pitch = stackPitch(rowsPerColumn, riseLimit);

  return players.map((player, index) => {
    const row = index % rowsPerColumn;
    const column = Math.floor(index / rowsPerColumn);
    return {
      playerId: player.id,
      x: Math.max(rearmost, -GRID_LEAD_IN - column * spacing),
      y: row > 0 ? -row * pitch : 0,
      row,
      // Grid order, not a tie group — rank/side are unused here (no flairFor
      // or x-offset pairing in the lobby), but MarkerAnchor requires them.
      rank: index,
      side: 0,
      segment: 0,
    };
  });
}
