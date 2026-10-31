import { describe, expect, it } from 'vitest';
import { DOGS, ENEMIES, WAVES, gameTuning as T } from '../../src/content/gameTuning';
import {
  DT,
  NO_INPUT,
  createRun,
  spawnEnemy,
  step,
  type GameEvent,
  type RunState,
  type StepInput,
} from '../../src/sim/run';

/** A run with the waves switched off, so a test sets up exactly what it needs. */
function quietRun(dog: 'schnauzer' | 'spitz' = 'schnauzer'): RunState {
  const state = createRun(1, dog);
  WAVES.forEach((w, i) => (state.spawned[i] = w.count));
  return state;
}

function run(state: RunState, seconds: number, input: StepInput = NO_INPUT): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) events.push(...step(state, input));
  return events;
}

/** Press the woof button for `seconds`, then let go. */
function bark(state: RunState, seconds: number): GameEvent[] {
  return [...run(state, seconds, { ...NO_INPUT, woof: true }), ...run(state, DT)];
}

describe('the run', () => {
  it('plays out the same from the same seed and inputs', () => {
    const a = createRun(42);
    const b = createRun(42);
    const input = { moveX: 0.6, moveZ: -0.8, dash: false, woof: false };
    run(a, 40, input);
    run(b, 40, input);
    expect(a).toEqual(b);
    expect(a.enemies.length).toBeGreaterThan(0);
  });

  it('stays sane through a whole idle run (no NaNs), which the goblins eventually win', () => {
    const state = createRun(7);
    let events: GameEvent[] = [];
    for (let t = 0; t < 400 && state.outcome === 'playing'; t += 1) events = run(state, 1);
    const numbers = [state.dog.x, state.dog.z, ...state.enemies.flatMap((e) => [e.x, e.z])];
    expect(numbers.every(Number.isFinite)).toBe(true);
    expect(state.outcome).toBe('lost');
    expect(events.some((e) => e.type === 'lost')).toBe(true);
  });
});

describe('goblins', () => {
  it('walk to the pen, grab a sheep and get away with it', () => {
    const state = quietRun();
    state.dog.x = -6; // well out of the way
    spawnEnemy(state, 'goblin', 0, 6);
    const events = run(state, 20);
    expect(events.some((e) => e.type === 'grab')).toBe(true);
    expect(events.some((e) => e.type === 'stolen')).toBe(true);
    expect(state.sheep).toBe(T.sheep - 1);
    expect(state.enemies).toHaveLength(0);
  });

  it('drop the sheep when yipped at, and the dog sends it home', () => {
    const state = quietRun();
    const goblin = spawnEnemy(state, 'goblin', 0, -3);
    goblin.carrying = true;
    goblin.mode = 'leave';
    state.sheep--;
    state.dog.x = 0;
    state.dog.z = -5.5;
    state.dog.facing = 0; // facing +z, toward the goblin
    const events = bark(state, 0.05);
    expect(events.some((e) => e.type === 'yip' && e.target === goblin.id)).toBe(true);
    expect(events.some((e) => e.type === 'dropped')).toBe(true);
    expect(goblin.carrying).toBe(false);
    expect(goblin.courage).toBe(ENEMIES.goblin.courage - 1);
    // Trot over to the loose sheep.
    const sheep = state.looseSheep[0]!;
    state.dog.x = sheep.x;
    state.dog.z = sheep.z;
    expect(run(state, DT).some((e) => e.type === 'returned')).toBe(true);
    expect(state.sheep).toBe(T.sheep);
    expect(state.looseSheep).toHaveLength(0);
  });

  it('panic and drop a bone once their courage runs out', () => {
    const state = quietRun();
    const goblin = spawnEnemy(state, 'goblin', 0, 2.5);
    state.dog.x = 0;
    state.dog.z = 4;
    state.dog.facing = Math.PI;
    bark(state, 0.05);
    run(state, 0.5);
    const events = bark(state, 0.05);
    expect(events.some((e) => e.type === 'panic' && e.id === goblin.id)).toBe(true);
    expect(state.bones).toBe(1);
  });
});

describe('the WOOF', () => {
  it('is a hold: a tap yips, a long hold WOOFs at full charge', () => {
    const state = quietRun();
    expect(bark(state, 0.05).some((e) => e.type === 'yip')).toBe(true);
    const events = bark(state, 1.5);
    const woof = events.find((e) => e.type === 'woof');
    expect(woof).toMatchObject({ charge: 1, radius: DOGS.schnauzer.woof.radius[1] });
    expect(events.some((e) => e.type === 'yip')).toBe(false);
  });

  it('scatters a whole bug cloud that a yip would take one at a time', () => {
    const state = quietRun();
    state.dog.x = 0;
    state.dog.z = 4;
    state.dog.safe = 5; // the cloud would sting it pooped while it charges
    for (let k = 0; k < 5; k++) spawnEnemy(state, 'bugs', -0.8 + k * 0.4, 5);
    const events = bark(state, 1.5);
    expect(events.filter((e) => e.type === 'panic')).toHaveLength(5);
  });

  it('slows the dog while it charges', () => {
    const state = quietRun();
    state.dog.x = 0;
    state.dog.z = 4;
    run(state, 0.5, { ...NO_INPUT, moveX: 1, woof: true });
    expect(state.dog.vx).toBeCloseTo(DOGS.schnauzer.speed * DOGS.schnauzer.woof.chargeSlow);
  });
});

