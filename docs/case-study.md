# LoL Death Map case study

## Problem

Match history sites show how often you died, but not the pattern of where. Riot's match timelines contain the position of every death, so this project plots them on the map.

## Constraints

- The Riot limit this app is built around is 100 requests per 2 minutes.
- A new player's first 10 games cost up to 24 requests: 4 lookups plus a match and a timeline per game.
- The API runs on serverless functions, so anything kept in memory is per instance and can disappear.

## Decisions

**Two caches.** Finished matches don't change, so each processed game is cached by player and match ID. The whole page is cached for 5 minutes. Repeat searches skip Riot entirely, and later ones only fetch new games.

**Incomplete pages aren't cached.** If a game fails to load, the page says how many are missing. The next search retries only those games.

**Shared budget in Redis.** A limiter in memory lets every instance spend the full allowance. A small Lua script checks and spends the budget in one atomic step. When it is used up, the API returns 429 with a retry time instead of queueing until the function times out.

**Smaller pages.** Loading 10 games instead of 20 cuts a cold search from 44 requests to 24.

**Stale responses.** Each search gets a number, and a response is ignored if a newer search has started.

## Limits

- The per-second Riot limit is still paced per instance.
- The budget uses a fixed window, so bursts can straddle two windows.
- Map zones are approximations based on turret positions.
