# M2 P5a — Podium ceremony

| | |
|---|---|
| Status | Approved design — ready for implementation planning |
| Parent | `docs/superpowers/specs/2026-08-21-m2-the-show-roadmap.md` (P5), `docs/PRD.md` §8–§9 |
| Date | 2026-08-23 |
| Baseline | P4 complete (`5c4604f`): cue vocabulary, celebration hierarchy, performance profiles, world runtime with camera/choreographer/VFX budget, staging runtime, audio runtime. The results screen is an unstyled HTML table with no canvas behind it — `PixiStage` unmounts at `room.status === 'finished'` (`app/room/[code]/page.tsx:68`). |
| Sibling | **P5b — Results board** (`2026-08-23-m2-p5b-results-board-design.md`). P5a is the canvas half and lands first; P5b is the DOM half and consumes P5a's band and the two standings fields migration 0004 adds. |

## 1. Purpose

The game currently ends the way a quiz website ends: the screen swaps to a table. P5a makes it end the way a game show ends — the camera cuts to the finish line, three blocks rise low-to-high, a spotlight finds the winner, and the room fills with confetti.

The roadmap splits P5 because the whole phase counts out to nine tasks against its own "4–8, else split" rule (roadmap §1). The seam is the one P3 already used: **P5a is entirely canvas, P5b is entirely DOM**, and they share exactly one thing — a band height published as a CSS custom property.

## 2. Decisions

1. **The podium is a fourth anchor layout, not a new scene.** `lib/world/runtime.ts:81`'s `fieldAnchors()` already dispatches on phase between `gridAnchors`, `startLineAnchors` and `markerAnchors`. Results adds one more branch. Every existing pipeline — rigs, flair, medals, the YOU ring, the movement grammar, the off-screen readout — keeps working untouched.
2. **The results phase gets an `ends_at`.** Migration 0004 sets `now() + interval '9 seconds'` on the results branch of `advance_phase`. The ceremony then derives beat position exactly like every P3 beat ([ADR-0014](../../ADR/0014-beat-position-derived-from-ends-at.md)) — no new timing machinery, no storage, and correct reload behaviour for free.
3. **The wire opens a second time, for `answered` and `avg_answer_ms`.** The roadmap's results table asks for accuracy and average answer time; neither is on the wire, and both are already in the `answers` table (`0001_schema.sql:47`). Weighed against [ADR-0018](../../ADR/0018-the-wire-opens-once-for-picks-and-current-streak.md) rather than treated as a fresh exception. Both server changes ride **one** migration, because ADR-0018's argument was about not making a database take two deploys for one phase's needs.
4. **Confetti gets its own pool.** Not the shared `Vfx` emitter — medal glows go through that pool (`choreographer.ts:304`), and confetti at ceremony density would evict them.
5. **The spotlight is a world prop, not a grade change.** `GradeState.hue` stays `'neutral' | 'neon'`; a full-screen wash is the wrong shape for a cone on one character.
6. **The ceremony is structured as staged beats** so M3's photo-finish, awards, sudden death and rematch slot in as additional steps rather than a restructuring (roadmap P5 scope). None of those are built here.

## 3. The server changes

`supabase/migrations/0004_ceremony.sql` — additive, two functions replaced, no schema change, no data migration.

### 3.1 A deadline for the terminal phase

```sql
v_ends := case v_phase
  when 'read'    then now() + interval '3 seconds'
  when 'answer'  then now() + make_interval(secs => v_room.timer_seconds)
  when 'reveal'  then now() + interval '5 seconds'
  when 'track'   then now() + interval '4 seconds'
  when 'results' then now() + interval '9 seconds'   -- NEW
  else null
end;
```

**This is inert for game state.** `useHostDriver` guards the results phase twice — `room.status !== 'playing'` and `room.phase === 'results'` (`lib/useHostDriver.ts:35`) — and `advance_phase` itself raises `game finished` when `status = 'finished'` (`0002_rpcs.sql:270`). Nothing schedules, nothing advances. The field means "when the ceremony has finished playing", not "when the next phase begins", and results is the only phase where those differ because there is no next phase.

