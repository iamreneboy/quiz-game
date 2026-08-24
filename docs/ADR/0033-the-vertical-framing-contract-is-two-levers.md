# ADR-0033: The vertical framing contract is two levers — stacks compress, the podium widens

- **Status:** Accepted
- **Date:** 2026-08-24
- **Phase:** P6b — broadcast direction

## Context

`worldScale` picks pixels-per-unit from viewport **width** alone
(`lib/world/geometry.ts`), and every vertical measurement is then taken in that
scale against `horizonY = height * HORIZON_FRACTION`. So how much world fits
*above* the ground line is a function of the aspect ratio — and the pipeline
never computed it. There was no name for the quantity, so nothing could be
sized against it.

Two open defects were the same missing number:

1. **`MAX_STACK_RISE` is derived at 16:9 and applied everywhere** (P2). Its own
   docstring does the arithmetic — 324 units of headroom at `MIN_SPAN`, minus
   the rig's 135-unit reach, so ~189 is the ceiling — then freezes the answer at
   `AVATAR_HEIGHT * 1.4` = 179.2. That is correct at 16:9 and wrong at every
   wider ratio: a deep tie put the top rig's head at screen y −227.8 on
   2560×1080 and −314.3 on 3440×1440.
2. **The winner's podium rig is clipped by the retreated 50vh band** (P5a,
   re-confirmed in P5b and P6a). The podium shot is a fixed `PODIUM_SPAN`
   applied against half the vertical pixels; the winner's rig top landed at
   roughly screen y −79 on a 1280×360 canvas.

Both had been blocked on the same objection: `geometry.ts` is pure and
viewport-free by contract, and ADR-0005's fix for P2's Critical explicitly
rejected "let the camera widen" as the answer for ties.

## Decision

Name the quantity, then apply **two different levers** to it, because the two
subjects have different degrees of freedom.

```ts
// lib/world/framing.ts
export function headroom(viewport: Viewport, span: number): number {
  return (viewport.height * HORIZON_FRACTION * span) / viewport.width;
}
```

**Stacks compress.** `stackRiseLimit(viewport)` runs the same arithmetic
`MAX_STACK_RISE`'s docstring does, against the real viewport, and every anchor
builder takes the result as a plain `number` with `MAX_STACK_RISE` as its
default. `geometry.ts` never sees a `Viewport`; the viewport-aware derivation
lives entirely in `framing.ts`. A stack has a compression lever — pitch — so it
uses it, exactly as `gridAnchors` already compresses against the run-off.

**The podium widens.** The block heights *are* the ceremony, so there is no
pitch to squeeze. `podiumSpanFor(viewport)` computes the span that fits
`BLOCK_HEIGHTS[1] + |RIG_TOP| + PODIUM_TOP_PAD` above the ground line and takes
`max(PODIUM_SPAN, required)`. A wider span means a smaller scale, which buys
vertical room.

Two further choices inside that:

- **The limit is derived at `MIN_SPAN`, not the live span.** The tightest shot
  the camera can ever take is the worst case, so the limit never depends on the
  camera state it would otherwise feed back into. No circularity, no oscillation.
- **`STACK_RISE_FLOOR = MARKER_ROW_HEIGHT / 2` (32).** Below half a marker row a
  stack stops reading as a ladder at all, and a compressed-but-visible stack
  beats a flat heap.

## Consequences

- **16:9 is bit-for-bit unchanged**, asserted by exact equality:
  `stackRiseLimit(1920×1080) === MAX_STACK_RISE` and `frameTarget('podium')`
  span `=== PODIUM_SPAN` at 1920×1080. At full-height 16:9 the podium's required
  span is 649.4 against `PODIUM_SPAN`'s 921.6, so the shot is untouched.
- **ADR-0005 still stands.** Nothing here widens the camera to hold a tie; ties
  still compress. The podium widen is a different subject with no other lever,
  and it is bounded by `clampCamera`.
- **The floor is an honest trade, and it is not the trade the spec predicted.**
  Spec §3.3 said that where the floor binds, `offscreenPlayerIds` would name the
  affected players. It does not, and must not: that function reports only rigs
  **entirely** off canvas, deliberately, because the 28vh question band clips
  heads by design and flagging the whole field there would be noise. What
  actually holds at the floor is weaker but true — nobody vanishes, and the clip
  is a trim. Measured worst case across a 4:3→32:9 sweep is **19px off a 668px
  rig (2.8%) at 3816×1080**, and only four of ~200 sampled viewports clip at all,
  all past 3.48:1. `tests/framing.test.ts` asserts that bound.
- The pure aspect sweep in `tests/framing.test.ts` — not the headed checks — is
  the regression floor. It runs 4:3 through 32:9 at full height and at the
  half-height a retreated band produces.
- Anything future that adds a vertical subject to the world (a banner, a scoring
  overlay drawn in world space) now has `headroom` to size against instead of
  inventing a fourth constant that is right at one aspect ratio.
