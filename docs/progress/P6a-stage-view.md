# P6a — Stage view: spectator route & broadcast shell

- **Status:** Implementation complete; all ten exit criteria met and live-verified
- **Completed:** 2026-08-24
- **Spec:** `docs/superpowers/specs/2026-08-24-m2-p6a-stage-view-design.md` (parent: `docs/superpowers/specs/2026-08-21-m2-the-show-roadmap.md`)
- **Plan:** `docs/superpowers/plans/2026-08-24-m2-p6a-stage-view.md`
- **Branch:** `worktree-m2-p6a-stage-view` — isolated git worktree at `.claude/worktrees/m2-p6a-stage-view`
- **Method:** `superpowers:executing-plans`, live browser verification throughout via headed Playwright scripts against the real local Supabase stack

## Scope (from the spec)

P6a adds `/stage/[code]` — a chrome-free, read-only broadcast screen for a TV or shared screen that follows a live game from lobby through ceremony with no interaction, composed entirely from P1–P5's existing world, staging, audio and ceremony. No wire change, no migration, no RPC, no new store, no new cue type. The route is landscape-only (≥1024px); a portrait stage layout is an explicit non-goal.

## What was built

9 tasks, executed sequentially with a typecheck/lint/unit pass after each and a commit per task:

| # | Task | Key files |
|---|---|---|
| 1 | Per-owner texture cache | `lib/world/render/ownedCache.ts`, `tests/ownedCache.test.ts`, `lib/world/render/AvatarNode.ts`, `lib/world/render/Avatars.ts` |
| 2 | The viewer seam | `lib/viewer.ts`, `lib/useRoomRuntimes.ts`, `tests/viewer.test.ts`, `lib/staging/runtime.ts`, `components/PixiStage.tsx`, `app/room/[code]/page.tsx` |
| 3 | The stage route, gate and broadcast shell | `app/stage/[code]/page.tsx`, `components/stage/StageGate.tsx`, `components/stage/StageBroadcast.tsx`, `lib/store.ts`, `lib/useRoomChannel.ts` |
| 4 | Shared option identity | `lib/staging/options.ts`, `tests/options.test.ts`, `components/AnswerButtons.tsx` |
| 5 | The question on stage | `components/stage/StageQuestion.tsx`, `components/stage/StageOptions.tsx` |
| 6 | The stage lobby | `components/stage/StageJoinPanel.tsx`, `package.json` (`qrcode`, `@types/qrcode`) |
| 7 | The track beat and the ceremony | `components/stage/StageResults.tsx` |
| 8 | The stage link in the lobby | `components/LobbyView.tsx` |
| 9 | End-to-end coverage and verification | `e2e/stage.spec.ts`, `docs/ADR/0031`, `docs/ADR/0032`, ADR-0011 amendment, this file, `docs/progress/CURRENT.md` |

Three pure modules gained unit tests and import no React, Pixi or DOM: `OwnedCache` (6 tests), `viewerPlayerId` (6 tests), `OPTION_IDENTITIES` (3 tests). Unit suite went 429 → 444.

The route is read-only **by composition** (ADR-0032): it mounts no component that can write — no `JoinGate`, `GameView`, `LobbyView`, `SettingsControl`, no `useHostDriver` — and discards `useRoomChannel`'s return value. Verified live: across a full game the stage tab issued exactly one `rest/v1/rpc` call, `get_room_state`.

`qrcode` is M2's first added runtime dependency (spec §9). It is dynamically imported inside `StageJoinPanel`'s effect and drawn onto a canvas through a ref, so it never enters the player route's bundle and the component holds no React state.

## Deviations from the plan

**None in substance.** Every task's interfaces (`OwnedCache`, `viewerPlayerId`, `useRoomRuntimes`, `OPTION_IDENTITIES`, the `data-testid` hooks, the `StageBroadcast` prop that arrives only in Task 6) were consumed exactly as specified, and every planned signature change (`clearBakedAvatars(app)`, `startStagingRuntime(code, role)`, `PixiStage`'s required `role`) landed as written.

Two mechanical notes on how verification was carried out rather than on what was built:

- **The plan's per-task "verify by hand, headed" steps were run as scripted headed Playwright sessions**, not as interactive clicking — same headed browser, same real Supabase stack, same assertions, but driven from a throwaway script so each observation is a printed value rather than a judgement call. The script lived outside the repo's tracked files and was deleted before each commit. This was chosen because the checks are mostly attribute reads (`data-beat`, `data-entered`, `data-band`, computed `opacity`) where a printed sample beats an eyeball.
- **The mid-REVEAL reload check (Task 5 step 5.4) was performed mid-ANSWER instead.** The REVEAL beat is short enough that a reload plus the gate tap plus re-subscription reliably lands past it in TRACK, so the intended observation is unobtainable at that beat. The trap is identical at ANSWER — same `AnimatePresence initial={false}` guard, same options grid, same mount-time stagger — and it was checked there: eight consecutive samples of the last option tile read `opacity: 1, transform: none`, i.e. present at rest with no replayed stagger. The REVEAL-specific half of the concern (distribution present immediately) was confirmed separately from the RESULTS reload, where `data-entered` read `"true"` on all eight post-reload samples.

