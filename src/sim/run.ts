/**
 * The rules (GAMEPLAY.md), as a pure simulation: no three.js, no DOM, no
 * Math.random. `step` advances a run by one fixed tick (DT) and returns what
 * happened, for the renderer and the sound to react to. It changes the state
 * it's given in place (the state is small, but stepping 60 times a second
 * shouldn't allocate a new one each time); every random choice comes from the
 * run's seed, so the same seed and inputs always play out the same way.
 *
 * The ground is the x–z plane; the dog faces +z at a facing of 0, and a
 * facing is atan2(x, z) of the direction it looks.
 */
import {
  DOGS,
  ENEMIES,
  WAVES,
  gameTuning as T,
  type DogKind,
  type EnemyKind,
} from '../content/gameTuning';
import { createRng, deriveSeed } from './rng';

export const DT = 1 / 60;

export interface Dog {
  readonly kind: DogKind;
  x: number;
  z: number;
  /** Where it's moving (units a second), for the animation. */
  vx: number;
  vz: number;
  facing: number;
  hearts: number;
  /** Seconds it can't be hurt (after a hit). */
  safe: number;
  /** Free to play; pooped (trotting home on its own); resting in its doghouse. */
  mode: 'free' | 'pooped' | 'resting';
  rest: number;
  dashTime: number;
  dashCooldown: number;
  dashX: number;
  dashZ: number;
  yipCooldown: number;
  woofCooldown: number;
  /** Seconds the woof button has been held, or null while it's up. */
  held: number | null;
}

export interface Enemy {
  readonly id: number;
  readonly kind: EnemyKind;
  x: number;
  z: number;
  vx: number;
  vz: number;
  courage: number;
  readonly maxCourage: number;
  /**
   * come: heading for the cottage; leave: going home (a goblin with or without
   * a treat); eat: at the jar (bugs, the dragon); panic: scared, running for the woods.
   */
  mode: 'come' | 'leave' | 'eat' | 'panic';
  carrying: boolean;
  /** Frozen by a yip for this long. */
  startled: number;
  /** Knockback still moving it. */
  kx: number;
  kz: number;
  /** Swat, sting, eat, nibble or fire timer, by kind. */
  timer: number;
  /** The dragon's next fire, in seconds. */
  fireClock: number;
}

export interface Fire {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  /** Seconds until it lands, and how long it warned for in all. */
  warn: number;
  readonly warnTotal: number;
}

export interface GroundTreat {
  readonly id: number;
  readonly x: number;
  readonly z: number;
}

export interface RunState {
  readonly seed: number;
  time: number;
  readonly dog: Dog;
  enemies: Enemy[];
  fires: Fire[];
  groundTreats: GroundTreat[];
  /** Treats in the jar: the score. */
  jar: number;
  bones: number;
  nextId: number;
  /** How many of each wave (by index in WAVES) have spawned. */
  readonly spawned: number[];
  outcome: 'playing' | 'won' | 'lost';
}

export interface StepInput {
  /** The stick, in ground directions (x right, z toward the camera); length up to 1. */
  readonly moveX: number;
  readonly moveZ: number;
  /** Dash pressed (this step). */
  readonly dash: boolean;
  /** The woof button is down (tap for a yip, hold and release for a WOOF). */
  readonly woof: boolean;
}

export const NO_INPUT: StepInput = { moveX: 0, moveZ: 0, dash: false, woof: false };

export type GameEvent =
  | { type: 'spawn'; id: number; kind: EnemyKind }
  | { type: 'dash' }
  | { type: 'yip'; x: number; z: number; facing: number; target: number | null }
  | { type: 'woof'; x: number; z: number; radius: number; charge: number }
  | { type: 'scared'; id: number; pips: number }
  | { type: 'panic'; id: number; kind: EnemyKind }
  | { type: 'fled'; id: number }
  | { type: 'grab'; id: number }
  | { type: 'eaten'; id: number }
  | { type: 'dropped'; treat: number; x: number; z: number }
  | { type: 'returned'; treat: number }
  | { type: 'stolen'; id: number }
  | { type: 'dogHurt'; damage: number; hearts: number }
  | { type: 'pooped' }
  | { type: 'restored' }
  | { type: 'fireWarn'; id: number }
  | { type: 'fireLand'; id: number; x: number; z: number; hit: boolean }
  | { type: 'dragon' }
  | { type: 'won' }
  | { type: 'lost' };

