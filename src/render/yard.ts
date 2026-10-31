/**
 * The yard the game happens in (GAMEPLAY.md): a lawn, the sheep pen in the
 * middle, the doghouse beside it, trees dotted about (solid: the rules keep
 * everyone out of them), flowers, and a ring of bushes for the woods round
 * the edge. Static: built once. (The sheep themselves are actors.)
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
  place('world/pen', T.pen.x, T.pen.z);
  place('world/doghouse', T.doghouse.x, T.doghouse.z);
  for (const tree of T.trees) {
    const mesh = place(`props/${tree.kind}`, tree.x, tree.z, (tree.x * 7.3 + tree.z) % 6.3);
    mesh.scale.setScalar(0.95 + ((tree.x * 3.1 + tree.z * 1.7) % 0.25));
  }

  // Flowers scattered over the lawn (not on the pen, doghouse or trees), one instanced mesh.
  const flowerRng = createRng(11);
  const flowerSpots: THREE.Matrix4[] = [];
  const clear = (x: number, z: number): boolean =>
    Math.hypot(x - T.pen.x, z - T.pen.z) > T.pen.radius + 0.4 &&
    Math.hypot(x - T.doghouse.x, z - T.doghouse.z) > 1.2 &&
    T.trees.every((t) => Math.hypot(x - t.x, z - t.z) > t.radius + 0.4);
  for (let tries = 0; tries < 400 && flowerSpots.length < 34; tries++) {
    const a = flowerRng.next() * Math.PI * 2;
    const r = Math.sqrt(flowerRng.next()) * (T.yard.radius - 0.6);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (!clear(x, z)) continue;
    flowerSpots.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, 0, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), flowerRng.next() * 6.3),
        new THREE.Vector3(1, 1, 1).multiplyScalar(0.9 + flowerRng.next() * 0.5),
      ),
    );
  }
  const flowers = new THREE.InstancedMesh(
    getGeometry('props/flowers'),
    voxelMaterial,
    flowerSpots.length,
  );
  flowerSpots.forEach((m, i) => flowers.setMatrixAt(i, m));
  flowers.receiveShadow = true;
  scene.add(flowers);

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
