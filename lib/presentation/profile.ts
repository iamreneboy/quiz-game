/**
 * Performance profiles (spec §6, PRD §9).
 *
 * `resolveProfile` is pure and unit-tested. Everything below it touches the
 * browser and is deliberately not unit-tested — a static startup heuristic,
 * no runtime FPS watchdog in P0.
 */

export type Profile = 'high' | 'reduced';
export type ProfileOverride = 'auto' | 'high' | 'reduced';

export interface DeviceSignals {
  prefersReducedMotion: boolean;
  /** navigator.deviceMemory in GB, or null when unreported. */
  deviceMemory: number | null;
  /** navigator.hardwareConcurrency, or null when unreported. */
  hardwareConcurrency: number | null;
  coarsePointer: boolean;
  narrowViewport: boolean;
}

export const PROFILE_STORAGE_KEY = 'cb:settings:profile';

/** Viewport width below which a coarse pointer means "phone", not "touchscreen laptop". */
const NARROW_VIEWPORT_PX = 768;

/**
 * Precedence: an explicit manual override wins over everything, including
 * prefers-reduced-motion; otherwise reduced-motion forces `reduced`; otherwise
 * any reduced-leaning capability signal wins.
 */
export function resolveProfile(signals: DeviceSignals, override: ProfileOverride): Profile {
  if (override === 'high') return 'high';
  if (override === 'reduced') return 'reduced';

  if (signals.prefersReducedMotion) return 'reduced';
  if (signals.deviceMemory !== null && signals.deviceMemory < 4) return 'reduced';
  if (signals.hardwareConcurrency !== null && signals.hardwareConcurrency < 4) return 'reduced';
  if (signals.coarsePointer && signals.narrowViewport) return 'reduced';

  return 'high';
}

/** Browser-only. Gathered once at startup. */
export function readDeviceSignals(): DeviceSignals {
  if (typeof window === 'undefined') {
    return {
      prefersReducedMotion: false,
      deviceMemory: null,
      hardwareConcurrency: null,
      coarsePointer: false,
      narrowViewport: false,
    };
  }

  // deviceMemory is not in lib.dom yet and is absent on Safari/Firefox.
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;

  return {
    prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    deviceMemory: typeof memory === 'number' ? memory : null,
    hardwareConcurrency:
      typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    narrowViewport: window.innerWidth < NARROW_VIEWPORT_PX,
  };
}

/** Browser-only. Never throws — private-mode storage failures fall back to `auto`. */
export function loadOverride(): ProfileOverride {
  if (typeof window === 'undefined') return 'auto';
  try {
    const stored = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    return stored === 'high' || stored === 'reduced' || stored === 'auto' ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

/** Browser-only. Never throws. */
export function saveOverride(value: ProfileOverride): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, value);
  } catch {
    // Storage unavailable (private mode); the choice simply won't persist.
  }
}
