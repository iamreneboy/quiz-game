# M2 P5b — Results board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace M1's unstyled results table with a winner card and a full results board in the design language, carrying accuracy and average answer time, entering after the ceremony's `board` beat and readable in the accessibility tree from the ceremony's first frame.

**Architecture:** One pure module (`lib/results/stats.ts`) turns a `Standing` into the two derived numbers and their display strings; two presentational components (`WinnerCard`, `ResultsTable`) render them inside the existing `Panel` primitive; `ResultsView` becomes the shell that reads `--ceremony-band` for its top spacer, reads `useCeremony`'s `steps.board` for staging, and keeps the exit link mounted and focusable throughout. No new store, no new runtime, no wire change.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · `motion` v13 · Zustand · Tailwind v4 · Vitest · Playwright

**Spec:** `docs/superpowers/specs/2026-08-23-m2-p5b-results-board-design.md`

## Global Constraints

- **NEVER run `supabase stop` or `supabase start`.** Windows/Hyper-V reserves TCP 54024–54423, which covers every default Supabase port. The running stack is bound to shifted ports recorded in the gitignored `.env.local`; a restart binds the reserved defaults, fails, and loses the working stack. In a fresh git worktree, `.env.local` must be copied by hand from the main checkout before `npm run dev` can reach the database.
- **Apply/revert SQL with `docker exec`, never the CLI's start/reset commands.** The database container is `supabase_db_quiz-game`.
- **No wire change in this phase.** `lib/types.ts` is not modified. The two fields migration 0004 added (`answered`, `avg_answer_ms`, both optional on `Standing`) are the whole budget; anything else renders `—` (spec §10).
- **Never put an opacity or transform Tailwind class on an element whose `motion` `variants` animate the same property.** Inline animated styles outrank the class regardless of specificity (ADR-0017). This is spec decision 2 and it is the single most likely way to ship this phase broken.
- **Rendering separation.** Pixi owns the world; HTML/React owns everything readable and interactive. Accessibility never depends on canvas (PRD §9).
- **`--ceremony-band` is published by `components/PixiStage.tsx` and consumed, never re-derived.** There is exactly one source of truth for the band height (ADR-0015).
- **Header text is spelled out** — "Accuracy", "Avg time", "Best streak". Never abbreviate a column header to make it fit; the narrow-screen collapse is the answer instead (spec §7).
- **Run the e2e suite as `npm run test:e2e -- --workers=2`.** The default worker count is flaky under load on this machine.
- **Unit tests are `npm test` (Vitest).** `vitest.config.ts` runs in the Node environment with no jsdom and no React Testing Library — there is no component-test seam in this repo. Components are verified through Playwright and a headed manual pass; only pure modules get unit tests.
- **`npm run lint` still reports one pre-existing `react-hooks/set-state-in-effect` error** in `app/room/[code]/page.tsx`. It is recorded in `CURRENT.md` and is not this phase's to fix. Any *other* lint error is this phase's.

---

### Task 1: Derived result stats

The two numbers the board exists to show — accuracy and average answer time — are not on the wire. They are derived from `correct`, `answered` and `avg_answer_ms`, and the whole point of this module is that "the player never submitted" and "this database predates migration 0004" take **one** code path and render identically (spec §4).

**Files:**
- Create: `lib/results/stats.ts`
- Create: `tests/resultStats.test.ts`

**Interfaces:**
- Consumes: `Standing` from `lib/types.ts` (types only — this module imports no React, no store, no DOM).
- Produces:
  - `interface ResultStats { accuracy: number | null; avgSeconds: number | null }`
  - `resultStats(standing: Standing): ResultStats`
  - `formatAccuracy(accuracy: number | null): string` — `"90%"` or `NO_VALUE`
  - `formatAvg(avgSeconds: number | null): string` — `"4.2s"` or `NO_VALUE`
  - `const NO_VALUE = '—'` — the single source of truth for the glyph, so components can test a formatted string for "unknown" without re-deriving it.

- [ ] **Step 1: Write the failing test**

Create `tests/resultStats.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { NO_VALUE, formatAccuracy, formatAvg, resultStats } from '@/lib/results/stats';
import type { Standing } from '@/lib/types';

/** A complete, post-0004 standing. Override one field per test. */
function standing(over: Partial<Standing> = {}): Standing {
  return {
    player_id: 'p1', nickname: 'Ada', avatar: 'duck', color: '#f59e0b',
    correct: 9, speed_points: 120, longest_streak: 5, current_streak: 5,
    answered: 10, avg_answer_ms: 4200,
    ...over,
  };
}

describe('resultStats', () => {
  it('derives accuracy from correct/answered and the average in seconds', () => {
    const { accuracy, avgSeconds } = resultStats(standing());
    expect(accuracy).toBeCloseTo(0.9, 5);
    expect(avgSeconds).toBeCloseTo(4.2, 5);
  });

  it('returns null for both when the player never submitted', () => {
    // Spec decision 3: 0 answered is not 0% — it is unknown, and must read so.
    const { accuracy, avgSeconds } = resultStats(
      standing({ correct: 0, answered: 0, avg_answer_ms: null }),
    );
    expect(accuracy).toBeNull();
    expect(avgSeconds).toBeNull();
  });

  it('returns null for both against a pre-0004 database, by the same path', () => {
    const { accuracy, avgSeconds } = resultStats(
      standing({ answered: undefined, avg_answer_ms: undefined }),
    );
    expect(accuracy).toBeNull();
    expect(avgSeconds).toBeNull();
  });

  it('still reports accuracy when only the average is missing', () => {
    const { accuracy, avgSeconds } = resultStats(standing({ avg_answer_ms: null }));
    expect(accuracy).toBeCloseTo(0.9, 5);
    expect(avgSeconds).toBeNull();
  });

  it('treats a real zero as a fact, not as unknown', () => {
    const { accuracy, avgSeconds } = resultStats(
      standing({ correct: 0, answered: 4, avg_answer_ms: 0 }),
    );
    expect(accuracy).toBe(0);
    expect(avgSeconds).toBe(0);
  });
});

describe('formatAccuracy', () => {
  it('rounds to a whole percent', () => {
    expect(formatAccuracy(0.9)).toBe('90%');
    expect(formatAccuracy(2 / 3)).toBe('67%');
    expect(formatAccuracy(1)).toBe('100%');
  });

  it('renders a real zero as 0%, never as the dash', () => {
    expect(formatAccuracy(0)).toBe('0%');
  });

  it('renders unknown as the dash', () => {
    expect(formatAccuracy(null)).toBe(NO_VALUE);
  });
});

describe('formatAvg', () => {
  it('rounds to one decimal second', () => {
    expect(formatAvg(4.2)).toBe('4.2s');
    expect(formatAvg(4.249)).toBe('4.2s');
    expect(formatAvg(4.26)).toBe('4.3s');
    expect(formatAvg(12)).toBe('12.0s');
  });

  it('renders a real zero as 0.0s, never as the dash', () => {
    expect(formatAvg(0)).toBe('0.0s');
  });

  it('renders unknown as the dash', () => {
    expect(formatAvg(null)).toBe(NO_VALUE);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- resultStats`

