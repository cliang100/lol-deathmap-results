import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { getDeathData, claimRefresh, releaseRefresh, getRefreshRemaining, getUpdatedAt, isValidRegion, isValidRiotId } from './riotApi.js';
import { parsePaging } from './paging.js';
const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));

const limiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down.' },
});

app.use('/api/deaths', limiter);
app.use(express.static('public'));

app.get('/api/deaths/:region/:gameName/:tagLine', async(req, res) => {
    const { region, gameName, tagLine } = req.params;
    if (!isValidRegion(region)) {
        return res.status(400).json({ error: 'Invalid region' });
    }
    if (!isValidRiotId(gameName, tagLine)) {
        return res.status(404).json({ error: `Account not found: ${gameName}#${tagLine}` });
    }
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