import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "No screen left outside the design system" (M3 roadmap §3, P5 exit criteria),
 * kept true by a scan rather than by a review habit.
 *
 * app/globals.css's @theme block is the source of truth for colour: every
 * surface, ink, accent, semantic and medal has a token name. A raw Tailwind
 * palette class is therefore always a screen that has drifted out of the
 * system — exactly the defect M3 P5a closed on components/LobbyView.tsx, the
 * last M1-era screen.
 *
 * Deliberately narrow: it matches Tailwind's own palette families only, so
 * `text-neon-cyan`, `bg-white/5`, `border-haze/50` and arbitrary values are all
 * untouched. A genuinely new colour is a new token in globals.css, not a
 * `text-sky-400`.
 */
const PALETTE_FAMILIES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow',
  'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet',
  'purple', 'fuchsia', 'pink', 'rose',
].join('|');
const PREFIXES = [
  'bg', 'text', 'border', 'from', 'via', 'to', 'ring', 'outline', 'shadow',
  'fill', 'stroke', 'decoration', 'accent', 'caret', 'divide', 'placeholder',
].join('|');
const RAW_PALETTE = new RegExp(`\\b(?:${PREFIXES})-(?:${PALETTE_FAMILIES})-\\d{2,3}\\b`, 'g');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

describe('the design system covers every screen', () => {
  it('has no raw Tailwind palette classes in components/ or app/', () => {
    const offences: string[] = [];
    for (const file of [...tsxFiles('components'), ...tsxFiles('app')]) {
      for (const match of readFileSync(file, 'utf8').matchAll(RAW_PALETTE)) {
        offences.push(`${file}: ${match[0]}`);
      }
    }
    expect(offences).toEqual([]);
  });
});
