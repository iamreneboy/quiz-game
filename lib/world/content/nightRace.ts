/**
 * The night-race world (PRD §8): office park -> neon city -> stadium.
 *
 * Every draw function runs ONCE at init to bake a tile texture; nothing here is
 * called per frame. Randomness is seeded so a tile looks the same on every
 * client and across reloads.
 */
import type { Graphics } from 'pixi.js';
import { COLOR } from '@/lib/presentation/tokens';
import type { WorldDefinition, ZoneSpec } from '../definition';

/** Deterministic 0..1 sequence — a tiny LCG, seeded per layer. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function skyBand(g: Graphics, width: number, height: number, top: number, bottom: number): void {
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const color = mix(top, bottom, t);
    g.rect(0, (height * i) / steps, width, height / steps + 1).fill({ color });
  }
}

function mix(a: number, b: number, t: number): number {
  const ch = (v: number, shift: number) => (v >> shift) & 0xff;
  const r = Math.round(ch(a, 16) + (ch(b, 16) - ch(a, 16)) * t);
  const gr = Math.round(ch(a, 8) + (ch(b, 8) - ch(a, 8)) * t);
  const bl = Math.round(ch(a, 0) + (ch(b, 0) - ch(a, 0)) * t);
  return (r << 16) | (gr << 8) | bl;
}

/** Blocky skyline used by all three zones with different palettes and densities. */
function skyline(seed: number, fill: number, density: number, maxHeight: number, windowsOnly = false) {
  return (g: Graphics, ctx: { width: number; height: number }): void => {
    const random = seeded(seed);
    let x = 0;
    while (x < ctx.width) {
      const w = 40 + random() * 70;
      const h = ctx.height * (0.35 + random() * maxHeight);
      if (!windowsOnly) {
        g.rect(x, ctx.height - h, w, h).fill({ color: fill });
      }
      if (random() < density) {
        // Lit windows, a fixed grid inside each block.
        for (let wy = ctx.height - h + 14; wy < ctx.height - 16; wy += 22) {
          for (let wx = x + 10; wx < x + w - 12; wx += 18) {
            if (random() < 0.45) {
              g.rect(wx, wy, 7, 10).fill({ color: COLOR.warning, alpha: 0.55 });
            }
          }
        }
      }
      x += w + 12 + random() * 26;
    }
  };
}

const officePark: ZoneSpec = {
  id: 'officePark',
  skyTop: COLOR.night,
  skyBottom: COLOR.dusk,
  layers: [
    {
      id: 'op-sky',
      parallax: 0.05,
      repeatWidth: 1600,
      height: 900,
      anchorY: 1,
      layerTier: 'core',
      draw: (g, ctx) => skyBand(g, ctx.width, ctx.height, COLOR.night, COLOR.dusk),
    },
    {
      id: 'op-hills',
      parallax: 0.18,
      repeatWidth: 1400,
      height: 320,
      anchorY: 0.62,
      layerTier: 'rich',
      draw: (g, ctx) => {
        const random = seeded(11);
        for (let x = -100; x < ctx.width + 100; x += 180) {
          const h = ctx.height * (0.45 + random() * 0.4);
          g.ellipse(x, ctx.height, 220, h).fill({ color: COLOR.abyss, alpha: 0.9 });
        }
      },
    },
    {
      id: 'op-blocks',
      parallax: 0.38,
      repeatWidth: 1200,
      height: 380,
      anchorY: 0.9,
      layerTier: 'core',
      draw: skyline(7, COLOR.abyss, 0.85, 0.35),
    },
    {
      id: 'op-windows',
      parallax: 0.38,
      repeatWidth: 1200,
      height: 380,
      anchorY: 0.9,
      layerTier: 'rich',
      draw: skyline(7013, COLOR.warning, 1, 0.3, true),
      ambient: { kind: 'flicker', periodMs: 5200, amount: 0.35 },
    },
    {
      id: 'op-carpark',
      parallax: 0.7,
      repeatWidth: 900,
      height: 160,
      anchorY: 1,
      layerTier: 'rich',
      draw: (g, ctx) => {
        const random = seeded(29);
        for (let x = 20; x < ctx.width - 40; x += 120) {
          g.rect(x, ctx.height - 44, 76, 30).fill({ color: COLOR.haze, alpha: 0.75 });
          g.rect(x + 24, ctx.height - 58, 30, 16).fill({ color: COLOR.haze, alpha: 0.6 });
          if (random() < 0.4) {
            g.circle(x + 88, ctx.height - 96, 5).fill({ color: COLOR.warning, alpha: 0.8 });
            g.rect(x + 86, ctx.height - 96, 4, 96).fill({ color: COLOR.haze, alpha: 0.5 });
          }
        }
      },
    },
  ],
};

