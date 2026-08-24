# M2 P6b — Broadcast direction

**Status:** approved, not yet planned
**Phase:** M2 P6b
**Sibling:** [P6a — Stage view](2026-08-24-m2-p6a-stage-view-design.md), whose §12 defines this phase's scope
**Roadmap:** [M2 — The Show](2026-08-21-m2-the-show-roadmap.md)

---

## 1. Purpose

P6a shipped the stage view: a chrome-free spectator route with a full-bleed world. It deliberately fixed none of the framing or direction problems that route makes visible, and named all five in its §12.

P6b is those five items, plus two adjacent debt entries from `docs/progress/CURRENT.md` that sit inside the same code and would otherwise be re-verified twice.

The through-line: **the stage inherited the player view's direction, and a TV is not a phone.** Camera shots tuned for a 28vh strip behind a question card, a callout pill sized for a thumb, a results retreat that halves the canvas height, and framing math that silently assumes 16:9 — each is correct on the surface it was built for and wrong on a television.

---

## 2. Decisions

1. **Scope is the full "Broadcast direction" phase**, all five §12 items — not the narrower two-defect reading in `CURRENT.md`, which predates P6a's spec.
2. **Two adjacent debt entries are pulled in:** the `TRACK_MARGIN` run-off (P2) and the confetti budget seed (P5a). Both live in code this phase already re-verifies.
3. **Vertical framing gets two levers, not one** (§3). Stacks compress; the podium widens. A single "camera widens to fit" lever was rejected because ADR-0005 explicitly rejects widening as the answer for ties.
4. **`geometry.ts` stays viewport-free by contract.** The viewport-aware derivation lives in `framing.ts`, which already takes a `Viewport`, and passes a plain number down.
5. **The stage gets its own shot book**, selected by `ViewerRole`, rather than a second director module (§4).
6. **The lower third becomes a full-bleed strip pinned to the horizon** on the stage surface (§5).
7. **The band is a title-safe frame, not a centred column** — prompt high, answers on the floor, callout strip on the horizon between them (§5).
8. **The stage surface rescales by overriding existing theme tokens in a scope**, not by a parallel `--stage-*` namespace (§5).
9. **The reveal fills columns bottom-up** rather than reflowing to a list (§6).
10. **The stage ceremony splits horizontally** — canvas left, board right — instead of retreating vertically (§7). The player view keeps its retreat unchanged.

---

## 3. The vertical-framing contract

### 3.1 The missing number

`worldScale = viewport.width / camera.span` picks scale from **width alone**. Every vertical measurement is then taken in that scale against `horizonY = viewport.height * HORIZON_FRACTION`. So the world units visible above the ground line are:

```
headroom(viewport, span) = viewport.height * HORIZON_FRACTION * span / viewport.width
```

This is never computed anywhere today. Both open framing defects are that number being too small. It becomes a new exported pure function in `lib/world/framing.ts`.

Reference values (`HORIZON_FRACTION` 0.72, `MIN_SPAN` 800):

| Viewport | `headroom` at `MIN_SPAN` |
|---|---|
| 1920×1080 (16:9) | 324.0 |
| 2560×1080 (21:9) | 243.0 |
| 3440×1440 (21:9) | 241.1 |
| 1920×540 (32:9 — player retreat) | 162.0 |

### 3.2 Stacks compress

`MAX_STACK_RISE` (179.2 = `AVATAR_HEIGHT * 1.4`) becomes a derived limit in `framing.ts`:

```ts
stackRiseLimit(viewport) = clamp(
  headroom(viewport, MIN_SPAN) - Math.abs(RIG_TOP),  // tightest shot = worst case, so no circularity
  MARKER_ROW_HEIGHT / 2,                             // floor   32
  MAX_STACK_RISE,                                    // ceiling 179.2
)
```

`MIN_SPAN` rather than the live span is deliberate: the tightest shot the camera can ever take is the worst case, so the limit never depends on the camera state it would otherwise feed back into.

| Viewport | limit | today | effect |
|---|---|---|---|
| 1920×1080 | **179.2** | 179.2 | identical |
| 2560×1080 | **108.0** | 179.2 | was clipping |
| 3440×1440 | **106.1** | 179.2 | was clipping |

