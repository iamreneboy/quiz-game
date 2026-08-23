/**
 * The night-race sound identity, as code. This file IS the sound design —
 * edit it, rerun scripts/audio/generate.mjs, listen, commit.
 *
 * Palette: A minor pentatonic, synth, dark. 120 BPM; every loop length is a
 * whole number of bars so stems can be started together and stay aligned.
 */
import { buffer, noise, normalize, renderLoop, reverb, seed, tone } from './dsp.mjs';

const A2 = 110, C3 = 130.81, D3 = 146.83, E3 = 164.81, G3 = 196;
const A3 = 220, C4 = 261.63, D4 = 293.66, E4 = 329.63, G4 = 392;
const A4 = 440, C5 = 523.25, E5 = 659.25, A5 = 880;
const BEAT = 0.5;

/* ── Stings ──────────────────────────────────────────────────────────────── */

export const STINGS = {
  'join-blip': () => {
    const b = buffer(0.22);
    tone(b, { freq: E4, dur: 0.10, gain: 0.35, wave: 'tri', env: { a: 0.002, d: 0.08, r: 0.04 } });
    tone(b, { freq: A4, start: 0.07, dur: 0.14, gain: 0.3, wave: 'sine', env: { a: 0.002, d: 0.1, r: 0.05 } });
    return normalize(b, 0.55);
  },

  'countdown-riser': () => {
    const b = buffer(0.6);
    tone(b, { freq: A3, dur: 0.6, gain: 0.35, wave: 'saw', bend: 2, env: { a: 0.05, d: 0.5, s: 0.6, r: 0.08 } });
    noise(b, { dur: 0.6, gain: 0.18, cutoff: 2600, env: { a: 0.4, d: 0.2, s: 0.7, r: 0.1 } });
    reverb(b, { timeS: 0.08, mix: 0.25 });
    return normalize(b, 0.82);
  },

  'category-slam': () => {
    const b = buffer(0.45);
    tone(b, { freq: A2, dur: 0.3, gain: 0.6, wave: 'square', bend: 0.5, env: { a: 0.001, d: 0.16, r: 0.1 } });
    noise(b, { dur: 0.18, gain: 0.4, cutoff: 6000, env: { a: 0.001, d: 0.08, r: 0.06 } });
    tone(b, { freq: E4, start: 0.02, dur: 0.25, gain: 0.22, wave: 'tri', env: { a: 0.002, d: 0.14, r: 0.08 } });
    reverb(b, { timeS: 0.07, mix: 0.3 });
    return normalize(b, 0.86);
  },

  'answer-open': () => {
    const b = buffer(0.35);
    noise(b, { dur: 0.35, gain: 0.4, cutoff: 5200, env: { a: 0.02, d: 0.28, r: 0.08 } });
    tone(b, { freq: A3, dur: 0.25, gain: 0.2, wave: 'sine', bend: 1.5, env: { a: 0.01, d: 0.2, r: 0.06 } });
    return normalize(b, 0.6);
  },

  lock: () => {
    const b = buffer(0.14);
    tone(b, { freq: G4, dur: 0.05, gain: 0.45, wave: 'square', env: { a: 0.001, d: 0.03, r: 0.02 } });
    noise(b, { dur: 0.06, gain: 0.25, cutoff: 7000, env: { a: 0.001, d: 0.03, r: 0.02 } });
    return normalize(b, 0.62);
  },

  'reveal-hit': () => {
    const b = buffer(0.5);
    tone(b, { freq: A2, dur: 0.35, gain: 0.5, wave: 'sine', env: { a: 0.001, d: 0.2, r: 0.12 } });
    noise(b, { dur: 0.3, gain: 0.3, cutoff: 3400, env: { a: 0.002, d: 0.14, r: 0.1 } });
    reverb(b, { timeS: 0.1, mix: 0.35 });
    return normalize(b, 0.84);
  },

  correct: () => {
    const b = buffer(0.5);
    tone(b, { freq: A4, dur: 0.16, gain: 0.4, wave: 'tri', env: { a: 0.002, d: 0.12, r: 0.05 } });
    tone(b, { freq: C5, start: 0.09, dur: 0.18, gain: 0.4, wave: 'tri', env: { a: 0.002, d: 0.14, r: 0.06 } });
    tone(b, { freq: E5, start: 0.18, dur: 0.3, gain: 0.42, wave: 'sine', env: { a: 0.002, d: 0.22, r: 0.09 } });
    reverb(b, { timeS: 0.11, mix: 0.28 });
    return normalize(b, 0.8);
  },

  // Neutral, low, over quickly. Never comic (PRD §8: no mockery).
  'wrong-soft': () => {
    const b = buffer(0.34);
    tone(b, { freq: D4, dur: 0.13, gain: 0.3, wave: 'sine', env: { a: 0.004, d: 0.1, r: 0.05 } });
    tone(b, { freq: A3, start: 0.1, dur: 0.22, gain: 0.28, wave: 'sine', env: { a: 0.004, d: 0.16, r: 0.07 } });
    return normalize(b, 0.5);
  },

  'track-whoosh': () => {
    const b = buffer(0.55);
    noise(b, { dur: 0.55, gain: 0.45, cutoff: 3000, env: { a: 0.12, d: 0.3, s: 0.35, r: 0.14 } });
    tone(b, { freq: A2, dur: 0.4, gain: 0.22, wave: 'saw', bend: 1.8, env: { a: 0.08, d: 0.25, r: 0.1 } });
    return normalize(b, 0.72);
  },

  'overtake-whoosh': () => {
    const b = buffer(0.6);
    noise(b, { dur: 0.6, gain: 0.5, cutoff: 5400, env: { a: 0.06, d: 0.34, s: 0.3, r: 0.16 } });
    tone(b, { freq: A3, dur: 0.5, gain: 0.32, wave: 'saw', bend: 2.4, env: { a: 0.02, d: 0.3, r: 0.14 } });
    tone(b, { freq: E5, start: 0.24, dur: 0.2, gain: 0.24, wave: 'square', env: { a: 0.001, d: 0.12, r: 0.06 } });
    reverb(b, { timeS: 0.09, mix: 0.3 });
    return normalize(b, 0.88);
  },

  'lead-flourish': () => {
    const b = buffer(0.6);
    tone(b, { freq: A3, dur: 0.12, gain: 0.34, wave: 'square', env: { a: 0.002, d: 0.09, r: 0.04 } });
    tone(b, { freq: E4, start: 0.09, dur: 0.12, gain: 0.34, wave: 'square', env: { a: 0.002, d: 0.09, r: 0.04 } });
    tone(b, { freq: A4, start: 0.18, dur: 0.34, gain: 0.4, wave: 'tri', env: { a: 0.002, d: 0.24, r: 0.1 } });
    reverb(b, { timeS: 0.12, mix: 0.34 });
    return normalize(b, 0.88);
  },

  'streak-3': () => {
    const b = buffer(0.42);
    tone(b, { freq: E4, dur: 0.1, gain: 0.34, wave: 'tri', env: { a: 0.002, d: 0.07, r: 0.04 } });
    tone(b, { freq: A4, start: 0.08, dur: 0.26, gain: 0.36, wave: 'tri', env: { a: 0.002, d: 0.18, r: 0.08 } });
    return normalize(b, 0.72);
  },

  'streak-5': () => {
    const b = buffer(0.55);
    tone(b, { freq: A4, dur: 0.1, gain: 0.34, wave: 'square', env: { a: 0.002, d: 0.07, r: 0.04 } });
    tone(b, { freq: C5, start: 0.08, dur: 0.1, gain: 0.34, wave: 'square', env: { a: 0.002, d: 0.07, r: 0.04 } });
    tone(b, { freq: E5, start: 0.16, dur: 0.34, gain: 0.4, wave: 'tri', env: { a: 0.002, d: 0.24, r: 0.1 } });
    noise(b, { start: 0.16, dur: 0.3, gain: 0.16, cutoff: 6200, env: { a: 0.01, d: 0.2, r: 0.08 } });
    reverb(b, { timeS: 0.1, mix: 0.3 });
    return normalize(b, 0.85);
  },

  'streak-8': () => {
    const b = buffer(0.6);
    tone(b, { freq: A2, dur: 0.45, gain: 0.45, wave: 'saw', bend: 1.6, env: { a: 0.004, d: 0.3, r: 0.12 } });
    tone(b, { freq: A4, start: 0.05, dur: 0.12, gain: 0.32, wave: 'square', env: { a: 0.002, d: 0.08, r: 0.04 } });
    tone(b, { freq: E5, start: 0.14, dur: 0.12, gain: 0.32, wave: 'square', env: { a: 0.002, d: 0.08, r: 0.04 } });
    tone(b, { freq: A5, start: 0.23, dur: 0.36, gain: 0.42, wave: 'tri', env: { a: 0.002, d: 0.26, r: 0.1 } });
    noise(b, { dur: 0.6, gain: 0.22, cutoff: 7200, env: { a: 0.2, d: 0.24, s: 0.3, r: 0.14 } });
    reverb(b, { timeS: 0.11, mix: 0.36 });
    return normalize(b, 0.92);
  },

  'final-sting': () => {
    const b = buffer(0.6);
    tone(b, { freq: A2, dur: 0.6, gain: 0.55, wave: 'saw', bend: 0.75, env: { a: 0.004, d: 0.4, s: 0.4, r: 0.16 } });
    tone(b, { freq: D3, start: 0.02, dur: 0.55, gain: 0.3, wave: 'square', env: { a: 0.01, d: 0.38, s: 0.3, r: 0.14 } });
    noise(b, { dur: 0.6, gain: 0.3, cutoff: 1800, env: { a: 0.3, d: 0.2, s: 0.5, r: 0.14 } });
    reverb(b, { timeS: 0.13, mix: 0.4 });
    return normalize(b, 0.94);
  },

  fanfare: () => {
    const b = buffer(0.6);
    tone(b, { freq: A3, dur: 0.14, gain: 0.4, wave: 'square', env: { a: 0.003, d: 0.1, r: 0.05 } });
    tone(b, { freq: C4, start: 0.11, dur: 0.14, gain: 0.4, wave: 'square', env: { a: 0.003, d: 0.1, r: 0.05 } });
    tone(b, { freq: E4, start: 0.22, dur: 0.14, gain: 0.42, wave: 'square', env: { a: 0.003, d: 0.1, r: 0.05 } });
    tone(b, { freq: A4, start: 0.32, dur: 0.28, gain: 0.5, wave: 'tri', env: { a: 0.003, d: 0.2, r: 0.1 } });
    tone(b, { freq: E5, start: 0.32, dur: 0.28, gain: 0.28, wave: 'tri', env: { a: 0.003, d: 0.2, r: 0.1 } });
    reverb(b, { timeS: 0.12, mix: 0.4 });
    return normalize(b, 0.95);
  },
};

