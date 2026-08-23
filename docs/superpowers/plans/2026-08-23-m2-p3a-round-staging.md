# M2 P3a — Round Staging: the question surface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the M1 placeholder question surface into staged TV beats — a pure timing spine, restyled shape-coded answer buttons, and choreographed READ and ANSWER beats.

**Architecture:** A pure timing core (`beats.ts`, `tension.ts`) derives everything from the server's `ends_at` rather than from local arrival, so a reload or a late join lands in the right state with no replay and no special case. A single rAF ticker publishes *discrete* state to a Zustand store (`useStaging`) and writes *continuous* values straight to CSS custom properties, so React re-renders roughly once a second instead of sixty times. Components read the store and animate with `motion`.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript, Zustand 5, `motion` 13, Tailwind v4, Vitest 4, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-23-m2-p3a-round-staging-design.md`

## Global Constraints

- **Presentation-only.** No schema, RPC, or realtime-protocol change. If a task appears to need one, stop and escalate — that is roadmap decision 4 and requires an explicit decision, never a quiet addition.
- **Semantic events only.** Realtime traffic describes game meaning; every client interprets locally.
- **Rendering separation.** Pixi owns the world; HTML/CSS/React owns everything readable and interactive. Accessibility never depends on canvas.
- **The server phase is the only interaction authority.** Staging never gates input, never delays a button becoming live, and never holds a phase change.
- **Continuous values never pass through React state.** Ramps and fractions go to CSS custom properties; only quantized/discrete state enters `useStaging`.
- **Pressure lives in the margins.** The question and the four options are never dimmed, scaled, desaturated or moved by the tension treatment.
- **Answer accents are fixed by index:** ▲ cyan, ◆ magenta, ● lime, ■ amber — for every question in every round. Shape carries identity; nothing depends on color alone.
- **Both performance profiles are acceptance criteria for every task**, not a final pass. `useSettings(s => s.profile)` is the single source; `reduced` performs no continuous ramp and no per-frame writes.
- **Design tokens come from `app/globals.css`** (`@theme`), mirrored for TS in `lib/presentation/tokens.ts`. Never hardcode a hex the tokens already name.
- **The Playwright e2e suite passes at the end of the phase.** Two existing specs assert copy this phase removes — Task 7 updates them.
- Run `npm test` for units and `npm run test:e2e` for e2e. Lint touched files with `npx eslint <files>` — `npm run lint` at the repo root is red on three pre-existing files this phase does not touch.

---

### Task 1: The timing core

Two pure modules with no imports outside `lib/types`. Everything this phase decides about *when* lives here, so it is all testable in Node.

**Files:**
- Create: `lib/staging/beats.ts`
- Create: `lib/staging/tension.ts`
- Test: `tests/beats.test.ts`
- Test: `tests/tension.test.ts`

**Interfaces:**
- Consumes: `Phase` from `@/lib/types`.
- Produces:
  - `type Beat = 'idle' | 'countdown' | 'read' | 'answer' | 'reveal' | 'track' | 'results'`
  - `interface StageSteps { badges: boolean; question: boolean; options: boolean; optionsLive: boolean }`
  - `beatFor(phase: Phase | null): Beat`
  - `beatTotalMs(beat: Beat, timerSeconds: number): number`
  - `elapsedIn(totalMs: number, remainingMs: number | null): number`
  - `stepsAt(beat: Beat, elapsedMs: number): StageSteps`
  - consts `NOMINAL_MS`, `READ_BADGES_AT`, `READ_QUESTION_AT`, `READ_OPTIONS_AT`, `READ_OPTION_STAGGER`
  - `type TensionStep = 0 | 1 | 2 | 3`
  - `tensionAt(remainingMs: number | null, totalMs: number): number`
  - `tensionStep(tension: number): TensionStep`
  - const `TENSION_WINDOW_MS`

- [ ] **Step 1: Write the failing tests for `beats.ts`**

Create `tests/beats.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  NOMINAL_MS,
  READ_OPTIONS_AT,
  READ_QUESTION_AT,
  beatFor,
  beatTotalMs,
  elapsedIn,
  stepsAt,
} from '@/lib/staging/beats';

describe('beatFor', () => {
  it('maps every playing phase to the beat of the same name', () => {
    expect(beatFor('countdown')).toBe('countdown');
    expect(beatFor('read')).toBe('read');
    expect(beatFor('answer')).toBe('answer');
    expect(beatFor('reveal')).toBe('reveal');
    expect(beatFor('track')).toBe('track');
    expect(beatFor('results')).toBe('results');
  });

  it('treats the lobby and a missing room as idle', () => {
    expect(beatFor('lobby')).toBe('idle');
    expect(beatFor(null)).toBe('idle');
  });
});

describe('beatTotalMs', () => {
  it('mirrors the server durations for fixed beats', () => {
    expect(beatTotalMs('read', 20)).toBe(NOMINAL_MS.read);
    expect(beatTotalMs('reveal', 20)).toBe(NOMINAL_MS.reveal);
    expect(beatTotalMs('track', 20)).toBe(NOMINAL_MS.track);
  });

  it('takes the ANSWER length from the wire, not from a mirrored constant', () => {
    expect(beatTotalMs('answer', 20)).toBe(20_000);
    expect(beatTotalMs('answer', 5)).toBe(5_000);
  });

  it('is zero for idle', () => {
    expect(beatTotalMs('idle', 20)).toBe(0);
  });
});

describe('elapsedIn', () => {
  it('derives position from what is left, not from local arrival', () => {
    expect(elapsedIn(3000, 3000)).toBe(0);
    expect(elapsedIn(3000, 2100)).toBe(900);
    expect(elapsedIn(3000, 0)).toBe(3000);
  });

  it('lands a late joiner deep in the beat', () => {
    // Joined with 800ms of a 3s READ left: everything should already be present.
    expect(elapsedIn(3000, 800)).toBe(2200);
  });

  it('treats an unknown deadline as a finished beat', () => {
    expect(elapsedIn(3000, null)).toBe(3000);
  });

  it('clamps when the server ran a longer beat than the mirror expects', () => {
    expect(elapsedIn(3000, 4000)).toBe(0);
  });
});

describe('stepsAt during READ', () => {
  it('shows nothing before the badges land', () => {
    expect(stepsAt('read', -1)).toMatchObject({ badges: false, question: false, options: false });
  });

  it('slams the badges in first', () => {
    expect(stepsAt('read', 0)).toMatchObject({ badges: true, question: false, options: false });
    expect(stepsAt('read', READ_QUESTION_AT - 1)).toMatchObject({ question: false });
  });

  it('raises the question at 460ms', () => {
    expect(stepsAt('read', READ_QUESTION_AT)).toMatchObject({ badges: true, question: true, options: false });
  });

  it('staggers the options in at 1000ms, dimmed and not yet live', () => {
    expect(stepsAt('read', READ_OPTIONS_AT - 1)).toMatchObject({ options: false });
    expect(stepsAt('read', READ_OPTIONS_AT)).toMatchObject({ options: true, optionsLive: false });
  });

  it('has everything present by the end of a 3s beat', () => {
    expect(stepsAt('read', 3000)).toEqual({ badges: true, question: true, options: true, optionsLive: false });
  });
});

describe('stepsAt in the other beats', () => {
  it('makes the options live the instant ANSWER begins', () => {
    expect(stepsAt('answer', 0)).toEqual({ badges: true, question: true, options: true, optionsLive: true });
  });

  it('keeps the question up but retires the options at REVEAL', () => {
    expect(stepsAt('reveal', 0)).toEqual({ badges: true, question: true, options: false, optionsLive: false });
  });

  it('shows no question surface at all outside the question beats', () => {
    for (const beat of ['idle', 'countdown', 'track', 'results'] as const) {
      expect(stepsAt(beat, 9999)).toEqual({ badges: false, question: false, options: false, optionsLive: false });
    }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- tests/beats.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/staging/beats"`.

- [ ] **Step 3: Implement `lib/staging/beats.ts`**

