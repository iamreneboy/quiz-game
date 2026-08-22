/**
 * The one-way seam between the runtime and the renderer (spec §3).
 *
 * `WorldScene` consumes this and nothing else — no store, no cue bus. That is
 * what lets P6's stage view be a second consumer with its own framing rather
 * than a second renderer.
 */
import type { AvatarFrameState } from './choreographer';
import type { CameraState, TrackMetrics, Viewport } from './geometry';
import type { VfxAllowance } from './vfxBudget';
import type { GradeState, ZoneWeights } from './zones';

export interface WorldFrameState {
  camera: CameraState;
  viewport: Viewport;
  metrics: TrackMetrics;
  /** Sampled at the camera centre — see the note in WorldScene. */
  zones: ZoneWeights;
  grade: GradeState;
  /** Fully choreographed; the renderer applies these and decides nothing. */
  avatars: readonly AvatarFrameState[];
  /** Whether particle systems may run, and at what strength. */
  allowance: VfxAllowance;
  /** Whose avatar gets the "you" ring; null before the session is known. */
  localPlayerId: string | null;
  /** Milliseconds since the scene was created; drives ambient animation. */
  elapsedMs: number;
}
