/**
 * The .voxt text voxel format (TECHNICAL.md §11): voxel models written as
 * plain text, so they can be authored, read and diffed like code.
 *
 *   # A comment.
 *   size 5 7 4          width (x), height (y), depth (z)
 *   voxel 0.11          world units per voxel
 *   mirror x            optional: each row gives the left half plus the centre column
 *   smooth 2            optional: mesh as a rounded surface (with this many smoothing passes, default 2)
 *   colors
 *     g gold        one character → a named color from palettes.ts `voxel` (or #rrggbb)
 *     k ink
 *   box 0 0 0 4 0 3 g   fill x0 y0 z0 → x1 y1 z1 (inclusive) with a color ('.' clears)
 *   ellipsoid 4 3 2 2.5 3 2 g   fill voxels within radii rx ry rz of centre x y z (decimals ok)
 *   paint ellipsoid …   (or paint box …) recolour only voxels already filled: markings that
 *                       follow the surface (eyes, patches, a collar) without adding any bumps
 *   slice 0             a front-view slice at depth z (0 = the front, facing the camera)
 *     ..k..             rows from top to bottom, columns left to right
 *   slice 1-3           a range: the same grid for depths 1, 2 and 3
 *
 * '.' (or a space) is empty. Steps apply in order, so later ones overwrite earlier ones.
 */
import { voxel as voxelPalette, type Hex } from '../content/palettes';

export interface VoxelModel {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  /** World units per voxel. */
  readonly scale: number;
  /** Hex colors; voxel value N (1-based) is colors[N - 1]. */
  readonly colors: readonly Hex[];
  /** One byte per voxel at x + y·width + z·width·height. 0 = empty. */
  readonly data: Uint8Array;
  /** Smoothing passes for a rounded mesh; 0 meshes it as blocks. */
  readonly smooth: number;
}

export class VoxtError extends Error {
  constructor(id: string, line: number, message: string) {
    super(`${id}.voxt line ${line}: ${message}`);
  }
}

export function voxelIndex(m: { width: number; height: number }, x: number, y: number, z: number) {
  return x + y * m.width + z * m.width * m.height;
}

