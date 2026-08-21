'use client';
import { useEffect, useRef } from 'react';
import { useSettings } from '@/lib/useSettings';
import { useGameStore } from '@/lib/store';
import { CANVAS } from '@/lib/presentation/tokens';
import { NIGHT_RACE } from '@/lib/world/content/nightRace';
import { markerAnchors, trackMetrics } from '@/lib/world/geometry';
import { clampCamera } from '@/lib/world/camera';
import { frameTarget } from '@/lib/world/framing';
import { gradeState, zoneWeights } from '@/lib/world/zones';

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

        const startedAt = performance.now();
        instance.ticker.add(() => {
          if (!scene) return;
          const { room, standings } = useGameStore.getState();
          const metrics = trackMetrics(room?.total_rounds ?? 12);
          const anchors = markerAnchors(standings ?? [], metrics);
          const viewport = { width: instance.screen.width, height: instance.screen.height };
          const camera = clampCamera(
            frameTarget(anchors.length > 0 ? 'pack' : 'establishing', {
              anchors, metrics, viewport, localPlayerId: null, emphasisIds: [],
            }),
            metrics,
          );
          const progress = room && room.total_rounds > 0 ? room.round / room.total_rounds : 0;
          scene.applyFrame({
            camera,
            viewport,
            metrics,
            zones: zoneWeights(camera.centerX, metrics),
            grade: gradeState(progress, 0),
            anchors,
            localPlayerId: null,
            elapsedMs: performance.now() - startedAt,
          });
        });
      } catch (error) {
        // A device with no usable WebGL context still gets the full HTML game.
        console.error('[PixiStage] failed to initialise the renderer', error);
      }
    })();

    return () => {
      cancelled = true;
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
