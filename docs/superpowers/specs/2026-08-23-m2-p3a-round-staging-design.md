# M2 P3a — Round Staging: the question surface

| | |
|---|---|
| Status | Approved design — ready for implementation planning |
| Parent | `docs/superpowers/specs/2026-08-21-m2-the-show-roadmap.md` (P3), `docs/PRD.md` §5.3, §8–§9 |
| Date | 2026-08-23 |
| Baseline | P2 complete and merged (`f2f0275`): Pixi world, avatars, movement grammar, streak/overtake VFX, flair, lobby grid. `GameView` still renders the M1 placeholder question surface. |

## 1. Purpose

The roadmap's P3 came to roughly eight implementation tasks — the stated split threshold — so it is delivered as two phases. **P3a is the question surface**: the staging spine every beat runs on, the answer-button restyle, and the READ and ANSWER beats. **P3b is the outcome half** — REVEAL staging, TRACK direction, final-question escalation, and broadcast callouts — spec'd after P3a merges.

The split point is chosen so that P3a ships something the player sees on its own (the half of a round they interact with) and so that the protocol question P3b carries never blocks P3a.

Presentation-only. No schema, RPC, or realtime-protocol change; roadmap decision 4 is not triggered by this phase. It **will** be triggered by P3b — see §9.

## 2. Decisions

1. **The server phase is the only interaction authority; staging never gates input.** A phase change cuts any running beat animation to its end state, and the answer buttons become live the instant ANSWER begins regardless of what is mid-flight. Holding input even briefly would burn time off a server-authoritative timer that pays speed points, and it would put the beat layer in the correctness path.
2. **Beat position is derived from `ends_at`, never from local arrival.** `elapsed = NOMINAL[phase] − msUntil(endsAt)`, clamped at 0. A late joiner or a reload computes a large elapsed and lands with everything already present, so "jump to the end state rather than replay" needs no flag and no special case. Clock skew is handled for free, because `msUntil` already applies `serverTime`'s offset.
3. **Continuous values never pass through React.** The rAF ticker writes the tension ramp to a `--tension` CSS custom property; only quantized state (a 0–3 step) enters the Zustand store. `useStaging` changes on the order of ten times per beat, not sixty times per second.
4. **Pressure lives in the margins.** ANSWER escalates through the countdown ring and a vignette closing in from the screen edge. The question and the four options are never dimmed, scaled, desaturated or moved — the roadmap's readability-first rule applies hardest at exactly the moment tension peaks.
5. **Answer selection is expressed by form, not by hue.** The chosen button is bright, ringed in its own accent and inverted while the other three fade to 45%. A dedicated selection color would collide with option 1's cyan and make player identity fight option identity.
6. **Answer accents are fixed by index.** ▲ ◆ ● ■ map to cyan / magenta / lime / amber for every question in every round. Shape carries the identity, so nothing depends on color alone.
7. **One clock.** `TimerRing` gives up its own rAF loop to the staging ticker. Two independent clocks on the same beat is how the ring and the frame drift apart.

## 3. Module layout

```
lib/staging/
  beats.ts        # pure: (phase, round, endsAt, now) -> BeatPosition + StageSteps
  tension.ts      # pure: (remaining, total) -> 0..1 ramp + quantized step
  staging.ts      # pure reducer: cue-carried state (locked; P3b's escalation)
  answerLock.ts   # pure-ish: sessionStorage persistence of the local lock
  useStaging.ts   # Zustand store — DISCRETE state only
  runtime.ts      # the bridge: cueBus subscription + one rAF ticker
components/
  StageShell.tsx     # persistent regions; replaces GameView's branching returns
  TensionFrame.tsx   # vignette overlay; reads --tension, never re-renders
  AnswerButtons.tsx  # restyled: accent edge, shapes, keyboard, lock states
  QuestionCard.tsx   # restyled: slam-in badges, question rise
  TimerRing.tsx      # restyled: escalating ring, driven by the staging ticker
  GameView.tsx       # thinned to routing + submit
```

No new dependencies: `motion`, Zustand and the P0 cue bus are already in the tree.

### Seams

- **`beats.ts` and `tension.ts` touch nothing.** No React, no store, no cue bus, no DOM. Every timing rule this phase invents is testable there.
- **`lib/staging/runtime.ts` is the only new `cueBus` subscriber**, sitting alongside `lib/world/runtime.ts` and preserving the one-subscriber-per-domain shape of [ADR-0001](../../ADR/0001-presentation-cue-layer.md). It subscribes to `answer-locked` only; P3b adds `final-question`, `phase-reveal` and `phase-track`.
- **`StageShell` is dumb by contract.** It reads `useStaging` and renders; it computes no timing of its own.
- **`TensionFrame` is outside React's render path by design.** Mounted once, it never re-renders — the ticker mutates its `--tension` custom property directly.

### `StagingState`

