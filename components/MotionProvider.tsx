'use client';
import { useEffect } from 'react';
import { MotionConfig } from 'motion/react';
import { useSettings } from '@/lib/useSettings';

/**
 * The single hydration seam for presentation settings.
 *
 * Runs after mount (never during render) so the server-rendered HTML and the
 * first client render agree, then publishes the effective profile to CSS via
 * `data-profile` on <html> and to `motion` via MotionConfig.
 *
 * `reducedMotion="never"` in the high profile is deliberate: an explicit manual
 * override beats prefers-reduced-motion (spec §6), and by the time the profile
 * says "high", that precedence has already been applied.
 */
export default function MotionProvider({ children }: { children: React.ReactNode }) {
  const hydrate = useSettings(s => s.hydrate);
  const profile = useSettings(s => s.profile);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <MotionConfig reducedMotion={profile === 'reduced' ? 'always' : 'never'}>
      {children}
    </MotionConfig>
  );
}