/* ── Beds (loops) ────────────────────────────────────────────────────────── */

const kick = (b, at, gain = 0.5) =>
  tone(b, { freq: 90, start: at, dur: 0.22, gain, wave: 'sine', bend: 0.45, env: { a: 0.001, d: 0.14, r: 0.06 } });

const hat = (b, at, gain = 0.16) =>
  noise(b, { start: at, dur: 0.07, gain, cutoff: 8000, env: { a: 0.001, d: 0.04, r: 0.02 } });

export const BEDS = {
  // 4 bars, laid back — plays under the join gate and the lobby.
  'lobby-groove': () =>
    normalize(
      renderLoop(8, 1, b => {
        for (let beat = 0; beat < 16; beat++) {
          const t = beat * BEAT;
          if (beat % 4 === 0) kick(b, t, 0.4);
          if (beat % 2 === 1) hat(b, t, 0.1);
          tone(b, { freq: A2, start: t, dur: BEAT * 0.9, gain: 0.16, wave: 'tri', env: { a: 0.02, d: 0.3, s: 0.4, r: 0.12 } });
        }
        const arp = [A3, C4, E4, G4, E4, C4];
        for (let i = 0; i < 16; i++) {
          tone(b, { freq: arp[i % arp.length], start: i * BEAT + BEAT / 2, dur: 0.3, gain: 0.12, wave: 'sine', env: { a: 0.01, d: 0.2, r: 0.08 } });
        }
        reverb(b, { timeS: 0.24, mix: 0.3 });
      }),
      0.55,
    ),

  // 2 bars. Always audible during a round.
  'round-base': () =>
    normalize(
      renderLoop(4, 0.6, b => {
        for (let beat = 0; beat < 8; beat++) {
          const t = beat * BEAT;
          kick(b, t, beat % 2 === 0 ? 0.55 : 0.3);
          tone(b, { freq: beat < 4 ? A2 : G3 / 2, start: t, dur: BEAT * 0.85, gain: 0.2, wave: 'saw', env: { a: 0.01, d: 0.24, s: 0.35, r: 0.1 } });
        }
        reverb(b, { timeS: 0.18, mix: 0.22 });
      }),
      0.6,
    ),

  // 2 bars. Faded in by the ANSWER tension ramp.
  'round-drive': () =>
    normalize(
      renderLoop(4, 0.6, b => {
        for (let beat = 0; beat < 8; beat++) {
          hat(b, beat * BEAT + BEAT / 2, 0.2);
          tone(b, { freq: E3, start: beat * BEAT + BEAT / 2, dur: 0.22, gain: 0.24, wave: 'square', env: { a: 0.004, d: 0.14, r: 0.06 } });
        }
        reverb(b, { timeS: 0.15, mix: 0.24 });
      }),
      0.6,
    ),

  // 2 bars of 16ths. Arrives late in the ANSWER ramp.
  'round-urgency': () =>
    normalize(
      renderLoop(4, 0.6, b => {
        const arp = [A4, E4, C5, E4];
        for (let i = 0; i < 32; i++) {
          tone(b, { freq: arp[i % arp.length], start: i * (BEAT / 4), dur: 0.11, gain: 0.16, wave: 'saw', env: { a: 0.002, d: 0.07, r: 0.03 } });
        }
        noise(b, { start: 3, dur: 1, gain: 0.14, cutoff: 4000, env: { a: 0.8, d: 0.2, s: 0.6, r: 0.2 } });
        reverb(b, { timeS: 0.12, mix: 0.26 });
      }),
      0.65,
    ),

  // 2 bars. Silent unless the final-question escalation is active.
  'round-dread': () =>
    normalize(
      renderLoop(4, 0.8, b => {
        tone(b, { freq: A2 / 2, dur: 4, gain: 0.34, wave: 'saw', env: { a: 0.6, d: 1, s: 0.8, r: 0.8 } });
        tone(b, { freq: D3, start: 0, dur: 4, gain: 0.12, wave: 'sine', bend: 1.06, env: { a: 1.2, d: 1, s: 0.7, r: 1 } });
        noise(b, { dur: 4, gain: 0.1, cutoff: 900, env: { a: 1, d: 1, s: 0.7, r: 1 } });
        reverb(b, { timeS: 0.3, mix: 0.4 });
      }),
      0.62,
    ),

  // 4 bars, brighter — the ceremony.
  'ceremony-bed': () =>
    normalize(
      renderLoop(8, 1, b => {
        const chord = [[A3, C4, E4], [G3, C4, E4], [D4 / 2, D4, G4], [A3, C4, E4]];
        for (let bar = 0; bar < 4; bar++) {
          for (const f of chord[bar]) {
            tone(b, { freq: f, start: bar * 2, dur: 1.9, gain: 0.16, wave: 'tri', env: { a: 0.08, d: 0.7, s: 0.5, r: 0.3 } });
          }
          kick(b, bar * 2, 0.4);
          kick(b, bar * 2 + 1, 0.3);
          hat(b, bar * 2 + 0.5, 0.12);
          hat(b, bar * 2 + 1.5, 0.12);
        }
        reverb(b, { timeS: 0.26, mix: 0.35 });
      }),
      0.6,
    ),
};

export { seed };
