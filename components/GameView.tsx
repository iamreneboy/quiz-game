'use client';
import { useEffect, useState } from 'react';
import { useGameStore } from '@/lib/store';
import { supabase } from '@/lib/supabaseClient';
import { loadSession } from '@/lib/session';
import { msUntil } from '@/lib/serverTime';
import TimerRing from './TimerRing';
import QuestionCard from './QuestionCard';
import AnswerButtons from './AnswerButtons';
import RevealPanel from './RevealPanel';
import TrackReadout from './TrackReadout';

export default function GameView({ code }: { code: string }) {
  const room = useGameStore(s => s.room);
  const question = useGameStore(s => s.question);
  const reveal = useGameStore(s => s.reveal);
  const myAnswer = useGameStore(s => s.myAnswer);
  const setMyAnswer = useGameStore(s => s.setMyAnswer);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!room) return null;

  async function choose(i: number) {
    if (!room || myAnswer !== null) return;
    setMyAnswer(i); // optimistic lock
    const session = loadSession(code);
    if (!session) return;
    const { error } = await supabase.rpc('submit_answer', {
      p_room_id: room.id, p_player_key: session.playerKey,
      p_round: room.round, p_choice_index: i,
    });
    if (error) setSubmitError(error.message);
  }

  if (room.phase === 'countdown') return <Countdown endsAt={room.ends_at} />;
  if (room.phase === 'track') return <TrackReadout code={code} />;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-6 portrait:pt-[30vh]">
      {question && (
        <QuestionCard question={question} round={room.round} totalRounds={room.total_rounds} />
      )}

      {room.phase === 'answer' && (
        <div className="flex justify-center">
          <TimerRing endsAt={room.ends_at} totalMs={room.timer_seconds * 1000} />
        </div>
      )}

      {question && room.phase !== 'reveal' && (
        <AnswerButtons
          options={question.options}
          locked={room.phase !== 'answer' || myAnswer !== null}
          chosen={myAnswer}
          correctIndex={null}
          onChoose={choose}
        />
      )}
      {room.phase === 'read' && (
        <p className="text-center text-sm font-bold uppercase tracking-widest text-slate-500">Get ready…</p>
      )}
      {room.phase === 'answer' && myAnswer !== null && (
        <p className="text-center font-bold text-amber-300">Locked in!</p>
      )}

      {room.phase === 'reveal' && question && reveal && (
        <RevealPanel reveal={reveal} question={question} />
      )}
      {submitError && <p className="text-center text-sm text-rose-400">{submitError}</p>}
    </main>
  );
}

function Countdown({ endsAt }: { endsAt: string | null }) {
  const [n, setN] = useState(3);
  useEffect(() => {
    const id = setInterval(() => setN(Math.max(1, Math.ceil(msUntil(endsAt) / 1000))), 100);
    return () => clearInterval(id);
  }, [endsAt]);
  return (
    <main className="grid min-h-screen place-items-center">
      <span className="text-9xl font-black text-amber-400">{n}</span>
    </main>
  );
}
