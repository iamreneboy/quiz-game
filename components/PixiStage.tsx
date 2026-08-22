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
 * How long a MISSING session is trusted before storage is consulted again.
 *
 * Half a second is well under human reaction time between finishing a join and
 * looking for the YOU ring, and it turns a spectator's per-frame localStorage
 * read into two reads a second.
 */
const SESSION_RECHECK_MS = 500;

/**
 * Canvas lifecycle and layout. Pixi owns the world; HTML owns everything
 * readable and interactive (PRD §9), so accessibility never depends on canvas.
 *
 * The camera is driven by lib/world/runtime.ts's cue-driven runtime (see
 * createWorldRuntime below).
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

    // The session is written when the visitor joins, which can be AFTER this
    // effect has started resolving its dynamic imports. Resolve it lazily, so
    // the runtime picks the session up whenever it lands instead of depending
    // on which finished first (that race is what this indirection exists for).
    //
    // A found answer is cached forever — one closure read per frame. A MISS is
    // throttled, not cached: the runtime calls this every tick, and a visitor
    // watching without joining would otherwise pay a synchronous
    // localStorage.getItem plus a JSON.parse at 60 Hz for the whole session.
    // Throttling rather than caching the miss is what keeps the mid-session
    // joiner working: their next tick after SESSION_RECHECK_MS re-reads
    // storage, finds the session, and `Avatars.apply` re-marks the rig — so
    // the YOU ring appears within half a second of joining, with no reload.
    let localPlayerId: string | null = null;
    let nextSessionRead = 0;
    const readLocalPlayerId = () => {
      if (localPlayerId !== null) return localPlayerId;
      const now = performance.now();
      if (now < nextSessionRead) return null;
      nextSessionRead = now + SESSION_RECHECK_MS;
      localPlayerId = loadSession(code)?.playerId ?? null;
      return localPlayerId;
    };

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
        if (cancelled) return;
        runtime = createWorldRuntime({
          app: instance,
          scene,
          profile,
          localPlayerId: readLocalPlayerId,
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
