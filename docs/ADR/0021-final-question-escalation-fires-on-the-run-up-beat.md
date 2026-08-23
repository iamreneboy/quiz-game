# ADR-0021: Final-question escalation fires on the run-up beat

- **Status:** Accepted
- **Date:** 2026-08-23
- **Phase:** P3b — Round staging: the outcome half

## Context

Before this phase, `final-question` fired alongside `phase-read` for the final round (`lib/presentation/deriveCues.ts`'s `read` case). P3a's spec built the 3-second READ beat's stagger — badges lock at 460ms, the question rises at 1000ms — to protect a specific, deliberate reading window before ANSWER begins. Announcing "FINAL QUESTION" at the same instant, on the same beat, spends part of that same window on the announcement rather than the question. The final round is the one question where misreading costs the most, and it was the one round paying an announcement tax the other rounds didn't.

## Decision

`final-question` moves one beat earlier: it fires entering the **TRACK of round `total_rounds − 1`** — the run-up to the final round — rather than on the final READ itself. It is buffered like any other drama cue and arbitrated by the same `resolveTier` an overtake or a streak milestone would be; `finalQuestion` outranks `overtake` in `CELEBRATION_TIERS`, so an overtake landing on the same run-up beat correctly demotes to a rail mark rather than fighting the escalation for the one banner a beat gets ([ADR-0010](0010-exclusive-arena-reaction-subdued-avatar-vfx.md)). The escalation needs no bespoke arbitration of its own — it falls out of the existing tier ordering.

Two edge cases the normal run-up emission doesn't cover, both handled in `deriveCues.ts`:

- **`total_rounds === 1`**: there is no preceding TRACK to escalate on, so `final-question` fires on `phase-countdown` instead — the one case where the "announcement costs reading time" problem doesn't apply, because there is no earlier beat to move it to.
- **Reload mid-final-round**: a client that reloads or joins with `room.round === room.total_rounds` never saw the run-up TRACK in this session, so `deriveCues`'s unseeded branch synthesizes the cue directly, unshifted ahead of whatever phase cue the current phase would otherwise produce.

`escalated` — surfaced as `data-escalated` on `StageShell`, driving the round chip, the tension frame's warm palette, and the ring — stays true from this cue until `phase-results` resets it, independent of which specific beat set it.

## Consequences

The final READ's own timing is now byte-identical to every other round's — nothing added, nothing to protect it from. Every millisecond of the reading window P3a built stays reading time.

The reload-seeding case is more consequential than it looks, and future work touching `lib/staging/runtime.ts`'s callout wiring must respect it: the seeded `final-question` cue does **not** reliably arrive alongside a `phase-track` cue the way the live run-up emission does (spec's own emission table — Task 5's ordering guarantee, "`final-question` must be dispatched before `phase-track` in the same cue batch", only holds for the *live* run-up path). A reload landing directly in the final round's READ, ANSWER or REVEAL produces a seed batch of `[final-question, phase-X]` where `X` is never `track`. `lib/staging/runtime.ts`'s `final-question` handler was written to buffer the cue and set `escalated: true` on the local accumulator immediately, in the same statement — not to defer to `resolveCallout` at the next `phase-track`, and not to rely on `phase-read`'s handler (which calls `clearCallout`, discarding whatever is pending, not resolving it). This was found live, not by inspection: before the fix, a reload seeded into an escalated final round's ANSWER beat published `escalated: null` — the chip, the warm frame, and the ring's hot track never appeared until the game reached results without them. Any future change to this wiring that routes `escalated` only through `resolveCallout` reintroduces exactly this regression.
