/**
 * One avatar rig (spec §5). Every character has this same structure, back to
 * front, which is what lets one movement grammar drive twelve characters:
 *
 *   shadow -> flair glow -> body sprite -> accent rim -> label (+ YOU ring)
 *
 * VFX are emitted into the scene-level pool at this rig's mount points, so
 * particles are never parented to a moving node.
 */
import { Container, Graphics, Sprite, Text, TextStyle, type Application, type Texture } from 'pixi.js';
import { COLOR } from '@/lib/presentation/tokens';
import type { Profile } from '@/lib/presentation/profile';
import type { AvatarFrameState } from '../choreographer';
import {
  AVATAR_HEIGHT,
  AVATAR_LABEL_DROP,
  AVATAR_LABEL_Y,
  AVATAR_LOCAL_RING_PAD,
  AVATAR_RIM_HALF_WIDTH,
  type AvatarSpec,
  type MountName,
} from '../content/roster';
import { staticDecals, type StaticDecal } from '../decals';
import { quirkOffset } from '../quirk';
import type { VfxAllowance } from '../vfxBudget';
import { VFX_TINTS } from './Vfx';

const MEDAL_TINTS = { gold: COLOR.gold, silver: COLOR.silver, bronze: COLOR.bronze } as const;

/** Baked once per character key, shared by every player using it. */
const textures = new Map<string, Texture>();

function bake(app: Application, spec: AvatarSpec): Texture {
  const cached = textures.get(spec.key);
  if (cached) return cached;

  const g = new Graphics();
  spec.draw(g, { width: AVATAR_HEIGHT, height: AVATAR_HEIGHT, color: COLOR });
  const texture = app.renderer.generateTexture({ target: g });
  g.destroy();
  textures.set(spec.key, texture);
  return texture;
}

/** Drop every baked texture. Call only when the renderer is torn down. */
export function clearBakedAvatars(): void {
  for (const texture of textures.values()) texture.destroy(true);
  textures.clear();
}

export class AvatarNode {
  readonly container = new Container();
  private readonly glow = new Graphics();
  /** Static stand-ins drawn when the budget has turned particles off (spec §8). */
  private readonly decals = new Graphics();
  private readonly shadow = new Graphics();
  private readonly rim = new Graphics();
  /** The YOU ring is its own graphic so `setLocal` can add it after the fact. */
  private readonly localRing = new Graphics();
  private readonly bodyHolder = new Container();
  private readonly body: Sprite;
  private readonly label: Text;
  private readonly underline = new Graphics();
  private readonly accent: number;
  /**
   * `null` until the first `setLocal` call, so the constructor's call always
   * draws. A `false` initialiser would make it a no-op for every non-local rig
   * (class fields initialise BEFORE the constructor body), and the accent
   * underline below — one of spec decision 4's four accent surfaces — would
   * never be drawn for anyone but the local player. The sentinel is preferred
   * over an unconditional draw in the constructor because it keeps every draw
   * on one path and leaves `setLocal`'s idempotence guard doing its real job:
   * `Avatars.apply` re-marks each node every frame, and a repeat of the same
   * value still early-returns.
   */
  private isLocal: boolean | null = null;
  private idlePhase = Math.random() * 10_000;

