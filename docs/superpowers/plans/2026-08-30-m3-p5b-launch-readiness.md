# M3 P5b — Launch Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every PRD §11 success criterion has a **recorded measurement** rather
than an assumption, the accessibility promises in PRD §8 are **verified and
enforced by tests** rather than intended, and the two carried-debt items the
roadmap names get a decision in writing.

**Architecture:** An audit that leaves nothing behind is not an audit, it is a
memory. So each finding becomes a **gate**: colour becomes a pure module
(`lib/a11y/contrast.ts` — WCAG relative luminance, contrast ratio, alpha
compositing, and CVD simulation) plus a hand-mirrored table of every
foreground/ground pair the app actually paints, and a unit test fails when a
pair drops below its threshold. Keyboard operability, text scaling,
reduced-motion and landmark structure become one Playwright spec. The free-tier
budget becomes a unit test computed from the app's own constants, so raising
the presence cadence turns it red. The two measurements that genuinely need a
running system — a ten-player game and a frame-rate profile — get a Node soak
harness and a headed profiling pass, and their numbers are written into the
phase record.

**Tech Stack:** TypeScript, Vitest, Playwright, Node 24 ESM (`.mjs`, no new
dependencies), `@supabase/supabase-js` (already a dependency) for the soak
harness. **No new runtime dependencies.**

**Spec:** `docs/superpowers/specs/2026-08-29-m3-host-power-polish-roadmap.md`
— §3 "P5 — Polish & launch readiness" is the requirement set; §2 and §4 bind
every task. Per roadmap §6, P5 writes no drill-down spec; this plan is where its
lines are drawn.

**Depends on:** M3 P5a (`docs/superpowers/plans/2026-08-30-m3-p5a-the-starting-grid.md`)
merged. The audit must run over the restyled lobby, not the one it replaced.

### Scope check

Seven tasks, inside the roadmap's 4–8 guidance. Roadmap §6's ratchet flags the
accessibility audit as "exactly the kind of item that looks like a checklist and
turns out to be a phase." It was checked before this plan was written: the
palette was computed, and the audit's findings are already known and named in
the decisions table below — two of them, both small. That is what keeps it a
task list rather than a phase. **If Task 2 turns up a third class of finding —
something structural rather than a value that needs nudging — stop and write the
spec.** The ratchet is one-way.

### Findings already made while planning

These were computed against the live `@theme` block, not guessed. They are why
Task 3 exists.

| Finding | Measurement | Resolution |
|---|---|---|
| **`--color-ink-mute` (`#6d75ab`) fails WCAG AA for small text on every ground it is painted on.** It carries the app's 11px uppercase micro-labels — section headings, table captions, rank numerals, the `Q{n}/{total}` badge — which are small text and need 4.5:1. | `void` 4.60 ✓ · `bg-abyss/75` 4.46 ✗ · `bg-night/55` 4.32 ✗ · `bg-night/60` 4.28 ✗ · opaque `night` 3.99 ✗ · `bg-haze/25` 4.23 ✗ | Lift the token to `#767eb9` — the smallest nudge that clears 4.5:1 on every one of those grounds (5.25 / 5.08 / 4.92 / 4.88 / 4.55 / 4.83). *Rejected:* restricting `ink-mute` to large text, which would mean restyling every micro-label in the app; and leaving it and accepting in writing, which fails an explicit PRD §8 promise for the sake of 3 hex points. |
| **`components/PlayerConnection.tsx`'s dropped-player chip is `text-ink-mute` on `bg-haze/40`** — the app's lightest text-bearing ground, and the one place the lift above is not enough. | 3.46 today; 3.95 even after the lift | Change that chip's foreground to `text-ink-dim` (6.98). It is a status chip, not a micro-label, and `ink-dim` is what every other chip on a haze ground already uses (`DrawCard`, `QuestionCard`, `StageBroadcast`). |

Neither is mirrored in `lib/presentation/tokens.ts` — that file's contract is
the *canvas-relevant* subset, and no ink token is in it — so `tests/tokens.test.ts`
is unaffected and no Pixi colour moves.

### Decisions this plan owns and resolves

