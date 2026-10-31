/**
 * Everything that comes and goes in a run, drawn from the simulation's state
 * (it reads, never writes): enemies (with their courage pips), the flock in
 * the pen and sheep loose in the yard, the dragon's fire circles, and the bark and fire effects, which
 * react to the simulation's events.
 */
import * as THREE from 'three';
import { DOGS, gameTuning as T, type EnemyKind } from '../content/gameTuning';
import type { Enemy, GameEvent, RunState } from '../sim/run';
import { buildRig, getGeometry, voxelMaterial, type Rig } from '../voxel/models';
import { poseDragon } from './dragonPose';

/** How many bugs make one swarm on screen. */
const BUGS_PER_SWARM = 5;
const MAX_BUGS = 400;

interface EnemyView {
  readonly root: THREE.Group;
  readonly body: THREE.Object3D;
  /** The sheep a goblin carries off over its head. */
  readonly carried: THREE.Object3D | null;
  readonly pips: THREE.Sprite | null;
  /** The dragon's rig (its wings flap), or null for a single-piece enemy. */
  readonly rig: Rig | null;
  pipsKey: string;
  /** A little hop when scared. */
  hop: number;
  facing: number;
}

interface PenSheep {
  readonly mesh: THREE.Object3D;
  goal: [number, number];
  wait: number;
}

interface Effect {
  readonly object: THREE.Object3D;
  age: number;
  readonly life: number;
  readonly update: (k: number) => void;
}

/**
 * Where things were one simulation step ago, and how far (0..1) the screen is
 * toward the current step: drawing between the two keeps motion smooth
 * whatever the display's refresh rate (the simulation steps at a fixed 60 Hz).
 */
export interface Blend {
  readonly alpha: number;
  readonly previous: ReadonlyMap<number, { readonly x: number; readonly z: number }>;
}

/** An enemy's position on screen: between its last two steps. */
export function blended(
  e: { id: number; x: number; z: number },
  blend: Blend,
): { x: number; z: number } {
  const prev = blend.previous.get(e.id);
  if (!prev) return { x: e.x, z: e.z };
  return { x: prev.x + (e.x - prev.x) * blend.alpha, z: prev.z + (e.z - prev.z) * blend.alpha };
}

