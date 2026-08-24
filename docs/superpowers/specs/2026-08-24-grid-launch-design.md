# Grid launch — design

Closes the sole *Intentionally skipped* entry in `docs/progress/CURRENT.md`:
"The lobby → countdown transition teleports the field in one frame" (P2).

Scope is `lib/world/runtime.ts` (`fieldAnchors`'s phase dispatch, the cue
handler's `phase-read` / `phase-countdown` branch) and
`lib/world/choreographer.ts` (one new export, `beginLaunch`), plus their
tests. Geometry, framing, the director, the audio design and `MarkerAnchor`
are untouched.

## Problem

`fieldAnchors` (`lib/world/runtime.ts:101`) dispatches layout purely on
phase. `lobby` gets `gridAnchors` — the staggered starting grid sitting back
in the run-off at negative `x`. Every other phase with no standings yet gets
`startLineAnchors` — the whole field flat on segment 0.

Nothing interpolates between the two. The choreographer only moves avatars
inside a compiled `sequence`, and sequences are only compiled on
`phase-track` (`beginSequence` early-returns when `pending` is empty). So
when `phase-countdown` arrives the anchor array is swapped wholesale and the
field is at the line one frame later.

The camera *does* move smoothly across that boundary (`startLine` →
`establishing`, drift style), which is likely why the jump reads as jarring
rather than as a cut: the world moves and the avatars do not.

P2 declined to fix this by building a roll-up-to-the-line move, correctly:
spec §7 asked for a stable starting-grid formation, not a roll-up, so that
would have been new choreography rather than a fix.

## Fix

Hold the grid formation through `countdown`, and animate a launch at
`countdown → read`.

This is closer to spec §7 than today's behavior, not further from it. The
starting grid — a formation that `TRACK_MARGIN`, `GRID_EDGE_MARGIN` and
`gridAnchors`'s whole row-growth rule exist to serve — is currently only
ever visible while nothing is happening, and vanishes the instant the show
starts. Sitting on the grid through the countdown is what a grid is for, and
it moves the one teleport to the single beat in the show where a launch is
the obvious gesture.

`start_game` (`supabase/migrations/0002_rpcs.sql:250`) sets
`phase = 'countdown'` with a 3-second deadline, and `advance_phase`'s `case`
has `countdown → read` as its only exit. The countdown therefore happens
**exactly once per game** and only ever precedes round 1's READ. No
per-round bookkeeping is needed anywhere in this design.

### Timing

The launch fires on the `phase-read` cue — the instant the countdown hits
zero. Rejected alternatives: deriving a trigger from the countdown's
`ends_at` so the launch lands *before* READ opens (more faithful to "lights
out, GO", but needs its own rAF-driven trigger inside a phase that currently
has none), and straddling the boundary (most physically convincing, but the
movement would span two phases and two anchor layouts, which fights the
existing `from`/`to` model).

Duration is 1020ms (see §Stagger), comfortably inside READ's 3 seconds
(`0002_rpcs.sql:288`).

## §1 Anchor dispatch

`lib/world/runtime.ts:119` gains one phase:

```ts
if (phase === 'lobby' || phase === 'countdown') return gridAnchors(racers, metrics, riseLimit);
```

Every consumer of the field's positions — camera framing, the off-screen
indicators at `runtime.ts:281`, the scene — reads through `fieldAnchors`, so
nothing else needs to know.

The countdown's camera shot is unaffected: `frameTarget`'s `establishing`
case (`lib/world/framing.ts:141`) ignores `input.anchors` entirely and
returns the whole-track shot. Both shot books (`PLAYER_SHOTS` and
`STAGE_SHOTS` in `lib/world/director.ts`) use `establishing` for `countdown`,
so the change is uniform across surfaces: during 3-2-1 the viewer sees a
field on the grid with the entire course laid out ahead of them.

`fieldAnchors` is currently module-private. It becomes exported so its
dispatch can be unit-tested (see §6).

## §2 The launch sequence

New export in `lib/world/choreographer.ts`, a sibling to `beginSequence`:

```ts
export function beginLaunch(
  state: ChoreographerState,
  liveAnchors: readonly MarkerAnchor[],
  now: number,
  profile: Profile,
): ChoreographerState
```

**Source positions.** `from` is `state.heldAnchors ?? liveAnchors`, matched
per `playerId` — the same degraded fallback `bufferCue` and `beginSequence`
already document and rely on. A player present in `liveAnchors` with no held
anchor (someone who joined mid-countdown) resolves `from` to their own live
anchor, so they appear at the line without launching.

**Stagger by column.** `gridAnchors` does not store a column index, but every
player in a column shares an exact `x` — `Math.max(rearmost, -GRID_LEAD_IN -
column * spacing)` (`geometry.ts:306`), which depends only on `column`. So
the column order is recovered by collecting the distinct held `x` values and
sorting them **descending**: position in that list is the stagger step,
passed to the existing `staggerFor`.

Pole position (highest `x`, nearest the line) therefore launches first and
the back column last. This is the reverse of `beginSequence`'s back-marker-
first sort, which exists so a passer arrives after the player it passed —
a rule with no meaning at a standing start.

Staggering by column rather than by player index matters at scale: a column
launches as a unit, so the total stagger is capped by the column count, not
the field size. `TRACK_MARGIN` reserves exactly four columns, so the stagger
is at most `3 * STAGGER_MS` = 180ms whether the field is 2 players or PRD
§13's twenty.

It also collapses to zero for free: when every `from.x` is equal, the
distinct-x list has one entry and every player gets step 0.

**Sequence shape.**

```ts
{
  startedAt: now,
  headline: 'routine',
  tracks,
  lightnings: [],
  ignitions: [],
  arenaPlayerId: null,
  leadChange: null,
  durationMs: lastDelay + MOVEMENT_MS,   // 180 + 840 = 1020
}
```

`headline: 'routine'` is load-bearing rather than a filler value.
`avatarStates`'s `subdue` helper calls `isSubdued(tier, sequence.headline)`,
and the boost trail is emitted at `subdue('routine')`. Any headline above
`routine` would quiet the launch's own trails to `SUBDUED_INTENSITY`. With
`'routine'`, `isSubdued('routine', 'routine')` is false and the trails render
at full allowance.

The empty `lightnings` / `ignitions` / `arenaPlayerId` / `leadChange` mean the
launch emits movement and boost trails and nothing else — no accents, no
arena reaction, no emphasis exchange.

**Return value.**

```ts
{ pending: [], heldAnchors: liveAnchors, pulses: state.pulses, sequence }
```

`heldAnchors: liveAnchors` preserves the hold today's `phase-read` branch
takes (see §3). `pending: []` and the discarded prior `sequence` are the hard
-complete that branch also performs.

**No-op case.** If no track actually moves — every track's `from` equals its
`to` — `sequence` is `null` rather than a zero-distance sequence. A live sequence
that animates nothing would still make `isSequenceRunning` true for 1020ms,
suppressing the `heldAnchors` freeze path in `avatarStates` for no reason.

Strict equality is the right comparison here, not a tolerance: in every
no-op case `from` and `to` are the *same* anchor object from `liveAnchors`
(the `?? anchor` fallback), so no float arithmetic separates them. A grid
anchor and a line anchor are never coincidentally equal — `gridAnchors` puts
every column at negative `x` and `startLineAnchors` puts the field on
segment 0.

## §3 Runtime wiring

The cue handler at `lib/world/runtime.ts:177` currently shares one branch
between the two phase cues. It splits:

```ts
} else if (cue.type === 'phase-countdown') {
  // Holds the GRID: fieldAnchors now returns gridAnchors for this phase.
  choreo = holdAnchors(completeSequence(choreo), anchors);
} else if (cue.type === 'phase-read') {
  choreo = beginLaunch(choreo, anchors, now, profile);
}
```

`beginLaunch` receives `choreo` directly rather than
`completeSequence(choreo)`: `completeSequence` clears `heldAnchors`, which is
exactly the value `beginLaunch` needs to read. It performs the equivalent
hard-complete itself via its return value.

The `heldAnchors: liveAnchors` in that return value preserves the existing
hold on `phase-read`. That hold is redundant in the normal run — `phase-answer`
re-holds the same anchors a beat later — but it is the safety net if the
answer cue is ever missed, and this change is not the place to remove it.

**Rounds 2+ are byte-for-byte unchanged in behavior.** Arriving at READ from
TRACK, `heldAnchors` is already `null` (`beginSequence` cleared it), so `from`
falls back to `liveAnchors`, every track is zero-distance, `sequence` is
`null`, and the branch degenerates to exactly today's hard-complete-and-hold.

## §4 Guards

Every failure mode is closed by machinery that already exists. There is no
`ends_at` derivation, no catch-up flag, and no new concept in this design.

| Case | Mechanism | Result |
|---|---|---|
| Reload into READ / ANSWER / REVEAL | the seed batch emits only the current phase's cues, so no `phase-countdown` ever arrives and `heldAnchors` is `null` | `from === to`, `sequence: null`, field settled at the line |
| Reload into COUNTDOWN | `phase-countdown` *is* seeded, so the grid hold is taken; READ then arrives live | launch plays correctly |
| Rounds 2+ | `beginSequence` already cleared the hold | unchanged from today |
| Reduced-motion profile | `staggerFor` returns 0 and `sampleMovement` returns `to` immediately | today's instant transition, moved to READ. Spec §8 ladder-consistent, no new branch |
| Player joins mid-countdown | no held anchor for that `playerId` | appears at the line, does not launch |

This is the fifth appearance of the replay trap catalogued in
`docs/progress/CURRENT.md` — and the first where the existing degradation
closes it with no new code. Worth stating explicitly because it is not
obvious from the trap's four prior guises: the guard here is the *absence* of
a seeded cue, not a derivation from `ends_at`.

## §5 The strip collision

`components/PixiStage.tsx:11` makes `read`/`answer`/`reveal` STRIP_PHASES:
the canvas transitions from `h-screen` to `h-[28vh]` over `--dur-settle`
(460ms, the same value as `TRAVEL_MS`). So on a player device the launch runs
inside a collapsing canvas, with the camera's `fit` recomputing against a
shrinking viewport every frame. Today those are separate beats — the teleport
happens at lobby→countdown and the strip shrink at countdown→read; this
change puts them on the same beat.

Accepted, not mitigated, and scoped narrowly:

- **Stage (TV):** `band` is `'full'` at every phase but `results`
  (`PixiStage.tsx:43`). No resize. The launch reads clean and full-bleed —
  and this is the surface the choreography is for.
- **Player, landscape:** `landscape:h-screen` on the strip class. No resize.
- **Player, portrait:** the only affected case. The world is about to become
  a 28vh background strip regardless, so the launch is peripheral there by
  design.

Rejected mitigations: moving the launch into the countdown (adds an
rAF trigger to a phase with none), and suppressing the launch on
player-portrait (makes choreography viewport-conditional, a kind of branch
this codebase does not currently have anywhere).

Live verification checks this case specifically (§6). If it reads badly on a
phone, that is a follow-up, not a blocker.

## §6 Testing

### Unit — `tests/choreographer.test.ts`

A new `beginLaunch` describe block:

- **Grid to line.** Held grid anchors + live start-line anchors produce one
  track per player with `from` = the grid anchor and `to` = the line anchor.
- **Column stagger.** Players sharing a held `x` get an identical `delayMs`;
  distinct held `x` values sorted descending get `0 / 60 / 120 / 180`.
- **Pole first.** The highest held `x` gets `delayMs: 0`.
- **`durationMs`** equals the largest `delayMs` plus `MOVEMENT_MS`.
- **`headline`** is `'routine'`, and `lightnings` / `ignitions` /
  `leadChange` / `arenaPlayerId` are empty or null.
- **Null hold → no-op.** `heldAnchors: null` yields `sequence: null` — the
  reload guard, pinned so it cannot regress silently.
- **Rounds 2+ shape.** A state with a running sequence and `heldAnchors:
  null` returns `sequence: null`, `pending: []`, `heldAnchors: liveAnchors`.
- **Reduced profile.** Every `delayMs` is 0.
- **`pulses` survive** the transition (the lobby ready pulse must not be
  cleared by a launch).

### Unit — `tests/fieldAnchors.test.ts` (new)

`fieldAnchors` becomes exported for this. Cases: `countdown` returns the same
anchors as `gridAnchors` for the same racers; `lobby` still does; `read` with
no standings returns `startLineAnchors`; non-playing hosts stay filtered out
of the countdown grid (the `players.filter(p => p.is_playing)` rule already
documented at `runtime.ts:116`).

State is constructed as a minimal object cast to the store's shape, since
only `room`, `standings` and `players` are read.

### Live verification — headed browser

`docs/progress/CURRENT.md` records that headless Chromium falls back to
SwiftShader and cannot be trusted for anything frame-budget or animation
related, so these are observed by hand:

1. 4+ players, countdown → read: the field holds the grid for the full 3
   seconds, then launches pole-column-first and lands at the start line.
2. Reload mid-READ, mid-ANSWER, mid-REVEAL: field settled at the line, no
   launch replay, no console errors.
3. Reload mid-COUNTDOWN: field on the grid, launches when READ arrives live.
4. Rounds 2+ READ transition: unchanged from today.
5. Reduced-motion profile: snaps to the line, no launch, no errors.
6. Both surfaces, and player-portrait specifically, to observe the §5 strip
   collapse overlapping the launch.

A field larger than 8 (to exercise `rowsPerColumn` growth) is worth including
in check 1, since the column-stagger derivation depends on `gridAnchors`'s
row-growth behavior.

## §7 Documentation

- **ADR-0037** (`0036` is the current high-water mark): "The countdown holds
  the grid; the launch is the transition." This reverses P2's reading of spec
  §7 and is precisely the non-obvious, hard-to-reverse choreography decision
  the ADR convention exists for. It should record the rejected alternatives
  (roll-up during countdown, generic anchor interpolation, launching before
  READ opens) and the §5 trade.
- A progress doc for the phase.
- Delete the *Intentionally skipped* entry from `docs/progress/CURRENT.md`,
  leaving that section empty.
