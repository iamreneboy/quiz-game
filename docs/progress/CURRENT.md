# Current work — Circuit Break

> Live tracker only. Read this first; don't read other files in `docs/progress/` or old plans unless this file points you there. Move a phase's entry out to `docs/progress/PN-*.md` the day its last task lands — this file should never grow past "what's active right now."

## Current phase

None in progress.

- **Last completed:** P0 — Foundation & design system → [`docs/progress/P0-foundation-design-system.md`](P0-foundation-design-system.md)
- **Next up:** P1 — Track world (scope only, not yet spec'd or planned — see `docs/superpowers/specs/2026-08-21-m2-the-show-roadmap.md` §P1)

## Active task

None.

## Notes

- **2026-08-21 — P1 Task 8 perf measurement (spec §12 exit criterion 1).** Measured via the `?perf=1` overlay on the development laptop, landscape, full screen, 1400×900, through a 3-question round including multiple TRACK moments:
  - **High profile:** p50 6.9ms, p95 7.0–7.1ms, dropped 0/120 samples, sustained ~145fps throughout countdown/read/answer/reveal/track/results.
  - **Reduced profile (forced via Settings):** p50 6.9–7.0ms, p95 7.1–7.2ms, dropped 0/120 samples, ~143–145fps. Visually confirmed the ladder applies: fewer/flatter background layers (no visible ambient gradient shimmer between zone bands), and the office-park/neon-city zones render with less depth gradation than the high-profile pass.
  - Exit criterion 1 (p50 ≤ ~16.7ms, dropped frames low single digits) is comfortably met on this dev laptop in both profiles — no layer-count reduction in `content/nightRace.ts` was needed.

## Tech debt / known issues

- **`app/room/[code]/page.tsx:29`** — pre-existing `react-hooks/set-state-in-effect` ESLint error (`setHasSession` set synchronously inside a `useEffect`). Predates M2; not fixed during P0 because that file's session-check logic was outside P0's scope. Likely fix: derive `hasSession` from `loadSession(code)` directly (e.g. lazy `useState` initializer) instead of effect + state.
- **ESLint has no ignore for `.claude/worktrees/`** — running `npm run lint` from the repo root while a worktree is checked out under `.claude/worktrees/` double-lints that nested copy and inflates the reported problem count enormously. Not a real regression — just don't trust the count while a worktree exists. Fix: add `.claude/worktrees/**` to the ignores in `eslint.config.mjs`.

## Intentionally skipped

None currently.
