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
