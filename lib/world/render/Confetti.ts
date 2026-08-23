/**
 * Ceremony confetti (spec §8).
 *
 * Its OWN pool, not `render/Vfx.ts`'s. That pool is 240 slots allocated once
 * at construction and medal glows are pushed through it (choreographer.ts:304),
 * so confetti at ceremony density would evict exactly the crowns the podium
 * exists to show. The physics disagree too: Vfx is avatar-mounted, upward,
 * sub-second and circular; confetti is viewport-wide, gravity-driven,
 * multi-second and rotating.
 *
 * The pool is allocated LAZILY, on the first frame that asks for confetti, so
 * the lobby and every round pay nothing for it.
 */
import { Container, Graphics } from 'pixi.js';
import { COLOR, RACER_COLORS } from '@/lib/presentation/tokens';
import type { WorldFrameState } from '../frame';

const MAX_PIECES = 180;
const LIFETIME_MS = 3200;
const PIECE_WIDTH = 7;
const PIECE_HEIGHT = 11;
const GRAVITY = 220;      // px/s^2
const FLUTTER_HZ = 1.6;

interface Piece {
  sprite: Graphics;
  age: number;
  lifetimeMs: number;
  vx: number;
  vy: number;
  spin: number;
  phase: number;
}

export class Confetti {
  readonly container = new Container();
  private pool: Piece[] = [];
  /** The static stand-in used when the budget forbids particles. */
  private readonly wash = new Graphics();
  private washAge = -1;
  private burstDone = false;

  constructor() {
    this.container.addChild(this.wash);
    this.wash.visible = false;
  }

  update(frame: WorldFrameState, dtMs: number): void {
    const { ceremony, allowance, viewport } = frame;

    if (!ceremony.active || !ceremony.confetti) {
      this.reset();
      return;
    }

    if (allowance.confetti <= 0) {
      this.updateWash(dtMs, viewport.width, viewport.height);
      return;
    }

    if (!this.burstDone) {
      this.burst(allowance.confetti, viewport.width, ceremony);
      this.burstDone = true;
    }

    this.step(dtMs, viewport.height);
  }

  /**
   * One burst, not a continuous emitter: the roadmap's confetti is a MOMENT.
   * A drizzle that never stops is what makes a ceremony feel cheap.
   */
  private burst(density: number, width: number, ceremony: WorldFrameState['ceremony']): void {
    const count = Math.round(MAX_PIECES * density);
    this.ensurePool(count);

    // Tint from the top three's accents plus gold, so the burst is specific to
    // who actually won rather than generic.
    const tints = ceremony.blocks.length > 0
      ? [COLOR.gold, ...RACER_COLORS.slice(0, 3)]
      : [COLOR.gold, ...RACER_COLORS];

    for (let i = 0; i < count; i++) {
      const piece = this.pool[i];
      piece.sprite.visible = true;
      piece.sprite.tint = tints[i % tints.length];
      piece.sprite.x = Math.random() * width;
      piece.sprite.y = -Math.random() * 200;
      piece.sprite.rotation = Math.random() * Math.PI * 2;
      piece.sprite.alpha = 1;
      piece.age = 0;
      piece.lifetimeMs = LIFETIME_MS * (0.7 + Math.random() * 0.6);
      piece.vx = (Math.random() - 0.5) * 90;
      piece.vy = 40 + Math.random() * 120;
      // No rotation at `lean`: the budget sheds motion before it sheds pieces.
      piece.spin = density >= 1 ? (Math.random() - 0.5) * 5 : 0;
      piece.phase = Math.random() * Math.PI * 2;
    }
  }

  private step(dtMs: number, height: number): void {
    const dt = dtMs / 1000;
    for (const piece of this.pool) {
      if (!piece.sprite.visible) continue;

      piece.age += dtMs;
      if (piece.age >= piece.lifetimeMs || piece.sprite.y > height + 40) {
        piece.sprite.visible = false;
        continue;
      }

      piece.vy += GRAVITY * dt;
      piece.phase += FLUTTER_HZ * dt * Math.PI * 2;
      piece.sprite.x += (piece.vx + Math.sin(piece.phase) * 40) * dt;
      piece.sprite.y += piece.vy * dt;
      piece.sprite.rotation += piece.spin * dt;

      // Fade only over the last quarter, so the air stays full while it lasts.
      const k = piece.age / piece.lifetimeMs;
      piece.sprite.alpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
    }
  }

  /**
   * The `minimal` stand-in: one gold wash that fades once, opacity only.
   *
   * Reduced motion should cost the celebration its MOTION, not its existence —
   * degrading to nothing deletes the moment the phase was built for.
   */
  private updateWash(dtMs: number, width: number, height: number): void {
    if (this.washAge < 0) {
      this.wash.clear().rect(0, 0, width, height).fill({ color: COLOR.gold });
      this.wash.visible = true;
      this.washAge = 0;
    }
    this.washAge += dtMs;
    const k = Math.min(1, this.washAge / 800);
    this.wash.alpha = 0.28 * (1 - k);
    if (k >= 1) this.wash.visible = false;
  }

  private ensurePool(count: number): void {
    for (let i = this.pool.length; i < count; i++) {
      const sprite = new Graphics();
      sprite
        .rect(-PIECE_WIDTH / 2, -PIECE_HEIGHT / 2, PIECE_WIDTH, PIECE_HEIGHT)
        .fill({ color: 0xffffff });
      sprite.visible = false;
      this.container.addChild(sprite);
      this.pool.push({
        sprite, age: 0, lifetimeMs: LIFETIME_MS, vx: 0, vy: 0, spin: 0, phase: 0,
      });
    }
  }

  private reset(): void {
    if (this.burstDone) {
      for (const piece of this.pool) piece.sprite.visible = false;
      this.burstDone = false;
    }
    if (this.washAge >= 0) {
      this.wash.visible = false;
      this.washAge = -1;
    }
  }

  destroy(): void {
    // `{ children: true }` alone strands every pooled Graphics' `_ownedContext`
    // in Pixi v8 — the same trap render/Vfx.ts documents at its destroy().
    this.container.destroy({ children: true, context: true, style: true, texture: false });
  }
}