Expected: FAIL — `Failed to resolve import "@/lib/results/stats"`.

- [ ] **Step 3: Write the implementation**

Create `lib/results/stats.ts`:

```ts
/**
 * The two numbers the results board exists to show (spec §4) — pure, tested,
 * no React, no store, no DOM.
 *
 * `answered` and `avg_answer_ms` are OPTIONAL on `Standing` because a pre-0004
 * database omits them (ADR-0028). This module returns `null` for an absent
 * field on exactly the same code path as for `answered === 0`, so the
 * degraded-server case and the honest-unknown case cannot diverge — one branch,
 * one rendering, one thing to keep true.
 *
 * The distinction that matters: `null` means UNKNOWN and renders as a dash;
 * `0` means zero and renders as `0%` / `0.0s`. A player who never submitted
 * must not read as 0% accuracy — that is a judgement, not a fact
 * (spec decision 3). Every check below is therefore `=== null`, never falsy.
 */
import type { Standing } from '@/lib/types';

/** The glyph for an unknown value. Components compare against this rather than re-deriving it. */
export const NO_VALUE = '—';

export interface ResultStats {
  /** 0..1, or null when the player never submitted / the field is absent. */
  accuracy: number | null;
  /** Seconds, or null on the same conditions. */
  avgSeconds: number | null;
}

export function resultStats(standing: Standing): ResultStats {
  // `?? 0` folds "absent field" into "answered nothing" — the one path.
  const answered = standing.answered ?? 0;
  if (answered <= 0) return { accuracy: null, avgSeconds: null };

  const avgMs = standing.avg_answer_ms;
  return {
    accuracy: standing.correct / answered,
    avgSeconds: typeof avgMs === 'number' ? avgMs / 1000 : null,
  };
}

/** Whole percent, as every accuracy in this app is quoted. */
export function formatAccuracy(accuracy: number | null): string {
  return accuracy === null ? NO_VALUE : `${Math.round(accuracy * 100)}%`;
}

/** One decimal second. */
export function formatAvg(avgSeconds: number | null): string {
  return avgSeconds === null ? NO_VALUE : `${avgSeconds.toFixed(1)}s`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- resultStats`

Expected: PASS, 11 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`

Expected: no output (success).

- [ ] **Step 6: Commit**

```bash
git add lib/results/stats.ts tests/resultStats.test.ts
git commit -m "feat(p5b): derive accuracy and average answer time from a standing"
```

---

### Task 2: The results table

The full field, in the design language, as a real `<table>`. It is in the DOM from the ceremony's first frame at `opacity: 0` (spec decision 1) — the component is *always* rendered and never conditionally mounted, so a screen-reader user has the complete results while a sighted user is still watching the podium rise.

**Two traps this task must not fall into, both of which this project has shipped before:**

1. **A co-located opacity class.** The wrapper's `variants` animate `opacity`; a Tailwind `opacity-*` class on the same element would silently never win (ADR-0017, spec decision 2). There must be no opacity or transform class on any element carrying `variants` here.
2. **A replayed entrance on reload.** This is the trap `CURRENT.md` tracks (P3a's `QuestionCard` badges, P3a's `StageShell` options slot, P3b's `AvatarStack`). It appears here in a *fourth* guise, and `AnimatePresence initial={false}` is **not** the fix, because nothing conditionally mounts. See Step 3's `settled` one-shot for the mechanism and why it is needed.

**Files:**
- Create: `components/ResultsTable.tsx`
- Modify: `components/ResultsView.tsx` (replace the inline `<table>`; add the staging wiring)

**Interfaces:**
- Consumes: `resultStats`, `formatAccuracy`, `formatAvg`, `NO_VALUE` (Task 1); `Panel` from `components/ui/Panel.tsx`; `avatarEmoji` from `lib/avatars.ts`; `DURATION`, `EASE` from `lib/presentation/tokens.ts`; `useSettings` from `lib/useSettings.ts`; `BOARD_AT`, `CEREMONY_MS` from `lib/ceremony/beats.ts`; `elapsedIn` from `lib/staging/beats.ts`; `msUntil` from `lib/serverTime.ts`; `useCeremony` from `lib/ceremony/useCeremony.ts`.
- Produces:
  - `ResultsTable(props: { standings: Standing[]; myId: string | null; show: boolean; instant: boolean }): JSX.Element` — default export of `components/ResultsTable.tsx`.
  - `show` — the board beat has landed; drive the entrance from this.
  - `instant` — this component mounted into an already-elapsed ceremony; suppress the entrance rather than replaying it.
  - DOM hooks for Task 4: `data-testid="results-board"` with `data-entered="true"|"false"` on the wrapper, `data-testid="results-table"` on the `<table>`, `data-testid="player-name"` on each nickname.

- [ ] **Step 1: Write the table component**

Create `components/ResultsTable.tsx`:

```tsx
'use client';
import { motion } from 'motion/react';
import Panel from '@/components/ui/Panel';
import { avatarEmoji } from '@/lib/avatars';
import { DURATION, EASE } from '@/lib/presentation/tokens';
import { NO_VALUE, formatAccuracy, formatAvg, resultStats } from '@/lib/results/stats';
import { useSettings } from '@/lib/useSettings';
import type { Standing } from '@/lib/types';

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Per-row entrance delay (spec §6, "DURATION-scale delays"). A quarter of the
 * shortest named duration: a 20-player field (PRD §13) unrolls in 600ms, so a
 * full board is settled well inside the ceremony's remaining ~3s rather than
 * still arriving when the beat ends.
 */
