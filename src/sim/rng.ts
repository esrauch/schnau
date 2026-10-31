/**
 * Seeded random number generator (mulberry32). The simulation uses only this,
 * never Math.random, so runs are deterministic and replayable from a seed.
 */
export interface Rng {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  /** A uniformly chosen element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(items) {
      if (items.length === 0) throw new Error('pick() called with an empty array');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
  };
}

/** Derive an independent seed from a run seed plus labels (e.g. the screen index). FNV-1a. */
export function deriveSeed(seed: number, ...parts: (string | number)[]): number {
  let h = 0x811c9dc5 ^ (seed >>> 0);
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
