'use client';
import { useEffect, useRef } from 'react';
import { useSettings } from '@/lib/useSettings';
import { loadSession } from '@/lib/session';
import { CANVAS } from '@/lib/presentation/tokens';
import { NIGHT_RACE } from '@/lib/world/content/nightRace';

/**
 * Canvas lifecycle and layout. Pixi owns the world; HTML owns everything
 * readable and interactive (PRD §9), so accessibility never depends on canvas.
 *
 * P1 renders the world here with a camera framed from current standings.
 * Task 6 replaces the static framing below with the cue-driven runtime.
 */
export default function PixiStage({ code }: { code: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const hydrated = useSettings(s => s.hydrated);
  const profile = useSettings(s => s.profile);

  useEffect(() => {
    const host = hostRef.current;
    if (!hydrated || !host) return;

    let cancelled = false;
    let app: import('pixi.js').Application | null = null;
    let scene: import('@/lib/world/render/WorldScene').WorldScene | null = null;
    let runtime: { destroy(): void } | null = null;

    void (async () => {
      try {
        const { Application } = await import('pixi.js');
        const { WorldScene } = await import('@/lib/world/render/WorldScene');

        const instance = new Application();
        await instance.init({
          resizeTo: host,
          background: CANVAS.background,
          antialias: profile === 'high',
          resolution: Math.min(globalThis.devicePixelRatio || 1, CANVAS.maxResolution),
          autoDensity: true,
          preference: 'webgl',
        });

        if (cancelled) {
          instance.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
          return;
        }

        app = instance;
        scene = new WorldScene(instance, NIGHT_RACE, profile);
        host.appendChild(instance.canvas);

        const { createWorldRuntime } = await import('@/lib/world/runtime');
        runtime = createWorldRuntime({
          app: instance,
          scene,
          profile,
          localPlayerId: loadSession(code)?.playerId ?? null,
        });
      } catch (error) {
        // A device with no usable WebGL context still gets the full HTML game.
        console.error('[PixiStage] failed to initialise the renderer', error);
      }
    })();

    return () => {
      cancelled = true;
      runtime?.destroy();
      runtime = null;
      scene?.destroy();
      scene = null;
      if (app) {
        app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
        app = null;
      }
    };
  }, [hydrated, profile, code]);

  return (
    <div
      ref={hostRef}
      data-testid="pixi-stage"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
    />
  );
}
