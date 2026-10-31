import {
  beatPosition,
  beatTime,
  judge,
  nearestBeat,
  perfToHeardTime,
  resolveBeat,
  type BeatGrid,
  type Judgement,
  type OutputStamp,
} from './beatMath';

export interface BeatClockOptions {
  /** How far ahead (seconds) beats are handed to the audio scheduler. */
  lookahead?: number;
  /** How often (ms) the scheduler wakes up to look ahead. */
  intervalMs?: number;
}

export interface TapResult {
  /** The beat nearest the tap. */
  nearest: number;
  /** Seconds from that beat, after calibration (negative = early). */
  offset: number;
  /** The beat the tapped action resolves on. */
  resolvesOn: number;
  judgement: Judgement;
}

type BeatListener = (index: number, time: number) => void;

/**
 * The music's beat clock (TECHNICAL.md §8). Beats are defined on the
 * AudioContext clock and handed to listeners slightly ahead of time, so audio
 * can be scheduled sample-accurately; positions are mapped onto the
 * *audible* time via getOutputTimestamp, so what you see matches what you
 * hear.
 */
export class BeatClock {
  private grid: BeatGrid | null = null;
  private nextToSchedule = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly listeners = new Set<BeatListener>();
  private readonly lookahead: number;
  private readonly intervalMs: number;

  constructor(
    private readonly ctx: AudioContext,
    options: BeatClockOptions = {},
  ) {
    this.lookahead = options.lookahead ?? 0.12;
    this.intervalMs = options.intervalMs ?? 25;
  }

  get running(): boolean {
    return this.grid !== null;
  }

  get bpm(): number | null {
    return this.grid?.bpm ?? null;
  }

  /** Start a beat grid whose first beat lands `delay` seconds from now. */
  start(bpm: number, delay = 0.2): void {
    this.startAt(bpm, this.ctx.currentTime + delay);
  }

  /** Start a beat grid whose first beat (beat 0) lands at context time `origin`. */
  startAt(bpm: number, origin: number): void {
    this.stop();
    this.grid = { bpm, origin };
    this.nextToSchedule = 0;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), this.intervalMs);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.grid = null;
  }

  /** Called with (beatIndex, contextTime) shortly before each beat lands. */
  onBeatScheduled(listener: BeatListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * The context time that was audible at a performance-clock moment (ms).
   * Never past the context's own clock, so while the context is suspended
   * (paused) the heard time, and every beat, stands still.
   */
  heardTime(perfMs: number = performance.now()): number {
    return Math.min(perfToHeardTime(perfMs, this.outputStamp()), this.ctx.currentTime);
  }

  /** Where the beat is right now, as heard: the renderer animates from this every frame. */
  position(perfMs?: number): { index: number; phase: number } | null {
    return this.grid ? beatPosition(this.grid, this.heardTime(perfMs)) : null;
  }

  /**
   * Judge a tap. `eventTimeStamp` is the pointer event's `timeStamp`.
   * `calibration` (seconds) is the player's measured latency: positive means
   * they tap that much late, so it's subtracted before judging.
   */
  judgeTap(eventTimeStamp: number, calibration: number, window: number): TapResult | null {
    if (!this.grid) return null;
    const t = this.heardTime(eventTimeStamp) - calibration;
    const { index, offset } = nearestBeat(this.grid, t);
    return {
      nearest: index,
      offset,
      resolvesOn: resolveBeat(this.grid, t),
      judgement: judge(offset, window),
    };
  }

  /** The context time beat `index` lands at. */
  timeOf(index: number): number | null {
    return this.grid ? beatTime(this.grid, index) : null;
  }

  /** How the audio and performance clocks line up, with a fallback for browsers without getOutputTimestamp. */
  outputStamp(): OutputStamp {
    const stamp = this.ctx.getOutputTimestamp?.();
    if (stamp?.contextTime !== undefined && stamp.performanceTime) {
      return { contextTime: stamp.contextTime, performanceTime: stamp.performanceTime };
    }
    const latency = this.ctx.outputLatency || this.ctx.baseLatency || 0;
    return { contextTime: this.ctx.currentTime - latency, performanceTime: performance.now() };
  }

  private schedule(): void {
    if (!this.grid) return;
    const horizon = this.ctx.currentTime + this.lookahead;
    while (beatTime(this.grid, this.nextToSchedule) < horizon) {
      const time = beatTime(this.grid, this.nextToSchedule);
      for (const listener of this.listeners) listener(this.nextToSchedule, time);
      this.nextToSchedule++;
    }
  }
}
