/**
 * The global mood grade (spec §6): one full-screen overlay whose colour and
 * strength come from game progress plus escalation. Kept strictly separate from
 * zone blending — this is the dial P3 turns for the final question.
 */
import { Graphics } from 'pixi.js';
import { COLOR } from '@/lib/presentation/tokens';
import type { Profile } from '@/lib/presentation/profile';
import type { GradeState } from '../zones';
import type { Viewport } from '../geometry';

const GRADIENT_STEPS = 8;

export class Grade {
  readonly graphic = new Graphics();
  private lastKey = '';

  constructor(private readonly profile: Profile) {}

  update(grade: GradeState, viewport: Viewport): void {
    const key = `${grade.hue}:${grade.intensity.toFixed(3)}:${viewport.width}x${viewport.height}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const color = grade.hue === 'neon' ? COLOR.neonMagenta : COLOR.void;
    const peak = grade.intensity * (grade.hue === 'neon' ? 0.34 : 0.5);
    this.graphic.clear();

    // Ladder (spec §9): high gets a vignette-style gradient, reduced a flat tint.
    if (this.profile === 'reduced') {
      this.graphic.rect(0, 0, viewport.width, viewport.height).fill({ color, alpha: peak });
      return;
    }

    const band = viewport.height / GRADIENT_STEPS;
    for (let i = 0; i < GRADIENT_STEPS; i++) {
      // Heaviest at the top and bottom edges, lightest across the middle.
      const distance = Math.abs(i - (GRADIENT_STEPS - 1) / 2) / ((GRADIENT_STEPS - 1) / 2);
      this.graphic
        .rect(0, i * band, viewport.width, band + 1)
        .fill({ color, alpha: peak * (0.45 + 0.55 * distance) });
    }
  }

  destroy(): void {
    this.graphic.destroy();
  }
}
