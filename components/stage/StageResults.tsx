'use client';
import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { useGameStore } from '@/lib/store';
import { msUntil } from '@/lib/serverTime';
import { elapsedIn } from '@/lib/staging/beats';
import { AWARDS_AT, BOARD_AT, CEREMONY_MS, PHOTO_TALLY_AT } from '@/lib/ceremony/beats';
import { useCeremony } from '@/lib/ceremony/useCeremony';
import { useAwards } from '@/lib/useAwards';
import AwardsCard from '@/components/AwardsCard';
import PhotoFinish from '@/components/PhotoFinish';
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
  const photo = useCeremony(s => s.steps.photo);
  const awardsShown = useCeremony(s => s.steps.awards);
  const awards = useAwards(room?.id ?? null, room?.status === 'finished');
  const endsAt = room?.ends_at ?? null;

  const [settled] = useState(
    () => elapsedIn(CEREMONY_MS, endsAt ? msUntil(endsAt) : null) >= BOARD_AT,
  );

  /**
   * "Was the prelude already running when this component mounted?"
   *
   * ONE-SHOT, for exactly the reason `settled` above is: the ceremony runtime
   * publishes from a requestAnimationFrame tick started in an effect, so a
   * reload lands one frame before `steps.photo` is real. Without this, a reload
   * mid-prelude would play the card's entrance again.
   *
   * `PHOTO_TALLY_AT` rather than 0 is the threshold on purpose: a mount inside
   * the first 700ms is a genuine entrance — the card has not started saying
   * anything yet — and should animate.
   */
  const [photoInstant] = useState(
    () => elapsedIn(CEREMONY_MS, endsAt ? msUntil(endsAt) : null) >= PHOTO_TALLY_AT,
  );

  /**
   * "Was the awards beat already over when this component mounted?"
   *
   * The same ONE-SHOT as `settled` above, against this card's own threshold
   * (ADR-0030). It is read here rather than inside AwardsCard on purpose: the
   * question is whether THIS CLIENT witnessed the beat, and the card can mount
   * a moment later than the screen does, when the awards fetch lands. Deriving
   * it at the card's own mount would suppress a legitimate entrance for anyone
   * whose round trip happened to straddle AWARDS_AT.
   */
  const [awardsSettled] = useState(
    () => elapsedIn(CEREMONY_MS, endsAt ? msUntil(endsAt) : null) >= AWARDS_AT,
  );


  if (!room || !standings || standings.length === 0) return null;

  const sd = room?.sudden_death ?? null;
  const wonOnSuddenDeath = !!sd?.winner_id && sd.winner_id === standings[0].player_id;

  const show = board || settled;

  return (
    <div
      data-testid="stage-results"
      data-entered={show ? 'true' : 'false'}
      className="flex h-full w-full flex-col justify-center gap-6"
    >
      {/*
        Conditionally mounted on the prelude's own beat, so it retires cleanly
        when the podium takes over. `initial={false}` is the standing guard
        against an entrance replaying on a mid-beat mount (CURRENT.md); the
        `photoInstant` one-shot covers the case AnimatePresence cannot see.
      */}
      <AnimatePresence initial={false}>
        {photo.open && <PhotoFinish key="photo-finish" instant={photoInstant} />}
      </AnimatePresence>

      <WinnerCard
        winner={standings[0]}
        totalRounds={room.total_rounds}
        show={show}
        instant={settled}
        suddenDeath={wonOnSuddenDeath}
      />
      <ResultsTable standings={standings} myId={null} show={show} instant={settled} />

      <AwardsCard
        awards={awards}
        show={awardsShown || awardsSettled}
        instant={awardsSettled}
      />
    </div>
  );
}