```ts
export type Beat = 'idle' | 'countdown' | 'read' | 'answer' | 'reveal' | 'track' | 'results';

/** Which staged elements are on screen. Derived purely from beat + elapsed. */
export interface StageSteps {
  badges: boolean;
  question: boolean;
  options: boolean;
  /** Options are visible but not yet live (READ), vs. live (ANSWER). */
  optionsLive: boolean;
}

export interface StagingState {
  beat: Beat;
  round: number;
  steps: StageSteps;
  /** 0-3. The ring's color crossfade and last-seconds pulse; NOT the ramp. */
  tensionStep: 0 | 1 | 2 | 3;
  /** The local player's committed choice, or null. */
  lockedChoice: number | null;
  /** True when this client cannot answer at all (spectator / non-playing MC). */
  spectating: boolean;
}
```

## 4. The beat model

### Nominal durations

`NOMINAL` is a client-side mirror of the server's fixed phase durations — countdown 3s, read 3s, reveal 5s, track 4s — with a comment pointing at `supabase/migrations/0002_rpcs.sql:288-291`. ANSWER reads `room.timer_seconds`, which is on the wire.

Hand-mirrored, exactly as `lib/presentation/tokens.ts` mirrors `app/globals.css`. Unlike the tokens there is no drift test, because the server values are not importable from the client; the mitigation is that the failure mode is graceful. If a server duration changed, the stagger would compress or complete early — it would never break, block, or lock the surface.

### READ stagger

Expressed in P0 token durations (`DURATION.settle` = 460ms, `beat` = 260ms, `cut` = 120ms):

| Element | Enters at | Settled by |
|---|---|---|
| Category + tier badges | 0ms | 460ms |
| Question | 460ms | 920ms |
| Options (70ms per-item stagger) | 1000ms | ~1470ms |

The question is fully legible at ~920ms of the 3000ms beat: **2.1s of reading time**. Options are rendered from 1000ms at 55% opacity and `disabled` — visible on purpose, because reading the options is part of reading the question, and hiding them would make the READ beat cost more than it buys.

### The tension ramp

```
window  = min(totalMs, 8000)
tension = clamp01(1 − remainingMs / window)
```

A 30s timer stays calm until T‑8s; a 5s timer is under pressure throughout. Quantization for React: step 0 at `tension === 0`, step 1 below 0.5, step 2 below 0.85, step 3 at or above it. The ring crossfades `--color-warning` → `--color-wrong` at step 2 and pulses per second at step 3.

Once the local player locks, the ticker **stops writing `--tension`** — the vignette freezes at its current intensity while the ring keeps counting. You are out of the decision; the room is not, and the round is not over.

## 5. Beat treatments

**COUNTDOWN** gets a design-system restyle only — it is currently a bare `9xl` amber numeral outside any shell and would read as broken beside the rest. No choreography; countdown is not in the roadmap's P3 scope.

**READ.** Category and tier chips slam in from opposite horizontal edges and lock with `EASE.settle`'s overshoot. The question rises 16px and fades in under them on `EASE.snap`. Options stagger in dimmed and disabled.

**ANSWER.** A 120ms `cut` takes the options to full opacity with brightened borders — *these are live now*. The ring takes its header position and `TensionFrame` begins its ramp.

**On lock** (`answer-locked`): the chosen button takes a 2px ring in its own accent plus outer glow, its glyph chip inverts to solid accent-on-void, the other three drop to 45% and become `disabled`, and a polite live region announces `Locked in: {option}`.

**REVEAL and TRACK are untouched.** `RevealPanel` renders into the shell's outcome slot exactly as it does today; `TrackReadout` keeps its own full-screen branch. Both are P3b's.

Under `reduced`: identical timings, cross-fades in place of translation and overshoot, and `TensionFrame` snapping between three discrete levels instead of ramping — `[data-profile='reduced']` already suppresses transitions globally, so a continuous ramp there would be per-frame work with no visible result.

## 6. Answer buttons

Glass body (`bg-night/62`, hairline white border), a 4px left edge in the option's accent, and a tinted chip carrying the shape glyph. Minimum 56px target, one column in portrait, two from 640px up.

Keyboard: native Tab / Enter / Space, plus window-level **1–4** shortcuts live only during ANSWER while unlocked and ignored when a modifier is held. The number chips render only under `(hover: hover) and (pointer: fine)`, so the shortcut is discoverable on desktop without cluttering a phone.

Accessibility: glyphs are `aria-hidden` and the accessible name is the option text alone. Accents carry no text, so they answer to the 3:1 non-text contrast bar while option text stays on glass at ≥4.5:1. The lock is announced through a polite live region rather than by the button's visual state alone.

## 7. Layout

`StageShell` replaces `GameView`'s branching returns with persistent regions — header (round counter, badges, ring), question, options, outcome slot, live region — each wrapped in `AnimatePresence` so beat changes are transitions rather than unmount/mount swaps.

In portrait the Pixi strip holds the top 28vh (`components/PixiStage.tsx:10`) and the shell becomes a real grid over the remaining 72vh: question centred in its own band, options pinned toward the thumb zone. This retires the `portrait:pt-[30vh]` padding hack in `GameView`.

