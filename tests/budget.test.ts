import { describe, it, expect } from 'vitest';
import { PRESENCE_REPORT_MS } from '@/lib/presence';
import { CEREMONY_MS } from '@/lib/ceremony/beats';
import { estimateDurationSeconds } from '@/lib/rank';

/**
 * PRD §11: "One month of typical office use (3 games/week, 15 players) stays
 * within both free tiers."
 *
 * Computed from the app's own constants rather than written down, so a change
 * that moves the arithmetic — a faster presence cadence, a longer game — turns
 * this red instead of silently invalidating a paragraph in a doc.
 *
 * The ceilings below are the documented free-tier figures at the time of
 * writing. The assertions are HEADROOM checks, not precision ones: the margins
 * are 20x or better, so the conclusion survives the published numbers moving.
 */
const FREE_TIER = {
  /** Supabase Realtime messages per month. */
  messages: 2_000_000,
  /** Supabase Realtime peak concurrent connections. */
  connections: 200,
};

// PRD §11's "typical office use".
const GAMES_PER_MONTH = Math.ceil((3 * 52) / 12); // 13
const PLAYERS = 15;
const STAGE_VIEWS = 1;
const SUBSCRIBERS = PLAYERS + STAGE_VIEWS;
const ROUNDS = 12;
const TIMER_SECONDS = 10; // app/host/new/page.tsx's default

/**
 * Phase broadcasts the host sends per game.
 *
 * One at start_game (COUNTDOWN), then four per round — READ, ANSWER, REVEAL,
 * and the fourth that is TRACK for every round but the last, where it is
 * RESULTS (supabase/migrations/0009_presence.sql's advance_phase).
 */
const PHASE_BROADCASTS = 1 + ROUNDS * 4;

/** One `player_joined` per joiner (app/room/[code]/page.tsx). */
const JOIN_BROADCASTS = PLAYERS;

/** A join and a leave per subscriber, each fanned out to everyone present. */
const PRESENCE_EVENTS = SUBSCRIBERS * SUBSCRIBERS * 2;

const gameSeconds = estimateDurationSeconds(ROUNDS, TIMER_SECONDS) + CEREMONY_MS / 1000;

describe('a month of typical office use fits inside both free tiers', () => {
  it('uses a small fraction of the monthly realtime message allowance', () => {
    const perGame =
      (PHASE_BROADCASTS + JOIN_BROADCASTS) * SUBSCRIBERS + PRESENCE_EVENTS;
    const perMonth = perGame * GAMES_PER_MONTH;

    // Roughly 1,536 per game and 20,000 per month against a 2,000,000 ceiling.
    expect(perMonth).toBeLessThan(FREE_TIER.messages * 0.05);
  });

  it('stays far under the concurrent-connection ceiling', () => {
    expect(SUBSCRIBERS).toBeLessThan(FREE_TIER.connections * 0.25);
    // PRD §9's claim, restated as arithmetic: the ceiling supports several
    // simultaneous rooms, not one.
    expect(Math.floor(FREE_TIER.connections / SUBSCRIBERS)).toBeGreaterThanOrEqual(9);
  });

  it('makes a trivial number of presence RPCs', () => {
    const perGame = Math.ceil((gameSeconds * 1000) / PRESENCE_REPORT_MS);
    // One call every PRESENCE_REPORT_MS from the host alone, whatever the
    // player count (lib/useHostPresenceReporter.ts).
    expect(perGame).toBeLessThan(150);
    expect(perGame * GAMES_PER_MONTH).toBeLessThan(2_000);
  });

  it('writes a database footprint the 24h purge keeps flat', () => {
    // answers + players + room_questions + the room itself.
    const rowsPerGame = PLAYERS * ROUNDS + PLAYERS + ROUNDS + 1;
    expect(rowsPerGame * GAMES_PER_MONTH).toBeLessThan(10_000);
    // And none of it accumulates: purge_rooms() deletes every room 24h after
    // creation (M3 P3b), and the rows cascade with it.
  });

  it('runs a game in about the length PRD §1 promises', () => {
    expect(gameSeconds).toBeGreaterThan(4 * 60);
    expect(gameSeconds).toBeLessThan(12 * 60);
  });
});
