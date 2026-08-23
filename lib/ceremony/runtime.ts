/**
 * The ceremony runtime — a clock, and nothing else.
 *
 * Not unit-tested by design: every decision it makes lives in beats.ts, which
 * is. Same arrangement as lib/staging/runtime.ts and lib/audio/runtime.ts.
 *
 * It subscribes to NO cues. The ceremony's position comes entirely from the
 * server's `ends_at`, which is what makes a reload land settled instead of
 * replaying (ADR-0014, and see ADR-0024 for why replaying would also desync
 * from P4's already-suppressed fanfare).
 */
import { msUntil } from '@/lib/serverTime';
import { elapsedIn } from '@/lib/staging/beats';
import { useGameStore } from '@/lib/store';
import { CEREMONY_MS, NO_CEREMONY, ceremonyStepsAt } from './beats';
import { useCeremony } from './useCeremony';

export function startCeremonyRuntime(): () => void {
  const { publish } = useCeremony.getState();

  let frame = 0;
  const tick = () => {
    frame = requestAnimationFrame(tick);

    const room = useGameStore.getState().room;
    if (room?.phase !== 'results') {
      publish(NO_CEREMONY);
      return;
    }

    // `ends_at ? msUntil(...) : null` mirrors lib/staging/runtime.ts:101. A
    // null deadline — a pre-0004 database — means "beat over", so the podium
    // renders settled rather than failing.
    const remainingMs = room.ends_at ? msUntil(room.ends_at) : null;
    publish(ceremonyStepsAt(elapsedIn(CEREMONY_MS, remainingMs)));
  };

  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    publish(NO_CEREMONY);
  };
}
