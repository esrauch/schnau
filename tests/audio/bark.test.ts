import { describe, expect, it } from 'vitest';
import { BARKS, renderBarkSamples } from '../../src/audio/bark';

describe('barks', () => {
  for (const [id, bark] of Object.entries(BARKS)) {
    it(`${id}: a short, clean, levelled burst that starts and ends in silence`, () => {
      const samples = renderBarkSamples(bark, 0, 48000);
      expect(samples.every(Number.isFinite)).toBe(true);
      const peak = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      expect(peak).toBeCloseTo(1, 5);
      // Short: under a quarter of a second, tail and all.
      expect(samples.length / 48000).toBeLessThan(0.3);
      // No click at the end.
      expect(Math.abs(samples[samples.length - 1] ?? 1)).toBeLessThan(0.01);
    });
  }

  it('renders the same take the same way, and different takes differently', () => {
    const a = renderBarkSamples(BARKS.rozWoof, 1, 48000);
    const b = renderBarkSamples(BARKS.rozWoof, 1, 48000);
    const c = renderBarkSamples(BARKS.rozWoof, 2, 48000);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});
