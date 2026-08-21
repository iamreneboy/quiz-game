@AGENTS.md

# Project tracking

Before starting work, read `docs/CURRENT.md` — the live tracker for the active phase, active task, and open tech debt. Don't read `docs/phases/*.md` or old plans/specs unless `docs/CURRENT.md` or the task at hand points you there; they're historical record, not required context.

- `docs/CURRENT.md` — current phase, current task, tech debt / known issues, intentionally-skipped items. Keep this short: remove a phase's entry the day its last task completes.
- `docs/phases/PN-*.md` — one file per completed phase, created when its last task lands: scope, what was built, deviations, verification results. Never edited again after creation except to fix an error.
- `docs/ADR/` — one file per significant, hard-to-reverse, or non-obvious decision. See `docs/ADR/README.md` for the convention.
