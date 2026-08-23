# ADR-0022: `answer-resolved` is derived, not inferred

- **Status:** Accepted
- **Date:** 2026-08-23
- **Phase:** P4 — Audio identity

## Context

P4 needs a correct/wrong stinger. Nothing in the P0 cue vocabulary says whether
the *local* player got it right: `phase-reveal` carries `correctIndex` for the
room, `player-advanced` fires for every player whose score moved (not "me"
specifically), and a wrong answer produces no standings-drama cue at all.
ADR-0001 makes extending the closed `Cue` union a considered change.

## Decision

Add `answer-resolved`, derived in `deriveCues`'s `reveal` branch from
`myAnswer` and `reveal.correct_index` — both already present in `CueSource`.
`answered` is a separate field from `correct` so that "did not answer" is
distinguishable at the call site and can be handled silently rather than
folded into `correct: false`.

## Consequences

The verdict is unit-tested in the one pure module that already owns "what
just happened", and P5/P6 inherit it for free. The alternative — the audio
runtime reading the session id and inferring the verdict from the reveal
batch — would be order-dependent inference inside a module that is
untestable by design, and would be reimplemented by every future consumer
that needs the same answer.

`answer-resolved` is emitted on the seed path too (a reload lands mid-reveal
with the cue already in the seed batch), which is correct: a reloaded client
does know the verdict. What stops it from being *performed* — no correct/wrong
stinger playing on every reload — is P4's catch-up rule (ADR-0024), not a
restriction on when this cue fires.
