/**
 * The choreographer (spec §4) — this phase's centre of gravity.
 *
 * Pure: no Pixi, no store, no cue bus. Drama cues arrive at the reveal
 * transition (ADR-0003) and are BUFFERED; avatars hold their pre-reveal
 * anchors until `phase-track`, so the world deliberately lags the standings by
 * one beat. That lag is what gives P1's TRACK camera cut something to cut to.
 */
import type { Cue } from '@/lib/presentation/cues';
import { isSubdued, resolveTier, type CelebrationTier } from '@/lib/presentation/celebration';
import type { Profile } from '@/lib/presentation/profile';
import { LEADER_EMPHASIS, type Flair } from './flair';
import type { MarkerAnchor } from './geometry';
import {
  ANTICIPATE_MS,
  MOVEMENT_MS,
  TRAVEL_MS,
  sampleMovement,
  staggerFor,
  type MovementTrack,
} from './movement';
import type { VfxAllowance } from './vfxBudget';

/** Below-headline effects are quieter, never absent (spec §4). */
export const SUBDUED_INTENSITY = 0.6;

/** When the arena reaction lands, measured from sequence start. */
export const ARENA_AT_MS = 1400;
const ARENA_HOLD_MS = 1200;

/** How long a scheduled instant stays "firing" for the renderer. */
const ACCENT_WINDOW_MS = 160;

/** Lobby ready pulse (PRD §5.2). */
export const PULSE_MS = 600;
const PULSE_POP = 0.18;

export type VfxKind =
  | 'trail' | 'lightning' | 'ignition' | 'arena' | 'pulse'
  | 'spark' | 'flame' | 'inferno' | 'turbo' | 'glow';

export interface VfxRequest {
  kind: VfxKind;
  mount: 'behind' | 'front' | 'crown';
  /** 0..1 after arbitration and budget clamping. Never emitted at 0. */
  intensity: number;
}

export interface AvatarFrameState {
  playerId: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  emphasis: number;
  medal: 'gold' | 'silver' | 'bronze' | null;
  edgeHolder: boolean;
  vfx: VfxRequest[];
}

export type StreakTier = 0 | 3 | 5 | 8;

interface Scheduled {
  playerId: string;
  atMs: number;
}

interface Sequence {
  startedAt: number;
  headline: CelebrationTier;
  tracks: MovementTrack[];
  lightnings: Scheduled[];
  ignitions: (Scheduled & { tier: StreakTier })[];
  /** The player whose effect earned the beat's exclusive arena reaction. */
  arenaPlayerId: string | null;
  leadChange: { playerId: string; previousLeaderId: string } | null;
  durationMs: number;
}

export interface ChoreographerState {
  pending: Cue[];
  /** Captured when the first drama cue of a beat is buffered. */
  heldAnchors: readonly MarkerAnchor[] | null;
  sequence: Sequence | null;
  /** Persistent — survives between beats, extinguished only by streak-broken. */
  streakTier: Record<string, StreakTier>;
  /** Lobby ready pulses: playerId -> the moment they joined. */
  pulses: Record<string, number>;
}

export const initialChoreographerState: ChoreographerState = {
  pending: [],
  heldAnchors: null,
  sequence: null,
  streakTier: {},
  pulses: {},
};

const DRAMA = new Set<Cue['type']>([
  'player-advanced', 'overtake', 'lead-changed', 'streak-tier', 'streak-broken',
]);

/**
 * Capture the settled world on a pre-reveal beat. The store advances `phase`
 * and `standings` in one set (lib/store.ts:44-46) and the cue bridge runs
 * after it, so by the time a drama cue arrives the live anchors are already
 * the DESTINATIONS. The hold has to be taken earlier, on a beat where the
 * standings are still the previous round's.
 */
export function holdAnchors(
  state: ChoreographerState,
  anchors: readonly MarkerAnchor[],
): ChoreographerState {
  return { ...state, heldAnchors: anchors };
}

/**
 * Buffer a drama cue. `heldAnchors ?? liveAnchors` is the DEGRADED fallback for
 * the one case where no hold was taken — a mid-game reload landing straight on
 * `reveal`, where the pre-reveal world is genuinely unknown and no movement is
 * the correct degradation.
 */
export function bufferCue(
  state: ChoreographerState,
  cue: Cue,
  liveAnchors: readonly MarkerAnchor[],
): ChoreographerState {
  if (!DRAMA.has(cue.type)) return state;
  return {
    ...state,
    pending: [...state.pending, cue],
    heldAnchors: state.heldAnchors ?? liveAnchors,
  };
}

