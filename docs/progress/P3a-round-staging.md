# P3a — Round staging: the question surface

- **Status:** Complete
- **Completed:** 2026-08-23
- **Spec:** `docs/superpowers/specs/2026-08-23-m2-p3a-round-staging-design.md` (parent: `docs/superpowers/specs/2026-08-21-m2-the-show-roadmap.md` §P3)
- **Plan:** `docs/superpowers/plans/2026-08-23-m2-p3a-round-staging.md`
- **Branch:** `worktree-m2-p3a-round-staging` @ `a093231` — not yet merged; see `superpowers:finishing-a-development-branch`

## Scope (from the spec)

Turn the M1 placeholder question surface into staged TV beats — a pure timing spine, restyled shape-coded answer buttons, and choreographed READ and ANSWER beats. A pure timing core (`beats.ts`, `tension.ts`) derives everything from the server's `ends_at` rather than local arrival, so a reload or a late join lands in the right state with no replay and no special case. A single rAF ticker publishes discrete state to a Zustand store (`useStaging`) and writes continuous values straight to CSS custom properties, so React re-renders roughly once a second instead of sixty times. Presentation-only — no schema, RPC, or realtime-protocol change; roadmap decision 4 is not triggered by this phase.

## What was built

Executed via `superpowers:executing-plans` in an isolated worktree, 7 tasks:

| # | Task | Key files |
|---|---|---|
| 1 | The timing core | `lib/staging/beats.ts`, `lib/staging/tension.ts` |
| 2 | The answer lock survives a reload | `lib/staging/answerLock.ts` |
| 3 | Staging state and its store | `lib/staging/staging.ts`, `lib/staging/useStaging.ts` |
| 4 | The ticker, the CSS bridge, and the tension frame | `lib/staging/runtime.ts`, `components/TensionFrame.tsx`, `app/globals.css` |
| 5 | The answer buttons | `components/AnswerButtons.tsx` |
| 6 | The question card and the countdown ring | `components/QuestionCard.tsx`, `components/TimerRing.tsx` |
| 7 | The stage shell, the countdown, and the e2e suite | `components/StageShell.tsx`, `components/GameView.tsx`, `e2e/staging.spec.ts` |

Plus one fix pass found by the exit-criteria walkthrough after Task 7 closed (`2e9369b`, below).

New pure modules — `lib/staging/{beats,tension,staging,answerLock}.ts` — are unit-tested with no React, store, or DOM import (`tests/{beats,tension,staging,answerLock}.test.ts`, 45 new tests). `lib/staging/runtime.ts` remains deliberately unit-test-free, by the same rule `lib/world/runtime.ts` follows: every decision it makes lives in a pure module that is tested.

## Deviations from the plan (as shipped)

1. **`AnswerButtons`' opacity is driven by the `motion.button` variant's target value, not a Tailwind class alongside it.** The plan's given code applied `opacity-45`/`opacity-55`/`opacity-100` as classes while the same element's `variants` animated `opacity` directly — `motion` writes animated properties as an inline style, which unconditionally outranks a class regardless of specificity, so every dimmed/faded state silently rendered at full opacity. Recorded in [ADR-0017](../ADR/0017-answer-selection-is-form-not-hue.md).
2. **The shortcut-hint media query is `[@media(hover:hover)_and_(pointer:fine)]:block`, not the plan's `[@media(hover:hover)and(pointer:fine)]:block`.** Tailwind's arbitrary-variant bracket syntax needs `_` for the spaces around `and`; without them the generated CSS tokenizes `and(` as a function call and fails to parse — which broke every page's stylesheet the moment the literal string existed anywhere Tailwind scans (see the next section).
3. **`StageShell`'s options slot is wrapped in `AnimatePresence initial={false}`.** Spec §7 calls for each region to be wrapped in `AnimatePresence` "so beat changes are transitions rather than unmount/mount swaps"; the plan's given `StageShell.tsx` omitted it. `QuestionCard` independently satisfies this for its own badges/question with its own internal `AnimatePresence`s, but nothing protected the options slot, and `AnswerButtons` has no `AnimatePresence` of its own — so it replayed its mount-in stagger on every mount, reload included. Fixed in `2e9369b`, after Task 7 had already landed; see [ADR-0014](../ADR/0014-beat-position-derived-from-ends-at.md).
4. **`lib/staging/runtime.ts` bootstraps `useStaging` synchronously, once, the instant `room` is first known**, in addition to the plan's rAF-only publish loop — not a deviation in the file list, but a real addition to the given `runtime.ts` body. Required to make exit criterion 5 (reload lands correctly, no replay) actually hold; see [ADR-0014](../ADR/0014-beat-position-derived-from-ends-at.md) for why it has to be one-shot rather than a subscription on every store change.
5. **`e2e/staging.spec.ts` sets the timer slider to `20`, not the plan's `30`.** `app/host/new/page.tsx`'s slider has `max={20}`; setting `30` via the native value setter clamps silently, and the plan's own `Answer timer: 30s` assertion never matched anything.
6. **`e2e/world.spec.ts`'s replacement drops two of the four `data-band` assertions** in the collapses-to-strip test (the ones between "Get ready…" and "Locked in!"), because the plan's given replacement text spans exactly the line range containing them. The two after "Correct answer" and at TRACK are untouched, so strip/full behavior is still asserted, just with less redundancy. Left as specified — the band derives from `room.phase`, which this phase does not touch, so the loss is coverage density, not a gap in what is checked.

