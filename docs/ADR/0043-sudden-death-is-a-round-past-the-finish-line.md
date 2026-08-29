# ADR-0043: Sudden death is a round past the finish line, not a phase

- **Status:** Accepted
- **Date:** 2026-08-29
- **Phase:** M3 P2a — The tiebreak

## Context

PRD §5.4.2's sudden death is a whole question: it is read, it is answered under
the timer, and it is revealed. The obvious modelling is a new value in
`rooms.phase`'s check constraint — `'sudden_death'` — with the room moving
through it as a unit.

That costs a case in every switch the phase reaches, and the phase reaches a
great deal of this codebase: `advance_phase`'s `case`, `phase_event`'s payload
`case`, `beatFor`, `beatTotalMs`, `stepsAt`, `stagingAt`, both shot books'
`base: Record<Phase, CameraIntent>`, `deriveCues`'s `phaseCues`, `get_room_state`
three times. Worse, `question_public`, `build_reveal` and `submit_answer` all
look their question up by `(room_id, round)` in `room_questions` — a question
that lived somewhere else would need a second lookup path through each of them,
which is three more places Design Pillar 2 could be broken.

## Decision

Sudden death is **a round**, at `total_rounds + 1`. The reserve question 0006
drew (ADR-0041) is inserted into `room_questions` at that round, and the room
moves through the ordinary `read → answer → reveal` it already knows.

Three columns say what is different about it — `sudden_death_round`,
`sudden_death_contenders`, `sudden_death_winner_id` — and two arms of
`advance_phase` act on them: the tiebreak resolves at `answer → reveal`, and
`reveal` goes to `results` rather than `track`, because nobody advances a
segment.

`total_rounds` is deliberately **not** incremented: the track is the length the
race was run at, and growing it would move a finish line the field has already
crossed.

It is kept out of scoring by one clamp. `standings` bounds visible answers by
`a.round <= p_max_round` and `longest_streak` bounds its walk the same way, so
passing `scoring_round(room, round) = least(round, total_rounds)` at every call
site makes the tiebreak round invisible to both.

## Consequences

- **Everything downstream works unchanged**: the question card, the answer grid,
  the timer ring, the tension ramp, the answer lock, `useHostDriver`'s
  scheduler, `submit_answer`'s grace window and duplicate guard, and the reveal's
  distribution bar. Task 5's client work is presentation only.
- **`standings`' sort clause is untouched** (ADR-0018 holds). Sudden death is
  PRD §3.1's fourth lexicographic key and is applied by `final_standings` as a
  stable partition of the head group — winner first, everyone else in the order
  `standings` returned them — so nobody outside the tied group can move.
- **A tiebreak answer can never become a correct answer.** This is the clamp's
  whole job, and it is asserted directly in `scripts/smoke.mjs`: after a
  tiebreak, every racer's `correct`, `speed_points` and `longest_streak` are
  still what they were at the finish line.
- **The round NUMBER exceeds `total_rounds` while the tiebreak runs.** Anything
  that renders `round`/`total_rounds` must special-case it — `QuestionCard` does
  — and anything that computes a scoring bound must clamp. `scoring_round` is
  the one place that clamp lives; a future caller that forgets it will
  silently count the tiebreak.
- **`skip_question` refuses the tiebreak round.** Skipping means "discard this
  and move to the next", and there is no next; the renumbering would also
  shorten a track that is already correct. `end_game` remains the way out, and
  it leaves the tie standing with the position shared — PRD §6's rule.
- **A room created before migration 0006 has no reserve** and can never open a
  tiebreak (ADR-0041 anticipated this). `advance_phase` falls through to the
  ceremony, the tie stands, and the position is shared. No error, no special
  case.
