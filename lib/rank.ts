import type { Tier } from './types';

export function speedPoints(timeRemainingMs: number, timerMs: number, tier: Tier): number {
  return Math.floor((timeRemainingMs / timerMs) * 100) * tier;
}

export function estimateDurationSeconds(totalQuestions: number, timerSeconds: number): number {
  return 3 + totalQuestions * (3 + timerSeconds + 5 + 4);
}

export const TIER_NAMES: Record<Tier, string> = {
  1: 'Warm-Up', 2: 'Double Shot', 3: 'Crunch Time', 4: 'Final Boss',
};

export const CATEGORIES = [
  { key: 'screen-break', label: 'Screen Break', emoji: '🎬' },
  { key: 'ai-tech', label: 'AI & Tech', emoji: '🤖' },
  { key: 'corporate', label: 'Corporate Survival', emoji: '💼' },
  { key: 'rewind', label: 'Rewind', emoji: '📼' },
  { key: 'online', label: 'Extremely Online', emoji: '🐸' },
  { key: 'fuel', label: 'Fuel', emoji: '☕' },
];
