'use client';
import { AnimatePresence, motion } from 'motion/react';
import { avatarEmoji } from '@/lib/avatars';
import { REVEAL_AVATAR_STAGGER } from '@/lib/staging/beats';
import { EASE } from '@/lib/presentation/tokens';
import type { StackAvatar } from '@/lib/staging/distribution';

/**
 * The face pile under a distribution row (spec §5).
 *
 * Overlapping by design: six faces occupy ~80px, which is what lets one cap
 * serve every width. The local player's face carries a ring, the same "you are
 * here" language the track readout uses.
 *
 * Mounted from the top of REVEAL (as soon as `mode` becomes 'result'), well
 * before `show` itself turns true at the 300ms mark — so `AnimatePresence
 * initial={false}` only ever suppresses the entrance for a stack that was
 * ALREADY visible at this component's own first mount (a reload or late join
 * landing past 300ms elapsed). A normal live reveal still sees the stack
 * enter a persistent AnimatePresence when `show` flips true, so it animates
 * in as intended.
 */
export default function AvatarStack({
  avatars, overflow, show,
}: {
  avatars: StackAvatar[];
  overflow: number;
  /** False until the reveal's stack step has landed. */
  show: boolean;
}) {
  const visible = show && avatars.length > 0;

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.span
          key="stack"
          className="flex shrink-0 items-center pl-2"
          initial="hidden"
          animate="shown"
          exit="hidden"
          variants={{ shown: { transition: { staggerChildren: REVEAL_AVATAR_STAGGER / 1000 } } }}
        >
          {avatars.map(a => (
            <motion.span
              key={a.playerId}
              title={a.nickname}
              variants={{
                hidden: { opacity: 0, scale: 0.6 },
                shown: { opacity: 1, scale: 1, transition: { duration: 0.26, ease: EASE.settle } },
              }}
              className="-ml-2 grid h-6 w-6 place-items-center rounded-full text-[13px] first:ml-0"
              style={{
                backgroundColor: `${a.color}33`,
                boxShadow: a.isLocal
                  ? `inset 0 0 0 2px ${a.color}, 0 0 0 2px var(--color-ink)`
                  : `inset 0 0 0 2px ${a.color}`,
              }}
            >
              {avatarEmoji(a.avatar)}
            </motion.span>
          ))}
          {overflow > 0 && (
            <span className="ml-1 text-xs font-bold tabular-nums text-ink-mute">+{overflow}</span>
          )}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
