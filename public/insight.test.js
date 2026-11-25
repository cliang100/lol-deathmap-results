import { deathZone, topZoneInsight } from './insight.js';
import { describe, it, expect } from 'vitest';

describe('deathZone', () => {
  it.each([
    [1000, 1000, 'your base'],
    [14000, 14000, 'the enemy base'],
    [1200, 10400, 'top lane'],
    [10500, 1000, 'bot lane'],
    [7400, 7400, 'mid lane'],
    [4800, 10000, 'the river'],
    [3800, 7900, 'your jungle'],
    [11000, 7000, 'the enemy jungle'],
  ])('puts (%i, %i) in %s for blue side', (x, y, zone) => {
    expect(deathZone(x, y, 100)).toBe(zone);
  });

  it('flips sides for red', () => {
    expect(deathZone(3800, 7900, 200)).toBe('the enemy jungle');
    expect(deathZone(1000, 1000, 200)).toBe('the enemy base');
  });
});

describe('topZoneInsight', () => {
  const matches = [{ matchId: 'm1', teamId: 100 }];
  const death = (x, y, time) => ({ x, y, time, matchId: 'm1' });

  it('names the most common zone in the chosen phase', () => {
    const deaths = [
      ...Array.from({ length: 3 }, () => death(11000, 7000, '5:00')),
      death(7400, 7400, '6:00'),
      death(1200, 10400, '7:00'),
      death(7400, 7400, '30:00'),
    ];
    expect(topZoneInsight(deaths, matches, 'early')).toBe('60% of your early-game deaths (3 of 5) were in the enemy jungle.');
  });

  it('stays quiet with too few deaths', () => {
    expect(topZoneInsight([death(7400, 7400, '5:00')], matches)).toBe('');
  });
});
