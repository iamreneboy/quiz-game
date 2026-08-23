# ADR-0025: Sounds are generated source, not assets

- **Status:** Accepted
- **Date:** 2026-08-23
- **Phase:** P4 — Audio identity

## Context

The M2 roadmap forbids an external art-production pipeline for this phase and
names Howler.js as the audio stack. Howler plays files, so pure runtime
synthesis (e.g. generating tones directly in the browser via WebAudio) would
have made the named dependency dead weight, and would have made the sound
design unreviewable as a diff.

## Decision

`scripts/audio/` synthesises every sound with dependency-free DSP
(`dsp.mjs`: additive tones, filtered noise, a cheap feedback-delay reverb, a
seeded PRNG) and codes the entire sound design as data (`sounds.mjs`:
16 stings + 6 loop stems). `generate.mjs` renders each to a WAV, encodes it
to Opus/WebM and AAC/M4A via ffmpeg, and writes `lib/audio/manifest.ts`.
Outputs are committed; ffmpeg is required only to regenerate, never by
`npm run build`, `npm test`, `npm run dev` or CI.

## Consequences

The sound design is diffable source, byte-stable across regenerations (the
PRNG is seeded per sound id), and costs no npm dependency. Two encodings ship
because Opus loops gaplessly while AAC's encoder padding seams very slightly
— Howler picks per browser, and old Safari takes the seam.

**Budget deviation.** The spec's audio budget was "total committed audio
under 250 KB". At the generator's default bitrates (48k Opus / 64k AAC) the
committed directory measured ~743 KB; even after the spec's own prescribed
fallback (32k/48k) it measured ~542 KB. The arithmetic doesn't close: at ~40s
of combined stings+beds, Opus *alone* at 32 kbps already totals ~259 KB —
over budget before AAC is added — so no bitrate short of audibly-degraded
compression fits "both formats, whole directory" under 250 KB. Committing
both formats (the load-bearing half of this ADR) and staying under 250 KB
turned out to be mutually exclusive for a catalog this size, not a target
reachable by more tuning. Settled with the user at 24k Opus / 32k AAC
(~386 KB apparent, ~468 KB on disk, measured via `du -sb`/`du -sh
public/audio`) rather than degrade quality further chasing an unreachable
number. If the true constraint driving 250 KB resurfaces (e.g. a mobile data
budget), the lever is the sound catalog's total duration — chiefly
`lobby-groove` and `ceremony-bed`, the two 8-second (4-bar) loops — not
bitrate, which is already near its practical floor for this material.
