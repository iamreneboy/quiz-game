import { describe, it, expect } from 'vitest';
import { OPTION_IDENTITIES } from '@/lib/staging/options';

/**
 * A characterization test: it pins the table to exactly what
 * components/AnswerButtons.tsx shipped, so the extraction cannot silently
 * reorder or restyle anything the player surface already renders.
 */
describe('OPTION_IDENTITIES', () => {
  it('is the four shipped identities, in order', () => {
    expect(OPTION_IDENTITIES).toEqual([
      { glyph: '▲', accent: 'var(--color-neon-cyan)' },
      { glyph: '◆', accent: 'var(--color-neon-magenta)' },
      { glyph: '●', accent: 'var(--color-neon-lime)' },
      { glyph: '■', accent: 'var(--color-warning)' },
    ]);
  });

  it('gives every index a distinct glyph and a distinct accent', () => {
    const glyphs = OPTION_IDENTITIES.map(o => o.glyph);
    const accents = OPTION_IDENTITIES.map(o => o.accent);
    expect(new Set(glyphs).size).toBe(OPTION_IDENTITIES.length);
    expect(new Set(accents).size).toBe(OPTION_IDENTITIES.length);
  });

  it('covers the maximum option count', () => {
    // Four options per question (lib/types.ts QuestionPublic). A fifth option
    // would read `undefined.glyph` at the render site on both surfaces.
    expect(OPTION_IDENTITIES).toHaveLength(4);
  });
});
