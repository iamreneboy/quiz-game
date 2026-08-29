# ADR-0045: Awards are fetched, not broadcast

- **Status:** Accepted
- **Date:** 2026-08-30
- **Phase:** M3 P2b — The aftermath

## Context

PRD §5.4.4 wants four awards on the results screen. Three of them — Big Brain
(most correct), Fastest Gun (most speed points), Hot Streak (longest streak) —
are `max()` over fields that are already on every `Standing` the client holds.
Only Late Surge needs something no client has: the standings as they stood at
the midpoint of the race, reconstructed from `answers`.

The obvious move is to put the awards on the results phase event, beside
`standings`. That is the wire's fifth opening, for data three quarters of which
the client can already compute, and it would have to be mirrored into
`get_room_state` so a reload agrees with the live path.

## Decision

`awards(room_id)` is a pure SQL projection, and each surface **reads it once**
when the room reports `finished` (`lib/useAwards.ts`). Nothing about the awards
travels on the realtime wire, and `phase_event` is untouched.

## Consequences

- **The wire stays where P2a left it.** M3 has opened it exactly twice: ADR-0037
  and ADR-0042. P2b opens it not at all.
- **One code path serves the live ceremony and a reload.** The hook's `enabled`
  flips on `status === 'finished'` regardless of whether that came from a phase
  event or from `get_room_state` at subscribe, so there is no seeded-versus-live
  distinction to get wrong — the shape CURRENT.md records going wrong three
  times.
- **The awards are not in the game store**, so `applyPhaseEvent` has one fewer
  thing to keep true across a pause, a skip and a rematch.
- **It costs one round trip per surface.** On a three-surface room that is three
  reads of a projection over a table the same room has already been served from,
  at a moment when nothing else is in flight. Acceptable; a fourth surface would
  still be acceptable.
- **A future award is a server change plus copy.** `describeAwards` orders by
  `AWARD_ORDER` and drops keys it does not know, so an older client degrades to
  the awards it can name rather than rendering one in an arbitrary position.
- **The hook stamps its result with the room it belongs to.** A rematch flips
  `enabled` back to false while the finished race's awards are still held, and
  the obvious reset — `setAwards(null)` inside the effect — is a synchronous
  setState in an effect body, which this project's lint forbids outright
  (`react-hooks/set-state-in-effect`). The result carries its key and is
  compared at render instead.
