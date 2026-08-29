/**
 * The night-race audio identity, as data (spec §4).
 *
 * This module answers WHAT a moment sounds like. `state.ts` answers WHEN.
 * That split is cross-cutting constraint 3: identity is world content, the
 * choreography rules around it are world-agnostic.
 */
import type { Cue } from '@/lib/presentation/cues';
import type { SoundId } from './manifest';

export type MusicBed = 'lobby' | 'round' | 'ceremony';

export const BED_STEMS = {
  lobby: ['lobby-groove'],
  round: ['round-base', 'round-drive', 'round-urgency', 'round-dread'],
  ceremony: ['ceremony-bed'],
} as const satisfies Record<MusicBed, readonly SoundId[]>;

/** Stems held at silence unless the final-question escalation is active. */
export const ESCALATION_STEMS: readonly SoundId[] = ['round-dread'];

/** The two stems the ANSWER tension ramp drives. Every other stem sits at 1. */
export const DRIVE_STEM: SoundId = 'round-drive';
export const URGENCY_STEM: SoundId = 'round-urgency';

export const BED_CROSSFADE_MS = 600;
export const REVEAL_DECAY_MS = 400;
export const UNLOCK_FADE_MS = 800;
/** Roughly -6 dB. */
export const DUCK_GAIN = 0.5;
export const DUCK_ATTACK_MS = 60;
export const DUCK_RELEASE_MS = 250;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Opens from the very start of the ramp; fully in at t = 0.55. */
export const driveGain = (t: number): number => clamp01(t / 0.55);
/** Silent until t = 0.45, so it arrives after `drive` rather than with it. */
export const urgencyGain = (t: number): number => clamp01((t - 0.45) / 0.55);

/** Played when a TRACK beat has no drama to announce. */
export const TRACK_DEFAULT_STING: SoundId = 'track-whoosh';

/**
 * The sound a cue makes, in isolation. `null` means deliberate silence:
 * `player-advanced` would be mush at one per advancing player, `streak-broken`
 * would be mockery (PRD §8), and `phase-track` is arbitrated in `state.ts`.
 */
export function stingFor(cue: Cue): SoundId | null {
  switch (cue.type) {
    case 'player-joined': return 'join-blip';
    case 'phase-countdown': return 'countdown-riser';
    case 'phase-read': return 'category-slam';
    case 'phase-answer': return 'answer-open';
    case 'answer-locked': return 'lock';
    case 'phase-reveal': return 'reveal-hit';
    case 'answer-resolved':
      return cue.answered ? (cue.correct ? 'correct' : 'wrong-soft') : null;
    case 'overtake': return 'overtake-whoosh';
    case 'lead-changed': return 'lead-flourish';
    case 'streak-tier':
      return cue.streak === 3 ? 'streak-3' : cue.streak === 5 ? 'streak-5' : 'streak-8';
    case 'final-question': return 'final-sting';
    // Reuses the final-question sting rather than adding an asset. The sounds
    // are generated source, not files (ADR-0025), and a new one would mean a
    // regenerate pass for a moment that already has the right character: this
    // IS the final question, one rung up. P2b may revisit it.
    case 'sudden-death': return 'final-sting';
    case 'podium': return 'fanfare';
    default: return null;
  }
}
