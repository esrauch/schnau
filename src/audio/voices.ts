/**
 * Dog voices: barks synthesized like a voice rather than a beep. A bark is a
 * vowel shouted fast:
 *
 * - a voiced source (two slightly detuned sawtooths at the pitch f0) whose
 *   pitch jumps up and falls away, roughened by a fast wobble in its volume
 *   (the rasp in a gruff bark);
 * - a puff of breath noise at the start (and a little through it);
 * - three resonances (formants, band-pass filters) that glide from one vowel
 *   to another, which is what makes it say "wuh-ROOF" or "yip" rather than buzz.
 *
 * Each sound renders a few takes with small random differences in pitch,
 * length and vowel, so repeated barks don't sound like a machine.
 */

/** Three formant frequencies (Hz): F1 (open/closed), F2 (front/back), F3 (brightness). */
type Formants = readonly [number, number, number];

export interface BarkVoice {
  /** Pitch (f0, Hz) at the start, its peak, and the end; and when the peak comes (s). */
  readonly pitch: readonly [number, number, number];
  readonly peakAt: number;
  /** Seconds of voice. */
  readonly length: number;
  /** The vowel at the start, the middle and the end. */
  readonly vowel: readonly [Formants, Formants, Formants];
  /** How much each formant comes through: F1, F2, F3. */
  readonly formantGain: Formants;
  /** Roughness (0..1) and how fast it wobbles (Hz). */
  readonly rasp: number;
  readonly raspRate: number;
  /** Breath noise at the start (0..1), and its centre frequency. */
  readonly breath: number;
  readonly breathFreq: number;
}

/** The voices, by sound. Tune by ear: `npm run render-audio -- sfx:rozWoof` and /dev/audio.html. */
export const VOICES = {
  /** Roz's yip: a short raspy "rap!" from a small, gruff dog. */
  rozYip: {
    pitch: [520, 680, 430],
    peakAt: 0.025,
    length: 0.12,
    vowel: [
      [500, 1300, 2600],
      [850, 1500, 2700],
      [650, 1300, 2500],
    ],
    formantGain: [1, 0.7, 0.35],
    rasp: 0.45,
    raspRate: 70,
    breath: 0.5,
    breathFreq: 2200,
  },
  /** Roz's WOOF: deep for a small dog, gruff, "wuh-ROOF!". */
  rozWoof: {
    pitch: [250, 340, 190],
    peakAt: 0.05,
    length: 0.28,
    vowel: [
      [320, 700, 2300],
      [750, 1150, 2500],
      [450, 800, 2300],
    ],
    formantGain: [1, 0.55, 0.25],
    rasp: 0.6,
    raspRate: 48,
    breath: 0.7,
    breathFreq: 1600,
  },
  /** Lumen's yip: a bright little "yip!" that chirps up. */
  lumenYip: {
    pitch: [820, 1150, 760],
    peakAt: 0.02,
    length: 0.1,
    vowel: [
      [380, 2100, 3000],
      [600, 2300, 3200],
      [500, 2000, 3000],
    ],
    formantGain: [1, 0.85, 0.45],
    rasp: 0.12,
    raspRate: 90,
    breath: 0.35,
    breathFreq: 3200,
  },
  /** Lumen's WOOF: a lighter, springy "arf!". */
  lumenWoof: {
    pitch: [460, 580, 360],
    peakAt: 0.035,
    length: 0.2,
    vowel: [
      [450, 1200, 2700],
      [800, 1400, 2900],
      [600, 1150, 2700],
    ],
    formantGain: [1, 0.7, 0.35],
    rasp: 0.25,
    raspRate: 65,
    breath: 0.5,
    breathFreq: 2600,
  },
} as const satisfies Record<string, BarkVoice>;

/** How long a take of this voice lasts in all (seconds), with room for its tail. */
export function barkLength(voice: BarkVoice): number {
  return voice.length * 1.1 + 0.06;
}