This is a roadmap decision-4 exception and gets an ADR.

### 3.2 Two standings fields

```sql
'answered', count(a.*),
'avg_answer_ms', case when count(a.*) = 0 then null else round(avg(
    (select timer_seconds from rooms where id = p_room_id) * 1000
    - a.time_remaining_ms
  )) end
```

`answered` counts submitted answers, correct or not. `avg_answer_ms` is the mean elapsed time from question open to submission, derived from the room's `timer_seconds` and the stored `time_remaining_ms`. Both are `null`-safe for a player who never submitted.

The room's timer arrives as a **scalar subquery, not a join**. `standings()` groups by `p.id` (`0003_reveal_picks.sql`), and adding `rooms` to the `from` list would put a new column into that grouping's scope — a change to the query's shape, where the whole point of this migration is that the shape is untouched and only the projection grows.

**The sort must stay byte-identical.** ADR-0018 already flagged `standings()`' ordering as the Fairness Law: `correct desc → speed_points desc → longest_streak desc → player_id asc`. Adding fields must not touch it.

```ts
// lib/types.ts
export interface Standing {
  player_id: string; nickname: string; avatar: string; color: string;
  correct: number; speed_points: number; longest_streak: number; current_streak: number;
  answered?: number;          // absent against a pre-0004 database
  avg_answer_ms?: number | null;
}
```

Optional on purpose — the ADR-0018 fallback shape. P5b renders `—` for both columns when they are absent, and P5a does not read them at all.

## 4. Module layout

```
lib/ceremony/
  beats.ts         # PURE, tested: elapsed → CeremonySteps
  useCeremony.ts   # 4-boolean zustand store with an equality guard
  runtime.ts       # rAF ticker; publishes steps for DOM consumers

lib/world/
  podium.ts        # PURE, tested: standings + steps → MarkerAnchor[] + block heights
  render/Podium.ts # Pixi: three blocks + spotlight pool, under the rigs
  render/Confetti.ts # Pixi: own pool, own physics, lazily allocated
  vfxBudget.ts     # + confetti: number in VfxAllowance
  framing.ts       # + 'podium' FramingMode
  director.ts      # phase-results → podium base intent
  runtime.ts       # fieldAnchors() gains the results branch
  render/WorldScene.ts # mounts Podium + Confetti

components/PixiStage.tsx        # mounts through results; publishes --ceremony-band
components/ResultsView.tsx      # band spacer only — contents are P5b's
app/room/[code]/page.tsx        # PixiStage mount condition; startCeremonyRuntime
supabase/migrations/0004_ceremony.sql
lib/types.ts
```

### Seams

- `beats.ts` and `podium.ts` import nothing but types and geometry constants. No Pixi, no React, no store, no DOM. These are the tested seam.
- `Podium.ts` and `Confetti.ts` consume `WorldFrameState` and decide nothing, exactly as `Avatars` and `Vfx` do.
- `lib/world/runtime.ts` is the only module wired to both the cue bus and the store, unchanged in character.

## 5. Ceremony beats

A near-copy of `lib/staging/beats.ts`, inheriting ADR-0014 whole.

```ts
/** Mirrors migration 0004's interval, hand-maintained exactly as NOMINAL_MS is. */
export const CEREMONY_MS = 9000;

export const ARRIVE_AT    = 0;     // camera cuts to the finish line; field holds
export const BRONZE_AT    = 1200;
export const SILVER_AT    = 2100;
export const GOLD_AT      = 3000;
export const SPOTLIGHT_AT = 3800;  // winner pool + crown flare
export const CONFETTI_AT  = 4100;  // burst, then a settling drift
export const BOARD_AT     = 6000;  // band retreats; P5b's table rises

export interface CeremonySteps {
  risen: 0 | 1 | 2 | 3;   // blocks landed, counted from bronze
  spotlight: boolean;
  confetti: boolean;
  board: boolean;
}

export function ceremonyStepsAt(elapsedMs: number): CeremonySteps;
```

Rising **bronze → silver → gold** withholds the winner longest, which is the entire point of a podium reveal.

