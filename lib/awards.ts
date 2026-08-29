/**
 * The awards, as the show says them (PRD §5.4.4) — pure, no React, no store,
 * no DOM.
 *
 * The server sends key, value and winners and nothing else: what an award is
 * CALLED, what it means and how its number reads are presentation, and they
 * live here where they can be tested and changed without a migration.
 *
 * `describeAwards` is the validate-and-order seam. It exists because this data
 * arrives from an RPC as untyped jsonb and because the server's order must not
 * be the only thing keeping the card's order right — a later award appended
 * server-side slots into AWARD_ORDER here or is dropped, never rendered in an
 * arbitrary position.
 */
import type { Award, AwardKey, AwardWinner } from '@/lib/types';

/** PRD §5.4.4's own order: brain, then speed, then streak, then the climb. */
export const AWARD_ORDER: readonly AwardKey[] = [
  'big-brain', 'fastest-gun', 'hot-streak', 'late-surge',
];

export const AWARD_META: Record<AwardKey, { emoji: string; label: string; blurb: string }> = {
  'big-brain':   { emoji: '🧠', label: 'Big Brain',   blurb: 'Most correct answers' },
  'fastest-gun': { emoji: '⚡', label: 'Fastest Gun', blurb: 'Most speed points' },
  'hot-streak':  { emoji: '🔥', label: 'Hot Streak',  blurb: 'Longest run of correct answers' },
  'late-surge':  { emoji: '📈', label: 'Late Surge',  blurb: 'Most places gained in the second half' },
};

/**
 * The winning score in the award's own unit.
 *
 * Each award counts a different thing, so a bare number beside four different
 * labels would be four different questions the reader has to answer. The
 * singular case is spelled out rather than suffixed with "(s)": this is copy on
 * a screen a room is looking at.
 */
export function awardValueText(key: AwardKey, value: number): string {
  switch (key) {
    case 'big-brain':   return `${value} correct`;
    case 'fastest-gun': return `${value} speed points`;
    case 'hot-streak':  return `${value} in a row`;
    case 'late-surge':  return `${value} place${value === 1 ? '' : 's'} gained`;
  }
}

/**
 * Parse, filter and order what the RPC returned.
 *
 * Unknown keys are DROPPED rather than rendered: a client running against a
 * newer database must degrade to the awards it knows how to name, exactly as
 * every other mirrored value in this codebase degrades rather than failing.
 * An award with no winners is dropped for the same reason the server omits a
 * zero-valued one — it is not a result.
 */
export function describeAwards(raw: unknown): Award[] {
  if (!Array.isArray(raw)) return [];

  const known = new Map<AwardKey, Award>();
  for (const entry of raw) {
    const award = parseAward(entry);
    if (award && !known.has(award.key)) known.set(award.key, award);
  }

  return AWARD_ORDER.map(key => known.get(key)).filter((a): a is Award => a !== undefined);
}

function parseAward(entry: unknown): Award | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const row = entry as Record<string, unknown>;

  const key = row.key;
  if (typeof key !== 'string' || !AWARD_ORDER.includes(key as AwardKey)) return null;
  if (typeof row.value !== 'number') return null;
  if (!Array.isArray(row.winners)) return null;

  const winners = row.winners.filter(isWinner);
  if (winners.length === 0) return null;

  return { key: key as AwardKey, value: row.value, winners };
}

function isWinner(value: unknown): value is AwardWinner {
  if (typeof value !== 'object' || value === null) return false;
  const w = value as Record<string, unknown>;
  return (
    typeof w.player_id === 'string' &&
    typeof w.nickname === 'string' &&
    typeof w.avatar === 'string' &&
    typeof w.color === 'string'
  );
}
