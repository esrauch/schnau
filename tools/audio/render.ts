/**
 * Render songs, stems and sound effects to WAV files plus waveform images,
 * and report their levels, so audio can be checked without listening
 * (TECHNICAL.md §13). A human still listens before anything ships.
 *
 *   npm run render-audio                     the full mix of every song, and every sfx
 *   npm run render-audio -- song:hollowHop stem:hollowHop/theremin sfx:chant
 *
 * Writes previews/audio/<name>.wav and .png. Uses the system Chrome through
 * playwright-core (OfflineAudioContext only exists in browsers).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { SFX } from '../../src/audio/sfx';
import { SONGS } from '../../src/audio/songs';

const ROOT = join(import.meta.dirname, '..', '..');
const OUT = join(ROOT, 'previews', 'audio');

interface Result {
  wav: string;
  seconds: number;
  peakDb: number;
  rmsDb: number;
  seam: number | null;
  maxStep: number;
}

const targets =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : [...SONGS.map((s) => `song:${s.id}`), ...Object.keys(SFX).map((id) => `sfx:${id}`)];

const server = await createServer({ root: ROOT, server: { port: 0 }, logLevel: 'error' });
await server.listen();
const address = server.httpServer?.address();
const port = typeof address === 'object' && address ? address.port : 5173;
const browser = await chromium.launch({ channel: 'chrome' });
mkdirSync(OUT, { recursive: true });

try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 220 } });
  page.on('pageerror', (e) => console.error(`page error: ${e.message}`));
  for (const target of targets) {
    const [mode, id] = target.split(':') as [string, string];
    await page.goto(
      `http://localhost:${port}/dev/audio.html?render=${mode}&id=${encodeURIComponent(id)}`,
    );
    await page.waitForFunction(() => '__result' in window, undefined, { timeout: 60_000 });
    const r = await page.evaluate(() => (window as unknown as { __result: Result }).__result);
    const name = `${mode}-${id.replaceAll('/', '-')}`;
    writeFileSync(join(OUT, `${name}.wav`), Buffer.from(r.wav, 'base64'));
    await page.locator('#wave').screenshot({ path: join(OUT, `${name}.png`) });
    const seam =
      r.seam === null
        ? ''
        : ` · loop seam jump ${r.seam.toFixed(4)} (largest step inside: ${r.maxStep.toFixed(4)})`;
    const warn = r.peakDb > -0.5 ? '  ⚠ near clipping' : '';
    console.log(
      `${name}: ${r.seconds.toFixed(2)}s · peak ${r.peakDb.toFixed(1)} dBFS · RMS ${r.rmsDb.toFixed(1)} dBFS${seam}${warn}`,
    );
  }
} finally {
  await browser.close();
  await server.close();
}
