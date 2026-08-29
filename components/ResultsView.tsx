'use client';
import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence } from 'motion/react';
import { useGameStore } from '@/lib/store';
import { loadSession } from '@/lib/session';
import { msUntil } from '@/lib/serverTime';
import { elapsedIn } from '@/lib/staging/beats';
import { AWARDS_AT, BOARD_AT, CEREMONY_MS, PHOTO_TALLY_AT } from '@/lib/ceremony/beats';
import { useCeremony } from '@/lib/ceremony/useCeremony';
import { useAwards } from '@/lib/useAwards';
import type { HostDriver } from '@/lib/useHostDriver';
import AwardsCard from './AwardsCard';
import RematchCard from './RematchCard';
import PhotoFinish from './PhotoFinish';
import ResultsTable from './ResultsTable';
import WinnerCard from './WinnerCard';

export default function ResultsView({ code, driver }: { code: string; driver: HostDriver }) {
  const room = useGameStore(s => s.room);
  const standings = useGameStore(s => s.standings);
  const board = useCeremony(s => s.steps.board);
  const photo = useCeremony(s => s.steps.photo);
  const awardsShown = useCeremony(s => s.steps.awards);
  const awards = useAwards(room?.id ?? null, room?.status === 'finished');
  const endsAt = room?.ends_at ?? null;

  /**
   * "Was the board beat already over when this component mounted?"
   *
   * ONE-SHOT, read once in a lazy initializer, never updated (ADR-0014 is
   * explicit that this fix must stay one-shot rather than becoming a standing
   * subscription).
   *
   * This exists because lib/ceremony/runtime.ts publishes from a
   * requestAnimationFrame tick started in an effect, so `steps.board` is FALSE
   * on this component's first render even when the ceremony finished minutes
   * ago. Without this, a reload past the ceremony would render hidden, see
   * `board` flip true one frame later, and play the whole entrance — the fourth
   * occurrence of the replay trap CURRENT.md tracks, in a guise
   * `AnimatePresence initial={false}` cannot reach because nothing here mounts
   * conditionally.
   *
   * It re-derives nothing: same `ends_at`, same `elapsedIn`, same pure
   * constants the runtime itself uses, so the two answers cannot disagree. A
   * null deadline — a pre-0004 database — means "beat over", which is the
   * correct reading: there is no ceremony to wait for, so the board is simply
   * there.
   */
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


  const myId = typeof window !== 'undefined' ? loadSession(code)?.playerId ?? null : null;
  if (!room || !standings || standings.length === 0) return null;

  const sd = room?.sudden_death ?? null;
  const wonOnSuddenDeath = !!sd?.winner_id && sd.winner_id === standings[0].player_id;

  const winner = standings[0];
  const show = board || settled;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:gap-8 sm:p-6">
      {/*
        Conditionally mounted on the prelude's own beat, so it retires cleanly
        when the podium takes over. `initial={false}` is the standing guard
        against an entrance replaying on a mid-beat mount (CURRENT.md); the
        `photoInstant` one-shot covers the case AnimatePresence cannot see.
      */}
      <AnimatePresence initial={false}>
        {photo.open && <PhotoFinish key="photo-finish" instant={photoInstant} />}
      </AnimatePresence>

      {/*
        Reserves exactly the height PixiStage is showing, so the board can
        never overlap the podium. The 0px fallback is what a client with no
        canvas at all gets — the full board, immediately.
      */}
      <div
        aria-hidden="true"
        className="shrink-0 transition-[height] duration-(--dur-settle) ease-settle"
        style={{ height: 'var(--ceremony-band, 0px)' }}
      />

      <WinnerCard
        winner={winner}
        totalRounds={room.total_rounds}
        show={show}
        instant={settled}
        suddenDeath={wonOnSuddenDeath}
      />

      <ResultsTable standings={standings} myId={myId} show={show} instant={settled} />

      <AwardsCard
        awards={awards}
        show={awardsShown || awardsSettled}
        instant={awardsSettled}
      />

      {/*
        Spec decision 5 — ADR-0016's "staging never gates input", applied to the
        last screen. Both of these sit deliberately OUTSIDE every fading
        wrapper: a control that is focusable but invisible is worse than one
        that is simply there, so neither carries the board's staged opacity.
      */}
      <RematchCard driver={driver} />

      <Link
        href="/"
        className="mx-auto rounded-control border border-haze/50 bg-abyss/70 px-5 py-2.5
          text-sm font-bold uppercase tracking-widest text-neon-cyan backdrop-blur-md
          transition-colors hover:bg-haze/30
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-cyan"
      >
        Back to home
      </Link>
    </main>
  );
}
