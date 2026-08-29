'use client';
import { use, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { supabase } from '@/lib/supabaseClient';
import { loadSession, subscribeSession } from '@/lib/session';
import { estimateDurationSeconds, TIER_NAMES } from '@/lib/rank';
import { joinUrl } from '@/lib/qr';
import { useOrigin } from '@/lib/useOrigin';
import { DURATION, EASE } from '@/lib/presentation/tokens';
import { tierCounts, type CustomQuestionDraft } from '@/lib/draw';
import type { RoomDraw, Tier } from '@/lib/types';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import JoinQr from '@/components/host/JoinQr';
import DrawCard from '@/components/host/DrawCard';
import CustomQuestionForm from '@/components/host/CustomQuestionForm';

const sectionMotion = (index: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DURATION.settle / 1000, ease: EASE.settle, delay: index * 0.06 },
});

const sectionHeading =
  'font-display text-[0.6875rem] font-semibold uppercase tracking-[0.28em] text-neon-cyan';

/**
 * PRD §5.1 step 5, the wizard's last stop before the lobby.
 *
 * Everything here is host-only and lobby-only, and both of those are enforced
 * inside the RPCs — `hostKey` gates what is drawn, never what is permitted
 * (roadmap decision 2). A host who touches nothing and hits "Open the lobby"
 * gets exactly the game the wizard already drew, which is what keeps PRD's
 * "hits Next three times" default intact.
 */
