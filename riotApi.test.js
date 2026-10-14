import { msToClock } from './riotApi.js';
import { describe, it, expect } from 'vitest';

describe('msToClock', () => {
  it('formats 0 as 0:00', () => {
    expect(msToClock(0)).toBe('0:00');
  });

  it('formats times under a minute', () => {
    expect(msToClock(45000)).toBe('0:45');
  });

  it('formats exactly 60000 as 1:00', () => {
    expect(msToClock(60000)).toBe('1:00');
  });

  it('zero-pads single-digit seconds', () => {
    expect(msToClock(65000)).toBe('1:05');
  });

  it('formats times over an hour', () => {
    expect(msToClock(3723000)).toBe('62:03');
  });
});
