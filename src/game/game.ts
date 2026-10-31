/**
 * The controller (TECHNICAL.md §3): the start menu (Roz and Lumen pottering
 * about; pick one, then Play), then a run.
 * It steps the simulation at a fixed 60 Hz with the controls' input, turns
 * the simulation's events into sounds, effects and messages, poses the dog,
 * and follows it with the camera. Rules live in sim/run.ts; this only plays them.
 */
import * as THREE from 'three';
import { SONGS } from '../audio/songs';
import type { SfxId } from '../audio/sfx';
import { DOGS, DOG_INFO, type DogKind, gameTuning as T } from '../content/gameTuning';
import { Actors, type Blend } from '../render/actors';
import { DOG_STYLES, DogAnimator } from '../render/dogAnimator';
import { CONTOUR_LAYER } from '../render/outline';
import { View } from '../render/view';
import { buildYard } from '../render/yard';
import {
  DT,
  NO_INPUT,
  createRun,
  step,
  woofCharge,
  type GameEvent,
  type RunState,
} from '../sim/run';
import { Controls } from '../ui/controls';
import { Hud } from '../ui/hud';
import { buildRig, type Rig } from '../voxel/models';
import { Conductor } from './conductor';
import { DOG_MODEL, MENU_FOCUS, MenuScene } from './menu';

/** Never try to catch up more than this much time in one frame (a background tab, a breakpoint). */
const MAX_FRAME = 0.25;
/** Each dog's voice: its yip and its WOOF. */
const VOICE: Record<DogKind, { yip: SfxId; woof: SfxId }> = {
  schnauzer: { yip: 'rozYip', woof: 'rozWoof' },
  spitz: { yip: 'lumenYip', woof: 'lumenWoof' },
};

/** The picked dog's outline on the menu: bright gold. */
const PICKED_OUTLINE = 0xffd23f;
/** Camera: pitched down this much, framing about this many units either side of the dog. */
const CAMERA_PITCH = THREE.MathUtils.degToRad(56);
const CAMERA_HALF_WIDTH = 2.7;
/** On the menu: a little closer, framing the pen, doghouse and both dogs. */
const MENU_HALF_WIDTH = 2.3;

export class Game {
  private readonly view: View;
  private readonly conductor = new Conductor();
  private readonly controls: Controls;
  private readonly hud: Hud;
  private readonly actors: Actors;
  private state: RunState | null = null;
  private dog: { rig: Rig; animator: DogAnimator; facing: number } | null = null;
  private menu: MenuScene | null = null;
  private accumulator = 0;
  private last = performance.now();
  private shake = 0;
  /** Positions one step ago (the dog is id 0), for drawing between steps. */
  private readonly previous = new Map<number, { x: number; z: number }>();
  private readonly camTarget = new THREE.Vector3();
  /** Enemy kinds already announced this run. */
  private readonly announced = new Set<string>();
  private overTimer: number | null = null;
  /** "Zz" over the doghouse while the dog rests inside. */
  private readonly snore: THREE.Sprite;