const ROW_STAGGER_S = DURATION.cut / 4 / 1000;

/**
 * The full field (spec §5).
 *
 * ALWAYS RENDERED, never conditionally mounted (spec decision 1). `opacity: 0`
 * keeps the content in the accessibility tree, unlike `display: none` or
 * `visibility: hidden` — so the complete results are readable from the first
 * frame of the ceremony, which is the roadmap's exit criterion for this phase.
 *
 * The opacity is a `motion` variant target and MUST NOT also be a Tailwind
 * class: inline animated styles outrank a class regardless of specificity, and
 * this project has already shipped that bug once (ADR-0017, spec decision 2).
 *
 * Variant propagation is by React context, not by DOM nesting, so the plain
 * `Panel`, `<table>` and `<tbody>` between this wrapper and the rows are
 * transparent to it: each `motion.tr` registers against this wrapper and is
 * staggered by its `shown` transition. Same idiom as components/AvatarStack.tsx.
 */
export default function ResultsTable({
  standings, myId, show, instant,
}: {
  standings: Standing[];
  myId: string | null;
  /** The ceremony's `board` beat has landed (or the beat was over at mount). */
  show: boolean;
  /** Mounted past the beat — settle without playing the entrance. */
  instant: boolean;
}) {
  const reduced = useSettings(s => s.profile) === 'reduced';

  // The board is information, and information is the last thing a motion
  // preference should cost anyone (spec §6): `reduced` drops the stagger and
  // the run-on delay, so the rows appear together. The rows' lift is dropped by
  // MotionConfig's reducedMotion="always" (components/MotionProvider.tsx),
  // which suppresses transforms and keeps opacity.
  const enter = reduced
    ? { duration: DURATION.cut / 1000, ease: EASE.settle }
    : {
        duration: DURATION.cut / 1000,
        ease: EASE.settle,
        delayChildren: DURATION.beat / 1000,
        staggerChildren: ROW_STAGGER_S,
      };

  return (
    <motion.div
      data-testid="results-board"
      data-entered={show ? 'true' : 'false'}
      initial={instant ? false : 'hidden'}
      animate={show ? 'shown' : 'hidden'}
      variants={{ hidden: { opacity: 0 }, shown: { opacity: 1, transition: enter } }}
    >
      <Panel className="overflow-hidden px-2 py-4 sm:px-3">
        <table data-testid="results-table" className="w-full border-collapse text-left">
          <caption className="px-3 pb-3 text-left text-[11px] font-bold uppercase tracking-widest text-ink-mute">
            Final standings
          </caption>
          <thead>
            <tr className="text-[11px] uppercase tracking-widest text-ink-mute">
              <th scope="col" className="pb-2 pl-3 pr-2 text-left font-bold">Rank</th>
              <th scope="col" className="pb-2 pr-2 text-left font-bold">Player</th>
              <th scope="col" className="pb-2 pr-3 text-right font-bold">Correct</th>
              {/* Spec decision 4: below `sm` these three collapse under the
                  nickname. They are never abbreviated to fit (spec §7). */}
              <th scope="col" className="hidden pb-2 pr-3 text-right font-bold sm:table-cell">Accuracy</th>
              <th scope="col" className="hidden pb-2 pr-3 text-right font-bold sm:table-cell">Avg time</th>
              <th scope="col" className="hidden pb-2 pr-3 text-right font-bold sm:table-cell">Best streak</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, rank) => {
              const { accuracy, avgSeconds } = resultStats(s);
              const acc = formatAccuracy(accuracy);
              const avg = formatAvg(avgSeconds);
              const isMe = s.player_id === myId;

              return (
                <motion.tr
                  key={s.player_id}
                  data-testid="results-row"
                  aria-current={isMe ? 'true' : undefined}
                  variants={{
                    hidden: { opacity: 0, y: 8 },
                    shown: {
                      opacity: 1, y: 0,
                      transition: { duration: DURATION.beat / 1000, ease: EASE.settle },
                    },
                  }}
                  className={`border-t border-haze/30 align-top ${isMe ? 'bg-haze/25' : ''}`}
                >
                  {/* The medal is decoration; the rank NUMBER is the row
                      header's text, so a screen reader announces "1" rather
                      than "trophy" (spec §7). */}
                  <th scope="row" className="py-3 pl-3 pr-2 text-left font-normal">
                    {rank < 3 ? (
                      <>
                        <span aria-hidden="true" className="text-lg leading-none">{MEDALS[rank]}</span>
                        <span className="sr-only">{rank + 1}</span>
                      </>
                    ) : (
                      <span className="text-sm font-bold tabular-nums text-ink-mute">{rank + 1}</span>
                    )}
                  </th>

                  <td className="py-3 pr-2">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-base"
                        style={{
                          backgroundColor: `${s.color}33`,
                          boxShadow: `inset 0 0 0 2px ${s.color}`,
                        }}
                      >
                        {avatarEmoji(s.avatar)}
                      </span>
                      <span
                        data-testid="player-name"
                        className="block max-w-[8.5rem] truncate font-semibold text-ink sm:max-w-[14rem]"
                      >
                        {s.nickname}
                      </span>
                    </span>
                    {/* Spec decision 4: narrow screens COLLAPSE, they do not
                        scroll. `sm:hidden` keeps this out of the accessibility
                        tree at widths where the columns themselves are shown,
                        so nothing is announced twice. */}
                    <span className="mt-1 block pl-9 text-xs tabular-nums text-ink-dim sm:hidden">
                      <Stat value={acc} /> · <Stat value={avg} /> avg · {s.longest_streak} streak
                    </span>
                  </td>

                  <td className="py-3 pr-3 text-right font-bold tabular-nums text-ink">{s.correct}</td>
                  <td className="hidden py-3 pr-3 text-right tabular-nums text-ink-dim sm:table-cell">
                    <Stat value={acc} />
                  </td>
                  <td className="hidden py-3 pr-3 text-right tabular-nums text-ink-dim sm:table-cell">
                    <Stat value={avg} />
                  </td>
                  <td className="hidden py-3 pr-3 text-right tabular-nums text-ink-dim sm:table-cell">
                    {s.longest_streak}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </motion.div>
  );
}

/**
 * A stat that may be unknown. The dash is decorative — announcing "em dash"
 * tells a screen-reader user nothing — so it is hidden and replaced with the
 * reason (spec §7).
 */
function Stat({ value }: { value: string }) {
  if (value !== NO_VALUE) return <>{value}</>;
  return (
    <>
      <span aria-hidden="true">{NO_VALUE}</span>
      <span className="sr-only">not answered</span>
    </>
  );
}
```

- [ ] **Step 2: Confirm no opacity or transform class sits on an animated element**

Run: `grep -nE "opacity-|translate-|scale-" components/ResultsTable.tsx`

Expected: no output. Any hit is ADR-0017's bug and must be moved into the variant target instead.

- [ ] **Step 3: Wire the table into `ResultsView`, with the staging one-shot**

Modify `components/ResultsView.tsx`. Replace the whole file with the version below. The M1 `<header>` and the M1 exit link are deliberately left as they are — Task 3 replaces them; this task's deliverable is the table.

```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useGameStore } from '@/lib/store';
import { loadSession } from '@/lib/session';
import { msUntil } from '@/lib/serverTime';
import { elapsedIn } from '@/lib/staging/beats';
import { BOARD_AT, CEREMONY_MS } from '@/lib/ceremony/beats';
import { useCeremony } from '@/lib/ceremony/useCeremony';
import ResultsTable from './ResultsTable';

