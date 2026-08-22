import { describe, it, expect } from 'vitest';
import { AVATARS } from '@/lib/avatars';
import {
  AVATAR_HALF_WIDTH,
  AVATAR_HEIGHT,
  AVATAR_RIG_BOTTOM,
  AVATAR_RIG_HEIGHT,
  AVATAR_RIG_TOP,
  ROSTER,
  specFor,
} from '@/lib/world/content/roster';

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

describe('the rig envelope', () => {
  it('spans from above the head to below the label', () => {
    expect(AVATAR_RIG_TOP).toBeLessThan(-AVATAR_HEIGHT);
    expect(AVATAR_RIG_BOTTOM).toBeGreaterThan(0);
    expect(AVATAR_RIG_HEIGHT).toBe(AVATAR_RIG_BOTTOM - AVATAR_RIG_TOP);
  });

  it('is taller than it is wide, which is why stacking is the tight axis', () => {
    expect(AVATAR_RIG_HEIGHT).toBeGreaterThan(AVATAR_HALF_WIDTH * 2);
  });

  it('keeps every mount inside the envelope', () => {
    for (const spec of ROSTER) {
      for (const mount of Object.values(spec.mounts)) {
        expect(mount.y).toBeGreaterThanOrEqual(AVATAR_RIG_TOP);
        expect(mount.y).toBeLessThanOrEqual(AVATAR_RIG_BOTTOM);
        expect(Math.abs(mount.x)).toBeLessThanOrEqual(AVATAR_HALF_WIDTH);
      }
    }
  });
});

describe('shared mounts', () => {
  it('types mounts readonly so one literal cannot be corrupted for all twelve', () => {
    const shared = ROSTER[0].mounts;
    for (const spec of ROSTER) expect(spec.mounts).toBe(shared);

    // Never invoked — its job is to make the compiler reject the write.
    const corrupt = () => {
      // @ts-expect-error mounts is readonly; this would move every character's crown.
      ROSTER[0].mounts.crown.y = 0;
    };
    expect(typeof corrupt).toBe('function');
  });
});
