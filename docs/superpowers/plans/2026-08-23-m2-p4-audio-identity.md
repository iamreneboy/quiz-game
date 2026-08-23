# M2 P4 — Audio Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Circuit Break a continuous, state-appropriate soundtrack and a set of stingers that obey the same celebration hierarchy the visuals already obey.

**Architecture:** P4 is the third cue-bus consumer, built like the two that exist (`lib/world/runtime.ts`, `lib/staging/runtime.ts`): a pure, unit-tested state machine (`lib/audio/state.ts`) decides *when* sound happens, a world-content data module (`lib/audio/design.ts`) decides *what* it is, and one impure runtime (`lib/audio/runtime.ts`) wires the cue bus to a Howler mixer. Every sound is synthesised by a committed dev-time generator script rather than sourced as art.

**Tech Stack:** TypeScript, Howler.js 2.2 (already installed, currently unused), Zustand, Vitest, Playwright, Node ESM scripts, ffmpeg (dev-time only).

**Spec:** `docs/superpowers/specs/2026-08-23-m2-p4-audio-identity-design.md`

## Global Constraints

- **No schema, RPC, or realtime-protocol changes.** P4 is presentation-only. The cue vocabulary grows by exactly one member (`answer-resolved`), derived from data already in `CueSource`.
- **Semantic events only.** Audio subscribes to `lib/presentation/cueBus`; it never reads game state for *event* decisions. It may read `useGameStore` for the ANSWER *clock* only, exactly as `lib/staging/runtime.ts` does.
- **Pure logic is tested; runtimes are not.** Anything touching Howler, the DOM, or `requestAnimationFrame` lives in `mixer.ts` / `runtime.ts` and is deliberately not unit-tested. Every decision those files make must live in `state.ts` or `design.ts`.
- **Celebration hierarchy.** Exactly one headline sting per TRACK beat, chosen with the existing `resolveTier` from `lib/presentation/celebration.ts`. Never layer two drama stings.
- **Degrade to silence, never to a crash.** `createMixer()` must return a working no-op mixer when there is no `window` / `AudioContext` / working Howler. Headless Chromium has no audio device and the entire e2e regression floor runs there.
- **The `reduced` profile steps, it does not ramp.** Stem gains snap at `tensionStep`'s three levels and are written only when the step changes.
- **No new npm dependencies.** ffmpeg is a dev-time prerequisite for regenerating sounds only — never invoked by `npm run build`, `npm test`, `npm run dev`, or CI.
- **Audio budget:** 22.05 kHz mono sources, stings ≤ 0.6 s, total committed audio under 250 KB.
- **Existing suites are the regression floor:** `npm test` and `npm run test:e2e -- --workers=2` pass at the end of every task.

---

## File Structure

```
scripts/audio/
  dsp.mjs           CREATE  synthesis primitives + WAV writer (no deps, seeded RNG)
  sounds.mjs        CREATE  every sting and stem as code — this IS the sound design
  generate.mjs      CREATE  render -> ffmpeg -> public/audio/ + lib/audio/manifest.ts

public/audio/*.webm|.m4a  CREATE (generated, committed)

lib/audio/
  manifest.ts       CREATE (generated) sound id -> src[] + duration + loop
  design.ts         CREATE  world content: beds, stems, cue->sting map, gain curves
  state.ts          CREATE  PURE: cue -> { bed, stings }
  mixer.ts          CREATE  Howler wrapper: load/unlock/play/gain/crossfade/duck
  runtime.ts        CREATE  cue-bus subscriber + rAF gain ticker
  mutePreference.ts CREATE  localStorage load/save for the mute toggle

lib/presentation/cues.ts        MODIFY  + AnswerResolvedCue
lib/presentation/deriveCues.ts  MODIFY  emit it in the reveal branch
lib/useSettings.ts              MODIFY  + muted / setMuted, publish data-muted
components/ui/Checkbox.tsx      CREATE  styled checkbox matching Select
components/SettingsControl.tsx  MODIFY  + the mute toggle
app/room/[code]/page.tsx        MODIFY  + startAudioRuntime(), mounted FIRST

tests/deriveCues.test.ts   MODIFY  answer-resolved coverage + 7 updated assertions
tests/audioState.test.ts   CREATE  the pure state machine
tests/audioDesign.test.ts  CREATE  gain curves + sting map totality
tests/audioMixer.test.ts   CREATE  the dead-mixer fallback
e2e/settings.spec.ts       MODIFY  mute toggles and persists

docs/ADR/0022..0025        CREATE
docs/progress/P4-audio-identity.md  CREATE
docs/progress/CURRENT.md   MODIFY
```

---

### Task 1: The `answer-resolved` cue

Nothing in the P0 vocabulary says "*you* got it right". This adds the one member that does, derived purely — no store, schema, RPC or wire change.

**Files:**
- Modify: `lib/presentation/cues.ts`
- Modify: `lib/presentation/deriveCues.ts:179-197` (the `reveal` branch of `phaseCues`)
- Test: `tests/deriveCues.test.ts`
- Create: `docs/ADR/0022-answer-resolved-is-derived-not-inferred.md`
- Modify: `docs/ADR/README.md` (index row)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `AnswerResolvedCue` with fields `type: 'answer-resolved'`, `tier: 'routine'`, `answered: boolean`, `correct: boolean`, `choiceIndex: number | null`, `correctIndex: number | null`. Added to the `Cue` union, so `CueOf<'answer-resolved'>` resolves. Every later task depends on these exact field names.

- [ ] **Step 1: Write the failing tests**

Append to `tests/deriveCues.test.ts`:

```ts
describe('answer-resolved', () => {
  const revealSource = (myAnswer: number | null, correctIndex: number) =>
    source({
      phase: 'reveal',
      round: 1,
      myAnswer,
      reveal: {
        correct_index: correctIndex,
        fun_fact: null,
        counts: [1, 0, 1, 0],
        picks: [],
        fastest: null,
        standings: [],
      },
      standings: [standing(A, 1), standing(B, 0)],
    });

  it('reports a correct local answer', () => {
    const { batches } = run([
      source({ phase: 'answer', round: 1, myAnswer: 2 }),
      revealSource(2, 2),
    ]);
    const cue = batches[1].find(c => c.type === 'answer-resolved');
    expect(cue).toMatchObject({
      type: 'answer-resolved',
      tier: 'routine',
      answered: true,
      correct: true,
      choiceIndex: 2,
      correctIndex: 2,
    });
  });

  it('reports a wrong local answer', () => {
    const { batches } = run([
      source({ phase: 'answer', round: 1, myAnswer: 0 }),
      revealSource(0, 3),
    ]);
    expect(batches[1].find(c => c.type === 'answer-resolved')).toMatchObject({
      answered: true,
      correct: false,
      choiceIndex: 0,
      correctIndex: 3,
    });
  });

  it('reports answered:false when the clock ran out', () => {
    const { batches } = run([
      source({ phase: 'answer', round: 1 }),
      revealSource(null, 3),
    ]);
    expect(batches[1].find(c => c.type === 'answer-resolved')).toMatchObject({
      answered: false,
      correct: false,
      choiceIndex: null,
    });
  });

  it('rides immediately behind phase-reveal and nowhere else', () => {
    const { batches } = run([
      source({ phase: 'countdown', round: 1 }),
      source({ phase: 'read', round: 1 }),
      source({ phase: 'answer', round: 1 }),
      revealSource(1, 1),
      source({ phase: 'track', round: 1, standings: [standing(A, 1), standing(B, 0)] }),
    ]);
    expect(batches.map(types)).toEqual([
      ['phase-countdown'],
      ['phase-read'],
      ['phase-answer'],
      ['phase-reveal', 'answer-resolved', 'player-advanced'],
      ['phase-track'],
    ]);
  });
});
```

- [ ] **Step 2: Update the seven existing assertions the new cue changes**

The cue is emitted from `phaseCues`, so it appears in the seed batch too. In `tests/deriveCues.test.ts` change exactly these, adding `'answer-resolved'` directly after `'phase-reveal'`:

- line ~79 `['phase-reveal']` → `['phase-reveal', 'answer-resolved']`
- line ~115 `['phase-reveal', 'player-advanced']` → `['phase-reveal', 'answer-resolved', 'player-advanced']`
- line ~262 same substitution
- lines ~363, ~367, ~371 (inside the full-game walk) same substitution on all three reveal rows

Leave the `phase-reveal maps the reveal payload into cue shape` test at line ~152 alone if it indexes a specific cue; if it asserts a whole batch, apply the same substitution.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- tests/deriveCues.test.ts`
Expected: FAIL — the four new tests fail (no `answer-resolved` is ever emitted) and the seven updated assertions fail.

- [ ] **Step 4: Add the cue interface**

In `lib/presentation/cues.ts`, after the `AnswerLockedCue` block in the `Local-only` section:

```ts
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

Add `| AnswerResolvedCue` to the `Cue` union, directly after `| AnswerLockedCue`.

- [ ] **Step 5: Emit it from the deriver**

In `lib/presentation/deriveCues.ts`, replace the whole `case 'reveal':` block of `phaseCues` with:

```ts
    case 'reveal': {
      const fastest = next.reveal?.fastest;
      const correctIndex = next.reveal?.correct_index ?? null;
      const answered = next.myAnswer !== null;
      return [
        {
          type: 'phase-reveal',
          tier: 'routine',
          round: room.round,
          correctIndex,
          counts: next.reveal?.counts ?? [],
          fastest: fastest
            ? {
                playerId: fastest.player_id,
                nickname: fastest.nickname,
                timeRemainingMs: fastest.time_remaining_ms,
              }
            : null,
        },
        // Rides immediately behind the reveal so a consumer processing in order
        // already has the room's outcome before the personal verdict. Derived,
        // never inferred — see ADR-0022.
        {
          type: 'answer-resolved',
          tier: 'routine',
          answered,
          correct: answered && correctIndex !== null && next.myAnswer === correctIndex,
          choiceIndex: next.myAnswer,
          correctIndex,
        },
      ];
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all suites.

- [ ] **Step 7: Write ADR-0022**

Create `docs/ADR/0022-answer-resolved-is-derived-not-inferred.md` following `docs/ADR/README.md`'s format. **Status:** Accepted. **Date:** 2026-08-23. **Phase:** P4 — Audio identity.

- *Context:* P4 needs correct/wrong stingers. `phase-reveal` carries `correctIndex`; `player-advanced` fires for every advancing player, not for "me"; a wrong answer produces no cue at all. ADR-0001 makes extending the closed union a considered change.
- *Decision:* Add `answer-resolved`, derived in `deriveCues` from `myAnswer` + `reveal.correct_index` — both already in `CueSource`. `answered` is a separate field from `correct` so that "did not answer" is distinguishable at the call site and can be silent.
- *Consequences:* The verdict is unit-tested in the one pure module that already owns "what just happened", and P5/P6 inherit it. The alternative — the audio runtime reading the session id and inferring the verdict from the reveal batch — would be order-dependent inference inside a module that is untestable by design, reimplemented by every future consumer. Emitted on the seed path too, which is correct: a reloaded consumer knows the verdict, and P4's catch-up rule (ADR-0024) is what stops it from being *performed*.

Add the index row to `docs/ADR/README.md`.

- [ ] **Step 8: Commit**

```bash
git add lib/presentation/cues.ts lib/presentation/deriveCues.ts tests/deriveCues.test.ts docs/ADR/
git commit -m "feat(cues): derive answer-resolved at the reveal

