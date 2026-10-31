/**
 * A synthesized metronome click, scheduled at exact context times. Beat 0 of
 * each bar is accented. Placeholder audio for the beat-clock spike.
 */
export function scheduleClick(ctx: AudioContext, time: number, accent: boolean): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(accent ? 1760 : 1046.5, time);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(accent ? 0.35 : 0.2, time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
  osc.connect(gain).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.06);
}