export function createRun(seed: number, dogKind: DogKind = 'schnauzer'): RunState {
  const stats = DOGS[dogKind];
  return {
    seed,
    time: 0,
    dog: {
      kind: dogKind,
      x: T.doghouse.x,
      z: T.doghouse.z + 0.9,
      vx: 0,
      vz: 0,
      facing: 0,
      hearts: stats.hearts,
      safe: 0,
      mode: 'free',
      rest: 0,
      dashTime: 0,
      dashCooldown: 0,
      dashX: 0,
      dashZ: 0,
      yipCooldown: 0,
      woofCooldown: 0,
      held: null,
    },
    enemies: [],
    fires: [],
    groundTreats: [],
    jar: T.treats,
    bones: 0,
    nextId: 1,
    spawned: WAVES.map(() => 0),
    outcome: 'playing',
  };
}

/** The charge of a held woof button, 0..1 (0 until it's held long enough to be a WOOF). */
export function woofCharge(state: RunState): number {
  const { held } = state.dog;
  const woof = DOGS[state.dog.kind].woof;
  if (held === null || held < woof.holdToCharge) return 0;
  return Math.min(1, (held - woof.holdToCharge) / woof.chargeTime);
}

export function step(state: RunState, input: StepInput): GameEvent[] {
  const events: GameEvent[] = [];
  state.time += DT;
  if (state.outcome === 'playing') spawnWaves(state, events);
  stepDog(state, input, events);
  for (const enemy of state.enemies) stepEnemy(state, enemy, events);
  separate(state);
  stepFires(state, events);
  state.enemies = state.enemies.filter((e) => {
    const gone =
      e.mode !== 'come' && e.mode !== 'eat' && dist(e.x, e.z, 0, 0) > T.yard.escapeRadius;
    if (gone) {
      events.push(e.carrying ? { type: 'stolen', id: e.id } : { type: 'fled', id: e.id });
    }
    return !gone;
  });
  if (
    state.outcome === 'playing' &&
    state.jar === 0 &&
    state.groundTreats.length === 0 &&
    !state.enemies.some((e) => e.carrying)
  ) {
    state.outcome = 'lost';
    events.push({ type: 'lost' });
  }
  return events;
}

function spawnWaves(state: RunState, events: GameEvent[]): void {
  WAVES.forEach((wave, i) => {
    for (
      let n = state.spawned[i] ?? 0;
      n < wave.count && state.time >= wave.at + n * wave.every;
      n++
    ) {
      state.spawned[i] = n + 1;
      const rng = createRng(deriveSeed(state.seed, 'spawn', i, n));
      const angle = rng.next() * Math.PI * 2;
      const x = Math.sin(angle) * T.yard.spawnRadius;
      const z = Math.cos(angle) * T.yard.spawnRadius;
      if (wave.kind === 'bugs') {
        const swarms = rng.int(T.bugs.cloud[0], T.bugs.cloud[1]);
        for (let k = 0; k < swarms; k++) {
          const a = rng.next() * Math.PI * 2;
          const r = rng.next() * T.bugs.cloudSpread;
          spawnEnemy(state, 'bugs', x + Math.sin(a) * r, z + Math.cos(a) * r, events);
        }
      } else {
        spawnEnemy(state, wave.kind, x, z, events);
        if (wave.kind === 'dragon') events.push({ type: 'dragon' });
      }
    }
  });
}

/** Put an enemy in the yard (the waves do this; tests and dev tools can too). */
export function spawnEnemy(
  state: RunState,
  kind: EnemyKind,
  x: number,
  z: number,
  events: GameEvent[] = [],
): Enemy {
  const stats = ENEMIES[kind];
  const id = state.nextId++;
  const enemy: Enemy = {
    id,
    kind,
    x,
    z,
    vx: 0,
    vz: 0,
    courage: stats.courage,
    maxCourage: stats.courage,
    mode: 'come',
    carrying: false,
    startled: 0,
    kx: 0,
    kz: 0,
    timer: 0,
    fireClock: T.dragon.fireEvery,
  };
  state.enemies.push(enemy);
  events.push({ type: 'spawn', id, kind });
  return enemy;
}

