# ADR-0013: Persistent VFX derive from standings; transient VFX live only inside a sequence

- **Status:** Accepted
- **Date:** 2026-08-22
- **Phase:** P2 — Avatars & motion

## Context

A player who reloads mid-game must land in a world that looks correct: the leader still scaled up, medals still glowing, an active streak still burning. But they must *not* be shown the last round's overtake lightning, and they are not owed a movement they missed.

The special-case approach — replay some effects on hydration, suppress others — needs a per-effect decision at every join, and gets it wrong the first time someone adds an effect without thinking about reload.

## Decision

Every VFX belongs to exactly one of two sets, and the set determines its lifetime.

| | |
|---|---|
| **Persistent** — derived from standings state, every frame | medal glow, leader scale, edge-holder turbo flame, active streak tier |
| **Transient** — alive only inside a sequence | boost trail, overtake lightning, ignition burst, arena reaction |

Persistent flair is a pure function of the current standings (`flairFor()` in `lib/world/flair.ts`), recomputed from state rather than triggered by an event. Transient VFX is scheduled by `beginSequence()` into the sequence timeline and cleared by `completeSequence()` — including the hard-complete path when a phase change interrupts.

Reload correctness then falls out rather than being handled. `deriveCues` seeds a fresh client with the phase beat only and no drama ([ADR-0003](0003-standings-drama-only-on-reveal.md)), so a reloaded client has an empty queue: avatars appear at their correct final anchors with all persistent flair intact and nothing transient owed.

## Consequences

- **The split is easy to break in one specific direction**: adding a state-derived effect to the transient set. It will look right for the whole session that introduces it and be wrong only after a reload — the one condition nobody exercises during development. Any new effect must be classified deliberately: *if a player joined right now, should they see this?* Yes means persistent and derived from standings; no means transient and scheduled into the sequence.
- The reverse error — a genuinely momentary effect made persistent — is louder and self-correcting, because it never stops playing.
- Persistent flair must be cheap enough to recompute every frame, since it is derived rather than cached. `flairFor()` is pure and allocation-light for that reason.
- `completeSequence()` clearing transient VFX is the only teardown path. An effect that installs itself outside the sequence's own bookkeeping leaks past the interruption case ([ADR-0009](0009-drama-buffered-to-the-track-beat.md)'s hard-complete), which is the path a phase change takes and therefore the one that runs most often in a real game.
- P4's audio inherits the same question per sound: a reloading player should hear nothing that already happened, but should hear a currently-burning streak's loop.
- **Known violation, recorded deliberately: the active streak tier does not yet honour this ADR.** The table above classifies it as persistent, but the implementation accumulates `streakTier` from cues inside `ChoreographerState` (`choreographer.ts`), not from standings, and `deriveCues` re-seeds `streaks: {}` on a fresh client. A player who reloads at streak 6 loses their flame and cannot recover it — `streak-tier` cues fire only at the 3/5/8 milestones. Medal, leader emphasis and edge-holder turbo *are* standings-derived (`flairFor`) and do survive. The wire cannot fix this on its own: `Standing` carries `longest_streak`, not the current run, and P2's spec forbade a protocol change. The fix is a `current_streak` field on `Standing`, owned by whichever phase next opens the protocol.
