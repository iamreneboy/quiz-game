# P4 — Audio identity

- **Status:** Implementation complete; final audio-content listening pass pending (see Verification)
- **Completed:** 2026-08-23
- **Spec:** `docs/superpowers/specs/2026-08-23-m2-p4-audio-identity-design.md` (parent: `docs/superpowers/specs/2026-08-21-m2-the-show-roadmap.md` §3)
- **Plan:** `docs/superpowers/plans/2026-08-23-m2-p4-audio-identity.md`
- **Branch:** `worktree-m2-p4-audio-identity` @ `13e6730` — not yet merged; see `superpowers:finishing-a-development-branch`

## Scope (from the spec)

P4 is the third cue-bus consumer, built like the two that exist
(`lib/world/runtime.ts`, `lib/staging/runtime.ts`): a continuous,
state-appropriate soundtrack and a set of stingers that obey the same
celebration hierarchy the visuals already obey (`lib/presentation/celebration.ts`).
Presentation-only — no schema, RPC or realtime-protocol change beyond growing
the cue vocabulary by exactly one derived member, `answer-resolved`.

## What was built

Executed via `superpowers:executing-plans` in an isolated worktree, 7 tasks:

| # | Task | Key files |
|---|---|---|
| 1 | The `answer-resolved` cue | `lib/presentation/cues.ts`, `lib/presentation/deriveCues.ts` |
| 2 | The sound generator | `scripts/audio/{dsp,sounds,generate}.mjs`, `public/audio/*`, `lib/audio/manifest.ts` |
| 3 | The pure audio state machine | `lib/audio/design.ts`, `lib/audio/state.ts` |
| 4 | The mixer and the runtime | `lib/audio/mixer.ts`, `lib/audio/runtime.ts`, `app/room/[code]/page.tsx` |
| 5 | Music beds — tension gains, decay, escalation | `lib/audio/runtime.ts` |
| 6 | The mute toggle | `lib/audio/mutePreference.ts`, `lib/useSettings.ts`, `components/ui/Checkbox.tsx`, `components/SettingsControl.tsx` |
| 7 | Verification, ADRs, phase close | `docs/ADR/0023-0025`, this file, `docs/progress/CURRENT.md` |

`lib/audio/design.ts` (67 lines) and `lib/audio/state.ts` (105 lines) are pure
and unit-tested with no Howler, DOM or store import (`tests/audioDesign.test.ts`,
`tests/audioState.test.ts` — 26 new tests). `lib/audio/mixer.ts` and
`lib/audio/runtime.ts` are deliberately unit-test-free beyond the dead-mixer
fallback (`tests/audioMixer.test.ts`), by the same rule `lib/world/runtime.ts`
and `lib/staging/runtime.ts` follow — every decision either file makes lives
in `state.ts`/`design.ts`, which are tested. `scripts/audio/` (464 lines) is a
dependency-free, seeded-PRNG synthesis pipeline: 16 stings + 6 loop stems as
code, rendered to WAV, encoded to Opus/WebM and AAC/M4A via ffmpeg. It is
dev-time only — not invoked by `build`, `test`, `dev` or CI.

## Deviations from the plan (as shipped)

