/**
 * The road itself: surface band, one tick per segment, start and finish gates.
 *
 * Built once in WORLD space and thereafter only scaled and translated — the
 * segment count is fixed for the life of a room.
 */
import { Container, Graphics } from 'pixi.js';
import type { WorldDefinition } from '../definition';
import {
  MARKER_ROW_HEIGHT,
  horizonY,
  segmentToWorldX,
  worldScale,
  type CameraState,
  type TrackMetrics,
  type Viewport,
} from '../geometry';

const ROAD_DEPTH = 150;

export class TrackSurface {
  readonly container = new Container();

  constructor(definition: WorldDefinition, metrics: TrackMetrics) {
    const { road } = definition;
    const g = new Graphics();

    g.rect(metrics.minX, 0, metrics.maxX - metrics.minX, ROAD_DEPTH).fill({ color: road.surface });
    g.rect(metrics.minX, 0, metrics.maxX - metrics.minX, 5).fill({ color: road.edge });

    for (let segment = 0; segment <= metrics.segments; segment++) {
      const x = segmentToWorldX(segment);
      const isFinish = segment === metrics.segments;
      g.rect(x - 2, -MARKER_ROW_HEIGHT * 0.4, 4, ROAD_DEPTH + MARKER_ROW_HEIGHT * 0.4).fill({
        color: isFinish ? road.finish : road.tick,
        alpha: isFinish ? 0.95 : 0.35,
      });
    }

    // Chequered gate at the finish line.
    const finishX = segmentToWorldX(metrics.segments);
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 2; col++) {
        if ((row + col) % 2 === 0) continue;
        g.rect(finishX + col * 16 - 16, -170 + row * 26, 16, 26).fill({ color: road.finish, alpha: 0.9 });
      }
    }

    this.container.addChild(g);
  }

  update(camera: CameraState, viewport: Viewport): void {
    const scale = worldScale(camera, viewport);
    this.container.scale.set(scale);
    this.container.x = viewport.width / 2 - camera.centerX * scale;
    this.container.y = horizonY(viewport);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
