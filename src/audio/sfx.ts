/**
 * Sound effects (TECHNICAL.md §8): sfxr-style parameter sets, rendered once
 * into buffers, then played with a little random pitch so repeats don't
 * sound robotic, and with a cap on how many copies play at once.
 */
import type { Mixer } from './mixer';
import { noise } from './synth/instruments';

export interface SfxDef {
  readonly wave: OscillatorType | 'noise';
  /** Start frequency in Hz (ignored for noise unless filtered). */
  readonly freq: number;
  /** Slide to this frequency over the decay. */
  readonly freqEnd?: number;
  readonly attack: number;
  readonly decay: number;
  readonly volume: number;
  readonly filter?: {
    readonly type: BiquadFilterType;
    readonly freq: number;
    readonly freqEnd?: number;
    readonly q?: number;
  };
  /** Play several notes in a row, as multiples of `freq` (an arpeggio). */
  readonly notes?: readonly number[];
  /** Seconds between arpeggio notes. */
  readonly noteStep?: number;
  readonly bus?: 'sfx' | 'ui';
  /** At most this many copies at once. */
  readonly maxVoices?: number;
  /** Random pitch spread, in cents. */
  readonly jitter?: number;
}

/** Starter effects; replace and extend them as the game's sounds are designed. */
export const SFX = {
  blip: {
    wave: 'square',
    freq: 520,
    freqEnd: 760,
    attack: 0.002,
    decay: 0.06,
    volume: 0.16,
    maxVoices: 2,
    jitter: 120,
  },
  whoosh: {
    wave: 'noise',
    freq: 0,
    attack: 0.03,
    decay: 0.32,
    volume: 0.9,
    filter: { type: 'bandpass', freq: 500, freqEnd: 3200, q: 2 },
  },
  thud: { wave: 'sine', freq: 160, freqEnd: 40, attack: 0.002, decay: 0.3, volume: 0.8 },
  chime: {
    wave: 'triangle',
    freq: 880,
    attack: 0.002,
    decay: 0.12,
    volume: 0.45,
    notes: [1, 1.26, 1.5, 2],
    noteStep: 0.055,
  },
  uiClick: { wave: 'triangle', freq: 660, attack: 0.001, decay: 0.05, volume: 0.3, bus: 'ui' },
  /** The schnauzer: a short, gruff "woof" (a buzzy tone dropping fast through a closing filter). */
  woof: {
    wave: 'sawtooth',
    freq: 330,
    freqEnd: 170,
    attack: 0.008,
    decay: 0.17,
    volume: 0.75,
    filter: { type: 'lowpass', freq: 1500, freqEnd: 420, q: 5 },
    maxVoices: 2,
    jitter: 60,
  },
  /** The spitz: a bright little "yip", rising then dropping. */
  yip: {
    wave: 'sawtooth',
    freq: 760,
    freqEnd: 520,
    attack: 0.004,
    decay: 0.1,
    volume: 0.55,
    filter: { type: 'bandpass', freq: 1800, freqEnd: 1100, q: 3 },
    notes: [1, 1.12],
    noteStep: 0.035,
    maxVoices: 2,
    jitter: 80,
  },
} as const satisfies Record<string, SfxDef>;

export type SfxId = keyof typeof SFX;

/** Render one effect into a buffer. */
export async function renderSfx(def: SfxDef, sampleRate: number): Promise<AudioBuffer> {
  const notes = def.notes ?? [1];
  const step = def.noteStep ?? 0;
  const length = (notes.length - 1) * step + def.attack + def.decay + 0.05;
  const ctx = new OfflineAudioContext(1, Math.ceil(length * sampleRate), sampleRate);

  notes.forEach((mult, i) => {
    const t = i * step;
    const end = t + def.attack + def.decay;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(def.volume, t + def.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    gain.connect(ctx.destination);

    let head: AudioNode = gain;
    if (def.filter) {
      const f = ctx.createBiquadFilter();
      f.type = def.filter.type;
      f.Q.value = def.filter.q ?? 1;
      f.frequency.setValueAtTime(def.filter.freq, t);
      if (def.filter.freqEnd) f.frequency.exponentialRampToValueAtTime(def.filter.freqEnd, end);
      f.connect(gain);
      head = f;
    }

    let source: AudioScheduledSourceNode;
    if (def.wave === 'noise') {
      const n = ctx.createBufferSource();
      n.buffer = noise(ctx);
      n.loop = true;
      source = n;
    } else {
      const o = ctx.createOscillator();
      o.type = def.wave;
      o.frequency.setValueAtTime(def.freq * mult, t);
      if (def.freqEnd) o.frequency.exponentialRampToValueAtTime(def.freqEnd * mult, end);
      source = o;
    }
    source.connect(head);
    source.start(t);
    source.stop(end + 0.02);
  });
  return ctx.startRendering();
}

let renderedSfx: Promise<Map<SfxId, AudioBuffer>> | null = null;

/** Render every effect (once). Doesn't need the live context, so it can start at load. */
export function prepareSfx(sampleRate: number): Promise<Map<SfxId, AudioBuffer>> {
  renderedSfx ??= Promise.all(
    (Object.entries(SFX) as [SfxId, SfxDef][]).map(
      async ([id, def]) => [id, await renderSfx(def, sampleRate)] as const,
    ),
  ).then((entries) => new Map(entries));
  return renderedSfx;
}

/** Plays pre-rendered effects through the mixer. */
export class SfxPlayer {
  private readonly playing = new Map<SfxId, AudioBufferSourceNode[]>();

  constructor(
    private readonly ctx: AudioContext,
    private readonly mixer: Mixer,
    private readonly buffers: Map<SfxId, AudioBuffer>,
  ) {}

  /** Play an effect now (or at a context time). */
  play(id: SfxId, when = 0): void {
    const buffer = this.buffers.get(id);
    if (!buffer) return;
    const def: SfxDef = SFX[id];
    const voices = this.playing.get(id) ?? [];
    if (voices.length >= (def.maxVoices ?? 4)) voices.shift()?.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    if (def.jitter) src.detune.value = (Math.random() * 2 - 1) * def.jitter;
    src.connect(def.bus === 'ui' ? this.mixer.ui : this.mixer.sfx);
    src.onended = () => {
      const list = this.playing.get(id);
      if (list) list.splice(list.indexOf(src), 1);
    };
    src.start(when);
    voices.push(src);
    this.playing.set(id, voices);
  }
}
