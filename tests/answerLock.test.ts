import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  answerLockKey,
  clearAnswerLock,
  loadAnswerLock,
  saveAnswerLock,
} from '@/lib/staging/answerLock';

/** Minimal in-memory Storage, installed on globalThis.window for the test. */
function installStorage(impl?: Partial<Storage>) {
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, v),
    ...impl,
  };
  vi.stubGlobal('window', { sessionStorage: storage });
  return storage;
}

beforeEach(() => { installStorage(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('answerLockKey', () => {
  it('is scoped to the room and the round, and case-insensitive on the code', () => {
    expect(answerLockKey('abcde', 3)).toBe(answerLockKey('ABCDE', 3));
    expect(answerLockKey('ABCDE', 3)).not.toBe(answerLockKey('ABCDE', 4));
  });
});

describe('save / load', () => {
  it('round-trips a choice', () => {
    saveAnswerLock('ABCDE', 3, 2);
    expect(loadAnswerLock('ABCDE', 3)).toBe(2);
  });

  it('round-trips choice 0 rather than losing it to a falsy check', () => {
    saveAnswerLock('ABCDE', 1, 0);
    expect(loadAnswerLock('ABCDE', 1)).toBe(0);
  });

  it('does not leak a lock into the next round', () => {
    saveAnswerLock('ABCDE', 3, 2);
    expect(loadAnswerLock('ABCDE', 4)).toBeNull();
  });

  it('returns null when nothing was stored', () => {
    expect(loadAnswerLock('ABCDE', 1)).toBeNull();
  });

  it('rejects stored junk rather than trusting it', () => {
    window.sessionStorage.setItem(answerLockKey('ABCDE', 1), 'banana');
    expect(loadAnswerLock('ABCDE', 1)).toBeNull();
    window.sessionStorage.setItem(answerLockKey('ABCDE', 2), '9');
    expect(loadAnswerLock('ABCDE', 2)).toBeNull();
    window.sessionStorage.setItem(answerLockKey('ABCDE', 3), '-1');
    expect(loadAnswerLock('ABCDE', 3)).toBeNull();
  });

  it('refuses to store an out-of-range choice', () => {
    saveAnswerLock('ABCDE', 1, 7);
    expect(loadAnswerLock('ABCDE', 1)).toBeNull();
  });
});

describe('clearAnswerLock', () => {
  it('removes the round it is given', () => {
    saveAnswerLock('ABCDE', 3, 2);
    clearAnswerLock('ABCDE', 3);
    expect(loadAnswerLock('ABCDE', 3)).toBeNull();
  });
});

describe('hostile storage', () => {
  it('never throws when storage is unavailable', () => {
    installStorage({
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    });
    expect(() => saveAnswerLock('ABCDE', 1, 1)).not.toThrow();
    expect(() => clearAnswerLock('ABCDE', 1)).not.toThrow();
    expect(loadAnswerLock('ABCDE', 1)).toBeNull();
  });

  it('is inert during server rendering', () => {
    vi.unstubAllGlobals();
    expect(loadAnswerLock('ABCDE', 1)).toBeNull();
    expect(() => saveAnswerLock('ABCDE', 1, 1)).not.toThrow();
  });
});
