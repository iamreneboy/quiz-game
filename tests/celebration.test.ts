import { describe, it, expect } from 'vitest';
import {
  CELEBRATION_TIERS,
  isSubdued,
  resolveTier,
  tierRank,
  type CelebrationTier,
} from '@/lib/presentation/celebration';

describe('celebration scale', () => {
  it('pins the ordinal scale fixed by the M2 roadmap', () => {
    expect(CELEBRATION_TIERS).toEqual([
      'routine',
      'streakMilestone',
      'overtake',
      'finalQuestion',
      'victory',
    ]);
  });

  it('ranks strictly ascending so routine can never outrank a major moment', () => {
    const ranks = CELEBRATION_TIERS.map(tierRank);
    expect(ranks).toEqual([0, 1, 2, 3, 4]);
    for (let i = 1; i < ranks.length; i++) expect(ranks[i]).toBeGreaterThan(ranks[i - 1]);
  });
});

describe('resolveTier', () => {
  const cue = (tier: CelebrationTier) => ({ tier });

  it('returns the highest tier among simultaneous cues', () => {
    expect(resolveTier([cue('routine'), cue('overtake'), cue('streakMilestone')])).toBe('overtake');
  });

  it('is order-independent', () => {
    expect(resolveTier([cue('victory'), cue('routine')])).toBe('victory');
    expect(resolveTier([cue('routine'), cue('victory')])).toBe('victory');
  });

  it('a victory cue beats a final-question cue', () => {
    expect(resolveTier([cue('finalQuestion'), cue('victory')])).toBe('victory');
  });

  it('defaults to routine for an empty batch', () => {
    expect(resolveTier([])).toBe('routine');
  });
});

describe('isSubdued', () => {
  it('is true for a cue below the resolved tier', () => {
    expect(isSubdued('routine', 'overtake')).toBe(true);
  });

  it('is false for the cue that set the resolved tier', () => {
    expect(isSubdued('overtake', 'overtake')).toBe(false);
  });
});
