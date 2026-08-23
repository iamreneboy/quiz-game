# M2 P3b — Round Staging: the outcome half

| | |
|---|---|
| Status | Approved design — ready for implementation planning |
| Parent | `docs/superpowers/specs/2026-08-21-m2-the-show-roadmap.md` (P3), `docs/superpowers/specs/2026-08-23-m2-p3a-round-staging-design.md` §9, `docs/PRD.md` §5.3, §8–§9 |
| Date | 2026-08-23 |
| Baseline | P3a complete (`612965b`): the staging spine, shape-coded answer buttons, choreographed READ and ANSWER. `RevealPanel` and `TrackReadout` are still M1 placeholders. |

## 1. Purpose

P3a built the half of a round the player interacts with. **P3b is the half the player watches**: REVEAL staging with the avatar-stacked distribution bar, TRACK moment direction, final-question escalation, and the broadcast callouts that name what just happened.

**This phase triggers roadmap decision 4.** It opens the realtime payload — the first and, if the roadmap holds, only exception to M2's presentation-only rule. §2.1 and §3 argue it.

## 2. Decisions

1. **The wire opens once, for two fields.** `build_reveal` gains `picks` (who chose what) and `standings` gains `current_streak`. The distribution bar is not buildable without the first; P2's streak-flame-lost-on-reload debt is not fixable without the second. Opening the protocol twice for two additive fields would be the worse outcome, so they ride together.
2. **Everyone is shown, on every option.** Four people confidently on the same wrong answer is the joke, and it lands on the group rather than on a person. Tone is carried by treatment, not by omission: the correct stack celebrates, the other three are quiet and un-annotated — no ✗, no red, no "3 wrong".
3. **The reveal is the options grid transformed, not a second widget.** The four buttons morph in place into result rows. "Correct-answer highlight" and "distribution bar" are one object, which is better television and the only way rows, stamp and fun fact fit a portrait screen.
4. **TRACK belongs to the canvas.** The shell goes transparent, the standings slim to a bottom rail, and the world gets the frame. Accessibility does not move to canvas — the rail is a real `<ol>` carrying every player (PRD §9).
5. **One headline callout per beat, timed to the arena reaction.** Callouts inherit P2's arbitration rather than inventing their own (ADR-0010). Below-headline drama is subdued into rail marks, never dropped and never given a second banner.
6. **Callouts buffer independently of the choreographer.** ~20 lines of duplicated buffering, deliberately, rather than making the readable surface depend on renderer state.
7. **Escalation lands on the run-up.** `final-question` moves one beat earlier, to the TRACK preceding the final round. The final READ opens already hot and keeps every millisecond of the 2.1s reading time P3a's spec was built to protect.

## 3. The protocol change

`supabase/migrations/0003_reveal_picks.sql` — two `create or replace`s. No schema change, no data migration, no new table.

```sql
-- build_reveal gains:
'picks', (select coalesce(jsonb_agg(jsonb_build_object(
            'player_id', a.player_id, 'choice_index', a.choice_index)), '[]'::jsonb)
          from answers a where a.room_id = p_room_id and a.round = p_round)

-- new: current_streak(p_room_id, p_player_id, p_max_round)
--   longest_streak's loop, returning the trailing run (`cur`) rather than `best`.

-- standings() gains 'current_streak', so reveal, track and results all carry it.
```

```ts
// lib/types.ts
export interface RevealPayload { …; picks: { player_id: string; choice_index: number }[]; }
export interface Standing      { …; current_streak: number; }
```

**`counts` stays**, though `picks` now subsumes it. Two reasons. It keeps the `phase-reveal` cue's shape untouched, so ADR-0001 holds — P3b consumes the P0 vocabulary and adds nothing to it. And it is the fallback: `lib/store.ts:47` casts wire payloads with no runtime validation, so a client running against a pre-migration database sees `picks === undefined` and must degrade to a counts-only bar rather than an empty one.

**Why `picks` and not aggregated stacks.** The server could return per-option player arrays and save the client a group-by. It would also bake a presentation decision into the wire, which cross-cutting constraint 1 forbids: the payload describes game meaning, the client decides what it looks like.

**Why `current_streak` rides along.** [ADR-0013](../../ADR/0013-persistent-vs-transient-vfx.md) classifies the streak flame as persistent, but `streakTier` accumulates from cues inside `ChoreographerState` and `streak-tier` fires only at 3/5/8 — so a player who reloads mid-streak loses their flame until the next milestone. With the field on the wire, `flairFor` derives the tier from standings like every other flair and the accumulator goes away.

## 4. Module layout

