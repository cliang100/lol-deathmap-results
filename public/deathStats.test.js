import { computeDeathStats } from './deathStats.js';
import { describe, it, expect } from 'vitest';

describe('computeDeathStats', () => {
  it('returns defaults for an empty array', () => {
    expect(computeDeathStats([])).toEqual({
      killerCounts: {},
      topKiller: '--',
      topCount: 0,
    });
  });

  it('handles a single death', () => {
    expect(computeDeathStats([{ matchId: 'm1', killedBy: 'Zed' }])).toEqual({
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

  it('ignores executions, which have no killer', () => {
    const deaths = [
      { matchId: 'm1' },
      { matchId: 'm2' },
      { matchId: 'm3', killedBy: 'Ahri' },
    ];
    const { topKiller, killerCounts } = computeDeathStats(deaths);
    expect(topKiller).toBe('Ahri');
    expect(killerCounts).toEqual({ Ahri: 1 });
  });
});
