/**
 * The controller (TECHNICAL.md §3): runs the simulation from
 * requestAnimationFrame in whole fixed steps, then draws. For now it's a
 * showcase: the schnauzer trots in circles, the spitz wanders and pauses, and
 * a tap makes them both bark (the first tap also starts the music).
 */
import * as THREE from 'three';
import { SONGS } from '../audio/songs';
import { common, hexToNumber } from '../content/palettes';
import { View } from '../render/view';
import { DOG_STYLES, DogAnimator, type DogStyle } from '../render/dogAnimator';
import { CONTOUR_LAYER } from '../render/outline';
import { toonMaterial } from '../render/toon';
import { buildRig, getGeometry, voxelMaterial, type Rig } from '../voxel/models';
import type { SfxId } from '../audio/sfx';
import { Conductor } from './conductor';

/** The simulation's fixed step: 60 a second. */
const DT = 1 / 60;
/** Never try to catch up more than this much time in one frame (a background tab, a breakpoint). */
const MAX_FRAME = 0.25;
/** A dog's full trot, in world units a second. */
const TROT_SPEED = 1.1;

/** A hero dog in the showcase: its rig, animator, voice and where it's heading. */
interface Dog {
  readonly rig: Rig;
  readonly animator: DogAnimator;
  readonly voice: SfxId;
  readonly velocity: THREE.Vector2;
  /** Where it's heading at a given time (on the ground: x, z). */
  readonly goal: (time: number) => THREE.Vector2;
}

export class Game {
  private readonly view: View;
  private readonly conductor = new Conductor();
  /** The run's seed: every random choice in the simulation will come from it (src/sim/rng.ts). */
  readonly seed: number;
  private readonly dogs: Dog[] = [];
  private time = 0;
  private accumulator = 0;
  private last = performance.now();

  constructor(
    canvas: HTMLCanvasElement,
    private readonly ui: HTMLDivElement,
    options: { seed: number; outline: boolean; contour: number | null },
  ) {
    this.seed = options.seed;
    this.view = new View(canvas, { fov: 45, outline: options.outline, contour: options.contour });
    const { scene, camera } = this.view;

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2),
      toonMaterial({ color: hexToNumber(common.ground) }),
    );
    ground.receiveShadow = true;
    scene.add(ground);

    // The schnauzer trots a loop; the spitz potters between spots, stopping at each.
    // Both keep inside a portrait phone's view, running mostly toward and away from the camera.
    const spots: readonly [THREE.Vector2, ...THREE.Vector2[]] = [
      new THREE.Vector2(0.5, 0.9),
      new THREE.Vector2(-0.1, 0.5),
      new THREE.Vector2(0.45, -0.7),
    ];
    this.addDog('hero/blackSchnauzer', DOG_STYLES.schnauzer, 'woof', 0, (time) => {
      const a = time * 0.7;
      return new THREE.Vector2(-0.3 + Math.cos(a) * 0.45, -0.3 + Math.sin(a) * 0.9);
    });
    this.addDog('hero/spitz', DOG_STYLES.spitz, 'yip', 1, (time) => {
      const leg = Math.floor(time / 3.5) % spots.length;
      return (spots[leg] ?? spots[0]).clone();
    });
    const placed: [string, number, number, number][] = [
      ['props/crate', 1.6, -1.8, 0.3],
      ['props/bush', -1.6, -1.4, 0],
      ['props/bush', 1.9, 0.6, 2],
    ];
    for (const [id, x, z, turn] of placed) {
      const mesh = new THREE.Mesh(getGeometry(id), voxelMaterial);
      mesh.position.set(x, 0, z);
      mesh.rotation.y = turn;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    camera.position.set(0, 2.6, 4.6);
    camera.lookAt(0, 0.45, 0);

    this.ui.innerHTML = '<p class="hint">Tap to start</p>';
    canvas.addEventListener('pointerdown', () => this.tap());
    requestAnimationFrame((t) => this.frame(t));
  }

  private addDog(id: string, style: DogStyle, voice: SfxId, seed: number, goal: Dog['goal']): void {
    const rig = buildRig(id);
    for (const mesh of rig.meshes) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.layers.enable(CONTOUR_LAYER);
    }
    const start = goal(0);
    rig.root.position.set(start.x, 0, start.y);
    this.view.scene.add(rig.root);
    this.dogs.push({
      rig,
      animator: new DogAnimator(rig, style, seed),
      voice,
      velocity: new THREE.Vector2(),
      goal,
    });
  }

  private tap(): void {
    // The first tap also starts the audio; the barks don't wait for it (a bark that
    // comes before the sounds are ready is just silent).
    if (!this.conductor.started) {
      this.ui.innerHTML = '';
      void this.conductor.start(SONGS[0]);
    }
    this.dogs.forEach((dog, i) => {
      // The second dog answers a beat later.
      setTimeout(() => {
        dog.animator.bark();
        this.conductor.play(dog.voice);
      }, i * 140);
    });
  }

  /** Steer each dog toward its goal, then let its animator pose it. */
  private moveDogs(dt: number): void {
    for (const dog of this.dogs) {
      const root = dog.rig.root;
      const here = new THREE.Vector2(root.position.x, root.position.z);
      const toGoal = dog.goal(this.time).sub(here);
      // Slow down on arrival; a barking dog stands still.
      const wanted = dog.animator.barking
        ? 0
        : Math.min(TROT_SPEED, toGoal.length() * 2.5) * (toGoal.length() > 0.05 ? 1 : 0);
      const target = toGoal.normalize().multiplyScalar(wanted);
      dog.velocity.lerp(target, Math.min(1, dt * 5));
      root.position.x += dog.velocity.x * dt;
      root.position.z += dog.velocity.y * dt;
      const speed = dog.velocity.length();
      if (speed > 0.05) {
        // Turn to face the way it's going (the dog faces +z at rest).
        const heading = Math.atan2(dog.velocity.x, dog.velocity.y);
        let turn = heading - root.rotation.y;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        root.rotation.y += turn * Math.min(1, dt * 8);
      }
      dog.animator.speed = speed / TROT_SPEED;
      dog.animator.update(dt);
    }
  }

  private frame(now: number): void {
    this.accumulator += Math.min((now - this.last) / 1000, MAX_FRAME);
    this.last = now;
    while (this.accumulator >= DT) {
      this.step();
      this.accumulator -= DT;
    }
    this.view.render();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** One fixed step. The game's pure simulation will live in src/sim/ and run from here. */
  private step(): void {
    this.time += DT;
    this.moveDogs(DT);
  }
}