  constructor(
    canvas: HTMLCanvasElement,
    ui: HTMLDivElement,
    private readonly options: {
      seed: number;
      outline: boolean;
      contour: number | null;
      dog: DogKind | null;
    },
  ) {
    this.view = new View(canvas, { fov: 50, outline: options.outline, contour: options.contour });
    buildYard(this.view.scene);
    this.actors = new Actors(this.view.scene);
    this.snore = snoreSprite();
    this.snore.position.set(T.doghouse.x, 1.6, T.doghouse.z);
    this.snore.visible = false;
    this.view.scene.add(this.snore);
    this.controls = new Controls(ui);
    this.hud = new Hud(ui);
    this.camTarget.copy(MENU_FOCUS);
    if (options.dog) this.start(options.dog);
    else this.showMenu();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** The start menu: both dogs on the lawn; pick one (it's outlined and barks), then Play. */
  private showMenu(): void {
    this.state = null;
    this.actors.clear();
    if (this.dog) this.view.scene.remove(this.dog.rig.root);
    this.dog = null;
    this.snore.visible = false;
    this.controls.setVisible(false);
    this.view.outline?.setContour(null);
    this.menu = new MenuScene(this.view.scene);
    this.hud.menu({
      onPick: (dog) => {
        // The first tap is also when the browser lets sound start.
        if (!this.conductor.started) void this.conductor.start(SONGS[0]);
        this.view.outline?.setContour(PICKED_OUTLINE);
        this.menu?.pick(dog);
        this.conductor.play(VOICE[dog].woof);
      },
      onPlay: (dog) => this.start(dog),
    });
  }

  private start(kind: DogKind): void {
    if (!this.conductor.started) void this.conductor.start(SONGS[0]);
    this.conductor.play('uiClick');
    this.menu?.dispose();
    this.menu = null;
    this.hud.hideMenu();
    this.controls.setVisible(true);
    this.view.outline?.setContour(this.options.contour);
    this.actors.clear();
    this.announced.clear();
    this.overTimer = null;
    this.state = createRun(this.options.seed + Math.floor(Math.random() * 1e6), kind);
    this.setDog(kind, this.state.dog.x, this.state.dog.z);
  }

  private setDog(kind: DogKind, x: number, z: number): void {
    if (this.dog) this.view.scene.remove(this.dog.rig.root);
    const rig = buildRig(DOG_MODEL[kind]);
    for (const mesh of rig.meshes) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.layers.enable(CONTOUR_LAYER);
    }
    rig.root.position.set(x, 0, z);
    this.view.scene.add(rig.root);
    this.dog = { rig, animator: new DogAnimator(rig, DOG_STYLES[kind]), facing: 0 };
  }

  private frame(now: number): void {
    const dt = Math.min((now - this.last) / 1000, MAX_FRAME);
    this.last = now;
    const state = this.state;
    if (state) {
      this.accumulator += dt;
      while (this.accumulator >= DT) {
        this.previous.clear();
        this.previous.set(0, { x: state.dog.x, z: state.dog.z });
        for (const e of state.enemies) this.previous.set(e.id, { x: e.x, z: e.z });
        const input = state.outcome === 'playing' ? this.controls.read() : NO_INPUT;
        for (const e of step(state, input)) this.onEvent(e, state);
        this.accumulator -= DT;
      }
      this.syncRun(state, dt, { alpha: this.accumulator / DT, previous: this.previous });
    } else {
      this.menu?.update(dt);
      this.actors.syncPen(T.sheep, dt);
    }
    this.followCamera(dt);
    this.view.render();
    requestAnimationFrame((t) => this.frame(t));
  }

  private syncRun(state: RunState, dt: number, blend: Blend): void {
    const dogAt = this.dogPosition(state, blend);
    const stats = DOGS[state.dog.kind];
    const charge = woofCharge(state);
    const charging = state.dog.held !== null && state.dog.held >= stats.woof.holdToCharge;
    this.actors.sync(
      state,
      dt,
      blend,
      charging
        ? {
            amount: charge,
            radius: stats.woof.radius[0] + (stats.woof.radius[1] - stats.woof.radius[0]) * charge,
            ...dogAt,
          }
        : null,
    );
    this.controls.show({
      charge,
      dashReady: 1 - state.dog.dashCooldown / stats.dash.cooldown,
      woofReady: state.dog.woofCooldown <= 0,
      enabled: state.dog.mode === 'free' && state.outcome === 'playing',
    });
    const dragon = state.enemies.find((e) => e.kind === 'dragon');
    this.hud.update({
      sheep: state.sheep,
      hearts: state.dog.hearts,
      maxHearts: stats.hearts,
      bones: state.bones,
      dragon: dragon ? dragon.courage / dragon.maxCourage : null,
    });
    this.poseDog(state, dogAt, dt);
    this.pointAtOffscreen(state);
  }

  /** The dog on screen: between its last two steps. */
  private dogPosition(state: RunState, blend: Blend): { x: number; z: number } {
    const prev = blend.previous.get(0) ?? state.dog;
    return {
      x: prev.x + (state.dog.x - prev.x) * blend.alpha,
      z: prev.z + (state.dog.z - prev.z) * blend.alpha,
    };
  }

  /** Arrows at the screen's edge toward enemies out of view, so nothing sneaks up unseen. */
  private pointAtOffscreen(state: RunState): void {
    const { camera } = this.view;
    const v = new THREE.Vector3();
    const marks: { x: number; y: number; angle: number; kind: string }[] = [];
    for (const e of state.enemies) {
      if (e.mode === 'panic' || e.mode === 'leave') continue;
      v.set(e.x, 0.4, e.z).project(camera);
      const inside = Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.92 && v.z < 1;
      if (inside) continue;
      // Behind the camera, the projection flips: point the other way.
      if (v.z > 1) v.multiplyScalar(-1);
      const scale = 1 / Math.max(Math.abs(v.x) / 0.9, Math.abs(v.y) / 0.82, 1);
      marks.push({ x: v.x * scale, y: v.y * scale, angle: Math.atan2(-v.y, v.x), kind: e.kind });
    }
    this.hud.pointers(marks);
  }

  private poseDog(state: RunState, at: { x: number; z: number }, dt: number): void {
    if (!this.dog) return;
    const { rig, animator } = this.dog;
    const d = state.dog;
    rig.root.position.x = at.x;
    rig.root.position.z = at.z;
    // Turn smoothly toward where the dog faces (or where it's going, heading home).
    const target =
      d.mode === 'free'
        ? d.facing
        : Math.hypot(d.vx, d.vz) > 0.1
          ? Math.atan2(d.vx, d.vz)
          : this.dog.facing;
    const turn = Math.atan2(Math.sin(target - this.dog.facing), Math.cos(target - this.dog.facing));
    this.dog.facing += turn * Math.min(1, dt * 16);
    rig.root.rotation.y = this.dog.facing;
    // Trot at its normal speed, gallop when dashing; eased, so a dash flows into a
    // gallop and back out of it instead of snapping between gaits.
    const gait = d.dashTime > 0 ? 2 : Math.hypot(d.vx, d.vz) / DOGS[d.kind].speed;
    animator.speed += (gait - animator.speed) * Math.min(1, dt * 12);
    animator.update(dt);
    // Inside the doghouse while it rests (with a "Zz" over the roof); blinking while it can't be hurt.
    const resting = d.mode === 'resting';
    const blink = d.safe > 0 && d.mode === 'free' && Math.floor(d.safe * 12) % 2 === 1;
    rig.root.visible = !resting && !blink;
    this.snore.visible = resting;
    if (resting) {
      const t = performance.now() / 1000;
      this.snore.position.y = 1.6 + Math.sin(t * 2) * 0.06;
      this.snore.material.rotation = Math.sin(t * 1.5) * 0.15;
    }
  }

  private onEvent(e: GameEvent, state: RunState): void {
    this.actors.onEvent(e, state);
    const sfx = (id: SfxId): void => this.conductor.play(id);
    switch (e.type) {
      case 'yip':
        this.dog?.animator.bark();
        sfx(VOICE[state.dog.kind].yip);
        break;
      case 'woof':
        this.dog?.animator.bark();
        sfx(VOICE[state.dog.kind].woof);
        this.shake = 0.12 + 0.1 * e.charge;
        break;
      case 'dash':
        sfx('whoosh');
        break;
      case 'spawn':
        if (!this.announced.has(e.kind)) {
          this.announced.add(e.kind);
          if (e.kind === 'goblin') this.hud.say('Goblins! Yip at them!');
          else if (e.kind === 'bugs') this.hud.say('Bugs! Hold WOOF!', 2.4);
        }
        break;
      case 'dragon':
        this.hud.say('A DRAGON!', 2.6);
        sfx('thud');
        break;
      case 'panic':
        sfx('blip');
        break;
      case 'bolted':
        this.hud.say('A sheep bolted! Go get it!', 1.6);
        break;
      case 'returned':
        sfx('chime');
        break;
      case 'stolen':
        this.hud.say('A sheep was stolen!', 1.4);
        break;
      case 'strayed':
        this.hud.say('A sheep wandered off!', 1.4);
        break;
      case 'snatched':
        this.hud.say('The dragon took a sheep!', 1.6);
        break;
      case 'dogHurt':
        sfx('thud');
        this.shake = 0.15;
        break;
      case 'pooped':
        this.hud.say(`${DOG_INFO[state.dog.kind].name} is pooped! Off to the doghouse…`, 2.2);
        break;
      case 'restored':
        this.hud.say('Back on guard!', 1.4);
        break;
      case 'fireLand':
        sfx('thud');
        this.shake = Math.max(this.shake, e.hit ? 0.25 : 0.1);
        break;
      case 'won':
      case 'lost':
        if (e.type === 'won') sfx('chime');
        this.overTimer = window.setTimeout(() => {
          this.hud.end(e.type === 'won', state.sheep, state.bones, () => this.showMenu());
        }, 1600);
        break;
    }
  }

  /** Follow the dog from behind and above, far enough back to see a few units either side. */
  private followCamera(dt: number): void {
    const { camera } = this.view;
    // Follow the dog as drawn (between steps), so the camera glides too.
    // On the menu, a fixed view of the pen, doghouse and both dogs.
    const dog = this.state ? this.dog?.rig.root.position : undefined;
    const focus = dog ? new THREE.Vector3(dog.x, 0, dog.z) : MENU_FOCUS;
    this.camTarget.lerp(focus, Math.min(1, dt * 5));
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const halfHFov = Math.atan(Math.tan(halfFov) * camera.aspect);
    const halfWidth = this.state ? CAMERA_HALF_WIDTH : MENU_HALF_WIDTH;
    const dist = THREE.MathUtils.clamp(halfWidth / Math.tan(halfHFov), 6, 14);
    // In play, look a little ahead (up the screen), so more of the yard shows in front; on
    // the menu, a little below, so the dogs sit above the menu's buttons.
    const look = this.camTarget.clone().add(new THREE.Vector3(0, 0.3, this.state ? -0.6 : 0.9));
    camera.position.set(
      look.x,
      look.y + Math.sin(CAMERA_PITCH) * dist,
      look.z + Math.cos(CAMERA_PITCH) * dist,
    );
    this.shake = Math.max(0, this.shake - dt);
    if (this.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * this.shake * 0.6;
      camera.position.y += (Math.random() - 0.5) * this.shake * 0.6;
    }
    camera.lookAt(look);
  }
}

/** A sleepy "Zz" for over the doghouse. */
function snoreSprite(): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = '900 46px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#1f2430';
    ctx.strokeText('Zz', 64, 48);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Zz', 64, 48);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(1, 0.5, 1);
  return sprite;
}
