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
