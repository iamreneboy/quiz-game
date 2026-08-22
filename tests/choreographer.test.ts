import { describe, it, expect } from 'vitest';
import type { Cue } from '@/lib/presentation/cues';
import { allowanceFor } from '@/lib/world/vfxBudget';
import { markerAnchors, startLineAnchors, trackMetrics, type MarkerAnchor } from '@/lib/world/geometry';
import { flairFor, type FlairStanding } from '@/lib/world/flair';
import { ANTICIPATE_MS, MOVEMENT_MS, TRAVEL_MS } from '@/lib/world/movement';
import {
  ARENA_AT_MS,
  PULSE_MS,
  SUBDUED_INTENSITY,
  avatarStates,
  beginSequence,
  bufferCue,
  completeSequence,
  holdAnchors,
  initialChoreographerState,
  isSequenceRunning,
  notePlayerJoined,
} from '@/lib/world/choreographer';

const metrics = trackMetrics(12);
const full = allowanceFor('full');

const s = (id: string, correct: number, speed = 0): FlairStanding => ({
  player_id: id, correct, speed_points: speed,
});

const before = [s('a', 1), s('b', 1)];
const after = [s('a', 2), s('b', 1)];
const anchorsBefore = markerAnchors(before, metrics);
const anchorsAfter = markerAnchors(after, metrics);

const advanced: Cue = { type: 'player-advanced', tier: 'routine', playerId: 'a', from: 1, to: 2 };
const overtook: Cue = { type: 'overtake', tier: 'overtake', playerId: 'a', passed: ['b'] };
const streak8: Cue = { type: 'streak-tier', tier: 'streakMilestone', playerId: 'a', streak: 8 };

function frame(state: Parameters<typeof avatarStates>[0], anchors: readonly MarkerAnchor[], now: number) {
  return avatarStates(state, anchors, flairFor(after, anchors), full, now, 'high');
}

describe('buffering', () => {
  it('holds the pre-reveal anchors while drama is pending', () => {
    const buffered = bufferCue(initialChoreographerState, advanced, anchorsBefore);
    const states = frame(buffered, anchorsAfter, 0);
    // 'a' is drawn at segment 1, not the segment 2 the standings already say.
    expect(states.find(v => v.playerId === 'a')!.x).toBe(anchorsBefore[0].x);
  });

  it('ignores cues that carry no drama', () => {
    const ignored: Cue = { type: 'answer-locked', tier: 'routine', choiceIndex: 2 };
    expect(bufferCue(initialChoreographerState, ignored, anchorsBefore))
      .toBe(initialChoreographerState);
  });
});

describe('the sequence', () => {
  it('plays the movement from the held anchors to the live ones', () => {
    let state = bufferCue(initialChoreographerState, advanced, anchorsBefore);
    state = beginSequence(state, anchorsAfter, 1000, 'high');
    expect(isSequenceRunning(state, 1000)).toBe(true);

    const settled = frame(state, anchorsAfter, 1000 + MOVEMENT_MS);
    expect(settled.find(v => v.playerId === 'a')!.x).toBe(anchorsAfter[0].x);
  });

  it('clears the queue when it starts', () => {
    let state = bufferCue(initialChoreographerState, advanced, anchorsBefore);
    state = beginSequence(state, anchorsAfter, 0, 'high');
    expect(state.pending).toEqual([]);
  });

  it('emits a boost trail during travel and not after', () => {
    let state = bufferCue(initialChoreographerState, advanced, anchorsBefore);
    state = beginSequence(state, anchorsAfter, 0, 'high');

    const travelling = frame(state, anchorsAfter, ANTICIPATE_MS + TRAVEL_MS / 2);
    expect(travelling.find(v => v.playerId === 'a')!.vfx.some(v => v.kind === 'trail')).toBe(true);

    const done = frame(state, anchorsAfter, MOVEMENT_MS + 10);
    expect(done.find(v => v.playerId === 'a')!.vfx.some(v => v.kind === 'trail')).toBe(false);
  });

  it('plays nothing when nobody scored', () => {
    const state = beginSequence(initialChoreographerState, anchorsAfter, 0, 'high');
    expect(isSequenceRunning(state, 0)).toBe(false);
  });
});

