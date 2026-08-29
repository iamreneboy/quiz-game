# M3 — "Host Power & Polish" Roadmap Spec

| | |
|---|---|
| Status | Approved roadmap — each phase gets its own drill-down spec + plan |
| Parent | `docs/PRD.md` §12 Build Phase **M3**, v1.1 |
| Date | 2026-08-29 |
| Baseline | M2 complete: P0 foundation/design system, P1 track world, P2 avatars, P3a/P3b round staging + outcome, P4 audio, P5a/P5b ceremony + results board, P6a/P6b stage view + broadcast direction. 4 migrations, 36 ADRs, 429 unit tests, 8 Playwright specs, deployed on Vercel against cloud Supabase project `niznfbabmixesfvxlypi`. |

## 1. Purpose

M2 made the game a produced show. M3 makes it a product someone can actually
run for a department: the host gets real control over the content and the
broadcast, the endgame delivers everything the PRD promises, the game survives
the network, and the question bank reaches launch size.

M3 is the last milestone before v1. It is too large for one spec. This document
decomposes it into **six phases (P0–P5)**, each independently spec'd, planned
and implemented later using this roadmap as parent context. Each phase should
drill down into roughly 4–8 implementation tasks; if a phase's drill-down spec
grows past that, split the phase.

### 1.1 What is not built yet

Named so no phase rediscovers it:

| M3 item (PRD §12) | State at this roadmap's date |
|---|---|
| Question review / veto / swap | Not built — `create_room` draws blind; the host never sees the draw |
| Custom questions | Not built — no room-local question storage |
| Host control strip | Not built — the host has **no** controls after "Start the race"; `useHostDriver` is a pure timer |
| Sudden death | Not built — `advance_phase` goes `track → results` and ends |
| Awards | Not built |
| Photo finish (§5.4.1) | Not built — M2's P5 explicitly deferred it |
| Rematch | Not built |
| Bank to ≥240 | **48** seeded (6 categories × 2 per tier) |
| Accessibility pass | Partial (`aria-pressed`, keyboard operability, reduced motion) — never audited |
| Edge-case hardening (§9 table) | **Nothing.** No Supabase Presence anywhere in the codebase; `join_room` hard-rejects any join once `status <> 'lobby'`; no room purge |

Two items outside PRD §12's list that M3 also owns:

- **`qrcode` ^1.5.4 is a dependency and is never imported.** PRD §5.1 promises a
  QR at room creation.
- **`components/LobbyView.tsx` is the one screen the P0 design system never
  reached** — still on raw `slate`/`amber` literals rather than tokens.

## 2. Decisions fixed for all of M3

1. **M3 opens the backend — deliberately, but additively.** M2's decision 4
   ("presentation-only; no schema, RPC, or realtime-protocol changes") is
   *inverted*: nearly every M3 item needs new RPCs and several need schema. Two
   constraints replace it:
   - Migrations `0005+` follow the house style set by `0003_reveal_picks.sql`
     and `0004_ceremony.sql` — `create or replace function` over rewrites,
     additive columns with defaults, no destructive DDL — because a live cloud
     project holds real data behind a live Vercel deploy.
   - **The wire stays semantic** (PRD §3.6, §9). New realtime events describe
     game meaning (`GAME_PAUSED`, `SUDDEN_DEATH_STARTED`, `PLAYER_RECONNECTED`),
     never coordinates, sprite frames or renderer concepts. Every new payload
     field earns the justification ADR-0018 and ADR-0028 demanded of M2's two
     protocol openings.
2. **Host authority is server-enforced on every command.** Today `isHost` gates
   UI and `advance_phase` is the only host-key-checked mutation. M3 adds six or
   more mutating commands; each validates `host_key` inside the RPC. A
   client-side `isHost` check is presentation, never permission.
