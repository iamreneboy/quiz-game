'use client';
import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/lib/useSettings';
import type { ProfileOverride } from '@/lib/presentation/profile';
import Panel from '@/components/ui/Panel';
import Select from '@/components/ui/Select';
import Checkbox from '@/components/ui/Checkbox';

const OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'high', label: 'Full motion' },
  { value: 'reduced', label: 'Reduced motion' },
] as const;

/**
 * Corner gear on the room view. Carries the motion profile and the audio
 * mute toggle. Rendered outside <main> so it never joins the game's
 * interactive controls.
 */
export default function SettingsControl() {
  const [open, setOpen] = useState(false);
  const override = useSettings(s => s.override);
  const profile = useSettings(s => s.profile);
  const setOverride = useSettings(s => s.setOverride);
  const muted = useSettings(s => s.muted);
  const setMuted = useSettings(s => s.setMuted);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="fixed right-4 top-4 z-50">
      <button
        type="button"
        aria-label="Display settings"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={
          'grid h-10 w-10 place-items-center rounded-full border border-haze/80 bg-night/70 ' +
          'text-ink-dim backdrop-blur-md ease-snap duration-[var(--dur-cut)] ' +
          'transition-[color,border-color] hover:border-neon-cyan hover:text-neon-cyan ' +
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-cyan'
        }
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.6]">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3L5.5 5.5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <Panel className="absolute right-0 mt-2 w-56 p-4">
          <Select
            label="Motion"
            value={override}
            onChange={event => setOverride(event.target.value as ProfileOverride)}
            options={OPTIONS}
          />
          <div className="mt-4 border-t border-haze/50 pt-4">
            <Checkbox
              label="Mute sound"
              checked={muted}
              onChange={event => setMuted(event.target.checked)}
            />
          </div>
          <p className="mt-3 text-xs text-ink-mute">
            Currently running the {profile === 'high' ? 'full' : 'reduced'} profile.
          </p>
        </Panel>
      )}
    </div>
  );
}
