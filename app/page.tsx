'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { DURATION, EASE } from '@/lib/presentation/tokens';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

const rise = {
  hidden: { opacity: 0, y: 24 },
  show: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.settle / 1000, ease: EASE.settle, delay: index * 0.08 },
  }),
};

/** HUD viewfinder corners — the recurring signature on this page's primary panel. */
function HudCorners() {
  const arm = 'pointer-events-none absolute h-4 w-4 border-neon-cyan/70';
  return (
    <>
      <span aria-hidden className={`${arm} -left-1.5 -top-1.5 border-l-2 border-t-2`} />
      <span aria-hidden className={`${arm} -right-1.5 -top-1.5 border-r-2 border-t-2`} />
      <span aria-hidden className={`${arm} -bottom-1.5 -left-1.5 border-b-2 border-l-2`} />
      <span aria-hidden className={`${arm} -bottom-1.5 -right-1.5 border-b-2 border-r-2`} />
    </>
  );
}

export default function Landing() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const ready = code.trim().length === 5;

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-10 overflow-hidden px-6 py-12">
      <motion.div custom={0} initial="hidden" animate="show" variants={rise} className="text-center">
        <p className="font-display text-[0.6875rem] font-semibold uppercase tracking-[0.45em] text-neon-cyan">
          Live from the office
        </p>
        <h1 className="mt-4 font-display text-display font-bold uppercase text-ink">
          Circuit{' '}
          <span className="text-neon-magenta [text-shadow:0_0_28px_var(--color-neon-magenta)]">
            Break
          </span>
        </h1>
        <p className="mt-4 text-ink-dim">The office trivia grand prix</p>
      </motion.div>

      <motion.div custom={1} initial="hidden" animate="show" variants={rise} className="relative w-full">
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-x-6 top-0 z-10 h-px bg-gradient-to-r from-transparent via-neon-cyan to-transparent"
          initial={{ opacity: 0, scaleX: 0.2 }}
          animate={{ opacity: [0, 1, 0], scaleX: 1 }}
          transition={{ duration: DURATION.drift / 1000, ease: EASE.drift, delay: 0.5 }}
        />
        <Panel className="relative flex flex-col gap-6 p-6">
          <HudCorners />
          <Button size="lg" className="w-full" onClick={() => router.push('/host/new')}>
            Host a game
          </Button>

          <div className="flex items-center gap-3 font-display text-[0.625rem] uppercase tracking-[0.3em] text-ink-mute">
            <span className="h-px flex-1 bg-haze/70" />
            or
            <span className="h-px flex-1 bg-haze/70" />
          </div>

          <form
            className="flex gap-2"
            onSubmit={event => {
              event.preventDefault();
              if (ready) router.push(`/room/${code.trim().toUpperCase()}`);
            }}
          >
            <Input
              value={code}
              onChange={event => setCode(event.target.value.toUpperCase())}
              maxLength={5}
              placeholder="ROOM CODE"
              aria-label="Room code"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 text-center font-display text-lg font-semibold uppercase tracking-[0.4em] placeholder:tracking-[0.2em]"
            />
            <Button type="submit" variant="ghost" size="lg" disabled={!ready}>
              Join
            </Button>
          </form>
        </Panel>
      </motion.div>

      <motion.p
        custom={2}
        initial="hidden"
        animate="show"
        variants={rise}
        className="text-center text-xs text-ink-mute"
      >
        2–20 players · one screen each · about 10 minutes
      </motion.p>
    </main>
  );
}
