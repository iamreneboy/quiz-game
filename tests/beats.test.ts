import { describe, it, expect } from 'vitest';
import {
  NOMINAL_MS,
  READ_OPTIONS_AT,
  READ_QUESTION_AT,
  beatFor,
  beatTotalMs,
  elapsedIn,
  stepsAt,
} from '@/lib/staging/beats';

describe('beatFor', () => {
  it('maps every playing phase to the beat of the same name', () => {
    expect(beatFor('countdown')).toBe('countdown');
    expect(beatFor('read')).toBe('read');
    expect(beatFor('answer')).toBe('answer');
    expect(beatFor('reveal')).toBe('reveal');
    expect(beatFor('track')).toBe('track');
    expect(beatFor('results')).toBe('results');
  });

  it('treats the lobby and a missing room as idle', () => {
    expect(beatFor('lobby')).toBe('idle');
    expect(beatFor(null)).toBe('idle');
  });
});

describe('beatTotalMs', () => {
  it('mirrors the server durations for fixed beats', () => {
    expect(beatTotalMs('read', 20)).toBe(NOMINAL_MS.read);
    expect(beatTotalMs('reveal', 20)).toBe(NOMINAL_MS.reveal);
    expect(beatTotalMs('track', 20)).toBe(NOMINAL_MS.track);
  });

  it('takes the ANSWER length from the wire, not from a mirrored constant', () => {
    expect(beatTotalMs('answer', 20)).toBe(20_000);
    expect(beatTotalMs('answer', 5)).toBe(5_000);
  });

  it('is zero for idle', () => {
    expect(beatTotalMs('idle', 20)).toBe(0);
  });
});

describe('elapsedIn', () => {
  it('derives position from what is left, not from local arrival', () => {
    expect(elapsedIn(3000, 3000)).toBe(0);
    expect(elapsedIn(3000, 2100)).toBe(900);
    expect(elapsedIn(3000, 0)).toBe(3000);
  });

  it('lands a late joiner deep in the beat', () => {
    // Joined with 800ms of a 3s READ left: everything should already be present.
    expect(elapsedIn(3000, 800)).toBe(2200);
  });

  it('treats an unknown deadline as a finished beat', () => {
    expect(elapsedIn(3000, null)).toBe(3000);
  });

  it('clamps when the server ran a longer beat than the mirror expects', () => {
    expect(elapsedIn(3000, 4000)).toBe(0);
  });
});

describe('stepsAt during READ', () => {
  it('shows nothing before the badges land', () => {
    expect(stepsAt('read', -1)).toMatchObject({ badges: false, question: false, options: false });
  });

  it('slams the badges in first', () => {
    expect(stepsAt('read', 0)).toMatchObject({ badges: true, question: false, options: false });
    expect(stepsAt('read', READ_QUESTION_AT - 1)).toMatchObject({ question: false });
  });

  it('raises the question at 460ms', () => {
    expect(stepsAt('read', READ_QUESTION_AT)).toMatchObject({ badges: true, question: true, options: false });
  });

  it('staggers the options in at 1000ms, dimmed and not yet live', () => {
    expect(stepsAt('read', READ_OPTIONS_AT - 1)).toMatchObject({ options: false });
    expect(stepsAt('read', READ_OPTIONS_AT)).toMatchObject({ options: true, optionsLive: false });
  });

  it('has everything present by the end of a 3s beat', () => {
    expect(stepsAt('read', 3000)).toEqual({ badges: true, question: true, options: true, optionsLive: false });
  });
});

describe('stepsAt in the other beats', () => {
  it('makes the options live the instant ANSWER begins', () => {
    expect(stepsAt('answer', 0)).toEqual({ badges: true, question: true, options: true, optionsLive: true });
  });

  it('keeps the question up but retires the options at REVEAL', () => {
    expect(stepsAt('reveal', 0)).toEqual({ badges: true, question: true, options: false, optionsLive: false });
  });

  it('shows no question surface at all outside the question beats', () => {
    for (const beat of ['idle', 'countdown', 'track', 'results'] as const) {
      expect(stepsAt(beat, 9999)).toEqual({ badges: false, question: false, options: false, optionsLive: false });
    }
  });
});
