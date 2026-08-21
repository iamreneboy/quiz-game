import { describe, it, expect } from 'vitest';
import {
  ANTICIPATE_MS,
  MOVEMENT_MS,
  STAGGER_MS,
  TRAVEL_MS,
  sampleMovement,
  staggerFor,
  type MovementTrack,
} from '@/lib/world/movement';

const track: MovementTrack = {
  playerId: 'a',
  from: { x: 0, y: 0 },
  to: { x: 320, y: -74 },
  delayMs: 0,
};

describe('sampleMovement (high profile)', () => {
  it('holds at the origin before its staggered delay', () => {
    const delayed = { ...track, delayMs: 120 };
    const s = sampleMovement(delayed, 60, 'high');
    expect(s.x).toBe(0);
    expect(s.scaleX).toBe(1);
    expect(s.trail).toBe(0);
  });

  it('crouches during anticipation without moving', () => {
    const s = sampleMovement(track, ANTICIPATE_MS / 2, 'high');
    expect(s.x).toBe(0);
    expect(s.scaleX).toBeGreaterThan(1);
    expect(s.scaleY).toBeLessThan(1);
    expect(s.trail).toBe(0);
  });

  it('stretches and trails at launch', () => {
    const s = sampleMovement(track, ANTICIPATE_MS + 1, 'high');
    expect(s.scaleY).toBeGreaterThan(1);
    expect(s.scaleX).toBeLessThan(1);
    expect(s.trail).toBeGreaterThan(0.9);
  });

  it('overshoots the destination during travel', () => {
    // EASE.settle's [0.34, 1.4, 0.5, 1] rises above 1 before returning.
    const samples = [];
    for (let t = ANTICIPATE_MS; t <= ANTICIPATE_MS + TRAVEL_MS; t += 5) {
      samples.push(sampleMovement(track, t, 'high').x);
    }
    expect(Math.max(...samples)).toBeGreaterThan(track.to.x);
  });

  it('rests at the destination once the movement is over', () => {
    const s = sampleMovement(track, MOVEMENT_MS + 500, 'high');
    expect(s).toEqual({ x: 320, y: -74, scaleX: 1, scaleY: 1, trail: 0 });
  });

  it('lands with an impact squash that damps to rest', () => {
    const landing = sampleMovement(track, ANTICIPATE_MS + TRAVEL_MS + 1, 'high');
    expect(landing.scaleX).toBeGreaterThan(1);
    expect(landing.scaleY).toBeLessThan(1);
    const settled = sampleMovement(track, MOVEMENT_MS - 1, 'high');
    expect(settled.scaleX).toBeCloseTo(1, 1);
  });
});

describe('sampleMovement (reduced profile)', () => {
  it('snaps to the destination with no squash or trail', () => {
    for (const t of [0, ANTICIPATE_MS, ANTICIPATE_MS + TRAVEL_MS, MOVEMENT_MS]) {
      expect(sampleMovement(track, t, 'reduced')).toEqual({
        x: 320, y: -74, scaleX: 1, scaleY: 1, trail: 0,
      });
    }
  });
});

describe('staggerFor', () => {
  it('offsets each player by a fixed step', () => {
    expect(staggerFor(0, 'high')).toBe(0);
    expect(staggerFor(3, 'high')).toBe(3 * STAGGER_MS);
  });

  it('is simultaneous under the reduced profile', () => {
    expect(staggerFor(3, 'reduced')).toBe(0);
  });

  it('keeps a full field inside the 4s TRACK beat', () => {
    expect(staggerFor(7, 'high') + MOVEMENT_MS).toBeLessThan(4000);
  });
});
