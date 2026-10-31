/**
 * The built-in synth's voices (TECHNICAL.md §8): a handful of simple
 * oscillator, noise and filter recipes. Each schedules one note into any
 * audio context (usually an OfflineAudioContext while rendering a stem).
 */

export type InstrumentId =
  | 'kick'
  | 'snare'
  | 'hat'
  | 'clap'
  | 'brush'
  | 'bass'
  | 'organ'
  | 'lead'
  | 'pluck'
  | 'theremin'
  | 'banjo'
  | 'fiddle'
  | 'calliope'
  | 'glock'
  | 'tuba'
  | 'choir'
  | 'piano'
  | 'sax'
  | 'croak'
  | 'caw'
  | 'creak'
  | 'bubble'
  | 'howl'
  | 'cowbell'
  | 'moo';

export interface NoteArgs {
  readonly ctx: BaseAudioContext;
  readonly out: AudioNode;
  readonly time: number;
  /** How long the note is held, in seconds. */
  readonly duration: number;
  readonly freqs: readonly number[];
  readonly velocity: number;
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** One second of white noise per context, shared by every noisy voice. */
export function noise(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // A fixed seed keeps renders identical from run to run.
    let seed = 12345;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    noiseBuffers.set(ctx, buf);
  }
  return buf;
}

/** An attack/decay/sustain/release gain envelope, returned so a voice can connect into it. */
function envelope(
  ctx: BaseAudioContext,
  out: AudioNode,
  time: number,
  peak: number,
  attack: number,
  decay: number,
  sustain: number,
  hold: number,
  release: number,
): GainNode {
  const g = ctx.createGain();
  const p = g.gain;
  p.setValueAtTime(0.0001, time);
  p.linearRampToValueAtTime(peak, time + attack);
  p.setTargetAtTime(peak * sustain, time + attack, decay / 3);
  const end = time + Math.max(hold, attack);
  p.setValueAtTime(peak * sustain, end);
  p.setTargetAtTime(0.0001, end, release / 3);
  g.connect(out);
  return g;
}

function osc(
  ctx: BaseAudioContext,
  type: OscillatorType,
  freq: number,
  time: number,
  stop: number,
) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, time);
  o.start(time);
  o.stop(stop);
  return o;
}

function noiseSource(ctx: BaseAudioContext, time: number, stop: number): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  src.loop = true;
  src.start(time, Math.random() * 0.5);
  src.stop(stop);
  return src;
}

