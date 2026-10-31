/**
 * Every voxel model in assets-src/voxels, loaded as text by Vite (so edits
 * hot-reload), parsed once and meshed once into cached three.js geometry.
 */
import * as THREE from 'three';
import { toonMaterial } from '../render/toon';
import { greedyMesh } from './mesh';
import { surfaceNets } from './smooth';
import { parseVoxt, type VoxelModel } from './voxt';

const sources = import.meta.glob('/assets-src/voxels/**/*.voxt', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Model id = path under assets-src/voxels without the extension, e.g. "props/crate". */
const byId = new Map(
  Object.entries(sources).map(([path, text]) => [
    path.replace(/^\/assets-src\/voxels\//, '').replace(/\.voxt$/, ''),
    text,
  ]),
);

export const MODEL_IDS: readonly string[] = [...byId.keys()].sort();

const models = new Map<string, VoxelModel>();
const geometries = new Map<string, THREE.BufferGeometry>();

export function getModel(id: string): VoxelModel {
  let model = models.get(id);
  if (!model) {
    const text = byId.get(id);
    if (text === undefined) throw new Error(`No voxel model "${id}"`);
    model = parseVoxt(id, text);
    models.set(id, model);
  }
  return model;
}

/** The meshed geometry for a model, with vertex colors. Shared by every mesh that uses it. */
export function getGeometry(id: string): THREE.BufferGeometry {
  let geometry = geometries.get(id);
  if (!geometry) {
    geometry = buildGeometry(getModel(id));
    geometries.set(id, geometry);
  }
  return geometry;
}

export function buildGeometry(model: VoxelModel): THREE.BufferGeometry {
  const mesh = model.smooth > 0 ? surfaceNets(model, model.smooth) : greedyMesh(model);
  // THREE.Color converts the sRGB palette into the linear working space.
  const palette = model.colors.map((hex) => new THREE.Color(hex));
  const colors = new Float32Array(mesh.colorIndex.length * 3);
  mesh.colorIndex.forEach((ci, i) => {
    const c = palette[ci] ?? new THREE.Color(0xff00ff);
    colors.set([c.r, c.g, c.b], i * 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** One material for every voxel model: cel-shaded vertex colors, no textures. */
export const voxelMaterial = toonMaterial({ vertexColors: true });

/** A model's world position (model-centred, like its mesh) for a point in voxel coordinates. */
export function voxelToLocal(model: VoxelModel, [x, y, z]: readonly number[]): THREE.Vector3 {
  return new THREE.Vector3(
    (x! + 0.5 - model.width / 2) * model.scale,
    (y! + 0.5) * model.scale,
    (model.depth / 2 - (z! + 0.5)) * model.scale,
  );
}

const partGeometries = new Map<string, THREE.BufferGeometry>();

/** A part's geometry, moved so its pivot is at the origin. */
function partGeometry(model: VoxelModel, name: string): THREE.BufferGeometry {
  const key = `${model.id}#${name}`;
  let geometry = partGeometries.get(key);
  if (!geometry) {
    const part = model.parts.find((p) => p.name === name);
    if (!part) throw new Error(`No part "${name}" in "${model.id}"`);
    const pivot = voxelToLocal(model, part.pivot);
    geometry = buildGeometry({ ...model, data: part.data }).translate(-pivot.x, -pivot.y, -pivot.z);
    partGeometries.set(key, geometry);
  }
  return geometry;
}

/**
 * A model built from its parts, ready to animate: each part is a group at its
 * pivot (turn it to turn the part), nested under its parent. The rig's root
 * stands where the model's origin would.
 */
export interface Rig {
  readonly root: THREE.Group;
  readonly parts: ReadonlyMap<string, THREE.Group>;
  /** Every mesh in the rig, for shadows and layers. */
  readonly meshes: readonly THREE.Mesh[];
}

export function buildRig(id: string): Rig {
  const model = getModel(id);
  const root = new THREE.Group();
  const parts = new Map<string, THREE.Group>();
  const meshes: THREE.Mesh[] = [];
  for (const part of model.parts) {
    const group = new THREE.Group();
    group.name = part.name;
    const pivot = voxelToLocal(model, part.pivot);
    const parent = part.parent ? parts.get(part.parent) : undefined;
    if (parent) {
      const parentPivot = voxelToLocal(
        model,
        model.parts.find((p) => p.name === part.parent)!.pivot,
      );
      group.position.copy(pivot).sub(parentPivot);
      parent.add(group);
    } else {
      group.position.copy(pivot);
      root.add(group);
    }
    const mesh = new THREE.Mesh(partGeometry(model, part.name), voxelMaterial);
    group.add(mesh);
    meshes.push(mesh);
    parts.set(part.name, group);
  }
  return { root, parts, meshes };
}

/** The model's height in world units (for placing things on top of it). */
export function modelHeight(id: string): number {
  const m = getModel(id);
  return m.height * m.scale;
}
