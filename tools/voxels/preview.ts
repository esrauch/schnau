/**
 * Render voxel models to PNGs headlessly, so they can be looked at without
 * running the game (TECHNICAL.md §6).
 *
 *   npm run preview-models              every model, plus a contact sheet per folder
 *   npm run preview-models -- props/crate   just these models
 *   npm run preview-models -- --close hero/x   big front, ¾, side and ¾-back views → previews/<id>-close.png
 *
 * Writes previews/<id>.png (front, ¾ and side) and previews/sheet-<folder>.png.
 * Uses the system Chrome through playwright-core, so no browser download is needed.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const ROOT = join(import.meta.dirname, '..', '..');
const OUT = join(ROOT, 'previews');

const server = await createServer({ root: ROOT, server: { port: 0 }, logLevel: 'error' });
await server.listen();
const address = server.httpServer?.address();
const port = typeof address === 'object' && address ? address.port : 5173;
const base = `http://localhost:${port}`;

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
  page.on('pageerror', (e) => console.error(`page error: ${e.message}`));

  // Ask the page which models exist (it reads them through Vite, like the game does).
  await page.goto(`${base}/dev/models.html`);
  const allIds = await page.evaluate(() =>
    [...document.querySelectorAll('#list button')].map((b) => b.textContent ?? ''),
  );
  const args = process.argv.slice(2);
  const close = args.includes('--close');
  const wanted = args.filter((a) => a !== '--close');
  const ids = wanted.length > 0 ? wanted : allIds;
  mkdirSync(OUT, { recursive: true });

  const shoot = async (query: string, file: string): Promise<void> => {
    await page.goto(`${base}/dev/models.html?${query}`);
    await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
    await page.locator('#view').screenshot({ path: join(OUT, file) });
    console.log(`previews/${file}`);
  };

  for (const id of ids) {
    const name = id.replaceAll('/', '-');
    if (close) await shoot(`render=closeup&model=${encodeURIComponent(id)}`, `${name}-close.png`);
    else await shoot(`render=turntable&model=${encodeURIComponent(id)}`, `${name}.png`);
  }
  if (wanted.length === 0 && !close) {
    const groups = [
      ...new Set(allIds.filter((id) => id.includes('/')).map((id) => id.split('/')[0])),
    ];
    for (const group of groups) await shoot(`render=sheet&group=${group}`, `sheet-${group}.png`);
  }
} finally {
  await browser.close();
  await server.close();
}
