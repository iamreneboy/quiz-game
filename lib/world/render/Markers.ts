/**
 * Placeholder position markers (spec §8).
 *
 * P1 draws pucks, not characters: P2 replaces this module with the real avatar
 * roster against the same anchor API, and owns the movement grammar (boost ->
 * overshoot -> settle), squash-and-stretch, trails, and streak VFX. Nothing
 * here should grow in that direction.
 */
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLOR, DURATION, EASE } from '@/lib/presentation/tokens';
import type { Profile } from '@/lib/presentation/profile';
import { cubicBezierEase } from '../camera';
import { horizonY, worldScale, type CameraState, type MarkerAnchor, type Viewport } from '../geometry';

export interface MarkerPlayer {
  id: string;
  nickname: string;
  /** CSS hex from the DB, e.g. '#38bdf8'. */
  color: string;
}

const PUCK_RADIUS = 26;

interface MarkerNode {
  container: Container;
  from: { x: number; y: number };
  to: { x: number; y: number };
  startedAt: number;
}

export class Markers {
  readonly container = new Container();
  private readonly nodes = new Map<string, MarkerNode>();

  constructor(private readonly profile: Profile) {}

  /** Rebuild puck graphics when the roster changes; retarget on every anchor change. */
  sync(
    anchors: readonly MarkerAnchor[],
    players: readonly MarkerPlayer[],
    localPlayerId: string | null,
    now: number,
  ): void {
    const seen = new Set<string>();

    for (const anchor of anchors) {
      seen.add(anchor.playerId);
      const player = players.find(p => p.id === anchor.playerId);
      if (!player) continue;

      let node = this.nodes.get(anchor.playerId);
      if (!node) {
        node = this.createNode(player, player.id === localPlayerId);
        this.nodes.set(anchor.playerId, node);
        this.container.addChild(node.container);
        node.from = { x: anchor.x, y: anchor.y };
        node.to = { x: anchor.x, y: anchor.y };
      }

      if (node.to.x !== anchor.x || node.to.y !== anchor.y) {
        node.from = this.positionAt(node, now);
        node.to = { x: anchor.x, y: anchor.y };
        node.startedAt = now;
      }
    }

    for (const [id, node] of this.nodes) {
      if (seen.has(id)) continue;
      node.container.destroy({ children: true });
      this.nodes.delete(id);
    }
  }

  update(camera: CameraState, viewport: Viewport, now: number): void {
    const scale = worldScale(camera, viewport);
    const originX = viewport.width / 2 - camera.centerX * scale;
    const ground = horizonY(viewport);

    for (const node of this.nodes.values()) {
      const position = this.positionAt(node, now);
      node.container.x = originX + position.x * scale;
      node.container.y = ground + position.y * scale;
      node.container.scale.set(scale);
    }
  }

  private positionAt(node: MarkerNode, now: number): { x: number; y: number } {
    // Reduced profile snaps; high eases with the settle curve. The full P2
    // movement grammar (anticipation, overshoot, trails) is NOT this.
    if (this.profile === 'reduced') return node.to;
    const elapsed = now - node.startedAt;
    if (elapsed >= DURATION.settle) return node.to;
    const t = cubicBezierEase(EASE.settle, elapsed / DURATION.settle);
    return {
      x: node.from.x + (node.to.x - node.from.x) * t,
      y: node.from.y + (node.to.y - node.from.y) * t,
    };
  }

  private createNode(player: MarkerPlayer, isLocal: boolean): MarkerNode {
    const container = new Container();
    const color = Number.parseInt(player.color.replace('#', ''), 16) || COLOR.neonCyan;

    const puck = new Graphics();
    puck.circle(0, -PUCK_RADIUS, PUCK_RADIUS).fill({ color: COLOR.abyss });
    puck.circle(0, -PUCK_RADIUS, PUCK_RADIUS).stroke({ color, width: 5 });
    if (isLocal) {
      puck.circle(0, -PUCK_RADIUS, PUCK_RADIUS + 7).stroke({ color: COLOR.silver, width: 3, alpha: 0.9 });
    }
    container.addChild(puck);

    const label = new Text({
      text: player.nickname,
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 20,
        fontWeight: '700',
        fill: COLOR.silver,
      }),
    });
    label.anchor.set(0.5, 0);
    label.y = 6;
    container.addChild(label);

    return { container, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, startedAt: 0 };
  }

  destroy(): void {
    for (const node of this.nodes.values()) node.container.destroy({ children: true });
    this.nodes.clear();
    this.container.destroy({ children: true });
  }
}
