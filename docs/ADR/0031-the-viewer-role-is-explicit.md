# ADR-0031: The viewer role is explicit, never inferred from a missing session

- **Status:** Accepted
- **Date:** 2026-08-24
- **Phase:** P6a — stage view

## Context

Until P6a there was exactly one kind of client, and "who is watching" was
answered the same way in four places: read `cb:<CODE>` out of `localStorage`
and take its `playerId`. `components/PixiStage.tsx` did it per frame (throttled),
`lib/staging/runtime.ts` did it twice — once for the tension vignette's
`is_playing` check, once when resolving a callout — and everything downstream
treated a `null` answer as "a spectator who hasn't joined yet".

The stage view breaks that equivalence. Its most likely real deployment is the
host opening the TV link **on the laptop they are already playing on**: same
browser profile, same origin, same room code, so the session read succeeds and
returns a real player id. Inferring the role from the presence of a session
would make that TV grow a YOU ring on one rig, bias callout arbitration toward
that player, and — through `framing.ts`'s never-drop rule (ADR-0008) — pin them
in frame at the expense of the pack the room is actually watching.

The failure is silent and only appears in the one setup nobody tests: two tabs,
one profile.

## Decision

The role is passed in, not inferred. `lib/viewer.ts` exports
`ViewerRole = 'player' | 'stage'` and a single pure function:

```ts
viewerPlayerId(role: ViewerRole, code: string): string | null
```

`'stage'` returns `null` unconditionally and never touches storage at all;
`'player'` is the previous `loadSession(code)?.playerId ?? null`. Every one of
the four call sites routes through it, and the role is threaded from the route
down — `useRoomRuntimes(code, role)`, `startStagingRuntime(code, role)`,
`<PixiStage code role />`. `role` is a **required** prop and a **required**
parameter, so a new call site is a compile error rather than a silent default.

One function rather than four `if (role === 'stage')` guards at the call sites,
because the guard is not the interesting part — the reason it must not fall
through to the session is, and that reason belongs in one docblock that every
caller inherits.

## Consequences

- A stage client is player-less **by construction**. The property is unit-tested
  (`tests/viewer.test.ts`) in Node, with no DOM and no Pixi, including the
  load-bearing case: a session for that exact room exists and the stage still
  resolves `null`.
- The stage view also skips the per-frame storage read and its throttle
  entirely; there is nothing to re-check.
- Anything later that varies by client kind — a moderator view, a replay,
  a second screen — extends `ViewerRole` and gets a compile error at each site
  that has to decide, which is the behaviour we want from a seam like this.
- The cost is a prop and a parameter on the path from route to renderer. That is
  deliberate: making the role ambient (a store field, a context, a module-scope
  variable) would let it be wrong in exactly the mixed-tab case this exists for.
- `lib/staging/runtime.ts`'s `isLocalPlayerPlaying` now reports `true` on the
  stage, which is correct: the tension vignette should ramp for the whole room,
  not be disabled because the TV isn't a contestant.
