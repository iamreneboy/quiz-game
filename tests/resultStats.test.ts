import { describe, it, expect } from 'vitest';
import { NO_VALUE, formatAccuracy, formatAvg, resultStats } from '@/lib/results/stats';
import type { Standing } from '@/lib/types';

/** A complete, post-0004 standing. Override one field per test. */
function standing(over: Partial<Standing> = {}): Standing {
  return {
    player_id: 'p1', nickname: 'Ada', avatar: 'duck', color: '#f59e0b',
    correct: 9, speed_points: 120, longest_streak: 5, current_streak: 5,
    answered: 10, avg_answer_ms: 4200,
    ...over,
  };
}

describe('resultStats', () => {
  it('derives accuracy from correct/answered and the average in seconds', () => {
    const { accuracy, avgSeconds } = resultStats(standing());
    expect(accuracy).toBeCloseTo(0.9, 5);
    expect(avgSeconds).toBeCloseTo(4.2, 5);
  });

  it('returns null for both when the player never submitted', () => {
    // Spec decision 3: 0 answered is not 0% — it is unknown, and must read so.
    const { accuracy, avgSeconds } = resultStats(
      standing({ correct: 0, answered: 0, avg_answer_ms: null }),
    );
    expect(accuracy).toBeNull();
    expect(avgSeconds).toBeNull();
  });

  it('returns null for both against a pre-0004 database, by the same path', () => {
    const { accuracy, avgSeconds } = resultStats(
      standing({ answered: undefined, avg_answer_ms: undefined }),
    );
    expect(accuracy).toBeNull();
    expect(avgSeconds).toBeNull();
  });

  it('still reports accuracy when only the average is missing', () => {
    const { accuracy, avgSeconds } = resultStats(standing({ avg_answer_ms: null }));
    expect(accuracy).toBeCloseTo(0.9, 5);
    expect(avgSeconds).toBeNull();
  });

  it('treats a real zero as a fact, not as unknown', () => {
    const { accuracy, avgSeconds } = resultStats(
      standing({ correct: 0, answered: 4, avg_answer_ms: 0 }),
    );
    expect(accuracy).toBe(0);
    expect(avgSeconds).toBe(0);
  });
});

describe('formatAccuracy', () => {
  it('rounds to a whole percent', () => {
    expect(formatAccuracy(0.9)).toBe('90%');
    expect(formatAccuracy(2 / 3)).toBe('67%');
    expect(formatAccuracy(1)).toBe('100%');
  });

  it('renders a real zero as 0%, never as the dash', () => {
    expect(formatAccuracy(0)).toBe('0%');
  });

  it('renders unknown as the dash', () => {
    expect(formatAccuracy(null)).toBe(NO_VALUE);
  });
});

describe('formatAvg', () => {
  it('rounds to one decimal second', () => {
    expect(formatAvg(4.2)).toBe('4.2s');
    expect(formatAvg(4.249)).toBe('4.2s');
    expect(formatAvg(4.26)).toBe('4.3s');
    expect(formatAvg(12)).toBe('12.0s');
  });

  it('renders a real zero as 0.0s, never as the dash', () => {
    expect(formatAvg(0)).toBe('0.0s');
  });

  it('renders unknown as the dash', () => {
    expect(formatAvg(null)).toBe(NO_VALUE);
  });
});
