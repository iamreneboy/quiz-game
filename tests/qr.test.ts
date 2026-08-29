import { describe, it, expect } from 'vitest';
import { QR_QUIET_MODULES, joinUrl, qrPath, qrViewBox } from '../lib/qr';
import type { QrMatrix } from '../lib/qr';

/** A stand-in for `qrcode`'s BitMatrix: `rows` is one string per row, '1' dark. */
function matrix(rows: string[]): QrMatrix {
  return {
    size: rows.length,
    get: (row, col) => (rows[row][col] === '1' ? 1 : 0),
  };
}

describe('qrPath', () => {
  it('emits one unit square per dark module, in row-major order', () => {
    expect(qrPath(matrix(['10', '01']))).toBe('M0 0h1v1h-1zM1 1h1v1h-1z');
  });

  it('emits nothing for an all-light matrix', () => {
    expect(qrPath(matrix(['00', '00']))).toBe('');
  });

  it('places a module at (col, row), not (row, col)', () => {
    // Dark at row 0, col 1 — the square must start at x=1, y=0.
    expect(qrPath(matrix(['01', '00']))).toBe('M1 0h1v1h-1z');
  });
});

describe('qrViewBox', () => {
  it('surrounds the symbol with the four-module quiet zone the spec requires', () => {
    expect(QR_QUIET_MODULES).toBe(4);
    expect(qrViewBox(21)).toBe('-4 -4 29 29');
  });
});

describe('joinUrl', () => {
  it('builds the room URL a player scans', () => {
    expect(joinUrl('https://example.com', 'ABCDE')).toBe('https://example.com/room/ABCDE');
  });

  it('upper-cases the code, because room codes are upper-case everywhere else', () => {
    expect(joinUrl('https://example.com', 'abcde')).toBe('https://example.com/room/ABCDE');
  });

  it('tolerates a trailing slash on the origin', () => {
    expect(joinUrl('https://example.com/', 'ABCDE')).toBe('https://example.com/room/ABCDE');
  });
});