Nothing in the P0 vocabulary said whether the LOCAL player got it right.
Derived from myAnswer + correct_index, both already in CueSource, so the
wire, schema and store are untouched. answered is its own field so a
dropped connection is silent rather than wrong."
```

---

### Task 2: The sound generator

A dev-time script that synthesises every sound from code and encodes it. The outputs are committed; nothing at build or test time invokes ffmpeg.

**Files:**
- Create: `scripts/audio/dsp.mjs`
- Create: `scripts/audio/sounds.mjs`
- Create: `scripts/audio/generate.mjs`
- Create (generated): `public/audio/*.webm`, `public/audio/*.m4a`, `lib/audio/manifest.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `lib/audio/manifest.ts` exporting `SOUNDS` (a `Record` of sound id → `{ src: readonly string[]; durationMs: number; loop: boolean }`) and `type SoundId = keyof typeof SOUNDS`. Every later task imports `SoundId` and `SOUNDS`. The exact ids are: `join-blip`, `countdown-riser`, `category-slam`, `answer-open`, `lock`, `reveal-hit`, `correct`, `wrong-soft`, `track-whoosh`, `overtake-whoosh`, `lead-flourish`, `streak-3`, `streak-5`, `streak-8`, `final-sting`, `fanfare`, `lobby-groove`, `round-base`, `round-drive`, `round-urgency`, `round-dread`, `ceremony-bed`.

- [ ] **Step 1: Verify ffmpeg is available**

Run: `ffmpeg -version`
Expected: a version banner. If absent, stop and install ffmpeg — this task cannot proceed without it, and no other task needs it.

- [ ] **Step 2: Write the DSP primitives**

Create `scripts/audio/dsp.mjs`:

```js
/**
 * Dependency-free synthesis primitives for scripts/audio/generate.mjs.
 *
 * Everything is deterministic: the noise source is a seeded PRNG, so
 * regenerating produces byte-identical WAVs and a clean diff.
 */
import { writeFileSync } from 'node:fs';

export const SR = 22050;
const TAU = Math.PI * 2;

export const clamp01 = n => Math.min(1, Math.max(0, n));

let rngState = 0x9e3779b9;
export function seed(n) {
  rngState = n >>> 0;
}
/** mulberry32, mapped to -1..1. */
function rand() {
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
}

export function buffer(seconds) {
  return new Float32Array(Math.max(1, Math.round(seconds * SR)));
}

/** Linear attack, exponential decay to sustain, linear release. Times in seconds. */
export function envelope(i, n, { a = 0.005, d = 0.08, s = 0, r = 0.06 } = {}) {
  const t = i / SR;
  const dur = n / SR;
  const releaseAt = Math.max(0, dur - r);
  let v;
  if (a > 0 && t < a) v = t / a;
  else if (t < a + d) v = s + (1 - s) * Math.exp((-3 * (t - a)) / Math.max(1e-6, d));
  else v = s;
  if (r > 0 && t > releaseAt) v *= Math.max(0, 1 - (t - releaseAt) / r);
  return v;
}

const WAVE = {
  sine: p => Math.sin(TAU * p),
  square: p => (p % 1 < 0.5 ? 1 : -1),
  saw: p => 2 * (p % 1) - 1,
  tri: p => 4 * Math.abs((p % 1) - 0.5) - 1,
};

/** Add a pitched tone. `bend` is the end/start frequency ratio (1 = steady). */
export function tone(out, { freq, start = 0, dur, gain = 0.4, wave = 'sine', bend = 1, env = {} }) {
  const n = Math.round(dur * SR);
  const i0 = Math.round(start * SR);
  const shape = WAVE[wave];
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const k = i0 + i;
    if (k >= out.length) break;
    phase += (freq * Math.pow(bend, i / n)) / SR;
    out[k] += shape(phase) * envelope(i, n, env) * gain;
  }
}

/** Add one-pole-lowpassed noise. */
export function noise(out, { start = 0, dur, gain = 0.3, cutoff = 4000, env = {} }) {
  const n = Math.round(dur * SR);
  const i0 = Math.round(start * SR);
  const alpha = Math.min(1, (TAU * cutoff) / SR);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const k = i0 + i;
    if (k >= out.length) break;
    lp += alpha * (rand() - lp);
    out[k] += lp * envelope(i, n, env) * gain;
  }
}

/** Cheap feedback-delay tail, in place. */
export function reverb(buf, { timeS = 0.09, mix = 0.3, feedback = 0.45 } = {}) {
  const d = Math.round(timeS * SR);
  for (let i = d; i < buf.length; i++) buf[i] += buf[i - d] * feedback * mix;
}

export function normalize(buf, peak = 0.89) {
  let max = 0;
  for (const v of buf) max = Math.max(max, Math.abs(v));
  if (max === 0) return buf;
  const g = peak / max;
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
  return buf;
}

/**
 * Render a seamless loop: draw into a buffer longer than the loop, then fold
 * the overhang back onto the head so reverb tails and long releases wrap
 * instead of clicking at the loop point.
 */
export function renderLoop(loopSeconds, tailSeconds, draw) {
  const loopN = Math.round(loopSeconds * SR);
  const buf = new Float32Array(loopN + Math.round(tailSeconds * SR));
  draw(buf);
  const out = buf.slice(0, loopN);
  for (let i = loopN; i < buf.length; i++) out[i - loopN] += buf[i];
  return out;
}

export function writeWav(path, buf) {
  const n = buf.length;
  const bytes = Buffer.alloc(44 + n * 2);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + n * 2, 4);
  bytes.write('WAVE', 8);
  bytes.write('fmt ', 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(SR, 24);
  bytes.writeUInt32LE(SR * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, buf[i]));
    bytes.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  writeFileSync(path, bytes);
}
```

- [ ] **Step 3: Write the sound design**

Create `scripts/audio/sounds.mjs`. Every sound is a function returning a `Float32Array`; loops are declared with `loop: true` and must all sit at 120 BPM (beat = 0.5 s) so stems stay phase-compatible.

```js
/**
 * The night-race sound identity, as code. This file IS the sound design —
 * edit it, rerun scripts/audio/generate.mjs, listen, commit.
 *
 * Palette: A minor pentatonic, synth, dark. 120 BPM; every loop length is a
 * whole number of bars so stems can be started together and stay aligned.
 */
import { buffer, noise, normalize, renderLoop, reverb, seed, tone } from './dsp.mjs';

const A2 = 110, C3 = 130.81, D3 = 146.83, E3 = 164.81, G3 = 196;
const A3 = 220, C4 = 261.63, D4 = 293.66, E4 = 329.63, G4 = 392;
const A4 = 440, C5 = 523.25, E5 = 659.25, A5 = 880;
const BEAT = 0.5;

/* ── Stings ──────────────────────────────────────────────────────────────── */

