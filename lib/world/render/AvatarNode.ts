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
import { AVATAR_HEIGHT, type AvatarSpec } from '../content/roster';

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
  private readonly shadow = new Graphics();
  private readonly rim = new Graphics();
  private readonly bodyHolder = new Container();
  private readonly body: Sprite;
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
    this.shadow.ellipse(0, 0, 34, 9).fill({ color: accent, alpha: 0.35 });
    this.container.addChild(this.shadow);
    this.container.addChild(this.glow);

    this.body = new Sprite(bake(app, spec));
    this.body.anchor.set(0.5, 1);
    this.bodyHolder.addChild(this.body);

    // The accent is a RIM, never a body tint (spec decision 4).
    this.rim.roundRect(-38, -AVATAR_HEIGHT, 76, AVATAR_HEIGHT, 14)
      .stroke({ color: accent, width: 3, alpha: 0.85 });

    // The YOU ring (spec section 5): silver, outside the accent rim, so "which
    // one is me" survives a crowded segment. P1's Markers drew this too.
    if (isLocal) {
      this.rim.roundRect(-45, -AVATAR_HEIGHT - 7, 90, AVATAR_HEIGHT + 14, 20)
        .stroke({ color: COLOR.silver, width: 3, alpha: 0.9 });
    }

    this.bodyHolder.addChild(this.rim);
    this.container.addChild(this.bodyHolder);

    const label = new Text({
      text: nickname,
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 20,
        fontWeight: '700',
        fill: isLocal ? COLOR.silver : 0xc7cede,
      }),
    });
    label.anchor.set(0.5, 0);
    label.y = 8;
    this.container.addChild(label);

    const underline = new Graphics();
    underline.roundRect(-26, 32, 52, isLocal ? 5 : 3, 2).fill({ color: accent });
    this.container.addChild(underline);
  }

  /** @param state fully choreographed; this method decides nothing. */
  apply(state: AvatarFrameState, screenX: number, screenY: number, scale: number, elapsedMs: number): void {
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
  }

  private idleOffset(elapsedMs: number, state: AvatarFrameState): { y: number; rotation: number } {
    // No idle animation at all under the reduced profile (spec §8 ladder).
    if (this.profile === 'reduced') return { y: 0, rotation: 0 };

    // Suppressed while a movement is in flight — a boosting character is not
    // idly bobbing. `scaleX !== 1` is the signal that the grammar is running.
    if (state.scaleX !== 1 || state.scaleY !== 1) return { y: 0, rotation: 0 };

    const { kind, periodMs, amount } = this.spec.idle;
    const phase = Math.sin(((elapsedMs + this.idlePhase) / periodMs) * Math.PI * 2);
    switch (kind) {
      case 'bob': return { y: phase * amount * 14, rotation: 0 };
      case 'sway': return { y: 0, rotation: phase * amount * 0.5 };
      case 'tilt': return { y: 0, rotation: phase * amount * 0.28 };
      case 'pulse': return { y: phase * amount * 5, rotation: 0 };
    }
  }

  mountPoint(which: 'behind' | 'front' | 'crown'): { x: number; y: number } {
    const point = this.spec.mounts[which];
    return { x: this.container.x + point.x, y: this.container.y + point.y };
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
