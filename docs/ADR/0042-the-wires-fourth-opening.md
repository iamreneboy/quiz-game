# ADR-0042: The wire's fourth opening — `sudden_death`

- **Status:** Accepted
- **Date:** 2026-08-29
- **Phase:** M3 P2a — The tiebreak

## Context

The M3 roadmap (decision 1) keeps the wire semantic and demands that "every new
payload field earns the justification ADR-0018 and ADR-0028 demanded of M2's two
protocol openings." ADR-0037 was the third, for `status`,
`paused_remaining_ms` and `total_rounds`.

The tiebreak is a round like any other on the wire: `phase: 'read'`,
`round: 13`, a `question_public` payload. Nothing on the event distinguishes it
from round 13 of a thirteen-round game — and three different clients need it to.
The question surface has to say "Sudden death" rather than "Q13/12"; a racer
outside the tied group has to be shown as watching rather than being handed a
grid the server will reject; and the photo finish has to know which tied group
was already decided on screen so it does not restage it.

Deriving it was considered and rejected on each count. `round > total_rounds` is
a real signal, but it says only *that* this is a tiebreak, never *who* is in it
or *who won* — and the client would be inferring a game rule from an arithmetic
accident rather than being told.

## Decision

`phase_event` and `get_room_state` carry one new key, nested rather than three
flat fields, so the "no tiebreak" case is a single `null`:

