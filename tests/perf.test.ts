import { describe, it, expect } from 'vitest';
import { DROPPED_FRAME_MS, createFrameSampler } from '@/lib/world/perf';

describe('createFrameSampler', () => {
  it('reports nothing before any frames land', () => {
    expect(createFrameSampler().stats()).toEqual({ p50: 0, p95: 0, dropped: 0, samples: 0 });
  });

  it('reports the median of a steady 60fps stream', () => {
    const sampler = createFrameSampler();
    for (let i = 0; i < 120; i++) sampler.push(16.7);
    const stats = sampler.stats();
    expect(stats.p50).toBeCloseTo(16.7, 5);
    expect(stats.dropped).toBe(0);
    expect(stats.samples).toBe(120);
  });

  it('separates the tail from the median', () => {
    const sampler = createFrameSampler();
    for (let i = 0; i < 95; i++) sampler.push(16);
    for (let i = 0; i < 5; i++) sampler.push(90);
    const stats = sampler.stats();
    expect(stats.p50).toBe(16);
    expect(stats.p95).toBeGreaterThanOrEqual(16);
  });

  it('counts frames slower than the dropped threshold', () => {
    const sampler = createFrameSampler();
    sampler.push(DROPPED_FRAME_MS - 1);
    sampler.push(DROPPED_FRAME_MS);
    sampler.push(DROPPED_FRAME_MS + 40);
    expect(sampler.stats().dropped).toBe(2);
  });

  it('keeps only the most recent window', () => {
    const sampler = createFrameSampler(10);
    for (let i = 0; i < 10; i++) sampler.push(100);
    for (let i = 0; i < 10; i++) sampler.push(10);
    const stats = sampler.stats();
    expect(stats.samples).toBe(10);
    expect(stats.p50).toBe(10);
    expect(stats.dropped).toBe(0);
  });
});
