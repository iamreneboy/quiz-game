# M3 P5a — The Starting Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The last M1-era screen crosses into the P0 design system, and the
lobby stops teleporting into the countdown — the field rolls up from the
starting grid and takes the line while the numerals count down.

**Architecture:** Three layers move together for one beat. The **world** gains
a second way to start a movement sequence: `beginFormationMove` builds the same
anticipate → launch → travel → settle tracks the choreographer already samples,
but from an explicit pair of anchor sets rather than from buffered drama cues,
and `beginCountdownRollUp` positions that sequence against the server's
`phase_ends_at` so a reload two seconds into the countdown lands settled instead
of replaying the launch. The **DOM** gains one shared `Countdown` component
(the numeral currently exists twice, once per surface) and one exit animation at
the room page's stage seam, so the lobby panel lifts away rather than vanishing.
The **lobby itself** is restyled onto tokens, and a source-scanning unit test
makes a raw Tailwind palette class un-committable from here on.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4,
`motion` v13, PixiJS 8, Vitest, Playwright. **No new dependencies. No schema,
no RPC, no migration, no realtime payload change.**

**Spec:** `docs/superpowers/specs/2026-08-29-m3-host-power-polish-roadmap.md`
— §3 "P5 — Polish & launch readiness" is the requirement set; §2 and §4 bind
every task. Per roadmap §6, P5 writes no drill-down spec, so this plan is where
its lines are drawn.

### Scope check — why P5 is P5a + P5b, and why P5a needs no spec

The roadmap's P5 block is two different kinds of work wearing one label:
**build** (a restyle and a piece of choreography) and **audit** (accessibility,
four PRD §11 measurements, two carried-debt decisions). Together they are ~13
tasks, well past the roadmap's 4–8 drill-down guidance, and they fail on
different things — a reviewer can accept a restyle while rejecting a contrast
threshold. They are split:

| Plan | Scope | Gate |
|---|---|---|
| **P5a (this plan)** | `LobbyView` restyle; the lobby → countdown transition | Unit + e2e + headed live run |
| **P5b** | Accessibility audit; PRD §11 measured; carried debt closed in writing | Recorded measurements |

P5b starts only when P5a has merged: the audit must run over the restyled
lobby, not the old one, or it audits a screen that no longer exists.

Roadmap §6's ratchet names this phase's choreography as work that "may deserve
a small spec of its own." It is resolved here instead, in the decisions table
below, because the design uncertainty turned out to be enumerable — six
questions, each with an existing mechanism that answers it. If executing Task 1
or Task 3 surfaces a seventh, stop and write the spec; the ratchet is one-way.

### Decisions this plan owns and resolves

