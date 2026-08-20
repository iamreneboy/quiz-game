'use client';
import { use, useEffect, useState } from 'react';
import { useGameStore } from '@/lib/store';
import { useRoomChannel } from '@/lib/useRoomChannel';
import { useHostDriver } from '@/lib/useHostDriver';
import { loadSession } from '@/lib/session';
import { supabase } from '@/lib/supabaseClient';
import type { RoomState } from '@/lib/types';
import JoinGate from '@/components/JoinGate';
import LobbyView from '@/components/LobbyView';
import GameView from '@/components/GameView';

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = use(params);
  const code = rawCode.toUpperCase();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const room = useGameStore(s => s.room);
  const applyState = useGameStore(s => s.applyState);
  const channel = useRoomChannel(code);
  const { start, error: hostError } = useHostDriver(code, channel);
  const isHost = typeof window !== 'undefined' && !!loadSession(code)?.hostKey;

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

  if (hasSession === null) return null;
  if (!hasSession) return <JoinGate code={code} onJoined={handleJoined} />;
  if (!room) return <main className="grid min-h-screen place-items-center text-slate-400">Connecting…</main>;

  if (room.status === 'lobby')
    return <LobbyView code={code} isHost={isHost} onStart={start} startError={hostError} />;
  if (room.status === 'finished')
    return <main className="grid min-h-screen place-items-center text-slate-400">Results (Task 12)…</main>;
  return <GameView code={code} />;
}
