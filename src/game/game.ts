/**
 * The controller (TECHNICAL.md §3): runs the simulation from
 * requestAnimationFrame in whole fixed steps, then draws. For now it only
 * shows a placeholder model on the ground; tap to start the music.
 */
import * as THREE from 'three';
import { SONGS } from '../audio/songs';
import { common, hexToNumber } from '../content/palettes';
import { View } from '../render/view';
import { getGeometry, voxelMaterial } from '../voxel/models';
import { Conductor } from './conductor';

/** The simulation's fixed step: 60 a second. */
const DT = 1 / 60;
/** Never try to catch up more than this much time in one frame (a background tab, a breakpoint). */
const MAX_FRAME = 0.25;

export class Game {
  private readonly view: View;
  private readonly conductor = new Conductor();
  /** The run's seed: every random choice in the simulation will come from it (src/sim/rng.ts). */
  readonly seed: number;
  private readonly prop: THREE.Mesh;
  private time = 0;
  private accumulator = 0;
  private last = performance.now();

  constructor(
    canvas: HTMLCanvasElement,
    private readonly ui: HTMLDivElement,
    options: { seed: number },
  ) {
    this.seed = options.seed;
    this.view = new View(canvas, { fov: 45 });
    const { scene, camera } = this.view;

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: hexToNumber(common.ground) }),
    );
    ground.receiveShadow = true;
    scene.add(ground);

    this.prop = new THREE.Mesh(getGeometry('props/crate'), voxelMaterial);
    this.prop.castShadow = true;
    scene.add(this.prop);

    camera.position.set(0, 3, 5);
    camera.lookAt(0, 0.4, 0);

    this.ui.innerHTML = '<p class="hint">Tap to start</p>';
    canvas.addEventListener('pointerdown', () => this.tap());
    requestAnimationFrame((t) => this.frame(t));
  }

  private tap(): void {
    if (!this.conductor.started) {
      const song = SONGS[0];
      void this.conductor.start(song);
      this.ui.innerHTML = '';
    }
    this.conductor.play('blip');
  }

  private frame(now: number): void {
    this.accumulator += Math.min((now - this.last) / 1000, MAX_FRAME);
    this.last = now;
    while (this.accumulator >= DT) {
      this.step();
      this.accumulator -= DT;
    }
    this.prop.rotation.y = this.time * 0.6;
    this.view.render();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** One fixed step. The game's pure simulation will live in src/sim/ and run from here. */
  private step(): void {
    this.time += DT;
  }
}