```ts
/**
 * Beat timing (spec §4) — pure, no React, no store, no DOM.
 *
 * Beat position is derived from the server's `ends_at`, never from local
 * arrival (spec decision 2). A late joiner or a reload computes a large
 * elapsed and lands with everything already present, so "jump to the end
 * state rather than replay" needs no flag and no special case.
 */
import type { Phase } from '@/lib/types';

export type Beat = 'idle' | 'countdown' | 'read' | 'answer' | 'reveal' | 'track' | 'results';

/**
 * Client-side mirror of the server's FIXED phase durations
 * (supabase/migrations/0002_rpcs.sql:288-291; the countdown is set at :251).
 *
 * Hand-maintained, exactly as lib/presentation/tokens.ts mirrors globals.css.
 * There is no drift test, because the server values are not importable from
 * the client — the mitigation is that the failure mode is graceful. If a
 * server duration moved, the stagger would compress or complete early; it
 * would never block, break, or lock the surface.
 *
 * ANSWER is absent on purpose: its length is `room.timer_seconds`, which is
 * on the wire and must be read from there.
 */
export const NOMINAL_MS: Record<Exclude<Beat, 'idle' | 'answer'>, number> = {
  countdown: 3000,
  read: 3000,
  reveal: 5000,
  track: 4000,
  results: 0,
};

/** READ stagger, expressed in the P0 token durations (lib/presentation/tokens.ts). */
export const READ_BADGES_AT = 0;
export const READ_QUESTION_AT = 460; // DURATION.settle — badges have locked
export const READ_OPTIONS_AT = 1000;
/** Per-item delay handed to `motion`'s staggerChildren. */
export const READ_OPTION_STAGGER = 70;

/** Which staged elements are on screen. Derived purely from beat + elapsed. */
export interface StageSteps {
  badges: boolean;
  question: boolean;
  options: boolean;
  /** Options are visible but not yet interactive (READ) vs. live (ANSWER). */
  optionsLive: boolean;
}

const NOTHING: StageSteps = { badges: false, question: false, options: false, optionsLive: false };

export function beatFor(phase: Phase | null): Beat {
  if (phase === null || phase === 'lobby') return 'idle';
  return phase;
}

export function beatTotalMs(beat: Beat, timerSeconds: number): number {
  if (beat === 'answer') return timerSeconds * 1000;
  if (beat === 'idle') return 0;
  return NOMINAL_MS[beat];
}

/** `remainingMs === null` means the deadline is unknown: treat the beat as over. */
export function elapsedIn(totalMs: number, remainingMs: number | null): number {
  if (remainingMs === null) return totalMs;
  return Math.max(0, totalMs - remainingMs);
}

export function stepsAt(beat: Beat, elapsedMs: number): StageSteps {
  switch (beat) {
    case 'read':
      return {
        badges: elapsedMs >= READ_BADGES_AT,
        question: elapsedMs >= READ_QUESTION_AT,
        options: elapsedMs >= READ_OPTIONS_AT,
        optionsLive: false,
      };
    case 'answer':
      return { badges: true, question: true, options: true, optionsLive: true };
    case 'reveal':
      // The question stays up under the reveal panel; the options retire.
      return { badges: true, question: true, options: false, optionsLive: false };
    default:
      return NOTHING;
  }
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npm test -- tests/beats.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Write the failing tests for `tension.ts`**

Create `tests/tension.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TENSION_WINDOW_MS, tensionAt, tensionStep } from '@/lib/staging/tension';

describe('tensionAt', () => {
  it('stays flat until the window opens on a long timer', () => {
    expect(tensionAt(30_000, 30_000)).toBe(0);
    expect(tensionAt(TENSION_WINDOW_MS, 30_000)).toBe(0);
  });

  it('ramps linearly across the window', () => {
    expect(tensionAt(4000, 30_000)).toBeCloseTo(0.5, 5);
    expect(tensionAt(2000, 30_000)).toBeCloseTo(0.75, 5);
    expect(tensionAt(0, 30_000)).toBe(1);
  });

  it('uses the whole beat when the timer is shorter than the window', () => {
    // A 5s timer is under pressure throughout, but must still OPEN at zero.
    expect(tensionAt(5000, 5000)).toBe(0);
    expect(tensionAt(2500, 5000)).toBeCloseTo(0.5, 5);
    expect(tensionAt(0, 5000)).toBe(1);
  });

  it('clamps rather than overshooting when time has already run out', () => {
    expect(tensionAt(-500, 30_000)).toBe(1);
    expect(tensionAt(40_000, 30_000)).toBe(0);
  });

  it('is calm when the deadline or the total is unknown', () => {
    expect(tensionAt(null, 30_000)).toBe(0);
    expect(tensionAt(1000, 0)).toBe(0);
    expect(tensionAt(1000, -1)).toBe(0);
  });
});

describe('tensionStep', () => {
  it('quantizes the ramp for the values React genuinely re-renders on', () => {
    expect(tensionStep(0)).toBe(0);
    expect(tensionStep(0.01)).toBe(1);
    expect(tensionStep(0.49)).toBe(1);
    expect(tensionStep(0.5)).toBe(2);
    expect(tensionStep(0.84)).toBe(2);
    expect(tensionStep(0.85)).toBe(3);
    expect(tensionStep(1)).toBe(3);
  });
});
```

- [ ] **Step 6: Run it to make sure it fails**

Run: `npm test -- tests/tension.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/staging/tension"`.

- [ ] **Step 7: Implement `lib/staging/tension.ts`**

```ts
/**
 * The ANSWER beat's escalation ramp (spec §4) — pure.
 *
 * Published two ways: the raw 0..1 value goes to a CSS custom property so it
 * never triggers a React render, and the quantized step drives the handful of
 * things React genuinely must re-render (the ring's color crossfade and its
 * last-seconds pulse).
 */

/** Escalation never starts more than this far out, however long the timer is. */
export const TENSION_WINDOW_MS = 8000;

export type TensionStep = 0 | 1 | 2 | 3;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** `remainingMs === null` (unknown deadline) is calm, not maximum pressure. */
export function tensionAt(remainingMs: number | null, totalMs: number): number {
  if (remainingMs === null || totalMs <= 0) return 0;
  const window = Math.min(totalMs, TENSION_WINDOW_MS);
  return clamp01(1 - remainingMs / window);
}

export function tensionStep(tension: number): TensionStep {
  if (tension <= 0) return 0;
  if (tension < 0.5) return 1;
  if (tension < 0.85) return 2;
  return 3;
}
```

- [ ] **Step 8: Run the tests and make sure they pass**

Run: `npm test -- tests/tension.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 9: Run the whole unit suite and lint the new files**

Run: `npm test`
Expected: PASS — every pre-existing suite still green.

Run: `npx eslint lib/staging/beats.ts lib/staging/tension.ts tests/beats.test.ts tests/tension.test.ts`
Expected: no output.

- [ ] **Step 10: Commit**

```bash
git add lib/staging/beats.ts lib/staging/tension.ts tests/beats.test.ts tests/tension.test.ts
git commit -m "feat(p3a): pure beat timing and the ANSWER tension ramp

Beat position is derived from ends_at rather than local arrival, so a
reload or a late join lands in the right state with no replay and no
special case. NOMINAL_MS hand-mirrors the server's fixed phase durations."
```

---

### Task 2: The answer lock survives a reload

Spec §8.1. `myAnswer` lives only in memory, and `submit_answer` raises `already answered` on the duplicate insert — so a reload mid-ANSWER re-enables the buttons and the next tap surfaces that raw Postgres string. Round-scoped `sessionStorage`, guarded exactly as `lib/presentation/profile.ts` guards its own.

**Files:**
- Create: `lib/staging/answerLock.ts`
- Test: `tests/answerLock.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ANSWER_LOCK_PREFIX: string`
  - `answerLockKey(code: string, round: number): string`
  - `loadAnswerLock(code: string, round: number): number | null`
  - `saveAnswerLock(code: string, round: number, choice: number): void`
  - `clearAnswerLock(code: string, round: number): void`

- [ ] **Step 1: Write the failing test**

Create `tests/answerLock.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  answerLockKey,
  clearAnswerLock,
  loadAnswerLock,
  saveAnswerLock,
} from '@/lib/staging/answerLock';

/** Minimal in-memory Storage, installed on globalThis.window for the test. */
function installStorage(impl?: Partial<Storage>) {
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, v),
    ...impl,
  };
  vi.stubGlobal('window', { sessionStorage: storage });
  return storage;
}

