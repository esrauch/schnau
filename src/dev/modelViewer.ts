/**
 * Dev page for voxel models. Interactive: pick a model and it spins on a
 * field tile, drawn as in the game (cel shading, line art, the heroes'
 * contour). A rigged dog gets an animation bar: idle, walk, trot and bark,
 * slow motion, and spin on or off (drag to turn it by hand).
 * Render modes produce fixed images for the headless preview script, so
 * Claude can look at a model and iterate (TECHNICAL.md §6).
 */
import * as THREE from 'three';
import { common, hexToNumber, sky } from '../content/palettes';
import { syncCelSun, toonMaterial } from '../render/toon';
import { greedyMesh } from '../voxel/mesh';
import { surfaceNets } from '../voxel/smooth';
import { DOG_STYLES, DOG_STYLE_FOR_MODEL, DogAnimator } from '../render/dogAnimator';
import { CONTOUR_LAYER, Outline } from '../render/outline';
import { MODEL_IDS, buildRig, getGeometry, getModel, voxelMaterial } from '../voxel/models';

const params = new URLSearchParams(location.search);

type Gait = 'idle' | 'walk' | 'trot' | 'gallop';
/** The interactive page's gaits, as an animator speed. */
const GAIT_SPEED: Record<Gait, number> = { idle: 0, walk: 0.5, trot: 1, gallop: 2 };
const isGait = (g: string | null): g is Gait => g !== null && g in GAIT_SPEED;
const renderMode = params.get('render'); // 'turntable' | 'sheet' | null
const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`models.html is missing ${sel}`);
  return el;
};
const canvas = $<HTMLCanvasElement>('#view');
const list = $<HTMLDivElement>('#list');
const info = $<HTMLDivElement>('#info');
const anims = $<HTMLDivElement>('#anims');

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
else if (renderMode === 'poses')
  renderPoses(params.get('model') ?? MODEL_IDS[0] ?? '', params.get('anim') ?? 'trot');
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

/**
 * A dog rig animating, as a strip of frames (¾ view, then side view), to check
 * poses without watching it move. `anim`: idle, trot, gallop or bark.
 */
