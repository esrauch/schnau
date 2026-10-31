# Schnau: Technical

How we build it: the stack, the architecture, and how assets get made. The tech setup is shared with `~/Code/vox` (Get Jack Back); the gameplay, art and sound are this game's own. Gameplay and theme docs will come later.

---

## 1. Goals and Constraints

- **A web game that loads from a URL.** It plays in a mobile browser, in portrait, with one thumb. Desktop browsers work too.
- **Performance:** a steady 60 fps on a mid-range phone; first load under ~5 MB; no needless work while paused.
- **Minimal dependencies.** No game engine. Runtime dependencies: `three`. That's the whole list (Preact is pre-approved if menus get complex). Dev-only dependencies can be added more freely.
- **Deterministic rules.** The same seed and inputs always play out the same way, so rules can be unit-tested and balanced headlessly.

## 2. Stack

| Layer | Choice |
|---|---|
| Language | TypeScript, strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| 3D | three.js, flat-shaded voxel meshes with vertex colors |
| UI overlay | Plain DOM + CSS over the canvas |
| Audio | Web Audio API: synthesized songs and SFX rendered at load |
| Build / dev | Vite |
| Tests | Vitest |
| Dev tooling | playwright-core driving the system Chrome (headless previews, screenshots, audio renders) |

## 3. Architecture

- **The simulation is separate from rendering.** The sim (to live in `src/sim/`) is pure TypeScript: no three.js, DOM or `Math.random`. It advances at a fixed 60 steps a second; every random choice comes from the seeded `createRng` (`src/sim/rng.ts`).
- **The controller** (`src/game/game.ts`) runs the sim from `requestAnimationFrame` with an accumulator, spending real time in whole fixed steps, then draws.
- **The renderer** reads the state every frame and never changes it; it reacts to sim events with sounds and effects.
- `src/main.ts` reads URL options (`?seed=N`) and builds the `Game`; in dev builds it is `window.game`.

## 4. Rendering and UI

- `src/render/view.ts` (`View`): renderer (pixel ratio capped at 2), scene, hemisphere fill and a shadow-casting sun; the game places the camera.
- Voxel meshes are greedy-meshed and cached per model (`getGeometry`); use `InstancedMesh` for many copies of a static prop. Keep draw calls under ~100 and don't allocate in the frame loop.
- The DOM overlay (`#ui`) lets taps through (`pointer-events: none`); real controls opt back in with `.interactive`. Style tokens are at the top of `src/ui/base.css`.
- **Colors** have one source of truth, `src/content/palettes.ts`: `common` becomes CSS custom properties (`ui/paletteVars.ts`), `voxel` is the named colors models use. The current palette is a neutral placeholder.
- No font is bundled yet (system-ui). If one is added, self-host it under `assets/fonts` and wait for it in `main.ts` before building the game.

## 5. Audio

One `AudioContext`, with a mixer: `master → (music, sfx, ui)` buses (`audio/mixer.ts`, levels in `src/content/tuning.ts`). `Conductor` (`src/game/conductor.ts`) starts music on the first tap (browsers require a gesture), crossfades between songs on bar lines, and plays SFX.

- **Songs are data** (`src/audio/songs/`): patterns per stem in a compact notation (`audio/synth/notes.ts`), instruments in `audio/synth/instruments.ts`, rendered to looping buffers with an `OfflineAudioContext`. All songs share `SONG_GRID` (120 BPM, 4/4, 8 bars, A minor) so any two can crossfade. `placeholder.ts` is a stand-in until real songs are written.
- **SFX** are sfxr-style parameter sets in `audio/sfx.ts` (a small generic starter set), with voice limits and pitch jitter.
- **Samples** (CC0 / public domain) are allowed for what synthesis does badly: crowds, voices.
- `src/beat/`: a beat clock and tap calibration, in case gameplay ever needs to sync to the music.

## 6. Voxel Models (`.voxt`)

A plain-text format Claude writes, reads and diffs. Full syntax at the top of `src/voxel/voxt.ts`:

