import { create } from 'zustand';
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
  hydrate(): void;
  setOverride(value: ProfileOverride): void;
}

/** Publish the profile to CSS so stylesheets can respond without a React render. */
function publish(profile: Profile): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.profile = profile;
}

export const useSettings = create<SettingsState>((set, get) => ({
  // SSR-safe defaults; the real values land in hydrate().
  hydrated: false,
  override: 'auto',
  profile: 'high',

  hydrate() {
    if (get().hydrated) return;
    const override = loadOverride();
    const profile = resolveProfile(readDeviceSignals(), override);
    publish(profile);
    set({ hydrated: true, override, profile });
  },

  setOverride(value) {
    saveOverride(value);
    const profile = resolveProfile(readDeviceSignals(), value);
    publish(profile);
    set({ override: value, profile });
  },
}));
