# Architecture Decision Records

One file per significant, hard-to-reverse, or non-obvious decision — the kind a future session needs the *why* for, not just the *what* (the code already shows the what).

**When to add one:** a choice with real trade-offs, a constraint later phases must respect, or a deviation from a spec/plan that isn't self-explanatory from the diff. Don't write one for routine implementation details — those belong in the relevant `docs/phases/PN-*.md` notes instead.

**Format:** `NNNN-kebab-case-title.md`, sequential, never reused or renumbered even if superseded — a superseding decision gets a new number and links back.

```markdown
# ADR-NNNN: Title

- **Status:** Accepted | Superseded by ADR-000X | Deprecated
- **Date:** YYYY-MM-DD
- **Phase:** PN — phase name

## Context
What made this decision necessary; the constraint or problem.

## Decision
What was chosen.

## Consequences
What this makes easy, what it makes hard, what future work must respect.
```

## Index

| ADR | Title | Phase |
|---|---|---|
| [0001](0001-presentation-cue-layer.md) | Presentation-cue layer is the sole game-state-to-show seam | P0 |
| [0002](0002-hand-mirrored-design-tokens.md) | Design tokens are hand-mirrored into TS, not code-generated | P0 |
| [0003](0003-standings-drama-only-on-reveal.md) | Standings drama derives only on the transition into `reveal` | P0 |
| [0004](0004-performance-profile-static-heuristic.md) | Performance profile is a static startup heuristic, not a runtime watchdog | P0 |
