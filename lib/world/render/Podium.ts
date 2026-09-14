/**
 * The podium, its light and its sparkle (spec §6, §7).
 *
 * Dumb by contract, exactly like `Avatars`: it maps a CeremonyFrameState onto
 * sprites and graphics and owns NO animation state. `riseProgress` already
 * carries the eased 0..1 (briefly >1 mid-bounce) curve computed in
 * lib/world/podium.ts and `impact` the landing flash's 1..0 decay from
 * lib/ceremony/beats.ts — this class just multiplies, deciding nothing about
 * how the rise feels. Everything that moves on its own (the halo pulse, the
 * light sweeps, the sparkles) is a pure function of `elapsedMs`, so a
 * backgrounded tab or a reload lands on the right picture with no catch-up.
 *
 * Every glow is a sprite on one of four baked textures (CeremonyTextures.ts),
 * additively blended and tinted. Additive sprites on a shared texture are
 * close to free on the GPU; what would NOT be free is a blur or bloom filter,
 * which forces full-screen passes, so there are none here.
 *
 * The spotlight lives here rather than in `Grade` on purpose: Grade is a
 * FULL-SCREEN overlay with a two-value hue, which is the wrong shape for a cone
 * on one character.
 */
import { Container, Graphics, Sprite, Texture, type Application } from 'pixi.js';
import { COLOR } from '@/lib/presentation/tokens';
import type { WorldFrameState } from '../frame';
import { BLOCK_WIDTH } from '../podium';
import { horizonY, worldScale } from '../geometry';
import { ceremonyTextures, warmCeremonyTextures, type CeremonyTextureSet } from './CeremonyTextures';

const PLACE_TINTS: Record<1 | 2 | 3, number> = {
  1: COLOR.gold,
  2: COLOR.silver,
  3: COLOR.bronze,
};

const PLACES: readonly (1 | 2 | 3)[] = [1, 2, 3];

/** Spotlight cone height as a multiple of the winner's block height. */
const CONE_RISE = 6;
/** Sparkle pool size; the budget's `sparkle` allowance scales how many fly. */
const SPARKLES = 40;
const HALO_PULSE_MS = 1250;
const SWEEP_PERIOD_MS = 4200;
/** One sparkle's climb, base to fade-out, at rate 1. */
const SPARKLE_CYCLE_MS = 2600;
const TWO_PI = Math.PI * 2;

interface SparkleSeed {
  /** -1..1 across the cone's base. */
  lane: number;
  /** Cycle-length multiplier, so the swarm never marches in step. */
  rate: number;
  /** 0..1 offset into the cycle. */
  phase: number;
  /** 0..1 size variation. */
  size: number;
  twinkleHz: number;
}

/** Deterministic 0..1 noise per (index, salt): the same swarm on every client. */
function seeded(index: number, salt: number): number {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function additive(texture: Texture, anchorY: number): Sprite {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5, anchorY);
  sprite.blendMode = 'add';
  sprite.visible = false;
  return sprite;
}

export class Podium {
  readonly container = new Container();
  /**
   * The blocks mirrored below the horizon. A separate node because the road
   * (TrackSurface) is opaque below the horizon and sits ABOVE this container;
   * WorldScene places the reflection above the road instead.
   */
  readonly reflection = new Graphics();

  private readonly pool = new Graphics();
  private readonly cone = additive(Texture.EMPTY, 0);
  /**
   * Two soft shafts of light inside the cone. The glow texture stretched tall
   * and narrow, anchored near its bright core so the shaft is strongest just
   * below the apex and fades before the ground: soft in both axes for free,
   * where a baked strip showed its column edges once scaled.
   */
  private readonly beams = [additive(Texture.EMPTY, 0.3), additive(Texture.EMPTY, 0.3)];
  private readonly placeGlows = new Map<1 | 2 | 3, Sprite>();
  private readonly halo = additive(Texture.EMPTY, 0.5);
  private readonly blocks = new Graphics();
  private readonly rings = new Map<1 | 2 | 3, Sprite>();
  private readonly sparkles: Sprite[] = [];
  private readonly seeds: SparkleSeed[] = [];
  private textures: CeremonyTextureSet | null = null;
  /**
   * What the blocks, reflection and pool were last drawn for. Graphics are
   * rebuilt only when this changes: once every block has landed and the
   * flares have faded — most of the ceremony — the podium is static geometry
   * and the per-frame rebuild it used to pay is pure waste.
   */
  private drawnKey = '';

