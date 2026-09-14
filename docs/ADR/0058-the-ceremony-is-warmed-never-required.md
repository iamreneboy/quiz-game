# ADR-0058: The ceremony is warmed on `final-question`, and never depends on it

- **Status:** Accepted
- **Date:** 2026-09-15
- **Phase:** post-M3 (podium eye candy)

## Context

The podium ceremony is the last thing a game shows and, after this change,
the most expensive: additive glows, a gradient spotlight with two sweeping
shafts, a sparkle swarm, landing rings and flares, a reflection, and 180
confetti sprites. Everything the renderer draws is procedural — there are no
image assets to fetch — so "preloading" here means four concrete costs that
used to land on or near the results cut:

- baking the ceremony's shared textures and uploading them to the GPU on the
  first frame that draws them;
- allocating the confetti pool on the very frame the burst starts (4.1s into
  the ceremony), previously 180 individual `Graphics` objects each with its
  own geometry;
- allocating the sparkle pool;
- fetching and decoding the ceremony bed and the podium sting, which the
  mixer created lazily on first play.

The room already knows when the last round is coming: the `final-question`
cue fires one beat before the final round's READ, is re-emitted in the seed
batch of a mid-round reload, and fires again for a sudden-death tiebreak.
Both the world runtime and the audio runtime already subscribe to it. That is
a whole round — well over twenty seconds — of frames with nothing heavy in
them, before a cut that used to do all of the above at once.

## Decision

`final-question` is the ceremony's warm-up signal, and warm-up is an
optimisation the ceremony never depends on.

- The world runtime calls `WorldScene.warmCeremony()` on the cue. The scene
  spreads the work over the following frames: one frame binds the baked
  textures and queues their GPU upload through Pixi's prepare system (which
  itself uploads a few per frame) and builds the sparkle pool; the confetti
  pool then grows by thirty sprites per frame until full. No single frame pays
  for all of it.
- The audio runtime calls `Mixer.warm(CEREMONY_WARM)` on the same cue. The
  mixer constructs Howls with `preload: true`, so creating one *is* the fetch
  and decode; an id already created is untouched.
- Every lazy path stays. `Podium.update` binds textures on first use if
  nothing warmed them; `Confetti.burst` still grows the pool to the density it
  needs; `Mixer.play` still creates a missing Howl. A client that mounts
  straight into the results phase — a TV switched on late, a reload during the
  ceremony — skips the head start and still renders the full ceremony.
- Warming is idempotent, because the cue is not unique: sudden death emits it
  a second time with `round + 1`, and a reload's seed batch emits it again.

Two supporting choices belong with this one:

- Confetti pieces are `Sprite`s on Pixi's shared `Texture.WHITE`, tinted, so
  the whole burst is one draw batch. This is both the warm-up (an allocation
  that can be sliced) and a per-frame saving.
- The ceremony's textures are gradients (`FillGradient`), not stacked slices:
  a stepped bake reads as banding once a sprite is scaled up several times,
  which the spotlight cone is.

## Consequences

- **Future ceremony effects go behind `warmCeremony`, not into the results
  cut.** Anything new that allocates, bakes or fetches should extend
  `WorldScene.warmSlice` (or `CEREMONY_WARM` for audio) and keep its own lazy
  fallback. Adding a step that only works if warmed breaks the late-mounting
  client, which is a normal client, not an edge case.
- **`final-question` carries a second meaning.** It was a drama cue; it is
  now also the ceremony's head start. Anything that reorders, suppresses or
  renames it should check both runtimes.
- **The budget gates the new effects the same way it gates everything else.**
  `VfxAllowance` gained `ceremonyGlow` (never 0: the reduced ceremony keeps
  its light and loses only its motion, the rule the confetti wash already
  set), `sparkle` (0 at `minimal`) and `ceremonyMotion` (false at `minimal`:
  the halo holds still and the shafts do not sweep). No filters were added;
  a blur or bloom forces full-screen passes and is the one thing that would
  actually cost a mid-range phone.
- **Landing impact is a beat, not renderer state.** `ceremonyStepsAt` exposes
  a per-place `impact` that peaks the instant a block's rise completes and
  decays to exactly 0 over `IMPACT_MS`. It is bounded on purpose: a raw
  "milliseconds since landed" would change every frame for the rest of the
  ceremony and defeat `sameSteps`, re-rendering every DOM consumer at 60fps
  over a settled podium. The renderer stays dumb, and a reload lands on the
  settled picture.
- **The podium's `Graphics` are rebuilt only when their inputs change.** Once
  every block has landed and every flare has faded — most of the ceremony —
  the blocks, reflection and light pool are static and the per-frame rebuild
  they used to pay is skipped. Measured on the headed sweep this is what
  brought the board beat's dropped frames back to the old renderer's baseline.
- **Verified live, not assumed** (2026-09-15, headed Chromium, one Pixi
  context, three-round game driven over the soak harness's RPC + broadcast
  path): zero console errors; at most 1 dropped frame in any 120-frame window
  from the bronze rise through the gold landing, spotlight and confetti; 4 at
  the board beat against the old renderer's 5, which is the DOM results table
  staggering in, not the canvas; the reduced profile clean throughout; a reload
  mid-tail lands settled with no warm-up. The instrument was a throwaway spec
  (not committed): drive the game from Node exactly as `scripts/soak.mjs`
  does, open only `/stage/<code>?perf=1`, and poll the perf overlay's
  `dropped N/M` through the ceremony.
