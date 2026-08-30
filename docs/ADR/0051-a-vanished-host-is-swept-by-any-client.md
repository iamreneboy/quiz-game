# ADR-0051: A vanished host is swept by an elected client against the host's own heartbeat

- **Status:** Accepted
- **Date:** 2026-08-30
- **Phase:** M3 P3b — The vanished host

## Context

PRD §9 requires that losing the host auto-pauses the game and that the room ends
gracefully if the host is gone for more than five minutes. The host's client is
the only thing that drives the state machine (PRD §9: no game server), and every
mutating RPC in this project is gated on `host_key` (roadmap decision 2). A
departed host can call nothing.

The roadmap named this "the phase's hardest question" and offered two answers.
Both are wrong on inspection:

- **"The senior remaining client by presence acts."** A remaining client has no
  host key, and giving it one would hand it *every* host power — pause, skip,
  end, rematch — to solve a problem about one of them.
- **"A Supabase scheduled function does."** pg_cron's minute granularity cannot
  meet "pauses within the presence timeout"; it is another moving part to own on
  a free tier; and it would still be evaluating the very same predicate this
  decision evaluates, just later.

## Decision

**The acting client triggers; the server decides.** `sweep_host_absence(room_id)`
takes no key — and needs none, because it grants the caller nothing. Its
authority comes entirely from `rooms.host_seen_at`, which only the real host key
can refresh (`report_presence`, ADR-0049). It pauses only if that timestamp is
more than `host_absence_pause_ms()` (9s, three missed reports) stale, and ends
the race only past `host_absence_end_ms()` (5 min, PRD §9). A caller whose host
is alive can do nothing at all; a caller whose host is dead can do exactly the
one thing the host would have done.

The pause it writes is byte-for-byte `pause_game`'s freeze-and-shift — same
`status`, same `paused_remaining_ms`, same nulled `phase_ends_at` (roadmap
decision 3). It returns SQL `null` when it changed nothing, so a caller
broadcasts at most one phase event.

The graceful end goes through `end_room_now(room_id)`, extracted from `end_game`
so both share one definition. That extraction is what makes "the standings the
host's own End race button would have produced" true by construction.

**`end_room_now` is NOT itself a keyless RPC**, and the distinction is the whole
point of this decision. It is the mechanism with no guard at all — a reachable
`end_room_now` would let any client end any race, which is precisely what the
bar below excludes. So it is revoked from `public`, `anon` and `authenticated`
at the foot of `0010_the_vanished_host.sql`; its two callers are
`security definer`, so they are unaffected. **`public` must be in that revoke
list**: Postgres grants `EXECUTE` on every new function to `PUBLIC` by default,
so revoking from the API roles alone leaves the function fully reachable over
PostgREST. That was verified rather than assumed —
`has_function_privilege('anon', 'end_room_now(uuid)', 'execute')` answered true
until `public` was added, and false afterwards.

**Who calls the sweep** is decided by `electSweeper` in `lib/presence.ts`: the
lowest-sorted present player id that is not the host, computed identically on
every client from the shared presence map. No negotiation, no protocol, no extra
traffic. The election is *politeness about call volume, not safety* — the server
guard is the safety, and two clients that disagree for a tick simply produce one
null.

The host's return is handled on the host's own side, not here:
`useHostPresenceReporter` resumes an absence pause immediately after the
heartbeat that clears it, and never resumes a deliberate one (ADR-0052's
`host_absent` is what tells the two apart).

## Consequences

- **This is the project's only mutating RPC with no host key, and the bar for a
  second one is this argument.** A keyless RPC is admissible exactly when the
  caller gains nothing the data did not already entitle anyone to. Anything that
  needs the *caller* to be somebody takes a key — or, like `end_room_now`, is
  revoked from `public` and reached only through a function that does.
- **A room whose only remaining surface is a stage view is never swept.** A TV
  holds no player id (ADR-0031) so it can never be elected, and
  `useHostAbsenceSweep` is not mounted there. The room stays paused until a
  player arrives — or, past 24 hours, is purged. Deliberate: making a read-only
  screen a writer would undo ADR-0032.
- **A room with no clients at all is never swept either.** It sits paused or
  playing until the purge takes it. Nothing observes it, so nothing is wrong.
- **Nine seconds is three missed reports.** Lowering it risks a phone on a bad
  connection faking a vanished host; raising it makes the pause feel slow. If
  `presence_report_ms()` ever moves, this threshold has to move with it.
- **The five-minute branch is not covered by a timed test.** It shares
  `end_room_now` with `end_game`, which P0's, P2a's and P2b's smoke sections all
  exercise; only the threshold comparison is untested by execution. That is a
  deliberate trade against a five-minute test.
