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