| Decision | Resolved as | Where |
|---|---|---|
| **What actually moves at lights-out** | **The field, not the camera.** The camera already interpolates — `beginMove`/`sampleMove` in `lib/world/runtime.ts` ease the lobby `startLine` shot into the countdown `establishing` shot over the drift style. The avatars do not: `fieldAnchors` returns `gridAnchors` while `phase === 'lobby'` and `startLineAnchors` the frame after, with nothing in between. So the fix is one movement sequence over the existing grammar, not new camera work. | Task 1, Task 3 |
| **Where the roll-up's origin comes from** | **Recomputed, not remembered.** The store sets `phase` before the cue bridge runs (`lib/world/choreographer.ts`'s `holdAnchors` docstring), so by the time `phase-countdown` arrives `fieldAnchors` already answers "start line". The handler calls `gridAnchors` directly for the formation being left. Rejected: holding the lobby anchors on every lobby frame — a per-frame write to keep one value that is a pure function of state the store still holds. | Task 3 |
| **Whether the roll-up replays on a reload** | **No — it is positioned against `ends_at`, like every other beat.** `beginCountdownRollUp` takes `remainingMs` and starts the sequence at `now - elapsedIn(NOMINAL_MS.countdown, remainingMs)`. A client landing 2.4s into a 3s countdown starts a sequence that finished 0.4s ago and renders it settled, with no flag and no special case (ADR-0014's derivation, reused). Rejected: an `AnimatePresence initial={false}`-style guard, which has no purchase here — nothing mounts conditionally, the runtime is one long-lived ticker. This is the same shape as `ResultsView`'s mount-time derivation in CURRENT.md's notes. | Task 1 |
| **Stagger order** | **Front row first** — descending `x`, the reverse of `beginSequence`'s back-marker-first ordering. A race start unspools from the line backwards; a pass reads as the passer arriving after the passed. Two orders, two meanings, one `staggerFor`. | Task 1 |
| **Whether the DOM cross-fades or hands off** | **Hands off.** `AnimatePresence mode="wait"` at the room page's one content seam, so exactly one `<main>` landmark exists at every instant — a cross-fade needs both views absolutely positioned and puts two `<main>`s in the tree for the overlap, which is a defect P5b would then have to file. Only the lobby has a non-zero exit (`DURATION.beat`); every other stage exits in 0ms, because `mode="wait"` would otherwise insert a gap in front of the ceremony, whose DOM is `ends_at`-derived and cannot afford to arrive late (ADR-0030). | Task 4 |
| **One countdown or two** | **One `components/Countdown.tsx`, consumed by both surfaces.** The numeral exists twice today (`GameView`'s `Countdown`, `StageBroadcast`'s `StageCountdown`) with identical logic and a comment on each saying so. The TV's scale comes free from the `[data-surface="stage"]` token override (ADR-0035), so no variant prop is needed. Same argument as `OPTION_IDENTITIES`: two copies would eventually disagree and no test would be looking. | Task 2 |
| **How "no screen outside the design system" is kept true** | **A source-scanning unit test**, not a review habit. `tests/designSystem.test.ts` reads every `.tsx` under `components/` and `app/` and fails on any raw Tailwind palette class. `LobbyView` is currently the only file that matches — 20 occurrences, verified while planning — so the test goes green exactly when the restyle lands, and red the next time someone reaches for `text-slate-400`. | Task 5 |

## Global Constraints

Copied from the roadmap. Every task's requirements implicitly include this
section.

- **The wire does not open.** No new realtime event, no new payload field, no
  new cue type, no wire-opening ADR. `phase-countdown` already carries `endsAt`
  (`lib/presentation/deriveCues.ts:256`) and that is the only thing this phase
  reads.
- **No schema, no RPC, no migration.** Nothing under `supabase/` is touched.
- **The celebration hierarchy extends by exactly zero rungs.** The roll-up is
  `routine`; M3's one allowed addition (`suddenDeath`) is already spent.
- **The Fairness Law is untouched** — `standings`' sort clause is not read.
- **No new runtime dependencies** (roadmap decision 7).
- **Rendering separation (PRD §9):** Pixi owns the world; HTML/CSS/React owns
  everything readable and interactive. The roll-up is world; the countdown
  numeral, the lobby and the handoff are DOM.
- **Engine/mode/world boundaries (PRD §3.5):** the roll-up is a *world* concern
  and belongs in `lib/world/`. The countdown numeral and the stage seam are
  engine concerns and belong outside `lib/world/`.
- **Accessibility is an acceptance criterion**, not P5b's job to add later:
  every control the restyle touches keeps a `focus-visible` ring, keeps its
  accessible name and keeps its `aria-*`; exactly one `<main>` exists at every
  instant; the countdown numeral is not the only signal that the race is
  starting (a `role="status"` line says so too).
- **Verbatim copy that must not be reworded** (asserted in e2e):
  `Starting grid — {n} joined`, `Start the race`, `Need at least 2 players`,
  `Waiting for the host to start…`. Preserve `data-testid` values
  `lobby-roster`, `late-badge`, `lobby-review-link`, `stage-link`.
- **The regression floor at the end of the phase:** every existing unit test
  plus whatever this plan adds, `npm run lint` clean, `npx tsc --noEmit`
  silent, `npm run test:e2e -- --workers=1` green (**`--workers=1`** —
  `--workers=2` fails reproducibly on this machine from an untouched `main`;
  CURRENT.md). Any lint error is a real one.
- **Live verification stays headed.** Headless Chromium falls back to
  SwiftShader and pins the VFX budget at `minimal` before a test starts, so it
  cannot be used to judge the roll-up (CURRENT.md).
- **Do not run `supabase stop` / `supabase start`** — the local stack is bound
  on shifted ports that a restart would lose (CURRENT.md). A fresh worktree
  needs `.env.local` and `supabase/.temp/` hand-copied in, and its own
  `npm install`; never junction `node_modules`.

---

### Task 1: The roll-up, as choreography

**Files:**
- Modify: `lib/world/choreographer.ts` (add two exports after `completeSequence`)
- Test: `tests/choreographer.test.ts` (append two `describe` blocks)

**Interfaces:**
- Consumes: `MovementTrack`, `staggerFor`, `MOVEMENT_MS`, `STAGGER_MS`,
  `sampleMovement` from `lib/world/movement.ts`; `MarkerAnchor` from
  `lib/world/geometry.ts`; `Profile` from `lib/presentation/profile.ts`;
  `elapsedIn`, `NOMINAL_MS` from `lib/staging/beats.ts` (the same cross-import
  `lib/world/runtime.ts:14` already makes).
- Produces:
  - `beginFormationMove(state: ChoreographerState, from: readonly MarkerAnchor[], to: readonly MarkerAnchor[], startedAt: number, profile: Profile): ChoreographerState`
  - `beginCountdownRollUp(state: ChoreographerState, grid: readonly MarkerAnchor[], line: readonly MarkerAnchor[], remainingMs: number | null, now: number, profile: Profile): ChoreographerState`

- [ ] **Step 1: Write the failing tests**

Append to `tests/choreographer.test.ts`. Read the file's existing imports first
and extend them rather than adding a second import statement from the same
module; the local helpers below (`anchor`, `NO_FLAIR`, `FULL`) may already
exist there under different names — reuse them if so.

```ts
import {
  beginFormationMove,
  beginCountdownRollUp,
  initialChoreographerState,
  avatarStates,
  isSequenceRunning,
} from '@/lib/world/choreographer';
import { MOVEMENT_MS, STAGGER_MS } from '@/lib/world/movement';
import { NOMINAL_MS } from '@/lib/staging/beats';
import type { MarkerAnchor } from '@/lib/world/geometry';

const anchor = (playerId: string, x: number, y = 0): MarkerAnchor =>
  ({ playerId, x, y, row: 0, rank: 0, side: 0, segment: 0 });

/** No flair, no budget clamping — these blocks are about positions only. */
const NO_FLAIR = new Map();
const FULL = { trail: 1, accent: 1, arena: 1, turbo: 1, streak: 1, maxStreakTier: 8 as const };

describe('beginFormationMove', () => {
  // A three-column grid in the run-off, and the line it rolls up to.
  const grid = [anchor('a', -40), anchor('b', -130), anchor('c', -220)];
  // Segment 0 with a tie pairing: c right, a centre-ish, b left.
  const line = [anchor('a', 0), anchor('b', -45), anchor('c', 45)];

  it('staggers front row first — the reverse of a drama beat', () => {
    const state = beginFormationMove(initialChoreographerState, grid, line, 0, 'high');
    const delays = Object.fromEntries(
      state.sequence!.tracks.map(t => [t.playerId, t.delayMs]),
    );
    // Descending x on the LINE: c(45), a(0), b(-45).
    expect(delays).toEqual({ c: 0, a: STAGGER_MS, b: 2 * STAGGER_MS });
  });

  it('runs each track from its grid slot to its place on the line', () => {
    const state = beginFormationMove(initialChoreographerState, grid, line, 0, 'high');
    const byId = new Map(state.sequence!.tracks.map(t => [t.playerId, t]));
    expect(byId.get('a')!.from.x).toBe(-40);
    expect(byId.get('a')!.to.x).toBe(0);
    expect(byId.get('c')!.from.x).toBe(-220);
    expect(byId.get('c')!.to.x).toBe(45);
  });

  it('holds the whole field on the grid at t = 0', () => {
    const state = beginFormationMove(initialChoreographerState, grid, line, 0, 'high');
    const xs = Object.fromEntries(
      avatarStates(state, line, NO_FLAIR, FULL, 0, 'high').map(a => [a.playerId, a.x]),
    );
    expect(xs).toEqual({ a: -40, b: -130, c: -220 });
  });

  it('lands the whole field on the line once the sequence is over', () => {
    const state = beginFormationMove(initialChoreographerState, grid, line, 0, 'high');
    const end = state.sequence!.durationMs;
    const xs = Object.fromEntries(
      avatarStates(state, line, NO_FLAIR, FULL, end, 'high').map(a => [a.playerId, a.x]),
    );
    expect(xs).toEqual({ a: 0, b: -45, c: 45 });
  });

  it('lasts the last stagger plus one movement', () => {
    const state = beginFormationMove(initialChoreographerState, grid, line, 0, 'high');
    expect(state.sequence!.durationMs).toBe(2 * STAGGER_MS + MOVEMENT_MS);
  });

  it('snaps under the reduced profile, with no stagger at all', () => {
    const state = beginFormationMove(initialChoreographerState, grid, line, 0, 'reduced');
    expect(state.sequence!.tracks.every(t => t.delayMs === 0)).toBe(true);
    const xs = avatarStates(state, line, NO_FLAIR, FULL, 0, 'reduced').map(a => a.x);
    expect(xs).toEqual([0, -45, 45]);
  });

  it('gives a racer who was not on the grid a track that does not move', () => {
    // Someone whose join landed between the two anchor computations.
    const withLate = [...line, anchor('d', 90)];
    const state = beginFormationMove(initialChoreographerState, grid, withLate, 0, 'high');
    const late = state.sequence!.tracks.find(t => t.playerId === 'd')!;
    expect(late.from).toEqual({ x: 90, y: 0 });
    expect(late.to).toEqual({ x: 90, y: 0 });
  });

  it('starts nothing for an empty field', () => {
    const state = beginFormationMove(initialChoreographerState, [], [], 0, 'high');
    expect(state.sequence).toBeNull();
  });

  it('clears anything the lobby left buffered', () => {
    const dirty = {
      ...initialChoreographerState,
      pending: [{ type: 'overtake', tier: 'overtake', playerId: 'a', passed: ['b'] }] as never,
      heldAnchors: grid,
    };
    const state = beginFormationMove(dirty, grid, line, 0, 'high');
    expect(state.pending).toEqual([]);
    expect(state.heldAnchors).toBeNull();
  });
});

describe('beginCountdownRollUp', () => {
  const grid = [anchor('a', -40), anchor('b', -130)];
  const line = [anchor('a', 0), anchor('b', -45)];

  it('starts now when the countdown has only just begun', () => {
    const state = beginCountdownRollUp(
      initialChoreographerState, grid, line, NOMINAL_MS.countdown, 1000, 'high',
    );
    expect(state.sequence!.startedAt).toBe(1000);
    expect(isSequenceRunning(state, 1000)).toBe(true);
  });

  it('starts in the past for a client that reloaded mid-countdown', () => {
    // 500ms left of 3000 means the countdown began 2500ms ago.
    const state = beginCountdownRollUp(
      initialChoreographerState, grid, line, 500, 10_000, 'high',
    );
    expect(state.sequence!.startedAt).toBe(10_000 - 2500);
    // 2500ms is well past a 900ms roll-up: settled, not replayed.
    expect(isSequenceRunning(state, 10_000)).toBe(false);
    const xs = avatarStates(state, line, NO_FLAIR, FULL, 10_000, 'high').map(a => a.x);
    expect(xs).toEqual([0, -45]);
  });

  it('treats an unknown deadline as a countdown already over', () => {
    const state = beginCountdownRollUp(
      initialChoreographerState, grid, line, null, 10_000, 'high',
    );
    expect(state.sequence!.startedAt).toBe(10_000 - NOMINAL_MS.countdown);
    expect(isSequenceRunning(state, 10_000)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/choreographer.test.ts`
Expected: FAIL — `beginFormationMove is not a function` /
`beginCountdownRollUp is not a function`.

- [ ] **Step 3: Implement both functions**

In `lib/world/choreographer.ts`, extend the existing `./movement` import with
`staggerFor` if it is not already listed, add
`import { elapsedIn, NOMINAL_MS } from '@/lib/staging/beats';` beside the other
`@/lib/...` imports, and insert after `completeSequence`:

```ts
/**
 * A movement sequence with no drama in it: the field simply goes from one
 * formation to another.
 *
 * `beginSequence` compiles buffered cues; this takes the two formations
 * directly, because the lobby → start-line move is not a consequence of
 * anything a player did. Same grammar (anticipate → launch → travel → settle),
 * same sampler, same reduced-profile snap — only the reason differs.
 *
 * The stagger runs FRONT ROW FIRST (descending x), the reverse of
 * `beginSequence`'s back-marker-first ordering. A race start unspools from the
 * line backwards; a pass has to read as the passer arriving after the passed.
 * Two orders, two meanings, one `staggerFor`.
 *
 * `startedAt` is a parameter rather than "now" so the caller can position the
 * sequence against a server deadline — see `beginCountdownRollUp`.
 */
export function beginFormationMove(
  state: ChoreographerState,
  from: readonly MarkerAnchor[],
  to: readonly MarkerAnchor[],
  startedAt: number,
  profile: Profile,
): ChoreographerState {
  if (to.length === 0) return completeSequence(state);

  const fromById = new Map(from.map(a => [a.playerId, a]));
  const ordered = [...to].sort((a, b) => b.x - a.x);
  const tracks: MovementTrack[] = ordered.map((anchor, index) => {
    // A racer with no slot in the old formation stands still rather than
    // flying in from the origin: they joined between the two computations.
    const origin = fromById.get(anchor.playerId) ?? anchor;
    return {
      playerId: anchor.playerId,
      from: { x: origin.x, y: origin.y },
      to: { x: anchor.x, y: anchor.y },
      delayMs: staggerFor(index, profile),
    };
  });

  const lastDelay = Math.max(...tracks.map(t => t.delayMs));
  return {
    pending: [],
    heldAnchors: null,
    pulses: state.pulses,
    sequence: {
      startedAt,
      headline: 'routine',
      tracks,
      lightnings: [],
      ignitions: [],
      arenaPlayerId: null,
      leadChange: null,
      durationMs: lastDelay + MOVEMENT_MS,
    },
  };
}

/**
 * Lights out: the field leaves the lobby grid and takes the line.
 *
 * Positioned against the server's countdown deadline rather than against local
 * arrival, exactly as every other beat is (ADR-0014). A client that reloads
 * 2.4 seconds into a 3-second countdown starts a sequence that finished 400ms
 * ago and renders it settled — the launch is not replayed, and no catch-up flag
 * is needed to say so.
 */
export function beginCountdownRollUp(
  state: ChoreographerState,
  grid: readonly MarkerAnchor[],
  line: readonly MarkerAnchor[],
  remainingMs: number | null,
  now: number,
  profile: Profile,
): ChoreographerState {
  const elapsed = elapsedIn(NOMINAL_MS.countdown, remainingMs);
  return beginFormationMove(completeSequence(state), grid, line, now - elapsed, profile);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/choreographer.test.ts`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 5: Clear diagnostics**

Run `npx tsc --noEmit` (silent) and `npm run lint` (zero problems). Check the
VS Code Problems panel on `lib/world/choreographer.ts` and
`tests/choreographer.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add lib/world/choreographer.ts tests/choreographer.test.ts
git commit -m "feat(p5a): the choreographer can move a formation, not just drama"
```

---

### Task 2: One countdown numeral, on both surfaces

**Files:**
- Create: `components/Countdown.tsx`
- Modify: `components/GameView.tsx` (delete the local `Countdown` at the bottom of the file; change the `room.phase === 'countdown'` branch)
- Modify: `components/stage/StageBroadcast.tsx` (delete the local `StageCountdown` at the bottom; change the `beat === 'countdown'` slot)
- Create: `e2e/countdown.spec.ts`

**Interfaces:**
- Consumes: `msUntil` from `lib/serverTime.ts`; `DURATION`, `EASE` from
  `lib/presentation/tokens.ts`.
- Produces: `export default function Countdown({ endsAt }: { endsAt: string | null })`
  — renders one element carrying `data-testid="countdown"` and
  `data-count="3" | "2" | "1"`. The caller owns the surrounding layout.

- [ ] **Step 1: Write the failing e2e spec**

Create `e2e/countdown.spec.ts`. Every spec in this suite defines its own
`createRoom` preamble rather than sharing one — that is the house pattern, and
the wizard's stepper walk differs per spec. The helper below is
`e2e/host-control.spec.ts`'s `createRoom` narrowed to two tier-1 questions, plus
the joiner bootstrap that file writes inline. **Read
`e2e/host-control.spec.ts` before writing it** and copy its selectors verbatim
(`getByRole('button', { name: '−' })`, `getByPlaceholder('Your nickname')`,
`getByRole('button', { name: 'Join game' })`) rather than inventing new ones.

```ts
import { test, expect, type Browser, type Page } from '@playwright/test';

/**
 * A two-question room with a host and one joiner, sitting in the lobby.
 *
 * The stepper walk mirrors e2e/host-control.spec.ts: the four tiers start at
 * 4,4,3,1 and are walked down to 2,0,0,0 so a whole game fits in the timeout.
 */
async function twoPlayerLobby(browser: Browser): Promise<{ host: Page; joiner: Page; code: string }> {
  const host = await (await browser.newContext()).newPage();
  await host.goto('/host/new');

  const minus = host.getByRole('button', { name: '−' });
  const clicksPerTier = [2, 4, 3, 1]; // 4,4,3,1 -> 2,0,0,0
  for (let i = 0; i < clicksPerTier.length; i++) {
    for (let c = 0; c < clicksPerTier[i]; c++) await minus.nth(i).click();
  }
  await expect(host.getByText(/^2 questions/)).toBeVisible();

  await host.getByPlaceholder('Your nickname').fill('Hosty');
  await host.getByRole('button', { name: /create room/i }).click();
  await expect(host).toHaveURL(/\/host\/[A-Z0-9]{5}\/review$/);
  await host.getByRole('button', { name: /open the lobby/i }).click();
  await expect(host).toHaveURL(/\/room\/[A-Z0-9]{5}$/);
  const code = host.url().split('/').pop()!;

  const joiner = await (await browser.newContext()).newPage();
  await joiner.goto(`/room/${code}`);
  await joiner.getByPlaceholder('Your nickname').fill('Joiner');
  await joiner.getByRole('button', { name: 'Join game' }).click();

  return { host, joiner, code };
}

test('the countdown counts down on the player surface', async ({ browser }) => {
  test.setTimeout(90_000);
  const { host, joiner } = await twoPlayerLobby(browser);

  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
  await host.getByRole('button', { name: /start the race/i }).click();

  const numeral = joiner.getByTestId('countdown');
  await expect(numeral).toBeVisible({ timeout: 10_000 });
  await expect(numeral).toHaveAttribute('data-count', /^[123]$/);
  // It has to actually descend, not sit on one number.
  await expect(numeral).toHaveAttribute('data-count', '1', { timeout: 5_000 });
  // ...and then hand over to the question.
  await expect(joiner.getByTestId('stage-shell')).toBeVisible({ timeout: 10_000 });
});

test('a stage view opening mid-countdown joins it rather than restarting it', async ({ browser }) => {
  test.setTimeout(90_000);
  const { host, code } = await twoPlayerLobby(browser);
  await host.getByRole('button', { name: /start the race/i }).click();

  const tv = await (await browser.newContext()).newPage();
  await tv.goto(`/stage/${code}`);
  // components/stage/StageGate.tsx: the whole opaque overlay IS the button,
  // and it must be dismissed before anything behind it can be asserted on.
  const gate = tv.getByTestId('stage-gate');
  if (await gate.isVisible().catch(() => false)) await gate.click();

  const numeral = tv.getByTestId('countdown');
  await expect(numeral).toBeVisible({ timeout: 10_000 });
  // Never 3: it opened after the countdown had already begun.
  await expect(numeral).not.toHaveAttribute('data-count', '3');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/countdown.spec.ts --workers=1 --reporter=line`
Expected: FAIL — no element with `data-testid="countdown"`.

- [ ] **Step 3: Write the shared component**

Create `components/Countdown.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { msUntil } from '@/lib/serverTime';
import { DURATION, EASE } from '@/lib/presentation/tokens';

/**
 * The lights-out numeral, shared by the player surface (components/GameView.tsx)
 * and the broadcast surface (components/stage/StageBroadcast.tsx).
 *
 * One component rather than two: the copies this replaced were identical apart
 * from their wrapper, and each carried a comment saying so. The TV's scale
 * comes free from the [data-surface="stage"] token override (ADR-0035) —
 * `text-display` resolves differently inside that scope — so there is no
 * variant prop and no stage-only copy.
 *
 * The numeral is derived from the server deadline, so a client that opens or
 * reloads mid-countdown JOINS the count instead of restarting it. The pop is
 * keyed on the count, which means it replays once per number — that is the
 * point of it, and it is why this is not one of the mount-time-derivation
 * cases CURRENT.md warns about: there is no settled state to land in, only the
 * next number.
 *
 * aria-hidden: a screen reader ticking "three… two… one…" over the caller's
 * own status line is noise. The readable signal is the caller's.
 */
export default function Countdown({ endsAt }: { endsAt: string | null }) {
  const [n, setN] = useState(() => Math.max(1, Math.ceil(msUntil(endsAt) / 1000)));

  useEffect(() => {
    const id = setInterval(
      () => setN(Math.max(1, Math.ceil(msUntil(endsAt) / 1000))),
      100,
    );
    return () => clearInterval(id);
  }, [endsAt]);

  return (
    <motion.span
      key={n}
      data-testid="countdown"
      data-count={n}
      aria-hidden="true"
      initial={{ scale: 1.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: DURATION.beat / 1000, ease: EASE.settle }}
      className="block text-center font-display text-display font-black tabular-nums text-neon-cyan"
      style={{
        textShadow: '0 0 60px color-mix(in oklab, var(--color-neon-cyan) 55%, transparent)',
      }}
    >
      {n}
    </motion.span>
  );
}
```

- [ ] **Step 4: Point both surfaces at it**

In `components/GameView.tsx`: delete the local `Countdown` function entirely,
add `import Countdown from './Countdown';` beside the other component imports,
and replace

```tsx
  if (room.phase === 'countdown') return <Countdown endsAt={room.ends_at} />;
```

with

```tsx
  if (room.phase === 'countdown') {
    return (
      <main className="grid min-h-screen place-items-center">
        <Countdown endsAt={room.ends_at} />
        <p role="status" aria-live="polite" className="sr-only">
          The race is starting.
        </p>
      </main>
    );
  }
```

In `components/stage/StageBroadcast.tsx`: delete the local `StageCountdown`
function, add `import Countdown from '@/components/Countdown';`, and change

```tsx
        {beat === 'countdown' && <StageCountdown endsAt={room?.ends_at ?? null} />}
```

to

```tsx
        {beat === 'countdown' && <Countdown endsAt={room?.ends_at ?? null} />}
```

The stage surface needs no live region: it is a television, not an assistive
target, and `StageBroadcast` deliberately carries no `<main>` — the one that
does is `components/StageShell.tsx`, on the player surface.

- [ ] **Step 5: Run the e2e spec to verify it passes**

Run: `npx playwright test e2e/countdown.spec.ts --workers=1 --reporter=line`
Expected: PASS, 2 tests.

- [ ] **Step 6: Clear diagnostics and commit**

Run `npx tsc --noEmit`, `npm run lint`, `npm test`. Then:

```bash
git add components/Countdown.tsx components/GameView.tsx \
        components/stage/StageBroadcast.tsx e2e/countdown.spec.ts
git commit -m "feat(p5a): one countdown numeral, shared by both surfaces"
```

---

### Task 3: The field rolls up to the line

**Files:**
- Modify: `lib/world/runtime.ts` (the `SUBSCRIBED.map(type => on(type, ...))` cue handler)

**Interfaces:**
- Consumes: `beginCountdownRollUp` from Task 1; `gridAnchors`,
  `stackRiseLimit`, `msUntil` — all three already imported by this file.
- Produces: nothing new. This is wiring.

- [ ] **Step 1: Hoist the rise limit in the cue handler**

The handler computes `stackRiseLimit(...)` inline inside the `fieldAnchors`
call. The countdown branch needs the same value, and it must be the *same*
value, or the grid being left and the line being taken are laid out against
different caps. Replace

```ts
      const state = useGameStore.getState();
      const metrics = trackMetrics(state.room?.total_rounds ?? 12);
      const anchors = fieldAnchors(
        state,
        metrics,
        ceremonySteps(state),
        stackRiseLimit({ width: app.screen.width, height: app.screen.height }),
      );
```

with

```ts
      const state = useGameStore.getState();
      const metrics = trackMetrics(state.room?.total_rounds ?? 12);
      const riseLimit = stackRiseLimit({ width: app.screen.width, height: app.screen.height });
      const anchors = fieldAnchors(state, metrics, ceremonySteps(state), riseLimit);
```

- [ ] **Step 2: Split the countdown out of the `phase-read` branch**

Replace

```ts
      } else if (cue.type === 'phase-read' || cue.type === 'phase-countdown') {
        // A new beat hard-completes anything still in flight (spec §4).
        // completeSequence clears heldAnchors, so the hold comes after it.
        choreo = holdAnchors(completeSequence(choreo), anchors);
      } else if (cue.type === 'phase-answer') {
```

with

```ts
      } else if (cue.type === 'phase-countdown') {
        // Lights out: the field leaves the lobby grid and takes the line,
        // rather than teleporting there in one frame.
        //
        // The grid is RECOMPUTED, not remembered. The store advances `phase`
        // before this bridge runs, so `anchors` above already answers "start
        // line"; the formation being left is a pure function of state the
        // store still holds, and keeping it on every lobby frame would be a
        // per-frame write for a derived value.
        //
        // The racer filter mirrors fieldAnchors': a non-racing MC host is in
        // `players` but never in the field.
        const grid = gridAnchors(state.players.filter(p => p.is_playing), metrics, riseLimit);
        choreo = beginCountdownRollUp(choreo, grid, anchors, msUntil(cue.endsAt), now, profile);
      } else if (cue.type === 'phase-read') {
        // A new beat hard-completes anything still in flight (spec §4).
        // completeSequence clears heldAnchors, so the hold comes after it.
        choreo = holdAnchors(completeSequence(choreo), anchors);
      } else if (cue.type === 'phase-answer') {
```

Add `beginCountdownRollUp` to the existing `from './choreographer'` import.

Note what this deliberately drops: `phase-countdown` no longer calls
`holdAnchors`. Nothing buffers drama between the countdown and the first READ —
`bufferCue` only accepts the five DRAMA types, none of which can fire in a
lobby — and `phase-read` takes a fresh hold one beat later regardless.

- [ ] **Step 3: Verify the type-level wiring**

Run: `npx tsc --noEmit`
Expected: silent. If `cue.endsAt` does not narrow, confirm the discriminated
union member in `lib/presentation/cues.ts` — `phase-countdown` carries
`endsAt: string | null`.

- [ ] **Step 4: Run the unit suite and the world specs**

Run: `npm test`
Expected: every test passes, `tests/choreographer.test.ts` included.

Run: `npx playwright test e2e/world.spec.ts e2e/countdown.spec.ts --workers=1 --reporter=line`
Expected: PASS. `e2e/world.spec.ts`'s lobby-grid assertions must be untouched
— the grid layout did not move, only what happens when it is left.

- [ ] **Step 5: Watch it, headed**

The canvas has no test seam by policy (roadmap §5: canvas internals remain
untested), so this beat is verified by eye, headed, exactly as every M2 phase
from P2 on was. Record each observation in the scratch notes that become the
progress doc.

```bash
npm run dev
```

Open two windows on `/room/<code>`, join two racers, and check:

1. **The move happens.** Clicking "Start the race" makes the rigs travel from
   the run-off to the line over roughly 0.9s while the numeral counts. They do
   not appear at the line in one frame.
2. **Front row first.** The rig nearest the line leaves first.
3. **It finishes before the count does.** The field is settled on the line well
   before "1" gives way to the first question.
4. **A mid-countdown reload does not replay it.** Reload one window at "2": the
   rigs are already on the line when the canvas comes back; they do not drive
   up again.
5. **A late reload is settled.** Reload at "1". Same result.
6. **Reduced motion snaps.** Set Motion → Reduced in the gear menu and start a
   fresh race: the field is on the line immediately, with no travel.
7. **A stage view sees it too.** Open `/stage/<code>` before starting; the TV
   plays the same roll-up.
8. **Zero console errors** across all of the above.

- [ ] **Step 6: Commit**

```bash
git add lib/world/runtime.ts
git commit -m "feat(p5a): the field rolls up to the line instead of teleporting"
```

---

### Task 4: The lobby hands off to the countdown

**Files:**
- Modify: `app/room/[code]/page.tsx` (the `content` assignment and the render)
- Modify: `e2e/countdown.spec.ts` (one added test)

**Interfaces:**
- Consumes: `AnimatePresence`, `motion` from `motion/react`; `DURATION`, `EASE`
  from `lib/presentation/tokens.ts`.
- Produces: a `data-testid="room-stage"` element carrying
  `data-stage="unknown" | "gate" | "connecting" | "lobby" | "game" | "results"`.

- [ ] **Step 1: Write the failing test**

Append to `e2e/countdown.spec.ts`:

```ts
test('the lobby leaves before the countdown arrives, and only one main exists', async ({ browser }) => {
  test.setTimeout(90_000);
  const { host, joiner } = await twoPlayerLobby(browser);

  await expect(joiner.getByTestId('room-stage')).toHaveAttribute('data-stage', 'lobby');
  await host.getByRole('button', { name: /start the race/i }).click();

  await expect(joiner.getByTestId('room-stage')).toHaveAttribute('data-stage', 'game', {
    timeout: 10_000,
  });
  await expect(joiner.getByText('Starting grid')).toHaveCount(0);
  // The handoff is a handoff: never two landmarks at once, before or after.
  await expect(joiner.locator('main')).toHaveCount(1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/countdown.spec.ts --workers=1 --reporter=line`
Expected: FAIL — no `room-stage` testid.

- [ ] **Step 3: Give the page an explicit stage**

In `app/room/[code]/page.tsx`, add to the imports:

```tsx
import { AnimatePresence, motion } from 'motion/react';
import { DURATION, EASE } from '@/lib/presentation/tokens';
```

Above the component, add:

```tsx
type Stage = 'unknown' | 'gate' | 'connecting' | 'lobby' | 'game' | 'results';

/**
 * How long each stage takes to LEAVE.
 *
 * Only the lobby has an exit. The race starting is the one swap on this page
 * that is a moment rather than a navigation, and `mode="wait"` — which is what
 * keeps exactly one <main> landmark in the tree at every instant — would
 * otherwise put that same gap in front of the ceremony, whose DOM is derived
 * from `ends_at` and has to be present from its first frame (ADR-0030).
 */
const EXIT_MS: Record<Stage, number> = {
  unknown: 0, gate: 0, connecting: 0, lobby: DURATION.beat, game: 0, results: 0,
};
```

Replace the `content` block with one that names the stage as well:

```tsx
  let stage: Stage = 'unknown';
  let content: React.ReactNode = null;
  if (hasSession === null) {
    stage = 'unknown';
  } else if (!hasSession) {
    stage = 'gate';
    content = <JoinGate code={code} onJoined={handleJoined} />;
  } else if (!room) {
    stage = 'connecting';
    content = <main className="grid min-h-screen place-items-center text-ink-dim">Connecting…</main>;
  } else if (room.status === 'lobby') {
    stage = 'lobby';
    content = <LobbyView code={code} isHost={isHost} onStart={driver.start} startError={driver.error} />;
  } else if (room.status === 'finished') {
    stage = 'results';
    content = <ResultsView code={code} driver={driver} />;
  } else {
    stage = 'game';
    content = <GameView code={code} />;
  }
```

- [ ] **Step 4: Wrap the seam**

Replace

```tsx
      <div className={`relative z-10 ${isHost ? 'pb-16' : ''}`}>{content}</div>
```

with

```tsx
      {/*
        One keyed child, mode="wait": the outgoing view finishes leaving before
        the incoming one mounts, so there is never a frame with two <main>
        landmarks in the tree. Only the lobby's exit has any duration
        (EXIT_MS) — the world's roll-up is already running underneath it, on
        the canvas, which sits outside this wrapper and never unmounts.
      */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={stage}
          data-testid="room-stage"
          data-stage={stage}
          initial={false}
          exit={{
            opacity: 0,
            y: -24,
            transition: { duration: EXIT_MS[stage] / 1000, ease: EASE.snap },
          }}
          className={`relative z-10 ${isHost ? 'pb-16' : ''}`}
        >
          {content}
        </motion.div>
      </AnimatePresence>
```

`initial={false}` on the element (not only on `AnimatePresence`) is what keeps
an entering view from animating in: this is a handoff, and only the departure
is staged.

- [ ] **Step 5: Run the spec to verify it passes**

Run: `npx playwright test e2e/countdown.spec.ts --workers=1 --reporter=line`
Expected: PASS, 3 tests.

- [ ] **Step 6: Prove nothing downstream regressed**

The join, staging, tiebreak, aftermath and presence specs all live on this
page, and `mode="wait"` changes *when* their content mounts.

Run:
```bash
npx playwright test e2e/join.spec.ts e2e/join-race.spec.ts e2e/staging.spec.ts \
  e2e/aftermath.spec.ts e2e/presence.spec.ts e2e/tiebreak.spec.ts --workers=1 --reporter=line
```
Expected: PASS. A stability, detachment or sub-pixel-layout failure on an
animated element under load is the documented machine flake (CURRENT.md) —
re-run that spec in isolation before concluding it is a regression, and record
both results either way.

- [ ] **Step 7: Clear diagnostics and commit**

Run `npx tsc --noEmit`, `npm run lint`, `npm test`.

```bash
git add "app/room/[code]/page.tsx" e2e/countdown.spec.ts
git commit -m "feat(p5a): the lobby hands off to the countdown"
```

---

### Task 5: LobbyView into the design system

**Files:**
- Create: `components/ui/HudCorners.tsx`
- Create: `components/lobby/StageLink.tsx`
- Modify: `components/LobbyView.tsx` (rewritten)
- Modify: `app/page.tsx` (delete the local `HudCorners`, import the shared one)
- Modify: `app/host/new/page.tsx` (same)
- Create: `tests/designSystem.test.ts`

**Interfaces:**
- Consumes: `Panel`, `Button` from `components/ui/`; `JoinQr` from
  `components/host/JoinQr`; `PlayerConnection`; `avatarEmoji` from
  `lib/avatars`; `joinUrl` from `lib/qr`; `useOrigin`; `DURATION`, `EASE`.
- Produces: `HudCorners` (no props); `StageLink({ code }: { code: string })`.
  `LobbyView`'s own props are unchanged:
  `{ code: string; isHost: boolean; onStart: () => void; startError: string | null }`.

- [ ] **Step 1: Write the failing design-system test**

Create `tests/designSystem.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "No screen left outside the design system" (M3 roadmap §3, P5 exit criteria),
 * kept true by a scan rather than by a review habit.
 *
 * app/globals.css's @theme block is the source of truth for colour: every
 * surface, ink, accent, semantic and medal has a token name. A raw Tailwind
 * palette class is therefore always a screen that has drifted out of the
 * system — exactly the defect M3 P5a closed on components/LobbyView.tsx, the
 * last M1-era screen.
 *
 * Deliberately narrow: it matches Tailwind's own palette families only, so
 * `text-neon-cyan`, `bg-white/5`, `border-haze/50` and arbitrary values are all
 * untouched. A genuinely new colour is a new token in globals.css, not a
 * `text-sky-400`.
 */
const PALETTE_FAMILIES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow',
  'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet',
  'purple', 'fuchsia', 'pink', 'rose',
].join('|');
const PREFIXES = [
  'bg', 'text', 'border', 'from', 'via', 'to', 'ring', 'outline', 'shadow',
  'fill', 'stroke', 'decoration', 'accent', 'caret', 'divide', 'placeholder',
].join('|');
const RAW_PALETTE = new RegExp(`\\b(?:${PREFIXES})-(?:${PALETTE_FAMILIES})-\\d{2,3}\\b`, 'g');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

describe('the design system covers every screen', () => {
  it('has no raw Tailwind palette classes in components/ or app/', () => {
    const offences: string[] = [];
    for (const file of [...tsxFiles('components'), ...tsxFiles('app')]) {
      for (const match of readFileSync(file, 'utf8').matchAll(RAW_PALETTE)) {
        offences.push(`${file}: ${match[0]}`);
      }
    }
    expect(offences).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/designSystem.test.ts`
Expected: FAIL, listing 20 offences, every one in `components/LobbyView.tsx`
(`text-slate-200/300/400/500/950`, `bg-amber-400`, `text-amber-400`,
`border-amber-400`, `outline-amber-400`, `text-rose-400`). **If any file other
than `LobbyView.tsx` appears, stop and report it** — the roadmap says LobbyView
is the only one, and a second offender is new information that changes the
task's size.

- [ ] **Step 3: Extract the HUD corners**

Create `components/ui/HudCorners.tsx`:

```tsx
/**
 * The viewfinder corners: the recurring signature on a primary panel.
 *
 * Shared by the landing page, the host wizard and the lobby — the three
 * screens on the host's path into a game, which read as one production because
 * of this mark. Extracted at the third copy.
 */
export default function HudCorners() {
  const arm = 'pointer-events-none absolute h-4 w-4 border-neon-cyan/70';
  return (
    <>
      <span aria-hidden className={`${arm} -left-1.5 -top-1.5 border-l-2 border-t-2`} />
      <span aria-hidden className={`${arm} -right-1.5 -top-1.5 border-r-2 border-t-2`} />
      <span aria-hidden className={`${arm} -bottom-1.5 -left-1.5 border-b-2 border-l-2`} />
      <span aria-hidden className={`${arm} -bottom-1.5 -right-1.5 border-b-2 border-r-2`} />
    </>
  );
}
```

Diff it against the two existing copies before deleting them — they should be
byte-identical. Then delete the local `HudCorners` from `app/page.tsx` and
`app/host/new/page.tsx` and add
`import HudCorners from '@/components/ui/HudCorners';` to each.

- [ ] **Step 4: Move the stage link out**

Create `components/lobby/StageLink.tsx`, restyled, default-exported, docstring
carried over verbatim (it explains why this is an anchor with a real `href` and
why it is host-only), `data-testid="stage-link"` preserved:

```tsx
'use client';
import { useState } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';

/**
 * The way into the broadcast screen (PRD §1: a room hands out a join link, a
 * QR and a stage link).
 *
 * Host-only: a player tapping this on their phone would replace their own game
 * with a spectator view of it. The anchor carries a real href so it can be
 * copied, opened in a new tab, or dragged onto a second display — a button
 * that only calls `window.open` can do none of those.
 */
export default function StageLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/stage/${code}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied outright (insecure origin, permission
      // policy). The URL is on screen either way, so this is a silent no-op
      // rather than an error the host can do anything about.
    }
  }

  return (
    <Panel className="flex items-center justify-between gap-4 p-4">
      <div className="min-w-0">
        <h2 className="font-display text-[0.6875rem] font-semibold uppercase tracking-[0.28em] text-neon-cyan">
          Stage view
        </h2>
        <p className="truncate text-sm text-ink-dim">{url}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="ghost" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <a
          data-testid="stage-link"
          href={`/stage/${code}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-control bg-neon-cyan
            px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-[0.12em] text-void
            shadow-[0_0_32px_-8px_var(--color-neon-cyan)]
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-cyan"
        >
          Open
        </a>
      </div>
    </Panel>
  );
}
```

- [ ] **Step 5: Rewrite LobbyView**

Replace `components/LobbyView.tsx` entirely:

```tsx
'use client';
import { motion } from 'motion/react';
import { useGameStore } from '@/lib/store';
import { avatarEmoji } from '@/lib/avatars';
import { joinUrl } from '@/lib/qr';
import { useOrigin } from '@/lib/useOrigin';
import { DURATION, EASE } from '@/lib/presentation/tokens';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import HudCorners from '@/components/ui/HudCorners';
import JoinQr from '@/components/host/JoinQr';
import PlayerConnection from '@/components/PlayerConnection';
import StageLink from '@/components/lobby/StageLink';

