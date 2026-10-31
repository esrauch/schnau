/**
 * Smooth meshing for models marked `smooth` (surface nets): the same voxels,
 * but as a rounded surface, so cel lighting can sweep across the curves
 * instead of snapping face by face. Pure maths, no three.js.
 *
 * The voxels are first blurred into a soft density field. One vertex sits in
 * each cell (a 2×2×2 block of voxel centres) that straddles the surface, at
 * the average of where the field crosses ½ along its edges; then a few
 * smoothing passes relax it, each vertex kept inside its own cell so features
 * never shrink by more than a voxel. Every face between a solid and an empty
 * voxel becomes one quad joining the four cells around it.
 *
 * Normals come from the blurred field's gradient, not from the mesh, so they
 * sweep smoothly with no trace of the voxel staircase: that's what keeps the
 * cel terminator a clean curve. Each quad keeps its own voxel's colour, so
 * colour patches stay crisp, as a cartoon's should.
 *
 * Output matches greedyMesh: model-centred world units, y up from 0, and the
 * front slice (z = 0) facing +z.
 */
import type { MeshData } from './mesh';
import { voxelIndex, type VoxelModel } from './voxt';

export function surfaceNets(model: VoxelModel, passes: number): MeshData {
  const W = model.width;
  const H = model.height;
  const D = model.depth;
  const dims: readonly number[] = [W, H, D];
  const at = (x: number, y: number, z: number): number =>
    x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= D
      ? 0
      : model.data[voxelIndex(model, x, y, z)]!;

  const field = densityField(model);
  const F = (x: number, y: number, z: number): number => field.at(x, y, z);

  // Cell (cx, cy, cz) spans voxel centres cx..cx+1 on each axis, for cx from -1 to W - 1.
  const cw = W + 1;
  const ch = H + 1;
  const cellOf = (cx: number, cy: number, cz: number): number =>
    cx + 1 + (cy + 1) * cw + (cz + 1) * cw * ch;
  const vertexOfCell = new Int32Array(cw * ch * (D + 1)).fill(-1);
  const pos: number[] = []; // voxel units: voxel x's centre is at x + 0.5
  const box: number[] = []; // each vertex's cell bounds: min x, y, z

  for (let cz = -1; cz < D; cz++)
    for (let cy = -1; cy < H; cy++)
      for (let cx = -1; cx < W; cx++) {
        const solid: boolean[] = [];
        for (let i = 0; i < 8; i++)
          solid.push(at(cx + (i & 1), cy + ((i >> 1) & 1), cz + (i >> 2)) > 0);
        if (solid.every((s) => s) || solid.every((s) => !s)) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        const corner = (i: number): [number, number, number] => [
          cx + (i & 1),
          cy + ((i >> 1) & 1),
          cz + (i >> 2),
        ];
        for (let i = 0; i < 8; i++)
          for (const bit of [1, 2, 4]) {
            const j = i | bit;
            if (j === i || solid[i] === solid[j]) continue;
            // Where the blurred field crosses ½ between corners i and j (kept off the very ends,
            // so thin features, which blur below ½, still get a surface).
            const fi = F(...corner(i));
            const fj = F(...corner(j));
            const t = fi === fj ? 0.5 : Math.min(0.85, Math.max(0.15, (0.5 - fi) / (fj - fi)));
            sx += (i & 1) + ((j & 1) - (i & 1)) * t;
            sy += ((i >> 1) & 1) + (((j >> 1) & 1) - ((i >> 1) & 1)) * t;
            sz += (i >> 2) + ((j >> 2) - (i >> 2)) * t;
            n++;
          }
        vertexOfCell[cellOf(cx, cy, cz)] = pos.length / 3;
        pos.push(cx + 0.5 + sx / n, cy + 0.5 + sy / n, cz + 0.5 + sz / n);
        box.push(cx + 0.5, cy + 0.5, cz + 0.5);
      }

  // Quads: one per face between a solid and an empty voxel, as four cell vertices.
  const quads: { v: [number, number, number, number]; color: number }[] = [];
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const p = [0, 0, 0];
    for (p[d] = -1; p[d]! < dims[d]!; p[d]!++)
      for (p[u] = 0; p[u]! < dims[u]!; p[u]!++)
        for (p[v] = 0; p[v]! < dims[v]!; p[v]!++) {
          const a = at(p[0]!, p[1]!, p[2]!);
          const q = [p[0]!, p[1]!, p[2]!];
          q[d]!++;
          const b = at(q[0]!, q[1]!, q[2]!);
          if (a > 0 === b > 0) continue;
          const corner = (du: number, dv: number): number => {
            const c = [p[0]!, p[1]!, p[2]!];
            c[u]! -= du;
            c[v]! -= dv;
            return vertexOfCell[cellOf(c[0]!, c[1]!, c[2]!)]!;
          };
          // In this order the quad faces +d; flip it when the solid side is the far one.
          const ring: [number, number, number, number] = [
            corner(1, 1),
            corner(0, 1),
            corner(0, 0),
            corner(1, 0),
          ];
          if (!a) ring.reverse();
          quads.push({ v: ring, color: (a || b) - 1 });
        }
  }

  // Relax: each vertex moves toward its neighbours' average, staying in its cell.
  const neighbours: Set<number>[] = Array.from({ length: pos.length / 3 }, () => new Set());
  for (const { v } of quads)
    for (let i = 0; i < 4; i++) {
      neighbours[v[i]!]!.add(v[(i + 1) % 4]!);
      neighbours[v[(i + 1) % 4]!]!.add(v[i]!);
    }
  for (let pass = 0; pass < passes; pass++) {
    const next = pos.slice();
    neighbours.forEach((ns, i) => {
      for (let k = 0; k < 3; k++) {
        let sum = 0;
        for (const n of ns) sum += pos[n * 3 + k]!;
        const target = (pos[i * 3 + k]! + sum / ns.size) / 2;
        next[i * 3 + k] = Math.min(box[i * 3 + k]! + 1, Math.max(box[i * 3 + k]!, target));
      }
    });
    pos.splice(0, pos.length, ...next);
  }

  // To world units. Flipping z mirrors the mesh, so every quad's winding flips too.
  const world = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    world[i] = (pos[i]! - W / 2) * model.scale;
    world[i + 1] = pos[i + 1]! * model.scale;
    world[i + 2] = (D / 2 - pos[i + 2]!) * model.scale;
  }
  for (const quad of quads) quad.v.reverse();

  // Fallback normals (where the field is flat): each vertex sums its quads' area-weighted normals.
  const shared = new Float32Array(world.length);
  const corner = (i: number): [number, number, number] => [
    world[i * 3]!,
    world[i * 3 + 1]!,
    world[i * 3 + 2]!,
  ];
  for (const { v } of quads) {
    const pts = v.map(corner);
    const [a, b, c, d] = [pts[0]!, pts[1]!, pts[2]!, pts[3]!];
    // The cross product of the diagonals is twice the quad's area-weighted normal.
    const e = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const f = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
    const n = [
      e[1]! * f[2]! - e[2]! * f[1]!,
      e[2]! * f[0]! - e[0]! * f[2]!,
      e[0]! * f[1]! - e[1]! * f[0]!,
    ];
    for (const i of v) for (let k = 0; k < 3; k++) shared[i * 3 + k]! += n[k]!;
  }

  // Normals down the blurred field's slope (voxel space → world: z is flipped).
  for (let i = 0; i < pos.length / 3; i++) {
    const g = field.gradient(pos[i * 3]! - 0.5, pos[i * 3 + 1]! - 0.5, pos[i * 3 + 2]! - 0.5);
    const len = Math.hypot(g[0], g[1], g[2]);
    if (len > 1e-4) shared.set([-g[0], -g[1], g[2]], i * 3);
  }

  // Unshare the vertices, so each quad can carry its own colour.
  const positions = new Float32Array(quads.length * 12);
  const normals = new Float32Array(quads.length * 12);
  const colorIndex = new Uint8Array(quads.length * 4);
  const indices = new Uint32Array(quads.length * 6);
  quads.forEach(({ v, color }, q) => {
    v.forEach((i, k) => {
      const o = (q * 4 + k) * 3;
      positions.set(corner(i), o);
      const [nx, ny, nz] = [shared[i * 3]!, shared[i * 3 + 1]!, shared[i * 3 + 2]!];
      const len = Math.hypot(nx, ny, nz) || 1;
      normals.set([nx / len, ny / len, nz / len], o);
      colorIndex[q * 4 + k] = color;
    });
    // Split along the shorter diagonal, so the surface folds the gentler way.
    const pts = v.map(corner);
    const [a, b, c, d] = [pts[0]!, pts[1]!, pts[2]!, pts[3]!];
    const ac = (a[0] - c[0]) ** 2 + (a[1] - c[1]) ** 2 + (a[2] - c[2]) ** 2;
    const bd = (b[0] - d[0]) ** 2 + (b[1] - d[1]) ** 2 + (b[2] - d[2]) ** 2;
    const o = q * 4;
    indices.set(
      ac <= bd ? [o, o + 1, o + 2, o, o + 2, o + 3] : [o, o + 1, o + 3, o + 1, o + 2, o + 3],
      q * 6,
    );
  });

  return { positions, normals, colorIndex, indices, quads: quads.length };
}

