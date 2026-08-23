'use client';
import { Suspense, use } from 'react';
import { useGameStore } from '@/lib/store';
import { useRoomChannel } from '@/lib/useRoomChannel';
import { useRoomRuntimes } from '@/lib/useRoomRuntimes';
import PixiStage from '@/components/PixiStage';
import PerfOverlay from '@/components/PerfOverlay';
import TensionFrame from '@/components/TensionFrame';
import StageBroadcast from '@/components/stage/StageBroadcast';
import StageGate from '@/components/stage/StageGate';

/**
 * "Circuit Break Broadcast" — the read-only spectator screen (PRD §8).
 *
 * READ-ONLY BY COMPOSITION, not by a guard: this route mounts none of the
 * components that can write. No JoinGate, no GameView, no useHostDriver, no
 * SettingsControl. The channel subscription is used for its incoming
 * broadcasts only — the return value is deliberately discarded, because
 * nothing here has anything to send (spec decision 2).
 */
export default function StagePage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = use(params);
  const code = rawCode.toUpperCase();
  const room = useGameStore(s => s.room);
  const roomMissing = useGameStore(s => s.roomMissing);

  useRoomChannel(code);
  useRoomRuntimes(code, 'stage');

  if (roomMissing) {
    return (
      <main data-testid="stage-missing" className="grid min-h-screen place-items-center gap-4 p-8 text-center">
        <div>
          <p className="font-display text-[0.6875rem] font-semibold uppercase tracking-[0.28em] text-ink-mute">
            No such room
          </p>
          <p className="font-display text-display font-black tracking-[0.2em] text-ink-dim">{code}</p>
        </div>
      </main>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {room && <PixiStage code={code} role="stage" />}
      <TensionFrame />
      <Suspense fallback={null}>
        <PerfOverlay />
      </Suspense>
      {room ? (
        <StageBroadcast />
      ) : (
        <main className="grid min-h-screen place-items-center text-ink-dim">Connecting…</main>
      )}
      <StageGate code={code} />
    </div>
  );
}
