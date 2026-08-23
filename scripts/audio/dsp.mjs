/**
 * Dependency-free synthesis primitives for scripts/audio/generate.mjs.
 *
 * Everything is deterministic: the noise source is a seeded PRNG, so
 * regenerating produces byte-identical WAVs and a clean diff.
 */
import { writeFileSync } from 'node:fs';

export const SR = 22050;
const TAU = Math.PI * 2;

export const clamp01 = n => Math.min(1, Math.max(0, n));

let rngState = 0x9e3779b9;
export function seed(n) {
  rngState = n >>> 0;
}
/** mulberry32, mapped to -1..1. */
function rand() {
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
}

export function buffer(seconds) {
  return new Float32Array(Math.max(1, Math.round(seconds * SR)));
}

/** Linear attack, exponential decay to sustain, linear release. Times in seconds. */
export function envelope(i, n, { a = 0.005, d = 0.08, s = 0, r = 0.06 } = {}) {
  const t = i / SR;
  const dur = n / SR;
  const releaseAt = Math.max(0, dur - r);
  let v;
  if (a > 0 && t < a) v = t / a;
  else if (t < a + d) v = s + (1 - s) * Math.exp((-3 * (t - a)) / Math.max(1e-6, d));
  else v = s;
  if (r > 0 && t > releaseAt) v *= Math.max(0, 1 - (t - releaseAt) / r);
  return v;
}

const WAVE = {
  sine: p => Math.sin(TAU * p),
  square: p => (p % 1 < 0.5 ? 1 : -1),
  saw: p => 2 * (p % 1) - 1,
  tri: p => 4 * Math.abs((p % 1) - 0.5) - 1,
};

/** Add a pitched tone. `bend` is the end/start frequency ratio (1 = steady). */
export function tone(out, { freq, start = 0, dur, gain = 0.4, wave = 'sine', bend = 1, env = {} }) {
  const n = Math.round(dur * SR);
  const i0 = Math.round(start * SR);
  const shape = WAVE[wave];
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const k = i0 + i;
    if (k >= out.length) break;
    phase += (freq * Math.pow(bend, i / n)) / SR;
    out[k] += shape(phase) * envelope(i, n, env) * gain;
  }
}

/** Add one-pole-lowpassed noise. */
export function noise(out, { start = 0, dur, gain = 0.3, cutoff = 4000, env = {} }) {
  const n = Math.round(dur * SR);
  const i0 = Math.round(start * SR);
  const alpha = Math.min(1, (TAU * cutoff) / SR);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const k = i0 + i;
    if (k >= out.length) break;
    lp += alpha * (rand() - lp);
    out[k] += lp * envelope(i, n, env) * gain;
  }
}

/** Cheap feedback-delay tail, in place. */
export function reverb(buf, { timeS = 0.09, mix = 0.3, feedback = 0.45 } = {}) {
  const d = Math.round(timeS * SR);
  for (let i = d; i < buf.length; i++) buf[i] += buf[i - d] * feedback * mix;
}

export function normalize(buf, peak = 0.89) {
  let max = 0;
  for (const v of buf) max = Math.max(max, Math.abs(v));
  if (max === 0) return buf;
  const g = peak / max;
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
  return buf;
}

/**
 * Render a seamless loop: draw into a buffer longer than the loop, then fold
 * the overhang back onto the head so reverb tails and long releases wrap
 * instead of clicking at the loop point.
 */
export function renderLoop(loopSeconds, tailSeconds, draw) {
  const loopN = Math.round(loopSeconds * SR);
  const buf = new Float32Array(loopN + Math.round(tailSeconds * SR));
  draw(buf);
  const out = buf.slice(0, loopN);
  for (let i = loopN; i < buf.length; i++) out[i - loopN] += buf[i];
  return out;
}

export function writeWav(path, buf) {
  const n = buf.length;
  const bytes = Buffer.alloc(44 + n * 2);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + n * 2, 4);
  bytes.write('WAVE', 8);
  bytes.write('fmt ', 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(SR, 24);
  bytes.writeUInt32LE(SR * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, buf[i]));
    bytes.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  writeFileSync(path, bytes);
}
