/**
 * Static stand-ins for particle effects (spec §8's budget table). Pure.
 *
 * `minimal` is documented as "draw static sprites instead of running particle
 * systems" — turbo flame → *static sprite*, streak tier → *static glow only* —
 * but nothing drew them, so the two entries the `minimal` allowance still funds
 * (`turbo: 0.5`, `streak: 0.5`) rendered as nothing at all. Because
 * `stepBudget` pins the `reduced` profile at `minimal` unconditionally, the
 * accessibility profile was the one losing every streak and edge-holder signal.
 *
 * The DECISION about which requests have a static form lives here, so
 * `AvatarNode` keeps its "this method decides nothing" contract: it is handed
 * the resolved allowance and the resolved decal list and only draws them.
 */
import type { VfxKind, VfxRequest } from './choreographer';
import type { VfxAllowance } from './vfxBudget';

export type DecalShape = 'glow' | 'flame';

export interface StaticDecal {
  /** The effect this stands in for; the renderer tints from the same table. */
  source: VfxKind;
  mount: VfxRequest['mount'];
  shape: DecalShape;
  /** 0..1 — the allowance-clamped intensity of the request it replaces. */
  intensity: number;
  /** Size as a fraction of the rig's height, so it scales with the rig. */
  size: number;
}

/**
 * Only the persistent, state-derived effects get a static form. Transient ones
 * (trail, lightning, ignition, arena) are `0` in the `minimal` allowance and
 * are never requested there — an instant has nothing to stand still for.
 * `glow` is absent because the rig already draws the medal glow directly.
 */
const STATIC_FORMS: Partial<Record<VfxKind, { shape: DecalShape; size: number }>> = {
  turbo: { shape: 'flame', size: 0.24 },
  spark: { shape: 'glow', size: 0.20 },
  flame: { shape: 'glow', size: 0.26 },
  inferno: { shape: 'glow', size: 0.32 },
};

/**
 * The decals to draw for this frame's VFX requests. Empty whenever particles
 * are allowed — the real emitter is doing the job and a decal underneath it
 * would just be a smear.
 */
export function staticDecals(
  requests: readonly VfxRequest[],
  allowance: VfxAllowance,
): StaticDecal[] {
  if (allowance.particles) return [];

  const decals: StaticDecal[] = [];
  for (const request of requests) {
    const form = STATIC_FORMS[request.kind];
    if (!form || request.intensity <= 0) continue;
    decals.push({
      source: request.kind,
      mount: request.mount,
      shape: form.shape,
      intensity: request.intensity,
      size: form.size,
    });
  }
  return decals;
}
