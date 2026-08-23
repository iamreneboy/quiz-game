import { describe, it, expect, vi } from 'vitest';
import { OwnedCache } from '@/lib/world/render/ownedCache';

/** Stand-ins for two Pixi Applications. Any two distinct objects will do. */
const appA = { name: 'a' };
const appB = { name: 'b' };

describe('OwnedCache', () => {
  it('creates a value once per owner and reuses it', () => {
    const cache = new OwnedCache<object, string>();
    const create = vi.fn(() => 'duck-texture');

    expect(cache.get(appA, 'duck', create)).toBe('duck-texture');
    expect(cache.get(appA, 'duck', create)).toBe('duck-texture');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does NOT share a value between owners', () => {
    const cache = new OwnedCache<object, string>();
    let n = 0;
    const create = () => `duck-${++n}`;

    // This is the whole point: the same key under a different owner must bake
    // again, because the value belongs to the renderer that produced it.
    expect(cache.get(appA, 'duck', create)).toBe('duck-1');
    expect(cache.get(appB, 'duck', create)).toBe('duck-2');
    expect(cache.get(appA, 'duck', create)).toBe('duck-1');
  });

  it('clears one owner without disposing another owner’s values', () => {
    const cache = new OwnedCache<object, string>();
    cache.get(appA, 'duck', () => 'a-duck');
    cache.get(appB, 'duck', () => 'b-duck');

    const dispose = vi.fn();
    cache.clear(appA, dispose);

    expect(dispose).toHaveBeenCalledExactlyOnceWith('a-duck');
    expect(cache.size(appA)).toBe(0);
    expect(cache.size(appB)).toBe(1);
  });

  it('re-creates after a clear rather than serving a disposed value', () => {
    const cache = new OwnedCache<object, string>();
    cache.get(appA, 'duck', () => 'first');
    cache.clear(appA, () => {});

    expect(cache.get(appA, 'duck', () => 'second')).toBe('second');
  });

  it('clearing an owner it has never seen is a no-op', () => {
    const cache = new OwnedCache<object, string>();
    const dispose = vi.fn();

    expect(() => cache.clear(appA, dispose)).not.toThrow();
    expect(dispose).not.toHaveBeenCalled();
  });

  it('reports size 0 for an unknown owner', () => {
    expect(new OwnedCache<object, string>().size(appA)).toBe(0);
  });
});
