/**
 * The two numbers the results board exists to show (spec §4) — pure, tested,
 * no React, no store, no DOM.
 *
 * `answered` and `avg_answer_ms` are OPTIONAL on `Standing` because a pre-0004
 * database omits them (ADR-0028). This module returns `null` for an absent
 * field on exactly the same code path as for `answered === 0`, so the
 * degraded-server case and the honest-unknown case cannot diverge — one branch,
 * one rendering, one thing to keep true.
 *
 * The distinction that matters: `null` means UNKNOWN and renders as a dash;
 * `0` means zero and renders as `0%` / `0.0s`. A player who never submitted
 * must not read as 0% accuracy — that is a judgement, not a fact
 * (spec decision 3). Every check below is therefore `=== null`, never falsy.
 */
import type { Standing } from '@/lib/types';

/** The glyph for an unknown value. Components compare against this rather than re-deriving it. */
export const NO_VALUE = '—';

export interface ResultStats {
  /** 0..1, or null when the player never submitted / the field is absent. */
  accuracy: number | null;
  /** Seconds, or null on the same conditions. */
  avgSeconds: number | null;
}

export function resultStats(standing: Standing): ResultStats {
  // `?? 0` folds "absent field" into "answered nothing" — the one path.
  const answered = standing.answered ?? 0;
  if (answered <= 0) return { accuracy: null, avgSeconds: null };

  const avgMs = standing.avg_answer_ms;
  return {
    accuracy: standing.correct / answered,
    avgSeconds: typeof avgMs === 'number' ? avgMs / 1000 : null,
  };
}

/** Whole percent, as every accuracy in this app is quoted. */
export function formatAccuracy(accuracy: number | null): string {
  return accuracy === null ? NO_VALUE : `${Math.round(accuracy * 100)}%`;
}

/** One decimal second. */
export function formatAvg(avgSeconds: number | null): string {
  return avgSeconds === null ? NO_VALUE : `${avgSeconds.toFixed(1)}s`;
}