export default function ResultsView({ code }: { code: string }) {
  const room = useGameStore(s => s.room);
  const standings = useGameStore(s => s.standings);
  const board = useCeremony(s => s.steps.board);
  const endsAt = room?.ends_at ?? null;

  /**
   * "Was the board beat already over when this component mounted?"
   *
   * ONE-SHOT, read once in a lazy initializer, never updated (ADR-0014 is
   * explicit that this fix must stay one-shot rather than becoming a standing
   * subscription).
   *
   * This exists because lib/ceremony/runtime.ts publishes from a
   * requestAnimationFrame tick started in an effect, so `steps.board` is FALSE
   * on this component's first render even when the ceremony finished minutes
   * ago. Without this, a reload past the ceremony would render hidden, see
   * `board` flip true one frame later, and play the whole entrance — the fourth
   * occurrence of the replay trap CURRENT.md tracks, in a guise
   * `AnimatePresence initial={false}` cannot reach because nothing here mounts
   * conditionally.
   *
   * It re-derives nothing: same `ends_at`, same `elapsedIn`, same pure
   * constants the runtime itself uses, so the two answers cannot disagree. A
   * null deadline — a pre-0004 database — means "beat over", which is the
   * correct reading: there is no ceremony to wait for, so the board is simply
   * there.
   */
  const [settled] = useState(
    () => elapsedIn(CEREMONY_MS, endsAt ? msUntil(endsAt) : null) >= BOARD_AT,
  );

  const myId = typeof window !== 'undefined' ? loadSession(code)?.playerId ?? null : null;
  if (!room || !standings || standings.length === 0) return null;

  const winner = standings[0];
  const show = board || settled;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:gap-8 sm:p-6">
      {/*
        Reserves exactly the height PixiStage is showing, so the board can
        never overlap the podium. The 0px fallback is what a client with no
        canvas at all gets — the full board, immediately.
      */}
      <div
        aria-hidden="true"
        className="shrink-0 transition-[height] duration-(--dur-settle) ease-settle"
        style={{ height: 'var(--ceremony-band, 0px)' }}
      />

      <header className="text-center">
        <p className="text-sm font-bold uppercase tracking-widest text-slate-500">Race complete</p>
        <p className="mt-2 text-4xl font-black">
          🏆 <span style={{ color: winner.color }}>{winner.nickname}</span> wins!
        </p>
        <p className="mt-1 text-slate-400">
          {winner.correct}/{room.total_rounds} correct
        </p>
      </header>

      <ResultsTable standings={standings} myId={myId} show={show} instant={settled} />

      <Link href="/" className="text-center font-bold text-amber-400 hover:underline">
        Back to home
      </Link>
    </main>
  );
}
```

- [ ] **Step 4: Typecheck and lint**

Run:

```bash
npx tsc --noEmit
npm run lint
```

Expected: `tsc` silent. `npm run lint` reports only the one pre-existing `react-hooks/set-state-in-effect` error in `app/room/[code]/page.tsx`.

- [ ] **Step 5: Run the existing e2e suite as a regression floor**

Run: `npm run test:e2e -- --workers=2`

Expected: all pass. `e2e/game-flow.spec.ts` asserts `getByRole('row', { name: /Hosty/ })` and `/Joiner/`; those rows are now `motion.tr` inside the new table and must still be found. Playwright treats an `opacity: 0` element as visible (its visibility check is bounding box plus `visibility`/`display`), so the pre-board frames do not break those assertions.

- [ ] **Step 6: Commit**

```bash
git add components/ResultsTable.tsx components/ResultsView.tsx
git commit -m "feat(p5b): render the full field as a staged, accessible results table"
```

---

### Task 3: The winner card and the exit

The headline, and the last screen's application of ADR-0016's "staging never gates input": the exit link is mounted, fully opaque and focusable from the ceremony's first frame, and is never inside a fading wrapper (spec decision 5).

**Files:**
- Create: `components/WinnerCard.tsx`
- Modify: `components/ResultsView.tsx` (swap the M1 header for `WinnerCard`; restyle the exit link)

**Interfaces:**
- Consumes: `resultStats`, `formatAccuracy`, `formatAvg` (Task 1); `Panel`; `DURATION`, `EASE`; the `show` / `instant` pair `ResultsView` already computes (Task 2).
- Produces:
  - `WinnerCard(props: { winner: Standing; totalRounds: number; show: boolean; instant: boolean }): JSX.Element` — default export of `components/WinnerCard.tsx`.
  - DOM hook for Task 4: `data-testid="winner-card"`.

- [ ] **Step 1: Write the winner card**

Create `components/WinnerCard.tsx`:

```tsx
'use client';
import { motion } from 'motion/react';
import Panel from '@/components/ui/Panel';
import { DURATION, EASE } from '@/lib/presentation/tokens';
import { formatAccuracy, formatAvg, resultStats } from '@/lib/results/stats';
import type { Standing } from '@/lib/types';

