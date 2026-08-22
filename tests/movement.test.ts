import { describe, it, expect } from 'vitest';
import {
  ANTICIPATE_MS,
  MOVEMENT_MS,
  STAGGER_MS,
  TRAVEL_MS,
  crossingTime,
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

// Spec §4: "Overtake lightning fires at the crossing instant, found by sampling
// the movement curve for where the passer's x crosses the passed player's."
describe('crossingTime', () => {
  const passer: MovementTrack = {
    playerId: 'passer', from: { x: 320, y: 0 }, to: { x: 960, y: 0 }, delayMs: 60,
  };
  const stationary: MovementTrack = {
    playerId: 'passed', from: { x: 640, y: 0 }, to: { x: 640, y: 0 }, delayMs: 0,
  };

  it('lands where the two x positions actually meet', () => {
    const t = crossingTime(passer, stationary, 'high');
    expect(t).not.toBeNull();
    expect(sampleMovement(passer, t!, 'high').x)
      .toBeCloseTo(sampleMovement(stationary, t!, 'high').x, 0);
  });

  it('is not the fixed 60%-of-travel instant it replaced', () => {
    const fixed = passer.delayMs + ANTICIPATE_MS + TRAVEL_MS * 0.6;
    expect(crossingTime(passer, stationary, 'high')).not.toBeCloseTo(fixed, 0);
  });

  it('falls inside the travel phase, after the anticipation crouch', () => {
    const t = crossingTime(passer, stationary, 'high')!;
    expect(t).toBeGreaterThan(passer.delayMs + ANTICIPATE_MS);
    expect(t).toBeLessThan(passer.delayMs + ANTICIPATE_MS + TRAVEL_MS);
  });

  it('accounts for the passed player moving on its own staggered clock', () => {
    const moving: MovementTrack = {
      playerId: 'passed', from: { x: 640, y: 0 }, to: { x: 960, y: 0 }, delayMs: 0,
    };
    const chasing: MovementTrack = {
      playerId: 'passer', from: { x: 320, y: 0 }, to: { x: 1280, y: 0 }, delayMs: 60,
    };
    const t = crossingTime(chasing, moving, 'high');
    expect(t).not.toBeNull();
    expect(sampleMovement(chasing, t!, 'high').x)
      .toBeCloseTo(sampleMovement(moving, t!, 'high').x, 0);
  });

  // The documented fallbacks — the caller schedules mid-travel for all three.
  it('returns null when the passer already starts ahead', () => {
    expect(crossingTime(stationary, passer, 'high')).toBeNull();
  });

  it('returns null when the two start level, as a same-segment tie does', () => {
    const level = { ...passer, from: { x: 640, y: 0 } };
    expect(crossingTime(level, stationary, 'high')).toBeNull();
  });

  it('returns null when the passer never reaches the passed player', () => {
    const short: MovementTrack = {
      playerId: 'passer', from: { x: 320, y: 0 }, to: { x: 420, y: 0 }, delayMs: 0,
    };
    expect(crossingTime(short, stationary, 'high')).toBeNull();
  });
});
