# ADR-0050: The door reopens inside `join_room` — reclaim and late join are one function

- **Status:** Accepted
- **Date:** 2026-08-30
- **Phase:** M3 P3a — Presence & the open door

## Context

`join_room` had one line standing between the room and everything PRD §9 and §4
ask for: `if v_room.status <> 'lobby' then raise exception 'game already
started'`. Two different features have to get past it — a dropped racer
reclaiming their run, and a browser arriving mid-race as a late joiner — and
they differ from each other by exactly one nickname lookup.

The alternative was two new RPCs (`reclaim_player`, `join_late`), which would
have duplicated the room lookup, the nickname validation, the unique-violation
handling and the return shape three ways, and forced `JoinGate` to choose
between them before it knows which case it is in.

## Decision

One function, two arms behind the existing status check.

- **Reclaim:** the nickname already exists in this room AND `player_dropped()`
  is true. The *same* `players` row is returned — same id, same `player_key`,
  same answers — with `absent_reports` reset. Avatar and colour are deliberately
  not overwritten: the room has been watching those colours all race.
- **Late join:** anything else. A new player, `is_playing = false`,
  `joined_late = true`, materialised by `advance_phase` at the next READ inside
  the drawn track.

The return shape gains one key, `reclaimed`, so a caller can tell the two apart;
everything else is byte-identical to the lobby arm, so `JoinGate` needs no
second code path.

`status = 'finished'` is now rejected outright (`the race has finished`), which
it never was before — the old check folded it in with "already started".

**The reclaim gate is the whole security model, and it is a party-game model.**
Reclaim hands out an existing `player_key` on a nickname match. It is impossible
while that player is connected, because `player_dropped()` requires twenty
consecutive missed host reports (ADR-0049). It is *not* impossible for somebody
in the room who waits a minute after a racer drops and then types their
nickname. The room code is already a shared secret handed round an office, PRD
§9 asks for reclaim in exactly these words, and the thing at stake is a quiz
score.

The host's own key is never handed out. A host who loses their localStorage
reclaims their player row like anyone else and comes back as an ordinary racer;
recovering *host authority* from a lost session is out of scope for M3.

## Consequences

- **`join_room` no longer raises `game already started`.** One assertion in
  `scripts/smoke.mjs` asserted that rejection; because the room it used is
  FINISHED by that point, it now asserts `the race has finished` instead, and
  the late-join arm is asserted in full in the P3a sections. Anything else that
  depended on a mid-game join failing is wrong now.
- **A reclaimed session is the original session.** No merge, no re-scoring, no
  new row — which is why `answers`' `(room_id, round, player_id)` primary key
  keeps working and why the standings need no special case.
- **`joined_late` outlives materialisation** so PRD §4's "clearly marked" can be
  honoured for the rest of the race. `start_game` clears it, which is what makes
  a rematch (ADR-0046) a clean slate.
- **A skip does not materialise anyone.** `skip_question` reuses the round
  number (ADR-0038), so it is the same round with a different question, already
  under way; a spectator waits for the next real round start.
- **The tiebreak never materialises anyone.** `advance_phase`'s bound is
  `v_round <= total_rounds`, and sudden death sits at `total_rounds + 1`
  (ADR-0043).
- **The materialisation is invisible on the wire, so the one client that needs
  it asks.** `phase_event` carries no roster and this plan added no key to it,
  so a spectator's browser would otherwise stay disabled for the rest of the
  race. `lib/useLateJoinerMaterialize.ts` refetches `get_room_state` on each
  READ, but only for a player who is both `joined_late` and not yet playing —
  every other browser makes no extra call at all.
