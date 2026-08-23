# ADR-0018: The wire opens once, for `picks` and `current_streak`

- **Status:** Accepted
- **Date:** 2026-08-23
- **Phase:** P3b — Round staging: the outcome half

## Context

M2's roadmap treats the realtime payload as closed by default: every phase from P0 through P3a built its show entirely from presentation-side derivation over the existing wire, never asking the server for more. P3b needs an avatar-stacked distribution bar — who picked what, not just how many picked it — and `build_reveal` returned `counts: number[]` only (`supabase/migrations/0002_rpcs.sql:61`). There is no way to derive "who" from "how many". Separately, since P2, the streak flame has not survived a reload: `Standing` carries `longest_streak` (the best run ever), not the current one, so `flairFor` cannot derive the active tier from standings alone, and the fallback (an accumulator inside `ChoreographerState`, populated only by `streak-tier` cues at the 3/5/8 milestones) loses the flame on any reload between milestones. Both gaps were recorded as tech debt against the day some phase opened the protocol; neither could be worked around presentation-side.

Opening the protocol is a one-way cost: once a client depends on a field, every future server has to keep providing it. Opening it twice — once per gap — pays that cost twice for what could be one exception.

## Decision

Open the wire once, additively, for two fields:

- `build_reveal` gains `picks: { player_id, choice_index }[]`.
- `standings` gains `current_streak: number` — `longest_streak`'s loop, returning the trailing run (`cur`) instead of the best one (`best`).

`counts` stays on the wire even though `picks` subsumes it. Two reasons: it keeps `phase-reveal`'s cue shape untouched, so [ADR-0001](0001-presentation-cue-layer.md) still holds — P3b consumes the P0 cue vocabulary and adds nothing to it; and it is the graceful-degradation fallback for a client running against a pre-migration database, where `picks` is `undefined` (there is no runtime validation on the wire cast, `lib/store.ts:47`) and the distribution bar must fall back to a counts-only bar rather than an empty one.

The server returns `picks` — who chose what — not presentation-ready stacks. Aggregating by option and returning arrays of players per choice would bake a presentation decision (how the distribution bar groups and orders faces) into the wire, which this project's game-state/presentation split forbids: the payload describes game meaning, the client decides what it looks like.

## Consequences

Both fixes ride the same migration (`supabase/migrations/0003_reveal_picks.sql`), so a database only needs one additional deploy for the whole phase, not two. `lib/staging/distribution.ts` derives the distribution bar purely from `picks` (with a `counts`-only degrade when `picks` is absent or empty — the latter case matters too: a real post-migration server reports `counts` as all-zero exactly when `picks` is empty, so the two paths never disagree on an actual payload). `lib/world/flair.ts` derives the streak tier from `current_streak` on every render, so the flame is reload-proof by construction; the old cue-driven `streakTier` accumulator in `ChoreographerState` is gone entirely.

Future phases inherit the argued precedent, not a blank check: the next time a presentation need cannot be met from the existing wire, it should be weighed against *this* exception rather than treated as a new one to justify from scratch. `counts` staying on the wire alongside `picks` is a standing example of the fallback shape a protocol opening should leave for the client it might not reach yet.