```
supabase/migrations/0003_reveal_picks.sql   # picks + current_streak
lib/types.ts                                 # the two fields
lib/presentation/
  deriveCues.ts     # final-question moves to the run-up beat
  timing.ts         # NEW: ARENA_AT_MS, DRAMA_HOLD_MS — the beat clock both domains read
lib/staging/
  distribution.ts   # NEW pure: (options, picks, counts, standings, localId) -> rows
  callouts.ts       # NEW accumulator: buffer at reveal, resolve headline at track
  beats.ts          # reveal/track steps; optionsLive -> optionsMode
  runtime.ts        # + phase-reveal / phase-track / final-question / phase-results
  useStaging.ts     # + callout, deltas, escalated slices
lib/world/
  flair.ts          # streak tier from current_streak
  choreographer.ts  # the streak accumulator retires
components/
  RevealPanel.tsx   # restyled: result rows, fastest stamp, fun fact
  AvatarStack.tsx   # NEW capped stack with overflow
  LowerThird.tsx    # NEW callout / FINAL QUESTION card
  TrackReadout.tsx  # restyled to the bottom rail
  AnswerButtons.tsx # + result mode
  StageShell.tsx    # track folds in; data-escalated
  GameView.tsx      # loses its track branch
```

No new dependencies.

### Seams

- **`distribution.ts` touches nothing.** No React, no store, no DOM. Cap, overflow, ordering and the no-picks fallback are decided there and asserted in units.
- **`staging.ts` stays a memoryless projection.** That property is what makes a reload correct with no special case (P3a decision 2), so callout state does not go in it. `callouts.ts` is an accumulator the runtime threads, exactly as `lib/world/runtime.ts` threads `ChoreographerState`, published through its own store action. Zustand's shallow merge means `publish(stagingAt(…))` cannot clobber it — the mechanism `announcement` already relies on.
- **`lib/staging/runtime.ts` remains the only staging subscriber**, preserving one-subscriber-per-domain ([ADR-0001](../../ADR/0001-presentation-cue-layer.md)).
- **The beat clock moves to `lib/presentation/timing.ts`**, a new module holding `ARENA_AT_MS` (1400) and `DRAMA_HOLD_MS` (1200). Both domains read the beat's timing from the shared layer; neither owns the other's clock. `lib/world/choreographer.ts` imports `ARENA_AT_MS` from there, and `director.ts`'s `OVERTAKE_HOLD_MS` becomes a one-line re-export of `DRAMA_HOLD_MS` so the camera's transient and the callout's hold expire together and cannot drift apart. Not `tokens.ts`: that file's contract is "mirror of the `@theme` block in `globals.css`", enforced by `tests/tokens.test.ts`, and these are choreography constants with no CSS counterpart.

### Store additions

```ts
export type OptionsMode = 'dim' | 'live' | 'result';

export interface Callout {
  tier: CelebrationTier;
  kind: 'overtake' | 'lead-changed' | 'streak-tier' | 'final-question';
  headline: string;
  playerId: string | null;
}

/** Below-headline drama, subdued into the rail (decision 5). */
export interface RailDelta { playerId: string; placesGained: number; streak: number; }
```

`callout`, `deltas` and `escalated` are merged slices alongside `announcement` — never part of the `StagingState` projection.

## 5. Beat treatments

### REVEAL (5s)

The four buttons do not unmount. `stepsAt('reveal')` keeps `options: true` with `optionsMode: 'result'`, and because P3a already wraps the options slot in `AnimatePresence`, keeping the same element is what buys the morph.

| At | What |
|---|---|
| 0ms | Rows morph (`DURATION.beat` on `EASE.snap`). The correct row fills `--color-correct` at low alpha with a solid accent edge; the other three drop their accent to 35% and their body to `bg-night/40`. Your own pick keeps the accent ring it took at lock. |
| 300ms | Avatar stacks pop in — correct row first, 60ms per avatar, `EASE.settle`. Total stagger is capped at 700ms regardless of headcount. |
| 900ms | `FASTEST ⚡ {name}` slams onto the correct row's right end on `EASE.settle`'s overshoot. Skipped when `reveal.fastest` is null. |
| 1400ms | The fun-fact card rises 12px under the rows on `EASE.snap`. 3.6s remain to read it. |

You find yourself by your own ring, not by a verdict mark — decision 2's tone rule expressed in form, the same way [ADR-0017](../../ADR/0017-answer-selection-is-form-not-hue.md) expresses selection.

The correct row carries a check chip and the accessible name `Paris — correct — 5 of 8`. One polite announcement fires at the beat: `Correct answer: Paris. You picked Rome.` — neutral, with no verdict word attached to the player.

### TRACK (4s)

