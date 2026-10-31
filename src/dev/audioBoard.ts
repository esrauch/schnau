/**
 * Dev page for audio: play every SFX and every song stem, with mutes,
 * and draw the waveform of whatever played last. Render modes produce WAVs
 * and waveform images for `npm run render-audio`, so levels and loop seams
 * can be checked without listening (TECHNICAL.md §13).
 */
import { unlockAudio } from '../audio/context';
import { getMixer } from '../audio/mixer';
import { RENDER_RATE, prepareSong } from '../audio/music';
import { SFX, prepareSfx, type SfxId } from '../audio/sfx';
import { SONGS } from '../audio/songs';
import { loopSeconds, type Song } from '../audio/synth/render';
import { encodeWav, levels } from '../audio/wav';

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`audio.html is missing ${sel}`);
  return el;
};
const songRow = $('#song');
const stemRow = $('#stems');
const sfxRow = $('#sfx');
const wave = $<HTMLCanvasElement>('#wave');
const status = $('#status');

const params = new URLSearchParams(location.search);
const renderMode = params.get('render');
/** Seconds to crossfade when switching songs. */
const CROSSFADE = 2;

if (renderMode) void renderForTool(renderMode, params.get('id') ?? '');
else interactive();

function interactive(): void {
  /** What's playing: one song's stems through its own fader, so songs can crossfade. */
  let current: {
    song: Song;
    bus: GainNode;
    voices: { source: AudioBufferSourceNode; gain: GainNode; stem: string }[];
  } | null = null;
  /** When the first song started: every later song starts on the same beat grid. */
  let origin = 0;
  let layer: 'setup' | 'play' = 'play';
  const muted = new Set<string>();

  const button = (row: HTMLElement, text: string, onClick: () => void): void => {
    const b = document.createElement('button');
    b.textContent = text;
    b.addEventListener('click', onClick);
    row.append(b);
  };

  const stopSong = (): void => {
    for (const v of current?.voices ?? []) v.source.stop();
    current?.bus.disconnect();
    current = null;
  };

  /**
   * Play a song in time with whatever is playing. Every song shares one beat
   * grid, so the new one starts at the same point in its loop as the old one
   * is in its own, and the two crossfade over CROSSFADE seconds.
   */
  const playSong = async (song: Song): Promise<void> => {
    const ctx = await unlockAudio();
    status.textContent = `Rendering ${song.name}…`;
    const stems = await prepareSong(song);
    const now = ctx.currentTime + 0.05;
    const old = current;
    if (!old) origin = now;
    const offset = (now - origin) % loopSeconds(song);
    const bus = ctx.createGain();
    bus.connect(getMixer(ctx).music);
    if (old) {
      bus.gain.setValueAtTime(0, now);
      bus.gain.linearRampToValueAtTime(1, now + CROSSFADE);
      old.bus.gain.setValueAtTime(1, now);
      old.bus.gain.linearRampToValueAtTime(0, now + CROSSFADE);
      for (const v of old.voices) v.source.stop(now + CROSSFADE);
    }
    if (old?.song !== song) muted.clear();
    const voices = song.stems.flatMap((stem) => {
      const buffer = stems.get(stem.id);
      if (!buffer) return [];
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = song.layers[layer].includes(stem.id) && !muted.has(stem.id) ? 1 : 0;
      source.connect(gain).connect(bus);
      source.start(now, offset);
      return [{ source, gain, stem: stem.id }];
    });
    current = { song, bus, voices };
    showStems(song);
    draw(mixStems(stems, song.layers[layer]));
    const how = old ? `crossfading from ${old.song.name}` : 'from the top';
    status.textContent = `${song.name} · ${song.bpm} BPM · ${song.bars} bars (${loopSeconds(song)}s loop) · ${layer} mix · ${how}`;
  };

  const showStems = (song: Song): void => {
    stemRow.replaceChildren();
    for (const stem of song.stems) {
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !muted.has(stem.id);
      box.addEventListener('change', () => {
        if (box.checked) muted.delete(stem.id);
        else muted.add(stem.id);
        for (const v of current?.voices ?? []) {
          if (v.stem === stem.id) v.gain.gain.value = box.checked ? 1 : 0;
        }
      });
      label.append(box, ` ${stem.id}`);
      stemRow.append(label);
    }
  };

  for (const song of SONGS) button(songRow, `▶ ${song.name}`, () => void playSong(song));
  button(songRow, '■ Stop', stopSong);
  const setupToggle = document.createElement('label');
  const setupBox = document.createElement('input');
  setupBox.type = 'checkbox';
  setupBox.addEventListener('change', () => {
    layer = setupBox.checked ? 'setup' : 'play';
    if (current) void playSong(current.song);
  });
  setupToggle.append(setupBox, ' setup mix');
  songRow.append(setupToggle);
  showStems(SONGS[0]);

  // Each press plays the next take (voices have several).
  const nextTake = new Map<SfxId, number>();
  for (const id of Object.keys(SFX) as SfxId[]) {
    button(sfxRow, id, async () => {
      const ctx = await unlockAudio();
      const takes = (await prepareSfx(RENDER_RATE)).get(id) ?? [];
      const take = (nextTake.get(id) ?? 0) % Math.max(1, takes.length);
      nextTake.set(id, take + 1);
      const buffer = takes[take];
      if (!buffer) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(getMixer(ctx).sfx);
      src.start();
      draw(buffer.getChannelData(0));
      const { peakDb, rmsDb } = levels([buffer.getChannelData(0)]);
      const which = takes.length > 1 ? ` (take ${take + 1} of ${takes.length})` : '';
      status.textContent = `${id}${which}: ${(buffer.duration * 1000).toFixed(0)} ms · peak ${peakDb.toFixed(1)} dBFS · RMS ${rmsDb.toFixed(1)} dBFS`;
    });
  }
}