`countdown` and `track` stay outside the shell as full-screen branches in P3a. P3b folds them in; doing it here would mean restructuring two beats this phase does not otherwise touch.

## 8. Two defects fixed inside this phase

Both sit squarely in the locked state P3a owns, and neither is worth deferring given the surrounding rewrite.

1. **A locked answer does not survive a reload.** `myAnswer` lives only in memory (`lib/store.ts:19`) and `submit_answer` raises `already answered` on the duplicate insert (`supabase/migrations/0002_rpcs.sql:344`), so a reload mid-ANSWER re-enables the buttons and the next tap surfaces that raw Postgres string as the error text. Fix: persist `myAnswer` to `sessionStorage` under `cb:{code}:{round}`, restore on hydrate, clear on the `read` transition. Storage access is guarded exactly as `lib/presentation/profile.ts` guards its own — private mode degrades, it never throws.
2. **A non-playing host (the MC) gets clickable answer buttons** that fail with `spectators cannot answer`. Fix: `!is_playing` becomes one more term in the disabled condition this phase is already rewriting, surfaced as the `spectating` field on `StagingState`.

## 9. Out of scope → P3b

REVEAL staging and the avatar-stacked distribution bar, TRACK moment direction, final-question escalation, lower-third callouts, and the restyles of `RevealPanel` and `TrackReadout`.

**P3b triggers roadmap decision 4.** The avatar-stacked distribution bar needs per-player choices, and `build_reveal` returns `counts: number[]` only (`supabase/migrations/0002_rpcs.sql:61`) — there is no way to know who picked what on the current wire. P3b's spec must either drop the avatar stacking or make the payload addition an explicit, argued decision. If it opens the protocol, the `current_streak` addition to `Standing` recorded in `docs/progress/CURRENT.md` should ride along in the same change rather than waiting for a third opening.

## 10. Testing

Pure units carry the coverage, per roadmap §5 — the tested seam is cues-and-time in, presentation-state out.

- `tests/beats.test.ts` — step visibility at every boundary (0 / 459 / 460 / 999 / 1000 / 1470), late-join elapsed, `endsAt` null, negative remaining clamped, beat identity across a round rollover.
- `tests/tension.test.ts` — window selection above and below the 8s cap, clamping at both ends, quantization boundaries, `totalMs === 0`.
- `tests/staging.test.ts` — the reducer over recorded cue sequences: lock, freeze, clear on `phase-read`, spectator.
- `tests/answerLock.test.ts` — sessionStorage round-trip, cleared on `read`, never throwing when storage is unavailable.

e2e: the existing six specs in `e2e/` are the regression floor. New coverage only where interaction changed — pressing `2` during ANSWER locks option 2, the other three go disabled, and a reload mid-ANSWER keeps the lock.

Visual smoke via playwright-cli at READ+0.2s, READ+1.5s, ANSWER T‑8s, ANSWER T‑2s and locked, in portrait and landscape across both profiles. Development screenshots, not committed as snapshot tests.

Canvas internals are untouched; this phase adds no Pixi tests.

## 11. Edge cases

| Case | Behaviour |
|---|---|
| `ends_at` is null | Elapsed treated as infinite: everything present, tension 0. |
| `timer_seconds` at or below 8s | Tension window is the whole beat; it must open at 0, not at full. |
| Late join or reload mid-beat | Correct end state, no replay (decision 2). |
| Phase advances mid-animation | Running animation cuts to its end state; input is never held (decision 1). |
| Round rollover | Beat identity is `(phase, round)`, so each round's READ replays its stagger. |
| Reload while locked | Restored from sessionStorage (§8.1). |
| Spectator / non-playing MC | Buttons disabled with an explanatory state, no RPC attempt (§8.2). |
| `reduced` profile | Cross-fades, three discrete vignette levels, no per-frame writes. |

## 12. Exit criteria

1. READ plays as a staged announcement — badges land, question rises, options arrive dimmed — with the question legible by ~920ms of the 3s beat.
2. ANSWER escalates through the ring and the closing frame without ever dimming, scaling or moving the question or the options; locking freezes the frame and fades the unchosen three.
3. Answer buttons are shape-coded and index-stable, operable by pointer, Tab/Enter and 1–4, with the lock announced to assistive technology.
4. Question readability and interaction remain first-priority in mobile portrait, verified at 390×844.
5. A reload anywhere in READ or ANSWER lands in the correct visual state without replaying, and a locked answer survives it.
6. Both performance profiles work; `reduced` performs no continuous ramp and no per-frame writes.
7. `useStaging` re-renders on the order of ten times per beat, measured — not sixty times per second.
8. The Playwright e2e suite passes.

## 13. Expected ADRs

- **Beat position is derived from `ends_at`, not local arrival** — and the client hand-mirrors the server's nominal phase durations to do it.
- **Continuous presentation values go to CSS custom properties; only quantized state enters React.**
- **Staging never gates input** — the server phase is the sole interaction authority.
- **Answer selection is expressed by form, not hue.**