/** Blur passes for the density field: more is rounder, but softens small features. */
const BLUR_PASSES = 2;

/**
 * The voxels as a soft density field: 1 inside, 0 outside, blurred with a
 * [1 2 1] kernel. Sampled at voxel centres (voxel x at x), with one empty
 * voxel of padding all round; outside that it reads 0.
 */
function densityField(model: VoxelModel): {
  at(x: number, y: number, z: number): number;
  gradient(x: number, y: number, z: number): [number, number, number];
} {
  const pw = model.width + 2;
  const ph = model.height + 2;
  const pd = model.depth + 2;
  const index = (x: number, y: number, z: number): number =>
    x + 1 + (y + 1) * pw + (z + 1) * pw * ph;
  let f = new Float32Array(pw * ph * pd);
  for (let z = 0; z < model.depth; z++)
    for (let y = 0; y < model.height; y++)
      for (let x = 0; x < model.width; x++)
        if (model.data[voxelIndex(model, x, y, z)]) f[index(x, y, z)] = 1;

  const strides = [1, pw, pw * ph];
  const sizes = [pw, ph, pd];
  for (let pass = 0; pass < BLUR_PASSES; pass++)
    for (let axis = 0; axis < 3; axis++) {
      const out = new Float32Array(f.length);
      const stride = strides[axis]!;
      const size = sizes[axis]!;
      for (let i = 0; i < f.length; i++) {
        const c = Math.floor(i / stride) % size;
        const lo = c > 0 ? f[i - stride]! : 0;
        const hi = c < size - 1 ? f[i + stride]! : 0;
        out[i] = (lo + 2 * f[i]! + hi) / 4;
      }
      f = out;
    }

  const at = (x: number, y: number, z: number): number =>
    x < -1 || y < -1 || z < -1 || x > model.width || y > model.height || z > model.depth
      ? 0
      : f[index(x, y, z)]!;
  /** Trilinear sample at a voxel-space point. */
  const sample = (x: number, y: number, z: number): number => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const tx = x - x0;
    const ty = y - y0;
    const tz = z - z0;
    let sum = 0;
    for (let i = 0; i < 8; i++) {
      const dx = i & 1;
      const dy = (i >> 1) & 1;
      const dz = i >> 2;
      const w = (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty) * (dz ? tz : 1 - tz);
      sum += w * at(x0 + dx, y0 + dy, z0 + dz);
    }
    return sum;
  };
  const h = 0.5;
  return {
    at,
    gradient: (x, y, z) => [
      sample(x + h, y, z) - sample(x - h, y, z),
      sample(x, y + h, z) - sample(x, y - h, z),
      sample(x, y, z + h) - sample(x, y, z - h),
    ],
  };
}
