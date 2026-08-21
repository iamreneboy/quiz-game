'use client';
import { use, useEffect, useState } from 'react';
import { useGameStore } from '@/lib/store';
import { useRoomChannel } from '@/lib/useRoomChannel';
import { useHostDriver } from '@/lib/useHostDriver';
import { loadSession } from '@/lib/session';
import { supabase } from '@/lib/supabaseClient';
import { startCueBridge } from '@/lib/presentation/cueBus';
import type { RoomState } from '@/lib/types';
import JoinGate from '@/components/JoinGate';
import LobbyView from '@/components/LobbyView';
import GameView from '@/components/GameView';
import ResultsView from '@/components/ResultsView';
import SettingsControl from '@/components/SettingsControl';

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = use(params);
  const code = rawCode.toUpperCase();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const room = useGameStore(s => s.room);
  const applyState = useGameStore(s => s.applyState);
  const channel = useRoomChannel(code);
  const { start, error: hostError } = useHostDriver(code, channel);
  const isHost = typeof window !== 'undefined' && !!loadSession(code)?.hostKey;

  useEffect(() => startCueBridge(), []);

  useEffect(() => { setHasSession(!!loadSession(code)); }, [code]);

  async function handleJoined() {
    setHasSession(true);
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
    content = <LobbyView code={code} isHost={isHost} onStart={start} startError={hostError} />;
  } else if (room.status === 'finished') {
    content = <ResultsView code={code} />;
  } else {
    content = <GameView code={code} />;
  }

  return (
    <div className="relative min-h-screen">
      <SettingsControl />
      <div className="relative z-10">{content}</div>
    </div>
  );
}
