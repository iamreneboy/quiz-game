'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useGameStore } from '@/lib/store';
import { loadSession } from '@/lib/session';
import { msUntil } from '@/lib/serverTime';
import { elapsedIn } from '@/lib/staging/beats';
import { BOARD_AT, CEREMONY_MS } from '@/lib/ceremony/beats';
import { useCeremony } from '@/lib/ceremony/useCeremony';
import ResultsTable from './ResultsTable';
import WinnerCard from './WinnerCard';

export default function ResultsView({ code }: { code: string }) {
  const room = useGameStore(s => s.room);
  const standings = useGameStore(s => s.standings);
  const board = useCeremony(s => s.steps.board);
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

  const myId = typeof window !== 'undefined' ? loadSession(code)?.playerId ?? null : null;
  if (!room || !standings || standings.length === 0) return null;

  const winner = standings[0];
  const show = board || settled;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:gap-8 sm:p-6">
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

      <WinnerCard winner={winner} totalRounds={room.total_rounds} show={show} instant={settled} />

      <ResultsTable standings={standings} myId={myId} show={show} instant={settled} />

      {/*
        Spec decision 5 — ADR-0016's "staging never gates input", applied to the
        last screen. Deliberately OUTSIDE every fading wrapper: an exit that is
        focusable but invisible is worse than one that is simply there, so this
        never carries the board's staged opacity.
      */}
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