/**
 * The lobby's readable half (M2 P2 spec §7), on the P0 design system as of
 * M3 P5a — the last M1-era screen to cross over.
 *
 * The Pixi start line carries the formation; this strip carries the names, so
 * nothing readable depends on canvas (PRD §9). At lights-out the formation
 * rolls up to the line (lib/world/choreographer.ts's beginCountdownRollUp)
 * while this panel lifts away (app/room/[code]/page.tsx's stage seam).
 *
 * `Starting grid — {n} joined` and the start-button copy are asserted verbatim
 * in e2e/game-flow.spec.ts and e2e/world.spec.ts — do not reword them.
 */

const heading =
  'font-display text-[0.6875rem] font-semibold uppercase tracking-[0.28em] text-neon-cyan';

/**
 * Entrance only, no exit: leaving is the room page's job, because the lobby
 * hands off to the countdown rather than unmounting on its own. Replaying this
 * on a reload is CORRECT — a lobby has no beat position to land in, unlike
 * every `ends_at`-staged component CURRENT.md warns about.
 */
const rise = {
  hidden: { opacity: 0, y: 20 },
  show: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.settle / 1000, ease: EASE.settle, delay: index * 0.06 },
  }),
};

export default function LobbyView({
  code, isHost, onStart, startError,
}: { code: string; isHost: boolean; onStart: () => void; startError: string | null }) {
  const players = useGameStore(s => s.players);
  const playing = players.filter(p => p.is_playing);
  const origin = useOrigin();
  const join = origin ? joinUrl(origin, code) : null;

  return (
    <main className="relative mx-auto flex min-h-screen max-w-3xl flex-col justify-end gap-6 p-6">
      <motion.div custom={0} initial="hidden" animate="show" variants={rise}>
        <Panel className="relative flex items-center justify-center gap-6 p-6">
          <HudCorners />
          <div className="text-center">
            <p className="text-ink-dim">
              Join at <b className="text-ink">{origin ? new URL(origin).host : ''}</b> with code
            </p>
            <p className="font-display text-display font-black tracking-[0.2em] text-warning">
              {code}
            </p>
          </div>
          <JoinQr url={join} className="h-28 w-28" />
        </Panel>
      </motion.div>

      <motion.section custom={1} initial="hidden" animate="show" variants={rise}>
        <Panel className="p-4">
          <h2 className={`${heading} mb-3`}>Starting grid — {players.length} joined</h2>
          <ul data-testid="lobby-roster" className="flex flex-wrap gap-2">
            {players.map(p => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-full border border-haze/50
                  bg-night/60 py-1 pl-1 pr-3"
              >
                <span
                  className="grid h-7 w-7 place-items-center rounded-full text-base"
                  style={{ backgroundColor: `${p.color}33`, boxShadow: `inset 0 0 0 2px ${p.color}` }}
                  aria-hidden
                >
                  {avatarEmoji(p.avatar)}
                </span>
                <span className="text-sm font-semibold text-ink">{p.nickname}</span>
                {p.is_host && (
                  <span className="font-display text-xs font-bold uppercase tracking-[0.14em] text-warning">
                    {p.is_playing ? 'Host' : 'MC'}
                  </span>
                )}
                <PlayerConnection playerId={p.id} />
                {p.joined_late && (
                  <span
                    data-testid="late-badge"
                    className="shrink-0 rounded-full bg-neon-cyan/15 px-1.5 py-0.5
                      font-display text-[10px] font-semibold uppercase tracking-[0.14em]
                      text-neon-cyan"
                  >
                    Joined late
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      </motion.section>

      {isHost && (
        <motion.a
          custom={2}
          initial="hidden"
          animate="show"
          variants={rise}
          data-testid="lobby-review-link"
          href={`/host/${code}/review`}
          className="rounded-panel border border-haze/50 bg-night/55 p-4 text-center text-sm
            font-semibold text-ink-dim backdrop-blur-xl ease-snap duration-(--dur-cut)
            transition-[border-color,color]
            hover:border-neon-cyan hover:text-neon-cyan
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-cyan"
        >
          Review the draw — swap a question or add your own
        </motion.a>
      )}

      {isHost && (
        <motion.div custom={3} initial="hidden" animate="show" variants={rise}>
          <StageLink code={code} />
        </motion.div>
      )}

      {isHost ? (
        <motion.div custom={4} initial="hidden" animate="show" variants={rise} className="space-y-2">
          {startError && <p className="text-center text-wrong">{startError}</p>}
          <Button size="lg" className="w-full" onClick={onStart} disabled={playing.length < 2}>
            {playing.length < 2 ? 'Need at least 2 players' : 'Start the race'}
          </Button>
          <p className="text-center text-xs text-ink-dim">3+ players recommended</p>
        </motion.div>
      ) : (
        <motion.p
          custom={4}
          initial="hidden"
          animate="show"
          variants={rise}
          className="text-center text-ink-dim"
        >
          Waiting for the host to start…
        </motion.p>
      )}
    </main>
  );
}
```

Two substitutions are deliberately *not* one-for-one, and both are worth
knowing:

- the roster chip's `bg-white/5` becomes `bg-night/60` — a token surface rather
  than an untokened white wash;
- `3+ players recommended` moves from `text-slate-500` to `text-ink-dim`, not
  `text-ink-mute`. P5b's contrast table is about to show `ink-mute` sitting
  under WCAG AA on these grounds, and there is no reason to add a fresh
  instance of it here.

- [ ] **Step 6: Run the design-system test to verify it passes**

Run: `npx vitest run tests/designSystem.test.ts`
Expected: PASS — zero offences.

- [ ] **Step 7: Run every spec that asserts on the lobby**

Run:
```bash
npx playwright test e2e/game-flow.spec.ts e2e/world.spec.ts e2e/host-draw.spec.ts \
  e2e/stage.spec.ts e2e/host-control.spec.ts e2e/countdown.spec.ts --workers=1 --reporter=line
```
Expected: PASS. Every `Starting grid — n joined`, `Start the race`,
`lobby-roster`, `lobby-review-link` and `stage-link` assertion must still hold.
A failure here means copy or a testid moved — move it back.

- [ ] **Step 8: Clear diagnostics and commit**

Run `npx tsc --noEmit`, `npm run lint`, `npm test`.

```bash
git add components/ui/HudCorners.tsx components/lobby/StageLink.tsx \
        components/LobbyView.tsx app/page.tsx app/host/new/page.tsx \
        tests/designSystem.test.ts
git commit -m "feat(p5a): the lobby crosses into the design system"
```

---

### Task 6: Verify, record, merge

**Files:**
- Create: `docs/ADR/0054-the-grid-rolls-up-on-the-servers-countdown.md`
- Create: `docs/progress/M3-P5a-the-starting-grid.md`
- Modify: `docs/progress/CURRENT.md`
- Modify: `docs/ADR/README.md` (index row)

- [ ] **Step 1: Run the full regression floor**

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
npm run test:e2e -- --workers=1
```

Record the actual counts. Expected: tsc silent, lint zero problems, every unit
test passing, build clean, the whole Playwright suite green at `--workers=1`
(about 11 minutes on this machine). A stability, detachment or sub-pixel-layout
failure on a Pixi-heavy spec under load is the documented machine flake —
re-run that spec in isolation and record **both** results rather than letting
the isolated green run stand alone.

- [ ] **Step 2: Do the headed live pass**

Repeat Task 3 Step 5's eight checks against the merged code, plus four more:

9. **The handoff reads as one gesture.** The lobby panel lifts and fades as the
   numerals arrive; no blank frame, no double-panel frame.
10. **The host's control strip does not flash.** It sits outside the swapped
    wrapper and should be continuous across the transition.
11. **A rematch returns to a restyled lobby**, and the roll-up plays again on
    the next start (`game-reset`, ADR-0047).
12. **The restyled lobby at 400px wide** — the roster wraps, the code stays
    legible, nothing overflows horizontally.

- [ ] **Step 3: Write ADR-0054**

`docs/ADR/0054-the-grid-rolls-up-on-the-servers-countdown.md`, in the format
`docs/ADR/README.md` prescribes. Status Accepted, today's date, Phase `M3 P5a`.

- **Context:** the field teleported from the lobby grid to the start line in one
  frame. CURRENT.md carried it as intentionally skipped since M2 P2, on the
  grounds that a roll-up would be new choreography rather than a fix.
- **Decision:** it *is* new choreography, and it is built out of the movement
  grammar that already exists. `beginFormationMove` compiles two anchor sets
  into the same anticipate/launch/travel/settle tracks a drama beat uses;
  `beginCountdownRollUp` positions that sequence against `phase_ends_at` so a
  reload lands settled. Front-row-first stagger, `routine` tier, no new cue and
  no new rung.
- **Consequences:** the choreographer now has two entry points, and anything
  that needs the world to move without a drama cue goes through the second
  rather than synthesising a fake cue to reach the first. The roll-up's length
  is bounded by the server's countdown: `NOMINAL_MS.countdown` is a hand-mirror
  of `start_game`'s `interval '3 seconds'`, so a change to that interval must
  move both — at twenty players the sequence already runs 1980ms of the 3000.

Add the index row to `docs/ADR/README.md`.

- [ ] **Step 4: Write the progress doc**

`docs/progress/M3-P5a-the-starting-grid.md`, following the shape of
`docs/progress/M3-P4-the-bank.md`: scope, what was built, deviations from this
plan, verification results (the exact numbers from Step 1), live-verification
findings (each of the twelve checks with what was actually observed),
known-and-accepted, carried forward.

- [ ] **Step 5: Update CURRENT.md**

- Current phase → M3 P5a complete; next is **M3 P5b — Launch readiness**.
- **Delete the "Intentionally skipped" entry** for the lobby → countdown
  transition. It is built; leaving it there would be a lie.
- Add a Note: *the choreographer has two ways to start a sequence, and a
  formation move is not a drama beat.* `beginSequence` compiles buffered cues
  and staggers back-marker first; `beginFormationMove` takes two anchor sets and
  staggers front row first. A future caller that wants the world to move without
  drama uses the second and must not synthesise a cue to reach the first.
- Add a Note: *`tests/designSystem.test.ts` fails on any raw Tailwind palette
  class under `components/` or `app/`.* Colour comes from `app/globals.css`'s
  `@theme` block; a genuinely new colour is a new token there, never a
  `text-sky-400`.

- [ ] **Step 6: Commit, merge, push, clean up**

```bash
git add docs/
git commit -m "docs: record M3 P5a — the starting grid"
git checkout main
git merge --no-ff m3-p5a-the-starting-grid
git push
git worktree remove <path>   # only if a worktree was used
git branch -d m3-p5a-the-starting-grid
```
