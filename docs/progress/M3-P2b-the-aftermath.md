# M3 P2b — The aftermath

- **Status:** Complete. All local gates green; `0008_the_aftermath.sql` applied to the cloud project and verified there by direct query.
- **Completed:** 2026-08-30
- **Spec:** `docs/superpowers/specs/2026-08-29-m3-host-power-polish-roadmap.md` (§3 "P2 — The finish")
- **Plan:** `docs/superpowers/plans/2026-08-30-m3-p2b-the-aftermath.md`
- **Branch:** `worktree-m3-p2b-the-aftermath` — isolated git worktree at `../quiz-game-m3-p2b`
- **Method:** `superpowers:executing-plans`, inline (no subagents, at the user's standing instruction), TDD per task, verified against the real local Supabase stack

## Scope (from the plan)

Finish PRD §5.4 — the two bullets P2a left behind. **Awards** (§5.4.4): four
of them, projected from the finished race and staged as the ceremony's coda.
**Rematch** (§5.4.6): the same room reset in place, with the same players, the
same code, and no repeated questions.

## What was built

**Task 1 — the awards projection.** `supabase/migrations/0008_the_aftermath.sql`
opens with three functions. `award_winners(standings, key, field)` turns one
integer field of a standings array into one award, returning NULL rather than a
zero-valued award when the best score is 0 — "most correct" in a race nobody
scored in is not a fact about a player. `late_surge(...)` reconstructs the
midpoint placings by asking `standings()` for the midpoint round and comparing
each racer's midpoint rank against their rank in `final_standings`, which is the
right final side because a sudden-death winner has been lifted to the head
(ADR-0043). `awards(room_id)` composes them in PRD §5.4.4 order, bounded by
`scoring_round(room_id, current_round)` — P2a's standing obligation, and the one
thing that stops a tiebreak answer counting toward Fastest Gun. Nothing in the
file writes; `awards` is `stable` and host-agnostic on purpose, because a TV
holds no key and the projection discloses nothing a client's own `standings`
does not already carry.

**Task 2 — the beat and the shape the card reads.** `lib/types.ts` gains
`AwardKey`/`AwardWinner`/`Award`; `lib/awards.ts` holds the fixed order, the
per-award copy, `awardValueText` (each award quoted in its own unit, with the
singular case spelled out rather than suffixed "(s)") and `describeAwards`, the
validate-and-order seam that drops unknown keys instead of rendering them in an
arbitrary position. `lib/ceremony/beats.ts` gains `AWARDS_AT = 7200` and
`CeremonySteps.awards`. `PHOTO_MS + AWARDS_AT` is 10600 against a flat
`CEREMONY_MS` of 12400, so **neither `CEREMONY_MS` nor migration 0007's
`ceremony_ms()` moved** — the beat is spent entirely out of the settled tail
ADR-0044 left behind, and `tests/ceremonyBeats.test.ts` pins the inequality.

**Task 3 — the awards on screen.** `lib/useAwards.ts` is the one fetch, keyed on
`status === 'finished'` so a single code path serves the live ceremony and a
reload. `components/AwardsCard.tsx` renders them on both surfaces with no
surface variant at all — every size resolves through a theme variable
`[data-surface="stage"]` overrides (ADR-0035). Staged the way the board is
(ADR-0030): unconditionally rendered, `opacity` as a `motion` variant target and
never as a Tailwind class (ADR-0017), with a third mount-time one-shot
(`awardsSettled`) on each surface against this card's own threshold.

**Task 4 — rematch, server-side.** `rooms.used_question_ids uuid[]` is the
room's memory, appended from `room_questions` immediately before that table is
cleared — which records a spent tiebreak for free and correctly does not record
an unspent reserve. `rematch(...)` validates the host key, refuses a room that
has not finished, defaults each config parameter to the race just played (tier
counts from the histogram of the previous draw, with the tiebreak round excluded
so it cannot inflate the next race), destroys `answers`/`room_questions`/the
room's custom questions, redraws with `not (id = any(used))`, draws a fresh
reserve, clears all three `sudden_death_*` columns, and returns a `phase_event`
for a room back in the lobby.

**Task 5 — the room comes back to life.** A `game-reset` cue, `tier: 'routine'`,
derived in `deriveCues` on any transition into `lobby` from a non-lobby phase,
which clears the standings baseline in the same step. The director returns to
the lobby shot and zeroes escalation (which `phase-results` deliberately
preserved); the audio bed returns to `lobby` and the machine is cleaned of
buffered drama and a stale pause; `lib/world/runtime.ts` hard-completes the
choreographer; `applyPhaseEvent` gains a `lobby` arm that unwinds the whole
previous race. See ADR-0047.

**Task 6 — the rematch card.** `HostDriver.rematch(timerSeconds?)` shares the
existing `commanding` ref but is not routed through the `command` helper, which
exists precisely because the four control-strip RPCs share one signature.
`components/RematchCard.tsx` is a two-step confirm carrying the one tweak the
review step cannot reach — the answer timer — and sits outside every staged
wrapper, because staging never gates input (ADR-0016).

## Deviations from the plan

Six, all found by running the plan's own verification steps.

1. **The awards smoke scenario could not produce the awards it asserted.** The
   plan built a three-racer race on the premise that Gun could take Fastest Gun
   with one fast answer while Brain took Big Brain with two. But `speed_points`
   is a **SUM over a racer's correct answers** (`0002_rpcs.sql:45`), not a
   per-question best, so two correct answers beat one almost regardless of
   speed — the harness failed with `actual: ['Brain'], expected: ['Gun']`. The
   assertions are the specification of correct behaviour and were kept
   byte-for-byte; the scenario was rebuilt around the real rule: a 6s timer,
   Brain answering both rounds late (~40 points each) and Gun answering one
   instantly (~99), with Surge slower still in round 1 so the midpoint order is
   Brain/Surge/Gun and the climb belongs to Gun alone.
2. **The custom-question rematch fixture asked for questions the seed does not
   hold.** The bank has exactly two rows per (category, tier). A one-category
   room that plays one bank question plus one custom question has a histogram of
   two tier-1 questions and only one unused tier-1 row left, so the rematch
   correctly raised `not enough unused questions in tier 1`. The fixture now
   uses two categories; both of its assertions are unchanged. This is not a bug
   in `rematch` — it is `rematch` refusing to repeat, which ADR-0046 records as
   the intended behaviour.
3. **`lib/useAwards.ts` was reshaped to satisfy this project's lint.** The
   plan's hook reset with `setAwards(null)` in the effect body, which is a
   synchronous setState inside an effect and a hard error under
   `react-hooks/set-state-in-effect`. CURRENT.md is explicit that there is no
   pre-existing lint error to discount. The result is now stamped with the room
   it belongs to and compared at render, which removes the reset entirely rather
   than suppressing the rule.
4. **A director test asserted a premise the director does not hold.** The plan's
   test fed `phase-read(round 3, isFinal: true)` and expected `escalation === 1`,
   but that arm **deliberately preserves** escalation — `final-question` is the
   cue that sets it (`lib/world/director.ts:141` and `:150`). The implementation
   was correct; the test now feeds the real run-up sequence. Recorded in
   ADR-0047 because it is exactly the kind of thing a future reader will re-derive
   wrongly.
5. **The awards e2e was flaky by construction and was made deterministic.** The
   plan's own comment noticed that "click the first option" may be wrong and then
   did not handle it. The seed spreads `correct_index` across all four options,
   so the test scored about a third of the time — and a race nobody scored in
   hands out **nothing**, so the awards card renders null and the assertion fails
   with "element(s) not found". Confirmed by two consecutive failing runs. The
   test now fields four racers who between them pick all four options, which
   makes exactly one answer correct: awards are guaranteed non-empty, every one
   of them has the same single winner, and no tie (and therefore no tiebreak)
   can occur. It also now asserts the tie copy is absent, which the single-winner
   shape makes meaningful.
6. **Migrations were applied with `docker exec … psql`, not `npx supabase db
   query`.** The plan and CURRENT.md both say to use the CLI. On this machine it
   cannot reach the local stack: with no flags it dials the config.toml default
   `54322` and gets `ECONNREFUSED`, and with an explicit `--db-url` at the real
   port it fails first on TLS and then, with `sslmode=disable`, on `cannot insert
   multiple commands into a prepared statement` — it sends the file as one
   prepared statement, which no multi-statement migration in this repo can
   survive. See the new CURRENT.md note.

## Verification

| Gate | Result |
|---|---|
| `npx vitest run` | **588 passed**, 42 files (from 568 at the start of the phase) |
| `npx tsc --noEmit` | silent |
| `npm run lint` | zero problems |
| `node scripts/smoke.mjs` | every `✅`, including `P2b awards` and `P2b rematch` |
| `npm run build` | clean, all 6 routes |
| `npm run test:e2e -- --workers=1` | **36 passed**, whole suite, both new aftermath specs included |
| `npm run test:e2e -- --workers=2` | 33 passed, 3 failed — see below |
| Migration idempotency | `0008_the_aftermath.sql` applied twice after Task 1 and twice after Task 4; every re-apply clean (`used_question_ids` skipped with a notice), the smoke harness green end to end after each |
| Cloud schema | `awards`, `award_winners`, `late_surge`, `rematch` all present; `rooms.used_question_ids` present |

**On the three `--workers=2` failures.** `e2e/game-flow.spec.ts`,
`e2e/stage.spec.ts` and `e2e/tiebreak.spec.ts:133` failed reproducibly — twice
in a row, on timeouts waiting for `answer-option` to become enabled. This is
**not a P2b regression, and it was verified rather than assumed**: the identical
three specs fail the identical way when run from the untouched `main` checkout
at `60cb163`, which contains none of this phase's code. Each also passes alone
at `--workers=1`, and the full 36-spec suite passes at `--workers=1`. The
machine can no longer sustain two concurrent Pixi/WebGL contexts; CURRENT.md's
existing entry has been updated from "flaky at the default worker count" to
"reproducibly failing at `--workers=2`".

## Live-verification findings

Headed browser throughout, per CURRENT.md — headless Chromium falls back to
SwiftShader and is unusable for timing work.

- **The awards beat lands exactly where the constant says.** Polling
  `[data-testid=awards]`'s `data-entered` every 400ms from the moment the
  results screen mounted: `false` through 6552ms, `true` at 7362ms. `AWARDS_AT`
  is 7200 and the sample interval brackets it. The card is genuinely absent
  before its beat, not merely transparent.
- **The card names the right racers on all three surfaces.** A one-round race
  read `"Awards 🧠 Big Brain … Joiner 1 correct ⚡ Fastest Gun … Joiner 93 speed
  points 🔥 Hot Streak … Joiner 1 in a row"`, byte-identical on the player
  device and the stage, and present on the host. Late Surge was correctly
  absent: one round has no halves.
- **A reload during the settled tail replays nothing.** `data-entered` read
  `"true"` immediately on mount after reload, with computed `opacity: 1` — never
  observed transitioning from `false`. The fourth guise of the replay trap
  CURRENT.md tracks does not appear here.
- **A rematch moves both screens, and the last race leaves the DOM.** Two
  contexts: host pressed Rematch, moved the timer to 15s, confirmed. Both
  windows showed "Starting grid — 2 joined"; the joiner showed "Waiting for the
  host to start…"; the join gate did **not** come back (`0` nickname inputs), so
  no session was invalidated. `results-board` and `awards` both dropped to a
  count of `0` on the joiner — the previous race is gone, not merely covered.
- **The review step is live again and the draw is clean.** The host's "Review the
  draw" link opened, and the review page did not contain the previous race's
  prompt. Race 2 then started on a different question.
- **NOT verified live: the shared-award copy.** No tie occurred in any live run,
  and the deterministic e2e is built so that exactly one racer scores. The
  "shared · " string is covered by `tests/awards.test.ts` (tied winners survive
  `describeAwards` in server order) and by the server's `ORDINALITY`-ordered
  aggregate, but **it has never been rendered on a real screen**. Recorded as
  not-done, not as passing.
- **NOT verified live: the camera and the audio bed after a reset.** Neither the
  director's shot nor the audio bed is exposed to the DOM, so the live run could
  only confirm the absence of stuck ceremony chrome and a clean console. The
  transitions themselves are covered by `tests/director.test.ts` and
  `tests/audioState.test.ts`.
- **One pre-existing console error, not from this phase.** The host page logs a
  hydration mismatch on `<div className="relative z-10 pb-16">` versus
  `"relative z-10 "` — `isHost` is derived from a localStorage session, so the
  server render cannot know it. The expression is in `app/room/[code]/page.tsx`
  and predates P2b; this phase's only edit to that file passes `driver` into
  `ResultsView`.

## Exit criteria (roadmap §3, P2 — the two P2b owns)

| Criterion | Evidence |
|---|---|
| Four awards render correctly, including tied winners | `awards()` returns all four in PRD order with distinct winners (`P2b awards` smoke); ties are covered server-side by the `ORDINALITY`-ordered aggregate and client-side by `tests/awards.test.ts`; three of four rendered live on three surfaces. **The tie path was not exercised live** — see Live-verification findings. |
| Rematch returns the same players to a fresh lobby with zero repeated questions | `P2b rematch` smoke: same code, same two players, `standings` null, a draw whose prompt differs from race 1, race 2 starting everybody at zero, and an exhausted pool refusing rather than repeating. `e2e/aftermath.spec.ts` asserts the same across two browser contexts, including that the join gate never returns. |

The four criteria P2a discharged (photo finish, sudden death, the tiebreak's
reload correctness, the flat ceremony) are not re-litigated here.

## Decisions this phase resolved

- **[ADR-0045](../ADR/0045-awards-are-fetched-not-broadcast.md)** — Awards are
  fetched, not broadcast. The wire is not opened a fifth time.
- **[ADR-0046](../ADR/0046-a-rematch-is-the-same-room-reset.md)** — A rematch is
  the same room, reset in place, remembering what it has asked in
  `rooms.used_question_ids`.
- **[ADR-0047](../ADR/0047-returning-to-the-lobby-is-a-cue.md)** — Returning to
  the lobby is a cue, because three consumers hold forward-only state.

## Notes for phases that inherit this work

- **`total_rounds` is mutable BETWEEN games too, as of this phase.** That is the
  third trigger: M3 P0 made it mutable mid-game (skip), M3 P1 pre-game
  (add/remove), and `rematch` now rewrites it from the previous draw's histogram.
  Anything that snapshots it once is wrong.
- **`rooms.used_question_ids` grows without bound**, by roughly the round count
  per rematch. Nothing prunes it. M3 P3's 24-hour room purge is the natural place
  for that to stop mattering, and the array disappears with the row.
- **A rematch can legitimately refuse, and with the current seed it will.** The
  bank holds two questions per (category, tier), so a single-category room is
  exhausted after two races. That is `rematch` honouring "exclude ones already
  used" rather than a failure, and the error surfaces in `RematchCard`'s
  `rematch-error` region — but **M3 P4 (the bank) is what makes a third race
  possible at all**, and any playtest that plans on repeated rematches needs
  multiple categories selected.
- **The shared-award copy has never been seen on a real screen.** See
  Live-verification findings. A phase that stages a tie for any other reason
  should look at the awards card while it is there.
- **The sudden-death sting is STILL `final-sting` reused, and this phase did not
  judge it.** P2a explicitly handed the A/B judgement forward
  (`docs/progress/M3-P2a-the-tiebreak.md`, Live-verification findings). P2b
  touched no audio beyond `game-reset`'s bed change and formed no opinion on it.
  **Handed to M3 P5 — Polish & launch readiness.** Do not let it disappear.
- **`npx supabase db query` cannot apply a migration to this machine's local
  stack.** Use `docker exec -i supabase_db_quiz-game psql -U postgres -d postgres
  -v ON_ERROR_STOP=1 < <file>`, then
  `docker exec supabase_db_quiz-game psql -U postgres -d postgres -c "notify
  pgrst, 'reload schema';"` — without the notify, PostgREST answers a brand-new
  RPC with `Could not find the function … in the schema cache`. Full reasoning in
  the deviations above and in CURRENT.md.
