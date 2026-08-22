# ADR-0012: The VFX budget adapts at runtime without touching `profile`

- **Status:** Accepted
- **Date:** 2026-08-22
- **Phase:** P2 — Avatars & motion

## Context

[ADR-0004](0004-performance-profile-static-heuristic.md) established that `useSettings().profile` is a static startup heuristic plus a manual override — it never changes on its own mid-session — and explicitly noted that if a later phase needed real mid-session adaptation, that would be new scope rather than a gap in P0.

P2 is that phase. Avatars, trails, lightning, ignition bursts and a stadium reaction are the first things in the game that can genuinely overrun a frame budget on a borderline device. But the fix cannot be "flip `profile` to `reduced` when frames drop": every Pixi/motion branch in P0 and P1 was written assuming `profile` is stable for the duration of a render pass, `WorldScene` is constructed from it, and flipping it mid-game would tear down and rebuild the world in the middle of the round that was already struggling.

## Decision

A separate, narrower dial. `lib/world/vfxBudget.ts` is pure and resolves to one of three levels — `full`, `lean`, `minimal` — evaluated at the 500ms cadence `runtime.ts` already publishes `FrameStats` on. It clamps **particle output only**: trail length, turbo flame particles vs a static sprite, streak tier cap, lightning/ignition counts, arena reaction scale.

`useSettings().profile` is never written by this phase. `WorldScene` is never reconstructed. **ADR-0004 stands unamended** — this extends it with a second, independent axis rather than superseding it.

Two invariants make the dial safe:

- **Rank is information, not decoration.** `VfxAllowance` has no medal-glow or leader-scale field at any level, so the budget structurally cannot shed them. Losing frames must never cost the player the ability to see who is winning.
- **Hysteresis, deliberately asymmetric**, mirroring `shouldRetarget` in `camera.ts`: shed one level when `FrameStats.dropped` exceeds `DROP_THRESHOLD = 24` (20% of `perf.ts`'s 120-frame window), but recover one level only after `RECOVERY_EVALUATIONS = 4` consecutive evaluations with `dropped === 0` (~2s). Fast down, slow up, so it cannot oscillate between levels in a marginal frame budget.

The `reduced` profile pins the level at `minimal` and never upgrades — the two axes compose, with `profile` as the ceiling.

A single pooled emitter with a fixed particle ceiling is allocated once at init, so a budget change alters emission rates and never allocates. Adapting to a frame shortage must not itself cost a frame.

## Consequences

- **Two dials now exist and they are not interchangeable.** `profile` answers "what kind of device/user is this" and is stable. The VFX level answers "is this frame budget holding right now" and moves. Code that branches on one must not be rewritten to branch on the other; a future watchdog that writes `profile` would break every ADR-0004 assumption in P0 and P1.
- The asymmetry is the anti-oscillation mechanism, and it is easy to erase by "tidying" the recovery path into a symmetric threshold. The clean-run counter must reset on any bad window, not decay.
- **Shedding particles is not the same as shedding the signal.** At `minimal` the turbo flame and the streak tier degrade to *static decals* rather than disappearing — decided by the pure `lib/world/decals.ts` and drawn by `AvatarNode`. This matters most for the accessibility case: `reduced` is pinned at `minimal`, so a level that drew nothing would take every streak and edge-holder cue away from precisely the users who asked for less motion, not fewer facts.
- **The static form is currently all-or-nothing per level, and that is why one cell of the spec's table is not what shipped.** `staticDecals()` branches on the single `allowance.particles` boolean, so a level either runs every particle system or none of them. Spec §8 asks for the turbo flame to be a static sprite at `lean` as well as at `minimal`; `lean` has `particles: true`, so it emits instead. Left as built at phase close — no *signal* is lost at `lean` (the turbo is drawn, at half rate), and the shipped ladder is monotone where the spec's makes `lean` and `minimal` identical for that one effect. Anyone changing this must add a per-kind particle dimension to `VfxAllowance` and suppress the corresponding requests in the choreographer at the same time; drawing a decal *and* emitting is the smear this function's guard exists to prevent.
- The `never shed` set (medal glow, leader scale) is a correctness constraint, not a tuning choice. A later phase adding a rank-bearing effect must add it to that set, and a later phase adding a decorative effect must add it to the ladder — an effect in neither is a silent leak past the budget.
- Verifying this needs a live run: throttle CPU with `?perf=1` open, watch the level shed and then recover, and confirm `profile` is unchanged throughout. It is not observable from unit tests alone, which pin the pure transition function but not the wiring.
