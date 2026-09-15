# Current work — Circuit Break

> Live tracker only. Read this first; don't read other files in `docs/progress/` or old plans unless this file points you there. Move a phase's entry out to `docs/progress/PN-*.md` the day its last task lands — this file should never grow past "what's active right now."

## Current phase

**M3 complete.** P0, P1, P2a/P2b, P3a/P3b, P4, P5a and P5b have all merged; the
next milestone is v1.

- **Last completed:** M3 P5b — Launch readiness → [`docs/progress/M3-P5b-launch-readiness.md`](M3-P5b-launch-readiness.md). Every PRD §11 criterion now has a recorded measurement; the accessibility promises in PRD §8 are enforced by tests (`lib/a11y/contrast.ts`, `lib/a11y/palette.ts`, `tests/a11y.test.ts`); the free-tier budget is a computed test (`tests/budget.test.ts`); a Node soak harness (`scripts/soak.mjs`) verifies the ten-player/twelve-question criterion without ten browsers. Both carried-debt items from the roadmap were verified already closed, with commit citations, rather than reopened. Four sub-measurements that need a second human or the cloud dashboard were deferred rather than faked — see Tech debt below.
- **Since then, outside any phase:** the night-race backdrop was redesigned
  (`0712f0b`) and has now been **verified live through the real renderer**
  (2026-09-03) — see the backdrop note below and [ADR-0056](../ADR/0056-backdrop-depth-is-value-not-detail.md).
  A seventh category, **`coffee-is-life`** ("Coffee is Life", `🫘`), was added
  (2026-09-04): 40 questions in `supabase/questions/coffee-is-life.json`,
  wired into `CATEGORY_KEYS`/`CATEGORY_LABELS` and `lib/rank.ts`'s
  `CATEGORIES`, delivered via `supabase/migrations/0012_coffee_is_life.sql`
  and applied to both the local stack and the cloud project
  (`niznfbabmixesfvxlypi`) — verified live with a per-category count query.
  The bank is now 280 questions; `npm test` (742 passed) and the validator
  both stay green.
  **The podium ceremony got its eye candy** (2026-09-15): additive place
  glows and a breathing winner's halo, a gradient spotlight cone with two
  slowly sweeping shafts, a sparkle swarm, a landing ring and flare per block,
  and a reflection below the horizon — all sprites on three baked textures,
  no filters, gated by three new `VfxAllowance` fields. Confetti became
  sprites on one shared texture. Textures, pools and the ceremony audio are
  now **warmed during the final round** on the `final-question` cue, and
  never required — see [ADR-0058](../ADR/0058-the-ceremony-is-warmed-never-required.md),
  which also records the headed measurement (zero errors, ≤1 dropped frame
  through the ceremony, board beat at the old renderer's baseline).
  `npm test` is at 765.
- **Deployment (verified 2026-09-04, not assumed):** the app has been live on
  Vercel since **2026-08-25**, deployed from GitHub (`iamreneboy/quiz-game`) via
  the Git integration — there is no `.vercel` directory locally and no Vercel CLI
  installed, which is why earlier passes of this file wrongly read as "never
  deployed". 31 production deployments; the three most recent all report
  `success`; the newest (`6246422213`, 2026-09-03T14:49:10Z) is at `82a7fbe`,
  which **is current `main` HEAD** — production is not behind the repo.

  **The production URL is `https://quiz-game-tau-pearl.vercel.app`** — public, no
  login, verified serving this app. Do not substitute a guessed hostname: the
  URLs in the GitHub deployment records are *generated deployment URLs* and are
  gated by design, and both `quiz-game.vercel.app` and `circuit-break.vercel.app`
  belong to unrelated projects. Recover it with
  `gh api repos/iamreneboy/quiz-game --jq .homepage`; see the Tech debt note.

  The cloud Supabase project `niznfbabmixesfvxlypi` is **active, not paused**:
  its REST API answers in ~50ms and `rooms`, `players` and `questions` all
  return 200. The deployed bundle points at it. Both the "paused project" and
  "never deployed" blockers previously recorded here were false.
- **Next:** v1. No M3 phase is active; see the roadmap spec for what comes after.
  The remaining launch work is the four P5b measurements below. **None of them
  are infrastructure-blocked any more** — they need a human, a phone, and a
  stopwatch against `https://quiz-game-tau-pearl.vercel.app`.

## Active task

None.

## Notes

Cross-phase design/architecture rationale that used to accumulate here now
lives in the ADR each note already cited — this section keeps only what has
no other home: environment setup, testing-harness gotchas, and live
operational reference. If you're looking for *why* a decision was made (the
AnimatePresence replay trap, cue-bus catch-up, wire-opening rules,
`total_rounds` mutability, `is_playing`'s three meanings, etc.), it's in
`docs/ADR/` — every ADR's Consequences section already states the rule future
work must respect, in more precise form than this file used to.

- **Local Supabase runs on shifted ports and the shift is not in git.** Windows/Hyper-V has reserved TCP 54024–54423, which covers every default Supabase port, so `.env.local` (gitignored) points at 553xx instead while `supabase/config.toml` was deliberately left at defaults. The running stack matches `.env.local`, so it works as-is — but **do not run `supabase stop` or `supabase start`**, because a restart will bind the reserved defaults, fail, and lose the working stack. **This also applies to every fresh git worktree, not just a fresh machine**: `.env.local` is gitignored, so `git worktree add` does not copy it — it must be copied by hand from the main checkout and its port corrected before `npm run dev` can reach the database. Note that `supabase status` prints config.toml's defaults (54321), not the live bindings — don't trust it for ports on this machine.
- **A cloud Supabase project is linked and ready: `niznfbabmixesfvxlypi` (free tier, ap-northeast-1).** Schema is current through migration `0012` (see the coffee-is-life note above). To use it — the only way phones/TVs can join, since the local stack binds 127.0.0.1 — swap the commented cloud block into `.env.local` (gitignored) and restart `npm run dev`. Remote SQL goes through `npx -y supabase@latest db query --linked --file <path>`: the API roles have no table grants (everything is SECURITY DEFINER RPCs), so REST cannot touch tables directly. Note that `supabase migration list --linked` understates what's applied — that path doesn't write the migration history table — so trust the schema, not that column. Free tier pauses the project after ~1 week idle; restore it from the dashboard before a demo (confirmed active, not paused, as of 2026-09-04 — see Deployment above).
- **Deployed on Vercel (Hobby tier): <https://quiz-game-tau-pearl.vercel.app/>** — every push to `main` auto-deploys. The two `NEXT_PUBLIC_SUPABASE_*` vars live only in the Vercel dashboard (Settings → Environment Variables — URL as Config, anon key as Secret) and are inlined at build time, so changing them needs a Redeploy, not just a save (`lib/supabaseClient.ts` evaluates `createClient` at module scope, so a missing var fails the *build*, not the page). Before a demo: confirm the Supabase project isn't paused first — that's the only thing that breaks the deployed site, Vercel keeps serving regardless.
- **Headless Chromium cannot be used to measure frame budget.** It falls back to SwiftShader, idles around 16fps with `dropped 75/76`, and pins the VFX budget at `minimal` before a test starts. CDP CPU throttling is also the wrong instrument — the render loop is GPU-bound. Headed browser plus a synthetic main-thread block is the combination that works.
- **`npm run test:e2e` can fail reproducibly at `--workers=2` on Pixi-heavy specs — use `--workers=1`.** Two concurrent Pixi/WebGL contexts is more than this machine can sustain under load; the failures cluster around timeouts or sub-pixel layout assertions on animated elements (`answer-option` enabling, options-grid position mid-transition) and clear up when the same spec is re-run alone or at `--workers=1`. `playwright.config.ts` is untouched — if this recurs, that file's `workers` setting is where to look, not the tests themselves. Treat any assertion about an animated element's position, size, stability or attachment on a Pixi-heavy spec as flake-suspect under load, but re-run in isolation before concluding it's a regression.
- **`npx supabase db query` cannot apply a migration to this machine's local stack — use `docker exec … psql`.** With no flags the CLI dials `config.toml`'s default `54322` and gets `ECONNREFUSED` (the stack is on the shifted `553xx` ports); with an explicit `--db-url` it fails on TLS or on `cannot insert multiple commands into a prepared statement` (it sends the whole file as one prepared statement, and no multi-statement migration in this repo survives that). What works: `docker exec -i supabase_db_quiz-game psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/<file>.sql`. **Then reload PostgREST's cache** — `docker exec supabase_db_quiz-game psql -U postgres -d postgres -c "notify pgrst, 'reload schema';"` — or every call to a brand-new RPC answers `Could not find the function … in the schema cache`, which looks exactly like a migration that didn't apply. The `--linked` cloud path is unaffected.
- **A fresh worktree needs `supabase/.temp/` copied in by hand as well as `.env.local`.** Both are gitignored. Without `.temp/`, `npx supabase db query --linked` answers `Cannot find project ref. Have you run supabase link?` and cannot reach the cloud project at all. Also: do NOT junction `node_modules` from the main checkout into a worktree — Turbopack refuses it outright (`Symlink [project]/node_modules is invalid, it points out of the filesystem root`) and `next dev` will not start. Run `npm install` in the worktree; it takes about 15 seconds with a warm cache.
- **The redesigned backdrop is verified live through the real renderer, not just the Canvas2D mockups in `docs/background-redesign/`** (2026-09-03): a throwaway Playwright spec swept all 12 rounds across the player-track, stage and `reduced` passes with zero console errors and no dropped frames. The instrument is worth reusing for any future "does the world still look right" question: drive the host exactly as `scripts/soak.mjs` does (MC host reads the key via `get_room_draw`, `advance_phase` + `channel.send` per beat) to keep the browser at exactly **one** Pixi/WebGL context — this machine cannot sustain two. Two harness traps: the stage view is opaque behind `StageGate` until tapped (`getByTestId('stage-gate').click()` first), and **`next dev` dies with `Jest worker encountered 2 child process exceptions` after ~3 back-to-back headed Pixi runs** — restart the dev server between long sweeps. What the sweep found about the design itself is in [ADR-0056](../ADR/0056-backdrop-depth-is-value-not-detail.md).
- **A harness that only ever runs against the local Supabase stack can encode ~0ms latency and a ~0ms clock offset as silent assumptions.** The first cloud run of `scripts/soak.mjs` (2026-09-04) failed twice, both times in the harness rather than the product, and both failures were structurally invisible at ~1ms RTT:
  1. **`submit_answer: too late`.** The loop slept until `ends_at` and *then* submitted, leaving only `submit_answer`'s 300ms grace (`supabase/migrations/0002_rpcs.sql:322`) to cover the round trip. At ~1ms that grace is enormous; at the cloud project's ~100ms RTT, ten concurrent calls overran it. Fixed by submitting **during** the answer window, before the wait — which is also what a player actually does. Standings are unaffected: the Fairness Law sorts on `correct` before `speed_points`, and the staircase gives every racer a distinct correct-count, so speed is never reached as a tiebreak.
  2. **`worst clock drift 884ms`** against a 250ms budget. The assertion measured `|Date.now() - server_now|` — but that is precisely the quantity `lib/serverTime.ts` **cancels**: `noteServerTime` sets `offsetMs = server_now - Date.now()` on every phase event and `msUntil` renders against it. The raw gap is this machine's clock skew (a few hundred ms off UTC) plus one-way latency, and a player sees neither. What survives the correction is the *variation* in that offset, so the assertion now holds the **spread** to 250ms. The two runs together are the evidence the metric was wrong and the app was always fine: local raw offset `-16..-3ms` vs cloud `853..887ms`, but spread 13ms and 34ms respectively.

  General rule: before trusting a local-only harness as a measurement, ask which of its assertions would change value if the network were slow or the clock were off. Anything that would is measuring the harness, not the system. **Worth watching:** the cloud run's wall clock was 256.2s against the stall assertion's 267s ceiling (207s nominal + 60s slack) — passing, but the slack is doing real work, and a slower link could trip it for reasons unrelated to a stall.

## Tech debt / known issues

- ~~**A reload on a phase boundary can sit on stale staging until the next phase event**~~ and ~~**the player route hangs on "Connecting…" forever for an unknown or expired code**~~ — **both FIXED 2026-09-04, see [ADR-0057](../ADR/0057-room-state-lands-in-server-time-order.md).** One caution worth carrying: the first entry's recommended fix (re-fetch `get_room_state` after `SUBSCRIBED`) had been in `lib/useRoomChannel.ts` since `d885acb` — *three commits before M3 P2a observed the bug*. Re-fetching is necessary and was never sufficient; the ADR has what actually remained.

- **The results board's DOM entrance drops frames on the stage view, and did before the podium work.** Measured 2026-09-15 on the headed sweep described in [ADR-0058](../ADR/0058-the-ceremony-is-warmed-never-required.md): the canvas holds 0–1 dropped frames per 120-frame window through the whole podium sequence, then 4–5 in the windows covering `BOARD_AT` (6.0–7.5s), on the OLD renderer as well as the new one. That is the stage layout re-splitting plus `ResultsTable`'s row stagger, not Pixi. Not visible as a stutter at 144Hz on this machine. **Checked live on a real phone (2026-09-15): felt smooth, no stutter at the board's entrance.** Driven via a throwaway Playwright harness against production (`https://quiz-game-tau-pearl.vercel.app`) — host played a 1-question room, phone opened `/stage/<code>` directly. See the phone-check bullet below for what that same run surfaced about VFX.

- ~~**The sudden-death sting still reuses `final-sting`, and nobody has actually judged whether it should.**~~ **DECIDED and shipped 2026-09-15: sudden death gets its own sting.** `lib/audio/design.ts`'s `case 'sudden-death'` now returns `'sudden-death-sting'` (three klaxon hits on a tritone, A2/Eb3, settling into a rising unresolved tail) instead of reusing `final-sting`'s single settled landing — the placeholder had shipped in M3 P2a and was handed forward, unjudged, through M3-P2b and both P5 sub-phases. Added via the normal generated-audio workflow (ADR-0025): new entry in `scripts/audio/sounds.mjs`'s `STINGS`, `node scripts/audio/generate.mjs` regenerated `lib/audio/manifest.ts` and `public/audio/*` (PCM of every pre-existing sound verified byte-identical by decoding old vs new `final-sting.webm`; only container metadata differs, which is why every committed `.webm` shows as changed in the diff). `public/audio` is now 488K (was ~468K), one one-shot sting's worth over the figure ADR-0025 settled on. `tests/audioState.test.ts`'s sudden-death expectation updated to match; `npx vitest run` 765 passed, `tsc`/`lint` clean.

- **Four M3 P5b measurements need a second human or the cloud dashboard and were deferred rather than faked.** Every PRD §11 criterion already has a recorded local/automated measurement (see [`M3-P5b-launch-readiness.md`](M3-P5b-launch-readiness.md)'s scorecard); these four sharpen it further and were agreed with the user as follow-ups, not blockers:
  - **The screen-reader pass by hand** — Narrator or NVDA, walking the nine surfaces `docs/superpowers/plans/2026-08-30-m3-p5b-launch-readiness.md`'s Task 4 Step 3 lists, writing down what was actually heard.
  - ~~**The soak run against the cloud project**~~ — **DONE 2026-09-04, passed.** 10 players, 12 rounds against cloud `niznfbabmixesfvxlypi`: 50 phase broadcasts sent, all ten sockets received all 50 in identical order (no desync), server-time offset spread **34ms** against PRD §9's 250ms budget, wall clock 256.2s. **The cloud question bank is seeded** — `create_room` drew a full 12-round game, which settles the open question above; no seeding needed. The run needed two fixes to `scripts/soak.mjs` first, both harness defects rather than product ones, and both invisible against a local stack — see the note under Notes.
  - **The phone check** — a real mid-range phone against the deployed Vercel site (~~cloud Supabase restored~~ — already active): resolved profile, tap responsiveness, visible stutter. Use the production domain **https://quiz-game-tau-pearl.vercel.app** (see the deployment note above) — it is public, no login required. Not blocked.
    **Partially done 2026-09-15**, spectator/stage side only: opened `/stage/<code>` directly on a real phone during a live production round. **Resolved profile confirmed**: `lib/presentation/profile.ts`'s `coarsePointer && narrowViewport` rule catches essentially every phone regardless of actual GPU headroom, pinning it to `reduced` → `VfxLevel: minimal` with no runtime upgrade (ADR-0004). At `minimal`, confetti and sparkle are 0 (a static gold wash instead of the burst) and `ceremonyMotion` is false (halo doesn't breathe, spotlight doesn't sweep) — which is what read as "no confetti, players not glowing" on first look; the glow itself isn't 0, just dimmed to 0.35 and static. **Visible stutter: none** — the board's entrance (see the entry above) felt smooth. **Tap responsiveness is still unchecked** — this run used the phone as a read-only stage spectator, not a player tapping answers, so that part of the measurement remains open.
    **New, smaller finding from the same run:** `/stage/[code]` deliberately excludes `SettingsControl` ("read-only by composition"), so there is no way to manually override a phone-as-stage screen up to `high` even though this same phone showed zero dropped frames at `minimal` — meaning we don't actually know if it has headroom for more. Not filed as a defect, since the static-profile-plus-manual-override design (ADR-0004) is deliberate; it's an open question whether a phone acting as a TV/stage screen should be permanently locked out of full ceremony VFX or whether the override should be reachable there too. Undecided.
  - **The human timing run** — someone who hasn't been in this codebase, stopwatch, no instructions, landing page to a second device joined. The machine floor is measured (7.8s); the human number and where they hesitated is not. Use the production domain **https://quiz-game-tau-pearl.vercel.app** (see the deployment note above) — it is public, no login required. Not blocked.

- **NOT A DEFECT — Vercel deployment protection is configured correctly; an earlier version of this entry claimed otherwise and was wrong (resolved 2026-09-04).** Kept, rather than deleted, because the wrong conclusion is easy to reach a second time. The project's **production domain is `https://quiz-game-tau-pearl.vercel.app`**, verified public and unauthenticated: `/`, `/host/new` and `/room/TEST` all return 200, and the served `<title>Circuit Break</title>` matches `app/layout.tsx:22`. Protection is **Vercel Authentication + Standard Protection**, which is the correct setting for this project and needs no change.

  The trap that produced the false positive: every URL discoverable from the GitHub deployment record is a *generated deployment URL* (`quiz-game-<hash>-iamreneboys-projects.vercel.app`), and Standard Protection gates those **by design** — the Vercel API name for the scope is literally `prod_deployment_urls_and_all_previews`, and the docs state that enabling it means "the production generated deployment URL becomes restricted" while production *domains* stay public. Probing those URLs, seeing `302 → vercel.com/sso-api`, and concluding the site is unreachable is wrong.

  The production domain is also **not derivable by guessing the project name**: `quiz-game.vercel.app` and `circuit-break.vercel.app` both return 200 but are **other people's projects** (a create-react-app shell and a static Vite canvas game) — neither is this app, and either could be mistaken for it. Absent the Vercel CLI, the authoritative source is the GitHub repo's `homepage` field, which the Vercel integration keeps current:

  ```
  gh api repos/iamreneboy/quiz-game --jq .homepage
  ```

- **Cloud env vars confirmed from the deployed artifact (2026-09-04).** The production bundle served at `/host/new` contains `https://niznfbabmixesfvxlypi.supabase.co`, so `NEXT_PUBLIC_SUPABASE_URL` on Vercel points at the cloud project rather than a localhost stack. Verified by scanning the served `_next/static` chunks, not by trusting the dashboard.

## Intentionally skipped

None open.
