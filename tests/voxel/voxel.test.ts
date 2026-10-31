import { describe, expect, it } from 'vitest';
import { voxel } from '../../src/content/palettes';
import { greedyMesh, type MeshData } from '../../src/voxel/mesh';
import { surfaceNets } from '../../src/voxel/smooth';
import { nearestPaletteColor, parseVox, voxToVoxt } from '../../src/voxel/vox';
import { parseVoxt, voxelIndex, type VoxelModel } from '../../src/voxel/voxt';

const at = (m: VoxelModel, x: number, y: number, z: number) => m.data[voxelIndex(m, x, y, z)];

describe('parseVoxt', () => {
  it('reads size, scale, colors and front-view slices (rows top to bottom)', () => {
    const m = parseVoxt(
      'test',
      `
      # a 3×2×2 model
size 3 2 2
voxel 0.25
colors
  r red
  k #123456
slice 0
  r.k
  ...
slice 1
  ...
  .r.
`,
    );
    expect([m.width, m.height, m.depth, m.scale]).toEqual([3, 2, 2, 0.25]);
    expect(m.colors).toEqual([voxel.red, '#123456']);
    expect(at(m, 0, 1, 0)).toBe(1); // top-left of the front slice
    expect(at(m, 2, 1, 0)).toBe(2);
    expect(at(m, 1, 0, 1)).toBe(1); // bottom-middle of the back slice
    expect(at(m, 1, 1, 0)).toBe(0);
  });

  it('mirrors x and fills slice ranges', () => {
    const m = parseVoxt(
      'test',
      `size 5 1 3
mirror x
colors
  g gold
slice 0-2
  g..
`,
    );
    for (let z = 0; z < 3; z++) {
      expect([0, 1, 2, 3, 4].map((x) => at(m, x, 0, z))).toEqual([1, 0, 0, 0, 1]);
    }
  });

  it('fills boxes, and later steps overwrite earlier ones', () => {
    const m = parseVoxt(
      'test',
      `size 3 3 3
colors
  b wood
  y gold
box 0 0 0 2 2 2 b
box 1 1 0 1 1 0 y
box 1 1 1 1 1 1 .
`,
    );
    expect(at(m, 0, 0, 0)).toBe(1);
    expect(at(m, 1, 1, 0)).toBe(2);
    expect(at(m, 1, 1, 1)).toBe(0);
  });

  it('reports mistakes with the line number', () => {
    expect(() => parseVoxt('bad', 'size 2 2 2\ncolors\n  q notAColor')).toThrow(
      /bad\.voxt line 3: unknown color "notAColor"/,
    );
    expect(() => parseVoxt('bad', 'size 2 2 1\nslice 0\n  ..')).toThrow(/expected 2/);
    expect(() => parseVoxt('bad', 'size 2 1 1\nslice 0\n  .z')).toThrow(/unknown color character/);
    expect(() => parseVoxt('bad', 'box 0 0 0 1 1 1 a')).toThrow(/"size" must come before/);
  });
});

describe('parseVoxt shapes and options', () => {
  it('fills ellipsoids and reads smooth', () => {
    const m = parseVoxt(
      'test',
      `size 5 5 5
smooth
colors
  g gold
ellipsoid 2 2 2 2 1 2 g`,
    );
    expect(m.smooth).toBe(2);
    expect(at(m, 2, 2, 2)).toBe(1);
    expect(at(m, 0, 2, 2)).toBe(1); // on the x radius
    expect(at(m, 2, 0, 2)).toBe(0); // past the y radius
    expect(at(m, 1, 1, 1)).toBe(0);
    expect(parseVoxt('test', 'size 1 1 1').smooth).toBe(0);
  });

  it('paints only voxels that are already filled', () => {
    const m = parseVoxt(
      'test',
      `size 3 1 1
colors
  g gold
  r red
box 0 0 0 1 0 0 g
paint box 0 0 0 2 0 0 r`,
    );
    expect([at(m, 0, 0, 0), at(m, 1, 0, 0), at(m, 2, 0, 0)]).toEqual([2, 2, 0]);
    expect(() => parseVoxt('test', 'size 1 1 1\npaint slice 0')).toThrow(/paint works/);
  });

  it('splits a model into parts, each with its own voxels, painting across them', () => {
    const m = parseVoxt(
      'test',
      `size 3 1 1
colors
  g gold
  r red
part body pivot 1 0 0
box 0 0 0 1 0 0 g
part tail pivot 2 0 0 parent body
box 2 0 0 2 0 0 g
part body
box 1 0 0 1 0 0 g
part tail
box 1 0 0 1 0 0 g
paint box 1 0 0 1 0 0 r`,
    );
    expect(m.parts.map((p) => [p.name, p.parent])).toEqual([
      ['body', null],
      ['tail', 'body'],
    ]);
    const [body, tail] = m.parts;
    // They overlap at x = 1, and the paint reached both.
    expect([...body!.data]).toEqual([1, 2, 0]);
    expect([...tail!.data]).toEqual([0, 2, 1]);
    expect([...m.data]).toEqual([1, 2, 1]);
    expect(() => parseVoxt('test', 'size 1 1 1\npart a pivot 0 0 0 parent b')).toThrow(/parent/);
    expect(parseVoxt('test', 'size 1 1 1').parts.map((p) => p.name)).toEqual(['root']);
  });

  it('rejects a bad ellipsoid', () => {
    expect(() =>
      parseVoxt('test', 'size 3 3 3\ncolors\n  g gold\nellipsoid 1 1 1 0 1 1 g'),
    ).toThrow(/radii/);
  });
});

