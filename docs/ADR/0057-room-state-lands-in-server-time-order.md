# ADR-0057: Room state lands in server-time order, or not at all

- **Status:** Accepted
- **Date:** 2026-09-04
- **Phase:** post-M3 (M3 P2a / P6a debt)

## Context

A client learns the room's state two ways: the `get_room_state` SNAPSHOT it
fetches whenever its channel reports SUBSCRIBED, and the phase EVENTS the host
broadcasts. Both are stamped by the same clock — Postgres' `now()`, carried as
`server_now` — and neither arrives on time. The snapshot is a round trip
(≈100ms against the cloud project) and a broadcast can land at any point inside
it.

M3 P2a recorded the symptom: *"a reload that lands exactly on a phase boundary
can resubscribe after the broadcast and sit on stale staging until the next
phase event"*, reproduced twice with `steps.optionsMode` stuck at `dim` through
a whole 20s ANSWER. It also recorded the presumed fix — re-fetch
`get_room_state` once after SUBSCRIBED — which turned out to have been in
`lib/useRoomChannel.ts` since `d885acb`, three commits before the bug was
observed. Re-fetching is necessary and was never sufficient: a fetch that
recovers a missed event can equally well *undo* one, because a snapshot read at
T1 and applied at T2 overwrites everything that happened between them.

Two orderings did exactly that, and both look identical from the outside —
stale staging until the next phase event:

1. **An event applied during a fetch, then overwritten by it.** Only the very
   first subscribe held incoming events; every re-SUBSCRIBED (the socket rejoins
   after any reconnect, and the join push's `receive('ok')` hook fires again)
   applied them straight into the path of its own in-flight fetch.
2. **A torn-down channel's fetch still writing.** React StrictMode remounts
   every effect once in `next dev` — the environment the bug was observed in —
   so a reload reliably leaves one abandoned `get_room_state` in flight, which
   resolves after the live channel has caught up and puts the client back.

A third failure had no ordering in it at all: a single failed fetch (any
network blip) left the client on "Connecting…" for the rest of the race,
because `applyPhaseEvent` no-ops while `room` is null and nothing retried.
The same code also read *every* failure as "this room does not exist".

## Decision

**Nothing may be applied that is stamped earlier than what has already been
applied.** `lib/roomSync.ts` keeps a watermark of the newest `server_now`
applied and gates both wires against it: events arriving during a fetch are
held and replayed after the snapshot, a snapshot older than an applied event is
rejected outright, and a held event the snapshot already contains is dropped
rather than replayed. The whole rule is pure and synchronous — the hook owns
the network and the store, the gate owns the ordering.

Around it, three supporting rules in `lib/useRoomChannel.ts`:

- Every SUBSCRIBED resyncs, not just the first — a rejoin is exactly when the
  client is most likely to have missed something.
- A channel's teardown cancels its own in-flight fetch (`cancelled`), so an
  abandoned channel can never write into its replacement's store.
- Only PostgREST's P0001 `room not found` is a verdict (`isRoomMissingError`).
  Everything else is transient: retried with a short backoff, and never
  reported to the player as a missing room.

## Consequences

Ordering is now a property of one 40-line pure module with unit tests
(`tests/roomSync.test.ts`) rather than of the sequence of statements inside an
async callback, which is what made the original bug invisible to review — the
callback *looked* correct, and was, for the one ordering it considered.

The watermark trusts one clock. That is sound today because both wires are
stamped server-side by the same database; anything that ever stamps state
client-side, or from a second database, breaks the comparison silently. State
carrying no readable `server_now` is deliberately never treated as stale —
dropping state we cannot place is worse than applying it out of order, because
only one of those is recoverable.

One consequence worth knowing: a snapshot rejected as stale leaves the store
untouched, so the hook applies one anyway while `room` is still null (events
applied against a null room were no-ops, so the watermark can legitimately run
ahead of a store that knows nothing). Anything that adds a second writer of
room state must respect that pairing, or a client can strand itself on
"Connecting…" with a watermark it can never satisfy.

The player route now reads `roomMissing` (P6a left that "a separate
improvement"), but only for a browser that already holds a session — a browser
without one has a join form, and `join_room` tells it "room not found" inline.
