/**
 * The REVEAL distribution (spec §5) — pure, no React, no store, no DOM.
 *
 * `picks` arrived with P3b's protocol opening (spec §3). `counts` is kept on
 * the wire as the fallback for a client running against a database that has
 * not taken the migration: no picks means no stacks, never an empty bar.
 */
import type { RevealPayload, Standing } from '@/lib/types';

/**
 * Faces per stack, at every width. The stack overlaps, so six 20px faces
 * occupy ~80px — comfortable at 390px. A width-varying cap would need
 * `matchMedia` in the render path, and an honest overflow count cannot be
 * computed in CSS.
 */
export const STACK_CAP = 6;

export interface StackAvatar {
  playerId: string;
  nickname: string;
  avatar: string;
  color: string;
  isLocal: boolean;
}

export interface DistributionRow {
  /** 0-3; the index the accent and glyph are fixed to (P3a decision 6). */
  index: number;
  option: string;
  count: number;
  /** 0..1 of the largest row. 0 when nobody answered. */
  share: number;
  correct: boolean;
  /** Empty when the payload carries no picks. */
  avatars: StackAvatar[];
  /** Pickers not shown in `avatars`. */
  overflow: number;
}

export function distributionRows(
  options: readonly string[],
  reveal: Pick<RevealPayload, 'correct_index' | 'counts' | 'picks'>,
  standings: readonly Standing[],
  localPlayerId: string | null,
  cap: number = STACK_CAP,
): DistributionRow[] {
  // Empty is treated the same as absent: a real post-migration server reports
  // `counts` as all-zero too when nobody has answered, so falling back to it
  // changes nothing observable and keeps the two paths from ever disagreeing.
  const picks = Array.isArray(reveal.picks) && reveal.picks.length > 0 ? reveal.picks : null;
  const rank = new Map(standings.map((s, i) => [s.player_id, i]));
  const byId = new Map(standings.map(s => [s.player_id, s]));

  // Group pickers per option, ranked. An unknown player sorts after everyone
  // known, keeping the order total and stable.
  const pickersPer: string[][] = options.map(() => []);
  for (const pick of picks ?? []) {
    const bucket = pickersPer[pick.choice_index];
    if (bucket) bucket.push(pick.player_id);
  }
  for (const bucket of pickersPer) {
    bucket.sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity));
  }

  const counts = options.map((_, i) =>
    picks ? pickersPer[i].length : reveal.counts?.[i] ?? 0,
  );
  const largest = Math.max(0, ...counts);

  return options.map((option, index) => {
    const pickers = pickersPer[index];
    const shown = pickers.slice(0, cap);

    // You are always in the picture: a local player who would be cut replaces
    // the last visible face rather than being inserted, so `overflow` — and
    // therefore the arithmetic on screen — stays true.
    if (
      localPlayerId !== null &&
      pickers.includes(localPlayerId) &&
      !shown.includes(localPlayerId) &&
      shown.length > 0
    ) {
      shown[shown.length - 1] = localPlayerId;
    }

    return {
      index,
      option,
      count: counts[index],
      share: largest > 0 ? counts[index] / largest : 0,
      correct: index === reveal.correct_index,
      avatars: shown.map(id => {
        const s = byId.get(id);
        return {
          playerId: id,
          nickname: s?.nickname ?? '',
          avatar: s?.avatar ?? '',
          color: s?.color ?? 'var(--color-ink-mute)',
          isLocal: id === localPlayerId,
        };
      }),
      overflow: Math.max(0, pickers.length - cap),
    };
  });
}
