import { parseClock, computeMatchStats, computeDeathTiming, EARLY_GAME_END_SEC, MID_GAME_END_SEC } from './matchStats.js';
import { describe, it, expect } from 'vitest';

describe('parseClock', () => {
  it('converts m:ss to seconds', () => {
    expect(parseClock('1:05')).toBe(65);
    expect(parseClock('0:00')).toBe(0);
    expect(parseClock('62:03')).toBe(3723);
  });

  it('returns 0 for malformed input', () => {
    expect(parseClock('nope')).toBe(0);
    expect(parseClock('1:60')).toBe(0);
    expect(parseClock('1:5.5')).toBe(0);
    expect(parseClock('')).toBe(0);
    expect(parseClock(null)).toBe(0);
    expect(parseClock(65)).toBe(0);
  });
});

describe('computeMatchStats', () => {
  it('returns all zeros for an empty array', () => {
    expect(computeMatchStats([])).toEqual({
      games: 0, wins: 0, winRate: 0, avgKills: 0, avgDeaths: 0, avgAssists: 0, avgKda: 0,
    });
  });

  it('computes a normal case', () => {
    const matches = [
      { win: true, kills: 5, deaths: 1, assists: 7 },
      { win: false, kills: 2, deaths: 6, assists: 3 },
    ];
    const stats = computeMatchStats(matches);
    expect(stats.games).toBe(2);
    expect(stats.wins).toBe(1);
    expect(stats.winRate).toBe(50);
    expect(stats.avgKills).toBe(3.5);
    expect(stats.avgDeaths).toBe(3.5);
    expect(stats.avgAssists).toBe(5);
    expect(stats.avgKda).toBeCloseTo((5 + 2 + 7 + 3) / 7);
  });
});

describe('computeDeathTiming', () => {
  it('returns zeros for no deaths', () => {
    expect(computeDeathTiming([], 3)).toEqual({
      avgDeathsPerGame: 0, avgDeathTimeSec: 0, early: 0, mid: 0, late: 0,
    });
  });

  it('returns zeros when gameCount is 0', () => {
    expect(computeDeathTiming([{ time: '1:00' }], 0).avgDeathsPerGame).toBe(0);
  });

  it('computes a normal case', () => {
    const deaths = [
      { time: '5:00' },
      { time: '15:00' },
      { time: '30:00' },
    ];
    expect(computeDeathTiming(deaths, 2)).toEqual({
      avgDeathsPerGame: 1.5,
      avgDeathTimeSec: (300 + 900 + 1800) / 3,
      early: 1, mid: 1, late: 1,
    });
  });

  it('places exactly 840s in mid and exactly 1500s in late', () => {
    expect(EARLY_GAME_END_SEC).toBe(840);
    expect(MID_GAME_END_SEC).toBe(1500);
    const result = computeDeathTiming([{ time: '14:00' }, { time: '25:00' }], 2);
    expect(result.early).toBe(0);
    expect(result.mid).toBe(1);
    expect(result.late).toBe(1);
  });
});
