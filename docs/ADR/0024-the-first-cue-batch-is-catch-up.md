# ADR-0024: The first cue batch is catch-up

- **Status:** Accepted
- **Date:** 2026-08-23
- **Phase:** P4 — Audio identity

## Context

`startCueBridge` seeds from the store and emits the whole current beat as one
synchronous batch, so a mid-game reload replays the game's state through the
bus. Persistent state must be adopted from that seed batch; one-shot events
must not be *performed* as if they had just happened. ADR-0021 fixed one
instance of this by hand, for the staging vignette's `escalated` flag; P3's
`CURRENT.md` predicted P4's audio state would be the next place this pattern
was needed.

## Decision

`AudioState.catchUp` (`lib/audio/state.ts`) starts `true`. `applyCue` applies
bed and escalation transitions normally even while `catchUp` is set — so a
reload lands on the right bed — but returns no stings while it is set, so
nothing is *played*. The runtime (`lib/audio/runtime.ts`) queues a microtask
on the first cue it receives; because the bridge emits a batch synchronously
in one loop, that microtask runs exactly at the batch boundary and calls
`endCatchUp`. Separately, `escalated` is set the instant `final-question` is
seen rather than at the beat that resolves it (mirroring ADR-0021), so a
reload seeded directly into the final round's READ, ANSWER or REVEAL — none
of which reach the TRACK-beat arbitration — still lands escalated.

## Consequences

A reload adopts the right bed, including the final round's escalation, and
never machine-guns stingers; repeated refreshes are safe. Verified live: a
reload mid-ANSWER in the final round re-seeded `final-question` +
`phase-reveal` + `answer-resolved` in one batch with zero stings played.

The general form is available to P5 and P6: state derived from cues survives
a reload, one-shot performance does not. The subtlety to respect is that the
audio runtime must be mounted *before* `startCueBridge` in the room page
(`app/room/[code]/page.tsx`), or a client-side navigation into an
already-populated store loses the seed batch entirely and the runtime never
adopts the current bed.
