import * as THREE from 'three';
import { common, hexToNumber } from '../content/palettes';

/**
 * The three.js side of the game: renderer, scene, lights and the camera.
 * The camera isn't fitted to anything: the game places it every frame, and
 * the view only sizes the renderer and the camera's aspect.
 */
export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(24, 1, 0.5, 200);
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;

  constructor(
    readonly canvas: HTMLCanvasElement,
    options: { fov?: number } = {},
  ) {
    if (options.fov) this.camera.fov = options.fov;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color(hexToNumber(common.backdrop));

    this.hemi = new THREE.HemisphereLight(0xfff1d6, hexToNumber(common.groundDark), 0.75);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffb36b, 2.1);
    this.sun = sun;
    sun.position.set(-9, 20, 6);
    sun.target.position.set(0, 0, -15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    sun.shadow.bias = -0.0001;
    Object.assign(sun.shadow.camera, {
      left: -14,
      right: 14,
      top: 18,
      bottom: -18,
      near: 1,
      far: 54,
    });
    this.scene.add(sun, sun.target);

    new ResizeObserver(() => this.fit()).observe(canvas);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private fit(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
