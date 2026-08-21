/**
 * World-content types (spec §3, §6).
 *
 * A world is DATA: zones, layers, parallax factors, and draw functions. The
 * renderer knows how to draw a `WorldDefinition` and nothing about the night
 * race specifically — which is what makes the PRD §9 modular-bundle strategy
 * real rather than aspirational.
 *
 * Quality is expressed here as `layerTier`, not as renderer construction flags,
 * so P2's watchdog can change quality without destroying the canvas (decision 8).
 */
import type { Graphics } from 'pixi.js';
import type { Profile } from '@/lib/presentation/profile';
import { COLOR } from '@/lib/presentation/tokens';
import type { ZoneId } from './zones';

/** `core` renders on both profiles; `rich` is high-profile only. */
export type LayerTier = 'core' | 'rich';

export interface LayerDrawContext {
  /** Tile width in px — equal to the layer's `repeatWidth`. */
  width: number;
  height: number;
  color: typeof COLOR;
}

export interface AmbientSpec {
  kind: 'flicker' | 'pulse' | 'sweep';
  periodMs: number;
  /** Peak deviation, 0..1, applied to the layer's alpha or offset. */
  amount: number;
}

export interface LayerSpec {
  id: string;
  /** 0 -> pinned to the camera (far sky); 1 -> moves with the world (ground). */
  parallax: number;
  /** Width of one repeat tile, in world units. */
  repeatWidth: number;
  /** Tile height in px. */
  height: number;
  /** Vertical placement of the tile's bottom edge, as a fraction of the horizon. */
  anchorY: number;
  layerTier: LayerTier;
  draw(g: Graphics, ctx: LayerDrawContext): void;
  ambient?: AmbientSpec;
}

export interface ZoneSpec {
  id: ZoneId;
  skyTop: number;
  skyBottom: number;
  /** Ordered back to front by `parallax`. */
  layers: LayerSpec[];
}

export interface WorldDefinition {
  id: string;
  zones: ZoneSpec[];
  road: { surface: number; edge: number; tick: number; finish: number };
}

export function layersForProfile(zone: ZoneSpec, profile: Profile): LayerSpec[] {
  return profile === 'high' ? zone.layers : zone.layers.filter(l => l.layerTier === 'core');
}