/**
 * The headline (spec §5). Fades and lifts in first; the table's rows follow it
 * via their own `delayChildren` (components/ResultsTable.tsx).
 *
 * Like the table, this is ALWAYS rendered — never conditionally mounted — so
 * the winner is in the accessibility tree from the ceremony's first frame, and
 * so there is no mount for a reload to replay (spec decision 1). `instant`
 * settles it without an entrance; see the `settled` one-shot in ResultsView.
 *
 * The opacity and lift are variant targets, never Tailwind classes (ADR-0017).
 *
 * Unlike the table, the headline OMITS a stat it does not know rather than
 * printing a dash: a one-line summary reading "9/12 correct · — · — avg" is
 * worse than one reading "9/12 correct". The grid of dashes belongs in the
 * table, where the column header says what the dash is a dash FOR.
 */
export default function WinnerCard({
  winner, totalRounds, show, instant,
}: {
  winner: Standing;
  totalRounds: number;
  /** The ceremony's `board` beat has landed (or the beat was over at mount). */
  show: boolean;
  /** Mounted past the beat — settle without playing the entrance. */
  instant: boolean;
}) {
  const { accuracy, avgSeconds } = resultStats(winner);

  return (
    <motion.div
      data-testid="winner-card"
      initial={instant ? false : 'hidden'}
      animate={show ? 'shown' : 'hidden'}
      variants={{
        hidden: { opacity: 0, y: 24 },
        shown: {
          opacity: 1, y: 0,
          transition: { duration: DURATION.settle / 1000, ease: EASE.settle },
        },
      }}
    >
      <Panel className="px-6 py-7 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-mute">
          Race complete
        </p>
        <p className="mt-3 font-display text-hero font-black text-ink">
          <span aria-hidden="true">🏆 </span>
          <span style={{ color: winner.color }}>{winner.nickname}</span> wins
        </p>
        <p className="mt-2 text-sm tabular-nums text-ink-dim">
          {winner.correct}/{totalRounds} correct
          {accuracy !== null && <> · {formatAccuracy(accuracy)}</>}
          {avgSeconds !== null && <> · {formatAvg(avgSeconds)} avg</>}
        </p>
      </Panel>
    </motion.div>
  );
}
```

The string `Race complete` is load-bearing: `e2e/game-flow.spec.ts:52-53` asserts on it. CSS `uppercase` does not change text content, so the assertion still matches.

- [ ] **Step 2: Swap it in and restyle the exit**

In `components/ResultsView.tsx`:

Add the import beside the existing `ResultsTable` one:

```tsx
import WinnerCard from './WinnerCard';
```

Replace the entire `<header>…</header>` block with:

```tsx
      <WinnerCard winner={winner} totalRounds={room.total_rounds} show={show} instant={settled} />
```

Replace the `<Link>` block with:

```tsx
      {/*
        Spec decision 5 — ADR-0016's "staging never gates input", applied to the
        last screen. Deliberately OUTSIDE every fading wrapper: an exit that is
        focusable but invisible is worse than one that is simply there, so this
        never carries the board's staged opacity.
      */}
      <Link
        href="/"
        className="mx-auto rounded-control border border-haze/50 bg-abyss/70 px-5 py-2.5
          text-sm font-bold uppercase tracking-widest text-neon-cyan backdrop-blur-md
          transition-colors hover:bg-haze/30
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-cyan"
      >
        Back to home
      </Link>
