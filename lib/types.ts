export type Phase = 'lobby'|'countdown'|'read'|'answer'|'reveal'|'track'|'results';
export type Tier = 1|2|3|4;
export interface PlayerPublic { id: string; nickname: string; avatar: string; color: string; is_host: boolean; is_playing: boolean; }
export interface QuestionPublic { category: string; tier: Tier; prompt: string; options: string[]; }
export interface Standing {
  player_id: string; nickname: string; avatar: string; color: string;
  correct: number; speed_points: number; longest_streak: number; current_streak: number;
  /** Rounds this player actually submitted. Absent against a pre-0004 database. */
  answered?: number;
  /** Mean ms from question open to submission; null when `answered` is 0. */
  avg_answer_ms?: number | null;
}
export interface Pick { player_id: string; choice_index: number; }
export interface RevealPayload { correct_index: number; fun_fact: string|null; counts: number[]; picks: Pick[]; fastest: { player_id: string; nickname: string; time_remaining_ms: number }|null; standings: Standing[]; }
export type RoomStatus = 'lobby'|'playing'|'paused'|'finished';

/**
 * The tiebreak, as the server describes it (ADR-0042).
 *
 * `contenders` is the authority's own list echoed back for rendering;
 * `submit_answer` enforces it, so a client that ignored this would still be
 * refused. `winner_id` is null until the tiebreak's REVEAL — it is written at
 * the `answer -> reveal` transition, so the READ never carries it.
 */
export interface SuddenDeathInfo {
  /** The round the tiebreak occupies: always `total_rounds + 1` (ADR-0043). */
  round: number;
  contenders: string[];
  winner_id: string | null;
}

export interface PhaseEvent {
  phase: Phase; round: number; ends_at: string|null; server_now: string;
  /**
   * The room's status. Optional so a pre-0005 database does not throw; when it
   * is absent `applyPhaseEvent` falls back to the old inference. It exists
   * because status can no longer BE inferred from phase: a paused room's phase
   * does not change (ADR-0037).
   */
  status?: RoomStatus;
  /** ms frozen at the pause. Null while playing. Absent pre-0005. */
  paused_remaining_ms?: number|null;
  /** The live track length — `skip_question` shortens it mid-game. Absent pre-0005. */
  total_rounds?: number;
  /** The tiebreak, or null. Absent against a pre-0007 database. */
  sudden_death?: SuddenDeathInfo | null;
  payload: QuestionPublic|RevealPayload|Standing[]|null;
}

export interface RoomInfo {
  id: string; code: string; status: RoomStatus; phase: Phase; round: number;
  total_rounds: number; timer_seconds: number; ends_at: string|null;
  server_now: string;
  /** ms frozen at the pause. Null while playing. Absent against a pre-0005 database. */
  paused_remaining_ms?: number|null;
  /** The tiebreak, or null. Absent against a pre-0007 database. */
  sudden_death?: SuddenDeathInfo | null;
}
export interface RoomState { room: RoomInfo; players: PlayerPublic[]; question: QuestionPublic|null; reveal: RevealPayload|null; standings: Standing[]|null; }

/**
 * One round of the host's draw, as `draw_public` returns it.
 *
 * `correct_index` and `fun_fact` are OPTIONAL because the server omits the keys
 * entirely for a host who is also racing — not because they can be null
 * (ADR-0040). Read them only behind `RoomDraw.answers_visible`.
 */
export interface DrawQuestion {
  round: number;
  category: string;
  tier: Tier;
  prompt: string;
  options: string[];
  /** True when the host wrote this one; it lives only in this room (PRD §7). */
  is_custom: boolean;
  correct_index?: number;
  fun_fact?: string | null;
}

export interface RoomDraw {
  total_rounds: number;
  timer_seconds: number;
  /** The pool the host chose at creation — the only categories a custom question may use. */
  categories: string[];
  /** False whenever the host is also a racer. The server decides; the client only reports. */
  answers_visible: boolean;
  questions: DrawQuestion[];
}