beforeEach(() => { installStorage(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('answerLockKey', () => {
  it('is scoped to the room and the round, and case-insensitive on the code', () => {
    expect(answerLockKey('abcde', 3)).toBe(answerLockKey('ABCDE', 3));
    expect(answerLockKey('ABCDE', 3)).not.toBe(answerLockKey('ABCDE', 4));
  });
});

describe('save / load', () => {
  it('round-trips a choice', () => {
    saveAnswerLock('ABCDE', 3, 2);
    expect(loadAnswerLock('ABCDE', 3)).toBe(2);
  });

  it('round-trips choice 0 rather than losing it to a falsy check', () => {
    saveAnswerLock('ABCDE', 1, 0);
    expect(loadAnswerLock('ABCDE', 1)).toBe(0);
  });

  it('does not leak a lock into the next round', () => {
    saveAnswerLock('ABCDE', 3, 2);
    expect(loadAnswerLock('ABCDE', 4)).toBeNull();
  });

  it('returns null when nothing was stored', () => {
    expect(loadAnswerLock('ABCDE', 1)).toBeNull();
  });

  it('rejects stored junk rather than trusting it', () => {
    window.sessionStorage.setItem(answerLockKey('ABCDE', 1), 'banana');
    expect(loadAnswerLock('ABCDE', 1)).toBeNull();
    window.sessionStorage.setItem(answerLockKey('ABCDE', 2), '9');
    expect(loadAnswerLock('ABCDE', 2)).toBeNull();
    window.sessionStorage.setItem(answerLockKey('ABCDE', 3), '-1');
    expect(loadAnswerLock('ABCDE', 3)).toBeNull();
  });

  it('refuses to store an out-of-range choice', () => {
    saveAnswerLock('ABCDE', 1, 7);
    expect(loadAnswerLock('ABCDE', 1)).toBeNull();
  });
});

describe('clearAnswerLock', () => {
  it('removes the round it is given', () => {
    saveAnswerLock('ABCDE', 3, 2);
    clearAnswerLock('ABCDE', 3);
    expect(loadAnswerLock('ABCDE', 3)).toBeNull();
  });
});

describe('hostile storage', () => {
  it('never throws when storage is unavailable', () => {
    installStorage({
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    });
    expect(() => saveAnswerLock('ABCDE', 1, 1)).not.toThrow();
    expect(() => clearAnswerLock('ABCDE', 1)).not.toThrow();
    expect(loadAnswerLock('ABCDE', 1)).toBeNull();
  });

  it('is inert during server rendering', () => {
    vi.unstubAllGlobals();
    expect(loadAnswerLock('ABCDE', 1)).toBeNull();
    expect(() => saveAnswerLock('ABCDE', 1, 1)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- tests/answerLock.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/staging/answerLock"`.

- [ ] **Step 3: Implement `lib/staging/answerLock.ts`**

```ts
/**
 * Round-scoped persistence of the local player's committed answer (spec §8.1).
 *
 * `myAnswer` lives only in memory (lib/store.ts:19) and `submit_answer` raises
 * `already answered` on the duplicate insert (0002_rpcs.sql:344), so without
 * this a reload mid-ANSWER re-enables the buttons and the next tap surfaces
 * that raw Postgres string as the error text.
 *
 * sessionStorage rather than localStorage on purpose: a lock is meaningful for
 * exactly one tab for exactly one round. Browser-only, and never throws —
 * private-mode failures simply mean the lock does not persist.
 */

export const ANSWER_LOCK_PREFIX = 'cb:answer';

export function answerLockKey(code: string, round: number): string {
  return `${ANSWER_LOCK_PREFIX}:${code.toUpperCase()}:${round}`;
}

function isChoice(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3;
}

export function loadAnswerLock(code: string, round: number): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(answerLockKey(code, round));
    if (raw === null) return null;
    const parsed = Number(raw);
    return isChoice(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveAnswerLock(code: string, round: number, choice: number): void {
  if (typeof window === 'undefined' || !isChoice(choice)) return;
  try {
    window.sessionStorage.setItem(answerLockKey(code, round), String(choice));
  } catch {
    // Storage unavailable; the lock just won't survive a reload.
  }
}

export function clearAnswerLock(code: string, round: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(answerLockKey(code, round));
  } catch {
    // Nothing to do — the key is round-scoped, so a stale entry is unreachable.
  }
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npm test -- tests/answerLock.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Lint and commit**

Run: `npx eslint lib/staging/answerLock.ts tests/answerLock.test.ts`
Expected: no output.

```bash
git add lib/staging/answerLock.ts tests/answerLock.test.ts
git commit -m "feat(p3a): persist the answer lock for the round

Round-scoped sessionStorage so a reload mid-ANSWER no longer re-enables
the buttons and surface 'already answered' from the RPC. Wired up in
Task 4."
```

---

### Task 3: Staging state and its store

The single pure function that turns one moment of game state into everything the question surface needs, plus the Zustand store that publishes it. `publish` bails on an unchanged snapshot — the same guard `useWorldView.setOffscreen` uses — because the ticker calls it 60 times a second and every consumer would otherwise re-render at that rate.

**Files:**
- Create: `lib/staging/staging.ts`
- Create: `lib/staging/useStaging.ts`
- Test: `tests/staging.test.ts`

**Interfaces:**
- Consumes: `Beat`, `StageSteps`, `beatFor`, `beatTotalMs`, `elapsedIn`, `stepsAt` (Task 1); `TensionStep`, `tensionAt`, `tensionStep` (Task 1).
- Produces:
  - `interface StagingInput { phase: Phase | null; round: number; remainingMs: number | null; timerSeconds: number; myAnswer: number | null; isPlaying: boolean }`
  - `interface StagingState { beat: Beat; round: number; steps: StageSteps; tensionStep: TensionStep; secondsLeft: number | null; lockedChoice: number | null; spectating: boolean }`
  - `initialStagingState: StagingState`
  - `stagingAt(input: StagingInput): StagingState`
  - `sameStaging(a: StagingState, b: StagingState): boolean`
  - `useStaging` — Zustand store of `StagingState & { announcement: string | null; publish(next: StagingState): void; announce(text: string): void }`

- [ ] **Step 1: Write the failing test**

Create `tests/staging.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  initialStagingState,
  sameStaging,
  stagingAt,
  type StagingInput,
} from '@/lib/staging/staging';

const base: StagingInput = {
  phase: 'answer',
  round: 3,
  remainingMs: 20_000,
  timerSeconds: 20,
  myAnswer: null,
  isPlaying: true,
};

const at = (over: Partial<StagingInput> = {}) => stagingAt({ ...base, ...over });

describe('stagingAt', () => {
  it('is idle in the lobby', () => {
    expect(at({ phase: 'lobby' })).toMatchObject({ beat: 'idle', tensionStep: 0, secondsLeft: null });
  });

  it('places a fresh READ at the top of its stagger', () => {
    const state = at({ phase: 'read', remainingMs: 3000 });
    expect(state.steps).toMatchObject({ badges: true, question: false, options: false });
  });

  it('places a late joiner at the end of the READ stagger', () => {
    const state = at({ phase: 'read', remainingMs: 400 });
    expect(state.steps).toMatchObject({ badges: true, question: true, options: true });
  });

  it('opens ANSWER calm and escalates as the deadline closes', () => {
    expect(at({ remainingMs: 20_000 }).tensionStep).toBe(0);
    expect(at({ remainingMs: 5000 }).tensionStep).toBe(1);
    expect(at({ remainingMs: 3000 }).tensionStep).toBe(2);
    expect(at({ remainingMs: 800 }).tensionStep).toBe(3);
  });

  it('never escalates outside the ANSWER beat', () => {
    expect(at({ phase: 'reveal', remainingMs: 0 }).tensionStep).toBe(0);
    expect(at({ phase: 'read', remainingMs: 0 }).tensionStep).toBe(0);
  });

  it('counts whole seconds down, and only during ANSWER', () => {
    expect(at({ remainingMs: 4200 }).secondsLeft).toBe(5);
    expect(at({ remainingMs: 0 }).secondsLeft).toBe(0);
    expect(at({ phase: 'read', remainingMs: 2000 }).secondsLeft).toBeNull();
    expect(at({ remainingMs: null }).secondsLeft).toBeNull();
  });

  it('carries the committed choice through', () => {
    expect(at({ myAnswer: 2 }).lockedChoice).toBe(2);
    expect(at({ myAnswer: 0 }).lockedChoice).toBe(0);
    expect(at().lockedChoice).toBeNull();
  });

  it('marks a non-playing MC as spectating', () => {
    expect(at({ isPlaying: false }).spectating).toBe(true);
    expect(at().spectating).toBe(false);
  });

  it('is calm and complete when the deadline is unknown', () => {
    const state = at({ phase: 'read', remainingMs: null });
    expect(state.steps).toMatchObject({ badges: true, question: true, options: true });
    expect(state.tensionStep).toBe(0);
  });
});

describe('sameStaging', () => {
  it('recognises an unchanged snapshot so the store can bail', () => {
    expect(sameStaging(at(), at())).toBe(true);
    expect(sameStaging(initialStagingState, initialStagingState)).toBe(true);
  });

  it('notices every field that consumers render', () => {
    expect(sameStaging(at(), at({ phase: 'read' }))).toBe(false);
    expect(sameStaging(at(), at({ round: 4 }))).toBe(false);
    expect(sameStaging(at({ remainingMs: 4200 }), at({ remainingMs: 3200 }))).toBe(false);
    expect(sameStaging(at(), at({ remainingMs: 800 }))).toBe(false);
    expect(sameStaging(at(), at({ myAnswer: 1 }))).toBe(false);
    expect(sameStaging(at(), at({ isPlaying: false }))).toBe(false);
    expect(sameStaging(at({ phase: 'read', remainingMs: 3000 }), at({ phase: 'read', remainingMs: 2000 }))).toBe(false);
  });

  it('ignores a tick that changed nothing discrete', () => {
    // 20.0s vs 19.9s left: same steps, same step, same second.
    expect(sameStaging(at({ remainingMs: 19_400 }), at({ remainingMs: 19_300 }))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- tests/staging.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/staging/staging"`.

- [ ] **Step 3: Implement `lib/staging/staging.ts`**

```ts
/**
 * The discrete staging state (spec §3) — pure.
 *
 * One moment of game state in, everything the question surface renders out.
 * Deliberately a projection rather than an accumulator: because beat position
 * comes from `ends_at` (spec decision 2), nothing here needs to be remembered
 * between frames, which is what makes a reload correct with no special case.
 *
 * Nothing continuous lives here. The tension RAMP and the ring FRACTION go to
 * CSS custom properties in lib/staging/runtime.ts; this carries only the
 * quantized step and the whole second.
 */
import type { Phase } from '@/lib/types';
import { beatFor, beatTotalMs, elapsedIn, stepsAt, type Beat, type StageSteps } from './beats';
import { tensionAt, tensionStep, type TensionStep } from './tension';

export interface StagingInput {
  phase: Phase | null;
  round: number;
  /** ms left in the current phase, or null when the deadline is unknown. */
  remainingMs: number | null;
  timerSeconds: number;
  myAnswer: number | null;
  /** False for a spectator or a non-playing MC host. */
  isPlaying: boolean;
}

export interface StagingState {
  beat: Beat;
  round: number;
  steps: StageSteps;
  tensionStep: TensionStep;
  /** Whole seconds left in ANSWER, for the ring's numeral. Null elsewhere. */
  secondsLeft: number | null;
  lockedChoice: number | null;
  spectating: boolean;
}

export const initialStagingState: StagingState = {
  beat: 'idle',
  round: 0,
  steps: { badges: false, question: false, options: false, optionsLive: false },
  tensionStep: 0,
  secondsLeft: null,
  lockedChoice: null,
  spectating: false,
};

export function stagingAt(input: StagingInput): StagingState {
  const beat = beatFor(input.phase);
  const totalMs = beatTotalMs(beat, input.timerSeconds);
  const elapsed = elapsedIn(totalMs, input.remainingMs);
  const isAnswer = beat === 'answer';

  return {
    beat,
    round: input.round,
    steps: stepsAt(beat, elapsed),
    tensionStep: isAnswer ? tensionStep(tensionAt(input.remainingMs, totalMs)) : 0,
    secondsLeft:
      isAnswer && input.remainingMs !== null
        ? Math.max(0, Math.ceil(input.remainingMs / 1000))
        : null,
    lockedChoice: input.myAnswer,
    spectating: !input.isPlaying,
  };
}

/** Cheap equality so the ticker can skip a publish that changes nothing. */
export function sameStaging(a: StagingState, b: StagingState): boolean {
  return (
    a.beat === b.beat &&
    a.round === b.round &&
    a.tensionStep === b.tensionStep &&
    a.secondsLeft === b.secondsLeft &&
    a.lockedChoice === b.lockedChoice &&
    a.spectating === b.spectating &&
    a.steps.badges === b.steps.badges &&
    a.steps.question === b.steps.question &&
    a.steps.options === b.steps.options &&
    a.steps.optionsLive === b.steps.optionsLive
  );
}
```

- [ ] **Step 4: Implement `lib/staging/useStaging.ts`**

```ts
import { create } from 'zustand';
import { initialStagingState, sameStaging, type StagingState } from './staging';

/**
 * The store the question surface reads. Written by lib/staging/runtime.ts's
 * ticker, which calls `publish` every frame — hence the equality guard: without
 * it every consumer would re-render at 60fps (spec decision 3).
 */
export interface StagingStore extends StagingState {
  /**
   * Text for the polite live region. Set from the `answer-locked` cue rather
   * than derived, because the lock must be announced ONCE at the moment it
   * happens — not re-announced on a re-render or on restore-from-storage.
   */
  announcement: string | null;
  publish(next: StagingState): void;
  announce(text: string): void;
}

export const useStaging = create<StagingStore>(set => ({
  ...initialStagingState,
  announcement: null,
  publish(next) {
    set(state => (sameStaging(state, next) ? state : next));
  },
  announce(text) {
    set({ announcement: text });
  },
}));
```

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `npm test -- tests/staging.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 6: Lint and commit**

Run: `npx eslint lib/staging/staging.ts lib/staging/useStaging.ts tests/staging.test.ts`
Expected: no output.

```bash
git add lib/staging/staging.ts lib/staging/useStaging.ts tests/staging.test.ts
git commit -m "feat(p3a): staging projection and its store

stagingAt is a projection, not an accumulator — nothing is remembered
between frames, which is what makes a mid-beat reload correct without a
special case. publish() bails on an unchanged snapshot."
```

---

### Task 4: The ticker, the CSS bridge, and the tension frame

One rAF loop for the whole question surface (spec decision 7). It publishes discrete state to the store and writes the two continuous values — the tension ramp and the ring fraction — straight to CSS custom properties on `<html>`, where they reach the DOM without a React render.

Not unit-tested, by the same rule `lib/world/runtime.ts` follows: every decision it makes lives in a pure module that is. Verified live in Task 7.

**Files:**
- Create: `lib/staging/runtime.ts`
- Create: `components/TensionFrame.tsx`
- Modify: `app/globals.css` (append the `.tension-frame` block)
- Modify: `app/room/[code]/page.tsx:33` (start the runtime beside the cue bridge)

**Interfaces:**
- Consumes: `stagingAt`, `useStaging` (Task 3); `tensionAt`, `beatTotalMs` (Task 1); `on` from `@/lib/presentation/cueBus`; `useGameStore`; `msUntil`; `loadSession`; `useSettings`.
- Produces: `startStagingRuntime(code: string): () => void`; CSS custom properties `--tension` (0..1) and `--timer-frac` (0..1) on `document.documentElement`; `<TensionFrame />`.

- [ ] **Step 1: Implement `lib/staging/runtime.ts`**

```ts
/**
 * The staging runtime (spec §3): the only cueBus subscriber outside
 * lib/world/runtime.ts, and the only clock the question surface has.
 *
 * Not unit-tested by design — every decision it makes lives in a pure module
 * that is (beats.ts, tension.ts, staging.ts).
 */
import { on } from '@/lib/presentation/cueBus';
import { msUntil } from '@/lib/serverTime';
import { loadSession } from '@/lib/session';
import { useGameStore } from '@/lib/store';
import { useSettings } from '@/lib/useSettings';
import { beatFor, beatTotalMs } from './beats';
import { stagingAt } from './staging';
import { tensionAt, tensionStep } from './tension';
import { useStaging } from './useStaging';

/** CSS custom properties the ticker owns. Nothing else may write them. */
const TENSION_VAR = '--tension';
const TIMER_VAR = '--timer-frac';

function setVar(name: string, value: number): void {
  document.documentElement.style.setProperty(name, value.toFixed(4));
}

export function startStagingRuntime(code: string): () => void {
  const { publish, announce } = useStaging.getState();

  // Resolved lazily: the session is written when the visitor joins, which can
  // happen after this runtime starts. Same reasoning as PixiStage's lazy read,
  // but this one is cheap to repeat — it only runs on a store change, not per
  // frame.
  const isLocalPlayerPlaying = (): boolean => {
    const { players } = useGameStore.getState();
    const playerId = loadSession(code)?.playerId;
    if (!playerId) return true; // not joined yet: nothing to disable
    const me = players.find(p => p.id === playerId);
    return me ? me.is_playing : true;
  };

  const unsubscribe = on('answer-locked', cue => {
    const option = useGameStore.getState().question?.options[cue.choiceIndex];
    announce(option ? `Locked in: ${option}` : 'Locked in');
  });

  let frame = 0;
  const tick = () => {
    frame = requestAnimationFrame(tick);

    const { room, myAnswer } = useGameStore.getState();
    const remainingMs = room?.ends_at ? msUntil(room.ends_at) : null;
    const timerSeconds = room?.timer_seconds ?? 0;

    publish(
      stagingAt({
        phase: room?.phase ?? null,
        round: room?.round ?? 0,
        remainingMs,
        timerSeconds,
        myAnswer,
        isPlaying: isLocalPlayerPlaying(),
      }),
    );

    const beat = beatFor(room?.phase ?? null);
    if (beat !== 'answer') {
      setVar(TENSION_VAR, 0);
      setVar(TIMER_VAR, 0);
      return;
    }

    const totalMs = beatTotalMs(beat, timerSeconds);
    setVar(TIMER_VAR, totalMs > 0 && remainingMs !== null ? remainingMs / totalMs : 0);

    // Once you have locked in, the vignette FREEZES at its current intensity
    // (spec §5): you are out of the decision, but the room is not.
    if (myAnswer !== null) return;

    const raw = tensionAt(remainingMs, totalMs);
    // `reduced` gets three discrete levels rather than a ramp — a continuous
    // write there is per-frame work with no visible result, because
    // [data-profile='reduced'] suppresses transitions globally.
    const reduced = useSettings.getState().profile === 'reduced';
    setVar(TENSION_VAR, reduced ? tensionStep(raw) / 3 : raw);
  };

  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    unsubscribe();
    setVar(TENSION_VAR, 0);
    setVar(TIMER_VAR, 0);
  };
}
```

- [ ] **Step 2: Implement `components/TensionFrame.tsx`**

```tsx
'use client';
import { useStaging } from '@/lib/staging/useStaging';

/**
 * The ANSWER beat's closing vignette (spec §5, decision 4).
 *
 * Pressure lives in the margins: this sits above the world and below the
 * question surface and never touches either. It re-renders only when the beat
 * changes — its intensity comes from the `--tension` custom property the
 * staging ticker writes, so the ramp never passes through React.
 */
export default function TensionFrame() {
  const beat = useStaging(s => s.beat);
  if (beat !== 'answer') return null;
  return <div aria-hidden="true" className="tension-frame" />;
}
```

- [ ] **Step 3: Append the vignette to `app/globals.css`**

Add at the end of the file:

```css
/* Round staging (P3a) — the ANSWER beat's closing frame.
   Intensity comes from --tension, written by lib/staging/runtime.ts's ticker
   so the ramp never passes through React. Under the reduced profile the
   ticker writes three discrete levels instead of a continuous value. */
.tension-frame {
  position: fixed;
  inset: 0;
  z-index: 5;
  pointer-events: none;
  --t: var(--tension, 0);
  opacity: calc(0.2 + var(--t) * 0.8);
  box-shadow:
    inset 0 0 calc(30px + var(--t) * 70px) calc(var(--t) * 8px)
      color-mix(in oklab, var(--color-warning), var(--color-wrong) calc(var(--t) * 100%));
}
```

- [ ] **Step 4: Start the runtime in the room page**

In `app/room/[code]/page.tsx`, import it and add the effect beside the existing cue bridge:

```tsx
import { startStagingRuntime } from '@/lib/staging/runtime';
import TensionFrame from '@/components/TensionFrame';
```

Replace line 33 (`useEffect(() => startCueBridge(), []);`) with:

```tsx
  useEffect(() => startCueBridge(), []);
  useEffect(() => startStagingRuntime(code), [code]);
```

And add `<TensionFrame />` to the returned tree, directly after `<PixiStage code={code} />`:

```tsx
      {room && room.status !== 'finished' && <PixiStage code={code} />}
      <TensionFrame />
```

- [ ] **Step 5: Verify the ticker live**

Run: `npm run dev`

In a browser, create a room with two players (a second browser context or a private window), start a game, and reach the ANSWER phase. In DevTools console:

```js
getComputedStyle(document.documentElement).getPropertyValue('--tension')
```

Expected: `0.0000` early in a 20s timer, climbing above `0` inside the last 8 seconds and reaching `1.0000` at the deadline. Lock an answer and confirm the value stops changing while `--timer-frac` keeps falling.

- [ ] **Step 6: Verify the store is not re-rendering at 60fps**

With the ANSWER phase live, in the console:

```js
let n = 0; const stop = window.__staging.subscribe(() => n++);
setTimeout(() => { stop(); console.log('publishes in 10s:', n); }, 10000);
```

To make that possible, add this dev-only export at the end of `lib/staging/useStaging.ts`:

```ts
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  (window as unknown as { __staging: typeof useStaging }).__staging = useStaging;
}
```

Expected: on the order of 10–15 publishes in 10 seconds (roughly one per second, from `secondsLeft`), **not** ~600. This is exit criterion 7 — see the note in "Closing out the phase" about how it is measured.

- [ ] **Step 7: Run the suites, lint, and commit**

Run: `npm test`
Expected: PASS.

Run: `npx eslint lib/staging/runtime.ts lib/staging/useStaging.ts components/TensionFrame.tsx "app/room/[code]/page.tsx"`
Expected: only the pre-existing `react-hooks/set-state-in-effect` error at `app/room/[code]/page.tsx:29` (recorded in `docs/progress/CURRENT.md`). No new errors.

```bash
git add lib/staging/runtime.ts lib/staging/useStaging.ts components/TensionFrame.tsx app/globals.css "app/room/[code]/page.tsx"
git commit -m "feat(p3a): one staging ticker, CSS-bridged continuous values

The ramp and the ring fraction go to --tension and --timer-frac on
<html>; only discrete state reaches the store. Locking freezes the
vignette; the reduced profile gets three levels instead of a ramp."
```

---

### Task 5: The answer buttons

Spec §6. Accent edge, shape glyph, index-stable mapping, 1–4 shortcuts, and the lock and spectator states. Selection is expressed by form, not hue (spec decision 5): the chosen button is bright, ringed in its own accent and inverted while the other three fade.

**Files:**
- Modify: `components/AnswerButtons.tsx` (full rewrite)
- Modify: `components/GameView.tsx:46-53` (drop the dead `correctIndex` prop, pass the new ones)

**Interfaces:**
- Consumes: `StageSteps` (Task 1), `useStaging` (Task 3), `saveAnswerLock` (Task 2).
- Produces: `<AnswerButtons options live lockedChoice spectating onChoose />`; DOM hooks `[data-testid="answer-option"]`, `data-index`, `data-locked`.

- [ ] **Step 1: Rewrite `components/AnswerButtons.tsx`**

```tsx
'use client';
import { useEffect } from 'react';
import { motion } from 'motion/react';
import { READ_OPTION_STAGGER } from '@/lib/staging/beats';

/**
 * The four answers (spec §6).
 *
 * Accents are fixed BY INDEX, not by content, so ▲ is always cyan across every
 * question in every round. Shape carries the identity, so nothing here depends
 * on color alone.
 *
 * Selection is expressed by form, not hue (spec decision 5): a dedicated
 * selection color would collide with option 1's cyan and make the "which
 * option" signal fight the "which is mine" signal.
 */
const OPTIONS = [
  { glyph: '▲', accent: 'var(--color-neon-cyan)' },
  { glyph: '◆', accent: 'var(--color-neon-magenta)' },
  { glyph: '●', accent: 'var(--color-neon-lime)' },
  { glyph: '■', accent: 'var(--color-warning)' },
] as const;

export default function AnswerButtons({
  options, live, lockedChoice, spectating, onChoose,
}: {
  options: string[];
  /** True only during ANSWER: the server phase is the sole authority. */
  live: boolean;
  lockedChoice: number | null;
  spectating: boolean;
  onChoose: (i: number) => void;
}) {
  const disabled = !live || lockedChoice !== null || spectating;

  // 1-4 shortcuts. Live only while a choice can actually be made, and never
  // when a modifier is held — Ctrl+1 etc. belong to the browser.
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const index = ['1', '2', '3', '4'].indexOf(e.key);
      if (index === -1 || index >= options.length) return;
      e.preventDefault();
      onChoose(index);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disabled, options.length, onChoose]);

  return (
    <motion.div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      initial="hidden"
      animate="shown"
      variants={{ shown: { transition: { staggerChildren: READ_OPTION_STAGGER / 1000 } } }}
    >
      {options.map((opt, i) => {
        const { glyph, accent } = OPTIONS[i];
        const chosen = lockedChoice === i;
        const faded = lockedChoice !== null && !chosen;

        return (
          <motion.button
            key={i}
            type="button"
            data-testid="answer-option"
            data-index={i}
            data-locked={chosen ? 'true' : undefined}
            disabled={disabled}
            onClick={() => onChoose(i)}
            variants={{ hidden: { opacity: 0, y: 12 }, shown: { opacity: 1, y: 0 } }}
            className={`flex min-h-14 items-center gap-3 rounded-control border border-white/10 border-l-4
              bg-night/60 p-4 text-left font-semibold text-ink backdrop-blur-md
              transition-[opacity,box-shadow,border-color] duration-(--dur-cut) ease-snap
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-cyan
              disabled:cursor-not-allowed
              ${live && !chosen && !faded ? 'enabled:hover:border-white/25' : ''}
              ${chosen ? 'opacity-100' : faded ? 'opacity-45' : live ? 'opacity-100' : 'opacity-55'}`}
            style={{
              borderLeftColor: accent,
              boxShadow: chosen ? `0 0 0 2px ${accent}, 0 0 34px -10px ${accent}` : undefined,
            }}
          >
            <span
              aria-hidden="true"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm"
              style={
                chosen
                  ? { backgroundColor: accent, color: 'var(--color-void)' }
                  : { backgroundColor: `color-mix(in oklab, ${accent} 14%, transparent)`, color: accent }
              }
            >
              {glyph}
            </span>
            <span className="min-w-0 flex-1">{opt}</span>
            <span
              aria-hidden="true"
              className="hidden shrink-0 rounded border border-white/12 px-1.5 py-0.5 text-[10px]
                font-bold text-ink-mute [@media(hover:hover)and(pointer:fine)]:block"
            >
              {i + 1}
            </span>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
```

- [ ] **Step 2: Update the call site in `components/GameView.tsx`**

Replace the `AnswerButtons` block (currently lines 46-53) with:

```tsx
      {question && steps.options && (
        <AnswerButtons
          options={question.options}
          live={steps.optionsLive}
          lockedChoice={lockedChoice}
          spectating={spectating}
          onChoose={choose}
        />
      )}
```

Add the store reads near the other hooks at the top of `GameView`:

```tsx
  const steps = useStaging(s => s.steps);
  const lockedChoice = useStaging(s => s.lockedChoice);
  const spectating = useStaging(s => s.spectating);
```

with `import { useStaging } from '@/lib/staging/useStaging';`.

And persist the lock inside `choose`, immediately after the optimistic `setMyAnswer(i)`:

```tsx
    setMyAnswer(i); // optimistic lock
    saveAnswerLock(code, room.round, i);
```

with `import { saveAnswerLock } from '@/lib/staging/answerLock';`.

- [ ] **Step 3: Verify live**

Run: `npm run dev`, start a two-player game, reach ANSWER.

Check each of these by hand:
1. Four buttons, edges cyan / magenta / lime / amber, glyphs ▲ ◆ ● ■ in that order.
2. During READ the buttons are visible at reduced opacity and cannot be clicked or focused.
3. Pressing `2` during ANSWER locks the second option; `Ctrl+2` does not.
4. After locking, the chosen button is ringed and its chip inverted; the other three are faded and disabled.
5. Tab reaches every enabled button and Enter activates it; the focus ring is cyan and clearly visible.
6. On a narrow viewport (DevTools, 390×844) the buttons are one column and at least 56px tall.

- [ ] **Step 4: Lint and commit**

Run: `npx eslint components/AnswerButtons.tsx components/GameView.tsx`
Expected: no output.

```bash
git add components/AnswerButtons.tsx components/GameView.tsx
git commit -m "feat(p3a): shape-coded answer buttons with 1-4 shortcuts

Accents fixed by index, selection expressed by form rather than hue, and
the lock now persists for the round. Drops the dead correctIndex prop —
these buttons are never rendered during REVEAL."
```

---

### Task 6: The question card and the countdown ring

Spec §5. Badges slam in from opposite edges and lock with `EASE.settle`'s overshoot; the question rises under them. The ring gives up its own rAF loop to the staging ticker (spec decision 7) and escalates through the quantized step.

**Files:**
- Modify: `components/QuestionCard.tsx` (full rewrite)
- Modify: `components/TimerRing.tsx` (full rewrite)

**Interfaces:**
- Consumes: `StageSteps` (Task 1), `useStaging` (Task 3), `--timer-frac` (Task 4).
- Produces: `<QuestionCard question round totalRounds steps />`; `<TimerRing />` (no props — it reads the store and the CSS variable).

- [ ] **Step 1: Rewrite `components/QuestionCard.tsx`**

```tsx
'use client';
import { AnimatePresence, motion } from 'motion/react';
import type { QuestionPublic } from '@/lib/types';
import type { StageSteps } from '@/lib/staging/beats';
import { TIER_NAMES, CATEGORIES } from '@/lib/rank';
import { EASE } from '@/lib/presentation/tokens';

/**
 * The READ beat's announcement (spec §5): category and tier slam in from
 * opposite edges and lock, then the question rises under them.
 *
 * Visibility comes from `steps`, which is derived from the server deadline —
 * a client that joins or reloads mid-READ gets `steps` already true and
 * `motion` mounts it at rest instead of replaying the slam.
 */
const slam = (from: number) => ({
  hidden: { opacity: 0, x: from },
  shown: { opacity: 1, x: 0, transition: { duration: 0.46, ease: EASE.settle } },
});

export default function QuestionCard({
  question, round, totalRounds, steps,
}: {
  question: QuestionPublic;
  round: number;
  totalRounds: number;
  steps: StageSteps;
}) {
  const cat = CATEGORIES.find(c => c.key === question.category);

  return (
    <div className="space-y-4 text-center">
      <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.14em]">
        <span className="text-ink-mute tabular-nums">Q{round}/{totalRounds}</span>
        <AnimatePresence>
          {steps.badges && (
            <>
              <motion.span
                key="category"
                variants={slam(-40)} initial="hidden" animate="shown" exit="hidden"
                className="rounded-full border border-white/10 bg-haze/45 px-3 py-1.5 text-ink-dim"
              >
                {cat?.emoji} {cat?.label}
              </motion.span>
              <motion.span
                key="tier"
                variants={slam(40)} initial="hidden" animate="shown" exit="hidden"
                className="rounded-full border border-warning/35 bg-warning/10 px-3 py-1.5 text-warning"
              >
                {TIER_NAMES[question.tier]}
              </motion.span>
            </>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {steps.question && (
          <motion.h2
            key={`${round}:${question.prompt}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.46, ease: EASE.snap } }}
            exit={{ opacity: 0 }}
            className="text-balance font-display text-2xl font-black leading-tight text-ink sm:text-hero"
          >
            {question.prompt}
          </motion.h2>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `components/TimerRing.tsx`**

```tsx
'use client';
import { useStaging } from '@/lib/staging/useStaging';

/**
 * The ANSWER countdown (spec §5).
 *
 * One clock (spec decision 7): the sweep comes from `--timer-frac`, written by
 * the staging ticker, and the numeral from the store's whole-second value.
 * This component runs no rAF loop of its own — two clocks on one beat is how
 * the ring and the vignette drift apart.
 */
const R = 30;
const C = 2 * Math.PI * R; // 188.5

export default function TimerRing() {
  const secondsLeft = useStaging(s => s.secondsLeft);
  const step = useStaging(s => s.tensionStep);
  if (secondsLeft === null) return null;

  const hot = step >= 2;
  const stroke = hot ? 'var(--color-wrong)' : 'var(--color-warning)';

  return (
    <div className={`relative h-18.5 w-18.5 ${step >= 3 ? 'animate-pulse' : ''}`}>
      <svg viewBox="0 0 74 74" className="h-18.5 w-18.5 -rotate-90" aria-hidden="true">
        <circle cx="37" cy="37" r={R} fill="none" stroke="var(--color-dusk)" strokeWidth="7" />
        <circle
          cx="37" cy="37" r={R} fill="none"
          stroke={stroke} strokeWidth={hot ? 9 : 7} strokeLinecap="round"
          strokeDasharray={C}
          className="transition-[stroke,stroke-width] duration-(--dur-beat) ease-snap"
          style={{ strokeDashoffset: `calc(${C.toFixed(1)}px * (1 - var(--timer-frac, 0)))` }}
        />
      </svg>
      <span
        role="timer"
        aria-live="off"
        className="absolute inset-0 grid place-items-center font-display text-2xl font-black tabular-nums"
        style={{ color: stroke }}
      >
        {secondsLeft}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Update both call sites in `components/GameView.tsx`**

Both signatures changed, so `GameView` will not typecheck until it is updated. `QuestionCard` now needs `steps`, and `TimerRing` takes no props at all:

```tsx
      {question && (
        <QuestionCard
          question={question}
          round={room.round}
          totalRounds={room.total_rounds}
          steps={steps}
        />
      )}

      {room.phase === 'answer' && (
        <div className="flex justify-center">
          <TimerRing />
        </div>
      )}
```

`steps` is already read from `useStaging` in `GameView` — Task 5 added it.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify live**

Run: `npm run dev`, start a two-player game with a 20s timer.

1. At READ, the category and tier chips arrive from left and right and settle with a slight overshoot; the question rises about half a second later.
2. During ANSWER, the ring sweeps smoothly (not in one-second jumps) while the numeral steps once per second.
3. The ring is amber and thin until roughly T‑4s, then thickens and goes red; it pulses in the last second or so.
4. Set the profile override to **reduced** via the settings control and repeat: chips cross-fade with no horizontal travel, the ring changes state without a pulse, and the vignette moves in three visible steps rather than a ramp.
5. **Phase advance mid-animation** (spec §11): reload the page ~200ms into READ, then let the beat run out. The badges must not replay, and the ANSWER transition must cut cleanly rather than waiting for anything in flight.

- [ ] **Step 5: Lint and commit**

Run: `npx eslint components/QuestionCard.tsx components/TimerRing.tsx components/GameView.tsx`
Expected: no output.

```bash
git add components/QuestionCard.tsx components/TimerRing.tsx components/GameView.tsx
git commit -m "feat(p3a): staged question card and an escalating countdown ring

Badges slam in and lock, the question rises under them. The ring drops
its own rAF loop: the sweep reads --timer-frac and the numeral reads the
store's whole second."
```

---

### Task 7: The stage shell, the countdown, and the e2e suite

The last structural change: `GameView`'s branching returns become persistent regions so beat changes are transitions rather than unmount/mount swaps, and the portrait padding hack becomes a real grid. Two existing e2e specs assert copy this phase removes — they are updated here, onto stable test hooks so P3b does not break them again.

**Files:**
- Create: `components/StageShell.tsx`
- Modify: `components/GameView.tsx` (full rewrite)
- Modify: `e2e/game-flow.spec.ts:63-75`
- Modify: `e2e/world.spec.ts:66-79`
- Create: `e2e/staging.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-6.
- Produces: DOM hooks `[data-testid="stage-shell"]` with `data-beat="<beat>"`, and the live region `[data-testid="stage-announcer"]`.

- [ ] **Step 1: Create `components/StageShell.tsx`**

```tsx
'use client';
import { useStaging } from '@/lib/staging/useStaging';

/**
 * The persistent question surface (spec §7).
 *
 * Regions live here for the whole of READ → ANSWER → REVEAL so a beat change
 * animates its contents instead of unmounting the page. `data-beat` is the
 * stable hook the e2e suite keys on — assert on it, not on copy.
 *
 * In portrait the Pixi strip owns the top 28vh (components/PixiStage.tsx:10)
 * and this grid owns the rest: question centred in its own band, options
 * pinned toward the thumb. The offset is 28vh, matching the strip the canvas
 * actually draws — GameView's old `pt-[30vh]` was never aligned to it.
 */
export default function StageShell({
  header, question, options, outcome,
}: {
  header: React.ReactNode;
  question: React.ReactNode;
  options: React.ReactNode;
  outcome: React.ReactNode;
}) {
  const beat = useStaging(s => s.beat);
  const announcement = useStaging(s => s.announcement);

  return (
    <main
      data-testid="stage-shell"
      data-beat={beat}
      className="mx-auto grid min-h-screen w-full max-w-2xl grid-rows-[auto_1fr_auto] gap-6 p-6
        portrait:pt-[28vh] landscape:bg-abyss/60 landscape:backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-4">{header}</div>
      <div className="flex flex-col justify-center">{question}</div>
      <div className="space-y-4">
        {options}
        {outcome}
      </div>
      <p
        data-testid="stage-announcer"
        aria-live="polite"
        className="sr-only"
      >
        {announcement}
      </p>
    </main>
  );
}
```

Tailwind v4 has no `sr-only` unless the preflight provides it — it does, via the Tailwind base layer already imported at `app/globals.css:1`. If the announcer is visible when you check Step 5, add this to `globals.css` instead of debugging further:

```css
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
}
```

- [ ] **Step 2: Rewrite `components/GameView.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useGameStore } from '@/lib/store';
import { supabase } from '@/lib/supabaseClient';
import { loadSession } from '@/lib/session';
import { msUntil } from '@/lib/serverTime';
import { loadAnswerLock, saveAnswerLock, clearAnswerLock } from '@/lib/staging/answerLock';
import { useStaging } from '@/lib/staging/useStaging';
import StageShell from './StageShell';
import TimerRing from './TimerRing';
import QuestionCard from './QuestionCard';
import AnswerButtons from './AnswerButtons';
import RevealPanel from './RevealPanel';
import TrackReadout from './TrackReadout';

export default function GameView({ code }: { code: string }) {
  const room = useGameStore(s => s.room);
  const question = useGameStore(s => s.question);
  const reveal = useGameStore(s => s.reveal);
  const myAnswer = useGameStore(s => s.myAnswer);
  const setMyAnswer = useGameStore(s => s.setMyAnswer);
  const steps = useStaging(s => s.steps);
  const lockedChoice = useStaging(s => s.lockedChoice);
  const spectating = useStaging(s => s.spectating);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const phase = room?.phase;
  const round = room?.round ?? 0;

  // Restore a lock the server already holds (spec §8.1). Runs when ANSWER
  // begins and after a reload; the key is round-scoped, so it can never
  // resurrect a previous round's choice.
  useEffect(() => {
    if (phase !== 'answer' || myAnswer !== null) return;
    const stored = loadAnswerLock(code, round);
    if (stored !== null) setMyAnswer(stored);
  }, [code, phase, round, myAnswer, setMyAnswer]);

  // A new READ means a new round: drop the previous round's key.
  useEffect(() => {
    if (phase === 'read' && round > 1) clearAnswerLock(code, round - 1);
  }, [code, phase, round]);

  if (!room) return null;

  async function choose(i: number) {
    if (!room || myAnswer !== null) return;
    setMyAnswer(i); // optimistic lock
    saveAnswerLock(code, room.round, i);
    const session = loadSession(code);
    if (!session) return;
    const { error } = await supabase.rpc('submit_answer', {
      p_room_id: room.id, p_player_key: session.playerKey,
      p_round: room.round, p_choice_index: i,
    });
    if (error) setSubmitError(error.message);
  }

  if (room.phase === 'countdown') return <Countdown endsAt={room.ends_at} />;
  if (room.phase === 'track') return <TrackReadout code={code} />;

  return (
    <StageShell
      header={
        <>
          {question && (
            <QuestionCard
              question={question}
              round={room.round}
              totalRounds={room.total_rounds}
              steps={steps}
            />
          )}
          {room.phase === 'answer' && <TimerRing />}
        </>
      }
      question={null}
      options={
        question && steps.options ? (
          <AnswerButtons
            options={question.options}
            live={steps.optionsLive}
            lockedChoice={lockedChoice}
            spectating={spectating}
            onChoose={choose}
          />
        ) : null
      }
      outcome={
        <>
          {spectating && room.phase === 'answer' && (
            <p className="text-center text-sm text-ink-mute">You&rsquo;re watching this one.</p>
          )}
          {room.phase === 'reveal' && question && reveal && (
            <RevealPanel reveal={reveal} question={question} />
          )}
          {submitError && <p className="text-center text-sm text-wrong">{submitError}</p>}
        </>
      }
    />
  );
}

/** Restyled to the design system (spec §5). No choreography — not in P3's scope. */
function Countdown({ endsAt }: { endsAt: string | null }) {
  const [n, setN] = useState(3);
  useEffect(() => {
    const id = setInterval(() => setN(Math.max(1, Math.ceil(msUntil(endsAt) / 1000))), 100);
    return () => clearInterval(id);
  }, [endsAt]);
  return (
    <main className="grid min-h-screen place-items-center">
      <span
        className="font-display text-display font-black text-neon-cyan tabular-nums"
        style={{ textShadow: '0 0 60px color-mix(in oklab, var(--color-neon-cyan) 55%, transparent)' }}
      >
        {n}
      </span>
    </main>
  );
}
```

Note the `question` region is passed `null`: `QuestionCard` renders both the badges and the prompt as one unit and belongs in the header band, above the ring. The region stays in `StageShell`'s signature because P3b puts the reveal's correct-answer callout there.

- [ ] **Step 3: Update the e2e helper in `e2e/game-flow.spec.ts`**

Replace the body of `answerRound` (lines 63-75) with:

```ts
async function answerRound(p: Page, label: string) {
  // countdown
  await expect(p.getByText(/^[123]$/)).toBeVisible({ timeout: 10_000 });
  // read — assert on the stable beat hook, never on copy
  await expect(p.locator('[data-testid="stage-shell"][data-beat="read"]')).toBeVisible({ timeout: 10_000 });
  // answer: lock in the first option
  const firstOption = p.getByTestId('answer-option').first();
  await expect(firstOption).toBeEnabled({ timeout: 10_000 });
  await firstOption.click();
  await expect(firstOption).toHaveAttribute('data-locked', 'true');
  // reveal
  await expect(p.getByText('Correct answer')).toBeVisible({ timeout: 10_000 });
  // track
  await expect(p.getByText(/The track — after Q1/)).toBeVisible({ timeout: 10_000 });
  void label;
}
```

- [ ] **Step 4: Update the same assertions in `e2e/world.spec.ts`**

Replace lines 68-77 (the `Get ready…` / `main button` / `Locked in!` sequence) with:

```ts
    await expect(host.locator('[data-testid="stage-shell"][data-beat="read"]')).toBeVisible({ timeout: 10_000 });

    const firstOption = host.getByTestId('answer-option').first();
    await expect(firstOption).toBeEnabled({ timeout: 10_000 });
    await firstOption.click();
    await expect(firstOption).toHaveAttribute('data-locked', 'true');

    await expect(host.getByText('Correct answer')).toBeVisible({ timeout: 10_000 });
```

- [ ] **Step 5: Run the existing e2e suite**

Run: `npm run test:e2e`
Expected: PASS — all six specs. If `world.spec.ts` fails on the strip/full band assertion at line 112, that is a real regression from `StageShell`: `PixiStage` keys `data-band` off `room.phase`, which this task does not change, so investigate rather than adjusting the assertion.

- [ ] **Step 6: Write the new e2e coverage**

Create `e2e/staging.spec.ts`. Copy the room-setup preamble from `e2e/game-flow.spec.ts:6-45` (one Warm-Up question, 5s timer, two players, start) — repeated rather than shared because the existing specs each carry their own, and follow the established pattern:

```ts
import { test, expect } from '@playwright/test';

test('the answer lock is keyboard-operable and survives a reload', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const host = page;
  await host.goto('/host/new');

  const minusButtons = host.getByRole('button', { name: '−' });
  const clicksPerTier = [3, 4, 3, 1]; // 4,4,3,1 -> 1,0,0,0
  for (let i = 0; i < clicksPerTier.length; i++) {
    for (let c = 0; c < clicksPerTier[i]; c++) await minusButtons.nth(i).click();
  }
  await expect(host.getByText(/^1 questions/)).toBeVisible();

  const timerSlider = host.locator('input[type=range]');
  await timerSlider.evaluate((el: HTMLInputElement) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, '30');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(host.getByText('Answer timer: 30s')).toBeVisible();

  await host.getByPlaceholder('Your nickname').fill('Hosty');
  await host.getByRole('button', { name: /create room/i }).click();
  await expect(host).toHaveURL(/\/room\/[A-Z0-9]{5}$/);
  const code = host.url().split('/').pop()!;

  const joinerContext = await browser.newContext();
  const joiner = await joinerContext.newPage();
  await joiner.goto(`/room/${code}`);
  await joiner.getByPlaceholder('Your nickname').fill('Joiner');
  await joiner.getByRole('button', { name: 'Join game' }).click();
  await expect(joiner.getByText('Starting grid')).toBeVisible();

  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
  await host.getByRole('button', { name: /start the race/i }).click();

  // READ shows the options but refuses input — the server phase is the only
  // interaction authority (spec decision 1).
  const options = joiner.getByTestId('answer-option');
  await expect(joiner.locator('[data-testid="stage-shell"][data-beat="read"]')).toBeVisible({ timeout: 15_000 });
  await expect(options.first()).toBeDisabled();

  // ANSWER: the 1-4 shortcut locks the matching option.
  await expect(options.first()).toBeEnabled({ timeout: 15_000 });
  await joiner.keyboard.press('2');
  await expect(options.nth(1)).toHaveAttribute('data-locked', 'true');

  // The other three go disabled, and the lock is announced.
  await expect(options.nth(0)).toBeDisabled();
  await expect(options.nth(2)).toBeDisabled();
  await expect(joiner.getByTestId('stage-announcer')).toContainText('Locked in:');

  // The lock survives a reload — no re-enabled buttons, no 'already answered'.
  await joiner.reload();
  const afterReload = joiner.getByTestId('answer-option');
  await expect(afterReload.nth(1)).toHaveAttribute('data-locked', 'true', { timeout: 15_000 });
  await expect(afterReload.nth(0)).toBeDisabled();

  await joinerContext.close();
});
```

- [ ] **Step 7: Run the new spec**

Run: `npm run test:e2e -- e2e/staging.spec.ts`
Expected: PASS.

Then the whole suite: `npm run test:e2e`
Expected: PASS — seven specs.

- [ ] **Step 8: Lint and commit**

Run: `npx eslint components/StageShell.tsx components/GameView.tsx e2e/staging.spec.ts e2e/game-flow.spec.ts e2e/world.spec.ts`
Expected: no output.

```bash
git add components/StageShell.tsx components/GameView.tsx e2e/staging.spec.ts e2e/game-flow.spec.ts e2e/world.spec.ts
git commit -m "feat(p3a): persistent stage shell and beat-keyed e2e hooks

GameView's branching returns become regions that survive a beat change,
and the e2e suite keys on data-beat and data-testid rather than on copy
this phase removed."
```

---

## Closing out the phase

- [ ] **Walk the exit criteria live.** Run a full two-player game and check each of spec §12's eight criteria by hand, capturing playwright-cli screenshots at READ+0.2s, READ+1.5s, ANSWER T‑8s, ANSWER T‑2s and locked, in portrait (390×844) and landscape, under both profiles. Screenshots are development evidence, not committed snapshots.

  **On criterion 7:** the spec phrases it as re-renders "on the order of ten times per beat". Measure it as **publishes per second** using the Task 4 Step 6 probe — expect ≈1 Hz (driven by `secondsLeft`), so a 30s ANSWER beat legitimately produces ~30 publishes. The criterion's intent is 1 Hz vs 60 Hz; a 30s beat exceeding "ten" is not a failure. Record this reading in the phase document.

- [ ] **Confirm nothing crossed the line.** `git diff main --stat` must show no changes under `supabase/`. This phase is presentation-only.

- [ ] **Run both suites one last time.** `npm test` and `npm run test:e2e`, both green.

- [ ] **Write the ADRs** named in spec §13, following `docs/ADR/README.md`. Numbering continues from 0013:
  - `0014` — beat position derived from `ends_at`, not local arrival (and why the client hand-mirrors the server's nominal durations).
  - `0015` — continuous presentation values go to CSS custom properties; only quantized state enters React.
  - `0016` — staging never gates input; the server phase is the sole interaction authority.
  - `0017` — answer selection is expressed by form, not hue.

- [ ] **Write `docs/progress/P3a-round-staging.md`** — scope, what was built, deviations from the spec, verification results — and update `docs/progress/CURRENT.md`: clear the active phase, point "Next up" at P3b, and carry forward the two notes P3b needs:
  - the avatar-stacked distribution bar is not buildable on the current wire (`build_reveal` returns `counts` only, `0002_rpcs.sql:61`), so P3b must either drop the stacking or make the payload addition an explicit decision;
  - if P3b opens the protocol, the `current_streak` addition to `Standing` already recorded in `CURRENT.md` should ride along in the same change.

- [ ] **Use superpowers:finishing-a-development-branch** to decide how this integrates.
