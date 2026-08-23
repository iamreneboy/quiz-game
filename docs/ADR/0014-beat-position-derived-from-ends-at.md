# ADR-0014: Beat position is derived from `ends_at`, not local arrival

- **Status:** Accepted
- **Date:** 2026-08-23
- **Phase:** P3a — Round staging

## Context

The question surface needs to know how far into the current beat it is — to stagger READ's badges/question/options entrance and to drive ANSWER's countdown ring and tension ramp. The obvious source, "how long has it been since this component saw the phase change," breaks for a reload or a late join: both see the phase change at the wrong moment (immediately, regardless of how much of the beat has actually elapsed), and would replay the READ entrance or start the ANSWER ramp from scratch no matter how little time is left.

## Decision

`lib/staging/beats.ts`'s `elapsedIn(totalMs, remainingMs)` computes elapsed as `totalMs − remainingMs`, clamped to `[0, totalMs]`, where `remainingMs` comes from `msUntil(room.ends_at)` — the same server-anchored clock the pre-existing countdown and timer already used. `NOMINAL_MS` hand-mirrors the server's fixed durations for `countdown`/`read`/`reveal`/`track` (`supabase/migrations/0002_rpcs.sql:288-291`); `answer` is deliberately absent from that table and reads `room.timer_seconds` off the wire instead, because that duration is genuinely per-room, not fixed.

## Consequences

- A late joiner or a reload computes a large elapsed and lands with `stepsAt`/`tensionAt` already reporting the end state — "jump to the end state rather than replay" needs no flag and no special case in the pure functions. Clock skew is handled for free, because `msUntil` already applies `serverTime`'s offset.
- **Deriving the right STATE is not the same as rendering it without replay**, and that gap shipped and was caught only by live-reloading the page: `useStaging` starts at a hardcoded idle `StagingState` and only reflects the real room once `lib/staging/runtime.ts`'s ticker has run at least one tick after `room` populates. `room` itself only resolves after the realtime channel's async `SUBSCRIBED` round-trip (`lib/useRoomChannel.ts`), which happens strictly after this runtime has already started. Without correcting for it, a component mounting into an already-progressed beat (reload, late join) first renders the stale idle `steps`, then flips to the correct value one tick later — and to `AnimatePresence`, "absent, then present" is indistinguishable from a beat genuinely starting, so it replays the entrance. This was confirmed live for both `QuestionCard`'s badge slam-in (mid-READ reload) and `AnswerButtons`' mount stagger (mid-ANSWER reload).
- The fix is a **one-shot** bootstrap: `runtime.ts` publishes synchronously the instant `room` is first seen non-null (subscribing directly to `useGameStore`, not waiting for the next `requestAnimationFrame`), then never does so again for the lifetime of that runtime. It must stay one-shot — subscribing to *every* subsequent room change and eagerly republishing was tried and reverted, because it also collapsed the natural one-tick gap a genuinely fresh READ beat needs: a live-watching player's `QuestionCard` must still render one committed frame with `steps.badges === false` before the tick that flips it true, or `AnimatePresence` has nothing to treat as "entering" and the slam-in never plays for anyone, not just for reloads.
- Any component that conditionally mounts based on `useStaging` and wants a mount-in animation must additionally wrap that conditional in `AnimatePresence initial={false}` (see `StageShell.tsx`'s options slot) — the bootstrap fix only guarantees the *state* is correct on first render; whether a `motion` entrance transition fires on that first render is a separate contract each such consumer must uphold itself.
- There is no drift test between `NOMINAL_MS` and the server's actual durations, because the server values are not importable from the client (exactly as `lib/presentation/tokens.ts` mirrors `app/globals.css` with no test either). The mitigation is that the failure mode is graceful: if a server duration moved, the stagger would compress or complete early — it would never block, break, or lock the surface.
