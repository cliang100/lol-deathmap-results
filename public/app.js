import { gameToCanvas, intensityToColor } from './canvasMath.js';
import { computeDeathStats } from './deathStats.js';

const searchBtn = document.getElementById('searchBtn');
const canvas = document.getElementById('heatmapCanvas');
const ctx = canvas.getContext('2d');
let lastDeaths = []
let lastMatches = [];
let selectedMatchId = null;
let currentMode = 'heatmap';

function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}


function renderHeatmap(deaths) {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // wipe any dots from a previous search
    ctx.globalCompositeOperation = 'lighter';

    for (const death of deaths) {
        const { canvasX, canvasY } = gameToCanvas(death.x, death.y);

        const RADIUS = 20;
        const gradient = ctx.createRadialGradient(canvasX, canvasY, 0, canvasX, canvasY, RADIUS);
        gradient.addColorStop(0, 'rgba(255,255,255,0.4)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(canvasX - RADIUS, canvasY - RADIUS, RADIUS * 2, RADIUS * 2);
    }

    ctx.globalCompositeOperation = 'source-over';
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    for (let i = 0; i < pixels.length; i += 4) {
        const alpha = pixels[i + 3];

        if (alpha === 0) continue;

        const [r, g, b] = intensityToColor(alpha);
        pixels[i] = r;
        pixels[i + 1] = g;
        pixels[i + 2] = b;
    }

    ctx.putImageData(imageData, 0, 0);
}


// TODO: Revisit what data dots should surface - currently just time + killer.
// Consider: per-game grouping/filtering (like u.gg's match-by-match breakdown),
// possibly alongside the map rather than only via tooltip. May need a UI rework,
// not just a styling pass.
function renderDots(deaths, hoveredDeath = null) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const death of deaths) {
        const { canvasX, canvasY } = gameToCanvas(death.x, death.y);
        const isHovered = death === hoveredDeath;

        ctx.beginPath();
        ctx.arc(canvasX, canvasY, isHovered ? 8 : 5, 0, Math.PI * 2);

        if (isHovered) {
            ctx.shadowColor = '#E8B34C';
            ctx.shadowBlur = 12;
            ctx.fillStyle = '#F5D48A';
        } else {
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(207, 201, 188, 0.85)';
        }

        ctx.strokeStyle = '#12100D';
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
    }

    ctx.shadowBlur = 0;
}

let ddVersion = null;
async function getDdVersion() {
    if (!ddVersion) {
        const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
        ddVersion = (await res.json())[0];
    }
    return ddVersion;
}

async function renderProfile(profile) {
    document.getElementById('summonerName').textContent = `${profile.name}#${profile.tag}`;
    document.getElementById('summonerLevel').textContent = `Level ${profile.level}`;

    const r = profile.rank;
    document.getElementById('summonerRank').textContent = r
        ? `${r.tier} ${r.division} · ${r.lp} LP · ${r.wins}W ${r.losses}L`
        : 'Unranked';

    const v = await getDdVersion();
    document.getElementById('summonerIcon').src =
        `https://ddragon.leagueoflegends.com/cdn/${v}/img/profileicon/${profile.iconId}.png`;
}

function renderSearchResults({ profile, matches, deaths }) {
    const regionSelect = document.getElementById('region');
    document.getElementById('summonerRegion').textContent =
        regionSelect.options[regionSelect.selectedIndex].text;
    renderProfile(profile);

    lastDeaths = deaths;
    lastMatches = matches || [];
    selectedMatchId = null;
    renderMatchHistory();
    renderSelection();
}

function renderMatchHistory() {
    const listEl = document.getElementById('matchHistory');
    listEl.innerHTML = '';

    const allRow = document.createElement('div');
    allRow.className = 'match-row' + (selectedMatchId === null ? ' selected' : '');
    allRow.textContent = 'All games';
    allRow.addEventListener('click', () => selectMatch(null));
    listEl.appendChild(allRow);

    for (const match of lastMatches) {
        const row = document.createElement('div');
        row.className = 'match-row' + (selectedMatchId === match.matchId ? ' selected' : '');
        const result = document.createElement('span');
        result.textContent = match.win ? 'Win' : 'Loss';
        result.className = match.win ? 'match-win' : 'match-loss';
        row.append(match.championName + ' ', result, ` ${match.kills}/${match.deaths}/${match.assists} ${match.cs} CS ${formatDuration(match.gameDuration)}`);
        row.addEventListener('click', () => selectMatch(match.matchId));
        listEl.appendChild(row);
    }
}

function selectMatch(matchId) {
    selectedMatchId = matchId;
    renderMatchHistory();
    renderSelection();
}

