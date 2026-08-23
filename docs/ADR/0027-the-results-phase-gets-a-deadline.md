# ADR-0027: The results phase gets a deadline

- **Status:** Accepted
- **Date:** 2026-08-24
- **Phase:** P5a — Podium ceremony

## Context

Every beat the ceremony needs to derive position for — READ's badge stagger, ANSWER's countdown ring, the podium's bronze/silver/gold rise — is driven the same way per [ADR-0014](0014-beat-position-derived-from-ends-at.md): elapsed is computed from the server's `ends_at`, never from local mount time, so a reload or a late join jumps to the correct state instead of replaying from the start. `results` was the one phase where this broke down: `phase_ends_at` was only ever set for the phases that advance to something (`0002_rpcs.sql`'s `advance_phase`), and results is terminal — there is no next phase to time a countdown toward — so it stayed `null`.

Two alternatives were rejected before landing on a deadline. A device-local stored anchor (write a timestamp to `localStorage` the first time the client sees `phase-results`) is wrong across devices — a second screen or a reload from a different browser would compute a different start time for the same room. Replaying the ceremony from elapsed-zero on every mount was rejected for a more specific reason: P4 already suppresses the `fanfare` sting on a seeded cue batch ([ADR-0024](0024-the-first-cue-batch-is-catch-up.md)), so a client that replayed the podium visuals on every reload would show a silent re-animation next to audio that correctly stays quiet — the picture and the sound would disagree about whether this was a live event or a replay.

## Decision

`advance_phase`'s `results` arm now sets `phase_ends_at = now() + interval '9 seconds'`, the same pattern as every other phase's fixed duration, byte-identical to the 0002 body except for this one added `case` arm (`supabase/migrations/0004_ceremony.sql`).

## Consequences

At this one phase, `ends_at` means "when the ceremony has finished playing," not "when the next phase begins" — there is no next phase. It is inert for game state by construction, guarded twice: `useHostDriver` returns early on both `status !== 'playing'` and `phase === 'results'` (`lib/useHostDriver.ts:35`), and `advance_phase` itself raises `'game finished'` once `status = 'finished'`. Nothing schedules against this deadline and nothing advances past it; the client reads it purely as an animation anchor, exactly the way `elapsedIn`/`msUntil` already read every other phase's deadline.

A pre-migration client — a database that has not taken 0004 — gets `ends_at: null` at results. `msUntil(null)` returns `0` (`lib/serverTime.ts:10`), so `elapsedIn(CEREMONY_MS, 0) = CEREMONY_MS`: the ceremony computes as fully elapsed on the very first frame and renders a settled podium, never a crash or a blank canvas. **Verified live** during this phase's own implementation: `advance_phase` was temporarily reverted to its exact 0002 body in a scratch `psql` session, a real room was pushed through it into `results`, and the room genuinely carried `ends_at: null`. The client rendered a fully-settled podium — every block risen, spotlight on, confetti already fired, results table intact — with zero console errors, then 0004 was re-applied. This is the fallback shape [ADR-0018](0018-the-wire-opens-once-for-picks-and-current-streak.md) asks every protocol opening to leave behind, and it cost nothing extra to build: the same `elapsedIn`/`ceremonyStepsAt` pipeline that makes a mid-ceremony reload land at the true position makes a pre-migration deadline land settled, with no separate code path for either case.

`CEREMONY_MS` (`lib/ceremony/beats.ts`) is now a hand-maintained client mirror of this migration's `9 seconds`, in the same tradition as `lib/staging/beats.ts`'s `NOMINAL_MS` mirroring the other phases' server durations — there is no drift test, because the server value is not importable from the client, and the failure mode if the two ever disagreed would be graceful (the sequence would compress or complete early, never block or crash).