```

- [ ] **Step 3: Typecheck, lint and confirm the ADR-0017 rule holds**

Run:

```bash
npx tsc --noEmit
npm run lint
grep -nE "opacity-|translate-|scale-" components/WinnerCard.tsx components/ResultsTable.tsx
```

Expected: `tsc` silent; `npm run lint` reports only the one pre-existing `app/room/[code]/page.tsx` error; the `grep` prints nothing.

- [ ] **Step 4: See it in the real app**

Start the dev server (`npm run dev`) and play a two-player game to results in a **headed** browser — headless Chromium falls back to SwiftShader and is not a usable instrument for anything on this canvas (`CURRENT.md`).

Confirm, and write down what you actually saw:
- The podium plays; at 6s the band retreats to 50vh and the winner card lifts in, with the table's rows following it.
- The exit link is present and tabbable during the podium, before the board enters.
- Reload the page after the ceremony has finished: the board is simply there, settled, with no entrance replay. This is the `settled` one-shot doing its job; if the entrance replays, the one-shot is not being read before the runtime's first publish and the fix is there, not in the components.

- [ ] **Step 5: Commit**

```bash
git add components/WinnerCard.tsx components/ResultsView.tsx
git commit -m "feat(p5b): headline the winner and keep the exit reachable throughout"
```

---

### Task 4: End-to-end coverage

Three assertions the spec asks for (§9.5–§9.7), added to the existing full-game test rather than a new spec file — reaching results costs about 20 seconds of wall clock and there is no reason to pay it twice.

**Files:**
- Modify: `e2e/game-flow.spec.ts:52-58`

**Interfaces:**
- Consumes: `data-testid="results-board"` + `data-entered` (Task 2), `data-testid="results-table"` (Task 2), `data-testid="player-name"` (Task 2), `data-testid="winner-card"` (Task 3).
- Produces: no code.

- [ ] **Step 1: Write the failing assertions**

In `e2e/game-flow.spec.ts`, replace these lines:

```ts
  await expect(host.getByText('Race complete')).toBeVisible({ timeout: 20_000 });
  await expect(joiner.getByText('Race complete')).toBeVisible({ timeout: 20_000 });

  await expect(host.getByRole('row', { name: /Hosty/ })).toBeVisible();
  await expect(host.getByRole('row', { name: /Joiner/ })).toBeVisible();

  await joinerContext.close();
```

with:

```ts
  const board = host.getByTestId('results-board');
  await expect(board).toBeAttached({ timeout: 20_000 });

  // P5b decision 1 + decision 5: the complete field and the exit are available
  // from the FIRST frame of the ceremony, six seconds before the board enters.
  // Asserted here, immediately after the board attaches, precisely because the
  // beat has not landed yet — `data-entered` is the proof it has not.
  await expect(board).toHaveAttribute('data-entered', 'false', { timeout: 1_000 });
  await expect(board.getByTestId('results-row')).toHaveCount(2);

  const exit = host.getByRole('link', { name: 'Back to home' });
  await exit.focus();
  await expect(exit).toBeFocused();

  // Now let the ceremony reach its board beat.
  await expect(board).toHaveAttribute('data-entered', 'true', { timeout: 15_000 });

  await expect(host.getByText('Race complete')).toBeVisible();
  await expect(joiner.getByText('Race complete')).toBeVisible({ timeout: 20_000 });

  // Six spelled-out columns (spec §7), one row per playing player.
  await expect(host.getByTestId('results-table').locator('thead th')).toHaveCount(6);
  await expect(host.getByRole('row', { name: /Hosty/ })).toBeVisible();
  await expect(host.getByRole('row', { name: /Joiner/ })).toBeVisible();

  // The headline names whoever the table ranks first — which of the two wins is
  // decided by speed points and is not fixed by this test.
  const topName = await board.getByTestId('results-row').first()
    .getByTestId('player-name').innerText();
  await expect(host.getByTestId('winner-card')).toContainText(topName);

  await joinerContext.close();
```

- [ ] **Step 2: Run it**

Run: `npm run test:e2e -- --workers=2 game-flow`

Expected: PASS.

If `toHaveAttribute('data-entered', 'false')` flakes, do **not** delete the assertion. The 6-second budget between the board attaching and the beat landing is large; a failure means either the attach itself resolved late (the `toBeAttached` timeout was consumed) or the `settled` one-shot is wrongly reading `true` on a live game. Diagnose which before changing the test, and record the finding in the progress doc.

- [ ] **Step 3: Run the whole suite**

Run: `npm run test:e2e -- --workers=2`

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add e2e/game-flow.spec.ts
git commit -m "test(p5b): cover the board's columns, its winner and its pre-beat reachability"
```

---

### Task 5: Verify the phase and record the decision

**Files:**
- Create: `docs/ADR/0030-the-results-board-is-present-before-it-is-visible.md`
- Create: `docs/progress/P5b-results-board.md`
- Modify: `docs/ADR/README.md` (index row)
- Modify: `docs/progress/CURRENT.md`

**Interfaces:**
- Consumes: everything above.
- Produces: no code.

- [ ] **Step 1: Run the full verification pass**