describe('tier arbitration', () => {
  it('subdues a below-headline effect rather than dropping it', () => {
    let state = bufferCue(initialChoreographerState, advanced, anchorsBefore);
    state = bufferCue(state, streak8, anchorsBefore);
    state = bufferCue(state, overtook, anchorsBefore); // overtake outranks streakMilestone
    state = beginSequence(state, anchorsAfter, 0, 'high');

    const at = frame(state, anchorsAfter, ANTICIPATE_MS + TRAVEL_MS + 10);
    const inferno = at.find(v => v.playerId === 'a')!.vfx.find(v => v.kind === 'inferno');
    expect(inferno).toBeDefined();
    expect(inferno!.intensity).toBeCloseTo(SUBDUED_INTENSITY, 5);
  });

  it('awards the arena reaction only to the headline tier', () => {
    let outranked = bufferCue(initialChoreographerState, streak8, anchorsBefore);
    outranked = bufferCue(outranked, overtook, anchorsBefore);
    outranked = beginSequence(outranked, anchorsAfter, 0, 'high');
    const suppressed = frame(outranked, anchorsAfter, ARENA_AT_MS + 10);
    expect(suppressed.some(v => v.vfx.some(x => x.kind === 'arena'))).toBe(false);

    let headline = bufferCue(initialChoreographerState, streak8, anchorsBefore);
    headline = beginSequence(headline, anchorsAfter, 0, 'high');
    const fired = frame(headline, anchorsAfter, ARENA_AT_MS + 10);
    expect(fired.some(v => v.vfx.some(x => x.kind === 'arena'))).toBe(true);
  });
});

describe('interruption and reload', () => {
  it('hard-completes to the final anchors on a phase change', () => {
    let state = bufferCue(initialChoreographerState, advanced, anchorsBefore);
    state = beginSequence(state, anchorsAfter, 0, 'high');
    state = completeSequence(state);

    expect(isSequenceRunning(state, 10)).toBe(false);
    const states = frame(state, anchorsAfter, 10);
    expect(states.find(v => v.playerId === 'a')!.x).toBe(anchorsAfter[0].x);
    expect(states.find(v => v.playerId === 'a')!.vfx.some(v => v.kind === 'trail')).toBe(false);
  });

  it('keeps persistent flair through a hard-complete', () => {
    let state = bufferCue(initialChoreographerState, streak8, anchorsBefore);
    state = beginSequence(state, anchorsAfter, 0, 'high');
    state = completeSequence(state);
    const states = frame(state, anchorsAfter, 10);
    const a = states.find(v => v.playerId === 'a')!;
    expect(a.medal).toBe('gold');
    expect(a.vfx.some(v => v.kind === 'inferno')).toBe(true);
  });

  it('renders a reload (empty queue) at the live anchors with flair intact', () => {
    const states = frame(initialChoreographerState, anchorsAfter, 5000);
    const a = states.find(v => v.playerId === 'a')!;
    expect(a.x).toBe(anchorsAfter[0].x);
    expect(a.medal).toBe('gold');
    expect(a.vfx.some(v => v.kind === 'trail')).toBe(false);
  });
});

describe('persistent flair', () => {
  it('carries the medal glow unclamped at every budget level', () => {
    const anchors = anchorsAfter;
    const states = avatarStates(
      initialChoreographerState, anchors, flairFor(after, anchors),
      allowanceFor('minimal'), 0, 'high',
    );
    const glow = states.find(v => v.playerId === 'a')!.vfx.find(v => v.kind === 'glow');
    expect(glow!.intensity).toBe(1);
  });

  it('caps the streak kind at the allowance ceiling', () => {
    let state = bufferCue(initialChoreographerState, streak8, anchorsBefore);
    state = beginSequence(state, anchorsAfter, 0, 'high');
    const states = avatarStates(
      state, anchorsAfter, flairFor(after, anchorsAfter),
      allowanceFor('lean'), MOVEMENT_MS + 10, 'high',
    );
    const kinds = states.find(v => v.playerId === 'a')!.vfx.map(v => v.kind);
    expect(kinds).toContain('flame');
    expect(kinds).not.toContain('inferno');
  });

  it('extinguishes a broken streak', () => {
    let state = bufferCue(initialChoreographerState, streak8, anchorsBefore);
    state = beginSequence(state, anchorsAfter, 0, 'high');
    state = completeSequence(state);
    state = bufferCue(state, { type: 'streak-broken', tier: 'routine', playerId: 'a' }, anchorsAfter);
    state = beginSequence(state, anchorsAfter, 10_000, 'high');
    const states = frame(state, anchorsAfter, 10_000 + MOVEMENT_MS);
    expect(states.find(v => v.playerId === 'a')!.vfx.some(v => v.kind === 'inferno')).toBe(false);
  });
});

