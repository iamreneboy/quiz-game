import { describe, it, expect } from 'vitest';
import {
  PROFILE_STORAGE_KEY,
  resolveProfile,
  type DeviceSignals,
} from '@/lib/presentation/profile';

const capable: DeviceSignals = {
  prefersReducedMotion: false,
  deviceMemory: 8,
  hardwareConcurrency: 8,
  coarsePointer: false,
  narrowViewport: false,
};

const signals = (over: Partial<DeviceSignals>): DeviceSignals => ({ ...capable, ...over });

describe('resolveProfile — automatic heuristic', () => {
  it('a capable device gets the high profile', () => {
    expect(resolveProfile(capable, 'auto')).toBe('high');
  });

  it('prefers-reduced-motion forces the reduced profile', () => {
    expect(resolveProfile(signals({ prefersReducedMotion: true }), 'auto')).toBe('reduced');
  });

  it('less than 4GB of device memory leans reduced', () => {
    expect(resolveProfile(signals({ deviceMemory: 2 }), 'auto')).toBe('reduced');
    expect(resolveProfile(signals({ deviceMemory: 4 }), 'auto')).toBe('high');
  });

  it('fewer than 4 logical cores leans reduced', () => {
    expect(resolveProfile(signals({ hardwareConcurrency: 2 }), 'auto')).toBe('reduced');
    expect(resolveProfile(signals({ hardwareConcurrency: 4 }), 'auto')).toBe('high');
  });

  it('a coarse pointer alone is not enough — it must come with a narrow viewport', () => {
    expect(resolveProfile(signals({ coarsePointer: true }), 'auto')).toBe('high');
    expect(resolveProfile(signals({ narrowViewport: true }), 'auto')).toBe('high');
    expect(resolveProfile(signals({ coarsePointer: true, narrowViewport: true }), 'auto')).toBe('reduced');
  });

  it('unknown capability signals are not treated as weak', () => {
    expect(resolveProfile(signals({ deviceMemory: null, hardwareConcurrency: null }), 'auto')).toBe('high');
  });
});

describe('resolveProfile — manual override precedence', () => {
  it('an explicit high override beats every reduced-leaning signal, including reduced-motion', () => {
    const weak = signals({
      prefersReducedMotion: true,
      deviceMemory: 1,
      hardwareConcurrency: 2,
      coarsePointer: true,
      narrowViewport: true,
    });
    expect(resolveProfile(weak, 'high')).toBe('high');
  });

  it('an explicit reduced override beats a capable device', () => {
    expect(resolveProfile(capable, 'reduced')).toBe('reduced');
  });
});

describe('persistence key', () => {
  it('uses the project localStorage prefix', () => {
    expect(PROFILE_STORAGE_KEY).toBe('cb:settings:profile');
  });
});
