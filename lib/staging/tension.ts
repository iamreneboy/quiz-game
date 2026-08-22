/**
 * The ANSWER beat's escalation ramp (spec §4) — pure.
 *
 * Published two ways: the raw 0..1 value goes to a CSS custom property so it
 * never triggers a React render, and the quantized step drives the handful of
 * things React genuinely must re-render (the ring's color crossfade and its
 * last-seconds pulse).
 */

/** Escalation never starts more than this far out, however long the timer is. */
export const TENSION_WINDOW_MS = 8000;

export type TensionStep = 0 | 1 | 2 | 3;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** `remainingMs === null` (unknown deadline) is calm, not maximum pressure. */
export function tensionAt(remainingMs: number | null, totalMs: number): number {
  if (remainingMs === null || totalMs <= 0) return 0;
  const window = Math.min(totalMs, TENSION_WINDOW_MS);
  return clamp01(1 - remainingMs / window);
}

export function tensionStep(tension: number): TensionStep {
  if (tension <= 0) return 0;
  if (tension < 0.5) return 1;
  if (tension < 0.85) return 2;
  return 3;
}
