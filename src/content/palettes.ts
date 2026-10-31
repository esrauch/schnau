/**
 * The single source of truth for colors. It feeds voxel vertex colors, CSS
 * custom properties and SVG fills, so 3D and 2D always match (TECHNICAL.md §9).
 * These are neutral starters: retune them once the game has an art direction.
 */

export type Hex = `#${string}`;

/** Shared colors used everywhere: the backdrop, the ground, the UI chrome. */
export const common = {
  /** The world behind everything: the page, the empty scene and the fog all fade to this. */
  backdrop: '#7cc4f5',
  ground: '#8fd14f',
  groundDark: '#6fb83c',
  accent: '#ffb627',
  bone: '#f4efe4',
  ink: '#1f2430',
  /** Warnings and errors. */
  danger: '#e8344e',
  white: '#ffffff',
} as const satisfies Record<string, Hex>;

/**
 * Named colors that voxel models (.voxt) refer to. Models use these names,
 * never raw hex, so changing a color here recolors every model that uses it.
 */
export const voxel = {
  ink: '#1f2430',
  white: '#ffffff',
  bone: '#f4efe4',
  red: '#e2543b',
  orange: '#ff8a1f',
  gold: '#ffb627',
  green: '#6cc447',
  blue: '#4a90d9',
  purple: '#a259ff',
  wood: '#b88a5e',
  woodDark: '#7a4e2d',
  stone: '#8d93a3',
  stoneDark: '#646a79',
  pink: '#ff7b93',
  pinkLight: '#ffb3c1',
  /** Eyes and noses: deeper than any coat, so they read even on the black dog. */
  eye: '#0e1018',
  // The black schnauzer: a cool charcoal (true black has no lit side), greying furnishings.
  coal: '#454c62',
  coalLight: '#6a7288',
  bandanaGreen: '#1fa35c',
  // The spitz: pale cream, warm apricot on the crown and ears, a white muzzle,
  // brown eyes and nose, a teal collar with a silver bone tag.
  spitzCream: '#f3dfbd',
  apricot: '#e2b076',
  apricotDark: '#c4884e',
  muzzleWhite: '#fbf4e6',
  noseBrown: '#3d2826',
  eyeBrown: '#26160f',
  collarTeal: '#1d8c8c',
  silver: '#c9ced8',
  // Grandma's cottage and the doghouse.
  wallCream: '#fbe7c2',
  roofRed: '#d9573b',
  doorBlue: '#3d7ea6',
  glass: '#a7d8f0',
  doghouseRed: '#d94a3d',
  biscuit: '#d99b55',
  // The goblin: green, big-eared, in a scruffy brown tunic, with yellow eyes.
  goblinGreen: '#86c443',
  goblinDark: '#5b9230',
  tunic: '#8a5a33',
  goblinEye: '#ffe14d',
  // Bugs: little purple beetles with pale wings.
  bugPurple: '#6b3fa0',
  wing: '#e8eefc',
  // The dragon: a big round red dragon with a golden belly.
  dragonRed: '#e2513d',
  dragonDark: '#a8362c',
  dragonBelly: '#ffd27a',
  horn: '#f3e6c4',
  // Sheep: fluffy cream wool, a dark face and legs.
  wool: '#fbf6ea',
  sheepFace: '#3b3542',
  // The pen's floor, and the yard's trees and flowers.
  penDirt: '#dcc28c',
  pine: '#2f7a52',
  pineLight: '#4f9e5f',
  bloomPink: '#ff8fb8',
  leaf: '#3fae3c',
  leafLight: '#7fd34a',
  bark: '#9a6438',
} as const satisfies Record<string, Hex>;

/** The sunny-day sky. */
export const sky = {
  top: '#3d8fe6',
  horizon: '#c4ecff',
  sun: '#fff3d6',
} as const satisfies Record<string, Hex>;

/**
 * The two cel tones (render/toon.ts): every surface is its own colour × the
 * lit tint where the sun reaches it; where it doesn't, its (linear) colour
 * raised to the shade gamma, which darkens and saturates it, × the shade tint.
 */
export const cel = {
  litTint: '#fffaf0',
  shadeTint: '#d2d8f4',
  shadeGamma: 1.45,
} as const;

export type VoxelColor = keyof typeof voxel;
export type CommonColor = keyof typeof common;

/** Convert a palette hex string to a 0xRRGGBB number for three.js. */
export function hexToNumber(hex: Hex): number {
  return Number.parseInt(hex.slice(1), 16);
}
