/**
 * Idle quirk offsets (spec §9) — the per-character resting animation.
 *
 * Pure and lifted out of `AvatarNode`'s per-frame switch so each kind's
 * amplitude can be asserted directly. Only `sway` had ever been measured live
 * (P2); `bob`, `pulse` and `tilt` had never been observed running because the
 * switch lived inside the renderer, which spec §9 puts outside the test
 * boundary by design.
 */
import type { IdleQuirk } from './content/roster';

export interface QuirkOffset {
  y: number;
  rotation: number;
}

/** `phase` is -1..1 (a sine wave already carrying the rig's period and phase offset). */
export function quirkOffset(kind: IdleQuirk['kind'], phase: number, amount: number): QuirkOffset {
  switch (kind) {
    case 'bob': return { y: phase * amount * 14, rotation: 0 };
    case 'sway': return { y: 0, rotation: phase * amount * 0.5 };
    case 'tilt': return { y: 0, rotation: phase * amount * 0.28 };
    case 'pulse': return { y: phase * amount * 5, rotation: 0 };
  }
}
