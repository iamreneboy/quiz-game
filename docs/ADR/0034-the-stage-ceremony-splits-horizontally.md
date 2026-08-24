# ADR-0034: The stage ceremony splits horizontally; the player ceremony still retreats vertically

- **Status:** Accepted
- **Date:** 2026-08-24
- **Phase:** P6b — broadcast direction

## Context

P5a gave the results phase a band that moves *within* the phase: the canvas
holds 100vh for the podium rise, then retreats to 50vh when `steps.board` flips
and P5b's results board lands. The value is published once as `--ceremony-band`
on `documentElement` and consumed by both the canvas and the board's spacer, so
the two physically cannot overlap (ADR-0015).

P6a's stage view inherited that band verbatim, because it inherited the whole
results branch. On a television that is actively harmful: **a 1920×1080 TV
mid-ceremony becomes a 1920×540 canvas — 32:9** — which is precisely the shape
ADR-0033's podium fit had to be rescued from. The stage was manufacturing the
worst case the rest of the phase was fixing.

It is also the wrong composition. A phone is tall and narrow: stacking a board
under a canvas is the only arrangement that fits. A TV is wide: there is
horizontal room to spare and no vertical room to waste.

## Decision

The two surfaces move on **different axes**.

- **Player** (`role === 'player'`): unchanged. `--ceremony-band` goes
  `100vh → 50vh`; the canvas keeps full width and yields height.
- **Stage** (`role === 'stage'`): `--ceremony-panel` goes `100% → 56%`; the
  canvas keeps `h-screen` and yields **width**. The board takes
  `calc(100% - var(--ceremony-panel, 100%))` on the right.

The published-property mechanism is identical, so ADR-0015's guarantee carries
over untouched — one value, written once, consumed by both sides, never
re-derived. Only the axis it names changed. The canvas host moves from
`inset-x-0` to `left-0` plus an explicit width, because the panel must shrink
from the right rather than stay pinned to both edges.

The `0px` fallback becomes `100%`: a client with no canvas at all gets the full
width and the whole board immediately, which is the same intent the old `0px`
height fallback had.

## Consequences

- **The stage's 32:9 case stops existing.** Measured live: at 1920×1080 the
  ceremony canvas is 1075×1080 (full height, 56% width) with the board at
  x=1171; at 2560×1080 it is 1434×1080; at 3440×1440 it is 1926×1440. The winner
  is unclipped at all three.
- **This does not make ADR-0033's podium fit redundant.** The player view still
  retreats vertically, and that is exactly where the vertical fit earns its
  keep — verified live at 1920×1080, where the winner's rig had been cropped
  since P5a and now is not.
- **The podium renders smaller on the stage**, in a 56%-width canvas rather than
  full bleed. That is the intended room shot, not a regression: the ceremony is
  a wide two-panel frame — winner on the left, standings on the right — which is
  how a broadcast actually stages a result. It pairs with `podiumRoom`
  (ADR-0036), which frames the medalists *and* the field that did not medal.
- **The board is attached before it can be visible.** ADR-0030 has the board
  rendered from the results phase's first frame with opacity staging; on the
  stage its column has zero width until the split lands, so it has no box.
  `e2e/stage.spec.ts` asserts attachment first and visibility after
  `data-entered` flips — the vertical version could assert visibility outright
  because an off-the-fold element still has a box.
- A third surface that needs a ceremony (a moderator view, a projector) picks an
  axis by branching on `role` in one effect, not by re-deriving a layout.