export default function ReviewPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = use(params);
  const code = rawCode.toUpperCase();
  const router = useRouter();
  const origin = useOrigin();

  const [draw, setDraw] = useState<RoomDraw | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  /**
   * A screen reader will not re-announce `aria-live` text that reads
   * identically to what's already there — swapping round 1 twice in a row
   * both produce "Question 1 swapped." Appending a zero-width space when the
   * new message matches the last one gives the region new text to announce
   * without changing what's read aloud.
   */
  const announceStatus = (message: string) => {
    setStatus(prev => (prev === message ? `${message}​` : message));
  };

  /**
   * "Does this browser hold a session for this room?" — mirrors
   * `app/room/[code]/page.tsx` exactly, snapshot and all: `null` is the
   * server snapshot and means NOT KNOWN YET, so the branch below renders
   * nothing until hydration resolves it, which is what keeps server and
   * client markup identical. The snapshot has to be a primitive boolean, not
   * the session object itself — `loadSession` re-parses JSON on every call,
   * so returning its result directly from `getSnapshot` hands back a new
   * reference each render and `useSyncExternalStore` reads that as "the
   * store changed," which loops forever.
   */
  const hasSession = useSyncExternalStore(
    subscribeSession,
    useCallback(() => !!loadSession(code), [code]),
    () => null,
  );
  // Safe to call directly (not through useSyncExternalStore) once `hasSession`
  // has resolved: this only runs post-hydration, same as `isHost` on the room
  // page, and roomId/hostKey are primitives so effect deps compare correctly.
  const session = typeof window === 'undefined' ? null : loadSession(code);
  const roomId = session?.roomId ?? null;
  const hostKey = session?.hostKey ?? null;

  useEffect(() => {
    if (!roomId || !hostKey) return;
    let live = true;
    void (async () => {
      const { data, error: err } = await supabase.rpc('get_room_draw', {
        p_room_id: roomId, p_host_key: hostKey,
      });
      if (!live) return;
      if (err) setLoadError(err.message);
      else setDraw(data as RoomDraw);
    })();
    return () => { live = false; };
  }, [roomId, hostKey]);

  /**
   * Every mutation returns the whole draw, so there is never a merge.
   *
   * Not wrapped in `useCallback`: `roomId`/`hostKey` come from `loadSession`,
   * a plain function call the React Compiler cannot prove is stable across
   * renders, so a manual memoization here is one the compiler can never
   * preserve (`react-hooks/preserve-manual-memoization`) — and nothing downstream
   * needs `mutate`'s identity to stay stable anyway.
   */
  const mutate = async (
    rpc: string, args: Record<string, unknown>, announce: string,
  ): Promise<string | null> => {
    if (!roomId || !hostKey) return 'This browser is not the host of this room.';
    setBusy(true);
    try {
      const { data, error: err } = await supabase.rpc(rpc, {
        p_room_id: roomId, p_host_key: hostKey, ...args,
      });
      if (err) return err.message;
      setDraw(data as RoomDraw);
      announceStatus(announce);
      return null;
    } finally {
      setBusy(false);
    }
  };

  if (hasSession === null) {
    return null;
  }

  if (!hostKey) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 px-6 py-16 text-center">
        <p className="text-ink-dim">This review is for the host of room {code}.</p>
        <a href={`/room/${code}`} className="text-neon-cyan underline">Go to the room</a>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 px-6 py-16 text-center">
        <p className="text-wrong">{loadError}</p>
        <a href={`/room/${code}`} className="text-neon-cyan underline">Go to the room</a>
      </main>
    );
  }

  if (!draw) {
    return <main className="grid min-h-screen place-items-center text-ink-dim">Drawing…</main>;
  }

  const minutes = Math.round(
    estimateDurationSeconds(draw.total_rounds, draw.timer_seconds) / 60);
  const join = origin ? joinUrl(origin, code) : null;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <motion.header {...sectionMotion(0)}>
        <p className={sectionHeading}>Race control</p>
        <h1 className="mt-2 font-display text-hero font-bold uppercase text-ink">
          Review the draw
        </h1>
      </motion.header>

      <motion.section {...sectionMotion(1)}>
        <Panel className="flex items-center gap-5 p-6">
          <div className="min-w-0 flex-1">
            <p className={sectionHeading}>Room code</p>
            <p className="font-display text-display font-black tracking-[0.18em] text-neon-cyan">
              {code}
            </p>
            <p className="mt-2 truncate text-sm text-ink-dim">{join ?? ' '}</p>
            <p data-testid="draw-total" className="mt-1 text-sm text-ink-mute">
              {draw.total_rounds} question{draw.total_rounds === 1 ? '' : 's'} · about {minutes} min
            </p>
            <p className="mt-1 text-xs text-ink-dim">
              {tierCounts(draw.questions)
                .map((n, i) => `${n} ${TIER_NAMES[(i + 1) as Tier]}`)
                .join(' · ')}
            </p>
          </div>
          <JoinQr url={join} className="h-32 w-32" />
        </Panel>
      </motion.section>

      {!draw.answers_visible && (
        <motion.p
          {...sectionMotion(2)}
          data-testid="draw-answers-hidden"
          className="rounded-control border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning"
        >
          You’re racing in this game, so the answers stay hidden. Swap anything you
          already know.
        </motion.p>
      )}

      <p role="status" aria-live="polite" className="sr-only">{status}</p>

      <motion.ul {...sectionMotion(3)} className="space-y-3">
        <AnimatePresence initial={false}>
          {draw.questions.map(question => (
            <DrawCard
              key={`${question.round}:${question.prompt}`}
              question={question}
              answersVisible={draw.answers_visible}
              busy={busy}
              canRemove={draw.total_rounds > 1}
              onSwap={() => void mutate(
                'swap_question', { p_round: question.round },
                `Question ${question.round} swapped.`,
              ).then(setActionError)}
              onRemove={() => void mutate(
                'remove_question', { p_round: question.round },
                `Question ${question.round} removed.`,
              ).then(setActionError)}
            />
          ))}
        </AnimatePresence>
      </motion.ul>

      {actionError && <p className="text-wrong">{actionError}</p>}

      {adding ? (
        <CustomQuestionForm
          categories={draw.categories}
          busy={busy}
          onCancel={() => setAdding(false)}
          onSubmit={async (d: CustomQuestionDraft) => {
            const failure = await mutate('add_custom_question', {
              p_category: d.category, p_tier: d.tier, p_prompt: d.prompt,
              p_options: d.options, p_correct_index: d.correctIndex,
              p_fun_fact: d.funFact || null,
            }, 'Your question was added to the draw.');
            if (!failure) setAdding(false);
            return failure;
          }}
        />
      ) : (
        <Button
          data-testid="draw-add-toggle"
          variant="ghost"
          className="w-full"
          onClick={() => setAdding(true)}
        >
          + Add your own question
        </Button>
      )}

      <Button
        data-testid="draw-open-lobby"
        size="lg"
        className="w-full"
        disabled={busy}
        onClick={() => router.push(`/room/${code}`)}
      >
        Open the lobby
      </Button>
    </main>
  );
}
