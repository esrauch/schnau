/**
 * Procedural animation for the hero dogs' rigs (voxel parts: body, head,
 * tail, four legs). Nothing is keyframed: every pose is a few sines layered
 * on the rest pose, so it costs nothing and blends freely.
 *
 * - Idle: breathing, a lazy tail wag, glancing about, now and then a head tilt.
 * - Trot (`speed` 0..1): diagonal leg pairs swing, the body bobs twice a
 *   stride and rolls side to side (the waddle), the head bobs, the tail wags faster.
 * - Gallop (`speed` 1..2, blending in from the trot): a cartoon bound. Both
 *   back legs drive together, then both front legs reach together, so the
 *   dog bunches up and stretches out; the body rocks like a rocking horse; at
 *   full stretch all four feet leave the ground; the head counter-rocks to
 *   stay level and the tail streams out behind.
 * - Bark: a wind-up (head dips, body squashes), the bark (head tosses up,
 *   body stretches, maybe a hop), then a settle, with an excited wag after.
 *
 * Signs: the dog faces +z. A part's rotation.x > 0 tips its +z end down
 * (a nose down, a foot back); rotation.z > 0 swings a raised tail to the
 * dog's right (−x).
 */
import type * as THREE from 'three';
import type { Rig } from '../voxel/models';

export interface DogStyle {
  /** Strides a second at full trot. */
  readonly strideRate: number;
  /** How far the legs swing (radians) at full trot. */
  readonly legSwing: number;
  /** Body bob height (world units) at full trot. */
  readonly bob: number;
  /** Side-to-side roll (radians) at full trot. */
  readonly waddle: number;
  /** How high the whole dog hops when it barks (world units); 0 for no hop. */
  readonly barkHop: number;
  /** Tail wag speed and size, as multiples of the base wag (a big plume wants slow, small swings). */
  readonly wagSpeed: number;
  readonly wagSize: number;
  /** Gallop strides a second, how far its legs reach (radians), how far the body rocks, and how high it flies. */
  readonly gallopRate: number;
  readonly gallopReach: number;
  readonly gallopRock: number;
  readonly gallopHop: number;
}

export const DOG_STYLES = {
  /** Square and determined: a steady trot, a big waddle, a planted bark. */
  schnauzer: {
    strideRate: 2.3,
    legSwing: 0.45,
    bob: 0.016,
    waddle: 0.06,
    barkHop: 0,
    wagSpeed: 1,
    wagSize: 1,
    gallopRate: 2.8,
    gallopReach: 0.85,
    gallopRock: 0.13,
    gallopHop: 0.05,
  },
  /** Light and bouncy: quick little steps, and a hop on every yip. */
  spitz: {
    strideRate: 2.7,
    legSwing: 0.42,
    bob: 0.022,
    waddle: 0.045,
    barkHop: 0.06,
    wagSpeed: 0.55,
    wagSize: 0.6,
    gallopRate: 3.3,
    gallopReach: 0.8,
    gallopRock: 0.11,
    gallopHop: 0.07,
  },
} as const satisfies Record<string, DogStyle>;

/** Each rigged dog model's style. */
export const DOG_STYLE_FOR_MODEL: Readonly<Record<string, DogStyle>> = {
  'hero/blackSchnauzer': DOG_STYLES.schnauzer,
  'hero/spitz': DOG_STYLES.spitz,
};

/** How long a bark takes, in seconds: wind-up, toss, settle. */
const BARK = { windUp: 0.08, toss: 0.12, settle: 0.3 };
const BARK_LENGTH = BARK.windUp + BARK.toss + BARK.settle;

/** Each leg's phase in the trot and in the gallop (radians of the stride). */
const LEGS = [
  // Trot: diagonal pairs move together. Gallop: the backs together, the fronts together
  // half a stride later, each pair a touch apart so the feet land one-two.
  ['legFrontLeft', 0, Math.PI],
  ['legBackRight', 0, 0.25],
  ['legFrontRight', Math.PI, Math.PI + 0.3],
  ['legBackLeft', Math.PI, 0],
] as const;

interface Rest {
  readonly position: THREE.Vector3;
  readonly rotation: THREE.Euler;
  readonly scale: THREE.Vector3;
}

export class DogAnimator {
  /** 0 standing, 1 full trot, 2 full gallop. Set it every frame from how fast the dog is moving. */
  speed = 0;
  private time = 0;
  private stride = 0;
  /** The tail wag's phase. */
  private wag = 0;
  /** Seconds since the last bark began, or Infinity. */
  private sinceBark = Infinity;
  private readonly rest = new Map<THREE.Object3D, Rest>();
  private readonly rootRestY: number;

  constructor(
    private readonly rig: Rig,
    private readonly style: DogStyle,
    /** Offsets this dog's idle so two dogs don't move in step. */
    private readonly seed = 0,
  ) {
    for (const part of rig.parts.values()) {
      this.rest.set(part, {
        position: part.position.clone(),
        rotation: part.rotation.clone(),
        scale: part.scale.clone(),
      });
    }
    this.rootRestY = rig.root.position.y;
  }

  bark(): void {
    this.sinceBark = 0;
  }

  get barking(): boolean {
    return this.sinceBark < BARK_LENGTH;
  }

