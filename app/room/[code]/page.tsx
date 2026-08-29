'use client';
import { Suspense, use, useCallback, useSyncExternalStore } from 'react';
import { useGameStore } from '@/lib/store';
import { useRoomChannel } from '@/lib/useRoomChannel';
import { useRoomRuntimes } from '@/lib/useRoomRuntimes';
import { useHostDriver } from '@/lib/useHostDriver';
import { loadSession, subscribeSession } from '@/lib/session';
import { supabase } from '@/lib/supabaseClient';
import type { RoomState } from '@/lib/types';
import JoinGate from '@/components/JoinGate';
import LobbyView from '@/components/LobbyView';
import GameView from '@/components/GameView';
import ResultsView from '@/components/ResultsView';
import SettingsControl from '@/components/SettingsControl';
import PixiStage from '@/components/PixiStage';
import PerfOverlay from '@/components/PerfOverlay';
import TensionFrame from '@/components/TensionFrame';
import HostControlStrip from '@/components/HostControlStrip';
import PauseCard from '@/components/PauseCard';

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = use(params);
  const code = rawCode.toUpperCase();
  /**
   * "Does this browser hold a session for this room?" — a localStorage read,
   * so it cannot happen during the server render.
   *
   * `null` is the server snapshot and means NOT KNOWN YET: React renders it
   * through hydration and switches to the real value immediately after, which
   * is what keeps the markup identical on both sides. Reading it through
   * useSyncExternalStore rather than copying it into state from an effect is
   * what keeps this off the cascading-render path (react-hooks/set-state-in-effect),
   * and `subscribeSession` means a fresh join updates it without anyone
   * calling a setter.
   */
  const hasSession = useSyncExternalStore(
    subscribeSession,
    useCallback(() => !!loadSession(code), [code]),
    () => null,
  );
  const room = useGameStore(s => s.room);
  const applyState = useGameStore(s => s.applyState);
  const channel = useRoomChannel(code);
  const driver = useHostDriver(code, channel);
  const isHost = typeof window !== 'undefined' && !!loadSession(code)?.hostKey;

  useRoomRuntimes(code, 'player');

  async function handleJoined() {
    // No setHasSession here: JoinGate has already called saveSession, which
    // notified the store above.
    const { data } = await supabase.rpc('get_room_state', { p_code: code });
    if (data) {
      applyState(data as RoomState);
      const session = loadSession(code);
      const me = (data as RoomState).players.find(p => p.id === session?.playerId);
      if (me) channel?.send({ type: 'broadcast', event: 'player_joined', payload: me });
    }
  }

  let content: React.ReactNode = null;
  if (hasSession === null) {
    content = null;
  } else if (!hasSession) {
    content = <JoinGate code={code} onJoined={handleJoined} />;
  } else if (!room) {
    content = <main className="grid min-h-screen place-items-center text-ink-dim">Connecting…</main>;
  } else if (room.status === 'lobby') {
    content = <LobbyView code={code} isHost={isHost} onStart={driver.start} startError={driver.error} />;
  } else if (room.status === 'finished') {
    content = <ResultsView code={code} driver={driver} />;
  } else {
    content = <GameView code={code} />;
  }

  return (
    <div className="relative min-h-screen">
      {/* Mounted through results: the podium ceremony is a canvas beat (P5a). */}
      {room && <PixiStage code={code} role="player" />}
      <TensionFrame />
      <SettingsControl />
      <Suspense fallback={null}>
        <PerfOverlay />
      </Suspense>
      {/*
        The strip reserves its own height at the bottom of the readable column
        so a fixed bar can never sit on top of the answer grid. z-order is
        content (10) < pause card (20) < strip (30): the host must still be able
        to reach Resume through the card that is telling everyone why they are
        waiting.
      */}
      <div className={`relative z-10 ${isHost ? 'pb-16' : ''}`}>{content}</div>
      <PauseCard />
      {isHost && <HostControlStrip driver={driver} />}
    </div>
  );
}
