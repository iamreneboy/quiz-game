# M2 P0 — Foundation & Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the presentation substrate every later M2 phase consumes — design tokens, celebration hierarchy, the cue (presentation-event) layer, performance profiles with a visible settings control, the Pixi canvas mount, and the first three screens rendered in the night-race visual identity.

**Architecture:** Presentation-only. Game state (`lib/store.ts`, RPCs, realtime channel) is **not touched**. A pure diff function (`deriveCues`) turns consecutive store snapshots into typed cues; a store subscriber (`startCueBridge`) feeds a hand-rolled typed emitter that Pixi (P1+), `motion` UI (P3) and Howler (P4) will subscribe to. Design tokens live in the Tailwind v4 `@theme` block (source of truth) and are hand-mirrored into `lib/presentation/tokens.ts` for canvas/logic code. Performance profile lives in its own tiny Zustand store, resolved once at startup from device signals plus a persisted manual override, and published to CSS as `data-profile` on `<html>`.

**Tech Stack:** Next.js 16.3.1 (App Router, TypeScript strict), React 19.2, Tailwind CSS v4.3, PixiJS v8, `motion` (Framer Motion) v13, Howler v2 (installed, unused until P4), Zustand v5, Vitest v4, `@playwright/test` v1.62.

**Spec:** `docs/superpowers/specs/2026-08-21-m2-p0-foundation-design.md` (parent: `docs/superpowers/specs/2026-08-21-m2-the-show-roadmap.md` P0, `docs/PRD.md` §8–§9).

## Global Constraints

- **Presentation-only.** No changes to `supabase/**`, `lib/store.ts`, `lib/types.ts`, `lib/useRoomChannel.ts`, `lib/useHostDriver.ts`, or any RPC/realtime payload. If a task appears to need one, stop and flag it — that is a roadmap decision-4 exception, not a quiet addition.
- **The existing Playwright suite is the regression floor.** `e2e/landing.spec.ts`, `e2e/host-setup.spec.ts`, `e2e/join.spec.ts` must pass **unmodified**. `e2e/game-flow.spec.ts` gets exactly one additive assertion (Task 7) and no other edits.
- **Accessible names and placeholders are frozen** on restyled screens. Do not change, translate, or wrap in extra labels: heading text matching `/circuit break/i`, buttons `Host a game`, `Join`, `Join game`, `/create room/i`, `−`, `+`; placeholders `ROOM CODE`, `Your nickname`; heading `New game`; text `Answer timer: {n}s`; text starting `{n} questions`; `input[type=range]` for the timer; the four category buttons `Screen Break`, `AI & Tech`, `Corporate Survival`, `Rewind`, `Extremely Online`, `Fuel`. The `−`/`+` steppers must stay in tier order (4 of each) and must not gain `aria-label`s (the suite matches them by accessible name `−`/`+`).
- **`components/SettingsControl.tsx` and `components/PixiStage.tsx` must render OUTSIDE any `<main>` element.** `e2e/game-flow.spec.ts` selects the first answer option with `page.locator('main button').first()`; an extra button inside `<main>` breaks the full-game test.
- TypeScript `strict`; no `any` in committed code. `npm run lint` clean.
- Unit tests are **pure Node** — no jsdom, no DOM globals. Vitest picks up `tests/**/*.test.ts` only (`vitest.config.ts`). Browser-only helpers (`readDeviceSignals`, `loadOverride`, `saveOverride`, Pixi lifecycle) are deliberately not unit-tested; the tested seam is state-transitions-in → cues-out.
- CelebrationTier ordinal scale, fixed: `routine < streakMilestone < overtake < finalQuestion < victory`.
- Design tokens: the `@theme` block in `app/globals.css` is the **source of truth**; `lib/presentation/tokens.ts` is a hand-mirror kept honest by `tests/tokens.test.ts`. No codegen.
- Motion curve tokens, exact values (used verbatim in CSS and TS):
  `--ease-snap: cubic-bezier(0.2, 0, 0, 1)` · `--ease-settle: cubic-bezier(0.34, 1.4, 0.5, 1)` · `--ease-drift: cubic-bezier(0.45, 0, 0.55, 1)`
- Duration tokens (ms): `cut 120`, `beat 260`, `settle 460`, `drift 1400`. Tailwind v4 has **no `--duration-*` theme namespace** — these live in a plain `:root` block and are consumed as `duration-(--dur-beat)` or from `tokens.ts`.
- `localStorage` keys keep the existing `cb:` prefix. Profile override key: `cb:settings:profile`.
- **Prerequisites for e2e:** Docker Desktop running and local Supabase up (`npx supabase start`) — `.env.local` points at `http://127.0.0.1:54321`. The dev server may already be running; `playwright.config.ts` reuses it outside CI.
- Out of scope (do not build): any visible Pixi scene content, avatars, round choreography, audio playback, ceremony, stage view, runtime FPS watchdog, token codegen. Lobby / question loop / track / results keep their placeholder styling.

## File Structure

```
app/
  globals.css              # MODIFY: @theme tokens (source of truth) + base layer + reduced-profile rules   (Task 1)
  layout.tsx               # MODIFY: next/font display+body faces (Task 1), MotionProvider (Task 5)
  page.tsx                 # MODIFY: landing restyle                                        (Task 8)
  host/new/page.tsx        # MODIFY: host setup wizard restyle                              (Task 8)
  room/[code]/page.tsx     # MODIFY: cue bridge (Task 4), shell + SettingsControl (Task 6), PixiStage (Task 7)
lib/
  presentation/
    tokens.ts              # CREATE: TS mirror of canvas-relevant tokens                    (Task 1)
    celebration.ts         # CREATE: CelebrationTier scale + resolveTier + isSubdued        (Task 2)
    cues.ts                # CREATE: full M2 cue vocabulary (types only)                    (Task 3)
    deriveCues.ts          # CREATE: pure (prev, next, state) -> { cues, nextState }         (Task 3)
    cueBus.ts              # CREATE: typed emitter + startCueBridge() store subscriber      (Task 4)
    profile.ts             # CREATE: resolveProfile + device signals + persistence          (Task 5)
  useSettings.ts           # CREATE: Zustand store — override + effective profile           (Task 5)
components/
  MotionProvider.tsx       # CREATE: hydrates settings, publishes data-profile, MotionConfig (Task 5)
  SettingsControl.tsx      # CREATE: corner gear popover (auto | high | reduced)            (Task 6)
  PixiStage.tsx            # CREATE: canvas lifecycle, empty scene                          (Task 7)
  JoinGate.tsx             # MODIFY: restyle                                                (Task 8)
  ui/
    Panel.tsx              # CREATE: glass surface primitive                                (Task 6)
    Button.tsx             # CREATE: primary / ghost / quiet                                (Task 6)
    Input.tsx              # CREATE: text input primitive                                   (Task 6)
    Select.tsx             # CREATE: labelled select primitive                              (Task 6)
tests/
  tokens.test.ts           # CREATE: CSS ↔ tokens.ts mirror guard                           (Task 1)
  celebration.test.ts      # CREATE                                                          (Task 2)
  deriveCues.test.ts       # CREATE: recorded M1 transition sequences                        (Task 3)
  cueBus.test.ts           # CREATE: emitter + bridge against the real store                 (Task 4)
  profile.test.ts          # CREATE: signal/override matrix                                  (Task 5)
e2e/
  settings.spec.ts         # CREATE: profile switch + persistence + reduced-motion           (Task 6)
  game-flow.spec.ts        # MODIFY: one additive canvas assertion                           (Task 7)
```

**Not built in P0, deliberately:** nothing else. Every file in the spec's §3 module layout appears above. `components/MotionProvider.tsx` is an addition to the spec's layout — it is the single place settings hydration happens (avoiding a hydration mismatch) and the only sane home for `<MotionConfig reducedMotion>`.

---

### Task 1: Dependencies, fonts, and the design-token system

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `app/globals.css` (currently one line: `@import "tailwindcss";`)
- Modify: `app/layout.tsx`
- Create: `lib/presentation/tokens.ts`
- Test: `tests/tokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: Tailwind utilities `bg-void|abyss|night|dusk|haze`, `text-ink|ink-dim|ink-mute`, `text-neon-cyan|neon-magenta|neon-lime`, `text-correct|wrong|warning`, `text-gold|silver|bronze`, `bg-racer-1..8`, `font-display`, `font-body`, `text-display`, `text-hero`, `rounded-panel`, `rounded-control`, `ease-snap|ease-settle|ease-drift`; CSS vars `--dur-cut|--dur-beat|--dur-settle|--dur-drift`; and from `lib/presentation/tokens.ts`: `COLOR` (`{ void, abyss, night, dusk, haze, neonCyan, neonMagenta, neonLime, correct, wrong, warning, gold, silver, bronze }` as `0xRRGGBB` numbers), `RACER_COLORS: readonly number[]`, `EASE: Record<'snap'|'settle'|'drift', [number,number,number,number]>`, `DURATION: { cut: 120; beat: 260; settle: 460; drift: 1400 }`, `CANVAS: { background: number; maxResolution: 2 }`.

- [ ] **Step 1: Install the M2 dependencies**

Howler has no consumer until P4 — P0 is the phase that owns `package.json`, per spec §3.

```bash
npm install pixi.js@^8 motion howler
npm install -D @types/howler
```

Expected resulting versions (caret ranges): `pixi.js ^8.20`, `motion ^13.1`, `howler ^2.2`, `@types/howler ^2.2`.

- [ ] **Step 2: Confirm the install and that nothing regressed**

```bash
npm ls pixi.js motion howler @types/howler
npm test
```
Expected: all four resolve; existing vitest suite (`rank`, `serverTime`, `store`) passes.

- [ ] **Step 3: Write the failing token-mirror test**

`tokens.ts` is hand-mirrored from CSS (spec decision 6, "no codegen"). This test is what keeps the hand-mirror honest.

Create `tests/tokens.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { COLOR, RACER_COLORS, EASE, DURATION, CANVAS } from '@/lib/presentation/tokens';
import { COLORS } from '@/lib/avatars';

const css = readFileSync(path.resolve(__dirname, '../app/globals.css'), 'utf8');

function cssVar(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`--${name} is not defined in app/globals.css`);
  return match[1].trim();
}

function hexToInt(hex: string): number {
  expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  return parseInt(hex.slice(1), 16);
}

// Explicit map: camelCase key in tokens.ts -> kebab-case custom property in globals.css.
const COLOR_VARS: Record<keyof typeof COLOR, string> = {
  void: 'color-void',
  abyss: 'color-abyss',
  night: 'color-night',
  dusk: 'color-dusk',
  haze: 'color-haze',
  neonCyan: 'color-neon-cyan',
  neonMagenta: 'color-neon-magenta',
  neonLime: 'color-neon-lime',
  correct: 'color-correct',
  wrong: 'color-wrong',
  warning: 'color-warning',
  gold: 'color-gold',
  silver: 'color-silver',
  bronze: 'color-bronze',
};