| Decision | Resolved as | Where |
|---|---|---|
| **What "colorblind-safe answer palette" is actually asserted to mean** | **Two rules, not one.** (1) Every option accent keeps ≥3:1 against the option surface under normal vision *and* under simulated protanopia, deuteranopia and tritanopia — so the left border always reads as a border. (2) Hue is never the only carrier: the glyph is. Measured, the accents do collapse in pairs under CVD — lime/warning to ΔE 11.9 under deuteranopia, cyan/lime to 37.9 under tritanopia — which is not a defect to fix but the *reason* ADR-0017's shape coding is load-bearing, and the test says so in an assertion rather than a comment. | Task 2 |
| **Where the contrast table lives, and how it avoids drifting** | **`lib/a11y/palette.ts`, hand-mirrored from `app/globals.css`, in the same tradition as `lib/presentation/tokens.ts`** — plus a second guard the tokens mirror does not have: the test scans `components/` and `app/` for `text-<token>` classes and fails if one appears that the table does not cover. A hand table catches wrong values; the scan catches missing rows. | Task 2 |
| **How a ten-player game is measured without ten WebGL contexts** | **A Node soak harness (`scripts/soak.mjs`), not ten browsers.** This machine already cannot sustain two concurrent Pixi contexts under load (CURRENT.md); ten would measure the laptop, not the game. Desync and stall are *protocol* failures — a missed broadcast, a rejected answer, a deadline that drifts — and the protocol is reachable from `@supabase/supabase-js` in Node with no renderer at all. One real browser runs alongside as the human-visible surface. *Rejected:* ten Playwright contexts (measures SwiftShader), and asserting the criterion from a two-context run (does not test what the criterion says). | Task 6 |
| **A new script rather than growing `scripts/smoke.mjs`** | **`scripts/soak.mjs` is separate.** `smoke.mjs` is a 1327-line assertion suite of pure RPC calls, run on every phase; the soak opens realtime sockets, takes minutes, and is a *measurement* run against the cloud project. Roadmap §5's "smoke grows into the integration harness" is about SQL-level integration, which is what smoke does; this is a different instrument. | Task 6 |
| **What the free-tier budget is** | **A unit test computed from the app's own constants**, not a paragraph. `PRESENCE_REPORT_MS`, `NOMINAL_MS`, `CEREMONY_MS` and `estimateDurationSeconds` are all importable, so the monthly totals are derived, and a future change to any of them turns the test red instead of silently invalidating a written claim. Ceilings are named constants with a comment recording that they are the documented free-tier figures at the time of writing — the test's job is headroom (a 50× margin), not precision. | Task 5 |
| **The two carried-debt items** | **Both are already closed, and the decision is to record that rather than re-open it.** The off-screen marker gained a direction in commit `e65999c` (`OffscreenPlayer.direction`, rendered as ◀▶▲▼ by `components/TrackReadout.tsx`); the twenty-player grid stopped compressing in `58957b4` (`gridAnchors` grows rows instead, pinned by `tests/geometry.test.ts`'s "holds full column spacing at the twenty-player maximum"). The roadmap listed them because it was written before those landed. Verify, cite, and strike them. | Task 7 |

## Global Constraints

Copied from the roadmap. Every task's requirements implicitly include this
section.

- **The wire does not open.** No new realtime event, no new payload field, no
  new cue type. `scripts/soak.mjs` only *listens*.
- **No schema, no RPC, no migration.** Nothing under `supabase/migrations/` is
  touched.
- **The celebration hierarchy extends by exactly zero rungs.**
- **The Fairness Law is untouched.**
- **No new runtime dependencies** (roadmap decision 7). The contrast module is
  ~120 lines of arithmetic; a colour library would be a dependency added to
  avoid writing a matrix multiply.
- **A token change is a design change.** The one this plan makes
  (`--color-ink-mute`) is a 3-point luminance nudge that no screenshot approval
  covers and no Pixi mirror reads. Any *second* token change discovered mid-task
  is a finding to report, not a change to make.
- **Rendering separation (PRD §9):** accessibility never depends on canvas.
  Every assertion in this plan is against the DOM.
- **The regression floor at the end of the phase:** every existing unit test
  plus whatever this plan adds, `npm run lint` clean, `npx tsc --noEmit`
  silent, `npm run test:e2e -- --workers=1` green (**`--workers=1`** —
  `--workers=2` fails reproducibly on this machine from an untouched `main`;
  CURRENT.md). Any lint error is a real one.
- **Live and profiling verification stays headed.** Headless Chromium falls back
  to SwiftShader, idles around 16fps and pins the VFX budget at `minimal` before
  a test starts, so it cannot measure frame budget at all; CDP CPU throttling is
  also wrong, because the render loop is GPU-bound. Headed browser plus a
  synthetic main-thread block is the combination that works (CURRENT.md).
- **Cloud SQL goes through** `npx -y supabase@latest db query --linked --file <path>`.
  Restore the free-tier project from the dashboard before any cloud run — it
  pauses after ~1 week idle. **Do not run `supabase stop` / `supabase start`.**
- **A fresh worktree** needs `.env.local` **and** `supabase/.temp/` hand-copied
  in (both gitignored), its port corrected, and its own `npm install`; never
  junction `node_modules`.

---

### Task 1: The colour arithmetic

**Files:**
- Create: `lib/a11y/contrast.ts`
- Test: `tests/contrast.test.ts`

**Interfaces:**
- Consumes: nothing. Pure arithmetic, no imports.
- Produces:
  - `relativeLuminance(hex: string): number`
  - `contrastRatio(a: string, b: string): number`
  - `blend(foreground: string, background: string, alpha: number): string`
  - `type CvdKind = 'protanopia' | 'deuteranopia' | 'tritanopia'`
  - `simulateCvd(hex: string, kind: CvdKind): string`
  - `deltaE(a: string, b: string): number`

- [ ] **Step 1: Write the failing tests**

Create `tests/contrast.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  relativeLuminance,
  contrastRatio,
  blend,
  simulateCvd,
  deltaE,
} from '@/lib/a11y/contrast';

describe('relativeLuminance', () => {
  it('anchors at the two ends of the sRGB range', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBe(1);
  });

  it('applies the sRGB transfer curve, not a linear ramp', () => {
    // Mid grey is ~0.216 luminance, not 0.5 — the whole point of the curve.
    expect(relativeLuminance('#808080')).toBeCloseTo(0.2159, 3);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white, in either order', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 6);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 6);
  });

  it('is 1 for a colour against itself', () => {
    expect(contrastRatio('#35f2ff', '#35f2ff')).toBeCloseTo(1, 6);
  });

  it('tolerates a leading hash or none, and either case', () => {
    expect(contrastRatio('35F2FF', '#0a0c1c')).toBeCloseTo(
      contrastRatio('#35f2ff', '#0A0C1C'), 6,
    );
  });
});

describe('blend', () => {
  it('returns the background at alpha 0 and the foreground at alpha 1', () => {
    expect(blend('#ffffff', '#000000', 0)).toBe('#000000');
    expect(blend('#ffffff', '#000000', 1)).toBe('#ffffff');
  });

  it('composites a translucent surface the way the browser does', () => {
    // bg-night/60 over the page's void ground.
    expect(blend('#121734', '#05060f', 0.6)).toBe('#0d1025');
  });
});

describe('simulateCvd', () => {
  it('leaves a neutral grey neutral under every kind', () => {
    for (const kind of ['protanopia', 'deuteranopia', 'tritanopia'] as const) {
      const out = simulateCvd('#808080', kind);
      const [r, g, b] = [1, 3, 5].map(i => parseInt(out.slice(i, i + 2), 16));
      expect(Math.abs(r - g)).toBeLessThanOrEqual(3);
      expect(Math.abs(g - b)).toBeLessThanOrEqual(3);
    }
  });

  it('collapses red and green toward each other under deuteranopia', () => {
    const before = deltaE('#ff0000', '#00ff00');
    const after = deltaE(
      simulateCvd('#ff0000', 'deuteranopia'),
      simulateCvd('#00ff00', 'deuteranopia'),
    );
    expect(after).toBeLessThan(before / 2);
  });

  it('leaves blue and yellow separable under deuteranopia', () => {
    expect(
      deltaE(simulateCvd('#0000ff', 'deuteranopia'), simulateCvd('#ffff00', 'deuteranopia')),
    ).toBeGreaterThan(60);
  });
});

describe('deltaE', () => {
  it('is 0 for a colour against itself', () => {
    expect(deltaE('#ff4fd8', '#ff4fd8')).toBeCloseTo(0, 6);
  });

  it('is symmetric', () => {
    expect(deltaE('#35f2ff', '#c6ff4a')).toBeCloseTo(deltaE('#c6ff4a', '#35f2ff'), 6);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/contrast.test.ts`
Expected: FAIL — cannot resolve `@/lib/a11y/contrast`.

- [ ] **Step 3: Implement the module**

Create `lib/a11y/contrast.ts`:

```ts
/**
 * Colour arithmetic for the accessibility audit (M3 P5b).
 *
 * Pure and dependency-free: WCAG 2.1's relative luminance and contrast ratio,
 * alpha compositing (the app paints translucent surfaces, so the ground a
 * label actually sits on is a composite, not a token), CIE Lab ΔE, and
 * dichromat simulation.
 *
 * Written rather than installed. This is four matrices and a transfer curve;
 * a colour library would be a runtime dependency added to avoid writing a
 * matrix multiply, which roadmap decision 7 forbids without an argument.
 *
 * The simulation matrices are Machado, Oliveira & Fernandes (2009) at full
 * severity, applied in LINEAR light — applying them to gamma-encoded channels
 * is the classic mistake and materially changes the answer.
 */

type Rgb = [number, number, number];

function parse(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255) as Rgb;
}

function format(rgb: Rgb): string {
  return (
    '#' +
    rgb
      .map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0'))
      .join('')
  );
}

const toLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toSrgb = (c: number): number =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;

/** WCAG 2.1 relative luminance. 0 for black, 1 for white. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parse(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio, 1..21. Order-independent. */
export function contrastRatio(a: string, b: string): number {
  const x = relativeLuminance(a);
  const y = relativeLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * The ground a label actually sits on.
 *
 * Tailwind's `/nn` surfaces are alpha, so `bg-night/60` over the page's void
 * ground is neither `night` nor `void`. Compositing is done in sRGB space
 * because that is what the browser does — the source-over blend is not
 * linearised.
 */
export function blend(foreground: string, background: string, alpha: number): string {
  const f = parse(foreground);
  const b = parse(background);
  return format(f.map((v, i) => v * alpha + b[i] * (1 - alpha)) as Rgb);
}

export type CvdKind = 'protanopia' | 'deuteranopia' | 'tritanopia';

const MATRICES: Record<CvdKind, readonly Rgb[]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.011820, 0.042940, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.303900],
  ],
};

/** What a dichromat sees. Applied in linear light; re-encoded on the way out. */
export function simulateCvd(hex: string, kind: CvdKind): string {
  const linear = parse(hex).map(toLinear) as Rgb;
  const m = MATRICES[kind];
  return format(
    m.map(row => toSrgb(Math.min(1, Math.max(0, row[0] * linear[0] + row[1] * linear[1] + row[2] * linear[2])))) as Rgb,
  );
}

function lab(hex: string): Rgb {
  const [r, g, b] = parse(hex).map(toLinear);
  // sRGB → XYZ (D65), normalised to the D65 white point.
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/**
 * CIE76 ΔE. Coarse by modern standards, and deliberately so: it is used here
 * only to answer "are these two still telling apart", where a 2-unit
 * disagreement with CIEDE2000 changes nothing.
 */
export function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/contrast.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Clear diagnostics and commit**

Run `npx tsc --noEmit` and `npm run lint`.

```bash
git add lib/a11y/contrast.ts tests/contrast.test.ts
git commit -m "feat(p5b): WCAG contrast and dichromat simulation, as arithmetic"
```

---

### Task 2: The palette audit, as a gate

**Files:**
- Create: `lib/a11y/palette.ts`
- Test: `tests/a11y.test.ts`

**Interfaces:**
- Consumes: `contrastRatio`, `blend`, `simulateCvd`, `deltaE`, `CvdKind` from
  Task 1; `OPTION_IDENTITIES` from `lib/staging/options.ts`.
- Produces:
  - `TOKENS: Record<string, string>` — the ink, surface, accent, semantic and
    medal values, hand-mirrored from `app/globals.css`'s `@theme` block.
  - `GROUNDS: Record<string, string>` — the composited surfaces the app paints.
  - `TEXT_USAGE: Record<string, { grounds: (keyof typeof GROUNDS)[]; size: 'small' | 'large' }>`
  - `AA_SMALL = 4.5`, `AA_LARGE = 3`, `AA_NON_TEXT = 3`

- [ ] **Step 1: Enumerate the grounds from the source, not from memory**

Before writing the table, run:

```bash
grep -rhoE "bg-(void|abyss|night|dusk|haze)(/[0-9]+)?" components/ app/ --include=*.tsx | sort | uniq -c | sort -rn
grep -rn "text-ink\b|text-ink-dim|text-ink-mute" components/ app/ --include=*.tsx | wc -l
```

Every distinct `bg-<token>/<alpha>` that carries text is a ground. As of this
plan the text-bearing ones are `void`, `bg-void/85`, `bg-abyss` (opaque),
`bg-abyss/50…/90`, `bg-night` (opaque), `bg-night/55`, `bg-night/60`,
`bg-night/70`, `bg-night/80`, `bg-haze/25`, `bg-haze/40`, `bg-haze/45`.
`bg-haze/70` and `bg-void/10` are rules and placeholders with no text on them —
exclude them and say why in a comment. **If the grep now shows a ground that is
not in the list above, add it; if it shows one the list has and the source no
longer does, drop it.**

- [ ] **Step 2: Write the failing test**

Create `tests/a11y.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio, simulateCvd, deltaE, type CvdKind } from '@/lib/a11y/contrast';
import {
  TOKENS, GROUNDS, TEXT_USAGE, AA_SMALL, AA_LARGE, AA_NON_TEXT,
} from '@/lib/a11y/palette';
import { OPTION_IDENTITIES } from '@/lib/staging/options';

