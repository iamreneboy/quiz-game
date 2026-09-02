# Circuit Break — background redesign

Open `Background Redesign.dc.html` for the direction and mockups. Every mockup is
`lib/world/content/nightRace.ts` drawn through a Canvas2D stand-in for Pixi
`Graphics` (`mock/render.js`) and composited with `ParallaxLayer.update`'s math,
so what you see is what the file draws.

## Apply

Copy `deliverable/lib/world/content/nightRace.ts` over
`lib/world/content/nightRace.ts`. Same exports, same `WorldDefinition` shape.

- Token additions: **none**. Colours are `COLOR.*` only; the only derived colour is
  `mix()` inside gradient bands, which the current file already does.
- `tests/worldDefinition.test.ts`: unchanged, stays green (5 layers / 2 core per
  zone, ascending parallax, no ambient on core, ≥1 ambient per zone on high).
- `tests/tokens.test.ts`, `lib/a11y/*`: untouched.
- Texture budget per zone (tile pixels): office 2.4M, city 3.7M, stadium 3.2M vs
  4.1M today. Sky tiles are 1024×900 instead of 1600×900.

## Design in one paragraph

Depth is carried by value, not detail. Far ground is painted in the sky's own
colours (`haze`, `dusk`) at partial alpha — atmospheric perspective — the mid
ground in `night`, the near ground in `abyss`/`void`, and every layer dissolves
into a fog band at its base. Silhouettes get roof profiles (parapet, setback,
slant, spire, antenna, water tank) from one seeded layout that both a zone's body
layer and its lights layer read, so lights land on the building that owns them.
Each zone has one accent: `warning` (office park), the three neons (city),
`gold` + `silver` (stadium). The stadium is a single seamless grandstand tile —
the race is inside the bowl, not driving past one.

## Optional second step (not folded into the layer file)

- **Sky seam at wide spans** — already handled inside the layers: every sky opens
  in `abyss`, the canvas clear colour, so a 14-segment span that runs off the top
  of the 900-unit sky shows no join.
- **`Grade.ts`** — neutral hue tints with `void`, which flattens the new value
  separation as progress rises. Suggest `night` at the same alphas for the
  neutral hue, and keying the final-question hue off the dominant zone:
  `neonMagenta` in the city, `gold` at a lower peak (~0.24) in the stadium so the
  arena grades hot rather than pink.
- **`zones.ts`** — widen `ZONE_OVERLAP` 0.12 → 0.18. With fog on both sides a
  longer crossfade reads as weather rolling in.
- **CSS `body` gradient** — leave as is.