16:9 is bit-for-bit unchanged. This is not a retune — it is the same constant with its hidden assumption made explicit. `MAX_STACK_RISE`'s own docstring already derives 179 at `MIN_SPAN` and then assumes 16:9; this finishes that derivation.

`stackPitch` and `markerAnchors` in `geometry.ts` take the limit as a **plain number parameter** (decision 4). `MAX_STACK_RISE` survives as the ceiling constant.

Threading it costs a one-line reorder: `runtime.ts` builds `anchors` at `:190` and computes `viewport` at `:191`, so the two swap and `stackRiseLimit(viewport)` passes into `fieldAnchors`.

### 3.3 The floor is a real trade

At a deep squeeze — a player device mid-ceremony at 1920×540 — `headroom` at `MIN_SPAN` is 162, so the limit wants 27 and is floored to 32. Heads can still clip there.

The invariant is therefore **not** "nothing ever clips". It is:

> The stack never grows past what the frame shows *because of the limit*. Where the limit is floored, `offscreenPlayerIds` names the affected players rather than reporting nobody missing.

"Never clip" would require widening the shot for ties, which ADR-0005 rejects on legibility grounds: eight rows at full pitch is 448 units against a frame showing 800 units of width, and framing that makes every rig unreadable.

### 3.4 The podium widens

The podium has no compression lever — the block heights *are* the ceremony — so `frameTarget('podium')` gains a vertical fit:

```
PODIUM_TOP_PAD = AVATAR_HEIGHT * 0.15                                   // 19.2
needed         = BLOCK_HEIGHTS[1] + |RIG_TOP| + PODIUM_TOP_PAD          // 108.8 + 135 + 19.2 = 263
requiredSpan   = needed * viewport.width / (viewport.height * HORIZON_FRACTION)
span           = clamp(max(PODIUM_SPAN, requiredSpan), MIN_SPAN, MAX_SPAN)
```

| Viewport | `requiredSpan` | resulting span | vs today |
|---|---|---|---|
| 1920×1080 (full) | 649.4 | **921.6** (`PODIUM_SPAN`) | unchanged |
| 1280×360 (retreated) | 1298.8 | **1298.8** | was clipping at y ≈ −79 |

The healthy case is untouched; only a short canvas widens. The canvas resizes with the band (`resizeTo: host` + `ResizeObserver`), so the retreat re-fires the fit on its own — **zero coupling to `useCeremony`**.

`frameTarget` therefore needs `viewport` for the podium case. It is already on `FramingInput`.

---

## 4. The stage shot book

`lib/world/director.ts` is a pure reducer over one `BASE_BY_PHASE` table. It gains a role, not a fork:

```ts
interface ShotBook {
  base: Record<Phase, CameraIntent>;
  overtakeHoldMs: number;
  finalQuestionHoldMs: number;
}

const SHOT_BOOKS: Record<ViewerRole, ShotBook> = { player: PLAYER_SHOTS, stage: STAGE_SHOTS };
```

`DirectorState` gains `role: ViewerRole` (`lib/viewer.ts`), set once by `seedDirector(phase, role)`. `reduceCue` looks up `SHOT_BOOKS[state.role]`. State stays serializable, the reducer stays pure, and no case grows a branch.

Two wiring facts, checked rather than assumed:

- `seedDirector` has exactly one production call site, `lib/world/runtime.ts:144`. `WorldRuntimeOptions` carries `profile` but **not** `role` today, so it gains `role: ViewerRole`; `PixiStage` already holds one and passes it straight through.
- `initialDirectorState` is used by ~20 assertions in `tests/director.test.ts`. It keeps `role: 'player'` so those keep compiling and keep asserting player direction; the stage book gets its own describe block.

### 4.1 Wider READ/ANSWER base

`fit()` already takes a padding; only two values exist today (`PACK_PADDING` 288, `EMPHASIS_PADDING` 192). Add a third and expose all three as framing modes:

| mode | padding | used by |
|---|---|---|
| `packTight` | 192 | stage final-question push-in |
| `pack` | 288 | player READ/ANSWER/REVEAL/TRACK (unchanged) |
| `packWide` | 576 (`SEGMENT_WIDTH * 1.8`) | stage READ/ANSWER/REVEAL |

