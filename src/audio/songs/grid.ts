import type { Song } from '../synth/render';

/**
 * The beat grid every song shares: the same tempo, meter and loop length, so
 * any two songs line up beat for beat and bar for bar, and can crossfade at
 * any moment without drifting (tests/audio checks this). Songs also all sit
 * in A minor, so two overlapping mid-fade don't clash.
 */
export const SONG_GRID = {
  bpm: 120,
  beatsPerBar: 4,
  bars: 8,
} as const satisfies Pick<Song, 'bpm' | 'beatsPerBar' | 'bars'>;
