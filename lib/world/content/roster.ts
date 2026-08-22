/**
 * The avatar roster as CONTENT (spec §5), in the shape ADR-0007 established
 * for world layers: a draw function plus declarative data, never a code path.
 *
 * Bodies bake in their OWN natural colors. The player's accent color is applied
 * by the rig as a rim light, shadow tint, trail and label underline — never as
 * a body tint, which would make a coffee cup and a rubber duck the same orange
 * blob (spec decision 4).
 *
 * `key` matches lib/avatars.ts exactly: one roster, two renderers.
 */
import type { Graphics } from 'pixi.js';
import { COLOR } from '@/lib/presentation/tokens';

/** Baked texture height in px. Bodies are drawn into a box of this size. */
export const AVATAR_HEIGHT = 128;

/* ── Rig envelope ──────────────────────────────────────────────────────────
 *
 * The numbers `AvatarNode` draws with, hoisted here so the pure layer can size
 * a row pitch and a formation margin against the rig instead of against a
 * literal. P1's `MARKER_ROW_HEIGHT = 74` was sized for a 52-unit puck and was
 * never revisited when P2 replaced the puck with a 165-unit rig, which is how a
 * bunched field ended up drawn off the top of the canvas. Anything that has to
 * know how big a rig is reads it from here.
 */

/** Half-width of the accent rim the rig strokes around the body. */
export const AVATAR_RIM_HALF_WIDTH = 38;

/** Extra ring the LOCAL player's rig strokes outside the rim (the YOU ring). */
export const AVATAR_LOCAL_RING_PAD = 7;

/** Widest the rig gets: the YOU ring, which is the outermost thing it draws. */
export const AVATAR_HALF_WIDTH = AVATAR_RIM_HALF_WIDTH + AVATAR_LOCAL_RING_PAD;

/** Nickname label baseline offset below the feet. */
export const AVATAR_LABEL_Y = 8;

/** How far below the feet the label underline reaches. */
export const AVATAR_LABEL_DROP = 37;

/** Topmost point of a rig, relative to its own feet (negative is up). */
export const AVATAR_RIG_TOP = -(AVATAR_HEIGHT + AVATAR_LOCAL_RING_PAD);

/** Bottommost point of a rig, relative to its own feet. */
export const AVATAR_RIG_BOTTOM = AVATAR_LABEL_DROP;

/** Total vertical extent of a rig, feet-relative top to bottom. */
export const AVATAR_RIG_HEIGHT = AVATAR_RIG_BOTTOM - AVATAR_RIG_TOP;

export interface Point {
  x: number;
  y: number;
}

export type MountName = 'behind' | 'front' | 'crown';

export interface IdleQuirk {
  kind: 'bob' | 'sway' | 'pulse' | 'tilt';
  periodMs: number;
  /** Peak deviation, 0..1. */
  amount: number;
}

export interface AvatarDrawContext {
  width: number;
  height: number;
  color: typeof COLOR;
}

export interface AvatarSpec {
  key: string;
  draw(g: Graphics, ctx: AvatarDrawContext): void;
  idle: IdleQuirk;
  /**
   * Attachment points in rig-local units; origin is the character's feet.
   * `readonly` on purpose: one literal is shared by all twelve specs, so a
   * mutable type would let `spec.mounts.crown.y -= 10` corrupt the roster.
   */
  readonly mounts: Readonly<Record<MountName, Readonly<Point>>>;
  height: number;
}

const MOUNTS: Readonly<Record<MountName, Readonly<Point>>> = {
  behind: { x: -34, y: -46 },
  front: { x: 34, y: -46 },
  crown: { x: 0, y: -104 },
} as const;

function base(
  key: string,
  idle: IdleQuirk,
  draw: AvatarSpec['draw'],
): AvatarSpec {
  return { key, idle, draw, mounts: MOUNTS, height: AVATAR_HEIGHT };
}

/** Rounded body block shared by most silhouettes. */
function body(g: Graphics, w: number, h: number, fill: number, stroke: number): void {
  g.roundRect(-w / 2, -h, w, h, 12).fill({ color: fill });
  g.roundRect(-w / 2, -h, w, h, 12).stroke({ color: stroke, width: 3 });
}

function eyes(g: Graphics, y: number): void {
  g.circle(-11, y, 5).fill({ color: 0xffffff });
  g.circle(11, y, 5).fill({ color: 0xffffff });
  g.circle(-10, y, 2.5).fill({ color: COLOR.void });
  g.circle(12, y, 2.5).fill({ color: COLOR.void });
}

