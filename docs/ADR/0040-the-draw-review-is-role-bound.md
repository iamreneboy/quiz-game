# ADR-0040: The draw review is role-bound — a racing host never receives an answer

- **Status:** Accepted
- **Date:** 2026-08-29
- **Phase:** M3 P1 — The draw

## Context

Two PRD sections point in opposite directions, and the M3 roadmap flagged the
collision with a ⚠️ and the instruction "do not settle this by default".

- **PRD §5.1 step 5** lets the host review the draw, veto or swap any question,
  and add their own.
- **PRD §4** lets the host also play as a racer.

**Design Pillar 2** says clients never receive the correct answer before the
reveal. A playing host who has just read all twelve answers is that pillar
broken for the one client that also races.

The roadmap named three candidate resolutions: review is MC-only; review shows
prompts and options without marking the correct one; or an explicit gate on the
"I'm playing too" choice.

## Decision

The second and third, combined and enforced by the server: **one review step for
everyone, whose contents the server derives from the host player's
`is_playing`.**

- `host_sees_answers(room_id)` reads the host's `players` row.
- `draw_public(room_id, with_answers)` builds a **different `jsonb` object** in
  each case. For a racing host, `correct_index` and `fun_fact` are absent keys,
  not null values.
- Every draw RPC — `get_room_draw`, `swap_question`, `add_custom_question`,
  `remove_question` — returns that same projection through the same helper, so
  there is exactly one place the rule is expressed.
- The client renders an explicit note rather than a silent gap, so a racing host
  understands the omission is deliberate.

## Consequences

- **Veto still means something for a racing host.** They see category, tier,
  prompt and all four options — everything needed to judge "too obscure", "my
  team wrote this", "we did this last month" — which is what §5.1's veto is
  actually for. Hiding the prompt too would have made veto a blind reroll.
- **The MC keeps what the MC needs.** A host who is not racing reads fun-facts
  aloud at the reveal (PRD §5.3); withholding them would have damaged the show
  to solve a problem that host does not have.
- **`is_playing` becomes load-bearing and must stay immutable.** It is set once,
  in `join_room`, and nothing in the schema can change it. Any future
  "switch to MC" control would let a host flip, peek, and flip back — so such a
  control must either not exist or must be one-way into *playing*, never out of
  it.
- **A playing host still knows the answer to their own custom question.** That
  is unavoidable and different in kind: the system handed them nothing, they
  wrote it. PRD §2 puts anti-cheat beyond server-side validation out of scope
  ("office games are trust-based"), and the review step marks custom questions
  visibly so the room can see whose they are.
- **The rule is testable from outside.** `scripts/smoke.mjs` asserts that the
  string `correct_index` does not occur anywhere in the payload a racing host
  receives — a check that survives any future change to the projection's shape.
