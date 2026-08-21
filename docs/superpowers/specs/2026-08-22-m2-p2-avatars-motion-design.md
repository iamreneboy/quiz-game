# M2 P2 — Avatars & Motion

| | |
|---|---|
| Status | Approved design — ready for implementation planning |
| Parent | `docs/superpowers/specs/2026-08-21-m2-the-show-roadmap.md` (P2), `docs/PRD.md` §5.2, §5.3, §6, §8–§9 |
| Date | 2026-08-22 |
| Baseline | P1 complete and merged (`ea6f8d2`): Pixi world, spatial zones, mood grade, cue-driven camera, portrait band, `TrackReadout`. `Markers.ts` renders placeholder pucks. |

## 1. Purpose

P2 puts contestants in the world P1 built. A procedural roster of twelve office characters, a movement grammar that turns a standings delta into a staged boost, overtake and streak VFX on the celebration hierarchy, top-three flair, and a lobby starting grid with real idling avatars.

Presentation-only. No schema, RPC, or realtime-protocol change (roadmap decision 4 not triggered).

## 2. Decisions

1. **Drama is buffered and played at the TRACK beat.** Cues arrive at the reveal transition (ADR-0003), but avatars hold their pre-reveal anchors until `phase-track`. The world deliberately lags the standings by one beat, which is what gives P1's TRACK camera cut something to cut to. PRD §5.3 puts the movement in the TRACK moment; collapsing it into REVEAL would play the round's biggest moment behind the reveal panel — and in portrait, inside a 28vh strip.
2. **A pure choreographer drives a stateless renderer.** `choreographer.ts` takes pending drama, anchors and `now` and returns one `AvatarFrameState[]` per frame; `Avatars.ts` applies it and owns no animation state. This is `director.ts`/`camera.ts`/`runtime.ts` again — the pattern P1 proved, and the roadmap's rule that the tested seam is cues-in → presentation-state-out.
3. **One shared rig; character identity is data.** Every avatar has the same container structure and the same motion. Per-character content is a `draw()` baked once into a `RenderTexture` plus a declarative idle quirk, in the shape of P1's `AmbientSpec` (ADR-0007).
4. **The accent color is a rim, not a body tint.** Bodies bake in their own natural colors; the player's color appears as rim light, shadow tint, boost trail, and label underline. Tinting the body would make a coffee cup and a rubber duck the same orange blob — character identity and player identity would fight, and character would lose.
5. **Per-avatar VFX is subdued by arbitration, never omitted; the arena reaction is exclusive.** Below-headline effects get an intensity multiplier. Exactly one arena reaction fires per TRACK beat, awarded to the beat's highest tier.
6. **The VFX budget adapts without touching `profile`.** The watchdog clamps particle output only. `useSettings().profile` stays static, `WorldScene` is never reconstructed, and ADR-0004 stands unamended.
7. **Persistent VFX derive from standings; transient VFX live only inside a sequence.** This is what makes a mid-game reload correct without special-casing.
8. **The lobby starting grid is canvas-first.** Avatars line up on the Pixi start line; `LobbyView` becomes a compact accessible roster strip rather than the visual centerpiece.

## 3. Module layout

```
lib/world/
  choreographer.ts      # pure: pending drama + anchors + now -> AvatarFrameState[]
  movement.ts           # pure: anticipate -> launch -> travel -> settle sampling
  flair.ts              # pure: standings -> medal / leader / edge-holder per player
  vfxBudget.ts          # pure: frame stats + profile -> granted VFX level
  geometry.ts           # + gridAnchors(players, metrics) — the lobby start line
  framing.ts            # startLine mode frames the grid formation, not a point
  content/
    roster.ts           # 12 AvatarSpec: silhouette draw(), idle quirk, mounts
  render/
    AvatarNode.ts       # one rig: shadow, flair glow, mounts, body, accent, label
    Avatars.ts          # replaces Markers.ts; applies AvatarFrameState[], stateless
    Vfx.ts              # one pooled emitter for the whole scene
  runtime.ts            # extended: buffers drama cues, drives the choreographer
components/
  LobbyView.tsx         # card grid -> compact accessible roster strip
```

`Markers.ts` is **deleted, not extended.** P1 wrote it as an explicit placeholder ("Nothing here should grow in that direction"); `Avatars` takes its z-order slot in `WorldScene` unchanged. No new dependencies.

### Seams