```
size 8 8 8          # width (x), height (y), depth (z)
voxel 0.1           # world units per voxel
colors
  w wood            # names resolve to palettes.ts `voxel` (never raw hex in models)
box 0 0 0 7 7 7 w   # inclusive; y up from 0, z from the front
slice 0             # front-view grid at depth z; rows top to bottom
  ..w..
```

- Models live in `assets-src/voxels/<folder>/<name>.voxt`; the **model id is the path** (`props/crate`). Vite loads them as text, so edits hot-reload.
- Slice 0 is the front and faces +z. `mirror x` makes each row the left half plus the centre column.
- `npm run import-vox -- model.vox folder/name [voxelSize]` converts MagicaVoxel files, snapping colors to the palette.

**Making a model:** write the `.voxt` → register it in `assets/manifest.json` (`author: "Claude"`, `license: "original"`) → `npm run preview-models -- <id>` and look at `previews/<id>.png` and the folder's contact sheet → use it with `getGeometry(id)` and `voxelMaterial`. Judge models from the game camera at phone size: a thing should read from its silhouette alone.

## 7. Licensing

Every file under `assets/` and `assets-src/` needs an entry in `assets/manifest.json` (source, author, license). Allowed: `original`, `CC0-1.0`, `public-domain`, `OFL-1.1`. `tools/check-assets.ts` enforces it and runs in `npm run check` and the build.

## 8. Deployment

A static site. `.github/workflows/deploy.yml` runs `npm run check` and deploys `main` to GitHub Pages through Actions (repo Settings → Pages → Source: GitHub Actions). `vite.config.ts` uses a relative base, so any subpath works. The normal build includes the `/dev/` pages for phone testing; `npm run build:release` leaves them out.

## 9. Project Layout

```
/
├─ index.html
├─ dev/                  // dev pages: index, models, audio (sound board), beat
├─ src/
│  ├─ main.ts            // URL options → Game
│  ├─ game/              // game.ts (controller), conductor.ts (music + SFX)
│  ├─ render/view.ts     // renderer, scene, lights
│  ├─ ui/                // base styles, palette CSS variables
│  ├─ audio/             // mixer, synth, songs, SFX, wav encoding
│  ├─ beat/              // beat clock and calibration
│  ├─ voxel/             // .voxt parser, greedy mesher, model cache, .vox import
│  ├─ content/           // palettes, shared tuning
│  ├─ sim/rng.ts         // seeded RNG
│  ├─ settings.ts        // localStorage settings shell
│  └─ dev/               // dev page scripts
├─ assets-src/           // voxels/, svg/, samples/
├─ assets/manifest.json
├─ tools/                // asset check, screenshots, model previews, audio render
└─ tests/
```

## 10. Working Notes

- **Environment:** Node 24 (`.nvmrc`), Vite 8, Vitest 5, ESLint 10, TypeScript 5. Headless tools drive `/usr/bin/google-chrome` via playwright-core with `--use-angle=swiftshader --enable-unsafe-swiftshader`.
- **Dev server:** `npm run dev` (port 5173, `--host` so a phone on the same Wi-Fi can open it; `/dev/` for the tools). `.claude/launch.json` has a `dev` config for the Browser pane.
- **Git:** commit after a verified step; run `npm run check` first; never push.
- **Headless browser checks cost a lot of tokens:** run them when asked, otherwise run `npm run check` and offer one.

| Command | What it does |
|---|---|
| `npm run check` | Lint, Prettier check, typecheck, tests, asset-license check. Run before every commit. |
| `npm run build` / `build:release` | Build with / without the dev pages. |
| `npm run preview-models [ids…]` | PNG turntables → `previews/<id>.png`, plus a contact sheet per folder. |
| `npm run screenshot [seed] [query] [name]` | Phone-size (375×812 @2x) capture → `previews/<name>.png`. |
| `npm run render-audio [song:id \| stem:song/stem \| sfx:id …]` | WAVs and waveform PNGs in `previews/audio/`, with levels and a loop-seam check. |
| `npm run import-vox -- file.vox folder/name [voxelSize]` | Convert a MagicaVoxel model to `.voxt`. |
