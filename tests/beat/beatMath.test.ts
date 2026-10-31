import { describe, expect, it } from 'vitest';
import {
  beatPosition,
  beatTime,
  judge,
  median,
  nearestBeat,
  perfToHeardTime,
  resolveBeat,
  secondsPerBeat,
  type BeatGrid,
} from '../../src/beat/beatMath';

// 120 BPM = 0.5 s per beat, with beat 0 at t = 10 s.
const grid: BeatGrid = { bpm: 120, origin: 10 };

describe('beat grid', () => {
  it('spaces beats by 60/bpm seconds', () => {
    expect(secondsPerBeat(120)).toBe(0.5);
    expect(beatTime(grid, 0)).toBe(10);
    expect(beatTime(grid, 4)).toBe(12);
  });

  it('reports the current beat and phase', () => {
    expect(beatPosition(grid, 10)).toEqual({ index: 0, phase: 0 });
    expect(beatPosition(grid, 10.25)).toEqual({ index: 0, phase: 0.5 });
    expect(beatPosition(grid, 11.125)).toEqual({ index: 2, phase: 0.25 });
  });

  it('handles times before the origin (count-in)', () => {
    expect(beatPosition(grid, 9.75)).toEqual({ index: -1, phase: 0.5 });
  });
});

describe('nearestBeat', () => {
  it('measures early taps as negative offsets', () => {
    const { index, offset } = nearestBeat(grid, 10.98);
    expect(index).toBe(2);
    expect(offset).toBeCloseTo(-0.02);
  });

  it('measures late taps as positive offsets', () => {
    const { index, offset } = nearestBeat(grid, 11.03);
    expect(index).toBe(2);
    expect(offset).toBeCloseTo(0.03);
  });
});

describe('resolveBeat', () => {
  it('resolves an early tap on the beat it was aiming for', () => {
    expect(resolveBeat(grid, 10.98)).toBe(2);
  });

  it('resolves a tap after a beat on the following beat', () => {
    expect(resolveBeat(grid, 11.03)).toBe(3);
  });

  it('resolves a tap mid-beat on the next beat', () => {
    expect(resolveBeat(grid, 11.2)).toBe(3);
  });
});

describe('judge', () => {
  it('does not award a perfect-timing result anymore', () => {
    expect(judge(0.05, 0.08)).toBe('offBeat');
    expect(judge(-0.08, 0.08)).toBe('offBeat');
    expect(judge(0.081, 0.08)).toBe('offBeat');
  });
});

describe('perfToHeardTime', () => {
  it('maps performance-clock milliseconds onto the audible context time', () => {
    const stamp = { contextTime: 5, performanceTime: 1000 };
    expect(perfToHeardTime(1000, stamp)).toBe(5);
    expect(perfToHeardTime(1250, stamp)).toBe(5.25);
    expect(perfToHeardTime(900, stamp)).toBeCloseTo(4.9);
  });
});

describe('median', () => {
  it('handles odd and even lengths and ignores outliers', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([0.02, 0.03, 0.025, 0.4])).toBeCloseTo(0.0275);
  });

  it('throws on an empty list', () => {
    expect(() => median([])).toThrow();
  });
});
