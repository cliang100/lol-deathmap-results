import { computeDeathStats } from './deathStats.js';
import { describe, it, expect } from 'vitest';

describe('computeDeathStats', () => {
  it('returns defaults for an empty array', () => {
    expect(computeDeathStats([])).toEqual({
      matchCount: 0,
      killerCounts: {},
      topKiller: '--',
      topCount: 0,
    });
  });

  it('handles a single death', () => {
    expect(computeDeathStats([{ matchId: 'm1', killedBy: 'Zed' }])).toEqual({
      matchCount: 1,
      killerCounts: { Zed: 1 },
      topKiller: 'Zed',
      topCount: 1,
    });
  });

  it('lets the first killer to reach the max win ties', () => {
    const deaths = [
      { matchId: 'm1', killedBy: 'Zed' },
      { matchId: 'm1', killedBy: 'Ahri' },
      { matchId: 'm2', killedBy: 'Zed' },
      { matchId: 'm2', killedBy: 'Ahri' },
    ];
    const { topKiller, topCount } = computeDeathStats(deaths);
    expect(topKiller).toBe('Zed');
    expect(topCount).toBe(2);
  });

  it('counts unique matchIds across multiple matches', () => {
    const deaths = [
      { matchId: 'm1', killedBy: 'Zed' },
      { matchId: 'm1', killedBy: 'Zed' },
      { matchId: 'm2', killedBy: 'Ahri' },
      { matchId: 'm3', killedBy: 'Ahri' },
    ];
    const { matchCount, killerCounts } = computeDeathStats(deaths);
    expect(matchCount).toBe(3);
    expect(killerCounts).toEqual({ Zed: 2, Ahri: 2 });
  });
});