export const STINGS = {
  'join-blip': () => {
    const b = buffer(0.22);
    tone(b, { freq: E4, dur: 0.10, gain: 0.35, wave: 'tri', env: { a: 0.002, d: 0.08, r: 0.04 } });
    tone(b, { freq: A4, start: 0.07, dur: 0.14, gain: 0.3, wave: 'sine', env: { a: 0.002, d: 0.1, r: 0.05 } });
    return normalize(b, 0.55);
  },

  'countdown-riser': () => {
    const b = buffer(0.6);
    tone(b, { freq: A3, dur: 0.6, gain: 0.35, wave: 'saw', bend: 2, env: { a: 0.05, d: 0.5, s: 0.6, r: 0.08 } });
    noise(b, { dur: 0.6, gain: 0.18, cutoff: 2600, env: { a: 0.4, d: 0.2, s: 0.7, r: 0.1 } });
    reverb(b, { timeS: 0.08, mix: 0.25 });
    return normalize(b, 0.82);
  },

  'category-slam': () => {
    const b = buffer(0.45);
    tone(b, { freq: A2, dur: 0.3, gain: 0.6, wave: 'square', bend: 0.5, env: { a: 0.001, d: 0.16, r: 0.1 } });
    noise(b, { dur: 0.18, gain: 0.4, cutoff: 6000, env: { a: 0.001, d: 0.08, r: 0.06 } });
    tone(b, { freq: E4, start: 0.02, dur: 0.25, gain: 0.22, wave: 'tri', env: { a: 0.002, d: 0.14, r: 0.08 } });
    reverb(b, { timeS: 0.07, mix: 0.3 });
    return normalize(b, 0.86);
  },

  'answer-open': () => {
    const b = buffer(0.35);
    noise(b, { dur: 0.35, gain: 0.4, cutoff: 5200, env: { a: 0.02, d: 0.28, r: 0.08 } });
    tone(b, { freq: A3, dur: 0.25, gain: 0.2, wave: 'sine', bend: 1.5, env: { a: 0.01, d: 0.2, r: 0.06 } });
    return normalize(b, 0.6);
  },

  lock: () => {
    const b = buffer(0.14);
    tone(b, { freq: G4, dur: 0.05, gain: 0.45, wave: 'square', env: { a: 0.001, d: 0.03, r: 0.02 } });
    noise(b, { dur: 0.06, gain: 0.25, cutoff: 7000, env: { a: 0.001, d: 0.03, r: 0.02 } });
    return normalize(b, 0.62);
  },

  'reveal-hit': () => {
    const b = buffer(0.5);
    tone(b, { freq: A2, dur: 0.35, gain: 0.5, wave: 'sine', env: { a: 0.001, d: 0.2, r: 0.12 } });
    noise(b, { dur: 0.3, gain: 0.3, cutoff: 3400, env: { a: 0.002, d: 0.14, r: 0.1 } });
    reverb(b, { timeS: 0.1, mix: 0.35 });
    return normalize(b, 0.84);
  },

  correct: () => {
    const b = buffer(0.5);
    tone(b, { freq: A4, dur: 0.16, gain: 0.4, wave: 'tri', env: { a: 0.002, d: 0.12, r: 0.05 } });
    tone(b, { freq: C5, start: 0.09, dur: 0.18, gain: 0.4, wave: 'tri', env: { a: 0.002, d: 0.14, r: 0.06 } });
    tone(b, { freq: E5, start: 0.18, dur: 0.3, gain: 0.42, wave: 'sine', env: { a: 0.002, d: 0.22, r: 0.09 } });
    reverb(b, { timeS: 0.11, mix: 0.28 });
    return normalize(b, 0.8);
  },

  // Neutral, low, over quickly. Never comic (PRD §8: no mockery).
  'wrong-soft': () => {
    const b = buffer(0.34);
    tone(b, { freq: D4, dur: 0.13, gain: 0.3, wave: 'sine', env: { a: 0.004, d: 0.1, r: 0.05 } });
    tone(b, { freq: A3, start: 0.1, dur: 0.22, gain: 0.28, wave: 'sine', env: { a: 0.004, d: 0.16, r: 0.07 } });
    return normalize(b, 0.5);
  },

  'track-whoosh': () => {
    const b = buffer(0.55);
    noise(b, { dur: 0.55, gain: 0.45, cutoff: 3000, env: { a: 0.12, d: 0.3, s: 0.35, r: 0.14 } });
    tone(b, { freq: A2, dur: 0.4, gain: 0.22, wave: 'saw', bend: 1.8, env: { a: 0.08, d: 0.25, r: 0.1 } });
    return normalize(b, 0.72);
  },

  'overtake-whoosh': () => {
    const b = buffer(0.6);
    noise(b, { dur: 0.6, gain: 0.5, cutoff: 5400, env: { a: 0.06, d: 0.34, s: 0.3, r: 0.16 } });
    tone(b, { freq: A3, dur: 0.5, gain: 0.32, wave: 'saw', bend: 2.4, env: { a: 0.02, d: 0.3, r: 0.14 } });
    tone(b, { freq: E5, start: 0.24, dur: 0.2, gain: 0.24, wave: 'square', env: { a: 0.001, d: 0.12, r: 0.06 } });
    reverb(b, { timeS: 0.09, mix: 0.3 });
    return normalize(b, 0.88);
  },

  'lead-flourish': () => {
    const b = buffer(0.6);
    tone(b, { freq: A3, dur: 0.12, gain: 0.34, wave: 'square', env: { a: 0.002, d: 0.09, r: 0.04 } });
    tone(b, { freq: E4, start: 0.09, dur: 0.12, gain: 0.34, wave: 'square', env: { a: 0.002, d: 0.09, r: 0.04 } });
    tone(b, { freq: A4, start: 0.18, dur: 0.34, gain: 0.4, wave: 'tri', env: { a: 0.002, d: 0.24, r: 0.1 } });
    reverb(b, { timeS: 0.12, mix: 0.34 });
    return normalize(b, 0.88);
  },

  'streak-3': () => {
    const b = buffer(0.42);
    tone(b, { freq: E4, dur: 0.1, gain: 0.34, wave: 'tri', env: { a: 0.002, d: 0.07, r: 0.04 } });
    tone(b, { freq: A4, start: 0.08, dur: 0.26, gain: 0.36, wave: 'tri', env: { a: 0.002, d: 0.18, r: 0.08 } });
    return normalize(b, 0.72);
  },

  'streak-5': () => {
    const b = buffer(0.55);
    tone(b, { freq: A4, dur: 0.1, gain: 0.34, wave: 'square', env: { a: 0.002, d: 0.07, r: 0.04 } });
    tone(b, { freq: C5, start: 0.08, dur: 0.1, gain: 0.34, wave: 'square', env: { a: 0.002, d: 0.07, r: 0.04 } });
    tone(b, { freq: E5, start: 0.16, dur: 0.34, gain: 0.4, wave: 'tri', env: { a: 0.002, d: 0.24, r: 0.1 } });
    noise(b, { start: 0.16, dur: 0.3, gain: 0.16, cutoff: 6200, env: { a: 0.01, d: 0.2, r: 0.08 } });
    reverb(b, { timeS: 0.1, mix: 0.3 });
    return normalize(b, 0.85);
  },

  'streak-8': () => {
    const b = buffer(0.6);
    tone(b, { freq: A2, dur: 0.45, gain: 0.45, wave: 'saw', bend: 1.6, env: { a: 0.004, d: 0.3, r: 0.12 } });
    tone(b, { freq: A4, start: 0.05, dur: 0.12, gain: 0.32, wave: 'square', env: { a: 0.002, d: 0.08, r: 0.04 } });
    tone(b, { freq: E5, start: 0.14, dur: 0.12, gain: 0.32, wave: 'square', env: { a: 0.002, d: 0.08, r: 0.04 } });
    tone(b, { freq: A5, start: 0.23, dur: 0.36, gain: 0.42, wave: 'tri', env: { a: 0.002, d: 0.26, r: 0.1 } });
    noise(b, { dur: 0.6, gain: 0.22, cutoff: 7200, env: { a: 0.2, d: 0.24, s: 0.3, r: 0.14 } });
    reverb(b, { timeS: 0.11, mix: 0.36 });
    return normalize(b, 0.92);
  },

  'final-sting': () => {
    const b = buffer(0.6);
    tone(b, { freq: A2, dur: 0.6, gain: 0.55, wave: 'saw', bend: 0.75, env: { a: 0.004, d: 0.4, s: 0.4, r: 0.16 } });
    tone(b, { freq: D3, start: 0.02, dur: 0.55, gain: 0.3, wave: 'square', env: { a: 0.01, d: 0.38, s: 0.3, r: 0.14 } });
    noise(b, { dur: 0.6, gain: 0.3, cutoff: 1800, env: { a: 0.3, d: 0.2, s: 0.5, r: 0.14 } });
    reverb(b, { timeS: 0.13, mix: 0.4 });
    return normalize(b, 0.94);
  },

  fanfare: () => {
    const b = buffer(0.6);
    tone(b, { freq: A3, dur: 0.14, gain: 0.4, wave: 'square', env: { a: 0.003, d: 0.1, r: 0.05 } });
    tone(b, { freq: C4, start: 0.11, dur: 0.14, gain: 0.4, wave: 'square', env: { a: 0.003, d: 0.1, r: 0.05 } });
    tone(b, { freq: E4, start: 0.22, dur: 0.14, gain: 0.42, wave: 'square', env: { a: 0.003, d: 0.1, r: 0.05 } });
    tone(b, { freq: A4, start: 0.32, dur: 0.28, gain: 0.5, wave: 'tri', env: { a: 0.003, d: 0.2, r: 0.1 } });
    tone(b, { freq: E5, start: 0.32, dur: 0.28, gain: 0.28, wave: 'tri', env: { a: 0.003, d: 0.2, r: 0.1 } });
    reverb(b, { timeS: 0.12, mix: 0.4 });
    return normalize(b, 0.95);
  },
};

/* ── Beds (loops) ────────────────────────────────────────────────────────── */

const kick = (b, at, gain = 0.5) =>
  tone(b, { freq: 90, start: at, dur: 0.22, gain, wave: 'sine', bend: 0.45, env: { a: 0.001, d: 0.14, r: 0.06 } });

const hat = (b, at, gain = 0.16) =>
  noise(b, { start: at, dur: 0.07, gain, cutoff: 8000, env: { a: 0.001, d: 0.04, r: 0.02 } });

export const BEDS = {
  // 4 bars, laid back — plays under the join gate and the lobby.
  'lobby-groove': () =>
    normalize(
      renderLoop(8, 1, b => {
        for (let beat = 0; beat < 16; beat++) {
          const t = beat * BEAT;
          if (beat % 4 === 0) kick(b, t, 0.4);
          if (beat % 2 === 1) hat(b, t, 0.1);
          tone(b, { freq: A2, start: t, dur: BEAT * 0.9, gain: 0.16, wave: 'tri', env: { a: 0.02, d: 0.3, s: 0.4, r: 0.12 } });
        }
        const arp = [A3, C4, E4, G4, E4, C4];
        for (let i = 0; i < 16; i++) {
          tone(b, { freq: arp[i % arp.length], start: i * BEAT + BEAT / 2, dur: 0.3, gain: 0.12, wave: 'sine', env: { a: 0.01, d: 0.2, r: 0.08 } });
        }
        reverb(b, { timeS: 0.24, mix: 0.3 });
      }),
      0.55,
    ),

  // 2 bars. Always audible during a round.
  'round-base': () =>
    normalize(
      renderLoop(4, 0.6, b => {
        for (let beat = 0; beat < 8; beat++) {
          const t = beat * BEAT;
          kick(b, t, beat % 2 === 0 ? 0.55 : 0.3);
          tone(b, { freq: beat < 4 ? A2 : G3 / 2, start: t, dur: BEAT * 0.85, gain: 0.2, wave: 'saw', env: { a: 0.01, d: 0.24, s: 0.35, r: 0.1 } });
        }
        reverb(b, { timeS: 0.18, mix: 0.22 });
      }),
      0.6,
    ),

  // 2 bars. Faded in by the ANSWER tension ramp.
  'round-drive': () =>
    normalize(
      renderLoop(4, 0.6, b => {
        for (let beat = 0; beat < 8; beat++) {
          hat(b, beat * BEAT + BEAT / 2, 0.2);
          tone(b, { freq: E3, start: beat * BEAT + BEAT / 2, dur: 0.22, gain: 0.24, wave: 'square', env: { a: 0.004, d: 0.14, r: 0.06 } });
        }
        reverb(b, { timeS: 0.15, mix: 0.24 });
      }),
      0.6,
    ),

  // 2 bars of 16ths. Arrives late in the ANSWER ramp.
  'round-urgency': () =>
    normalize(
      renderLoop(4, 0.6, b => {
        const arp = [A4, E4, C5, E4];
        for (let i = 0; i < 32; i++) {
          tone(b, { freq: arp[i % arp.length], start: i * (BEAT / 4), dur: 0.11, gain: 0.16, wave: 'saw', env: { a: 0.002, d: 0.07, r: 0.03 } });
        }
        noise(b, { start: 3, dur: 1, gain: 0.14, cutoff: 4000, env: { a: 0.8, d: 0.2, s: 0.6, r: 0.2 } });
        reverb(b, { timeS: 0.12, mix: 0.26 });
      }),
      0.65,
    ),

  // 2 bars. Silent unless the final-question escalation is active.
  'round-dread': () =>
    normalize(
      renderLoop(4, 0.8, b => {
        tone(b, { freq: A2 / 2, dur: 4, gain: 0.34, wave: 'saw', env: { a: 0.6, d: 1, s: 0.8, r: 0.8 } });
        tone(b, { freq: D3, start: 0, dur: 4, gain: 0.12, wave: 'sine', bend: 1.06, env: { a: 1.2, d: 1, s: 0.7, r: 1 } });
        noise(b, { dur: 4, gain: 0.1, cutoff: 900, env: { a: 1, d: 1, s: 0.7, r: 1 } });
        reverb(b, { timeS: 0.3, mix: 0.4 });
      }),
      0.62,
    ),

  // 4 bars, brighter — the ceremony.
  'ceremony-bed': () =>
    normalize(
      renderLoop(8, 1, b => {
        const chord = [[A3, C4, E4], [G3, C4, E4], [D4 / 2, D4, G4], [A3, C4, E4]];
        for (let bar = 0; bar < 4; bar++) {
          for (const f of chord[bar]) {
            tone(b, { freq: f, start: bar * 2, dur: 1.9, gain: 0.16, wave: 'tri', env: { a: 0.08, d: 0.7, s: 0.5, r: 0.3 } });
          }
          kick(b, bar * 2, 0.4);
          kick(b, bar * 2 + 1, 0.3);
          hat(b, bar * 2 + 0.5, 0.12);
          hat(b, bar * 2 + 1.5, 0.12);
        }
        reverb(b, { timeS: 0.26, mix: 0.35 });
      }),
      0.6,
    ),
};

