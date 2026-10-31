/**
 * Every number the game's rules use (GAMEPLAY.md). World units are about a
 * metre; times are seconds. Tune by feel.
 */

export type DogKind = 'schnauzer' | 'spitz';
export type EnemyKind = 'goblin' | 'bugs' | 'dragon';

/** Each dog's name, and what it's better at (shown when picking a dog). */
export const DOG_INFO: Record<DogKind, { readonly name: string; readonly strength: string }> = {
  schnauzer: {
    name: 'Roz',
    strength: 'Roz has the big WOOF: it reaches further and charges faster. A slower dash.',
  },
  spitz: {
    name: 'Lumen',
    strength: 'Lumen has quick yips that reach further, and a faster, longer dash.',
  },
};

export interface DogStats {
  readonly speed: number;
  readonly radius: number;
  readonly hearts: number;
  readonly dash: { readonly speed: number; readonly time: number; readonly cooldown: number };
  readonly yip: {
    /** How far it reaches, and the cone's half-angle (radians). */
    readonly range: number;
    readonly halfAngle: number;
    readonly cooldown: number;
  };
  readonly woof: {
    /** Holding the button longer than this starts a WOOF (shorter is a yip). */
    readonly holdToCharge: number;
    /** Seconds from starting the charge to full. */
    readonly chargeTime: number;
    /** Radius and pips at the smallest and the full charge (a WOOF's strength is its reach, not its bite). */
    readonly radius: readonly [number, number];
    readonly pips: readonly [number, number];
    readonly knockback: number;
    readonly cooldown: number;
    /** Speed while charging, as a fraction of normal. */
    readonly chargeSlow: number;
  };
}

const baseDog: DogStats = {
  speed: 2.6,
  radius: 0.35,
  hearts: 2,
  dash: { speed: 6.5, time: 0.32, cooldown: 1.3 },
  yip: { range: 4, halfAngle: 0.5, cooldown: 0.35 },
  woof: {
    holdToCharge: 0.2,
    chargeTime: 0.6,
    radius: [1.6, 2.6],
    pips: [1, 1],
    knockback: 2.2,
    cooldown: 1.1,
    chargeSlow: 0.4,
  },
};

export const DOGS: Record<DogKind, DogStats> = {
  /** The bigger WOOF, charging faster; a slower dash. */
  schnauzer: {
    ...baseDog,
    dash: { speed: 6, time: 0.3, cooldown: 1.4 },
    woof: { ...baseDog.woof, chargeTime: 0.5, radius: [1.8, 3] },
  },
  /** Quicker yips that reach further; a faster, longer dash. */
  spitz: {
    ...baseDog,
    speed: 2.8,
    dash: { speed: 7.5, time: 0.36, cooldown: 1.1 },
    yip: { range: 4.8, halfAngle: 0.5, cooldown: 0.25 },
  },
};

export interface EnemyStats {
  readonly courage: number;
  readonly speed: number;
  readonly radius: number;
  /** Speed while panicking, running for the woods. */
  readonly fleeSpeed: number;
  /** How long a yip freezes it (0 for never). */
  readonly startle: number;
  /** How much a WOOF's knockback moves it (1 = fully, 0 = not at all). */
  readonly knock: number;
}

export const ENEMIES: Record<EnemyKind, EnemyStats> = {
  goblin: { courage: 2, speed: 1.25, radius: 0.32, fleeSpeed: 3.5, startle: 0.6, knock: 1 },
  bugs: { courage: 1, speed: 1.9, radius: 0.28, fleeSpeed: 4.5, startle: 0.3, knock: 1.3 },
  dragon: { courage: 12, speed: 0.55, radius: 1.1, fleeSpeed: 2.2, startle: 0, knock: 0.08 },
};

export const gameTuning = {
  /** The garden: enemies spawn just outside it and flee back past it. */
  yard: { radius: 8, spawnRadius: 9.5, escapeRadius: 10.5 },
  /** The sheep pen in the middle (a circle, for collisions) and the dog's house. */
  pen: { x: 0, z: -0.4, radius: 1.35 },
  doghouse: { x: 1.9, z: 1, radius: 0.5 },
  /** Treats in the jar at the start. */
  sheep: 8,
  goblin: {
    /** How close to the pen it must get to grab a sheep. */
    reach: 0.4,
    /** Swatting the dog: how close, how often. */
    swatRange: 0.75,
    swatEvery: 1.3,
  },
  bugs: {
    /** They go for the dog when it's this close, else for the pen (where they pester a sheep out). */
    chaseDog: 3.5,
    stingEvery: 1.4,
    /** Seconds pestering the pen before a sheep bolts out. */
    pesterTime: 2.5,
    /** How many swarms make a cloud, and how far apart they start. */
    cloud: [4, 6] as readonly [number, number],
    cloudSpread: 1.2,
  },
  dragon: {
    /** Seconds between fire attacks; how long a circle warns before it lands; its size. */
    fireEvery: 3.2,
    fireWarn: 1.5,
    fireRadius: 1.3,
    fireDamage: 2,
    /** Extra circles around the first one as its courage drops (one more per this many pips lost). */
    extraFirePerPips: 4,
    /** Seconds at the pen per sheep it snatches. */
    snatchTime: 3,
  },
  /** A loose sheep: how close the dog must get to send it home, and how fast it wanders off. */
  pickup: 0.6,
  looseSheep: { speed: 0.35, radius: 0.3 },
  /**
   * Trees in the yard: solid, so the dog and enemies go round them. Clear of
   * the pen, the doghouse and the dog's way out of it.
   */
  trees: [
    { x: -3.2, z: 2.6, radius: 0.45, kind: 'tree' },
    { x: 3.9, z: -2.6, radius: 0.4, kind: 'pine' },
    { x: -4.3, z: -2.9, radius: 0.45, kind: 'tree' },
    { x: 0.9, z: 4.7, radius: 0.4, kind: 'pine' },
    { x: 5.2, z: 1.9, radius: 0.45, kind: 'tree' },
    { x: -1.5, z: -4.9, radius: 0.4, kind: 'pine' },
    { x: -5.7, z: 0.4, radius: 0.4, kind: 'pine' },
    { x: 2.7, z: -5.3, radius: 0.45, kind: 'tree' },
  ] as readonly { x: number; z: number; radius: number; kind: 'tree' | 'pine' }[],
  /** After a hit, the dog can't be hurt again for this long. */
  hurtSafety: 0.9,
  /** Pooped: the dog trots home at this speed and rests this long. */
  pooped: { speed: 2.4, rest: 1.6 },
} as const;

/** One step of the waves: at `at` seconds into the run, spawn `count` of `kind` (spaced `every` seconds). */
export interface Spawn {
  readonly at: number;
  readonly kind: EnemyKind;
  readonly count: number;
  readonly every: number;
}

/** About a minute and a half: a quick build-up of goblins and bugs, the dragon at 0:45. */
export const WAVES: readonly Spawn[] = [
  { at: 2, kind: 'goblin', count: 3, every: 3 },
  { at: 10, kind: 'bugs', count: 1, every: 0 },
  { at: 14, kind: 'goblin', count: 4, every: 2.2 },
  { at: 24, kind: 'bugs', count: 1, every: 0 },
  { at: 28, kind: 'goblin', count: 5, every: 1.8 },
  { at: 40, kind: 'bugs', count: 1, every: 0 },
  { at: 45, kind: 'dragon', count: 1, every: 0 },
  { at: 48, kind: 'goblin', count: 4, every: 4 },
  { at: 56, kind: 'bugs', count: 2, every: 10 },
];