1. **A fixture bug in Task 1's own ordering test, found and fixed before it ever passed.** The plan's given `'rides immediately behind phase-reveal and nowhere else'` test transitioned `myAnswer` from `null` straight to `1` on the *same* snapshot as the phase change to `reveal` (`revealSource(1, 1)`), which also trips the pre-existing `answer-locked` cue (any `null` → non-null `myAnswer` transition emits it, `lib/presentation/deriveCues.ts`), inserting it ahead of `phase-reveal` and breaking the ordering assertion the test was actually about. Fixed by using `revealSource(null, 1)` — the test's stated purpose is cue *ordering*, and the correct/wrong/unanswered content is already covered by the other three tests in that block.
2. **`startAudioRuntime()` takes no `code` argument**, unlike the spec's sketch. `answer-resolved` (Task 1) is derived entirely from `CueSource` fields already available to `deriveCues`, so audio never needed a session lookup the way `lib/staging/runtime.ts` does for callout naming.
3. **The audio runtime is mounted *before* `startCueBridge` in `app/room/[code]/page.tsx`**, and the ordering is load-bearing (ADR-0024): `startCueBridge` seeds synchronously from the store on mount, so a subscriber registered after it would miss the whole seed batch on a client-side navigation into a room already in the store.
4. **The audio budget could not be hit as specified — resolved with the user, not worked around silently.** The spec's "under 250 KB" budget assumed headroom that a ~40s combined catalog (16 stings + 6 beds) across two committed formats (Opus + AAC, per ADR-0025) doesn't have: even Opus alone at 32 kbps already totals ~259 KB, before AAC is added. The plan's own prescribed fallback (32k Opus / 48k AAC) measured ~542 KB, still over 2x budget. Rather than keep cutting bitrate into audibly-degraded territory chasing an unreachable number, this was raised to the user directly (`AskUserQuestion`); the chosen resolution was to settle at 24k Opus / 32k AAC (~386 KB apparent, ~468 KB on disk) and record the miss here rather than degrade quality further. See ADR-0025 for the full arithmetic and the lever to pull if the true constraint (e.g. a mobile data budget) resurfaces.
5. **No tuning changes were made to `scripts/audio/sounds.mjs` during the Task 2 listening pass.** I have no way to hear the generated audio — technical checks (via `ffmpeg -af volumedetect`: no clipping, no silence, durations matching spec) came back clean on all 8 representative files, which were sent to the user for the actual listening/taste judgement. That pass was still outstanding as of this doc; see Verification.
6. **`scripts/audio/sounds.mjs`'s `C3` constant was removed** (unused — never referenced by any sting or bed in the plan's own given code). Confirmed via regenerating that no output byte changes, since the seeded PRNG sequence is keyed by sound id, not by this declaration; not regenerated, since the output is provably identical.

## Deviations found during implementation (not anticipated by the plan)

- **An intermittent, pre-existing `400 Bad Request` from the `advance_phase` RPC** (`lib/useHostDriver.ts`, untouched by this phase) surfaced once, during a track-beat transition, across roughly a dozen headed game playthroughs used for verification. Game state still advanced correctly every time this was seen, and it did not recur across several longer/more complex playthroughs (including a full 3-round game with a mid-final-round reload) run immediately after. Out of scope for P4 — flagged here as a `CURRENT.md` candidate, not fixed.
- **`docs/progress/CURRENT.md`'s pre-existing `react-hooks/set-state-in-effect` debt item's line number moved from `:33` to `:38`** in `app/room/[code]/page.tsx`, because this phase's `useEffect(() => startAudioRuntime(), [])` (plus its explanatory comment) was inserted above it — the same shift pattern the item already documents happening once before, in P3a. Not fixed; still out of this phase's scope. `CURRENT.md` updated to the new line number.

## Live-verification findings

I have no way to hear audio, so "verification" here is necessarily split: what I could confirm directly (crash-free, console-clean, correct DOM/attribute state, correct cue ordering via the dev-mode `[cue]` debug log), and what only the user's own listening pass can confirm (whether the sounds themselves land as intended). This split was raised with the user directly before Task 4's first manual gate; the agreed division of labor is recorded in each task's commit message.

