# ADR-0056: Backdrop depth is carried by value, not detail

- **Status:** Accepted
- **Date:** 2026-09-03
- **Phase:** Outside any phase (post-M3, pre-v1)

## Context

The night-race backdrop separated its five layers per zone by *detail* — each
layer drew a different kind of object, at roughly the same value. With three
zones laid end to end that read flat: a viewer could not tell which silhouette
was far and which was near, because nothing but overlap said so. The zone
crossfades made it worse, because two flat layer stacks at 50% each are just
noise.

The redesign (`0712f0b`) rewrote `lib/world/content/nightRace.ts` against that.
The layer *contract* was deliberately untouched — 5 layers per zone, the same 2
`core` layers on `reduced`, ascending parallax, one ambient per zone — so
`tests/worldDefinition.test.ts` stayed green unchanged and the renderer, camera
and zone blending needed no edits at all.

## Decision

Depth is expressed as **value**, not as detail or object type:

- Far silhouettes are painted in the **sky's own colours** at partial alpha
  (atmospheric perspective), the mid ground in `night`, the near ground in
  `abyss`/`void`. A layer's distance is readable from its lightness alone.
- **Every layer dissolves into a fog band at its base**, so nothing sits on a
  hard line against the layer behind it.
- **One seeded skyline layout is shared** by a zone's body layer and its lights
  layer, so a lit window always lands on the building that owns it. (Previously
  the two were separately seeded and the lights floated.)
- **No new colour tokens.** Every colour is a `COLOR.*` lookup; the only derived
  colours come from `mix()` inside gradient bands, which the file already did.
- Each zone gets exactly **one accent**: `warning` (office park), the three
  neons (city), `gold` + `silver` (stadium).

## Consequences

**The mood grade multiplies over this and can erase a zone's accent.** This is
the constraint future work most needs to know. `zones.ts`'s `gradeState` returns
`hue: 'neon'` at intensity up to 0.92 during the final question, and that wash
overrides the arena's `gold`/`silver` identity completely — verified live, not
inferred: the stadium's LED ribbon and pit-wall lip read magenta-pink through
rounds 11–12 and the whole ceremony. The grade was designed against a backdrop
whose zones were not colour-coded; now that they are, a global hue is in
tension with them. `docs/background-redesign/NOTES.md` proposes keying the
final-question hue off the dominant zone (`neonMagenta` in the city, `gold` at
a lower peak in the stadium) — **not applied**, and it is a presentation
judgement rather than a defect.

**Every zone's accent lives on the `rich` tier, so `reduced` gets shape without
colour.** `op-lit` (amber windows, lamp halos), `nc-neon` (the signs) and
`st-crowd` (the gold LED ribbon) are all `rich`, so a phone renders sky plus one
silhouette and no accent at all. The tier split is unchanged from before the
redesign; what changed is how much of each zone's identity now sits above the
line. It degrades gracefully rather than breaking — but a future change that
wants a zone recognisable on `reduced` has to move colour into the `core`
layers, not add a sixth layer.

**Crossfade legibility is surface-dependent.** The office→city crossfade reads
cleanly at either size, because the city's towers are opaque and tall and simply
arrive. The city→stadium crossfade does not: on the player surface's tighter
camera the city's neon shows *through* the grandstand as a double exposure,
while on the stage's wider camera the same frame reads correctly as "the city
the arena was built in". This argues against NOTES.md's other suggestion —
widening `ZONE_OVERLAP` 0.12 → 0.18 would lengthen the weaker reading, and the
fog bands do not currently make it read as weather.

**A shared seeded layout is now load-bearing.** `skyline(seed, …)` is called
with the *same* seed by a zone's body layer and its lights layer (e.g. `202` for
both `nc-towers` and `nc-neon`). Changing one call's seed, its `SkylineOpts`, or
its tile `repeatWidth`/`height` without changing the other silently detaches the
lights from their buildings — the failure looks like floating neon, not like an
error.

**Cheaper, not dearer.** The worst zone's tile budget dropped from 4.1M to 3.7M
pixels, mostly from 1024-wide sky tiles replacing 1600-wide ones.