function stepDog(state: RunState, input: StepInput, events: GameEvent[]): void {
  const dog = state.dog;
  const stats = DOGS[dog.kind];
  dog.safe = Math.max(0, dog.safe - DT);
  dog.dashCooldown = Math.max(0, dog.dashCooldown - DT);
  dog.yipCooldown = Math.max(0, dog.yipCooldown - DT);
  dog.woofCooldown = Math.max(0, dog.woofCooldown - DT);
  dog.dashTime = Math.max(0, dog.dashTime - DT);

  if (dog.mode !== 'free') {
    dog.held = null;
    dog.dashTime = 0;
    // Home: first to the doorway (the door faces +z), then straight in, all the way.
    const door = doghouseDoor(stats.radius);
    const inLane = Math.abs(dog.x - T.doghouse.x) < 0.12 && dog.z > T.doghouse.z - 0.05;
    const toX = (inLane ? T.doghouse.x : door.x) - dog.x;
    const toZ = (inLane ? T.doghouse.z : door.z) - dog.z;
    const d = Math.hypot(toX, toZ);
    if (dog.mode === 'pooped') {
      if (inLane && d < 0.08) {
        dog.mode = 'resting';
        dog.rest = T.pooped.rest;
        dog.vx = dog.vz = 0;
        dog.x = T.doghouse.x;
        dog.z = T.doghouse.z;
      } else {
        const speed = Math.min(T.pooped.speed, d / DT);
        dog.vx = (toX / d) * speed;
        dog.vz = (toZ / d) * speed;
      }
    } else {
      dog.vx = dog.vz = 0;
      dog.rest -= DT;
      if (dog.rest <= 0) {
        // Back out of the door, facing the yard.
        dog.mode = 'free';
        dog.hearts = stats.hearts;
        dog.safe = T.hurtSafety;
        dog.x = door.x;
        dog.z = door.z;
        dog.facing = 0;
        events.push({ type: 'restored' });
      }
    }
    moveDog(dog);
    return;
  }

  // The stick.
  let mx = input.moveX;
  let mz = input.moveZ;
  const m = Math.hypot(mx, mz);
  if (m > 1) {
    mx /= m;
    mz /= m;
  }

  // Dash.
  if (input.dash && dog.dashCooldown <= 0 && dog.dashTime <= 0) {
    const dir = m > 0.2 ? Math.atan2(mx, mz) : dog.facing;
    dog.dashX = Math.sin(dir);
    dog.dashZ = Math.cos(dir);
    dog.dashTime = stats.dash.time;
    dog.dashCooldown = stats.dash.cooldown;
    dog.facing = dir;
    events.push({ type: 'dash' });
  }

  // Woof button: a tap is a yip; a hold charges a WOOF that goes off on release.
  if (input.woof) dog.held = dog.held === null ? 0 : dog.held + DT;
  else if (dog.held !== null) {
    if (dog.held < stats.woof.holdToCharge) yip(state, events);
    else woof(state, woofCharge(state), events);
    dog.held = null;
  }
  const charging = dog.held !== null && dog.held >= stats.woof.holdToCharge;

  if (dog.dashTime > 0) {
    dog.vx = dog.dashX * stats.dash.speed;
    dog.vz = dog.dashZ * stats.dash.speed;
  } else {
    const speed = stats.speed * (charging ? stats.woof.chargeSlow : 1);
    dog.vx = mx * speed;
    dog.vz = mz * speed;
    if (m > 0.1) dog.facing = turnToward(dog.facing, Math.atan2(mx, mz), 14 * DT);
  }
  moveDog(dog);

  // Bring home any dropped treats it trots over.
  state.groundTreats = state.groundTreats.filter((t) => {
    if (dist(t.x, t.z, dog.x, dog.z) > T.pickup) return true;
    state.jar++;
    events.push({ type: 'returned', treat: t.id });
    return false;
  });
}

