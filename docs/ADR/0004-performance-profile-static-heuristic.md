# ADR-0004: Performance profile is a static startup heuristic, not a runtime watchdog

- **Status:** Accepted
- **Date:** 2026-08-21
- **Phase:** P0 — Foundation & design system

## Context

PRD §9 and the M2 roadmap (cross-cutting constraint 5) require a `high`/`reduced` performance profile that every phase's Pixi/motion/audio work must respect, resolved from device capability plus `prefers-reduced-motion` plus a manual override. P1's exit criteria explicitly mentions "60fps on a mid-range laptop, degrades gracefully on mobile" — which a real production game-show renderer would eventually want to enforce with a live frame-rate watchdog that can downgrade mid-session.

## Decision

P0 ships only the static half: `resolveProfile(signals, override)` runs once at startup from `navigator.deviceMemory`, `navigator.hardwareConcurrency`, `matchMedia('(prefers-reduced-motion: reduce)')`, and coarse-pointer+narrow-viewport, combined with a `cb:settings:profile` localStorage override the user can force to `high` or `reduced` regardless of device signals. There is no runtime FPS sampling and no automatic mid-session downgrade — out of scope for P0 by explicit statement in the P0 plan's Global Constraints.

## Consequences

- `useSettings().profile` is a value that only changes on hydration or an explicit user action (`setOverride`) — never on its own mid-game. Every later phase's Pixi/motion/audio branch on `profile` can assume it's stable for the duration of a render pass; nothing needs to handle it flipping under them from a watchdog.
- A device that's borderline-capable gets whatever `resolveProfile`'s static signals predict at load time, for the whole session — if that's wrong (e.g. thermal throttling mid-game), the user's only recourse today is the manual override in `SettingsControl`, not an automatic correction.
- If P1 or P2's fps exit criteria turn out to need real mid-session adaptation, that's new scope for whichever phase hits it, not a gap in P0 — a runtime watchdog would be an additive change to `lib/useSettings.ts` (a new `profile` transition path), not a rework of the static heuristic this ADR covers.
