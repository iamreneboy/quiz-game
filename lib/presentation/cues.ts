/**
 * The complete M2 presentation-cue vocabulary (spec §5).
 *
 * This is the single seam between game state and the show: Pixi (P1+),
 * `motion`-driven UI (P3) and Howler (P4) subscribe to these cues and to
 * nothing else. Later phases consume this vocabulary; they never redefine it.
 *
 * Every variant carries its celebration tier as a literal, so the compiler
 * enforces the hierarchy at construction time.
 */

/* ── Phase beats ─────────────────────────────────────────────────────────── */

export interface PhaseCountdownCue {
  type: 'phase-countdown';
  tier: 'routine';
  endsAt: string | null;
}

export interface PhaseReadCue {
  type: 'phase-read';
  tier: 'routine';
  round: number;
  category: string | null;
  /** Question difficulty 1-4 (named to avoid colliding with the celebration tier). */
  questionTier: 1 | 2 | 3 | 4 | null;
  isFinal: boolean;
}

export interface PhaseAnswerCue {
  type: 'phase-answer';
  tier: 'routine';
  round: number;
  endsAt: string | null;
}

export interface PhaseRevealCue {
  type: 'phase-reveal';
  tier: 'routine';
  round: number;
  correctIndex: number | null;
  counts: number[];
  fastest: { playerId: string; nickname: string; timeRemainingMs: number } | null;
}

export interface PhaseTrackCue {
  type: 'phase-track';
  tier: 'routine';
  round: number;
}

export interface PhaseResultsCue {
  type: 'phase-results';
  tier: 'routine';
}

/* ── Standings drama ─────────────────────────────────────────────────────── */

export interface PlayerAdvancedCue {
  type: 'player-advanced';
  tier: 'routine';
  playerId: string;
  /** Track segment before and after this reveal (== correct-answer count). */
  from: number;
  to: number;
}

export interface OvertakeCue {
  type: 'overtake';
  tier: 'overtake';
  playerId: string;
  /** Players this one moved ahead of in the standings order. */
  passed: string[];
}

export interface LeadChangedCue {
  type: 'lead-changed';
  tier: 'overtake';
  playerId: string;
  previousLeaderId: string;
}

/* ── Streaks ─────────────────────────────────────────────────────────────── */

export interface StreakTierCue {
  type: 'streak-tier';
  tier: 'streakMilestone';
  playerId: string;
  /** Consecutive-hit milestone: 3 spark trail, 5 flames, 8 inferno. */
  streak: 3 | 5 | 8;
}

export interface StreakBrokenCue {
  type: 'streak-broken';
  tier: 'routine';
  playerId: string;
}

/* ── Escalation ──────────────────────────────────────────────────────────── */

export interface FinalQuestionCue {
  type: 'final-question';
  tier: 'finalQuestion';
  round: number;
}

/* ── The tiebreak ────────────────────────────────────────────────────────── */

/**
 * A perfect first-place tie has opened a sudden-death round (PRD §5.4.2).
 *
 * The one new rung M3 is allowed (roadmap decision 6). Semantic: it names the
 * round and who is racing it, never a shot, a colour or a sprite.
 */
export interface SuddenDeathCue {
  type: 'sudden-death';
  tier: 'suddenDeath';
  round: number;
  contenders: string[];
}

/* ── Local-only ──────────────────────────────────────────────────────────── */

export interface AnswerLockedCue {
  type: 'answer-locked';
  tier: 'routine';
  choiceIndex: number;
}

export interface AnswerResolvedCue {
  type: 'answer-resolved';
  tier: 'routine';
  /** False when the local player let the clock run out, or is not playing. */
  answered: boolean;
  /** Meaningless when `answered` is false. */
  correct: boolean;
  choiceIndex: number | null;
  correctIndex: number | null;
}

/* ── Lobby / ceremony ────────────────────────────────────────────────────── */

export interface PlayerJoinedCue {
  type: 'player-joined';
  tier: 'routine';
  playerId: string;
  nickname: string;
  avatar: string;
  color: string;
}

export interface PodiumPlace {
  playerId: string;
  nickname: string;
  avatar: string;
  color: string;
  correct: number;
}

export interface PodiumCue {
  type: 'podium';
  tier: 'victory';
  top: PodiumPlace[];
}

/* ── Host authority ──────────────────────────────────────────────────────── */

/**
 * The host stopped the show. `routine` on purpose: a pause is not a
 * celebration, and M3's roadmap (decision 6) reserves the one new rung on the
 * hierarchy for P2's sudden death.
 */
export interface GamePausedCue {
  type: 'game-paused';
  tier: 'routine';
}

export interface GameResumedCue {
  type: 'game-resumed';
  tier: 'routine';
}

/* ── Union ───────────────────────────────────────────────────────────────── */

export type Cue =
  | PhaseCountdownCue
  | PhaseReadCue
  | PhaseAnswerCue
  | PhaseRevealCue
  | PhaseTrackCue
  | PhaseResultsCue
  | PlayerAdvancedCue
  | OvertakeCue
  | LeadChangedCue
  | StreakTierCue
  | StreakBrokenCue
  | FinalQuestionCue
  | SuddenDeathCue
  | AnswerLockedCue
  | AnswerResolvedCue
  | PlayerJoinedCue
  | PodiumCue
  | GamePausedCue
  | GameResumedCue;

export type CueType = Cue['type'];

export type CueOf<T extends CueType> = Extract<Cue, { type: T }>;