export { seed };
```

- [ ] **Step 4: Write the generator**

Create `scripts/audio/generate.mjs`:

```js
/**
 * Renders every sound in sounds.mjs, encodes it twice, and rewrites the
 * runtime manifest.
 *
 * PREREQUISITE: ffmpeg on PATH. This script is dev-time only — it is NOT run
 * by `npm run build`, `npm test`, `npm run dev` or CI. Its outputs
 * (public/audio/*, lib/audio/manifest.ts) are committed.
 *
 *   node scripts/audio/generate.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SR, writeWav } from './dsp.mjs';
import { BEDS, STINGS, seed } from './sounds.mjs';

const OUT_DIR = join(process.cwd(), 'public', 'audio');
const MANIFEST = join(process.cwd(), 'lib', 'audio', 'manifest.ts');

const ff = args => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);

mkdirSync(OUT_DIR, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'cb-audio-'));

const entries = [];
const all = [
  ...Object.entries(STINGS).map(([id, render]) => ({ id, render, loop: false })),
  ...Object.entries(BEDS).map(([id, render]) => ({ id, render, loop: true })),
];

for (const { id, render, loop } of all) {
  seed(0x51ce0000 + id.length * 7919); // per-sound, stable across runs
  const pcm = render();
  const wav = join(tmp, `${id}.wav`);
  writeWav(wav, pcm);

  ff(['-i', wav, '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000', '-ac', '1', join(OUT_DIR, `${id}.webm`)]);
  ff(['-i', wav, '-c:a', 'aac', '-b:a', '64k', '-ar', '44100', '-ac', '1', join(OUT_DIR, `${id}.m4a`)]);

  entries.push({ id, loop, durationMs: Math.round((pcm.length / SR) * 1000) });
  console.log(`${id.padEnd(18)} ${(pcm.length / SR).toFixed(2)}s ${loop ? 'loop' : 'one-shot'}`);
}

rmSync(tmp, { recursive: true, force: true });

const rows = entries
  .map(
    e =>
      `  '${e.id}': { src: ['/audio/${e.id}.webm', '/audio/${e.id}.m4a'], ` +
      `durationMs: ${e.durationMs}, loop: ${e.loop} },`,
  )
  .join('\n');

writeFileSync(
  MANIFEST,
  `/**
 * GENERATED by scripts/audio/generate.mjs — do not edit by hand.
 *
 * Edit the sound design in scripts/audio/sounds.mjs and rerun the generator
 * (requires ffmpeg). The .webm (Opus) source loops gaplessly and is preferred;
 * the .m4a (AAC) fallback carries encoder padding and seams very slightly.
 */

export interface SoundEntry {
  readonly src: readonly string[];
  readonly durationMs: number;
  readonly loop: boolean;
}

export const SOUNDS = {
${rows}
} as const satisfies Record<string, SoundEntry>;

export type SoundId = keyof typeof SOUNDS;
`,
  'utf8',
);

console.log(`\nwrote ${entries.length} sounds to public/audio and lib/audio/manifest.ts`);
```

- [ ] **Step 5: Run the generator**

Run: `mkdir -p lib/audio && node scripts/audio/generate.mjs`
Expected: 22 lines of `id  duration  kind`, then the summary. `public/audio/` holds 44 files and `lib/audio/manifest.ts` exists.

- [ ] **Step 6: Check the size budget and that it typechecks**

Run: `du -sh public/audio && npx tsc --noEmit`
Expected: total under 250 KB; tsc clean. If over budget, drop the Opus bitrate to `32k` and the AAC to `48k` in `generate.mjs` and rerun.

- [ ] **Step 7: Listen to them**

Play a handful (`public/audio/correct.m4a`, `final-sting.m4a`, `round-base.m4a`, `lobby-groove.m4a`) in any player. This is a sound-design review, not a pass/fail test: tune the numbers in `sounds.mjs` and rerun the generator until they read as a game show rather than a error beep. Confirm the loops do not click at the seam.

- [ ] **Step 8: Commit**

```bash
git add scripts/audio lib/audio/manifest.ts public/audio
git commit -m "feat(audio): generate the night-race sound identity from code

A dependency-free synthesis script renders 16 stings and 6 loop stems,
encodes each to Opus and AAC, and writes the runtime manifest. Seeded RNG,
so regenerating is byte-stable and diffable. ffmpeg is a dev-time
prerequisite only; the outputs are committed."
```

---

### Task 3: The pure audio state machine

Decides *when* sound happens. No Howler, no DOM, no store.

**Files:**
- Create: `lib/audio/design.ts`
- Create: `lib/audio/state.ts`
- Test: `tests/audioDesign.test.ts`
- Test: `tests/audioState.test.ts`

**Interfaces:**
- Consumes: `SoundId`, `SOUNDS` from `lib/audio/manifest.ts` (Task 2); `Cue`, `CueOf` from `lib/presentation/cues.ts` including `answer-resolved` (Task 1); `resolveTier` from `lib/presentation/celebration.ts`.
- Produces:
  - `design.ts`: `type MusicBed = 'lobby' | 'round' | 'ceremony'`; `BED_STEMS: Record<MusicBed, readonly SoundId[]>`; `ESCALATION_STEMS`, `DRIVE_STEM`, `URGENCY_STEM`; constants `BED_CROSSFADE_MS`, `REVEAL_DECAY_MS`, `DUCK_GAIN`, `DUCK_RELEASE_MS`, `UNLOCK_FADE_MS`; `driveGain(t: number): number`, `urgencyGain(t: number): number`; `stingFor(cue: Cue): SoundId | null`; `TRACK_DEFAULT_STING: SoundId`.
  - `state.ts`: `interface AudioState { bed: MusicBed; escalated: boolean; pending: DramaCue[]; catchUp: boolean }`; `initialAudioState`; `interface AudioStep { state: AudioState; stings: SoundId[] }`; `applyCue(state: AudioState, cue: Cue): AudioStep`; `endCatchUp(state: AudioState): AudioState`; `AUDIO_CUE_TYPES: readonly CueType[]`.

- [ ] **Step 1: Write the failing design tests**

Create `tests/audioDesign.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BED_STEMS, driveGain, stingFor, urgencyGain } from '@/lib/audio/design';
import { SOUNDS } from '@/lib/audio/manifest';
import type { Cue } from '@/lib/presentation/cues';

describe('stem tables', () => {
  it('names only sounds that exist and are loops', () => {
    for (const stems of Object.values(BED_STEMS)) {
      for (const id of stems) {
        expect(SOUNDS[id]).toBeDefined();
        expect(SOUNDS[id].loop).toBe(true);
      }
    }
  });
});

describe('gain curves', () => {
  it('drive opens from silence and is fully in before the end of the ramp', () => {
    expect(driveGain(0)).toBe(0);
    expect(driveGain(0.3)).toBeGreaterThan(0);
    expect(driveGain(0.3)).toBeLessThan(1);
    expect(driveGain(0.6)).toBe(1);
  });

  it('urgency stays silent through the first half and arrives late', () => {
    expect(urgencyGain(0)).toBe(0);
    expect(urgencyGain(0.4)).toBe(0);
    expect(urgencyGain(0.7)).toBeGreaterThan(0);
    expect(urgencyGain(1)).toBe(1);
  });

  it('urgency never leads drive', () => {
    for (let t = 0; t <= 1.0001; t += 0.05) {
      expect(urgencyGain(t)).toBeLessThanOrEqual(driveGain(t) + 1e-9);
    }
  });
});

describe('stingFor', () => {
  it('is silent for the cues that must never make a sound', () => {
    const advanced: Cue = { type: 'player-advanced', tier: 'routine', playerId: 'a', from: 0, to: 1 };
    const broken: Cue = { type: 'streak-broken', tier: 'routine', playerId: 'a' };
    expect(stingFor(advanced)).toBeNull();
    expect(stingFor(broken)).toBeNull();
  });

  it('is silent when the local player did not answer', () => {
    const cue: Cue = {
      type: 'answer-resolved', tier: 'routine',
      answered: false, correct: false, choiceIndex: null, correctIndex: 2,
    };
    expect(stingFor(cue)).toBeNull();
  });

  it('picks the streak sting by milestone', () => {
    const streak = (n: 3 | 5 | 8): Cue => ({ type: 'streak-tier', tier: 'streakMilestone', playerId: 'a', streak: n });
    expect(stingFor(streak(3))).toBe('streak-3');
    expect(stingFor(streak(5))).toBe('streak-5');
    expect(stingFor(streak(8))).toBe('streak-8');
  });

  it('only ever names sounds that exist', () => {
    const samples: Cue[] = [
      { type: 'phase-countdown', tier: 'routine', endsAt: null },
      { type: 'phase-read', tier: 'routine', round: 1, category: null, questionTier: null, isFinal: false },
      { type: 'phase-answer', tier: 'routine', round: 1, endsAt: null },
      { type: 'phase-reveal', tier: 'routine', round: 1, correctIndex: 0, counts: [], fastest: null },
      { type: 'answer-locked', tier: 'routine', choiceIndex: 0 },
      { type: 'answer-resolved', tier: 'routine', answered: true, correct: true, choiceIndex: 0, correctIndex: 0 },
      { type: 'overtake', tier: 'overtake', playerId: 'a', passed: ['b'] },
      { type: 'lead-changed', tier: 'overtake', playerId: 'a', previousLeaderId: 'b' },
      { type: 'final-question', tier: 'finalQuestion', round: 3 },
      { type: 'podium', tier: 'victory', top: [] },
      { type: 'player-joined', tier: 'routine', playerId: 'a', nickname: 'A', avatar: 'duck', color: '#fff' },
    ];
    for (const cue of samples) {
      const id = stingFor(cue);
      expect(id, cue.type).not.toBeNull();
      expect(SOUNDS[id!]).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Write the failing state tests**

Create `tests/audioState.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyCue, endCatchUp, initialAudioState, type AudioState } from '@/lib/audio/state';
import type { Cue } from '@/lib/presentation/cues';
import type { SoundId } from '@/lib/audio/manifest';

