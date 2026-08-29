import { describe, it, expect } from 'vitest';
import { elapsedIn } from '@/lib/staging/beats';
import {
  BOARD_AT, BRONZE_AT, CEREMONY_MS, CONFETTI_AT, GOLD_AT, NO_CEREMONY, NO_PHOTO,
  PHOTO_MS, PHOTO_RESOLVE_AT, PHOTO_TALLY_AT, PHOTO_TALLY_MS,
  RISE_MS, SILVER_AT, SPOTLIGHT_AT, ceremonyStepsAt, sameSteps,
} from '@/lib/ceremony/beats';

describe('ceremonyStepsAt — no photo finish', () => {
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
    expect(ceremonyStepsAt(BRONZE_AT + RISE_MS + 5000).rise[3]).toBe(1);
  });

  it('raises the blocks bronze, then silver, then gold, never early', () => {
    const atSilverStart = ceremonyStepsAt(SILVER_AT);
    expect(atSilverStart.rise[3]).toBe(1);
    expect(atSilverStart.rise[2]).toBe(0);
    expect(atSilverStart.rise[1]).toBe(0);

    const atGoldStart = ceremonyStepsAt(GOLD_AT);
    expect(atGoldStart.rise[3]).toBe(1);
    expect(atGoldStart.rise[2]).toBe(1);
    expect(atGoldStart.rise[1]).toBe(0);
  });

  it('lights the spotlight, then fires confetti, then hands over to the board', () => {
    expect(ceremonyStepsAt(SPOTLIGHT_AT).spotlight).toBe(true);
    expect(ceremonyStepsAt(SPOTLIGHT_AT - 1).spotlight).toBe(false);
    expect(ceremonyStepsAt(CONFETTI_AT).confetti).toBe(true);
    expect(ceremonyStepsAt(CONFETTI_AT - 1).confetti).toBe(false);
    expect(ceremonyStepsAt(BOARD_AT).board).toBe(true);
    expect(ceremonyStepsAt(BOARD_AT - 1).board).toBe(false);
  });

  it('never opens a prelude nobody asked for', () => {
    expect(ceremonyStepsAt(0).photo).toEqual(NO_PHOTO);
    expect(ceremonyStepsAt(PHOTO_TALLY_AT).photo).toEqual(NO_PHOTO);
    expect(ceremonyStepsAt(CEREMONY_MS).photo).toEqual(NO_PHOTO);
  });

  it('is fully settled at the end of the beat and stays there', () => {
    const settled = {
      rise: { 1: 1, 2: 1, 3: 1 },
      spotlight: true, confetti: true, board: true, photo: NO_PHOTO,
    };
    expect(ceremonyStepsAt(CEREMONY_MS)).toEqual(settled);
    expect(ceremonyStepsAt(CEREMONY_MS * 10)).toEqual(settled);
  });

  it('lands settled when the deadline is unknown — a pre-0004 database', () => {
    expect(ceremonyStepsAt(elapsedIn(CEREMONY_MS, null)).board).toBe(true);
    expect(ceremonyStepsAt(elapsedIn(CEREMONY_MS, 0)).rise[1]).toBe(1);
  });

  it('lands every block well before the beat ends, leaving a settled tail', () => {
    expect(GOLD_AT + RISE_MS).toBeLessThan(BOARD_AT);
    expect(BOARD_AT).toBeLessThan(CEREMONY_MS);
  });
});

