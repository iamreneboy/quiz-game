# M2 P4 — Audio identity

| | |
|---|---|
| Status | Approved design — ready for implementation planning |
| Parent | `docs/superpowers/specs/2026-08-21-m2-the-show-roadmap.md` (P4), `docs/PRD.md` §8–§9 |
| Date | 2026-08-23 |
| Baseline | P3 complete (`7c35f2e`): cue vocabulary, celebration hierarchy, performance profiles, world runtime, staging runtime and callout arbitration all in place. `howler` and `@types/howler` were installed in P0 and are still unused. The game is silent. |

## 1. Purpose

Every other phase gave the show a picture. P4 gives it a **sound**: a continuous, state-appropriate score under the whole game, and stingers that land on the same celebration hierarchy the visuals already obey.

P4 is the third cue-bus consumer, and it is built exactly like the two that exist — every decision in a pure, unit-tested module; one impure runtime that touches the browser and is deliberately not unit-tested.

P4 is parallel-safe with P5. It ships the podium fanfare itself, against the `podium` cue that already exists in the P0 vocabulary, so neither phase waits on the other.

## 2. Decisions

1. **Sounds are generated from code, at dev time, into committed files.** A `scripts/audio/` generator synthesises every sting and stem and encodes them with ffmpeg. This satisfies roadmap decision 1 (procedural-first, no external art pipeline) *and* decision 2 (Howler is the runtime stack) rather than trading one against the other: the sound design is diffable source, and the runtime is plain playback.
2. **The ANSWER bed escalates by layered stems driven by `tensionAt`.** Not a second ramp, not a filter sweep, not loop swaps. The audio calls the same pure function the vignette calls, with the same inputs, so audio and picture cannot disagree — including the freeze at lock-in.
3. **The cue vocabulary gains exactly one member: `answer-resolved`.** Nothing in the P0 union says "*you* got it right", and correct/wrong is the single most-expected sound in a quiz game. Derived in `deriveCues` from `myAnswer` + `reveal.correct_index`, both already in `CueSource`. No store, schema, RPC or wire change — this is a vocabulary extension under ADR-0001, not a roadmap decision 4 exception.
4. **Drama stings buffer to the TRACK beat.** `overtake`, `lead-changed`, `streak-tier` and `final-question` arrive at REVEAL but their picture lands ~5s later; the sound goes with the picture ([ADR-0009](../../ADR/0009-drama-buffered-to-the-track-beat.md)). This also hands arbitration a natural batch, and leaves REVEAL acoustically clear for the one sting that is about *you*.
5. **The first batch is catch-up, not performance.** A reload replays the whole seed batch through the bus. The state machine applies the resulting **bed** and suppresses every **sting**. State survives a reload; one-shot events do not replay.
6. **Sound is on by default, unlocked by the first gesture, muted by one toggle.** No prompt, no interstitial, no separate music/SFX sliders.
7. **Audio degrades to silent no-ops when there is no audio device.** Headless Chromium has none. A mixer that throws would take the entire e2e regression floor down with it.

## 3. The cue addition

```ts
// lib/presentation/cues.ts
export interface AnswerResolvedCue {
  type: 'answer-resolved';
  tier: 'routine';
  /** False when the local player let the clock run out, or is not playing. */
  answered: boolean;
  /** Meaningless when `answered` is false. */
  correct: boolean;
  choiceIndex: number | null;
  correctIndex: number | null;
}
```

Emitted from `phaseCues`' `reveal` branch, immediately after `phase-reveal`, so a consumer processing in order has the reveal's context before the personal verdict.

```ts
// deriveCues.ts, reveal branch
const answered = next.myAnswer !== null;
const correctIndex = next.reveal?.correct_index ?? null;
cues.push({
  type: 'answer-resolved',
  tier: 'routine',
  answered,
  correct: answered && correctIndex !== null && next.myAnswer === correctIndex,
  choiceIndex: next.myAnswer,
  correctIndex,
});
```

**Why not infer it in the audio runtime.** The runtime could read the local player id from the session — both existing runtimes do — and infer the verdict from whether a `player-advanced` for that id arrived in the reveal batch. That is order-dependent inference living in the one module that is untestable by design, and any future consumer wanting the same fact would reimplement it. ADR-0001 exists to prevent precisely this.

