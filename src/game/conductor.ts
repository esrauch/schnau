/**
 * The music and the effects (TECHNICAL.md §8). The music is the soundtrack,
 * never a clock for play: `start()` (inside the PLAY tap, since browsers only
 * start audio from a gesture) begins a song looping, with its beat clock.
 * `setSong` switches songs: every song shares one beat grid, so the new one
 * comes in beat for beat, crossfading over two bars from the next bar line.
 * Pausing suspends the AudioContext, and the music freezes with it.
 */
import { suspendAudio, unlockAudio } from '../audio/context';
import { getMixer, type Mixer } from '../audio/mixer';
import { MusicPlayer, RENDER_RATE, prepareSong } from '../audio/music';
import { SfxPlayer, prepareSfx, type SfxId } from '../audio/sfx';
import { GAME_SONGS, SONG_GRID } from '../audio/songs';
import type { Song } from '../audio/synth/render';
import { BeatClock } from '../beat/clock';

/** A crossfade between songs takes this many bars, starting on a bar line. */
const CROSSFADE_BARS = 2;
const BAR_SECONDS = (SONG_GRID.beatsPerBar * 60) / SONG_GRID.bpm;

/** Something playing (a song's stems), and how to fade it out. */
interface Playing {
  readonly id: string;
  fadeOut(at: number, seconds: number): void;
}

export class Conductor {
  private clock: BeatClock | null = null;
  private sfx: SfxPlayer | null = null;
  private audio: { ctx: AudioContext; mixer: Mixer; origin: number } | null = null;
  private playing: Playing | null = null;
  /** What should be playing (the last asked for). */
  private wanted: Song | null = null;

  constructor() {
    // Rendering the songs and effects doesn't need a tap, so start right away: the first
    // song on its own, so it's ready soonest, then the rest.
    const [first, ...rest] = GAME_SONGS;
    void prepareSong(first).then(() => {
      for (const song of rest) void prepareSong(song);
    });
    void prepareSfx(RENDER_RATE);
  }

  /** Whether the music (and so the tick) has started. */
  get started(): boolean {
    return this.clock !== null;
  }

  /** Start `song` and the beat clock. Call from inside a tap. */
  async start(song: Song): Promise<void> {
    if (this.clock) return;
    this.wanted = song;
    const ctx = await unlockAudio();
    const mixer = getMixer(ctx);
    const music = new MusicPlayer(ctx, mixer, song, await prepareSong(song));
    this.sfx = new SfxPlayer(ctx, mixer, await prepareSfx(RENDER_RATE));
    const origin = ctx.currentTime + 0.1;
    music.start(origin);
    this.audio = { ctx, mixer, origin };
    this.playing = { id: song.id, fadeOut: (at, s) => music.fadeOut(at, s) };
    this.clock = new BeatClock(ctx);
    this.clock.startAt(song.bpm, origin);
    // Asked for another song while this one was getting ready: switch now.
    if (this.wanted.id !== song.id) this.setSong(this.wanted);
  }

  /** Play `song` (a no-op if it's already playing): it crossfades in, in time with the beat. */
  setSong(song: Song): void {
    this.wanted = song;
    if (!this.audio || !this.playing || this.playing.id === song.id) return;
    void this.crossfade(song);
  }

  /** Still wanted, and not already playing (after waiting for something to load). */
  private stillWanted(id: string): boolean {
    return this.wanted?.id === id && this.playing?.id !== id;
  }

  private async crossfade(song: Song): Promise<void> {
    const stems = await prepareSong(song);
    const audio = this.audio;
    const old = this.playing;
    if (!audio || !old || !this.stillWanted(song.id)) return;
    const { ctx, mixer, origin } = audio;
    const at = ctx.currentTime + 0.05;
    const beat = ((at - origin) * SONG_GRID.bpm) / 60;
    const bar = origin + Math.ceil((at - origin) / BAR_SECONDS) * BAR_SECONDS;
    const seconds = CROSSFADE_BARS * BAR_SECONDS;
    const next = new MusicPlayer(ctx, mixer, song, stems);
    next.start(at, beat, { at: bar, seconds });
    old.fadeOut(bar, seconds);
    this.playing = { id: song.id, fadeOut: (t, s) => next.fadeOut(t, s) };
  }

  /** Song beats heard by a performance-clock moment (ms), with the fraction; null before start. */
  beatAt(perfMs?: number): number | null {
    const heard = this.clock?.position(perfMs);
    return heard ? heard.index + Math.max(0, heard.phase) : null;
  }

  /** Freeze the music, and with it the beat. */
  pause(): void {
    void suspendAudio();
  }

  /** Carry on exactly where the pause left off. Call from inside a tap. */
  async resume(): Promise<void> {
    await unlockAudio();
  }

  play(id: SfxId): void {
    this.sfx?.play(id);
  }
}