/** Compile the queue into a timeline. Called on `phase-track`. */
export function beginSequence(
  state: ChoreographerState,
  liveAnchors: readonly MarkerAnchor[],
  now: number,
): ChoreographerState {
  if (state.pending.length === 0) {
    return { ...state, pending: [], heldAnchors: null, sequence: null };
  }

  const held = state.heldAnchors ?? liveAnchors;
  const heldById = new Map(held.map(a => [a.playerId, a]));
  const headline = resolveTier(state.pending);

  // Back-marker first: the passer then arrives AFTER the passed.
  const ordered = [...liveAnchors].sort((a, b) => a.x - b.x);
  const tracks: MovementTrack[] = ordered.map((anchor, index) => {
    const from = heldById.get(anchor.playerId) ?? anchor;
    return {
      playerId: anchor.playerId,
      from: { x: from.x, y: from.y },
      to: { x: anchor.x, y: anchor.y },
      delayMs: staggerFor(index, 'high'),
    };
  });
  const delayOf = new Map(tracks.map(t => [t.playerId, t.delayMs]));

  const lightnings: Scheduled[] = [];
  const ignitions: (Scheduled & { tier: StreakTier })[] = [];
  const streakTier: Record<string, StreakTier> = { ...state.streakTier };
  let leadChange: Sequence['leadChange'] = null;
  let arenaPlayerId: string | null = null;

  for (const cue of state.pending) {
    switch (cue.type) {
      case 'player-advanced':
        break;

      case 'overtake':
        // The crossing lands mid-travel; that is when the accent reads.
        lightnings.push({
          playerId: cue.playerId,
          atMs: (delayOf.get(cue.playerId) ?? 0) + ANTICIPATE_MS + TRAVEL_MS * 0.6,
        });
        break;

      case 'lead-changed':
        leadChange = { playerId: cue.playerId, previousLeaderId: cue.previousLeaderId };
        break;

      case 'streak-tier':
        streakTier[cue.playerId] = cue.streak;
        ignitions.push({
          playerId: cue.playerId,
          atMs: (delayOf.get(cue.playerId) ?? 0) + ANTICIPATE_MS + TRAVEL_MS,
          tier: cue.streak,
        });
        // The arena reaction belongs to streak-8 alone, and only when it is
        // the beat's headline (spec §4, §6) — otherwise the inferno still
        // ignites on the avatar but the world doesn't react.
        if (cue.streak === 8 && cue.tier === headline) arenaPlayerId ??= cue.playerId;
        break;

      case 'streak-broken':
        streakTier[cue.playerId] = 0;
        break;
    }
  }

  const lastDelay = tracks.length > 0 ? Math.max(...tracks.map(t => t.delayMs)) : 0;
  const durationMs = Math.max(
    lastDelay + MOVEMENT_MS,
    arenaPlayerId ? ARENA_AT_MS + ARENA_HOLD_MS : 0,
  );

  return {
    pending: [],
    heldAnchors: null,
    pulses: state.pulses,
    streakTier,
    sequence: {
      startedAt: now, headline, tracks, lightnings, ignitions,
      arenaPlayerId, leadChange, durationMs,
    },
  };
}

/** Hard-complete: snap to final anchors, clear transients, keep persistent flair. */
export function completeSequence(state: ChoreographerState): ChoreographerState {
  return { ...state, pending: [], heldAnchors: null, sequence: null };
}

/** The lobby ready pulse (PRD §5.2) — an arrival, not drama, so it never queues. */
export function notePlayerJoined(
  state: ChoreographerState,
  playerId: string,
  now: number,
): ChoreographerState {
  return { ...state, pulses: { ...state.pulses, [playerId]: now } };
}

export function isSequenceRunning(state: ChoreographerState, now: number): boolean {
  return state.sequence !== null && now - state.sequence.startedAt < state.sequence.durationMs;
}

