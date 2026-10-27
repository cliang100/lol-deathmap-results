import { describe, it, expect } from 'vitest';
import { timeAgo } from './timeAgo.js';

describe('timeAgo', () => {
  const now = 1700000000000;

  it('returns "just now" for under 60s', () => {
    expect(timeAgo(now - 30000, now)).toBe('just now');
    expect(timeAgo(now - 1, now)).toBe('just now');
    expect(timeAgo(now - 59999, now)).toBe('just now');
  });

  it('returns "N min ago" for under 60 min', () => {
    expect(timeAgo(now - 60000, now)).toBe('1 min ago');
    expect(timeAgo(now - 120000, now)).toBe('2 min ago');
    expect(timeAgo(now - 3599000, now)).toBe('59 min ago');
  });

  it('returns "N hr ago" for under 24 h', () => {
    expect(timeAgo(now - 3600000, now)).toBe('1 hr ago');
    expect(timeAgo(now - 7200000, now)).toBe('2 hr ago');
    expect(timeAgo(now - 86390000, now)).toBe('23 hr ago');
  });

  it('returns "N days ago" for 24 h or more', () => {
    expect(timeAgo(now - 86400000, now)).toBe('1 days ago');
    expect(timeAgo(now - 172800000, now)).toBe('2 days ago');
    expect(timeAgo(now - 864000000, now)).toBe('10 days ago');
  });
});