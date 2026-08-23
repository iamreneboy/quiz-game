/**
 * Per-device mute preference. Browser-only; never throws — a private-mode
 * storage failure just means the choice does not persist, exactly as
 * lib/presentation/profile.ts handles the motion override.
 */
export const MUTED_STORAGE_KEY = 'cb:settings:muted';

export function loadMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(MUTED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveMuted(value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MUTED_STORAGE_KEY, String(value));
  } catch {
    // Storage unavailable; the choice simply won't persist.
  }
}