export class Actors {
  private readonly enemies = new Map<number, EnemyView>();
  private readonly loose = new Map<number, THREE.Object3D>();
  /** The sheep milling about in the pen (as many as the state says are safe). */
  private readonly flock: PenSheep[] = [];
  private readonly fires = new Map<
    number,
    { root: THREE.Group; fill: THREE.Mesh; ring: THREE.Mesh }
  >();
  private readonly effects: Effect[] = [];
  private readonly bugs: THREE.InstancedMesh;
  /** Shows how far a charging WOOF will reach. */
  private readonly chargeRing: THREE.Mesh;
  private time = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.bugs = new THREE.InstancedMesh(getGeometry('enemies/bug'), voxelMaterial, MAX_BUGS);
    this.bugs.castShadow = true;
    this.bugs.count = 0;
    this.bugs.frustumCulled = false;
    scene.add(this.bugs);
    this.chargeRing = flat(new THREE.RingGeometry(0.92, 1, 64), 0xffffff, 0.55);
    this.chargeRing.visible = false;
    scene.add(this.chargeRing);
  }

  /** React to what just happened in the simulation. */
  onEvent(e: GameEvent, state: RunState): void {
    if (e.type === 'yip') this.yipWave(e.x, e.z, e.facing, DOGS[state.dog.kind].yip);
    else if (e.type === 'woof') this.woofWave(e.x, e.z, e.radius);
    else if (e.type === 'scared') {
      const view = this.enemies.get(e.id);
      if (view) view.hop = 1;
    } else if (e.type === 'fireLand') this.fireBurst(e.x, e.z);
  }

  /** Match the scene to the state. `charge` is the WOOF being held (0..1), and its radius. */
  sync(
    state: RunState,
    dt: number,
    blend: Blend,
    charge: { amount: number; radius: number; x: number; z: number } | null,
  ): void {
    this.time += dt;
    this.syncEnemies(state, dt, blend);
    this.syncLooseSheep(state);
    this.syncPen(state.sheep, dt);
    this.syncFires(state);
    this.syncEffects(dt);
    this.chargeRing.visible = charge !== null;
    if (charge) {
      this.chargeRing.position.set(charge.x, 0.03, charge.z);
      this.chargeRing.scale.setScalar(charge.radius);
      (this.chargeRing.material as THREE.MeshBasicMaterial).opacity =
        charge.amount >= 1 ? 0.9 : 0.45;
    }
  }

  /** Remove everything (a new run). */
  clear(): void {
    for (const view of this.enemies.values()) this.scene.remove(view.root);
    for (const t of this.loose.values()) this.scene.remove(t);
    for (const f of this.fires.values()) this.scene.remove(f.root);
    for (const fx of this.effects) this.scene.remove(fx.object);
    this.enemies.clear();
    this.loose.clear();
    this.fires.clear();
    this.effects.length = 0;
    this.bugs.count = 0;
  }

  private syncEnemies(state: RunState, dt: number, blend: Blend): void {
    const seen = new Set<number>();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    let bugCount = 0;
    for (const e of state.enemies) {
      seen.add(e.id);
      const at = blended(e, blend);
      if (e.kind === 'bugs') {
        // A swarm is a few bugs buzzing round its centre.
        for (let i = 0; i < BUGS_PER_SWARM && bugCount < MAX_BUGS; i++) {
          const a = this.time * (5 + i) + e.id * 2.3 + i * 1.26;
          const r = 0.12 + 0.12 * Math.sin(this.time * 3 + i);
          const y = 0.35 + 0.18 * Math.sin(this.time * 7 + i * 2 + e.id);
          q.setFromAxisAngle(up, a + Math.PI / 2);
          m.compose(
            new THREE.Vector3(at.x + Math.sin(a) * r, y, at.z + Math.cos(a) * r),
            q,
            new THREE.Vector3(1, 1, 1),
          );
          this.bugs.setMatrixAt(bugCount++, m);
        }
        continue;
      }
      let view = this.enemies.get(e.id);
      if (!view) {
        view = this.makeEnemy(e.kind);
        this.enemies.set(e.id, view);
        this.scene.add(view.root);
      }
      this.poseEnemy(view, e, at, dt);
    }
    this.bugs.count = bugCount;
    this.bugs.instanceMatrix.needsUpdate = true;
    for (const [id, view] of this.enemies) {
      if (seen.has(id)) continue;
      this.scene.remove(view.root);
      this.enemies.delete(id);
    }
  }

  private makeEnemy(kind: EnemyKind): EnemyView {
    const root = new THREE.Group();
    let body: THREE.Object3D;
    let rig: Rig | null = null;
    if (kind === 'dragon') {
      rig = buildRig('enemies/dragon');
      for (const mesh of rig.meshes) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      body = rig.root;
    } else {
      const mesh = new THREE.Mesh(getGeometry(`enemies/${kind}`), voxelMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      body = mesh;
    }
    root.add(body);
    let carried: THREE.Object3D | null = null;
    let pips: THREE.Sprite | null = null;
    if (kind === 'goblin') {
      // The sheep it's stealing, held up over its head.
      carried = sheepMesh();
      carried.position.set(0, 0.8, 0);
      carried.scale.setScalar(0.7);
      root.add(carried);
      pips = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
      pips.scale.set(0.6, 0.15, 1);
      pips.position.y = 1.3;
      pips.renderOrder = 10;
      root.add(pips);
    }
    return { root, body, carried, pips, rig, pipsKey: '', hop: 0, facing: 0 };
  }

  private poseEnemy(view: EnemyView, e: Enemy, at: { x: number; z: number }, dt: number): void {
    view.root.position.set(at.x, 0, at.z);
    const moving = Math.hypot(e.vx, e.vz) > 0.05;
    if (moving) {
      const target = Math.atan2(e.vx, e.vz);
      const d = Math.atan2(Math.sin(target - view.facing), Math.cos(target - view.facing));
      view.facing += d * Math.min(1, dt * 10);
    }
    view.root.rotation.y = view.facing;
    view.hop = Math.max(0, view.hop - dt * 4);
    const hop = Math.sin(view.hop * Math.PI) * 0.18;
    const speed = Math.hypot(e.vx, e.vz);
    if (e.kind === 'goblin') {
      // A waddle, faster in a panic; a shiver when startled.
      const rate = e.mode === 'panic' ? 22 : 12;
      view.body.rotation.z = moving ? Math.sin(this.time * rate + e.id) * 0.14 : 0;
      view.body.position.y =
        hop + (moving ? Math.abs(Math.sin(this.time * rate + e.id)) * 0.05 : 0);
      view.body.position.x = e.startled > 0 ? Math.sin(this.time * 60) * 0.03 : 0;
      if (view.carried) {
        // Held up kicking: it wiggles.
        view.carried.visible = e.carrying;
        view.carried.rotation.z = Math.sin(this.time * 14 + e.id) * 0.15;
      }
    } else if (e.kind === 'dragon') {
      // A slow, heavy plod; it rears back a little each time it breathes fire.
      view.body.position.y =
        hop + Math.abs(Math.sin(this.time * 3)) * 0.06 * Math.min(1, speed * 2);
      const rear = Math.max(0, 1 - e.fireClock / 0.5);
      if (view.rig) poseDragon(view.rig, this.time + e.id, rear, e.mode === 'panic');
    }
    if (view.pips) {
      const key = `${e.courage}/${e.maxCourage}/${e.mode === 'panic' ? 'p' : e.startled > 0 ? 's' : ''}`;
      if (key !== view.pipsKey) {
        view.pipsKey = key;
        const old = view.pips.material.map;
        view.pips.material.map = pipsTexture(e);
        view.pips.material.needsUpdate = true;
        old?.dispose();
      }
    }
  }

  /** Loose sheep: wandering off, bobbing as they go. */
  private syncLooseSheep(state: RunState): void {
    const seen = new Set<number>();
    for (const sheep of state.looseSheep) {
      seen.add(sheep.id);
      let mesh = this.loose.get(sheep.id);
      if (!mesh) {
        mesh = sheepMesh();
        this.loose.set(sheep.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(sheep.x, Math.abs(Math.sin(this.time * 7 + sheep.id)) * 0.04, sheep.z);
      mesh.rotation.y = sheep.heading;
    }
    for (const [id, mesh] of this.loose) {
      if (seen.has(id)) continue;
      this.scene.remove(mesh);
      this.loose.delete(id);
    }
  }

  /**
   * The flock in the pen: as many sheep as are safe, each ambling to a spot,
   * standing a while, ambling on. Just for show (Math.random is fine here).
   */
  syncPen(count: number, dt: number): void {
    const inside = T.pen.radius - 0.45;
    const spot = (): [number, number] => {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * inside;
      return [T.pen.x + Math.sin(a) * r, T.pen.z + Math.cos(a) * r];
    };
    while (this.flock.length < count) {
      const mesh = sheepMesh();
      const [x, z] = spot();
      mesh.position.set(x, 0.075, z);
      mesh.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(mesh);
      this.flock.push({ mesh, goal: [x, z], wait: Math.random() * 3 });
    }
    while (this.flock.length > count) {
      const gone = this.flock.pop();
      if (gone) this.scene.remove(gone.mesh);
    }
    for (const sheep of this.flock) {
      const p = sheep.mesh.position;
      const dx = sheep.goal[0] - p.x;
      const dz = sheep.goal[1] - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.03) {
        const step = Math.min(d, 0.3 * dt);
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        const target = Math.atan2(dx, dz);
        const turn = Math.atan2(
          Math.sin(target - sheep.mesh.rotation.y),
          Math.cos(target - sheep.mesh.rotation.y),
        );
        sheep.mesh.rotation.y += turn * Math.min(1, dt * 5);
        p.y = 0.075 + Math.abs(Math.sin(this.time * 8 + p.x * 3)) * 0.025;
      } else if ((sheep.wait -= dt) <= 0) {
        sheep.goal = spot();
        sheep.wait = 1.5 + Math.random() * 4;
      }
    }
    // Sheep don't stand inside each other.
    for (let i = 0; i < this.flock.length; i++)
      for (let j = i + 1; j < this.flock.length; j++) {
        const a = this.flock[i]?.mesh.position;
        const b = this.flock[j]?.mesh.position;
        if (!a || !b) continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d >= 0.42 || d === 0) continue;
        const push = (0.42 - d) / 2;
        a.x += ((a.x - b.x) / d) * push;
        a.z += ((a.z - b.z) / d) * push;
        b.x -= ((a.x - b.x) / d) * push;
        b.z -= ((a.z - b.z) / d) * push;
      }
  }

  private syncFires(state: RunState): void {
    const seen = new Set<number>();
    for (const f of state.fires) {
      seen.add(f.id);
      let view = this.fires.get(f.id);
      if (!view) {
        const root = new THREE.Group();
        const ring = flat(new THREE.RingGeometry(0.9, 1, 64), 0xff4b2b, 0.9);
        const fill = flat(new THREE.CircleGeometry(1, 64), 0xff8a3d, 0.35);
        root.add(ring, fill);
        root.position.set(f.x, 0.025, f.z);
        root.scale.setScalar(f.radius);
        view = { root, fill, ring };
        this.fires.set(f.id, view);
        this.scene.add(root);
      }
      // The fill grows to the rim as the fire comes; the rim pulses faster and faster.
      const k = 1 - f.warn / f.warnTotal;
      view.fill.scale.setScalar(Math.max(0.01, k));
      (view.ring.material as THREE.MeshBasicMaterial).opacity =
        0.55 + 0.45 * Math.abs(Math.sin(this.time * (6 + k * 14)));
    }
    for (const [id, view] of this.fires) {
      if (seen.has(id)) continue;
      this.scene.remove(view.root);
      this.fires.delete(id);
    }
  }

  private yipWave(
    x: number,
    z: number,
    facing: number,
    yip: { range: number; halfAngle: number },
  ): void {
    const geometry = new THREE.RingGeometry(
      0.86,
      1,
      24,
      1,
      facing - Math.PI / 2 - yip.halfAngle,
      yip.halfAngle * 2,
    );
    const arc = flat(geometry, 0xffffff, 0.9);
    arc.position.set(x, 0.05, z);
    this.addEffect(arc, 0.28, (k) => {
      arc.scale.setScalar(0.4 + k * (yip.range - 0.4));
      (arc.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
    });
  }

  private woofWave(x: number, z: number, radius: number): void {
    const ring = flat(new THREE.RingGeometry(0.8, 1, 64), 0xffffff, 0.95);
    ring.position.set(x, 0.05, z);
    this.addEffect(ring, 0.35, (k) => {
      ring.scale.setScalar(0.3 + (radius - 0.3) * (1 - (1 - k) ** 2));
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - k);
    });
  }

  private fireBurst(x: number, z: number): void {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 12),
      new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, depthWrite: false }),
    );
    ball.position.set(x, 0, z);
    this.addEffect(ball, 0.45, (k) => {
      ball.scale.set(1.4 * (0.3 + k), 1.2 * (1 - k) + 0.1, 1.4 * (0.3 + k));
      (ball.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
    });
  }

  private addEffect(object: THREE.Object3D, life: number, update: (k: number) => void): void {
    update(0);
    this.scene.add(object);
    this.effects.push({ object, age: 0, life, update });
  }

  private syncEffects(dt: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      if (!fx) continue;
      fx.age += dt;
      if (fx.age >= fx.life) {
        this.scene.remove(fx.object);
        this.effects.splice(i, 1);
      } else fx.update(fx.age / fx.life);
    }
  }
}

function sheepMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(getGeometry('world/sheep'), voxelMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A flat, unlit shape lying on the ground. */
function flat(geometry: THREE.BufferGeometry, color: number, opacity: number): THREE.Mesh {
  geometry.rotateX(-Math.PI / 2);
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
}

/** Courage pips over a goblin's head: filled for courage left; "!" when startled or panicking. */
function pipsTexture(e: Enemy): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    if (e.mode === 'panic' || e.startled > 0) {
      ctx.font = '900 30px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#1f2430';
      const text = e.mode === 'panic' ? '!!' : '!';
      ctx.strokeText(text, 64, 28);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, 64, 28);
    } else {
      const n = e.maxCourage;
      for (let i = 0; i < n; i++) {
        const x = 64 + (i - (n - 1) / 2) * 26;
        ctx.beginPath();
        ctx.arc(x, 16, 9, 0, Math.PI * 2);
        ctx.fillStyle = i < e.courage ? '#ffb627' : 'rgba(31,36,48,0.35)';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#1f2430';
        ctx.stroke();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
