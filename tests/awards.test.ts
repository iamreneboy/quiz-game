import { describe, it, expect } from 'vitest';
import { AWARD_META, AWARD_ORDER, awardValueText, describeAwards } from '@/lib/awards';

const winner = (id: string) => ({
  player_id: id, nickname: id.toUpperCase(), avatar: 'duck', color: '#f59e0b',
});

describe('AWARD_ORDER and AWARD_META', () => {
  it('is PRD §5.4.4 order, and every key has copy', () => {
    expect(AWARD_ORDER).toEqual(['big-brain', 'fastest-gun', 'hot-streak', 'late-surge']);
    for (const key of AWARD_ORDER) {
      expect(AWARD_META[key].label.length).toBeGreaterThan(0);
      expect(AWARD_META[key].emoji.length).toBeGreaterThan(0);
      expect(AWARD_META[key].blurb.length).toBeGreaterThan(0);
    }
  });
});

describe('awardValueText', () => {
  it('quotes each award in its own unit', () => {
    expect(awardValueText('big-brain', 9)).toBe('9 correct');
    expect(awardValueText('fastest-gun', 640)).toBe('640 speed points');
    expect(awardValueText('hot-streak', 5)).toBe('5 in a row');
    expect(awardValueText('late-surge', 3)).toBe('3 places gained');
  });

  it('does not say "1 places gained"', () => {
    expect(awardValueText('late-surge', 1)).toBe('1 place gained');
  });
});

describe('describeAwards', () => {
  const big = { key: 'big-brain', value: 9, winners: [winner('a')] };
  const gun = { key: 'fastest-gun', value: 640, winners: [winner('b')] };

  it('returns awards in AWARD_ORDER regardless of arrival order', () => {
    expect(describeAwards([gun, big]).map(a => a.key)).toEqual(['big-brain', 'fastest-gun']);
  });

  it('keeps every winner of a tied award, in the order given', () => {
    const tied = { key: 'hot-streak', value: 4, winners: [winner('a'), winner('b')] };
    expect(describeAwards([tied])[0].winners.map(w => w.nickname)).toEqual(['A', 'B']);
  });

  it('drops an award key it does not know, rather than throwing', () => {
    expect(describeAwards([big, { key: 'best-hat', value: 1, winners: [winner('a')] }]))
      .toHaveLength(1);
  });

  it('drops an award with no winners — nobody earned it', () => {
    expect(describeAwards([{ key: 'big-brain', value: 3, winners: [] }])).toEqual([]);
  });

  it('treats anything that is not an array as no awards at all', () => {
    expect(describeAwards(null)).toEqual([]);
    expect(describeAwards(undefined)).toEqual([]);
    expect(describeAwards({ key: 'big-brain' })).toEqual([]);
  });
});
