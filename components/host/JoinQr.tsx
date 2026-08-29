'use client';
import { useEffect, useState } from 'react';
import { qrPath, qrViewBox } from '@/lib/qr';

/**
 * PRD §5.1 step 1's QR, finally spending the `qrcode` dependency that has been
 * in package.json and unimported since M1 (M3 roadmap §2.7: "that is the one to
 * spend").
 *
 * Drawn as one SVG path rather than an <img> data URL — see lib/qr.ts for why.
 * `qrcode` is imported dynamically so its encoder never enters the first load
 * of a page most viewers (players, the stage TV) never see.
 *
 * The QR is never the only way in: the room code and the join link are always
 * on screen beside it, so a failed encode is a degraded room, not a broken one.
 */
export default function JoinQr({
  url, className = '',
}: { url: string | null; className?: string }) {
  const [symbol, setSymbol] = useState<{ d: string; viewBox: string; url: string } | null>(null);

  useEffect(() => {
    if (!url) return;
    let live = true;
    void (async () => {
      try {
        const { create } = await import('qrcode');
        const { modules } = create(url, { errorCorrectionLevel: 'M' });
        if (!live) return;
        setSymbol({ d: qrPath(modules), viewBox: qrViewBox(modules.size), url });
      } catch {
        // Nothing to recover: the code and the link are both on screen.
      }
    })();
    return () => { live = false; };
  }, [url]);

  return (
    <div className={`shrink-0 rounded-control bg-ink p-2 text-void ${className}`}>
      {symbol ? (
        <svg
          data-testid="join-qr"
          role="img"
          aria-label={`QR code to join at ${symbol.url}`}
          viewBox={symbol.viewBox}
          shapeRendering="crispEdges"
          className="h-full w-full"
        >
          <path d={symbol.d} fill="currentColor" />
        </svg>
      ) : (
        <div aria-hidden className="h-full w-full rounded-[0.5rem] bg-void/10" />
      )}
    </div>
  );
}
