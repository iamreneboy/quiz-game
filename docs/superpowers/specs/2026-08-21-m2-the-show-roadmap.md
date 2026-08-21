# M2 — "The Show" Roadmap Spec

| | |
|---|---|
| Status | Approved roadmap — each phase gets its own drill-down spec + plan |
| Parent | `docs/PRD.md` §12 Build Phase **M2**, v1.1 |
| Date | 2026-08-21 |
| Baseline | M1 complete: full core loop (create/join, lobby, synchronized rounds, RPC-validated answers, DOM track, results) with Playwright e2e coverage. All M1 UI is placeholder-styled DOM + Tailwind. |

## 1. Purpose

M2 turns the working M1 quiz loop into the produced game show the PRD demands: the PixiJS track world with parallax and camera work, animated avatars with streak VFX and flair, staged reveal choreography, audio identity, podium ceremony, and the broadcast stage view.

M2 is too large for one spec. This document decomposes it into **seven dependency-ordered phases (P0–P6)**. Each phase is independently spec'd, planned, and implemented later, using this roadmap as its parent context. Each phase should drill down into roughly 4–8 implementation tasks; if a phase's drill-down spec grows past that, split the phase.

## 2. Decisions fixed for all of M2

1. **Procedural-first assets.** All world visuals (track, backgrounds, avatars, props, VFX) are drawn in code — Pixi graphics, vector shapes, gradients, generated textures. Audio is synthesized or CC0-sourced. No external art-production pipeline in M2. Assets are still organized behind the PRD §9 modular-bundle interfaces (avatar roster, environment layers, VFX, audio as separately loadable modules) so real art can replace procedural art later without code restructuring.
2. **Stack as specified in PRD §9.** PixiJS v8 for the canvas world; `motion` (Framer Motion) for HTML/UI animation; Howler.js for audio; Zustand remains the client state store.
3. **Stage view is in M2**, as the final phase (P6).
4. **M2 is presentation-only.** No schema, RPC, or realtime-protocol changes. If a phase discovers it needs a new semantic event or payload field, that is a flagged exception requiring an explicit decision in that phase's spec — never a quiet addition.

## 3. Phase roadmap

```
P0 Foundation ──> P1 Track world ──> P2 Avatars ──> P3 Round staging ──┬─> P4 Audio ────┐
                                                                       └─> P5 Ceremony ─┴─> P6 Stage view
```

Every arrow is a hard dependency. P4 and P5 are independent of each other and may be built in either order or in parallel. Each phase leaves the game fully playable and visibly better than the last.

### P0 — Foundation & design system

The technical and visual substrate every later phase builds on.

**Scope**
- Install and configure PixiJS v8, `motion`, Howler.js.
- Design tokens: the night-race palette (dark indigo base, neon accents, warm avatar colors), typography scale, spacing, and named motion curves — expressed as Tailwind v4 theme + TypeScript constants usable from Pixi code.
- **Celebration hierarchy** as a named ordinal scale (normal correct < streak milestone < overtake < final question < victory), referenced by all later VFX/audio work so routine moments can never outrank major ones (PRD §8).
- **Presentation-event layer**: a unit that consumes store/game state transitions (phase changes, `PLAYER_ADVANCED`-style standings deltas, streak changes) and emits local presentation cues (e.g. `cue:boost`, `cue:overtake`, `cue:streak-tier`, `cue:phase-read`). This is the single seam between game state and the show; Pixi, Framer Motion, and Howler all subscribe to it.
- Performance profiles: automatic high/reduced selection by device capability, `prefers-reduced-motion` support, and a manual override — exposed as one client setting all phases consume.
- `PixiStage` mount component: canvas lifecycle inside React (resize, devicePixelRatio, teardown), rendered behind the game view; empty scene in P0.
- Restyle the app shell — landing page and host setup wizard — in the new design language, as the working proof of the token system. Glassmorphic panel and button primitives created here are reused by every later phase.

**Exit criteria**: app runs with the new visual identity on landing + setup; empty Pixi canvas mounts and resizes correctly in the room view; profile switching and reduced-motion demonstrably alter behavior; presentation-event layer is unit-tested against recorded M1 state transitions.

### P1 — Track world

The environment: a produced world before anyone races in it.

**Scope**
- Pixi side-view segmented racetrack; segment count = question count.
- Parallax background layers with staged progression tied to game progress: office park → neon city → stadium finish.
- Ambient world animation (lighting, subtle motion) per performance profile.
- **Camera system** as an explicit, controllable unit: gentle drift during answers, snap-cuts for track moments, slow push-in for the final question — driven by presentation cues.
- Replaces `Track.tsx`'s DOM rendering as the game's world surface (standings markers may remain temporarily until P2 avatars land).

**Exit criteria**: world renders at 60fps on a mid-range laptop, degrades gracefully on mobile/reduced profile; camera responds to phase cues; environment progression advances over a full game.

### P2 — Avatars & motion

The contestants: characters, movement grammar, and on-track drama.

**Scope**
- Procedural avatar roster (~12 office characters: coffee cup, cactus, rubber duck, robot, cat-in-a-tie, stapler, plant, donut…) drawn as Pixi graphics with player accent-color tinting; idle animations.
- Movement grammar for advancement: boost → move → overshoot → settle, with squash-and-stretch and boost trails — all interpreted locally from semantic standings deltas.
- Overtake flourish: whoosh-ready position-flip animation, lightning accent (PRD §8).
- Tie ordering within a segment by speed points, turbo-flame on the edge-holder (PRD §6).
- Streak VFX tiers: 3 = spark trail, 5 = flames, 8 = inferno + arena announcement.
- Flair: gold/silver/bronze glows and trails for top 3; leader rendered slightly larger.
- Lobby starting grid upgraded to real idling avatars with the "ready pulse" (PRD §5.2).

