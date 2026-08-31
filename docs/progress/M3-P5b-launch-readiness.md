# M3 P5b — Launch readiness

- **Status:** Complete for everything reachable without a second human or the
  cloud project's dashboard. Every PRD §11 criterion now has a recorded
  measurement; the accessibility promises in PRD §8 are enforced by tests, not
  just intended; both carried-debt items are verified closed. Four
  sub-measurements that genuinely need a human or a dashboard restore are
  named and deferred rather than faked — see Deferred below.
- **Completed:** 2026-08-31
- **Spec:** `docs/superpowers/specs/2026-08-29-m3-host-power-polish-roadmap.md` (§3 "P5 — Polish & launch readiness")
- **Plan:** `docs/superpowers/plans/2026-08-30-m3-p5b-launch-readiness.md`
- **Branch:** `worktree-m3-p5b-launch-readiness` — isolated git worktree at `.claude/worktrees/m3-p5b-launch-readiness`
- **Method:** `superpowers:executing-plans`, inline (no subagents, at the user's standing instruction)
- **ADR:** [ADR-0055](../ADR/0055-ink-mute-is-an-accessibility-floor.md)

## Scope (from the plan)

Seven tasks: colour arithmetic as a pure module, a hand-mirrored contrast
table gated by a test, closing the two findings that table surfaced, a
behavioural accessibility sweep (keyboard, text scaling, reduced motion,
landmarks), the free-tier budget computed from the app's own constants, a
Node soak harness for the ten-player/twelve-question criterion, and finally
measuring, recording, deciding and merging. No new runtime dependency, no
wire change, no schema change, no celebration-hierarchy addition.

## PRD §11 scorecard

| Criterion | Measurement | Source |
|---|---|---|
| Host to started game < 3 min, unassisted | **Machine floor: 7.8s**, landing page to countdown visible. `e2e/host-setup.spec.ts` turned out to cover only `/host/new` form validation, not this flow, so it was measured directly instead. **Human run: deferred** — needs someone who hasn't been in this codebase, with a stopwatch, no narration. | one-off Playwright timing (not committed) |
| 12 questions, 10 players, no desync or stall | **Local: 50/50 broadcasts received by every socket, worst clock drift 13ms** (PRD §9 budget 250ms), **wall clock 207.6s** against a 207s nominal. **Cloud run: deferred** — needs the paused free-tier project restored from the dashboard first. | `npm run soak` (`scripts/soak.mjs`), local stack |
| 60fps laptop, graceful phone | **132–145fps sustained, 0 dropped frames (>20ms), at every beat measured**: lobby, countdown roll-up, three TRACK beats (one per round), podium ceremony with confetti. Under a synthetic 70ms-busy/100ms-period main-thread block, p95 frame time rose to ~70ms and ~20/120 frames dropped, but fps *held or improved* (133→145fps) rather than collapsing, and fully recovered within 3s of the load lifting. **Phone-on-deployed-site: deferred** — needs a real device and the cloud project restored. | one-off headed Playwright profiling reading `PerfOverlay`'s DOM (not committed) |
| Ties resolved per the Fairness Law, sudden death included | Cited rather than re-run, per the plan: `e2e/tiebreak.spec.ts` (3/3 in both this phase's full-suite run and its isolated re-run) and `scripts/smoke.mjs`'s tiebreak sections. | M3 P2a/P2b verification |
| One month of typical office use inside both free tiers | **Supabase:** ~1,536 realtime messages/game, ~19,968/month against a 2,000,000 ceiling; 16 concurrent connections against 200 (room for 12+ simultaneous games); 94 presence RPCs/game, 1,222/month; 208 DB rows/game, 2,704/month, all purged within 24h. Game length 279.4s (4:39), inside PRD §1's 4–12 minute promise. **Vercel:** worst-case First Load JS × subscribers × games/month ≈ 1115KB (heaviest route, `/room/[code]`) × 16 × 13 ≈ **227MB/month against Hobby's 100GB Fast Data Transfer allowance (≈0.22%)**. | `tests/budget.test.ts`; `npm run build` + one-off transfer measurement (not committed); Hobby figure confirmed live via vercel.com/pricing |

## The accessibility audit

### Findings closed (Tasks 2–3)

Both findings were computed while writing the plan, not discovered live —
see the plan's own "Findings already made while planning" table. Closing them
here means the source now agrees with what `lib/a11y/palette.ts` already
asserted:

1. **`--color-ink-mute` lifted from `#6d75ab` to `#767eb9`** — the smallest
   nudge that clears WCAG AA's 4.5:1 for small text on every ground the app
   paints it on. See [ADR-0055](../ADR/0055-ink-mute-is-an-accessibility-floor.md).
2. **`components/PlayerConnection.tsx`'s dropped-player chip moved from
   `text-ink-mute` to `text-ink-dim`** on its `bg-haze/40` ground — the one
   ground no ink-mute value clears, matching every other haze-ground chip in
   the app.

### The table grew beyond the plan's own sketch

Enumerating `bg-(void|abyss|night|dusk|haze)(/\d+)?` against the live source
(per the plan's own Task 2 Step 1 instruction) turned up six composited
grounds the plan's example code didn't model: `abyss60`, `abyss70`, `abyss80`,
`abyss90`, `night70`, and a `chipDropped` (`bg-haze/40`) distinct from the
plan's `chip` (`bg-haze/45`) — real, distinct backgrounds carrying real
`text-ink`/`text-ink-dim`/`text-ink-mute` classes, in `RematchCard`,
`app/host/new/page.tsx`, `SuddenDeathBanner`, `Input`, `RevealPanel`,
`StageJoinPanel`, `LowerThird`, `Select`, `HostControlStrip`,
`SettingsControl`, and `StageShell`'s landscape header. Two more grounds
turned out to carry no relevant text and were excluded with a reason instead
of silently matched to a neighbour: `bg-void/70` (`PauseCard`'s backdrop —
the actual text sits in a nested `bg-night/80` panel) and `bg-haze/30`
(`ResultsView`'s hover state, which carries `text-neon-cyan`, an accent, not
an ink token). `lib/a11y/palette.ts` reflects the real source now, not the
plan's illustrative sketch.

`tests/a11y.test.ts`: **74 tests**, covering per-token-per-ground WCAG AA
contrast, the four-accent CVD survival check (including the assertion that at
least one pair *does* collapse under simulated dichromatic vision — the fact
that justifies ADR-0017's shape coding), the source-scan for uncovered
`text-<token>` classes, and the 17-token mirror against `app/globals.css`.

### The behavioural sweep (Task 4)

`e2e/a11y.spec.ts`, 5 specs, all green:

- The landing page has exactly one `<main>`, no unnamed focusable control, and
  a keyboard-only tab order that reaches Host, Room code, and (once a valid
  code exists — see below) Join.
- A player can join and answer entirely by keyboard, including the documented
  1–4 shortcut.
- The readable layer survives 200% text zoom on a 390px viewport with no
  horizontal scroll.
- `prefers-reduced-motion: reduce` selects the reduced profile.
- The Pixi canvas is `aria-hidden` on both the player and broadcast surfaces;
  the broadcast surface has no `<main>` of its own, by design.

**One real defect found and fixed:** the READ/ANSWER header's round-badge row
(`components/QuestionCard.tsx`) had no `flex-wrap`, so at 200% text zoom on a
narrow phone the `Q{n}/{total}` + category + tier badges overflowed the
viewport by ~33px. Fixed with `flex-wrap`.

**One apparent failure that was not a defect:** the spec initially expected
Tab to reach the Join button right after the room-code field. Join is
legitimately `disabled={!ready}` until a 5-character code exists
(`app/page.tsx`), and browsers correctly remove a disabled control from the
tab order — the same restriction a mouse user faces. The test's assumption
was wrong; fixed by typing a code before checking focus, not by adding
`tabindex`.

**The screen-reader pass by hand (Task 4 Step 3) is deferred** — see Deferred
below. No verbatim listening notes exist for this phase.

### Look-at-it verification (Task 3 Step 6)

Headed screenshots at the lobby, the `Q{n}/{total}` badge during READ, the
track heading, and the gear menu's caption all show `ink-mute` reading as
genuinely muted but legible, with the `ink` > `ink-dim` > `ink-mute`
hierarchy intact. **One correction to the plan's own checklist**: the lobby's
`Starting grid — n joined` heading is `text-neon-cyan`, not `ink-mute` — P5a's
restyle moved it to an accent. Not a defect; the plan's Step 6 list named the
wrong site for that one entry.

## The two carried-debt items — verified closed

Both were already closed before this phase started; the roadmap listed them
because it predates the fixes. Verified by direct evidence, not re-opened:

- **The off-screen marker's direction** — `e65999c` ("give the readout's
  off-screen marker a direction"). `components/TrackReadout.tsx:11,77` renders
  `OFFSCREEN_ARROW[off.direction]` (◀▶▲▼).
- **The twenty-player grid** — `58957b4` ("grow lobby grid rows instead of
  compressing column spacing"). `npx vitest run tests/geometry.test.ts -t
  "twenty-player"` passes.

Both mentions removed from `CURRENT.md`.

## Deviations from the plan

1. **Task 2's palette table needed real extension, not a verbatim copy** — see
   "The table grew beyond the plan's own sketch" above.
2. **Task 3 Step 6's checklist named a site that turned out to be a different
   token** (the lobby heading is `neon-cyan`, not `ink-mute`) — not a defect,
   corrected in the record above.
3. **Task 4 found and fixed one real layout defect** (the badge row's missing
   `flex-wrap`) and one false failure (Join's correctly-disabled tab stop) —
   both detailed above.
4. **Task 5's `PHASE_BROADCASTS` undercounted by one.** The comment assumed
   TRACK was replaced by RESULTS on the final round; `advance_phase`'s
   `when 'track'` branch (`supabase/migrations/0009_presence.sql`) always
   transitions to TRACK, and RESULTS is a fifth, separate transition after it.
   Found empirically when Task 6's soak harness sent 50 broadcasts for 12
   rounds, not the assumed 49. The test passed before and after (its headroom
   margin absorbs a difference this small) but the claim itself was wrong;
   fixed in a standalone commit once discovered.
5. **Task 6's script had a real harness bug**: all ten racer sockets plus the
   host shared one `createClient(...)`, and `@supabase/realtime-js`'s
   `RealtimeClient.channel()` dedupes by topic name — eleven
   `sb.channel('room:CODE')` calls collapsed into one channel, so only the
   first `.subscribe()` ever resolved and the harness hung forever on the
   `Promise.all`. Fixed by giving every socket its own client, mirroring what
   a separate browser context provides for free. Also added a 2s settle grace
   before the desync assertions: `hostChannel.send()` resolving confirms the
   server accepted a broadcast, not that all ten sockets have received it yet,
   and the harness raced that fan-out once during development.
6. **Task 7 Step 2's "machine floor" pointer was wrong** — `e2e/host-setup.spec.ts`
   covers only form validation, not landing-to-started timing. Measured the
   real flow directly instead (not committed).

## Deferred — needs a second human or the cloud dashboard

Agreed with the user before starting: automate everything reachable, defer
what genuinely needs a human sense or a manual dashboard action, and record
the deferral rather than fake or skip it silently.

- **The screen-reader pass by hand** (Task 4 Step 3) — Narrator or NVDA,
  walking the nine listed surfaces and writing down what was actually heard.
- **The soak run against the cloud project** (Task 6 Steps 3–4) — needs the
  free-tier project restored from the Supabase dashboard first (it pauses
  after ~1 week idle), then `npm run soak` against it, then one real browser
  watching a live cloud-backed game alongside it.
- **The phone verification** (Task 7 Step 1, tail) — a real mid-range phone
  against the deployed Vercel site, cloud Supabase restored: resolved
  profile, tap responsiveness, visible stutter.
- **The human timing run** (Task 7 Step 2) — an unbiased first-time user,
  stopwatch, no instructions, from the landing page to a joined second device.

None of these block the phase from merging — every criterion already has a
recorded local/automated measurement, and PRD §11's own text treats "12
questions, 10 players" and "host setup < 3 min" as needing both a machine
number and (implicitly) a human check. The four items above are the human
half. Recorded in `CURRENT.md`'s tech debt as open follow-ups.

## Regression floor

Run in the worktree, against the real local Supabase stack.

| Gate | Command | Result |
|---|---|---|
| Types | `npx tsc --noEmit` | silent |
| Lint | `npm run lint` | zero problems |
| Unit | `npm test` | **741 passed** (49 files) — 650 before this phase, +91: 12 (`contrast.test.ts`) + 74 (`a11y.test.ts`) + 5 (`budget.test.ts`) |
| Build | `npm run build` | clean; route table unchanged in shape |
| Browser | `npm run test:e2e -- --workers=1` | **48 passed, 2 failed** (15.7 min) — see below |
| Browser, isolated | `npx playwright test e2e/game-flow.spec.ts e2e/aftermath.spec.ts --workers=1` | **3 passed** (3.3 min) |

**Both e2e failures are the documented full-suite load flake, not a
regression.** `e2e/game-flow.spec.ts`'s `getByText('Starting grid')` timeout
is the exact signature `docs/progress/M3-P4-the-bank.md` already recorded
under full-suite load; `e2e/aftermath.spec.ts`'s `awards` testid timeout after
a reload is the same class of failure (a Pixi-heavy spec's async chain
outrunning its timeout under contention), not one of the three previously
catalogued signatures specifically, but the same underlying cause. Both
specs, and the third in the isolated run (`aftermath`'s rematch case), passed
3/3 when re-run alone. This phase changed no runtime code either failing spec
exercises.

## Notes for phases that inherit this work

- **The ink scale has a floor.** `lib/a11y/palette.ts` mirrors
  `app/globals.css`'s full palette plus the composited grounds the app
  actually paints text on. `tests/a11y.test.ts` fails on a contrast drop, a
  mirror drift, or an uncovered `text-<token>` class. A new translucent
  surface needs a `GROUNDS` entry before an ink token goes on it — see
  [ADR-0055](../ADR/0055-ink-mute-is-an-accessibility-floor.md).
- **`npm run soak` is the ten-player instrument, and it is a Node script on
  purpose.** This machine cannot sustain even two concurrent Pixi/WebGL
  contexts under load; ten would measure the laptop, not the game. Point at
  it for any future "does this still work at scale" question. Each socket
  needs its own `createClient(...)` — a shared client's `channel()` dedupes
  by topic and silently collapses multiple "sockets" into one.
- **`PHASE_BROADCASTS` is `2 + ROUNDS * 4`, not `1 + ROUNDS * 4`** — RESULTS
  is a fifth transition after every round's TRACK, including the last one,
  never a replacement for it.