On a player device the world is a strip behind a question card, so a tight pack shot is right. On stage the world is the entire backdrop with the question overlaid, and the same shot reads as a cropped detail rather than a broadcast wide.

### 4.2 Slow push-in on the final question

Roadmap P1 named this ("slow push-in for the final question") and it was never built. Today `final-question` yields `intent('pack', 'drift')`, which on stage is close to a no-op because the base shot is already `pack`.

- Player: unchanged.
- Stage: `intent('packTight', 'push')`, where `push` is a new `MoveStyle` with a long duration token — long enough that the camera is **still travelling** when the callout lands, so the escalation reads as a move rather than a cut that already happened.

`escalation: 1` behaviour is unchanged; it drives the grade, not the camera.

### 4.3 Longer transient holds — with a shared-hold invariant

`director.ts` states that "the camera transient and the DOM callout expire together, by construction." That holds only because `OVERTAKE_HOLD_MS === DRAMA_HOLD_MS` and `LowerThird` hides at `ARENA_AT_MS + DRAMA_HOLD_MS`.

Lengthening the stage's camera hold without lengthening the stage's callout would silently break it. So:

> There is **one** `STAGE_DRAMA_HOLD_MS`, consumed by both the stage shot book and `LowerThird` on the stage surface.

The invariant survives by construction on both surfaces, or it is not worth having. A room watching a TV needs longer to find an overtake than a thumb glancing at a strip does, so the two surfaces deliberately disagree on how long a moment lasts.

### 4.4 Wider ceremony room shot

New mode `podiumRoom`: `fit()` over the podium's world extent **union** the standing anchors, at `PACK_PADDING`. Players who did not medal stand at `markerAnchors` near the finish line, which is where the podium is, so this is a genuine fit rather than a hardcoded wider span. §3.4's vertical fit applies on top of whatever span it returns.

Player `results` keeps `intent('podium', 'cut')`. Stage uses `intent('podiumRoom', 'cut')` — a cut, not a drift, on both: a drift to the podium is a screensaver.

---

## 5. The broadcast band

`StageBroadcast`'s `justify-between` centred `max-w-6xl` column is portrait logic inherited from `StageShell`. It becomes a title-safe frame:

```
┌─ 5% title-safe ──────────────────────────────────┐
│ ROUND 7/12  🎬 MOVIES  HARD          [TimerRing] │
│                                                  │
│              the prompt, pinned high             │
│                                                  │
│ ══════════ callout strip, on the horizon ═══════ │   ← full-bleed, ignores the 5% inset
│                                                  │
│ [ A ]      [ B ]      [ C ]      [ D ]           │   ← the floor row
└──────────────────────────────────────────────────┘
```

The pack stays visible through the whole beat instead of sitting behind a column of furniture.

### 5.1 Scale — one block, no component edits

```css
[data-surface="stage"] {
  --spacing:       clamp(0.25rem, 0.30cqi, 0.5rem);
  --text-hero:     clamp(2.25rem, 3.6cqi, 5rem);
  --text-display:  clamp(4rem, 6.2cqi, 9rem);
  --container-6xl: 90cqi;
}
```

Verified against Tailwind 4.3.3's compiled output: `.p-8 → calc(var(--spacing) * 8)`, `.text-hero → var(--text-hero)`, `.max-w-6xl → var(--container-6xl)`. Every utility resolves through a theme var, so `StageQuestion`, `StageOptions`, `RevealPanel`, `WinnerCard` and `ResultsTable` all rescale **untouched**.

**Documented risk — this is action at a distance.** Inside `[data-surface="stage"]`, `p-8` does not mean what it means anywhere else in the app. This gets a comment in `globals.css` at the override block and a line in the P6b progress doc. It is the price of one scale instead of two, and it was chosen over a parallel `--stage-*` namespace precisely because the shared components (`RevealPanel`, `WinnerCard`, `ResultsTable`, `AvatarStack`) would otherwise each need a variant prop or a stage-only copy.

Title-safe replaces `p-8` with `p-[5%]` on the stage root.

### 5.2 The strip sits on the horizon, and the horizon is a TS constant

`HORIZON_FRACTION` (0.72) lives in `geometry.ts`. `app/globals.css` is already declared the source of truth for design tokens, with `lib/presentation/tokens.ts` hand-mirroring the canvas-relevant subset and `tests/tokens.test.ts` failing on drift.

