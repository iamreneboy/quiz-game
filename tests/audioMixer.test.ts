import { describe, expect, it } from 'vitest';
import { createMixer } from '@/lib/audio/mixer';

describe('mixer without a browser audio device', () => {
  it('reports itself dead rather than throwing', () => {
    const mixer = createMixer();
    expect(mixer.dead).toBe(true);
  });

  it('makes every method a safe no-op', () => {
    const mixer = createMixer();
    expect(() => {
      mixer.unlock();
      mixer.setBed('round', true);
      mixer.setStemGain('round-drive', 0.5, 120);
      mixer.play('correct');
      mixer.duck(400);
      mixer.setMuted(true);
      mixer.destroy();
    }).not.toThrow();
  });
});
