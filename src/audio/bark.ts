/**
 * Dog barks, synthesized sample by sample (pure maths, no Web Audio, so it's
 * testable). A real bark isn't a clean tone; it's a short, rough, noisy burst:
 *
 * - The voice: a train of vocal pulses whose spacing (pitch) arches up and
 *   falls away, jittering pulse to pulse, louder and softer at random, often
 *   with every other pulse stronger (period doubling: the growl in a gruff bark).
 * - Breath: noise mixed through it, strongest at the start and the tail.
 * - The mouth: three *broad* resonances (formants) gliding from one vowel to
 *   another ("rrr-OWF", "yip"). Broad, because narrow ones sound like a kazoo.
 * - Grit: soft saturation for edge, and a punchy envelope: in fast, out quick.
 *
 * Each take varies the pitch, length, vowel and the random jitter, so
 * repeated barks never sound identical.
 */

/** Formant frequencies (Hz): F1, F2, F3. */
type Formants = readonly [number, number, number];

export interface Bark {
  /** Seconds of bark. */
  readonly length: number;
  /** Pitch (Hz) at the start, its peak, and the end; and when the peak comes (0..1 of the length). */
  readonly pitch: readonly [number, number, number];
  readonly peakAt: number;
  /** Pulse-to-pulse spacing jitter, and loudness shimmer (0..1). */
  readonly jitter: number;
  readonly shimmer: number;
  /** How much every other pulse is weaker (0..1): the growl. */
  readonly growl: number;
  /** Breath noise, against the voice (0..1). */
  readonly breath: number;
  /** The vowel at the start, middle and end, and each formant's Q (low = broad). */
  readonly vowel: readonly [Formants, Formants, Formants];
  readonly q: Formants;
  /** Saturation drive (1 = clean). */
  readonly drive: number;
  /** Seconds the onset takes to build (a soft "w" before a "woof" lands). */
  readonly onset: number;
}

/** The dogs' barks. Tune by ear: /dev/audio.html, or `npm run render-audio -- sfx:rozWoof`. */
export const BARKS = {
  /** Roz's yip: a short, gruff "rrap!". */
  rozYip: {
    length: 0.1,
    pitch: [560, 720, 480],
    peakAt: 0.3,
    jitter: 0.09,
    shimmer: 0.3,
    growl: 0.35,
    breath: 0.45,
    vowel: [
      [700, 1500, 2800],
      [1000, 1700, 3000],
      [750, 1400, 2700],
    ],
    q: [2.5, 3, 3.5],
    drive: 2.6,
    onset: 0.004,
  },
  /** Roz's WOOF: a gruff "rrROWF!", deep for a small dog. */
  rozWoof: {
    length: 0.19,
    pitch: [300, 430, 230],
    peakAt: 0.3,
    jitter: 0.12,
    shimmer: 0.35,
    growl: 0.55,
    breath: 0.5,
    vowel: [
      [500, 1100, 2500],
      [850, 1350, 2700],
      [550, 950, 2400],
    ],
    q: [2.2, 2.8, 3.2],
    drive: 3,
    onset: 0.018,
  },
  /** Lumen's yip: a bright, quick "yip!". */
  lumenYip: {
    length: 0.08,
    pitch: [880, 1250, 800],
    peakAt: 0.25,
    jitter: 0.05,
    shimmer: 0.2,
    growl: 0.1,
    breath: 0.3,
    vowel: [
      [900, 2200, 3400],
      [1200, 2400, 3600],
      [950, 2100, 3300],
    ],
    q: [3, 3.5, 4],
    drive: 1.8,
    onset: 0.003,
  },
  /** Lumen's WOOF: a lighter, springy "arf!". */
  lumenWoof: {
    length: 0.14,
    pitch: [520, 720, 420],
    peakAt: 0.3,
    jitter: 0.08,
    shimmer: 0.28,
    growl: 0.3,
    breath: 0.42,
    vowel: [
      [750, 1500, 2900],
      [1050, 1700, 3100],
      [750, 1300, 2800],
    ],
    q: [2.5, 3, 3.5],
    drive: 2.2,
    onset: 0.008,
  },
} as const satisfies Record<string, Bark>;

