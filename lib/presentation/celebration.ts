/**
 * The celebration hierarchy (PRD §8, M2 roadmap decision 4).
 *
 * Every cue carries a tier. When several cues land at once, consumers resolve
 * the batch to its highest tier and render everything below it in subdued form,
 * so a routine correct answer can never spend the same energy as a victory.
 */

export const CELEBRATION_TIERS = [
  'routine',
  'streakMilestone',
  'overtake',
  'finalQuestion',
  'victory',
] as const;

export type CelebrationTier = (typeof CELEBRATION_TIERS)[number];

/** Position on the ordinal scale; higher wins. */
export function tierRank(tier: CelebrationTier): number {
  return CELEBRATION_TIERS.indexOf(tier);
}

/** Highest tier among simultaneous cues; `routine` when there are none. */
export function resolveTier(cues: readonly { tier: CelebrationTier }[]): CelebrationTier {
  let highest: CelebrationTier = 'routine';
  for (const cue of cues) {
    if (tierRank(cue.tier) > tierRank(highest)) highest = cue.tier;
  }
  return highest;
}

/** True when this cue should be rendered in subdued form given the resolved batch tier. */
export function isSubdued(tier: CelebrationTier, resolved: CelebrationTier): boolean {
  return tierRank(tier) < tierRank(resolved);
}