  update(dt: number): void {
    this.time += dt;
    this.sinceBark += dt;
    const t = this.time + this.seed * 7.3;
    /** How much the dog is moving (0..1), and how much of that is gallop rather than trot. */
    const s = Math.min(1, Math.max(0, this.speed));
    const g = Math.min(1, Math.max(0, this.speed - 1));
    const trot = s * (1 - g);
    // Strides slow down with the dog, but never quite stop mid-step.
    const rate = this.style.strideRate + (this.style.gallopRate - this.style.strideRate) * g;
    this.stride += dt * Math.PI * 2 * rate * (0.45 + 0.55 * s) * Math.min(1, s * 4);

    for (const [part, rest] of this.rest) {
      part.position.copy(rest.position);
      part.rotation.copy(rest.rotation);
      part.scale.copy(rest.scale);
    }
    const body = this.part('body');
    const head = this.part('head');
    const tail = this.part('tail');

    // Breathing.
    const breath = Math.sin(t * 2.4) * 0.012;
    body.scale.y *= 1 + breath;
    body.scale.x *= 1 - breath * 0.5;

    // Idle head: glancing about, now and then a curious tilt (fading out as the dog trots).
    const calm = 1 - s;
    head.rotation.y += calm * 0.28 * Math.sin(t * 0.55) * Math.sin(t * 0.23 + 1.3);
    head.rotation.z += calm * 0.22 * Math.max(0, Math.sin(t * 0.37 + 2)) ** 4;
    head.rotation.x += calm * 0.05 * Math.sin(t * 0.8);

    // Trot.
    const p = this.stride;
    for (const [name, trotPhase, gallopPhase] of LEGS) {
      const leg = this.part(name);
      leg.rotation.x += -this.style.legSwing * trot * Math.sin(p + trotPhase);
      leg.rotation.x += -this.style.gallopReach * g * Math.sin(p + gallopPhase);
      // Lift the foot as it swings forward.
      leg.position.y += 0.02 * trot * Math.max(0, Math.cos(p + trotPhase));
      leg.position.y += 0.03 * g * Math.max(0, Math.cos(p + gallopPhase));
    }
    body.position.y += this.style.bob * trot * (1 - Math.cos(2 * p)) * 0.5;
    body.rotation.z += this.style.waddle * trot * Math.sin(p);
    head.rotation.x += 0.035 * trot * Math.sin(2 * p + 0.8);
    head.rotation.z -= this.style.waddle * 0.4 * trot * Math.sin(p);

    // Gallop. At sin(p) = 1 the dog is bunched (backs forward under it, fronts back);
    // at sin(p) = −1 it's stretched out (backs behind, fronts reaching) and flying.
    const rock = this.style.gallopRock * g * Math.cos(p);
    body.rotation.x += rock;
    head.rotation.x -= rock * 0.8;
    const flight = g * Math.max(0, -Math.sin(p)) ** 1.5;
    tail.rotation.x -= 0.5 * g;
    tail.rotation.x += 0.12 * g * Math.sin(p);

    // Tail: a lazy wag at rest, a little quicker on the move, happier after a bark.
    // The wag's phase is integrated (not time × rate), so speeding up never makes it jump.
    const excited = Math.max(0, 1 - this.sinceBark / 1.6);
    this.wag += dt * (4 + 3 * s + 4 * excited) * this.style.wagSpeed;
    // Streaming out behind in a gallop, the tail only flutters.
    const wagSize = (0.2 + 0.08 * s + 0.15 * excited) * this.style.wagSize * (1 - 0.6 * g);
    tail.rotation.z += wagSize * Math.sin(this.wag + this.seed);

    // Bark.
    if (this.barking) {
      const { pitch, squash, hop } = barkPose(this.sinceBark);
      head.rotation.x += pitch;
      body.scale.y *= 1 + squash;
      body.scale.x *= 1 - squash * 0.5;
      body.scale.z *= 1 - squash * 0.5;
      this.rig.root.position.y = this.rootRestY + hop * this.style.barkHop;
    } else {
      this.rig.root.position.y = this.rootRestY;
    }
    this.rig.root.position.y += flight * this.style.gallopHop;
  }

  private part(name: string): THREE.Object3D {
    const part = this.rig.parts.get(name);
    if (!part) throw new Error(`The dog rig has no "${name}" part`);
    return part;
  }
}

/**
 * The bark's pose at `time` seconds in: head pitch (radians, negative = nose
 * up), body squash (negative squashes, positive stretches) and hop (0..1).
 */
export function barkPose(time: number): { pitch: number; squash: number; hop: number } {
  const { windUp, toss, settle } = BARK;
  if (time < 0 || time >= BARK_LENGTH) return { pitch: 0, squash: 0, hop: 0 };
  if (time < windUp) {
    const k = ease(time / windUp);
    return { pitch: 0.18 * k, squash: -0.07 * k, hop: 0 };
  }
  if (time < windUp + toss) {
    const k = ease((time - windUp) / toss);
    return {
      pitch: 0.18 + (-0.42 - 0.18) * k,
      squash: -0.07 + (0.08 + 0.07) * k,
      hop: Math.sin(k * Math.PI),
    };
  }
  const k = ease((time - windUp - toss) / settle);
  return { pitch: -0.42 * (1 - k), squash: 0.08 * (1 - k), hop: 0 };
}

/** Smooth in and out. */
function ease(k: number): number {
  return k * k * (3 - 2 * k);
}
