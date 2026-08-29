# M3 P1 — The draw

- **Status:** Complete. All local gates green, final whole-branch review's fix wave applied and re-reviewed clean, migration 0006 applied to the cloud project and re-verified live (see "Live-verification findings" below).
- **Completed:** 2026-08-29
- **Spec:** `docs/superpowers/specs/2026-08-29-m3-host-power-polish-roadmap.md` (§3 "P1 — The draw")
- **Plan:** `docs/superpowers/plans/2026-08-29-m3-p1-the-draw.md`
- **Branch:** `worktree-m3-p1-the-draw` — isolated git worktree at `.claude/worktrees/m3-p1-the-draw`
- **Method:** `superpowers:executing-plans`, TDD per task, Playwright verification against the real local Supabase stack

## Scope (from the plan)

Split `create_room` so the draw it produces is inspectable and editable between
room creation and `start_game`: a host reviews all N drawn questions with
category, tier and fun-fact, can swap any one for another of the same tier and
category pool, can add their own question that is merged into the draw, and
opens the lobby only when satisfied. The wizard grows a review step between
`/host/new` and the lobby. A reserve (tier-4) sudden-death question is drawn
alongside the main draw and held out of it entirely. Two decisions the roadmap
flagged but left to this phase: the playing-host answer-visibility conflict,
and where a custom question is stored.

## What was built

8 tasks, executed sequentially with a test/typecheck/lint pass after each and
a commit per task:

| # | Task | Key files |
|---|---|---|
| 1 | Migration 0006 — the storage fork, the room's draw memory and the sudden-death reserve | `supabase/migrations/0006_the_draw.sql`, `docs/ADR/0039`, `docs/ADR/0041` |
| 2 | `get_room_draw`, with the answers bound to whether the host races | `supabase/migrations/0006_the_draw.sql` (`host_sees_answers`, `draw_public`, `get_room_draw`), `scripts/smoke.mjs`, `docs/ADR/0040` |
| 3 | `swap_question` and `remove_question` — the two halves of veto | `supabase/migrations/0006_the_draw.sql`, `scripts/smoke.mjs` |
| 4 | `add_custom_question`, placed at the end of its own tier block | `supabase/migrations/0006_the_draw.sql`, `scripts/smoke.mjs` |
| 5 | The draw's pure layer — draft validation, the QR path, the origin store | `lib/draw.ts`, `lib/qr.ts`, `lib/types.ts`, `lib/useOrigin.ts`, `tests/draw.test.ts`, `tests/qr.test.ts` |
| 6 | The join QR on the lobby, and the host's way back to the draw | `components/LobbyView.tsx`, `components/host/JoinQr.tsx` |
| 7 | The review step between the wizard and the lobby | `app/host/[code]/review/page.tsx`, `app/host/new/page.tsx`, `components/host/CustomQuestionForm.tsx`, `components/host/DrawCard.tsx` |
| 8 | Playwright coverage of the draw, the regression floor, and the record | `e2e/host-draw.spec.ts`, this file, `docs/progress/CURRENT.md` |

