# ADR-0016: Staging never gates input — the server phase is the sole interaction authority

- **Status:** Accepted
- **Date:** 2026-08-23
- **Phase:** P3a — Round staging

## Context

READ stages its options in dimmed and disabled before ANSWER makes them live, and the transition between the two is a decorative 120ms `cut`. Because `submit_answer` pays speed points from server-measured `time_remaining_ms` on a server-authoritative timer, any client-side delay between "the server says ANSWER has begun" and "the button actually accepts a tap" quietly costs the player time they can never get back and are never told about.

## Decision

Whether an answer button is interactive is `!live || lockedChoice !== null || spectating`, where `live` is `steps.optionsLive` — true the instant `beatFor(phase) === 'answer'`, with no elapsed threshold, no animation-completion check, and no dependency on `tensionStep` or anything else that exists purely for sequencing visuals. `stepsAt('answer', 0)` already returns `optionsLive: true` unconditionally; unlike READ's badges/question/options, there is no "arrives at Nms" rule for it to gate on. A phase change is never held for anything mid-flight — a running `motion` transition cuts to its end state on the next tick rather than being awaited before input is accepted.

## Consequences

- The 120ms brightening `cut` from dimmed-READ to live-ANSWER is purely decorative. A tap that lands during that window hits a genuinely enabled `<button disabled={false}>`, confirmed live by pressing a `1`–`4` shortcut and clicking the button itself at the instant `live` flips.
- This composes with ADR-0014's reload fix rather than needing its own case: a client reloading or joining mid-ANSWER computes `live === true` on its very first render (the bootstrap publish runs before React ever paints), so it never shows a false "still catching up" disabled state to a player who is, in fact, free to answer.
- The same rule is why a non-playing MC's buttons and a locked player's other three options are disabled through this one boolean rather than through a visual state alone — `spectating` and `lockedChoice !== null` sit in the identical expression as `!live`, so there is exactly one gate to reason about, not one gate plus a visual convention someone could rely on by mistake.
- P3b, which adds REVEAL/TRACK choreography and (per spec §9) may open the realtime protocol, must preserve this asymmetry: staging state may lag, animate, or hold at an end state, but whatever decides if an RPC call is attempted has to read the room phase (or a value with no additional timing condition layered on it) — never a value that exists to sequence an animation.