**Why `answered` is a separate field rather than `correct: false`.** A player who did not answer must hear *nothing*. Collapsing the two would make silence indistinguishable from a wrong answer at the call site, and the wrong-answer sting would then punish people for a dropped connection.

`tier: 'routine'` on purpose: your own result is feedback, not spectacle. It may never outrank an overtake.

## 4. Module layout

```
scripts/audio/
  dsp.mjs           # oscillators, noise, ADSR, biquad, reverb tail, WAV writer
  sounds.mjs        # every sting and stem, as code — this is the sound design
  generate.mjs      # render → ffmpeg → public/audio/ + lib/audio/manifest.ts

public/audio/*.webm|.m4a   # generated, committed

lib/audio/
  design.ts     # world content: beds, stems, cue→sting map, gains
  state.ts      # PURE, tested: cue → { bed, stings }
  mixer.ts      # Howler wrapper: load, unlock, play, gain, crossfade, duck
  runtime.ts    # cue-bus subscriber + rAF gain ticker
  manifest.ts   # generated: id → { src[], durationMs }

lib/presentation/cues.ts     # + AnswerResolvedCue
lib/presentation/deriveCues.ts
lib/useSettings.ts           # + muted / setMuted
components/SettingsControl.tsx
app/room/[code]/page.tsx     # + startAudioRuntime(code)
```

### Seams

- `state.ts` imports `cues.ts`, `celebration.ts`, `tension.ts`, `design.ts`. Never Howler, never the store, never the DOM.
- `mixer.ts` imports Howler and `manifest.ts`. It knows about sound ids, gains and beds — nothing about cues, phases or players.
- `runtime.ts` is the only module that touches both, plus `useGameStore` (for the ANSWER clock, exactly as `lib/staging/runtime.ts` does) and `useSettings`.

**Why `design.ts` is separate from `state.ts`.** Cross-cutting constraint 3: the *identity* of the night race's audio is world content, the *choreography* rules are world-agnostic. `state.ts` says "a headline sting fires at TRACK"; `design.ts` says which sound that is. A second world swaps the latter.

## 5. Music beds

```ts
export type MusicBed = 'lobby' | 'round' | 'ceremony';

export interface AudioState {
  bed: MusicBed;
  escalated: boolean;
  pending: Cue[];      // drama buffered for the TRACK beat
  catchUp: boolean;
}
```

| Bed | Entered on | Stems |
|---|---|---|
| `lobby` | initial state | `groove` |
| `round` | `phase-countdown`, or any phase cue while `catchUp` | `base`, `drive`, `urgency` |
| `round` + `escalated` | `final-question` | + `dread` |
| `ceremony` | `phase-results` | `ceremony` |

The lobby has no cue of its own ("lobby has no beat of its own", `deriveCues.ts:228`), so it is simply the **initial** state. M1's flow never returns to the lobby, so no transition back is needed; a reload during the lobby emits no phase cue and correctly stays put.

`escalated` is set the instant `final-question` is **seen**, live or seeded — never deferred to a later cue's handler. This is [ADR-0021](../../ADR/0021-final-question-escalation-fires-on-the-run-up-beat.md)'s lesson, and CURRENT.md names P4's audio state as the next likely victim of it. Reloading into the final round's READ must land on the escalated bed.

Bed changes crossfade over 600 ms. Stems within a bed are started in one tick and never restarted, so they stay sample-aligned; a stem that is "off" is at gain 0, not stopped.

### Stem gains

Only during ANSWER, and only while `myAnswer === null`:

```
t = tensionAt(remainingMs, timerSeconds * 1000)   // the vignette's own ramp
drive   gain = clamp01(t / 0.55)
urgency gain = clamp01((t - 0.45) / 0.55)
```

Once you lock in, gains **freeze** where they are — you are out of the decision, the room is not (`lib/staging/runtime.ts:151`). On `phase-reveal` they decay to `base` alone over 400 ms.

On the `reduced` profile the gains snap at `tensionStep`'s three levels and are written only when the step changes, rather than every frame. That is the honest performance meaning of the profile; stings are untouched, because reduced-*motion* is not a request for silence.

## 6. Sting catalogue