`CEREMONY_MS` mirrors a server value that is not importable from the client — the same hand-maintained arrangement `NOMINAL_MS` already documents (`lib/staging/beats.ts:26`), with the same graceful failure mode: a moved server duration compresses or completes the sequence early, and can never block or lock the surface.

**Reload behaviour is free.** `elapsedIn(CEREMONY_MS, msUntil(room.ends_at))` lands mid-rise at 2s and fully settled at 30s. No storage, no flag, no replay — and it resolves a mismatch [ADR-0024](../../ADR/0024-the-first-cue-batch-is-catch-up.md) would otherwise create, since P4 already suppresses the `fanfare` sting on a seeded batch. Visuals and audio are both already-finished, rather than the picture replaying in silence.

## 6. Podium layout

```ts
// lib/world/podium.ts — pure
/** Past the finish line, inside the run-off TRACK_MARGIN already reserves. */
export function podiumX(metrics: TrackMetrics): number {
  return segmentToWorldX(metrics.segments) + TRACK_MARGIN * 0.45;
}

export const BLOCK_HEIGHTS = {
  1: AVATAR_HEIGHT * 0.85,
  2: AVATAR_HEIGHT * 0.55,
  3: AVATAR_HEIGHT * 0.30,
};
/** Left-to-right: 2nd, 1st, 3rd — the real-world arrangement. */
export const BLOCK_ORDER = [2, 1, 3] as const;

export function podiumAnchors(
  standings: readonly AnchorStanding[],
  metrics: TrackMetrics,
  steps: CeremonySteps,
): MarkerAnchor[];
```

The top three take podium `x` positions and `y = -blockHeight`, **but only once their block has risen**. Before that they sit at ground level, so the existing movement grammar animates the lift with no new choreography code — a block landing is just a new anchor, and `avatarStates` already interpolates toward anchors.

Everyone outside the top three keeps their `markerAnchors` finish-line position: behind the podium and out of frame.

**Ties need no new rule.** `standings` is already totally ordered by the Fairness Law, so `slice(0, 3)` is deterministic and matches the medals `flairFor` assigns. Fewer than three players drops blocks off the top: two players get gold and silver, one gets gold alone.

`podium.ts` takes the structural `AnchorStanding` subset (`geometry.ts:94`) rather than `Standing`, keeping it decoupled the way `markerAnchors` already is.

## 7. Camera and grade

`framing.ts` gains `'podium'`: `fit()` over the podium anchors at `EMPHASIS_PADDING`, reusing the existing machinery entirely. `director.ts` maps `phase-results` to it, replacing today's `establishing` shot (`director.ts:52`), with `style: 'cut'` — a cut to the podium is the broadcast move; a drift is a screensaver.

**Escalation is held, not reset.** `reduceCue` has no `phase-results` branch today, so its `default` returns state unchanged and `director.escalation` is still `1` from the final question when the ceremony begins — the world is already dimmed to neon at peak, which is exactly the grade a spotlight wants. P5a's new `phase-results` branch therefore sets the podium base intent and **leaves `escalation` at its current value**, rather than doing what `phase-read` does and zeroing it (`director.ts:76`). This is a deliberate non-reset and must be commented as one, or the next reader will "fix" it.

Note that `useStaging.escalated` — the DOM's flag — does clear at results (`CURRENT.md`); the two are separate values with separate lifetimes and P5a changes neither of those facts.

`GradeState` itself is unchanged.

The spotlight is a radial pool drawn inside `Podium.ts`, anchored on the winner's world position and gated on `steps.spotlight`.

## 8. Confetti

`render/Confetti.ts`: its own pool, its own physics, **allocated lazily on the results phase** so the lobby and rounds pay nothing.

Why not the shared `Vfx` emitter: that pool is 240 slots allocated once at construction (`Vfx.ts:14`) and medal glows are pushed through it as `kind: 'glow'` (`choreographer.ts:304`) — confetti at ceremony density would evict exactly the crowns the podium exists to show. The physics disagree too: `Vfx` is avatar-mounted, screen-space, upward, sub-second and circular; confetti is viewport-wide, gravity-driven, multi-second, and rotating rectangles.

