'use client';
import { useEffect, useRef } from 'react';

/**
 * The lobby on a broadcast screen: how to get into this room.
 *
 * The QR is drawn onto a canvas through a ref rather than rendered from state,
 * which keeps the whole async import out of React's data flow — no setState
 * from an effect, nothing to tear (same idiom as components/PixiStage.tsx).
 * It is `aria-hidden` and the URL sits beside it as text, so a screen reader
 * gets the join address rather than an unlabelled image.
 *
 * `qrcode` is imported dynamically so it never lands in the player route's
 * bundle — a phone that has joined has no use for it.
 */
const QR_PIXELS = 320;

export default function StageJoinPanel({ code }: { code: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const joinUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/room/${code}`;

  useEffect(() => {
    if (!joinUrl) return;
    let cancelled = false;

    void (async () => {
      try {
        const { default: QRCode } = await import('qrcode');
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        await QRCode.toCanvas(canvas, joinUrl, {
          width: QR_PIXELS,
          margin: 1,
          color: { dark: '#eaeeff', light: '#0a0c1cff' },
        });
      } catch (error) {
        // A missing QR is a degraded lobby, not a broken one: the code and the
        // URL beside it are both still readable.
        console.error('[StageJoinPanel] failed to render the QR', error);
      }
    })();

    return () => { cancelled = true; };
  }, [joinUrl]);

  return (
    <section
      data-testid="stage-join"
      className="mx-auto flex items-center gap-12 rounded-panel border border-haze/50
        bg-abyss/70 px-12 py-10 backdrop-blur-md"
    >
      <div className="flex flex-col gap-3">
        <p className="font-display text-[0.6875rem] font-semibold uppercase tracking-[0.28em] text-neon-cyan">
          Join the race
        </p>
        <p className="font-display text-display font-black tracking-[0.2em] text-warning">{code}</p>
        <p className="text-lg text-ink-dim">{joinUrl}</p>
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="shrink-0 rounded-control"
        style={{ width: QR_PIXELS, height: QR_PIXELS }}
      />
    </section>
  );
}
