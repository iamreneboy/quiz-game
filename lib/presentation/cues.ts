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

/* ── Local-only ──────────────────────────────────────────────────────────── */

export interface AnswerLockedCue {
  type: 'answer-locked';
  tier: 'routine';
  choiceIndex: number;
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
  | AnswerLockedCue
  | PlayerJoinedCue
  | PodiumCue;

export type CueType = Cue['type'];

export type CueOf<T extends CueType> = Extract<Cue, { type: T }>;
