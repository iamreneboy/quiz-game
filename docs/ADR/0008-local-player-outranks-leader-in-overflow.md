# ADR-0008: The local player outranks the leader when the field can't all fit

- **Status:** Accepted
- **Date:** 2026-08-21
- **Phase:** P1 — Track world

## Context

Spec §5 requires the camera's pack framing to bias toward including "both the leader and the local player," but does not say which one wins when the field is spread wide enough that `MAX_SPAN_SEGMENTS` (ADR-0005) can't fit both at once. Something has to give, and the plan had to make this call unilaterally since the spec left it open.

## Decision

`lib/world/framing.ts`'s `fit()` holds the leader near the front of the frame (`LEADER_BIAS = 0.8`, i.e. 80% of the way across) when the group fits within the span limit, but if the field overflows `MAX_SPAN_SEGMENTS`, the local player is never dropped from frame — the camera re-centers to keep the local player in view, and the leader is the one that may fall out of shot instead. A dropped leader gets a chevron/off-screen indicator in `TrackReadout` (Task 7) rather than silently vanishing. Reasoning: being unable to see *yourself* in your own game is a worse failure than not being able to see whoever's currently winning, and the accessible HTML readout already shows everyone's rank regardless of what the camera frames.

## Consequences

- `frameTarget`'s `'pack'`/`'emphasis'` modes have an asymmetric guarantee: `localPlayerId` is a hard constraint on the returned `CameraState`, while the leader's inclusion is best-effort. Any future framing mode must preserve this asymmetry or explicitly supersede this ADR.
- Pinned by `tests/framing.test.ts`'s overflow cases — changing this tie-break is a visible, intentional code change to `fit()`, not an incidental one.
- The player never loses visibility into their own position, but a spectator-style "who's winning" read purely from the canvas can be momentarily wrong in an overflowing field; `TrackReadout`'s HTML standings list is the authoritative, always-complete source of rank, which this ADR relies on to make the camera's trade-off safe.
