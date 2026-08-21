import { describe, it, expect } from 'vitest';
import { layersForProfile } from '@/lib/world/definition';
import { NIGHT_RACE } from '@/lib/world/content/nightRace';
import { ZONE_ORDER } from '@/lib/world/zones';

describe('the night-race world definition', () => {
  it('defines the three zones in track order', () => {
    expect(NIGHT_RACE.zones.map(z => z.id)).toEqual(ZONE_ORDER);
  });

  it('gives every zone five layers on the high profile', () => {
    for (const zone of NIGHT_RACE.zones) {
      expect(layersForProfile(zone, 'high')).toHaveLength(5);
    }
  });

  it('gives every zone exactly two layers on the reduced profile', () => {
    for (const zone of NIGHT_RACE.zones) {
      expect(layersForProfile(zone, 'reduced')).toHaveLength(2);
    }
  });

  it('keeps the reduced set as a subset of the high set', () => {
    for (const zone of NIGHT_RACE.zones) {
      const rich = layersForProfile(zone, 'high').map(l => l.id);
      for (const layer of layersForProfile(zone, 'reduced')) {
        expect(rich).toContain(layer.id);
      }
    }
  });

  it('orders layers back-to-front by parallax factor', () => {
    for (const zone of NIGHT_RACE.zones) {
      const factors = zone.layers.map(l => l.parallax);
      expect([...factors].sort((a, b) => a - b)).toEqual(factors);
    }
  });

  it('keeps parallax factors between the far sky and the ground', () => {
    for (const zone of NIGHT_RACE.zones) {
      for (const layer of zone.layers) {
        expect(layer.parallax).toBeGreaterThan(0);
        expect(layer.parallax).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives every layer a positive tile size and a draw function', () => {
    for (const zone of NIGHT_RACE.zones) {
      for (const layer of zone.layers) {
        expect(layer.repeatWidth).toBeGreaterThan(0);
        expect(layer.height).toBeGreaterThan(0);
        expect(typeof layer.draw).toBe('function');
      }
    }
  });

  it('uses unique layer ids within a zone', () => {
    for (const zone of NIGHT_RACE.zones) {
      expect(new Set(zone.layers.map(l => l.id)).size).toBe(zone.layers.length);
    }
  });

  it('only animates rich layers, so the reduced profile is static', () => {
    for (const zone of NIGHT_RACE.zones) {
      for (const layer of layersForProfile(zone, 'reduced')) {
        expect(layer.ambient).toBeUndefined();
      }
    }
  });

  it('gives every zone at least one ambient animator on the high profile', () => {
    for (const zone of NIGHT_RACE.zones) {
      expect(layersForProfile(zone, 'high').some(l => l.ambient)).toBe(true);
    }
  });
});
