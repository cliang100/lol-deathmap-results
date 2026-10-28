# lol-death-map

See where you die most on Summoner's Rift, visualized as a heatmap.

## What it does

Search a Riot ID + region and see a heatmap (or dots) of your death locations
across your last 20 games. Only Summoner's Rift matches are analyzed; each
death is plotted on the Rift map from match timeline data.

## Features

- Match history list with per-game filtering (click a game to redraw the map
  and stats for that game only, "All games" to restore)
- Profile header with summoner level and solo-queue rank
- Heatmap/dots toggle for the death visualization
- Stats sidebar: win rate, avg KDA, avg deaths per game, avg time of death, and an early/mid/late death split
- Search history stored in localStorage (last 8 searches)
- 5-minute Redis cache per Riot ID + region
- Bottleneck rate limiting on Riot API calls, with 404/429 error handling

## Load more

Each page returns 20 matches. When more games are available, a "Load more" button fetches the next page using `start` and `count` query parameters, appending results to the current match history.

## Update button

The update button triggers a fresh data fetch with a 120-second cooldown stored in Redis. The cooldown survives page reloads and is reported by the API in the `cooldownRemaining` field. A 429 response from Riot includes a `Retry-After` header that starts the cooldown from the server's value. When no cooldown is running, the area under the button shows "Last updated" with the elapsed time since the data was fetched.

## Summoner not found

When a summoner can't be found (404 from Riot's API), a not-found view is shown instead of the results, prompting the user to check the name, tag, and region.

## Linkable URLs

Searches update the page URL with query parameters `riotId`, `tag`, and `region` (e.g., `?riotId=Name&tag=T1&region=na1`). Using the browser's Back/Forward buttons restores the search and re-runs it without reloading the page.

## Environment variables

Create a `.env` file in the project root (it is gitignored). `.env.example` shows the required keys:

- `RIOT_API_KEY` — Riot Games API key, required
- `UPSTASH_REDIS_REST_URL` — Upstash Redis REST URL, required
- `UPSTASH_REDIS_REST_TOKEN` — Upstash Redis REST token, required
- `PORT` — server port, optional, defaults to `3000`

## Security

- Region whitelist: only regions present in `regionToRouting` (na1, euw1, eun1, kr, jp1, br1, la1, la2, oc1, tr1, ru) are accepted; anything else returns 400.
- Riot ID validation: game name must be non-empty, at most 64 characters, and contain none of `/ \ ? # %`; tag line must be 1–10 alphanumeric/Unicode letters or digits. Invalid IDs return 404 without calling the Riot API.
- Per-IP rate limit: 30 requests per minute on `/api/deaths`, enforced with `express-rate-limit`. `trust proxy` is set so the client IP is read from the proxy header.
- Helmet security headers are applied (`contentSecurityPolicy` is off so Data Dragon icons and external fonts can load).
- No open CORS: the frontend is served from the same origin as the API.

## Setup

1. Clone the repo
2. Run `npm install`
3. Create a `.env` file in the project root with your keys:

```
RIOT_API_KEY=your_key_here
UPSTASH_REDIS_REST_URL=your_url_here
UPSTASH_REDIS_REST_TOKEN=your_token_here
```

4. Run `npm start` and open http://localhost:3000

## Scripts

- `npm start` — start the Express server
- `npm run dev` — start with `node --watch` for development
- `npm test` — run the vitest suite
- `npm run lint` — run oxlint

## Tech stack

- Node + Express (ESM)
- Vanilla JS + Canvas frontend
- Upstash Redis for caching
- Bottleneck for rate limiting
- vitest for tests, oxlint for linting
- Data Dragon CDN for champion/item/profile icons

## Project structure

- `server.js` — Express server, serves `public/` and the `/api/deaths` route
- `riotApi.js` — Riot API fetching, death/match extraction, Redis caching
- `public/app.js` — frontend: search, match list, heatmap/dots rendering
- `public/deathStats.js` — pure killer-stat computation
- `public/matchStats.js` — pure match/timing-stat computation
- `public/canvasMath.js` — game-to-canvas coordinate and color helpers
- `public/ranks/` — rank emblem icons
- `*.test.js` — vitest suites alongside the files they cover

## Status

In active development. Upcoming work:

- Visual pass over the results page
- Deployment

## Notes

Uses a personal Riot developer API key — subject to Riot's standard rate
limits. Not affiliated with or endorsed by Riot Games.
