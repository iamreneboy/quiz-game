# ADR-0005: Auto-framed pack camera with a MAX_SPAN legibility cap

- **Status:** Accepted
- **Date:** 2026-08-21
- **Phase:** P1 — Track world

## Context

Segments in the track world have a fixed world width (`SEGMENT_WIDTH`), so a longer game is a genuinely longer track rather than a track rescaled to fit the viewport. A naive camera that always framed every player (last place to leader) would, on a long game with a spread field, either zoom out until markers are illegibly small or leave the viewport unable to show the whole field at all. The spec (§5, decision 2) requires the camera to auto-frame the pack — last place to leader plus padding — while staying legible.

## Decision

The camera frames the pack (last place to leader, plus padding) and zooms to fit, but the fit is clamped between `MIN_SPAN_SEGMENTS = 2.5` and `MAX_SPAN_SEGMENTS = 14` (`lib/world/camera.ts`). Below the minimum, the camera won't punch in tighter than 2.5 segments even for a single marker (keeps establishing shots and close-ups readable). Above the maximum, the camera stops trying to fit the entire field and instead frames the widest legible window, biased toward keeping the leader and the local player in shot (see ADR-0008 for the tie-break when both can't fit). The world travels underneath the players; the track itself is never rescaled to fit the viewport.

## Consequences

- A game with a very spread-out field (e.g. one player far ahead after a comeback) will not show every player at once once the spread exceeds `MAX_SPAN_SEGMENTS` — some markers can be offscreen. `TrackReadout` surfaces this via an "off screen" chevron/tag per player (Task 7), so information is never lost, only the camera's visual framing.
- `MIN_SPAN_SEGMENTS`/`MAX_SPAN_SEGMENTS` are fixed constants shared by `lib/world/camera.ts` and `lib/world/framing.ts` — later phases changing pack-framing behavior must respect these bounds or explicitly supersede this ADR.
- The clamp is unconditional and profile-independent; there is no separate legibility bound for the reduced-motion profile — only the *how* of getting there (drift, ease duration) changes with profile, not the span bounds themselves.
