/**
 * The start menu's scene: Roz and Lumen pottering about on the lawn in front
 * of the doghouse, wandering to a spot, stopping a while, wandering on.
 * Picking a dog outlines it (the view's contour, on CONTOUR_LAYER) and it
 * turns to face you and barks. Purely for show: no rules, so Math.random is fine.
 */
import * as THREE from 'three';
import { DOGS, type DogKind, gameTuning as T } from '../content/gameTuning';
import { DOG_STYLES, DogAnimator } from '../render/dogAnimator';
import { CONTOUR_LAYER } from '../render/outline';
import { buildRig, type Rig } from '../voxel/models';

export const DOG_MODEL: Record<DogKind, string> = {
  schnauzer: 'hero/blackSchnauzer',
  spitz: 'hero/spitz',
};

/** Where the dogs potter: a patch of lawn in front of (toward the camera from) the doghouse. */
const AREA = {
  x0: T.doghouse.x - 1.5,
  x1: T.doghouse.x + 1.5,
  z0: T.doghouse.z + 1,
  z1: T.doghouse.z + 2.6,
};
/** Where the menu's camera looks: between the pen and the dogs. */
export const MENU_FOCUS = new THREE.Vector3(T.doghouse.x - 0.9, 0, T.doghouse.z + 0.6);
const WALK_SPEED = 0.8;

interface MenuDog {
  readonly kind: DogKind;
  readonly rig: Rig;
  readonly animator: DogAnimator;
  goal: THREE.Vector2;
  /** Seconds left standing at the goal before picking another. */
  wait: number;
  facing: number;
  /** Seconds left looking at the camera (after being picked). */
  look: number;
}

export class MenuScene {
  private readonly dogs: MenuDog[] = [];

  constructor(private readonly scene: THREE.Scene) {
    const starts: [DogKind, number, number][] = [
      ['schnauzer', AREA.x0 + 0.6, AREA.z0 + 0.8],
      ['spitz', AREA.x1 - 0.6, AREA.z0 + 1.1],
    ];
    starts.forEach(([kind, x, z], i) => {
      const rig = buildRig(DOG_MODEL[kind]);
      for (const mesh of rig.meshes) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      rig.root.position.set(x, 0, z);
      scene.add(rig.root);
      this.dogs.push({
        kind,
        rig,
        animator: new DogAnimator(rig, DOG_STYLES[kind], i),
        goal: new THREE.Vector2(x, z),
        wait: 0.5 + i * 1.2,
        facing: i === 0 ? 0.6 : -0.6,
        look: 0,
      });
    });
  }

  /** Outline this dog (and only this one); it turns to face you and barks. */
  pick(kind: DogKind): void {
    for (const dog of this.dogs) {
      const picked = dog.kind === kind;
      for (const mesh of dog.rig.meshes) {
        if (picked) mesh.layers.enable(CONTOUR_LAYER);
        else mesh.layers.disable(CONTOUR_LAYER);
      }
      if (picked) {
        dog.look = 1.4;
        dog.wait = Math.max(dog.wait, 1.4);
        dog.goal.set(dog.rig.root.position.x, dog.rig.root.position.z);
        dog.animator.bark();
      }
    }
  }

  update(dt: number): void {
    for (const dog of this.dogs) {
      const root = dog.rig.root;
      const here = new THREE.Vector2(root.position.x, root.position.z);
      const to = dog.goal.clone().sub(here);
      let speed = 0;
      if (to.length() > 0.05) {
        speed = WALK_SPEED;
        const step = to.normalize().multiplyScalar(Math.min(WALK_SPEED * dt, to.length()));
        root.position.x += step.x;
        root.position.z += step.y;
      } else {
        dog.wait -= dt;
        if (dog.wait <= 0) {
          dog.goal = this.pickGoal(dog);
          dog.wait = 1.5 + Math.random() * 2.5;
        }
      }
      dog.look = Math.max(0, dog.look - dt);
      // Face the way it walks; face the camera when just picked.
      const target = dog.look > 0 ? 0 : speed > 0 ? Math.atan2(to.x, to.y) : dog.facing;
      const turn = Math.atan2(Math.sin(target - dog.facing), Math.cos(target - dog.facing));
      dog.facing += turn * Math.min(1, dt * 6);
      root.rotation.y = dog.facing;
      dog.animator.speed = speed / DOGS[dog.kind].speed;
      dog.animator.update(dt);
    }
    // Don't walk through each other.
    const [a, b] = this.dogs;
    if (a && b) {
      const pa = a.rig.root.position;
      const pb = b.rig.root.position;
      const d = Math.hypot(pa.x - pb.x, pa.z - pb.z);
      if (d < 0.75 && d > 0) {
        const push = (0.75 - d) / 2;
        const nx = (pa.x - pb.x) / d;
        const nz = (pa.z - pb.z) / d;
        pa.x += nx * push;
        pa.z += nz * push;
        pb.x -= nx * push;
        pb.z -= nz * push;
      }
    }
  }

  /** Take the dogs away (the run is starting, with its own dog). */
  dispose(): void {
    for (const dog of this.dogs) this.scene.remove(dog.rig.root);
    this.dogs.length = 0;
  }

  /** A new spot in the patch, not too near the other dog. */
  private pickGoal(dog: MenuDog): THREE.Vector2 {
    const other = this.dogs.find((d) => d !== dog);
    for (let tries = 0; tries < 12; tries++) {
      const goal = new THREE.Vector2(
        AREA.x0 + Math.random() * (AREA.x1 - AREA.x0),
        AREA.z0 + Math.random() * (AREA.z1 - AREA.z0),
      );
      const near =
        other &&
        (goal.distanceTo(other.goal) < 1 ||
          goal.distanceTo(new THREE.Vector2(other.rig.root.position.x, other.rig.root.position.z)) <
            1);
      if (!near) return goal;
    }
    return dog.goal.clone();
  }
}