Run and record the actual output of each:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run test:e2e -- --workers=2
```

Expected: all pass, with the one known `app/room/[code]/page.tsx` lint error.

- [ ] **Step 2: Walk the spec's eight exit criteria and record a real result for each**

Not an assertion that it should work — what you saw. Use a **headed** browser throughout.

1. **A finished game shows a winner card and a full results table in the design language, entering after the ceremony's `board` beat.** Play a game; watch the 6s handoff.
2. **Accuracy and average render correctly, and render `—` — not `0%` — for a player who never submitted.** Play a three-player game where one player joins and never answers. Confirm that player's row shows `0` correct, `—` accuracy, `—` avg time.
3. **Against a pre-0004 database the board renders completely, with both new columns showing `—`.** Re-apply migration 0003, which re-creates `standings()` *without* the two fields and leaves 0004's `advance_phase` deadline alone — so the ceremony still runs and only the projection degrades:

   ```bash
   docker exec -i supabase_db_quiz-game psql -U postgres -d postgres < supabase/migrations/0003_reveal_picks.sql
   ```

   Play a game to results. Expect a complete board with `—` in Accuracy and Avg time for everyone, and the winner card's headline showing only `n/m correct`. Then restore:

   ```bash
   docker exec -i supabase_db_quiz-game psql -U postgres -d postgres < supabase/migrations/0004_ceremony.sql
   ```

   Confirm the stats come back before moving on.
4. **Narrow portrait collapses the secondary stats under the nickname; the page never scrolls horizontally.** Resize to 360×740 and check `document.documentElement.scrollWidth <= document.documentElement.clientWidth` in the console, in addition to reading the layout. Check a long nickname (the join form's maximum) truncates rather than widening the row.
5. **The full results are in the accessibility tree from the first frame of the ceremony, and the exit link is keyboard-reachable throughout.** During the podium, before 6s: tab to the exit link, and inspect the accessibility tree (DevTools → Elements → Accessibility, or `getByRole('row')` from a console-driven check) to confirm the rows are present while the board is still at `opacity: 0`.
6. **The `reduced` profile drops the stagger and lift; the board still appears.** Set the profile to reduced via the gear control, reload into a finished game, and confirm the rows arrive together, opacity only, and that the board is fully present.
7. **Reloading after the ceremony shows the settled board with no entrance replay.** Reload several times against a results phase whose `ends_at` is well in the past. Record whether any frame of entrance was visible.
8. **`npm test` passes; `npm run test:e2e -- --workers=2` passes.** Already covered by Step 1; restate the result.

- [ ] **Step 3: Re-check the podium-clipping debt and say plainly what P5b did about it**

`CURRENT.md` records that the winner's podium rig is clipped once the band retreats to 50vh, and names P5b as "the most likely phase to actually confront this, since it controls the retreat timing."

**P5b does not fix it, deliberately.** Spec §10 puts everything canvas — including the band publication — out of scope, and the honest fix is either vertical-headroom reasoning in `lib/world/framing.ts`'s podium shot or a change to when the retreat happens, both of which are design decisions rather than a clamp. Confirm during Step 2 whether the clipping still reproduces with the real board in place (the board is now worth looking at, which may change how much the clipping costs), and update the `CURRENT.md` entry with what you observed — including, if it turns out the retreat is no longer worth its price now that the board is designed, that judgement.

- [ ] **Step 4: Write ADR-0030**

Create `docs/ADR/0030-the-results-board-is-present-before-it-is-visible.md`, following `docs/ADR/README.md`'s format exactly: `# ADR-0030: Title`, then **Status** (Accepted) / **Date** / **Phase** (P5b), then `## Context`, `## Decision`, `## Consequences`.

- **Context.** The ceremony withholds the result for six seconds because withholding it is the point. But the roadmap's exit criterion for this phase is that results stay fully readable and accessible in HTML, and a screen-reader user gets nothing from a podium rising on a canvas. Mounting the board at the `board` beat would have made the two goals trade against each other; `display: none` and `visibility: hidden` would have done the same thing more quietly, since both remove content from the accessibility tree.
- **Decision.** The winner card and the results table are rendered from the results phase's first frame and staged with `opacity` alone — a `motion` variant target, never a Tailwind class (ADR-0017). Nothing about the board mounts conditionally.
- **Consequences.** Name each of these:
  - The full results are in the accessibility tree while the podium is still rising; the drama is a purely visual layer over content that was always there. This is the readability twin of ADR-0016's input rule, and the exit link's treatment (spec decision 5) is the same argument applied to focus.
  - Because nothing mounts conditionally, `AnimatePresence initial={false}` — the fix for the replay trap in P3a's `QuestionCard` badges, P3a's `StageShell` options slot and P3b's `AvatarStack` — has no purchase here. The trap still exists: `lib/ceremony/runtime.ts` publishes from a rAF tick started in an effect, so `steps.board` is false on the board's first render even after a reload into a long-finished ceremony. The fix is the one-shot `settled` derivation in `ResultsView`, which re-reads the same `ends_at` through the same `elapsedIn`/`BOARD_AT` the runtime uses. Record that any future component staged off `useCeremony` inherits this, and that the answer depends on whether it mounts conditionally: `AnimatePresence initial={false}` if it does, a mount-time derivation if it does not.
  - The board occupies layout below the band spacer for the whole ceremony, so the page is scrollable and focusable past the fold from the first frame. That is intended, not a side effect.
  - What this forbids later: staging any part of the board with `display`, `visibility`, `hidden`, or conditional mounting, and putting an opacity class on any element the variants touch.

- [ ] **Step 5: Add the ADR index row**

Append one row to the table at the end of `docs/ADR/README.md`, matching the existing format exactly:

```markdown
| [0030](0030-the-results-board-is-present-before-it-is-visible.md) | The results board is present before it is visible | P5b |
```

- [ ] **Step 6: Write the phase progress doc**

Create `docs/progress/P5b-results-board.md` following the shape of `docs/progress/P5a-podium-ceremony.md`: scope, what was built (one row per task), deviations from the plan, verification results with real command output, and any new tech debt.