describe('the dog', () => {
  it('gets pooped at no hearts, trots home on its own, and comes back fresh', () => {
    const state = quietRun();
    state.dog.x = 4;
    state.dog.z = 4;
    state.dog.hearts = 1;
    spawnEnemy(state, 'goblin', 4.3, 4);
    const hurt = run(state, 0.2);
    expect(hurt.some((e) => e.type === 'pooped')).toBe(true);
    // It ignores the stick while it goes home, all the way inside, and rests there...
    let restored = false;
    let restedInside = false;
    for (let t = 0; t < 8 && !restored; t += DT) {
      restored = step(state, { ...NO_INPUT, moveX: 1 }).some((e) => e.type === 'restored');
      if (state.dog.mode === 'resting') {
        restedInside = state.dog.x === T.doghouse.x && state.dog.z === T.doghouse.z;
      }
    }
    expect(restedInside).toBe(true);
    // ...then comes back out of the door (in front of it, facing the yard).
    expect(restored).toBe(true);
    expect(state.dog.z).toBeGreaterThan(T.doghouse.z + T.doghouse.radius);
    expect(state.dog.facing).toBe(0);
    expect(state.dog.hearts).toBe(DOGS.schnauzer.hearts);
    expect(Math.hypot(state.dog.x - T.doghouse.x, state.dog.z - T.doghouse.z)).toBeLessThan(1.5);
  });

  it("can't be hurt mid-dash", () => {
    const state = quietRun();
    state.dog.x = 4;
    state.dog.z = 4;
    state.fires.push({ id: 99, x: 4, z: 4, radius: 1.3, warn: DT, warnTotal: 1 });
    state.dog.dashTime = 0.2;
    const events = run(state, DT);
    expect(events.some((e) => e.type === 'fireLand' && e.hit)).toBe(true);
    expect(state.dog.hearts).toBe(DOGS.schnauzer.hearts);
  });
});

describe('the dragon', () => {
  it('warns with a circle where the dog stands, which burns if the dog stays put', () => {
    const state = quietRun();
    state.dog.x = 3;
    state.dog.z = 3;
    spawnEnemy(state, 'dragon', 0, 9);
    const events = run(state, T.dragon.fireEvery + T.dragon.fireWarn + 0.1);
    expect(events.some((e) => e.type === 'fireWarn')).toBe(true);
    expect(events.some((e) => e.type === 'fireLand' && e.hit)).toBe(true);
    expect(state.dog.hearts).toBe(DOGS.schnauzer.hearts - T.dragon.fireDamage);
  });

  it('wins the run when scared off, and everyone else flees with it', () => {
    const state = quietRun();
    const dragon = spawnEnemy(state, 'dragon', 0, 4);
    spawnEnemy(state, 'goblin', -3, 3);
    dragon.courage = 1;
    state.dog.x = 0;
    state.dog.z = 6;
    state.dog.facing = Math.PI;
    const events = bark(state, 0.05);
    expect(events.some((e) => e.type === 'won')).toBe(true);
    expect(state.outcome).toBe('won');
    expect(state.enemies.every((e) => e.mode === 'panic')).toBe(true);
  });
});

describe('the sheep', () => {
  it('bolt from the pen when bugs pester it, wander off, and are lost in the woods', () => {
    const state = quietRun();
    state.dog.x = 6; // far off
    state.dog.z = 4;
    spawnEnemy(state, 'bugs', T.pen.x, T.pen.z - T.pen.radius - 0.4);
    const bolted = run(state, T.bugs.pesterTime + 1.5);
    expect(bolted.some((e) => e.type === 'bolted')).toBe(true);
    expect(state.sheep).toBeLessThan(T.sheep);
    // Nobody fetches it: it wanders into the woods.
    state.enemies = [];
    const lost = run(state, 60);
    expect(lost.some((e) => e.type === 'strayed')).toBe(true);
  });

  it('get snatched by the dragon at the pen, for good', () => {
    const state = quietRun();
    state.dog.x = 6;
    state.dog.z = 4;
    spawnEnemy(state, 'dragon', T.pen.x, T.pen.z - T.pen.radius - 1.2);
    const events = run(state, T.dragon.snatchTime + 1);
    expect(events.some((e) => e.type === 'snatched')).toBe(true);
    expect(state.looseSheep).toHaveLength(0);
  });
});

describe('the trees', () => {
  it('stop the dog walking through them', () => {
    const state = quietRun();
    const tree = T.trees[0]!;
    state.dog.x = tree.x - 2;
    state.dog.z = tree.z;
    run(state, 3, { ...NO_INPUT, moveX: 1 });
    expect(Math.hypot(state.dog.x - tree.x, state.dog.z - tree.z)).toBeGreaterThanOrEqual(
      tree.radius + DOGS.schnauzer.radius - 1e-6,
    );
  });
});