## Deviations found during implementation (not anticipated by the plan)

- **The plan's own markdown broke the running app**, independent of any task. `app/globals.css` has no `tailwind.config.js` and no `@source` restriction, so Tailwind v4's zero-config content detection scans the whole project by default — including `docs/superpowers/plans/2026-08-23-m2-p3a-round-staging.md`, which is a tracked file containing the exact malformed class string from deviation 2. The moment that plan file existed in the tree, every page 500'd (`lightningcss` read `and(pointer:fine)` as a function call and failed to parse the stylesheet), discovered while trying to load `/host/new` for Task 4's live verification — before any of Task 5's code had been written. Fixed with `@source not "../docs";` in `app/globals.css` (`9bba2af`), committed separately from feature work since it is a build-hygiene fix, not P3a scope.
- **The main checkout's `.env.local` does not match the currently-running local Supabase stack.** `CURRENT.md` documents a port shift to 553xx because Windows/Hyper-V reserves the default 543xx range; the checked-out `.env.local` (gitignored, dated 2026-08-20) still points at the unshifted `54321`. Nothing was listening there — `netstat` showed the real stack on `55321`–`55327`. Not fixed in the main checkout (out of this phase's scope); the worktree's own copy was corrected to unblock live verification here. **The user should check whether the main checkout's `.env.local` needs the same fix**, or whether this points at a Supabase restart since that file was last touched.
- **A gitignored file needs manual carry-over into every fresh worktree.** `.env.local` is not copied by `git worktree add` (only tracked files are), so the new worktree had no Supabase URL/key at all until copied by hand from the main checkout — the same "fresh machine will need the same port shift applied by hand" note in `CURRENT.md`, but it turns out to apply to fresh worktrees too, not just fresh machines. Worth remembering for the next phase's worktree.

## Live-verification findings (all confirmed and fixed, not just reasoned about)

Every finding below was caught by actually running the app in a headed browser (`playwright`'s `chromium.launch({ headless: false })`, driven ad hoc per task rather than as committed tests — this project's convention for manual checks) and reading real computed styles and CSS custom property values, not by inspecting the diff.

| # | What broke | How it was caught | Evidence |
|---|---|---|---|
| 1 | App-wide 500 from the plan's own markdown | Loading `/host/new` before Task 5 existed | `lightningcss` parse error at `app/globals.css`, `Unexpected token Function("and")` |
| 2 | READ-dimmed and faded-after-lock buttons rendered at full opacity | Reading `getComputedStyle(button).opacity` during READ | `1` instead of `0.55`; fixed to `0.55` exactly |
| 3 | Badges replayed their slam-in on a mid-READ reload | Reloading mid-READ, sampling opacity/transform every 40ms | First sample `opacity: 0.50`, `x: -35.5px` post-reload; after the fix, `opacity: 1`, `transform: none` immediately |
| 4 | The same fix, applied bluntly, killed the *legitimate* entrance animation | Re-testing a fresh, live-watched READ start after the first fix | All 20 samples flat at `opacity: 1` — no animation at all; the one-shot bootstrap (deviation 4) restored the genuine overshoot-and-settle curve |
| 5 | `AnswerButtons` replayed its own stagger on a mid-ANSWER reload | Same reload methodology, applied to the options slot | `opacity: 0.25`, `y: +5.1px` for one frame post-reload; fixed by deviation 3 |

