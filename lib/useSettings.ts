import { create } from 'zustand';
import { loadMuted, saveMuted } from './audio/mutePreference';
import {
  loadOverride,
  readDeviceSignals,
  resolveProfile,
  saveOverride,
  type Profile,
  type ProfileOverride,
} from './presentation/profile';

export interface SettingsState {
  /** False until the client has read localStorage and the device signals. */
  hydrated: boolean;
  override: ProfileOverride;
  /** The effective profile. Later phases read exactly this: useSettings(s => s.profile). */
  profile: Profile;
  /** Per-device audio mute. Later phases read exactly this. */
  muted: boolean;
  setMuted(value: boolean): void;
  hydrate(): void;
  setOverride(value: ProfileOverride): void;
}

/** Publish to CSS/DOM so stylesheets and tests can respond without a React render. */
function publish(profile: Profile, muted: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.profile = profile;
  document.documentElement.dataset.muted = String(muted);
}

export const useSettings = create<SettingsState>((set, get) => ({
  // SSR-safe defaults; the real values land in hydrate().
  hydrated: false,
  override: 'auto',
  profile: 'high',
  muted: false,

  hydrate() {
    if (get().hydrated) return;
    const override = loadOverride();
    const muted = loadMuted();
    const profile = resolveProfile(readDeviceSignals(), override);
    publish(profile, muted);
    set({ hydrated: true, override, profile, muted });
  },

  setOverride(value) {
    saveOverride(value);
    const profile = resolveProfile(readDeviceSignals(), value);
    publish(profile, get().muted);
    set({ override: value, profile });
  },

  setMuted(value) {
    saveMuted(value);
    publish(get().profile, value);
    set({ muted: value });
  },
}));
