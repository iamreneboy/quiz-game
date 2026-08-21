/**
 * The VFX budget (spec §8) — this phase's answer to the runtime adaptation
 * ADR-0004 deferred to P2.
 *
 * It clamps PARTICLE OUTPUT ONLY. `useSettings().profile` is never written,
 * `WorldScene` is never reconstructed, and ADR-0004 stands unamended: the
 * profile remains a static startup heuristic plus a manual override.
 *
 * Medal glow and leader scale are absent from `VfxAllowance` by design — rank
 * is information, not decoration, so the budget structurally cannot shed it.
 */
import type { Profile } from '@/lib/presentation/profile';
import type { FrameStats } from './perf';

export type VfxLevel = 'minimal' | 'lean' | 'full';

/** Ascending, so a level's index is its rank. */
export const VFX_LEVELS: readonly VfxLevel[] = ['minimal', 'lean', 'full'];

/** 20% of perf.ts's 120-frame window. */
export const DROP_THRESHOLD = 24;

/** ~2s at runtime.ts's 500ms publish cadence. */
export const RECOVERY_EVALUATIONS = 4;

export interface BudgetState {
  level: VfxLevel;
  /** Consecutive clean evaluations since the last dropped frame. */
  cleanRuns: number;
}

export const initialBudgetState: BudgetState = { level: 'full', cleanRuns: 0 };

export interface VfxAllowance {
  /** false: draw static sprites instead of running particle systems. */
  particles: boolean;
  trail: number;
  streak: number;
  maxStreakTier: 0 | 3 | 5 | 8;
  /** Lightning and ignition bursts. */
  accent: number;
  arena: number;
  turbo: number;
}

const ALLOWANCES: Record<VfxLevel, VfxAllowance> = {
  full: { particles: true, trail: 1, streak: 1, maxStreakTier: 8, accent: 1, arena: 1, turbo: 1 },
  lean: { particles: true, trail: 0.5, streak: 0.6, maxStreakTier: 5, accent: 0.6, arena: 0.5, turbo: 0.5 },
  minimal: { particles: false, trail: 0, streak: 0.5, maxStreakTier: 3, accent: 0, arena: 0, turbo: 0.5 },
};

export function allowanceFor(level: VfxLevel): VfxAllowance {
  return ALLOWANCES[level];
}

function shift(level: VfxLevel, delta: number): VfxLevel {
  const index = VFX_LEVELS.indexOf(level) + delta;
  return VFX_LEVELS[Math.min(VFX_LEVELS.length - 1, Math.max(0, index))];
}

/**
 * Deliberately asymmetric so it cannot oscillate: one bad window sheds a level
 * immediately, but recovery needs RECOVERY_EVALUATIONS consecutive clean ones.
 * Same hysteresis instinct as `shouldRetarget` in camera.ts.
 */
export function stepBudget(state: BudgetState, stats: FrameStats, profile: Profile): BudgetState {
  if (profile === 'reduced') return { level: 'minimal', cleanRuns: 0 };
  if (stats.samples === 0) return state;

  if (stats.dropped > DROP_THRESHOLD) {
    return { level: shift(state.level, -1), cleanRuns: 0 };
  }

  if (stats.dropped > 0) {
    return { level: state.level, cleanRuns: 0 };
  }

  const cleanRuns = state.cleanRuns + 1;
  if (cleanRuns >= RECOVERY_EVALUATIONS) {
    return { level: shift(state.level, 1), cleanRuns: 0 };
  }
  return { level: state.level, cleanRuns };
}
