# M2 P6a — Stage view: spectator route & broadcast shell

| | |
|---|---|
| Status | Approved design — ready for implementation planning |
| Parent | `docs/superpowers/specs/2026-08-21-m2-the-show-roadmap.md` (P6), `docs/PRD.md` §8–§9 |
| Date | 2026-08-24 |
| Baseline | **P0–P5b merged.** The world, avatars, round staging, audio identity, podium ceremony and results board all work on the player route. There is exactly one route that renders a game (`app/room/[code]/page.tsx`), exactly one Pixi `Application`, and every runtime resolves the viewer's identity by reading `localStorage` directly. |
| Sibling | **P6b — Broadcast direction** (spec not yet written). P6a makes a TV follow the game; P6b makes it look directed. |

## 1. Purpose

P6a builds the read-only spectator route the PRD calls the stage view: a chrome-free screen for a meeting-room TV or a shared screen in a call, following a live game from lobby through ceremony with no interaction.

It is the *plumbing and composition* half. Everything it renders is composed from P1–P5's existing world, staging, audio and ceremony; the camera, the framing and the lower-third treatment are P6b's. The measure of success here is that a TV can follow a whole game — not that it already looks like a broadcast.

The roadmap put P6 last for a reason: this is the first phase that adds a *second client kind*. The design work is almost entirely about making "who is watching" an explicit input instead of an ambient `localStorage` read.

## 2. Decisions

1. **The viewer role is explicit, not inferred from the absence of a session.** A stage client resolves `localPlayerId` to `null` *regardless of what is in `localStorage` for that room code*. Inferring it would appear to work — a not-yet-joined visitor is already a supported case — and would then break in the most likely real setup: the host opens the TV link on the same laptop they joined from.
2. **The stage client never writes.** No RPC call, ever. Not `useHostDriver`, not `submit_answer`, not `join_room`. Enforced by composition — the stage route mounts none of the components that can write — not by a runtime guard.
3. **No protocol change** (roadmap §2.4). The only broadcasts are `phase` and `player_joined`, and neither carries answer progress, so the stage view shows no "locked in" count during ANSWER. This is a deliberate omission, not an oversight.
4. **The world is never a strip on stage.** The player route shrinks the canvas to 28vh during READ/ANSWER/REVEAL so the question dominates a phone. The stage route holds the canvas full-bleed at every phase and overlays the question. That inversion is the cinematic difference between the two surfaces.
5. **The stage view gets its own components rather than a `surface` prop on the player's.** `AnswerButtons` is the most heavily e2e-covered component in the app and renders real `<button>`s with keyboard handling; giving it a second personality puts the primary surface at risk to serve the secondary one.
6. **The audio unlock is a pre-show gate, not an in-show control.** A chrome-free TV screen never receives a `pointerdown`, so Howler never unlocks and the broadcast is silent. One full-screen card, tapped once before the show, satisfies the autoplay policy and leaves "no interaction affordances" intact for the game itself.
7. **P6a reuses today's camera and framing untouched.** Two known defects therefore ride along visibly on a TV until P6b — see §12.

## 3. Module layout

```
lib/
  viewer.ts               # NEW, pure, tested: ViewerRole → local player id
  useRoomRuntimes.ts      # NEW: the four order-sensitive runtime mounts, in one place
  staging/options.ts      # NEW, pure: index → glyph + accent (extracted from AnswerButtons)

app/
  stage/[code]/page.tsx   # NEW: the spectator route

components/
  PixiStage.tsx           # + role prop: band policy and YOU-ring resolution
  LobbyView.tsx           # + host-only stage-link panel
  AnswerButtons.tsx       # - the OPTIONS table, now imported from lib/staging/options.ts
  stage/
    StageBroadcast.tsx    # the shell: regions over the canvas, keyed on useStaging.beat
    StageGate.tsx         # one-time "tap to start the show" card
    StageJoinPanel.tsx    # lobby: code, join URL, QR
    StageQuestion.tsx     # category/tier badge + prompt at TV scale
    StageOptions.tsx      # non-interactive options; reveal transformation + distribution
    StageResults.tsx      # WinnerCard + ResultsTable, no exit link

lib/world/render/AvatarNode.ts  # baked texture cache namespaced per Application
```

No new store. No new cue type. No change to `deriveCues`, `director.ts`, `framing.ts`, `camera.ts`, or any RPC.

## 4. The viewer seam

```ts
// lib/viewer.ts
export type ViewerRole = 'player' | 'stage';

/**
 * Who is watching, from the perspective of everything that draws.
 *
 * 'stage' returns null unconditionally — it does NOT fall through to the
 * session. That is the whole point of the module: a stage view opened on a
 * device that has already joined this room must behave exactly like one
 * opened on a device that has not.
 */
export function viewerPlayerId(role: ViewerRole, code: string): string | null {
  return role === 'stage' ? null : loadSession(code)?.playerId ?? null;
}
```

