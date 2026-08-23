/**
 * The option identity table (P3a decision 6).
 *
 * Accents are fixed BY INDEX, not by content, so ▲ is always cyan across every
 * question in every round. Shape carries the identity, so nothing that renders
 * these depends on colour alone.
 *
 * Shared by the player surface (components/AnswerButtons.tsx) and the stage
 * surface (components/stage/StageOptions.tsx). It lives here rather than in
 * either component because two copies would eventually disagree about which
 * glyph option 2 gets on the TV, and no test would be looking.
 */
export interface OptionIdentity {
  glyph: string;
  accent: string;
}

export const OPTION_IDENTITIES: readonly OptionIdentity[] = [
  { glyph: '▲', accent: 'var(--color-neon-cyan)' },
  { glyph: '◆', accent: 'var(--color-neon-magenta)' },
  { glyph: '●', accent: 'var(--color-neon-lime)' },
  { glyph: '■', accent: 'var(--color-warning)' },
];
