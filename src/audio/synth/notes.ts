/**
 * Song notation (TECHNICAL.md §8): songs are data that Claude can write and
 * read. Each stem has one string per bar.
 *
 * Melodic bars are space-separated tokens, one per step:
 *   "A3"          a note (C0–B8, with # for sharps)
 *   "A3+C4+E4"    a chord
 *   "-"           hold: the previous note keeps sounding
 *   "."           rest
 *
 * Drum bars are one character per step: "x" hit, "X" accented hit, "." rest.
 *
 * This file is pure (no Web Audio) so it can be unit-tested.
 */

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "A4" → 440 Hz. Equal temperament, A4 = 440. */
export function noteToFreq(note: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(note);
  if (!m) throw new Error(`Bad note "${note}" (expected e.g. A4, C#3, Bb2)`);
  const [, letter, accidental, octave] = m;
  const semis =
    (SEMITONES[letter as string] as number) +
    (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0) +
    (Number(octave) + 1) * 12;
  return 440 * 2 ** ((semis - 69) / 12);
}

export interface NoteEvent {
  /** Step within the bar where the note starts. */
  readonly step: number;
  /** How many steps it lasts (including holds). */
  readonly length: number;
  /** Frequencies in Hz (several for a chord). Empty for drum hits. */
  readonly freqs: readonly number[];
  /** Velocity, 0..1. */
  readonly velocity: number;
}

export function parseMelodicBar(bar: string, steps: number): NoteEvent[] {
  const tokens = bar.trim().split(/\s+/);
  if (tokens.length !== steps) {
    throw new Error(`Bar "${bar}" has ${tokens.length} steps, expected ${steps}`);
  }
  const events: { step: number; length: number; freqs: number[]; velocity: number }[] = [];
  tokens.forEach((token, step) => {
    if (token === '.') return;
    if (token === '-') {
      const last = events[events.length - 1];
      if (last && last.step + last.length === step) last.length++;
      return;
    }
    events.push({ step, length: 1, freqs: token.split('+').map(noteToFreq), velocity: 0.8 });
  });
  return events;
}

export function parseDrumBar(bar: string, steps: number): NoteEvent[] {
  const chars = bar.replace(/\s+/g, '');
  if (chars.length !== steps) {
    throw new Error(`Drum bar "${bar}" has ${chars.length} steps, expected ${steps}`);
  }
  const events: NoteEvent[] = [];
  [...chars].forEach((ch, step) => {
    if (ch === 'x') events.push({ step, length: 1, freqs: [], velocity: 0.75 });
    else if (ch === 'X') events.push({ step, length: 1, freqs: [], velocity: 1 });
    else if (ch !== '.') throw new Error(`Drum bar "${bar}": unknown step "${ch}"`);
  });
  return events;
}

/** Repeat a bar (or a group of bars) n times. */
export function rep(bars: string | readonly string[], n: number): string[] {
  const group = typeof bars === 'string' ? [bars] : [...bars];
  return Array.from({ length: n }, () => group).flat();
}