const CVD: CvdKind[] = ['protanopia', 'deuteranopia', 'tritanopia'];

describe('every text token clears WCAG AA on every ground it is painted on', () => {
  for (const [token, usage] of Object.entries(TEXT_USAGE)) {
    for (const ground of usage.grounds) {
      it(`${token} on ${ground}`, () => {
        const ratio = contrastRatio(TOKENS[token], GROUNDS[ground]);
        expect(ratio).toBeGreaterThanOrEqual(usage.size === 'small' ? AA_SMALL : AA_LARGE);
      });
    }
  }
});

describe('the answer palette survives colour-vision deficiency', () => {
  // The option row's ground: bg-night/60 over the page's void.
  const surface = GROUNDS.option;
  const accents = OPTION_IDENTITIES.map(o => o.accent);

  it('names four accents that this table can resolve', () => {
    // OPTION_IDENTITIES stores CSS var() references; the resolved values live
    // in TOKENS under the same names. A rename in either place fails here
    // rather than silently skipping the whole block below.
    for (const accent of accents) {
      const name = accent.replace(/^var\(--color-|\)$/g, '');
      expect(TOKENS[name], `${accent} is not in TOKENS`).toBeDefined();
    }
  });

  const resolved = () =>
    accents.map(a => TOKENS[a.replace(/^var\(--color-|\)$/g, '')]);

  it('keeps every accent readable as a border under normal vision', () => {
    for (const accent of resolved()) {
      expect(contrastRatio(accent, surface)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });

  for (const kind of CVD) {
    it(`keeps every accent readable as a border under ${kind}`, () => {
      const ground = simulateCvd(surface, kind);
      for (const accent of resolved()) {
        expect(contrastRatio(simulateCvd(accent, kind), ground)).toBeGreaterThanOrEqual(AA_NON_TEXT);
      }
    });
  }

  /**
   * This is the assertion that justifies ADR-0017's shape coding, stated as a
   * fact rather than left in a comment: at least one accent PAIR becomes
   * indistinguishable under a dichromat's vision, so hue can never be the only
   * carrier of "which option is this".
   */
  it('has at least one accent pair collapse under CVD, which is why glyphs exist', () => {
    const collapses = CVD.some(kind => {
      const sim = resolved().map(a => simulateCvd(a, kind));
      return sim.some((a, i) => sim.slice(i + 1).some(b => deltaE(a, b) < 25));
    });
    expect(collapses).toBe(true);
  });

  it('gives every option a distinct glyph, unconditionally', () => {
    const glyphs = OPTION_IDENTITIES.map(o => o.glyph);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });
});

describe('the usage table covers what the source actually renders', () => {
  function tsxFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(entry => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) return tsxFiles(path);
      return path.endsWith('.tsx') ? [path] : [];
    });
  }

  it('has a row for every text token class used in components/ or app/', () => {
    const used = new Set<string>();
    for (const file of [...tsxFiles('components'), ...tsxFiles('app')]) {
      for (const m of readFileSync(file, 'utf8').matchAll(/\btext-(ink(?:-dim|-mute)?)\b/g)) {
        used.add(m[1]);
      }
    }
    const covered = new Set(Object.keys(TEXT_USAGE));
    expect([...used].filter(t => !covered.has(t))).toEqual([]);
  });
});
```

- [ ] **Step 3: Write the palette table**

Create `lib/a11y/palette.ts`:

```ts
/**
 * The palette, and where it is painted (M3 P5b).
 *
 * HAND-MIRRORED from the @theme block in app/globals.css, in the same
 * tradition as lib/presentation/tokens.ts — which mirrors the canvas-relevant
 * subset and deliberately holds no ink token, so the two do not overlap and
 * neither is generated.
 *
 * `GROUNDS` is the mirror's second half and the part a token table alone
 * cannot supply: the app paints translucent surfaces, so the ground a label
 * actually sits on is a COMPOSITE. `bg-night/60` over the page's void is
 * #0d1025, which is neither token.
 *
 * `TEXT_USAGE` says which grounds each ink token is painted on. It is
 * hand-maintained, and tests/a11y.test.ts guards it from both directions: a
 * wrong value fails the contrast assertions, and a missing row fails the
 * source scan.
 *
 * Excluded on purpose: `bg-haze/70` (a 1px rule on the landing page) and
 * `bg-void/10` (JoinQr's empty-state placeholder) carry no text at all.
 */
import { blend } from './contrast';

