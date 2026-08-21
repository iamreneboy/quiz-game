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