export const INSTRUMENTS: Record<InstrumentId, (a: NoteArgs) => void> = {
  kick({ ctx, out, time, velocity }) {
    const o = osc(ctx, 'sine', 150, time, time + 0.4);
    o.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    const g = envelope(ctx, out, time, velocity, 0.002, 0.25, 0, 0.002, 0.2);
    o.connect(g);
  },

  snare({ ctx, out, time, velocity }) {
    const n = noiseSource(ctx, time, time + 0.3);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1400;
    n.connect(hp).connect(envelope(ctx, out, time, velocity * 0.7, 0.001, 0.12, 0, 0.001, 0.1));
    const body = osc(ctx, 'triangle', 190, time, time + 0.15);
    body.frequency.exponentialRampToValueAtTime(120, time + 0.08);
    body.connect(envelope(ctx, out, time, velocity * 0.5, 0.001, 0.06, 0, 0.001, 0.05));
  },

  hat({ ctx, out, time, velocity }) {
    const open = velocity >= 1;
    const n = noiseSource(ctx, time, time + (open ? 0.3 : 0.1));
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7500;
    n.connect(hp).connect(
      envelope(ctx, out, time, velocity * 0.35, 0.001, open ? 0.2 : 0.04, 0, 0.001, 0.03),
    );
  },

  bass({ ctx, out, time, duration, freqs, velocity }) {
    for (const f of freqs) {
      const o = osc(ctx, 'sawtooth', f, time, time + duration + 0.3);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 6;
      lp.frequency.setValueAtTime(1400, time);
      lp.frequency.setTargetAtTime(420, time, 0.06);
      o.connect(lp).connect(
        envelope(ctx, out, time, velocity * 0.6, 0.004, 0.15, 0.55, duration * 0.9, 0.06),
      );
    }
  },

  organ({ ctx, out, time, duration, freqs, velocity }) {
    // Drawbars: fundamental plus a few harmonics, with a slow wobble for spookiness.
    const wave = ctx.createPeriodicWave(
      new Float32Array([0, 1, 0.6, 0.35, 0.2, 0, 0.12]),
      new Float32Array(7),
    );
    const lfo = osc(ctx, 'sine', 5.5, time, time + duration + 0.3);
    for (const f of freqs) {
      const o = ctx.createOscillator();
      o.setPeriodicWave(wave);
      o.frequency.setValueAtTime(f, time);
      const depth = ctx.createGain();
      depth.gain.value = f * 0.006;
      lfo.connect(depth).connect(o.frequency);
      o.start(time);
      o.stop(time + duration + 0.3);
      o.connect(
        envelope(
          ctx,
          out,
          time,
          (velocity * 0.22) / Math.sqrt(freqs.length),
          0.01,
          0.1,
          0.8,
          duration * 0.85,
          0.08,
        ),
      );
    }
  },

  lead({ ctx, out, time, duration, freqs, velocity }) {
    // A twangy, slightly driven surf-guitar-ish pluck with a little vibrato as it rings.
    for (const f of freqs) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 3;
      lp.frequency.setValueAtTime(5000, time);
      lp.frequency.setTargetAtTime(1600, time, 0.12);
      const env = envelope(
        ctx,
        out,
        time,
        velocity * 0.32,
        0.003,
        0.35,
        0.45,
        duration * 0.95,
        0.12,
      );
      lp.connect(env);
      const vib = osc(ctx, 'sine', 6, time, time + duration + 0.4);
      const vibDepth = ctx.createGain();
      vibDepth.gain.setValueAtTime(0, time);
      vibDepth.gain.linearRampToValueAtTime(f * 0.012, time + Math.min(0.3, duration));
      vib.connect(vibDepth);
      for (const [type, detune] of [
        ['sawtooth', -6],
        ['square', 6],
      ] as const) {
        const o = osc(ctx, type, f, time, time + duration + 0.4);
        o.detune.value = detune;
        vibDepth.connect(o.frequency);
        o.connect(lp);
      }
    }
  },

  pluck({ ctx, out, time, duration, freqs, velocity }) {
    for (const f of freqs) {
      const o = osc(ctx, 'triangle', f, time, time + duration + 0.3);
      o.connect(envelope(ctx, out, time, velocity * 0.4, 0.002, 0.18, 0.2, duration * 0.6, 0.1));
    }
  },

  clap({ ctx, out, time, velocity }) {
    // Three quick noise slaps and a short room tail.
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1300;
    bp.Q.value = 1.2;
    bp.connect(out);
    for (const [at, level, decay] of [
      [0, 0.8, 0.01],
      [0.011, 0.7, 0.01],
      [0.022, 1, 0.12],
    ] as const) {
      const n = noiseSource(ctx, time + at, time + at + 0.3);
      n.connect(envelope(ctx, bp, time + at, velocity * level, 0.001, decay, 0, 0.001, decay));
    }
  },

  brush({ ctx, out, time, velocity }) {
    // A brushed snare: a soft swish of filtered noise. An accent (X) is a longer sweep.
    const long = velocity >= 1;
    const n = noiseSource(ctx, time, time + 0.5);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2600, time);
    bp.frequency.linearRampToValueAtTime(4200, time + (long ? 0.25 : 0.08));
    bp.Q.value = 0.7;
    n.connect(bp).connect(
      envelope(
        ctx,
        out,
        time,
        velocity * 0.45,
        long ? 0.04 : 0.006,
        long ? 0.25 : 0.09,
        0,
        0.001,
        0.08,
      ),
    );
  },

  theremin({ ctx, out, time, duration, freqs, velocity }) {
    // A sine with a wide, slow-blooming vibrato and a soft swell: the B-movie wail.
    for (const f of freqs) {
      const o = osc(ctx, 'sine', f, time, time + duration + 0.5);
      const o2 = osc(ctx, 'triangle', f * 2, time, time + duration + 0.5);
      const vib = osc(ctx, 'sine', 5.2, time, time + duration + 0.5);
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(f * 0.004, time);
      depth.gain.linearRampToValueAtTime(f * 0.022, time + Math.min(0.5, duration));
      vib.connect(depth);
      depth.connect(o.frequency);
      const d2 = ctx.createGain();
      d2.gain.value = 2;
      depth.connect(d2).connect(o2.frequency);
      const env = envelope(ctx, out, time, velocity * 0.42, 0.07, 0.2, 0.85, duration * 0.95, 0.18);
      o.connect(env);
      const soft = ctx.createGain();
      soft.gain.value = 0.12;
      o2.connect(soft).connect(env);
    }
  },

  banjo({ ctx, out, time, duration, freqs, velocity }) {
    // A bright, nasal pluck that dies fast: a sawtooth through a snapping filter.
    for (const f of freqs) {
      const o = osc(ctx, 'sawtooth', f, time, time + duration + 0.3);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(Math.min(9000, f * 6), time);
      bp.frequency.setTargetAtTime(f * 2, time, 0.05);
      o.connect(bp).connect(
        envelope(ctx, out, time, velocity * 0.55, 0.001, 0.12, 0.08, 0.05, 0.1),
      );
    }
  },

  fiddle({ ctx, out, time, duration, freqs, velocity }) {
    // A bowed string: a slurred attack, a rich sawtooth through a body resonance, and vibrato.
    for (const f of freqs) {
      const vib = osc(ctx, 'sine', 6.3, time, time + duration + 0.3);
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, time);
      depth.gain.linearRampToValueAtTime(f * 0.009, time + Math.min(0.25, duration));
      vib.connect(depth);
      const body = ctx.createBiquadFilter();
      body.type = 'peaking';
      body.frequency.value = 2400;
      body.gain.value = 6;
      body.Q.value = 1.5;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 5200;
      body
        .connect(lp)
        .connect(envelope(ctx, out, time, velocity * 0.24, 0.035, 0.1, 0.8, duration * 0.92, 0.08));
      for (const detune of [-5, 5]) {
        const o = osc(ctx, 'sawtooth', f, time, time + duration + 0.3);
        o.detune.value = detune;
        depth.connect(o.frequency);
        o.connect(body);
      }
    }
  },

  calliope({ ctx, out, time, duration, freqs, velocity }) {
    // A steam whistle: a breathy, fluttering flute tone with its octave on top.
    for (const f of freqs) {
      const vib = osc(ctx, 'sine', 7.5, time, time + duration + 0.3);
      const depth = ctx.createGain();
      depth.gain.value = f * 0.008;
      vib.connect(depth);
      const env = envelope(
        ctx,
        out,
        time,
        (velocity * 0.3) / Math.sqrt(freqs.length),
        0.015,
        0.08,
        0.75,
        duration * 0.85,
        0.06,
      );
      for (const [mult, level] of [
        [1, 1],
        [2, 0.35],
        [3, 0.12],
      ] as const) {
        const o = osc(ctx, 'sine', f * mult, time, time + duration + 0.3);
        depth.connect(o.frequency);
        const g = ctx.createGain();
        g.gain.value = level;
        o.connect(g).connect(env);
      }
      const n = noiseSource(ctx, time, time + duration + 0.3);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f * 2;
      bp.Q.value = 4;
      const breath = ctx.createGain();
      breath.gain.value = 0.25;
      n.connect(bp).connect(breath).connect(env);
    }
  },

  glock({ ctx, out, time, freqs, velocity }) {
    // A struck bar: a pure tone with a bright, inharmonic ping that rings off.
    for (const f of freqs) {
      osc(ctx, 'sine', f, time, time + 1.6).connect(
        envelope(ctx, out, time, velocity * 0.3, 0.001, 1.2, 0, 0.001, 0.4),
      );
      osc(ctx, 'sine', f * 2.76, time, time + 0.5).connect(
        envelope(ctx, out, time, velocity * 0.12, 0.001, 0.25, 0, 0.001, 0.1),
      );
      osc(ctx, 'sine', f * 5.4, time, time + 0.2).connect(
        envelope(ctx, out, time, velocity * 0.05, 0.001, 0.08, 0, 0.001, 0.05),
      );
    }
  },

  tuba({ ctx, out, time, duration, freqs, velocity }) {
    // A round brass bass: a soft square, filtered dark, with a little lip at the start.
    for (const f of freqs) {
      const o = osc(ctx, 'square', f, time, time + duration + 0.3);
      o.frequency.setValueAtTime(f * 0.97, time);
      o.frequency.linearRampToValueAtTime(f, time + 0.04);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 1;
      lp.frequency.setValueAtTime(380, time);
      lp.frequency.linearRampToValueAtTime(900, time + 0.05);
      lp.frequency.setTargetAtTime(500, time + 0.05, 0.1);
      o.connect(lp).connect(
        envelope(ctx, out, time, velocity * 0.6, 0.02, 0.12, 0.7, duration * 0.8, 0.07),
      );
    }
  },

  choir({ ctx, out, time, duration, freqs, velocity }) {
    // "Ooh": detuned sawtooths through two vowel formants, swelling in slowly.
    for (const f of freqs) {
      const env = envelope(
        ctx,
        out,
        time,
        (velocity * 0.5) / Math.sqrt(freqs.length),
        0.12,
        0.3,
        0.85,
        duration * 0.95,
        0.25,
      );
      const formants = [
        [380, 6, 1],
        [900, 8, 0.45],
      ] as const;
      const mix = ctx.createGain();
      mix.gain.value = 1;
      for (const [freq, q, level] of formants) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = freq;
        bp.Q.value = q;
        const g = ctx.createGain();
        g.gain.value = level;
        mix.connect(bp).connect(g).connect(env);
      }
      for (const detune of [-9, 0, 9]) {
        const o = osc(ctx, 'sawtooth', f, time, time + duration + 0.5);
        o.detune.value = detune;
        o.connect(mix);
      }
    }
  },

  piano({ ctx, out, time, duration, freqs, velocity }) {
    // A honky-tonk upright: two slightly detuned bright tones with a hammer's decay.
    for (const f of freqs) {
      const env = envelope(
        ctx,
        out,
        time,
        (velocity * 0.32) / Math.sqrt(freqs.length),
        0.002,
        0.5,
        0.15,
        duration * 0.9,
        0.15,
      );
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(Math.min(10000, f * 8), time);
      lp.frequency.setTargetAtTime(f * 3, time, 0.2);
      lp.connect(env);
      for (const [type, detune] of [
        ['triangle', -7],
        ['sawtooth', 7],
      ] as const) {
        const o = osc(ctx, type, f, time, time + duration + 0.4);
        o.detune.value = detune;
        const g = ctx.createGain();
        g.gain.value = type === 'sawtooth' ? 0.35 : 1;
        o.connect(g).connect(lp);
      }
    }
  },

  sax({ ctx, out, time, duration, freqs, velocity }) {
    // A honking tenor: a reedy square with a bit of growl, a nasal formant and a late vibrato.
    for (const f of freqs) {
      const vib = osc(ctx, 'sine', 5.5, time, time + duration + 0.3);
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, time);
      depth.gain.setValueAtTime(0, time + Math.min(0.2, duration * 0.5));
      depth.gain.linearRampToValueAtTime(f * 0.01, time + Math.min(0.45, duration));
      vib.connect(depth);
      const o = osc(ctx, 'square', f, time, time + duration + 0.3);
      o.frequency.setValueAtTime(f * 0.94, time);
      o.frequency.linearRampToValueAtTime(f, time + 0.05);
      depth.connect(o.frequency);
      const growl = osc(ctx, 'sawtooth', f * 0.5, time, time + duration + 0.3);
      const growlLevel = ctx.createGain();
      growlLevel.gain.value = 0.2;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1150;
      bp.Q.value = 0.9;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3800;
      o.connect(bp);
      growl.connect(growlLevel).connect(bp);
      bp.connect(lp).connect(
        envelope(ctx, out, time, velocity * 0.5, 0.02, 0.15, 0.75, duration * 0.9, 0.07),
      );
    }
  },

  croak({ ctx, out, time, freqs, velocity }) {
    // A frog: a buzzy blip that drops in pitch, ribbit-ribbit (two quick pulses).
    for (const f of freqs) {
      for (const at of [0, 0.07]) {
        const o = osc(ctx, 'square', f * 1.6, time + at, time + at + 0.09);
        o.frequency.exponentialRampToValueAtTime(f, time + at + 0.06);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        lp.Q.value = 5;
        o.connect(lp).connect(
          envelope(ctx, out, time + at, velocity * 0.5, 0.003, 0.05, 0, 0.001, 0.03),
        );
      }
    }
  },

  creak({ ctx, out, time, duration, velocity }) {
    // A coffin lid creaking open: slow, uneven clicks of wood through a narrow resonance,
    // the clicks speeding up and the pitch rising as it opens.
    const o = osc(ctx, 'sawtooth', 18, time, time + duration + 0.2);
    o.frequency.linearRampToValueAtTime(42, time + duration * 0.7);
    o.frequency.linearRampToValueAtTime(26, time + duration);
    const wobble = osc(ctx, 'sine', 3.3, time, time + duration + 0.2);
    const depth = ctx.createGain();
    depth.gain.value = 7;
    wobble.connect(depth).connect(o.frequency);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 14;
    bp.frequency.setValueAtTime(700, time);
    bp.frequency.linearRampToValueAtTime(1300, time + duration);
    o.connect(bp).connect(
      envelope(ctx, out, time, velocity * 0.9, 0.08, 0.2, 0.9, duration * 0.9, 0.15),
    );
  },

  bubble({ ctx, out, time, freqs, velocity }) {
    // A cauldron bubble: a quick sine blip that pops upward.
    for (const f of freqs) {
      const o = osc(ctx, 'sine', f, time, time + 0.12);
      o.frequency.exponentialRampToValueAtTime(f * 2.6, time + 0.07);
      o.connect(envelope(ctx, out, time, velocity * 0.4, 0.004, 0.05, 0, 0.001, 0.03));
    }
  },

  howl({ ctx, out, time, duration, freqs, velocity }) {
    // A wolf howl: a breathy tone that swoops up, holds wavering, and sags away.
    for (const f of freqs) {
      const end = time + Math.max(0.3, duration);
      const o = osc(ctx, 'sine', f * 0.8, time, end + 0.3);
      o.frequency.exponentialRampToValueAtTime(f * 1.5, time + (end - time) * 0.35);
      o.frequency.setValueAtTime(f * 1.5, time + (end - time) * 0.6);
      o.frequency.exponentialRampToValueAtTime(f * 0.9, end);
      const vib = osc(ctx, 'sine', 5, time, end + 0.3);
      const depth = ctx.createGain();
      depth.gain.value = f * 0.025;
      vib.connect(depth).connect(o.frequency);
      const env = envelope(ctx, out, time, velocity * 0.4, 0.15, 0.3, 0.8, end - time, 0.25);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2200;
      o.connect(lp).connect(env);
      const n = noiseSource(ctx, time, end + 0.3);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f * 1.5;
      bp.Q.value = 3;
      const breath = ctx.createGain();
      breath.gain.value = 0.18;
      n.connect(bp).connect(breath).connect(env);
    }
  },

  cowbell({ ctx, out, time, velocity }) {
    // Two clanging squares through a hollow resonance, ringing off fast.
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 2.5;
    const env = envelope(ctx, out, time, velocity * 0.45, 0.001, 0.22, 0, 0.001, 0.1);
    bp.connect(env);
    for (const f of [545, 815]) osc(ctx, 'square', f, time, time + 0.4).connect(bp);
  },

  moo({ ctx, out, time, duration, freqs, velocity }) {
    // A ghostly cow: a low, nasal "mmmooo" that swells and sags in pitch.
    for (const f of freqs) {
      const end = time + Math.max(0.4, duration);
      const o = osc(ctx, 'sawtooth', f * 1.12, time, end + 0.3);
      o.frequency.exponentialRampToValueAtTime(f, time + 0.25);
      o.frequency.exponentialRampToValueAtTime(f * 0.82, end);
      const vib = osc(ctx, 'sine', 4.5, time, end + 0.3);
      const depth = ctx.createGain();
      depth.gain.value = f * 0.02;
      vib.connect(depth).connect(o.frequency);
      const env = envelope(ctx, out, time, velocity * 0.7, 0.12, 0.3, 0.85, end - time, 0.2);
      // "Mm" opening into "ooo": the low formant rises a little as the mouth opens.
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.Q.value = 5;
      f1.frequency.setValueAtTime(250, time);
      f1.frequency.linearRampToValueAtTime(420, time + 0.3);
      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.Q.value = 7;
      f2.frequency.value = 850;
      const g2 = ctx.createGain();
      g2.gain.value = 0.4;
      o.connect(f1).connect(env);
      o.connect(f2).connect(g2).connect(env);
    }
  },

  caw({ ctx, out, time, freqs, velocity }) {
    // A crow: a raspy, falling squawk.
    for (const f of freqs) {
      const o = osc(ctx, 'sawtooth', f, time, time + 0.35);
      o.frequency.setValueAtTime(f * 1.15, time);
      o.frequency.exponentialRampToValueAtTime(f * 0.75, time + 0.28);
      const n = noiseSource(ctx, time, time + 0.35);
      const rasp = ctx.createGain();
      rasp.gain.value = 0.5;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1500;
      bp.Q.value = 2.5;
      o.connect(bp);
      n.connect(rasp).connect(bp);
      bp.connect(envelope(ctx, out, time, velocity * 0.55, 0.01, 0.12, 0.6, 0.18, 0.06));
    }
  },
};

/** A soft clipper, for a little drive. */
export function softClip(ctx: BaseAudioContext, amount: number): WaveShaperNode {
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * (1 + amount * 4)) / Math.tanh(1 + amount * 4);
  }
  shaper.curve = curve;
  return shaper;
}