/** Render one take of a bark into `ctx` (an OfflineAudioContext as long as barkLength). */
export function renderBark(
  ctx: BaseAudioContext,
  voice: BarkVoice,
  take: number,
  noise: AudioBuffer,
): void {
  // Small random differences per take (seeded, so a take always sounds the same).
  let seed = 9001 + take * 7919;
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const vary = (amount: number): number => 1 + (rand() * 2 - 1) * amount;
  const pitchK = vary(0.06);
  const lenK = vary(0.1);
  const vowelK = vary(0.05);
  const len = voice.length * lenK;
  const peakAt = Math.min(voice.peakAt * lenK, len * 0.5);
  const t0 = 0.004;

  const out = ctx.createGain();
  out.gain.value = 1;
  out.connect(ctx.destination);

  // The voiced source: two detuned sawtooths, pitch up then down.
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, 0);
  amp.gain.linearRampToValueAtTime(1, t0 + 0.006);
  amp.gain.setValueAtTime(1, t0 + len * 0.4);
  amp.gain.exponentialRampToValueAtTime(0.001, t0 + len);
  const [p0, p1, p2] = voice.pitch.map((p) => p * pitchK) as [number, number, number];
  for (const detune of [-8, 8]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(p0, t0);
    osc.frequency.exponentialRampToValueAtTime(p1, t0 + peakAt);
    osc.frequency.exponentialRampToValueAtTime(p2, t0 + len);
    osc.connect(amp);
    osc.start(t0);
    osc.stop(t0 + len + 0.02);
  }

  // The rasp: a fast wobble in the voice's volume.
  if (voice.rasp > 0) {
    const rasp = ctx.createGain();
    rasp.gain.value = 1;
    const lfo = ctx.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.value = voice.raspRate * vary(0.1);
    const depth = ctx.createGain();
    depth.gain.value = voice.rasp * 0.5;
    lfo.connect(depth).connect(rasp.gain);
    lfo.start(t0);
    lfo.stop(t0 + len + 0.02);
    amp.connect(rasp);
    shapeVowel(ctx, rasp, out, voice, vowelK, t0, len);
  } else shapeVowel(ctx, amp, out, voice, vowelK, t0, len);

  // A puff of breath at the start, and a little through the bark.
  const puff = ctx.createBufferSource();
  puff.buffer = noise;
  const breathBand = ctx.createBiquadFilter();
  breathBand.type = 'bandpass';
  breathBand.frequency.value = voice.breathFreq;
  breathBand.Q.value = 1.2;
  const breath = ctx.createGain();
  breath.gain.setValueAtTime(0, 0);
  breath.gain.linearRampToValueAtTime(voice.breath * 0.6, t0 + 0.003);
  breath.gain.exponentialRampToValueAtTime(voice.breath * 0.12, t0 + 0.04);
  breath.gain.exponentialRampToValueAtTime(0.001, t0 + len);
  puff.connect(breathBand).connect(breath).connect(out);
  puff.start(0, take * 0.13);
  puff.stop(t0 + len + 0.02);
}

/** Send the source through three formant filters gliding between the voice's vowels. */
function shapeVowel(
  ctx: BaseAudioContext,
  source: AudioNode,
  out: AudioNode,
  voice: BarkVoice,
  vowelK: number,
  t0: number,
  len: number,
): void {
  const q = [5, 9, 12];
  for (let f = 0; f < 3; f++) {
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = q[f] ?? 8;
    const [a, b, c] = voice.vowel.map((v) => (v[f] ?? 1000) * vowelK) as [number, number, number];
    band.frequency.setValueAtTime(a, t0);
    band.frequency.exponentialRampToValueAtTime(b, t0 + len * 0.35);
    band.frequency.exponentialRampToValueAtTime(c, t0 + len);
    const gain = ctx.createGain();
    // Narrow band-passes lose level; make up for it so the vowel isn't faint.
    gain.gain.value = (voice.formantGain[f] ?? 0.5) * (q[f] ?? 8) * 0.35;
    source.connect(band).connect(gain).connect(out);
  }
  // A little of the raw voice through a low-pass, for body.
  const body = ctx.createBiquadFilter();
  body.type = 'lowpass';
  body.frequency.value = 1200;
  const bodyGain = ctx.createGain();
  bodyGain.gain.value = 0.15;
  source.connect(body).connect(bodyGain).connect(out);
}
