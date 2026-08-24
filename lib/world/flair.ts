/**
 * Top-three flair, leader emphasis, and the contested-edge turbo flame
 * (spec §5, PRD §6, §8). Pure.
 *
 * One gate governs all three: nothing is awarded until somebody has actually
 * advanced. At the start line everyone is tied on zero, rank 0 is arbitrary,
 * and handing out gold plus a turbo flame to whoever happens to sort first is
 * noise that undercuts the flair when it becomes real.
 */
import type { MarkerAnchor } from './geometry';

/** PRD §8: "the leader's avatar renders slightly larger". */
export const LEADER_EMPHASIS = 1.12;

/**
 * Consecutive-hit VFX tier: 3 spark trail, 5 flames, 8 inferno (PRD §8).
 * Defined here rather than in the choreographer because it is derived from
 * standings, which is what makes it survive a reload (ADR-0013).
 */
export type StreakTier = 0 | 3 | 5 | 8;

export function streakTierFor(currentStreak: number): StreakTier {
  if (currentStreak >= 8) return 8;
  if (currentStreak >= 5) return 5;
  if (currentStreak >= 3) return 3;
  return 0;
}

/** Structural subset of `Standing`; matched by shape to stay decoupled. */
export interface FlairStanding {
  player_id: string;
  correct: number;
  speed_points: number;
  /** The CURRENT run, not the best one — `Standing.current_streak`. */
  current_streak: number;
}

export interface Flair {
  medal: 'gold' | 'silver' | 'bronze' | null;
  /** Scale multiplier; 1 for everyone but the leader. */
  emphasis: number;
  edgeHolder: boolean;
  streakTier: StreakTier;
}

const MEDALS = ['gold', 'silver', 'bronze'] as const;
const NO_FLAIR: Flair = { medal: null, emphasis: 1, edgeHolder: false, streakTier: 0 };

export function flairFor(
  standings: readonly FlairStanding[],
  anchors: readonly MarkerAnchor[],
): Map<string, Flair> {
  const flair = new Map<string, Flair>();
  const active = standings.some(s => s.correct > 0);

  if (!active) {
    for (const s of standings) flair.set(s.player_id, NO_FLAIR);
    return flair;
  }

  // A segment with one occupant is uncontested — nobody is holding an edge.
  const occupancy = new Map<number, number>();
  for (const a of anchors) occupancy.set(a.segment, (occupancy.get(a.segment) ?? 0) + 1);

  const rowByPlayer = new Map(anchors.map(a => [a.playerId, a]));

  standings.forEach((s, index) => {
    const anchor = rowByPlayer.get(s.player_id);
    const contested = anchor ? (occupancy.get(anchor.segment) ?? 0) > 1 : false;
    flair.set(s.player_id, {
      medal: index < MEDALS.length ? MEDALS[index] : null,
      emphasis: index === 0 ? LEADER_EMPHASIS : 1,
      edgeHolder: contested && anchor!.rank === 0,
      streakTier: streakTierFor(s.current_streak),
    });
  });

  return flair;
}
