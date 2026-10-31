import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works from any subpath (e.g. GitHub Pages /schnau/).
  base: './',
  build: {
    target: 'es2022',
    // three.js alone is ~520 kB minified (~130 kB gzipped), which is expected.
    chunkSizeWarningLimit: 800,
    // While we're building foundations, the deployed site includes the dev
    // tools (/dev/*) so they can be tested on real phones from a URL.
    // `npm run build:release` leaves them out.
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        ...(process.env.RELEASE === '1'
          ? {}
          : {
              devIndex: resolve(import.meta.dirname, 'dev/index.html'),
              devBeat: resolve(import.meta.dirname, 'dev/beat.html'),
              devModels: resolve(import.meta.dirname, 'dev/models.html'),
              devAudio: resolve(import.meta.dirname, 'dev/audio.html'),
            }),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
