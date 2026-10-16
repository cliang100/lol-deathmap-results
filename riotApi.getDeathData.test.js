import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { redisGet, redisSet } = vi.hoisted(() => ({
  redisGet: vi.fn(),
  redisSet: vi.fn(),
}));

vi.mock('@upstash/redis', () => {
  class FakeRedis {
    get = redisGet;
    set = redisSet;
  }
  return { Redis: FakeRedis };
});

import { getDeathData } from './riotApi.js';

const PUUID = 'test-puuid-123';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

function routeFetch(routes) {
  return vi.fn(async (url) => {
    for (const [match, response] of routes) {
      if (url.includes(match)) return response;
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

beforeEach(() => {
  redisGet.mockReset().mockResolvedValue(null);
  redisSet.mockReset().mockResolvedValue('OK');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getDeathData', () => {
  it('cache hit returns the cached value with zero fetch calls', async () => {
    const cached = { profile: { name: 'Cached' }, deaths: [] };
    redisGet.mockResolvedValue(cached);
    const fetchMock = vi.fn(async () => {
      throw new Error('fetch should not be called on cache hit');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getDeathData('SomeName', 'TAG', 'na1');

    expect(result).toEqual(cached);
    expect(redisGet).toHaveBeenCalledWith('somename#tag#na1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws "Account not found: name#tag" when the account fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch([['by-riot-id', jsonResponse({ message: 'not found' }, { ok: false, status: 404 })]])
    );

    await expect(getDeathData('Nope', 'NA1', 'na1')).rejects.toThrow('Account not found: Nope#NA1');
    expect(redisSet).not.toHaveBeenCalled();
  });

  it('throws a rate-limit error with status 429 when the account fetch is rate limited', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch([['by-riot-id', jsonResponse({ message: 'rate limited' }, { ok: false, status: 429 })]])
    );

    const err = await getDeathData('Someone', 'EUW', 'euw1').catch(e => e);
    expect(err.message).toBe('Rate limited by Riot API. Please try again shortly.');
    expect(err.status).toBe(429);
    expect(redisSet).not.toHaveBeenCalled();
  });

  it('throws a rate-limit error with status 429 when the match-list fetch is rate limited', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch([
        ['by-riot-id', jsonResponse({ puuid: PUUID, gameName: 'TestName', tagLine: 'T1' })],
        ['summoners/by-puuid', jsonResponse({ summonerLevel: 100, profileIconId: 1 })],
        ['entries/by-puuid', jsonResponse([])],
        ['/ids?', jsonResponse({ message: 'rate limited' }, { ok: false, status: 429 })],
      ])
    );

    const err = await getDeathData('TestName', 'T1', 'na1').catch(e => e);
    expect(err.message).toBe('Rate limited by Riot API. Please try again shortly.');
    expect(err.status).toBe(429);
    expect(redisSet).not.toHaveBeenCalled();
  });

  it('returns profile + deaths for one SR match and caches the result', async () => {
    const matchId = 'NA1_1';
    const match = {
      info: {
        mapId: 11,
        gameDuration: 1800,
        gameCreation: 1700000000000,
        participants: [
          { puuid: PUUID, participantId: 1, championName: 'Ahri', teamId: 100, item0: 6653, item1: 3020, item2: 3089, item3: 0, item4: 0, item5: 0, item6: 3340, win: true, kills: 5, deaths: 1, assists: 7, totalMinionsKilled: 180, neutralMinionsKilled: 20 },
          { puuid: 'other-puuid', participantId: 2, championName: 'Zed', win: false, kills: 1, deaths: 5, assists: 0, totalMinionsKilled: 150, neutralMinionsKilled: 10 },
        ],
      },
    };
    const timeline = {
      info: {
        frames: [
          {
            events: [
              {
                type: 'CHAMPION_KILL',
                timestamp: 65000,
                victimId: 1,
                killerId: 2,
                position: { x: 1000, y: 2000 },
              },
            ],
          },
        ],
      },
    };
    const entries = [
      { queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 75, wins: 10, losses: 8 },
    ];
    vi.stubGlobal(
      'fetch',
      routeFetch([
        ['by-riot-id', jsonResponse({ puuid: PUUID, gameName: 'TestName', tagLine: 'T1' })],
        ['summoners/by-puuid', jsonResponse({ summonerLevel: 100, profileIconId: 1 })],
        ['entries/by-puuid', jsonResponse(entries)],
        ['/ids?', jsonResponse([matchId])],
        [`/matches/${matchId}?`, jsonResponse(match)],
        [`/matches/${matchId}/timeline`, jsonResponse(timeline)],
      ])
    );

    const result = await getDeathData('TestName', 'T1', 'na1');

    expect(result.profile).toEqual({
      name: 'TestName',
      tag: 'T1',
      level: 100,
      iconId: 1,
      rank: { tier: 'GOLD', division: 'II', lp: 75, wins: 10, losses: 8 },
    });
    expect(result.deaths).toEqual([
      { time: '1:05', x: 1000, y: 2000, killedBy: 'Zed', matchId },
    ]);
    expect(result.matches).toEqual([
      { matchId, championName: 'Ahri', teamId: 100, items: [6653, 3020, 3089, 0, 0, 0, 3340], win: true, kills: 5, deaths: 1, assists: 7, cs: 200, gameDuration: 1800, gameCreation: 1700000000000 },
    ]);
    expect(redisSet).toHaveBeenCalledWith(
      'testname#t1#na1',
      result,
      { ex: 300 }
    );
  });

  it('skips non-SR matches', async () => {
    const srMatchId = 'NA1_SR';
    const aramMatchId = 'NA1_ARAM';
    const srMatch = {
      info: {
        mapId: 11,
        participants: [
          { puuid: PUUID, participantId: 1, championName: 'Ahri' },
          { puuid: 'other-puuid', participantId: 2, championName: 'Zed' },
        ],
      },
    };
    const aramMatch = {
      info: {
        mapId: 12,
        participants: [
          { puuid: PUUID, participantId: 1, championName: 'Ahri' },
          { puuid: 'other-puuid', participantId: 2, championName: 'Lux' },
        ],
      },
    };
    const timeline = {
      info: {
        frames: [
          {
            events: [
              {
                type: 'CHAMPION_KILL',
                timestamp: 120000,
                victimId: 1,
                killerId: 2,
                position: { x: 3000, y: 4000 },
              },
            ],
          },
        ],
      },
    };
    vi.stubGlobal(
      'fetch',
      routeFetch([
        ['by-riot-id', jsonResponse({ puuid: PUUID, gameName: 'TestName', tagLine: 'T1' })],
        ['summoners/by-puuid', jsonResponse({ summonerLevel: 30, profileIconId: 2 })],
        ['entries/by-puuid', jsonResponse([])],
        ['/ids?', jsonResponse([aramMatchId, srMatchId])],
        [`/matches/${aramMatchId}?`, jsonResponse(aramMatch)],
        [`/matches/${srMatchId}?`, jsonResponse(srMatch)],
        [`/matches/${srMatchId}/timeline`, jsonResponse(timeline)],
      ])
    );

    const result = await getDeathData('TestName', 'T1', 'na1');

    // Only the SR match contributes a death; the mapId-12 match is filtered out
    // before any timeline fetch (no timeline route registered for it).
    expect(result.deaths).toEqual([
      { time: '2:00', x: 3000, y: 4000, killedBy: 'Zed', matchId: srMatchId },
    ]);
  });
});
