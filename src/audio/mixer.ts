/**
 * The mixer (TECHNICAL.md §8): every sound goes to one of three buses, which
 * feed a master gain and a gentle compressor so nothing clips.
 */
import { tuning } from '../content/tuning';

export interface Mixer {
  readonly master: GainNode;
  readonly music: GainNode;
  readonly sfx: GainNode;
  readonly ui: GainNode;
}

const mixers = new WeakMap<BaseAudioContext, Mixer>();

export function getMixer(ctx: AudioContext): Mixer {
  let mixer = mixers.get(ctx);
  if (mixer) return mixer;
  const master = ctx.createGain();
  master.gain.value = tuning.audio.master;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.15;
  master.connect(compressor).connect(ctx.destination);
  const bus = (level: number): GainNode => {
    const g = ctx.createGain();
    g.gain.value = level;
    g.connect(master);
    return g;
  };
  mixer = {
    master,
    music: bus(tuning.audio.music),
    sfx: bus(tuning.audio.sfx),
    ui: bus(tuning.audio.ui),
  };
  mixers.set(ctx, mixer);
  return mixer;
}
