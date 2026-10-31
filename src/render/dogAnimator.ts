/**
 * Procedural animation for the hero dogs' rigs (voxel parts: body, head,
 * tail, four legs). Nothing is keyframed: every pose is a few sines layered
 * on the rest pose, so it costs nothing and blends freely.
 *
 * - Idle: breathing, a lazy tail wag, glancing about, now and then a head tilt.
 * - Trot (`speed` 0..1): diagonal leg pairs swing, the body bobs twice a
 *   stride and rolls side to side (the waddle), the head bobs, the tail wags faster.
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
}

export const DOG_STYLES = {
  /** Square and determined: a steady trot, a big waddle, a planted bark. */
  schnauzer: {
    strideRate: 3,
    legSwing: 0.6,
    bob: 0.025,
    waddle: 0.09,
    barkHop: 0,
    wagSpeed: 1,
    wagSize: 1,
  },
  /** Light and bouncy: quick little steps, and a hop on every yip. */
  spitz: {
    strideRate: 3.8,
    legSwing: 0.55,
    bob: 0.035,
    waddle: 0.06,
    barkHop: 0.06,
    wagSpeed: 0.55,
    wagSize: 0.6,
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

const LEGS = [
  // Diagonal pairs move together: front-left with back-right, and the other two half a stride later.
  ['legFrontLeft', 0],
  ['legBackRight', 0],
  ['legFrontRight', Math.PI],
  ['legBackLeft', Math.PI],
] as const;

interface Rest {
  readonly position: THREE.Vector3;
  readonly rotation: THREE.Euler;
  readonly scale: THREE.Vector3;
}

export class DogAnimator {
  /** 0 standing, 1 full trot. Set it every frame from how fast the dog is moving. */
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
    const s = Math.min(1, Math.max(0, this.speed));
    // Strides slow down with the dog, but never quite stop mid-step.
    this.stride +=
      dt * Math.PI * 2 * this.style.strideRate * (0.45 + 0.55 * s) * Math.min(1, s * 4);

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
    for (const [name, offset] of LEGS) {
      const leg = this.part(name);
      leg.rotation.x += -this.style.legSwing * s * Math.sin(p + offset);
      // Lift the foot as it swings forward.
      leg.position.y += 0.02 * s * Math.max(0, Math.cos(p + offset));
    }
    body.position.y += this.style.bob * s * (1 - Math.cos(2 * p)) * 0.5;
    body.rotation.z += this.style.waddle * s * Math.sin(p);
    head.rotation.x += 0.07 * s * Math.sin(2 * p + 0.8);
    head.rotation.z -= this.style.waddle * 0.6 * s * Math.sin(p);

    // Tail: a lazy wag at rest, a little quicker on the move, happier after a bark.
    // The wag's phase is integrated (not time × rate), so speeding up never makes it jump.
    const excited = Math.max(0, 1 - this.sinceBark / 1.6);
    this.wag += dt * (4 + 3 * s + 4 * excited) * this.style.wagSpeed;
    const wagSize = (0.2 + 0.08 * s + 0.15 * excited) * this.style.wagSize;
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