const countdown: Cue = { type: 'phase-countdown', tier: 'routine', endsAt: null };
const read: Cue = { type: 'phase-read', tier: 'routine', round: 1, category: null, questionTier: null, isFinal: false };
const answer: Cue = { type: 'phase-answer', tier: 'routine', round: 1, endsAt: null };
const reveal: Cue = { type: 'phase-reveal', tier: 'routine', round: 1, correctIndex: 0, counts: [], fastest: null };
const track: Cue = { type: 'phase-track', tier: 'routine', round: 1 };
const results: Cue = { type: 'phase-results', tier: 'routine' };
const overtake: Cue = { type: 'overtake', tier: 'overtake', playerId: 'a', passed: ['b'] };
const streak3: Cue = { type: 'streak-tier', tier: 'streakMilestone', playerId: 'a', streak: 3 };
const finalQ: Cue = { type: 'final-question', tier: 'finalQuestion', round: 3 };
const podium: Cue = { type: 'podium', tier: 'victory', top: [] };
const resolved = (correct: boolean, answered = true): Cue => ({
  type: 'answer-resolved', tier: 'routine', answered, correct, choiceIndex: answered ? 0 : null, correctIndex: 0,
});

/** Feed cues through the machine, collecting every sting it asked for. */
function run(cues: Cue[], start: AudioState = { ...initialAudioState, catchUp: false }) {
  let state = start;
  const stings: SoundId[] = [];
  for (const cue of cues) {
    const step = applyCue(state, cue);
    state = step.state;
    stings.push(...step.stings);
  }
  return { state, stings };
}

describe('beds', () => {
  it('starts in the lobby and never needs a lobby cue', () => {
    expect(initialAudioState.bed).toBe('lobby');
  });

  it('walks lobby -> round -> ceremony over a game', () => {
    const beds: string[] = [];
    let state: AudioState = { ...initialAudioState, catchUp: false };
    for (const cue of [countdown, read, answer, reveal, track, results]) {
      state = applyCue(state, cue).state;
      beds.push(state.bed);
    }
    expect(beds).toEqual(['round', 'round', 'round', 'round', 'round', 'ceremony']);
  });

  it('enters the round bed from any phase cue, not just the countdown', () => {
    for (const cue of [read, answer, reveal, track]) {
      expect(run([cue]).state.bed).toBe('round');
    }
  });
});

describe('escalation', () => {
  it('sets escalated the instant final-question is seen, without waiting for the track beat', () => {
    const { state } = run([finalQ]);
    expect(state.escalated).toBe(true);
  });

  it('stays escalated when a reload seeds straight into the final READ', () => {
    // deriveCues seeds final-question ahead of the beat; catch-up must still take it.
    let state = initialAudioState; // catchUp: true
    state = applyCue(state, finalQ).state;
    state = applyCue(state, read).state;
    expect(state.escalated).toBe(true);
    expect(state.bed).toBe('round');
  });
});

describe('catch-up', () => {
  it('applies the bed but plays no stings', () => {
    let state = initialAudioState;
    const stings: SoundId[] = [];
    for (const cue of [finalQ, read]) {
      const step = applyCue(state, cue);
      state = step.state;
      stings.push(...step.stings);
    }
    expect(stings).toEqual([]);
    expect(state.bed).toBe('round');
    expect(state.escalated).toBe(true);
  });

  it('plays normally once catch-up has ended', () => {
    const state = endCatchUp(applyCue(initialAudioState, read).state);
    expect(state.catchUp).toBe(false);
    expect(applyCue(state, resolved(true)).stings).toEqual(['correct']);
  });

  it('endCatchUp is idempotent', () => {
    const once = endCatchUp(initialAudioState);
    expect(endCatchUp(once)).toEqual(once);
  });
});

describe('drama buffering', () => {
  it('makes no sound at the reveal and one at the track beat', () => {
    const beforeTrack = run([reveal, overtake, streak3]);
    expect(beforeTrack.stings).toEqual(['reveal-hit']);
    expect(beforeTrack.state.pending).toHaveLength(2);

    const step = applyCue(beforeTrack.state, track);
    expect(step.stings).toEqual(['overtake-whoosh']);
    expect(step.state.pending).toEqual([]);
  });

  it('lets the highest tier win: final-question outranks an overtake', () => {
    const { stings } = run([reveal, overtake, finalQ, track]);
    expect(stings).toEqual(['reveal-hit', 'final-sting']);
  });

  it('falls back to the track whoosh when nothing dramatic happened', () => {
    expect(run([track]).stings).toEqual(['track-whoosh']);
  });

  it('drops stale drama if a READ arrives without an intervening track beat', () => {
    const { state } = run([overtake, read]);
    expect(state.pending).toEqual([]);
    expect(applyCue(state, track).stings).toEqual(['track-whoosh']);
  });

  it('clears the buffer at the results beat', () => {
    expect(run([overtake, results]).state.pending).toEqual([]);
  });
});

describe('one-shot stings', () => {
  it('plays the personal verdict at the reveal, and silence when unanswered', () => {
    expect(run([resolved(true)]).stings).toEqual(['correct']);
    expect(run([resolved(false)]).stings).toEqual(['wrong-soft']);
    expect(run([resolved(false, false)]).stings).toEqual([]);
  });

  it('plays the fanfare on the podium cue, not on phase-results', () => {
    expect(run([results]).stings).toEqual([]);
    expect(run([podium]).stings).toEqual(['fanfare']);
  });
});
```

- [ ] **Step 3: Run both suites to verify they fail**

Run: `npm test -- tests/audioDesign.test.ts tests/audioState.test.ts`
Expected: FAIL — `Cannot find module '@/lib/audio/design'` / `'@/lib/audio/state'`.

- [ ] **Step 4: Write `design.ts`**

Create `lib/audio/design.ts`:

```ts
/**
 * The night-race audio identity, as data (spec §4).
 *
 * This module answers WHAT a moment sounds like. `state.ts` answers WHEN.
 * That split is cross-cutting constraint 3: identity is world content, the
 * choreography rules around it are world-agnostic.
 */
import type { Cue } from '@/lib/presentation/cues';
import type { SoundId } from './manifest';

export type MusicBed = 'lobby' | 'round' | 'ceremony';

export const BED_STEMS = {
  lobby: ['lobby-groove'],
  round: ['round-base', 'round-drive', 'round-urgency', 'round-dread'],
  ceremony: ['ceremony-bed'],
} as const satisfies Record<MusicBed, readonly SoundId[]>;

/** Stems held at silence unless the final-question escalation is active. */
export const ESCALATION_STEMS: readonly SoundId[] = ['round-dread'];

/** The two stems the ANSWER tension ramp drives. Every other stem sits at 1. */
export const DRIVE_STEM: SoundId = 'round-drive';
export const URGENCY_STEM: SoundId = 'round-urgency';

export const BED_CROSSFADE_MS = 600;
export const REVEAL_DECAY_MS = 400;
export const UNLOCK_FADE_MS = 800;
/** Roughly -6 dB. */
export const DUCK_GAIN = 0.5;
export const DUCK_ATTACK_MS = 60;
export const DUCK_RELEASE_MS = 250;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Opens from the very start of the ramp; fully in at t = 0.55. */
export const driveGain = (t: number): number => clamp01(t / 0.55);
/** Silent until t = 0.45, so it arrives after `drive` rather than with it. */
export const urgencyGain = (t: number): number => clamp01((t - 0.45) / 0.55);

/** Played when a TRACK beat has no drama to announce. */
export const TRACK_DEFAULT_STING: SoundId = 'track-whoosh';

/**
 * The sound a cue makes, in isolation. `null` means deliberate silence:
 * `player-advanced` would be mush at one per advancing player, `streak-broken`
 * would be mockery (PRD §8), and `phase-track` is arbitrated in `state.ts`.
 */
export function stingFor(cue: Cue): SoundId | null {
  switch (cue.type) {
    case 'player-joined': return 'join-blip';
    case 'phase-countdown': return 'countdown-riser';
    case 'phase-read': return 'category-slam';
    case 'phase-answer': return 'answer-open';
    case 'answer-locked': return 'lock';
    case 'phase-reveal': return 'reveal-hit';
    case 'answer-resolved':
      return cue.answered ? (cue.correct ? 'correct' : 'wrong-soft') : null;
    case 'overtake': return 'overtake-whoosh';
    case 'lead-changed': return 'lead-flourish';
    case 'streak-tier':
      return cue.streak === 3 ? 'streak-3' : cue.streak === 5 ? 'streak-5' : 'streak-8';
    case 'final-question': return 'final-sting';
    case 'podium': return 'fanfare';
    default: return null;
  }
}
```

- [ ] **Step 5: Write `state.ts`**

Create `lib/audio/state.ts`:

```ts
/**
 * The audio state machine (spec §5-§6) — pure. No Howler, no DOM, no store.
 *
 * Two rules carry most of the weight:
 *   - drama buffers to the TRACK beat, so the sound lands with the picture
 *     (ADR-0009), and exactly one headline plays per beat;
 *   - the first cue batch is CATCH-UP: beds apply, stings do not, so a reload
 *     lands in the right sonic state without replaying the show (ADR-0024).
 */
import { resolveTier } from '@/lib/presentation/celebration';
import type { Cue, CueOf, CueType } from '@/lib/presentation/cues';
import { stingFor, TRACK_DEFAULT_STING, type MusicBed } from './design';
import type { SoundId } from './manifest';

export type DramaCue =
  | CueOf<'overtake'>
  | CueOf<'lead-changed'>
  | CueOf<'streak-tier'>
  | CueOf<'final-question'>;

const DRAMA_TYPES = ['overtake', 'lead-changed', 'streak-tier', 'final-question'] as const;
const DRAMA: ReadonlySet<CueType> = new Set(DRAMA_TYPES);

/** Every cue type the audio runtime subscribes to. */
export const AUDIO_CUE_TYPES: readonly CueType[] = [
  'phase-countdown', 'phase-read', 'phase-answer', 'phase-reveal', 'phase-track', 'phase-results',
  'answer-locked', 'answer-resolved', 'player-joined', 'podium',
  ...DRAMA_TYPES,
];

export interface AudioState {
  bed: MusicBed;
  escalated: boolean;
  /** Drama seen at the reveal, waiting for its TRACK beat. */
  pending: DramaCue[];
  /** True until the runtime has seen a full emission tick; suppresses stings. */
  catchUp: boolean;
}

export const initialAudioState: AudioState = {
  bed: 'lobby',
  escalated: false,
  pending: [],
  catchUp: true,
};

export interface AudioStep {
  state: AudioState;
  stings: SoundId[];
}

export function endCatchUp(state: AudioState): AudioState {
  return state.catchUp ? { ...state, catchUp: false } : state;
}

