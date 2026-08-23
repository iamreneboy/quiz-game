# ADR-0028: The wire's second opening — `answered` and `avg_answer_ms`

- **Status:** Accepted
- **Date:** 2026-08-24
- **Phase:** P5a — Podium ceremony

## Context

The roadmap's results screen (P5b, not built in this phase) asks for two numbers neither existing field supplies: how many rounds a player actually answered, and their average answer time. `correct` alone cannot distinguish "answered every round and got 9 right" from "answered 9 rounds and got all of them right" — both would show `correct: 9`. Average answer time is not derivable presentation-side at all: `Standing` carries no timing field, and `picks` (opened by [ADR-0018](0018-the-wire-opens-once-for-picks-and-current-streak.md)) carries `choice_index` per player, not `time_remaining_ms`.

[ADR-0018](0018-the-wire-opens-once-for-picks-and-current-streak.md) already argued the general case for opening this protocol additively rather than leaving a presentation-side gap unfillable, and named the cost plainly: opening the wire is one-way, and paying it twice for two unrelated gaps is worse than paying it once. This phase's job is to weigh its own need against that precedent, not to re-derive the argument from nothing.

## Decision

`standings()` gains two projection fields, riding the same migration as [ADR-0027](0027-the-results-phase-gets-a-deadline.md)'s deadline change (`supabase/migrations/0004_ceremony.sql`) so a database needs one deploy for the whole phase, not two:

- `answered`: `count(a.*)` over the same left-joined `answers` rows every other aggregate in this function already scans — a player with no matching row counts zero, verified against real grouped data (a synthetic `answers a` count on an unmatched outer-join row is exactly the trap this phase's own plan flagged as needing a live check, not a theoretical one).
- `avg_answer_ms`: `round(avg(timer_seconds * 1000 - time_remaining_ms))`, `null` when `answered` is 0. The room's `timer_seconds` arrives as a **scalar subquery**, `(select r.timer_seconds from rooms r where r.id = p_room_id)`, not a join — `standings()` groups by `p.id`, and adding `rooms` to the `from`-list would put a new column inside that grouping's scope for no reason. The subquery is correlated only to the function's own constant parameter, not to any per-row column, so it does not change what the query groups by.

The `order by` clause — the Fairness Law, `correct desc → speed_points desc → longest_streak desc → player_id asc` — is untouched, character for character. This is not incidental: [ADR-0027](0027-the-results-phase-gets-a-deadline.md) and this ADR are one migration precisely because neither change touches the other's surface, and a diff between 0003's and 0004's `order by` line confirms it byte-identical.

## Consequences

`Standing.answered` and `Standing.avg_answer_ms` are optional on the client (`lib/types.ts`) — the same fallback shape [ADR-0018](0018-the-wire-opens-once-for-picks-and-current-streak.md) established. P5a never reads them; P5b renders `—` when they are absent, which happens automatically against a pre-0004 server with no `undefined`-handling code required, because the fields are simply missing from the JSON rather than present-but-wrong.

This is now the **second** opening of this protocol, and the record should say so plainly rather than let a third arrive un-scrutinized: the first (ADR-0018) argued that a genuinely undeliverable presentation need justifies an additive field, once, with an optional client fallback. This one met that same bar — `avg_answer_ms` has no presentation-side derivation, full stop; `answered` is the same shape of gap `current_streak` was. The next time a presentation need cannot be met from the existing wire, it should be weighed against *both* of these, not treated as a fresh case — and if the third opening looks like it is becoming a habit rather than an exception, that is itself a signal the wire's shape needs revisiting, not another additive patch.