  constructor(private readonly app: Application) {
    // Back to front: light on the ground, then the cone and its sweeps, the
    // per-place glows and the winner's halo, the blocks themselves, the
    // landing rings, and the sparkle swarm on top.
    this.container.addChild(this.pool, this.cone, ...this.beams);
    for (const place of PLACES) {
      const glow = additive(Texture.EMPTY, 0.5);
      this.placeGlows.set(place, glow);
      this.container.addChild(glow);
    }
    this.container.addChild(this.halo, this.blocks);
    for (const place of PLACES) {
      const ring = additive(Texture.EMPTY, 0.5);
      this.rings.set(place, ring);
      this.container.addChild(ring);
    }
    this.container.visible = false;
    this.reflection.visible = false;
  }

  /** True once the textures are bound and the sparkle pool exists. */
  get warmed(): boolean {
    return this.textures !== null;
  }

  /**
   * Bind the baked textures, queue their GPU upload and build the sparkle
   * pool. Called by WorldScene during the final round (ADR-0058), and by
   * `update` itself if the ceremony arrives first. Idempotent.
   */
  warm(): void {
    if (this.textures) return;
    const set = warmCeremonyTextures(this.app);
    this.bind(set);
  }

  private bind(set: CeremonyTextureSet): void {
    this.textures = set;
    this.cone.texture = set.cone;
    for (const beam of this.beams) beam.texture = set.glow;
    for (const glow of this.placeGlows.values()) glow.texture = set.glow;
    this.halo.texture = set.glow;
    for (const ring of this.rings.values()) ring.texture = set.ring;

    for (let i = 0; i < SPARKLES; i++) {
      const sparkle = additive(set.glow, 0.5);
      sparkle.tint = COLOR.gold;
      this.container.addChild(sparkle);
      this.sparkles.push(sparkle);
      this.seeds.push({
        lane: seeded(i, 1) * 2 - 1,
        rate: 0.7 + seeded(i, 2) * 0.8,
        phase: seeded(i, 3),
        size: seeded(i, 4),
        twinkleHz: 1.5 + seeded(i, 5) * 3,
      });
    }
  }