/** Sum some stems into one mono track (as the mix bus would). */
function mixStems(stems: Map<string, AudioBuffer>, ids: readonly string[]): Float32Array {
  const first = stems.get(ids[0] ?? '');
  const out = new Float32Array(first?.length ?? 0);
  for (const id of ids) {
    const data = stems.get(id)?.getChannelData(0);
    if (!data) continue;
    for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) + (data[i] ?? 0);
  }
  return out;
}

function draw(samples: Float32Array): void {
  const dpr = Math.min(window.devicePixelRatio, 2);
  const w = (wave.width = wave.clientWidth * dpr);
  const h = (wave.height = wave.clientHeight * dpr);
  const g = wave.getContext('2d');
  if (!g) return;
  g.fillStyle = '#1d1630';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.15)';
  g.beginPath();
  g.moveTo(0, h / 2);
  g.lineTo(w, h / 2);
  g.stroke();
  // Min/max per pixel column, in the accent color; clipping would show as red at the edges.
  const per = Math.max(1, Math.floor(samples.length / w));
  for (let x = 0; x < w; x++) {
    let lo = 1;
    let hi = -1;
    for (let i = x * per; i < (x + 1) * per && i < samples.length; i++) {
      const s = samples[i] ?? 0;
      if (s < lo) lo = s;
      if (s > hi) hi = s;
    }
    g.fillStyle = hi >= 0.999 || lo <= -0.999 ? '#e8344e' : '#ff8a1f';
    g.fillRect(x, ((1 - hi) / 2) * h, 1, Math.max(1, ((hi - lo) / 2) * h));
  }
}

/** Render offline and expose the result for tools/audio/render.ts. */
async function renderForTool(mode: string, id: string): Promise<void> {
  document.body.classList.add('render');
  wave.style.height = '220px';
  let samples: Float32Array;
  let looping = false;
  if (mode === 'sfx') {
    // Every take, one after another with a short gap, so a render has them all to hear.
    const takes = (await prepareSfx(RENDER_RATE)).get(id as SfxId);
    if (!takes?.length) throw new Error(`No sfx "${id}"`);
    const gap = Math.round(RENDER_RATE * 0.3);
    samples = new Float32Array(takes.reduce((n, t) => n + t.length + gap, 0));
    let at = 0;
    for (const take of takes) {
      samples.set(take.getChannelData(0), at);
      at += take.length + gap;
    }
  } else {
    const [songId, stemId] = id.split('/');
    const s = SONGS.find((x) => x.id === songId);
    if (!s) throw new Error(`No song "${songId}"`);
    const stems = await prepareSong(s);
    samples = mixStems(stems, mode === 'stem' && stemId ? [stemId] : s.layers.play);
    looping = true;
  }
  draw(samples);
  const { peakDb, rmsDb } = levels([samples]);
  // How big a jump there is where the loop wraps around, compared with the biggest step inside it.
  let maxStep = 0;
  for (let i = 1; i < samples.length; i++) {
    maxStep = Math.max(maxStep, Math.abs((samples[i] ?? 0) - (samples[i - 1] ?? 0)));
  }
  const seam = looping ? Math.abs((samples[0] ?? 0) - (samples[samples.length - 1] ?? 0)) : null;
  const wav = encodeWav([samples], RENDER_RATE);
  let binary = '';
  for (let i = 0; i < wav.length; i += 0x8000) {
    binary += String.fromCharCode(...wav.subarray(i, i + 0x8000));
  }
  Object.assign(window, {
    __result: {
      wav: btoa(binary),
      seconds: samples.length / RENDER_RATE,
      peakDb,
      rmsDb,
      seam,
      maxStep,
    },
  });
}
