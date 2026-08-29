# ADR-0046: A rematch is the same room, reset

- **Status:** Accepted
- **Date:** 2026-08-30
- **Phase:** M3 P2b — The aftermath

## Context

PRD §5.4.6: "host restarts with the same players and same or tweaked config;
questions reshuffle and exclude ones already used."

Sessions in this app are keyed by room CODE (`lib/session.ts`: `cb:<code>`), and
a player's identity is a `player_key` row in `players`. A rematch that created a
new room would therefore invalidate every session in the building at once: ten
people would have to re-scan, re-type a nickname and re-pick an avatar to play a
second game — which is precisely the friction PRD G1 exists to eliminate.

The redraw needs a memory the current schema does not have. `room_questions` is
what a rematch rewrites, so it cannot also be the record of what has been asked.

## Decision

`rematch(room_id, host_key, timer_seconds, categories, tier_counts)` resets the
**same `rooms` row in place**: same id, same code, same `players`, back to
`status = 'lobby'`. Everything else about the previous race is destroyed —
`answers`, `room_questions`, and any room-local custom questions.

The room grows one column, `rooms.used_question_ids uuid[]`, appended from
`room_questions` immediately before that table is cleared.

Each config parameter defaults to the race just played, with the tier counts
defaulting to the **histogram of the previous draw** rather than to a stored
setting.

## Consequences

- **Nobody re-joins.** Every existing session, every avatar and every colour
  survives, and a client sitting on the results screen is simply moved to the
  lobby by the phase event.
- **"Already used" is exact, and includes a spent tiebreak for free.** Reading
  the used list off `room_questions` means the sudden-death round — a real row
  at `total_rounds + 1` (ADR-0043) — is recorded exactly when it was actually
  asked, and an *unspent* reserve is correctly not recorded, so it stays
  available. That distinction would have needed an explicit branch had the list
  been built from `rooms.reserve_question_id`.
- **A rematch can fail, and that is correct.** An exhausted category pool raises
  `not enough unused questions in tier N`, and a bank with no spare Final Boss
  raises the same reserve error `create_room` does. Refusing beats repeating.
  With the current 48-question seed — two rows per (category, tier) — a
  single-category room is exhausted after two races, so this branch is reached
  in ordinary use, not only in the pathological case.
- **Custom questions do not survive their race.** They are questions the room has
  already asked and they live only in it (ADR-0039). The host writes new ones in
  the review step, which is live again the moment the room is back in the lobby.
- **`total_rounds` is mutable in a third way.** M3 P0 made it mutable mid-game
  (skip), M3 P1 pre-game (add/remove); this makes it mutable *between* games. Any
  consumer that snapshots it once is wrong — `lib/store.ts` and
  `lib/presentation/deriveCues.ts` already read it live (ADR-0037, ADR-0038).
- **The room row is now the only thing that grows without bound.** Ten rematches
  is ~130 uuids in an array; the room-purge work in M3 P3 is where that stops
  mattering at all.
