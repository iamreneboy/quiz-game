# Prompt for Claude Design — redesign the Circuit Break background

## What this is

Circuit Break is a live multiplayer quiz game (Next.js 16 + React 19 + PixiJS 8, Supabase Realtime). Behind every screen sits a side-scrolling "night race" world: a camera pans along a horizontal track as players answer questions, and racer avatars move along it. Everything behind the track surface — sky, terrain, skyline, mid-ground props, foreground barriers, plus a full-screen mood overlay — is what I'm calling **the background**, and it's what I want redesigned.

**Important: the background is not an image file.** There is no PNG, JPG, SVG or video anywhere in the visual pipeline. Every layer is *procedurally drawn* in code with PixiJS `Graphics` primitives (rects, ellipses, polygons, circles, gradient bands built from stacked rects), baked once at startup into a RenderTexture, then only tiled and translated forever after. Your deliverable is a **design direction plus the redesigned procedural layer definitions**, not artwork.

## Read these files first

Structure and contract:
- `lib/world/definition.ts` — the layer/zone data contract (`LayerSpec`, `ZoneSpec`, `LayerTier`, `AmbientSpec`, `layersForProfile`). Everything you produce must fit this shape.
- `lib/world/content/nightRace.ts` — **the current background; this is the file to redesign.** All three zones and every layer live here.
- `lib/world/render/ParallaxLayer.ts` — how a layer is baked and moved. Defines exactly what a `draw` function may and may not do.
- `lib/world/render/Grade.ts` and `lib/world/zones.ts` — zone crossfading along the track, and the global mood grade that deepens as the game escalates toward the final question.
- `lib/world/render/WorldScene.ts` — layer ordering, and what sits above/below the background.
- `lib/world/geometry.ts` — horizon placement, world scale, viewport math.

Palette, tokens and screens:
- `app/globals.css` — **the source of truth for every color and motion token**, plus the CSS `body` gradient that shows around the canvas.
- `lib/presentation/tokens.ts` — the canvas-side mirror of those tokens (`COLOR`); `tests/tokens.test.ts` fails if the two drift.
- `lib/a11y/palette.ts`, `lib/a11y/contrast.ts`, `tests/a11y.test.ts` — the contrast floors the UI depends on.
- `components/PixiStage.tsx` — how much screen the world gets per surface: full-bleed on the big-screen "stage" view, a 28vh strip on a player's phone during read/answer/reveal, a podium band at results.
- `docs/PRD.md` §8 (visual direction), §9 (technical architecture / asset strategy), §11 (success criteria).
- `tests/worldDefinition.test.ts` — the structural rules the redesign must keep green.

## What I want

Keep it recognizably the same world — a stylized night race travelling through three zones (`officePark` → `neonCity` → `stadium`) — but make the background genuinely better looking. Today it reads flat, blocky and a little cheap: silhouettes are plain rectangles, depth cues are thin, and the three zones neither feel distinct enough nor feel like they *escalate* alongside the game they're scoring.

What "better" should mean, as outcomes rather than specifics:

- **Real depth.** The eye should tell far from near without being told. Atmosphere, layering, value separation, edge treatment — your call.
- **A stronger sense of place per zone.** Each of the three should feel like somewhere specific, and the journey should build: ordinary → electric → arena. The final question already grades the whole scene hotter; the background should be worth grading.
- **Life without noise.** This sits behind text people must read under time pressure. It should feel alive and cinematic while never competing with the question, the answers, or the racers on the track.
- **Polish at the silhouette level.** Shapes that look drawn, not stamped.
- **Survives scale changes.** The same layers appear full-bleed on a TV and as a 28vh strip on a phone; the composition must hold in both.

Make the aesthetic calls yourself — palette weighting inside the existing tokens, silhouette language, how depth is communicated, how each zone is characterised, what ambient motion each gets. I'm deliberately not prescribing a look. Show me a direction, argue for it briefly, then land it in code.

## Hard constraints — this runs on free-tier infrastructure

Hosting is Vercel's free tier; realtime and data are Supabase's free tier. The visual budget is therefore strict, and these are not negotiable:

1. **No new asset files, at all.** No raster images, no SVG assets, no video backgrounds, no shipped texture atlases, no fonts beyond the two already loaded. PRD §9 explicitly rules out 4K textures and video backgrounds. Everything is drawn from code, so the background costs kilobytes of JS rather than megabytes of CDN bandwidth.
2. **Bake once, never per frame.** Each `draw` runs exactly once at init to produce a tile texture. Nothing may allocate, rebuild `Graphics`, or grow with track length per frame. Per-frame motion is limited to what `ParallaxLayer` already does: tile offset, scale, alpha, and the three `AmbientSpec` kinds (`flicker`, `pulse`, `sweep`).
3. **Determinism.** Any randomness must come from the existing seeded LCG, so every client and every reload renders an identical tile — players on different devices are watching the same broadcast.
4. **Keep tiles modest.** Texture memory is constant only because tiles are small and few. Don't buy "more detail" by inflating `repeatWidth` / `height` into huge textures.
5. **Two performance profiles.** `high` and `reduced` (see `lib/presentation/profile.ts`) — the reduced profile covers phones, low-memory devices and `prefers-reduced-motion`. It must still look composed and intentional using only the `core` layers, and must be **completely static**.
6. **Structural rules enforced by `tests/worldDefinition.test.ts`:** three zones in track order; exactly 5 layers per zone on `high` and exactly 2 (`core`) on `reduced`, the reduced set a strict subset of the high set; layers ordered back-to-front by ascending `parallax` in (0, 1]; unique layer ids per zone; positive tile dimensions; **no `ambient` on any `core` layer**; at least one ambient animator per zone on `high`. If a better design genuinely needs different counts, say so explicitly and propose the test change — don't silently break it.
7. **Colors come from `COLOR` in `lib/presentation/tokens.ts` only** — no literal hex in world content. If the design needs a color the palette lacks, propose it as a token addition in `app/globals.css` first, and note that `tests/tokens.test.ts` and the a11y palette must move with it. The racer colors are persisted per player in Postgres: never renumber or recolor them.
8. **60fps on a mid-range laptop, graceful degradation on a mid-range phone** (PRD §11), with N avatars, particles and VFX already sharing the frame budget. The background is the cheap part and must stay that way.
9. **Canvas is decoration only.** Every readable, interactive element is HTML above the canvas. Nothing in the background may carry information a screen reader needs, and it must not push any UI text below its contrast floor.

## Deliverable

1. A short written direction: what's wrong with the current background, the look you're going for, and how the three zones are differentiated and escalated.
2. Visual mockups of the three zones (and, if useful, a crossfade between two) so I can judge the direction before it's code — full-bleed framing plus the phone-strip crop.
3. The redesigned `lib/world/content/nightRace.ts` — same exports, same `WorldDefinition` shape, drop-in replacement — with any token additions to `app/globals.css` / `lib/presentation/tokens.ts` called out separately.
4. Notes on anything that should change in `Grade.ts`, `zones.ts` or the CSS `body` gradient to support the new direction, kept as an optional second step rather than folded into the layer redesign.

Assume I'll apply the result into this existing codebase, so favour a change that lands inside the current architecture over one that requires rebuilding the renderer.