3. **Freeze-and-shift is the one pause model.** `pause_game` stores the
   remaining ms on the room and clears `phase_ends_at`; `resume_game` writes a
   fresh `phase_ends_at = now() + remaining`. ADR-0014's derivation is left
   untouched — a paused room simply has no live deadline, which every beat
   consumer already reads as settled/unknown. P3's host-drop auto-pause calls
   the identical path; that reuse is the whole reason P0 comes first.
   *Rejected:* a `paused_at` timestamp clients subtract (changes the derivation
   in staging, audio, ceremony, camera and stage at once, and puts a second
   time source on the wire); and pause-at-next-beat-boundary (cheap, but a host
   who needs to stop *now* waits a full answer timer, and it cannot serve an
   immediate host-drop auto-pause).
4. **The Fairness Law is presented, never amended.** Photo finish and sudden
   death are *stagings of* the existing lexicographic order, not new arithmetic.
   `standings`' sort clause stays byte-identical (ADR-0018 already binds this).
   Awards are read-only projections and can never feed back into rank.
5. **Accessibility is an acceptance criterion on every phase**, exactly as
   performance profiles were in M2. P5's audit checks work already done; it is
   not where accessibility gets done.
6. **The celebration hierarchy extends by exactly one rung.** Sudden death is
   staged above *final question* and below *victory* on P0's ordinal scale.
   Nothing else in M3 may claim a new rung.
7. **No new runtime dependencies without a written argument** — in the phase's
   spec, or in its plan where §6 says it writes no spec.
   `qrcode` is already installed and unused — that is the one to spend.

## 3. Phase roadmap

```
                   ┌─> P1 The draw ──> P2 The finish ─┐
P0 Host authority ─┤                                  │
                   └─> P3 Continuity ─────────────────┼─> P5 Polish & launch
                                                      │
P4 The bank ──────────────────────────────────────────┘
   (independent of everything; starts day one, merges before P5)
```

Every arrow is a hard dependency. P1→P2 and P3 are parallel-safe branches once
P0 merges. P4 touches no runtime code and may start immediately. P5 begins only
once all five have merged. Each phase leaves the game fully playable.

### P0 — Host authority & the control strip

The command substrate two different features need: the host control strip wants
pause deliberately, P3's host-drop handling needs it involuntarily.

**Scope**

- Migration `0005`: `'paused'` added to `rooms.status`, plus a
  `paused_remaining_ms` column. Putting it in the *status* enum rather than a
  side flag buys correct behaviour nearly free — `useHostDriver` already returns
  early on `status !== 'playing'` (stops scheduling) and `advance_phase` already
  raises on it (cannot advance).
- **`submit_answer` must gain a status guard.** It currently checks
  `phase = 'answer'` without consulting status, so a paused room mid-ANSWER
  would keep accepting answers. This is the one place the enum trick does not
  cover.
- RPCs: `pause_game`, `resume_game`, `skip_question`, `end_game`.
- `useHostDriver` promoted from a pure timer into a command layer, retaining the
  `advancing` ref that closed the intermittent `advance_phase` 400.
