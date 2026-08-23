# ADR-0017: Answer selection is expressed by form, not hue

- **Status:** Accepted
- **Date:** 2026-08-23
- **Phase:** P3a — Round staging

## Context

Each answer option carries a fixed accent by index — ▲ cyan, ◆ magenta, ● lime, ■ amber, for every question in every round (spec decision 6), so a player can call out "the cyan one" and have it mean the same thing every time. Locking a choice also needs to read as "this is the one I picked," distinctly from "this is just option 1" — and a dedicated fifth color for "selected" was the obvious naive choice.

## Decision

There is no fifth color. The chosen button is expressed entirely through form: full opacity, a 2px ring plus outer glow rendered in *the option's own accent* (not a new one), and its glyph chip inverting from a lightly tinted background to solid-accent-on-void. The other three drop to 45% opacity and disable. `AnswerButtons.tsx` derives all of this from the same four accents already assigned by index — `chosen`/`faded` change *how* an accent is applied, never *which* color means "selected."

## Consequences

- A dedicated selection hue would have collided with whichever option already owns that hue (cyan is both "option 1" and, under a naive scheme, "the winner's highlight"), making "which option is this" fight "is this mine" in the same visual channel. Form sidesteps the collision: ringed-and-inverted means chosen, independent of which of the four accents is doing the ringing.
- This interacted directly with `motion` in a way that only live verification caught: `motion.button` writes its animated properties, including `opacity`, as an inline style — which unconditionally outranks a Tailwind utility class in the cascade, class specificity notwithstanding. The first implementation expressed the READ-dimmed, faded-after-lock and live-full-opacity states as `opacity-45`/`opacity-55`/`opacity-100` classes alongside `motion.button`'s own `variants`, and every one of them silently rendered at full opacity because the variant's resolved `opacity: 1` was already sitting in the element's `style` attribute. The fix moves the target opacity *into* the variant itself (`shown: { opacity: chosen ? 1 : faded ? 0.45 : live ? 1 : 0.55 }`) so there is exactly one system — Framer Motion — driving the property, not two disagreeing about who wins.
- Selection is now colorblind-safe by the same move that made shape colorblind-safe: identity lives in the glyph (▲◆●■), and "chosen" lives in ring/fill/brightness, so no part of the interaction — which option is which, or which one you picked — depends on hue perception at all.
