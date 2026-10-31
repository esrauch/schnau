/**
 * The controller (TECHNICAL.md §3): runs the simulation from
 * requestAnimationFrame in whole fixed steps, then draws. For now it only
 * shows a placeholder model on the ground; tap to start the music.
 */
import * as THREE from 'three';
import { SONGS } from '../audio/songs';
import { common, hexToNumber } from '../content/palettes';
import { View } from '../render/view';
import { CONTOUR_LAYER } from '../render/outline';
import { toonMaterial } from '../render/toon';
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
  private readonly heroes: THREE.Mesh[] = [];
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

    for (const [id, x] of [
      ['hero/blackSchnauzer', -0.55],
      ['hero/spitz', 0.55],
    ] as const) {
      const hero = new THREE.Mesh(getGeometry(id), voxelMaterial);
      hero.position.x = x;
      hero.castShadow = true;
      hero.receiveShadow = true;
      hero.layers.enable(CONTOUR_LAYER);
      scene.add(hero);
      this.heroes.push(hero);
    }
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
    this.heroes.forEach((hero, i) => {
      hero.rotation.y = 0.35 + Math.sin(this.time * 0.8 + i * 1.7) * 0.5;
    });
    this.view.render();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** One fixed step. The game's pure simulation will live in src/sim/ and run from here. */
  private step(): void {
    this.time += DT;
  }
}
