import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { viewerPlayerId } from '@/lib/viewer';

/**
 * Minimal in-memory Storage installed as the bare `localStorage` global —
 * lib/session.ts calls `localStorage.getItem` directly, not `window.localStorage`.
 */
function installStorage(): Storage {
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, v),
  };
  vi.stubGlobal('localStorage', storage);
  return storage;
}

const SESSION = JSON.stringify({
  roomId: 'r1', playerId: 'p1', playerKey: 'k1', hostKey: 'h1',
});

let storage: Storage;
beforeEach(() => { storage = installStorage(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('viewerPlayerId', () => {
  it('gives a player their own id', () => {
    storage.setItem('cb:ABCDE', SESSION);
    expect(viewerPlayerId('player', 'ABCDE')).toBe('p1');
  });

  it('gives a player null when they have not joined', () => {
    expect(viewerPlayerId('player', 'ABCDE')).toBeNull();
  });

  it('gives the STAGE null even when a session for that exact room exists', () => {
    // The load-bearing case: the host opens the TV link on the laptop they
    // are playing on. A stage view must not become a player view.
    storage.setItem('cb:ABCDE', SESSION);
    expect(viewerPlayerId('stage', 'ABCDE')).toBeNull();
  });

  it('gives the stage null with no session at all', () => {
    expect(viewerPlayerId('stage', 'ABCDE')).toBeNull();
  });

  it('does not consult storage at all for the stage', () => {
    const getItem = vi.spyOn(storage, 'getItem');
    viewerPlayerId('stage', 'ABCDE');
    expect(getItem).not.toHaveBeenCalled();
  });

  it('is case-insensitive on the room code for a player', () => {
    storage.setItem('cb:ABCDE', SESSION);
    expect(viewerPlayerId('player', 'abcde')).toBe('p1');
  });
});