export function applyCue(state: AudioState, cue: Cue): AudioStep {
  let next = state;
  let stings: SoundId[] = [];

  switch (cue.type) {
    case 'phase-countdown':
    case 'phase-read':
    case 'phase-answer':
    case 'phase-reveal':
    case 'phase-track':
      if (next.bed !== 'round') next = { ...next, bed: 'round' };
      break;
    case 'phase-results':
      next = { ...next, bed: 'ceremony', pending: [] };
      break;
    default:
      break;
  }

  // Set on SIGHT, never deferred to the beat that resolves it: a reload can
  // seed this cue directly into the final round's READ, ANSWER or REVEAL, none
  // of which reach the arbitration below (ADR-0021).
  if (cue.type === 'final-question') next = { ...next, escalated: true };

  if (DRAMA.has(cue.type)) {
    next = { ...next, pending: [...next.pending, cue as DramaCue] };
  } else if (cue.type === 'phase-track') {
    const headline = pickHeadline(next.pending);
    stings = [(headline && stingFor(headline)) || TRACK_DEFAULT_STING];
    next = { ...next, pending: [] };
  } else if (cue.type === 'phase-read') {
    // A READ without an intervening TRACK means the drama's moment has passed.
    if (next.pending.length > 0) next = { ...next, pending: [] };
    const id = stingFor(cue);
    if (id) stings = [id];
  } else {
    const id = stingFor(cue);
    if (id) stings = [id];
  }

  if (next.catchUp) stings = [];
  return { state: next, stings };
}

/** One headline per beat, highest celebration tier wins, ties by arrival. */
function pickHeadline(pending: readonly DramaCue[]): DramaCue | null {
  if (pending.length === 0) return null;
  const top = resolveTier(pending);
  return pending.find(cue => cue.tier === top) ?? null;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all suites.

- [ ] **Step 7: Commit**

```bash
git add lib/audio/design.ts lib/audio/state.ts tests/audioDesign.test.ts tests/audioState.test.ts
git commit -m "feat(audio): the pure audio state machine

design.ts says what a moment sounds like, state.ts says when. Drama
buffers to the TRACK beat so sound lands with the picture and exactly one
headline plays per beat; the first batch is catch-up, so a reload adopts
the right bed without replaying the show."
```

---

### Task 4: The mixer and the runtime

The impure half: Howler playback, the unlock gate, and the cue-bus subscription. Verified by hand in a browser plus one unit test for the no-audio-device fallback.

**Files:**
- Create: `lib/audio/mixer.ts`
- Create: `lib/audio/runtime.ts`
- Test: `tests/audioMixer.test.ts`
- Modify: `app/room/[code]/page.tsx`

**Interfaces:**
- Consumes: `AudioState`, `applyCue`, `endCatchUp`, `initialAudioState`, `AUDIO_CUE_TYPES` (Task 3); `BED_STEMS`, `ESCALATION_STEMS`, `DRIVE_STEM`, `URGENCY_STEM`, and the timing constants (Task 3); `SOUNDS`, `SoundId` (Task 2); `on` from `lib/presentation/cueBus`.
- Produces:
  - `mixer.ts`: `interface Mixer { readonly dead: boolean; unlock(): void; setBed(bed: MusicBed, escalated: boolean): void; setStemGain(stem: SoundId, gain: number, fadeMs?: number): void; play(id: SoundId): void; duck(ms: number): void; setMuted(muted: boolean): void; destroy(): void }` and `createMixer(): Mixer`.
  - `runtime.ts`: `startAudioRuntime(): () => void`.

**Note on the signature.** The spec sketched `startAudioRuntime(code)`. It takes no argument: `answer-resolved` (Task 1) removed the only reason audio would have needed the session lookup. Record the simplification in Task 7's progress doc.

- [ ] **Step 1: Write the failing mixer test**

Create `tests/audioMixer.test.ts`. It runs in Node, where `window` is undefined — which is exactly the "no audio device" path.

```ts
import { describe, expect, it } from 'vitest';
import { createMixer } from '@/lib/audio/mixer';

describe('mixer without a browser audio device', () => {
  it('reports itself dead rather than throwing', () => {
    const mixer = createMixer();
    expect(mixer.dead).toBe(true);
  });

  it('makes every method a safe no-op', () => {
    const mixer = createMixer();
    expect(() => {
      mixer.unlock();
      mixer.setBed('round', true);
      mixer.setStemGain('round-drive', 0.5, 120);
      mixer.play('correct');
      mixer.duck(400);
      mixer.setMuted(true);
      mixer.destroy();
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/audioMixer.test.ts`
Expected: FAIL — `Cannot find module '@/lib/audio/mixer'`.

- [ ] **Step 3: Write the mixer**

Create `lib/audio/mixer.ts`:

```ts
/**
 * The Howler wrapper (spec §7). Knows about sound ids, gains and beds —
 * nothing about cues, phases or players. Not unit-tested beyond the dead-mixer
 * fallback; every decision it makes lives in state.ts or design.ts.
 */
import { Howl, Howler } from 'howler';
import {
  BED_CROSSFADE_MS,
  BED_STEMS,
  DRIVE_STEM,
  DUCK_ATTACK_MS,
  DUCK_GAIN,
  DUCK_RELEASE_MS,
  ESCALATION_STEMS,
  UNLOCK_FADE_MS,
  URGENCY_STEM,
  type MusicBed,
} from './design';
import { SOUNDS, type SoundId } from './manifest';

export interface Mixer {
  readonly dead: boolean;
  unlock(): void;
  setBed(bed: MusicBed, escalated: boolean): void;
  setStemGain(stem: SoundId, gain: number, fadeMs?: number): void;
  play(id: SoundId): void;
  duck(ms: number): void;
  setMuted(muted: boolean): void;
  destroy(): void;
}

/**
 * The fallback. Headless Chromium has no audio device, and the whole e2e
 * regression floor runs there — audio degrades to silence, never to a crash.
 */
const DEAD: Mixer = {
  dead: true,
  unlock() {}, setBed() {}, setStemGain() {}, play() {},
  duck() {}, setMuted() {}, destroy() {},
};

export function createMixer(): Mixer {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return DEAD;

  const howls = new Map<SoundId, Howl>();
  /** Per-stem target gain before the duck multiplier. */
  const targets = new Map<SoundId, number>();

  let unlocked = false;
  let bed: MusicBed | null = null;
  let escalated = false;
  let duckMultiplier = 1;
  let duckTimer: ReturnType<typeof setTimeout> | null = null;
  const stopTimers = new Set<ReturnType<typeof setTimeout>>();

  const howlFor = (id: SoundId): Howl | null => {
    const existing = howls.get(id);
    if (existing) return existing;
    try {
      const entry = SOUNDS[id];
      const howl = new Howl({
        src: [...entry.src],
        loop: entry.loop,
        volume: entry.loop ? 0 : 1,
        preload: true,
        html5: false,
      });
      howls.set(id, howl);
      return howl;
    } catch {
      return null;
    }
  };

  const applyStem = (id: SoundId, fadeMs: number): void => {
    const howl = howlFor(id);
    if (!howl) return;
    const target = (targets.get(id) ?? 0) * duckMultiplier;
    if (!unlocked) {
      howl.volume(target);
      return;
    }
    if (!howl.playing()) {
      // Start mid-loop, not from bar one — you have joined a show already in
      // progress. Deterministic rather than random so reloads sound the same.
      const durationS = SOUNDS[id].durationMs / 1000;
      howl.volume(0);
      howl.play();
      if (durationS > 0) howl.seek((performance.now() / 1000) % durationS);
    }
    howl.fade(howl.volume() as number, target, Math.max(0, fadeMs));
  };

  const applyBedStems = (fadeMs: number): void => {
    if (!bed) return;
    for (const id of BED_STEMS[bed]) {
      const gated = ESCALATION_STEMS.includes(id) && !escalated;
      const driven = id === DRIVE_STEM || id === URGENCY_STEM;
      if (gated) targets.set(id, 0);
      else if (!driven) targets.set(id, 1);
      else if (!targets.has(id)) targets.set(id, 0);
      applyStem(id, fadeMs);
    }
  };

  return {
    dead: false,

    unlock() {
      if (unlocked) return;
      unlocked = true;
      try {
        Howler.ctx?.resume();
      } catch {
        // Already running, or the context is gone; the fades below still apply.
      }
      applyBedStems(UNLOCK_FADE_MS);
    },

    setBed(nextBed, nextEscalated) {
      if (bed === nextBed && escalated === nextEscalated) return;
      const previous = bed;
      bed = nextBed;
      escalated = nextEscalated;

      if (previous && previous !== nextBed) {
        const retiring = BED_STEMS[previous];
        for (const id of retiring) {
          targets.set(id, 0);
          applyStem(id, BED_CROSSFADE_MS);
        }
        const timer = setTimeout(() => {
          for (const id of retiring) howls.get(id)?.stop();
          stopTimers.delete(timer);
        }, BED_CROSSFADE_MS + 60);
        stopTimers.add(timer);
      }

      applyBedStems(BED_CROSSFADE_MS);
    },

    setStemGain(stem, gain, fadeMs = 0) {
      if (targets.get(stem) === gain) return;
      targets.set(stem, gain);
      applyStem(stem, fadeMs);
    },

    play(id) {
      if (!unlocked) return;
      howlFor(id)?.play();
    },

    duck(ms) {
      duckMultiplier = DUCK_GAIN;
      applyBedStems(DUCK_ATTACK_MS);
      if (duckTimer) clearTimeout(duckTimer);
      duckTimer = setTimeout(() => {
        duckMultiplier = 1;
        applyBedStems(DUCK_RELEASE_MS);
        duckTimer = null;
      }, Math.max(0, ms));
    },

    setMuted(muted) {
      try {
        Howler.mute(muted);
      } catch {
        // No context yet; the next setMuted after unlock carries the value.
      }
    },

    destroy() {
      if (duckTimer) clearTimeout(duckTimer);
      for (const timer of stopTimers) clearTimeout(timer);
      stopTimers.clear();
      for (const howl of howls.values()) howl.unload();
      howls.clear();
      targets.clear();
      try {
        Howler.mute(false);
      } catch {
        // Nothing to restore.
      }
    },
  };
}
```

- [ ] **Step 4: Run the mixer test to verify it passes**

Run: `npm test -- tests/audioMixer.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the runtime**

Create `lib/audio/runtime.ts`. The gain ticker is added in Task 5; this task wires cues, unlock and the bed.

```ts
/**
 * The audio runtime (spec §7): the third and last cueBus subscriber.
 *
 * Not unit-tested by design — every decision it makes lives in state.ts or
 * design.ts, which are.
 */
import { on } from '@/lib/presentation/cueBus';
import { SOUNDS } from './manifest';
import { createMixer } from './mixer';
import { applyCue, AUDIO_CUE_TYPES, endCatchUp, initialAudioState, type AudioState } from './state';
import { DUCK_RELEASE_MS } from './design';
import { tierRank } from '@/lib/presentation/celebration';

export function startAudioRuntime(): () => void {
  const mixer = createMixer();
  let state: AudioState = initialAudioState;
  let catchUpScheduled = false;

  const syncBed = () => mixer.setBed(state.bed, state.escalated);
  syncBed(); // the lobby bed is the initial state, and has no cue of its own

  const unsubscribes = AUDIO_CUE_TYPES.map(type =>
    on(type, cue => {
      // The seed batch is emitted synchronously in one loop inside
      // startCueBridge, so a microtask queued on the FIRST cue runs only after
      // the entire batch has been applied. That is the exact boundary between
      // "catching up on a reload" and "the show is happening now".
      if (!catchUpScheduled) {
        catchUpScheduled = true;
        queueMicrotask(() => {
          state = endCatchUp(state);
        });
      }

      const step = applyCue(state, cue);
      state = step.state;
      syncBed();

      for (const id of step.stings) {
        mixer.play(id);
        if (tierRank(cue.tier) >= tierRank('overtake')) {
          mixer.duck(SOUNDS[id].durationMs + DUCK_RELEASE_MS);
        }
      }
    }),
  );

  const unlock = () => mixer.unlock();
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });

  return () => {
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('keydown', unlock);
    for (const off of unsubscribes) off();
    mixer.destroy();
  };
}
```

- [ ] **Step 6: Mount it — before the cue bridge**

In `app/room/[code]/page.tsx`, add the import and insert the effect **above** the existing `startCueBridge` effect at line 30:

```tsx
import { startAudioRuntime } from '@/lib/audio/runtime';
```

```tsx
  // MOUNTED FIRST, deliberately: startCueBridge seeds synchronously from the
  // store on mount, so a subscriber registered after it would miss the whole
  // seed batch on a client-side navigation into a room already in the store.
  useEffect(() => startAudioRuntime(), []);
  useEffect(() => startCueBridge(), []);
  useEffect(() => startStagingRuntime(code), [code]);
