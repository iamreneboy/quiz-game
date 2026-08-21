import { describe, it, expect } from 'vitest';
import type { FrameStats } from '@/lib/world/perf';
import {
  DROP_THRESHOLD,
  RECOVERY_EVALUATIONS,
  allowanceFor,
  initialBudgetState,
  stepBudget,
  type BudgetState,
} from '@/lib/world/vfxBudget';

const stats = (dropped: number): FrameStats => ({ p50: 16, p95: 18, dropped, samples: 120 });
const busy = stats(DROP_THRESHOLD + 1);
const clean = stats(0);

function run(state: BudgetState, series: FrameStats[], profile: 'high' | 'reduced' = 'high') {
  return series.reduce((s, f) => stepBudget(s, f, profile), state);
}

describe('downgrade', () => {
  it('sheds one level under sustained drops', () => {
    expect(stepBudget(initialBudgetState, busy, 'high').level).toBe('lean');
  });

  it('sheds to minimal and stops there', () => {
    const floored = run(initialBudgetState, [busy, busy, busy, busy]);
    expect(floored.level).toBe('minimal');
  });

  it('holds without shedding when drops are present but under threshold', () => {
    const held = stepBudget(initialBudgetState, stats(DROP_THRESHOLD), 'high');
    expect(held.level).toBe('full');
  });
});

describe('recovery is asymmetric', () => {
  it('needs consecutive clean evaluations before upgrading', () => {
    let state = stepBudget(initialBudgetState, busy, 'high');
    expect(state.level).toBe('lean');

    for (let i = 0; i < RECOVERY_EVALUATIONS - 1; i++) {
      state = stepBudget(state, clean, 'high');
      expect(state.level).toBe('lean');
    }

    state = stepBudget(state, clean, 'high');
    expect(state.level).toBe('full');
  });

  it('resets the recovery run on any dropped frame', () => {
    let state = stepBudget(initialBudgetState, busy, 'high');
    state = run(state, [clean, clean, clean, stats(1), clean, clean, clean]);
    expect(state.level).toBe('lean');
  });

  it('does not oscillate on an alternating series', () => {
    const alternating = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? busy : clean));
    const state = run(initialBudgetState, alternating);
    expect(state.level).toBe('minimal');
  });
});

describe('profile interaction', () => {
  it('pins reduced at minimal and never upgrades it', () => {
    const state = run(initialBudgetState, [clean, clean, clean, clean, clean], 'reduced');
    expect(state.level).toBe('minimal');
  });

  it('ignores an empty window', () => {
    const empty: FrameStats = { p50: 0, p95: 0, dropped: 0, samples: 0 };
    expect(stepBudget(initialBudgetState, empty, 'high')).toEqual(initialBudgetState);
  });
});

describe('allowanceFor', () => {
  it('caps the streak tier as the level falls', () => {
    expect(allowanceFor('full').maxStreakTier).toBe(8);
    expect(allowanceFor('lean').maxStreakTier).toBe(5);
    expect(allowanceFor('minimal').maxStreakTier).toBe(3);
  });

  it('drops particles only at minimal', () => {
    expect(allowanceFor('full').particles).toBe(true);
    expect(allowanceFor('lean').particles).toBe(true);
    expect(allowanceFor('minimal').particles).toBe(false);
  });

  it('sheds the trail before anything else', () => {
    expect(allowanceFor('lean').trail).toBeLessThan(allowanceFor('full').trail);
    expect(allowanceFor('minimal').trail).toBe(0);
  });
});