Folds into `StageShell` as a beat rather than a full-screen branch. The canvas is already at the full band here (`components/PixiStage.tsx:10` excludes `track` from `STRIP_PHASES`), so nothing changes there; the shell goes transparent and the rail rises 16px from the bottom over 260ms.

The rail is an `<ol>` carrying every player: rank, medal, avatar, name, score, the existing off-screen marker, and the new subdued marks — `▲2` for places gained, `🔥×5` from `current_streak`, now honest across a reload.

**The lower third enters at `ARENA_AT_MS` (1400ms)** — the same instant the arena reaction lands, because both read the same constant. It holds `DRAMA_HOLD_MS` (1200ms) and exits well before READ. Banner and stadium land together; announcing one thing while the stadium reacts to another is the failure mode [ADR-0010](../../ADR/0010-exclusive-arena-reaction-subdued-avatar-vfx.md) exists to prevent, and sharing the constant is what closes it.

Headline selection is `resolveTier` over the buffered queue — the same function the choreographer uses on the same cues, so the two cannot disagree about what the beat is about. Ties break toward the local player, following [ADR-0008](../../ADR/0008-local-player-outranks-leader-in-overflow.md)'s precedent.

### Final-question escalation

`final-question` is emitted on entering the **penultimate round's TRACK**. It is buffered like any other drama cue, and `resolveTier` picks it as that beat's headline because `finalQuestion` outranks `overtake` — so an overtake on the same beat correctly demotes to a rail mark. The escalation needs no special arbitration; it falls out of decision 5.

It renders larger than a lower third: a full-width card over the settling world, while the world's lights dim from the same cue (the director already sets `escalation: 1`, and `phase-read` already preserves it when `isFinal`).

`escalated` then stays true until `phase-results`, surfacing as `data-escalated` on the shell:

- `TensionFrame`'s rim switches to the escalation palette
- the round chip reads **FINAL QUESTION** instead of `Q8 of 8`
- the ring's track runs hot

The question and the options are untouched. P3a decision 4 — pressure lives in the margins — applies hardest here, on the one question where misreading costs most.

**Emission rules** live entirely in `deriveCues.ts`; the cue vocabulary is unchanged.

| Situation | Where `final-question` fires |
|---|---|
| Normal game | Entering TRACK of round `total_rounds − 1` |
| `total_rounds === 1` | On `phase-countdown` — there is no preceding TRACK |
| Reload mid-final-round | The seed branch, when `round === total_rounds` and phase is read/answer/reveal/track |
| Final READ | Never — it stops firing there, so it cannot double-fire |

### Reduced profile

Cross-fades for the row morph, stacks with no stagger, a lower third that fades rather than slides. Escalation is a data attribute rather than a custom property, so it costs no per-frame writes.

## 6. Layout

**REVEAL in portrait is the tight case**: question band, four rows, stamp and fun-fact card inside ~72vh. Rows compress 56px → 44px once they stop being touch targets, stacks cap at 4 avatars below 640px, and the fun fact renders as a single compact line. If it still overflows, the outcome region scrolls — the page never does.

**Stack overflow** renders `+3` after the visible avatars. Order within a stack is standings rank, so the picture is stable and matches the rail. If the local player would be cut, they replace the last visible avatar and the overflow count is unchanged — you are always in the picture, and the arithmetic still adds up.

**TRACK in portrait** is a horizontally scrollable single-row rail; from 640px it is a centred row. The lower third sits above it, never over it.

## 7. Debt and scope boundaries

One piece of standing debt closes here because the protocol opening makes it free. Two nearby things deliberately do not.

1. **The streak flame does not survive a reload** (P2). Fixed by `current_streak`: `flairFor` derives the tier from standings, and the `streakTier` accumulator leaves `ChoreographerState`. Recorded in `docs/progress/CURRENT.md`; this is the phase that opens the protocol, so this is the phase that closes it.
2. **COUNTDOWN stays a full-screen branch outside the shell.** P3a restyled it and left it there; the roadmap puts countdown choreography outside P3 entirely. Folding it in would be new work on a beat this phase does not otherwise touch, and it fires once per game.
3. **`TrackReadout`'s off-screen marker carries no direction** (P2) is *not* closed here. It changes `offscreenPlayerIds`' return type, `useWorldView`'s state shape and every caller — out of proportion to a restyle. The marker moves to the rail unchanged.

## 8. Testing

Pure units carry the coverage, per roadmap §5.