## Verification

All five commands run on the final tree:

| Command | Result |
|---|---|
| `npx tsc --noEmit` | silent |
| `npm run lint` | zero problems |
| `npm test` | 444 passed (37 files) |
| `npm run build` | compiled clean; `/stage/[code]` listed as a dynamic route |
| `npm run test:e2e -- --workers=2` | 25 passed (21 pre-existing + 4 new) |

The 21 pre-existing e2e tests were also run in isolation immediately after Task 2 — the pure refactor of the player route — and passed unchanged, which is the evidence that threading the viewer role changed no player behaviour.

## Live-verification findings (spec §13 exit criteria)

Headed Chromium throughout, stage contexts at 1920×1080, against the real local stack. Headless is unusable here for anything frame-sensitive (`CURRENT.md`).

| # | Criterion | How | Result |
|---|---|---|---|
| 1 | A full game runs on stage with no interaction after the gate | 2-player and 3-question games driven end to end; `data-beat` polled through every transition | lobby → countdown → read → answer → reveal → track → results, all reached; join panel, question, distribution, empty track band and results board each appeared on their own beat |
| 2 | A profile that has already joined gets an identical broadcast | Stage opened in the **host's own context**, session for that exact room present in `localStorage` | Broadcast, not a player view: no join form, no start button, no `answer-option`, no YOU ring on any rig. Also covered by `e2e/stage.spec.ts` |
| 3 | Two stage views on one room | Second stage context opened mid-game (round 2 of 3) | Both tracked the same beats simultaneously (`A: read / B: read`, then `A: answer / B: answer`); no page errors in either |
| 4 | Only reads on the wire | `request` listener filtered to `rest/v1/rpc` across a whole game | `POST get_room_state` — 1 call, total. No `submit_answer`, no `advance_phase`, no `join_room` |
| 5 | Audio after the gate | `Howler.ctx.state` read on the stage after the gate tap | `running muted=false` — the gate's `pointerdown` satisfies the autoplay policy via the listener `lib/audio/runtime.ts` already registers |
| 6 | Full bleed on stage, strip on the player route | `data-band` read on both surfaces during the same ANSWER beat | stage `full`, player `strip` |
| 7 | Reduced profile and OS reduced motion | Stage context with `reducedMotion: 'reduce'` and `cb:settings:profile = reduced` seeded before load | `data-profile="reduced"`; join panel + QR rendered, 4 options at ANSWER, correct row at REVEAL, results `data-entered="true"`; zero console errors |
| 8 | Opened mid-game | Fresh context opened during round 2 of a 3-question game | Landed on the correct beat at the correct position, status bar reading `Round 2/3`, correct category and tier; no stinger replay, no page errors (ADR-0024's catch-up flag, inherited by keeping the runtime mount order intact) |
| 9 | Opened mid-ceremony | Fresh context opened at the RESULTS beat | Beat `results`, board present with `data-entered="false"` and animating in — correct, the ceremony had not settled. No crash, no errors. Confetti density under a degraded profile is the known P5a defect and was not re-litigated here |
| 10 | No usable WebGL | Chromium launched with `--disable-gpu --disable-software-rasterizer --disable-webgl`; `getContext('webgl2')` confirmed null | Full game played through: question visible, 4 options, correct row at REVEAL, results entered. No crash, no blank screen, zero console or page errors — the HTML surface is entirely independent of canvas (PRD §9) |

Reload behaviour, checked separately: mid-ANSWER reload left the options at `opacity: 1, transform: none` across eight samples (no replayed stagger); post-ceremony reload read `data-entered="true"` on all eight samples (never observed transitioning from `"false"`).

## Known and accepted (not P6a defects)

- **The winner's podium rig is clipped at the top of the retreated 50vh band.** Reproduced on the stage view exactly as `CURRENT.md` records it from P5a and re-confirms from P5b. Deferred to P6b, as the spec directs.
- **A deep tie stack can lose its top rigs on a non-16:9 display** (`MAX_STACK_RISE`, P2). Unchanged; the stage view is the surface that will care, which is why it now names P6b.
- **Confetti can burst at full density for a client mounting into an already-elapsed ceremony** (P5a). A TV switched on late is the normal way to hit this. Confirmed as that defect, not a new one; fix stays out of this phase.

## Carried forward

- The room route still swallows a `get_room_state` error and shows "Connecting…" indefinitely for an unknown code. `roomMissing` now exists in the store and `useRoomChannel` sets it, but only the **stage** route reads it — adopting it on the player route is a separate improvement, deliberately out of this phase's scope.
- `LobbyView` remains M1-era amber/slate and predates the design system. The new Stage-view panel matches that palette on purpose (spec §12.8); the restyle happens all at once, later, as its own work.
