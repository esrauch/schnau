/** Encode audio channels (Float32, -1..1) as a 16-bit PCM WAV file. Pure, for tooling and tests. */
export function encodeWav(channels: readonly Float32Array[], sampleRate: number): Uint8Array {
  const numChannels = channels.length;
  const length = channels[0]?.length ?? 0;
  const dataBytes = length * numChannels * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);
  const str = (at: number, s: string) =>
    [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));

  str(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, dataBytes, true);

  let at = 44;
  for (let i = 0; i < length; i++) {
    for (const ch of channels) {
      const s = Math.max(-1, Math.min(1, ch[i] ?? 0));
      view.setInt16(at, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      at += 2;
    }
  }
  return new Uint8Array(buf);
}

/** Peak and RMS levels in dBFS, for checking a mix. */
export function levels(channels: readonly Float32Array[]): { peakDb: number; rmsDb: number } {
  let peak = 0;
  let sum = 0;
  let n = 0;
  for (const ch of channels) {
    for (const s of ch) {
      const a = Math.abs(s);
      if (a > peak) peak = a;
      sum += s * s;
      n++;
    }
  }
  const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
  return { peakDb: db(peak), rmsDb: db(Math.sqrt(sum / Math.max(1, n))) };
}
