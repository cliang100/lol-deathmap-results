export const EARLY_GAME_END_SEC = 840;
export const MID_GAME_END_SEC = 1500;

export function parseClock(str) {
    if (typeof str !== 'string') return 0;
    const parts = str.split(':');
    if (parts.length !== 2) return 0;
    const minutes = Number(parts[0]);
    const seconds = Number(parts[1]);
    if (!Number.isInteger(minutes) || !Number.isInteger(seconds)) return 0;
    if (minutes < 0 || seconds < 0 || seconds > 59) return 0;
    return minutes * 60 + seconds;
}

export function computeMatchStats(matches) {
    if (matches.length === 0) {
        return { games: 0, wins: 0, winRate: 0, avgKills: 0, avgDeaths: 0, avgAssists: 0, avgKda: 0 };
    }
    const games = matches.length;
    let wins = 0;
    let totalKills = 0;
    let totalDeaths = 0;
    let totalAssists = 0;
    for (const m of matches) {
        if (m.win) wins += 1;
        totalKills += m.kills;
        totalDeaths += m.deaths;
        totalAssists += m.assists;
    }
    return {
        games,
        wins,
        winRate: (wins / games) * 100,
        avgKills: totalKills / games,
        avgDeaths: totalDeaths / games,
        avgAssists: totalAssists / games,
        avgKda: (totalKills + totalAssists) / Math.max(1, totalDeaths),
    };
}

export function computeDeathTiming(deaths, gameCount) {
    const avgDeathsPerGame = gameCount === 0 ? 0 : deaths.length / gameCount;
    if (deaths.length === 0) {
        return { avgDeathsPerGame, avgDeathTimeSec: 0, early: 0, mid: 0, late: 0 };
    }
    let totalSec = 0;
    let early = 0;
    let mid = 0;
    let late = 0;
    for (const d of deaths) {
        const sec = parseClock(d.time);
        totalSec += sec;
        if (sec < EARLY_GAME_END_SEC) {
            early += 1;
        } else if (sec < MID_GAME_END_SEC) {
            mid += 1;
        } else {
            late += 1;
        }
    }
    return { avgDeathsPerGame, avgDeathTimeSec: totalSec / deaths.length, early, mid, late };
}
