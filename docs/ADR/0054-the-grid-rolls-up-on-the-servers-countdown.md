# ADR-0054: The grid rolls up on the server's countdown

- **Status:** Accepted
- **Date:** 2026-08-30
- **Phase:** M3 P5a — The starting grid

## Context

The field teleported from the lobby grid to the start line in one frame.
CURRENT.md carried this as intentionally skipped since M2 P2, on the grounds
that a roll-up would be new choreography rather than a fix — P2's spec §7
asked only for a stable starting-grid formation, and P3a/P3b explicitly kept
`COUNTDOWN` out of scope too.

The M3 roadmap scoped the transition into P5 alongside `LobbyView`'s restyle
into the P0 design system, since both land on the same screen and doing the
choreography before the restyle would mean doing it twice. Its §6 ratchet
flagged the choreography as work that "may deserve a small spec of its own";
this plan resolved that without a separate spec, because the design
uncertainty turned out to be six enumerable questions, each already answered
by an existing mechanism (this plan's "Decisions this plan owns and resolves"
table).

## Decision

**The field moves, not the camera.** The camera already interpolates
(`beginMove`/`sampleMove` ease the lobby `startLine` shot into the countdown
`establishing` shot over the drift style); the avatars did not — `fieldAnchors`
returned `gridAnchors` while `phase === 'lobby'` and `startLineAnchors` the
frame after, with nothing in between. The fix is one movement sequence over
the existing grammar, not new camera work.

**`beginFormationMove`** compiles two anchor sets (`from`, `to`) directly into
the same anticipate → launch → travel → settle `MovementTrack`s a drama beat
uses, via the same `sampleMovement`. It differs from `beginSequence` only in
where the tracks come from — an explicit pair of formations rather than
buffered cues — and in stagger order: **front row first** (descending `x`),
the reverse of `beginSequence`'s back-marker-first ordering. A race start
unspools from the line backwards; a pass has to read as the passer arriving
after the passed. A racer with no slot in the old formation (a late joiner
between the two anchor computations) gets a zero-length track rather than
flying in from the origin.

**`beginCountdownRollUp`** positions that sequence against the server's
`phase_ends_at`, exactly like every other beat (ADR-0014): `startedAt = now -
elapsedIn(NOMINAL_MS.countdown, remainingMs)`. A client that reloads 2.4
seconds into a 3-second countdown starts a sequence that finished 400ms ago
and renders it settled — the launch is not replayed, and no catch-up flag is
needed to say so. An unknown deadline (`remainingMs === null`) is treated as a
countdown already over, the same convention `elapsedIn` already uses
elsewhere.

**The grid being left is recomputed, not remembered.** The store advances
`phase` before the cue bridge runs, so by the time `phase-countdown` arrives,
the live anchors already answer "start line" — the handler calls `gridAnchors`
directly for the formation being left, rather than holding the lobby anchors
on every lobby frame to keep one value that is a pure function of state the
store still holds.

**The DOM hands off rather than cross-fading.** `AnimatePresence mode="wait"`
sits at the room page's one content seam (`app/room/[code]/page.tsx`), keyed
on an explicit `Stage` union, so exactly one `<main>` landmark exists at every
instant. A cross-fade would need both views absolutely positioned, putting two
`<main>`s in the tree for the overlap. Only the lobby stage has a non-zero
exit duration (`DURATION.beat`); every other stage exits in 0ms, because
`mode="wait"` would otherwise insert that same gap in front of the ceremony,
whose DOM is `ends_at`-derived and cannot afford to arrive late (ADR-0030).
The world's roll-up runs independently underneath this wrapper, on the canvas,
which never unmounts — so the lobby panel visibly fades and lifts *while* the
roll-up is already progressing behind it, rather than the two happening in
sequence.

**One `components/Countdown.tsx`, consumed by both surfaces.** The numeral
existed twice (`GameView`'s `Countdown`, `StageBroadcast`'s `StageCountdown`)
with identical logic and a comment on each saying so. The TV's scale comes
free from the `[data-surface="stage"]` token override (ADR-0035), so no
variant prop is needed.

The roll-up is `routine` tier — M3's one allowed celebration-hierarchy
addition (`suddenDeath`) is already spent, and the roll-up adds no rung.

## Consequences

- The choreographer now has two entry points that start a movement sequence:
  `beginSequence` compiles buffered drama cues; `beginFormationMove` (and its
  `beginCountdownRollUp` wrapper) takes two anchor sets directly. A future
  caller that needs the world to move without a drama cue goes through the
  second rather than synthesising a fake cue to reach the first.
- `phase-countdown` no longer calls `holdAnchors`. Nothing buffers drama
  between the countdown and the first READ — `bufferCue` only accepts the five
  DRAMA cue types, none of which can fire in a lobby — and `phase-read` takes
  a fresh hold one beat later regardless.
- The roll-up's length is bounded by the server's countdown:
  `NOMINAL_MS.countdown` (3000ms) is a hand-mirror of `start_game`'s
  `interval '3 seconds'`, in the same tradition as `NOMINAL_MS`'s other
  entries and `ceremony_ms()`. A change to that interval must move both. At a
  large field the stagger can consume a meaningful fraction of the countdown
  (60ms × 19 = 1140ms of stagger alone at twenty players, before the 840ms
  movement itself), so a future increase to `MAX_STACK_RISE`-scale field sizes
  should re-check that the roll-up still settles with room to spare.
- `LobbyView` crossed into the P0 design system in the same phase (a
  source-scanning unit test, `tests/designSystem.test.ts`, now fails on any
  raw Tailwind palette class under `components/` or `app/`), which is why this
  ADR and that restyle share one plan and one phase record rather than two.
