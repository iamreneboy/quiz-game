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