export const ROSTER: readonly AvatarSpec[] = [
  base('coffee', { kind: 'bob', periodMs: 2600, amount: 0.05 }, (g) => {
    body(g, 62, 84, 0xf3ede4, 0xb9a894);
    g.roundRect(-34, -84, 68, 12, 6).fill({ color: 0xd9cbb8 });
    g.ellipse(38, -52, 12, 16).stroke({ color: 0xb9a894, width: 6 });
    eyes(g, -54);
  }),

  base('cactus', { kind: 'sway', periodMs: 3400, amount: 0.06 }, (g) => {
    body(g, 46, 96, 0x4c9a5a, 0x2f6b3c);
    g.roundRect(-40, -74, 22, 34, 10).fill({ color: 0x4c9a5a });
    g.roundRect(18, -86, 22, 40, 10).fill({ color: 0x4c9a5a });
    eyes(g, -62);
  }),

  base('duck', { kind: 'bob', periodMs: 2200, amount: 0.07 }, (g) => {
    g.ellipse(0, -38, 36, 38).fill({ color: 0xffd23f });
    g.circle(4, -78, 26).fill({ color: 0xffd23f });
    g.roundRect(22, -80, 24, 12, 5).fill({ color: 0xf07f1a });
    eyes(g, -84);
  }),

  base('robot', { kind: 'pulse', periodMs: 1800, amount: 0.04 }, (g, c) => {
    body(g, 66, 74, 0x9aa6c4, 0x5d6a8c);
    g.roundRect(-30, -104, 60, 34, 8).fill({ color: 0xc3cde6 });
    g.rect(-2, -128, 4, 24).fill({ color: 0x5d6a8c });
    g.circle(0, -132, 6).fill({ color: c.color.neonCyan });
    eyes(g, -88);
  }),

  base('cat', { kind: 'tilt', periodMs: 3000, amount: 0.05 }, (g, c) => {
    g.ellipse(0, -34, 34, 34).fill({ color: 0x6b5b4e });
    g.circle(0, -76, 30).fill({ color: 0x6b5b4e });
    g.poly([-28, -96, -14, -124, -4, -94]).fill({ color: 0x6b5b4e });
    g.poly([28, -96, 14, -124, 4, -94]).fill({ color: 0x6b5b4e });
    g.poly([-16, -46, 16, -46, 0, -22]).fill({ color: c.color.wrong });
    eyes(g, -80);
  }),

  base('clip', { kind: 'tilt', periodMs: 2400, amount: 0.08 }, (g) => {
    g.roundRect(-22, -104, 44, 104, 22).stroke({ color: 0xc9d3ea, width: 9 });
    g.roundRect(-10, -84, 20, 66, 10).stroke({ color: 0xc9d3ea, width: 9 });
    eyes(g, -66);
  }),

  base('plant', { kind: 'sway', periodMs: 3800, amount: 0.07 }, (g) => {
    g.poly([-26, 0, 26, 0, 20, -40, -20, -40]).fill({ color: 0xb2653f });
    g.ellipse(-20, -62, 18, 26).fill({ color: 0x3f8f52 });
    g.ellipse(20, -62, 18, 26).fill({ color: 0x3f8f52 });
    g.ellipse(0, -84, 16, 30).fill({ color: 0x4fa863 });
    eyes(g, -48);
  }),

  base('donut', { kind: 'pulse', periodMs: 2000, amount: 0.06 }, (g) => {
    g.circle(0, -50, 46).fill({ color: 0xe8b07a });
    g.circle(0, -50, 44).fill({ color: 0xf06fa8 });
    g.circle(0, -50, 16).fill({ color: COLOR.abyss });
    for (const [x, y] of [[-24, -70], [16, -74], [-8, -26], [26, -38]]) {
      g.roundRect(x, y, 12, 5, 2).fill({ color: 0xfff2b2 });
    }
    eyes(g, -58);
  }),

  base('bulb', { kind: 'pulse', periodMs: 1600, amount: 0.09 }, (g) => {
    g.circle(0, -74, 34).fill({ color: 0xffe9a3 });
    g.roundRect(-16, -44, 32, 30, 6).fill({ color: 0xa9b2c9 });
    g.rect(-16, -34, 32, 4).fill({ color: 0x7b8399 });
    eyes(g, -80);
  }),

  base('headset', { kind: 'bob', periodMs: 2800, amount: 0.05 }, (g) => {
    g.roundRect(-38, -104, 76, 20, 10).fill({ color: 0x3b4466 });
    g.roundRect(-44, -92, 22, 46, 10).fill({ color: 0x4d5878 });
    g.roundRect(22, -92, 22, 46, 10).fill({ color: 0x4d5878 });
    body(g, 54, 60, 0x2b3450, 0x4d5878);
    eyes(g, -44);
  }),

  base('juice', { kind: 'tilt', periodMs: 2600, amount: 0.06 }, (g, c) => {
    body(g, 54, 92, 0xf0f4ff, 0xb9c4e0);
    g.roundRect(-27, -92, 54, 26, 4).fill({ color: 0x6fc4d8 });
    g.rect(10, -122, 6, 34).fill({ color: c.color.wrong });
    eyes(g, -56);
  }),

  base('rocket', { kind: 'bob', periodMs: 1900, amount: 0.08 }, (g, c) => {
    g.poly([0, -128, 26, -60, -26, -60]).fill({ color: 0xe8eaf2 });
    body(g, 52, 60, 0xe8eaf2, 0xb0b6c8);
    g.poly([-26, -20, -46, 0, -26, 0]).fill({ color: c.color.wrong });
    g.poly([26, -20, 46, 0, 26, 0]).fill({ color: c.color.wrong });
    g.circle(0, -76, 12).fill({ color: c.color.neonCyan });
    eyes(g, -40);
  }),
];

export function specFor(key: string): AvatarSpec {
  return ROSTER.find(spec => spec.key === key) ?? ROSTER[0];
}
