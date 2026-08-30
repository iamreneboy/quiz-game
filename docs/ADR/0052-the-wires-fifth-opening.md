# ADR-0052: The wire's fifth opening — `host_absent`, derived and never stored

- **Status:** Accepted
- **Date:** 2026-08-30
- **Phase:** M3 P3b — The vanished host

## Context

M3 P3b gives a room two ways to be paused. One is a host pressing Pause; the
other is the room losing its host. They call for very different words on screen
— "the host stopped the clock, back in a moment" versus "we've lost the host" —
and a room told the wrong one either panics for nothing or waits for somebody
who is never coming back.

No client can work out which is which. Presence would tell a client the host's
*socket* is gone, but not whether the server has acted on it, and it tells a
client that has only just subscribed — a TV that just powered on, a phone that
reloaded — nothing at all. `rooms.host_seen_at` is server-side.

The obvious shape is a stored `paused_reason` column set by whoever paused. It
was rejected for two reasons. It would have meant `create or replace` on
`pause_game`, `resume_game`, `skip_question` and `end_game` purely to keep a
second fact in step across four functions. And it would still have been wrong
for the case that matters most: a host who pauses deliberately and *then* walks
away leaves a room whose stored reason says "host" forever, telling everybody to
sit tight for somebody who has gone.

## Decision

`phase_event` and `get_room_state` gain one key, `host_absent`, computed on
every read by `host_absent(rooms)` from the same `host_seen_at`
`sweep_host_absence` acts on. Nothing is stored and no pause-writing function is
touched.

This is the wire's fifth opening, after ADR-0018 (`picks`, `current_streak`),
ADR-0028 (`answered`, `avg_answer_ms`), ADR-0037 (`status`,
`paused_remaining_ms`, `total_rounds`) and ADR-0042 (`sudden_death`). It earns
the same justification those demanded: it is semantic — a fact about the game's
situation, not about any renderer — and it is not derivable client-side by any
means, which is the test the previous four had to pass.

The client reads it through one predicate, `isHostAbsent(room)` in
`lib/pause.ts`, which requires *both* `status === 'paused'` and
`host_absent === true`. Neither half alone means anything useful: a running room
whose host is briefly in a tunnel should announce nothing, and a paused room
with a present host is P0's deliberate pause.

An absent key folds to `false`. A pre-0010 database has no opinion, and "the
host is here" is the safe guess — it falls back to the wording P0 already
shipped.

`get_room_state`'s replacement is rebased on **0009_presence.sql**, not on the
0007 body: 0009 had already added `host_seen_at` to the same room object, and
rebasing on the older definition would have silently dropped that key back off
the projection. Any future replacement of this function inherits that
obligation — carry every key the live definition has, not the one the plan
happens to quote.

## Consequences

- **A room's story can change without the room changing.** A deliberate pause
  becomes an absence pause on the next phase event or state read, with no write
  anywhere. That is the behaviour a stored reason could not give.
- **`host_absent` is only as fresh as the last event.** A client sitting in a
  long pause holds whatever the pausing event said until something else
  broadcasts. In practice the sweep and the resume are both broadcasters, so the
  two transitions that matter each carry their own update.
- **The host's auto-resume depends on reading a *stale* value on purpose.**
  `useHostPresenceReporter` heartbeats first — which makes `host_absent` false
  server-side — and then reads the flag from the store, i.e. from before that
  heartbeat. That ordering is what distinguishes a returning host from one who
  never left, and any future reordering of those two calls breaks it.
- **Four functions were not touched, and must stay untouched for this reason.**
  If a later phase adds a `paused_reason` column after all, this ADR is what it
  supersedes.