```

- [ ] **Step 7: Verify by hand in a headed browser**

Run: `npm run dev`, then open two windows on a room, host a 3-round game and click through it.
Expected: nothing plays before your first click; from then on you hear the lobby groove, then the countdown riser, category slam, lock click, reveal hit, your correct/wrong verdict, and a whoosh at each track beat. Reload mid-round: the bed continues and **no** stinger replays.

- [ ] **Step 8: Run the full suites**

Run: `npm test` then `npm run test:e2e -- --workers=2`
Expected: PASS. If e2e regressed, the mixer is not degrading correctly under headless Chromium — fix `createMixer`, not the tests.

- [ ] **Step 9: Commit**

```bash
git add lib/audio/mixer.ts lib/audio/runtime.ts tests/audioMixer.test.ts app/room/\[code\]/page.tsx
git commit -m "feat(audio): mix and run the cue-driven soundtrack

Third cueBus subscriber, mounted ahead of the bridge so it receives the
seed batch. Nothing sounds before the first gesture; a microtask queued on
the first cue ends catch-up exactly at the batch boundary. No audio device
yields a dead mixer whose every method is a no-op, so headless e2e is
unaffected."
```

---

### Task 5: Music beds — tension gains, decay and escalation

Wires the ANSWER ramp to the stems and makes the reduced profile step instead of ramp.

**Files:**
- Modify: `lib/audio/runtime.ts`

**Interfaces:**
- Consumes: `driveGain`, `urgencyGain`, `DRIVE_STEM`, `URGENCY_STEM`, `REVEAL_DECAY_MS` (Task 3); `tensionAt`, `tensionStep` from `lib/staging/tension`; `msUntil` from `lib/serverTime`; `useGameStore`, `useSettings`.
- Produces: no new exports.

- [ ] **Step 1: Add the gain ticker to the runtime**

In `lib/audio/runtime.ts`, add these imports:

```ts
import { msUntil } from '@/lib/serverTime';
import { useGameStore } from '@/lib/store';
import { useSettings } from '@/lib/useSettings';
import { tensionAt, tensionStep } from '@/lib/staging/tension';
import { driveGain, DRIVE_STEM, REVEAL_DECAY_MS, urgencyGain, URGENCY_STEM } from './design';
```

and insert this block after the `unlock` listeners, before the returned teardown:

```ts
  // The ANSWER ramp. Deliberately re-reads the store for the CLOCK only —
  // exactly as lib/staging/runtime.ts does — and calls the same pure
  // `tensionAt` the vignette calls, so audio and picture cannot drift.
  let wasAnswer = false;
  let lastStep = -1;
  let frame = requestAnimationFrame(function tick() {
    frame = requestAnimationFrame(tick);

    const { room, myAnswer } = useGameStore.getState();
    if (room?.phase !== 'answer') {
      if (wasAnswer) {
        wasAnswer = false;
        lastStep = -1;
        mixer.setStemGain(DRIVE_STEM, 0, REVEAL_DECAY_MS);
        mixer.setStemGain(URGENCY_STEM, 0, REVEAL_DECAY_MS);
      }
      return;
    }
    wasAnswer = true;

    // Locked in: the gains FREEZE where they are. You are out of the decision,
    // the room is not (lib/staging/runtime.ts:151).
    if (myAnswer !== null) return;

    const totalMs = room.timer_seconds * 1000;
    const raw = tensionAt(room.ends_at ? msUntil(room.ends_at) : null, totalMs);

    if (useSettings.getState().profile === 'reduced') {
      // Three discrete levels, written only when the step changes: a
      // per-frame ramp there is work with no audible result.
      const step = tensionStep(raw);
      if (step === lastStep) return;
      lastStep = step;
      const t = step / 3;
      mixer.setStemGain(DRIVE_STEM, driveGain(t), 180);
      mixer.setStemGain(URGENCY_STEM, urgencyGain(t), 180);
      return;
    }

    mixer.setStemGain(DRIVE_STEM, driveGain(raw));
    mixer.setStemGain(URGENCY_STEM, urgencyGain(raw));
  });
```

and add `cancelAnimationFrame(frame);` as the first line of the returned teardown.

- [ ] **Step 2: Typecheck and run the unit suites**

Run: `npx tsc --noEmit && npm test`
Expected: PASS. (`timer_seconds: number` is a non-optional field on `RoomInfo`, `lib/types.ts:9` — verified, no null guard needed.)

- [ ] **Step 3: Verify the ramp by hand, headed**

Run: `npm run dev`, host a game with a 20-second timer, and sit through one ANSWER beat without answering.
Expected: the bed thickens as the clock runs down — `round-drive` first, `round-urgency` clearly later — and drops back to `round-base` alone at the reveal. Answer early on the next round: the thickening **stops** at the moment you lock in and holds until the reveal.

- [ ] **Step 4: Verify the escalation and the reduced profile, headed**

Play a 2-round game through to the final question.
Expected: on the run-up TRACK beat the final sting plays as the headline and `round-dread` fades in under the bed; it stays for the whole final round. Reload during the final READ — the dread stem is **already** there and the sting does not replay.

Then set Motion to "Reduced motion" in the gear popover and play another ANSWER beat.
Expected: the stems arrive in three audible steps rather than a slide.

- [ ] **Step 5: Run the full suites and commit**

Run: `npm test && npm run test:e2e -- --workers=2`
Expected: PASS.

```bash
git add lib/audio/runtime.ts
git commit -m "feat(audio): drive the answer bed from the vignette's own ramp