/** One take of a bark, as samples (peak 1). */
export function renderBarkSamples(
  bark: Bark,
  take: number,
  sampleRate: number,
): Float32Array<ArrayBuffer> {
  let seed = (take + 1) * 2654435761;
  const rand = (): number => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 4294967296;
  };
  const vary = (amount: number): number => 1 + (rand() * 2 - 1) * amount;
  const pitchK = vary(0.07);
  const vowelK = vary(0.06);
  const length = bark.length * vary(0.12);
  const tail = 0.04;
  const n = Math.ceil((length + tail) * sampleRate);
  const out = new Float32Array(n);

  // 1. The source: jittery vocal pulses plus breath.
  const source = new Float32Array(n);
  const [p0, p1, p2] = bark.pitch.map((p) => p * pitchK) as [number, number, number];
  const pitchAt = (k: number): number =>
    k < bark.peakAt
      ? p0 * (p1 / p0) ** (k / bark.peakAt)
      : p1 * (p2 / p1) ** ((k - bark.peakAt) / (1 - bark.peakAt));
  let nextPulse = 0;
  let pulseIndex = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const k = Math.min(1, t / length);
    if (i >= nextPulse && t < length) {
      const period = (sampleRate / pitchAt(k)) * vary(bark.jitter);
      const strength = vary(bark.shimmer) * (pulseIndex % 2 === 1 ? 1 - bark.growl : 1);
      // A vocal pulse: a sharp kick that dies away over part of the period.
      const width = Math.max(2, Math.floor(period * 0.45));
      for (let j = 0; j < width && i + j < n; j++) {
        const x = j / width;
        source[i + j] = (source[i + j] ?? 0) + strength * (1 - x) ** 3 * (j === 0 ? 1 : 0.85);
      }
      nextPulse = i + period;
      pulseIndex++;
    }
    // Breath: strongest at the onset and through the tail.
    const breathAmount = bark.breath * (0.5 + 0.8 * Math.max(0, 1 - k * 5) + 0.6 * k);
    source[i] = (source[i] ?? 0) + (rand() * 2 - 1) * breathAmount * 0.6;
  }

  // 2. The mouth: three broad formants gliding through the vowels, filter state carried across.
  const vowelAt = (f: number, k: number): number => {
    const [a, b, c] = bark.vowel.map((v) => (v[f] ?? 1000) * vowelK) as [number, number, number];
    return k < 0.35 ? a + (b - a) * (k / 0.35) : b + (c - b) * ((k - 0.35) / 0.65);
  };
  const weights = [1, 0.7, 0.35];
  for (let f = 0; f < 3; f++) {
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    let b0 = 0;
    let b2 = 0;
    let a1 = 0;
    let a2 = 0;
    const q = bark.q[f] ?? 3;
    for (let i = 0; i < n; i++) {
      if (i % 32 === 0) {
        // A band-pass (RBJ cookbook, constant 0 dB peak), retuned as the vowel glides.
        const freq = vowelAt(f, Math.min(1, i / sampleRate / length));
        const w = (2 * Math.PI * Math.min(freq, sampleRate * 0.45)) / sampleRate;
        const alpha = Math.sin(w) / (2 * q);
        const a0 = 1 + alpha;
        b0 = alpha / a0;
        b2 = -alpha / a0;
        a1 = (-2 * Math.cos(w)) / a0;
        a2 = (1 - alpha) / a0;
      }
      const x = source[i] ?? 0;
      const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      out[i] = (out[i] ?? 0) + y * (weights[f] ?? 0.5);
    }
  }

  // 3. The envelope (in fast, out quick), then grit.
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const rise = Math.min(1, t / bark.onset);
    // Peaks early and dies away, as a bark does (not a flat slab of sound).
    const fall = t < length * 0.22 ? 1 : Math.exp(-((t - length * 0.22) / (length * 0.32)));
    const v = Math.tanh((out[i] ?? 0) * rise * fall * bark.drive * 1.3);
    out[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  // Fade the very end to silence (no click), and level to a peak of 1.
  const fadeFrom = n - Math.floor(tail * sampleRate * 0.5);
  for (let i = 0; i < n; i++) {
    const fade = i < fadeFrom ? 1 : 1 - (i - fadeFrom) / (n - fadeFrom);
    out[i] = ((out[i] ?? 0) / (peak || 1)) * fade;
  }
  return out;
}
