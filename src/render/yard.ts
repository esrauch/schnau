/**
 * The garden the game happens in (GAMEPLAY.md): a lawn, Grandma's cottage in
 * the middle, the doghouse beside it, and a ring of bushes for the woods
 * round the edge. Static: built once.
 */
import * as THREE from 'three';
import { gameTuning as T } from '../content/gameTuning';
import { common, hexToNumber } from '../content/palettes';
import { createRng } from '../sim/rng';
import { getGeometry, voxelMaterial } from '../voxel/models';
import { toonMaterial } from './toon';

export function buildYard(scene: THREE.Scene): void {
  // The wider world, and the lawn a shade brighter inside the garden.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2),
    toonMaterial({ color: hexToNumber(common.groundDark) }),
  );
  ground.receiveShadow = true;
  scene.add(ground);
  const lawn = new THREE.Mesh(
    new THREE.CircleGeometry(T.yard.radius + 0.6, 64).rotateX(-Math.PI / 2),
    toonMaterial({ color: hexToNumber(common.ground) }),
  );
  lawn.position.y = 0.005;
  lawn.receiveShadow = true;
  scene.add(lawn);

  const place = (id: string, x: number, z: number, turn = 0): THREE.Mesh => {
    const mesh = new THREE.Mesh(getGeometry(id), voxelMaterial);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = turn;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  place('world/cottage', T.cottage.x, T.cottage.z);
  place('world/doghouse', T.doghouse.x, T.doghouse.z);

  // The woods: bushes in a loose ring round the garden, one instanced mesh.
  const rng = createRng(7);
  const count = 46;
  const bushes = new THREE.InstancedMesh(getGeometry('props/bush'), voxelMaterial, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng.next() * 0.1;
    const r = T.yard.radius + 1.2 + rng.next() * 2.2;
    const s = 0.9 + rng.next() * 0.9;
    m.compose(
      new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.next() * 6.3),
      new THREE.Vector3(s, s, s),
    );
    bushes.setMatrixAt(i, m);
  }
  bushes.castShadow = true;
  bushes.receiveShadow = true;
  scene.add(bushes);
}