export const TOKENS: Record<string, string> = {
  // Surfaces
  void: '#05060f',
  abyss: '#0a0c1c',
  night: '#121734',
  dusk: '#1c2350',
  haze: '#2b3370',
  // Ink — NOTE: `ink-mute` was lifted from #6d75ab in M3 P5b; see ADR-0055.
  ink: '#eaeeff',
  'ink-dim': '#a6adde',
  'ink-mute': '#767eb9',
  // Accents
  'neon-cyan': '#35f2ff',
  'neon-magenta': '#ff4fd8',
  'neon-lime': '#c6ff4a',
  // Semantics
  correct: '#3ce69b',
  wrong: '#ff5d73',
  warning: '#ffb43d',
  // Medals
  gold: '#ffd166',
  silver: '#d5dcee',
  bronze: '#e08a4c',
};

/** The composited surfaces the app actually paints text on. */
export const GROUNDS = {
  page: TOKENS.void,
  overlay: blend(TOKENS.void, TOKENS.void, 0.85),
  abyss: TOKENS.abyss,
  abyssHalf: blend(TOKENS.abyss, TOKENS.void, 0.5),
  abyssPanel: blend(TOKENS.abyss, TOKENS.void, 0.75),
  night: TOKENS.night,
  panel: blend(TOKENS.night, TOKENS.void, 0.55),
  option: blend(TOKENS.night, TOKENS.void, 0.6),
  card: blend(TOKENS.night, TOKENS.void, 0.8),
  rowHighlight: blend(TOKENS.haze, TOKENS.void, 0.25),
  chip: blend(TOKENS.haze, TOKENS.void, 0.45),
} as const;

export const AA_SMALL = 4.5;
export const AA_LARGE = 3;
export const AA_NON_TEXT = 3;

/**
 * Every ink token, and the grounds it is painted on.
 *
 * All three are `small`: this app's micro-labels are 11px uppercase, which is
 * small text under WCAG however bold it is, and the largest ink-dim text
 * (`text-lg`) is still under the 24px large-text threshold.
 */
export const TEXT_USAGE: Record<
  string,
  { grounds: (keyof typeof GROUNDS)[]; size: 'small' | 'large' }
> = {
  ink: {
    grounds: ['page', 'overlay', 'abyss', 'abyssHalf', 'abyssPanel', 'night', 'panel', 'option', 'card', 'rowHighlight', 'chip'],
    size: 'small',
  },
  'ink-dim': {
    grounds: ['page', 'overlay', 'abyss', 'abyssHalf', 'abyssPanel', 'night', 'panel', 'option', 'card', 'rowHighlight', 'chip'],
    size: 'small',
  },
  'ink-mute': {
    // NOT `chip`: components/PlayerConnection.tsx used to put ink-mute on a
    // haze ground and was moved to ink-dim in M3 P5b, because no ink-mute that
    // still reads as muted clears AA there.
    grounds: ['page', 'overlay', 'abyss', 'abyssHalf', 'abyssPanel', 'night', 'panel', 'option', 'card', 'rowHighlight'],
    size: 'small',
  },
};
```

Note the table already carries the *fixed* `ink-mute` value. That is
deliberate: this task's test is meant to be red on the source, not on the
table, and Task 3 is what makes the source agree with it.

- [ ] **Step 4: Run the test and confirm it is red for the right reason**

Run: `npx vitest run tests/a11y.test.ts`
Expected: the contrast assertions PASS (the table already holds the lifted
value) and the **source scan** section is what is meaningful here. Then run:

```bash
grep -n "ink-mute" app/globals.css
grep -n "text-ink-mute" components/PlayerConnection.tsx
```

Expected: `globals.css` still says `#6d75ab`, and `PlayerConnection` still puts
`text-ink-mute` on `bg-haze/40`. **That divergence is the finding**, and it is
what Task 3 closes. Record both greps' output in the scratch notes.

- [ ] **Step 5: Clear diagnostics and commit**

```bash
git add lib/a11y/palette.ts tests/a11y.test.ts
git commit -m "test(p5b): the palette audit, as a gate"
```

---

### Task 3: Close the contrast findings

**Files:**
- Modify: `app/globals.css` (`--color-ink-mute`)
- Modify: `components/PlayerConnection.tsx` (the dropped chip's foreground)
- Test: `tests/a11y.test.ts` (add one assertion binding the CSS to the mirror)

**Interfaces:**
- Consumes: `TOKENS` from `lib/a11y/palette.ts`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing mirror assertion**

`lib/presentation/tokens.ts` holds no ink token, so nothing currently stops
`app/globals.css` and `lib/a11y/palette.ts` from disagreeing. Append to
`tests/a11y.test.ts`:

```ts
describe('the palette mirror matches app/globals.css', () => {
  const css = readFileSync('app/globals.css', 'utf8');

  for (const [name, value] of Object.entries(TOKENS)) {
    it(`--color-${name} is ${value}`, () => {
      const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6});`));
      expect(match, `--color-${name} not found in app/globals.css`).not.toBeNull();
      expect(match![1].toLowerCase()).toBe(value.toLowerCase());
    });
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/a11y.test.ts`
Expected: FAIL on exactly one case — `--color-ink-mute is #767eb9`, receiving
`#6d75ab`. Every other token matches.

- [ ] **Step 3: Lift the token**

In `app/globals.css`, inside `@theme`:

```css
  /* Ink */
  --color-ink: #eaeeff;
  --color-ink-dim: #a6adde;
  /* Lifted from #6d75ab in M3 P5b (ADR-0055): the old value carried the app's
     11px uppercase micro-labels at 3.99:1 on `night` and 4.28:1 on the answer
     row, both under WCAG AA's 4.5:1 for small text. This is the smallest nudge
     that clears 4.5:1 on every ground it is painted on; lib/a11y/palette.ts
     mirrors it and tests/a11y.test.ts fails if the two drift. */
  --color-ink-mute: #767eb9;
```

- [ ] **Step 4: Move the dropped-player chip off ink-mute**

In `components/PlayerConnection.tsx`, change

```tsx
        (reconnecting ? 'bg-warning/15 text-warning' : 'bg-haze/40 text-ink-mute')
```

to

```tsx
        // `ink-dim`, not `ink-mute`: haze is the lightest ground the app paints
        // text on, and no ink-mute that still reads as muted clears AA there
        // (3.95:1 even after M3 P5b's lift). Every other chip on a haze ground
        // — DrawCard, QuestionCard, StageBroadcast — already uses ink-dim.
        (reconnecting ? 'bg-warning/15 text-warning' : 'bg-haze/40 text-ink-dim')
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/a11y.test.ts`
Expected: PASS — every contrast pair, every CVD rule, the source scan and every
mirror assertion.

Run: `npm test`
Expected: the whole unit suite green, `tests/tokens.test.ts` included — it
mirrors only the canvas subset and holds no ink token, so it must be untouched.
If it fails, the lift reached a value it should not have; stop and report.

- [ ] **Step 6: Look at it, headed**

The number is right; the *look* still needs a human. Run `npm run dev` and check
that the micro-labels read as muted rather than as body text on:

- the restyled lobby's `Starting grid — n joined` heading;
- `QuestionCard`'s `Q{n}/{total}` badge during a READ;
- `ResultsTable`'s caption, column headers and rank numerals;
- `TrackReadout`'s `The track — after Q{n}` heading;
- the gear menu's `Currently running the … profile.` line;
- a dropped player's chip in both the lobby roster and the track rail.

The hierarchy must survive: `ink` > `ink-dim` > `ink-mute` should still read as
three levels, not two.

- [ ] **Step 7: Commit**

```bash
git add app/globals.css components/PlayerConnection.tsx tests/a11y.test.ts
git commit -m "fix(p5b): ink-mute clears WCAG AA on every ground it is painted on"
```