Four call sites read a local player today. All four route through this:

| Call site | Effect of `null` on stage |
|---|---|
| `PixiStage`'s `readLocalPlayerId` | No YOU ring on any rig |
| `startStagingRuntime`'s `isLocalPlayerPlaying` | Returns `true` — the tension vignette ramps for the whole room, which is correct for a broadcast |
| `resolveCallout(..., localPlayerId)` | Arbitration falls to `contenders[0]`; callout copy is already third-person |
| `framing.ts`'s `FramingInput.localPlayerId` | No player is exempt from being dropped when the field overflows; the shot is chosen on the pack alone |

`startStagingRuntime(code)` becomes `startStagingRuntime(code, role)`. Its existing lazy-resolution comment stays true — a *player* route still resolves late, because the session is written after the runtime starts.

`useSettings` is untouched. Profile and mute are per-device preferences, and a stage device wanting its own is the correct behaviour.

## 5. Runtime mounting

The room page currently mounts four runtimes in a load-bearing order, documented only in a comment:

```
startAudioRuntime()  →  startCueBridge()  →  startStagingRuntime()  →  startCeremonyRuntime()
                        └── seeds synchronously from the store on mount, so any
                            subscriber registered after it misses the seed batch
```

Duplicating that into a second route is how the comment stops being true. Extract it:

```ts
// lib/useRoomRuntimes.ts
export function useRoomRuntimes(code: string, role: ViewerRole): void;
```

Both routes call it. The channel stays where it is — `useRoomChannel(code)` in each page — because the room page needs the returned channel for `useHostDriver` and the stage page needs only the subscription, not the object.

`get_room_state` is `security definer` and keyed on the room code alone, and the channel is a plain broadcast topic. Neither needs a session, so the stage client needs no new server surface.

## 6. Layout

```
┌────────────────────────────────────────────┐
│ ROUND 7/12    SCIENCE ◆ TIER 3        ⏱ 12 │  ← top bar (StageBroadcast)
│                                            │
│           ●●   world, full bleed           │  ← PixiStage, 100vh, every phase
│    ══════════════════════════════════      │
│   ┌──────────────────────────────────┐     │
│   │ Which planet has the most moons? │     │  ← broadcast band:
│   │   ▲ Mars        ◆ Venus          │     │    StageQuestion + StageOptions
│   │   ● Earth       ■ Jupiter        │     │
│   └──────────────────────────────────┘     │
│   ┌──────────────────┐                     │
│   │ ⚡ FASTEST — Ada  │                     │  ← LowerThird, reused unchanged
└───└──────────────────┘─────────────────────┘
```

`PixiStage`'s `STRIP_PHASES` check becomes role-dependent: `'player'` keeps `strip`, `'stage'` reports `full`. The `results` band is unchanged for both — the podium holds 100vh and retreats to 50vh when `steps.board` lands, so `ResultsTable` has somewhere to sit.

Per beat:

| Beat | Broadcast band | World |
|---|---|---|
| `lobby` | `StageJoinPanel` — code, join URL, QR | starting grid |
| `countdown` | the count, centred and large | establishing shot |
| `read` / `answer` | `StageQuestion` + `StageOptions`; `TimerRing` in the top bar during ANSWER | full bleed |
| `reveal` | `StageOptions` in `result` mode — correct highlight, `AvatarStack` distribution, fastest stamp, fun fact | full bleed |
| `track` | band empty; `LowerThird` only | full bleed — the beat the world already owns |
| `results` | `StageResults` below the retreating podium band | podium |

**Target is landscape ≥1024px.** It renders below that and is not designed for it; a portrait stage layout is a non-goal (§12).

## 7. Components

New, all under `components/stage/`:

- **`StageBroadcast`** — the shell. A fixed grid over the canvas with three regions (top bar, band, lower-third slot), switching contents on `useStaging.beat`. The stage analogue of `StageShell`, and deliberately a separate file: `StageShell`'s whole job is a portrait-first `grid-rows` layout that reserves the 28vh strip.
- **`StageGate`** — a full-screen card carrying the room code and "Tap to start the show". Needs **no** audio API: `startAudioRuntime` already registers `document.addEventListener('pointerdown', unlock, { once: true })`, so any tap satisfies the policy as a side effect. Dismisses for the rest of the page load.
- **`StageJoinPanel`** — giant room code, join URL, and a QR of that URL.
- **`StageQuestion`** — category/tier badge and prompt at TV scale, staged off the same `StageSteps` as `QuestionCard`.
- **`StageOptions`** — the four options as `<div>`s. Carries the ADR-0019 reveal transformation (the options grid *becomes* the distribution) using the existing `distributionRows` and `AvatarStack`, in `dim` / `live` / `result` modes exactly as `AnswerButtons` does — minus `onChoose`, `lockedChoice`, `spectating`, and the 1–4 keyboard shortcuts.
- **`StageResults`** — `WinnerCard` + `ResultsTable` with `myId={null}`, and no "Back to home" link. ADR-0016's "staging never gates input" has nothing to gate here: there is no input.

