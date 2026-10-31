import { placeholder } from './placeholder';

export { SONG_GRID } from './grid';
export { placeholder };

/** Every song. All share SONG_GRID, so any two can crossfade. */
export const SONGS = [placeholder] as const;

/** Every song the game plays (the others are only on the dev audio board). */
export const GAME_SONGS = [placeholder] as const;
