export function computeDeathStats(deaths) {
    const killerCounts = {};
    for (const death of deaths) {
        if (!death.killedBy) continue; // executions have no champion killer
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

    return { killerCounts, topKiller, topCount };
}


