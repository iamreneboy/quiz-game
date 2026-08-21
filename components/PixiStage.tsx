'use client';
import { useEffect, useRef } from 'react';
import { useGameStore } from '@/lib/store';
import { useSettings } from '@/lib/useSettings';
import { loadSession } from '@/lib/session';
import { CANVAS } from '@/lib/presentation/tokens';
import { NIGHT_RACE } from '@/lib/world/content/nightRace';

/** Phases where the question fills most of the screen: the world shrinks to a strip (spec §7). */
const STRIP_PHASES = new Set(['read', 'answer', 'reveal']);

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
  const phase = useGameStore(s => s.room?.phase ?? 'lobby');
  const band = STRIP_PHASES.has(phase) ? 'strip' : 'full';

  useEffect(() => {
    const host = hostRef.current;
    if (!hydrated || !host) return;

    let cancelled = false;
    let app: import('pixi.js').Application | null = null;
    let scene: import('@/lib/world/render/WorldScene').WorldScene | null = null;
    let runtime: { destroy(): void } | null = null;
    let resizeObserver: ResizeObserver | null = null;

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

        const observer = new ResizeObserver(() => instance.resize());
        observer.observe(host);
        resizeObserver = observer;

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
      resizeObserver?.disconnect();
      resizeObserver = null;
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
      data-band={band}
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-0 transition-[height] duration-(--dur-settle) ease-settle ${
        band === 'strip' ? 'h-[28vh] portrait:h-[28vh] landscape:h-screen' : 'h-screen'
      }`}
    />
  );
}
