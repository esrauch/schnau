/**
 * Fails if any asset file lacks a manifest entry or uses a license we haven't
 * approved (TECHNICAL.md §14). Runs as part of `npm run build`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const MANIFEST = join(ROOT, 'assets', 'manifest.json');
const SCANNED_DIRS = ['assets', 'assets-src'];
const IGNORED_FILES = new Set(['manifest.json', '.gitkeep']);

const ALLOWED_LICENSES = new Set(['original', 'CC0-1.0', 'public-domain', 'OFL-1.1']);

interface AssetEntry {
  path: string;
  source: string;
  author: string;
  license: string;
  url?: string;
  changes?: string;
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else if (!IGNORED_FILES.has(name)) out.push(relative(ROOT, full));
  }
  return out;
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { assets: AssetEntry[] };
const entries = new Map(manifest.assets.map((a) => [a.path, a]));
const errors: string[] = [];

for (const file of SCANNED_DIRS.flatMap((d) => listFiles(join(ROOT, d)))) {
  const entry = entries.get(file);
  if (!entry) errors.push(`${file}: no manifest entry`);
  else if (!ALLOWED_LICENSES.has(entry.license))
    errors.push(`${file}: license "${entry.license}" is not on the allowed list`);
}

for (const entry of manifest.assets) {
  for (const field of ['source', 'author', 'license'] as const) {
    if (!entry[field]) errors.push(`${entry.path}: manifest entry is missing "${field}"`);
  }
}

if (errors.length > 0) {
  console.error(`check-assets: ${errors.length} problem(s)\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-assets: ${manifest.assets.length} asset(s) OK`);