| Cue | Sting | Notes |
|---|---|---|
| `player-joined` | `join-blip` | lobby bed only |
| `phase-countdown` | `countdown-riser` | |
| `phase-read` | `category-slam` | lands with P3a's badge slam-in |
| `phase-answer` | `answer-open` | short whoosh |
| `answer-locked` | `lock` | local, dry, tactile |
| `phase-reveal` | `reveal-hit` | |
| `answer-resolved` | `correct` / `wrong-soft` | local; **silent** when `answered` is false |
| `phase-track` | the arbitrated headline, else `track-whoosh` | |
| `overtake` | `overtake-whoosh` | buffered → TRACK |
| `lead-changed` | `lead-flourish` | buffered → TRACK |
| `streak-tier` | `streak-3` / `streak-5` / `streak-8` | buffered → TRACK |
| `final-question` | `final-sting` | buffered → TRACK (the run-up beat) |
| `podium` | `fanfare` | |
| `player-advanced` | *(silent)* | one per advancing player per round is mush; `track-whoosh` covers the beat |
| `streak-broken` | *(silent)* | PRD §8: no mockery |

**Arbitration.** At `phase-track`, `pending` resolves to exactly **one** headline sting: the highest `tier` via the existing `resolveTier`, ties broken by arrival order. Everything below it is dropped rather than layered — this is `callouts.ts`' rule, applied to sound. `final-question` outranks `overtake`, so on the run-up beat the final sting is the headline, matching what the picture does.

`phase-read` clears `pending`, mirroring `clearCallout`. A beat that somehow reaches READ without passing through TRACK must not fire stale drama a round late.

**Ducking.** A headline of tier ≥ `overtake` ducks the bed 6 dB for the sting's length plus a 250 ms release. Cheap, and it is most of what separates a mix from a pile of samples.

`wrong-soft` is a short, low, two-note fall at reduced gain. Neutral, over quickly, and never comic.

## 7. Runtime, unlock and mute

`startAudioRuntime(code)` mounts from the room page beside the existing two runtimes and returns a teardown. It:

- subscribes to every cue type in the catalogue,
- feeds each cue to `state.ts` and hands the returned stings to the mixer,
- clears `catchUp` on the first rAF **after** mount, so the whole synchronous seed batch is treated as catch-up,
- runs a rAF tick that reads `room.phase` / `room.ends_at` / `room.timer_seconds` / `myAnswer` from the store and writes stem gains.

**Unlock.** Howler is configured with `autoUnlock` left on, and the mixer additionally holds playback until the first `pointerdown` or `keydown` anywhere on the document. On unlock the current bed fades in **mid-loop**, not from bar one — you have joined a show already in progress. Nothing plays before a gesture, so there is no autoplay violation to report.

**Mute.** `useSettings` gains `muted` (default `false`) persisted at `cb:settings:muted`, using the same never-throws load/save pattern as `loadOverride`/`saveOverride`, and publishes `document.documentElement.dataset.muted` exactly as it publishes `dataset.profile`. `SettingsControl` gets a checkbox under the existing Motion select — the component already carries the comment reserving that spot.

Muting calls `Howler.mute(true)`; the state machine keeps running, so unmuting mid-game lands on the correct bed at the correct point rather than starting a loop from its top.

**Silent fallback.** `mixer.ts` wraps construction in a try/catch and, on any failure — no `AudioContext`, no device, a Howler throw — sets an internal `dead` flag and turns every method into a no-op. `runtime.ts` and `state.ts` are unaffected and keep running, which keeps the pure logic testable and the e2e suite alive under headless Chromium.

## 8. The generator

`node scripts/audio/generate.mjs` renders each sound to 22.05 kHz mono 16-bit WAV in a temp dir, then shells out to ffmpeg twice per sound:

- `.webm` (Opus) — gapless looping, the primary source;
- `.m4a` (AAC) — fallback for browsers without WebM/Opus, which take a barely-audible loop seam from AAC's encoder padding.

Howler receives both in `src` and picks per browser. `manifest.ts` is rewritten with ids, both URLs and measured durations (the mixer needs durations for ducking release).

**ffmpeg is a prerequisite for regenerating sounds only.** It is not invoked by `npm run build`, `npm test`, `npm run dev` or CI — the outputs are committed. This is stated in the script header and in the phase's progress doc.

Budget: stings ≲ 0.6 s, loops 4–8 s. Expected total ~120–180 KB across both formats. Beds are lazy-loaded: the round bed loads on `phase-countdown`, the ceremony bed on `phase-track` of the final round, so the lobby costs one groove loop and the sting set.

## 9. Testing

