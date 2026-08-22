# ADR-0010: The arena reaction is exclusive; per-avatar VFX is subdued, never omitted

- **Status:** Accepted
- **Date:** 2026-08-22
- **Phase:** P2 — Avatars & motion

## Context

A single TRACK beat can carry several dramas at once: two overtakes, a lead change, and someone hitting streak 8. Playing all of them at full intensity produces noise nobody can read; picking one winner and dropping the rest silently deletes things that happened to real players. Neither is acceptable, and one arbitration rule cannot do both jobs — because the two kinds of effect fail differently. A quieter spark on someone's avatar is still legible; half a stadium light sweep is not.

## Decision

Two rules, applied to two different populations.

**Per-avatar VFX is never omitted.** `resolveTier(pending)` (in `lib/presentation/celebration.ts`) picks the beat's headline tier; `isSubdued()` marks everything below it. Subdued effects render at an intensity multiplier of `SUBDUED_INTENSITY = 0.6` — a *multiplier on the effect*, applied per effect, not per player and not as a skip. A streak-3 spark inside an overtake beat is a quieter spark, not an absent one. Every player who did something sees their own thing happen.

**The arena reaction is exclusive.** Exactly one fires per TRACK beat, awarded to the headline tier, and streak-8's stadium response fires *only* when `streakMilestone` is the headline. If an overtake outranks it, the inferno still ignites on the avatar and the world simply does not react. This is what stops the in-world announcement from firing every beat and thereby meaning nothing.

P2 ships the world-space half of PRD §6's "arena announcement" only: the avatar inferno plus a scene reaction — stadium light sweep and banner flash — driven through P1's existing `Grade` escalation dial. No HTML callout, per roadmap constraint 2 (Pixi owns the world, HTML owns the readable).

## Consequences

- **P4's audio must mirror this arbitration, not invent its own.** One stinger per beat keyed to the same headline tier; per-player sounds subdued rather than dropped. Two different arbitrations over the same beat would desynchronise sound from picture in exactly the moments that matter most.
- **P3's callout system inherits the exclusivity.** P3 adds a text layer over an effect that already exists; it must fire on the same headline decision, or the screen will announce one thing while the stadium reacts to another.
- The 0.6 multiplier is per effect. Applying it once per player — subduing a player's whole bundle — is a different and wrong behaviour that produces the same screenshot in the single-effect case, so it will not be caught by eye.
- `resolveTier` must be total over the pending set, including the empty set. A beat with no drama resolves to no headline and no arena reaction, which is the idling-world case [ADR-0009](0009-drama-buffered-to-the-track-beat.md) describes.
- Adding a new drama cue type means placing it in the tier order *and* deciding whether it can ever earn an arena reaction. Neither is optional; a cue with no tier silently becomes permanently subdued.
