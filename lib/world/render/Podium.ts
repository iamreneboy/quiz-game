/**
 * The podium and its spotlight (spec §6, §7).
 *
 * Dumb by contract, exactly like `Avatars`: it maps a CeremonyFrameState onto
 * graphics and owns NO animation state. `riseProgress` already carries the
 * eased 0..1 (briefly >1 mid-bounce) curve computed in lib/world/podium.ts —
 * this class just multiplies, deciding nothing about how the rise feels.
 *
 * The spotlight lives here rather than in `Grade` on purpose: Grade is a
 * FULL-SCREEN overlay with a two-value hue, which is the wrong shape for a cone
 * on one character.
 */
import { Container, Graphics } from 'pixi.js';
import { COLOR } from '@/lib/presentation/tokens';
import type { WorldFrameState } from '../frame';
import { BLOCK_WIDTH } from '../podium';
import { horizonY, worldScale } from '../geometry';

const PLACE_TINTS: Record<1 | 2 | 3, number> = {
  1: COLOR.gold,
  2: COLOR.silver,
  3: COLOR.bronze,
};

/** Spotlight cone height as a multiple of the winner's block height. */
const CONE_RISE = 6;

export class Podium {
  readonly container = new Container();
  private readonly blocks = new Graphics();
  private readonly spotlight = new Graphics();

  constructor() {
    // The cone sits BEHIND the blocks so it reads as light falling on them.
    this.container.addChild(this.spotlight);
    this.container.addChild(this.blocks);
    this.container.visible = false;
  }

  update(frame: WorldFrameState): void {
    const { ceremony, camera, viewport } = frame;
    this.container.visible = ceremony.active;
    if (!ceremony.active) return;

    const scale = worldScale(camera, viewport);
    const originX = viewport.width / 2 - camera.centerX * scale;
    const ground = horizonY(viewport);
    const toScreenX = (worldX: number) => originX + worldX * scale;

    this.blocks.clear();
    for (const block of ceremony.blocks) {
      // Progress 0 draws nothing: the rig standing in front of the block is
      // at ground level, and the two rise together off the same value.
      const height = block.height * block.riseProgress * scale;
      if (height <= 0) continue;

      const width = BLOCK_WIDTH * scale;
      const x = toScreenX(block.x) - width / 2;

      this.blocks
        .rect(x, ground - height, width, height)
        .fill({ color: COLOR.dusk })
        .stroke({ color: PLACE_TINTS[block.place], width: Math.max(1, 2 * scale), alpha: 0.9 });

      // A bright cap, so the block reads as a solid the rig stands ON.
      this.blocks
        .rect(x, ground - height, width, Math.max(1, 3 * scale))
        .fill({ color: PLACE_TINTS[block.place], alpha: 0.85 });
    }

    this.spotlight.clear();
    if (!ceremony.spotlight || ceremony.blocks.length === 0) return;

    const winner = ceremony.blocks.find(b => b.place === 1);
    if (!winner) return;

    const cx = toScreenX(ceremony.spotlightX);
    const top = ground - winner.height * CONE_RISE * scale;
    const halfTop = (BLOCK_WIDTH * 0.18) * scale;
    const halfBottom = (BLOCK_WIDTH * 1.1) * scale;

    this.spotlight
      .poly([
        cx - halfTop, top,
        cx + halfTop, top,
        cx + halfBottom, ground,
        cx - halfBottom, ground,
      ])
      .fill({ color: COLOR.gold, alpha: 0.14 });

    // A pool on the ground, so the light has somewhere to land.
    this.spotlight
      .ellipse(cx, ground, halfBottom, halfBottom * 0.18)
      .fill({ color: COLOR.gold, alpha: 0.22 });
  }

  destroy(): void {
    this.container.destroy({ children: true, context: true, style: true, texture: false });
  }
}