- The control strip: host-only, slim, over the player view (PRD §4's "host
  variant"), with a confirmation on end-game.
- The pause card on **all three** surfaces — player, host and stage. The stage
  view is read-only but must still show why the show stopped.
- `game-paused` / `game-resumed` cues for P4's audio state; the bed ducks.

**Decision the phase spec owns:** whether a skipped round shortens the track or
leaves an unreachable segment. Track length = question count, so skipping is not
free.

**Exit criteria:** host pauses mid-ANSWER and player, host and stage all freeze
at the same beat position; resume continues from exactly the frozen remainder
with no beat replay and no double-advance; answers are rejected while paused;
skip discards the current round and lands cleanly on the next; end-game reaches
the ceremony with correct standings; two-context Playwright coverage.

### P1 — The draw

Everything the host does to the content before the lights go up.

**Scope**

- `create_room` split so the draw is inspectable and editable between creation
  and `start_game`. New `get_room_draw(room_id, host_key)` returns the drawn
  questions **including correct answers** — host-only, before the game starts.
- `swap_question(room_id, host_key, round)` — redraw one round from the same
  tier and category pool, excluding everything already in the room. Veto is
  swap.
- `add_custom_question(...)` plus its placement in the draw. Custom questions
  live only in this room and die with it (PRD §7).
- **A reserve expert (tier 4) question, drawn alongside the main draw and held
  out of it.** P2's sudden death consumes it; drawing it here means
  `create_room`'s existing availability check validates it up front rather than
  P2 discovering an empty tier-4 pool at the worst possible moment. It is
  usually unused, and it is not shown in the review step (revealing the
  tiebreak question would defeat it).
- The QR (PRD §5.1 step 1), finally using the installed `qrcode`, on the lobby
  and the setup completion.
- The wizard grows a review step between `/host/new` and the lobby.

**Storage fork the phase spec owns:** a nullable `questions.room_id` collides
with `uq_questions_category_prompt` and pollutes the bank pool that
`create_room` selects from; a separate table breaks `room_questions.question_id`'s
foreign key. The lean is one table with `room_id uuid null references rooms(id)
on delete cascade`, the unique index narrowed to `where room_id is null`, and
`and room_id is null` added to the bank-draw queries — this keeps the FK and
leaves `question_public` and `build_reveal` untouched.

**⚠️ Conflict the phase spec MUST resolve — a playing host must not see correct
answers.** PRD §5.1 lets the host review the draw; PRD §4 lets the host also
play. Handing correct answers to a playing host breaks Design Pillar 2 ("clients
never receive the correct answer before the reveal") for the one client that
also races. Candidate resolutions: review is MC-only; review shows prompts and
options without marking the correct one; or an explicit gate on the "I'm playing
too" choice. Do not settle this by default.

**Exit criteria:** a host creates a room, sees all N drawn questions with
category, tier and fun-fact, swaps any of them, adds a custom question that
appears in play, and starts — under 3 minutes, unassisted (PRD G1, measured);
custom questions vanish with the room; a host who touches nothing still gets the
good default 12-question game; the QR scans to the join link on a real phone.

### P2 — The finish

Everything PRD §5.4 promises after the last question, slotted into the ceremony
beats M2's P5a built for exactly this.

**Scope**

- **Photo finish** (§5.4.1): when any place is tied on correct answers, a staged
  sequence resolving it on speed points, ahead of `BRONZE_AT` in
  `lib/ceremony/beats.ts`. This extends `CEREMONY_MS` — a **hand-maintained
  mirror** of migration `0004`'s 9-second results interval — so both move in
  lockstep or the ceremony truncates.
- **Sudden death** (§5.4.2): fires only on a perfect first-place tie (correct,
  speed points and longest streak all equal). Needs an expert question outside
  the drawn set, drawn as a **reserve at room creation** so availability is
  validated up front rather than discovered at the worst possible moment — that
  reserve is why this phase sits behind P1. First correct answer wins; lower
  places that remain perfectly tied share the position.
- **Awards** (§5.4.4): Big Brain, Fastest Gun, Hot Streak, Late Surge, as a pure
  `awards(room_id)` projection. Late Surge reconstructs from `answers` by
  comparing standings at the midpoint against the final.
- **Rematch** (§5.4.6): resets the room to lobby, keeps the players, redraws
  excluding used questions, and allows a tweaked config. It reuses the room
  **code**, so nobody re-joins — sessions are code-keyed.

**Exit criteria:** a deliberate tie plays the photo finish; a perfect
first-place tie resolves in sudden death; four awards render correctly including
tied winners; rematch returns the same players to a fresh lobby with zero
repeated questions; the ceremony still lands correctly on reload at every new
beat.

### P3 — Continuity

PRD §9's edge-case table in full. Supabase Presence enters the codebase here for
the first time — there is currently not one reference to it.

**Scope**

- Presence on the room channel; a dropped player's avatar shows "reconnecting".
- **Player drop:** 60s grace with score frozen, then spectator; rejoining with
  the same nickname reclaims the run. `join_room`'s existing `nickname taken`
  unique-violation is the natural hook.
- **Host drop:** auto-`pause_game` through P0's exact path, an on-screen notice,
  resume on reconnect, graceful end with current standings past 5 minutes.
- **Late join:** stops being rejected outright; spectator until the next round
  start, then materialises with 0 correct, marked "joined late" (PRD §4).
- **Room lifecycle:** purge 24h after creation.

**Decision the phase spec owns — who calls pause when the host is the one who
vanished.** A departed host cannot call its own RPC. Either the senior remaining
client by presence acts, or a Supabase scheduled function does. This is the
phase's hardest question.

**Exit criteria:** killing the host's tab pauses every other surface within the
presence timeout, and resuming continues the exact beat; a player who reloads
mid-game reclaims their score; a browser joining at round 5 spectates and races
from round 6 marked late; rooms older than 24h are gone; two-context Playwright
coverage for the drop and reclaim paths.

### P4 — The bank *(independent — starts day one)*

192 new questions, and the machine that keeps them honest.

**Scope**

- `scripts/validate-questions.mjs`: exactly 4 options; `correct_index` in range;
  no duplicate prompt bank-wide; correct-answer position balanced across all
  four slots; no length tell (the correct option is not systematically the
  longest — the classic AI-authored giveaway); tier and category valid;
  fun-fact present.
- Wired into `npm test` so structural defects can never reach review.
- Author to ≥10 per tier per category (≥240 total) in per-category tranches with
  AI assistance, then a human pass for taste and factual accuracy — reading for
  judgement, not hunting for structure.
- Delivery: the cloud project already holds the 48, so an additive migration is
  likely correct rather than a rewritten `seed.sql`. The plan confirms — this
  phase writes no spec (§6).

**Exit criteria:** the validator passes a ≥240 bank and fails on each seeded
defect class, with one unit test per rule; the cloud project holds the full
bank; `create_room` with a single category at 10-per-tier succeeds.

### P5 — Polish & launch readiness

**Scope**

- `LobbyView` restyled into the P0 design system — the last M1-era screen. Note
  `Starting grid — {n} joined` and the start-button copy are asserted verbatim
  in `e2e/game-flow.spec.ts` and `e2e/world.spec.ts`; do not reword them.
- The lobby → countdown transition, off CURRENT.md's intentionally-skipped list
  at last: the field currently teleports in one frame.
- **Accessibility audit** as real audit work: colorblind-safe answer palette
  verified, shape-coding, keyboard operability end to end, scalable text,
  reduced motion, screen-reader pass over the readable layer.
- **PRD §11 measured, not assumed:** a timed first-time host setup under 3
  minutes; a 10-player 12-question game on the cloud stack with no desync or
  stall; 60fps on a mid-range laptop and graceful degradation on a mid-range
  phone; the free-tier budget checked against a month of typical use (3
  games/week, 15 players).
- Carried debt gets a decision: the off-screen marker's missing direction (P2),
  and `TRACK_MARGIN`'s 20-player compression to 30 units.

**Exit criteria:** every §11 criterion has a recorded measurement rather than an
assumption; no screen left outside the design system; audit findings closed or
explicitly accepted in writing.

## 4. Cross-cutting constraints (bind every phase)

1. **Semantic events only** (PRD §3.6, §9) — §2.1 above.
2. **Rendering separation** (PRD §9): Pixi owns the world; HTML/CSS/React owns
   everything readable and interactive. Accessibility never depends on canvas.
   M3's new surfaces — control strip, review step, awards, pause card — are all
   DOM.
3. **Engine/mode/world boundaries** (PRD §3.5) hold. Nothing in M3 is
   world-specific; the draw, the control strip and continuity are engine
   concerns and belong outside world modules.
4. **The Fairness Law** (§2.4) is inviolable.
5. **Celebration hierarchy** (PRD §8) governs every new moment (§2.6).
6. **Accessibility and performance profiles** are acceptance criteria for every
   phase, not a final pass.
7. **The design razor**: does this make it feel more like a game show, or more
   like a quiz website? — without sacrificing question readability or
   accessibility.
8. **The regression floor at the end of every phase:** 429 unit tests (and
   whatever the phase adds), `npm run lint` clean, `npx tsc --noEmit` silent,
   and Playwright at `--workers=2`. Per CURRENT.md, there is no longer a known
   pre-existing lint error to discount — any lint error is a real one.

## 5. Testing approach

- **Vitest** for every new pure module: award computation, tie detection and
  photo-finish resolution, sudden-death eligibility, pause remaining-time math,
  draw validation, and one test per question-validator rule.
- **SQL-level integration testing is new for M3.** M2 was presentation-only, so
  `scripts/smoke.mjs` sufficed. M3 puts sudden death, rematch reset, awards,
  reclaim and purge into Postgres — logic with no client-side representation to
  unit-test. That script grows into the integration harness each phase extends,
  run against the local stack.
- **Playwright** stays the regression floor and gains genuine **multi-context**
  coverage for the first time: pause observed from a second browser, host-drop
  and reclaim, late join. P0 and P3 cannot be honestly verified from a single
  context.
- **Live verification stays headed.** Headless Chromium falls back to
  SwiftShader and pins the VFX budget before a test starts (CURRENT.md); every
  M2 phase from P2 on verified headed, and M3's ceremony and pause work needs
  the same.
- Canvas internals remain untested; the tested seam is still
  presentation-events-in → presentation-state-out.

## 6. Drill-down process

**Not every phase gets its own spec.** M2 wrote ten and they earned their keep —
the roadmap declared seven phases and the spec stage discovered that three of
them were mis-sized, splitting P3, P5 and P6 before a plan was ever written
against the wrong scope. But that value comes from *design uncertainty*, and two
M3 phases have almost none.

The diagnostic is the **"decision the phase spec owns"** line in §3. A phase
that has one, or that carries several distinct features liable to split, gets a
spec. A phase that is a list of known work does not.

| Phase | Spec? | Why |
|---|---|---|
| P0 Host authority | **Yes** | Owns the skip-semantics decision; pause touches every `ends_at` consumer |
| P1 The draw | **Yes** | Owns the playing-host conflict *and* the custom-question storage fork |
| P2 The finish | **Yes** | Four distinct features — the exact shape that split three M2 phases; the spec is where P2a/P2b gets decided |
| P3 Continuity | **Yes** | Owns the hardest question in M3 (who pauses a vanished host) |
| P4 The bank | **No** | A validator with enumerable rules plus authoring; its one decision is a line, not a document |
| P5 Polish & launch | **No** | List-shaped: one restyle, one transition, an audit, four measurements |

For a phase **with** a spec:

1. Brainstorm it against this roadmap (superpowers:brainstorming) — the phase's
   scope block above is the starting requirement set, and its named "decision
   the phase spec owns" must be resolved there, not deferred.
2. Write the spec to `docs/superpowers/specs/` as
   `YYYY-MM-DD-m3-p<N>-<name>-design.md`.
3. Create its implementation plan (superpowers:writing-plans), implement, verify
   exit criteria, and confirm the regression floor before the next phase starts.

For a phase **without** one, go straight to superpowers:writing-plans using the
§3 scope block as the requirement set — that is what the block is for.

**This is a floor, not a ceiling.** If drill-down surfaces hidden complexity in
P4 or P5, that ratchets the path up: stop and write the spec. Two candidates are
already visible — P5's accessibility audit is exactly the kind of item that
looks like a checklist and turns out to be a phase, and its lobby→countdown
choreography is real design work that may deserve a small spec of its own. The
ratchet is one-way; nothing downgrades mid-phase.

P1→P2 and P3 are parallel-safe branches once P0 merges (e.g. separate
worktrees — note `.env.local` is gitignored and must be hand-copied into each
one, with its port corrected, per CURRENT.md). P4 needs nothing and starts
immediately. P5 starts only when all five have merged.
