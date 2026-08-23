# ADR-0032: The stage view is composed, not configured

- **Status:** Accepted
- **Date:** 2026-08-24
- **Phase:** P6a — stage view

## Context

`/stage/[code]` shows the same game as `/room/[code]`, from the same store, on
the same beats, with the same world underneath. The cheap way to build it is a
flag: give the existing components a `surface: 'player' | 'stage'` prop and
branch inside them — bigger type here, no buttons there, skip the YOU ring.

Two things make that the wrong shape.

The **layouts are inversions of each other**, not variants. The player surface
is portrait-first: the question dominates and the world gives up all but a 28vh
strip. The stage surface is landscape-only and full bleed: the world holds the
whole screen at every phase and the readable regions overlay it. A component
that serves both ends up as a grid whose every track is a ternary.

And a flag does not enforce **read-only**. `GameView` can call `submit_answer`,
`LobbyView` can start a race, the room route runs `useHostDriver`. A
`surface === 'stage'` guard inside those is one forgotten branch away from a TV
that can play, and nothing in the type system is watching.

## Decision

The stage view is a second, small set of presentational components
(`components/stage/*`) composed over the **same** state, runtimes and world.
The stage route mounts none of the components that can write — no `JoinGate`,
no `GameView`, no `LobbyView`, no `useHostDriver` — and discards
`useRoomChannel`'s return value, because nothing on the page has anything to
send. Read-only is a property of what is on the page, not of a branch inside it.

What is shared is shared **outright**, not re-implemented: the store,
`useRoomChannel`, `useRoomRuntimes`, `PixiStage`, `RevealPanel`, `AvatarStack`,
`distributionRows`, `WinnerCard`, `ResultsTable`, `LowerThird`, `TimerRing`,
every timing constant in `lib/staging/beats.ts`, and — the one thing extracted
for this phase — the option identity table, now `lib/staging/options.ts`.

## Consequences

- Duplication is real and bounded: two components render four option tiles, two
  render a results board. They diverge in layout and in interaction, which is
  exactly what differs between a phone in your hand and a TV across the room.
- **`lib/staging/options.ts` is the seam that pays for this**, and it is the only
  thing preventing the two surfaces from drifting where drift is not allowed:
  ▲ is cyan by index on both, or the room and the phone disagree about which
  answer is which. It is characterization-tested against exactly what shipped.
  Anything else that must be identical on both surfaces goes the same way — into
  a shared pure module with a test — never copied.
- Timing may never be re-derived on the stage side. Every stagger, hold and
  step comes from `lib/staging/beats.ts` and every position from `ends_at`
  (ADR-0014), so a TV and a phone stay in lockstep without talking.
- The traps are per-surface too, and both apply: a conditionally-mounted region
  needs `AnimatePresence initial={false}` (ADR-0019's grid does), and an
  unconditionally-mounted one needs a one-shot mount-time derivation
  (ADR-0030 — `StageResults` carries its own `settled`; it is **not** inherited
  from rendering `WinnerCard` and `ResultsTable`, because the ceremony runtime
  publishes from a `requestAnimationFrame` tick and `steps.board` reads false on
  first render even for a ceremony that ended minutes ago).
- A third surface (a moderator screen, a replay) composes the same way. If it
  ever needs a *fourth* copy of the option tiles, that is the signal the shared
  half was drawn in the wrong place — revisit the seam, not this decision.
