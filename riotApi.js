import 'dotenv/config';

import { Redis } from '@upstash/redis';
import Bottleneck from 'bottleneck';

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const apiKey = process.env.RIOT_API_KEY;

const regionToRouting = {
    na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas', oc1: 'americas',
    euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
    kr: 'asia', jp1: 'asia',
};

const limiter = new Bottleneck({
    reservoir: 95,
    reservoirRefreshAmount: 95,
    reservoirRefreshInterval: 120 * 1000,
    maxConcurrent: 15,
    minTime: 55,
});


function limitedFetch(url) {
    return limiter.schedule(() => fetch(url));
}


function matchCacheKey(puuid, matchId) {
    return `match:v1:${puuid}:${matchId}`;
}


function processGame(puuid, matchId, match, timeline) {
    const me = match.info.participants.find(p => p.puuid === puuid);
    const myId = me.participantId;

    const matchEntry = {
        matchId,
        queueId: match.info.queueId,
        championName: me.championName,
        teamId: me.teamId,
        items: [me.item0, me.item1, me.item2, me.item3, me.item4, me.item5, me.item6],
        win: me.win,
        kills: me.kills,
        deaths: me.deaths,
        assists: me.assists,
        cs: (me.totalMinionsKilled ?? 0) + (me.neutralMinionsKilled ?? 0),
        gameDuration: match.info.gameDuration,
        gameCreation: match.info.gameCreation,
    };

    const idToChamp = {};
    match.info.participants.forEach(p => {
        idToChamp[p.participantId] = p.championName;
    });

    const kills = timeline.info.frames
        .flatMap(frame => frame.events)
        .filter(event => event.type === 'CHAMPION_KILL');

    const myDeaths = kills.filter(k => k.victimId === myId);

    const deaths = myDeaths.map(d => ({
        time: msToClock(d.timestamp),
        x: d.position.x,
        y: d.position.y,
        killedBy: idToChamp[d.killerId],
        matchId: matchId,
    }));

    return { matchEntry, deaths };
}


export function msToClock(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}


export async function getDeathData(gameName, tagLine, region = 'na1', start = 0, count = 20) {
    const routing = regionToRouting[region] || 'americas';
    const cacheKey = `${gameName}#${tagLine}#${region}#${start}#${count}`.toLowerCase();
    const cached = await redis.get(cacheKey);
    if (cached) {
        console.log('Cache hit:', cacheKey);
        return cached;
    }

    const accountUrl = `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${gameName}/${tagLine}?api_key=${apiKey}`;
    const accountRes = await limitedFetch(accountUrl);
    const account = await accountRes.json();

    if (!accountRes.ok) {
        console.log('Account fetch failed:', accountRes.status, account);
        if (accountRes.status === 429) {
            const err = new Error('Rate limited by Riot API. Please try again shortly.');
            err.status = 429;
            throw err;
        }
        const err = new Error(`Account not found: ${gameName}#${tagLine}`);
        err.status = accountRes.status;
        throw err;
    }

    const puuid = account.puuid;

    const [summonerRes, rankRes] = start === 0
        ? await Promise.all([
            limitedFetch(`https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}?api_key=${apiKey}`),
            limitedFetch(`https://${region}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}?api_key=${apiKey}`),
        ])
        : [null, null];
    const summoner = start === 0 ? await summonerRes.json() : null;
    const entries = start === 0 ? await rankRes.json() : null;

    const solo = Array.isArray(entries)
        ? entries.find(e => e.queueType === 'RANKED_SOLO_5x5')
        : null;

    const profile = start === 0
        ? {
            name: account.gameName,
            tag: account.tagLine,
            level: summoner.summonerLevel,
            iconId: summoner.profileIconId,
            rank: solo
                ? { tier: solo.tier, division: solo.rank, lp: solo.leaguePoints, wins: solo.wins, losses: solo.losses }
                : null,
        }
        : null;

    const idsUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=${start}&count=${count}&api_key=${apiKey}`;
    const idsRes = await limitedFetch(idsUrl);
    const matchIds = await idsRes.json();

    if (!idsRes.ok) {
        console.log('MatchIds fetch failed:', idsRes.status, matchIds);
        if (idsRes.status === 429) {
            const err = new Error('Rate limited by Riot API. Please try again shortly.');
            err.status = 429;
            throw err;
        }
        const err = new Error(`Failed to fetch match list for ${gameName}#${tagLine}`);
        err.status = idsRes.status;
        throw err;
    }

    const matchKeys = matchIds.map(matchId => matchCacheKey(puuid, matchId));
    const cachedGames = matchKeys.length === 0 ? [] : await redis.mget(...matchKeys);

    const missing = [];
    const gamesById = new Map();
    matchIds.forEach((matchId, i) => {
        const cachedGame = cachedGames[i];
        if (cachedGame) {
            gamesById.set(matchId, cachedGame);
        } else {
            missing.push(matchId);
        }
    });

    const matchResults = await Promise.all(
        missing.map(async matchId => {
            const matchRes = await limitedFetch(`https://${routing}.api.riotgames.com/lol/match/v5/matches/${matchId}?api_key=${apiKey}`);
            const match = await matchRes.json();

            if (!matchRes.ok) {
                console.log('Match fetch failed:', matchId, matchRes.status, match);
                return null;
            }

            if (match.info.mapId !== 11) {
                await redis.set(matchCacheKey(puuid, matchId), { skipped: true });
                return { matchId, skipped: true };
            }

            const timelineRes = await limitedFetch(`https://${routing}.api.riotgames.com/lol/match/v5/matches/${matchId}/timeline?api_key=${apiKey}`);
            const timeline = await timelineRes.json();

            if (!timelineRes.ok) {
                console.log('Timeline fetch failed:', matchId, timelineRes.status, timeline);
                return null;
            }

            const game = processGame(puuid, matchId, match, timeline);
            await redis.set(matchCacheKey(puuid, matchId), game);
            return { matchId, ...game };
        })
    );

    const validResults = matchIds
        .map(matchId => gamesById.get(matchId) ?? matchResults.find(r => r && r.matchId === matchId) ?? null)
        .filter(result => result !== null && !result.skipped);
    const allDeaths = [];
    const matches = [];

    for (const { matchEntry, deaths } of validResults) {
        matches.push(matchEntry);
        allDeaths.push(...deaths);
    }

    const result = start === 0
        ? { profile, matches, deaths: allDeaths, hasMore: matchIds.length === count }
        : { matches, deaths: allDeaths, hasMore: matchIds.length === count };
    await redis.set(cacheKey, result, { ex: 300 });
    return result;
}