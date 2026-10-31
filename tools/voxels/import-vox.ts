/**
 * Convert a MagicaVoxel .vox file into a .voxt model.
 *
 *   npm run import-vox -- path/to/model.vox props/tree [voxelSize]
 *
 * Writes assets-src/voxels/<id>.voxt. Remember to add the source and license
 * to assets/manifest.json (check-assets will remind you).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parseVox, voxToVoxt } from '../../src/voxel/vox';
import { parseVoxt } from '../../src/voxel/voxt';

const [input, id, scaleArg] = process.argv.slice(2);
if (!input || !id) {
  console.error('usage: npm run import-vox -- <file.vox> <model id> [voxel size]');
  process.exit(1);
}

const text = voxToVoxt(
  parseVox(new Uint8Array(readFileSync(input))),
  basename(input),
  Number(scaleArg) || 0.1,
);
parseVoxt(id, text); // make sure the result is valid before writing it
const out = join(import.meta.dirname, '..', '..', 'assets-src', 'voxels', `${id}.voxt`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, text);
console.log(`wrote ${out}\nAdd it to assets/manifest.json with its source and license.`);