const neonCity: ZoneSpec = {
  id: 'neonCity',
  skyTop: COLOR.void,
  skyBottom: COLOR.haze,
  layers: [
    {
      id: 'nc-sky',
      parallax: 0.05,
      repeatWidth: 1600,
      height: 900,
      anchorY: 1,
      layerTier: 'core',
      draw: (g, ctx) => skyBand(g, ctx.width, ctx.height, COLOR.void, COLOR.haze),
    },
    {
      id: 'nc-far',
      parallax: 0.2,
      repeatWidth: 1500,
      height: 520,
      anchorY: 0.8,
      layerTier: 'rich',
      draw: skyline(101, COLOR.abyss, 0.5, 0.55),
    },
    {
      id: 'nc-towers',
      parallax: 0.42,
      repeatWidth: 1300,
      height: 620,
      anchorY: 0.95,
      layerTier: 'core',
      draw: skyline(202, COLOR.night, 0.95, 0.6),
    },
    {
      id: 'nc-signs',
      parallax: 0.42,
      repeatWidth: 1300,
      height: 620,
      anchorY: 0.95,
      layerTier: 'rich',
      draw: (g, ctx) => {
        const random = seeded(303);
        const neons = [COLOR.neonCyan, COLOR.neonMagenta, COLOR.neonLime];
        for (let x = 40; x < ctx.width - 60; x += 150) {
          const color = neons[Math.floor(random() * neons.length)];
          const h = 24 + random() * 70;
          const y = ctx.height * (0.25 + random() * 0.4);
          g.rect(x, y, 12, h).fill({ color, alpha: 0.85 });
          g.rect(x - 5, y - 5, 22, h + 10).fill({ color, alpha: 0.18 });
        }
      },
      ambient: { kind: 'pulse', periodMs: 3400, amount: 0.28 },
    },
    {
      id: 'nc-barrier',
      parallax: 0.78,
      repeatWidth: 700,
      height: 140,
      anchorY: 1,
      layerTier: 'rich',
      draw: (g, ctx) => {
        for (let x = 0; x < ctx.width; x += 90) {
          g.rect(x, ctx.height - 40, 62, 26).fill({ color: COLOR.dusk });
          g.rect(x, ctx.height - 44, 62, 5).fill({ color: COLOR.neonCyan, alpha: 0.7 });
        }
      },
    },
  ],
};

const stadium: ZoneSpec = {
  id: 'stadium',
  skyTop: COLOR.abyss,
  skyBottom: COLOR.dusk,
  layers: [
    {
      id: 'st-sky',
      parallax: 0.05,
      repeatWidth: 1600,
      height: 900,
      anchorY: 1,
      layerTier: 'core',
      draw: (g, ctx) => skyBand(g, ctx.width, ctx.height, COLOR.abyss, COLOR.dusk),
    },
    {
      id: 'st-bowl',
      parallax: 0.24,
      repeatWidth: 1800,
      height: 560,
      anchorY: 0.92,
      layerTier: 'core',
      draw: (g, ctx) => {
        g.moveTo(0, ctx.height)
          .lineTo(ctx.width * 0.14, ctx.height * 0.3)
          .lineTo(ctx.width * 0.86, ctx.height * 0.3)
          .lineTo(ctx.width, ctx.height)
          .closePath()
          .fill({ color: COLOR.night });
        for (let y = ctx.height * 0.34; y < ctx.height * 0.92; y += 26) {
          g.rect(ctx.width * 0.16, y, ctx.width * 0.68, 12).fill({ color: COLOR.dusk, alpha: 0.8 });
        }
      },
    },
    {
      id: 'st-crowd',
      parallax: 0.24,
      repeatWidth: 1800,
      height: 560,
      anchorY: 0.92,
      layerTier: 'rich',
      draw: (g, ctx) => {
        const random = seeded(555);
        for (let y = ctx.height * 0.36; y < ctx.height * 0.9; y += 26) {
          for (let x = ctx.width * 0.17; x < ctx.width * 0.83; x += 13) {
            if (random() < 0.5) {
              g.circle(x, y + 6, 3.4).fill({ color: COLOR.gold, alpha: 0.14 + random() * 0.2 });
            }
          }
        }
      },
      ambient: { kind: 'flicker', periodMs: 2600, amount: 0.22 },
    },
    {
      id: 'st-floods',
      parallax: 0.36,
      repeatWidth: 900,
      height: 620,
      anchorY: 0.95,
      layerTier: 'rich',
      draw: (g, ctx) => {
        for (const x of [ctx.width * 0.2, ctx.width * 0.8]) {
          g.rect(x - 4, ctx.height * 0.16, 8, ctx.height * 0.5).fill({ color: COLOR.abyss });
          g.rect(x - 34, ctx.height * 0.1, 68, 22).fill({ color: COLOR.silver, alpha: 0.9 });
          g.moveTo(x - 34, ctx.height * 0.13)
            .lineTo(x - 150, ctx.height)
            .lineTo(x + 150, ctx.height)
            .lineTo(x + 34, ctx.height * 0.13)
            .closePath()
            .fill({ color: COLOR.silver, alpha: 0.07 });
        }
      },
      ambient: { kind: 'sweep', periodMs: 7200, amount: 0.4 },
    },
    {
      id: 'st-pitwall',
      parallax: 0.82,
      repeatWidth: 640,
      height: 150,
      anchorY: 1,
      layerTier: 'rich',
      draw: (g, ctx) => {
        for (let x = 0; x < ctx.width; x += 80) {
          g.rect(x, ctx.height - 46, 56, 32).fill({ color: COLOR.night });
          g.rect(x, ctx.height - 50, 56, 6).fill({ color: COLOR.gold, alpha: 0.75 });
        }
      },
    },
  ],
};

export const NIGHT_RACE: WorldDefinition = {
  id: 'night-race',
  zones: [officePark, neonCity, stadium],
  road: {
    surface: COLOR.abyss,
    edge: COLOR.haze,
    tick: COLOR.dusk,
    finish: COLOR.silver,
  },
};