/** Just outside the doghouse's door, where a dog of this size stands clear of it. */
function doghouseDoor(dogRadius: number): { x: number; z: number } {
  return { x: T.doghouse.x, z: T.doghouse.z + T.doghouse.radius + dogRadius + 0.05 };
}

function moveDog(dog: Dog): void {
  dog.x += dog.vx * DT;
  dog.z += dog.vz * DT;
  // Stay in the garden, and out of the cottage and doghouse.
  const r = Math.hypot(dog.x, dog.z);
  const max = T.yard.radius - 0.3;
  if (r > max) {
    dog.x *= max / r;
    dog.z *= max / r;
  }
  if (dog.mode === 'free') {
    pushOut(dog, T.cottage.x, T.cottage.z, T.cottage.radius + DOGS[dog.kind].radius);
    pushOut(dog, T.doghouse.x, T.doghouse.z, T.doghouse.radius + DOGS[dog.kind].radius);
  }
}

function yip(state: RunState, events: GameEvent[]): void {
  const dog = state.dog;
  const stats = DOGS[dog.kind].yip;
  if (dog.yipCooldown > 0) return;
  dog.yipCooldown = stats.cooldown;
  // Snap to the nearest enemy roughly in front (a generous cone, so a thumb can aim it).
  let target: Enemy | null = null;
  let best = Infinity;
  for (const e of state.enemies) {
    if (e.mode === 'panic') continue;
    const d = dist(e.x, e.z, dog.x, dog.z) - ENEMIES[e.kind].radius;
    if (d > stats.range) continue;
    const off = Math.abs(angleDiff(Math.atan2(e.x - dog.x, e.z - dog.z), dog.facing));
    if (off > stats.halfAngle * 2 || d >= best) continue;
    best = d;
    target = e;
  }
  if (target) dog.facing = Math.atan2(target.x - dog.x, target.z - dog.z);
  events.push({ type: 'yip', x: dog.x, z: dog.z, facing: dog.facing, target: target?.id ?? null });
  if (!target) return;
  target.startled = Math.max(target.startled, ENEMIES[target.kind].startle);
  scare(state, target, 1, events);
}

function woof(state: RunState, charge: number, events: GameEvent[]): void {
  const dog = state.dog;
  const stats = DOGS[dog.kind].woof;
  if (dog.woofCooldown > 0) return;
  dog.woofCooldown = stats.cooldown;
  const radius = stats.radius[0] + (stats.radius[1] - stats.radius[0]) * charge;
  const pips = Math.round(stats.pips[0] + (stats.pips[1] - stats.pips[0]) * charge);
  events.push({ type: 'woof', x: dog.x, z: dog.z, radius, charge });
  for (const e of state.enemies) {
    if (e.mode === 'panic') continue;
    const d = dist(e.x, e.z, dog.x, dog.z);
    if (d - ENEMIES[e.kind].radius > radius) continue;
    // Knocked straight away from the dog.
    const push = stats.knockback * ENEMIES[e.kind].knock * 4;
    e.kx = ((e.x - dog.x) / (d || 1)) * push;
    e.kz = ((e.z - dog.z) / (d || 1)) * push;
    scare(state, e, pips, events);
  }
}

/** Take courage away; a goblin drops its treat; at none left, it panics. */
function scare(state: RunState, e: Enemy, pips: number, events: GameEvent[]): void {
  e.courage = Math.max(0, e.courage - pips);
  events.push({ type: 'scared', id: e.id, pips });
  if (e.carrying) {
    e.carrying = false;
    const treat = { id: state.nextId++, x: e.x, z: e.z };
    state.groundTreats.push(treat);
    events.push({ type: 'dropped', treat: treat.id, x: treat.x, z: treat.z });
  }
  if (e.courage === 0) panic(state, e, events);
}

function panic(state: RunState, e: Enemy, events: GameEvent[]): void {
  if (e.mode === 'panic') return;
  e.mode = 'panic';
  e.startled = 0;
  state.bones += e.kind === 'dragon' ? 10 : 1;
  events.push({ type: 'panic', id: e.id, kind: e.kind });
  if (e.kind === 'dragon' && state.outcome === 'playing') {
    // The dragon's flight scares everyone else off too: the run is won.
    state.outcome = 'won';
    state.fires = [];
    events.push({ type: 'won' });
    for (const other of state.enemies) if (other !== e) scare(state, other, other.courage, events);
  }
}

