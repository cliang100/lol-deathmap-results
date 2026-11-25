import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

const { reserve, getDeathData } = vi.hoisted(() => ({ reserve: vi.fn(), getDeathData: vi.fn() }));

vi.mock('./riotApi.js', () => ({
  reserve,
  getDeathData,
  isValidRegion: () => true,
  isValidRiotId: () => true,
  getRefreshRemaining: async () => 0,
  getUpdatedAt: async () => null,
}));

import app from './expressApp.js';

let server;
let base;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => server.close());

describe('per-IP rate limit', () => {
  it('returns 429 with Retry-After when the limit is reached', async () => {
    reserve.mockResolvedValue(17);

    const res = await fetch(`${base}/api/deaths/na1/Name/TAG`, {
      headers: { 'x-nf-client-connection-ip': '203.0.113.5' },
    });

    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('17');
    expect(reserve).toHaveBeenCalledWith('ip:v1:203.0.113.5', 1, 30, 60);
    expect(getDeathData).not.toHaveBeenCalled();
  });

  it('lets requests under the limit through', async () => {
    reserve.mockResolvedValue(0);
    getDeathData.mockResolvedValue({ matches: [], deaths: [] });

    const res = await fetch(`${base}/api/deaths/na1/Name/TAG`);

    expect(res.status).toBe(200);
  });
});
