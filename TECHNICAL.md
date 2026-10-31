# Schnau: Technical

How we build it: the stack, the architecture, and how assets get made. What the game *is* lives in [GAMEPLAY.md](GAMEPLAY.md). The tech setup is shared with `~/Code/vox` (Get Jack Back); the gameplay, art and sound are this game's own. Gameplay and theme docs will come later.

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

- **The simulation is separate from rendering.** `src/sim/run.ts` holds every rule (GAMEPLAY.md) as plain TypeScript: no three.js, DOM or `Math.random`. `createRun(seed, dog)` makes a `RunState`; `step(state, input)` advances it one fixed tick (`DT`, 60 a second), **changing it in place**, and returns `GameEvent`s (yip, woof, panic, dropped, dogHurt, fireWarn, won…). Every random choice comes from `createRng(deriveSeed(seed, …))` (`src/sim/rng.ts`), so a run replays exactly from its seed and inputs. The numbers are all in `src/content/gameTuning.ts` (dogs, enemies, the yard, the waves).
- **The controller** (`src/game/game.ts`) shows the start menu (`src/game/menu.ts`: Roz and Lumen wandering in front of the doghouse; the picked one gets a gold contour via `Outline.setContour`), then runs the sim from `requestAnimationFrame` in whole fixed steps with the controls' input, turns events into sounds (`Conductor`), effects and HUD messages, poses the dog's rig, and follows it with the camera (pitched 56°, framing about 2.7 units either side of the dog whatever the screen's shape).
- **The renderer only reads the state:** `render/yard.ts` (the lawn, cottage, doghouse, the ring of bushes), `render/actors.ts` (enemies and their courage pips, the bug swarms as one instanced mesh, dropped treats, fire circles filling up, bark waves, the WOOF's reach ring), the dog's rig and `DogAnimator`.
- **UI** (`src/ui/`): `controls.ts` (a floating direction stick on the left; Dash and Woof on the right, the Woof button filling as it charges; WASD/arrows, Shift and Space on a desktop), `hud.ts` (treats, bones, hearts, the dragon's courage bar, messages, the start and end screens, and arrows toward off-screen enemies).
- URL options: `?seed=N`, `?dog=schnauzer|spitz` (skips the start screen), `?outline=0`, `?contour=white|black|off`. In dev builds the game is `window.game`.

## 4. Rendering and UI

**The look is sunny cel shading, after Wind Waker:** bright saturated colour, two flat tones per surface with a hard edge between them, cool coloured shade, crisp shadows, rounded forms.

- **Cel tones** (`src/render/toon.ts`, `toonMaterial`): built on `MeshToonMaterial`, but its light only decides *whether* a pixel is lit (a hard ramp, terminator just past side-on, and shadows). The tones come from `cel` in `palettes.ts`: lit = the surface colour × `litTint`; shade = the colour × `shadeTint`, re-saturated. Multiplying by blue sky light turned warm colours to mud, so the shade is art-directed rather than physical. Shadow edges are snapped too (the shadow map filters them soft), keeping a pixel of antialiasing. Every lit surface uses `toonMaterial`; the view calls `syncCelSun` after changing the sun.
- **Line art** (`src/render/outline.ts`): a post pass that finds silhouettes (the Laplacian of 1/depth, so flat ground stays clean) and creases (normals), and draws each line in a darker, richer shade of the nearer surface's colour, never black. Costs a second scene render (normals) and a full-screen pass. `?outline=0` turns it off.
- **The hero's contour** (same pass): a thick line around only the outside of objects on `CONTOUR_LAYER`, from a third pass that draws them alone into a mask. It shows through anything in front of them. `?contour=white|black|off` (white by default, for now).
- **Rounded models:** `.voxt` models marked `smooth` are meshed as rounded surfaces (§6), so the terminator sweeps across curves. Hard-edged things (crates) stay blocky.
- `src/render/view.ts` (`View`): renderer (pixel ratio capped at 2), the sky gradient and horizon fog, and the sun (high, from the left, so things show a lit side and a shade side; PCF shadows). The game places the camera.
- Voxel meshes are cached per model (`getGeometry`); use `InstancedMesh` for many copies of a static prop. Keep draw calls under ~100 (the outline pass doubles them) and don't allocate in the frame loop.
- The DOM overlay (`#ui`) lets taps through (`pointer-events: none`); real controls opt back in with `.interactive`. Style tokens are at the top of `src/ui/base.css`.
- **Colors** have one source of truth, `src/content/palettes.ts`: `common` becomes CSS custom properties (`ui/paletteVars.ts`), `voxel` is the named colors models use, `sky` and `cel` set the light.
- No font is bundled yet (system-ui). If one is added, self-host it under `assets/fonts` and wait for it in `main.ts` before building the game.

### Animation

**Procedural, not keyframed** (`src/render/dogAnimator.ts`, `DogAnimator`): every pose is a few sines layered on the rig's rest pose, so it's free and blends smoothly. Set `speed` (0 standing … 1 full trot … 2 full gallop) every frame from how fast the dog moves, call `bark()`, and `update(dt)`.

- **Idle:** breathing, a lazy tail wag, glancing about, the odd curious head tilt.
- **Trot:** diagonal leg pairs swing (feet lift going forward), the body bobs twice a stride and rolls (the waddle), the head bobs, the tail wags faster.
- **Gallop** (`speed` 1 → 2, blending in from the trot): a cartoon bound. Both back legs drive together, then both fronts reach together (each pair a touch apart, so feet land one-two); the body rocks like a rocking horse, the head counter-rocks to stay level, all four feet leave the ground at full stretch, and the tail streams out behind.
- **Bark** (0.5 s): wind-up (head dips, body squashes), toss (head up, body stretches, a hop for the spitz), settle; then an excited wag.
- Each breed has a `DogStyle` (`DOG_STYLES`, and `DOG_STYLE_FOR_MODEL` by model id): stride rate, leg swing, bob, waddle, bark hop, wag, and the gallop's rate, reach, rock and hop. The schnauzer is square and planted; the spitz quick and bouncy.
- **Watch them** on `/dev/models.html`: Idle, Walk, Trot, Gallop (keys 1–4), Bark (Space), slow motion, and spin or drag to turn.
- **Check poses** with `npm run preview-models -- --anim=trot|gallop|bark|idle <id>`: a strip of frames, ¾ view above and side view below (`previews/<id>-<anim>.png`).

## 5. Audio

One `AudioContext`, with a mixer: `master → (music, sfx, ui)` buses (`audio/mixer.ts`, levels in `src/content/tuning.ts`). `Conductor` (`src/game/conductor.ts`) starts music on the first tap (browsers require a gesture), crossfades between songs on bar lines, and plays SFX.

- **Songs are data** (`src/audio/songs/`): patterns per stem in a compact notation (`audio/synth/notes.ts`), instruments in `audio/synth/instruments.ts`, rendered to looping buffers with an `OfflineAudioContext`. All songs share `SONG_GRID` (120 BPM, 4/4, 8 bars, A minor) so any two can crossfade. `placeholder.ts` is a stand-in until real songs are written.
- **SFX** are sfxr-style parameter sets in `audio/sfx.ts` (a small generic starter set), with voice limits and pitch jitter.
- **The dogs' voices** (`audio/voices.ts`): barks synthesized like a voice, a vowel shouted fast. Two detuned sawtooths whose pitch jumps up and falls away, roughened by a fast volume wobble (the rasp), a puff of breath noise, and three formant band-passes gliding between vowels ("wuh-ROOF", "yip"). Each dog has a yip and a WOOF (`rozYip`, `rozWoof`, `lumenYip`, `lumenWoof`), each rendered as 3 takes with small seeded differences and levelled to the same peak; a random take plays each time. Tune them in `VOICES`; hear them on `/dev/audio.html` (each press plays the next take) or `npm run render-audio -- sfx:rozWoof` (all takes in one WAV). `ffmpeg -i x.wav -lavfi showspectrumpic=s=700x260:legend=1 x.png` draws a spectrogram, to see the pitch and vowels.
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

- **`ellipsoid x y z rx ry rz c`** fills a rounded blob (centre and radii in voxels, decimals allowed): the main tool for soft cartoon shapes.
- **`paint ellipsoid …` / `paint box …`** recolours only voxels already filled: markings that follow the curved surface (eyes, glints, collars, patches) without adding bumps. Order matters: a later paint or shape covers an earlier one.
- **`smooth [passes]`** meshes the model as a rounded surface (surface nets, `src/voxel/smooth.ts`). The voxels are blurred into a density field; vertices sit where it crosses ½, relaxed by the passes (default 2) within their cells, and **normals come from the field's gradient**, so the cel terminator sweeps cleanly with no voxel staircase. Each quad keeps its own voxel's colour, so colour patches stay crisp (their edges follow the voxel grid, so keep patches simple).
- **`part <name> pivot x y z [parent <name>]`** splits a model into separately animated parts (shapes after it fill that part; `part <name>` alone goes back to one). Each part has its own voxels, so parts overlap freely: a leg's top tucked into the body leaves no hole when it swings. `paint` recolours every part. `buildRig(id)` (`src/voxel/models.ts`) gives a group per part at its pivot, nested under its parent; `getGeometry(id)` is still the whole model in one piece (for previews and props).
- **Watch for overhangs** (a tail plume over a back, a brim): sunlight slipping under one leaves a lit island inside its shadow. Fill underneath so the shape meets the body. Without it, models are greedy-meshed blocks (`src/voxel/mesh.ts`).
- Models live in `assets-src/voxels/<folder>/<name>.voxt`; the **model id is the path** (`props/crate`). Vite loads them as text, so edits hot-reload.
- Slice 0 is the front and faces +z. `mirror x` makes each row the left half plus the centre column.
- `npm run import-vox -- model.vox folder/name [voxelSize]` converts MagicaVoxel files, snapping colors to the palette.

**Making a model:** write the `.voxt` → register it in `assets/manifest.json` (`author: "Claude"`, `license: "original"`) → `npm run preview-models -- <id>` and look at `previews/<id>.png` and the folder's contact sheet; for detail work, `npm run preview-models -- --close <id>` renders big front, ¾, side and ¾-back views (`previews/<id>-close.png`) → use it with `getGeometry(id)` and `voxelMaterial`.

**The heroes** (`hero/blackSchnauzer`, `hero/spitz`) are rigged: `body`; `legFrontLeft`, `legFrontRight`, `legBackLeft`, `legBackRight` (pivots at shoulder and hip, *not* parented, so they stay planted while the body bobs); `tail` and `head` (parented to the body). The dog's left is +x. They are 0.03-unit voxels, about 0.85 tall, with cartoon proportions (big heads, stubby legs). The spitz is modelled on a real dog from a photo: pale cream, apricot crown and rounded upright ears, white muzzle, teal collar with a silver bone tag. Black fur is a cool charcoal (`coal`), since true black has no lit side. Judge models from the game camera at phone size: a thing should read from its silhouette alone.

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
| `npm run preview-models [--close \| --anim=trot] [ids…]` | PNG turntables → `previews/<id>.png`, plus a contact sheet per folder; `--close` for big detail views; `--anim=` for a rigged dog's animation as a strip of frames. |
| `npm run screenshot [seed] [query] [name]` | Phone-size (375×812 @2x) capture → `previews/<name>.png`. `WAIT=<ms>` runs that long first; `TAP=<ms>` taps the screen and captures that long after; `KEY=Space HOLD=<ms>` holds a key (captures `<name>-hold.png` during it). |
| `npm run render-audio [song:id \| stem:song/stem \| sfx:id …]` | WAVs and waveform PNGs in `previews/audio/`, with levels and a loop-seam check. |
| `npm run import-vox -- file.vox folder/name [voxelSize]` | Convert a MagicaVoxel model to `.voxt`. |