Reused unchanged: `TimerRing` (driven by the `--timer-frac` custom property the staging runtime already writes), `LowerThird`, `AvatarStack`, `WinnerCard`, `ResultsTable`, `Panel`, and `TensionFrame` — the ANSWER vignette reads `--tension` from the same staging ticker and is a sibling of the shell rather than a descendant, so it mounts on the stage route exactly as it does on the room route.

`PerfOverlay` mounts on stage too. It is already gated behind `?perf=1`, so it costs the broadcast nothing, and a smart-TV browser is precisely the device whose frame budget needs measuring.

Not mounted: `SettingsControl`, `JoinGate`, `GameView`, `ResultsView`, `useHostDriver`.

**One extraction.** `AnswerButtons`'s `OPTIONS` table — the index → glyph/accent mapping — moves to `lib/staging/options.ts`, imported by both surfaces. Its own comment already states the invariant this protects: *"Accents are fixed BY INDEX, not by content, so ▲ is always cyan across every question in every round."* Two independent copies would eventually disagree about which glyph the TV and the phone give option 2. This is the only edit to a P3 component.

## 8. Prerequisite: namespace the baked texture cache

`lib/world/render/AvatarNode.ts` holds the baked avatar textures in a module-scope `Map<string, Texture>`, and `Avatars.destroy()` calls `clearBakedAvatars()` unconditionally — destroying every texture in the process, not just its own app's. That is safe with exactly one `Application` and unsafe the moment there are two, which is what this phase introduces.

The failure is reachable without two canvases on screen at once: a client-side navigation from `/room/CODE` to `/stage/CODE` keeps the JavaScript module alive across the route change, so cache entries can outlive the renderer that generated them and be handed to sprites in a different one.

Fix: key by application (`WeakMap<Application, Map<string, Texture>>`) and scope `clearBakedAvatars(app)` to the caller's own app. `Avatars` already holds its `Application`. Recorded in [ADR-0011](../../ADR/0011-accent-is-a-rim-never-a-body-tint.md); `docs/progress/CURRENT.md` flags it "fix before P6", so it is task 1.

## 9. Stage link

A host-only panel in `LobbyView`: the stage URL, a copy-to-clipboard button, and open-in-new-tab.

This is an addition, not a restyle. `LobbyView` is still M1-era amber/slate and predates the design system — rewriting it is real work with its own visual decisions, and doing it as a rider on P6a would hide it inside a phase about something else.

**One new runtime dependency:** a QR generator for `StageJoinPanel` (`qrcode`, MIT). Dynamically imported so it stays out of the player route's bundle. Flagged because roadmap §2.1 is procedural-first and this is M2's first added runtime dep — QR is an encoding algorithm rather than art, which is why it reads as in-bounds, but it is a deliberate exception worth naming rather than slipping in.

## 10. Edge cases

1. **Unknown room code.** `get_room_state` raises `room not found`, so the stage route renders a plain "No room CODE" card — the code as typed, and nothing else. It must not offer to create or join one; that is a write, and this route does not write (decision 2).
2. **Opened mid-game.** The cue bridge seeds synchronously from the store on mount, and [ADR-0024](../../ADR/0024-the-first-cue-batch-is-catch-up.md)'s catch-up flag already makes that batch apply bed and escalation transitions on sight while suppressing one-shot stings. A stage view opening at round 7 inherits that behaviour for free — it is the same code path as a player reload, which is why §5 keeps the mount order intact rather than re-deriving it.
3. **Opened mid-ceremony.** This lands on a known pre-existing defect: `lib/world/runtime.ts`'s `budget` always starts at `full` and only converges after its first ~500ms tick, so a client mounting past `CONFETTI_AT` can fire the one-shot burst at full density under a reduced profile (CURRENT.md, found in P5a). The stage view makes this case *more* likely rather than introducing it — a TV switched on late is the normal way to arrive. Not fixed here; naming it so it is not rediscovered as a P6a regression.
4. **No usable WebGL.** `PixiStage` already catches renderer init failure and logs it, leaving the HTML intact. On stage that degrades to a readable-but-not-cinematic screen: question, timer, reveal and results all still render, because none of them depend on canvas (PRD §9). A smart-TV browser is the likeliest device to hit this.
5. **Room finishes while the stage view is open, or is opened after it finished.** `status: 'finished'` with a past `ends_at` — the ceremony runtime reports the board settled and `StageResults` renders at rest, the same one-shot mount-time derivation [ADR-0030](../../ADR/0030-the-results-board-is-present-before-it-is-visible.md) established. `StageResults` must carry that derivation; it is not inherited by rendering `WinnerCard` and `ResultsTable`.
6. **Gate never tapped.** The gate is full-screen and opaque, so an untapped TV shows the gate and nothing else — deliberately, since a screen with no sound and no explanation is a worse failure than one asking to be started. The runtimes mount and run behind it regardless, so dismissing it at round 4 lands at round 4's true position rather than replaying from the top: every beat's position is derived from the server's `ends_at` ([ADR-0014](../../ADR/0014-beat-position-derived-from-ends-at.md)), not from how long the component has been mounted.