`--horizon-fraction` joins that mirrored set; the strip positions off it. The existing test guards it — no new mechanism.

### 5.3 `LowerThird` gains a variant

A `variant` prop, not role-from-context:

- `'card'` — today's pill. Player surface. Unchanged.
- `'strip'` — full-bleed band pinned to the horizon, accent bar left, gradient fading right, slides in from the left. Ignores the 5% title-safe inset by design; a broadcast lower third runs to the edge.

The `isFinal` treatment (warning-toned, `text-hero`, centred) composes with `'strip'` rather than replacing it.

---

## 6. The reveal as columns

B's floor row makes each option roughly a fifth of the screen wide, where today's horizontal furniture — share fill, `AvatarStack`, count — no longer fits.

`StageOptions` in `result` mode fills each column **bottom-up** by `share`, with the count large and the `AvatarStack` at the foot. Four side-by-side columns are already a bar chart; letting the share fill them is the reading a room parses from a distance faster than four numbers, and it keeps the faces, which is the part of the reveal that gets a laugh.

This honours ADR-0019 more literally than today's treatment: **no element changes position, only height.**

Two things the implementation must not get wrong:

1. **The floor row reserves its full height from READ onward**, so the reveal grows into reserved space and nothing reflows. Without this the answers move at the beat's most dramatic moment and "transforms in place" stops being true.
2. **ADR-0017 applies directly.** `targetOpacity` is already a `motion` variant target, and the fill height animates on the same elements. Whichever property `motion` drives must not also carry a Tailwind class — the inline animated style outranks the class regardless of specificity, silently.

`AvatarStack` keeps its `show` gate on `revealSteps.stacks`; only its container changes.

---

## 7. The ceremony split

`PixiStage` publishes the results band as a custom property precisely so the board cannot overlap the podium (ADR-0015: published once, consumed, never re-derived). The split keeps that rule and changes the axis — **on the stage only**.

| | player | stage |
|---|---|---|
| before `BOARD_AT` (6000ms) | `--ceremony-band: 100vh` | canvas full bleed |
| after `BOARD_AT` | `--ceremony-band: 50vh` | `--ceremony-panel: 56%` |

The player view is untouched. On stage the canvas keeps `h-screen` for the whole ceremony and narrows to 56% width. `StageResults` consumes the same property to size its column as `calc(100% - var(--ceremony-panel))`, so the two cannot overlap by construction. `transition-[width]` on `dur-settle`, mirroring today's `transition-[height]`.

Two consequences, stated rather than discovered later:

**The stage's 32:9 worst case stops existing.** At 1920×1080 the panel is 1075.2px, so `headroom` at the podium shot is ≈ 666.5 world units against 263 needed. §3.4's vertical fit will essentially never engage on stage — it engages on the **player** view's retreat, which is where the defect was originally measured (1280×360). The fit is not dead code; it has one surface instead of two. The headed check at 1920×1080 during the ceremony therefore verifies the player view.

**The podium renders smaller than today**, because scale is `panelWidth / span` and the panel is 56% of the screen. This is intended rather than a regression — §4.4's `podiumRoom` fit deliberately widens to include the field that did not medal, so a room shot is the point — but it is a visible change and is verified by eye in the headed checks, not asserted from the math.

---

## 8. The two pulled-in debt entries

### 8.1 `TRACK_MARGIN` run-off (P2)

The numbers were re-derived rather than taken on trust:

```
runOff  = -GRID_LEAD_IN - minX - GRID_EDGE_MARGIN = -40 + 260 - 67.5 = 152.5
spacing = min(GRID_COLUMN_WIDTH, runOff / (columns - 1))
```

At 8 players that is 4 columns, so `spacing = min(90, 152.5/3) = 50.8`. Before `GRID_EDGE_MARGIN` existed it was `220/3 = 73.3`. That reproduces `CURRENT.md`'s "73 → 51" exactly, so the entry is about the 8-player grid.

Derived, not a literal — the same discipline `MARKER_ROW_HEIGHT` follows:

