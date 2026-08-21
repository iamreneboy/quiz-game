/**
 * The avatar layer (spec §3). Replaces P1's placeholder `Markers`.
 *
 * Dumb by contract: it maps AvatarFrameState[] onto rig nodes and owns NO
 * animation state. Every decision was already made by the choreographer.
 */
import { Container, type Application } from 'pixi.js';
import { COLOR } from '@/lib/presentation/tokens';
import type { Profile } from '@/lib/presentation/profile';
import type { AvatarFrameState } from '../choreographer';
import { specFor } from '../content/roster';
import { horizonY, worldScale, type CameraState, type Viewport } from '../geometry';
import type { VfxAllowance } from '../vfxBudget';
import { AvatarNode, clearBakedAvatars } from './AvatarNode';
import { Vfx } from './Vfx';

export interface AvatarPlayer {
  id: string;
  nickname: string;
  /** CSS hex from the DB, e.g. '#38bdf8'. */
  color: string;
  /** Roster key from lib/avatars.ts. */
  avatar: string;
}

export class Avatars {
  readonly container = new Container();
  private readonly vfx = new Vfx();
  private readonly nodes = new Map<string, AvatarNode>();
  private players: readonly AvatarPlayer[] = [];
  private lastFrameAt = 0;

  constructor(
    private readonly app: Application,
    private readonly profile: Profile,
  ) {
    this.container.addChild(this.vfx.container);
  }

  setPlayers(players: readonly AvatarPlayer[]): void {
    this.players = players;
  }

  apply(
    states: readonly AvatarFrameState[],
    camera: CameraState,
    viewport: Viewport,
    allowance: VfxAllowance,
    localPlayerId: string | null,
    elapsedMs: number,
  ): void {
    const scale = worldScale(camera, viewport);
    const originX = viewport.width / 2 - camera.centerX * scale;
    const ground = horizonY(viewport);
    const now = elapsedMs;
    const dtMs = this.lastFrameAt === 0 ? 16 : Math.min(64, now - this.lastFrameAt);
    this.lastFrameAt = now;

    const seen = new Set<string>();

    for (const state of states) {
      const player = this.players.find(p => p.id === state.playerId);
      if (!player) continue;
      seen.add(state.playerId);

      let node = this.nodes.get(state.playerId);
      if (!node) {
        const accent = Number.parseInt(player.color.replace('#', ''), 16) || COLOR.neonCyan;
        node = new AvatarNode(
          this.app, specFor(player.avatar), accent, player.nickname,
          player.id === localPlayerId, this.profile,
        );
        this.nodes.set(state.playerId, node);
        // Below the pool, so particles read in front of the characters.
        this.container.addChildAt(node.container, 0);
      }

      node.apply(state, originX + state.x * scale, ground + state.y * scale, scale, elapsedMs);

      for (const request of state.vfx) {
        // `glow` is drawn by the rig itself, not emitted as particles.
        if (request.kind === 'glow') continue;
        const mount = node.mountPoint(request.mount);
        this.vfx.emit(request, mount.x, mount.y, scale, allowance, now);
      }
    }

    for (const [id, node] of this.nodes) {
      if (seen.has(id)) continue;
      node.destroy();
      this.nodes.delete(id);
    }

    this.vfx.update(now, dtMs);
  }

  destroy(): void {
    for (const node of this.nodes.values()) node.destroy();
    this.nodes.clear();
    this.vfx.destroy();
    this.container.destroy({ children: true });
    clearBakedAvatars();
  }
}
