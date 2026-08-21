import { describe, it, expect } from 'vitest';
import { AVATARS } from '@/lib/avatars';
import { ROSTER, specFor } from '@/lib/world/content/roster';

describe('roster coverage', () => {
  it('covers every key in lib/avatars.ts exactly once', () => {
    const rosterKeys = ROSTER.map(a => a.key).sort();
    const avatarKeys = AVATARS.map(a => a.key).sort();
    expect(rosterKeys).toEqual(avatarKeys);
  });

  it('falls back to a known spec for an unrecognised key', () => {
    expect(specFor('not-a-real-avatar')).toBe(ROSTER[0]);
  });

  it('resolves a real key to its own spec', () => {
    expect(specFor('duck').key).toBe('duck');
  });
});

describe('spec shape', () => {
  it('gives every character mounts, a quirk and a height', () => {
    for (const spec of ROSTER) {
      expect(spec.height).toBeGreaterThan(0);
      expect(spec.idle.periodMs).toBeGreaterThan(0);
      expect(spec.idle.amount).toBeGreaterThan(0);
      expect(spec.idle.amount).toBeLessThanOrEqual(1);
      expect(['bob', 'sway', 'pulse', 'tilt']).toContain(spec.idle.kind);
      for (const mount of ['behind', 'front', 'crown'] as const) {
        expect(typeof spec.mounts[mount].x).toBe('number');
        expect(typeof spec.mounts[mount].y).toBe('number');
      }
      expect(typeof spec.draw).toBe('function');
    }
  });

  it('varies the idle quirk across the roster', () => {
    expect(new Set(ROSTER.map(s => s.idle.kind)).size).toBeGreaterThan(1);
  });
});
