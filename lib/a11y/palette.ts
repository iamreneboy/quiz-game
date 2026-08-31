/**
 * The palette, and where it is painted (M3 P5b).
 *
 * HAND-MIRRORED from the @theme block in app/globals.css, in the same
 * tradition as lib/presentation/tokens.ts — which mirrors the canvas-relevant
 * subset and deliberately holds no ink token, so the two do not overlap and
 * neither is generated.
 *
 * `GROUNDS` is the mirror's second half and the part a token table alone
 * cannot supply: the app paints translucent surfaces, so the ground a label
 * actually sits on is a COMPOSITE. `bg-night/60` over the page's void is
 * #0d1025, which is neither token.
 *
 * Every ground below was enumerated from the source (`grep -rhoE
 * "bg-(void|abyss|night|dusk|haze)(/[0-9]+)?" components/ app/`), not
 * assumed — the alpha steps the app actually uses turned out finer than a
 * first pass over the plan would suggest (six distinct abyss alphas alone),
 * so each distinct alpha that carries ink-token text directly gets its own
 * named composite rather than being rounded to a neighbour.
 *
 * `TEXT_USAGE` says which grounds each ink token is painted on. It is
 * hand-maintained, and tests/a11y.test.ts guards it from both directions: a
 * wrong value fails the contrast assertions, and a missing row fails the
 * source scan. `ink` and `ink-dim` are checked against every ground in the
 * table — both have wide margins, so this is cheap completeness rather than
 * precision-critical; `ink-mute` is the tight one and its ground list is
 * exact.
 *
 * Excluded on purpose, with no GROUNDS entry:
 * - `bg-haze/70` (a 1px rule on the landing page) and `bg-void/10` (JoinQr's
 *   empty-state placeholder) carry no text at all.
 * - `bg-void/70` (PauseCard's outer backdrop) carries no text DIRECTLY — the
 *   card's text sits in a nested `bg-night/80` panel, which is `card` below.
 * - `bg-haze/30` (ResultsView's hover state on "Back to home") carries
 *   `text-neon-cyan`, an accent, not an ink token.
 * - `bg-void/85` (PerfOverlay, `overlay` below) and `bg-void/95` (StageGate)
 *   both composite to the *same value* as `page`, because compositing void
 *   into void is void at any alpha — the backdrop behind both is the page
 *   itself. `overlay` is kept as a named alias for source traceability, the
 *   same way the original audit already treated it; `void/95` needs no
 *   second alias and is covered by `page`.
 */
import { blend } from './contrast';

export const TOKENS: Record<string, string> = {
  // Surfaces
  void: '#05060f',
  abyss: '#0a0c1c',
  night: '#121734',
  dusk: '#1c2350',
  haze: '#2b3370',
  // Ink — NOTE: `ink-mute` was lifted from #6d75ab in M3 P5b; see ADR-0055.
  ink: '#eaeeff',
  'ink-dim': '#a6adde',
  'ink-mute': '#767eb9',
  // Accents
  'neon-cyan': '#35f2ff',
  'neon-magenta': '#ff4fd8',
  'neon-lime': '#c6ff4a',
  // Semantics
  correct: '#3ce69b',
  wrong: '#ff5d73',
  warning: '#ffb43d',
  // Medals
  gold: '#ffd166',
  silver: '#d5dcee',
  bronze: '#e08a4c',
};

/** The composited surfaces the app actually paints text on. */
export const GROUNDS = {
  page: TOKENS.void,
  overlay: blend(TOKENS.void, TOKENS.void, 0.85),
  abyss: TOKENS.abyss,
  abyssHalf: blend(TOKENS.abyss, TOKENS.void, 0.5), // bg-abyss/50 — PhotoFinish's untied row
  abyss60: blend(TOKENS.abyss, TOKENS.void, 0.6), // bg-abyss/60 — RematchCard, host/new tier rows, SuddenDeathBanner, StageShell's landscape header
  abyss70: blend(TOKENS.abyss, TOKENS.void, 0.7), // bg-abyss/70 — Input, RevealPanel, StageJoinPanel
  abyssPanel: blend(TOKENS.abyss, TOKENS.void, 0.75), // bg-abyss/75 — TrackReadout's track panel
  abyss80: blend(TOKENS.abyss, TOKENS.void, 0.8), // bg-abyss/80 — LowerThird's card variant, Select
  abyss90: blend(TOKENS.abyss, TOKENS.void, 0.9), // bg-abyss/90 — HostControlStrip
  night: TOKENS.night,
  panel: blend(TOKENS.night, TOKENS.void, 0.55), // bg-night/55 — Panel, the app's most common card
  option: blend(TOKENS.night, TOKENS.void, 0.6), // bg-night/60 — AnswerButtons, StageOptions, LobbyView roster, Button ghost
  night70: blend(TOKENS.night, TOKENS.void, 0.7), // bg-night/70 — SettingsControl's gear button
  card: blend(TOKENS.night, TOKENS.void, 0.8), // bg-night/80 — PauseCard's inner panel
  rowHighlight: blend(TOKENS.haze, TOKENS.void, 0.25), // bg-haze/25 — the "you are here" row
  chipDropped: blend(TOKENS.haze, TOKENS.void, 0.4), // bg-haze/40 — PlayerConnection's dropped-player chip (M3 P5b's finding)
  chip: blend(TOKENS.haze, TOKENS.void, 0.45), // bg-haze/45 — DrawCard, QuestionCard, StageBroadcast category chips
} as const;

export const AA_SMALL = 4.5;
export const AA_LARGE = 3;
export const AA_NON_TEXT = 3;

const ALL_GROUNDS = Object.keys(GROUNDS) as (keyof typeof GROUNDS)[];

/**
 * Every ink token, and the grounds it is painted on.
 *
 * All three are `small`: this app's micro-labels are 11px uppercase, which is
 * small text under WCAG however bold it is, and the largest ink-dim text
 * (`text-lg`) is still under the 24px large-text threshold.
 */
export const TEXT_USAGE: Record<
  string,
  { grounds: (keyof typeof GROUNDS)[]; size: 'small' | 'large' }
> = {
  ink: { grounds: ALL_GROUNDS, size: 'small' },
  'ink-dim': { grounds: ALL_GROUNDS, size: 'small' },
  'ink-mute': {
    // NOT `chip` or `chipDropped`: components/PlayerConnection.tsx used to put
    // ink-mute on a haze ground and was moved to ink-dim in M3 P5b, because no
    // ink-mute value that still reads as muted clears AA on haze at all — the
    // app's other haze chips (DrawCard, QuestionCard, StageBroadcast) already
    // use ink-dim, never ink-mute, for the same reason.
    grounds: ALL_GROUNDS.filter(g => g !== 'chip' && g !== 'chipDropped'),
    size: 'small',
  },
};