function renderPoses(id: string, anim: string): void {
  document.body.classList.add('render');
  const cols = 6;
  const cell = 200;
  renderer.setSize(cols * cell, cell * 2);
  const rig = buildRig(id);
  for (const mesh of rig.meshes) mesh.castShadow = true;
  scene.add(rig.root, tile(0));
  const style = DOG_STYLE_FOR_MODEL[id] ?? DOG_STYLES.schnauzer;
  const animator = new DogAnimator(rig, style);
  const size = new THREE.Box3().setFromObject(rig.root).getSize(new THREE.Vector3());
  const target = new THREE.Vector3(0, size.y / 2, 0);
  const dist = Math.max(size.x, size.y, size.z) * 2.9;
  camera.aspect = 1;
  camera.updateProjectionMatrix();
  renderer.setScissorTest(true);
  // Frames spread over one stride (trot), one bark, or a few seconds (idle).
  const span =
    anim === 'trot'
      ? 1 / style.strideRate
      : anim === 'gallop'
        ? 1 / style.gallopRate
        : anim === 'bark'
          ? 0.5
          : 6;
  animator.speed = anim === 'trot' ? 1 : anim === 'gallop' ? 2 : 0;
  if (animator.speed > 0) for (let i = 0; i < 30; i++) animator.update(1 / 60); // get up to speed
  if (anim === 'bark') animator.bark();
  for (let i = 0; i < cols; i++) {
    animator.update(i === 0 ? 0 : span / cols);
    const views: [number, number][] = [
      [35, 18],
      [90, 6],
    ];
    views.forEach(([yaw, pitch], row) => {
      const x = i * cell;
      const y = (1 - row) * cell;
      renderer.setViewport(x, y, cell, cell);
      renderer.setScissor(x, y, cell, cell);
      aim(target, yaw, pitch, dist);
      renderer.render(scene, camera);
    });
  }
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
  const outline = new Outline({ contour: 0xffffff });
  let current: THREE.Object3D | null = null;
  let animator: DogAnimator | null = null;
  /** The shown model's size: the camera frames it, whatever its size and the screen's shape. */
  let size = new THREE.Vector3(1, 1, 1);
  const asked = params.get('anim');
  let gait: Gait = isGait(asked) ? asked : 'idle';
  let slow = false;
  let spin = true;
  let yaw = 35;
  let modelId = '';

  const syncUrl = (): void => {
    const q = new URLSearchParams({ model: modelId });
    if (animator && gait !== 'idle') q.set('anim', gait);
    history.replaceState(null, '', `?${q}`);
  };

  // The animation bar, shown for rigged dogs only.
  const buttons = new Map<string, HTMLButtonElement>();
  const addButton = (key: string, label: string, onClick: () => void): void => {
    const button = document.createElement('button');
    button.textContent = label;
    button.addEventListener('click', onClick);
    anims.append(button);
    buttons.set(key, button);
  };
  const refreshBar = (): void => {
    for (const g of ['idle', 'walk', 'trot', 'gallop'] as const)
      buttons.get(g)?.classList.toggle('on', gait === g);
    buttons.get('slow')?.classList.toggle('on', slow);
    buttons.get('spin')?.classList.toggle('on', spin);
  };
  const setGait = (g: Gait): void => {
    gait = g;
    refreshBar();
    syncUrl();
  };
  const bark = (): void => animator?.bark();
  addButton('idle', '1 Idle', () => setGait('idle'));
  addButton('walk', '2 Walk', () => setGait('walk'));
  addButton('trot', '3 Trot', () => setGait('trot'));
  addButton('gallop', '4 Gallop', () => setGait('gallop'));
  addButton('bark', 'Space: Bark!', bark);
  addButton('slow', 'Slow-mo', () => {
    slow = !slow;
    refreshBar();
  });
  addButton('spin', 'Spin', () => {
    spin = !spin;
    refreshBar();
  });
  refreshBar();
  window.addEventListener('keydown', (e) => {
    if (!animator) return;
    if (e.key === '1') setGait('idle');
    else if (e.key === '2') setGait('walk');
    else if (e.key === '3') setGait('trot');
    else if (e.key === '4') setGait('gallop');
    else if (e.key === ' ') {
      e.preventDefault();
      bark();
    }
  });

  // Drag to turn the model (and stop the spin).
  let dragX: number | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    dragX = e.clientX;
    spin = false;
    refreshBar();
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (dragX === null) return;
    yaw -= (e.clientX - dragX) * 0.5;
    dragX = e.clientX;
  });
  canvas.addEventListener('pointerup', () => (dragX = null));
  canvas.style.touchAction = 'none';

  const show = (id: string): void => {
    if (current) scene.remove(current);
    modelId = id;
    const group = new THREE.Group();
    const m = getModel(id);
    const style = DOG_STYLE_FOR_MODEL[id];
    let meshes: THREE.Mesh[];
    if (style) {
      const rig = buildRig(id);
      group.add(rig.root);
      meshes = [...rig.meshes];
      animator = new DogAnimator(rig, style);
      animator.speed = GAIT_SPEED[gait];
    } else {
      const mesh = modelMesh(id);
      group.add(mesh);
      meshes = [mesh];
      animator = null;
    }
    for (const mesh of meshes) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (style) mesh.layers.enable(CONTOUR_LAYER);
    }
    group.updateMatrixWorld(true); // so the rig's parts are measured where they stand
    const model = new THREE.Box3();
    for (const mesh of meshes) model.expandByObject(mesh);
    size = model.getSize(new THREE.Vector3());
    group.add(tile(0));
    scene.add(group);
    current = group;
    anims.hidden = !animator;
    const quads = (m.smooth > 0 ? surfaceNets(m, m.smooth) : greedyMesh(m)).quads;
    info.textContent =
      `${id}: ${m.width}×${m.height}×${m.depth} voxels at ${m.scale} → ` +
      `${(m.width * m.scale).toFixed(2)} × ${(m.height * m.scale).toFixed(2)} × ` +
      `${(m.depth * m.scale).toFixed(2)} units · ${quads} quads` +
      (m.parts.length > 1 ? ` · parts: ${m.parts.map((p) => p.name).join(', ')}` : '');
    [...list.children].forEach((b) => b.classList.toggle('on', b.textContent === id));
    syncUrl();
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
    const ratio = renderer.getPixelRatio();
    outline.setSize(Math.floor(w * ratio), Math.floor(h * ratio), ratio);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();
  const first = params.get('model') ?? MODEL_IDS[0];
  if (first) show(first);

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.1, (now - last) / 1000) * (slow ? 0.25 : 1);
    last = now;
    if (spin) yaw = (yaw + dt * 25) % 360;
    if (animator) {
      // Ease between gaits, as a dog speeding up or slowing down would.
      animator.speed += (GAIT_SPEED[gait] - animator.speed) * Math.min(1, dt * 4);
      animator.update(dt);
    }
    // Far enough back to fit the model's height, and its width on a narrow screen (and a tile).
    const across = Math.max(size.x, size.z, 1);
    const dist = Math.max(size.y, across / camera.aspect, 1) * 3.6;
    aim(new THREE.Vector3(0, size.y / 2, 0), yaw, 22, dist);
    outline.render(renderer, scene, camera);
  });
}

function markReady(): void {
  Object.assign(window, { __ready: true });
}