## 11. Testing

**Vitest**

- `lib/viewer.ts` — `'stage'` returns `null` even when a valid session exists in storage for that exact code; `'player'` returns the session's player id, and `null` when there is none.
- `lib/staging/options.ts` — the extracted table still maps index → glyph/accent identically (a characterization test, so the extraction cannot silently reorder anything).

**Playwright** — a new `e2e/stage.spec.ts`:

1. `/stage/CODE` loads for an existing room with no session in storage and renders **no** `JoinGate`.
2. The gate is present on load and dismisses on tap.
3. In lobby, the room code and join panel are visible, and joined players appear.
4. The host advances a phase and the stage view follows it — asserted on the shell's `data-beat`, matching how `staging.spec.ts` already asserts, never on copy.
5. The broadcast band contains no enabled interactive controls.
6. *(The load-bearing one)* With a session in storage for that room, the stage route still renders no YOU ring and no player-specific affordance — the regression guard for decision 1.

**Regression floor:** the existing suite passes unchanged, run with `--workers=2` (CURRENT.md: the default worker count flakes under load on this machine).

**Visual smoke:** playwright-cli screenshots in a *headed* browser at 1920×1080. Headless Chromium falls back to SwiftShader and pins the VFX budget at `minimal` before a test starts, so it cannot judge anything about the world.

Canvas internals stay untested, per roadmap §5.

## 12. Scope boundaries

Everything below is **P6b**, not P6a:

1. **Broadcast camera direction.** `director.ts`'s `BASE_BY_PHASE` is player-view direction and is reused verbatim.
2. **`MAX_STACK_RISE` at non-16:9 aspects.** CURRENT.md names P6 as the phase that would care; P6b is where it gets cared about.
3. **The podium's vertical clipping** once the results band retreats to 50vh.
4. **A stage-specific lower-third treatment.** `LowerThird` is reused as-is, at player scale.
5. **The ceremony re-framed for a room.**

And out of M2 P6 entirely:

6. **Any protocol change** — no lock counter, no spectator presence, no new payload field (decision 3).
7. **A portrait or mobile stage layout.**
8. **The `LobbyView` restyle** (§9), and the PRD's full join-link/QR share surface on the host-setup screen.
9. **A settings control on stage.** The profile resolves automatically from device signals; a chrome-free screen does not get a settings panel. A `?profile=` escape hatch was considered and rejected as speculative.

**Consequence to accept:** on a 21:9 TV, a deep tie stack can lose its top rigs off-canvas, and the winner's podium rig is clipped at the top of the retreated band. Both are visible, both are pre-existing, and both are P6b's opening work.

## 13. Exit criteria

1. `/stage/CODE` follows a full live game — lobby → countdown → rounds → track beats → ceremony → results — with no interaction after the opening tap, and no session in storage.
2. The same route opened on a device that has already joined that room renders identically: no YOU ring, no local-player framing exemption, no second-person anything.
3. Two stage views watch one room simultaneously, both following the same phases.
4. The stage client issues zero writes — verifiable in the network log across a full game.
5. Audio plays on stage after the gate is tapped, on the same cue-driven state machine as a player device.
6. The world is full-bleed at every phase on stage, and still a 28vh strip on the player route.
7. The existing Playwright suite passes at `--workers=2`; `npx tsc --noEmit`, `npm run lint`, and `npm test` are clean.
8. Both performance profiles work on stage, and `prefers-reduced-motion` is respected.

## 14. Expected ADRs

- **The viewer role is explicit, never inferred from a missing session** — the decision, the host-opens-the-TV-on-their-laptop case that motivates it, and why it lives in one pure function rather than four `if` statements.
- **The baked texture cache is per-`Application`** — likely an amendment to ADR-0011 rather than a new record, since that is where the cache's stalability was originally reasoned about.
- **The stage view is composed, not configured** — why a second set of components beat a `surface` prop on the player's, and what that costs (the shared `options.ts` table is the seam that pays for it).