/** Resolve a color name from the voxel palette, or a literal #rrggbb. */
export function resolveColor(name: string): Hex | null {
  if (/^#[0-9a-f]{6}$/i.test(name)) return name.toLowerCase() as Hex;
  return (voxelPalette as Record<string, Hex>)[name] ?? null;
}

export function parseVoxt(id: string, source: string): VoxelModel {
  const lines = source.split('\n');
  let size: [number, number, number] | null = null;
  let scale = 0.1;
  let mirror = false;
  let smooth = 0;
  const legend = new Map<string, number>(); // char → 1-based color index
  const colors: Hex[] = [];
  let data: Uint8Array | null = null;
  let mode: 'top' | 'colors' | 'slice' = 'top';
  let slice: { from: number; to: number; rows: string[]; line: number } | null = null;

  const fail = (line: number, msg: string): never => {
    throw new VoxtError(id, line, msg);
  };
  const need = (line: number): { data: Uint8Array; size: [number, number, number] } =>
    data && size ? { data, size } : fail(line, '"size" must come before any voxels');
  const valueOf = (ch: string, line: number): number => {
    if (ch === '.' || ch === ' ') return 0;
    return legend.get(ch) ?? fail(line, `unknown color character "${ch}"`);
  };

  const flushSlice = (): void => {
    if (!slice) return;
    const {
      data: d,
      size: [w, h],
    } = need(slice.line);
    if (slice.rows.length !== h) {
      fail(slice.line, `slice has ${slice.rows.length} rows, expected ${h}`);
    }
    const rowWidth = mirror ? Math.ceil(w / 2) : w;
    slice.rows.forEach((raw, r) => {
      const row = raw.padEnd(rowWidth, '.');
      if (row.length !== rowWidth) {
        fail(slice!.line + 1 + r, `row has ${row.length} columns, expected ${rowWidth}`);
      }
      const y = h - 1 - r; // rows are written top to bottom
      for (let c = 0; c < rowWidth; c++) {
        const v = valueOf(row[c] as string, slice!.line + 1 + r);
        const xs = mirror ? [c, w - 1 - c] : [c];
        for (let z = slice!.from; z <= slice!.to; z++) {
          for (const x of xs) d[voxelIndex({ width: w, height: h }, x, y, z)] = v;
        }
      }
    });
    slice = null;
  };

  lines.forEach((rawLine, i) => {
    const lineNo = i + 1;
    const line = rawLine.replace(/#(?![0-9a-f]{6}\b).*$/i, '').trimEnd();
    if (line.trim() === '') return;
    const indented = /^\s/.test(line);
    const words = line.trim().split(/\s+/);
    // `paint <shape>` recolours filled voxels only.
    const paint = words[0] === 'paint' && !indented;
    if (paint) words.shift();
    const head = words[0] as string;
    const put = (d: Uint8Array, i: number, v: number): void => {
      if (!paint || d[i]) d[i] = v;
    };

    if (indented && mode === 'colors') {
      const [ch, name] = words;
      if (!ch || ch.length !== 1 || !name) fail(lineNo, 'expected "<char> <color>"');
      const hex = resolveColor(name as string) ?? fail(lineNo, `unknown color "${name}"`);
      colors.push(hex);
      legend.set(ch as string, colors.length);
      return;
    }
    if (indented && mode === 'slice' && slice) {
      slice.rows.push(line.trim());
      return;
    }
    flushSlice();
    mode = 'top';
    if (paint && head !== 'box' && head !== 'ellipsoid')
      fail(lineNo, 'paint works with box or ellipsoid');

    switch (head) {
      case 'size': {
        const nums = words.slice(1).map(Number);
        if (nums.length !== 3 || nums.some((n) => !Number.isInteger(n) || n < 1 || n > 64)) {
          fail(lineNo, 'size needs three whole numbers from 1 to 64');
        }
        size = nums as [number, number, number];
        data = new Uint8Array(size[0] * size[1] * size[2]);
        break;
      }
      case 'voxel':
        scale = Number(words[1]);
        if (!(scale > 0)) fail(lineNo, 'voxel needs a positive size');
        break;
      case 'mirror':
        if (words[1] !== 'x') fail(lineNo, 'only "mirror x" is supported');
        mirror = true;
        break;
      case 'smooth':
        smooth = words[1] === undefined ? 2 : Number(words[1]);
        if (!Number.isInteger(smooth) || smooth < 0 || smooth > 8) {
          fail(lineNo, 'smooth takes a whole number of passes from 0 to 8');
        }
        break;
      case 'colors':
        mode = 'colors';
        break;
      case 'ellipsoid': {
        const {
          data: d,
          size: [w, h, dep],
        } = need(lineNo);
        const nums = words.slice(1, 7).map(Number);
        if (
          nums.length !== 6 ||
          nums.some((n) => !Number.isFinite(n)) ||
          nums.slice(3).some((r) => r <= 0)
        ) {
          fail(lineNo, 'ellipsoid needs x y z rx ry rz (radii above 0) and a color');
        }
        const [cx, cy, cz, rx, ry, rz] = nums as [number, number, number, number, number, number];
        const v = valueOf(words[7] ?? fail(lineNo, 'ellipsoid needs a color'), lineNo);
        const range = (c: number, r: number, n: number): [number, number] => [
          Math.max(0, Math.ceil(c - r)),
          Math.min(n - 1, Math.floor(c + r)),
        ];
        const [x0, x1] = range(cx, rx, w);
        const [y0, y1] = range(cy, ry, h);
        const [z0, z1] = range(cz, rz, dep);
        for (let z = z0; z <= z1; z++)
          for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) {
              const r = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
              if (r <= 1) put(d, voxelIndex({ width: w, height: h }, x, y, z), v);
            }
        break;
      }
      case 'box': {
        const {
          data: d,
          size: [w, h, dep],
        } = need(lineNo);
        const nums = words.slice(1, 7).map(Number);
        if (nums.length !== 6 || nums.some((n) => !Number.isInteger(n))) {
          fail(lineNo, 'box needs x0 y0 z0 x1 y1 z1 and a color');
        }
        const [x0, y0, z0, x1, y1, z1] = nums as [number, number, number, number, number, number];
        if (
          x1 >= w ||
          y1 >= h ||
          z1 >= dep ||
          x0 < 0 ||
          y0 < 0 ||
          z0 < 0 ||
          x0 > x1 ||
          y0 > y1 ||
          z0 > z1
        ) {
          fail(lineNo, 'box is outside the model or inside-out');
        }
        const v = valueOf(words[7] ?? fail(lineNo, 'box needs a color'), lineNo);
        for (let z = z0; z <= z1; z++)
          for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) put(d, voxelIndex({ width: w, height: h }, x, y, z), v);
        break;
      }
      case 'slice': {
        const {
          size: [, , dep],
        } = need(lineNo);
        const m = /^(\d+)(?:-(\d+))?$/.exec(words[1] ?? '');
        if (!m) fail(lineNo, 'slice needs a depth, like "slice 0" or "slice 1-3"');
        const from = Number(m![1]);
        const to = m![2] === undefined ? from : Number(m![2]);
        if (to < from || to >= dep) fail(lineNo, `slice depth must be within 0-${dep - 1}`);
        slice = { from, to, rows: [], line: lineNo };
        mode = 'slice';
        break;
      }
      default:
        fail(lineNo, `unknown keyword "${head}"`);
    }
  });
  flushSlice();

  const {
    data: d,
    size: [width, height, depth],
  } = need(lines.length);
  return { id, width, height, depth, scale, colors, data: d, smooth };
}
