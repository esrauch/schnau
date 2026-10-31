/**
 * Rendering songs (TECHNICAL.md §8, decided: render at load, not live). Each
 * stem of a song is rendered once into an AudioBuffer with an
 * OfflineAudioContext, then played back as a perfectly looping buffer, so
 * playback costs almost nothing on a phone.
 *
 * Seamless loops: each stem is rendered with an extra tail, and the tail
 * (echoes, ringing notes) is folded back onto the start of the loop.
 */
import { INSTRUMENTS, softClip, type InstrumentId } from './instruments';
import { parseDrumBar, parseMelodicBar } from './notes';

const DRUMS: ReadonlySet<InstrumentId> = new Set([
  'kick',
  'snare',
  'hat',
  'clap',
  'brush',
  'cowbell',
]);
const TAIL_SECONDS = 2;

export interface Stem {
  readonly id: string;
  readonly instrument: InstrumentId;
  readonly gain: number;
  /** Steps per bar (e.g. 16 for sixteenth notes, 8 for eighths). */
  readonly steps: number;
  /** One pattern string per bar of the song (see notes.ts for the notation). */
  readonly bars: readonly string[];
  readonly fx?: {
    /** A feedback echo, timed in beats. */
    readonly echo?: { readonly beats: number; readonly feedback: number; readonly mix: number };
    /** Soft-clip drive, 0..1. */
    readonly drive?: number;
  };
}

export interface Song {
  readonly id: string;
  readonly name: string;
  readonly bpm: number;
  readonly beatsPerBar: number;
  /** Loop length in bars. Every stem has exactly this many bars. */
  readonly bars: number;
  readonly stems: readonly Stem[];
  /** Stem mixes: `play` is what the game loops; `setup` is a thinner mix, auditioned on the dev audio board. */
  readonly layers: { readonly setup: readonly string[]; readonly play: readonly string[] };
}

export function loopSeconds(song: Song): number {
  return (song.bars * song.beatsPerBar * 60) / song.bpm;
}

/** Check a song's data: every stem has the right number of bars and steps. Throws on mistakes. */
export function validateSong(song: Song): void {
  for (const stem of song.stems) {
    if (stem.bars.length !== song.bars) {
      throw new Error(`${song.id}/${stem.id}: ${stem.bars.length} bars, expected ${song.bars}`);
    }
    const parse = DRUMS.has(stem.instrument) ? parseDrumBar : parseMelodicBar;
    stem.bars.forEach((bar, i) => {
      try {
        parse(bar, stem.steps);
      } catch (e) {
        throw new Error(`${song.id}/${stem.id} bar ${i + 1}: ${(e as Error).message}`, {
          cause: e,
        });
      }
    });
  }
  for (const id of [...song.layers.setup, ...song.layers.play]) {
    if (!song.stems.some((s) => s.id === id))
      throw new Error(`${song.id}: layer names unknown stem "${id}"`);
  }
}

export async function renderStem(song: Song, stem: Stem, sampleRate: number): Promise<AudioBuffer> {
  const loop = loopSeconds(song);
  const loopLength = Math.round(loop * sampleRate);
  const ctx = new OfflineAudioContext(
    1,
    loopLength + Math.round(TAIL_SECONDS * sampleRate),
    sampleRate,
  );

  // Stem chain: voices → (drive) → stem gain → (echo) → output.
  const input = ctx.createGain();
  const level = ctx.createGain();
  level.gain.value = stem.gain;
  if (stem.fx?.drive) input.connect(softClip(ctx, stem.fx.drive)).connect(level);
  else input.connect(level);
  level.connect(ctx.destination);
  const echo = stem.fx?.echo;
  if (echo) {
    const delay = ctx.createDelay(4);
    delay.delayTime.value = (echo.beats * 60) / song.bpm;
    const feedback = ctx.createGain();
    feedback.gain.value = echo.feedback;
    const wet = ctx.createGain();
    wet.gain.value = echo.mix;
    level.connect(delay).connect(feedback).connect(delay);
    delay.connect(wet).connect(ctx.destination);
  }

  const play = INSTRUMENTS[stem.instrument];
  const barSeconds = (song.beatsPerBar * 60) / song.bpm;
  const stepSeconds = barSeconds / stem.steps;
  const parse = DRUMS.has(stem.instrument) ? parseDrumBar : parseMelodicBar;
  stem.bars.forEach((bar, b) => {
    for (const e of parse(bar, stem.steps)) {
      play({
        ctx,
        out: input,
        time: b * barSeconds + e.step * stepSeconds,
        duration: e.length * stepSeconds,
        freqs: e.freqs,
        velocity: e.velocity,
      });
    }
  });

  const rendered = await ctx.startRendering();
  // Fold the tail back onto the start, so the loop is seamless.
  const out = new AudioBuffer({ numberOfChannels: 1, length: loopLength, sampleRate });
  const src = rendered.getChannelData(0);
  const dst = out.getChannelData(0);
  dst.set(src.subarray(0, loopLength));
  for (let i = loopLength; i < src.length; i++) {
    const j = (i - loopLength) % loopLength;
    dst[j] = (dst[j] ?? 0) + (src[i] ?? 0);
  }
  return out;
}

/** Render every stem of a song. */
export async function renderSong(
  song: Song,
  sampleRate: number,
): Promise<Map<string, AudioBuffer>> {
  validateSong(song);
  const entries = await Promise.all(
    song.stems.map(async (stem) => [stem.id, await renderStem(song, stem, sampleRate)] as const),
  );
  return new Map(entries);
}