export function avatarStates(
  state: ChoreographerState,
  liveAnchors: readonly MarkerAnchor[],
  flair: ReadonlyMap<string, Flair>,
  allowance: VfxAllowance,
  now: number,
  profile: Profile,
): AvatarFrameState[] {
  const running = isSequenceRunning(state, now);
  const sequence = running ? state.sequence! : null;
  const elapsed = sequence ? now - sequence.startedAt : 0;
  const trackById = new Map(sequence?.tracks.map(t => [t.playerId, t]) ?? []);

  // While drama is pending but the beat has not started, the world is frozen
  // one step behind the standings.
  const positions = !running && state.pending.length > 0 && state.heldAnchors
    ? state.heldAnchors
    : liveAnchors;
  const positionById = new Map(positions.map(a => [a.playerId, a]));

  // Below-headline EFFECTS render subdued (spec §4) — the unit of subduing is
  // the effect, not the player: a player who owns both a headline cue and a
  // lower-tier one still gets the lower-tier effect quieted, not full-bright.
  const subdue = (tier: CelebrationTier): number =>
    sequence && isSubdued(tier, sequence.headline) ? SUBDUED_INTENSITY : 1;

  return liveAnchors.map(anchor => {
    const own = flair.get(anchor.playerId) ?? { medal: null, emphasis: 1, edgeHolder: false };
    const held = positionById.get(anchor.playerId) ?? anchor;
    const track = trackById.get(anchor.playerId);

    const sample = track
      ? sampleMovement(track, elapsed, profile)
      : { x: held.x, y: held.y, scaleX: 1, scaleY: 1, trail: 0 };

    const vfx: VfxRequest[] = [];

    // ── Persistent: derived from standings, survives a reload ──────────────
    if (own.medal) {
      // Never clamped by the budget — rank is information, not decoration.
      vfx.push({ kind: 'glow', mount: 'crown', intensity: 1 });
    }
    if (own.edgeHolder && allowance.turbo > 0) {
      vfx.push({ kind: 'turbo', mount: 'behind', intensity: allowance.turbo });
    }
    const streak = cappedStreak(state.streakTier[anchor.playerId] ?? 0, allowance.maxStreakTier);
    if (streak.kind && allowance.streak > 0) {
      vfx.push({
        kind: streak.kind,
        mount: 'behind',
        intensity: allowance.streak * subdue('streakMilestone'),
      });
    }

    // ── Transient: alive only inside a sequence ────────────────────────────
    if (sequence) {
      const trail = sample.trail * allowance.trail * subdue('routine');
      if (trail > 0) vfx.push({ kind: 'trail', mount: 'behind', intensity: trail });

      if (firing(sequence.lightnings, anchor.playerId, elapsed) && allowance.accent > 0) {
        vfx.push({ kind: 'lightning', mount: 'front', intensity: allowance.accent * subdue('overtake') });
      }
      if (firing(sequence.ignitions, anchor.playerId, elapsed) && allowance.accent > 0) {
        vfx.push({ kind: 'ignition', mount: 'behind', intensity: allowance.accent * subdue('streakMilestone') });
      }
      if (
        sequence.arenaPlayerId === anchor.playerId &&
        allowance.arena > 0 &&
        elapsed >= ARENA_AT_MS &&
        elapsed < ARENA_AT_MS + ARENA_HOLD_MS
      ) {
        // Exclusive: one per beat, headline tier only, never subdued.
        vfx.push({ kind: 'arena', mount: 'crown', intensity: allowance.arena });
      }
    }

    // ── Lobby ready pulse: an arrival, independent of any sequence ─────────
    const pulseAge = now - (state.pulses[anchor.playerId] ?? -Infinity);
    const pulsing = profile !== 'reduced' && pulseAge >= 0 && pulseAge < PULSE_MS;
    if (pulsing) {
      vfx.push({ kind: 'pulse', mount: 'crown', intensity: 1 - pulseAge / PULSE_MS });
    }

    const emphasis = emphasisFor(anchor.playerId, own, sequence, elapsed);

    return {
      playerId: anchor.playerId,
      x: sample.x,
      y: sample.y,
      scaleX: sample.scaleX,
      scaleY: sample.scaleY,
      emphasis: pulsing
        ? emphasis * (1 + PULSE_POP * (1 - pulseAge / PULSE_MS))
        : emphasis,
      medal: own.medal,
      edgeHolder: own.edgeHolder,
      vfx,
    };
  });
}

function cappedStreak(tier: StreakTier, ceiling: StreakTier): { kind: VfxKind | null } {
  const effective = Math.min(tier, ceiling) as StreakTier;
  if (effective >= 8) return { kind: 'inferno' };
  if (effective >= 5) return { kind: 'flame' };
  if (effective >= 3) return { kind: 'spark' };
  return { kind: null };
}

function firing(scheduled: readonly Scheduled[], playerId: string, elapsed: number): boolean {
  return scheduled.some(
    e => e.playerId === playerId && elapsed >= e.atMs && elapsed < e.atMs + ACCENT_WINDOW_MS,
  );
}

/**
 * A lead change is an exchange: the new leader swells while the old one drops,
 * both across the landing window, so the two read as one gesture.
 */
function emphasisFor(
  playerId: string,
  flair: Flair,
  sequence: Sequence | null,
  elapsed: number,
): number {
  const change = sequence?.leadChange;
  if (!change) return flair.emphasis;

  const start = ANTICIPATE_MS + TRAVEL_MS;
  const k = Math.min(1, Math.max(0, (elapsed - start) / (MOVEMENT_MS - start)));

  if (playerId === change.playerId) return 1 + (LEADER_EMPHASIS - 1) * k;
  if (playerId === change.previousLeaderId) return LEADER_EMPHASIS - (LEADER_EMPHASIS - 1) * k;
  return flair.emphasis;
}