describe('tokens.ts mirrors the @theme block in globals.css', () => {
  it('every mirrored color matches its CSS custom property', () => {
    for (const [key, varName] of Object.entries(COLOR_VARS)) {
      expect(COLOR[key as keyof typeof COLOR], `${key} vs --${varName}`).toBe(hexToInt(cssVar(varName)));
    }
  });

  it('racer colors mirror --color-racer-N in order', () => {
    expect(RACER_COLORS.length).toBe(8);
    RACER_COLORS.forEach((value, i) => {
      expect(value, `racer ${i + 1}`).toBe(hexToInt(cssVar(`color-racer-${i + 1}`)));
    });
  });

  it('racer colors match the DB-persisted picker palette in lib/avatars.ts', () => {
    const asHex = RACER_COLORS.map(n => `#${n.toString(16).padStart(6, '0')}`);
    expect(asHex).toEqual(COLORS);
  });

  it('easing curves match the CSS cubic-beziers', () => {
    for (const [key, curve] of Object.entries(EASE)) {
      expect(cssVar(`ease-${key}`), key).toBe(`cubic-bezier(${curve.join(', ')})`);
    }
  });

  it('durations match the CSS duration custom properties', () => {
    for (const [key, ms] of Object.entries(DURATION)) {
      expect(cssVar(`dur-${key}`), key).toBe(`${ms}ms`);
    }
  });

  it('canvas background is a mirrored surface color', () => {
    expect(CANVAS.background).toBe(COLOR.abyss);
    expect(CANVAS.maxResolution).toBe(2);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run tests/tokens.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/presentation/tokens"`.

- [ ] **Step 5: Write the `@theme` block (source of truth)**

Replace the entire contents of `app/globals.css`:

```css
@import "tailwindcss";

/* ---------------------------------------------------------------------------
   Circuit Break — night-race design system (PRD §8).
   THIS BLOCK IS THE SOURCE OF TRUTH for design tokens.
   lib/presentation/tokens.ts hand-mirrors the canvas-relevant subset;
   tests/tokens.test.ts fails if the two drift.
--------------------------------------------------------------------------- */
@theme {
  /* Type faces — the CSS variables come from next/font in app/layout.tsx */
  --font-display: var(--font-display-face), ui-sans-serif, system-ui, sans-serif;
  --font-body: var(--font-body-face), ui-sans-serif, system-ui, sans-serif;

  /* Display type scale (Tailwind's default text-* scale is kept as-is) */
  --text-display: 4rem;
  --text-display--line-height: 0.95;
  --text-display--letter-spacing: -0.03em;
  --text-hero: 2.25rem;
  --text-hero--line-height: 1.05;
  --text-hero--letter-spacing: -0.02em;

  /* Surfaces — dark indigo scale, deepest first */
  --color-void: #05060f;
  --color-abyss: #0a0c1c;
  --color-night: #121734;
  --color-dusk: #1c2350;
  --color-haze: #2b3370;

  /* Ink */
  --color-ink: #eaeeff;
  --color-ink-dim: #a6adde;
  --color-ink-mute: #6d75ab;

  /* Neon accents */
  --color-neon-cyan: #35f2ff;
  --color-neon-magenta: #ff4fd8;
  --color-neon-lime: #c6ff4a;

  /* Semantics */
  --color-correct: #3ce69b;
  --color-wrong: #ff5d73;
  --color-warning: #ffb43d;

  /* Medals */
  --color-gold: #ffd166;
  --color-silver: #d5dcee;
  --color-bronze: #e08a4c;

  /* Warm racer palette — mirrors COLORS in lib/avatars.ts. These values are
     persisted per player in Postgres; never renumber or recolor them here
     without a data migration. */
  --color-racer-1: #f59e0b;
  --color-racer-2: #38bdf8;
  --color-racer-3: #a78bfa;
  --color-racer-4: #34d399;
  --color-racer-5: #fb7185;
  --color-racer-6: #facc15;
  --color-racer-7: #f97316;
  --color-racer-8: #22d3ee;

  /* Glassmorphic geometry */
  --radius-panel: 1.25rem;
  --radius-control: 0.875rem;

  /* Motion vocabulary — shared by CSS, `motion`, and Pixi tweens */
  --ease-snap: cubic-bezier(0.2, 0, 0, 1);
  --ease-settle: cubic-bezier(0.34, 1.4, 0.5, 1);
  --ease-drift: cubic-bezier(0.45, 0, 0.55, 1);
}

/* Durations. Tailwind v4 has no --duration-* theme namespace, so these are
   plain custom properties: use them as duration-(--dur-beat) in classes
   or via DURATION in lib/presentation/tokens.ts. */
:root {
  --dur-cut: 120ms;
  --dur-beat: 260ms;
  --dur-settle: 460ms;
  --dur-drift: 1400ms;
}

@layer base {
  html {
    color-scheme: dark;
  }

  body {
    background-color: var(--color-void);
    background-image:
      radial-gradient(120% 80% at 50% -10%, color-mix(in oklab, var(--color-dusk) 75%, transparent), transparent 62%),
      radial-gradient(90% 55% at 100% 105%, color-mix(in oklab, var(--color-neon-magenta) 14%, transparent), transparent 70%);
    background-attachment: fixed;
    color: var(--color-ink);
    font-family: var(--font-body);
  }

  ::selection {
    background: var(--color-neon-cyan);
    color: var(--color-void);
  }
}

/* Reduced performance profile — set on <html> by components/MotionProvider.tsx.
   Covers CSS transitions/animations; `motion` is handled by MotionConfig and
   Pixi by the profile branch in each renderer. */
[data-profile='reduced'] *,
[data-profile='reduced'] *::before,
[data-profile='reduced'] *::after {
  animation-duration: 1ms !important;
  animation-delay: 0ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 1ms !important;
  transition-delay: 0ms !important;
  scroll-behavior: auto !important;
}
```

- [ ] **Step 6: Write the TS mirror**

Create `lib/presentation/tokens.ts`:

```ts
/**
 * TypeScript mirror of the canvas-relevant design tokens.
 *
 * SOURCE OF TRUTH: the `@theme` block in `app/globals.css`.
 * This file is hand-maintained (spec decision 6 — no codegen); `tests/tokens.test.ts`
 * fails the build if the two drift. Only add a value here when non-CSS code
 * (Pixi, `motion`, layout math) actually needs it.
 */

/** Surface, accent, semantic and medal colors as Pixi-ready 0xRRGGBB numbers. */
export const COLOR = {
  void: 0x05060f,
  abyss: 0x0a0c1c,
  night: 0x121734,
  dusk: 0x1c2350,
  haze: 0x2b3370,
  neonCyan: 0x35f2ff,
  neonMagenta: 0xff4fd8,
  neonLime: 0xc6ff4a,
  correct: 0x3ce69b,
  wrong: 0xff5d73,
  warning: 0xffb43d,
  gold: 0xffd166,
  silver: 0xd5dcee,
  bronze: 0xe08a4c,
} as const;

/** Warm racer palette, index 0 == --color-racer-1 == COLORS[0] in lib/avatars.ts. */
export const RACER_COLORS: readonly number[] = [
  0xf59e0b, 0x38bdf8, 0xa78bfa, 0x34d399, 0xfb7185, 0xfacc15, 0xf97316, 0x22d3ee,
];

/** Cubic-bezier control points, ready for `motion` transitions and Pixi tweens. */
export const EASE: Record<'snap' | 'settle' | 'drift', [number, number, number, number]> = {
  snap: [0.2, 0, 0, 1],
  settle: [0.34, 1.4, 0.5, 1],
  drift: [0.45, 0, 0.55, 1],
};

/** Named durations in milliseconds. */
export const DURATION = {
  cut: 120,
  beat: 260,
  settle: 460,
  drift: 1400,
} as const;

/** Canvas-specific constants for components/PixiStage.tsx. */
export const CANVAS = {
  background: COLOR.abyss,
  /** devicePixelRatio ceiling — beyond 2 the fill-rate cost buys nothing. */
  maxResolution: 2,
} as const;

/** Convert a mirrored token (or any 0xRRGGBB number) to a CSS hex string. */
export function toHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
```

- [ ] **Step 7: Run the token test to verify it passes**

Run: `npx vitest run tests/tokens.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 8: Load the two type faces**

Replace `app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { Chakra_Petch, Manrope } from 'next/font/google';
import './globals.css';

// Display face: angular, telemetry-flavoured — headings, numerals, buttons.
const display = Chakra_Petch({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display-face',
  display: 'swap',
});

// Body face: variable, high legibility at small sizes — everything readable.
const body = Manrope({
  subsets: ['latin'],
  variable: '--font-body-face',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Circuit Break',
  description: 'The office trivia grand prix',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
```

The font variables land on `<html>`, which is the same element as `:root`, so the `@theme` entries `--font-display: var(--font-display-face), …` resolve. (This is why a plain `@theme` block works here and `@theme inline` is not needed.)

- [ ] **Step 9: Verify the app builds with self-hosted fonts**

Run: `npm run build`
Expected: build succeeds. `next/font/google` downloads and self-hosts both faces at build time — this needs network access on first build; if it fails with a fetch error, retry once before investigating.

- [ ] **Step 10: Verify the token system renders and nothing regressed**

```bash
npm run lint
npm test
```
Expected: lint clean; all vitest suites pass.

With the dev server running (`npm run dev`), capture a smoke screenshot:

```bash
npx playwright screenshot --viewport-size=1280,800 http://localhost:3000/ test-results/p0-t1-landing.png
```
Expected: the landing page is unchanged in structure but now sits on the deep indigo gradient body with the new body face. (Screenshots go to the gitignored `test-results/`; they are never committed. `playwright-cli` is the equivalent ad-hoc tool if preferred.)

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json app/globals.css app/layout.tsx lib/presentation/tokens.ts tests/tokens.test.ts
git commit -m "feat(design): night-race design tokens, display/body faces, M2 deps"
```

---

### Task 2: Celebration hierarchy

**Files:**
- Create: `lib/presentation/celebration.ts`
- Test: `tests/celebration.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type CelebrationTier = 'routine' | 'streakMilestone' | 'overtake' | 'finalQuestion' | 'victory'`; `CELEBRATION_TIERS: readonly CelebrationTier[]` (ascending); `tierRank(tier: CelebrationTier): number`; `resolveTier(cues: readonly { tier: CelebrationTier }[]): CelebrationTier`; `isSubdued(tier: CelebrationTier, resolved: CelebrationTier): boolean`.

- [ ] **Step 1: Write the failing test**

Create `tests/celebration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  CELEBRATION_TIERS,
  isSubdued,
  resolveTier,
  tierRank,
  type CelebrationTier,
} from '@/lib/presentation/celebration';

describe('celebration scale', () => {
  it('pins the ordinal scale fixed by the M2 roadmap', () => {
    expect(CELEBRATION_TIERS).toEqual([
      'routine',
      'streakMilestone',
      'overtake',
      'finalQuestion',
      'victory',
    ]);
  });

  it('ranks strictly ascending so routine can never outrank a major moment', () => {
    const ranks = CELEBRATION_TIERS.map(tierRank);
    expect(ranks).toEqual([0, 1, 2, 3, 4]);
    for (let i = 1; i < ranks.length; i++) expect(ranks[i]).toBeGreaterThan(ranks[i - 1]);
  });
});

describe('resolveTier', () => {
  const cue = (tier: CelebrationTier) => ({ tier });

  it('returns the highest tier among simultaneous cues', () => {
    expect(resolveTier([cue('routine'), cue('overtake'), cue('streakMilestone')])).toBe('overtake');
  });

  it('is order-independent', () => {
    expect(resolveTier([cue('victory'), cue('routine')])).toBe('victory');
    expect(resolveTier([cue('routine'), cue('victory')])).toBe('victory');
  });

  it('a victory cue beats a final-question cue', () => {
    expect(resolveTier([cue('finalQuestion'), cue('victory')])).toBe('victory');
  });

  it('defaults to routine for an empty batch', () => {
    expect(resolveTier([])).toBe('routine');
  });
});

describe('isSubdued', () => {
  it('is true for a cue below the resolved tier', () => {
    expect(isSubdued('routine', 'overtake')).toBe(true);
  });

  it('is false for the cue that set the resolved tier', () => {
    expect(isSubdued('overtake', 'overtake')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/celebration.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/presentation/celebration"`.

- [ ] **Step 3: Write the implementation**

Create `lib/presentation/celebration.ts`:

```ts
/**
 * The celebration hierarchy (PRD §8, M2 roadmap decision 4).
 *
 * Every cue carries a tier. When several cues land at once, consumers resolve
 * the batch to its highest tier and render everything below it in subdued form,
 * so a routine correct answer can never spend the same energy as a victory.
 */

export const CELEBRATION_TIERS = [
  'routine',
  'streakMilestone',
  'overtake',
  'finalQuestion',
  'victory',
] as const;

export type CelebrationTier = (typeof CELEBRATION_TIERS)[number];

/** Position on the ordinal scale; higher wins. */
export function tierRank(tier: CelebrationTier): number {
  return CELEBRATION_TIERS.indexOf(tier);
}

/** Highest tier among simultaneous cues; `routine` when there are none. */
export function resolveTier(cues: readonly { tier: CelebrationTier }[]): CelebrationTier {
  let highest: CelebrationTier = 'routine';
  for (const cue of cues) {
    if (tierRank(cue.tier) > tierRank(highest)) highest = cue.tier;
  }
  return highest;
}

/** True when this cue should be rendered in subdued form given the resolved batch tier. */
export function isSubdued(tier: CelebrationTier, resolved: CelebrationTier): boolean {
  return tierRank(tier) < tierRank(resolved);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/celebration.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/presentation/celebration.ts tests/celebration.test.ts
git commit -m "feat(presentation): celebration tier scale and resolver"
```

---

### Task 3: Cue vocabulary and derivation

**Files:**
- Create: `lib/presentation/cues.ts`
- Create: `lib/presentation/deriveCues.ts`
- Test: `tests/deriveCues.test.ts`

**Interfaces:**
- Consumes: `CelebrationTier` from `lib/presentation/celebration.ts`; `Phase`, `QuestionPublic`, `RevealPayload`, `Standing` from `lib/types.ts`.
- Produces:
  - From `cues.ts`: the discriminated union `Cue`, `CueType = Cue['type']`, `CueOf<T extends CueType> = Extract<Cue, { type: T }>`, and the named variant interfaces.
  - From `deriveCues.ts`: `CueRoom`, `CuePlayer`, `CueSource`, `DerivationState`, `initialDerivationState`, `DeriveResult`, and `deriveCues(prev: CueSource, next: CueSource, state: DerivationState): DeriveResult`.

**Derivation rules fixed here (later tasks and phases depend on them):**

1. **Seeding.** The first snapshot that has a room seeds the accumulator (phase, round, player ids, standings baseline, empty streaks) and emits only the current phase beat — never standings drama, which has no baseline to diff against.
2. **Phase beats** fire when `phase` or `round` changes.
3. **Standings drama** (`player-advanced`, `overtake`, `lead-changed`, `streak-tier`, `streak-broken`) is derived **only on the transition into `reveal`**. That is the only phase where the server actually publishes new standings; `track` and `results` repeat them, so keying on `reveal` is what stops double-celebration.
4. **Streak inference** (spec §5, accepted limitation): a player's `correct` count incrementing between consecutive reveals is a hit; a non-increment breaks the streak. A missing baseline counts as `0`, so round 1 advancement is detected from a lobby seed. After a refresh or late join the accumulator restarts — a client can under-celebrate an in-progress streak, never over-celebrate.
5. `streak-broken` fires only when the broken streak had reached 3 (a visible VFX tier was active); shorter breaks are noise.
6. `overtake` / `lead-changed` need a previous order, so they never fire on the first reveal of a game.
7. **Naming deviation from the spec:** the spec calls the streak level `tier`, which collides with every cue's celebration `tier`. It is `streak: 3 | 5 | 8` here. Likewise `phase-read` carries the question's difficulty as `questionTier`.

- [ ] **Step 1: Write the failing test**

Create `tests/deriveCues.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CELEBRATION_TIERS, resolveTier } from '@/lib/presentation/celebration';
import {
  deriveCues,
  initialDerivationState,
  type CueSource,
  type DerivationState,
} from '@/lib/presentation/deriveCues';
import type { Cue } from '@/lib/presentation/cues';
import type { Phase, Standing } from '@/lib/types';

const A = 'player-a';
const B = 'player-b';
const C = 'player-c';

function player(id: string) {
  return { id, nickname: id.toUpperCase(), avatar: 'duck', color: '#f59e0b' };
}

function standing(id: string, correct: number, speed = 0, streak = 0): Standing {
  return {
    player_id: id,
    nickname: id.toUpperCase(),
    avatar: 'duck',
    color: '#f59e0b',
    correct,
    speed_points: speed,
    longest_streak: streak,
  };
}

function source(over: Partial<CueSource> & { phase?: Phase; round?: number } = {}): CueSource {
  const { phase = 'lobby', round = 0, ...rest } = over;
  return {
    room: { phase, round, total_rounds: 3, ends_at: null },
    players: [player(A), player(B)],
    question: null,
    reveal: null,
    standings: null,
    myAnswer: null,
    ...rest,
  };
}

/** Feed a recorded sequence of snapshots through the deriver, one step at a time. */
function run(steps: CueSource[]): { batches: Cue[][]; state: DerivationState } {
  let state = initialDerivationState;
  const batches: Cue[][] = [];
  for (let i = 0; i < steps.length; i++) {
    const result = deriveCues(i === 0 ? steps[0] : steps[i - 1], steps[i], state);
    state = result.nextState;
    batches.push(result.cues);
  }
  return { batches, state };
}

const types = (cues: Cue[]) => cues.map(c => c.type);

describe('seeding', () => {
  it('emits only the current phase beat on the first snapshot', () => {
    const { batches } = run([source({ phase: 'countdown', round: 1 })]);
    expect(types(batches[0])).toEqual(['phase-countdown']);
  });

  it('emits nothing at all until a room exists', () => {
    const empty: CueSource = { ...source(), room: null };
    const { batches } = run([empty, empty]);
    expect(batches.flat()).toEqual([]);
  });

  it('seeding mid-game does not invent standings drama', () => {
    const mid = source({
      phase: 'reveal',
      round: 2,
      standings: [standing(A, 2), standing(B, 1)],
    });
    const { batches } = run([mid]);
    expect(types(batches[0])).toEqual(['phase-reveal']);
  });
});

describe('phase beats', () => {
  it('walks lobby -> countdown -> read -> answer -> reveal -> track', () => {
    const { batches } = run([
      source(),
      source({ phase: 'countdown', round: 1 }),
      source({
        phase: 'read',
        round: 1,
        question: { category: 'fuel', tier: 2, prompt: 'Q?', options: ['a', 'b', 'c', 'd'] },
      }),
      source({ phase: 'answer', round: 1 }),
      source({
        phase: 'reveal',
        round: 1,
        reveal: {
          correct_index: 2,
          fun_fact: null,
          counts: [1, 0, 1, 0],
          fastest: { player_id: A, nickname: 'A', time_remaining_ms: 3200 },
          standings: [],
        },
        standings: [standing(A, 1), standing(B, 0)],
      }),
      source({ phase: 'track', round: 1, standings: [standing(A, 1), standing(B, 0)] }),
    ]);

    expect(batches.map(types)).toEqual([
      [],
      ['phase-countdown'],
      ['phase-read'],
      ['phase-answer'],
      ['phase-reveal', 'player-advanced'],
      ['phase-track'],
    ]);
  });

  it('phase-read carries round, category, question tier and isFinal', () => {
    const { batches } = run([
      source({ phase: 'countdown', round: 1 }),
      source({
        phase: 'read',
        round: 1,
        question: { category: 'ai-tech', tier: 3, prompt: 'Q?', options: ['a', 'b', 'c', 'd'] },
      }),
    ]);
    expect(batches[1][0]).toEqual({
      type: 'phase-read',
      tier: 'routine',
      round: 1,
      category: 'ai-tech',
      questionTier: 3,
      isFinal: false,
    });
  });

  it('the last round also emits final-question at the finalQuestion tier', () => {
    const { batches } = run([
      source({ phase: 'track', round: 2 }),
      source({
        phase: 'read',
        round: 3,
        question: { category: 'fuel', tier: 4, prompt: 'Q?', options: ['a', 'b', 'c', 'd'] },
      }),
    ]);
    expect(types(batches[1])).toEqual(['phase-read', 'final-question']);
    expect(batches[1][0]).toMatchObject({ isFinal: true });
    expect(batches[1][1]).toEqual({ type: 'final-question', tier: 'finalQuestion', round: 3 });
  });

  it('phase-reveal maps the reveal payload into cue shape', () => {
    const { batches } = run([
      source({ phase: 'answer', round: 1 }),
      source({
        phase: 'reveal',
        round: 1,
        reveal: {
          correct_index: 1,
          fun_fact: 'fact',
          counts: [0, 2, 0, 0],
          fastest: { player_id: B, nickname: 'B', time_remaining_ms: 4100 },
          standings: [],
        },
        standings: [standing(A, 1), standing(B, 1)],
      }),
    ]);
    expect(batches[1][0]).toEqual({
      type: 'phase-reveal',
      tier: 'routine',
      round: 1,
      correctIndex: 1,
      counts: [0, 2, 0, 0],
      fastest: { playerId: B, nickname: 'B', timeRemainingMs: 4100 },
    });
  });

  it('results emits the results beat plus a victory-tier podium of the top three', () => {
    const finalStandings = [standing(A, 3), standing(B, 2), standing(C, 1), standing('d', 0)];
    const { batches } = run([
      source({ phase: 'track', round: 3, standings: finalStandings }),
      source({ phase: 'results', round: 3, standings: finalStandings }),
    ]);
    expect(types(batches[1])).toEqual(['phase-results', 'podium']);
    expect(batches[1][1]).toMatchObject({
      tier: 'victory',
      top: [
        { playerId: A, correct: 3 },
        { playerId: B, correct: 2 },
        { playerId: C, correct: 1 },
      ],
    });
  });
});

describe('standings drama', () => {
  const reveal = (round: number, standings: Standing[]) =>
    source({ phase: 'reveal', round, standings });
  const track = (round: number, standings: Standing[]) =>
    source({ phase: 'track', round, standings });

  it('reports advancement as from -> to segments', () => {
    const { batches } = run([
      track(1, [standing(A, 1), standing(B, 1)]),
      reveal(2, [standing(A, 2), standing(B, 1)]),
    ]);
    expect(batches[1]).toContainEqual({
      type: 'player-advanced',
      tier: 'routine',
      playerId: A,
      from: 1,
      to: 2,
    });
    expect(batches[1].filter(c => c.type === 'player-advanced')).toHaveLength(1);
  });

  it('does not re-derive drama on track or results (no double celebration)', () => {
    const after = [standing(A, 2), standing(B, 1)];
    const { batches } = run([
      track(1, [standing(A, 1), standing(B, 1)]),
      reveal(2, after),
      track(2, after),
      source({ phase: 'results', round: 2, standings: after }),
    ]);
    expect(types(batches[2])).toEqual(['phase-track']);
    expect(types(batches[3])).toEqual(['phase-results', 'podium']);
  });

  it('emits overtake with the players that were passed', () => {
    const { batches } = run([
      reveal(1, [standing(A, 1), standing(B, 0), standing(C, 0)]),
      reveal(2, [standing(B, 1), standing(C, 1), standing(A, 1)]),
    ]);
    const overtakes = batches[1].filter(c => c.type === 'overtake');
    expect(overtakes).toContainEqual({ type: 'overtake', tier: 'overtake', playerId: B, passed: [A] });
    expect(overtakes).toContainEqual({ type: 'overtake', tier: 'overtake', playerId: C, passed: [A] });
    expect(overtakes).toHaveLength(2);
  });

  it('emits lead-changed when the top of the order changes', () => {
    const { batches } = run([
      reveal(1, [standing(A, 1), standing(B, 0)]),
      reveal(2, [standing(B, 1), standing(A, 1)]),
    ]);
    expect(batches[1]).toContainEqual({
      type: 'lead-changed',
      tier: 'overtake',
      playerId: B,
      previousLeaderId: A,
    });
  });

  it('never emits overtake or lead-changed on the first reveal of a game', () => {
    const { batches } = run([
      source({ phase: 'countdown', round: 1 }),
      reveal(1, [standing(A, 1), standing(B, 0)]),
    ]);
    expect(types(batches[1])).toEqual(['phase-reveal', 'player-advanced']);
  });
});

describe('streak inference', () => {
  const reveal = (round: number, standings: Standing[]) =>
    source({ phase: 'reveal', round, standings });

  it('fires streak-tier at 3, 5 and 8 consecutive hits and nowhere else', () => {
    const steps = [source({ phase: 'countdown', round: 1 })];
    for (let round = 1; round <= 8; round++) {
      steps.push(reveal(round, [standing(A, round), standing(B, 0)]));
    }
    const { batches } = run(steps);
    const milestones = batches
      .flat()
      .filter(c => c.type === 'streak-tier')
      .map(c => (c.type === 'streak-tier' ? c.streak : null));
    expect(milestones).toEqual([3, 5, 8]);
  });

  it('breaks the streak when a player does not advance, and only announces breaks from 3+', () => {
    const { batches } = run([
      source({ phase: 'countdown', round: 1 }),
      reveal(1, [standing(A, 1), standing(B, 1)]),
      reveal(2, [standing(A, 2), standing(B, 1)]), // B misses at streak 1 -> silent
      reveal(3, [standing(A, 3), standing(B, 1)]),
      reveal(4, [standing(A, 3), standing(B, 2)]), // A misses at streak 3 -> announced
    ]);
    expect(batches[2].filter(c => c.type === 'streak-broken')).toEqual([]);
    expect(batches[3]).toContainEqual({ type: 'streak-tier', tier: 'streakMilestone', playerId: A, streak: 3 });
    expect(batches[4]).toContainEqual({ type: 'streak-broken', tier: 'routine', playerId: A });
  });

  it('restarts counting after a broken streak', () => {
    const steps = [
      source({ phase: 'countdown', round: 1 }),
      reveal(1, [standing(A, 1)]),
      reveal(2, [standing(A, 2)]),
      reveal(3, [standing(A, 2)]), // break at 2
      reveal(4, [standing(A, 3)]),
      reveal(5, [standing(A, 4)]),
      reveal(6, [standing(A, 5)]),
    ];
    const { batches } = run(steps);
    const milestones = batches.flat().filter(c => c.type === 'streak-tier');
    expect(milestones).toHaveLength(1);
    expect(milestones[0]).toMatchObject({ streak: 3 });
  });
});

describe('local and lobby cues', () => {
  it('emits answer-locked when this client locks its own submission', () => {
    const answering = source({ phase: 'answer', round: 1 });
    const { batches } = run([answering, { ...answering, myAnswer: 2 }]);
    expect(batches[1]).toEqual([{ type: 'answer-locked', tier: 'routine', choiceIndex: 2 }]);
  });

  it('emits player-joined for each new player and never repeats one', () => {
    const lobby = source();
    const joined: CueSource = { ...lobby, players: [...lobby.players, player(C)] };
    const { batches } = run([lobby, joined, joined]);
    expect(batches[1]).toEqual([
      { type: 'player-joined', tier: 'routine', playerId: C, nickname: 'PLAYER-C', avatar: 'duck', color: '#f59e0b' },
    ]);
    expect(batches[2]).toEqual([]);
  });
});

describe('a full recorded game', () => {
  it('produces the expected cue stream from lobby to podium', () => {
    const q = { category: 'fuel', tier: 1 as const, prompt: 'Q?', options: ['a', 'b', 'c', 'd'] };
    const s1 = [standing(A, 1), standing(B, 0)];
    const s2 = [standing(B, 2), standing(A, 1)];
    const s3 = [standing(B, 3), standing(A, 2)];

    const { batches } = run([
      source(),
      { ...source(), players: [player(A), player(B), player(C)] },
      source({ phase: 'countdown', round: 1 }),
      source({ phase: 'read', round: 1, question: q }),
      source({ phase: 'answer', round: 1 }),
      source({ phase: 'reveal', round: 1, standings: s1 }),
      source({ phase: 'track', round: 1, standings: s1 }),
      source({ phase: 'read', round: 2, question: q, standings: s1 }),
      source({ phase: 'answer', round: 2, standings: s1 }),
      source({ phase: 'reveal', round: 2, standings: s2 }),
      source({ phase: 'track', round: 2, standings: s2 }),
      source({ phase: 'read', round: 3, question: q, standings: s2 }),
      source({ phase: 'answer', round: 3, standings: s2 }),
      source({ phase: 'reveal', round: 3, standings: s3 }),
      source({ phase: 'track', round: 3, standings: s3 }),
      source({ phase: 'results', round: 3, standings: s3 }),
    ]);

    expect(batches.map(types)).toEqual([
      [],
      ['player-joined'],
      ['phase-countdown'],
      ['phase-read'],
      ['phase-answer'],
      ['phase-reveal', 'player-advanced'],
      ['phase-track'],
      ['phase-read'],
      ['phase-answer'],
      ['phase-reveal', 'player-advanced', 'overtake', 'lead-changed'],
      ['phase-track'],
      ['phase-read', 'final-question'],
      ['phase-answer'],
      ['phase-reveal', 'player-advanced', 'player-advanced'],
      ['phase-track'],
      ['phase-results', 'podium'],
    ]);
  });

  it('every emitted cue carries a valid celebration tier', () => {
    const { batches } = run([
      source({ phase: 'countdown', round: 1 }),
      source({ phase: 'reveal', round: 1, standings: [standing(A, 1), standing(B, 0)] }),
      source({ phase: 'reveal', round: 2, standings: [standing(B, 2), standing(A, 1)] }),
    ]);
    for (const cue of batches.flat()) {
      expect(CELEBRATION_TIERS).toContain(cue.tier);
    }
    expect(resolveTier(batches[2])).toBe('overtake');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/deriveCues.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/presentation/deriveCues"`.

- [ ] **Step 3: Write the cue vocabulary**

Create `lib/presentation/cues.ts`:

```ts
/**
 * The complete M2 presentation-cue vocabulary (spec §5).
 *
 * This is the single seam between game state and the show: Pixi (P1+),
 * `motion`-driven UI (P3) and Howler (P4) subscribe to these cues and to
 * nothing else. Later phases consume this vocabulary; they never redefine it.
 *
 * Every variant carries its celebration tier as a literal, so the compiler
 * enforces the hierarchy at construction time.
 */

/* ── Phase beats ─────────────────────────────────────────────────────────── */

export interface PhaseCountdownCue {
  type: 'phase-countdown';
  tier: 'routine';
  endsAt: string | null;
}

export interface PhaseReadCue {
  type: 'phase-read';
  tier: 'routine';
  round: number;
  category: string | null;
  /** Question difficulty 1-4 (named to avoid colliding with the celebration tier). */
  questionTier: 1 | 2 | 3 | 4 | null;
  isFinal: boolean;
}

export interface PhaseAnswerCue {
  type: 'phase-answer';
  tier: 'routine';
  round: number;
  endsAt: string | null;
}

export interface PhaseRevealCue {
  type: 'phase-reveal';
  tier: 'routine';
  round: number;
  correctIndex: number | null;
  counts: number[];
  fastest: { playerId: string; nickname: string; timeRemainingMs: number } | null;
}

export interface PhaseTrackCue {
  type: 'phase-track';
  tier: 'routine';
  round: number;
}

export interface PhaseResultsCue {
  type: 'phase-results';
  tier: 'routine';
}

/* ── Standings drama ─────────────────────────────────────────────────────── */

export interface PlayerAdvancedCue {
  type: 'player-advanced';
  tier: 'routine';
  playerId: string;
  /** Track segment before and after this reveal (== correct-answer count). */
  from: number;
  to: number;
}

export interface OvertakeCue {
  type: 'overtake';
  tier: 'overtake';
  playerId: string;
  /** Players this one moved ahead of in the standings order. */
  passed: string[];
}

export interface LeadChangedCue {
  type: 'lead-changed';
  tier: 'overtake';
  playerId: string;
  previousLeaderId: string;
}

/* ── Streaks ─────────────────────────────────────────────────────────────── */

export interface StreakTierCue {
  type: 'streak-tier';
  tier: 'streakMilestone';
  playerId: string;
  /** Consecutive-hit milestone: 3 spark trail, 5 flames, 8 inferno. */
  streak: 3 | 5 | 8;
}

export interface StreakBrokenCue {
  type: 'streak-broken';
  tier: 'routine';
  playerId: string;
}

/* ── Escalation ──────────────────────────────────────────────────────────── */

export interface FinalQuestionCue {
  type: 'final-question';
  tier: 'finalQuestion';
  round: number;
}

/* ── Local-only ──────────────────────────────────────────────────────────── */

export interface AnswerLockedCue {
  type: 'answer-locked';
  tier: 'routine';
  choiceIndex: number;
}

/* ── Lobby / ceremony ────────────────────────────────────────────────────── */

export interface PlayerJoinedCue {
  type: 'player-joined';
  tier: 'routine';
  playerId: string;
  nickname: string;
  avatar: string;
  color: string;
}

export interface PodiumPlace {
  playerId: string;
  nickname: string;
  avatar: string;
  color: string;
  correct: number;
}

export interface PodiumCue {
  type: 'podium';
  tier: 'victory';
  top: PodiumPlace[];
}

/* ── Union ───────────────────────────────────────────────────────────────── */

export type Cue =
  | PhaseCountdownCue
  | PhaseReadCue
  | PhaseAnswerCue
  | PhaseRevealCue
  | PhaseTrackCue
  | PhaseResultsCue
  | PlayerAdvancedCue
  | OvertakeCue
  | LeadChangedCue
  | StreakTierCue
  | StreakBrokenCue
  | FinalQuestionCue
  | AnswerLockedCue
  | PlayerJoinedCue
  | PodiumCue;

export type CueType = Cue['type'];

export type CueOf<T extends CueType> = Extract<Cue, { type: T }>;
```

- [ ] **Step 4: Write the derivation**

Create `lib/presentation/deriveCues.ts`:

```ts
import type { Phase, QuestionPublic, RevealPayload, Standing } from '@/lib/types';
import type { Cue } from './cues';

/**
 * Pure derivation of presentation cues from consecutive game-store snapshots.
 *
 * Game-state code is untouched (spec decision 5): this reads structural subsets
 * of the store and returns an updated accumulator the caller threads through.
 */

/** Structural subset of RoomInfo this deriver needs. */
export interface CueRoom {
  phase: Phase;
  round: number;
  total_rounds: number;
  ends_at: string | null;
}

/** Structural subset of PlayerPublic this deriver needs. */
export interface CuePlayer {
  id: string;
  nickname: string;
  avatar: string;
  color: string;
}

/** Structural subset of the game store; `GameState` is assignable to it. */
export interface CueSource {
  room: CueRoom | null;
  players: CuePlayer[];
  question: QuestionPublic | null;
  reveal: RevealPayload | null;
  standings: Standing[] | null;
  myAnswer: number | null;
}

/**
 * Accumulator carried between calls. Presentation-local only — it is never
 * persisted and never sent over the wire.
 */
export interface DerivationState {
  seeded: boolean;
  phase: Phase | null;
  round: number;
  playerIds: string[];
  /** Standings order as of the last processed reveal. */
  order: string[];
  /** Correct-answer count per player as of the last processed reveal. */
  correct: Record<string, number>;
  /** Inferred consecutive-hit count per player. */
  streaks: Record<string, number>;
}

export const initialDerivationState: DerivationState = {
  seeded: false,
  phase: null,
  round: 0,
  playerIds: [],
  order: [],
  correct: {},
  streaks: {},
};

export interface DeriveResult {
  cues: Cue[];
  nextState: DerivationState;
}

export function deriveCues(
  prev: CueSource,
  next: CueSource,
  state: DerivationState,
): DeriveResult {
  const room = next.room;
  if (!room) return { cues: [], nextState: state };

  // First snapshot with a room: establish the baseline, announce the current
  // beat (so a reload lands in the right visual state), derive nothing else.
  if (!state.seeded) {
    return {
      cues: phaseCues(room, next),
      nextState: {
        seeded: true,
        phase: room.phase,
        round: room.round,
        playerIds: next.players.map(p => p.id),
        order: (next.standings ?? []).map(s => s.player_id),
        correct: correctMap(next.standings),
        streaks: {},
      },
    };
  }

  const cues: Cue[] = [];
  let s = state;

  const nextIds = next.players.map(p => p.id);
  for (const p of next.players) {
    if (!s.playerIds.includes(p.id)) {
      cues.push({
        type: 'player-joined',
        tier: 'routine',
        playerId: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        color: p.color,
      });
    }
  }
  if (nextIds.join(',') !== s.playerIds.join(',')) s = { ...s, playerIds: nextIds };

  if (prev.myAnswer === null && next.myAnswer !== null) {
    cues.push({ type: 'answer-locked', tier: 'routine', choiceIndex: next.myAnswer });
  }

  const phaseChanged = room.phase !== s.phase || room.round !== s.round;
  if (phaseChanged) {
    cues.push(...phaseCues(room, next));

    // Standings only genuinely change at the reveal; track and results repeat
    // them, so deriving drama anywhere else would double-celebrate.
    if (room.phase === 'reveal') {
      const drama = standingsCues(s, next.standings);
      cues.push(...drama.cues);
      s = drama.nextState;
    }

    s = { ...s, phase: room.phase, round: room.round };
  }

  return { cues, nextState: s };
}

function phaseCues(room: CueRoom, next: CueSource): Cue[] {
  const isFinal = room.total_rounds > 0 && room.round === room.total_rounds;

  switch (room.phase) {
    case 'countdown':
      return [{ type: 'phase-countdown', tier: 'routine', endsAt: room.ends_at }];

    case 'read': {
      const cues: Cue[] = [
        {
          type: 'phase-read',
          tier: 'routine',
          round: room.round,
          category: next.question?.category ?? null,
          questionTier: next.question?.tier ?? null,
          isFinal,
        },
      ];
      if (isFinal) cues.push({ type: 'final-question', tier: 'finalQuestion', round: room.round });
      return cues;
    }

    case 'answer':
      return [{ type: 'phase-answer', tier: 'routine', round: room.round, endsAt: room.ends_at }];

    case 'reveal': {
      const fastest = next.reveal?.fastest;
      return [
        {
          type: 'phase-reveal',
          tier: 'routine',
          round: room.round,
          correctIndex: next.reveal?.correct_index ?? null,
          counts: next.reveal?.counts ?? [],
          fastest: fastest
            ? {
                playerId: fastest.player_id,
                nickname: fastest.nickname,
                timeRemainingMs: fastest.time_remaining_ms,
              }
            : null,
        },
      ];
    }

    case 'track':
      return [{ type: 'phase-track', tier: 'routine', round: room.round }];

    case 'results':
      return [
        { type: 'phase-results', tier: 'routine' },
        {
          type: 'podium',
          tier: 'victory',
          top: (next.standings ?? []).slice(0, 3).map(s => ({
            playerId: s.player_id,
            nickname: s.nickname,
            avatar: s.avatar,
            color: s.color,
            correct: s.correct,
          })),
        },
      ];

    default:
      return []; // lobby has no beat of its own
  }
}

function standingsCues(state: DerivationState, standings: Standing[] | null): DeriveResult {
  if (!standings || standings.length === 0) return { cues: [], nextState: state };

  const cues: Cue[] = [];
  const order = standings.map(s => s.player_id);
  const correct: Record<string, number> = {};
  const streaks: Record<string, number> = {};

  for (const s of standings) {
    // A missing baseline means "not seen yet" — at game start everyone is on 0.
    const before = state.correct[s.player_id] ?? 0;
    correct[s.player_id] = s.correct;

    if (s.correct > before) {
      cues.push({
        type: 'player-advanced',
        tier: 'routine',
        playerId: s.player_id,
        from: before,
        to: s.correct,
      });

      const streak = (state.streaks[s.player_id] ?? 0) + 1;
      streaks[s.player_id] = streak;
      if (streak === 3 || streak === 5 || streak === 8) {
        cues.push({ type: 'streak-tier', tier: 'streakMilestone', playerId: s.player_id, streak });
      }
    } else {
      // Only announce a break that had reached a visible VFX tier.
      if ((state.streaks[s.player_id] ?? 0) >= 3) {
        cues.push({ type: 'streak-broken', tier: 'routine', playerId: s.player_id });
      }
      streaks[s.player_id] = 0;
    }
  }

  // Relative-order changes need a previous order, so nothing fires on the
  // first reveal of a game.
  if (state.order.length > 0) {
    const prevRank = rankMap(state.order);
    const nextRank = rankMap(order);

    for (const id of order) {
      const before = prevRank.get(id);
      const after = nextRank.get(id)!;
      if (before === undefined || after >= before) continue;

      const passed = order.filter(other => {
        const otherBefore = prevRank.get(other);
        const otherAfter = nextRank.get(other)!;
        return otherBefore !== undefined && otherBefore < before && otherAfter > after;
      });
      if (passed.length > 0) {
        cues.push({ type: 'overtake', tier: 'overtake', playerId: id, passed });
      }
    }

    const previousLeaderId = state.order[0];
    const leaderId = order[0];
    if (previousLeaderId && leaderId && previousLeaderId !== leaderId) {
      cues.push({ type: 'lead-changed', tier: 'overtake', playerId: leaderId, previousLeaderId });
    }
  }

  return { cues, nextState: { ...state, order, correct, streaks } };
}

function correctMap(standings: Standing[] | null): Record<string, number> {
  const map: Record<string, number> = {};
  for (const s of standings ?? []) map[s.player_id] = s.correct;
  return map;
}

function rankMap(order: string[]): Map<string, number> {
  return new Map(order.map((id, index) => [id, index]));
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/deriveCues.test.ts`
Expected: PASS — 20 tests.

- [ ] **Step 6: Type-check and lint**

```bash
npx tsc --noEmit
npm run lint
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/presentation/cues.ts lib/presentation/deriveCues.ts tests/deriveCues.test.ts
git commit -m "feat(presentation): M2 cue vocabulary and pure cue derivation"
```

---

### Task 4: Cue bus and store bridge

**Files:**
- Create: `lib/presentation/cueBus.ts`
- Modify: `app/room/[code]/page.tsx`
- Test: `tests/cueBus.test.ts`

**Interfaces:**
- Consumes: `Cue`, `CueType`, `CueOf` from `./cues`; `deriveCues`, `initialDerivationState`, `DerivationState`, `CueSource` from `./deriveCues`; `useGameStore` from `@/lib/store`.
- Produces: `on<T extends CueType>(type: T, handler: (cue: CueOf<T>) => void): () => void`; `emit(cue: Cue): void`; `clearCueBus(): void`; `startCueBridge(): () => void`.

- [ ] **Step 1: Write the failing test**

Create `tests/cueBus.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearCueBus, emit, on, startCueBridge } from '@/lib/presentation/cueBus';
import type { Cue } from '@/lib/presentation/cues';
import { useGameStore } from '@/lib/store';
import type { PhaseEvent, RoomState } from '@/lib/types';

const baseRoom = {
  id: 'r1',
  code: 'ABCDE',
  status: 'lobby' as const,
  phase: 'lobby' as const,
  round: 0,
  total_rounds: 2,
  timer_seconds: 10,
  ends_at: null,
  server_now: new Date().toISOString(),
};

const lobbyState: RoomState = {
  room: baseRoom,
  players: [
    { id: 'p1', nickname: 'A', avatar: 'duck', color: '#f59e0b', is_host: true, is_playing: true },
    { id: 'p2', nickname: 'B', avatar: 'cat', color: '#38bdf8', is_host: false, is_playing: true },
  ],
  question: null,
  reveal: null,
  standings: null,
};

beforeEach(() => {
  clearCueBus();
  useGameStore.setState({
    room: null, players: [], question: null, reveal: null, standings: null, myAnswer: null,
  });
});

afterEach(() => clearCueBus());

describe('cue bus', () => {
  it('delivers a cue only to handlers of that type', () => {
    const read = vi.fn();
    const track = vi.fn();
    on('phase-read', read);
    on('phase-track', track);

    const cue: Cue = {
      type: 'phase-read', tier: 'routine', round: 1, category: 'fuel', questionTier: 1, isFinal: false,
    };
    emit(cue);

    expect(read).toHaveBeenCalledWith(cue);
    expect(track).not.toHaveBeenCalled();
  });

  it('stops delivering after unsubscribe', () => {
    const handler = vi.fn();
    const off = on('phase-track', handler);
    emit({ type: 'phase-track', tier: 'routine', round: 1 });
    off();
    emit({ type: 'phase-track', tier: 'routine', round: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('unsubscribing during an emit does not skip the other handlers', () => {
    const calls: string[] = [];
    const offFirst = on('phase-track', () => {
      calls.push('first');
      offFirst();
    });
    on('phase-track', () => calls.push('second'));

    emit({ type: 'phase-track', tier: 'routine', round: 1 });
    expect(calls).toEqual(['first', 'second']);
  });
});

describe('startCueBridge', () => {
  it('emits cues derived from game-store transitions', () => {
    const seen: string[] = [];
    on('player-joined', () => seen.push('player-joined'));
    on('phase-countdown', () => seen.push('phase-countdown'));
    on('phase-reveal', () => seen.push('phase-reveal'));
    on('player-advanced', () => seen.push('player-advanced'));

    const stop = startCueBridge();

    useGameStore.getState().applyState(lobbyState);
    useGameStore.getState().addPlayer({
      id: 'p3', nickname: 'C', avatar: 'plant', color: '#34d399', is_host: false, is_playing: true,
    });

    const countdown: PhaseEvent = {
      phase: 'countdown', round: 1, ends_at: null, server_now: new Date().toISOString(), payload: null,
    };
    useGameStore.getState().applyPhaseEvent(countdown);

    const reveal: PhaseEvent = {
      phase: 'reveal', round: 1, ends_at: null, server_now: new Date().toISOString(),
      payload: {
        correct_index: 0, fun_fact: null, counts: [1, 0, 0, 0], fastest: null,
        standings: [
          { player_id: 'p1', nickname: 'A', avatar: 'duck', color: '#f59e0b', correct: 1, speed_points: 10, longest_streak: 1 },
          { player_id: 'p2', nickname: 'B', avatar: 'cat', color: '#38bdf8', correct: 0, speed_points: 0, longest_streak: 0 },
        ],
      },
    };
    useGameStore.getState().applyPhaseEvent(reveal);

    stop();
    expect(seen).toEqual(['player-joined', 'phase-countdown', 'phase-reveal', 'player-advanced']);
  });

  it('stops emitting after teardown', () => {
    const handler = vi.fn();
    on('phase-countdown', handler);
    const stop = startCueBridge();
    useGameStore.getState().applyState(lobbyState);
    stop();

    useGameStore.getState().applyPhaseEvent({
      phase: 'countdown', round: 1, ends_at: null, server_now: new Date().toISOString(), payload: null,
    });
    expect(handler).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/cueBus.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/presentation/cueBus"`.

- [ ] **Step 3: Write the bus and bridge**

Create `lib/presentation/cueBus.ts`:

```ts
import { useGameStore } from '@/lib/store';
import type { Cue, CueOf, CueType } from './cues';
import { deriveCues, initialDerivationState, type CueSource, type DerivationState } from './deriveCues';

/**
 * The presentation-event bus: a ~30-line typed emitter, no dependency.
 *
 * Pixi (P1+), `motion`-driven UI (P3) and Howler (P4) subscribe here and
 * nowhere else. Deliberately framework-free so it is unit-testable in Node.
 */

type AnyHandler = (cue: Cue) => void;

const handlers = new Map<CueType, Set<AnyHandler>>();

/** Subscribe to one cue type. Returns an unsubscribe function. */
export function on<T extends CueType>(type: T, handler: (cue: CueOf<T>) => void): () => void {
  const set = handlers.get(type) ?? new Set<AnyHandler>();
  handlers.set(type, set);
  const wrapped = handler as AnyHandler;
  set.add(wrapped);
  return () => {
    set.delete(wrapped);
  };
}

/** Deliver a cue to its subscribers. Safe to unsubscribe from inside a handler. */
export function emit(cue: Cue): void {
  const set = handlers.get(cue.type);
  if (!set || set.size === 0) return;
  for (const handler of [...set]) handler(cue);
}

/** Drop every subscription. Tests only. */
export function clearCueBus(): void {
  handlers.clear();
}

/**
 * Subscribe to the game store, run the pure deriver on every change and emit
 * the resulting cues. Mounted once, in the room page. Returns a teardown.
 */
export function startCueBridge(): () => void {
  let state: DerivationState = initialDerivationState;

  const step = (prev: CueSource, next: CueSource) => {
    const result = deriveCues(prev, next, state);
    state = result.nextState;
    for (const cue of result.cues) {
      if (process.env.NODE_ENV === 'development') console.debug('[cue]', cue.type, cue);
      emit(cue);
    }
  };

  // Seed from whatever the store already holds (e.g. a mid-game reload).
  const current = useGameStore.getState();
  step(current, current);

  return useGameStore.subscribe((next, prev) => step(prev, next));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/cueBus.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Mount the bridge in the room page**

The bridge lives for the lifetime of the room route. Add the import and the effect to `app/room/[code]/page.tsx` — all hooks stay above the early returns:

```tsx
import { startCueBridge } from '@/lib/presentation/cueBus';
```

and, immediately after the `const isHost = …` line:

```tsx
  useEffect(() => startCueBridge(), []);
```

(React Strict Mode double-mounts in dev: the bridge is torn down and restarted, which resets the derivation accumulator and may re-announce the current phase beat. Harmless — cues are idempotent presentation triggers.)

- [ ] **Step 6: Verify the bridge runs in a real game**

With Supabase and the dev server up, open two browser contexts, create a room, and play a round with the console open.
Expected: `[cue] phase-countdown`, `[cue] phase-read`, `[cue] phase-answer`, `[cue] answer-locked`, `[cue] phase-reveal`, `[cue] player-advanced`, `[cue] phase-track`, and on the last round `[cue] final-question`, ending with `[cue] phase-results` and `[cue] podium`.

- [ ] **Step 7: Run the full check**

```bash
npm test
npm run lint
npx tsc --noEmit
```
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add lib/presentation/cueBus.ts tests/cueBus.test.ts app/room/[code]/page.tsx
git commit -m "feat(presentation): typed cue bus and game-store bridge"
```

---

### Task 5: Performance profiles, settings store, motion provider

**Files:**
- Create: `lib/presentation/profile.ts`
- Create: `lib/useSettings.ts`
- Create: `components/MotionProvider.tsx`
- Modify: `app/layout.tsx`
- Test: `tests/profile.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `profile.ts`: `type Profile = 'high' | 'reduced'`; `type ProfileOverride = 'auto' | 'high' | 'reduced'`; `interface DeviceSignals { prefersReducedMotion: boolean; deviceMemory: number | null; hardwareConcurrency: number | null; coarsePointer: boolean; narrowViewport: boolean }`; `PROFILE_STORAGE_KEY = 'cb:settings:profile'`; `resolveProfile(signals: DeviceSignals, override: ProfileOverride): Profile`; `readDeviceSignals(): DeviceSignals`; `loadOverride(): ProfileOverride`; `saveOverride(value: ProfileOverride): void`.
  - `useSettings.ts`: `useSettings` Zustand store with `{ hydrated: boolean; override: ProfileOverride; profile: Profile; hydrate(): void; setOverride(value: ProfileOverride): void }`. Later phases read exactly one value: `useSettings(s => s.profile)`.

- [ ] **Step 1: Write the failing test**

Create `tests/profile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  PROFILE_STORAGE_KEY,
  resolveProfile,
  type DeviceSignals,
} from '@/lib/presentation/profile';

const capable: DeviceSignals = {
  prefersReducedMotion: false,
  deviceMemory: 8,
  hardwareConcurrency: 8,
  coarsePointer: false,
  narrowViewport: false,
};

const signals = (over: Partial<DeviceSignals>): DeviceSignals => ({ ...capable, ...over });

describe('resolveProfile — automatic heuristic', () => {
  it('a capable device gets the high profile', () => {
    expect(resolveProfile(capable, 'auto')).toBe('high');
  });

  it('prefers-reduced-motion forces the reduced profile', () => {
    expect(resolveProfile(signals({ prefersReducedMotion: true }), 'auto')).toBe('reduced');
  });

  it('less than 4GB of device memory leans reduced', () => {
    expect(resolveProfile(signals({ deviceMemory: 2 }), 'auto')).toBe('reduced');
    expect(resolveProfile(signals({ deviceMemory: 4 }), 'auto')).toBe('high');
  });

  it('fewer than 4 logical cores leans reduced', () => {
    expect(resolveProfile(signals({ hardwareConcurrency: 2 }), 'auto')).toBe('reduced');
    expect(resolveProfile(signals({ hardwareConcurrency: 4 }), 'auto')).toBe('high');
  });

  it('a coarse pointer alone is not enough — it must come with a narrow viewport', () => {
    expect(resolveProfile(signals({ coarsePointer: true }), 'auto')).toBe('high');
    expect(resolveProfile(signals({ narrowViewport: true }), 'auto')).toBe('high');
    expect(resolveProfile(signals({ coarsePointer: true, narrowViewport: true }), 'auto')).toBe('reduced');
  });

  it('unknown capability signals are not treated as weak', () => {
    expect(resolveProfile(signals({ deviceMemory: null, hardwareConcurrency: null }), 'auto')).toBe('high');
  });
});

describe('resolveProfile — manual override precedence', () => {
  it('an explicit high override beats every reduced-leaning signal, including reduced-motion', () => {
    const weak = signals({
      prefersReducedMotion: true,
      deviceMemory: 1,
      hardwareConcurrency: 2,
      coarsePointer: true,
      narrowViewport: true,
    });
    expect(resolveProfile(weak, 'high')).toBe('high');
  });

  it('an explicit reduced override beats a capable device', () => {
    expect(resolveProfile(capable, 'reduced')).toBe('reduced');
  });
});

describe('persistence key', () => {
  it('uses the project localStorage prefix', () => {
    expect(PROFILE_STORAGE_KEY).toBe('cb:settings:profile');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/profile.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/presentation/profile"`.

- [ ] **Step 3: Write the profile module**

Create `lib/presentation/profile.ts`:

```ts
/**
 * Performance profiles (spec §6, PRD §9).
 *
 * `resolveProfile` is pure and unit-tested. Everything below it touches the
 * browser and is deliberately not unit-tested — a static startup heuristic,
 * no runtime FPS watchdog in P0.
 */

export type Profile = 'high' | 'reduced';
export type ProfileOverride = 'auto' | 'high' | 'reduced';

export interface DeviceSignals {
  prefersReducedMotion: boolean;
  /** navigator.deviceMemory in GB, or null when unreported. */
  deviceMemory: number | null;
  /** navigator.hardwareConcurrency, or null when unreported. */
  hardwareConcurrency: number | null;
  coarsePointer: boolean;
  narrowViewport: boolean;
}

export const PROFILE_STORAGE_KEY = 'cb:settings:profile';

/** Viewport width below which a coarse pointer means "phone", not "touchscreen laptop". */
const NARROW_VIEWPORT_PX = 768;

/**
 * Precedence: an explicit manual override wins over everything, including
 * prefers-reduced-motion; otherwise reduced-motion forces `reduced`; otherwise
 * any reduced-leaning capability signal wins.
 */
export function resolveProfile(signals: DeviceSignals, override: ProfileOverride): Profile {
  if (override === 'high') return 'high';
  if (override === 'reduced') return 'reduced';

  if (signals.prefersReducedMotion) return 'reduced';
  if (signals.deviceMemory !== null && signals.deviceMemory < 4) return 'reduced';
  if (signals.hardwareConcurrency !== null && signals.hardwareConcurrency < 4) return 'reduced';
  if (signals.coarsePointer && signals.narrowViewport) return 'reduced';

  return 'high';
}

/** Browser-only. Gathered once at startup. */
export function readDeviceSignals(): DeviceSignals {
  if (typeof window === 'undefined') {
    return {
      prefersReducedMotion: false,
      deviceMemory: null,
      hardwareConcurrency: null,
      coarsePointer: false,
      narrowViewport: false,
    };
  }

  // deviceMemory is not in lib.dom yet and is absent on Safari/Firefox.
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;

  return {
    prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    deviceMemory: typeof memory === 'number' ? memory : null,
    hardwareConcurrency:
      typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    narrowViewport: window.innerWidth < NARROW_VIEWPORT_PX,
  };
}

/** Browser-only. Never throws — private-mode storage failures fall back to `auto`. */
export function loadOverride(): ProfileOverride {
  if (typeof window === 'undefined') return 'auto';
  try {
    const stored = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    return stored === 'high' || stored === 'reduced' || stored === 'auto' ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

/** Browser-only. Never throws. */
export function saveOverride(value: ProfileOverride): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, value);
  } catch {
    // Storage unavailable (private mode); the choice simply won't persist.
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/profile.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Write the settings store**

Presentation settings live in their own store so they never mix with game state (spec §6).

Create `lib/useSettings.ts`:

```ts
import { create } from 'zustand';
import {
  loadOverride,
  readDeviceSignals,
  resolveProfile,
  saveOverride,
  type Profile,
  type ProfileOverride,
} from './presentation/profile';

export interface SettingsState {
  /** False until the client has read localStorage and the device signals. */
  hydrated: boolean;
  override: ProfileOverride;
  /** The effective profile. Later phases read exactly this: useSettings(s => s.profile). */
  profile: Profile;
  hydrate(): void;
  setOverride(value: ProfileOverride): void;
}

/** Publish the profile to CSS so stylesheets can respond without a React render. */
function publish(profile: Profile): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.profile = profile;
}

export const useSettings = create<SettingsState>((set, get) => ({
  // SSR-safe defaults; the real values land in hydrate().
  hydrated: false,
  override: 'auto',
  profile: 'high',

  hydrate() {
    if (get().hydrated) return;
    const override = loadOverride();
    const profile = resolveProfile(readDeviceSignals(), override);
    publish(profile);
    set({ hydrated: true, override, profile });
  },

  setOverride(value) {
    saveOverride(value);
    const profile = resolveProfile(readDeviceSignals(), value);
    publish(profile);
    set({ override: value, profile });
  },
}));
```

- [ ] **Step 6: Write the motion provider**

Create `components/MotionProvider.tsx`:

```tsx
'use client';
import { useEffect } from 'react';
import { MotionConfig } from 'motion/react';
import { useSettings } from '@/lib/useSettings';

/**
 * The single hydration seam for presentation settings.
 *
 * Runs after mount (never during render) so the server-rendered HTML and the
 * first client render agree, then publishes the effective profile to CSS via
 * `data-profile` on <html> and to `motion` via MotionConfig.
 *
 * `reducedMotion="never"` in the high profile is deliberate: an explicit manual
 * override beats prefers-reduced-motion (spec §6), and by the time the profile
 * says "high", that precedence has already been applied.
 */
export default function MotionProvider({ children }: { children: React.ReactNode }) {
  const hydrate = useSettings(s => s.hydrate);
  const profile = useSettings(s => s.profile);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <MotionConfig reducedMotion={profile === 'reduced' ? 'always' : 'never'}>
      {children}
    </MotionConfig>
  );
}
```

- [ ] **Step 7: Wrap the app**

In `app/layout.tsx`, add the import and wrap `children`:

```tsx
import MotionProvider from '@/components/MotionProvider';
```

```tsx
      <body className="min-h-screen antialiased">
        <MotionProvider>{children}</MotionProvider>
      </body>
```

- [ ] **Step 8: Verify hydration and the CSS handoff**

```bash
npm run build
npm test
npm run lint
```
Expected: build succeeds with no hydration warnings; all suites pass; lint clean.

With the dev server running, open `http://localhost:3000/` and check in DevTools that `<html>` carries `data-profile="high"` (or `"reduced"` if your OS has reduce-motion on). Toggle the OS reduce-motion setting, reload, and confirm the attribute flips.

- [ ] **Step 9: Commit**

```bash
git add lib/presentation/profile.ts lib/useSettings.ts components/MotionProvider.tsx app/layout.tsx tests/profile.test.ts
git commit -m "feat(presentation): performance profiles, settings store, motion provider"
```

---

### Task 6: Glass UI primitives and the settings control

**Files:**
- Create: `components/ui/Panel.tsx`, `components/ui/Button.tsx`, `components/ui/Input.tsx`, `components/ui/Select.tsx`
- Create: `components/SettingsControl.tsx`
- Modify: `app/room/[code]/page.tsx`
- Test: `e2e/settings.spec.ts`

**Interfaces:**
- Consumes: tokens from Task 1; `useSettings` from Task 5.
- Produces:
  - `Panel(props: React.ComponentProps<'div'>)` — translucent indigo surface, backdrop blur, hairline border.
  - `Button(props: React.ComponentProps<'button'> & { variant?: 'primary' | 'ghost' | 'quiet'; size?: 'md' | 'lg' })`.
  - `Input(props: React.ComponentProps<'input'>)`.
  - `Select(props: Omit<React.ComponentProps<'select'>, 'children'> & { label: string; options: readonly { value: string; label: string }[] })` — renders an associated `<label>`, so `page.getByLabel(label)` finds it.
  - `SettingsControl()` — fixed corner gear; button accessible name **`Display settings`**; popover contains the `Select` labelled **`Motion`** with options `auto` → `Auto`, `high` → `Full motion`, `reduced` → `Reduced motion`.

These primitives are the vocabulary every later M2 phase reuses; P4 adds its mute toggle inside `SettingsControl`.

- [ ] **Step 1: Write the failing e2e test**

`/room/ZZZZZ` is a room that does not exist: the page renders the join gate (as `e2e/join.spec.ts` already relies on), which is enough to exercise the settings control without a live game.

Create `e2e/settings.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('performance profile settings', () => {
  // Deliberately does not assert 'high': hardwareConcurrency / deviceMemory vary by
  // machine, and the two override tests below carry the semantics.
  test('publishes an effective profile to CSS on hydration', async ({ page }) => {
    await page.goto('/room/ZZZZZ');
    await expect(page.locator('html')).toHaveAttribute('data-profile', /^(high|reduced)$/);
  });

  test('choosing reduced motion applies immediately and survives a reload', async ({ page }) => {
    await page.goto('/room/ZZZZZ');
    await page.getByRole('button', { name: 'Display settings' }).click();
    await page.getByLabel('Motion').selectOption('reduced');
    await expect(page.locator('html')).toHaveAttribute('data-profile', 'reduced');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-profile', 'reduced');

    await page.getByRole('button', { name: 'Display settings' }).click();
    await expect(page.getByLabel('Motion')).toHaveValue('reduced');
  });

  test('the popover closes with Escape', async ({ page }) => {
    await page.goto('/room/ZZZZZ');
    await page.getByRole('button', { name: 'Display settings' }).click();
    await expect(page.getByLabel('Motion')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Motion')).toBeHidden();
  });
});

test.describe('with prefers-reduced-motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('auto resolves to reduced, and an explicit full-motion override wins', async ({ page }) => {
    await page.goto('/room/ZZZZZ');
    await expect(page.locator('html')).toHaveAttribute('data-profile', 'reduced');

    await page.getByRole('button', { name: 'Display settings' }).click();
    await page.getByLabel('Motion').selectOption('high');
    await expect(page.locator('html')).toHaveAttribute('data-profile', 'high');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test e2e/settings.spec.ts`
Expected: FAIL — no `data-profile` attribute yet and no `Display settings` button. (Supabase and the dev server must be up; the config starts `npm run dev` for you.)

- [ ] **Step 3: Write the Panel primitive**

Create `components/ui/Panel.tsx`:

```tsx
import type { ComponentProps } from 'react';

/** Glassmorphic surface: translucent indigo, backdrop blur, hairline border. */
export default function Panel({ className = '', children, ...rest }: ComponentProps<'div'>) {
  return (
    <div
      {...rest}
      className={
        'rounded-panel border border-white/10 bg-night/55 backdrop-blur-xl ' +
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_60px_-28px_#000] ' +
        className
      }
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Write the Button primitive**

Create `components/ui/Button.tsx`:

```tsx
import type { ComponentProps } from 'react';

type Variant = 'primary' | 'ghost' | 'quiet';
type Size = 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-control font-display font-semibold ' +
  'uppercase tracking-[0.12em] ease-snap duration-(--dur-cut) ' +
  'transition-[background-color,border-color,color,box-shadow,transform] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-cyan ' +
  'disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ' +
  'enabled:active:translate-y-px';

const variants: Record<Variant, string> = {
  primary:
    'bg-neon-cyan text-void shadow-[0_0_32px_-8px_var(--color-neon-cyan)] ' +
    'enabled:hover:bg-ink enabled:hover:shadow-[0_0_40px_-6px_var(--color-neon-cyan)]',
  ghost:
    'border border-haze bg-night/60 text-ink ' +
    'enabled:hover:border-neon-cyan enabled:hover:text-neon-cyan',
  quiet: 'text-ink-dim enabled:hover:text-ink',
};

const sizes: Record<Size, string> = {
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-4 text-base',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: ComponentProps<'button'> & { variant?: Variant; size?: Size }) {
  return (
    <button
      {...rest}
      type={type}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
    />
  );
}
```

- [ ] **Step 5: Write the Input primitive**

Create `components/ui/Input.tsx`:

```tsx
import type { ComponentProps } from 'react';

export default function Input({ className = '', ...rest }: ComponentProps<'input'>) {
  return (
    <input
      {...rest}
      className={
        'w-full rounded-control border border-haze/80 bg-abyss/70 px-4 py-3 text-ink ' +
        'placeholder:text-ink-mute ease-snap duration-(--dur-cut) ' +
        'transition-[border-color,box-shadow] ' +
        'focus:border-neon-cyan focus:outline-none focus:ring-2 focus:ring-neon-cyan/35 ' +
        className
      }
    />
  );
}
```

- [ ] **Step 6: Write the Select primitive**

Create `components/ui/Select.tsx`:

```tsx
import { useId, type ComponentProps } from 'react';

interface SelectProps extends Omit<ComponentProps<'select'>, 'children'> {
  label: string;
  options: readonly { value: string; label: string }[];
}

export default function Select({ label, options, className = '', id, ...rest }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={selectId}
        className="font-display text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-ink-mute"
      >
        {label}
      </label>
      <div className="relative">
        <select
          {...rest}
          id={selectId}
          className={
            'w-full appearance-none rounded-control border border-haze/80 bg-abyss/80 ' +
            'py-2 pl-3 pr-9 text-sm text-ink ' +
            'focus:border-neon-cyan focus:outline-none focus:ring-2 focus:ring-neon-cyan/35 ' +
            className
          }
        >
          {options.map(option => (
            <option key={option.value} value={option.value} className="bg-abyss text-ink">
              {option.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 fill-none stroke-ink-dim stroke-2"
        >
          <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Write the settings control**

Create `components/SettingsControl.tsx`:

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/lib/useSettings';
import type { ProfileOverride } from '@/lib/presentation/profile';
import Panel from '@/components/ui/Panel';
import Select from '@/components/ui/Select';

const OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'high', label: 'Full motion' },
  { value: 'reduced', label: 'Reduced motion' },
] as const;

/**
 * Corner gear on the room view. P4 adds its mute toggle to this popover.
 * Rendered outside <main> so it never joins the game's interactive controls.
 */
export default function SettingsControl() {
  const [open, setOpen] = useState(false);
  const override = useSettings(s => s.override);
  const profile = useSettings(s => s.profile);
  const setOverride = useSettings(s => s.setOverride);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="fixed right-4 top-4 z-50">
      <button
        type="button"
        aria-label="Display settings"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={
          'grid h-10 w-10 place-items-center rounded-full border border-haze/80 bg-night/70 ' +
          'text-ink-dim backdrop-blur-md ease-snap duration-(--dur-cut) ' +
          'transition-[color,border-color] hover:border-neon-cyan hover:text-neon-cyan ' +
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-cyan'
        }
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.6]">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3L5.5 5.5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <Panel className="absolute right-0 mt-2 w-56 p-4">
          <Select
            label="Motion"
            value={override}
            onChange={event => setOverride(event.target.value as ProfileOverride)}
            options={OPTIONS}
          />
          <p className="mt-3 text-xs text-ink-mute">
            Currently running the {profile === 'high' ? 'full' : 'reduced'} profile.
          </p>
        </Panel>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Restructure the room page around a shell**

The room route gains a persistent shell that hosts the settings control (and, in Task 7, the canvas). Replace the render block of `app/room/[code]/page.tsx` — note that `SettingsControl` sits **outside** every `<main>`, and the phase views are wrapped in a `relative z-10` layer so a canvas can later sit behind them:

```tsx
  let content: React.ReactNode = null;
  if (hasSession === null) {
    content = null;
  } else if (!hasSession) {
    content = <JoinGate code={code} onJoined={handleJoined} />;
  } else if (!room) {
    content = <main className="grid min-h-screen place-items-center text-ink-dim">Connecting…</main>;
  } else if (room.status === 'lobby') {
    content = <LobbyView code={code} isHost={isHost} onStart={start} startError={hostError} />;
  } else if (room.status === 'finished') {
    content = <ResultsView code={code} />;
  } else {
    content = <GameView code={code} />;
  }

  return (
    <div className="relative min-h-screen">
      <SettingsControl />
      <div className="relative z-10">{content}</div>
    </div>
  );
```

with the added import:

```tsx
import SettingsControl from '@/components/SettingsControl';
```

- [ ] **Step 9: Run the e2e test to verify it passes**

Run: `npx playwright test e2e/settings.spec.ts`
Expected: PASS — 4 tests.

- [ ] **Step 10: Verify the regression floor is intact**

```bash
npx playwright test
npm run lint
npx tsc --noEmit
```
Expected: the whole suite passes, including `game-flow.spec.ts` (the gear must not have become `main button` #1 — if that test fails on the answer step, `SettingsControl` has ended up inside a `<main>`).

- [ ] **Step 11: Commit**

```bash
git add components/ui components/SettingsControl.tsx app/room/[code]/page.tsx e2e/settings.spec.ts
git commit -m "feat(ui): glass primitives and the performance-profile settings control"
```

---

### Task 7: PixiStage

**Files:**
- Create: `components/PixiStage.tsx`
- Modify: `app/room/[code]/page.tsx`
- Modify: `e2e/game-flow.spec.ts` (one additive assertion)

**Interfaces:**
- Consumes: `CANVAS` from `lib/presentation/tokens.ts`; `useSettings` from Task 5.
- Produces: `PixiStage()` — a full-bleed `pointer-events-none` layer with `data-testid="pixi-stage"` containing the Pixi canvas. Empty scene. P1 adds world content inside it without changing this component's contract.

- [ ] **Step 1: Read the installed PixiJS v8 typings before writing code**

The `Application.init` options and the two-argument `destroy` signature changed between Pixi v7 and v8. Confirm against what is actually installed:

```bash
node -e "console.log(require('fs').readFileSync('node_modules/pixi.js/lib/app/Application.d.ts','utf8'))"
```
Expected: an `init(options?: Partial<ApplicationOptions>): Promise<void>` and a `destroy(rendererDestroyOptions?, options?)`. If the destroy signature differs from Step 3's call, adapt the call — not the rest of the component.

- [ ] **Step 2: Write the component**

Create `components/PixiStage.tsx`:

```tsx
'use client';
import { useEffect, useRef } from 'react';
import { useSettings } from '@/lib/useSettings';
import { CANVAS } from '@/lib/presentation/tokens';

/**
 * Canvas lifecycle only — P0 mounts an empty scene.
 *
 * Sits behind the HTML game UI with pointer-events disabled: Pixi owns the
 * world, HTML owns everything readable and interactive (PRD §9 rendering
 * separation), so accessibility never depends on the canvas.
 */
export default function PixiStage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const hydrated = useSettings(s => s.hydrated);
  const profile = useSettings(s => s.profile);

  // Re-inits when the profile changes: `antialias` is a construction-time flag,
  // and P0's scene is empty, so a rebuild is the cheapest honest way to apply it.
  useEffect(() => {
    const host = hostRef.current;
    if (!hydrated || !host) return;

    let cancelled = false;
    let app: import('pixi.js').Application | null = null;

    const destroy = (instance: import('pixi.js').Application) => {
      instance.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
    };

    // Dynamic import keeps Pixi out of the server bundle and off every other route.
    void (async () => {
      try {
        const { Application } = await import('pixi.js');
        const instance = new Application();
        await instance.init({
          resizeTo: host,
          background: CANVAS.background,
          antialias: profile === 'high',
          resolution: Math.min(globalThis.devicePixelRatio || 1, CANVAS.maxResolution),
          autoDensity: true,
          preference: 'webgl',
        });

        // React Strict Mode double-mounts in dev: if the effect was cleaned up
        // while init was in flight, throw the instance away immediately.
        if (cancelled) {
          destroy(instance);
          return;
        }

        app = instance;
        host.appendChild(instance.canvas);
      } catch (error) {
        // A device with no usable WebGL context still gets the full HTML game.
        console.error('[PixiStage] failed to initialise the renderer', error);
      }
    })();

    return () => {
      cancelled = true;
      if (app) {
        destroy(app);
        app = null;
      }
    };
  }, [hydrated, profile]);

  return (
    <div
      ref={hostRef}
      data-testid="pixi-stage"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
    />
  );
}
```

- [ ] **Step 3: Mount it behind the room view**

In `app/room/[code]/page.tsx`, add the import and render the stage inside the shell, before `SettingsControl`. It mounts only once room state has arrived, so the join gate for a nonexistent room never spins up a GL context:

```tsx
import PixiStage from '@/components/PixiStage';
```

```tsx
  return (
    <div className="relative min-h-screen">
      {room && <PixiStage />}
      <SettingsControl />
      <div className="relative z-10">{content}</div>
    </div>
  );
```

- [ ] **Step 4: Add the canvas assertion to the full-game e2e**

In `e2e/game-flow.spec.ts`, immediately after the existing line `await expect(host.getByText('Starting grid')).toBeVisible();`, add:

```ts
  // P0 exit criterion: the (empty) Pixi canvas mounts in the room view.
  await expect(host.locator('[data-testid="pixi-stage"] canvas')).toBeAttached();
```

This is the only permitted edit to that file.

- [ ] **Step 5: Run the e2e suite**

Run: `npx playwright test`
Expected: all specs pass, including the new canvas assertion.

If the canvas never attaches and the console shows a WebGL context failure, headless Chromium is missing a GL backend on this machine. Fix it in `playwright.config.ts` (this is a config change, not a test change):

```ts
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader'] } } },
```

- [ ] **Step 6: Verify lifecycle by hand**

With Supabase and the dev server up, create a room in a real browser and, in DevTools:

1. Confirm exactly **one** `<canvas>` exists inside `[data-testid="pixi-stage"]` (React Strict Mode double-mount is handled).
2. Note `canvas.width`, resize the window, and confirm the backing store follows (`resizeTo`).
3. Confirm `canvas.width` is at most `2 ×` the CSS width even on a 3× display (`maxResolution`).
4. Navigate to `/` and confirm the canvas element is gone and no WebGL warnings appear (teardown destroys the GL context).
5. Set **Motion → Reduced** in the gear popover and confirm the canvas is rebuilt (`antialias` off).

Capture a screenshot of the lobby with the canvas mounted:

```bash
npx playwright screenshot --viewport-size=1280,800 "http://localhost:3000/room/<your-code>" test-results/p0-t7-room.png
```

- [ ] **Step 7: Commit**

```bash
git add components/PixiStage.tsx app/room/[code]/page.tsx e2e/game-flow.spec.ts
git commit -m "feat(canvas): PixiStage mount with profile-aware lifecycle"
```

---

### Task 8: App-shell restyle — landing, host setup, join gate

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/host/new/page.tsx`
- Modify: `components/JoinGate.tsx`

**Interfaces:**
- Consumes: tokens (Task 1), `EASE`/`DURATION` from `lib/presentation/tokens.ts`, `Panel`/`Button`/`Input` (Task 6), `MotionConfig` behaviour from `MotionProvider` (Task 5).
- Produces: nothing new for later tasks — this is the working proof of the token system.

**REQUIRED SUB-SKILL:** invoke the `frontend-design` skill before writing these screens; it guides the aesthetic execution (the code below is a complete, working baseline in the night-race language, not a ceiling). Whatever you change, the frozen accessible names and placeholders in Global Constraints must survive verbatim, and this is a **restyle, not a restructure**: same elements, same flow, same DOM order for the `−`/`+` steppers.

- [ ] **Step 1: Confirm the regression floor before touching anything**

Run: `npx playwright test e2e/landing.spec.ts e2e/host-setup.spec.ts e2e/join.spec.ts`
Expected: PASS — these three specs are what this task must not break, and you want a known-green starting point.

- [ ] **Step 2: Restyle the landing page**

Replace `app/page.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { DURATION, EASE } from '@/lib/presentation/tokens';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

const rise = {
  hidden: { opacity: 0, y: 24 },
  show: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.settle / 1000, ease: EASE.settle, delay: index * 0.08 },
  }),
};

export default function Landing() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const ready = code.trim().length === 5;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-10 px-6 py-12">
      <motion.div custom={0} initial="hidden" animate="show" variants={rise} className="text-center">
        <p className="font-display text-[0.6875rem] font-semibold uppercase tracking-[0.45em] text-neon-cyan">
          Live from the office
        </p>
        <h1 className="mt-4 font-display text-display font-bold uppercase text-ink">
          Circuit{' '}
          <span className="text-neon-magenta [text-shadow:0_0_28px_var(--color-neon-magenta)]">
            Break
          </span>
        </h1>
        <p className="mt-4 text-ink-dim">The office trivia grand prix</p>
      </motion.div>

      <motion.div custom={1} initial="hidden" animate="show" variants={rise} className="w-full">
        <Panel className="flex flex-col gap-6 p-6">
          <Button size="lg" className="w-full" onClick={() => router.push('/host/new')}>
            Host a game
          </Button>

          <div className="flex items-center gap-3 font-display text-[0.625rem] uppercase tracking-[0.3em] text-ink-mute">
            <span className="h-px flex-1 bg-haze/70" />
            or
            <span className="h-px flex-1 bg-haze/70" />
          </div>

          <form
            className="flex gap-2"
            onSubmit={event => {
              event.preventDefault();
              if (ready) router.push(`/room/${code.trim().toUpperCase()}`);
            }}
          >
            <Input
              value={code}
              onChange={event => setCode(event.target.value.toUpperCase())}
              maxLength={5}
              placeholder="ROOM CODE"
              aria-label="Room code"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 text-center font-display text-lg font-semibold uppercase tracking-[0.4em] placeholder:tracking-[0.2em]"
            />
            <Button type="submit" variant="ghost" size="lg" disabled={!ready}>
              Join
            </Button>
          </form>
        </Panel>
      </motion.div>

      <motion.p
        custom={2}
        initial="hidden"
        animate="show"
        variants={rise}
        className="text-center text-xs text-ink-mute"
      >
        2–20 players · one screen each · about 10 minutes
      </motion.p>
    </main>
  );
}
```

- [ ] **Step 3: Verify the landing page immediately**

Run: `npx playwright test e2e/landing.spec.ts`
Expected: PASS — heading, `Host a game`, `Join` disabled/enabled behaviour and the `/room/AB1CD` navigation all unchanged.

- [ ] **Step 4: Restyle the host setup wizard**

Replace `app/host/new/page.tsx`. Every string the e2e suite matches is preserved: heading `New game`, the `−`/`+` steppers in tier order, `Answer timer: {n}s`, `{total} questions · about {mins} min`, placeholder `Your nickname`, and the `Create room` button.

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { supabase } from '@/lib/supabaseClient';
import { saveSession } from '@/lib/session';
import { CATEGORIES, TIER_NAMES, estimateDurationSeconds } from '@/lib/rank';
import { AVATARS, COLORS } from '@/lib/avatars';
import { DURATION, EASE } from '@/lib/presentation/tokens';
import type { Tier } from '@/lib/types';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

const sectionMotion = (index: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DURATION.settle / 1000, ease: EASE.settle, delay: index * 0.06 },
});

const sectionHeading =
  'font-display text-[0.6875rem] font-semibold uppercase tracking-[0.28em] text-neon-cyan';

export default function HostSetup() {
  const router = useRouter();
  const [cats, setCats] = useState<string[]>(CATEGORIES.map(c => c.key));
  const [counts, setCounts] = useState<[number, number, number, number]>([4, 4, 3, 1]);
  const [timer, setTimer] = useState(10);
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0].key);
  const [color, setColor] = useState(COLORS[0]);
  const [playing, setPlaying] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = counts.reduce((a, b) => a + b, 0);
  const mins = Math.round(estimateDurationSeconds(total, timer) / 60);

  const toggleCat = (key: string) =>
    setCats(c => (c.includes(key) ? c.filter(k => k !== key) : [...c, key]));

  const bump = (i: number, d: number) =>
    setCounts(c => {
      const n = [...c] as typeof c;
      n[i] = Math.max(0, Math.min(10, n[i] + d));
      return n;
    });

  async function create() {
    setBusy(true); setError(null);
    const { data: room, error: e1 } = await supabase.rpc('create_room', {
      p_timer_seconds: timer, p_categories: cats, p_tier_counts: counts,
    });
    if (e1) { setError(e1.message); setBusy(false); return; }
    const { data: joined, error: e2 } = await supabase.rpc('join_room', {
      p_code: room.code, p_nickname: nickname, p_avatar: avatar, p_color: color,
      p_host_key: room.host_key, p_is_playing: playing,
    });
    if (e2) { setError(e2.message); setBusy(false); return; }
    saveSession(room.code, {
      roomId: room.room_id, playerId: joined.player_id,
      playerKey: joined.player_key, hostKey: room.host_key,
    });
    router.push(`/room/${room.code}`);
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <motion.header {...sectionMotion(0)}>
        <p className={sectionHeading}>Race control</p>
        <h1 className="mt-2 font-display text-hero font-bold uppercase text-ink">New game</h1>
      </motion.header>

      <motion.section {...sectionMotion(1)}>
        <Panel className="space-y-4 p-6">
          <h2 className={sectionHeading}>Categories</h2>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => {
              const on = cats.includes(c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleCat(c.key)}
                  className={
                    'rounded-full border px-4 py-2 text-sm font-semibold ease-snap duration-(--dur-cut) ' +
                    'transition-[background-color,border-color,color] ' +
                    (on
                      ? 'border-neon-cyan bg-neon-cyan/10 text-neon-cyan'
                      : 'border-haze/70 text-ink-mute hover:border-haze hover:text-ink-dim')
                  }
                >
                  {c.emoji} {c.label}
                </button>
              );
            })}
          </div>
        </Panel>
      </motion.section>

      <motion.section {...sectionMotion(2)}>
        <Panel className="space-y-3 p-6">
          <h2 className={sectionHeading}>Question mix</h2>

          {([1, 2, 3, 4] as Tier[]).map((tier, i) => (
            <div
              key={tier}
              className="flex items-center justify-between rounded-control border border-haze/40 bg-abyss/60 px-4 py-3"
            >
              <span className="font-semibold text-ink">{TIER_NAMES[tier]}</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => bump(i, -1)}
                  className="h-8 w-8 rounded-lg border border-haze/70 font-bold text-ink-dim hover:border-neon-cyan hover:text-neon-cyan"
                >
                  −
                </button>
                <span className="w-6 text-center font-display font-bold tabular-nums text-ink">{counts[i]}</span>
                <button
                  type="button"
                  onClick={() => bump(i, +1)}
                  className="h-8 w-8 rounded-lg border border-haze/70 font-bold text-ink-dim hover:border-neon-cyan hover:text-neon-cyan"
                >
                  +
                </button>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between rounded-control border border-haze/40 bg-abyss/60 px-4 py-3">
            <span className="font-semibold text-ink">Answer timer: {timer}s</span>
            <input
              type="range"
              min={5}
              max={20}
              value={timer}
              aria-label="Answer timer seconds"
              onChange={e => setTimer(+e.target.value)}
              className="accent-neon-cyan"
            />
          </div>

          <p className="text-sm text-ink-dim">
            {total} questions · about {mins} min
          </p>
        </Panel>
      </motion.section>

      <motion.section {...sectionMotion(3)}>
        <Panel className="space-y-4 p-6">
          <h2 className={sectionHeading}>You</h2>

          <Input
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            maxLength={20}
            placeholder="Your nickname"
            aria-label="Your nickname"
          />

          <div className="flex flex-wrap gap-2">
            {AVATARS.map(a => (
              <button
                key={a.key}
                type="button"
                onClick={() => setAvatar(a.key)}
                title={a.label}
                aria-pressed={avatar === a.key}
                className={
                  'h-12 w-12 rounded-control text-2xl ease-snap duration-(--dur-cut) transition-[background-color,box-shadow] ' +
                  (avatar === a.key
                    ? 'bg-neon-cyan/15 ring-2 ring-neon-cyan'
                    : 'bg-abyss/70 hover:bg-night')
                }
              >
                {a.emoji}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            {COLORS.map((c, i) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Racer colour ${i + 1}`}
                aria-pressed={color === c}
                className={`h-8 w-8 rounded-full ${color === c ? 'ring-2 ring-ink' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm text-ink-dim">
            <input
              type="checkbox"
              checked={playing}
              onChange={e => setPlaying(e.target.checked)}
              className="accent-neon-cyan"
            />
            I&apos;m playing too (uncheck to MC only)
          </label>
        </Panel>
      </motion.section>

      {error && <p className="text-wrong">{error}</p>}

      <Button
        size="lg"
        className="w-full"
        onClick={create}
        disabled={busy || total < 1 || cats.length < 1 || nickname.trim().length < 1}
      >
        {busy ? 'Creating…' : 'Create room'}
      </Button>
    </main>
  );
}
```

- [ ] **Step 5: Verify the host setup wizard immediately**

Run: `npx playwright test e2e/host-setup.spec.ts`
Expected: PASS — 4 tests. If `getByRole('button', { name: '−' })` now resolves to more or fewer than 4 elements, a stepper glyph was altered; restore it.

- [ ] **Step 6: Restyle the join gate**

Replace `components/JoinGate.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { motion } from 'motion/react';
import { supabase } from '@/lib/supabaseClient';
import { saveSession } from '@/lib/session';
import { AVATARS, COLORS } from '@/lib/avatars';
import { DURATION, EASE } from '@/lib/presentation/tokens';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function JoinGate({ code, onJoined }: { code: string; onJoined: () => void }) {
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[1].key);
  const [color, setColor] = useState(COLORS[1]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true); setError(null);
    const { data, error: err } = await supabase.rpc('join_room', {
      p_code: code, p_nickname: nickname, p_avatar: avatar, p_color: color,
    });
    if (err) { setError(err.message); setBusy(false); return; }
    saveSession(code, { roomId: data.room_id, playerId: data.player_id, playerKey: data.player_key });
    onJoined();
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.settle / 1000, ease: EASE.settle }}
      >
        <p className="font-display text-[0.6875rem] font-semibold uppercase tracking-[0.42em] text-neon-cyan">
          Starting grid
        </p>
        <h1 className="mt-3 font-display text-hero font-bold uppercase text-ink">
          Joining room{' '}
          <span className="text-neon-magenta tracking-[0.18em]">{code}</span>
        </h1>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.settle / 1000, ease: EASE.settle, delay: 0.08 }}
      >
        <Panel className="space-y-5 p-6">
          <Input
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            maxLength={20}
            placeholder="Your nickname"
            aria-label="Your nickname"
          />

          <div className="flex flex-wrap gap-2">
            {AVATARS.map(a => (
              <button
                key={a.key}
                type="button"
                onClick={() => setAvatar(a.key)}
                title={a.label}
                aria-pressed={avatar === a.key}
                className={
                  'h-12 w-12 rounded-control text-2xl ease-snap duration-(--dur-cut) transition-[background-color,box-shadow] ' +
                  (avatar === a.key
                    ? 'bg-neon-cyan/15 ring-2 ring-neon-cyan'
                    : 'bg-abyss/70 hover:bg-night')
                }
              >
                {a.emoji}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            {COLORS.map((c, i) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Racer colour ${i + 1}`}
                aria-pressed={color === c}
                className={`h-8 w-8 rounded-full ${color === c ? 'ring-2 ring-ink' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          {error && <p className="text-wrong">{error}</p>}

          <Button
            size="lg"
            className="w-full"
            onClick={join}
            disabled={busy || nickname.trim().length < 1}
          >
            {busy ? 'Joining…' : 'Join game'}
          </Button>
        </Panel>
      </motion.div>
    </main>
  );
}
```

- [ ] **Step 7: Verify the join gate immediately**

Run: `npx playwright test e2e/join.spec.ts e2e/settings.spec.ts`
Expected: PASS — join validation, the "room not found" error, and the settings control (which lives on the same route) all still work.

- [ ] **Step 8: Run everything**

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
npx playwright test
```
Expected: all green — 8 vitest files (`rank`, `serverTime`, `store`, `tokens`, `celebration`, `deriveCues`, `cueBus`, `profile`), lint clean, no type errors, production build succeeds, and the full Playwright suite (landing, host setup, join, settings, game flow) passes.

- [ ] **Step 9: Visual smoke check**

With the dev server running:

```bash
npx playwright screenshot --viewport-size=1280,800 http://localhost:3000/ test-results/p0-landing-desktop.png
npx playwright screenshot --viewport-size=390,844 http://localhost:3000/ test-results/p0-landing-mobile.png
npx playwright screenshot --viewport-size=1280,900 http://localhost:3000/host/new test-results/p0-host-desktop.png
npx playwright screenshot --viewport-size=390,844 http://localhost:3000/host/new test-results/p0-host-mobile.png
npx playwright screenshot --viewport-size=390,844 http://localhost:3000/room/ZZZZZ test-results/p0-join-mobile.png
```

Review each against the design razor — *does this read as a game show, or as a quiz website?* — and check: no horizontal overflow at 390px; the display face is actually loading (headings are angular, not the system fallback); panels read as glass over the indigo gradient, not as flat cards; focus rings are visible when tabbing. Nothing here is committed as a snapshot test.

Optionally run the `web-design-guidelines` skill over the three restyled files for a contrast/keyboard pass.

- [ ] **Step 10: Verify the reduced profile actually changes behaviour**

In a browser at `http://localhost:3000/room/ZZZZZ`, set **Motion → Reduced** in the gear popover, then reload `/` and `/host/new`.
Expected: entrance animations collapse to near-instant (both the `motion` entrances via `MotionConfig` and any CSS transitions via the `[data-profile='reduced']` rules). Switch back to **Full motion** and confirm the staggered rises return.

- [ ] **Step 11: Commit**

```bash
git add app/page.tsx app/host/new/page.tsx components/JoinGate.tsx
git commit -m "feat(ui): restyle landing, host setup and join gate in the night-race system"
```

---

## Exit-criteria verification map

Run this at the end of Task 8 and confirm each line before declaring P0 done.

| Spec §10 exit criterion | Where it is satisfied | How it is verified |
|---|---|---|
| 1. New visual identity on landing, host setup, join gate | Tasks 1, 6, 8 | `npx playwright test e2e/landing.spec.ts e2e/host-setup.spec.ts e2e/join.spec.ts` + the Task 8 Step 9 screenshots |
| 2. Empty Pixi canvas mounts, resizes, tears down in the room view | Task 7 | `[data-testid="pixi-stage"] canvas` assertion in `e2e/game-flow.spec.ts` + Task 7 Step 6 manual lifecycle checks |
| 3. Profile switching and reduced-motion demonstrably alter behavior | Tasks 5, 6, 7, 8 | `e2e/settings.spec.ts` (4 tests incl. `reducedMotion: 'reduce'`) + Task 8 Step 10 |
| 4. Presentation-event layer unit-tested against recorded M1 transitions | Tasks 2, 3, 4 | `tests/celebration.test.ts`, `tests/deriveCues.test.ts`, `tests/cueBus.test.ts` — `npm test` |
| 5. Full Playwright e2e suite passes | all | `npx playwright test` |

Additional guards this plan adds beyond the spec's exit criteria: `tests/tokens.test.ts` fails the build if the hand-mirrored `tokens.ts` drifts from the `@theme` source of truth or from the DB-persisted racer palette in `lib/avatars.ts`.

## Deliberate deviations from the spec, and why

1. **`streak-tier` carries `streak: 3 | 5 | 8`, not `tier`** — the spec's field name collides with the celebration `tier` every cue carries. Same reason `phase-read` uses `questionTier` for the 1–4 difficulty.
2. **`components/MotionProvider.tsx` is not in the spec's module layout** — settings hydration must happen in an effect (not during render) to avoid an SSR mismatch, and `MotionConfig` needs one host. One file does both, at the root, once.
3. **Standings drama is derived only on the transition into `reveal`** — the spec says deltas yield the cues but not when; `track` and `results` repeat the same standings, so any other rule double-celebrates.
4. **`streak-broken` only fires from a streak of 3+** — below that no VFX tier was ever shown, so the cue would be pure noise.
5. **The cue bus exposes `clearCueBus()`** (tests only) alongside the spec's `on`/`emit`; `startCueBridge` is mounted with a bare `useEffect` in the room page rather than a dedicated hook file, keeping `cueBus.ts` framework-free and Node-testable.
