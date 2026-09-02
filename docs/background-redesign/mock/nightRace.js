// Browser mirror of deliverable/lib/world/content/nightRace.ts (types stripped, COLOR inlined).
window.CB = window.CB || {};
(() => {
const COLOR = { void: 0x05060f, abyss: 0x0a0c1c, night: 0x121734, dusk: 0x1c2350, haze: 0x2b3370, neonCyan: 0x35f2ff, neonMagenta: 0xff4fd8, neonLime: 0xc6ff4a, correct: 0x3ce69b, wrong: 0xff5d73, warning: 0xffb43d, gold: 0xffd166, silver: 0xd5dcee, bronze: 0xe08a4c };

/** Deterministic 0..1 sequence — a tiny LCG, seeded per layer. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function mix(a, b, t) {
  const ch = (v, shift) => (v >> shift) & 0xff;
  const r = Math.round(ch(a, 16) + (ch(b, 16) - ch(a, 16)) * t);
  const gr = Math.round(ch(a, 8) + (ch(b, 8) - ch(a, 8)) * t);
  const bl = Math.round(ch(a, 0) + (ch(b, 0) - ch(a, 0)) * t);
  return (r << 16) | (gr << 8) | bl;
}

/** Vertical gradient band, colour AND alpha interpolated top -> bottom. */
function band(g, x, y, w, h, top, bottom, steps, aTop, aBottom) {
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    g.rect(x, y + (h * i) / steps, w, h / steps + 1).fill({ color: mix(top, bottom, t), alpha: aTop + (aBottom - aTop) * t });
  }
}

/** Ground fog rising from a tile's bottom edge — the base of every layer dissolves. */
function fog(g, ctx, depth, color, alpha) {
  band(g, 0, ctx.height - depth, ctx.width, depth, color, color, 8, 0, alpha);
}

/** Sky: abyss -> zone top -> zone bottom, sparse stars, and a light-pollution glow at the horizon. */
function sky(g, ctx, top, bottom, glow, glowAlpha, stars, seed) {
  const { width: W, height: H } = ctx;
  band(g, 0, 0, W, H * 0.3, COLOR.abyss, top, 6, 1, 1);
  band(g, 0, H * 0.3, W, H * 0.7, top, bottom, 16, 1, 1);
  const r = seeded(seed);
  for (let i = 0; i < stars; i++) {
    const x = r() * W;
    const y = r() * r() * H * 0.6;
    const s = r() < 0.12 ? 2 : 1;
    g.rect(x, y, s, s).fill({ color: COLOR.silver, alpha: 0.2 + r() * 0.55 });
  }
  band(g, 0, H * 0.66, W, H * 0.34, glow, glow, 12, 0, glowAlpha);
}

/** A soft glow: three nested rects at falling alpha. */
function halo(g, x, y, w, h, color, alpha) {
  g.rect(x - 6, y - 6, w + 12, h + 12).fill({ color, alpha: alpha * 0.08 });
  g.rect(x - 3, y - 3, w + 6, h + 6).fill({ color, alpha: alpha * 0.18 });
  g.rect(x, y, w, h).fill({ color, alpha });
}



/** Glass starts below the roof line: lower for a setback (the wide tier), tighter otherwise. */
function glassTop(b, H) {
  return H - b.h + (b.roof >= 0.4 && b.roof < 0.7 ? b.h * 0.28 : b.h * 0.1) + 8;
}

/** Deterministic building layout, shared by a zone's body layer and its lights layer. */
function skyline(seed, W, H, o) {
  const r = seeded(seed);
  const list = [];
  let x = 10;
  for (;;) {
    const w = o.minW + r() * (o.maxW - o.minW);
    if (x + w > W - 10) break;
    const h = H * (o.minH + r() * (o.maxH - o.minH));
    const b = {
      x, w, h,
      roof: r() * o.roofMax,
      side: r() < 0.5 ? -1 : 1,
      cols: 0, rows: 0, lit: [],
      antenna: r() < 0.3,
      tank: r() < 0.3,
      a1: r(), a2: r(),
    };
    b.cols = Math.max(0, Math.floor((w - 12) / o.cellX));
    b.rows = Math.max(0, Math.floor((H - glassTop(b, H) - 10) / o.cellY));
    // Whole floors go dark together — a building at night is lit by floor, not by desk.
    for (let ry = 0; ry < b.rows; ry++) {
      const floor = r() < o.litProb * 1.6;
      for (let cx = 0; cx < b.cols; cx++) b.lit.push(floor && r() < 0.7);
    }
    list.push(b);
    x += w + o.gapMin + r() * o.gapVar;
  }
  return list;
}

function body(g, b, H, color, alpha) {
  const top = H - b.h;
  if (b.roof < 0.4) {
    g.rect(b.x, top, b.w, b.h).fill({ color, alpha });
    g.rect(b.x - 2, top - 5, b.w + 4, 6).fill({ color, alpha });
  } else if (b.roof < 0.7) {
    const t2 = b.h * 0.28;
    const w2 = b.w * 0.55;
    const x2 = b.side < 0 ? b.x : b.x + b.w - w2;
    g.rect(b.x, top + t2, b.w, b.h - t2).fill({ color, alpha });
    g.rect(x2, top, w2, t2 + 1).fill({ color, alpha });
    g.rect(x2 - 2, top - 4, w2 + 4, 5).fill({ color, alpha });
  } else if (b.roof < 0.88) {
    g.moveTo(b.x, H)
      .lineTo(b.x, top + b.h * 0.12)
      .lineTo(b.x + b.w * (b.side < 0 ? 0.35 : 0.65), top)
      .lineTo(b.x + b.w, top + b.h * 0.06)
      .lineTo(b.x + b.w, H)
      .closePath()
      .fill({ color, alpha });
  } else {
    g.rect(b.x, top + b.h * 0.1, b.w, b.h * 0.9).fill({ color, alpha });
    g.moveTo(b.x, top + b.h * 0.1)
      .lineTo(b.x + b.w / 2, top - b.h * 0.1)
      .lineTo(b.x + b.w, top + b.h * 0.1)
      .closePath()
      .fill({ color, alpha });
  }
  if (b.antenna) {
    const len = 14 + b.a2 * 30;
    g.rect(b.x + b.w * (0.2 + b.a1 * 0.6), top - len, 2, len + 4).fill({ color, alpha });
  }
  if (b.tank && b.roof < 0.7) {
    const tx = b.x + b.w * (b.side < 0 ? 0.72 : 0.12);
    g.rect(tx, top - 10, 10, 11).fill({ color, alpha });
    g.ellipse(tx + 5, top - 10, 5, 2.5).fill({ color, alpha });
  }
}

function glass(g, b, H, o, color, alpha, litOnly, wx, wy) {
  const y0 = glassTop(b, H);
  for (let ry = 0; ry < b.rows; ry++) {
    for (let cx = 0; cx < b.cols; cx++) {
      const lit = b.lit[ry * b.cols + cx];
      if (lit !== litOnly) continue;
      const x = b.x + 6 + cx * o.cellX;
      const y = y0 + ry * o.cellY;
      if (litOnly) g.rect(x - 1, y - 1, wx + 2, wy + 2).fill({ color, alpha: alpha * 0.25 });
      g.rect(x, y, wx, wy).fill({ color, alpha });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Zone 1 — office park. Horizontal, quiet, sodium-warm. Late-shift lights.   */
/* -------------------------------------------------------------------------- */

const CAMPUS = {
  minW: 90, maxW: 210, minH: 0.28, maxH: 0.58, gapMin: 26, gapVar: 60,
  cellX: 16, cellY: 18, litProb: 0.16, roofMax: 0.7,
};

function tree(g, x, base, s, color, alpha) {
  g.rect(x - 2 * s, base - 22 * s, 4 * s, 22 * s).fill({ color, alpha });
  g.ellipse(x, base - 34 * s, 16 * s, 14 * s).fill({ color, alpha });
  g.ellipse(x - 10 * s, base - 26 * s, 12 * s, 10 * s).fill({ color, alpha });
  g.ellipse(x + 11 * s, base - 27 * s, 11 * s, 10 * s).fill({ color, alpha });
}

const officePark = {
  id: 'officePark',
  skyTop: COLOR.night,
  skyBottom: COLOR.dusk,
  layers: [
    {
      id: 'op-sky',
      parallax: 0.04,
      repeatWidth: 1024,
      height: 900,
      anchorY: 1,
      layerTier: 'core',
      draw: (g, ctx) => sky(g, ctx, COLOR.night, COLOR.dusk, COLOR.warning, 0.07, 110, 3),
    },
    {
      id: 'op-hills',
      parallax: 0.14,
      repeatWidth: 1600,
      height: 260,
      anchorY: 0.66,
      layerTier: 'rich',
      draw: (g, ctx) => {
        const r = seeded(11);
        const { width: W, height: H } = ctx;
        // Three ridges, far to near: haze, then dusk, then night — each lower and darker.
        for (let x = -200; x < W + 200; x += 120 + r() * 140) {
          g.ellipse(x, H + 20, 180 + r() * 220, H * (0.55 + r() * 0.4)).fill({ color: COLOR.haze, alpha: 0.38 });
        }
        fog(g, ctx, 160, COLOR.dusk, 0.7);
        for (let x = -200; x < W + 200; x += 160 + r() * 160) {
          g.ellipse(x, H + 30, 220 + r() * 200, H * (0.3 + r() * 0.25)).fill({ color: COLOR.dusk, alpha: 0.95 });
        }
        for (let x = -100; x < W + 200; x += 260 + r() * 200) {
          const rx = 240 + r() * 160, h = H * (0.14 + r() * 0.14);
          g.ellipse(x, H + 30, rx, h).fill({ color: COLOR.night });
          // A treeline on the ridge: bumps that read as canopy, not teeth.
          for (let t = x - rx * 0.8; t < x + rx * 0.8; t += 12 + r() * 12) {
            const y = H + 30 - h * Math.sqrt(Math.max(0, 1 - ((t - x) / rx) ** 2));
            g.circle(t, y - 4 - r() * 6, 6 + r() * 7).fill({ color: COLOR.night });
          }
        }
        fog(g, ctx, 70, COLOR.dusk, 0.6);
      },
    },
    {
      id: 'op-campus',
      parallax: 0.36,
      repeatWidth: 1400,
      height: 300,
      anchorY: 0.92,
      layerTier: 'core',
      draw: (g, ctx) => {
        const list = skyline(7, ctx.width, ctx.height, CAMPUS);
        for (const b of list) {
          body(g, b, ctx.height, COLOR.night, 1);
          // Lit edge on one face, so the block reads as a volume under a sky.
          g.rect(b.side < 0 ? b.x : b.x + b.w - 2, ctx.height - b.h + 6, 2, b.h - 6).fill({ color: COLOR.dusk, alpha: 0.9 });
          glass(g, b, ctx.height, CAMPUS, COLOR.dusk, 0.7, false, 9, 10);
          // Lobby: a low band of light at street level.
          g.rect(b.x + 4, ctx.height - 16, b.w - 8, 14).fill({ color: COLOR.haze, alpha: 0.5 });
        }
        fog(g, ctx, 70, COLOR.dusk, 0.55);
      },
    },
    {
      id: 'op-lit',
      parallax: 0.36,
      repeatWidth: 1400,
      height: 300,
      anchorY: 0.92,
      layerTier: 'rich',
      draw: (g, ctx) => {
        const list = skyline(7, ctx.width, ctx.height, CAMPUS);
        for (const b of list) {
          glass(g, b, ctx.height, CAMPUS, COLOR.warning, 0.6, true, 9, 10);
          g.rect(b.x + 4, ctx.height - 16, b.w - 8, 14).fill({ color: COLOR.warning, alpha: 0.18 });
          if (b.antenna) {
            const len = 14 + b.a2 * 30;
            g.circle(b.x + b.w * (0.2 + b.a1 * 0.6) + 1, ctx.height - b.h - len, 2).fill({ color: COLOR.wrong, alpha: 0.8 });
          }
        }
      },
      ambient: { kind: 'flicker', periodMs: 6400, amount: 0.22 },
    },
    {
      id: 'op-lot',
      parallax: 0.68,
      repeatWidth: 1000,
      height: 220,
      anchorY: 1,
      layerTier: 'rich',
      draw: (g, ctx) => {
        const r = seeded(29);
        const { width: W, height: H } = ctx;
        // Hedge line the whole lot sits behind.
        for (let x = -10; x < W + 10; x += 22) g.ellipse(x, H - 6, 16, 12 + r() * 5).fill({ color: COLOR.abyss });
        // Lamp posts with sodium heads and a soft pool of light.
        for (let x = 60 + r() * 60; x < W - 60; x += 220 + r() * 90) {
          g.rect(x - 2, H - 150, 4, 150).fill({ color: COLOR.abyss });
          g.rect(x - 2, H - 152, 26, 4).fill({ color: COLOR.abyss });
          g.moveTo(x + 14, H - 146).lineTo(x - 70, H).lineTo(x + 100, H).lineTo(x + 30, H - 146).closePath().fill({ color: COLOR.warning, alpha: 0.05 });
          g.ellipse(x + 22, H - 148, 8, 4).fill({ color: COLOR.warning, alpha: 0.9 });
          g.ellipse(x + 22, H - 148, 14, 8).fill({ color: COLOR.warning, alpha: 0.2 });
        }
        // Parked cars, rounded, near-black.
        for (let x = 110; x < W - 90; x += 120 + r() * 40) {
          if (r() < 0.25) continue;
          g.roundRect(x, H - 34, 70, 22, 6).fill({ color: COLOR.void });
          g.roundRect(x + 14, H - 48, 40, 18, 7).fill({ color: COLOR.void });
          g.rect(x + 18, H - 45, 32, 8).fill({ color: COLOR.dusk, alpha: 0.6 });
          g.circle(x + 16, H - 12, 7).fill({ color: COLOR.void });
          g.circle(x + 54, H - 12, 7).fill({ color: COLOR.void });
        }
        for (let x = 20; x < W; x += 320 + r() * 120) tree(g, x, H - 4, 1.1 + r() * 0.5, COLOR.void, 1);
      },
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Zone 2 — neon city. Vertical, dense, saturated. Three depths of towers.    */
/* -------------------------------------------------------------------------- */

const FAR_TOWERS = {
  minW: 26, maxW: 70, minH: 0.35, maxH: 1, gapMin: 4, gapVar: 22,
  cellX: 10, cellY: 12, litProb: 0, roofMax: 1,
};
const MID_TOWERS = {
  minW: 50, maxW: 130, minH: 0.32, maxH: 0.92, gapMin: 10, gapVar: 40,
  cellX: 11, cellY: 13, litProb: 0.14, roofMax: 1,
};

const neonCity = {
  id: 'neonCity',
  skyTop: COLOR.void,
  skyBottom: COLOR.haze,
  layers: [
    {
      id: 'nc-sky',
      parallax: 0.04,
      repeatWidth: 1024,
      height: 900,
      anchorY: 1,
      layerTier: 'core',
      draw: (g, ctx) => sky(g, ctx, COLOR.void, COLOR.haze, COLOR.neonMagenta, 0.14, 30, 5),
    },
    {
      id: 'nc-far',
      parallax: 0.16,
      repeatWidth: 1600,
      height: 520,
      anchorY: 0.78,
      layerTier: 'rich',
      draw: (g, ctx) => {
        const list = skyline(101, ctx.width, ctx.height, FAR_TOWERS);
        for (const b of list) {
          body(g, b, ctx.height, COLOR.haze, 0.55);
          if (b.h > ctx.height * 0.8) g.circle(b.x + b.w / 2, ctx.height - b.h - 6, 2).fill({ color: COLOR.wrong, alpha: 0.7 });
        }
        fog(g, ctx, 280, COLOR.haze, 0.95);
      },
    },
    {
      id: 'nc-towers',
      parallax: 0.4,
      repeatWidth: 1400,
      height: 640,
      anchorY: 0.95,
      layerTier: 'core',
      draw: (g, ctx) => {
        const list = skyline(202, ctx.width, ctx.height, MID_TOWERS);
        for (const b of list) {
          body(g, b, ctx.height, COLOR.night, 1);
          g.rect(b.side < 0 ? b.x : b.x + b.w - 2, ctx.height - b.h + 10, 2, b.h - 10).fill({ color: COLOR.haze, alpha: 0.8 });
          // Only some towers show their glass grid; the rest stay solid, which is what keeps it from reading as a texture.
          if (b.a2 > 0.3) glass(g, b, ctx.height, MID_TOWERS, COLOR.dusk, 0.55, false, 5, 7);
          glass(g, b, ctx.height, MID_TOWERS, COLOR.silver, 0.3, true, 5, 7);
        }
        fog(g, ctx, 140, COLOR.haze, 0.6);
      },
    },
    {
      id: 'nc-neon',
      parallax: 0.4,
      repeatWidth: 1400,
      height: 640,
      anchorY: 0.95,
      layerTier: 'rich',
      draw: (g, ctx) => {
        const list = skyline(202, ctx.width, ctx.height, MID_TOWERS);
        const neons = [COLOR.neonCyan, COLOR.neonMagenta, COLOR.neonLime, COLOR.neonCyan, COLOR.neonMagenta];
        const H = ctx.height;
        list.forEach((b, i) => {
          const color = neons[i % neons.length];
          const top = H - b.h;
          // Crown: a lit roof line on flat and setback roofs.
          if (b.roof < 0.7 && b.a1 > 0.3) halo(g, b.x, top - 2, b.w, 2, color, 0.85);
          // Spire tip on spires.
          if (b.roof >= 0.88) halo(g, b.x + b.w / 2 - 2, top - b.h * 0.1 - 2, 4, 4, color, 0.9);
          // Vertical sign down one flank on the taller towers.
          if (b.h > H * 0.45 && b.a2 > 0.35) {
            const sh = Math.min(b.h * 0.45, 40 + b.a1 * 90);
            const sx = b.side < 0 ? b.x + 6 : b.x + b.w - 16;
            halo(g, sx, top + 24, 10, sh, color, 0.85);
          }
          // Street-level sign board, wide and low, on a few.
          if (b.a1 < 0.35 && b.w > 70) halo(g, b.x + 8, H - 34, b.w - 16, 8, neons[(i + 2) % neons.length], 0.7);
        });
        // Colour bleed onto the street below the signs.
        band(g, 0, H - 60, ctx.width, 60, COLOR.neonMagenta, COLOR.neonCyan, 6, 0, 0.1);
      },
      ambient: { kind: 'pulse', periodMs: 3400, amount: 0.25 },
    },
    {
      id: 'nc-overpass',
      parallax: 0.76,
      repeatWidth: 900,
      height: 200,
      anchorY: 1,
      layerTier: 'rich',
      draw: (g, ctx) => {
        const { width: W, height: H } = ctx;
        const deckY = H - 118;
        for (let x = 40; x < W; x += 225) g.rect(x, deckY + 22, 20, H - deckY - 22).fill({ color: COLOR.abyss });
        g.rect(0, deckY, W, 24).fill({ color: COLOR.abyss });
        g.rect(0, deckY - 12, W, 3).fill({ color: COLOR.night });
        for (let x = 0; x < W; x += 24) g.rect(x, deckY - 12, 2, 12).fill({ color: COLOR.night });
        g.rect(0, deckY + 24, W, 2).fill({ color: COLOR.neonCyan, alpha: 0.55 });
        for (let x = 30; x < W; x += 75) {
          g.ellipse(x, deckY + 30, 14, 5).fill({ color: COLOR.neonCyan, alpha: 0.12 });
          g.circle(x, deckY + 28, 2.5).fill({ color: COLOR.neonCyan, alpha: 0.9 });
        }
        fog(g, ctx, 40, COLOR.void, 0.6);
      },
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Zone 3 — stadium. One continuous grandstand: the race is INSIDE the bowl.  */
/* -------------------------------------------------------------------------- */

const BAY = 300;

const stadium = {
  id: 'stadium',
  skyTop: COLOR.abyss,
  skyBottom: COLOR.dusk,
  layers: [
    {
      id: 'st-sky',
      parallax: 0.04,
      repeatWidth: 1024,
      height: 900,
      anchorY: 1,
      layerTier: 'core',
      draw: (g, ctx) => sky(g, ctx, COLOR.abyss, COLOR.dusk, COLOR.silver, 0.13, 40, 9),
    },
    {
      id: 'st-masts',
      parallax: 0.18,
      repeatWidth: 1800,
      height: 420,
      anchorY: 0.8,
      layerTier: 'rich',
      draw: (g, ctx) => {
        const { width: W, height: H } = ctx;
        // The city the arena was built in, far and faint.
        const list = skyline(404, W, H * 0.5, { ...FAR_TOWERS, minH: 0.2, maxH: 0.7 });
        for (const b of list) body(g, b, H, COLOR.haze, 0.3);
        // Flood masts: pairs of heads on tall poles, light fanning down.
        for (let x = 300; x < W; x += 600) {
          g.rect(x - 3, H * 0.14, 6, H * 0.86).fill({ color: COLOR.night });
          g.rect(x - 34, H * 0.1, 68, 18).fill({ color: COLOR.night });
          for (let i = 0; i < 4; i++) g.rect(x - 30 + i * 16, H * 0.1 + 4, 12, 10).fill({ color: COLOR.silver, alpha: 0.85 });
          g.moveTo(x - 34, H * 0.13).lineTo(x - 210, H).lineTo(x + 210, H).lineTo(x + 34, H * 0.13).closePath().fill({ color: COLOR.silver, alpha: 0.06 });
          g.rect(x - 34, H * 0.1 - 10, 68, 10).fill({ color: COLOR.silver, alpha: 0.12 });
        }
        fog(g, ctx, 120, COLOR.dusk, 0.85);
      },
      ambient: { kind: 'sweep', periodMs: 7600, amount: 0.3 },
    },
    {
      id: 'st-stand',
      parallax: 0.3,
      repeatWidth: 1800,
      height: 380,
      anchorY: 0.93,
      layerTier: 'core',
      draw: (g, ctx) => {
        const r = seeded(555);
        const { width: W, height: H } = ctx;
        const roofY = H * 0.16;
        // Canopy: a slab with a slight sag per bay, silver lip along its edge.
        g.rect(0, roofY, W, 16).fill({ color: COLOR.dusk });
        for (let x = 0; x < W; x += BAY) {
          g.moveTo(x, roofY + 16).lineTo(x + BAY / 2, roofY + 30).lineTo(x + BAY, roofY + 16).closePath().fill({ color: COLOR.dusk });
        }
        g.rect(0, roofY - 3, W, 3).fill({ color: COLOR.silver, alpha: 0.45 });
        // Upper tier (flood-lit, so lighter) and lower tier (in the canopy's shadow), raked rows as bands.
        const tiers = [
          [roofY + 40, H * 0.5, COLOR.dusk, COLOR.night],
          [H * 0.56, H * 0.84, COLOR.night, COLOR.dusk],
        ];
        for (const [y0, y1, base, row] of tiers) {
          g.rect(0, y0, W, y1 - y0).fill({ color: base });
          for (let y = y0 + 6; y < y1 - 6; y += 14) {
            g.rect(0, y, W, 5).fill({ color: row, alpha: 0.7 });
            // The crowd: heads, one per ~5px, jittered, two values, thinning toward the aisles.
            for (let x = r() * 5; x < W; x += 5 + r() * 3) {
              if (r() < 0.5) g.rect(x, y - 2 + r() * 3, 2, 3).fill({ color: r() < 0.5 ? COLOR.haze : COLOR.abyss, alpha: 0.7 });
            }
          }
        }
        // Under-canopy shadow on the upper tier.
        band(g, 0, roofY + 30, W, 60, COLOR.abyss, COLOR.abyss, 6, 0.7, 0);
        // Structure: pillars every bay, aisles every half bay, gantry between the tiers.
        for (let x = 0; x < W; x += BAY) {
          g.rect(x - 5, roofY, 10, H * 0.56 - roofY).fill({ color: COLOR.abyss });
          g.rect(x - 2, H * 0.56, 4, H * 0.3).fill({ color: COLOR.abyss, alpha: 0.7 });
          g.rect(x + BAY / 2 - 3, roofY + 40, 6, H * 0.84 - roofY - 40).fill({ color: COLOR.abyss, alpha: 0.6 });
        }
        g.rect(0, H * 0.5, W, H * 0.06).fill({ color: COLOR.abyss });
        // Concourse wall with a run of hoardings, and vomitories at the base.
        g.rect(0, H * 0.84, W, H * 0.16).fill({ color: COLOR.abyss });
        for (let x = 20; x < W - 40; x += 100) g.rect(x, H * 0.86, 80, 16).fill({ color: COLOR.night });
        for (let x = BAY / 2; x < W; x += BAY) {
          g.rect(x - 22, H * 0.9, 44, H * 0.1).fill({ color: COLOR.void });
          g.ellipse(x, H * 0.9, 22, 10).fill({ color: COLOR.void });
        }
        fog(g, ctx, 40, COLOR.dusk, 0.35);
      },
    },
    {
      id: 'st-crowd',
      parallax: 0.3,
      repeatWidth: 1800,
      height: 380,
      anchorY: 0.93,
      layerTier: 'rich',
      draw: (g, ctx) => {
        const r = seeded(556);
        const { width: W, height: H } = ctx;
        const roofY = H * 0.16;
        // Flood cones from the masts, falling across the upper tier.
        for (let x = 300; x < W; x += 600) {
          g.moveTo(x - 60, roofY).lineTo(x - 260, H * 0.56).lineTo(x + 260, H * 0.56).lineTo(x + 60, roofY).closePath().fill({ color: COLOR.silver, alpha: 0.07 });
        }
        // LED ribbon around the tier break — the arena's own accent colour.
        band(g, 0, H * 0.515 + 8, W, 26, COLOR.gold, COLOR.gold, 5, 0.18, 0);
        halo(g, 0, H * 0.515, W, 8, COLOR.gold, 0.9);
        // Canopy lip catches the floods; hoardings glow silver.
        band(g, 0, roofY - 3, W, 18, COLOR.silver, COLOR.silver, 4, 0.25, 0);
        for (let x = 20; x < W - 40; x += 100) g.rect(x + 3, H * 0.86 + 3, 74, 10).fill({ color: COLOR.silver, alpha: 0.14 });
        // Camera flashes in the stands: bright specks with a soft bloom.
        const tiers = [[roofY + 44, H * 0.5], [H * 0.56, H * 0.86]];
        for (const [y0, y1] of tiers) {
          for (let i = 0; i < 70; i++) {
            const x = r() * W;
            const y = y0 + r() * (y1 - y0);
            const a = 0.3 + r() * 0.7;
            g.circle(x, y, 4).fill({ color: COLOR.silver, alpha: a * 0.12 });
            g.rect(x - 1, y - 1, 2, 2).fill({ color: COLOR.silver, alpha: a });
          }
        }
      },
      ambient: { kind: 'flicker', periodMs: 2400, amount: 0.35 },
    },
    {
      id: 'st-pitwall',
      parallax: 0.8,
      repeatWidth: 800,
      height: 180,
      anchorY: 1,
      layerTier: 'rich',
      draw: (g, ctx) => {
        const { width: W, height: H } = ctx;
        g.rect(0, H - 44, W, 44).fill({ color: COLOR.night });
        halo(g, 0, H - 48, W, 4, COLOR.gold, 0.8);
        // Hoardings on the wall, blank glass panels catching the floods.
        for (let x = 30; x < W - 60; x += 200) {
          g.rect(x, H - 38, 120, 26).fill({ color: COLOR.dusk });
          g.rect(x + 4, H - 34, 112, 18).fill({ color: COLOR.silver, alpha: 0.08 });
        }
        // Tyre stacks at the bay ends: two rows, offset, silver-banded.
        for (let x = 170; x < W; x += 400) {
          for (let row = 0; row < 2; row++) {
            for (let c = 0; c < 3 - row; c++) {
              const cx = x + c * 24 + row * 12;
              const cy = H - 12 - row * 21;
              g.circle(cx, cy, 12).fill({ color: COLOR.void });
              g.circle(cx, cy, 8).stroke({ color: COLOR.silver, width: 3, alpha: 0.4 });
            }
          }
        }
      },
    },
  ],
};

const NIGHT_RACE = {
  id: 'night-race',
  zones: [officePark, neonCity, stadium],
  road: {
    surface: COLOR.abyss,
    edge: COLOR.haze,
    tick: COLOR.dusk,
    finish: COLOR.silver,
  },
};

window.CB.NIGHT_RACE = NIGHT_RACE;
window.CB.COLOR = COLOR;
})();
