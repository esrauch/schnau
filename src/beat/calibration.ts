import { median } from './beatMath';

/**
 * Tap-along latency calibration. The player taps with the clicks; after a
 * warm-up, the median offset of their taps becomes the device's latency offset.
 */
export class Calibration {
  private readonly offsets: number[] = [];
  private seen = 0;

  constructor(
    private readonly warmupTaps: number,
    private readonly measuredTaps: number,
  ) {}

  /** Record one tap's raw (uncalibrated) offset in seconds. */
  addTap(rawOffset: number): void {
    this.seen++;
    if (this.seen > this.warmupTaps) this.offsets.push(rawOffset);
  }

  get remaining(): number {
    return Math.max(0, this.warmupTaps + this.measuredTaps - this.seen);
  }

  get done(): boolean {
    return this.remaining === 0;
  }

  /** The measured latency in seconds, once done. */
  result(): number | null {
    return this.done ? median(this.offsets) : null;
  }
}
