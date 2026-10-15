import 'dotenv/config';

const apiKey = process.env.RIOT_API_KEY;
const puuid = process.env.PUUID;
const matchId = 'NA1_5625818846';

async function getMyDeaths() {
    const [timelineRes, matchRes] = await Promise.all([
        fetch(`https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}/timeline?api_key=${apiKey}`),
        fetch(`https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}?api_key=${apiKey}`)
    ]);

    const timeline = await timelineRes.json();
    const match = await matchRes.json();

    const me = match.info.participants.find(p => p.puuid === puuid);
    const myId = me.participantId;

    const kills = timeline.info.frames
        .flatMap(frame => frame.events)
        .filter(event => event.type === 'CHAMPION_KILL');

    const myDeaths = kills.filter(k => k.victimId === myId);

    const idToChamp = {};
    match.info.participants.forEach(p => {
        idToChamp[p.participantId] = p.championName;
    });

    console.log(`You (${me.championName}) died ${myDeaths.length} times this game`);
    myDeaths.forEach(d => {
        const time = msToClock(d.timestamp);
        const killerName = idToChamp[d.killerId];
        console.log(`Died at ${time}, position (${d.position.x}, ${d.position.y}), killed by ${killerName}`);
    });
}

function msToClock(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

getMyDeaths();