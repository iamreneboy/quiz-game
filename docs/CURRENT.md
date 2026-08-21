# Current work — Circuit Break

> Live tracker only. Read this first; don't read `docs/phases/*` or old plans unless this file points you there. Move a phase's entry out to `docs/phases/PN-*.md` the day its last task lands — this file should never grow past "what's active right now."

## Current phase

None in progress.

- **Last completed:** P0 — Foundation & design system → [`docs/phases/P0-foundation-design-system.md`](phases/P0-foundation-design-system.md)
- **Next up:** P1 — Track world (scope only, not yet spec'd or planned — see `docs/superpowers/specs/2026-08-21-m2-the-show-roadmap.md` §P1)

## Active task

None.

## Tech debt / known issues

- **`app/room/[code]/page.tsx:29`** — pre-existing `react-hooks/set-state-in-effect` ESLint error (`setHasSession` set synchronously inside a `useEffect`). Predates M2; not fixed during P0 because that file's session-check logic was outside P0's scope. Likely fix: derive `hasSession` from `loadSession(code)` directly (e.g. lazy `useState` initializer) instead of effect + state.
- **ESLint has no ignore for `.claude/worktrees/`** — running `npm run lint` from the repo root while a worktree is checked out under `.claude/worktrees/` double-lints that nested copy and inflates the reported problem count enormously. Not a real regression — just don't trust the count while a worktree exists. Fix: add `.claude/worktrees/**` to the ignores in `eslint.config.mjs`.

## Intentionally skipped

None currently.
