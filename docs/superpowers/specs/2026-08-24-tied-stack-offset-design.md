# Tied-stack x-offset — design

Closes the P2 tech debt entry: "Tied players share a compressed stack rather
than offsetting in x." Scope is `lib/world/geometry.ts` (`markerAnchors`,
`gridAnchors`'s shared `stackPitch`), `lib/world/flair.ts` (`flairFor`), and
`lib/world/podium.ts` (`podiumAnchors`'s pass-through), plus their tests.

## Problem

`markerAnchors` stacks every player tied on a segment into a single vertical
column — one player per `row`, `row` increasing upward. Once a tie runs
deep, `stackPitch` compresses the vertical spacing to keep the whole column
inside `MAX_STACK_RISE`, which is what the debt entry calls out: a four-way
tie is already compressing, and it only gets worse from there.

`row` is currently overloaded. `MarkerAnchor.row` drives BOTH:
1. Vertical placement (`y = -row * pitch`).
2. `flairFor`'s edge-holder rule (`contested && anchor.row === 0`) — row 0
   is defined as "highest speed points on this segment," which is what
   earns the contested-tie turbo flame (PRD §6/§8).

`podium.ts` documents this coupling explicitly and carries `row` through
the ceremony's ranking untouched specifically so `flairFor` keeps working
during the podium sequence.

## Fix

Two players per vertical tier instead of one, offset left/right in `x` —
literally "two rigs per row offset in x," matching the debt entry's own
suggested fix. This roughly halves how many tiers a tie of a given size
needs, which both reads better (a pack instead of a ladder) and reduces how
often compression kicks in at all.

This means `row` can no longer double as the edge-holder signal, since two
players can now share `row === 0`. The fix splits the two meanings apart:

- **`row`** stays the vertical tier index. Unchanged in kind, but a tier can
  now hold up to 2 players instead of 1.
- **`rank`** (new field): 0-indexed position within the segment's tie group,
  ordered by speed points — the exact ordering `row` used to carry alone.
  Always unique per player in a group. `flairFor` switches its edge-holder
  check from `row === 0` to `rank === 0`.
- **`side`** (new field, `-1 | 0 | 1`): which half of the tier a player sits
  on. `-1` / `1` for a full pair, `0` for an unpaired occupant (an odd
  leftover, or the sole occupant of an uncontested segment). Drives an `x`
  offset of `± RIG_HALF_WIDTH` off the segment's center — the same spacing
  `GRID_COLUMN_WIDTH` already uses for "adjacent rigs touch, never overlap"
  in the lobby grid, reused here rather than a new literal.

### Pairing rule

Within a tie group (already sorted by speed points, descending — existing
behavior), pair consecutive ranks into a tier: ranks `2k` and `2k+1` share
`row k`. Rank `2k` gets `side: -1`, rank `2k+1` gets `side: 1`. If the group
has an odd count, the last (lowest-ranked) player is alone in their row:
`side: 0`.

A single-occupant segment (no tie at all) is the `side: 0` case with one
row — behavior identical to today (`x` = segment center, `y` = 0).

### `stackPitch`

`stackPitch(rowCount, riseLimit)` keeps its exact signature and meaning —
it already only cares about the number of vertical tiers, not headcount.
Callers change to pass `Math.ceil(n / 2)` instead of `n`. No changes inside
the function itself.

### `flairFor`

Change the edge-holder line from:
```ts
edgeHolder: contested && anchor!.row === 0,
```
to:
```ts
edgeHolder: contested && anchor!.rank === 0,
```
No other change — `contested` (segment occupancy > 1) is unaffected.

### `podium.ts`

`podiumAnchors` carries the whole anchor through unchanged for non-top-3
players (including the new `rank`/`side` fields, via the existing spread),
and overrides only `x`/`y` for the top 3 (via the podium block position).
No behavior change needed — `rank` survives the spread the same way `row`
did. Its doc comment gets updated to describe `rank` (not `row`) as what
`flairFor` reads, so the comment doesn't go stale.

### `gridAnchors` — out of scope

The lobby's starting-grid formation (`gridAnchors`) already offsets players
using a front/back `row` split at a shared `x` per column; it does not use
`markerAnchors`'s tie-stacking path and is not touched by this change. (The
20-player grid compression is a separate, already-tracked debt item.)

## Rendering / camera impact

Both consumers of `anchor.x`/`anchor.y` (`choreographer.ts`'s tween targets,
`framing.ts`'s camera-fit bounding box) read the coordinates generically —
neither special-cases `row`. The x-offset flows through with no changes
needed in either file.

## Testing

`tests/geometry.test.ts`'s `markerAnchors` describe block gets rewritten
for the new contract:
- 2-way tie: both players in `row: 0`, one `side: -1` one `side: 1`, `y: 0`
  for both, `x` offset by `∓RIG_HALF_WIDTH`. (Previously asserted one row
  each — that assertion is the thing being changed.)
- 3-way tie: ranks 0/1 pair into row 0 (sides -1/1), rank 2 alone in row 1
  (side 0).
- 8-way tie: 4 rows instead of 8 — re-derive the compression assertions
  against `Math.ceil(8/2)` rows.
- Single occupant: unchanged (`row: 0`, `side: 0`, `x` = segment center).
- New assertions: `rank` is unique per player within a segment and matches
  speed-points order; `side` values are only `-1`/`0`/`1`; paired players'
  `x` differs by exactly `2 * RIG_HALF_WIDTH` and their `y` is equal.

`startLineAnchors`'s "row-stacks the field" test (3 players, all tied on
zero) updates the same way — 2 in row 0 (sides -1/1), 1 in row 1 (side 0).

`tests/flair.test.ts`'s edge-holder fixtures switch from constructing
`{ row: 0 }` to `{ rank: 0 }`.

No new test files; existing describe blocks are edited in place.
