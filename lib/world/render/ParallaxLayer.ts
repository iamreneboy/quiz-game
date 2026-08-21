/**
 * One parallax layer: a tile baked ONCE into a RenderTexture, then only tiled
 * and translated (spec §6). No per-frame Graphics rebuilds — this is what keeps
 * the world at 60fps with procedural art, and keeps texture memory constant
 * regardless of track length.
 */
import { Application, Graphics, Rectangle, TilingSprite, type Texture } from 'pixi.js';
import { COLOR } from '@/lib/presentation/tokens';
import type { LayerSpec } from '../definition';
import { horizonY, worldScale, type CameraState, type Viewport } from '../geometry';

export class ParallaxLayer {
  readonly sprite: TilingSprite;
  private readonly texture: Texture;
  private readonly spec: LayerSpec;

  constructor(app: Application, spec: LayerSpec) {
    this.spec = spec;

    const g = new Graphics();
    spec.draw(g, { width: spec.repeatWidth, height: spec.height, color: COLOR });
    this.texture = app.renderer.generateTexture({
      target: g,
      // Bake at the tile's declared size so tiling never seams.
      frame: new Rectangle(0, 0, spec.repeatWidth, spec.height),
    });
    g.destroy();

    this.sprite = new TilingSprite({ texture: this.texture, width: 1, height: spec.height });
  }

  /** @param weight zone blend weight, 0..1 */
  update(camera: CameraState, viewport: Viewport, weight: number, elapsedMs: number): void {
    const { spec } = this;
    this.sprite.visible = weight > 0.001;
    if (!this.sprite.visible) return;

    const scale = worldScale(camera, viewport);
    this.sprite.width = viewport.width;
    this.sprite.tileScale.set(scale);
    this.sprite.tilePosition.x = -camera.centerX * scale * spec.parallax;

    const ground = horizonY(viewport);
    this.sprite.y = ground * spec.anchorY - spec.height * scale;
    this.sprite.height = spec.height * scale;

    this.sprite.alpha = weight * this.ambientAlpha(elapsedMs);
    this.sprite.x = this.ambientOffsetX(elapsedMs, viewport);
  }

  private ambientAlpha(elapsedMs: number): number {
    const ambient = this.spec.ambient;
    if (!ambient || ambient.kind === 'sweep') return 1;
    const phase = Math.sin((elapsedMs / ambient.periodMs) * Math.PI * 2);
    return 1 - ambient.amount * 0.5 * (1 - phase);
  }

  private ambientOffsetX(elapsedMs: number, viewport: Viewport): number {
    const ambient = this.spec.ambient;
    if (!ambient || ambient.kind !== 'sweep') return 0;
    const phase = Math.sin((elapsedMs / ambient.periodMs) * Math.PI * 2);
    return phase * ambient.amount * viewport.width * 0.04;
  }

  destroy(): void {
    this.sprite.destroy();
    this.texture.destroy(true);
  }
}