---

### Task 4: The behavioural accessibility sweep

**Files:**
- Create: `e2e/a11y.spec.ts`

**Interfaces:**
- Consumes: `twoPlayerLobby`, the helper M3 P5a's `e2e/countdown.spec.ts`
  introduced. Copy it into this file — every spec in this suite carries its own
  preamble rather than sharing one, which is the house pattern.
- Produces: nothing importable.

- [ ] **Step 1: Write the failing spec**

Create `e2e/a11y.spec.ts`. Four of these five will likely pass first time —
that is the point of an audit, and a green assertion is a recorded measurement,
not a wasted test.

```ts
import { test, expect, type Browser, type Page } from '@playwright/test';

// twoPlayerLobby: copy the helper verbatim from e2e/countdown.spec.ts
// (M3 P5a). It builds a two-question room with a host and one joiner sitting
// in the lobby, and returns { host, joiner, code }.

/** Every focusable control must have a non-empty accessible name. */
async function unnamedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const selector = 'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
    for (const el of Array.from(document.querySelectorAll(selector))) {
      if ((el as HTMLElement).offsetParent === null) continue; // not rendered
      const name =
        el.getAttribute('aria-label') ??
        el.getAttribute('title') ??
        (el as HTMLElement).innerText ??
        '';
      if (name.trim() === '') out.push(el.outerHTML.slice(0, 120));
    }
    return out;
  });
}

test('the landing page is operable and named', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main')).toHaveCount(1);
  expect(await unnamedControls(page)).toEqual([]);

  // Tab reaches every control in visual order. If the first stop turns out to
  // be something else (a browser-inserted stop, a control this plan did not
  // know about), that is a finding to RECORD, not a reason to add tabindex.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /host a game/i })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Room code')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /^join$/i })).toBeFocused();
});

test('a player can join and answer without a pointer', async ({ browser }) => {
  const { host, joiner } = await twoPlayerLobby(browser);
  await host.getByRole('button', { name: /start the race/i }).click();

  const option = joiner.getByTestId('answer-option').first();
  await expect(option).toBeEnabled({ timeout: 30_000 });

  // The documented 1-4 shortcut (components/AnswerButtons.tsx).
  await joiner.keyboard.press('2');
  await expect(joiner.getByTestId('answer-option').nth(1)).toHaveAttribute('data-locked', 'true');
});

test('the readable layer survives 200% text without a horizontal scrollbar', async ({ browser }) => {
  const { host, joiner } = await twoPlayerLobby(browser);
  await joiner.setViewportSize({ width: 390, height: 844 }); // a small phone
  await joiner.addStyleTag({ content: 'html { font-size: 32px !important; }' });

  await host.getByRole('button', { name: /start the race/i }).click();
  await expect(joiner.getByTestId('answer-option').first()).toBeVisible({ timeout: 30_000 });

  const overflow = await joiner.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('prefers-reduced-motion selects the reduced profile', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-profile', 'reduced');
});

test('the canvas is hidden from assistive technology on both surfaces', async ({ browser }) => {
  const { joiner, code } = await twoPlayerLobby(browser);
  await expect(joiner.getByTestId('pixi-stage')).toHaveAttribute('aria-hidden', 'true');

  const tv = await (await browser.newContext()).newPage();
  await tv.goto(`/stage/${code}`);
  await expect(tv.getByTestId('pixi-stage')).toHaveAttribute('aria-hidden', 'true');
  // The broadcast surface deliberately has no <main>: the player surface owns
  // the landmark (components/StageShell.tsx).
  await expect(tv.locator('main')).toHaveCount(0);
});
```

- [ ] **Step 2: Run it and triage**

Run: `npx playwright test e2e/a11y.spec.ts --workers=1 --reporter=line`

For each failure, decide before fixing:

- **A missing accessible name** → add `aria-label` at the site. A defect.
- **A broken Tab order** → the DOM order is wrong; fix the markup, never with
  `tabindex` above 0. A defect.
- **Horizontal overflow at 200%** → find the element with the fixed width. A
  defect; the likely candidates are the answer grid's `min-h`, the roster chips
  and `TrackReadout`'s rail, which is already `overflow-x-auto` and therefore
  fine by design — if the rail is the only overflow, scope the assertion to
  exclude it and say so in a comment rather than removing the test.
- **`data-profile` not `reduced`** → check `MotionProvider`'s hydration; the
  attribute is written after mount, so an `expect` may simply need a longer
  timeout before it counts as a failure.

Record every failure and its disposition — the ones that turn out to be
non-defects are part of the audit record too.

- [ ] **Step 3: Do the screen-reader pass by hand**

No test substitutes for listening to it. On Windows, use Narrator
(`Ctrl+Win+Enter`) or NVDA, and walk the player surface end to end:

1. **Landing** — the heading reads as a heading; the room-code field announces
   "Room code"; the two buttons announce their purpose.
2. **Join gate** — nickname field, avatar choices and colour swatches all
   announce; a chosen swatch announces its selected state.
3. **Lobby** — `Starting grid — n joined` reads as a heading; every roster entry
   reads name, then host/MC, then connection state; the QR announces the join
   URL rather than "graphic".
4. **Countdown** — the numeral is silent (it is `aria-hidden`) and
   "The race is starting." is announced once.
5. **READ → ANSWER** — the question is announced; each option announces its
   glyph-free text and its position; the timer does not chatter (`aria-live="off"`
   on `TimerRing` is deliberate).
6. **REVEAL** — the correct row is identifiable **without colour**: the word
   "correct" is read.
7. **TRACK** — the rail announces rank, name and score; an off-screen marker
   announces its direction via the `title`.
8. **Pause** — `PauseCard`'s `role="status"` announces why the show stopped.
9. **Results** — the winner, the table and the awards all read in a sensible
   order; `sr-only` ranks and "not answered" are audible.

Write down what was actually heard for each, including anything that read
badly. A bad reading that is not fixed becomes an explicitly accepted finding
in Task 7, not a silence.

- [ ] **Step 4: Commit**

```bash
git add e2e/a11y.spec.ts
git add -A   # plus any defect fixes triage produced
git commit -m "test(p5b): keyboard, text scaling, reduced motion and landmark sweep"
```

---

### Task 5: The free-tier budget, computed

**Files:**
- Test: `tests/budget.test.ts`

**Interfaces:**
- Consumes: `PRESENCE_REPORT_MS` from `lib/presence.ts`; `NOMINAL_MS` from
  `lib/staging/beats.ts`; `CEREMONY_MS` from `lib/ceremony/beats.ts`;
  `estimateDurationSeconds` from `lib/rank.ts`.
- Produces: nothing importable. The test's exported value is its failure.

- [ ] **Step 1: Write the test**