  constructor(
    app: Application,
    readonly spec: AvatarSpec,
    accent: number,
    nickname: string,
    isLocal: boolean,
    /**
     * Held at construction, exactly as P1's `Grade` and `Markers` do — the
     * static-per-render-pass pattern ADR-0004 established. The VFX budget is
     * the only thing in this phase that changes at runtime, and it never
     * touches the profile.
     */
    private readonly profile: Profile,
  ) {
    this.accent = accent;
    this.shadow.ellipse(0, 0, 34, 9).fill({ color: accent, alpha: 0.35 });
    this.container.addChild(this.shadow);
    this.container.addChild(this.glow);
    this.container.addChild(this.decals);

    this.body = new Sprite(bake(app, spec));
    this.body.anchor.set(0.5, 1);
    this.bodyHolder.addChild(this.body);

    // The accent is a RIM, never a body tint (spec decision 4).
    this.rim
      .roundRect(-AVATAR_RIM_HALF_WIDTH, -AVATAR_HEIGHT, AVATAR_RIM_HALF_WIDTH * 2, AVATAR_HEIGHT, 14)
      .stroke({ color: accent, width: 3, alpha: 0.85 });

    this.bodyHolder.addChild(this.rim);
    this.bodyHolder.addChild(this.localRing);
    this.container.addChild(this.bodyHolder);

    this.label = new Text({
      text: nickname,
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 20,
        fontWeight: '700',
        fill: 0xc7cede,
      }),
    });
    this.label.anchor.set(0.5, 0);
    this.label.y = AVATAR_LABEL_Y;
    this.container.addChild(this.label);
    this.container.addChild(this.underline);

    this.setLocal(isLocal);
  }

  /**
   * Mark (or un-mark) this rig as the local player's.
   *
   * Re-markable rather than fixed at construction: `PixiStage` reads the
   * session AFTER two dynamic imports and `Application.init()`, and the runtime
   * can be created before the visitor's join has been saved. Deciding "is this
   * me" only once, at node construction, made the YOU ring depend on that race.
   */
  setLocal(isLocal: boolean): void {
    if (isLocal === this.isLocal) return;
    this.isLocal = isLocal;

    // The YOU ring (spec section 5): silver, outside the accent rim, so "which
    // one is me" survives a crowded segment. P1's Markers drew this too.
    this.localRing.clear();
    if (isLocal) {
      const half = AVATAR_RIM_HALF_WIDTH + AVATAR_LOCAL_RING_PAD;
      this.localRing
        .roundRect(
          -half,
          -AVATAR_HEIGHT - AVATAR_LOCAL_RING_PAD,
          half * 2,
          AVATAR_HEIGHT + AVATAR_LOCAL_RING_PAD * 2,
          20,
        )
        .stroke({ color: COLOR.silver, width: 3, alpha: 0.9 });
    }

    this.label.style.fill = isLocal ? COLOR.silver : 0xc7cede;
    this.underline
      .clear()
      .roundRect(-26, AVATAR_LABEL_DROP - 5, 52, isLocal ? 5 : 3, 2)
      .fill({ color: this.accent });
  }

  /**
   * @param state fully choreographed; this method decides nothing.
   * @param allowance resolved by `vfxBudget`; the static-decal decision it
   *   drives lives in `decals.ts`, not in a level check here.
   */
  apply(
    state: AvatarFrameState,
    screenX: number,
    screenY: number,
    scale: number,
    allowance: VfxAllowance,
    elapsedMs: number,
  ): void {
    this.container.x = screenX;
    this.container.y = screenY;

    const idle = this.idleOffset(elapsedMs, state);
    this.container.scale.set(scale * state.emphasis);
    this.bodyHolder.scale.set(state.scaleX, state.scaleY);
    this.bodyHolder.y = idle.y;
    this.bodyHolder.rotation = idle.rotation;

    // The shadow reads the squash — this is what keeps a boost grounded.
    this.shadow.scale.set(state.scaleX, 1);
    this.shadow.alpha = 0.2 + 0.25 * state.scaleY;

    this.glow.clear();
    if (state.medal) {
      this.glow
        .circle(0, -AVATAR_HEIGHT / 2, AVATAR_HEIGHT * 0.62)
        .fill({ color: MEDAL_TINTS[state.medal], alpha: 0.22 });
    }

    this.drawDecals(staticDecals(state.vfx, allowance));
  }

  /**
   * The `minimal` half of spec §8's budget table: a tinted glow for the streak
   * tier, a small flame wedge for the turbo. Drawn in RIG-LOCAL units, so —
   * unlike the particle mount points, which are screen-space — the container's
   * scale applies to them for free. Cheap on purpose: this level exists because
   * frames are scarce.
   */
  private drawDecals(decals: readonly StaticDecal[]): void {
    this.decals.clear();
    for (const decal of decals) {
      const mount = this.spec.mounts[decal.mount];
      const tint = VFX_TINTS[decal.source];
      const size = AVATAR_HEIGHT * decal.size;
      const alpha = 0.2 + 0.35 * decal.intensity;

      if (decal.shape === 'glow') {
        this.decals.circle(mount.x, mount.y, size).fill({ color: tint, alpha: alpha * 0.6 });
        this.decals.circle(mount.x, mount.y, size * 0.55).fill({ color: tint, alpha });
      } else {
        this.decals
          .poly([
            mount.x - size * 0.5, mount.y,
            mount.x, mount.y - size,
            mount.x + size * 0.5, mount.y,
            mount.x, mount.y + size * 0.45,
          ])
          .fill({ color: tint, alpha });
      }
    }
  }

  private idleOffset(elapsedMs: number, state: AvatarFrameState): { y: number; rotation: number } {
    // No idle animation at all under the reduced profile (spec §8 ladder).
    if (this.profile === 'reduced') return { y: 0, rotation: 0 };

    // Suppressed while a movement is in flight — a boosting character is not
    // idly bobbing. `scaleX !== 1` is the signal that the grammar is running.
    if (state.scaleX !== 1 || state.scaleY !== 1) return { y: 0, rotation: 0 };

    const { kind, periodMs, amount } = this.spec.idle;
    const phase = Math.sin(((elapsedMs + this.idlePhase) / periodMs) * Math.PI * 2);
    return quirkOffset(kind, phase, amount);
  }

  /**
   * Where a particle for this rig is born, in SCREEN space.
   *
   * `spec.mounts` are rig-local units and `container.x/y` are pixels, so the
   * offsets have to go through the container's scale — adding them raw put
   * every particle in the phase in the wrong place (a crown mount 104px above
   * a 42px-tall avatar at an establishing shot). `container.scale` rather than
   * the caller's `scale` on purpose: it carries the emphasis multiplier, so the
   * mount tracks the rig as actually drawn.
   */
  mountPoint(which: MountName): { x: number; y: number } {
    const point = this.spec.mounts[which];
    return {
      x: this.container.x + point.x * this.container.scale.x,
      y: this.container.y + point.y * this.container.scale.y,
    };
  }

  destroy(): void {
    // Pixi v8 frees a Graphics' `_ownedContext` only when options is falsy or
    // `options.context === true`, and a Text's TextStyle only on
    // `options.style` — `{ children: true }` alone strands both. The body's
    // texture is the SHARED baked one, so it is explicitly not destroyed here;
    // `clearBakedAvatars` owns those.
    this.container.destroy({ children: true, context: true, style: true, texture: false });
  }
}
