import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { redisGet, redisSet, redisMget, redisTtl, redisDel } = vi.hoisted(() => ({
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  redisMget: vi.fn(),
  redisTtl: vi.fn(),
  redisDel: vi.fn(),
}));

vi.mock('@upstash/redis', () => {
  class FakeRedis {
    get = redisGet;
    set = redisSet;
    mget = redisMget;
    ttl = redisTtl;
    del = redisDel;
  }
  return { Redis: FakeRedis };
});

import { getDeathData, claimRefresh, getRefreshRemaining, getUpdatedAt, isValidRegion, isValidRiotId } from './riotApi.js';

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
  redisMget.mockReset().mockImplementation(async (...keys) => keys.map(() => null));
  redisTtl.mockReset().mockResolvedValue(-1);
  redisDel.mockReset().mockResolvedValue(1);
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
    expect(redisGet).toHaveBeenCalledWith('somename#tag#na1#0#20');
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

  it('rejects with status 404 when summoner is not found in region', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch([
        ['by-riot-id', jsonResponse({ puuid: PUUID, gameName: 'TestName', tagLine: 'T1' })],
        ['summoners/by-puuid', jsonResponse({ message: 'not found' }, { ok: false, status: 404 })],
        ['entries/by-puuid', jsonResponse([])],
      ])
    );

    const err = await getDeathData('TestName', 'T1', 'na1').catch(e => e);
    expect(err.status).toBe(404);
    expect(err.message).toBe('No summoner found for TestName#T1 in na1');
    expect(redisSet).not.toHaveBeenCalledWith('updated:v1:testname#t1#na1', expect.any(Number));
    expect(redisSet).not.toHaveBeenCalledWith('testname#t1#na1#0#20', expect.anything(), { ex: 300 });
  });

  it('rejects with status 429 when summoner fetch is rate limited', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch([
        ['by-riot-id', jsonResponse({ puuid: PUUID, gameName: 'TestName', tagLine: 'T1' })],
        ['summoners/by-puuid', jsonResponse({ message: 'rate limited' }, { ok: false, status: 429 })],
        ['entries/by-puuid', jsonResponse([])],
      ])
    );

    const err = await getDeathData('TestName', 'T1', 'na1').catch(e => e);
    expect(err.status).toBe(429);
    expect(err.message).toBe('Rate limited by Riot API. Please try again shortly.');
    expect(redisSet).not.toHaveBeenCalled();
  });

  it('encodes name and tag in the account URL', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('should not be reached');
    });
    vi.stubGlobal('fetch', fetchMock);

    await getDeathData('a/b', 'c?d', 'na1').catch(() => {});

    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('a%2Fb/c%3Fd');
    expect(url).not.toContain('a/b/c?d');
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
        queueId: 420,
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
      { matchId, queueId: 420, championName: 'Ahri', teamId: 100, items: [6653, 3020, 3089, 0, 0, 0, 3340], win: true, kills: 5, deaths: 1, assists: 7, cs: 200, gameDuration: 1800, gameCreation: 1700000000000 },
    ]);
    expect(redisSet).toHaveBeenCalledWith(
      'testname#t1#na1#0#20',
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

  it('uses per-match cache and makes no match/timeline fetches when all games are cached', async () => {
    const matchId = 'NA1_CACHED';
    const cachedGame = {
      matchEntry: { matchId, queueId: 420, championName: 'Ahri', win: true, kills: 5, deaths: 1, assists: 7, cs: 200, gameDuration: 1800, gameCreation: 1700000000000 },
      deaths: [{ time: '1:05', x: 1000, y: 2000, killedBy: 'Zed', matchId }],
    };
    redisMget.mockResolvedValue([cachedGame]);
    const fetchMock = routeFetch([
      ['by-riot-id', jsonResponse({ puuid: PUUID, gameName: 'TestName', tagLine: 'T1' })],
      ['summoners/by-puuid', jsonResponse({ summonerLevel: 100, profileIconId: 1 })],
      ['entries/by-puuid', jsonResponse([])],
      ['/ids?', jsonResponse([matchId])],
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const result = await getDeathData('TestName', 'T1', 'na1');

    expect(redisMget).toHaveBeenCalledWith(`match:v1:${PUUID}:${matchId}`);
    expect(result.matches).toEqual([cachedGame.matchEntry]);
    expect(result.deaths).toEqual(cachedGame.deaths);
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining(`/matches/${matchId}?`));
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining(`/matches/${matchId}/timeline`));
    expect(redisSet).toHaveBeenCalledWith('testname#t1#na1#0#20', result, { ex: 300 });
  });

  it('fetches only the missing ids on partial per-match cache', async () => {
    const hitId = 'NA1_HIT';
    const missId = 'NA1_MISS';
    const cachedGame = {
      matchEntry: { matchId: hitId, queueId: 420, championName: 'Ahri', win: true, kills: 1, deaths: 1, assists: 1, cs: 100, gameDuration: 1500, gameCreation: 1700000000000 },
      deaths: [{ time: '2:00', x: 1, y: 2, killedBy: 'Zed', matchId: hitId }],
    };
    redisMget.mockResolvedValue([cachedGame, null]);
    const freshMatch = {
      info: {
        mapId: 11,
        queueId: 420,
        gameDuration: 1800,
        gameCreation: 1700000001000,
        participants: [
          { puuid: PUUID, participantId: 1, championName: 'Lux', teamId: 100, item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0, win: false, kills: 0, deaths: 3, assists: 2, totalMinionsKilled: 50, neutralMinionsKilled: 5 },
          { puuid: 'other-puuid', participantId: 2, championName: 'Zed', win: true, kills: 3, deaths: 0, assists: 0, totalMinionsKilled: 0, neutralMinionsKilled: 0 },
        ],
      },
    };
    const freshTimeline = {
      info: {
        frames: [{ events: [{ type: 'CHAMPION_KILL', timestamp: 180000, victimId: 1, killerId: 2, position: { x: 9, y: 9 } }] }],
      },
    };
    const fetchMock = routeFetch([
      ['by-riot-id', jsonResponse({ puuid: PUUID, gameName: 'TestName', tagLine: 'T1' })],
      ['summoners/by-puuid', jsonResponse({ summonerLevel: 30, profileIconId: 2 })],
      ['entries/by-puuid', jsonResponse([])],
      ['/ids?', jsonResponse([hitId, missId])],
      [`/matches/${missId}?`, jsonResponse(freshMatch)],
      [`/matches/${missId}/timeline`, jsonResponse(freshTimeline)],
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const result = await getDeathData('TestName', 'T1', 'na1');

    expect(redisMget).toHaveBeenCalledWith(`match:v1:${PUUID}:${hitId}`, `match:v1:${PUUID}:${missId}`);
    expect(result.matches.map(m => m.matchId)).toEqual([hitId, missId]);
    expect(result.deaths.map(d => d.matchId)).toEqual([hitId, missId]);
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining(`/matches/${hitId}?`));
    expect(redisSet).toHaveBeenCalledWith(`match:v1:${PUUID}:${missId}`, {
      matchEntry: result.matches[1],
      deaths: [result.deaths[1]],
    });
  });

  it('does not cache a game when its match fetch fails', async () => {
    const badId = 'NA1_BAD';
    const goodId = 'NA1_GOOD';
    redisMget.mockResolvedValue([null, null]);
    const goodMatch = {
      info: {
        mapId: 11,
        queueId: 420,
        gameDuration: 1800,
        gameCreation: 1700000001000,
        participants: [
          { puuid: PUUID, participantId: 1, championName: 'Ahri', teamId: 100, item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0, win: true, kills: 1, deaths: 0, assists: 1, totalMinionsKilled: 10, neutralMinionsKilled: 0 },
          { puuid: 'other-puuid', participantId: 2, championName: 'Zed', win: false, kills: 0, deaths: 1, assists: 0, totalMinionsKilled: 0, neutralMinionsKilled: 0 },
        ],
      },
    };
    const goodTimeline = { info: { frames: [{ events: [] }] } };
    vi.stubGlobal(
      'fetch',
      routeFetch([
        ['by-riot-id', jsonResponse({ puuid: PUUID, gameName: 'TestName', tagLine: 'T1' })],
        ['summoners/by-puuid', jsonResponse({ summonerLevel: 30, profileIconId: 2 })],
        ['entries/by-puuid', jsonResponse([])],
        ['/ids?', jsonResponse([badId, goodId])],
        [`/matches/${badId}?`, jsonResponse({ message: 'gone' }, { ok: false, status: 404 })],
        [`/matches/${goodId}?`, jsonResponse(goodMatch)],
        [`/matches/${goodId}/timeline`, jsonResponse(goodTimeline)],
      ])
    );

    const result = await getDeathData('TestName', 'T1', 'na1');

    expect(result.matches.map(m => m.matchId)).toEqual([goodId]);
    const perGameSets = redisSet.mock.calls.filter(([key]) => key.startsWith('match:v1:'));
    expect(perGameSets.map(([key]) => key)).toEqual([`match:v1:${PUUID}:${goodId}`]);
  });

  it('stores a skipped marker for non-SR games and reuses it without refetching', async () => {
    const aramId = 'NA1_ARAM2';
    const aramMatch = { info: { mapId: 12, participants: [] } };
    redisMget.mockResolvedValue([null]);
    vi.stubGlobal(
      'fetch',
      routeFetch([
        ['by-riot-id', jsonResponse({ puuid: PUUID, gameName: 'TestName', tagLine: 'T1' })],
        ['summoners/by-puuid', jsonResponse({ summonerLevel: 30, profileIconId: 2 })],
        ['entries/by-puuid', jsonResponse([])],
        ['/ids?', jsonResponse([aramId])],
        [`/matches/${aramId}?`, jsonResponse(aramMatch)],
      ])
    );

    const first = await getDeathData('TestName', 'T1', 'na1');

    expect(first.matches).toEqual([]);
    expect(first.deaths).toEqual([]);
    expect(redisSet).toHaveBeenCalledWith(`match:v1:${PUUID}:${aramId}`, { skipped: true });

    redisSet.mockClear();
    redisMget.mockResolvedValue([{ skipped: true }]);
    const fetchMock = routeFetch([
      ['by-riot-id', jsonResponse({ puuid: PUUID, gameName: 'TestName', tagLine: 'T1' })],
      ['summoners/by-puuid', jsonResponse({ summonerLevel: 30, profileIconId: 2 })],
      ['entries/by-puuid', jsonResponse([])],
      ['/ids?', jsonResponse([aramId])],
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const second = await getDeathData('TestName', 'T1', 'na1');

    expect(second.matches).toEqual([]);
    expect(second.deaths).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining(`/matches/${aramId}?`));
  });

  it('returns empty matches and deaths without calling mget when the match-id list is empty', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch([
        ['by-riot-id', jsonResponse({ puuid: PUUID, gameName: 'TestName', tagLine: 'T1' })],
        ['summoners/by-puuid', jsonResponse({ summonerLevel: 30, profileIconId: 2 })],
        ['entries/by-puuid', jsonResponse([])],
        ['/ids?', jsonResponse([])],
      ])
    );

    const result = await getDeathData('TestName', 'T1', 'na1');

    expect(result.matches).toEqual([]);
    expect(result.deaths).toEqual([]);
    expect(redisMget).not.toHaveBeenCalled();
    expect(redisSet).toHaveBeenCalledWith('testname#t1#na1#0#20', result, { ex: 300 });
  });

  it('start > 0 skips summoner/rank fetches and returns no profile', async () => {
    const matchId = 'NA1_PAGE2';
    const pageMatch = {
      info: {
        mapId: 11,
        queueId: 420,
        gameDuration: 1800,
        gameCreation: 1700000000000,
        participants: [
          { puuid: PUUID, participantId: 1, championName: 'Ahri', teamId: 100, item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0, win: true, kills: 1, deaths: 0, assists: 1, totalMinionsKilled: 10, neutralMinionsKilled: 0 },
          { puuid: 'other-puuid', participantId: 2, championName: 'Zed', win: false, kills: 0, deaths: 1, assists: 0, totalMinionsKilled: 0, neutralMinionsKilled: 0 },
        ],
      },
    };
    const pageTimeline = { info: { frames: [{ events: [] }] } };
    const fetchMock = routeFetch([
      ['by-riot-id', jsonResponse({ puuid: PUUID, gameName: 'TestName', tagLine: 'T1' })],
      ['/ids?', jsonResponse([matchId])],
      [`/matches/${matchId}?`, jsonResponse(pageMatch)],
      [`/matches/${matchId}/timeline`, jsonResponse(pageTimeline)],
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const result = await getDeathData('TestName', 'T1', 'na1', 20, 20);

    expect(result).not.toHaveProperty('profile');
    expect(result.matches.map(m => m.matchId)).toEqual([matchId]);
    expect(redisGet).toHaveBeenCalledWith('testname#t1#na1#20#20');
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('summoners/by-puuid'));
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('entries/by-puuid'));
  });

  it('uses the given start and count in the match-ids URL', async () => {
    const fetchMock = routeFetch([
      ['by-riot-id', jsonResponse({ puuid: PUUID, gameName: 'TestName', tagLine: 'T1' })],
      ['summoners/by-puuid', jsonResponse({ summonerLevel: 30, profileIconId: 2 })],
      ['entries/by-puuid', jsonResponse([])],
      ['/ids?', jsonResponse([])],
    ]);
    vi.stubGlobal('fetch', fetchMock);

    await getDeathData('TestName', 'T1', 'na1', 20, 5);

    const idsCall = fetchMock.mock.calls.find(([url]) => url.includes('/ids?'));
    expect(idsCall[0]).toContain('start=20');
    expect(idsCall[0]).toContain('count=5');
  });

  it('hasMore is true when ids length equals count and false otherwise', async () => {
    const routes = [
      ['by-riot-id', jsonResponse({ puuid: PUUID, gameName: 'TestName', tagLine: 'T1' })],
      ['summoners/by-puuid', jsonResponse({ summonerLevel: 30, profileIconId: 2 })],
      ['entries/by-puuid', jsonResponse([])],
    ];
    const emptyMatch = { info: { mapId: 12, participants: [] } };
    const emptyTimeline = { info: { frames: [{ events: [] }] } };
    const matchRoutes = (ids) => [
      ...routes,
      ['/ids?', jsonResponse(ids)],
      ...ids.flatMap((id) => [
        [`/matches/${id}?`, jsonResponse(emptyMatch)],
        [`/matches/${id}/timeline`, jsonResponse(emptyTimeline)],
      ]),
    ];
    vi.stubGlobal('fetch', routeFetch(matchRoutes(['NA1_A', 'NA1_B'])));
    const full = await getDeathData('TestName', 'T1', 'na1', 0, 2);
    expect(full.hasMore).toBe(true);

    vi.stubGlobal('fetch', routeFetch(matchRoutes(['NA1_A'])));
    const partial = await getDeathData('TestName', 'T1', 'na1', 0, 2);
    expect(partial.hasMore).toBe(false);
  });

  it('with refresh=true skips the full-result cache read, still fetches, and writes to cache', async () => {
    const fetchMock = routeFetch([
      ['by-riot-id', jsonResponse({ puuid: PUUID, gameName: 'TestName', tagLine: 'T1' })],
      ['summoners/by-puuid', jsonResponse({ summonerLevel: 30, profileIconId: 1 })],
      ['entries/by-puuid', jsonResponse([])],
      ['/ids?', jsonResponse([])],
    ]);
    vi.stubGlobal('fetch', fetchMock);

    await getDeathData('TestName', 'T1', 'na1', 0, 20, true);

    expect(redisGet).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalled();
    expect(redisSet).toHaveBeenCalledWith('testname#t1#na1#0#20', expect.anything(), { ex: 300 });
  });

  it('writes the updated key on a fresh start=0 fetch', async () => {
    const fetchMock = routeFetch([
      ['by-riot-id', jsonResponse({ puuid: PUUID, gameName: 'TestName', tagLine: 'T1' })],
      ['summoners/by-puuid', jsonResponse({ summonerLevel: 30, profileIconId: 1 })],
      ['entries/by-puuid', jsonResponse([])],
      ['/ids?', jsonResponse([])],
    ]);
    vi.stubGlobal('fetch', fetchMock);

    await getDeathData('TestName', 'T1', 'na1', 0, 20);

    expect(redisSet).toHaveBeenCalledWith('updated:v1:testname#t1#na1', expect.any(Number));
    expect(redisSet).toHaveBeenCalledWith('testname#t1#na1#0#20', expect.anything(), { ex: 300 });
  });

  it('does not write the updated key for start > 0', async () => {
    const fetchMock = routeFetch([
      ['by-riot-id', jsonResponse({ puuid: PUUID, gameName: 'TestName', tagLine: 'T1' })],
      ['/ids?', jsonResponse([])],
    ]);
    vi.stubGlobal('fetch', fetchMock);

    await getDeathData('TestName', 'T1', 'na1', 5, 20);

    expect(redisSet).not.toHaveBeenCalledWith('updated:v1:testname#t1#na1', expect.any(Number));
    expect(redisSet).toHaveBeenCalledWith('testname#t1#na1#5#20', expect.anything(), { ex: 300 });
  });

  it('does not write the updated key on cache hit', async () => {
    const cached = { profile: { name: 'Cached' }, deaths: [] };
    redisGet.mockResolvedValue(cached);
    const fetchMock = vi.fn(async () => {
      throw new Error('fetch should not be called on cache hit');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getDeathData('SomeName', 'TAG', 'na1');

    expect(result).toEqual(cached);
    expect(redisSet).not.toHaveBeenCalled();
  });
});

describe('claimRefresh', () => {
  it('calls redis.set with the refresh key and returns ok when set resolves OK', async () => {
    redisSet.mockResolvedValue('OK');

    const result = await claimRefresh('testname', 't1', 'na1');

    expect(result).toEqual({ ok: true });
    expect(redisSet).toHaveBeenCalledWith('refresh:v1:testname#t1#na1', 1, { nx: true, ex: 120 });
  });

  it('returns retryAfter from ttl when set resolves null', async () => {
    redisSet.mockResolvedValue(null);
    redisTtl.mockResolvedValue(87);

    const result = await claimRefresh('testname', 't1', 'na1');

    expect(result).toEqual({ ok: false, retryAfter: 87 });
    expect(redisTtl).toHaveBeenCalledWith('refresh:v1:testname#t1#na1');
  });

  it('falls back to REFRESH_COOLDOWN_SEC when ttl resolves -1', async () => {
    redisSet.mockResolvedValue(null);
    redisTtl.mockResolvedValue(-1);

    const result = await claimRefresh('testname', 't1', 'na1');

    expect(result).toEqual({ ok: false, retryAfter: 120 });
  });
});

describe('getRefreshRemaining', () => {
  it('returns ttl when ttl is greater than 0', async () => {
    redisTtl.mockResolvedValue(87);

    const result = await getRefreshRemaining('testname', 't1', 'na1');

    expect(result).toBe(87);
    expect(redisTtl).toHaveBeenCalledWith('refresh:v1:testname#t1#na1');
  });

  it('returns 0 when ttl is -2 (missing key)', async () => {
    redisTtl.mockResolvedValue(-2);

    const result = await getRefreshRemaining('testname', 't1', 'na1');

    expect(result).toBe(0);
  });

  it('returns 0 when ttl is -1 (no expiry)', async () => {
    redisTtl.mockResolvedValue(-1);

    const result = await getRefreshRemaining('testname', 't1', 'na1');

    expect(result).toBe(0);
  });
});

describe('getUpdatedAt', () => {
  it('returns the number when get returns a number', async () => {
    redisGet.mockResolvedValue(1700000000000);

    const result = await getUpdatedAt('testname', 't1', 'na1');

    expect(result).toBe(1700000000000);
    expect(redisGet).toHaveBeenCalledWith('updated:v1:testname#t1#na1');
  });

  it('returns null when get returns null', async () => {
    redisGet.mockResolvedValue(null);

    const result = await getUpdatedAt('testname', 't1', 'na1');

    expect(result).toBeNull();
    expect(redisGet).toHaveBeenCalledWith('updated:v1:testname#t1#na1');
  });
});

describe('isValidRegion', () => {
  it('returns true for valid region keys', () => {
    expect(isValidRegion('na1')).toBe(true);
    expect(isValidRegion('euw1')).toBe(true);
    expect(isValidRegion('kr')).toBe(true);
  });

  it('returns false for unknown regions', () => {
    expect(isValidRegion('evil.com/x?')).toBe(false);
    expect(isValidRegion('')).toBe(false);
    expect(isValidRegion('constructor')).toBe(false);
    expect(isValidRegion('__proto__')).toBe(false);
    expect(isValidRegion('NA1 ')).toBe(false);
  });
});

describe('isValidRiotId', () => {
  it('returns true for valid gameName and tagLine', () => {
    expect(isValidRiotId('Senyuuto', 'FAKER')).toBe(true);
    expect(isValidRiotId('Hide on bush', 'KR1')).toBe(true);
  });

  it('returns false for invalid gameName', () => {
    expect(isValidRiotId('a/b', 'c')).toBe(false);
    expect(isValidRiotId('a', 'c?d')).toBe(false);
    expect(isValidRiotId('a#b', 'c')).toBe(false);
    expect(isValidRiotId('', 'c')).toBe(false);
    expect(isValidRiotId('a'.repeat(65), 'c')).toBe(false);
  });

  it('returns false for invalid tagLine', () => {
    expect(isValidRiotId('name', '')).toBe(false);
    expect(isValidRiotId('name', 'TOOLONGTAG12')).toBe(false);
  });
});
