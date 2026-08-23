import { describe, it, expect } from 'vitest';
import { LEADER_EMPHASIS, flairFor, streakTierFor, type FlairStanding } from '@/lib/world/flair';
import { markerAnchors, trackMetrics } from '@/lib/world/geometry';

const metrics = trackMetrics(12);

function standing(id: string, correct: number, speed = 0): FlairStanding {
  return { player_id: id, correct, speed_points: speed, current_streak: 0 };
}

describe('the start-line gate', () => {
  it('awards nothing while everyone is still on zero', () => {
    const standings = [standing('a', 0), standing('b', 0), standing('c', 0)];
    const flair = flairFor(standings, markerAnchors(standings, metrics));
    for (const id of ['a', 'b', 'c']) {
      expect(flair.get(id)).toEqual({ medal: null, emphasis: 1, edgeHolder: false, streakTier: 0 });
    }
  });

  it('activates as soon as one player has advanced', () => {
    const standings = [standing('a', 1), standing('b', 0), standing('c', 0)];
    const flair = flairFor(standings, markerAnchors(standings, metrics));
    expect(flair.get('a')!.medal).toBe('gold');
    expect(flair.get('a')!.emphasis).toBe(LEADER_EMPHASIS);
  });
});

describe('medals', () => {
  it('follows standings order for the top three', () => {
    const standings = [standing('a', 3), standing('b', 2), standing('c', 1), standing('d', 0)];
    const flair = flairFor(standings, markerAnchors(standings, metrics));
    expect(flair.get('a')!.medal).toBe('gold');
    expect(flair.get('b')!.medal).toBe('silver');
    expect(flair.get('c')!.medal).toBe('bronze');
    expect(flair.get('d')!.medal).toBeNull();
  });

  it('handles a field smaller than the podium', () => {
    const standings = [standing('a', 2), standing('b', 1)];
    const flair = flairFor(standings, markerAnchors(standings, metrics));
    expect(flair.get('a')!.medal).toBe('gold');
    expect(flair.get('b')!.medal).toBe('silver');
  });
});

describe('leader emphasis', () => {
  it('enlarges only the leader', () => {
    const standings = [standing('a', 3), standing('b', 2)];
    const flair = flairFor(standings, markerAnchors(standings, metrics));
    expect(flair.get('a')!.emphasis).toBe(LEADER_EMPHASIS);
    expect(flair.get('b')!.emphasis).toBe(1);
  });
});

describe('the turbo flame', () => {
  it('goes to the row-0 holder when a segment is contested', () => {
    const standings = [standing('a', 2, 300), standing('b', 2, 100), standing('c', 1)];
    const flair = flairFor(standings, markerAnchors(standings, metrics));
    expect(flair.get('a')!.edgeHolder).toBe(true);
    expect(flair.get('b')!.edgeHolder).toBe(false);
  });

  it('is withheld from a player alone on a segment', () => {
    const standings = [standing('a', 2, 300), standing('b', 1, 100)];
    const flair = flairFor(standings, markerAnchors(standings, metrics));
    expect(flair.get('a')!.edgeHolder).toBe(false);
    expect(flair.get('b')!.edgeHolder).toBe(false);
  });
});

describe('streak tier', () => {
  it('maps a run to its VFX tier at the published milestones', () => {
    expect(streakTierFor(0)).toBe(0);
    expect(streakTierFor(2)).toBe(0);
    expect(streakTierFor(3)).toBe(3);
    expect(streakTierFor(4)).toBe(3);
    expect(streakTierFor(5)).toBe(5);
    expect(streakTierFor(7)).toBe(5);
    expect(streakTierFor(8)).toBe(8);
    expect(streakTierFor(12)).toBe(8);
  });

  it('derives the tier from standings, so it survives a reload with no cue history', () => {
    const standings: FlairStanding[] = [
      { player_id: 'a', correct: 6, speed_points: 10, current_streak: 5 },
      { player_id: 'b', correct: 3, speed_points: 5, current_streak: 0 },
    ];
    const flair = flairFor(standings, markerAnchors(standings, metrics));
    expect(flair.get('a')!.streakTier).toBe(5);
    expect(flair.get('b')!.streakTier).toBe(0);
  });

  it('awards no streak flame before anyone has advanced', () => {
    const standings: FlairStanding[] = [
      { player_id: 'a', correct: 0, speed_points: 0, current_streak: 0 },
      { player_id: 'b', correct: 0, speed_points: 0, current_streak: 0 },
    ];
    const flair = flairFor(standings, markerAnchors(standings, metrics));
    expect(flair.get('a')!.streakTier).toBe(0);
  });
});
