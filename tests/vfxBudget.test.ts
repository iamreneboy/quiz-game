import { describe, it, expect } from 'vitest';
import type { FrameStats } from '@/lib/world/perf';
import {
  DROP_THRESHOLD,
  RECOVERY_EVALUATIONS,
  allowanceFor,
  initialBudgetFor,
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

  it('drops turbo particles a level before streak particles (spec §8)', () => {
    // Turbo flame: particles at full, static sprite at lean AND minimal.
    expect(allowanceFor('full').turboParticles).toBe(true);
    expect(allowanceFor('lean').turboParticles).toBe(false);
    expect(allowanceFor('minimal').turboParticles).toBe(false);

    // Streak tier: particles through full and lean, static glow only at minimal.
    expect(allowanceFor('full').streakParticles).toBe(true);
    expect(allowanceFor('lean').streakParticles).toBe(true);
    expect(allowanceFor('minimal').streakParticles).toBe(false);
  });

  it('sheds the trail before anything else', () => {
    expect(allowanceFor('lean').trail).toBeLessThan(allowanceFor('full').trail);
    expect(allowanceFor('minimal').trail).toBe(0);
  });
});

describe('confetti allowance', () => {
  it('steps down the ladder with every other effect', () => {
    expect(allowanceFor('full').confetti).toBe(1);
    expect(allowanceFor('lean').confetti).toBe(0.5);
    expect(allowanceFor('minimal').confetti).toBe(0);
  });

  it('is zero on the reduced profile, which pins the budget at minimal', () => {
    const pinned = stepBudget(initialBudgetState, clean, 'reduced');
    expect(allowanceFor(pinned.level).confetti).toBe(0);
  });
});

describe('initialBudgetFor', () => {
  it('starts a reduced client at minimal, not full', () => {
    // A one-shot burst (confetti) fired before the first ~500ms tick has no
    // chance to self-correct the way continuous emitters do. A TV switched on
    // late lands mid-ceremony, which is the normal way to hit this.
    expect(initialBudgetFor('reduced')).toEqual({ level: 'minimal', cleanRuns: 0 });
  });

  it('starts every other profile where it starts today', () => {
    expect(initialBudgetFor('high')).toEqual(initialBudgetState);
  });

  it('agrees with what stepBudget would decide on its first tick', () => {
    for (const profile of ['high', 'reduced'] as const) {
      expect(stepBudget(initialBudgetFor(profile), { p50: 16, p95: 18, samples: 0, dropped: 0 }, profile))
        .toEqual(initialBudgetFor(profile));
    }
  });
});