Create `tests/budget.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PRESENCE_REPORT_MS } from '@/lib/presence';
import { CEREMONY_MS } from '@/lib/ceremony/beats';
import { estimateDurationSeconds } from '@/lib/rank';

/**
 * PRD §11: "One month of typical office use (3 games/week, 15 players) stays
 * within both free tiers."
 *
 * Computed from the app's own constants rather than written down, so a change
 * that moves the arithmetic — a faster presence cadence, a longer game — turns
 * this red instead of silently invalidating a paragraph in a doc.
 *
 * The ceilings below are the documented free-tier figures at the time of
 * writing. The assertions are HEADROOM checks, not precision ones: the margins
 * are 20x or better, so the conclusion survives the published numbers moving.
 */
const FREE_TIER = {
  /** Supabase Realtime messages per month. */
  messages: 2_000_000,
  /** Supabase Realtime peak concurrent connections. */
  connections: 200,
};

// PRD §11's "typical office use".
const GAMES_PER_MONTH = Math.ceil((3 * 52) / 12); // 13
const PLAYERS = 15;
const STAGE_VIEWS = 1;
const SUBSCRIBERS = PLAYERS + STAGE_VIEWS;
const ROUNDS = 12;
const TIMER_SECONDS = 10; // app/host/new/page.tsx's default

/**
 * Phase broadcasts the host sends per game.
 *
 * One at start_game (COUNTDOWN), then four per round — READ, ANSWER, REVEAL,
 * and the fourth that is TRACK for every round but the last, where it is
 * RESULTS (supabase/migrations/0009_presence.sql's advance_phase).
 */
const PHASE_BROADCASTS = 1 + ROUNDS * 4;

/** One `player_joined` per joiner (app/room/[code]/page.tsx). */
const JOIN_BROADCASTS = PLAYERS;

/** A join and a leave per subscriber, each fanned out to everyone present. */
const PRESENCE_EVENTS = SUBSCRIBERS * SUBSCRIBERS * 2;

const gameSeconds = estimateDurationSeconds(ROUNDS, TIMER_SECONDS) + CEREMONY_MS / 1000;

describe('a month of typical office use fits inside both free tiers', () => {
  it('uses a small fraction of the monthly realtime message allowance', () => {
    const perGame =
      (PHASE_BROADCASTS + JOIN_BROADCASTS) * SUBSCRIBERS + PRESENCE_EVENTS;
    const perMonth = perGame * GAMES_PER_MONTH;

    // Roughly 1,536 per game and 20,000 per month against a 2,000,000 ceiling.
    expect(perMonth).toBeLessThan(FREE_TIER.messages * 0.05);
  });

  it('stays far under the concurrent-connection ceiling', () => {
    expect(SUBSCRIBERS).toBeLessThan(FREE_TIER.connections * 0.25);
    // PRD §9's claim, restated as arithmetic: the ceiling supports several
    // simultaneous rooms, not one.
    expect(Math.floor(FREE_TIER.connections / SUBSCRIBERS)).toBeGreaterThanOrEqual(9);
  });

  it('makes a trivial number of presence RPCs', () => {
    const perGame = Math.ceil((gameSeconds * 1000) / PRESENCE_REPORT_MS);
    // One call every PRESENCE_REPORT_MS from the host alone, whatever the
    // player count (lib/useHostPresenceReporter.ts).
    expect(perGame).toBeLessThan(150);
    expect(perGame * GAMES_PER_MONTH).toBeLessThan(2_000);
  });

  it('writes a database footprint the 24h purge keeps flat', () => {
    // answers + players + room_questions + the room itself.
    const rowsPerGame = PLAYERS * ROUNDS + PLAYERS + ROUNDS + 1;
    expect(rowsPerGame * GAMES_PER_MONTH).toBeLessThan(10_000);
    // And none of it accumulates: purge_rooms() deletes every room 24h after
    // creation (M3 P3b), and the rows cascade with it.
  });

  it('runs a game in about the length PRD §1 promises', () => {
    expect(gameSeconds).toBeGreaterThan(4 * 60);
    expect(gameSeconds).toBeLessThan(12 * 60);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/budget.test.ts`
Expected: PASS, 5 tests. **Record the computed values** — add a temporary
`console.log` of `perGame`, `perMonth` and `gameSeconds`, capture the numbers
for Task 7's record, then remove the log before committing.

If any assertion fails, the finding is real and belongs in Task 7's record with
its arithmetic, not silently widened.

- [ ] **Step 3: Measure the other half of the budget — Vercel**

The test covers Supabase. Vercel's side is bandwidth, and it needs a build:

```bash
npm run build
```

Record the First Load JS for `/`, `/room/[code]`, `/stage/[code]` and
`/host/new` from the route table the build prints. Compute
`firstLoad × SUBSCRIBERS × GAMES_PER_MONTH` as a worst case that assumes no
cache hit at all, and compare it against Vercel Hobby's monthly bandwidth. Put
the numbers and the comparison in Task 7's record. This is a one-off
measurement, not a test: bundle size already has its own signal in the build
output.

- [ ] **Step 4: Commit**

```bash
git add tests/budget.test.ts
git commit -m "test(p5b): the free-tier budget, computed from the app's constants"
```

---

### Task 6: Ten players, twelve questions, no desync

**Files:**
- Create: `scripts/soak.mjs`
- Modify: `package.json` (one script entry)

**Interfaces:**
- Consumes: `@supabase/supabase-js` (already a dependency); `.env.local` for
  the URL and anon key, read exactly the way `scripts/smoke.mjs` reads it.
- Produces: `npm run soak` — exits non-zero on any assertion, and prints a
  measurement block on success.

- [ ] **Step 1: Write the harness**

Create `scripts/soak.mjs`. Reuse `scripts/smoke.mjs`'s env-reading preamble and
`rpc` helper verbatim — read that file first.

