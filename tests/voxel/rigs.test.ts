import { describe, expect, it } from 'vitest';
import { buildRig } from '../../src/voxel/models';

/** The parts the animation code turns, by model (render/dogAnimator.ts, render/actors.ts). */
const RIGS: Record<string, string[]> = {
  'hero/blackSchnauzer': [
    'body',
    'head',
    'tail',
    'legFrontLeft',
    'legFrontRight',
    'legBackLeft',
    'legBackRight',
  ],
  'hero/spitz': [
    'body',
    'head',
    'tail',
    'legFrontLeft',
    'legFrontRight',
    'legBackLeft',
    'legBackRight',
  ],
  'enemies/dragon': ['body', 'wingLeft', 'wingRight'],
};

describe('rigged models', () => {
  for (const [id, parts] of Object.entries(RIGS)) {
    it(`${id} has every part its animation turns, each with a mesh`, () => {
      const rig = buildRig(id);
      expect([...rig.parts.keys()].sort()).toEqual([...parts].sort());
      expect(rig.meshes).toHaveLength(parts.length);
      for (const mesh of rig.meshes)
        expect(mesh.geometry.getAttribute('position').count).toBeGreaterThan(0);
    });
  }

  it("parents the dragon's wings to its body, so they move with it", () => {
    const rig = buildRig('enemies/dragon');
    expect(rig.parts.get('wingLeft')?.parent).toBe(rig.parts.get('body'));
  });
});