Headed `playwright-cli` sessions run against the live local Supabase stack (never committed, this project's convention for manual checks):

| # | What was exercised | How | Result |
|---|---|---|---|
| 1 | Full lobby→podium cue stream, 1-round game | `[cue]` debug log across countdown→read→answer→reveal→track→results→podium | Exact expected order, including `answer-resolved` riding immediately behind `phase-reveal` and `final-question` firing on countdown (single-round fallback) |
| 2 | The ANSWER tension ramp, full profile, unanswered for the whole 10s beat | rAF gain-ticker loop live for the entire phase | Zero console errors/warnings |
| 3 | The ANSWER tension ramp, `reduced` profile | Same, with Motion set to "Reduced motion" via the settings popover | Zero errors; only warning was the pre-existing, expected "Reduced Motion enabled" notice from the `motion` library itself (also present in the pre-existing `settings.spec.ts` baseline) |
| 4 | Reload mid-ceremony (results/podium) | Reload after game end | Re-seeded `phase-results`+`podium` in one batch, zero stings played (catch-up holds across the synchronous seed batch, per ADR-0024) |
| 5 | Mute toggled on (lobby) and off (mid-round, at the track beat) | Settings popover checkbox, full game to podium | Zero errors across the whole sequence |
| 6 | A real 3-round game, including the run-up beat and a reload mid-*final*-ANSWER | Full playthrough with a scripted reload at round 3's ANSWER phase | `final-question` fired correctly at round 2's track beat (the run-up rule); the mid-final-ANSWER reload re-seeded `final-question`+`phase-reveal`+`answer-resolved` (the room had advanced to REVEAL by the time the reload completed) with zero stings played; the rest of round 3 and the ceremony transition completed with 22 console messages, 0 errors, 0 warnings |

Also confirmed, not found broken:

- **Nothing plays before a gesture.** `mixer.play()` and stem starts are gated on `unlocked`, set only by the first `pointerdown`/`keydown` (code inspection, `lib/audio/mixer.ts`/`lib/audio/runtime.ts`); no autoplay-policy console warning appeared in any of the ~6 headed sessions above.
- **The dead-mixer fallback is what headless e2e actually exercises.** `npm run test:e2e` passed at every gate with the audio runtime mounted, including the full 21-spec suite at phase close — headless Chromium has no `AudioContext`, so every run exercised `createMixer()`'s `DEAD` branch, not a mocked one.

## Knowingly deferred / not built

Nothing — spec §11's scope boundaries were respected throughout; no task needed to cross them.

## Verification

- `npx tsc --noEmit` — clean
- `npm test` — **383/383** (31 test files; P3b baseline was 348 across 27)
- `npm run test:e2e -- --workers=2` — **21/21** across 8 spec files (P3b baseline was 19 across 7; `e2e/settings.spec.ts` gained the two mute tests). `--workers=2` per the established `CURRENT.md` note on default-worker-count flakiness
- `npx eslint` on all files touched by this phase — clean, after removing one genuinely-unused constant (`C3`, `scripts/audio/sounds.mjs`) flagged during this pass; the one remaining finding (`app/room/[code]/page.tsx`) is the pre-existing, already-documented debt item, now at `:38`
- `npm run build` — succeeds (Turbopack, `next build`)
- `du -sb public/audio` — **395,302 bytes (~386 KiB apparent, 468 KB on disk)** against a 250 KB target — see deviation 4 and ADR-0025
- Manual: six-plus full games in headed `playwright-cli` sessions (crash/console verification only — see Live-verification findings)
- **Outstanding:** the user's own listening pass over the 8 representative sounds already sent (`join-blip`, `correct`, `wrong-soft`, `final-sting`, `fanfare`, `round-base`, `lobby-groove`, `round-dread`), plus a live playthrough of `npm run dev` per the plan's Task 7 Step 1 — the parts of the exit criteria that need ears, not console output

### Exit criteria (spec §12 / plan Task 7 Step 1)

- [x] Continuous bed under every phase; escalates through ANSWER; freezes at lock-in — architecturally guaranteed (`tests/audioState.test.ts` bed-transition tests; `if (myAnswer !== null) return;` in the gain ticker) and crash-verified live; **audible confirmation pending**
- [x] One headline sting per TRACK beat; personal verdict at REVEAL; silence for `streak-broken` and `player-advanced` — unit-tested exhaustively (`tests/audioState.test.ts` drama-buffering block, `tests/audioDesign.test.ts` silence tests); **audible confirmation pending**
- [x] Reload mid-game lands on the correct bed — escalated in the final round — and replays no stings — unit-tested (`tests/audioState.test.ts` catch-up block) and live-verified twice (results/podium reload, mid-final-ANSWER reload)
- [x] Mute works, persists, and unmuting mid-game resumes at the right point — `e2e/settings.spec.ts`'s two new tests pass; live-verified (finding 5)
- [x] Nothing plays before a gesture; console is clean of autoplay warnings — live-verified across every headed session
- [x] `reduced` steps the stems instead of ramping — `tests/audioDesign.test.ts` gain-curve tests plus the stepped-write logic in `lib/audio/runtime.ts`; crash-verified live; **audible confirmation pending**
- [x] `npm test` and `npm run test:e2e -- --workers=2` both pass
- [ ] `du -sh public/audio` is under 250 KB — **not met**; 468 KB measured. See deviation 4 / ADR-0025.

## Related ADRs

[0022](../ADR/0022-answer-resolved-is-derived-not-inferred.md) · [0023](../ADR/0023-audio-escalation-reuses-the-vignette-ramp.md) · [0024](../ADR/0024-the-first-cue-batch-is-catch-up.md) · [0025](../ADR/0025-sounds-are-generated-source-not-assets.md)