- **`choreographer.ts` touches nothing.** No Pixi, no store, no cue bus. Input `{ anchors, pending, now, budget, profile }`, output `AvatarFrameState[]`. Every rule this phase invents is testable here.
- **`runtime.ts` stays the only `cueBus` subscriber**, preserving ADR-0001. It adds `player-advanced`, `streak-tier`, `streak-broken`, and `player-joined` to `SUBSCRIBED`. `overtake` and `lead-changed` are already subscribed for camera emphasis in P1; that path is unchanged, and they now additionally feed the buffer. Buffered cues are *stored*, not acted on, until `phase-track`.
- **`Avatars.ts` is dumb by contract** — the same relationship `WorldScene` has to `WorldFrameState`.
- **The choreographer has no camera authority.** `director.ts` keeps it; P1's `overtake`/`lead-changed` → `emphasis` framing already exists and is not re-derived here.

### `AvatarFrameState`

```ts
interface AvatarFrameState {
  playerId: string;
  /** World units; already includes movement offset and idle quirk. */
  x: number;
  y: number;
  /** Squash and stretch; 1,1 at rest. */
  scaleX: number;
  scaleY: number;
  /** Flair scale multiplier — 1.12 for the leader, else 1. */
  emphasis: number;
  medal: 'gold' | 'silver' | 'bronze' | null;
  edgeHolder: boolean;
  vfx: VfxRequest[];
}

interface VfxRequest {
  kind: VfxKind;               // §5 catalogue
  mount: 'behind' | 'front' | 'crown';
  /** 0..1 after arbitration and budget clamping; 0 means do not emit. */
  intensity: number;
}
```

## 4. The choreographer

### The queue

Drama cues (`player-advanced`, `overtake`, `lead-changed`, `streak-tier`, `streak-broken`) arrive on the reveal transition per ADR-0003 and go into `pending`. While `pending` is non-empty, avatars hold their pre-reveal anchors. On `phase-track` the choreographer compiles `pending` into a **sequence** — a timeline computed once, then sampled per frame — and clears the queue.

