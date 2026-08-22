/**
 * Round-scoped persistence of the local player's committed answer (spec §8.1).
 *
 * `myAnswer` lives only in memory (lib/store.ts:19) and `submit_answer` raises
 * `already answered` on the duplicate insert (0002_rpcs.sql:344), so without
 * this a reload mid-ANSWER re-enables the buttons and the next tap surfaces
 * that raw Postgres string as the error text.
 *
 * sessionStorage rather than localStorage on purpose: a lock is meaningful for
 * exactly one tab for exactly one round. Browser-only, and never throws —
 * private-mode failures simply mean the lock does not persist.
 */

export const ANSWER_LOCK_PREFIX = 'cb:answer';

export function answerLockKey(code: string, round: number): string {
  return `${ANSWER_LOCK_PREFIX}:${code.toUpperCase()}:${round}`;
}

function isChoice(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3;
}

export function loadAnswerLock(code: string, round: number): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(answerLockKey(code, round));
    if (raw === null) return null;
    const parsed = Number(raw);
    return isChoice(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveAnswerLock(code: string, round: number, choice: number): void {
  if (typeof window === 'undefined' || !isChoice(choice)) return;
  try {
    window.sessionStorage.setItem(answerLockKey(code, round), String(choice));
  } catch {
    // Storage unavailable; the lock just won't survive a reload.
  }
}

export function clearAnswerLock(code: string, round: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(answerLockKey(code, round));
  } catch {
    // Nothing to do — the key is round-scoped, so a stale entry is unreachable.
  }
}