Governed by the same budget ladder through a new `VfxAllowance.confetti`:

| level | `confetti` | behaviour |
|---|---|---|
| `full` | `1` | ~180 pieces, rotation + flutter |
| `lean` | `0.5` | ~90 pieces, no rotation |
| `minimal` | `0` | no particles — one gold wash fading over 800 ms, opacity only |

`stepBudget` returns `minimal` unconditionally on the `reduced` profile (`vfxBudget.ts:69`), so reduced-motion gets a celebration that does not move. Degrading to *nothing* is the easy reading of "confetti degrades", but it deletes the moment; an opacity-only fade honours the preference and keeps it.

Confetti tints come from the top three players' accent colours plus `COLOR.gold`, which makes the burst specific to who won rather than generic.

## 9. The band handoff

One CSS custom property, `--ceremony-band`, applying [ADR-0015](../../ADR/0015-continuous-values-to-css-custom-properties.md).

`PixiStage` publishes it and sizes itself from it; P5b's results column reads the same property for its top spacer. The two physically cannot disagree, so the table can never overlap the podium.

**This applies at the results phase only.** The existing `strip` (28vh) and `full` (100vh) bands keep their current class-based sizing (`PixiStage.tsx:132`) — a custom property buys nothing where the value is one of two constants. Results is the only band that moves *within* a phase, which is what makes it worth a property.

- Before `steps.board`: `100vh`. The canvas is full-bleed; the results column's content sits below the fold.
- After `steps.board`: `50vh`, over `--dur-settle`. The canvas retreats and the table rises into the space — the "rise" is layout, not an animation anyone has to keep in sync.

`PixiStage`'s existing `data-band` attribute gains a `podium` value alongside `strip` and `full`, keeping one vocabulary for canvas sizing.

`app/room/[code]/page.tsx:68` changes from `room.status !== 'finished'` to mounting whenever there is a room, so the renderer survives into results. **The teardown path is unchanged** — the effect's cleanup still runs on unmount, profile change and room exit.

## 10. Runtime wiring

`lib/ceremony/runtime.ts` mounts from the room page beside the existing three runtimes and returns a teardown. It runs a rAF tick that reads `room.phase` and `room.ends_at` from the store, computes `ceremonyStepsAt`, and publishes to `useCeremony` behind a `sameSteps` equality guard — without it every consumer re-renders at 60 fps, the same guard `useStaging.publish` exists for (`lib/staging/useStaging.ts:35`).

**The world runtime does not read that store.** It calls `ceremonyStepsAt()` directly from `room.ends_at` inside its own `tick()`. Same pure function, so the two surfaces cannot disagree by more than a frame, and the renderer keeps its standing rule of never depending on React state.

`'phase-results'` joins `SUBSCRIBED` in `lib/world/runtime.ts:57` for the camera cut. No other cue subscription is needed: the podium's membership comes from `standings`, which `fieldAnchors` already reads every tick. The existing `podium` cue stays exactly as it is — P4 fires `fanfare` on it, and P5a adds no consumer to it and no member to the vocabulary. **The cue vocabulary is unchanged by this phase** (ADR-0001).

## 11. Edge cases

- **Pre-0004 database.** `msUntil(null)` returns `0` (`serverTime.ts:10`), so `elapsedIn(9000, 0)` is `9000` — a fully settled podium with no animation. No crash, no blank screen. This is the fallback shape ADR-0018 asks every protocol opening to leave behind.
- **Fewer than three players.** Blocks drop off the top; `podiumAnchors` handles 1–3.
- **Non-playing host.** Absent from `standings` (`0002_rpcs.sql:50`, `where p.is_playing`), so no rig — as today.
- **A 20-player field (PRD §13).** Seventeen rigs sit behind the frame. `offscreenPlayerIds` flags them harmlessly: `TrackReadout` only renders during the track beat (`GameView.tsx:108`), so nothing displays the list at results.
- **Tab backgrounded through the ceremony.** rAF stops; on return the next tick reads the true `ends_at` and lands settled. No catch-up animation is owed.
- **Reload during the ceremony.** Lands at the true elapsed position. Covered by decision 2 and §5.
- **No WebGL.** `PixiStage` already logs and continues (`PixiStage.tsx:106`); the results screen degrades to P5b's HTML board with no ceremony, which is exactly the M1 experience.

