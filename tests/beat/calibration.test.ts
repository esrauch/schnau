import { describe, expect, it } from 'vitest';
import { Calibration } from '../../src/beat/calibration';

describe('Calibration', () => {
  it('ignores warm-up taps and reports the median of the rest', () => {
    const cal = new Calibration(2, 5);
    // Warm-up taps are wildly off and must not count.
    cal.addTap(0.3);
    cal.addTap(-0.2);
    expect(cal.result()).toBeNull();
    for (const offset of [0.04, 0.05, 0.045, 0.2, 0.05]) cal.addTap(offset);
    expect(cal.done).toBe(true);
    expect(cal.remaining).toBe(0);
    expect(cal.result()).toBeCloseTo(0.05);
  });

  it('counts down the taps remaining', () => {
    const cal = new Calibration(1, 2);
    expect(cal.remaining).toBe(3);
    cal.addTap(0);
    expect(cal.remaining).toBe(2);
  });
});
