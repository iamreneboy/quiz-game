'use client';
import { useEffect, useState } from 'react';
import { useGameStore } from '@/lib/store';
import { supabase } from '@/lib/supabaseClient';
import { loadSession } from '@/lib/session';
import { msUntil } from '@/lib/serverTime';
import { loadAnswerLock, saveAnswerLock, clearAnswerLock } from '@/lib/staging/answerLock';
import { distributionRows } from '@/lib/staging/distribution';
import { useStaging } from '@/lib/staging/useStaging';
import StageShell from './StageShell';
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
  const steps = useStaging(s => s.steps);
  const lockedChoice = useStaging(s => s.lockedChoice);
  const spectating = useStaging(s => s.spectating);
  const standings = useGameStore(s => s.standings);
  const revealSteps = useStaging(s => s.reveal);
  const myId = typeof window !== 'undefined' ? loadSession(code)?.playerId ?? null : null;
  const [submitError, setSubmitError] = useState<string | null>(null);

  const rows =
    reveal && question
      ? distributionRows(question.options, reveal, standings ?? [], myId)
      : undefined;

  const phase = room?.phase;
  const round = room?.round ?? 0;

  // Restore a lock the server already holds (spec §8.1). Runs when ANSWER
  // begins and after a reload; the key is round-scoped, so it can never
  // resurrect a previous round's choice.
  useEffect(() => {
    if (phase !== 'answer' || myAnswer !== null) return;
    const stored = loadAnswerLock(code, round);
    if (stored !== null) setMyAnswer(stored);
  }, [code, phase, round, myAnswer, setMyAnswer]);

  // A new READ means a new round: drop the previous round's key.
  useEffect(() => {
    if (phase === 'read' && round > 1) clearAnswerLock(code, round - 1);
  }, [code, phase, round]);

  if (!room) return null;

  async function choose(i: number) {
    if (!room || myAnswer !== null) return;
    setMyAnswer(i); // optimistic lock
    saveAnswerLock(code, room.round, i);
    const session = loadSession(code);
    if (!session) return;
    const { error } = await supabase.rpc('submit_answer', {
      p_room_id: room.id, p_player_key: session.playerKey,
      p_round: room.round, p_choice_index: i,
    });
    if (error) setSubmitError(error.message);
  }

  if (room.phase === 'countdown') return <Countdown endsAt={room.ends_at} />;

  return (
    <StageShell
      header={
        <>
          {question && (
            <QuestionCard
              question={question}
              round={room.round}
              totalRounds={room.total_rounds}
              steps={steps}
            />
          )}
          {room.phase === 'answer' && <TimerRing />}
        </>
      }
      question={null}
      options={
        question && steps.options ? (
          <AnswerButtons
            key="answer-buttons"
            options={question.options}
            mode={steps.optionsMode}
            lockedChoice={lockedChoice}
            spectating={spectating}
            onChoose={choose}
            rows={rows}
            revealSteps={revealSteps}
          />
        ) : null
      }
      outcome={
        <>
          {spectating && room.phase === 'answer' && (
            <p className="text-center text-sm text-ink-mute">You&rsquo;re watching this one.</p>
          )}
          {room.phase === 'reveal' && question && reveal && (
            <RevealPanel reveal={reveal} question={question} steps={revealSteps} />
          )}
          {room.phase === 'track' && <TrackReadout code={code} />}
          {submitError && <p className="text-center text-sm text-wrong">{submitError}</p>}
        </>
      }
    />
  );
}

/** Restyled to the design system (spec §5). No choreography — not in P3's scope. */
function Countdown({ endsAt }: { endsAt: string | null }) {
  const [n, setN] = useState(3);
  useEffect(() => {
    const id = setInterval(() => setN(Math.max(1, Math.ceil(msUntil(endsAt) / 1000))), 100);
    return () => clearInterval(id);
  }, [endsAt]);
  return (
    <main className="grid min-h-screen place-items-center">
      <span
        className="font-display text-display font-black text-neon-cyan tabular-nums"
        style={{ textShadow: '0 0 60px color-mix(in oklab, var(--color-neon-cyan) 55%, transparent)' }}
      >
        {n}
      </span>
    </main>
  );
}
