# ADR-0039: Custom questions live in the bank table, behind a room_id

- **Status:** Accepted
- **Date:** 2026-08-29
- **Phase:** M3 P1 — The draw

## Context

PRD §7 says host-added questions are "merged into the draw, discarded when the
room expires". The M3 roadmap named the storage fork as one of two decisions
this phase owns, and framed both candidates by what each one breaks:

1. **A nullable `questions.room_id`** collides with
   `uq_questions_category_prompt` and pollutes the bank pool `create_room`
   selects from.
2. **A separate `room_custom_questions` table** breaks
   `room_questions.question_id`'s foreign key — a round would have to reference
   one of two tables.

## Decision

Option 1, with both of its collisions closed explicitly:

- `questions.room_id uuid null references rooms(id) on delete cascade`.
- `uq_questions_category_prompt` narrows to `where room_id is null`, so it stays
  a rule about the *bank*, and a second partial index
  (`(room_id, prompt) where room_id is not null`) keeps a room from holding the
  same prompt twice.
- Every bank-draw query gains `and room_id is null`: `create_room`'s
  availability count, `create_room`'s draw, the reserve draw, and
  `swap_question`'s replacement draw.

`room_questions.question_id` also becomes `on delete cascade`.

## Consequences

- **`question_public`, `build_reveal`, `standings`, `longest_streak` and
  `current_streak` are untouched.** A custom question is a `questions` row and
  every one of them joins by id. That is the whole return on this choice.
- **A custom question dies with its room, with no cleanup code.** The cascade
  from `rooms` does it, which is what PRD §7 asks for and what P3's 24h purge
  will inherit for free.
- **The two cascades had to be made order-independent.** Deleting a room fires
  `rooms -> questions` and `rooms -> room_questions` as siblings, and the order
  between them is not guaranteed; a `questions` cascade reaching a
  `room_questions` row that still references it would raise. Making
  `room_questions.question_id` cascade removes the dependency on ordering.
- **Deleting a bank question would now silently delete live rounds.** Accepted:
  bank questions are only ever inserted. P4's delivery is an additive migration,
  not a rewritten seed.
- **Every future bank query must remember `room_id is null`.** Four exist today
  and all four are in `0006_the_draw.sql`. A fifth that forgets would let one
  room's private question appear in another's game.