function currentDeaths() {
    return selectedMatchId === null
        ? lastDeaths
        : lastDeaths.filter(d => d.matchId === selectedMatchId);
}

function renderSelection() {
    const deaths = currentDeaths();

    const { matchCount, topKiller } = computeDeathStats(deaths);

    document.getElementById('totalDeathsStat').textContent = deaths.length;
    document.getElementById('gamesAnalyzedStat').textContent = matchCount;
    document.getElementById('mostCommonKillerStat').textContent = topKiller;

    if (currentMode === 'dots') renderDots(deaths); else renderHeatmap(deaths);

    const deathListEl = document.getElementById('deathList');
    if (deaths.length === 0) {
        deathListEl.textContent = 'No deaths found in recent Summoner\'s Rift games';
        deathListEl.style.display = 'block';
    } else {
        deathListEl.style.display = 'none';
    }
}


async function performSearch(gameName, tagLine, region) {
    const deathListEl = document.getElementById('deathList');

    if (!gameName || !tagLine) {
        deathListEl.textContent = 'Enter a Riot ID like Name#Tag';
        deathListEl.style.display = 'block';
        return;
    }

    searchBtn.disabled = true;
    searchBtn.textContent = 'Loading...';

    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'block';

    try {
        const res = await fetch(`/api/deaths/${region}/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`);

        if (!res.ok) {
            let message = 'Could not find that summoner. Check the name and tag.';
            try {
                const errBody = await res.json();
                if (errBody && errBody.error) message = errBody.error;
            } catch {
                // keep the default message if the error body isn't JSON
            }
            deathListEl.textContent = message;
            deathListEl.style.display = 'block';
            return;
        }

        const data = await res.json();
        renderSearchResults(data);
    } catch (err) {
        console.error(err);
        deathListEl.textContent = 'Could not reach the server.';
        deathListEl.style.display = 'block';
    } finally {
        searchBtn.disabled = false;
        searchBtn.textContent = 'Search';
        loadingOverlay.style.display = 'none';
    }
}

searchBtn.addEventListener('click', () => {
    const raw = document.getElementById('riotId').value;
    const [gameName, tagLine] = raw.split('#').map(s => s.trim());
    const region = document.getElementById('region').value;
    performSearch(gameName, tagLine, region);
});

canvas.addEventListener('mousemove', (e) => {
    if (currentMode !== 'dots') return;

    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const mouseX = cssX * scale;
    const mouseY = cssY * scale;

    let closest = null;
    let closestDist = Infinity;

    const deaths = currentDeaths();
    for (const death of deaths) {
        const { canvasX, canvasY } = gameToCanvas(death.x, death.y);
        const dist = Math.hypot(mouseX - canvasX, mouseY - canvasY);
        if (dist < closestDist) {
            closestDist = dist;
            closest = death;
        }
    }

    const tooltip = document.getElementById('dotTooltip');
    const hovered = closest && closestDist < 10 ? closest : null;

    renderDots(deaths, hovered);

    if (hovered) {
        tooltip.textContent = `${hovered.time} - killed by ${hovered.killedBy}`;
        tooltip.style.display = 'block';

        const tooltipWidth = tooltip.offsetWidth;
        const tooltipHeight = tooltip.offsetHeight;

        let left = cssX + 10;
        let top = cssY + 10;

        if (left + tooltipWidth > rect.width) left = cssX - tooltipWidth - 10;
        if (top + tooltipHeight > rect.height) top = cssY - tooltipHeight - 10;

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    } else {
        tooltip.style.display = 'none';
    }
});

document.getElementById('riotId').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        searchBtn.click();
    }
});

document.getElementById('heatmapModeBtn').addEventListener('click', () => {
    currentMode = 'heatmap';
    document.getElementById('heatmapModeBtn').classList.add('active');
    document.getElementById('dotsModeBtn').classList.remove('active');
    document.getElementById('dotTooltip').style.display = 'none';
    renderHeatmap(currentDeaths());
});

document.getElementById('dotsModeBtn').addEventListener('click', () => {
    currentMode = 'dots';
    document.getElementById('dotsModeBtn').classList.add('active');
    document.getElementById('heatmapModeBtn').classList.remove('active');
    renderDots(currentDeaths());
});

const params = new URLSearchParams(window.location.search);
const urlRiotId = params.get('riotId');
const urlTag = params.get('tag');
const urlRegion = params.get('region');

if (urlRiotId && urlTag) {
    document.getElementById('riotId').value = `${urlRiotId}#${urlTag}`;
    document.getElementById('region').value = urlRegion || 'na1';
    performSearch(urlRiotId, urlTag, urlRegion || 'na1');
}