function stepEnemy(state: RunState, e: Enemy, events: GameEvent[]): void {
  const stats = ENEMIES[e.kind];
  const dog = state.dog;
  e.timer = Math.max(0, e.timer - DT);

  // Knockback slides it, fading fast.
  e.x += e.kx * DT;
  e.z += e.kz * DT;
  const fade = Math.exp(-7 * DT);
  e.kx *= fade;
  e.kz *= fade;

  let gx = 0;
  let gz = 0;
  let speed = stats.speed;
  if (e.mode !== 'panic' && e.startled > 0) {
    // Frozen by a yip.
    e.startled -= DT;
    speed = 0;
  } else if (e.mode === 'panic' || e.mode === 'leave') {
    // Out to the woods, straight away from the cottage.
    const d = dist(e.x, e.z, T.cottage.x, T.cottage.z) || 1;
    gx = (e.x - T.cottage.x) / d;
    gz = (e.z - T.cottage.z) / d;
    if (e.mode === 'panic') speed = stats.fleeSpeed;
  } else {
    // Bugs go for the dog when it's near; everyone else (and bugs otherwise) for the cottage.
    const chase =
      e.kind === 'bugs' && dog.mode === 'free' && dist(e.x, e.z, dog.x, dog.z) < T.bugs.chaseDog;
    const tx = chase ? dog.x : T.cottage.x;
    const tz = chase ? dog.z : T.cottage.z;
    const d = dist(e.x, e.z, tx, tz) || 1;
    gx = (tx - e.x) / d;
    gz = (tz - e.z) / d;
    if (e.kind === 'bugs') {
      // A wobbly, buzzing path.
      const w = Math.sin(state.time * 6 + e.id * 1.7) * 0.7;
      [gx, gz] = [gx - gz * w, gz + gx * w];
    }
    const atCottage =
      dist(e.x, e.z, T.cottage.x, T.cottage.z) < T.cottage.radius + stats.radius + 0.15;
    if (atCottage && !chase) {
      speed = 0;
      reachCottage(state, e, events);
    } else if (e.mode === 'eat') e.mode = 'come';
  }
  if (e.mode !== 'panic') attackDog(state, e, events);

  const g = Math.hypot(gx, gz) || 1;
  e.vx = (gx / g) * speed;
  e.vz = (gz / g) * speed;
  e.x += e.vx * DT;
  e.z += e.vz * DT;
  if (e.mode !== 'panic' && e.mode !== 'leave') {
    pushOut(e, T.cottage.x, T.cottage.z, T.cottage.radius + stats.radius);
  }

  if (e.kind === 'dragon' && e.mode !== 'panic' && state.outcome === 'playing')
    dragonFire(state, e, events);
}

/** At the cottage: a goblin grabs a treat and leaves; bugs and the dragon eat at the jar. */
function reachCottage(state: RunState, e: Enemy, events: GameEvent[]): void {
  if (e.kind === 'goblin') {
    if (state.jar > 0) {
      state.jar--;
      e.carrying = true;
      events.push({ type: 'grab', id: e.id });
    }
    e.mode = 'leave';
    return;
  }
  if (e.mode !== 'eat') {
    e.mode = 'eat';
    e.timer = e.kind === 'dragon' ? T.dragon.nibbleTime : T.bugs.eatTime;
  }
  if (e.timer <= 0 && state.jar > 0) {
    state.jar--;
    events.push({ type: 'eaten', id: e.id });
    e.timer = e.kind === 'dragon' ? T.dragon.nibbleTime : T.bugs.eatTime;
  }
}

function attackDog(state: RunState, e: Enemy, events: GameEvent[]): void {
  const dog = state.dog;
  if (e.kind === 'dragon' || dog.mode !== 'free' || e.startled > 0 || e.timer > 0) return;
  const d = dist(e.x, e.z, dog.x, dog.z);
  if (e.kind === 'goblin' && d < T.goblin.swatRange) {
    e.timer = T.goblin.swatEvery;
    hurtDog(state, 1, events);
  } else if (e.kind === 'bugs' && d < ENEMIES.bugs.radius + DOGS[dog.kind].radius + 0.1) {
    e.timer = T.bugs.stingEvery;
    hurtDog(state, 1, events);
  }
}

