import { describe, it, expect, vi } from 'vitest';
import { noteServerTime, serverNow, msUntil } from '@/lib/serverTime';

describe('serverTime', () => {
  it('tracks offset from noted server timestamps', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    noteServerTime('2026-01-01T00:00:02.000Z'); // server 2s ahead
    expect(serverNow()).toBe(new Date('2026-01-01T00:00:02.000Z').getTime());
    expect(msUntil('2026-01-01T00:00:05.000Z')).toBe(3000);
    expect(msUntil('2026-01-01T00:00:01.000Z')).toBe(0); // clamped
    expect(msUntil(null)).toBe(0);
    vi.useRealTimers();
  });
});
