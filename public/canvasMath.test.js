import { gameToCanvas, intensityToColor } from './canvasMath.js';
import { describe, it, expect } from 'vitest';

describe('gameToCanvas', () => {
  it('maps min bounds to canvas origin', () => {
    const { canvasX, canvasY } = gameToCanvas(-120, -120);
    expect(canvasX).toBeCloseTo(0);
    expect(canvasY).toBeCloseTo(512);
  });

  it('maps max bounds to opposite corner', () => {
    const { canvasX, canvasY } = gameToCanvas(14870, 14980);
    expect(canvasX).toBeCloseTo(512);
    expect(canvasY).toBeCloseTo(0);
  });
  it('maps the map center to the canvas center', () => {
      const { canvasX, canvasY } = gameToCanvas(7375, 7430);
      expect(canvasX).toBeCloseTo(256, 0);
      expect(canvasY).toBeCloseTo(256, 0);
  });

  it('flips Y so high game Y is near the canvas top', () => {
      expect(gameToCanvas(0, 14980).canvasY).toBeCloseTo(0, 0);
  });
});

describe('intensityToColor', () => {
  it('returns blue at 0', () => {
    expect(intensityToColor(0)).toEqual([0, 0, 255]);
  });

  it('returns red at 255', () => {
    expect(intensityToColor(255)).toEqual([255, 0, 0]);
  });
  it('returns green at 85', () => {
    expect(intensityToColor(85)).toEqual([0, 255, 0]);
  });

  it('returns yellow at 170', () => {
      expect(intensityToColor(170)).toEqual([255, 255, 0]);
  });
});