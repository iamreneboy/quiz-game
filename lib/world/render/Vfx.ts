/**
 * One pooled emitter for the whole scene (spec §8).
 *
 * The pool is allocated ONCE at construction and never grows: a budget change
 * alters emission rates, never allocation. Particles are recycled oldest-first
 * when the ceiling is reached.
 */
import { Container, Graphics } from 'pixi.js';
import { COLOR } from '@/lib/presentation/tokens';
import type { VfxKind, VfxRequest } from '../choreographer';
import type { VfxAllowance } from '../vfxBudget';

const MAX_PARTICLES = 240;
const LIFETIME_MS = 700;

const TINTS: Record<VfxKind, number> = {
  trail: COLOR.neonCyan,
  lightning: COLOR.neonLime,
  ignition: COLOR.warning,
  arena: COLOR.neonMagenta,
  pulse: COLOR.neonCyan,
  spark: COLOR.warning,
  flame: 0xff8a3d,
  inferno: COLOR.wrong,
  turbo: COLOR.warning,
  glow: COLOR.gold,
};

interface Particle {
  sprite: Graphics;
  bornAt: number;
  lifetimeMs: number;
  vx: number;
  vy: number;
}

export class Vfx {
  readonly container = new Container();
  private readonly pool: Particle[] = [];
  private cursor = 0;

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const sprite = new Graphics();
      sprite.circle(0, 0, 4).fill({ color: 0xffffff });
      sprite.visible = false;
      this.container.addChild(sprite);
      this.pool.push({ sprite, bornAt: -Infinity, lifetimeMs: LIFETIME_MS, vx: 0, vy: 0 });
    }
  }

  /**
   * @param x,y screen-space position of the request's mount point
   */
  emit(request: VfxRequest, x: number, y: number, scale: number, allowance: VfxAllowance, now: number): void {
    if (!allowance.particles) return;
    // Intensity is the emission probability per frame; 1 emits every frame.
    if (Math.random() > request.intensity) return;

    const particle = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;

    particle.sprite.tint = TINTS[request.kind];
    particle.sprite.visible = true;
    particle.sprite.x = x;
    particle.sprite.y = y;
    particle.sprite.scale.set(scale * (0.6 + Math.random() * 0.8));
    particle.sprite.alpha = request.intensity;
    particle.bornAt = now;
    particle.lifetimeMs = LIFETIME_MS * (0.6 + Math.random() * 0.6);
    particle.vx = (Math.random() - 0.5) * 40 - (request.mount === 'behind' ? 60 : 0);
    particle.vy = -20 - Math.random() * 60;
  }

  update(now: number, dtMs: number): void {
    for (const particle of this.pool) {
      if (!particle.sprite.visible) continue;
      const age = now - particle.bornAt;
      if (age >= particle.lifetimeMs) {
        particle.sprite.visible = false;
        continue;
      }
      const k = age / particle.lifetimeMs;
      particle.sprite.x += (particle.vx * dtMs) / 1000;
      particle.sprite.y += (particle.vy * dtMs) / 1000;
      particle.sprite.alpha = (1 - k) * 0.9;
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