## 12. Testing

**Vitest — `tests/ceremonyBeats.test.ts`**
1. Each step boundary, from `ARRIVE_AT` through `BOARD_AT`.
2. Settled at exactly `CEREMONY_MS` and at 10× it.
3. `elapsedIn(CEREMONY_MS, msUntil(null))` yields the fully settled steps.

**Vitest — `tests/podium.test.ts`**
4. Three-player, two-player and one-player fields place the right blocks.
5. Block heights and left-to-right order (2nd, 1st, 3rd).
6. Before a block has risen, its player sits at ground `y`.
7. Non-top-3 players hold their `markerAnchors` finish positions.
8. An eight-player field: exactly three anchors move to the podium.

**Vitest — extend `tests/vfxBudget.test.ts`**: `confetti` steps `1 → 0.5 → 0` down the ladder and is `0` on the `reduced` profile.

**Playwright**: the existing suite is the regression floor and must pass at `--workers=2` (`CURRENT.md`). P5a adds no interaction, so it adds no e2e beyond confirming the results route still renders with the canvas mounted.

**Manual**: a headed pass over a full game's ending. Per `CURRENT.md`, headless Chromium falls back to SwiftShader and pins the VFX budget at `minimal` before a test starts, so it cannot measure the confetti's frame cost — the budget ladder must be verified headed, with a synthetic main-thread block, exactly as P2's exit criterion 5 was.

## 13. Scope boundaries

Out of scope, deliberately:

- **Everything DOM.** The winner card, the restyled table, the new stat columns and their accessibility path are P5b. P5a only wraps today's `ResultsView` in the band spacer so the phase ships a coherent screen.
- **M3 ceremony features**: photo-finish sequence, awards, sudden death, rematch. The beat structure exists so they slot in; none are built (roadmap §3, PRD §12).
- **Any change to the cue vocabulary.** The `podium` cue is consumed by P4 and is sufficient.
- **A ceremony-specific audio design.** P4 already fires `fanfare` on `podium` and switches to the `ceremony` bed on `phase-results`.
- **`COUNTDOWN` choreography**, still the standing intentionally-skipped item from P2.
- **The P2 tech debt in `CURRENT.md`** — tie stacking, `TRACK_MARGIN`, `MAX_STACK_RISE`, the readout's direction marker. None are made worse here and none are fixed here.
- **Namespacing the baked-avatar texture cache per `Application`.** Still flagged for P6 in `CURRENT.md`; P5a mounts no second renderer.

## 14. Exit criteria

1. A finished game cuts to the finish line and plays a podium ceremony: blocks rise bronze → silver → gold, the winner takes a spotlight, confetti fires.
2. Reloading during the ceremony lands at the true elapsed position; reloading after it lands on a settled podium with no replay and no silent re-animation.
3. Confetti degrades down the budget ladder and becomes an opacity-only wash on the `reduced` profile, verified headed.
4. Fewer than three players produces a correct podium; a 20-player field frames the top three without dropping them.
5. Against a pre-0004 database the results screen renders a settled podium rather than failing.
6. `standings()`' sort is byte-identical to its 0003 definition.
7. `npm test` passes; `npm run test:e2e -- --workers=2` passes.

## 15. Expected ADRs

- **The podium is a fourth anchor layout** — why the ceremony reuses the avatar pipeline rather than adding a scene, and what that constrains for M3's ceremony features.
- **The results phase gets a deadline** — why `ends_at` at a terminal phase, why it is inert for game state, and the pre-migration fallback it leaves.
- **The wire's second opening: `answered` and `avg_answer_ms`** — weighed against ADR-0018 rather than argued fresh, including why both server changes ride one migration and why the client fields are optional.
- **Confetti gets its own pool** — why the shared `Vfx` emitter is the wrong home, with the medal-glow eviction as the concrete reason.