describe('the lobby ready pulse', () => {
  it('pops and rings the newly joined avatar', () => {
    const state = notePlayerJoined(initialChoreographerState, 'a', 500);
    const states = frame(state, anchorsAfter, 600);
    const a = states.find(v => v.playerId === 'a')!;
    expect(a.vfx.some(v => v.kind === 'pulse')).toBe(true);
    expect(a.emphasis).toBeGreaterThan(flairFor(after, anchorsAfter).get('a')!.emphasis);
  });

  it('expires after PULSE_MS', () => {
    const state = notePlayerJoined(initialChoreographerState, 'a', 0);
    const states = frame(state, anchorsAfter, PULSE_MS + 1);
    expect(states.find(v => v.playerId === 'a')!.vfx.some(v => v.kind === 'pulse')).toBe(false);
  });

  it('is suppressed under the reduced profile', () => {
    const state = notePlayerJoined(initialChoreographerState, 'a', 0);
    const states = avatarStates(
      state, anchorsAfter, flairFor(after, anchorsAfter), full, 10, 'reduced',
    );
    expect(states.find(v => v.playerId === 'a')!.vfx.some(v => v.kind === 'pulse')).toBe(false);
  });
});

// Regression cover for the seam the runtime actually drives (ADR-0003). The
// store advances `phase` and `standings` in one set and the cue bridge runs
// after it, so by the time a drama cue is buffered the live anchors are already
// the DESTINATIONS. Without an earlier hold every track is zero-length and the
// TRACK beat animates nothing.
describe('holding the pre-reveal world', () => {
  it('moves the avatar from the held origin to the live destination', () => {
    // The runtime holds on `phase-answer`, where standings are still last round's.
    let state = holdAnchors(initialChoreographerState, anchorsBefore);
    // The reveal has landed: the drama cue arrives with the destinations.
    state = bufferCue(state, advanced, anchorsAfter);
    state = beginSequence(state, anchorsAfter, 1000, 'high');

    const track = state.sequence!.tracks.find(t => t.playerId === 'a')!;
    expect(track.from.x).toBe(anchorsBefore[0].x);
    expect(track.to.x).toBe(anchorsAfter[0].x);
    expect(track.from.x).not.toBe(track.to.x);
  });

  it('draws the avatar at the held origin while the reveal is on screen', () => {
    let state = holdAnchors(initialChoreographerState, anchorsBefore);
    state = bufferCue(state, advanced, anchorsAfter);
    expect(frame(state, anchorsAfter, 0).find(v => v.playerId === 'a')!.x)
      .toBe(anchorsBefore[0].x);
  });

  it('lets a later hold on the same beat overwrite an earlier one', () => {
    // countdown -> read -> answer: only the last settled beat should survive.
    let state = holdAnchors(initialChoreographerState, anchorsAfter);
    state = holdAnchors(state, anchorsBefore);
    state = bufferCue(state, advanced, anchorsAfter);
    state = beginSequence(state, anchorsAfter, 0, 'high');

    expect(state.sequence!.tracks.find(t => t.playerId === 'a')!.from.x)
      .toBe(anchorsBefore[0].x);
  });

  it('degrades to a still avatar when no hold was taken (mid-game reload)', () => {
    // Landing directly on `reveal` we do not know the pre-reveal world, so
    // bufferCue's `heldAnchors ?? liveAnchors` fallback must stand: no movement,
    // no throw.
    let state = bufferCue(initialChoreographerState, advanced, anchorsAfter);
    state = beginSequence(state, anchorsAfter, 0, 'high');

    const track = state.sequence!.tracks.find(t => t.playerId === 'a')!;
    expect(track.from.x).toBe(track.to.x);
    expect(track.from.x).toBe(anchorsAfter[0].x);
  });

  it('travels on round 1, from the start line to the first segment', () => {
    // Round 1 has no standings at all until its own reveal, so the pre-reveal
    // world is the start line rather than an empty anchor list.
    const roster = [{ id: 'a' }, { id: 'b' }];
    const line = startLineAnchors(roster, metrics);
    const afterRound1 = markerAnchors([s('a', 1), s('b', 0)], metrics);

    let state = holdAnchors(initialChoreographerState, line);
    state = bufferCue(state, advanced, afterRound1);
    state = beginSequence(state, afterRound1, 0, 'high');

    const track = state.sequence!.tracks.find(t => t.playerId === 'a')!;
    expect(track.from.x).toBe(line[0].x);
    expect(track.to.x).toBe(afterRound1[0].x);
    expect(track.from.x).not.toBe(track.to.x);
  });

  it('leaves everything else on the state untouched', () => {
    const seeded = notePlayerJoined(initialChoreographerState, 'a', 42);
    const held = holdAnchors(seeded, anchorsBefore);
    expect(held.pulses).toEqual(seeded.pulses);
    expect(held.pending).toEqual(seeded.pending);
    expect(held.sequence).toBe(seeded.sequence);
    expect(held.streakTier).toEqual(seeded.streakTier);
    expect(held.heldAnchors).toEqual(anchorsBefore);
  });
});

