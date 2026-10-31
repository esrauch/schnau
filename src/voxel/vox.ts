/**
 * MagicaVoxel (.vox) import (TECHNICAL.md §11). A .vox file is converted into
 * .voxt text, with every color snapped to the nearest named palette color, so
 * imported models share the game's palette and live in the same format as
 * hand-written ones.
 *
 * Axes: MagicaVoxel's x stays x, its z (up) becomes our y, and its y becomes
 * our depth, with y = 0 as the front.
 */
import { voxel as voxelPalette, type Hex } from '../content/palettes';

export interface VoxFile {
  readonly size: readonly [number, number, number];
  /** [x, y, z, colorIndex] with MagicaVoxel's 1-based color index. */
  readonly voxels: readonly (readonly [number, number, number, number])[];
  /** 256 RGBA entries; entry i is color index i + 1. */
  readonly palette: readonly (readonly [number, number, number, number])[];
}

export function parseVox(bytes: Uint8Array): VoxFile {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (tag(0) !== 'VOX ') throw new Error('Not a MagicaVoxel file (missing "VOX " header)');

  let size: [number, number, number] | null = null;
  const voxels: [number, number, number, number][] = [];
  let palette: [number, number, number, number][] | null = null;

  // Chunks follow the 8-byte header; MAIN wraps the rest, so we can scan linearly past its header.
  let at = 8;
  while (at + 12 <= bytes.length) {
    const id = tag(at);
    const content = view.getUint32(at + 4, true);
    const children = view.getUint32(at + 8, true);
    const body = at + 12;
    if (id === 'SIZE' && !size) {
      size = [
        view.getUint32(body, true),
        view.getUint32(body + 4, true),
        view.getUint32(body + 8, true),
      ];
    } else if (id === 'XYZI' && voxels.length === 0) {
      const n = view.getUint32(body, true);
      for (let i = 0; i < n; i++) {
        const p = body + 4 + i * 4;
        voxels.push([bytes[p]!, bytes[p + 1]!, bytes[p + 2]!, bytes[p + 3]!]);
      }
    } else if (id === 'RGBA') {
      palette = Array.from({ length: 256 }, (_, i) => {
        const p = body + i * 4;
        return [bytes[p]!, bytes[p + 1]!, bytes[p + 2]!, bytes[p + 3]!] as [
          number,
          number,
          number,
          number,
        ];
      });
    }
    // MAIN's content is empty and its children follow directly; other chunks are skipped whole.
    at = id === 'MAIN' ? body + content : body + content + children;
  }
  if (!size) throw new Error('.vox file has no SIZE chunk');
  if (!palette) throw new Error('.vox file has no RGBA palette chunk (re-save it in MagicaVoxel)');
  return { size, voxels, palette };
}

/** The named palette color closest to an RGB color. */
export function nearestPaletteColor(r: number, g: number, b: number): string {
  let best = '';
  let bestDist = Infinity;
  for (const [name, hex] of Object.entries(voxelPalette) as [string, Hex][]) {
    const n = Number.parseInt(hex.slice(1), 16);
    const dr = ((n >> 16) & 255) - r;
    const dg = ((n >> 8) & 255) - g;
    const db = (n & 255) - b;
    const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }
  return best;
}

const LEGEND_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Convert a parsed .vox into .voxt text. */
export function voxToVoxt(vox: VoxFile, source: string, scale = 0.1): string {
  const [w, depth, h] = vox.size; // MagicaVoxel z is up
  const colorOf = new Map<number, string>(); // vox color index → palette name
  for (const [, , , ci] of vox.voxels) {
    if (!colorOf.has(ci)) {
      const [r, g, b] = vox.palette[ci - 1] ?? [255, 0, 255, 255];
      colorOf.set(ci, nearestPaletteColor(r, g, b));
    }
  }
  const names = [...new Set(colorOf.values())];
  if (names.length > LEGEND_CHARS.length) throw new Error('Too many distinct colors to import');
  const charOf = new Map(names.map((n, i) => [n, LEGEND_CHARS[i] as string]));

  const grid: string[][][] = Array.from({ length: depth }, () =>
    Array.from({ length: h }, () => Array.from({ length: w }, () => '.')),
  );
  for (const [x, y, z, ci] of vox.voxels) {
    const row = grid[y]?.[h - 1 - z];
    if (row) row[x] = charOf.get(colorOf.get(ci) as string) as string;
  }

  const out = [
    `# Imported from ${source}. Colors were snapped to the nearest palette color.`,
    `size ${w} ${h} ${depth}`,
    `voxel ${scale}`,
    'colors',
    ...names.map((n) => `  ${charOf.get(n)} ${n}`),
  ];
  grid.forEach((slice, z) => {
    out.push(`slice ${z}`, ...slice.map((row) => `  ${row.join('')}`));
  });
  return `${out.join('\n')}\n`;
}