```js
// PRD §11: "A full 12-question game with 10 players completes without a
// desync or stall." Run: npm run soak
//
// Ten browsers is the wrong instrument. This machine cannot sustain two
// concurrent Pixi/WebGL contexts under load (CURRENT.md), so ten Playwright
// contexts would measure SwiftShader rather than the game. Desync and stall
// are PROTOCOL failures — a broadcast that never lands, an answer the server
// rejects, a deadline that drifts — and the protocol is fully reachable from
// supabase-js in Node with no renderer at all.
//
// The script plays the host itself. That is not a simplification: the host
// client IS a timer plus advance_phase (lib/useHostDriver.ts), and this is the
// same loop with the same guard against a re-entrant call.

// Copy the preamble from scripts/smoke.mjs verbatim: the `createClient` from
// `@supabase/supabase-js`, `readFileSync`-based .env.local parse,
// `import assert from 'node:assert/strict'`, the `sb` client, and the `rpc`
// helper that throws on `error`.
// ... env + rpc helpers, copied from scripts/smoke.mjs ...

const PLAYERS = 10;
const ROUNDS = 12;
const TIMER_SECONDS = 5; // shortens the run; the assertions are unaffected

// ---- Room and roster -------------------------------------------------------
const room = await rpc('create_room', {
  p_timer_seconds: TIMER_SECONDS,
  p_categories: ['ai-tech', 'fuel', 'corporate'],
  p_tier_counts: [4, 4, 3, 1],
});
if (room.total_rounds !== ROUNDS) throw new Error(`expected ${ROUNDS} rounds`);

// A non-racing MC host, so the answer key is readable (ADR-0040) — the same
// shape scripts/smoke.mjs uses, and the reason it can assert on correctness at
// all now that the bank no longer has a predictable correct_index.
const host = await rpc('join_room', {
  p_code: room.code, p_nickname: 'MC', p_avatar: 'robot', p_color: '#f59e0b',
  p_host_key: room.host_key, p_is_playing: false,
});
const draw = await rpc('get_room_draw', { p_room_id: room.room_id, p_host_key: room.host_key });
const key = draw.questions.map(q => q.correct_index);

const racers = [];
for (let i = 0; i < PLAYERS; i++) {
  racers.push(await rpc('join_room', {
    p_code: room.code, p_nickname: `Racer${i}`, p_avatar: 'duck', p_color: '#38bdf8',
  }));
}

// ---- Ten sockets, each recording every phase event it is told about --------
//
// The host gets its OWN channel, and this is load-bearing rather than tidy:
// Supabase broadcast defaults to `self: false`, so a sender never receives its
// own message. Broadcasting through one of the racers' channels would leave
// that racer missing all 49 events and fail the desync assertion for a reason
// that has nothing to do with the game.
function subscribe(onPhase) {
  return new Promise((resolve, reject) => {
    const ch = sb.channel(`room:${room.code}`);
    if (onPhase) ch.on('broadcast', { event: 'phase' }, ({ payload }) => onPhase(payload));
    ch.subscribe(status => {
      if (status === 'SUBSCRIBED') resolve(ch);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status));
    });
  });
}

const received = racers.map(() => []);
const channels = await Promise.all(
  racers.map((_, i) => subscribe(payload => received[i].push({ at: Date.now(), payload }))),
);
const hostChannel = await subscribe(null);

// ---- The host loop ---------------------------------------------------------
const startedAt = Date.now();
const drift = [];
let sent = 0;

async function advance(fn, args) {
  const evt = await rpc(fn, args);
  sent++;
  // PRD §9: "clients render the countdown against server time offset, so
  // displayed timers drift < 250ms". The event carries both, so the drift a
  // client would render is measurable directly.
  if (evt.ends_at && evt.server_now) {
    drift.push(Math.abs(Date.now() - new Date(evt.server_now).getTime()));
  }
  await hostChannel.send({ type: 'broadcast', event: 'phase', payload: evt });
  return evt;
}

let evt = await advance('start_game', { p_room_id: room.room_id, p_host_key: room.host_key });

while (evt.phase !== 'results') {
  const wait = evt.ends_at ? new Date(evt.ends_at).getTime() - Date.now() : 0;
  if (wait > 0) await new Promise(r => setTimeout(r, wait));

  if (evt.phase === 'answer') {
    // A staircase: racer i is correct on every round after i, so the ten final
    // scores are 12, 11, 10 … 3 — all distinct. That is deliberate. Spreading
    // answers evenly across the four options instead would leave three racers
    // perfectly tied at the top and fire sudden death, which is real behaviour
    // but makes the run length nondeterministic and this a worse instrument.
    // The tiebreak has its own coverage in e2e/tiebreak.spec.ts.
    const round = evt.round;
    const correct = round <= key.length ? key[round - 1] : 0;
    await Promise.all(racers.map((racer, i) =>
      rpc('submit_answer', {
        p_room_id: room.room_id,
        p_player_key: racer.player_key,
        p_round: round,
        p_choice_index: round > i ? correct : (correct + 1) % 4,
      })
    ));
  }
  evt = await advance('advance_phase', { p_room_id: room.room_id, p_host_key: room.host_key });
}

const elapsedMs = Date.now() - startedAt;

// ---- Assertions ------------------------------------------------------------
// 1. No desync: every socket saw every broadcast, in the same order.
const reference = received[0].map(r => `${r.payload.phase}:${r.payload.round}`);
received.forEach((got, i) => {
  const seen = got.map(r => `${r.payload.phase}:${r.payload.round}`);
  assert.equal(seen.length, sent, `Racer${i} received ${seen.length} of ${sent} phase events`);
  assert.deepEqual(seen, reference, `Racer${i} saw a different sequence`);
});

// 2. No stall: the run took about as long as the phases add up to.
//    Same arithmetic as lib/rank.ts's estimateDurationSeconds — restated here
//    rather than imported, because this is a .mjs script and that is a TS
//    module. A 60-second slack covers ten round trips per beat to Tokyo.
const nominal = 3 + ROUNDS * (3 + TIMER_SECONDS + 5 + 4);
assert.ok(elapsedMs < (nominal + 60) * 1000,
  `run took ${(elapsedMs / 1000).toFixed(1)}s against a ${nominal}s nominal`);

// 3. Timer drift stays inside PRD §9's 250ms.
const worstDrift = Math.max(...drift);
assert.ok(worstDrift < 250, `worst clock drift ${worstDrift}ms`);

// 4. Every client agrees on the final standings.
//
//    Taken from what each socket RECEIVED, not from ten identical refetches:
//    the RESULTS phase event carries final_standings in its `payload`
//    (supabase/migrations/0010_the_vanished_host.sql's phase_event), so this
//    compares ten independently delivered copies rather than one server answer
//    asked for ten times.
const finals = received.map(got => got[got.length - 1].payload);
finals.forEach((f, i) => assert.equal(f.phase, 'results', `Racer${i} ended on ${f.phase}`));
const canonical = JSON.stringify(finals[0].payload);
finals.forEach((f, i) =>
  assert.equal(JSON.stringify(f.payload), canonical, `Racer${i} saw different final standings`));
assert.equal(finals[0].payload.length, PLAYERS);

await Promise.all([...channels, hostChannel].map(c => sb.removeChannel(c)));

console.log(`✅ soak passed — ${PLAYERS} players, ${ROUNDS} rounds`);
console.log(`   phase broadcasts sent: ${sent}`);
console.log(`   broadcasts received:   ${received.map(r => r.length).join(', ')}`);
console.log(`   worst clock drift:     ${worstDrift}ms  (PRD §9 budget: 250ms)`);
console.log(`   wall clock:            ${(elapsedMs / 1000).toFixed(1)}s`);
```

Fill in `nominal` from the real phase durations rather than leaving the
expression in a comment — it is `3 + ROUNDS * (3 + TIMER_SECONDS + 5 + 4)`
seconds, matching `estimateDurationSeconds`.

Add to `package.json`:

```json
    "soak": "node scripts/soak.mjs",
```

- [ ] **Step 2: Run it against the local stack**

```bash
npm run soak
```

Expected: `✅ soak passed`, with all ten receive counts equal to the send count.
Iterate here, not against cloud — the local stack has no rate limit and a fast
handshake.

Two failure modes to expect while getting it working, both real bugs in the
harness rather than in the game:

- **A racer's receive count is short by one or two at the start.** The
  subscriptions must all report `SUBSCRIBED` before `start_game` is called; the
  `Promise.all` above is what guarantees it. If it still happens, the ordering
  is wrong.
- **`submit_answer` rejects with a round mismatch.** The round is read off the
  event that opened the ANSWER, never off a variable captured earlier —
  `skip_question` reuses round numbers (ADR-0038).

- [ ] **Step 3: Run it against the cloud project**

This is the measurement that counts: PRD §11's criterion is about the real
stack, and `ap-northeast-1` is a round trip rather than 10ms of loopback — the
exact difference that hid ADR-0048's bug for a whole phase.

Restore the Supabase project from the dashboard first (free tier pauses after
~1 week idle), swap the commented cloud block into `.env.local`, then:

```bash
npm run soak
```

Record the full output block. Restore `.env.local` to local afterwards.

- [ ] **Step 4: Run one real browser alongside**

Numbers are not the whole criterion — "without a desync or stall" is also
something a person sees. With the cloud config still in `.env.local`, start
`npm run dev`, open one browser on the room the soak creates (add a
`console.log` of the join URL at the top of the script), and watch a full
twelve-round game play out with ten scripted racers. Record whether the world,
the standings and the ceremony all stayed coherent.

- [ ] **Step 5: Commit**

```bash
git add scripts/soak.mjs package.json
git commit -m "test(p5b): a ten-player twelve-question soak over real realtime"
```

---

### Task 7: Measure, record, decide, merge

**Files:**
- Create: `docs/ADR/0055-ink-mute-is-an-accessibility-floor.md`
- Create: `docs/progress/M3-P5b-launch-readiness.md`
- Modify: `docs/progress/CURRENT.md`
- Modify: `docs/ADR/README.md` (index row)

- [ ] **Step 1: Measure the frame budget, headed**

PRD §11: "60fps track scene on a mid-range laptop; graceful degradation on a
mid-range phone." Headless cannot answer this — it falls back to SwiftShader and
pins the budget at `minimal` before a test starts (CURRENT.md). Headed, with the
`?perf=1` overlay:

