# M2 P0 — Foundation & Design System

| | |
|---|---|
| Status | Approved design — ready for implementation planning |
| Parent | `docs/superpowers/specs/2026-08-21-m2-the-show-roadmap.md` (P0), `docs/PRD.md` §8–§9 |
| Date | 2026-08-21 |
| Baseline | M1 complete and green: full core loop with Playwright e2e coverage; placeholder Tailwind UI; bare `globals.css`; DOM `Track.tsx` |

## 1. Purpose

P0 builds the substrate every later M2 phase consumes: the design-token system and celebration hierarchy, the presentation-event layer that turns game-state transitions into show cues, performance profiles, the Pixi canvas mount, and the first screens rendered in the new visual identity. Presentation-only — no schema, RPC, or realtime-protocol changes.

## 2. Decisions

1. **Full cue vocabulary in P0.** The complete M2 cue set is defined and typed now; every cue derivable from M1 state is unit-tested. Later phases consume the seam, never redefine it.
2. **Restyle scope**: landing page, host setup wizard, **and** `JoinGate` (the player's first impression uses the same primitives). Lobby, question loop, and results keep placeholder styling until their phases.
3. **Profile selection is a static startup heuristic** (no runtime FPS watchdog in P0 — nothing heavy exists to measure yet). Manual override + `prefers-reduced-motion` are first-class.
4. **Visible settings control ships in P0**: a corner gear on the room view with an auto/high/reduced choice, persisted per device. P4 adds its mute toggle here later.
5. **Cues derive from a pure diff function fed by a store subscriber** — game-state code (`store.ts`, RPCs, channel) is untouched.
6. **Tokens are CSS-first**: the Tailwind v4 `@theme` block is the source of truth; a hand-mirrored `tokens.ts` exposes canvas-relevant values to Pixi/logic code. No codegen.

## 3. Module layout

```
lib/presentation/
  tokens.ts        # TS mirror of canvas-relevant tokens (hex numbers, curves, durations)
  celebration.ts   # CelebrationTier ordinal scale + resolveTier()
  cues.ts          # full M2 cue vocabulary (discriminated union)
  deriveCues.ts    # pure (prev, next, derivationState) -> { cues, nextState }
  cueBus.ts        # typed emitter + startCueBridge() store subscriber
  profile.ts       # resolveProfile(signals, override) + persistence key
lib/useSettings.ts # small Zustand store: override, effective profile
components/
  PixiStage.tsx        # canvas lifecycle; empty scene in P0
  SettingsControl.tsx  # corner gear popover: auto | high | reduced
  ui/Panel.tsx, Button.tsx, Input.tsx, Select.tsx   # glass primitives
app/globals.css    # @theme token definitions (source of truth)
```

New dependencies: `pixi.js@^8`, `motion`, `howler` + `@types/howler` (Howler has no consumer until P4; P0 is the phase that touches `package.json`).

## 4. Design tokens & celebration hierarchy

**`@theme` block in `globals.css`** defines the night-race system (PRD §8):

- Color: dark-indigo surface scale; neon accents (cyan, magenta, lime); warm avatar palette; gold/silver/bronze; semantic correct/wrong/warning.
- Typography: a display face and a body face loaded via `next/font` (self-hosted), with a named scale.
- Spacing and radii consistent with glassmorphic panels.
- Motion: named curves and durations as tokens — e.g. `--ease-snap` (cuts), `--ease-settle` (spring-like overshoot), `--ease-drift` (ambient) — the shared motion vocabulary for CSS, `motion`, and Pixi tweens.

**`tokens.ts`** mirrors only what non-CSS code needs: colors as `0xRRGGBB` numbers, curves as cubic-bezier arrays / spring params, durations in ms. A header comment names the `@theme` block as source of truth; the two are kept in sync by hand.

**`celebration.ts`** exports the ordinal scale fixed by the roadmap:

```
routine < streakMilestone < overtake < finalQuestion < victory
```

Every cue type carries its tier. `resolveTier(cues: Cue[]): CelebrationTier` returns the highest tier among simultaneous cues; consumers render lower-tier cues in subdued form when a higher tier is present. Unit tests pin the ordering and the resolver so routine moments can never outrank major ones.

## 5. Presentation-event layer

The single seam between game state and the show. Pixi (P1+), `motion`-driven UI (P3), and Howler (P4) subscribe here and nowhere else.

### Cue vocabulary (`cues.ts`)

Typed discriminated union, each variant carrying its `CelebrationTier`:

| Group | Cues |
|---|---|
| Phase beats | `phase-countdown`, `phase-read` (round, category, tier, `isFinal`), `phase-answer` (`ends_at`), `phase-reveal` (correct index, counts, fastest), `phase-track`, `phase-results` |
| Standings drama | `player-advanced` (playerId, from → to segment), `overtake` (playerId, passed playerIds), `lead-changed` |
| Streaks | `streak-tier` (playerId, tier `3 \| 5 \| 8`), `streak-broken` (playerId) |
| Escalation | `final-question` (fired alongside the last round's `phase-read`) |
| Local-only | `answer-locked` (own submission confirmed) |
| Lobby / ceremony | `player-joined`, `podium` (victory tier; consumed in P5/P6) |

### Derivation (`deriveCues.ts`)

Pure function over consecutive store snapshots plus a `DerivationState` accumulator it returns updated. Standings deltas yield `player-advanced`, `overtake` (relative order change), and `lead-changed`.

**Streak inference.** M1's `Standing` carries `longest_streak` but not current streak, and reveal payloads are not per-player. Current streak is inferred locally: a player's `correct` count incrementing between consecutive reveals is a hit; a non-increment breaks the streak. The accumulator tracks per-player consecutive hits. Known limitation, accepted: after a refresh or late join the inference restarts, so a client joining mid-game may under-celebrate an in-progress streak — it can never over-celebrate. This is presentation-local state; no protocol change (roadmap decision 4 not triggered).

### Bus (`cueBus.ts`)

Hand-rolled typed emitter (~30 lines, no dependency): `on(type, handler)` returning an unsubscribe, and `emit(cue)`. `startCueBridge()` subscribes to the Zustand game store, runs `deriveCues` on each change, emits the results, and returns a teardown. Mounted once in the room page.

## 6. Performance profiles & settings

**`profile.ts`** exports pure `resolveProfile(signals, override): 'high' | 'reduced'`.

Signals, gathered once at startup: `prefers-reduced-motion`; `navigator.deviceMemory < 4`; `hardwareConcurrency < 4`; coarse pointer **and** narrow viewport together. Any reduced-leaning signal → `reduced`.

Precedence: explicit manual override (`high`/`reduced`) wins over everything, including reduced-motion; otherwise `prefers-reduced-motion` forces `reduced`; otherwise the heuristic decides. Override value (`auto | high | reduced`) persists in `localStorage`.

**`useSettings`** is a separate small Zustand store (override + effective profile) so presentation settings never mix with game state. Later phases read exactly one value: `useSettings(s => s.profile)`.

**`SettingsControl.tsx`**: a corner gear on the room view opening a small glass popover with the three-way choice. Changing it takes effect immediately (re-resolves profile) and persists.

## 7. PixiStage

`components/PixiStage.tsx` owns canvas lifecycle only:

- PixiJS v8 `Application` via async `init`; guarded against React Strict Mode double-mount with a cancel flag.
- `resizeTo` its container; `devicePixelRatio` capped at 2; `antialias` only in the high profile; background in token indigo.
- Rendered as an absolutely-positioned layer filling the room view **behind** the HTML game UI, `pointer-events: none` — all interaction stays in HTML (rendering-separation constraint).
- Teardown destroys the application and GL context on unmount.
- Empty scene in P0; reads the effective profile from `useSettings` so P1 branches without modifying this component.

## 8. App-shell restyle

Landing (`app/page.tsx`), host setup wizard (`app/host/new/page.tsx`), and `components/JoinGate.tsx` rebuilt in the night-race language as working proof of the token system.

- `components/ui/` primitives established here and reused by every later phase: `Panel` (translucent indigo, backdrop blur, hairline border), `Button` (primary neon / secondary ghost), `Input`, `Select`.
- Entrance and transition animation via `motion` using the named token curves; collapses to near-instant fades under the reduced profile.
- The `frontend-design` skill guides the aesthetic execution during implementation.
- The existing Playwright suite drives these screens: accessible names, labels, and navigation flow stay stable. Restyle, not restructure.

## 9. Testing

- **Vitest units** (first real units in the repo; vitest already configured):
  - `deriveCues` against hand-built recorded M1 transition sequences covering a full game: join → countdown → rounds with advancement, overtake, lead change, streak build/break → results.
  - `celebration.ts`: scale ordering and `resolveTier`.
  - `resolveProfile` across signal/override combinations, including override-beats-reduced-motion.
- **Playwright e2e**: existing suite passes unchanged (regression floor). One addition: settings control changes the profile and the choice survives reload.
- **Visual smoke**: playwright-cli screenshots of the three restyled screens during development; not committed as snapshot tests.
- Canvas internals are not unit-tested; the tested seam is state-transitions-in → cues-out.

## 10. Exit criteria (from the roadmap)

1. App runs with the new visual identity on landing, host setup, and join gate.
2. Empty Pixi canvas mounts, resizes, and tears down correctly in the room view.
3. Profile switching and reduced-motion demonstrably alter behavior (entrance animations, antialias flag).
4. Presentation-event layer is unit-tested against recorded M1 state transitions.
5. Full Playwright e2e suite passes.

## 11. Out of scope

Any visible world rendering (P1), avatars (P2), staged round choreography (P3), audio playback (P4 — Howler is installed, unused), ceremony (P5), stage view (P6), runtime FPS-based profile demotion, token codegen, and any schema/RPC/realtime change.
