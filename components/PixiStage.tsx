'use client';
import { useEffect, useRef } from 'react';
import { useSettings } from '@/lib/useSettings';
import { CANVAS } from '@/lib/presentation/tokens';

/**
 * Canvas lifecycle only — P0 mounts an empty scene.
 *
 * Sits behind the HTML game UI with pointer-events disabled: Pixi owns the
 * world, HTML owns everything readable and interactive (PRD §9 rendering
 * separation), so accessibility never depends on the canvas.
 */
export default function PixiStage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const hydrated = useSettings(s => s.hydrated);
  const profile = useSettings(s => s.profile);

  // Re-inits when the profile changes: `antialias` is a construction-time flag,
  // and P0's scene is empty, so a rebuild is the cheapest honest way to apply it.
  useEffect(() => {
    const host = hostRef.current;
    if (!hydrated || !host) return;

    let cancelled = false;
    let app: import('pixi.js').Application | null = null;

    const destroy = (instance: import('pixi.js').Application) => {
      instance.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
    };

    // Dynamic import keeps Pixi out of the server bundle and off every other route.
    void (async () => {
      try {
        const { Application } = await import('pixi.js');
        const instance = new Application();
        await instance.init({
          resizeTo: host,
          background: CANVAS.background,
          antialias: profile === 'high',
          resolution: Math.min(globalThis.devicePixelRatio || 1, CANVAS.maxResolution),
          autoDensity: true,
          preference: 'webgl',
        });

        // React Strict Mode double-mounts in dev: if the effect was cleaned up
        // while init was in flight, throw the instance away immediately.
        if (cancelled) {
          destroy(instance);
          return;
        }

        app = instance;
        host.appendChild(instance.canvas);
      } catch (error) {
        // A device with no usable WebGL context still gets the full HTML game.
        console.error('[PixiStage] failed to initialise the renderer', error);
      }
    })();

    return () => {
      cancelled = true;
      if (app) {
        destroy(app);
        app = null;
      }
    };
  }, [hydrated, profile]);

  return (
    <div
      ref={hostRef}
      data-testid="pixi-stage"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
    />
  );
}