  update(frame: WorldFrameState): void {
    const { ceremony, camera, viewport, allowance, elapsedMs } = frame;
    this.container.visible = ceremony.active;
    this.reflection.visible = ceremony.active;
    if (!ceremony.active) return;

    if (!this.textures) this.bind(ceremonyTextures(this.app));

    const scale = worldScale(camera, viewport);
    const originX = viewport.width / 2 - camera.centerX * scale;
    const ground = horizonY(viewport);
    const toScreenX = (worldX: number) => originX + worldX * scale;
    const glowK = allowance.ceremonyGlow;
    const motion = allowance.ceremonyMotion;

    const key =
      `${viewport.width}x${viewport.height}|${scale.toFixed(4)}|${originX.toFixed(2)}|` +
      ceremony.blocks.map(b => `${b.place}:${b.riseProgress.toFixed(4)}:${b.impact.toFixed(3)}`).join(',') +
      `|${ceremony.spotlight ? ceremony.spotlightX.toFixed(2) : 'dark'}`;
    const redraw = key !== this.drawnKey;
    if (redraw) {
      this.drawnKey = key;
      this.blocks.clear();
      this.reflection.clear();
      this.pool.clear();
    }
    for (const glow of this.placeGlows.values()) glow.visible = false;
    for (const ring of this.rings.values()) ring.visible = false;

    for (const block of ceremony.blocks) {
      // Progress 0 draws nothing: the rig standing in front of the block is
      // at ground level, and the two rise together off the same value.
      const height = block.height * block.riseProgress * scale;
      if (height <= 0) continue;

      const width = BLOCK_WIDTH * scale;
      const x = toScreenX(block.x) - width / 2;
      const cx = x + width / 2;
      const top = ground - height;
      const tint = PLACE_TINTS[block.place];
      const cap = Math.max(1, 3 * scale);

      if (redraw) {
        this.blocks
          .rect(x, top, width, height)
          .fill({ color: COLOR.dusk })
          .stroke({ color: tint, width: Math.max(1, 2 * scale), alpha: 0.9 });

        // A bright cap, so the block reads as a solid the rig stands ON.
        this.blocks.rect(x, top, width, cap).fill({ color: tint, alpha: 0.85 });

        // The landing flash: the whole face goes white for an instant and
        // decays with `impact`.
        if (block.impact > 0) {
          this.blocks.rect(x, top, width, height).fill({ color: 0xffffff, alpha: 0.5 * block.impact });
        }

        // Mirror below the horizon, dimmer and shorter than the real thing.
        const depth = height * 0.55;
        this.reflection.rect(x, ground, width, depth).fill({ color: COLOR.dusk, alpha: 0.4 });
        this.reflection.rect(x, ground, width, depth).fill({ color: tint, alpha: 0.1 });
        this.reflection.rect(x, ground, width, cap).fill({ color: tint, alpha: 0.35 });
      }

      const glow = this.placeGlows.get(block.place)!;
      glow.visible = true;
      glow.tint = tint;
      glow.x = cx;
      glow.y = top;
      glow.width = width * 2.4;
      glow.height = width * 1.3;
      glow.alpha = (0.32 + 0.35 * block.impact) * glowK * Math.min(1, block.riseProgress);

      if (block.impact > 0) {
        // A dust ring that spreads and thins as the impact fades.
        const ring = this.rings.get(block.place)!;
        const spread = width * (1.1 + 1.8 * (1 - block.impact));
        ring.visible = true;
        ring.tint = tint;
        ring.x = cx;
        ring.y = ground;
        ring.width = spread;
        ring.height = spread * 0.32;
        ring.alpha = 0.85 * block.impact;
      }
    }

    const winner = ceremony.blocks.find(b => b.place === 1);
    const lit = ceremony.spotlight && winner !== undefined;
    this.cone.visible = lit;
    this.halo.visible = lit;
    for (const beam of this.beams) beam.visible = lit;
    if (!lit) {
      for (const sparkle of this.sparkles) sparkle.visible = false;
      return;
    }

    const cx = toScreenX(ceremony.spotlightX);
    const coneHeight = winner.height * CONE_RISE * scale;
    const top = ground - coneHeight;
    const halfBottom = BLOCK_WIDTH * 1.1 * scale;

    this.cone.tint = COLOR.gold;
    this.cone.x = cx;
    this.cone.y = top;
    this.cone.width = halfBottom * 2;
    this.cone.height = coneHeight;
    this.cone.alpha = 0.5 * glowK;

    // A pool on the ground, so the light has somewhere to land.
    if (redraw) {
      this.pool.ellipse(cx, ground, halfBottom, halfBottom * 0.18).fill({ color: COLOR.gold, alpha: 0.22 });
    }

    // Two shafts crossing slowly inside the cone. Still at `minimal`.
    const sweep = motion ? Math.sin((elapsedMs / SWEEP_PERIOD_MS) * TWO_PI) : 0;
    const sweepLate = motion ? Math.sin((elapsedMs / SWEEP_PERIOD_MS) * TWO_PI + 1.3) : 0;
    this.beams[0].rotation = -0.12 - 0.07 * sweep;
    this.beams[1].rotation = 0.12 + 0.07 * sweepLate;
    for (const beam of this.beams) {
      beam.tint = COLOR.gold;
      beam.x = cx;
      beam.y = top;
      beam.width = halfBottom * 0.55;
      beam.height = coneHeight * 1.5;
      beam.alpha = 0.3 * glowK;
    }

    // The winner's halo, breathing behind the gold block.
    const winnerTop = ground - winner.height * winner.riseProgress * scale;
    const pulse = motion ? 0.5 + 0.5 * Math.sin((elapsedMs / HALO_PULSE_MS) * TWO_PI) : 0.5;
    const haloSize = halfBottom * 2.6;
    this.halo.tint = COLOR.gold;
    this.halo.x = cx;
    this.halo.y = winnerTop - BLOCK_WIDTH * 0.35 * scale;
    this.halo.width = haloSize;
    this.halo.height = haloSize;
    this.halo.alpha = (0.28 + 0.14 * pulse) * glowK;

    // Sparkles drifting up through the light. Each is a pure function of
    // elapsed and its seed: no velocity, no age, nothing to reset.
    const count = Math.round(SPARKLES * allowance.sparkle);
    const base = ground - winner.height * 0.2 * scale;
    const rise = winner.height * 2.2 * scale;
    for (let i = 0; i < this.sparkles.length; i++) {
      const sparkle = this.sparkles[i];
      sparkle.visible = i < count;
      if (!sparkle.visible) continue;

      const seed = this.seeds[i];
      const t = (elapsedMs / (SPARKLE_CYCLE_MS * seed.rate) + seed.phase) % 1;
      const twinkle = 0.55 + 0.45 * Math.sin((elapsedMs / 1000) * TWO_PI * seed.twinkleHz + seed.phase * 10);
      const diameter = (6 + 6 * seed.size) * scale;

      sparkle.x = cx + seed.lane * halfBottom * 0.85 + Math.sin(t * TWO_PI * 1.5 + seed.phase * TWO_PI) * 6 * scale;
      sparkle.y = base - t * rise;
      sparkle.width = diameter;
      sparkle.height = diameter;
      sparkle.alpha = Math.sin(t * Math.PI) * twinkle * glowK;
    }
  }

  destroy(): void {
    // `texture: false`: the sprites' textures belong to CeremonyTextures'
    // per-renderer cache, which WorldScene clears on its own teardown.
    this.container.destroy({ children: true, context: true, style: true, texture: false });
    this.reflection.destroy();
  }
}
