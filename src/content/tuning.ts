/** Shared numbers for the beat clock spike and the audio mixer. */
export const tuning = {
  beat: {
    /** Default tempo for the beat-clock spike. */
    defaultBpm: 120,
    /** ± seconds around a beat that count as On-Beat. */
    onBeatWindow: 0.08,
  },
  calibration: {
    /** Taps ignored at the start while the player finds the beat. */
    warmupTaps: 4,
    /** Taps measured after the warm-up. */
    measuredTaps: 12,
  },
  audio: {
    /** Bus levels (0..1). */
    master: 0.9,
    music: 0.65,
    sfx: 0.8,
    ui: 0.5,
  },
} as const;
