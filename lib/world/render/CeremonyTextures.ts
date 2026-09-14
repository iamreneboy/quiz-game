/**
 * The ceremony's shared textures: one soft glow, one ring and one spotlight
 * cone, each baked ONCE per renderer from procedural Graphics and then only
 * tinted, scaled and blended (additively) by many sprites.
 *
 * Owned per `Application` through `OwnedCache`, for the same reason
 * AvatarNode's bakes are: a texture belongs to the renderer that generated it.
 *
 * `warmCeremonyTextures` is the head start. It bakes and queues the GPU
 * upload through Pixi's prepare system, which spreads uploads across frames,
 * so the first ceremony frame finds everything resident. It is never
 * REQUIRED: `ceremonyTextures` bakes on demand for a client that mounted
 * straight into the results phase (ADR-0058).
 */
import { Application, FillGradient, Graphics, Rectangle, type Texture } from 'pixi.js';
import { OwnedCache } from './ownedCache';

export interface CeremonyTextureSet {
  /** Radial falloff, white. Anchor at the centre. */
  glow: Texture;
  /** A thin ring with a soft outer halo, white. Anchor at the centre. */
  ring: Texture;
  /** A trapezoid, bright at the apex and fading toward the base, white. Anchor top-centre. */
  cone: Texture;
}

const GLOW_SIZE = 128;
const RING_SIZE = 128;
const CONE_WIDTH = 256;
const CONE_HEIGHT = 256;

/**
 * Half-width of the cone's apex as a fraction of its base half-width. The
 * podium sizes the cone's height AND base width off the same world scale, so
 * this aspect is constant and the trapezoid can be baked once and scaled
 * uniformly rather than rebuilt per frame.
 */
export const CONE_APEX_RATIO = 0.16;

const sets = new OwnedCache<Application, CeremonyTextureSet>();

function bake(app: Application, draw: (g: Graphics) => void, width: number, height: number): Texture {
  const g = new Graphics();
  draw(g);
  const texture = app.renderer.generateTexture({
    target: g,
    frame: new Rectangle(0, 0, width, height),
  });
  g.destroy();
  return texture;
}

// Gradients rather than stacked slices: a stepped bake reads as banding once
// a sprite is scaled up several times, which is exactly what the cone is.
function drawGlow(g: Graphics): void {
  const half = GLOW_SIZE / 2;
  const gradient = new FillGradient({
    type: 'radial',
    center: { x: 0.5, y: 0.5 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.5,
    colorStops: [
      { offset: 0, color: [1, 1, 1, 0.9] },
      { offset: 0.35, color: [1, 1, 1, 0.4] },
      { offset: 0.7, color: [1, 1, 1, 0.1] },
      { offset: 1, color: [1, 1, 1, 0] },
    ],
    textureSpace: 'local',
  });
  g.circle(half, half, half).fill(gradient);
}

function drawRing(g: Graphics): void {
  const cx = RING_SIZE / 2;
  g.circle(cx, cx, cx - 12).stroke({ color: 0xffffff, width: 14, alpha: 0.28 });
  g.circle(cx, cx, cx - 10).stroke({ color: 0xffffff, width: 5, alpha: 0.9 });
}

function drawCone(g: Graphics): void {
  const halfBase = CONE_WIDTH / 2;
  const halfApex = halfBase * CONE_APEX_RATIO;
  const gradient = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    // Brightest at the source, thinning as the light spreads.
    colorStops: [
      { offset: 0, color: [1, 1, 1, 0.7] },
      { offset: 0.5, color: [1, 1, 1, 0.22] },
      { offset: 1, color: [1, 1, 1, 0.03] },
    ],
    textureSpace: 'local',
  });
  g.poly([
    halfBase - halfApex, 0,
    halfBase + halfApex, 0,
    CONE_WIDTH, CONE_HEIGHT,
    0, CONE_HEIGHT,
  ]).fill(gradient);
}

/** The set for this renderer, baking it on first ask. */
export function ceremonyTextures(app: Application): CeremonyTextureSet {
  return sets.get(app, 'ceremony', () => ({
    glow: bake(app, drawGlow, GLOW_SIZE, GLOW_SIZE),
    ring: bake(app, drawRing, RING_SIZE, RING_SIZE),
    cone: bake(app, drawCone, CONE_WIDTH, CONE_HEIGHT),
  }));
}

/**
 * Bake now and push the result to the GPU over the next frames, ahead of the
 * first frame that draws it. Idempotent.
 */
export function warmCeremonyTextures(app: Application): CeremonyTextureSet {
  const set = ceremonyTextures(app);
  try {
    void app.renderer.prepare.upload([set.glow, set.ring, set.cone]);
  } catch {
    // No prepare system on this renderer: the first draw uploads instead.
  }
  return set;
}

/** Drop one renderer's bakes. Call only when THAT renderer is torn down. */
export function clearCeremonyTextures(app: Application): void {
  sets.clear(app, set => {
    for (const texture of Object.values(set)) texture.destroy(true);
  });
}
