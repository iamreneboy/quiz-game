/**
 * The Howler wrapper (spec §7). Knows about sound ids, gains and beds —
 * nothing about cues, phases or players. Not unit-tested beyond the dead-mixer
 * fallback; every decision it makes lives in state.ts or design.ts.
 */
import { Howl, Howler } from 'howler';
import {
  BED_CROSSFADE_MS,
  BED_STEMS,
  DRIVE_STEM,
  DUCK_ATTACK_MS,
  DUCK_GAIN,
  DUCK_RELEASE_MS,
  ESCALATION_STEMS,
  UNLOCK_FADE_MS,
  URGENCY_STEM,
  type MusicBed,
} from './design';
import { SOUNDS, type SoundId } from './manifest';

export interface Mixer {
  readonly dead: boolean;
  unlock(): void;
  setBed(bed: MusicBed, escalated: boolean): void;
  setStemGain(stem: SoundId, gain: number, fadeMs?: number): void;
  play(id: SoundId): void;
  duck(ms: number): void;
  /** A duck with no known end — held until released. Independent of `duck(ms)`. */
  setSustainedDuck(on: boolean): void;
  setMuted(muted: boolean): void;
  destroy(): void;
}

/**
 * The fallback. Headless Chromium has no audio device, and the whole e2e
 * regression floor runs there — audio degrades to silence, never to a crash.
 */
const DEAD: Mixer = {
  dead: true,
  unlock() {}, setBed() {}, setStemGain() {}, play() {},
  duck() {}, setSustainedDuck() {}, setMuted() {}, destroy() {},
};

export function createMixer(): Mixer {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return DEAD;

  const howls = new Map<SoundId, Howl>();
  /** Per-stem target gain before the duck multiplier. */
  const targets = new Map<SoundId, number>();

  let unlocked = false;
  let bed: MusicBed | null = null;
  let escalated = false;
  // Two independent reasons to duck: a timed dip under a sting, and a
  // sustained hold while the room is paused. Either one is enough, and
  // releasing one must not lift the other.
  let timedDuck = false;
  let sustainedDuck = false;
  let duckTimer: ReturnType<typeof setTimeout> | null = null;
  const duckMultiplier = () => (timedDuck || sustainedDuck ? DUCK_GAIN : 1);
  const stopTimers = new Set<ReturnType<typeof setTimeout>>();

  const howlFor = (id: SoundId): Howl | null => {
    const existing = howls.get(id);
    if (existing) return existing;
    try {
      const entry = SOUNDS[id];
      const howl = new Howl({
        src: [...entry.src],
        loop: entry.loop,
        volume: entry.loop ? 0 : 1,
        preload: true,
        html5: false,
      });
      howls.set(id, howl);
      return howl;
    } catch {
      return null;
    }
  };

  const applyStem = (id: SoundId, fadeMs: number): void => {
    const howl = howlFor(id);
    if (!howl) return;
    const target = (targets.get(id) ?? 0) * duckMultiplier();
    if (!unlocked) {
      howl.volume(target);
      return;
    }
    if (!howl.playing()) {
      // Start mid-loop, not from bar one — you have joined a show already in
      // progress. Deterministic rather than random so reloads sound the same.
      const durationS = SOUNDS[id].durationMs / 1000;
      howl.volume(0);
      howl.play();
      if (durationS > 0) howl.seek((performance.now() / 1000) % durationS);
    }
    howl.fade(howl.volume() as number, target, Math.max(0, fadeMs));
  };

  const applyBedStems = (fadeMs: number): void => {
    if (!bed) return;
    for (const id of BED_STEMS[bed]) {
      const gated = ESCALATION_STEMS.includes(id) && !escalated;
      const driven = id === DRIVE_STEM || id === URGENCY_STEM;
      if (gated) targets.set(id, 0);
      else if (!driven) targets.set(id, 1);
      else if (!targets.has(id)) targets.set(id, 0);
      applyStem(id, fadeMs);
    }
  };

  return {
    dead: false,

    unlock() {
      if (unlocked) return;
      unlocked = true;
      try {
        Howler.ctx?.resume();
      } catch {
        // Already running, or the context is gone; the fades below still apply.
      }
      applyBedStems(UNLOCK_FADE_MS);
    },

    setBed(nextBed, nextEscalated) {
      if (bed === nextBed && escalated === nextEscalated) return;
      const previous = bed;
      bed = nextBed;
      escalated = nextEscalated;

      if (previous && previous !== nextBed) {
        const retiring = BED_STEMS[previous];
        for (const id of retiring) {
          targets.set(id, 0);
          applyStem(id, BED_CROSSFADE_MS);
        }
        const timer = setTimeout(() => {
          for (const id of retiring) howls.get(id)?.stop();
          stopTimers.delete(timer);
        }, BED_CROSSFADE_MS + 60);
        stopTimers.add(timer);
      }

      applyBedStems(BED_CROSSFADE_MS);
    },

    setStemGain(stem, gain, fadeMs = 0) {
      if (targets.get(stem) === gain) return;
      targets.set(stem, gain);
      applyStem(stem, fadeMs);
    },

    play(id) {
      if (!unlocked) return;
      howlFor(id)?.play();
    },

    duck(ms) {
      timedDuck = true;
      applyBedStems(DUCK_ATTACK_MS);
      if (duckTimer) clearTimeout(duckTimer);
      duckTimer = setTimeout(() => {
        timedDuck = false;
        applyBedStems(DUCK_RELEASE_MS);
        duckTimer = null;
      }, Math.max(0, ms));
    },

    setSustainedDuck(on) {
      if (sustainedDuck === on) return;
      sustainedDuck = on;
      applyBedStems(on ? DUCK_ATTACK_MS : DUCK_RELEASE_MS);
    },

    setMuted(muted) {
      try {
        Howler.mute(muted);
      } catch {
        // No context yet; the next setMuted after unlock carries the value.
      }
    },

    destroy() {
      if (duckTimer) clearTimeout(duckTimer);
      for (const timer of stopTimers) clearTimeout(timer);
      stopTimers.clear();
      for (const howl of howls.values()) howl.unload();
      howls.clear();
      targets.clear();
      try {
        Howler.mute(false);
      } catch {
        // Nothing to restore.
      }
    },
  };
}
