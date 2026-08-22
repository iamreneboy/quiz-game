# ADR-0011: The player accent colour is a rim, never a body tint

- **Status:** Accepted
- **Date:** 2026-08-22
- **Phase:** P2 — Avatars & motion

## Context

Two identities have to coexist on one avatar: the **character** (a coffee cup, a rubber duck — picked for personality, baked with its own natural colours) and the **player** (an accent colour that has to make "which one is me" answerable in a crowded segment at a glance).

The obvious implementation is to tint the character sprite with the player's accent. It does not work: a tinted coffee cup and a tinted rubber duck are the same orange blob. Character identity and player identity fight, and character loses — which discards the entire reason the roster exists.

## Decision

Bodies bake in their own natural colours. The player's accent appears **only** as edge treatment: rim light, shadow tint, boost trail, and label underline. In `lib/world/render/AvatarNode.ts` this is a stroked `roundRect` around the body — `.stroke({ color: accent, width: 3, alpha: 0.85 })` — with no tint applied to the baked texture.

The local player additionally gets the **YOU ring**: a silver stroke *outside* the accent rim, wider and taller than it, so self-identification does not depend on remembering your own colour. P1's `Markers` drew this too; the rig preserves it rather than regressing it. The ring is its own `Graphics` child re-issued by `AvatarNode.setLocal()`, so a local player identified *after* their rig was built gets the ring without the rig being torn down and rebuilt.

## Consequences

- **This is a constraint on every future avatar or world-content bundle**, not a P2 implementation detail. A new character added in a later phase must be readable at its own colours and must leave its silhouette edge available for the rim. A character whose art is mostly edge, or whose natural palette is close to a player accent, will read poorly and that is an art-side constraint to catch at authoring time.
- Anything that wants to signal state by colouring the avatar has to find another channel — scale, motion, or an added effect — because the body's colours are the character's and the edge is the player's. Both are taken.
- The accent is used in several places (rim, trail, underline). They must all read the same colour value from the same source; drift between them re-creates the identity confusion this ADR exists to prevent.
- The YOU ring's geometry is deliberately outside the accent rim. Nesting it inside, or matching its radius, makes the two strokes read as one thick border and the local player becomes indistinguishable again.
- **This decision is what makes the baked-texture cache safe, and that safety is conditional.** `AvatarNode` bakes each character once into a `RenderTexture` held in a module-level `Map` keyed by `spec.key`, with `clearBakedAvatars()` as the only escape. Because the accent is a rim drawn per node rather than baked into the texture, a colour or nickname change cannot stale a cached texture — the cache needs no player dimension at all. What it *does* assume is exactly one live Pixi `Application`: the map is not namespaced per app, and `clearBakedAvatars()` destroys everything unconditionally. When P6's stage view adds a second renderer, the first app's textures — bound to its GPU context — will be handed to the second app's sprites, and the first teardown will destroy textures the surviving app is still using. **A second renderer must key the cache by application and scope `clearBakedAvatars` to it.**
