import { describe, it, expect } from 'vitest';
import {
  bufferCallout,
  clearCallout,
  initialCalloutState,
  resetCallouts,
  resolveCallout,
  type CalloutState,
} from '@/lib/staging/callouts';
import type { Cue } from '@/lib/presentation/cues';

const NAMES: Record<string, string> = { a: 'Ren', b: 'Sam', c: 'Kit' };
const nameOf = (id: string) => NAMES[id] ?? id;

const overtake = (playerId: string, passed: string[]): Cue =>
  ({ type: 'overtake', tier: 'overtake', playerId, passed });
const streak = (playerId: string, s: 3 | 5 | 8): Cue =>
  ({ type: 'streak-tier', tier: 'streakMilestone', playerId, streak: s });
const leadChanged = (playerId: string, previousLeaderId: string): Cue =>
  ({ type: 'lead-changed', tier: 'overtake', playerId, previousLeaderId });
const finalQuestion = (round: number): Cue =>
  ({ type: 'final-question', tier: 'finalQuestion', round });

function bufferAll(cues: Cue[], from: CalloutState = initialCalloutState): CalloutState {
  return cues.reduce(bufferCallout, from);
}

describe('bufferCallout', () => {
  it('holds drama rather than resolving it on arrival', () => {
    const state = bufferAll([overtake('a', ['b'])]);
    expect(state.pending).toHaveLength(1);
    expect(state.callout).toBeNull();
  });

  it('ignores cues that are not drama or escalation', () => {
    const state = bufferAll([
      { type: 'phase-reveal', tier: 'routine', round: 1, correctIndex: 0, counts: [], fastest: null },
      { type: 'player-advanced', tier: 'routine', playerId: 'a', from: 0, to: 1 },
    ]);
    expect(state.pending).toHaveLength(0);
  });
});

describe('resolveCallout', () => {
  it('names the single buffered cue at the track beat', () => {
    const state = resolveCallout(bufferAll([overtake('a', ['b'])]), nameOf, null);
    expect(state.callout).toEqual({
      kind: 'overtake', tier: 'overtake', playerId: 'a', headline: 'Ren passes Sam',
    });
    expect(state.pending).toHaveLength(0);
  });

  it('pluralises a multi-player pass', () => {
    const state = resolveCallout(bufferAll([overtake('a', ['b', 'c'])]), nameOf, null);
    expect(state.callout!.headline).toBe('Ren passes 2 racers');
  });

  it('picks the highest tier, so final question outranks an overtake', () => {
    const state = resolveCallout(
      bufferAll([overtake('a', ['b']), finalQuestion(8)]),
      nameOf,
      null,
    );
    expect(state.callout!.kind).toBe('final-question');
    expect(state.callout!.headline).toBe('FINAL QUESTION');
  });

  it('breaks a tie toward the local player', () => {
    const state = resolveCallout(
      bufferAll([overtake('a', ['c']), leadChanged('b', 'a')]),
      nameOf,
      'b',
    );
    expect(state.callout!.playerId).toBe('b');
    expect(state.callout!.headline).toBe('Sam takes the lead');
  });

  it('keeps the first buffered cue when the tie involves no local player', () => {
    const state = resolveCallout(
      bufferAll([overtake('a', ['c']), leadChanged('b', 'a')]),
      nameOf,
      null,
    );
    expect(state.callout!.playerId).toBe('a');
  });

  it('reports places gained per player as subdued rail deltas', () => {
    const state = resolveCallout(
      bufferAll([overtake('a', ['b', 'c']), overtake('b', ['c'])]),
      nameOf,
      null,
    );
    expect(state.deltas).toEqual([
      { playerId: 'a', placesGained: 2 },
      { playerId: 'b', placesGained: 1 },
    ]);
  });

  it('raises escalation on a final-question cue and keeps it raised', () => {
    const resolved = resolveCallout(bufferAll([finalQuestion(8)]), nameOf, null);
    expect(resolved.escalated).toBe(true);
    expect(clearCallout(resolved).escalated).toBe(true);
  });

  it('produces no callout on a beat with no drama', () => {
    const state = resolveCallout(initialCalloutState, nameOf, null);
    expect(state.callout).toBeNull();
    expect(state.deltas).toHaveLength(0);
  });

  it('names a streak milestone', () => {
    const state = resolveCallout(bufferAll([streak('c', 5)]), nameOf, null);
    expect(state.callout).toEqual({
      kind: 'streak-tier', tier: 'streakMilestone', playerId: 'c',
      headline: 'Kit is on fire — 5 in a row',
    });
  });
});

describe('clearCallout and resetCallouts', () => {
  it('drops the banner and the deltas at the next read', () => {
    const resolved = resolveCallout(bufferAll([overtake('a', ['b'])]), nameOf, null);
    const cleared = clearCallout(resolved);
    expect(cleared.callout).toBeNull();
    expect(cleared.deltas).toHaveLength(0);
  });

  it('drops escalation only at the results beat', () => {
    const escalated = resolveCallout(bufferAll([finalQuestion(8)]), nameOf, null);
    expect(escalated.escalated).toBe(true);
    expect(resetCallouts()).toEqual(initialCalloutState);
  });
});
