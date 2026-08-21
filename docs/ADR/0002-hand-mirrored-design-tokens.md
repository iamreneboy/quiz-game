# ADR-0002: Design tokens are hand-mirrored into TS, not code-generated

- **Status:** Accepted
- **Date:** 2026-08-21
- **Phase:** P0 — Foundation & design system

## Context

Design tokens (colors, easing curves, durations, canvas constants) need to exist in two places: Tailwind's `@theme` block in `app/globals.css` (for HTML/CSS) and plain TS values in `lib/presentation/tokens.ts` (for Pixi, which needs `0xRRGGBB` numbers and cubic-bezier arrays, not CSS strings). Two representations of the same values drift unless something enforces sync.

## Decision

`app/globals.css`'s `@theme` block is the single source of truth. `lib/presentation/tokens.ts` is hand-maintained, not generated. `tests/tokens.test.ts` parses the CSS custom properties out of `globals.css` at test time and asserts every mirrored TS value matches — including a cross-check against `COLORS` in `lib/avatars.ts`, since the racer palette is persisted per-player in Postgres and must never silently renumber.

No codegen step, no build-time token pipeline.

## Consequences

- Zero build tooling to maintain for something this small (a fixed set of colors/curves/durations) — a codegen script would be more machinery than the problem justifies at M2's scope.
- The trade-off is manual discipline: changing a color in `globals.css` without updating `tokens.ts` is a real mistake someone can make. `tests/tokens.test.ts` is what makes that mistake loud (test failure) instead of silent (a Pixi sprite rendering the wrong shade of a color that looks right in HTML).
- Any future token addition follows the same rule: add to `@theme` first (source of truth), then only mirror into `tokens.ts` if non-CSS code actually needs it — don't mirror speculatively.
- If the token set grows enough that hand-mirroring becomes error-prone or frequent, that's a signal to revisit codegen — not a reason to skip the test in the meantime.