Record at minimum:
- The `settled` one-shot in `ResultsView` and *why the spec's own §6 claim needed it*: the spec says "a reload past the ceremony lands with `steps.board` already true", and that is not what the runtime actually does on the first render. This is a deviation from the spec's stated mechanism, arrived at in planning, and it is the single most load-bearing thing a future reader needs from this document.
- That the winner card omits an unknown stat while the table prints a dash, and why.
- The narrow-portrait result from Step 2.4, including the measured `scrollWidth`.
- The pre-0004 result from Step 2.3, including that reverting *only* 0003 is the isolation that leaves the ceremony's deadline intact.
- What Step 3 found about the podium clipping.
- Anything the `reduced` pass in Step 2.6 turned up about `MotionConfig`'s transform suppression — whether the row lift really is dropped without the component doing anything about it, since this plan relies on that.

- [ ] **Step 7: Update `CURRENT.md`**

- Move P5b out of "Next up" into "Last completed", pointing at the new progress doc.
- Set "Current phase" to none in progress, and set "Next up" to P6 (stage view), noting that both halves of its P4/P5 wait are now satisfied — and that the per-`Application` baked-avatar texture cache in the tech-debt list is the item P6 must fix first.
- Extend the replay-trap note with P5b's variant: the same trap reaches a component that does *not* mount conditionally, where `AnimatePresence` cannot help, and the fix is a mount-time derivation from `ends_at`. Point at ADR-0030.
- Update the podium-clipping entry with Step 3's finding.
- Add any new tech debt found during Step 2.

- [ ] **Step 8: Commit**

```bash
git add docs/
git commit -m "docs(p5b): record the board's presence-before-visibility decision and close the phase"
```

---

## Self-Review

**Spec coverage.** Every section maps to a task:

| Spec | Task |
| --- | --- |
| §2 decision 1 (DOM from the first frame, `opacity: 0`) | Task 2 Step 1 (always rendered), Task 3 Step 1, ADR-0030 |
| §2 decision 2 (variant target, never a class) | Task 2 Step 2 and Task 3 Step 3 grep gates |
| §2 decision 3 (`correct / answered`, `—` at 0) | Task 1 |
| §2 decision 4 (narrow collapses, does not scroll) | Task 2 Step 1 (`sm:table-cell` / `sm:hidden`), Task 5 Step 2.4 |
| §2 decision 5 (exit mounted and focusable throughout) | Task 3 Step 2, Task 4 Step 1 |
| §3 module layout | Tasks 1–3 |
| §4 stats + degrade shape | Task 1 |
| §5 layout, band spacer, `Panel`, medals, local row | Tasks 2, 3 |
| §6 staging, motion, reduced profile | Tasks 2, 3; Task 5 Step 2.6 |
| §7 accessibility | Task 2 Step 1 (`<caption>`, `scope`, `aria-hidden` medals, `aria-current`, spelled-out headers, `Stat`'s labelled dash), Task 5 Step 2.5 |
| §8 edge cases | never-answered → Task 1 + Task 5 Step 2.2; pre-0004 → Task 1 + Task 5 Step 2.3; single player → same code path, no special case; 20-player field → `ROW_STAGGER_S` sizing, vertical page scroll; ties → untouched Fairness Law order; reload → `settled` one-shot, Task 3 Step 4 + Task 5 Step 2.7; no WebGL → `var(--ceremony-band, 0px)` fallback |
| §9 testing | Task 1 (Vitest 1–4), Task 4 (Playwright 5–7), Task 5 Step 2.4 (manual narrow pass) |
| §10 scope boundaries | No canvas file, no store, no wire, no migration is touched by any task; Task 5 Step 3 states the canvas exclusion explicitly for the one item that invites a breach |
| §11 exit criteria | Task 5 Step 2 |
| §12 expected ADR | Task 5 Step 4 |

**One deviation from the spec, deliberate and flagged in-plan.** Spec §6 states that "a reload past the ceremony lands with `steps.board` already true and everything at its settled variant target — no replay." It does not: `lib/ceremony/runtime.ts` publishes from a `requestAnimationFrame` tick started in a `useEffect`, so `useCeremony`'s store still holds `NO_CEREMONY` during the board's first render, and `board` flips true a frame later — which is an entrance, played on every reload. Because nothing here mounts conditionally, the spec's own named remedy (`AnimatePresence initial={false}`) cannot reach it. Task 2 Step 3 adds a one-shot mount-time derivation from the same `ends_at` and the same pure constants the runtime reads; Task 5 Step 6 records it and ADR-0030 argues it. Two smaller readings, both stated where they are made: the winner card omits an unknown stat rather than printing a dash (Task 3 Step 1), and the rank column's header is "Rank" rather than the sketch's `#`, following §7's "spelled out, never abbreviated" over §5's ASCII sketch.

**Placeholder scan.** No TBDs, no "add error handling", no "similar to Task N", no step without its content. Every code step carries the code; every verification step carries the command and the expected result. The one instruction that names no exact prose — Task 5's ADR — carries the full argument as bullets, which is the same treatment P5a's plan gave its four ADRs.

**Type consistency.** `ResultStats`, `resultStats`, `formatAccuracy`, `formatAvg` and `NO_VALUE` (Task 1) are consumed under exactly those names in Tasks 2 and 3. The `{ show, instant }` prop pair has the same names, types and meanings on both `ResultsTable` (Task 2) and `WinnerCard` (Task 3), and both are fed from the same `show` / `settled` locals in `ResultsView`. `myId` is `string | null` at every hop (`loadSession(code)?.playerId ?? null` → prop → `s.player_id === myId`). Test ids are fixed in Task 2 and 3 and used verbatim in Task 4: `results-board`, `results-table`, `results-row`, `player-name`, `winner-card`. `BOARD_AT`, `CEREMONY_MS`, `elapsedIn` and `msUntil` are imported with their existing signatures — `elapsedIn(totalMs: number, remainingMs: number | null): number`, `msUntil(endsAtIso: string | null): number`.
