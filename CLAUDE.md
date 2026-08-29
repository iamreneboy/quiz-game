@AGENTS.md

# Project tracking

Before starting work, read `docs/progress/CURRENT.md` — the live tracker for the active phase, active task, and open tech debt. Don't read other files in `docs/progress/` or old plans/specs unless `docs/progress/CURRENT.md` or the task at hand points you there; they're historical record, not required context.

- `docs/progress/CURRENT.md` — current phase, current task, tech debt / known issues, intentionally-skipped items. Keep this short: remove a phase's entry the day its last task completes.
- `docs/progress/PN-*.md` — one file per completed phase, created when its last task lands: scope, what was built, deviations, verification results. Never edited again after creation except to fix an error.
- `docs/ADR/` — one file per significant, hard-to-reverse, or non-obvious decision. See `docs/ADR/README.md` for the convention.

# Git workflow (non-negotiable)

- **Never ask whether to commit, merge, or push.** When a task or plan is done and verified, do it: commit, merge to `main`, push, then remove the worktree and delete the merged branch.
- **A plan file is committed the moment it exists**, not after it is executed. `docs/superpowers/plans/*.md` is part of the record — write it, then `git add`/commit/push it in the same pass. Committing it again after execution (with checkboxes ticked) is expected; leaving it untracked is not.
- **Clear diagnostics before committing** — `npx tsc --noEmit`, `npm run lint`, `npm test`, plus IDE diagnostics on touched files. A clean VS Code Problems panel is part of "done".