```ts
GRID_COLUMN_WIDTH = RIG_HALF_WIDTH * 2                                      // 90 — rigs touch, never overlap
TRACK_MARGIN      = GRID_LEAD_IN + GRID_EDGE_MARGIN + 3 * GRID_COLUMN_WIDTH // 377.5
```

This restores full 90-unit spacing at 8 players.

**It does not fix 20 players** (PRD §13's maximum): 10 columns still compress to `270/9 = 30`. That is inherent to a fixed run-off and stays as-is. The debt entry is narrowed, not retired, and `CURRENT.md` must say so.

`minX` moves −260 → −377.5, widening world bounds by 117.5. That changes `spanLimits` and the establishing shot, which is the camera re-verification the debt note asked for; §11's sweep performs it.

### 8.2 Confetti budget seed (P5a)

`createWorldRuntime` starts `budget` at `initialBudgetState` (`full`) regardless of `profile`, converging only after its own first ~500ms tick. Every other VFX consumer is a continuous emitter and self-corrects invisibly inside that window. Confetti is one-shot, so a client mounting into an already-elapsed ceremony past `CONFETTI_AT` (4100ms) bursts at whatever density `budget` happened to start at, with no chance to self-correct.

Fix: `vfxBudget.ts` gains `initialBudgetFor(profile)` beside the existing `initialBudgetState`, applying the same ceiling `stepBudget` already applies on its first tick (`profile === 'reduced'` → `minimal`). `runtime.ts:148` seeds from it instead of the bare constant.

Deliberately mirrors `stepBudget`'s own rule rather than inventing a second mapping, so the seed and the first tick cannot disagree.

A TV switched on late is the normal way to hit this, which is why it belongs in this phase rather than staying an orphan entry.

---

## 9. Files touched

| File | Change |
|---|---|
| `lib/world/framing.ts` | `headroom()`, `stackRiseLimit()`, podium vertical fit, `packTight`/`packWide`/`podiumRoom` modes |
| `lib/world/geometry.ts` | `stackPitch`/`markerAnchors` take a rise limit parameter; `TRACK_MARGIN` and `GRID_COLUMN_WIDTH` derived |
| `lib/world/director.ts` | `ShotBook`, `SHOT_BOOKS`, `role` on `DirectorState`, `STAGE_DRAMA_HOLD_MS` |
| `lib/world/camera.ts` | `push` move style + duration |
| `lib/world/vfxBudget.ts` | `initialBudgetFor(profile)` |
| `lib/world/runtime.ts` | `role` on `WorldRuntimeOptions`; seed `budget` from `profile`; pass the rise limit into the anchor builder (`:109-120`) |
| `lib/world/podium.ts` | `podiumAnchors` forwards the rise limit to its `markerAnchors` call (`:134`) |
| `lib/presentation/tokens.ts` | mirror `--horizon-fraction` |
| `app/globals.css` | `[data-surface="stage"]` override block, `--horizon-fraction` |
| `components/PixiStage.tsx` | role-aware ceremony band: `--ceremony-panel` on stage |
| `components/LowerThird.tsx` | `variant` prop |
| `components/stage/StageBroadcast.tsx` | title-safe frame composition, `data-surface="stage"` |
| `components/stage/StageOptions.tsx` | column fill in `result` mode |
| `components/stage/StageResults.tsx` | right-hand column sized off `--ceremony-panel` |

---

## 10. Edge cases

1. **A tie deep enough to floor `stackRiseLimit`.** Heads clip; `offscreenPlayerIds` must name them (§3.3).
2. **A stage view opening mid-ceremony after `BOARD_AT`.** The panel must already be at 56% on first paint, not animate in — same one-shot mount-time derivation `StageResults` already carries for `settled` (ADR-0030).
3. **A 4:3 or 16:10 display on the stage route.** Not a target, but must not clip: `headroom` is larger at these aspects, so both levers idle.
4. **A single-player game at the ceremony.** `podiumRoom`'s anchor union is one anchor plus the podium extent; `fit()` handles it, and `clampCamera` raises to `MIN_SPAN`.
5. **`total_rounds = 1`.** The lobby grid lives entirely in the widened run-off; `spanLimits` caps on `maxX - minX`, which the `TRACK_MARGIN` change moves.
6. **Reduced profile on stage.** `push` collapses to the same duration as a cut, per `beginMove`'s existing reduced-profile rule; the shot still arrives.

---

## 11. Testing

### 11.1 Unit sweep

`framing.ts` and `geometry.ts` are pure, so this is the real regression floor.

1. Continuous aspect range, 4:3 → 32:9, at several heights, including the retreated derivatives.
2. **Podium invariant** — rig top on canvas with `PODIUM_TOP_PAD` clearance at every sampled viewport.
3. **Stack invariant** — top rig's head on canvas wherever `stackRiseLimit` is not floored; where floored, `offscreenPlayerIds` is non-empty.
4. **Pinned regressions**, exact equality so a future retune cannot quietly move 16:9:
   - `stackRiseLimit(1920×1080) === MAX_STACK_RISE`
   - `frameTarget('podium')` span `=== PODIUM_SPAN` at 1920×1080
5. **Grid spacing** at 8 players `=== GRID_COLUMN_WIDTH` after the run-off change.
6. `tests/tokens.test.ts` extended for `--horizon-fraction`.

### 11.2 Headed checks

Three resolutions: **1920×1080, 2560×1080, 3440×1440**.

Headed, not headless. `CURRENT.md` records that headless Chromium falls back to SwiftShader, idles near 16fps, and pins the VFX budget at `minimal` before a test starts — it cannot verify this work.

Per resolution: a full stage playthrough. Plus, once:

- the player-view ceremony retreat at 1920×1080 — the surface that still stresses the podium fit;
- a late-mount reload past `CONFETTI_AT` under a degraded profile, for the budget seed;
- an 8-player lobby, for the run-off spacing.

### 11.3 Gates

- `npx tsc --noEmit`
- `npm run lint` — **clean**. `CURRENT.md` is explicit that the one historical error was fixed on 2026-08-24 and there is no longer anything to discount.
- `npm test`
- `npm run build`
- `npm run test:e2e -- --workers=2` — the default worker count is flaky on this machine.

---

## 12. Scope boundaries

Out of P6b:

1. **Any protocol change.** No new payload field, same as P6a decision 3.
2. **A portrait or mobile stage layout.** The stage is a landscape TV surface.
3. **The `LobbyView` restyle** and the PRD's full join-link/QR share surface.
4. **A settings control on stage.**
5. **The 20-player grid compression** (§8.1) — narrowed, not retired.
6. **The off-screen marker's missing direction** (P2 debt). Still deferred: it changes a pure module's return type, `useWorldView`'s state shape, and every caller and test.
7. **The `advance_phase` intermittent 400** (P4 debt). Unrelated code; still unreproduced.
8. **The lobby → countdown teleport** (P2, intentionally skipped). Unchanged.

---

## 13. Exit criteria

1. `headroom()`, `stackRiseLimit()` and the podium vertical fit exist in `framing.ts`; `geometry.ts` remains viewport-free.
2. The unit sweep passes across 4:3 → 32:9, with the 16:9 pinned regressions exact.
3. On 2560×1080 and 3440×1440, a deep tie stack is fully on canvas or fully reported by `offscreenPlayerIds`.
4. The winner's podium rig is unclipped on the player view's retreated 50vh band.
5. The stage runs its own shot book: wider READ/ANSWER, a push-in that is still moving when the final-question callout lands, longer holds shared with the callout, and a `podiumRoom` ceremony shot.
6. The stage band is a title-safe frame; the callout is a full-bleed strip on the horizon; the reveal fills columns bottom-up without reflow.
7. The stage ceremony splits horizontally; board and podium cannot overlap.
8. 8-player lobby grid spacing is 90 units.
9. Confetti respects `profile` on a late mount.
10. All §11.3 gates pass.

---

## 14. Expected ADRs

1. **The vertical-framing contract is two levers, not one** — why stacks compress and the podium widens, and why ADR-0005's rejection of widening-for-ties still stands.
2. **The stage ceremony splits horizontally rather than retreating** — and why that removes the stage's 32:9 case without making the podium fit redundant.
3. **The stage rescales by overriding theme tokens in a scope** — the action-at-a-distance trade, and why a parallel `--stage-*` namespace was rejected.
4. **The shot book is role-selected inside one director** — including the shared-hold invariant binding `STAGE_DRAMA_HOLD_MS` to both the camera transient and the callout.
