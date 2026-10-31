/**
 * Screenshot the game at phone size, headlessly, to check how it looks
 * without a phone in hand.
 *
 *   npm run screenshot                    → previews/game.png (seed 8)
 *   npm run screenshot -- 3 foo=1 name    → seed 3, extra URL params, saved as previews/name.png
 *   TAP=250 npm run screenshot            → tap the middle of the screen, then capture 250 ms later
 *   WAIT=8000 npm run screenshot          → let it run 8 s before capturing (default 1.5 s)
 *   KEY=Space HOLD=700 npm run screenshot → hold a key 700 ms: captures <name>-hold.png while it's
 *                                           down, then <name>.png just after letting go
 *
 * Uses the system Chrome through playwright-core.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const ROOT = join(import.meta.dirname, '..');
const [seed = '8', extraQuery = '', name = 'game'] = process.argv.slice(2);

const server = await createServer({ root: ROOT, server: { port: 0 }, logLevel: 'error' });
await server.listen();
const address = server.httpServer?.address();
const port = typeof address === 'object' && address ? address.port : 5173;
const browser = await chromium.launch({
  channel: 'chrome',
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
try {
  const page = await browser.newPage({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
  });
  page.on('pageerror', (e) => console.error(`page error: ${e.message}`));
  await page.goto(`http://localhost:${port}/?seed=${seed}${extraQuery ? `&${extraQuery}` : ''}`);
  await page.waitForTimeout(Number(process.env.WAIT ?? 1500));
  if (process.env.TAP) {
    await page.mouse.click(187, 400);
    await page.waitForTimeout(Number(process.env.TAP));
  }
  mkdirSync(join(ROOT, 'previews'), { recursive: true });
  if (process.env.KEY) {
    await page.keyboard.down(process.env.KEY);
    await page.waitForTimeout(Number(process.env.HOLD ?? 100));
    await page.screenshot({ path: join(ROOT, 'previews', `${name}-hold.png`) });
    await page.keyboard.up(process.env.KEY);
    await page.waitForTimeout(120);
  }
  const file = join(ROOT, 'previews', `${name}.png`);
  await page.screenshot({ path: file });
  console.log(file.replace(`${ROOT}/`, ''));
} finally {
  await browser.close();
  await server.close();
}
