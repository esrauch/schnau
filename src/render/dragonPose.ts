/**
 * The dragon's only animation: its wings flap (slow and lazy; bigger and
 * quicker as it rears up to breathe fire; frantic in a panic), and it rears
 * back before breathing. Shared by the game (render/actors.ts) and the model
 * viewer, so they always match.
 */
import type { Rig } from '../voxel/models';

/**
 * Pose the dragon's rig at `time` seconds. `rear` (0..1) is how far it's
 * reared up to breathe fire; `panic` makes it flap for its life.
 */
export function poseDragon(rig: Rig, time: number, rear: number, panic: boolean): void {
  const body = rig.parts.get('body');
  if (body) body.rotation.x = -rear * 0.25;
  const flap = (panic ? 0.65 : 0.4 + rear * 0.25) * Math.sin(time * (panic ? 12 : 5 + rear * 3));
  const right = rig.parts.get('wingRight');
  const left = rig.parts.get('wingLeft');
  // The wings rest a little raised; a flap swings both up and down together.
  if (right) right.rotation.z = -(0.15 + flap);
  if (left) left.rotation.z = 0.15 + flap;
}
