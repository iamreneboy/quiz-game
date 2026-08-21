/**
 * Camera math (spec §5). Pure — no Pixi, no clock of its own; `now` is passed in.
 *
 * Targets change on discrete cue boundaries rather than every frame, so camera
 * motion is a duration-driven tween on P0's named curves rather than a spring.
 */
import { DURATION, EASE } from '@/lib/presentation/tokens';
import type { Profile } from '@/lib/presentation/profile';
import { SEGMENT_WIDTH, type CameraState, type TrackMetrics } from './geometry';

/** Never push closer than this — markers stop reading as a field. */
export const MIN_SPAN_SEGMENTS = 2.5;

/** Legibility cap on the widest shot (spec §5, accepted edge). */
export const MAX_SPAN_SEGMENTS = 14;

/** World units of target change below which a new move is not worth starting. */
export const RETARGET_EPSILON = 8;

const DRIFT_AMPLITUDE = 0.015;
const DRIFT_PERIOD_MS = 11_000;

export type MoveStyle = 'cut' | 'drift';

export interface CameraMove {
  from: CameraState;
  to: CameraState;
  startedAt: number;
  durationMs: number;
  ease: [number, number, number, number];
}

export function spanLimits(metrics: TrackMetrics): { min: number; max: number } {
  const max = Math.min(metrics.length, MAX_SPAN_SEGMENTS * SEGMENT_WIDTH);
  return { min: Math.min(MIN_SPAN_SEGMENTS * SEGMENT_WIDTH, max), max };
}

export function clampCamera(state: CameraState, metrics: TrackMetrics): CameraState {
  const limits = spanLimits(metrics);
  const span = Math.min(Math.max(state.span, limits.min), limits.max);
  const half = span / 2;
  const boundsWidth = metrics.maxX - metrics.minX;

  // A span that covers the full track length can't be clamped to an edge — centre it instead.
  if (span >= metrics.length) {
    return { centerX: (metrics.minX + metrics.maxX) / 2, span };
  }

  const centerX = Math.min(Math.max(state.centerX, metrics.minX + half), metrics.maxX - half);
  return { centerX, span };
}

/** Cubic-bezier with implicit p0=(0,0) and p3=(1,1); Newton-Raphson on x. */
export function cubicBezierEase(
  [x1, y1, x2, y2]: readonly [number, number, number, number],
  progress: number,
): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;

  const curve = (a: number, b: number, t: number) => {
    const u = 1 - t;
    return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
  };

  let t = progress;
  for (let i = 0; i < 8; i++) {
    const error = curve(x1, x2, t) - progress;
    if (Math.abs(error) < 1e-5) break;
    const u = 1 - t;
    const slope = 3 * u * u * x1 + 6 * u * t * (x2 - x1) + 3 * t * t * (1 - x2);
    if (Math.abs(slope) < 1e-6) break;
    t = Math.min(1, Math.max(0, t - error / slope));
  }

  return curve(y1, y2, t);
}

/**
 * Debounce on when a new move is worth starting: no move in flight always
 * retargets; otherwise only a target drift past the epsilon (in either
 * centre or span) is worth interrupting the current move for.
 */
export function shouldRetarget(
  move: CameraMove | null,
  target: CameraState,
  epsilon: number = RETARGET_EPSILON,
): boolean {
  if (!move) return true;
  return (
    Math.abs(move.to.centerX - target.centerX) > epsilon ||
    Math.abs(move.to.span - target.span) > epsilon
  );
}

export function beginMove(
  from: CameraState,
  to: CameraState,
  style: MoveStyle,
  profile: Profile,
  now: number,
): CameraMove {
  // The reduced profile keeps cuts as cuts and shortens drifts to the same
  // length, so the camera still arrives but never lingers in motion.
  const isCut = style === 'cut' || profile === 'reduced';
  return {
    from,
    to,
    startedAt: now,
    durationMs: isCut ? DURATION.cut : DURATION.drift,
    ease: isCut ? EASE.snap : EASE.drift,
  };
}

export function sampleMove(move: CameraMove, now: number): CameraState {
  const elapsed = now - move.startedAt;
  if (elapsed <= 0) return move.from;
  if (elapsed >= move.durationMs) return move.to;

  const eased = cubicBezierEase(move.ease, elapsed / move.durationMs);
  return {
    centerX: move.from.centerX + (move.to.centerX - move.from.centerX) * eased,
    span: move.from.span + (move.to.span - move.from.span) * eased,
  };
}

export function isMoveComplete(move: CameraMove, now: number): boolean {
  return now - move.startedAt >= move.durationMs;
}

/** Ambient breathing on the camera. High profile only (spec §9 ladder). */
export function driftOffset(elapsedMs: number, camera: CameraState, profile: Profile): number {
  if (profile === 'reduced') return 0;
  return Math.sin((elapsedMs / DRIFT_PERIOD_MS) * Math.PI * 2) * camera.span * DRIFT_AMPLITUDE;
}
