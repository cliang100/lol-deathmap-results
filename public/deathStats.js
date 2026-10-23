export function computeDeathStats(deaths) {
    const matchCount = new Set(deaths.map(d => d.matchId)).size;

    const killerCounts = {};
    for (const death of deaths) {
        killerCounts[death.killedBy] = (killerCounts[death.killedBy] || 0) + 1;
    }
    let topKiller = '--';
    let topCount = 0;
    for (const killer in killerCounts) {
        if (killerCounts[killer] > topCount) {
            topKiller = killer;
            topCount = killerCounts[killer];
        }
    }

    return { matchCount, killerCounts, topKiller, topCount };
}