Unit suite went 495 (P0's ending count) → 521. Three ADRs:
[0039](../ADR/0039-custom-questions-live-in-the-bank-table.md) (the storage
fork — custom questions live in `questions` behind a nullable `room_id`, not a
separate table), [0040](../ADR/0040-the-draw-review-is-role-bound.md) (the
playing-host conflict — one review step for everyone, whose contents the
server derives from `is_playing`) and
[0041](../ADR/0041-the-sudden-death-reserve-is-drawn-at-room-creation.md) (the
sudden-death reserve is drawn at `create_room`, category-preferring, and never
returned to any client).

## Deviations from this plan

1. **`e2e/host-draw.spec.ts`'s custom-question form fill needed `exact: true`
   on four locators, not bare `getByLabel`.** `CustomQuestionForm` labels each
   option textbox `aria-label="Option A"` and its sibling correctness radio
   `aria-label="Option A is correct"` — both sensible, distinct accessible
   names. Playwright's `getByLabel` substring-matches by default, so
   `getByLabel('Option A')` resolved to both elements and failed as a strict-mode
   violation, deterministically, not as a load flake. Fixed by adding
   `{ exact: true }` to the four option-textbox locators in the spec; the
   component (already committed in Task 7) was not touched. Same shape as
   M3-P0's Task 8 deviation 2: a test-authoring fix, not a product bug.
2. **The full `test:e2e` run's pre-existing-test baseline was 28, not the
   plan's assumed 21.** Task 7 had already added lines to five pre-existing
   spec files (`game-flow`, `host-control`, `stage`, `staging`, `world`) to
   route them through the new review step, and P0's own Task 8 had already
   left the suite at 28 (see `M3-P0-host-authority.md`'s verification table).
   `npm run test:e2e -- --workers=2` therefore reports 31 passed
   (28 pre-existing + 3 new), not the plan's 24 — the arithmetic in the plan
   was stale, not the count.
3. **Step 4 (cloud migration apply and cloud re-verification) and Step 8
   (committing the plan file and pushing) were out of scope for this
   dispatch**, per explicit instruction from the controlling session — both
   touch shared, external state (the live cloud Supabase project; the shared
   git remote) and were handled separately, after explicit human
   confirmation, by the controlling session itself. See "Live-verification
   findings" below.
4. **The final whole-branch review (opus, range `63ba396..2982aab`) found two
   Important, plan-inherited bugs in `app/host/[code]/review/page.tsx`**: a
   single `error` state served both the fatal mount-time load failure and
   every non-fatal mutation failure (a failed swap destroyed the whole page
   instead of rendering inline), and a synchronous `typeof window ===
   'undefined' ? null : loadSession(code)` gated the top-level render branch,
   causing an SSR/hydration mismatch for every host. Both were fixed in a
   consolidated fix wave (commit `20b1a17`), independently re-reviewed and
   verdicted ADDRESSED with no new breakage. The straightforward fix for the
   second bug — snapshotting the whole session object through
   `useSyncExternalStore` — turned out to violate the hook's
   reference-stability contract (`loadSession` re-parses JSON every call) and
   produced a genuine infinite render loop, caught live by
   `e2e/host-draw.spec.ts`; the corrected fix mirrors `app/room/[code]/page.tsx`'s
   existing primitive-boolean-snapshot pattern instead. Five bundled Minor
   findings were fixed in the same wave (dead-code `tierCounts` wired in, an
   ADR-0041 consequence note, a pluralization fix, three added
   `scripts/smoke.mjs` redaction assertions, and an `aria-live` re-announce
   fix); three further Minor findings were parked with a ruling as low-risk
   or already-adequately-handled. See
   `.superpowers/sdd/2026-08-29-m3-p1-the-draw/progress.md` for the full
   findings list and every ruling's reasoning.

## Verification

All local gates green on the final tree:

| Command | Result |
|---|---|
| `npm test` | 521 passed (40 files) |
| `npx tsc --noEmit` | silent |
| `npm run lint` | zero problems |
| `node scripts/smoke.mjs` | `✅ lobby smoke passed`, `✅ game-flow smoke passed`, `✅ P0 host-authority smoke passed`, `✅ P1 draw-review smoke passed` |
| `npm run build` | compiled clean, `TypeScript` pass clean, all routes generated |
| `npm run test:e2e -- --workers=2 e2e/host-draw.spec.ts` | 3 passed |
| `npm run test:e2e -- --workers=2` (full suite) | 31 passed (28 pre-existing + 3 new) |

The full suite's first run hit the pre-existing, documented load flake in
`docs/progress/CURRENT.md`: `e2e/stage.spec.ts`'s "follows a live game"
failed clicking `answer-option` with "element is not stable" / "element was
detached from the DOM" — the click racing the READ→ANSWER mount animation.
An immediate re-run of the full suite passed clean at 31/31, confirming the
flake rather than a regression; no product code was touched to work around it.

## Live-verification findings

Step 4 was completed by the controlling session after explicit human
confirmation:

- Linked this worktree to the cloud project (`supabase link --project-ref
  niznfbabmixesfvxlypi`) and checked `supabase migration list --linked`
  first. **Finding: migration `0005_host_authority.sql` (M3 P0) had also
  never been applied to this cloud project** — a pre-existing gap unrelated
  to this phase, out of scope to fix here. Confirmed `0006_the_draw.sql`
  does not depend on any column or function `0005` introduces (no shared
  identifiers), so applying `0006` alone was safe.
- Applied `0006_the_draw.sql` via `supabase db query --linked --file` (the
  project doesn't use CLI-tracked migration history; this project was
  already on that convention before this phase). Verified all seven new
  routines exist in `information_schema.routines`
  (`create_room`, `get_room_draw`, `swap_question`, `remove_question`,
  `add_custom_question`, `draw_public`, `host_sees_answers`), and that the
  cloud project's `questions` bank seed matches the local stack's exactly
  (2 rows per category per tier, all four categories).
- Repeated Task 7 Step 7's items 1–5 against the cloud stack by re-pointing
  `.env.local` at it and running `npm run test:e2e -- --workers=2
  e2e/host-draw.spec.ts` (the automated equivalent, per the standing ruling
  that substitutes e2e coverage for a manual headed-browser walkthrough
  where the two overlap) — **3/3 passed live against the cloud project**,
  covering redaction for a racing host, full visibility for an MC-only host,
  and the swap/add/remove mutations.
- Restored `.env.local` to the local block immediately after, and confirmed
  `node scripts/smoke.mjs` still passes clean against the local stack.
- **Not verified**: the physical phone QR scan, which needs a human with a
  camera and remains the one manual-only item this session cannot perform.

## Decisions this phase resolved

The M3 roadmap named two decisions and explicitly declined to settle either
one in advance, assigning them to a spec that was never written:

- **The playing-host conflict, resolved as role-bound redaction**
  (ADR-0040). One review step exists for every host; its contents differ by
  whether the host is racing. `host_sees_answers(room_id)` reads the host's
  own `players` row, and `draw_public(room_id, with_answers)` builds a
  genuinely different `jsonb` object per case — for a racing host,
  `correct_index` and `fun_fact` are absent keys, not null values. Every draw
  RPC (`get_room_draw`, `swap_question`, `add_custom_question`,
  `remove_question`) returns that same projection through the same helper.
  **`is_playing` is now load-bearing and must stay immutable** — it is set
  once in `join_room` and nothing in the schema can change it; any future
  "switch to MC" control must be one-way into *playing*, never back out of it.
- **The custom-question storage fork, resolved as one table** (ADR-0039).
  Custom questions are `questions` rows behind a nullable `room_id`, not a
  separate table — `question_public`, `build_reveal`, `standings` and the
  streak functions all stay untouched because a custom question joins by id
  like any other. The row cascades away with its room on delete, for free.
  **Every future query that draws from the bank must carry
  `and room_id is null`.** Four do today, all in
  `supabase/migrations/0006_the_draw.sql`: `create_room`'s availability count,
  `create_room`'s draw, the reserve draw, and `swap_question`'s replacement
  draw. A fifth that forgets would leak one room's private question into
  another room's game.

## Notes for phases that inherit this work

- **P2 inherits `rooms.reserve_question_id`.** It is drawn at `create_room`,
  category-preferring, from the whole tier-4 bank (ADR-0041), and is never
  returned to any client — not in the review step, not in `get_room_state`,
  not in `phase_event`. **A room created before migration 0006 has
  `reserve_question_id = null`.** P2 must treat a null reserve as "sudden
  death is unavailable, the tie stands and the position is shared" — the same
  rule PRD §6 already gives for lower places.
- **P4 must revisit two `scripts/smoke.mjs` assertions** that depend on the
  seed holding exactly two tier-1 `fuel` questions: the swap-exhaustion check
  (around line 320, comment: "'fuel' tier 1 holds exactly 2 seeded
  questions; a room that takes both has...") and the ADR-0039 bank-isolation
  check (around line 410, comment: "'fuel' tier 1 holds exactly 2 seeded
  questions, and the custom one above is a third fuel tier-1 row"). Both are
  commented in place in `scripts/smoke.mjs` and will need new counts, or a
  different category, once P4's seed work changes how many tier-1 `fuel`
  questions exist.
