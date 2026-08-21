# ADR-0001: Presentation-cue layer is the sole game-state-to-show seam

- **Status:** Accepted
- **Date:** 2026-08-21
- **Phase:** P0 — Foundation & design system

## Context

M2 adds a whole production layer — Pixi world (P1-P2), staged round choreography (P3), audio (P4), ceremony (P5), a spectator stage view (P6) — on top of the M1 game loop, under a hard constraint: M2 is presentation-only, no schema/RPC/realtime changes (roadmap decision 4). Every one of those consumers needs to react to the same underlying game-state transitions (phase changes, standings deltas, streak changes) without each reimplementing "what just happened" detection, and without any of them reaching into `lib/store.ts` directly and coupling render code to store internals.

## Decision

Introduce a single, pure seam between game state and every presentation consumer:

- `lib/presentation/deriveCues.ts` — a pure function `(prev, next, state) -> { cues, nextState }` that diffs two consecutive store snapshots and emits a typed `Cue[]` batch. No side effects, no framework dependency — this is what's unit-tested against recorded M1 transition sequences (`tests/deriveCues.test.ts`, 20 cases).
- `lib/presentation/cueBus.ts` — a ~30-line framework-free typed emitter (`on`/`emit`) plus `startCueBridge()`, a store subscriber that runs the deriver on every store change and publishes the resulting cues.
- `lib/presentation/cues.ts` — the closed `Cue` union (`CueType`, `CueOf<T>`) every phase subscribes to. This vocabulary is authoritative; later phases consume it, they don't redefine it.

Pixi (P1+), `motion`-driven UI (P3), and Howler (P4) subscribe to `cueBus` and nothing else. None of them ever read `useGameStore` directly for render decisions.

## Consequences

- Every later phase's "what should I animate/play right now" logic is testable in Node against a recorded cue stream, with zero DOM/Pixi/audio setup.
- Adding a new presentation consumer (e.g. P6's stage view) never means teaching it the store's shape — it subscribes to the same cue types every other consumer uses.
- The cue vocabulary becomes a de facto contract: extending it (new cue type, new field) is a considered change, not a side effect of some phase's internal refactor. See ADR-0003 for the specific rule that keeps this diffing correct across phases (ADR-0003) and phase-completion notes in `docs/phases/P0-foundation-design-system.md` for the two intentional naming deviations from the spec's field names (`streak` not `tier`; `questionTier` not `tier`) that keep this union free of name collisions with the celebration tier every cue also carries.
- If a future phase discovers it needs information the deriver can't produce from `{ room, players, question, reveal, standings, myAnswer }` alone, that's a flagged exception requiring a decision in that phase's spec — not a quiet reach into the store.
