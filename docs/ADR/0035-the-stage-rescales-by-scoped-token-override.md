# ADR-0035: The stage rescales by overriding theme vars in a scope, not by a parallel token namespace

- **Status:** Accepted
- **Date:** 2026-08-24
- **Phase:** P6b — broadcast direction

## Context

The stage view shares components with the player view by design (ADR-0032):
`RevealPanel`, `WinnerCard`, `ResultsTable`, `AvatarStack` and `TimerRing` are
the same files on both surfaces. They are sized for a phone held at arm's
length. A television is watched from across a room, and the same type and
spacing read as a cramped web page projected large.

Three ways to fix that were available:

1. A `size` prop on every shared component, branching internally.
2. A parallel `--stage-*` token namespace and a stage-only copy of each
   component that reads it.
3. Override the theme variables the existing utilities already resolve through,
   inside a scope.

Options 1 and 2 both mean every shared component grows a second rendering path
that only the TV exercises — the path least likely to be looked at, in the
surface hardest to test.

## Decision

Option 3. The stage root carries `data-surface="stage"`, and `app/globals.css`
redefines a handful of Tailwind theme variables in that scope:

```css
[data-surface='stage'] {
  container-type: size;
  --spacing: clamp(0.25rem, 0.3cqi, 0.5rem);
  --text-hero: clamp(2.25rem, 3.6cqi, 5rem);
  --text-display: clamp(4rem, 6.2cqi, 9rem);
  --container-4xl: 78cqi;
  --container-6xl: 90cqi;
}
```

This works because **every Tailwind v4 utility resolves through a theme
variable** — verified against 4.3.3's compiled output: `.p-8` is
`calc(var(--spacing) * 8)`, `.text-hero` is `var(--text-hero)`, `.max-w-6xl` is
`var(--container-6xl)`. So redefining the variables rescales type, spacing and
container widths across every shared component with **no edits to any of them**.

Sized in `cqi` rather than `vw`, so the unit is the stage container — which
matters directly, because ADR-0034 makes that container narrow to 56% during the
ceremony and the board must rescale with it, not with the window.

`--horizon-fraction: 0.72` is added to `@theme` in the same change, mirroring
`HORIZON_FRACTION` in `lib/world/geometry.ts` so DOM chrome (the callout strip)
can be pinned to the world's ground line. `tests/tokens.test.ts` fails if the
two drift, the same hand-mirroring discipline as ADR-0002.

## Consequences

- **Action at a distance, on purpose, and stated at the block.** Inside this
  scope `p-8` does not mean what it means anywhere else in the app. That is the
  cost, it is real, and `globals.css` says so in the comment above the rule so
  the next person to touch a shared component finds it.
- **One type scale instead of two.** A change to `RevealPanel`'s spacing is one
  edit that lands correctly on both surfaces. Neither surface has a rendering
  path the other does not exercise.
- **`container-type: size` on the stage root** means the root must have a
  definite size — it does (`fixed inset-0`, or `inset-y-0 right-0` with an
  explicit width during the ceremony) — and that `cqh` units inside it (the
  floor row's `h-[26cqh]`, the prompt's `mt-[4cqh]`) resolve against the stage,
  not the viewport.
- A future surface with its own scale — a projector, a phone-in-landscape mode —
  adds a scope, not a component variant.
- The escape hatch, if a shared component ever genuinely needs different
  *structure* on the stage rather than different scale, is still a stage-specific
  component (ADR-0032's composition rule). This decision only covers scale.
