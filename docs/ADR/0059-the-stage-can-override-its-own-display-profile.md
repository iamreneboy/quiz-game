# ADR-0059: The stage view can override its own display profile

- **Status:** Accepted
- **Date:** 2026-09-15
- **Phase:** post-M3 (M3 P5b phone-check follow-up)

## Context

`/stage/[code]` was built read-only by composition (ADR-0032), and its page
comment listed `SettingsControl` among the components it deliberately does not
mount. That left the stage with no way out of its static profile (ADR-0004).

The phone check on 2026-09-15 showed what that costs. `lib/presentation/profile.ts`
resolves any `coarsePointer && narrowViewport` device to `reduced` and
`VfxLevel: minimal`. A phone used as the stage screen therefore never shows
confetti, sparkle, the breathing halo or the spotlight sweep. The same phone
dropped zero frames at `minimal`, so it may well have headroom for more, but
there was no way to find out. A player on the same phone could raise the
profile from `/room/[code]`. The stage could not.

## Decision

The stage view mounts `SettingsControl`, the same component the room view uses,
with the same motion and mute options.

This does not weaken ADR-0032. What that ADR guards is **writes to the room**.
`SettingsControl` makes none: motion and mute are `useSettings` state, stored in
the device's local storage and never sent over the channel or to any RPC. The
stage still sends nothing.

The gear sits before `StageGate` in source order. Both are `z-50`, so the gate
paints over the gear until the first tap. That tap unlocks audio (see
`StageGate`'s comment), so it must never land on the gear instead.

## Consequences

- A phone or TV acting as the stage can be pushed to `high` by hand, the same
  escape hatch every other device has. The default is unchanged: `auto` still
  resolves a phone to `reduced`.
- A broadcast screen now shows a small gear in its top-right corner once
  started. That is the price of the override; the gear is the same 40px,
  `bg-night/70` control the room view carries.
- The stage's read-only rule is now, precisely: **nothing on the stage may
  write to the room.** Device-local preferences are allowed. Anything that
  reaches the channel, an RPC or another client is still out, and still enforced
  by composition, not by a guard.
- **Checked on real hardware (2026-09-15):** two phones, a Poco F6 Pro and a
  Realme 6 Pro, each used as the stage with *Full motion* chosen. Neither
  stuttered. Both would have been locked at `minimal` before this change, so
  the `coarsePointer && narrowViewport` rule is conservative for at least
  these phones. `auto` stays as it is: ADR-0004 chose a safe default plus a
  manual override, and this confirms the override is worth having rather than
  that the default is wrong.
- `e2e/settings.spec.ts` covers that the override is reachable and applies on
  the stage.
