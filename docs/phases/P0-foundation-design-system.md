# P0 — Foundation & design system

- **Status:** Complete
- **Completed:** 2026-08-21
- **Spec:** `docs/superpowers/specs/2026-08-21-m2-p0-foundation-design.md` (parent: `docs/superpowers/specs/2026-08-21-m2-the-show-roadmap.md` §P0, `docs/PRD.md` §8–§9)
- **Plan:** `docs/superpowers/plans/2026-08-21-m2-p0-foundation-design.md`
- **Merged:** `main` @ `c39c25c` (merge of `worktree-m2-p0-foundation-design` @ `73fbe39`)

## Scope (from the roadmap)

The presentation substrate every later M2 phase (P1–P6) builds on: design tokens, celebration hierarchy, the presentation-cue layer, performance profiles, the Pixi canvas mount, and the app shell restyled in the night-race visual identity. Presentation-only — no changes to `supabase/**`, `lib/store.ts`, `lib/types.ts`, `lib/useRoomChannel.ts`, `lib/useHostDriver.ts`, or any RPC/realtime payload.

## What was built

| # | Task | Key files |
|---|---|---|
| 1 | Design tokens + type faces | `app/globals.css` (`@theme` source of truth), `lib/presentation/tokens.ts`, `app/layout.tsx` (Chakra Petch + Manrope via `next/font/google`) |
| 2 | Celebration hierarchy | `lib/presentation/celebration.ts` — `routine < streakMilestone < overtake < finalQuestion < victory` |
| 3 | Cue vocabulary + derivation | `lib/presentation/cues.ts`, `lib/presentation/deriveCues.ts` — see ADR-0001, ADR-0003 |
| 4 | Cue bus + store bridge | `lib/presentation/cueBus.ts`, wired into `app/room/[code]/page.tsx` via `startCueBridge()` |
| 5 | Performance profiles + settings store | `lib/presentation/profile.ts`, `lib/useSettings.ts`, `components/MotionProvider.tsx` — see ADR-0004 |
| 6 | Glass UI primitives + settings control | `components/ui/{Panel,Button,Input,Select}.tsx`, `components/SettingsControl.tsx` |
| 7 | PixiStage | `components/PixiStage.tsx` — empty scene, profile-aware lifecycle, mounted behind the room view |
| 8 | App-shell restyle | `app/page.tsx`, `app/host/new/page.tsx`, `components/JoinGate.tsx` |

New deps: `pixi.js@8.20.0`, `motion@13.1.1`, `howler@2.2.4`, `@types/howler@2.2.13` (Howler installed but unused until P4, per roadmap decision 2).

## Design signature

Landing, host setup, and join gate share one recurring visual signature: HUD viewfinder-corner brackets on each screen's primary panel, plus a one-shot neon scan pulse on the landing hero — a deliberate nod to race telemetry/HUD framing rather than a generic dark-mode card treatment. Applied only to primary panels (not scattered across every element) to keep it a signature rather than decoration.

## Deviations from the spec (as shipped)

1. `streak-tier` cue carries `streak: 3 | 5 | 8`, not `tier` — the spec's field name collides with the celebration `tier` every cue carries. Same reason `phase-read` uses `questionTier` for the 1–4 question difficulty.
2. `components/MotionProvider.tsx` isn't in the spec's module layout — settings hydration must happen in an effect (not during render) to avoid an SSR/hydration mismatch, and `MotionConfig` needs exactly one host; one file does both, at the root, once.
3. Standings drama derived only on the `reveal` transition — see ADR-0003.
4. `streak-broken` only fires from a streak of 3+ (below that, no VFX tier was ever shown, so the cue would be noise).
5. `cueBus.ts` exposes `clearCueBus()` (tests only) alongside `on`/`emit`; `startCueBridge()` is mounted with a bare `useEffect` in the room page rather than a dedicated hook file, keeping `cueBus.ts` framework-free and Node-testable.

## Deviations found during implementation (not anticipated by the plan)

- **`e2e/settings.spec.ts`'s `reducedMotion` test** uses `page.emulateMedia({ reducedMotion: 'reduce' })` in a `beforeEach` instead of the plan's `test.use({ reducedMotion: 'reduce' })`. Root-caused: the `@playwright/test` context-option fixture for `reducedMotion` does not reliably apply in this environment — reproduced independent of all app code, failing even on `about:blank` — while the explicit `page.emulateMedia()` API works correctly. Documented in the commit message for `feat(ui): glass primitives and the performance-profile settings control`.

## Verification

- `npm test` — 8 files, 55 tests (pre-existing `rank`/`serverTime`/`store` + new `tokens`(6) `celebration`(8) `deriveCues`(20) `cueBus`(5) `profile`(9))
- `npx tsc --noEmit` — clean
- `npm run lint` — clean except one **pre-existing, unrelated** error, see `docs/CURRENT.md` tech debt
- `npm run build` — succeeds (Turbopack, self-hosted fonts)
- `npx playwright test` — 14/14, including the game-flow suite's new `[data-testid="pixi-stage"] canvas` assertion
- Manual: Pixi canvas lifecycle (single instance under Strict Mode, resize follows `resizeTo`, resolution capped at 2×, teardown on navigation, rebuild on profile change), cue stream verified against a real two-player game, reduced-motion collapse verified via screenshot timing contrast

## Exit criteria (roadmap §P0)

- [x] New visual identity on landing, host setup, join gate
- [x] Empty Pixi canvas mounts, resizes, tears down correctly in the room view
- [x] Profile switching and reduced-motion demonstrably alter behavior
- [x] Presentation-event layer unit-tested against recorded M1 state transitions
- [x] Full Playwright e2e suite passes

## Related ADRs

[0001](../ADR/0001-presentation-cue-layer.md) · [0002](../ADR/0002-hand-mirrored-design-tokens.md) · [0003](../ADR/0003-standings-drama-only-on-reveal.md) · [0004](../ADR/0004-performance-profile-static-heuristic.md)