**Vitest — `tests/audioState.test.ts`** against recorded cue streams, in the style of `tests/deriveCues.test.ts`:

1. Bed transitions across a full game: lobby → round → ceremony.
2. `catchUp` suppresses stings but still applies the bed — seeded into READ, ANSWER, REVEAL and TRACK.
3. Reloading into the final round sets `escalated` from the seeded `final-question` alone.
4. Drama buffers at REVEAL and produces nothing until `phase-track`.
5. Headline arbitration: overtake + streak-3 → one sting, the overtake; final-question + overtake → the final sting.
6. `phase-track` with an empty buffer yields `track-whoosh`.
7. `answer-resolved` with `answered: false` yields no sting.
8. `phase-read` clears the buffer (a beat that reaches READ without a TRACK must not fire stale drama).

**Vitest — `tests/deriveCues.test.ts`** extended: `answer-resolved` for correct, wrong, and no-answer, plus its absence outside REVEAL.

**Vitest — `tests/audioMixer.test.ts`**: construction with no `AudioContext` yields a dead mixer whose every method is a safe no-op.

**Playwright** — extend `e2e/settings.spec.ts`: the mute toggle flips `data-muted` and survives a reload. Nothing more; audio is not assertable headlessly. The existing suite is the regression floor and must pass at `--workers=2` (CURRENT.md).

**Manual** — a headed listening pass over a full game, per CURRENT.md's standing note that headless Chromium is the wrong instrument for anything real-time.

## 10. Edge cases

- **Never joined / spectating the room page.** The runtime mounts before `JoinGate` resolves; the lobby bed is correct for that state, and no personal sting can fire because `myAnswer` stays null.
- **Host who is not playing.** `answer-resolved` reports `answered: false` every round; they hear the show, not a verdict.
- **A one-round game.** `deriveCues` emits `final-question` at `phase-countdown` (`deriveCues.ts:154`), so the escalated bed is the *only* round bed. Correct, and the test suite covers it.
- **Tab backgrounded.** rAF stops, so gains freeze mid-ramp; on return, the next tick reads the true `ends_at` and snaps. Acceptable — no catch-up animation is owed.
- **Mute toggled during a sting.** `Howler.mute` cuts immediately; no fade. Intended.
- **Rapid reload loop.** Every mount is `catchUp`, so a player refreshing repeatedly hears beds, never a machine-gun of stings.

## 11. Scope boundaries

Out of scope, deliberately:

- Per-category or per-difficulty musical variation.
- Spatialised or per-player audio.
- Separate music/SFX volume sliders — one mute toggle (YAGNI; the roadmap asks for a mute toggle, not a mixer).
- A stage-view-specific mix. P6 re-composes this layer; it does not get its own audio design. Note that P6 mounting a second renderer alongside this runtime is the same class of problem as the baked-avatar texture cache in CURRENT.md — flagged there, not solved here.
- Voice-over or announcer lines.
- Any change to `COUNTDOWN` choreography, which remains the standing intentionally-skipped item from P2.

## 12. Exit criteria

1. A full game plays with a continuous, state-appropriate bed under every phase, escalating through ANSWER and freezing at lock-in.
2. Stings fire on the celebration hierarchy: one headline per TRACK beat, personal verdict at REVEAL, nothing for `streak-broken` or `player-advanced`.
3. Reloading mid-game lands on the correct bed — escalated in the final round — and replays no stings.
4. The mute toggle works, persists across reloads, and unmuting mid-game resumes at the right point.
5. Nothing plays before a user gesture; no autoplay policy warning appears in the console.
6. The `reduced` profile steps stem gains instead of ramping them, and writes gains only on step change.
7. `npm test` passes; `npm run test:e2e -- --workers=2` passes, including under headless Chromium with no audio device.
8. Total committed audio is under 250 KB.

## 13. Expected ADRs

- **`answer-resolved` is derived, not inferred** — why the vocabulary grew by one rather than the runtime guessing, and why `answered` is its own field.
- **Audio escalation reuses the vignette's ramp** — one tension function, two outputs; the freeze-at-lock-in rule follows for free.
- **The first cue batch is catch-up** — beds apply, stings do not; the general form of the ADR-0021 lesson for every future consumer.
- **Sounds are generated source, not assets** — the `scripts/audio/` pipeline, why ffmpeg is a dev-only prerequisite, and why two encodings ship.
