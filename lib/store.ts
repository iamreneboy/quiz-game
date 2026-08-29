import { create } from 'zustand';
import type { PhaseEvent, PlayerPublic, QuestionPublic, RevealPayload, RoomInfo, RoomState, Standing } from './types';
import { noteServerTime } from './serverTime';

export interface GameState {
  room: RoomInfo | null;
  players: PlayerPublic[];
  question: QuestionPublic | null;
  reveal: RevealPayload | null;
  standings: Standing[] | null;
  myAnswer: number | null;
  /**
   * True once `get_room_state` has told us this code does not exist. Set by
   * lib/useRoomChannel.ts, read by the stage route — a TV shows a typo as a
   * typo rather than an eternal "Connecting…".
   */
  roomMissing: boolean;
  applyState(s: RoomState): void;
  applyPhaseEvent(e: PhaseEvent): void;
  addPlayer(p: PlayerPublic): void;
  setMyAnswer(i: number): void;
  setRoomMissing(missing: boolean): void;
}

export const useGameStore = create<GameState>((set, get) => ({
  room: null, players: [], question: null, reveal: null, standings: null, myAnswer: null,
  roomMissing: false,

  applyState(s) {
    noteServerTime(s.room.server_now);
    set({
      room: s.room, players: s.players, question: s.question,
      reveal: s.reveal, standings: s.standings,
    });
  },

  applyPhaseEvent(e) {
    noteServerTime(e.server_now);
    const room = get().room;
    if (!room) return;
    const next: Partial<GameState> = {
      room: {
        ...room, phase: e.phase, round: e.round, ends_at: e.ends_at,
        server_now: e.server_now,
        // Status arrives on the wire from 0005 onward. A paused room keeps its
        // phase, so the old `phase === 'results' ? 'finished' : 'playing'`
        // inference cannot see a pause at all — it survives only as the
        // pre-0005 fallback (ADR-0037).
        status: e.status ?? (e.phase === 'results' ? 'finished' : 'playing'),
        paused_remaining_ms: e.paused_remaining_ms ?? null,
        // skip_question shortens the track mid-game, so this is no longer fixed
        // at room creation (ADR-0038).
        total_rounds: e.total_rounds ?? room.total_rounds,
        // The tiebreak is not derivable from anything else on the event: a
        // tiebreak READ is indistinguishable from an ordinary one but for this
        // (ADR-0042). An absent key folds to null, which every consumer reads
        // as "no tiebreak".
        sudden_death: e.sudden_death ?? null,
      },
    };
    if (e.phase === 'read') {
      next.question = e.payload as QuestionPublic;
      next.reveal = null;
      next.myAnswer = null;
    } else if (e.phase === 'answer') {
      next.question = e.payload as QuestionPublic;
    } else if (e.phase === 'reveal') {
      const r = e.payload as RevealPayload;
      next.reveal = r;
      next.standings = r.standings;
    } else if (e.phase === 'track' || e.phase === 'results') {
      next.standings = e.payload as Standing[];
    }
    set(next);
  },

  addPlayer(p) {
    set(s => (s.players.some(x => x.id === p.id) ? s : { players: [...s.players, p] }));
  },

  setMyAnswer(i) { set({ myAnswer: i }); },

  setRoomMissing(missing) {
    set(state => (state.roomMissing === missing ? state : { roomMissing: missing }));
  },
}));
