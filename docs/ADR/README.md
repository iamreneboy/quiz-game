# Architecture Decision Records

One file per significant, hard-to-reverse, or non-obvious decision — the kind a future session needs the *why* for, not just the *what* (the code already shows the what).

**When to add one:** a choice with real trade-offs, a constraint later phases must respect, or a deviation from a spec/plan that isn't self-explanatory from the diff. Don't write one for routine implementation details — those belong in the relevant `docs/progress/PN-*.md` notes instead.

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
| [0005](0005-auto-framed-pack-camera.md) | Auto-framed pack camera with a MAX_SPAN legibility cap | P1 |
| [0006](0006-spatial-zones-plus-mood-grade.md) | Spatial zones plus a separate global mood grade | P1 |
| [0007](0007-quality-as-world-definition-data.md) | Quality is world-definition data, not construction flags | P1 |
| [0008](0008-local-player-outranks-leader-in-overflow.md) | The local player outranks the leader when the field can't all fit | P1 |
| [0009](0009-drama-buffered-to-the-track-beat.md) | Drama is buffered at the reveal transition and played at the TRACK beat | P2 |
| [0010](0010-exclusive-arena-reaction-subdued-avatar-vfx.md) | The arena reaction is exclusive; per-avatar VFX is subdued, never omitted | P2 |
| [0011](0011-accent-is-a-rim-never-a-body-tint.md) | The player accent colour is a rim, never a body tint | P2 |
| [0012](0012-vfx-budget-adapts-without-touching-profile.md) | The VFX budget adapts at runtime without touching `profile` | P2 |
| [0013](0013-persistent-vs-transient-vfx.md) | Persistent VFX derive from standings; transient VFX live only inside a sequence | P2 |
| [0014](0014-beat-position-derived-from-ends-at.md) | Beat position is derived from `ends_at`, not local arrival | P3a |
| [0015](0015-continuous-values-to-css-custom-properties.md) | Continuous presentation values go to CSS custom properties; only quantized state enters React | P3a |
| [0016](0016-staging-never-gates-input.md) | Staging never gates input — the server phase is the sole interaction authority | P3a |
| [0017](0017-answer-selection-is-form-not-hue.md) | Answer selection is expressed by form, not hue | P3a |
| [0018](0018-the-wire-opens-once-for-picks-and-current-streak.md) | The wire opens once, for `picks` and `current_streak` | P3b |
| [0019](0019-the-reveal-is-the-options-grid-transformed.md) | The reveal is the options grid transformed, not a second widget | P3b |
| [0020](0020-callouts-buffer-their-own-queue.md) | Callouts buffer their own queue rather than reading the choreographer's | P3b |
| [0021](0021-final-question-escalation-fires-on-the-run-up-beat.md) | Final-question escalation fires on the run-up beat | P3b |
| [0022](0022-answer-resolved-is-derived-not-inferred.md) | `answer-resolved` is derived, not inferred | P4 |
| [0023](0023-audio-escalation-reuses-the-vignette-ramp.md) | Audio escalation reuses the vignette's ramp | P4 |
| [0024](0024-the-first-cue-batch-is-catch-up.md) | The first cue batch is catch-up | P4 |
| [0025](0025-sounds-are-generated-source-not-assets.md) | Sounds are generated source, not assets | P4 |
| [0026](0026-the-podium-is-a-fourth-anchor-layout.md) | The podium is a fourth anchor layout | P5a |
| [0027](0027-the-results-phase-gets-a-deadline.md) | The results phase gets a deadline | P5a |
| [0028](0028-the-wires-second-opening.md) | The wire's second opening — `answered` and `avg_answer_ms` | P5a |
| [0029](0029-confetti-gets-its-own-pool.md) | Confetti gets its own pool | P5a |
| [0030](0030-the-results-board-is-present-before-it-is-visible.md) | The results board is present before it is visible | P5b |
