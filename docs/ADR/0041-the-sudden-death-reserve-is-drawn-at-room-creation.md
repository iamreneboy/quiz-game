# ADR-0041: The sudden-death reserve is drawn at room creation, category-preferring

- **Status:** Accepted
- **Date:** 2026-08-29
- **Phase:** M3 P1 — The draw

## Context

PRD §5.4.2's sudden death needs "one expert question" that is not in the drawn
set. P2 owns sudden death, but the M3 roadmap put the *draw* of that question in
P1: doing it at room creation means availability is validated up front rather
than discovered at the worst possible moment — a perfect first-place tie, with
the room watching.

The obvious rule — draw the reserve from the host's chosen categories, and
require `p_tier_counts[4] + 1` available — has a direct conflict with P4's exit
criterion, "`create_room` with a single category at 10-per-tier succeeds". A
bank of exactly 10 tier-4 questions per category, with a host asking for 10
tier-4 questions from one category, leaves no eleventh.

## Decision

The reserve is drawn at `create_room`, stored in `rooms.reserve_question_id`,
and its pool is **the whole tier-4 bank, ordered to prefer the room's
categories**:

```sql
order by (q.category = any(p_categories)) desc, random()
```

`create_room` raises only if the bank has no unused tier-4 question at all.
The reserve is excluded from `swap_question`'s replacement pool, and is not
returned by `draw_public`, `get_room_state` or `phase_event`.

## Consequences

- **Availability is validated once, at creation, as the roadmap wanted** —
  without making a previously-valid room impossible to create, and without
  colliding with P4's criterion.
- **A sudden-death question may come from outside the host's categories.** Only
  when the chosen categories are exhausted, and it reads as a wildcard rather
  than a fault: sudden death is a tiebreak, and PRD §5.4.2 asks for "one expert
  question", not one from a particular category.
- **The reserve is invisible to every client.** It is not in the review step —
  revealing the tiebreak question would defeat it — and it is not on the wire.
  P2 reads the column inside its own RPC.
- **`swap_question` must keep excluding it.** A swap that pulled the reserve
  into the race would let sudden death repeat a question that has already been
  asked.
- **A room created before this migration has `reserve_question_id = null`.** P2
  must treat a null reserve as "sudden death is unavailable; the tie stands and
  the position is shared", which is PRD §6's rule for lower places anyway.
- **`create_room` now hard-requires a non-empty tier-4 bank, full stop.** Even a
  room that draws no tier-4 questions itself (`p_tier_counts[4] = 0`) still
  needs a reserve, so an empty tier-4 bank blocks room creation entirely —
  this is a new precondition the seed/bank data must satisfy that did not
  exist before this migration.
