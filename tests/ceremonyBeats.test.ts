import { describe, it, expect } from 'vitest';
import { elapsedIn } from '@/lib/staging/beats';
import {
  BOARD_AT, BRONZE_AT, CEREMONY_MS, CONFETTI_AT, GOLD_AT, NO_CEREMONY,
  RISE_MS, SILVER_AT, SPOTLIGHT_AT, ceremonyStepsAt, sameSteps,
} from '@/lib/ceremony/beats';

describe('ceremonyStepsAt', () => {
  it('shows nothing at the very start of the beat', () => {
    expect(ceremonyStepsAt(0)).toEqual(NO_CEREMONY);
  });

  it('holds each block at zero until its own moment', () => {
    expect(ceremonyStepsAt(BRONZE_AT - 1).rise[3]).toBe(0);
    expect(ceremonyStepsAt(SILVER_AT - 1).rise[2]).toBe(0);
    expect(ceremonyStepsAt(GOLD_AT - 1).rise[1]).toBe(0);
  });

  it('rises smoothly once a block starts, landing RISE_MS later', () => {
    expect(ceremonyStepsAt(BRONZE_AT).rise[3]).toBe(0);
    expect(ceremonyStepsAt(BRONZE_AT + RISE_MS / 2).rise[3]).toBeCloseTo(0.5, 5);
    expect(ceremonyStepsAt(BRONZE_AT + RISE_MS).rise[3]).toBe(1);
    // Never regresses once it lands.
    expect(ceremonyStepsAt(BRONZE_AT + RISE_MS + 5000).rise[3]).toBe(1);
  });

  it('raises the blocks bronze, then silver, then gold, never early', () => {
    const atSilverStart = ceremonyStepsAt(SILVER_AT);
    expect(atSilverStart.rise[3]).toBe(1); // bronze long since landed
    expect(atSilverStart.rise[2]).toBe(0); // silver just starting
    expect(atSilverStart.rise[1]).toBe(0); // gold not due yet

    const atGoldStart = ceremonyStepsAt(GOLD_AT);
    expect(atGoldStart.rise[3]).toBe(1);
    expect(atGoldStart.rise[2]).toBe(1); // silver long since landed
    expect(atGoldStart.rise[1]).toBe(0); // gold just starting
  });

  it('lights the spotlight, then fires confetti, then hands over to the board', () => {
    expect(ceremonyStepsAt(SPOTLIGHT_AT).spotlight).toBe(true);
    expect(ceremonyStepsAt(SPOTLIGHT_AT - 1).spotlight).toBe(false);
    expect(ceremonyStepsAt(CONFETTI_AT).confetti).toBe(true);
    expect(ceremonyStepsAt(CONFETTI_AT - 1).confetti).toBe(false);
    expect(ceremonyStepsAt(BOARD_AT).board).toBe(true);
    expect(ceremonyStepsAt(BOARD_AT - 1).board).toBe(false);
  });

  it('is fully settled at the end of the beat and stays there', () => {
    const settled = { rise: { 1: 1, 2: 1, 3: 1 }, spotlight: true, confetti: true, board: true };
    expect(ceremonyStepsAt(CEREMONY_MS)).toEqual(settled);
    expect(ceremonyStepsAt(CEREMONY_MS * 10)).toEqual(settled);
  });

  it('lands settled when the deadline is unknown — a pre-0004 database', () => {
    // msUntil(null) is 0, and elapsedIn treats a null remaining as "beat over".
    expect(ceremonyStepsAt(elapsedIn(CEREMONY_MS, null)).board).toBe(true);
    expect(ceremonyStepsAt(elapsedIn(CEREMONY_MS, 0)).rise[1]).toBe(1);
  });

  it('lands every block well before the beat ends, leaving a settled tail', () => {
    expect(GOLD_AT + RISE_MS).toBeLessThan(BOARD_AT);
    expect(BOARD_AT).toBeLessThan(CEREMONY_MS);
  });
});

describe('sameSteps', () => {
  it('is true for identical steps and false for any difference', () => {
    expect(sameSteps(NO_CEREMONY, { ...NO_CEREMONY })).toBe(true);
    expect(sameSteps(NO_CEREMONY, { ...NO_CEREMONY, rise: { ...NO_CEREMONY.rise, 3: 1 } })).toBe(false);
    expect(sameSteps(NO_CEREMONY, { ...NO_CEREMONY, board: true })).toBe(false);
  });
});
