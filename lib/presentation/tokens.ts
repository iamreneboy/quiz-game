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
  /** A move slow enough to read AS a move on a TV. Stage direction only. */
  push: 2600,
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
