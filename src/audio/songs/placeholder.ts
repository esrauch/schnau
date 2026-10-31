/**
 * "Placeholder": a bare loop on the shared grid (120 BPM, 8 bars, A minor) so
 * the music path has something to play until the game's own songs are written.
 * Am Am F G Am Am F E.
 */
import { rep } from '../synth/notes';
import type { Song } from '../synth/render';
import { SONG_GRID } from './grid';

export const placeholder: Song = {
  id: 'placeholder',
  name: 'Placeholder',
  ...SONG_GRID,
  stems: [
    {
      id: 'kick',
      instrument: 'kick',
      gain: 0.4,
      steps: 8,
      bars: [...rep('x...x...', 7), 'x...x.x.'],
    },
    {
      id: 'hat',
      instrument: 'hat',
      gain: 0.25,
      steps: 8,
      bars: rep('..x...x.', 8),
    },
    {
      id: 'bass',
      instrument: 'bass',
      gain: 0.36,
      steps: 8,
      bars: [
        'A2 . . E2 A2 . C3 .',
        'A2 . . E2 A2 . E3 .',
        'F2 . . C3 F2 . A2 .',
        'G2 . . D3 G2 . B2 .',
        'A2 . . E2 A2 . C3 .',
        'A2 . . E2 A2 . E3 .',
        'F2 . . C3 F2 . A2 .',
        'E2 . . B2 E2 . G#2 .',
      ],
    },
  ],
  layers: {
    setup: ['bass', 'hat'],
    play: ['kick', 'hat', 'bass'],
  },
};
