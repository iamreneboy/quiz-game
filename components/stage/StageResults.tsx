'use client';
import { useState } from 'react';
import { useGameStore } from '@/lib/store';
import { msUntil } from '@/lib/serverTime';
import { elapsedIn } from '@/lib/staging/beats';
import { BOARD_AT, CEREMONY_MS } from '@/lib/ceremony/beats';
import { useCeremony } from '@/lib/ceremony/useCeremony';
import ResultsTable from '@/components/ResultsTable';
import WinnerCard from '@/components/WinnerCard';

/**
 * The results board on a broadcast screen.
 *
 * Differs from components/ResultsView.tsx in exactly two ways: `myId` is null,
 * because there is no local player to highlight; and there is no "Back to
 * home" link, because there is nothing on a TV to press it with.
 *
 * `settled` is the same ONE-SHOT mount-time derivation ResultsView carries
 * (ADR-0030), and it is not optional here. `lib/ceremony/runtime.ts` publishes
 * from a requestAnimationFrame tick started in an effect, so `steps.board`
 * reads FALSE on first render even for a ceremony that ended minutes ago —
 * and a stage view is MORE likely than a player device to arrive that way,
 * because a TV switched on late is the normal case. Without it the whole board
 * would play its entrance on every reload.
 *
 * Read once via a lazy initializer and never updated: same `ends_at`, same
 * `elapsedIn`, same constants the runtime itself uses, so the two answers
 * cannot disagree.
 */
export default function StageResults() {
  const room = useGameStore(s => s.room);
  const standings = useGameStore(s => s.standings);
  const board = useCeremony(s => s.steps.board);
  const endsAt = room?.ends_at ?? null;

  const [settled] = useState(
    () => elapsedIn(CEREMONY_MS, endsAt ? msUntil(endsAt) : null) >= BOARD_AT,
  );

  if (!room || !standings || standings.length === 0) return null;

  const show = board || settled;

  return (
    <div
      data-testid="stage-results"
      data-entered={show ? 'true' : 'false'}
      className="flex h-full w-full flex-col justify-center gap-6"
    >
      <WinnerCard winner={standings[0]} totalRounds={room.total_rounds} show={show} instant={settled} />
      <ResultsTable standings={standings} myId={null} show={show} instant={settled} />
    </div>
  );
}
