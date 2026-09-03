/**
 * Spatial zone blending and the global mood grade (spec §6).
 *
 * Zones are laid end to end ALONG the track, so a stretched field can straddle
 * two of them. Ranges are proportional to track length, so a four-question game
 * still visits all three. The grade is deliberately separate from zone blending:
 * it is the single dial P3 turns for the final-question transformation.
 */
import type { TrackMetrics } from './geometry';

export type ZoneId = 'officePark' | 'neonCity' | 'stadium';

export const ZONE_ORDER: readonly ZoneId[] = ['officePark', 'neonCity', 'stadium'];

/** Crossfade band width, as a fraction of track length. */
export const ZONE_OVERLAP = 0.12;

export type ZoneWeights = Record<ZoneId, number>;

const BOUNDARIES = [1 / 3, 2 / 3];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function zoneWeights(worldX: number, metrics: TrackMetrics): ZoneWeights {
  const p = clamp01(worldX / metrics.length);
  const half = ZONE_OVERLAP / 2;
  const weights: ZoneWeights = { officePark: 0, neonCity: 0, stadium: 0 };

  for (const [index, boundary] of BOUNDARIES.entries()) {
    if (p >= boundary - half && p <= boundary + half) {
      const t = (p - (boundary - half)) / (half * 2);
      weights[ZONE_ORDER[index]] = 1 - t;
      weights[ZONE_ORDER[index + 1]] = t;
      return weights;
    }
  }

  const zone = p < BOUNDARIES[0] ? ZONE_ORDER[0] : p < BOUNDARIES[1] ? ZONE_ORDER[1] : ZONE_ORDER[2];
  weights[zone] = 1;
  return weights;
}

/**
 * `neutral` tints toward `night`; `city`/`stadium` are the final-question
 * wash, keyed off the dominant zone so it grades hot in the arena rather than
 * overriding the stadium's gold/silver identity with the city's magenta
 * (ADR-0056). `officePark` has no accent of its own, so it takes the city's.
 */
export type GradeHue = 'neutral' | 'city' | 'stadium';

export interface GradeState {
  /** 0..1 overlay strength. */
  intensity: number;
  hue: GradeHue;
}

const GRADE_FLOOR = 0.22;
const GRADE_RANGE = 0.38;
const GRADE_PEAK = 0.92;

/**
 * Reduced profile: collapse a crossfade to a hard switch at the boundary, so
 * only one zone's layers ever draw (spec §9 ladder). Ties go to the earlier
 * zone, which keeps the switch stable as the camera creeps forward.
 */
export function dominantZone(weights: ZoneWeights): ZoneId {
  let dominant: ZoneId = ZONE_ORDER[0];
  for (const zone of ZONE_ORDER) {
    if (weights[zone] > weights[dominant]) dominant = zone;
  }
  return dominant;
}

/**
 * @param progress   0..1 through the game (round / total_rounds)
 * @param escalation 0..1 from the director; 1 during the final question
 * @param zone       the dominant zone at the camera's current position
 */
export function gradeState(progress: number, escalation: number, zone: ZoneId): GradeState {
  const p = clamp01(progress);
  const e = clamp01(escalation);
  const base = GRADE_FLOOR + GRADE_RANGE * p;
  const hue: GradeHue = e === 0 ? 'neutral' : zone === 'stadium' ? 'stadium' : 'city';
  return { intensity: base + (GRADE_PEAK - base) * e, hue };
}

export function quantizeZoneWeights(weights: ZoneWeights): ZoneWeights {
  return { officePark: 0, neonCity: 0, stadium: 0, [dominantZone(weights)]: 1 };
}