Each cue has a distinct job in the compile: `player-advanced` supplies the movement's from/to, `overtake` schedules the lightning accent, `streak-tier`/`streak-broken` schedule ignition or extinction, and `lead-changed` contributes its tier to the headline and schedules the new leader's scale-up to `emphasis = 1.12` (the old leader's scale-down runs in the same window, so the two read as one exchange).

### The timeline

The server pins TRACK at 4s (`supabase/migrations/0002_rpcs.sql`), which is fixed budget, not a target. Per player, offset by a **60ms stagger ordered back-marker-first**, so a pass reads as the passer arriving *after* the passed:

| t (ms) | |
|---|---|
| 0 | anticipation crouch — `DURATION.cut` |
| 120 | launch and travel to the new segment, `EASE.settle` |
| 580 | settle, squash decay, streak ignition or extinguish |
| ~1400 | arena reaction, if this beat earned one |

`EASE.settle`'s `[0.34, 1.4, 0.5, 1]` overshoots past 1 by construction, so the overshoot in "boost → move → overshoot → settle" falls out of the P0 token rather than being hand-rolled.

Overtake lightning fires at the crossing instant, found by sampling the movement curve for where the passer's x crosses the passed player's.

Eight players finish by ~1.3s and the arena reaction clears by ~2.6s — roughly 1.4s of deliberate headroom, so a late cue or a stalled frame never truncates the sequence.

### Tier arbitration

Two rules, because one cannot do both jobs:

- **Per-avatar VFX is never omitted.** Below-headline effects render subdued: `isSubdued()` drives an intensity multiplier of **0.6**, not a skip. A streak-3 spark in an overtake beat is a quieter spark, not an absent one.
- **The arena reaction is exclusive** — one per beat, awarded to `resolveTier(pending)`. Streak-8's stadium response fires only when `streakMilestone` is the headline; if an overtake outranks it, the inferno still ignites on the avatar and the world simply doesn't react. This is what stops the in-world announcement (§6) from firing every beat.

### Persistent vs transient VFX

| | |
|---|---|
| **Persistent** (derived from standings state) | medal glow, leader scale, edge-holder turbo flame, active streak tier |
| **Transient** (alive only inside a sequence) | boost trail, overtake lightning, ignition burst, arena reaction |

`deriveCues` seeds a fresh client with the phase beat only and no drama (ADR-0003), so a mid-game reload has an empty queue: avatars appear at their correct final anchors with all persistent flair intact and nothing transient owed. Reload correctness falls out of this split rather than needing a special case.

### Interruption

`phase-read` (or any phase change) arriving mid-sequence **hard-completes** it: every avatar snaps to its final anchor, transient VFX clears, persistent flair stays. An empty queue at `phase-track` — nobody scored — plays no sequence; the camera still cuts, per P1's existing intent, to a world that is idling.

### Movement under `reduced`

No anticipation, no squash, no trail: the avatar snaps to its final anchor at sequence start. This matches P1's `Markers` behaviour and its §9 ladder entry ("marker motion: eased settle / instant snap").

## 5. Rig, roster, and flair

### The rig

`AvatarNode` has a fixed structure, back to front:

```
ground shadow -> flair glow -> rear VFX mount -> body sprite
              -> accent overlay -> front VFX mount -> label (+ YOU ring)
```

Uniform structure is what lets one movement grammar drive twelve characters. The shadow's alpha and width track the squash, which is what grounds the character during a boost.

### `AvatarSpec`

```ts
interface AvatarSpec {
  /** Matches lib/avatars.ts exactly — one roster, two renderers. */
  key: string;
  draw(g: Graphics, ctx: AvatarDrawContext): void;
  idle: { kind: 'bob' | 'sway' | 'pulse' | 'tilt'; periodMs: number; amount: number };
  /** Trail/flame/crown attachment points, in rig-local units. */
  mounts: { behind: Point; front: Point; crown: Point };
  /** Baked texture height in px; also sizes the shadow. */
  height: number;
}
```

A player's lobby emoji and their on-track character are the same creature because `key` is shared. Each spec bakes once into a `RenderTexture`, **lazily on first use** — a 3-player game bakes 3 textures, not 12. Idle quirks are suppressed while a movement sequence runs, and entirely under `reduced`.

### Flair

`flair.ts` needs exactly one gate: medals, leader scale, and the turbo flame all suppress until `standings.some(s => s.correct > 0)`. At the start line everyone is tied at zero, rank 0 is arbitrary, and awarding gold plus a turbo flame to whoever happens to sort first is noise that undercuts the flair when it becomes real.

Once active:

- gold / silver / bronze glow on standings ranks 0–2
- `emphasis = 1.12` on rank 0 (PRD §8, "the leader's avatar renders slightly larger")
- turbo flame on the row-0 edge-holder, **only where a segment is contested** — one player alone on a segment is not holding an edge over anyone

P1 already orders rows within a segment by speed points in `markerAnchors` (PRD §6); this consumes that ordering rather than recomputing it.

### VFX catalogue

| Kind | Trigger | Class |
|---|---|---|
| `trail` | boost travel | transient |
| `lightning` | overtake crossing | transient |
| `ignition` | streak tier reached | transient |
| `arena` | headline tier of the beat | transient |
| `spark` / `flame` / `inferno` | active streak 3 / 5 / 8 | persistent |
| `turbo` | contested edge-holder | persistent |
| `glow` | medal rank | persistent (sprite, not particles) |

## 6. The in-world arena reaction

PRD §6 puts an "arena announcement" at streak 8. P3 owns broadcast connective tissue and lower-third callouts, and roadmap constraint 2 draws the line at Pixi-owns-the-world / HTML-owns-the-readable. P2 therefore ships the **world-space half only**: the inferno on the avatar plus a scene reaction — a stadium light sweep and banner flash driven through P1's existing `Grade` escalation dial. No HTML callout ships in this phase; P3's callout system later adds a text layer over an effect that already exists, and P4 adds the audio.

## 7. The lobby starting grid

`gridAnchors(players, metrics)` places arrivals in a staggered two-row race formation inside the start-line run-off P1's `TRACK_MARGIN` already reserves, so eight players read as a grid rather than a queue. Join order determines position; the formation is stable as players arrive.

`player-joined` joins `SUBSCRIBED` and lands the new avatar with the **ready pulse** — a scale pop and an expanding ring, ~600ms, suppressed under `reduced` (PRD §5.2).

`framing.ts`'s `startLine` mode is extended to frame the formation's bounds rather than parking at a point. This is the only camera change in the phase.

`LobbyView` becomes a compact chip roster below the canvas — emoji, nickname, host/MC badge — preserving **`Starting grid — {n} joined` verbatim** and leaving the host's start button text untouched, since `game-flow.spec.ts` and `world.spec.ts` pin all three.

Portrait needs no work: P1's band is already full-height in lobby, countdown, and track — the three beats where this phase has something to show — and 28vh during the question, where it does not.

## 8. Performance

### The VFX budget

`vfxBudget.ts` is pure, evaluated at the 500ms cadence `runtime.ts` already publishes frame stats on, and resolves to one of three levels:

| | `full` | `lean` | `minimal` |
|---|---|---|---|
| Boost trail | full length | shortened | none |
| Turbo flame | particles | static sprite | static sprite |
| Streak tier | up to `inferno` | capped at `flame` | static glow only |
| Lightning / ignition | full | reduced count | none |
| Arena reaction | full | reduced | none |
| Medal glow / leader scale | always | always | always |

Rank is information, not decoration: the budget never sheds medal glow or leader scale.

**Hysteresis, deliberately asymmetric so it cannot oscillate** (the pattern `shouldRetarget` already establishes in `camera.ts`): downgrade one level when `FrameStats.dropped` exceeds 24 — 20% of `perf.ts`'s 120-frame window; upgrade one level only after four consecutive evaluations with `dropped === 0` (~2s). The `reduced` profile pins the level at `minimal` and never upgrades.

A single pooled emitter with a fixed particle ceiling is allocated once at init, so a budget change alters emission rates and never allocates.

### Degradation ladder

| | high | reduced |
|---|---|---|
| Movement grammar | anticipate → launch → travel → settle | instant snap |
| Squash and stretch | yes | none |
| Idle quirks | yes | none |
| Ready pulse | yes | none |
| VFX level | `full`, watchdog-adjustable | pinned `minimal` |
| Stagger | 60ms per player | none — simultaneous |

## 9. Testing

**Vitest units** (all pure modules):

- `movement` — curve phases, overshoot present under `high` and absent under `reduced`, hard-complete snapping, stagger offsets.
- `choreographer` — buffering on reveal, hold-until-track, sequence compile, both arbitration rules (subdued intensity vs exclusive arena reaction), empty queue, mid-sequence interruption, empty-queue reload.
- `flair` — the start-line gate, contested-segment rule for the edge-holder, medal assignment, leader emphasis.
- `vfxBudget` — downgrade on sustained drops, asymmetric upgrade, no oscillation across a noisy series, `reduced` pinned at `minimal`, glow never shed.
- `geometry` — `gridAnchors` formation for 2, 5, and 8 players.
- `roster` — all 12 keys match `lib/avatars.ts`; every spec has mounts, an idle quirk, and a height.

**Playwright e2e:**

- All existing tests stay green — the regression floor — including both `Starting grid — 2 joined` assertions.
- New: the lobby roster strip lists joined players as real text while the canvas is present.

**Visual smoke**: playwright-cli screenshots at the lobby grid, a boost sequence, each streak tier, and medal flair. Not committed as snapshot tests.

Canvas internals are not unit-tested, per the roadmap's testing rule.

## 10. Edge cases

| Case | Behaviour |
|---|---|
| Nobody answers correctly | Empty queue at `phase-track`; no sequence, camera still cuts, avatars idle. |
| Game start, everyone tied at 0 | No medals, no leader scale, no turbo flame — the single `flairActive` gate (§5). |
| Mid-game reload | Empty queue; avatars at final anchors with persistent flair, nothing transient owed (§4). |
| Phase change mid-sequence | Hard-complete: snap to final anchors, clear transient VFX, keep persistent flair. |
| `total_rounds = 1` | One segment; the sequence plays normally into the finish line. |
| Player leaves mid-game | Their node is removed on the next anchor sync, as `Markers` already does. |
| Lone player on a segment | No turbo flame — the edge is uncontested. |
| Eight players, all streaking | Particle ceiling holds; the budget sheds to `lean`/`minimal` under sustained pressure. |
| WebGL init failure | P0's existing handling; `TrackReadout` still carries standings as text. |

## 11. Exit criteria

1. A full game plays with movement, overtakes, streaks, and flair rendered from semantic events only — no coordinates or renderer concepts on the wire.
2. The celebration hierarchy is respected: below-headline effects are subdued, and exactly one arena reaction fires per beat.
3. Both performance profiles work, per the §8 ladder.
4. The lobby starting grid shows idling avatars with the ready pulse, and the roster strip remains readable HTML.
5. The VFX budget demonstrably sheds under sustained frame pressure and recovers, without `profile` changing.
6. The full Playwright e2e suite passes.

## 12. Out of scope

Round staging, answer-button restyling, and HTML lower-third callouts (P3) · all audio, including engine SFX and the arena announcement's audio half (P4) · podium ceremony, confetti, and the results restyle (P5) · stage view (P6) · photo finish, awards, sudden death, rematch (M3) · automatic `profile` downgrade — ADR-0004 stands unamended · any schema, RPC, or realtime-protocol change.

## 13. Expected ADRs

Implementation is expected to record:

1. **Drama buffered to the TRACK beat** (decision 1) — it changes what ADR-0003's timing means for every downstream consumer, and P3 must not re-collapse it.
2. **Exclusive arena reaction vs subdued per-avatar VFX** (decision 5) — the two-rule arbitration is non-obvious and P4's audio must mirror it.
3. **Accent as rim, never body tint** (decision 4) — a constraint on every future avatar or world-content bundle.
4. **VFX budget adapts without touching `profile`** (decision 6) — it extends ADR-0004 rather than superseding it, and that distinction needs recording.
5. **Persistent vs transient VFX split** (decision 7) — reload correctness depends on it, and it is easy to break by adding a state-derived effect to the transient set.
