# ADR-0009: Drama is buffered at the reveal transition and played at the TRACK beat

- **Status:** Accepted
- **Date:** 2026-08-22
- **Phase:** P2 — Avatars & motion

## Context

ADR-0003 fixes *when standings drama is derived*: `deriveCues` emits `player-advanced`, `overtake`, `lead-changed`, `streak-tier` and `streak-broken` only on the transition into `reveal`, because that is the only transition at which the previous and next standings are both known. It says nothing about when that drama is allowed to be *shown*.

The naive reading — play it the moment it arrives — puts the round's biggest movement behind the reveal panel, and in portrait inside P1's 28vh strip (`components/PixiStage.tsx`), where the track is a letterbox. PRD §5.3 puts the movement in the TRACK moment, and P1's TRACK camera cut needs something to cut *to*: cutting to a world that has already finished moving is a cut to a still frame.

## Decision

The world deliberately lags the standings by one beat. Drama cues arriving at the reveal transition go into `ChoreographerState.pending` via `bufferCue()` and nothing moves. Avatars hold their **pre-reveal** anchors — captured explicitly by `holdAnchors(state, anchors)` at the phase beats that precede reveal — until `phase-track` arrives, at which point `beginSequence()` compiles the whole queue into one sampled timeline and clears `pending`.

The hold is a snapshot of where the field *was*, not where it is going. `beginSequence` reads each avatar's start position from `heldAnchors` (`heldById.get(anchor.playerId) ?? anchor`) and its destination from the live anchors, so the movement track has real length. `completeSequence()` clears both `pending` and `heldAnchors`; any phase change mid-sequence hard-completes it — every avatar snaps to its final anchor and transient VFX clears.

## Consequences

- **The snapshot is the whole mechanism, and it is silently breakable.** If `heldAnchors` is ever populated from post-reveal standings, every movement track becomes zero-length: the sequence still runs, the camera still cuts, the timing still looks right in a profiler, and nothing moves. This exact bug shipped and survived seven task gates during P2 because no test observed *displacement*. Anything that touches the hold sites in `lib/world/runtime.ts` must be verified by measuring travel distance, not by asserting the sequence ran.
- P3 must not re-collapse this. A callout or lower-third that fires "on the drama" fires at reveal, one beat *before* the world reacts. That offset is intentional and P3's timing has to be written against the TRACK beat, not against cue arrival.
- The server pins TRACK at 4s (`supabase/migrations/0002_rpcs.sql`). Eight staggered players finish by ~1.3s and the arena reaction clears by ~2.6s, leaving ~1.4s of headroom, so a late cue or a stalled frame never truncates the sequence. Any future beat added to the timeline spends that headroom.
- A mid-game reload has an empty queue by construction (ADR-0003 seeds a fresh client with the phase beat and no drama), so there is never buffered drama owed to a client that missed it. See [ADR-0013](0013-persistent-vs-transient-vfx.md).
- An empty queue at `phase-track` — nobody scored — plays no sequence. The camera still cuts, to a world that is idling. That is intended, not a missing case.