/** Every triangle's winding agrees with its vertices' normals (so it faces outward). */
function windingMatchesNormals(mesh: MeshData): boolean {
  const p = mesh.positions;
  const n = mesh.normals;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [i, j, k] = [mesh.indices[t]!, mesh.indices[t + 1]!, mesh.indices[t + 2]!];
    const e1 = [0, 1, 2].map((a) => p[j * 3 + a]! - p[i * 3 + a]!);
    const e2 = [0, 1, 2].map((a) => p[k * 3 + a]! - p[i * 3 + a]!);
    const face = [
      e1[1]! * e2[2]! - e1[2]! * e2[1]!,
      e1[2]! * e2[0]! - e1[0]! * e2[2]!,
      e1[0]! * e2[1]! - e1[1]! * e2[0]!,
    ];
    const dot = [i, j, k].reduce(
      (sum, v) => sum + face.reduce((s2, f, a) => s2 + f * n[v * 3 + a]!, 0),
      0,
    );
    if (dot <= 0) return false;
  }
  return true;
}

describe('greedyMesh', () => {
  const solid = (
    w: number,
    h: number,
    d: number,
    pattern?: (x: number, y: number, z: number) => number,
  ) => {
    const m: VoxelModel = {
      id: 't',
      width: w,
      height: h,
      depth: d,
      scale: 1,
      colors: ['#ff0000', '#00ff00'],
      data: new Uint8Array(w * h * d),
      smooth: 0,
      parts: [],
    };
    for (let z = 0; z < d; z++)
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) m.data[voxelIndex(m, x, y, z)] = pattern ? pattern(x, y, z) : 1;
    return m;
  };

  it('turns one voxel into 6 faces', () => {
    const mesh = greedyMesh(solid(1, 1, 1));
    expect(mesh.quads).toBe(6);
    expect(mesh.indices.length).toBe(36);
  });

  it('merges a solid block of one color into 6 faces, dropping hidden insides', () => {
    expect(greedyMesh(solid(4, 3, 2)).quads).toBe(6);
  });

  it('does not merge faces of different colors', () => {
    // A 2×1×1 bar, one red and one green voxel: the long faces can't merge.
    const mesh = greedyMesh(solid(2, 1, 1, (x) => x + 1));
    expect(mesh.quads).toBe(10);
  });

  it('centres x, starts y at 0, and puts the front (z = 0) toward +z', () => {
    const mesh = greedyMesh(solid(2, 1, 1));
    const xs = [...mesh.positions].filter((_, i) => i % 3 === 0);
    const ys = [...mesh.positions].filter((_, i) => i % 3 === 1);
    const zs = [...mesh.positions].filter((_, i) => i % 3 === 2);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([-1, 1]);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([0, 1]);
    expect([Math.min(...zs), Math.max(...zs)]).toEqual([-0.5, 0.5]);
  });

  it('winds every triangle to face along its normal', () => {
    const mesh = greedyMesh(solid(3, 2, 2, (x, y, z) => ((x + y + z) % 3 === 0 ? 0 : 1 + (x % 2))));
    const p = (i: number) => [
      mesh.positions[i * 3]!,
      mesh.positions[i * 3 + 1]!,
      mesh.positions[i * 3 + 2]!,
    ];
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const [a, b, c] = [p(mesh.indices[t]!), p(mesh.indices[t + 1]!), p(mesh.indices[t + 2]!)];
      const e1 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
      const e2 = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
      const cross = [
        e1[1]! * e2[2]! - e1[2]! * e2[1]!,
        e1[2]! * e2[0]! - e1[0]! * e2[2]!,
        e1[0]! * e2[1]! - e1[1]! * e2[0]!,
      ];
      const n = mesh.indices[t]! * 3;
      const dot =
        cross[0]! * mesh.normals[n]! +
        cross[1]! * mesh.normals[n + 1]! +
        cross[2]! * mesh.normals[n + 2]!;
      expect(dot).toBeGreaterThan(0);
    }
  });
});