```bash
npm run dev
# then open http://localhost:3000/room/<code>?perf=1
```

Record `fps`, `p50`, `p95` and `dropped` at each of the heaviest moments, with
eight racers in the room:

1. Lobby, full grid.
2. The countdown roll-up (P5a's sequence, eight rigs moving at once).
3. A TRACK beat with an overtake and a streak ignition.
4. The final question, with the world graded neon and the vignette ramping.
5. The podium ceremony with confetti.
6. The same five on `/stage/<code>?perf=1`, which is full-bleed at every phase.

Then prove the degradation is graceful rather than theoretical: with the page
running, paste a synthetic main-thread block into the console (a busy loop of
~40ms every 100ms) and record that `stepBudget` steps the VFX allowance down and
the frame rate recovers, exactly as M2 P2's exit criterion 5 was verified.

Finally, the phone. Open the Vercel deployment
(<https://quiz-game-tau-pearl.vercel.app/>, cloud Supabase restored) on a real
mid-range phone, join a game, and record: the resolved profile (the gear menu
prints it), whether the answer grid stays responsive to taps, and whether the
world visibly stutters. "Graceful degradation" is the criterion — a phone on the
reduced profile at 30fps passes; a phone that drops taps does not.

- [ ] **Step 2: Measure the host setup, twice**

PRD §11: "Host can go from landing page to a started game in < 3 minutes
without instructions."

- **Machine floor.** Time `e2e/host-setup.spec.ts` end to end and record it.
  That is the lower bound with no human deliberation at all.
- **Human run.** Someone who has not been reading this codebase all week takes a
  stopwatch, opens the landing page cold, and gets to `Starting grid` with a
  second device joined. **No instructions, no narration.** Record the wall-clock
  time and, more usefully, every place they hesitated. G1 is measured, per the
  roadmap's P1 exit criteria; this is the same measurement taken again on the
  finished product.

- [ ] **Step 3: Verify the two carried-debt items are closed, and cite the proof**

The roadmap lists both as needing "a decision". Both were closed before this
phase; the decision is to record that.

```bash
git log --oneline -S"direction: 'left' | 'right'" -- lib/world/framing.ts
git log --oneline -S"rowsPerColumn" -- lib/world/geometry.ts
grep -n "OFFSCREEN_ARROW" components/TrackReadout.tsx
npx vitest run tests/geometry.test.ts -t "twenty-player"
```

Expected: `e65999c` gave `offscreenPlayerIds` a per-player `direction` and
`TrackReadout` renders ◀▶▲▼ off it; `58957b4` made `gridAnchors` grow rows
instead of compressing spacing, and the twenty-player test asserts four columns
at full `GRID_COLUMN_WIDTH`. **If either check does not hold, the debt is real
and this task grows a fix** — do not record a closure that is not there.

- [ ] **Step 4: Write ADR-0055**

`docs/ADR/0055-ink-mute-is-an-accessibility-floor.md`, in the format
`docs/ADR/README.md` prescribes. Status Accepted, today's date, Phase `M3 P5b`.

- **Context:** `--color-ink-mute` was chosen by eye and carried the app's 11px
  uppercase micro-labels at 3.99:1 on `night` — under WCAG AA's 4.5:1 for small
  text on nearly every ground it is painted on. Nothing detected it, because
  `lib/presentation/tokens.ts` mirrors only the canvas subset and no ink token
  is in it.
- **Decision:** the ink scale has a floor, and the floor is enforced.
  `--color-ink-mute` is lifted to `#767eb9`; `lib/a11y/palette.ts` mirrors the
  full ink/surface palette plus the *composited* grounds the app actually paints
  on; `tests/a11y.test.ts` fails when a pair drops below its threshold, when the
  mirror and `globals.css` disagree, or when a `text-<token>` class appears that
  the table does not cover. `text-ink-mute` on a `haze` ground is out of bounds:
  no muted value clears AA there.
- **Consequences:** the ink scale can no longer be tuned by eye. A future
  restyle that wants a quieter label either uses `ink-dim` on a darker ground
  or adds a token that passes; and a new translucent surface needs a `GROUNDS`
  entry before text goes on it. The answer palette is *not* held to a pairwise
  separation rule under CVD — measured, the accents do collapse in pairs, and
  the glyph is what carries identity (ADR-0017); the test asserts that collapse
  as a fact so nobody later "fixes" the palette and quietly makes the glyphs
  optional.

Add the index row to `docs/ADR/README.md`.

- [ ] **Step 5: Write the progress doc**

`docs/progress/M3-P5b-launch-readiness.md`, following the shape of
`docs/progress/M3-P4-the-bank.md`, with one section this repo has not had
before: **a §11 scorecard**, one row per criterion, each carrying a *number* and
where it came from.

| PRD §11 criterion | Measurement | Source |
|---|---|---|
| Host to started game < 3 min, unassisted | _(machine floor + human run, from Step 2)_ | `e2e/host-setup.spec.ts`, stopwatch |
| 12 questions, 10 players, no desync or stall | _(broadcasts sent/received, worst drift, wall clock, from Task 6)_ | `npm run soak` against the cloud project |
| 60fps laptop, graceful phone | _(fps/p50/p95/dropped per beat, plus the phone's profile, from Step 1)_ | `?perf=1`, headed |
| Ties resolved per the Fairness Law, sudden death included | _(cite M3 P2a/P2b's verification rather than re-running it)_ | `e2e/tiebreak.spec.ts`, `scripts/smoke.mjs` |
| One month of typical use inside both free tiers | _(messages/month, connections, RPCs, rows, First Load JS × clients, from Task 5)_ | `tests/budget.test.ts`, `npm run build` |

Then: the accessibility findings and their dispositions (including Task 4
Step 3's screen-reader notes verbatim, and any reading that was heard and
accepted rather than fixed); the two carried-debt closures with their commit
hashes; deviations from this plan; and the regression-floor results.

- [ ] **Step 6: Run the full regression floor**

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
npm run test:e2e -- --workers=1
```

Record the counts. A stability, detachment or sub-pixel-layout failure on a
Pixi-heavy spec under load is the documented machine flake — re-run in isolation
and record both results.

- [ ] **Step 7: Update CURRENT.md**

- Current phase → **M3 complete.** P0, P1, P2a/P2b, P3a/P3b, P4, P5a and P5b
  have all merged; the next milestone is v1.
- Move P5a's and P5b's entries out to their progress docs and keep the tracker
  short, as its own header instructs.
- Add a Note: *the ink scale has an accessibility floor, and it is enforced*
  (ADR-0055) — `lib/a11y/palette.ts` mirrors `globals.css`'s ink and surface
  tokens **plus the composited grounds**, and `tests/a11y.test.ts` fails on a
  drift, a below-threshold pair, or an uncovered `text-<token>` class. A new
  translucent surface needs a `GROUNDS` entry before text goes on it.
- Add a Note: *`npm run soak` is the ten-player instrument, and it is a Node
  script on purpose* — this machine cannot sustain ten WebGL contexts, and
  desync is a protocol property. Point at it for any future question of the
  form "does this still work at scale".
- Under "Tech debt / known issues", record anything Task 4's triage or Step 1's
  profiling left open, with its measurement. If nothing is open, say so.
- **Remove both carried-debt mentions** — the off-screen marker's direction and
  the twenty-player grid — citing the commits from Step 3.

- [ ] **Step 8: Commit, merge, push, clean up**

```bash
git add docs/
git commit -m "docs: record M3 P5b — launch readiness"
git checkout main
git merge --no-ff m3-p5b-launch-readiness
git push
git worktree remove <path>   # only if a worktree was used
git branch -d m3-p5b-launch-readiness
```