// M1: the stagger is a §8 ladder entry ("60ms per player / none — simultaneous"),
// and `beginSequence` used to hardcode 'high', leaving the reduced branch dead.
describe('the stagger follows the profile', () => {
  const build = (profile: 'high' | 'reduced') =>
    beginSequence(bufferCue(initialChoreographerState, advanced, anchorsBefore), anchorsAfter, 0, profile);

  it('runs a shorter sequence under reduced than under high', () => {
    // Two players: high staggers the second by STAGGER_MS, reduced does not.
    expect(isSequenceRunning(build('high'), MOVEMENT_MS)).toBe(true);
    expect(isSequenceRunning(build('reduced'), MOVEMENT_MS)).toBe(false);
  });

  it('still finishes at exactly the movement length under reduced', () => {
    const reduced = build('reduced');
    expect(isSequenceRunning(reduced, MOVEMENT_MS - 1)).toBe(true);
    expect(isSequenceRunning(reduced, MOVEMENT_MS)).toBe(false);
  });
});

// M2: spec §4 wants the COMPUTED crossing, not a fixed fraction of the travel.
describe('the overtake accent', () => {
  const beforePass: FlairStanding[] = [s('a', 1), s('b', 2)];
  const afterPass: FlairStanding[] = [s('a', 3), s('b', 2)];
  const heldPass = markerAnchors(beforePass, metrics);
  const livePass = markerAnchors(afterPass, metrics);
  const pass: Cue = { type: 'overtake', tier: 'overtake', playerId: 'a', passed: ['b'] };

  /** First elapsed ms at which 'a' is showing lightning. */
  function firesAt(state: Parameters<typeof avatarStates>[0], anchors: readonly MarkerAnchor[]) {
    for (let t = 0; t <= MOVEMENT_MS + 400; t += 2) {
      const states = avatarStates(state, anchors, flairFor(afterPass, anchors), full, t, 'high');
      if (states.find(v => v.playerId === 'a')!.vfx.some(v => v.kind === 'lightning')) return t;
    }
    return null;
  }

  it('fires where the passer actually draws level with the passed player', () => {
    let state = bufferCue(initialChoreographerState, pass, heldPass);
    state = beginSequence(state, livePass, 0, 'high');

    const at = firesAt(state, livePass);
    expect(at).not.toBeNull();

    const states = avatarStates(state, livePass, flairFor(afterPass, livePass), full, at!, 'high');
    const a = states.find(v => v.playerId === 'a')!;
    const b = states.find(v => v.playerId === 'b')!;
    // Sampled at 2ms and the accent window opens on the crossing, so 'a' is
    // level with 'b' to within one sampling step of travel.
    expect(a.x).toBeGreaterThanOrEqual(b.x - 1);
    expect(a.x - b.x).toBeLessThan(40);

    // ...and it is NOT the 60%-of-travel instant it used to be.
    const fixed = 60 + ANTICIPATE_MS + TRAVEL_MS * 0.6;
    expect(at!).toBeLessThan(fixed - 40);
  });

  it('falls back to mid-travel when the pair never cross — a same-segment tie', () => {
    // 'a' and 'b' both sit on segment 1, so the pass exists only in the
    // standings order: there is no x crossing to sample.
    let state = bufferCue(initialChoreographerState, overtook, anchorsBefore);
    state = beginSequence(state, anchorsAfter, 0, 'high');

    const at = firesAt(state, anchorsAfter);
    expect(at).not.toBeNull();
    expect(at!).toBeCloseTo(60 + ANTICIPATE_MS + TRAVEL_MS * 0.6, -1);
  });
});
