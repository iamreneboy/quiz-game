/**
 * The QR symbol, as geometry rather than as an image.
 *
 * `qrcode` can hand back a PNG data URL, but an <img> would cost a
 * `@next/next/no-img-element` warning (and `npm run lint` is held at zero
 * problems), blur when scaled, and carry a colour that no design token
 * controls. One SVG path costs none of that: it stays crisp at any size,
 * inherits `currentColor`, and takes a real accessible name.
 *
 * Everything here is pure. The library itself is imported only inside
 * components/host/JoinQr.tsx, dynamically.
 */

/** Structurally what `qrcode`'s `create(...).modules` is. */
export interface QrMatrix {
  size: number;
  get(row: number, col: number): number;
}

/** The quiet zone the QR spec requires around the symbol, in modules. */
export const QR_QUIET_MODULES = 4;

/** One SVG path `d` covering every dark module, one user unit per module. */
export function qrPath(m: QrMatrix): string {
  let d = '';
  for (let row = 0; row < m.size; row++) {
    for (let col = 0; col < m.size; col++) {
      if (m.get(row, col)) d += `M${col} ${row}h1v1h-1z`;
    }
  }
  return d;
}

/** The viewBox that puts the quiet zone around a symbol of `size` modules. */
export function qrViewBox(size: number): string {
  const span = size + QR_QUIET_MODULES * 2;
  return `${-QR_QUIET_MODULES} ${-QR_QUIET_MODULES} ${span} ${span}`;
}

/** The URL a player scans or types to reach this room (PRD §5.1 step 1). */
export function joinUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, '')}/room/${code.toUpperCase()}`;
}