**Exit criteria**: a full game plays with all movement, overtakes, streaks, and flair rendered from semantic events only; celebration hierarchy respected; both performance profiles work.

### P3 — Round staging

The question loop becomes staged TV beats instead of screen swaps.

**Scope**
- READ: category + tier badge slam-in, question reveal, locked answer buttons.
- ANSWER: shared countdown ring, escalating-tension visual treatment, "locked" state without revealing others' picks.
- Answer buttons restyled: shape-coded (▲ ◆ ● ■), colorblind-safe restrained accents, strong typography, full keyboard operability — not four flat rectangles (PRD §8).
- REVEAL staging: correct-answer highlight, avatar-stacked distribution bar, "FASTEST ⚡ {name}" stamp, fun-fact card slide-in.
- TRACK moment: camera cut to the world (P1/P2 execute the motion; this phase directs the sequence).
- Final-question escalation: lights dim, track goes neon, "FINAL QUESTION" treatment (audio sting lands in P4).
- Broadcast connective tissue: transitions between beats, lower-third-style callouts on the player view where readability allows.

**Exit criteria**: a complete round plays as a continuous staged sequence; question readability and interaction remain first-priority on mobile portrait; e2e suite still passes.

### P4 — Audio identity *(after P3; parallel-safe with P5)*

**Scope**
- Howler-based audio manager subscribing to presentation cues.
- Music states: lobby groove, escalating answer-phase music, final-question sting.
- SFX stingers: correct, wrong (neutral, no mockery), overtake, streak milestones, phase transitions.
- Podium fanfare + ceremony audio delivered here if P5 has landed, otherwise behind the same cue interface for P5 to trigger.
- Per-device mute toggle persisted in localStorage; autoplay-policy-safe start (first user gesture); respects reduced profile.
- Sources: synthesized (WebAudio-rendered) and/or CC0 packs, kept small (compressed, lazy-loaded).

**Exit criteria**: full game has a continuous, state-appropriate soundtrack with stingers on the hierarchy scale; mute persists; no autoplay violations.

### P5 — Podium ceremony & results *(after P3; parallel-safe with P4)*

**Scope**
- Podium ceremony: top-3 podium rise, winner spotlight, GPU-friendly confetti with automatic degradation.
- Restyled full results table (correct count, accuracy, average answer time, streak) in the design system.
- Ceremony structured as staged beats so M3 features (photo-finish sequence, awards, sudden death, rematch) can slot in without restructuring — but none of those are built in M2 (PRD §12 puts them in M3).

**Exit criteria**: game ends in a produced ceremony instead of a table; confetti degrades on reduced profile; results remain fully readable/accessible in HTML.

### P6 — Stage view *(after P4 and P5)*

**Scope**
- New read-only route reached via the room's stage link: chrome-free broadcast layout for TVs/shared screens.
- Re-composes the P1–P5 world, staging, audio, and ceremony at cinematic framing — "Circuit Break Broadcast" (PRD §8): wide track shot, question + timer, reveal, podium.
- Its own camera direction and lower-third player callouts; no interaction affordances.
- Joins the realtime channel as a spectator; never writes game state.

**Exit criteria**: a TV-ready spectator screen follows a full live game (lobby → rounds → ceremony) without interaction; multiple stage views can watch one room.

## 4. Cross-cutting constraints (bind every phase)

1. **Semantic events only** (PRD §3.6, §9): realtime traffic describes game meaning; every client interprets animation locally. No coordinates, sprite frames, or renderer concepts on the wire.
2. **Rendering separation** (PRD §9): Pixi owns the world (track, avatars, environment, VFX, camera); HTML/CSS/React owns everything readable and interactive (question, answers, timer, dialogs, results). Accessibility never depends on canvas.
3. **Engine/mode/world boundaries** (PRD §3.5): world visuals (environment, avatars, props, VFX styling, audio identity) stay in world-content modules; staging/choreography logic stays world-agnostic where the separation is free. No speculative multi-world framework.
4. **Celebration hierarchy** (PRD §8): all feedback intensity is expressed through the P0 scale.
5. **Performance profiles + reduced motion** are acceptance criteria for every phase, not a final pass.
6. **The design razor**: every choice is tested against "does this make it feel more like a game show, or more like a quiz website?" — without sacrificing question readability or accessibility.
7. **M1 must keep working**: the Playwright e2e suite passes at the end of every phase.

## 5. Testing approach

- **Vitest units** for all pure logic: presentation-event mapping, camera math, celebration-scale resolution, profile selection, audio-state machine.
- **Playwright e2e**: existing suite is the regression floor after every phase; phases add e2e coverage only where they change interaction (e.g. mute toggle, stage-view route loads and follows phases).
- **Visual smoke checks** per phase via playwright-cli screenshots during development (not committed as snapshot tests).
- Canvas internals are not unit-tested; the tested seam is presentation-events-in → presentation-state-out.

## 6. Drill-down process

For each phase, in roadmap order:
1. Brainstorm the phase against this roadmap (superpowers:brainstorming) — the phase's scope block above is the starting requirement set.
2. Write the phase spec to `docs/superpowers/specs/` as `YYYY-MM-DD-m2-p<N>-<name>-design.md`.
3. Create its implementation plan (superpowers:writing-plans), implement, verify exit criteria, and confirm the e2e suite passes before starting the next phase.

P4 and P5 may be developed in parallel (e.g. separate worktrees) once P3 is merged; P6 starts only after both are merged.
