# ADR-0048: The join announcement survives an unready channel

- **Status:** Accepted
- **Date:** 2026-08-30
- **Phase:** M3 — closing P2a tech debt

## Context

The lobby roster has exactly one input. A joiner writes itself to the database
through `join_room`, then broadcasts `player_joined` on the room channel; the
host's `useRoomChannel` folds that payload into the store with `addPlayer`.
There is no server-side realtime in this game (every broadcast is a client
`channel.send`), and nothing re-polls `get_room_state` while the lobby is open,
so a host that misses that one message never learns the player exists. The room
is *correct* in the database and wrong on screen, indefinitely.

That announcement was issued as `channel?.send(...)` from `handleJoined`, a
click-handler closure. Two independent things could swallow it:

1. **A stale closure.** `useRoomChannel` returns `null` until the channel
   reports `SUBSCRIBED` *and* an awaited `get_room_state` resolves. The closure
   that runs `handleJoined` captured `channel` at the render that created it —
   so if the subscription had not completed by the time the button was clicked,
   the optional chaining dropped the message, and it stayed dropped however
   ready the real channel became a millisecond later.
2. **A genuine race.** Even read fresh, the channel can still be connecting at
   the moment the announcement is ready to send.

Against the local stack the websocket handshake is ~10ms and always beat the
click, so neither ever fired and the whole cross-client suite passed. Against
the cloud project (`ap-northeast-1`) the handshake is a round trip: the click
lands first, and `e2e/world.spec.ts` failed at `Starting grid — 2 joined` on
every run. This was recorded as M3 P2a tech debt ("cross-client realtime does
not reach the browser against the cloud project") and attributed to the
project's Realtime settings. That attribution was wrong — a two-client probe
confirms broadcast delivery on that project is fine, and a websocket frame
trace shows the joiner never put a broadcast on the wire at all.

## Decision

The announcement is held, not fired into the void. `app/room/[code]/page.tsx`
keeps the channel in a ref alongside the rendered value and an outbox holding
at most one pending `PlayerPublic`:

- `announce(me)` reads the channel from the **ref**, so it always sees the
  current one rather than the one its closure captured. If it is ready, it
  sends immediately.
- If it is not ready, the payload waits in the outbox, and the effect that
  tracks `channel` flushes it the moment the subscription completes.

`useRoomChannel`'s contract is deliberately left alone: it still returns
`RealtimeChannel | null` and still withholds the channel until `SUBSCRIBED`.
That null is load-bearing elsewhere — `useHostDriver`'s scheduling effect gates
on it to avoid arming a phase timer it could not broadcast — so the fix stays
at the one call site whose message is both unrepeatable and unrecoverable,
rather than changing what "ready" means for every consumer.

## Consequences

The lobby roster no longer depends on the joiner winning a race against its own
websocket, which is what makes the game playable against a remote database at
all — the only deployment where phones and TVs can join.

Two obligations follow.

**Any future fire-and-forget `channel.send` must ask whether its message is
recoverable.** The host's `phase` broadcasts are not at risk for a different
reason than luck: the host has been in the room since before the first phase
exists, and a missed phase event is corrected by the next one. `player_joined`
had neither property — it is sent seconds after page load, and it is the only
notice that will ever be given. A new broadcast with that shape needs the same
outbox, and `channel?.send` at a site like that is a bug, not a guard.

**Latency is now part of what the e2e suite tests.** `e2e/join-race.spec.ts`
pins this by giving the joiner 600ms of CDP-emulated latency, which puts the
handshake behind the click deterministically on the local stack — the ordering
that only a remote project produced before. A regression here fails locally
instead of silently waiting for the next cloud run.