Stem gains call the same pure tensionAt the tension vignette calls, with
the same inputs, so audio and picture cannot disagree - including the
freeze at lock-in. The reduced profile steps at three levels and writes
only on change."
```

---

### Task 6: The mute toggle

One per-device toggle, persisted, published to the DOM so Playwright can see it.

**Files:**
- Create: `lib/audio/mutePreference.ts`
- Create: `components/ui/Checkbox.tsx`
- Modify: `lib/useSettings.ts`
- Modify: `components/SettingsControl.tsx`
- Modify: `lib/audio/runtime.ts`
- Test: `e2e/settings.spec.ts`

**Interfaces:**
- Consumes: `useSettings` (existing store); `Mixer.setMuted` (Task 4).
- Produces: `MUTED_STORAGE_KEY`, `loadMuted(): boolean`, `saveMuted(value: boolean): void`; `SettingsState` gains `muted: boolean` and `setMuted(value: boolean): void`; `<Checkbox label checked onChange />`.

- [ ] **Step 1: Write the failing e2e tests**

Append to `e2e/settings.spec.ts`, inside the existing `performance profile settings` describe or a new `audio settings` describe:

```ts
test.describe('audio settings', () => {
  test('publishes an unmuted default and toggles to muted', async ({ page }) => {
    await page.goto('/room/ZZZZZ');
    await expect(page.locator('html')).toHaveAttribute('data-muted', 'false');

    await page.getByRole('button', { name: 'Display settings' }).click();
    await page.getByLabel('Mute sound').check();
    await expect(page.locator('html')).toHaveAttribute('data-muted', 'true');
  });

  test('the mute choice survives a reload', async ({ page }) => {
    await page.goto('/room/ZZZZZ');
    await page.getByRole('button', { name: 'Display settings' }).click();
    await page.getByLabel('Mute sound').check();

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-muted', 'true');
    await page.getByRole('button', { name: 'Display settings' }).click();
    await expect(page.getByLabel('Mute sound')).toBeChecked();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:e2e -- --workers=2 e2e/settings.spec.ts`
Expected: FAIL — no `data-muted` attribute, no "Mute sound" control.

- [ ] **Step 3: Write the persistence helpers**

Create `lib/audio/mutePreference.ts`:

```ts
/**
 * Per-device mute preference. Browser-only; never throws — a private-mode
 * storage failure just means the choice does not persist, exactly as
 * lib/presentation/profile.ts handles the motion override.
 */
export const MUTED_STORAGE_KEY = 'cb:settings:muted';

export function loadMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(MUTED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveMuted(value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MUTED_STORAGE_KEY, String(value));
  } catch {
    // Storage unavailable; the choice simply won't persist.
  }
}
```

- [ ] **Step 4: Extend the settings store**

In `lib/useSettings.ts`, add the import:

```ts
import { loadMuted, saveMuted } from './audio/mutePreference';
```

Add to `SettingsState`:

```ts
  /** Per-device audio mute. Later phases read exactly this. */
  muted: boolean;
  setMuted(value: boolean): void;
```

Replace `publish` and extend the store body:

```ts
/** Publish to CSS/DOM so stylesheets and tests can respond without a React render. */
function publish(profile: Profile, muted: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.profile = profile;
  document.documentElement.dataset.muted = String(muted);
}
```

```ts
  hydrated: false,
  override: 'auto',
  profile: 'high',
  muted: false,

  hydrate() {
    if (get().hydrated) return;
    const override = loadOverride();
    const muted = loadMuted();
    const profile = resolveProfile(readDeviceSignals(), override);
    publish(profile, muted);
    set({ hydrated: true, override, profile, muted });
  },

  setOverride(value) {
    saveOverride(value);
    const profile = resolveProfile(readDeviceSignals(), value);
    publish(profile, get().muted);
    set({ override: value, profile });
  },

  setMuted(value) {
    saveMuted(value);
    publish(get().profile, value);
    set({ muted: value });
  },
```

- [ ] **Step 5: Write the checkbox primitive**

Create `components/ui/Checkbox.tsx`, matching `Select.tsx`'s label treatment:

```tsx
import { useId, type ComponentProps } from 'react';

interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type'> {
  label: string;
}

export default function Checkbox({ label, className = '', id, ...rest }: CheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="flex items-center gap-2.5">
      <input
        {...rest}
        type="checkbox"
        id={inputId}
        className={
          'h-4 w-4 shrink-0 cursor-pointer rounded-sm border border-haze/80 bg-abyss/80 ' +
          'accent-neon-cyan focus-visible:outline-2 focus-visible:outline-offset-2 ' +
          'focus-visible:outline-neon-cyan ' +
          className
        }
      />
      <label
        htmlFor={inputId}
        className="cursor-pointer font-display text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-ink-mute"
      >
        {label}
      </label>
    </div>
  );
}
```

- [ ] **Step 6: Add it to the settings popover**

In `components/SettingsControl.tsx`: import `Checkbox from '@/components/ui/Checkbox'`, read `const muted = useSettings(s => s.muted)` and `const setMuted = useSettings(s => s.setMuted)`, and insert between the `<Select>` and the profile `<p>`:

```tsx
          <div className="mt-4 border-t border-haze/50 pt-4">
            <Checkbox
              label="Mute sound"
              checked={muted}
              onChange={event => setMuted(event.target.checked)}
            />
          </div>
```

Update the component's doc comment: replace `P4 adds its mute toggle to this popover.` with `Carries the motion profile and the audio mute toggle.`

- [ ] **Step 7: Subscribe the runtime to the mute state**

In `lib/audio/runtime.ts`, after `syncBed()`:

```ts
  // Muting silences Howler globally but the state machine keeps running, so
  // unmuting mid-game lands on the right bed at the right point rather than
  // restarting a loop from bar one.
  mixer.setMuted(useSettings.getState().muted);
  const unsubscribeMute = useSettings.subscribe(settings => mixer.setMuted(settings.muted));
```

and call `unsubscribeMute();` in the teardown.

- [ ] **Step 8: Run the e2e tests to verify they pass**

Run: `npm run test:e2e -- --workers=2 e2e/settings.spec.ts`
Expected: PASS.

- [ ] **Step 9: Verify muting by hand, headed**

Run: `npm run dev`, join a room, click to unlock audio, then tick "Mute sound".
Expected: sound stops immediately. Untick it mid-round: the bed resumes at the point the game is actually at, not from the top.

- [ ] **Step 10: Run the full suites and commit**

Run: `npm test && npm run test:e2e -- --workers=2`
Expected: PASS.

```bash
git add lib/audio/mutePreference.ts lib/useSettings.ts components/ui/Checkbox.tsx components/SettingsControl.tsx lib/audio/runtime.ts e2e/settings.spec.ts
git commit -m "feat(audio): per-device mute toggle, persisted

One toggle in the existing gear popover, stored at cb:settings:muted and
published to data-muted alongside data-profile. The state machine keeps
running while muted so unmuting resumes in the right place."
```

---

### Task 7: Verification, ADRs and phase close

**Files:**
- Create: `docs/ADR/0023-audio-escalation-reuses-the-vignette-ramp.md`
- Create: `docs/ADR/0024-the-first-cue-batch-is-catch-up.md`
- Create: `docs/ADR/0025-sounds-are-generated-source-not-assets.md`
- Modify: `docs/ADR/README.md`
- Create: `docs/progress/P4-audio-identity.md`
- Modify: `docs/progress/CURRENT.md`

**Interfaces:**
- Consumes: everything above.
- Produces: no code.

- [ ] **Step 1: Walk every exit criterion, headed**

Run `npm run dev` and play one full 3-round game and one 2-round game, headed (CURRENT.md: headless Chromium is the wrong instrument for anything real-time). Confirm and write down the result of each:

1. Continuous bed under every phase; escalates through ANSWER; freezes at lock-in.
2. One headline sting per TRACK beat; personal verdict at REVEAL; silence for `streak-broken` and `player-advanced`.
3. Reload mid-game lands on the correct bed — escalated in the final round — and replays no stings.
4. Mute works, persists, and unmuting mid-game resumes at the right point.
5. Nothing plays before a gesture; **check the console for autoplay warnings** and record that it is clean.
6. `reduced` steps the stems instead of ramping.
7. `npm test` and `npm run test:e2e -- --workers=2` both pass.
8. `du -sh public/audio` is under 250 KB.

- [ ] **Step 2: Write ADR-0023**

`docs/ADR/0023-audio-escalation-reuses-the-vignette-ramp.md`. **Status:** Accepted. **Date:** 2026-08-23. **Phase:** P4.

- *Context:* The roadmap asks for escalating ANSWER-phase music. P3a already publishes a continuous tension ramp for the vignette, frozen at lock-in and stepped on the reduced profile.
- *Decision:* Audio calls the same pure `tensionAt(remainingMs, totalMs)` with the same inputs rather than deriving its own escalation, and expresses escalation as layered stem gains. Alternatives considered and rejected: filter/rate modulation on one loop (pokes Howler's WebAudio internals; rate shifts pitch), and discrete loop swaps (audible as events rather than a build).
- *Consequences:* Escalation is free and can never drift from the picture — including the freeze at lock-in and the reduced-profile stepping, both of which fall out rather than being reimplemented. The cost is that stems must be tempo- and length-locked by the generator, which is cheap because we generate them, and that they must be started in one tick to stay sample-aligned.

- [ ] **Step 3: Write ADR-0024**

`docs/ADR/0024-the-first-cue-batch-is-catch-up.md`. **Status:** Accepted. **Date:** 2026-08-23. **Phase:** P4.

- *Context:* `startCueBridge` seeds from the store and emits the whole current beat as one synchronous batch, so a mid-game reload replays the game's state through the bus. Persistent state must be adopted from it; one-shot events must not be performed. ADR-0021 fixed one instance of this by hand; CURRENT.md predicted P4's audio state would be the next.
- *Decision:* `AudioState.catchUp` starts true. `applyCue` applies bed and escalation normally but returns no stings while it is set. The runtime queues a microtask on the *first* cue it receives; because the bridge emits a batch synchronously in one loop, that microtask runs exactly at the batch boundary and calls `endCatchUp`. Separately, `escalated` is set the instant `final-question` is seen rather than at the beat that resolves it.
- *Consequences:* A reload adopts the right bed, including the final round's escalation, and never machine-guns stingers; repeated refreshes are safe. The general form is available to P5 and P6: state derived from cues survives a reload, one-shot performance does not. The subtlety to respect is that the audio runtime must be mounted *before* `startCueBridge` in the room page, or a client-side navigation into an already-populated store loses the seed batch entirely.

- [ ] **Step 4: Write ADR-0025**

`docs/ADR/0025-sounds-are-generated-source-not-assets.md`. **Status:** Accepted. **Date:** 2026-08-23. **Phase:** P4.

- *Context:* Roadmap decision 1 forbids an external art-production pipeline; decision 2 names Howler.js as the stack. Howler plays files, so pure runtime synthesis would have made the named dependency dead weight.
- *Decision:* `scripts/audio/` synthesises every sound with dependency-free DSP and a seeded PRNG, encodes each to Opus/WebM and AAC/M4A via ffmpeg, and writes `lib/audio/manifest.ts`. Outputs are committed; ffmpeg is required only to regenerate.
- *Consequences:* The sound design is diffable source, byte-stable across regenerations, and costs no npm dependency. Two encodings ship because Opus loops gaplessly while AAC's encoder padding seams — Howler picks per browser and old Safari takes the seam. The cost is that editing a sound requires ffmpeg on the editor's machine; building, testing and running the app never do.

Add all three index rows to `docs/ADR/README.md`.

- [ ] **Step 5: Write the phase record**

Create `docs/progress/P4-audio-identity.md` following the shape of `docs/progress/P3b-round-outcome.md`: scope, what was built (module by module), deviations, verification results.

Deviations to record explicitly:
- `startAudioRuntime()` takes no `code` argument, unlike the spec's sketch — `answer-resolved` removed the need for a session lookup.
- The audio runtime is mounted **before** `startCueBridge` in `app/room/[code]/page.tsx`, and the ordering is load-bearing.
- Any tuning changes made to `scripts/audio/sounds.mjs` during the Task 2 listening pass.
- The measured `du -sh public/audio` figure against the 250 KB budget.

- [ ] **Step 6: Update the live tracker**

In `docs/progress/CURRENT.md`:
- **Current phase:** P4 complete; next up is P5 (podium ceremony), still unspec'd; P6 waits on both.
- **Last completed:** point at `P4-audio-identity.md`.
- Move the standing note about seed-path cues needing immediate side effects from a warning about P4 to a **resolved** note pointing at ADR-0024 as the general answer, and leave the P5 half of the prediction in place.
- Add any new tech debt found during verification. Do **not** close the pre-existing items; none of this task touches them.

- [ ] **Step 7: Commit**

```bash
git add docs/
git commit -m "docs(p4): close audio identity, record three ADRs

Escalation reuses the vignette's ramp; the first cue batch is catch-up,
which generalises ADR-0021 for P5 and P6; sounds are generated source
rather than assets."
```

---

## Self-Review

**Spec coverage.** §3 → Task 1. §4 module layout → Tasks 2–6. §5 beds and stem gains → Tasks 3 and 5. §6 sting catalogue, arbitration, ducking → Tasks 2, 3, 4. §7 runtime, unlock, mute, silent fallback → Tasks 4 and 6. §8 generator → Task 2. §9 testing → Tasks 1, 3, 4, 6 (unit and e2e) and Task 7 (manual). §10 edge cases → covered by `tests/audioState.test.ts` (one-round game via the escalation tests, repeated reload via catch-up) and Task 7's headed walk. §11 scope boundaries → nothing in any task crosses them. §12 exit criteria → Task 7 Step 1 walks all eight. §13 ADRs → Task 1 Step 7 and Task 7 Steps 2–4.

**Type consistency.** `SoundId` and `SOUNDS` are produced in Task 2 and consumed unchanged in 3–6. `MusicBed`, `BED_STEMS`, `DRIVE_STEM`, `URGENCY_STEM`, `driveGain`, `urgencyGain`, `stingFor`, `TRACK_DEFAULT_STING` are defined in Task 3 §design.ts and used with those exact names in Tasks 3–5. `AudioState`/`applyCue`/`endCatchUp`/`initialAudioState`/`AUDIO_CUE_TYPES` are defined in Task 3 §state.ts and consumed in Task 4. `Mixer` and its seven methods are defined in Task 4 and called with those signatures in Tasks 4–6. `AnswerResolvedCue`'s four fields are fixed in Task 1 and read in Task 3's `stingFor`.

**Known sharp edges the executor should expect.** Task 1 Step 2 requires editing seven existing assertions — the line numbers are approximate and will have shifted; match on content. Task 2 Step 7 is a taste judgement with no pass/fail, and is the step most likely to need several passes.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-23-m2-p4-audio-identity.md`.
