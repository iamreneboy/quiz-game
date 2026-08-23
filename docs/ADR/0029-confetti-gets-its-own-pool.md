# ADR-0029: Confetti gets its own pool

- **Status:** Accepted
- **Date:** 2026-08-24
- **Phase:** P5a — Podium ceremony

## Context

`lib/world/render/Vfx.ts` is one pooled emitter for the whole scene: 240 slots (`MAX_PARTICLES`) allocated once at construction and never grown, shared by every particle-based effect the game has had through P4 — trails, lightning, ignition, the arena reaction, streak flames, and medal glows (`kind: 'glow'`, pushed through it at `lib/world/choreographer.ts:304`). Confetti at ceremony density (up to 180 pieces, `MAX_PIECES`) sharing that same 240-slot pool would, on a claim-the-oldest-particle cycle (`Vfx.claim()`), evict exactly the medal crowns the podium exists to show — the one VFX the spec calls out as never budget-clamped, because rank is information, not decoration (`lib/world/vfxBudget.ts`'s own doc comment).

The physics disagree as much as the demand does. `Vfx` particles are avatar-mounted (`emit(request, x, y, ...)` takes a screen-space mount point), move upward and outward from that point, and live sub-second (`LIFETIME_MS = 700`). Confetti is viewport-wide, falls under gravity from above the frame, rotates, and lives multiple seconds (`LIFETIME_MS = 3200`, randomized ±30%). Forcing one pool's particle shape to serve both would have meant branching `Vfx`'s own update loop on which kind of physics a slot was currently running, for a shared allocation that then has to be sized for the worst case of both.

## Decision

`lib/world/render/Confetti.ts` owns a second, separate pool with its own physics, its own pooling policy (index-order reuse, not oldest-first eviction — a burst allocates its whole count up front and never needs to steal a slot mid-flight), and its own gate on `VfxAllowance.confetti` (`lib/world/vfxBudget.ts`), the same ladder every other effect answers to. The pool is allocated **lazily**, on the first frame that actually asks for confetti, so the lobby and all twelve rounds of a normal game pay nothing for graphics objects they never use.

## Consequences

Two pools now need to agree independently with the same budget ladder rather than one pool enforcing it in a single place — `Vfx` reads `allowance.trail`/`.accent`/`.arena`/`.turbo`/`.streak`, `Confetti` reads `allowance.confetti`, and nothing structurally stops the two from drifting out of step with each other if a future phase edits one without the other. The trade is deliberate: the alternative was a single pool whose particle shape had to serve two physically incompatible effects, and the medal crown — the one piece of flair this game explicitly never budgets away — could not share a slot with a 180-piece burst and survive it.

Both pools share the same Pixi v8 destroy trap, documented once in `Vfx.ts` and repeated verbatim in `Confetti.ts`: `container.destroy({ children: true })` alone strands every pooled `Graphics`' `_ownedContext`, because Pixi v8 only frees it when `options` is falsy or `options.context === true`. Any future third pool needs the full `{ children: true, context: true, style: true, texture: false }` call, not a shorter one that happens to compile.

**A z-order consequence, found live rather than assumed.** `WorldScene`'s child order is paint order: whatever is added to `root` later draws on top of, and is unaffected by, whatever was added before it. `Grade` — the full-screen mood overlay — is added last in every phase before this one, which is correct: it is meant to tint everything beneath it, including the podium and the avatars standing on it (this phase deliberately holds `escalation` at 1 through the whole ceremony for exactly that neon-dimmed look). Confetti is the one thing in the scene that must **not** take that tint — a celebratory burst read through a 30%-alpha magenta wash reads as muted, not muted-by-design. `Confetti`'s container is mounted **after** `Grade`'s graphic, the one addition in this phase that goes on top of the mood overlay rather than under it, confirmed live: a full-density burst rendered in clean, saturated colour against a visibly graded background, in the same frame.