Also confirmed, not found broken: the tension ramp (`0.0000` calm → `0.6685` at ~T-3s of a 20s timer → `0.8952` in the final second, freezing exactly at lock while `--timer-frac` kept falling), the publish rate (10 `useStaging` publishes measured over a 10-second ANSWER window, via the `window.__staging` dev probe — see exit criterion 7 below), all four answer-button accent colors and glyphs in order, the `1`–`4` keyboard shortcuts (including that `Ctrl+2` does *not* lock), Tab/Enter operability with a cyan focus ring, the narrow-viewport layout (390×844: one column, 66px-tall buttons), and the `reduced` profile (cross-fade with no horizontal travel past one transient first-paint frame, three discrete `--tension` levels, animations forced to ~0 duration).

## Knowingly deferred / not built

Nothing beyond what spec §9 already scopes to P3b: REVEAL staging and the avatar-stacked distribution bar, TRACK moment direction, final-question escalation, lower-third callouts, and the restyles of `RevealPanel` and `TrackReadout`. Two notes carried forward into `docs/progress/CURRENT.md` for whichever phase opens the protocol next:

- The avatar-stacked distribution bar is not buildable on the current wire — `build_reveal` returns `counts: number[]` only, with no way to know who picked what.
- If P3b opens the protocol, P2's deferred `current_streak` addition to `Standing` should ride along in the same change rather than waiting for a third opening.

## Verification

- `npx tsc --noEmit` — clean
- `npm test` — **304/304** (25 test files; P2 baseline was 259 across 21)
- `npm run test:e2e` — **18/18** across 7 spec files (P2 baseline was 17 across 6; `e2e/staging.spec.ts` is new)
- `npx eslint` on every file this branch touched — clean, except the pre-existing `react-hooks/set-state-in-effect` at `app/room/[code]/page.tsx` (now line 33; predates this phase, recorded in `CURRENT.md`)
- `npm run build` — succeeds
- `git diff main --stat` — no changes under `supabase/`; presentation-only, as required
- Manual: full two-player games in a headed browser at 390×844 and 1280×720, under both performance profiles, with screenshots at READ+0.2s, READ+1.5s, ANSWER T-8s, ANSWER T-2s, and locked (development evidence, not committed)

### Exit criteria (spec §12)

- [x] READ plays as a staged announcement, question legible by ~920ms of the 3s beat — `tests/beats.test.ts` boundary coverage (0/459/460/999/1000ms) + live: badges lock with the `EASE.settle` overshoot, question rises at 460ms
- [x] ANSWER escalates through the ring and the closing frame without dimming, scaling or moving the question or options; locking freezes the frame — live: `--tension` 0.0000 → 0.6685 → 0.8952, frozen post-lock while `--timer-frac` kept falling; question/options opacity never referenced `--tension` in either component
- [x] Answer buttons are shape-coded, index-stable, operable by pointer, Tab/Enter and 1–4, lock announced to AT — live: all four accents/glyphs matched by index; `2` locks option 2, `Ctrl+2` does not; Tab reaches all four in order, Enter activates the focused one; `e2e/staging.spec.ts` asserts the `aria-live` announcement text
- [x] Mobile portrait (390×844) keeps question and interaction first-priority — live: one column, 66px button height, layout aligned to `PixiStage`'s actual 28vh strip
- [x] A reload anywhere in READ or ANSWER lands correctly without replaying; a lock survives it — live for both beats (see findings 3–5 above); `e2e/staging.spec.ts` asserts the lock across a real reload
- [x] Both performance profiles work; `reduced` performs no continuous ramp and no per-frame writes — live: three discrete `--tension` levels, cross-fade with no sustained horizontal travel, global ~0-duration animations
- [x] `useStaging` re-renders on the order of ten times per beat, not sixty times per second — measured **10 publishes in a 10-second ANSWER window** via the `window.__staging` dev probe (~1Hz, driven by `secondsLeft`)
- [x] The Playwright e2e suite passes — 18/18

## Related ADRs

[0014](../ADR/0014-beat-position-derived-from-ends-at.md) · [0015](../ADR/0015-continuous-values-to-css-custom-properties.md) · [0016](../ADR/0016-staging-never-gates-input.md) · [0017](../ADR/0017-answer-selection-is-form-not-hue.md)
