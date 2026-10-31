import { describe, expect, it } from 'vitest';
import { noteToFreq, parseDrumBar, parseMelodicBar, rep } from '../../src/audio/synth/notes';
import { SONGS, SONG_GRID, placeholder } from '../../src/audio/songs';
import { validateSong } from '../../src/audio/synth/render';
import { encodeWav, levels } from '../../src/audio/wav';

describe('noteToFreq', () => {
  it('maps note names to equal-tempered frequencies', () => {
    expect(noteToFreq('A4')).toBeCloseTo(440);
    expect(noteToFreq('A3')).toBeCloseTo(220);
    expect(noteToFreq('C4')).toBeCloseTo(261.63, 1);
    expect(noteToFreq('C#4')).toBeCloseTo(noteToFreq('Db4'));
  });

  it('rejects nonsense', () => {
    expect(() => noteToFreq('H2')).toThrow(/Bad note/);
  });
});

describe('bar parsing', () => {
  it('reads notes, holds, rests and chords', () => {
    const events = parseMelodicBar('A3 - . E4+G4 - - . C5', 8);
    expect(events.map((e) => [e.step, e.length, e.freqs.length])).toEqual([
      [0, 2, 1],
      [3, 3, 2],
      [7, 1, 1],
    ]);
  });

  it('reads drum hits with accents', () => {
    const events = parseDrumBar('X...x... ..x. ...x', 16);
    expect(events.map((e) => [e.step, e.velocity])).toEqual([
      [0, 1],
      [4, 0.75],
      [10, 0.75],
      [15, 0.75],
    ]);
  });

  it('checks the step count', () => {
    expect(() => parseMelodicBar('A3 A3', 8)).toThrow(/expected 8/);
    expect(() => parseDrumBar('x.x', 16)).toThrow(/expected 16/);
  });

  it('repeats bars', () => {
    expect(rep(['a', 'b'], 2)).toEqual(['a', 'b', 'a', 'b']);
  });
});

describe('wav', () => {
  it('writes a valid 16-bit PCM header and samples', () => {
    const wav = encodeWav([Float32Array.from([0, 1, -1])], 8000);
    const view = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF');
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getUint32(40, true)).toBe(6);
    expect([view.getInt16(44, true), view.getInt16(46, true), view.getInt16(48, true)]).toEqual([
      0, 32767, -32768,
    ]);
  });

  it('measures peak and RMS in dBFS', () => {
    const { peakDb, rmsDb } = levels([Float32Array.from([0.5, -0.5])]);
    expect(peakDb).toBeCloseTo(-6.02, 1);
    expect(rmsDb).toBeCloseTo(-6.02, 1);
  });
});

describe('songs', () => {
  it('every song is well-formed: bar counts, step counts, notes and layers', () => {
    for (const song of SONGS) expect(() => validateSong(song)).not.toThrow();
  });

  it('every song shares one beat grid, so any two can crossfade at any moment', () => {
    for (const song of SONGS) {
      expect({ bpm: song.bpm, beatsPerBar: song.beatsPerBar, bars: song.bars }, song.id).toEqual(
        SONG_GRID,
      );
    }
    expect(new Set(SONGS.map((s) => s.id)).size).toBe(SONGS.length);
  });

  it('catches a bar with the wrong number of steps', () => {
    const broken = {
      ...placeholder,
      stems: [{ ...placeholder.stems[0]!, bars: ['x...', ...placeholder.stems[0]!.bars.slice(1)] }],
      layers: { setup: [], play: [] },
    };
    expect(() => validateSong(broken)).toThrow(/kick bar 1/);
  });
});
