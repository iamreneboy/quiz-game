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

/** Structural subset of `Standing`; matched by shape to stay decoupled. */
export interface FlairStanding {
  player_id: string;
  correct: number;
  speed_points: number;
}

export interface Flair {
  medal: 'gold' | 'silver' | 'bronze' | null;
  /** Scale multiplier; 1 for everyone but the leader. */
  emphasis: number;
  edgeHolder: boolean;
}

const MEDALS = ['gold', 'silver', 'bronze'] as const;
const NO_FLAIR: Flair = { medal: null, emphasis: 1, edgeHolder: false };

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
      edgeHolder: contested && anchor!.row === 0,
    });
  });

  return flair;
}