describe('ceremonyStepsAt — with a photo finish', () => {
  const at = (ms: number) => ceremonyStepsAt(ms, true);

  it('holds the podium back for the whole prelude', () => {
    expect(at(PHOTO_MS - 1).rise[3]).toBe(0);
    expect(at(PHOTO_MS - 1).spotlight).toBe(false);
    expect(at(PHOTO_MS - 1).board).toBe(false);
  });

  it('shifts every podium beat by exactly PHOTO_MS', () => {
    expect(at(PHOTO_MS + BRONZE_AT).rise[3]).toBe(0);
    expect(at(PHOTO_MS + BRONZE_AT + RISE_MS).rise[3]).toBe(1);
    expect(at(PHOTO_MS + SPOTLIGHT_AT).spotlight).toBe(true);
    expect(at(PHOTO_MS + SPOTLIGHT_AT - 1).spotlight).toBe(false);
    expect(at(PHOTO_MS + BOARD_AT).board).toBe(true);
    expect(at(PHOTO_MS + BOARD_AT - 1).board).toBe(false);
  });

  it('opens the card immediately and closes it when the prelude ends', () => {
    expect(at(0).photo.open).toBe(true);
    expect(at(PHOTO_MS - 1).photo.open).toBe(true);
    expect(at(PHOTO_MS).photo.open).toBe(false);
  });

  it('runs the tally from PHOTO_TALLY_AT over PHOTO_TALLY_MS', () => {
    expect(at(PHOTO_TALLY_AT - 1).photo.tally).toBe(0);
    expect(at(PHOTO_TALLY_AT).photo.tally).toBe(0);
    expect(at(PHOTO_TALLY_AT + PHOTO_TALLY_MS / 2).photo.tally).toBeCloseTo(0.5, 5);
    expect(at(PHOTO_TALLY_AT + PHOTO_TALLY_MS).photo.tally).toBe(1);
    expect(at(PHOTO_TALLY_AT + PHOTO_TALLY_MS + 500).photo.tally).toBe(1);
  });

  it('locks the order only after the tally has landed', () => {
    expect(PHOTO_TALLY_AT + PHOTO_TALLY_MS).toBeLessThanOrEqual(PHOTO_RESOLVE_AT);
    expect(at(PHOTO_RESOLVE_AT - 1).photo.resolved).toBe(false);
    expect(at(PHOTO_RESOLVE_AT).photo.resolved).toBe(true);
  });

  it('leaves the card resolved but shut once the podium takes over', () => {
    const afterPrelude = at(PHOTO_MS + 10).photo;
    expect(afterPrelude.open).toBe(false);
    expect(afterPrelude.resolved).toBe(true);
    expect(afterPrelude.tally).toBe(1);
  });

  it('still fits the whole sequence inside one ceremony', () => {
    expect(PHOTO_RESOLVE_AT).toBeLessThan(PHOTO_MS);
    expect(PHOTO_MS + BOARD_AT).toBeLessThan(CEREMONY_MS);
  });

  it('lands settled when the deadline is unknown', () => {
    const settled = ceremonyStepsAt(elapsedIn(CEREMONY_MS, null), true);
    expect(settled.board).toBe(true);
    expect(settled.rise[1]).toBe(1);
    expect(settled.photo.open).toBe(false);
    expect(settled.photo.resolved).toBe(true);
  });
});

describe('sameSteps', () => {
  it('is true for identical steps and false for any difference', () => {
    expect(sameSteps(NO_CEREMONY, { ...NO_CEREMONY })).toBe(true);
    expect(sameSteps(NO_CEREMONY, { ...NO_CEREMONY, rise: { ...NO_CEREMONY.rise, 3: 1 } })).toBe(false);
    expect(sameSteps(NO_CEREMONY, { ...NO_CEREMONY, board: true })).toBe(false);
  });

  it('notices a change inside the prelude, or the ticker would freeze the tally', () => {
    expect(sameSteps(NO_CEREMONY, { ...NO_CEREMONY, photo: { ...NO_PHOTO, open: true } })).toBe(false);
    expect(sameSteps(NO_CEREMONY, { ...NO_CEREMONY, photo: { ...NO_PHOTO, tally: 0.5 } })).toBe(false);
    expect(sameSteps(NO_CEREMONY, { ...NO_CEREMONY, photo: { ...NO_PHOTO, resolved: true } })).toBe(false);
  });
});