- `tests/distribution.test.ts` — rows from picks; counts-only fallback when `picks` is absent or empty; cap and overflow count; the local-player substitution rule; players who never answered absent from every stack; all-one-option and nobody-answered.
- `tests/callouts.test.ts` — buffered at reveal and resolved at track, never at cue arrival; tier ordering; `final-question` outranking a simultaneous overtake; local-player tie-break; deltas per player; cleared at read; a beat with no drama producing no callout; a reload with nothing buffered producing no callout.
- `tests/beats.test.ts` — additions for the reveal and track steps and the `optionsMode` boundaries.
- `tests/deriveCues.test.ts` — `final-question` at the penultimate track and not at the final read; the `total_rounds === 1` countdown path; the seed path; never twice in one game.
- `tests/flair.test.ts` — streak tier derived from `current_streak` with no cue history.
- `tests/store.test.ts` — the two new fields pass through, and their absence does not throw.

**The migration has no test harness.** `tests/` is entirely Vitest; this repo has no SQL runner. Verification is explicitly manual: apply against the running local stack with `supabase migration up` or `psql` — **never `supabase stop`/`supabase start`**, which will bind the Hyper-V-reserved default ports and lose the stack (CURRENT.md) — then play a real two-player game and read the payload.

**e2e**: the existing 18 across 7 specs are the regression floor. New coverage where the surface changed — at REVEAL the correct row is marked and carries as many avatars as players who picked it; at TRACK `data-beat="track"` renders a rail listing every player; the final round shows the FINAL QUESTION chip.

**Visual smoke** via playwright-cli at REVEAL+0.3s / +1.0s / +1.5s, TRACK+1.4s, and the penultimate TRACK+1.4s for the escalation card, in portrait and landscape across both profiles. **Headed only** — headless Chromium falls back to SwiftShader and pins the VFX budget at `minimal` before a test starts (CURRENT.md). Development screenshots, not committed as snapshot tests.

Canvas internals stay untested; the tested seam is cues-and-payload in, presentation-state out.

## 9. Edge cases

| Case | Behaviour |
|---|---|
| `picks` absent (pre-migration server) | Counts-only bar, no stacks. Nothing throws. |
| A player never answered | Absent from every stack; still present in the rail and the standings. |
| Everyone picked the same option | One full row, three at zero width showing `0`. |
| Nobody answered | Four zero rows, no stacks, no fastest stamp. |
| `fastest` is null | No stamp; the rest of the beat is unchanged. |
| `fun_fact` is null | Card skipped; rows hold for the remaining time. |
| Reload mid-REVEAL | Rows and stacks present, no replay — steps derive from `ends_at` ([ADR-0014](../../ADR/0014-beat-position-derived-from-ends-at.md)). |
| Reload mid-TRACK | Rail correct, **no callout** — nothing was buffered. Matches the choreographer's `heldAnchors` degradation. |
| Reload mid-final-round | Escalation seeded from `deriveCues`' seed branch. |
| `total_rounds === 1` | `final-question` fires on countdown. |
| Phase advances mid-animation | Callout and rail cut to their end state; input is never gated ([ADR-0016](../../ADR/0016-staging-never-gates-input.md)). |
| More players than the stack cap | `+N` overflow; the local player is substituted into the last visible slot. |
| Spectator / non-playing MC | Sees the full reveal; has no pick of their own to ring. |
| `reduced` profile | Cross-fades, no stagger, no per-frame writes. |

## 10. Exit criteria

1. REVEAL plays as one continuous object — options morph to result rows, the correct row highlights, stacks land, the stamp slams, the fun fact rises — with no unmount/remount of the options slot.
2. The distribution is honest: stacks match `picks` for every option, and a payload without `picks` degrades to a counts-only bar without throwing.
3. TRACK is the canvas's beat: full band, transparent shell, and a rail carrying every player as real text. Readability never depends on canvas.
4. Exactly one headline callout per TRACK beat, entering on the arena reaction, with below-headline drama visible as rail marks.
5. Final-question escalation lands on the run-up beat, and the final READ retains its full 2.1s of reading time — measured, not asserted.
6. The streak flame survives a reload, verified by reloading mid-streak (P2 debt closed).
7. Mobile portrait at 390×844: REVEAL fits without page scroll; the TRACK rail is legible.
8. Both performance profiles work; `reduced` performs no continuous ramp and no per-frame writes.
9. The migration is applied and a full game plays against it end to end.
10. The Playwright e2e suite passes.

## 11. Expected ADRs

- **The wire opens once, for `picks` and `current_streak`** — roadmap decision 4's argued exception: why the distribution bar justifies it, why the server returns picks rather than presentation-ready stacks, and why `counts` survives alongside.
- **The reveal is the options grid transformed, not a second widget.**
- **Callouts buffer their own queue rather than reading the choreographer's** — duplication chosen over coupling the accessible surface to renderer state.
- **Final-question escalation fires on the run-up beat**, so the final question's reading time is never spent on its own announcement.
