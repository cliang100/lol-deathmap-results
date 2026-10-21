import { describe, it, expect } from 'vitest';
import { parsePaging } from './paging.js';

describe('parsePaging', () => {
    it('empty query returns defaults', () => {
        expect(parsePaging({})).toEqual({ start: 0, count: 20 });
    });

    it('valid values pass through', () => {
        expect(parsePaging({ start: '0', count: '20' })).toEqual({ start: 0, count: 20 });
    });

    it('start non-numeric becomes 0', () => {
        expect(parsePaging({ start: 'abc' })).toEqual({ start: 0, count: 20 });
    });

    it('start negative becomes 0', () => {
        expect(parsePaging({ start: '-5' })).toEqual({ start: 0, count: 20 });
    });

    it('count non-numeric becomes 20', () => {
        expect(parsePaging({ count: 'abc' })).toEqual({ start: 0, count: 20 });
    });

    it('count 0 becomes 1', () => {
        expect(parsePaging({ count: '0' })).toEqual({ start: 0, count: 1 });
    });

    it('count negative becomes 1', () => {
        expect(parsePaging({ count: '-3' })).toEqual({ start: 0, count: 1 });
    });

    it('count above 20 becomes 20', () => {
        expect(parsePaging({ count: '50' })).toEqual({ start: 0, count: 20 });
    });

    it('numeric strings parse correctly', () => {
        expect(parsePaging({ start: '10', count: '5' })).toEqual({ start: 10, count: 5 });
    });
});