function dragonFire(state: RunState, e: Enemy, events: GameEvent[]): void {
  e.fireClock -= DT;
  if (e.fireClock > 0) return;
  e.fireClock = T.dragon.fireEvery;
  const dog = state.dog;
  const rng = createRng(deriveSeed(state.seed, 'fire', e.id, Math.round(state.time * 60)));
  // Aimed where the dog stands (or near the cottage while it's home), more as the dragon tires.
  const aimX = dog.mode === 'free' ? dog.x : T.cottage.x + (rng.next() - 0.5) * 4;
  const aimZ = dog.mode === 'free' ? dog.z : T.cottage.z + 2 + rng.next() * 2;
  const extra = Math.floor((e.maxCourage - e.courage) / T.dragon.extraFirePerPips);
  const spots: [number, number][] = [[aimX, aimZ]];
  for (let k = 0; k < extra; k++) {
    const a = rng.next() * Math.PI * 2;
    const r = 1.8 + rng.next() * 1.2;
    spots.push([aimX + Math.sin(a) * r, aimZ + Math.cos(a) * r]);
  }
  for (const [x, z] of spots) {
    const fire = {
      id: state.nextId++,
      x,
      z,
      radius: T.dragon.fireRadius,
      warn: T.dragon.fireWarn,
      warnTotal: T.dragon.fireWarn,
    };
    state.fires.push(fire);
    events.push({ type: 'fireWarn', id: fire.id });
  }
}

function stepFires(state: RunState, events: GameEvent[]): void {
  const dog = state.dog;
  state.fires = state.fires.filter((f) => {
    f.warn -= DT;
    if (f.warn > 0) return true;
    const hit = dog.mode === 'free' && dist(f.x, f.z, dog.x, dog.z) < f.radius;
    events.push({ type: 'fireLand', id: f.id, x: f.x, z: f.z, hit });
    if (hit) hurtDog(state, T.dragon.fireDamage, events);
    return false;
  });
}

function hurtDog(state: RunState, damage: number, events: GameEvent[]): void {
  const dog = state.dog;
  if (dog.mode !== 'free' || dog.safe > 0 || dog.dashTime > 0 || state.outcome !== 'playing')
    return;
  dog.hearts = Math.max(0, dog.hearts - damage);
  dog.safe = T.hurtSafety;
  events.push({ type: 'dogHurt', damage, hearts: dog.hearts });
  if (dog.hearts === 0) {
    dog.mode = 'pooped';
    dog.held = null;
    events.push({ type: 'pooped' });
  }
}

/** Enemies don't stack up on top of each other (the dragon shoves; nobody shoves it). */
function separate(state: RunState): void {
  const list = state.enemies;
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (!a || !b) continue;
      const min = ENEMIES[a.kind].radius + ENEMIES[b.kind].radius;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d >= min || d === 0) continue;
      const push = (min - d) / 2;
      const wa = a.kind === 'dragon' ? 0 : b.kind === 'dragon' ? 2 : 1;
      const wb = b.kind === 'dragon' ? 0 : a.kind === 'dragon' ? 2 : 1;
      a.x -= (dx / d) * push * wa;
      a.z -= (dz / d) * push * wa;
      b.x += (dx / d) * push * wb;
      b.z += (dz / d) * push * wb;
    }
}

function pushOut(p: { x: number; z: number }, cx: number, cz: number, r: number): void {
  const dx = p.x - cx;
  const dz = p.z - cz;
  const d = Math.hypot(dx, dz);
  if (d >= r || d === 0) return;
  p.x = cx + (dx / d) * r;
  p.z = cz + (dz / d) * r;
}

function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

/** The signed smallest turn from b to a. */
function angleDiff(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function turnToward(from: number, to: number, maxStep: number): number {
  const d = angleDiff(to, from);
  return from + Math.max(-maxStep, Math.min(maxStep, d));
}
