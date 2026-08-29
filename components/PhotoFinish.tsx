'use client';
import { motion } from 'motion/react';
import Panel from '@/components/ui/Panel';
import { avatarEmoji } from '@/lib/avatars';
import { tallyValue, tieGroups, type TieGroup } from '@/lib/ceremony/photoFinish';
import { useCeremony } from '@/lib/ceremony/useCeremony';
import { DURATION, EASE } from '@/lib/presentation/tokens';
import { useGameStore } from '@/lib/store';

const PLACE_NAMES = ['1st', '2nd', '3rd'];

function placeName(place: number): string {
  return PLACE_NAMES[place - 1] ?? `${place}th`;
}

/**
 * The photo finish (PRD §5.4.1) — the prelude that holds the podium back while
 * a tied place resolves on speed points.
 *
 * DOM, never canvas (cross-cutting constraint 2): the podium behind it is
 * Pixi's, and this sits over it as a fixed overlay in the same idiom as
 * components/PauseCard.tsx. That is also what makes it work unchanged inside
 * `[data-surface="stage"]`, where every size here resolves through a theme
 * variable that scope overrides (ADR-0035) — one component, two scales, no
 * variant prop.
 *
 * It reads the store itself rather than taking standings as a prop, so both
 * surfaces mount it identically and neither can pass a different field.
 *
 * The `instant` prop is the one-shot mount-time settle CURRENT.md's replay rule
 * demands. This component DOES mount conditionally (on `photo.open`), so
 * `AnimatePresence initial={false}` in the parent is the primary guard; but a
 * reload landing INSIDE the prelude mounts it fresh with the beat already part
 * way through, and `AnimatePresence` cannot tell that from a genuine entrance.
 * `instant` is derived once, from the same `ends_at` the runtime uses, and
 * suppresses the entrance in exactly that case — the same shape as
 * `ResultsView`'s `settled` (ADR-0030).
 */
export default function PhotoFinish({ instant }: { instant: boolean }) {
  const standings = useGameStore(s => s.standings);
  const room = useGameStore(s => s.room);
  const photo = useCeremony(s => s.steps.photo);
  const sd = room?.sudden_death ?? null;
  const groups = tieGroups({
    standings,
    suddenDeathContenders: sd?.contenders ?? null,
    suddenDeathResolved: !!sd?.winner_id,
  });

  if (groups.length === 0) return null;

  return (
    <motion.div
      data-testid="photo-finish"
      data-resolved={photo.resolved ? 'true' : 'false'}
      initial={instant ? false : { opacity: 0, scale: 0.96 }}
      animate={{
        opacity: 1,
        scale: 1,
        transition: { duration: DURATION.settle / 1000, ease: EASE.settle },
      }}
      exit={{ opacity: 0, transition: { duration: DURATION.beat / 1000 } }}
      className="pointer-events-none fixed inset-0 z-20 grid place-items-center p-6"
    >
      <Panel className="w-full max-w-lg px-8 py-7">
        {/*
          One live region for the whole card, polite: the resolution is news,
          but it must never interrupt a screen reader mid-sentence.
        */}
        <div role="status" aria-live="polite">
          <p className="text-center font-display text-[0.6875rem] font-semibold uppercase tracking-[0.28em] text-neon-magenta">
            Photo finish
          </p>
          <p className="mt-2 text-center text-sm text-ink-dim">
            {photo.resolved
              ? 'Speed points separate them.'
              : 'Too close to call on correct answers.'}
          </p>

          <div className="mt-6 space-y-5">
            {groups.map(group => (
              <Group key={group.place} group={group} tally={photo.tally} resolved={photo.resolved} />
            ))}
          </div>
        </div>
      </Panel>
    </motion.div>
  );
}

/**
 * One tied place.
 *
 * The tally is a NUMBER counting up, not a bar filling: the number is the
 * thing being compared, and a bar would ask the room to eyeball a length when
 * the exact figure is what decides it. `tabular-nums` keeps the digits from
 * jittering as they climb.
 */
function Group({
  group, tally, resolved,
}: {
  group: TieGroup;
  tally: number;
  resolved: boolean;
}) {
  return (
    <section data-testid="photo-finish-group" data-place={group.place}>
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-ink-mute">
        {placeName(group.place)} place · {group.players.length} tied on {group.players[0].correct} correct
      </h3>

      <ul className="mt-2 space-y-1.5">
        {group.players.map((p, index) => {
          // The winner of the group is its first member: standings arrived
          // ordered by the Fairness Law and this component never re-sorts.
          const won = resolved && index === 0;
          return (
            <li
              key={p.player_id}
              data-testid="photo-finish-racer"
              data-won={won ? 'true' : 'false'}
              className={
                'flex items-center gap-3 rounded-control px-3 py-2 ' +
                'ease-settle duration-(--dur-settle) transition-colors ' +
                (won ? 'bg-neon-magenta/12 ring-1 ring-neon-magenta/50' : 'bg-abyss/50')
              }
            >
              <span
                aria-hidden="true"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-base"
                style={{
                  backgroundColor: `${p.color}33`,
                  boxShadow: `inset 0 0 0 2px ${p.color}`,
                }}
              >
                {avatarEmoji(p.avatar)}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold text-ink">{p.nickname}</span>
              <span
                data-testid="photo-finish-points"
                className="font-display font-black tabular-nums text-ink"
              >
                {tallyValue(p.speed_points, tally)}
              </span>
              <span className="w-24 shrink-0 text-right text-[11px] uppercase tracking-widest text-ink-mute">
                {/* Stated in words, never by the ring alone: colour is not the
                    only channel this result is carried on. */}
                {won ? 'Takes it' : resolved ? '' : ''}
                <span className="sr-only">speed points</span>
              </span>
            </li>
          );
        })}
      </ul>

      {!resolved && (
        <p className="mt-2 text-xs text-ink-dim">
          Dead level — they share {placeName(group.place)} place.
        </p>
      )}
    </section>
  );
}
