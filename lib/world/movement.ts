/**
 * The movement grammar (spec §4): anticipate -> launch -> travel -> settle.
 *
 * Pure — no Pixi, no clock of its own. `elapsedMs` is measured from the start
 * of the SEQUENCE, not from this track's delay; the stagger is applied here.
 *
 * The overshoot in "boost -> move -> overshoot -> settle" is not hand-rolled:
 * EASE.settle's [0.34, 1.4, 0.5, 1] rises above 1 by construction, so the
 * P0 token supplies it.
 */
import { DURATION, EASE } from '@/lib/presentation/tokens';
import type { Profile } from '@/lib/presentation/profile';
import { cubicBezierEase } from './camera';

export const ANTICIPATE_MS = DURATION.cut; // 120
export const TRAVEL_MS = DURATION.settle; // 460
export const SETTLE_MS = DURATION.beat; // 260
export const MOVEMENT_MS = ANTICIPATE_MS + TRAVEL_MS + SETTLE_MS; // 840

/** Per-player offset so the eye can follow a field of eight. */
export const STAGGER_MS = 60;

const CROUCH_X = 0.1;
const CROUCH_Y = 0.12;
const STRETCH_X = 0.08;
const STRETCH_Y = 0.15;
const IMPACT = 0.06;

export interface MovementTrack {
  playerId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Stagger offset from the sequence start, in ms. */
  delayMs: number;
}

export interface MovementSample {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  /** Boost-trail emission, 0..1; non-zero only during travel. */
  trail: number;
}

const REST = { scaleX: 1, scaleY: 1, trail: 0 } as const;

/** Back-marker first, so a pass reads as the passer arriving after the passed. */
export function staggerFor(index: number, profile: Profile): number {
  return profile === 'reduced' ? 0 : index * STAGGER_MS;
}

/**
 * The instant a passer's x reaches the player it passed (spec §4: "found by
 * sampling the movement curve for where the passer's x crosses the passed
 * player's"). Measured from the SEQUENCE start, like every other timeline
 * instant, so the caller can schedule against it directly.
 *
 * It has to be sampled rather than solved: the stagger puts the two tracks on
 * different clocks and `EASE.settle` overshoots past 1, so neither a closed
 * form nor a fixed fraction of the travel is the crossing in general.
 *
 * Returns null when there is no crossing to time — the passer already starts
 * ahead (a reload with no held anchors gives both tracks the same from and to),
 * or the sampled curves never actually cross inside the movement window. The
 * caller falls back to mid-travel, which is what the whole phase used before.
 */
export function crossingTime(
  passer: MovementTrack,
  passed: MovementTrack,
  profile: Profile,
  stepMs = 8,
): number | null {
  const lead = (t: number) =>
    sampleMovement(passer, t, profile).x - sampleMovement(passed, t, profile).x;

  if (lead(0) >= 0) return null;

  const end = Math.max(passer.delayMs, passed.delayMs) + MOVEMENT_MS;
  let previous = lead(0);
  for (let t = stepMs; t <= end; t += stepMs) {
    const current = lead(t);
    if (current >= 0) {
      // Linear interpolation inside the step the sign change happened in.
      const span = current - previous;
      return span === 0 ? t : t - stepMs * (current / span);
    }
    previous = current;
  }
  return null;
}

export function sampleMovement(
  track: MovementTrack,
  elapsedMs: number,
  profile: Profile,
): MovementSample {
  const { from, to } = track;

  // Reduced snaps, matching P1's Markers and the spec §8 ladder.
  if (profile === 'reduced') return { x: to.x, y: to.y, ...REST };

  const t = elapsedMs - track.delayMs;
  if (t <= 0) return { x: from.x, y: from.y, ...REST };
  if (t >= MOVEMENT_MS) return { x: to.x, y: to.y, ...REST };

  if (t < ANTICIPATE_MS) {
    const k = t / ANTICIPATE_MS;
    return {
      x: from.x,
      y: from.y,
      scaleX: 1 + CROUCH_X * k,
      scaleY: 1 - CROUCH_Y * k,
      trail: 0,
    };
  }

  if (t < ANTICIPATE_MS + TRAVEL_MS) {
    const k = (t - ANTICIPATE_MS) / TRAVEL_MS;
    const eased = cubicBezierEase(EASE.settle, k);
    return {
      x: from.x + (to.x - from.x) * eased,
      y: from.y + (to.y - from.y) * eased,
      // Stretch peaks at launch and decays across the travel.
      scaleX: 1 - STRETCH_X * (1 - k),
      scaleY: 1 + STRETCH_Y * (1 - k),
      trail: 1 - k,
    };
  }

  // Landing: a damped squash starting at peak. The discontinuity against the
  // travel's end scale IS the impact — it is what sells the landing.
  const k = (t - ANTICIPATE_MS - TRAVEL_MS) / SETTLE_MS;
  const wobble = Math.cos(k * Math.PI * 2) * (1 - k);
  return {
    x: to.x,
    y: to.y,
    scaleX: 1 + IMPACT * wobble,
    scaleY: 1 - IMPACT * wobble,
    trail: 0,
  };
}
