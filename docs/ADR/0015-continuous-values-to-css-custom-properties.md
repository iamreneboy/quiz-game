# ADR-0015: Continuous presentation values go to CSS custom properties; only quantized state enters React

- **Status:** Accepted
- **Date:** 2026-08-23
- **Phase:** P3a — Round staging

## Context

ANSWER needs two continuously-updating visuals: the countdown ring's sweep and a closing vignette that ramps with tension. The M1 `TimerRing` this phase replaced ran its own `setInterval`/rAF loop and pushed the fraction through React state every tick — functionally correct, but a re-render on every frame for a value nothing else needs to react to synchronously.

## Decision

`lib/staging/runtime.ts` runs the *only* rAF loop for the question surface. Each tick writes two raw values straight to `document.documentElement.style` — `--tension` (the 0..1 escalation ramp) and `--timer-frac` (remaining/total for the ring's `stroke-dashoffset`) — bypassing React and Zustand entirely. The same tick computes `stagingAt(...)` and calls `useStaging`'s `publish()`, which only actually updates the store when `sameStaging()` says something *quantized* changed: the whole-second `secondsLeft`, the 0–3 `tensionStep`, or a `StageSteps` boolean.

## Consequences

- Measured live with the dev-only `window.__staging` probe (Task 4's exit criterion): roughly ten `useStaging` publishes over a ten-second window during ANSWER — driven by `secondsLeft` ticking once a second, plus the rare `tensionStep` crossing — against the ~600 a naive 60fps `setState` loop would produce. `TimerRing` and any other `useStaging` consumer re-render on the order of once a second, not once a frame.
- `TensionFrame` never re-renders while mounted, by construction: it reads `beat` once (to decide whether it exists at all during ANSWER) and its entire visual life afterward is the `--tension` custom property consumed through a CSS `calc()`. A future change that adds another `useStaging` selector to it should be treated as suspect — that re-render is exactly what this design avoids.
- The freeze-on-lock behavior (spec §4: "you are out of the decision, but the room is not") falls directly out of this split. `runtime.ts` writes `--timer-frac` unconditionally every tick, but returns *before* computing `--tension` once `myAnswer !== null` — so the vignette holds at whatever intensity it last had while the ring keeps sweeping for players still deciding. The asymmetry is one `if` above the tension write, not two parallel code paths.
- Under the `reduced` profile, the ticker writes `tensionStep(raw) / 3` instead of the raw ramp — three discrete levels rather than a continuum — because `[data-profile='reduced']` already forces every CSS transition to ~0 duration globally, so a continuous per-frame write there would be real work with no perceptible result.
- Anything that needs the live ramp outside `runtime.ts` must read the CSS variable directly (`getComputedStyle(document.documentElement).getPropertyValue('--tension')`), never add a new field to `StagingState` for it — that would reintroduce the per-frame re-render this ADR exists to prevent.
