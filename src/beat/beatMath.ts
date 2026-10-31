/**
 * Pure beat maths: no Web Audio, no DOM, so it can be unit-tested.
 * All times are in seconds on the AudioContext clock (TECHNICAL.md §8).
 */

/** A regular beat grid: beat 0 lands at `origin`, then every 60/bpm seconds. */
export interface BeatGrid {
  readonly bpm: number;
  readonly origin: number;
}

export function secondsPerBeat(bpm: number): number {
  return 60 / bpm;
}

/** The context time at which beat `index` lands. */
export function beatTime(grid: BeatGrid, index: number): number {
  return grid.origin + index * secondsPerBeat(grid.bpm);
}

/** Which beat we're in at time `t`, and how far through it (phase in [0, 1)). */
export function beatPosition(grid: BeatGrid, t: number): { index: number; phase: number } {
  const beats = (t - grid.origin) / secondsPerBeat(grid.bpm);
  const index = Math.floor(beats);
  return { index, phase: beats - index };
}

/** The beat closest to `t`, and how far `t` is from it (negative = early, positive = late). */
export function nearestBeat(grid: BeatGrid, t: number): { index: number; offset: number } {
  const index = Math.round((t - grid.origin) / secondsPerBeat(grid.bpm));
  return { index, offset: t - beatTime(grid, index) };
}

/**
 * The beat an action tapped at `t` resolves on. "Actions happen on the next
 * beat": an early tap aimed at an upcoming beat resolves on that beat, and a
 * tap after a beat has passed resolves on the following one.
 */
export function resolveBeat(grid: BeatGrid, t: number): number {
  const { index, offset } = nearestBeat(grid, t);
  return offset <= 0 ? index : index + 1;
}

export type Judgement = 'onBeat' | 'offBeat';

/**
 * The gameplay no longer awards a separate perfect-timing result.
 * The beat is the shared timing layer, not a score mechanic, so this returns
 * a neutral off-beat result for compatibility while the action itself still
 * resolves on the beat clock.
 */
export function judge(_offset: number, _window: number): Judgement {
  return 'offBeat';
}

/** A paired reading of the audio clock and the performance clock (AudioContext.getOutputTimestamp). */
export interface OutputStamp {
  /** Context time (seconds) of the sample currently coming out of the speakers. */
  readonly contextTime: number;
  /** performance.now() (milliseconds) at the moment of that reading. */
  readonly performanceTime: number;
}

/**
 * Convert a performance-clock timestamp (e.g. a pointer event's `timeStamp`)
 * into the context time that was *audible* at that moment.
 */
export function perfToHeardTime(perfMs: number, stamp: OutputStamp): number {
  return stamp.contextTime + (perfMs - stamp.performanceTime) / 1000;
}

/** Median of a list of numbers (used for calibration; robust to a few stray taps). */
export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error('median() of an empty list');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}