describe('MagicaVoxel import', () => {
  /** Build a minimal .vox file: one 2×1×2 model (MagicaVoxel z is up). */
  function makeVox(): Uint8Array {
    const chunk = (id: string, content: number[]) => {
      const head = new DataView(new ArrayBuffer(12));
      [...id].forEach((c, i) => head.setUint8(i, c.charCodeAt(0)));
      head.setUint32(4, content.length, true);
      head.setUint32(8, 0, true);
      return [...new Uint8Array(head.buffer), ...content];
    };
    const u32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
    const size = chunk('SIZE', [...u32(2), ...u32(1), ...u32(2)]);
    // A red voxel at the bottom-left, a near-gold voxel on top of the right column.
    const xyzi = chunk('XYZI', [...u32(2), 0, 0, 0, 1, 1, 0, 1, 2]);
    const rgba = chunk('RGBA', [
      ...[226, 84, 59, 255],
      ...[250, 180, 40, 255],
      ...new Array(254 * 4).fill(0),
    ]);
    const children = [...size, ...xyzi, ...rgba];
    const main = [...'MAIN'].map((c) => c.charCodeAt(0));
    return Uint8Array.from([
      ...[...'VOX '].map((c) => c.charCodeAt(0)),
      ...u32(150),
      ...main,
      ...u32(0),
      ...u32(children.length),
      ...children,
    ]);
  }

  it('reads size, voxels and palette', () => {
    const vox = parseVox(makeVox());
    expect(vox.size).toEqual([2, 1, 2]);
    expect(vox.voxels).toEqual([
      [0, 0, 0, 1],
      [1, 0, 1, 2],
    ]);
  });

  it('snaps colors to the nearest palette color and converts to valid .voxt', () => {
    expect(nearestPaletteColor(226, 84, 59)).toBe('red');
    const text = voxToVoxt(parseVox(makeVox()), 'test.vox', 0.2);
    const m = parseVoxt('imported', text);
    expect([m.width, m.height, m.depth, m.scale]).toEqual([2, 2, 1, 0.2]);
    expect(m.colors).toEqual([voxel.red, voxel.gold]);
    expect(at(m, 0, 0, 0)).toBe(1); // MagicaVoxel z = 0 → bottom
    expect(at(m, 1, 1, 0)).toBe(2); // MagicaVoxel z = 1 → top
  });

  it('rejects files that are not .vox', () => {
    expect(() => parseVox(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(/VOX/);
  });
});

describe('surfaceNets', () => {
  const ball = (r: number): VoxelModel => {
    const size = r * 2 + 1;
    const m = parseVoxt(
      'ball',
      `size ${size} ${size} ${size}\ncolors\n  g gold\nellipsoid ${r} ${r} ${r} ${r} ${r} ${r} g`,
    );
    return { ...m, smooth: 2 };
  };

  it('makes one quad per exposed voxel face, facing outward', () => {
    const m = parseVoxt('one', 'size 1 1 1\ncolors\n  g gold\nbox 0 0 0 0 0 0 g');
    const mesh = surfaceNets(m, 0);
    expect(mesh.quads).toBe(6);
    expect(windingMatchesNormals(mesh)).toBe(true);
    expect(windingMatchesNormals(greedyMesh(m))).toBe(true);
  });

  it('rounds a ball, with outward normals and no NaNs', () => {
    const m = ball(4);
    const mesh = surfaceNets(m, 2);
    expect(windingMatchesNormals(mesh)).toBe(true);
    expect([...mesh.positions, ...mesh.normals].every(Number.isFinite)).toBe(true);
    // Every vertex is roughly the ball's radius (4.5 voxels to the outside) from its centre.
    const centre = [0, 4.5, 0];
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const d = Math.hypot(...[0, 1, 2].map((a) => mesh.positions[i + a]! - centre[a]!));
      expect(d).toBeGreaterThan(3.3);
      expect(d).toBeLessThan(4.9);
    }
  });

  it("keeps each quad's own voxel colour", () => {
    const m = parseVoxt(
      'two',
      'size 2 1 1\ncolors\n  r red\n  g gold\nbox 0 0 0 0 0 0 r\nbox 1 0 0 1 0 0 g',
    );
    const mesh = surfaceNets(m, 1);
    expect(new Set(mesh.colorIndex)).toEqual(new Set([0, 1]));
    for (let q = 0; q < mesh.quads; q++) {
      const c = mesh.colorIndex.slice(q * 4, q * 4 + 4);
      expect(new Set(c).size).toBe(1);
    }
  });
});
