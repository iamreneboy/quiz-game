# ADR-0055: The ink scale has an accessibility floor, and it is enforced

- **Status:** Accepted
- **Date:** 2026-08-31
- **Phase:** M3 P5b

## Context

`--color-ink-mute` was chosen by eye and carried the app's 11px uppercase
micro-labels — section headings, table captions, rank numerals, the
`Q{n}/{total}` badge — at 3.99:1 on `night` and 4.28:1 on the answer row, both
under WCAG AA's 4.5:1 threshold for small text, on nearly every ground it is
painted on. Nothing detected it: `lib/presentation/tokens.ts` mirrors only the
canvas-relevant subset of the palette and deliberately holds no ink token, so
neither `tests/tokens.test.ts` nor any other test ever looked at contrast.

## Decision

The ink scale has a floor, and the floor is enforced. `--color-ink-mute` is
lifted from `#6d75ab` to `#767eb9` — the smallest nudge that clears 4.5:1 on
every ground the app actually paints it on. `lib/a11y/palette.ts` mirrors the
full ink/surface/accent/semantic/medal palette from `app/globals.css`, plus the
*composited* grounds the app paints text on (Tailwind's `/nn` surfaces are
alpha, so `bg-night/60` over the page's void is a colour neither token names).
`tests/a11y.test.ts` fails when a pair drops below its WCAG threshold, when the
mirror and `globals.css` disagree, or when a `text-<token>` class appears in
`components/` or `app/` that the usage table does not cover.

`text-ink-mute` on a haze-based chip ground is out of bounds entirely: no
muted value that still reads as muted clears AA there. The one site that used
to do it — `components/PlayerConnection.tsx`'s dropped-player chip — moved to
`text-ink-dim`, matching every other haze-ground chip in the app (`DrawCard`,
`QuestionCard`, `StageBroadcast`), which already used `ink-dim` for this exact
reason.

## Consequences

The ink scale can no longer be tuned by eye. A future restyle that wants a
quieter label either uses `ink-dim` on a darker ground or adds a new token
that passes; and a new translucent surface needs a `GROUNDS` entry in
`lib/a11y/palette.ts` before any ink token goes on it — `tests/a11y.test.ts`'s
source scan catches a missing *token* row, but a missing *ground* row is
caught only when someone measures, so a new composite surface should get one
deliberately, the way this phase's audit added `abyss60`/`abyss70`/`abyss80`/
`abyss90`/`night70`/`chipDropped` after a grep of the live source turned up
alphas the original plan hadn't enumerated.

The answer palette is *not* held to a pairwise separation rule under
colour-vision deficiency. Measured, the four option accents do collapse in
pairs under simulated CVD (lime/warning to ΔE 11.9 under deuteranopia,
cyan/lime to ΔE 37.9 under tritanopia) — which is not a defect to fix but the
reason [ADR-0017](0017-answer-selection-is-form-not-hue.md)'s shape coding is
load-bearing, and `tests/a11y.test.ts` asserts that collapse as a fact so
nobody later "fixes" the palette and quietly makes the glyphs optional.
