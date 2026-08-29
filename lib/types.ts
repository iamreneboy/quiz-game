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
  payload: QuestionPublic|RevealPayload|Standing[]|null;
}

export interface RoomInfo {
  id: string; code: string; status: RoomStatus; phase: Phase; round: number;
  total_rounds: number; timer_seconds: number; ends_at: string|null;
  server_now: string;
  /** ms frozen at the pause. Null while playing. Absent against a pre-0005 database. */
  paused_remaining_ms?: number|null;
}
export interface RoomState { room: RoomInfo; players: PlayerPublic[]; question: QuestionPublic|null; reveal: RevealPayload|null; standings: Standing[]|null; }
