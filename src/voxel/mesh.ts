/**
 * Greedy meshing (TECHNICAL.md §5): only the faces between a voxel and empty
 * space are kept, and neighbouring faces of the same color are merged into
 * one big quad. Pure maths, no three.js, so it can be unit-tested.
 *
 * Output is in model-centred world units: x is centred, y starts at 0 at the
 * bottom, and the front slice (z = 0) faces +z, toward the camera.
 */
import { voxelIndex, type VoxelModel } from './voxt';

export interface MeshData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** 0-based color index per vertex (into model.colors). */
  readonly colorIndex: Uint8Array;
  readonly indices: Uint32Array;
  readonly quads: number;
}

export function greedyMesh(model: VoxelModel): MeshData {
  const dims = [model.width, model.height, model.depth];
  const at = (x: number, y: number, z: number): number =>
    x < 0 || y < 0 || z < 0 || x >= dims[0]! || y >= dims[1]! || z >= dims[2]!
      ? 0
      : model.data[voxelIndex(model, x, y, z)]!;

  const positions: number[] = [];
  const normals: number[] = [];
  const colorIndex: number[] = [];
  const indices: number[] = [];
  let quads = 0;

  const toWorld = (p: number[]): [number, number, number] => [
    (p[0]! - model.width / 2) * model.scale,
    p[1]! * model.scale,
    (model.depth / 2 - p[2]!) * model.scale, // z = 0 is the front, so flip toward +z
  ];

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const x = [0, 0, 0];
    const q = [0, 0, 0];
    q[d] = 1;
    const mask = new Int16Array(dims[u]! * dims[v]!);

    for (x[d] = -1; x[d]! < dims[d]!;) {
      // Build the mask of faces on the plane between slice x[d] and x[d] + 1.
      let n = 0;
      for (x[v] = 0; x[v]! < dims[v]!; x[v]!++) {
        for (x[u] = 0; x[u]! < dims[u]!; x[u]!++) {
          const a = at(x[0]!, x[1]!, x[2]!);
          const b = at(x[0]! + q[0]!, x[1]! + q[1]!, x[2]! + q[2]!);
          mask[n++] = a && !b ? a : !a && b ? -b : 0;
        }
      }
      x[d]!++;

      // Merge equal neighbours in the mask into rectangles.
      n = 0;
      for (let j = 0; j < dims[v]!; j++) {
        for (let i = 0; i < dims[u]!;) {
          const c = mask[n]!;
          if (c === 0) {
            i++;
            n++;
            continue;
          }
          let w = 1;
          while (i + w < dims[u]! && mask[n + w] === c) w++;
          let h = 1;
          grow: for (; j + h < dims[v]!; h++) {
            for (let k = 0; k < w; k++) if (mask[n + k + h * dims[u]!] !== c) break grow;
          }

          x[u] = i;
          x[v] = j;
          const du = [0, 0, 0];
          const dv = [0, 0, 0];
          du[u] = w;
          dv[v] = h;
          const corners = [
            [x[0]!, x[1]!, x[2]!],
            [x[0]! + du[0]!, x[1]! + du[1]!, x[2]! + du[2]!],
            [x[0]! + du[0]! + dv[0]!, x[1]! + du[1]! + dv[1]!, x[2]! + du[2]! + dv[2]!],
            [x[0]! + dv[0]!, x[1]! + dv[1]!, x[2]! + dv[2]!],
          ].map(toWorld);
          const normal: [number, number, number] = [0, 0, 0];
          normal[d] = c > 0 ? 1 : -1;
          if (d === 2) normal[2] = -normal[2]; // z was flipped by toWorld
          emitQuad(corners, normal, Math.abs(c) - 1);

          for (let l = 0; l < h; l++) for (let k = 0; k < w; k++) mask[n + k + l * dims[u]!] = 0;
          i += w;
          n += w;
        }
      }
    }
  }

  function emitQuad(
    c: [number, number, number][],
    normal: [number, number, number],
    color: number,
  ) {
    // Wind the triangles so they face along the normal.
    const [a, b, , dd] = c as unknown as [number[], number[], number[], number[]];
    const e1 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
    const e2 = [dd[0]! - a[0]!, dd[1]! - a[1]!, dd[2]! - a[2]!];
    const cross = [
      e1[1]! * e2[2]! - e1[2]! * e2[1]!,
      e1[2]! * e2[0]! - e1[0]! * e2[2]!,
      e1[0]! * e2[1]! - e1[1]! * e2[0]!,
    ];
    const facesOut = cross[0]! * normal[0] + cross[1]! * normal[1] + cross[2]! * normal[2] > 0;
    const base = positions.length / 3;
    for (const corner of c) {
      positions.push(...corner);
      normals.push(...normal);
      colorIndex.push(color);
    }
    if (facesOut) indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    quads++;
  }

  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    colorIndex: Uint8Array.from(colorIndex),
    indices: Uint32Array.from(indices),
    quads,
  };
}
