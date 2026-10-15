import express from 'express';
import { getDeathData } from './riotApi.js';
import cors from 'cors';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.static('public'));

app.get('/api/deaths/:region/:gameName/:tagLine', async(req, res) => {
    const { region, gameName, tagLine } = req.params;

    try {
        const deaths = await getDeathData(gameName, tagLine, region);
        res.json(deaths);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch death data' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});