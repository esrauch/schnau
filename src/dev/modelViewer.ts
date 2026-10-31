/**
 * Dev page for voxel models. Interactive: pick a model and it spins on
 * a field tile. Render modes produce fixed images for the headless preview
 * script, so Claude can look at a model and iterate (TECHNICAL.md §11).
 */
import * as THREE from 'three';
import { common, hexToNumber, sky } from '../content/palettes';
import { syncCelSun, toonMaterial } from '../render/toon';
import { greedyMesh } from '../voxel/mesh';
import { MODEL_IDS, getGeometry, getModel, voxelMaterial } from '../voxel/models';

const params = new URLSearchParams(location.search);
const renderMode = params.get('render'); // 'turntable' | 'sheet' | null
const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`models.html is missing ${sel}`);
  return el;
};
const canvas = $<HTMLCanvasElement>('#view');
const list = $<HTMLDivElement>('#list');
const info = $<HTMLDivElement>('#info');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(renderMode ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(hexToNumber(common.backdrop));
// The game's lights (render/view.ts), so models look here as they will in play.
const sun = new THREE.DirectionalLight(hexToNumber(sky.sun), 3);
sun.position.set(-10, 13, 3);
sun.castShadow = true;
scene.add(sun);
syncCelSun(sun);

const camera = new THREE.PerspectiveCamera(24, 1, 0.05, 100);

/** A 1 × 1 field tile, to show scale against the game grid. */
function tile(x: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.1, 1),
    toonMaterial({ color: hexToNumber(common.ground) }),
  );
  mesh.position.set(x, -0.05, 0);
  mesh.receiveShadow = true;
  return mesh;
}

function modelMesh(id: string): THREE.Mesh {
  const mesh = new THREE.Mesh(getGeometry(id), voxelMaterial);
  mesh.castShadow = true;
  return mesh;
}

function aim(target: THREE.Vector3, yawDeg: number, pitchDeg: number, dist: number): void {
  const yaw = THREE.MathUtils.degToRad(yawDeg);
  const pitch = THREE.MathUtils.degToRad(pitchDeg);
  camera.position.set(
    target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
    target.y + Math.sin(pitch) * dist,
    target.z + Math.cos(yaw) * Math.cos(pitch) * dist,
  );
  camera.lookAt(target);
}

if (renderMode === 'turntable') renderTurntable(params.get('model') ?? MODEL_IDS[0] ?? '');
else if (renderMode === 'closeup') renderCloseup(params.get('model') ?? MODEL_IDS[0] ?? '');
else if (renderMode === 'sheet') renderSheet(params.get('group') ?? '');
else interactive();

/** Front, ¾ and side views in one image. */
function renderTurntable(id: string): void {
  document.body.classList.add('render');
  const w = 960;
  const h = 360;
  renderer.setSize(w, h);
  const mesh = modelMesh(id);
  scene.add(mesh, tile(0));
  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  const target = new THREE.Vector3(0, size.y / 2, 0);
  const dist = Math.max(size.x, size.y, size.z, 1) * 3.6;
  camera.aspect = w / 3 / h;
  camera.updateProjectionMatrix();
  renderer.setScissorTest(true);
  [0, 35, 90].forEach((yaw, i) => {
    renderer.setViewport((i * w) / 3, 0, w / 3, h);
    renderer.setScissor((i * w) / 3, 0, w / 3, h);
    aim(target, yaw, yaw === 0 ? 8 : 25, dist);
    renderer.render(scene, camera);
  });
  markReady();
}

/** Four big, tightly framed views (front, ¾ front, side, ¾ back) for detail work. */
function renderCloseup(id: string): void {
  document.body.classList.add('render');
  const cell = 600;
  renderer.setSize(cell * 2, cell * 2);
  const mesh = modelMesh(id);
  scene.add(mesh, tile(0));
  const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
  const target = new THREE.Vector3(0, size.y / 2, 0);
  const dist = Math.max(size.x, size.y, size.z, 0.5) * 2.7;
  camera.aspect = 1;
  camera.updateProjectionMatrix();
  renderer.setScissorTest(true);
  const views: [number, number][] = [
    [0, 8],
    [35, 20],
    [90, 10],
    [150, 25],
  ];
  views.forEach(([yaw, pitch], i) => {
    const x = (i % 2) * cell;
    const y = (1 - Math.floor(i / 2)) * cell;
    renderer.setViewport(x, y, cell, cell);
    renderer.setScissor(x, y, cell, cell);
    aim(target, yaw, pitch, dist);
    renderer.render(scene, camera);
  });
  markReady();
}

/** Every model in a folder, side by side on tiles, from the game's camera angle. */
function renderSheet(group: string): void {
  document.body.classList.add('render');
  const ids = MODEL_IDS.filter((id) => group === '' || id.startsWith(`${group}/`));
  const w = Math.max(480, ids.length * 240);
  const h = 360;
  renderer.setSize(w, h);
  ids.forEach((id, i) => {
    const x = (i - (ids.length - 1) / 2) * 1.6;
    const mesh = modelMesh(id);
    mesh.position.x = x;
    scene.add(mesh, tile(x));
  });
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // The game's camera pitch, so the sheet shows models as they'll look in play.
  aim(new THREE.Vector3(0, 0.5, 0), 0, 32, Math.max(6, ids.length * 1.9));
  renderer.render(scene, camera);
  markReady();
}

function interactive(): void {
  let current: THREE.Object3D | null = null;
  /** The shown model's size: the camera frames it, whatever its size and the screen's shape. */
  let size = new THREE.Vector3(1, 1, 1);
  const show = (id: string): void => {
    if (current) scene.remove(current);
    const group = new THREE.Group();
    const mesh = modelMesh(id);
    group.add(mesh, tile(0));
    scene.add(group);
    current = group;
    size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
    const m = getModel(id);
    const quads = greedyMesh(m);
    info.textContent =
      `${id}: ${m.width}×${m.height}×${m.depth} voxels at ${m.scale} → ` +
      `${(m.width * m.scale).toFixed(2)} × ${(m.height * m.scale).toFixed(2)} × ` +
      `${(m.depth * m.scale).toFixed(2)} units · ${quads.quads} quads`;
    [...list.children].forEach((b) => b.classList.toggle('on', b.textContent === id));
    history.replaceState(null, '', `?model=${encodeURIComponent(id)}`);
  };
  for (const id of MODEL_IDS) {
    const button = document.createElement('button');
    button.textContent = id;
    button.addEventListener('click', () => show(id));
    list.append(button);
  }
  const resize = (): void => {
    const w = window.innerWidth;
    const h = Math.max(240, window.innerHeight - canvas.getBoundingClientRect().top);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();
  const first = params.get('model') ?? MODEL_IDS[0];
  if (first) show(first);
  renderer.setAnimationLoop((now) => {
    // Far enough back to fit the model's height, and its width on a narrow screen (and a tile).
    const across = Math.max(size.x, size.z, 1);
    const dist = Math.max(size.y, across / camera.aspect, 1) * 3.6;
    aim(new THREE.Vector3(0, size.y / 2, 0), (now / 40) % 360, 22, dist);
    renderer.render(scene, camera);
  });
}

function markReady(): void {
  Object.assign(window, { __ready: true });
}
