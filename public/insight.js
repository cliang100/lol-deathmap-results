import { deathPhase } from './matchStats.js';

const MIN_DEATHS = 5;
const BASE_RADIUS = 4800;
const MAP_SIZE = 14800;

// Approximate zones from turret positions, in game coordinates
export function deathZone(x, y, teamId) {
    const blue = teamId === 100;
    if (Math.hypot(x, y) < BASE_RADIUS) return blue ? 'your base' : 'the enemy base';
    if (Math.hypot(MAP_SIZE - x, MAP_SIZE - y) < BASE_RADIUS) return blue ? 'the enemy base' : 'your base';
    if (x < 1900 || y > 12900) return 'top lane';
    if (y < 1900 || x > 12900) return 'bot lane';
    if (Math.abs(x - y) < 1100) return 'mid lane';
    if (Math.abs(x + y - MAP_SIZE) < 1500) return 'the river';
    return (x + y < MAP_SIZE) === blue ? 'your jungle' : 'the enemy jungle';
}

export function topZoneInsight(deaths, matches, phase = 'all') {
    const inPhase = phase === 'all' ? deaths : deaths.filter(d => deathPhase(d) === phase);
    if (inPhase.length < MIN_DEATHS) return '';

    const teams = new Map(matches.map(m => [m.matchId, m.teamId]));
    const counts = {};
    for (const d of inPhase) {
        const zone = deathZone(d.x, d.y, teams.get(d.matchId));
        counts[zone] = (counts[zone] || 0) + 1;
    }
    const [zone, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const percent = Math.round((count / inPhase.length) * 100);
    const label = phase === 'all' ? 'deaths' : `${phase}-game deaths`;
    return `${percent}% of your ${label} (${count} of ${inPhase.length}) were in ${zone}.`;
}
