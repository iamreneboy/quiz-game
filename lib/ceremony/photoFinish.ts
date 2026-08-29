/**
 * Which places the photo finish stages, and what separates them (PRD §5.4.1)
 * — pure, no React, no store, no DOM.
 *
 * This module is the ONLY implementation of the tie rule. The ceremony's
 * deadline is flat (ADR-0044), so the server never asks the question; the DOM
 * ticker (lib/ceremony/runtime.ts) and the renderer (lib/world/runtime.ts) both
 * ask it here, of the same standings, so the two surfaces cannot disagree.
 *
 * It GROUPS; it never SORTS. `standings` arrives already ordered by the
 * Fairness Law — correct desc, speed points desc, longest streak desc,
 * player_id asc (ADR-0018) — and P2a's `final_standings` wrapper has already
 * lifted any sudden-death winner to the head. Re-sorting here would be a second
 * ranking authority, which is exactly what roadmap decision 4 forbids: the
 * photo finish PRESENTS the order, it never computes one.
 */
import type { Standing } from '@/lib/types';

export interface TieGroup {
  /** 1-based place of the group's first member in the final standings. */
  place: number;
  /** The tied racers, in final-standings order. Always 2 or more. */
  players: Standing[];
  /**
   * True when speed points (or, failing those, the longest streak) separate
   * them. False means the group is PERFECTLY tied and shares the position —
   * PRD §6's rule for every place sudden death does not reach.
   */
  resolved: boolean;
}

export interface PhotoFinishInput {
  standings: readonly Standing[] | null;
  /**
   * The racers the sudden-death round was fought between, from
   * `RoomInfo.sudden_death.contenders`. Undefined when no tiebreak ran.
   */
  suddenDeathContenders?: readonly string[] | null;
  /** Whether that round actually produced a winner (`winner_id !== null`). */
  suddenDeathResolved?: boolean;
}

/**
 * The tied places worth staging.
 *
 * A group already decided by sudden death is dropped: the room has just watched
 * that tie resolve on a live question, and restaging it as a speed-point tally
 * would be dead air that contradicts what everyone saw. The match is on the
 * WHOLE group — a contender list that does not exactly cover one group is
 * ignored rather than trusted, so a stale list can never silently swallow a
 * live tie.
 */
export function tieGroups(input: PhotoFinishInput): TieGroup[] {
  const standings = input.standings ?? [];
  const decided =
    input.suddenDeathResolved && input.suddenDeathContenders?.length
      ? new Set(input.suddenDeathContenders)
      : null;

  const groups: TieGroup[] = [];

  let start = 0;
  while (start < standings.length) {
    let end = start + 1;
    while (end < standings.length && standings[end].correct === standings[start].correct) end++;

    const players = standings.slice(start, end);
    if (players.length > 1 && !isDecided(players, decided)) {
      groups.push({
        place: start + 1,
        players,
        resolved: !isPerfectlyTied(players),
      });
    }
    start = end;
  }

  return groups;
}

export function hasPhotoFinish(input: PhotoFinishInput): boolean {
  return tieGroups(input).length > 0;
}

/**
 * A speed-point total, counted out.
 *
 * Whole numbers only: speed points are integers everywhere else in the game
 * (`floor(remaining / total * 100) * tier`), and a tally that flickered through
 * `183.4` would be quoting a score that does not exist. The clamp is what makes
 * the number safe to render straight from a rAF-published tally.
 */
export function tallyValue(target: number, tally: number): number {
  const t = Math.min(1, Math.max(0, tally));
  // `|| 0` folds IEEE -0 back to 0: Math.round(-0) is -0, which renders as "0"
  // but is a surprising value to hand a consumer.
  return Math.round(target * t) || 0;
}

/** Same group, member for member, as the one sudden death settled. */
function isDecided(players: readonly Standing[], decided: Set<string> | null): boolean {
  if (!decided) return false;
  if (players.length !== decided.size) return false;
  return players.every(p => decided.has(p.player_id));
}

/**
 * Nothing below `correct` separates these racers.
 *
 * Deliberately checks BOTH remaining Fairness Law keys, not just speed points:
 * PRD §5.4.1 describes the sequence as resolving on speed points because that
 * is the usual case, but §3.1's order runs speed points then longest streak,
 * and a group the streak separates is genuinely resolved — calling it a shared
 * position would contradict the ranking the board is about to show.
 */
function isPerfectlyTied(players: readonly Standing[]): boolean {
  const first = players[0];
  return players.every(
    p => p.speed_points === first.speed_points && p.longest_streak === first.longest_streak,
  );
}

/**
 * Structural subset of the game store. `GameState` is assignable to it, which
 * is what keeps this module free of any store import — the same arrangement
 * `lib/presentation/deriveCues.ts`'s `CueSource` uses.
 */
export interface PhotoFinishSource {
  standings: readonly Standing[] | null;
  room: {
    sudden_death?: { contenders: string[]; winner_id: string | null } | null;
  } | null;
}

/**
 * "Is a prelude staged for this room?" — asked by the DOM ticker
 * (lib/ceremony/runtime.ts) and by the renderer (lib/world/runtime.ts), which
 * is why it lives here rather than in either of them. One question, one answer,
 * so the podium's rise and the card's timeline cannot fall out of step.
 *
 * It excludes the group sudden death already decided, by reading
 * `sudden_death` off the room.
 */
export function photoFinishFor(source: PhotoFinishSource): boolean {
  const sd = source.room?.sudden_death ?? null;
  return hasPhotoFinish({
    standings: source.standings,
    suddenDeathContenders: sd?.contenders ?? null,
    suddenDeathResolved: !!sd?.winner_id,
  });
}
