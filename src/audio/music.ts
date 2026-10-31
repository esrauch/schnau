/**
 * Music playback (TECHNICAL.md §8): the stems of the current song's full mix
 * (`layers.play`) loop together as pre-rendered buffers. The game starts it
 * once and it never stops: it's the global tick.
 */
import type { Mixer } from './mixer';
import { loopSeconds, renderSong, type Song } from './synth/render';

/** The rate songs are rendered at. Rendering doesn't need the live context, so it can start at load. */
export const RENDER_RATE = 48_000;

const rendered = new Map<string, Promise<Map<string, AudioBuffer>>>();

/** Start rendering a song (once); resolves to its stem buffers. */
export function prepareSong(song: Song): Promise<Map<string, AudioBuffer>> {
  let p = rendered.get(song.id);
  if (!p) {
    p = renderSong(song, RENDER_RATE);
    rendered.set(song.id, p);
  }
  return p;
}

interface Voice {
  readonly stem: string;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
}

export class MusicPlayer {
  private voices: Voice[] = [];

  constructor(
    private readonly ctx: AudioContext,
    private readonly mixer: Mixer,
    readonly song: Song,
    private readonly stems: Map<string, AudioBuffer>,
  ) {}

  get playing(): boolean {
    return this.voices.length > 0;
  }

  /**
   * Start every stem so that `beatInLoop` beats into the song lands exactly at
   * context time `time`; with `fadeIn`, silent until `fadeIn.at`, then
   * rising to full over `fadeIn.seconds`.
   */
  start(
    time: number,
    beatInLoop = 0,
    fadeIn?: { readonly at: number; readonly seconds: number },
  ): void {
    this.stop();
    const loop = loopSeconds(this.song);
    const offset = ((((beatInLoop * 60) / this.song.bpm) % loop) + loop) % loop;
    for (const id of this.song.layers.play) {
      const buffer = this.stems.get(id);
      if (!buffer) continue;
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = this.ctx.createGain();
      if (fadeIn) {
        gain.gain.setValueAtTime(0, time);
        gain.gain.setValueAtTime(0, fadeIn.at);
        gain.gain.linearRampToValueAtTime(1, fadeIn.at + fadeIn.seconds);
      }
      source.connect(gain).connect(this.mixer.music);
      source.start(time, offset);
      this.voices.push({ stem: id, source, gain });
    }
  }

  /** Fade every stem out over `seconds` from context time `at`, then stop (a crossfade's other half). */
  fadeOut(at: number, seconds: number): void {
    for (const v of this.voices) {
      v.gain.gain.setValueAtTime(1, at);
      v.gain.gain.linearRampToValueAtTime(0, at + seconds);
      v.source.stop(at + seconds + 0.05);
    }
    this.voices = [];
  }

  stop(fade = 0): void {
    const now = this.ctx.currentTime;
    for (const v of this.voices) {
      if (fade > 0) {
        v.gain.gain.setTargetAtTime(0, now, fade / 3);
        v.source.stop(now + fade);
      } else {
        v.source.stop();
      }
    }
    this.voices = [];
  }
}
