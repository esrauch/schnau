/**
 * The single source of truth for colors. It feeds voxel vertex colors, CSS
 * custom properties and SVG fills, so 3D and 2D always match (TECHNICAL.md §9).
 * These are neutral starters: retune them once the game has an art direction.
 */

export type Hex = `#${string}`;

/** Shared colors used everywhere: the backdrop, the ground, the UI chrome. */
export const common = {
  /** The world behind everything: the page, the empty scene and the fog all fade to this. */
  backdrop: '#2a3242',
  ground: '#6f9c5a',
  groundDark: '#5a8248',
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
} as const satisfies Record<string, Hex>;

export type VoxelColor = keyof typeof voxel;
export type CommonColor = keyof typeof common;

/** Convert a palette hex string to a 0xRRGGBB number for three.js. */
export function hexToNumber(hex: Hex): number {
  return Number.parseInt(hex.slice(1), 16);
}
