import express from 'express';
import { getDeathData, claimRefresh, releaseRefresh, getRefreshRemaining, getUpdatedAt } from './riotApi.js';
import { parsePaging } from './paging.js';
import cors from 'cors';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.static('public'));

app.get('/api/deaths/:region/:gameName/:tagLine', async(req, res) => {
    const { region, gameName, tagLine } = req.params;
    const { start, count } = parsePaging(req.query);
    const refresh = req.query.refresh === '1' && start === 0;

    let claimed = false;
    try {
        if (refresh) {
            const result = await claimRefresh(gameName, tagLine, region);
            if (!result.ok) {
                res.set('Retry-After', String(result.retryAfter));
                return res.status(429).json({ error: `Refresh available in ${result.retryAfter}s`, retryAfter: result.retryAfter });
            }
            claimed = true;
        }
        const deaths = await getDeathData(gameName, tagLine, region, start, count, refresh);
        if (start === 0) {
            const cooldownRemaining = await getRefreshRemaining(gameName, tagLine, region);
            const updatedAt = await getUpdatedAt(gameName, tagLine, region);
            res.json({ ...deaths, cooldownRemaining, updatedAt });
        } else {
            res.json(deaths);
        }
    } catch (err) {
        if (claimed) {
            await releaseRefresh(gameName, tagLine, region).catch(() => {});
        }
        console.error(err);
        if (err.status === 429) {
            res.status(429).json({ error: err.message });
        } else if (err.status === 404) {
            res.status(404).json({ error: err.message });
        } else {
            res.status(500).json({ error: 'Failed to fetch death data' });
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});