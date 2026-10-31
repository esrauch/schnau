/**
 * Dev page for the beat clock: a metronome, tap judging, latency
 * calibration and timing readouts. Open /dev/beat.html on a real phone.
 */
import { installVisibilityPause, unlockAudio } from '../audio/context';
import { scheduleClick } from '../audio/metronome';
import { Calibration } from '../beat/calibration';
import { BeatClock } from '../beat/clock';
import { tuning } from '../content/tuning';
import { loadSettings, saveSettings } from '../settings';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};

const pulse = $('pulse');
const barDots = [...$('bar').children] as HTMLElement[];
const verdict = $('verdict');
const stats = $('stats');
const histogram = $<HTMLCanvasElement>('histogram');
const pad = $('pad');
const startBtn = $<HTMLButtonElement>('start');
const calibrateBtn = $<HTMLButtonElement>('calibrate');
const bpmInput = $<HTMLInputElement>('bpm');
const bpmValue = $('bpmValue');
const windowInput = $<HTMLInputElement>('window');
const windowValue = $('windowValue');
const hapticsInput = $<HTMLInputElement>('haptics');
const resetOffsetBtn = $<HTMLButtonElement>('resetOffset');

const settings = loadSettings();
let ctx: AudioContext | null = null;
let clock: BeatClock | null = null;
let calibration: Calibration | null = null;
let windowMs = tuning.beat.onBeatWindow * 1000;
const recentOffsetsMs: number[] = [];
const frameTimes: number[] = [];
let lastFrame = performance.now();
let lastHeardBeat: number | null = null;

bpmInput.value = String(tuning.beat.defaultBpm);
windowInput.value = String(windowMs);
hapticsInput.checked = settings.haptics;
syncLabels();

startBtn.addEventListener('click', async () => {
  ctx = await unlockAudio();
  if (!clock) {
    clock = new BeatClock(ctx);
    clock.onBeatScheduled((index, time) => {
      if (ctx) scheduleClick(ctx, time, index % 4 === 0);
    });
  }
  if (clock.running) {
    clock.stop();
    calibration = null;
    startBtn.textContent = 'Start';
    calibrateBtn.disabled = true;
    setVerdict('Stopped', '');
  } else {
    clock.start(Number(bpmInput.value));
    startBtn.textContent = 'Stop';
    calibrateBtn.disabled = false;
    setVerdict('Tap along', '');
  }
});

calibrateBtn.addEventListener('click', () => {
  calibration = new Calibration(tuning.calibration.warmupTaps, tuning.calibration.measuredTaps);
  setVerdict(`Calibrating: tap ${calibration.remaining} times`, '');
});

bpmInput.addEventListener('input', () => {
  syncLabels();
  if (clock?.running) clock.start(Number(bpmInput.value));
});

windowInput.addEventListener('input', () => {
  windowMs = Number(windowInput.value);
  syncLabels();
});

hapticsInput.addEventListener('change', () => {
  settings.haptics = hapticsInput.checked;
  saveSettings(settings);
});

resetOffsetBtn.addEventListener('click', () => {
  settings.audioOffsetMs = 0;
  saveSettings(settings);
  recentOffsetsMs.length = 0;
});

pad.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  if (!clock?.running) return;

  if (calibration) {
    const raw = clock.judgeTap(event.timeStamp, 0, windowMs / 1000);
    if (!raw) return;
    calibration.addTap(raw.offset);
    flashPad('onBeat');
    const result = calibration.result();
    if (result === null) {
      setVerdict(`Calibrating: tap ${calibration.remaining} more`, '');
    } else {
      settings.audioOffsetMs = Math.round(result * 1000);
      saveSettings(settings);
      calibration = null;
      recentOffsetsMs.length = 0;
      setVerdict(`Calibrated: ${signed(settings.audioOffsetMs)} ms`, 'onBeat');
    }
    return;
  }

  const result = clock.judgeTap(event.timeStamp, settings.audioOffsetMs / 1000, windowMs / 1000);
  if (!result) return;
  const ms = Math.round(result.offset * 1000);
  recentOffsetsMs.push(ms);
  if (recentOffsetsMs.length > 32) recentOffsetsMs.shift();
  const label = result.judgement === 'onBeat' ? 'ON BEAT!' : ms < 0 ? 'Early' : 'Late';
  setVerdict(`${label}  ${signed(ms)} ms  → beat ${result.resolvesOn}`, result.judgement);
  flashPad(result.judgement);
});

installVisibilityPause((hidden) => {
  if (hidden) setVerdict('Paused (tab hidden)', '');
});

requestAnimationFrame(frame);

function frame(now: number): void {
  frameTimes.push(now - lastFrame);
  if (frameTimes.length > 60) frameTimes.shift();
  lastFrame = now;

  const pos = clock?.position(now) ?? null;
  if (pos && pos.index >= 0) {
    const kick = Math.pow(1 - pos.phase, 3);
    pulse.style.transform = `translateY(${-kick * 14}px) scale(${1 + kick * 0.25}, ${1 - kick * 0.1})`;
    barDots.forEach((dot, i) => dot.classList.toggle('on', i === pos.index % 4));
    if (pos.index !== lastHeardBeat) {
      lastHeardBeat = pos.index;
      if (settings.haptics) navigator.vibrate?.(12);
    }
  }

  drawHistogram();
  renderStats(pos);
  requestAnimationFrame(frame);
}

function renderStats(pos: { index: number; phase: number } | null): void {
  const avgFrame = frameTimes.reduce((a, b) => a + b, 0) / Math.max(1, frameTimes.length);
  const maxFrame = Math.max(0, ...frameTimes);
  const n = recentOffsetsMs.length;
  const mean = n ? recentOffsetsMs.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n ? Math.sqrt(recentOffsetsMs.reduce((a, b) => a + (b - mean) ** 2, 0) / n) : 0;
  const onBeat = n ? recentOffsetsMs.filter((o) => Math.abs(o) <= windowMs).length : 0;
  stats.textContent = [
    `audio: ${ctx?.state ?? 'locked'} · ${ctx?.sampleRate ?? '-'} Hz`,
    `latency: base ${ms(ctx?.baseLatency)} · output ${ms(ctx?.outputLatency)} · ` +
      `outputTimestamp ${ctx && 'getOutputTimestamp' in ctx ? 'yes' : 'no'}`,
    `calibration offset: ${signed(settings.audioOffsetMs)} ms`,
    `beat: ${pos ? `${pos.index} (${(pos.phase * 100).toFixed(0)}%)` : '-'} · bpm ${clock?.bpm ?? '-'}`,
    `last ${n} taps: mean ${signed(Math.round(mean))} ms · spread ±${sd.toFixed(0)} ms · ` +
      `on-beat ${onBeat}/${n}`,
    `frame: avg ${avgFrame.toFixed(1)} ms · max ${maxFrame.toFixed(1)} ms`,
  ].join('\n');
}

function drawHistogram(): void {
  const dpr = Math.min(window.devicePixelRatio, 2);
  const w = histogram.clientWidth * dpr;
  const h = histogram.clientHeight * dpr;
  if (histogram.width !== w) histogram.width = w;
  if (histogram.height !== h) histogram.height = h;
  const g = histogram.getContext('2d');
  if (!g) return;

  const range = 250; // ms either side of the beat
  const x = (ms: number): number => ((ms + range) / (2 * range)) * w;
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(156, 255, 46, 0.15)';
  g.fillRect(x(-windowMs), 0, x(windowMs) - x(-windowMs), h);
  g.fillStyle = 'rgba(247, 241, 227, 0.5)';
  g.fillRect(x(0) - dpr / 2, 0, dpr, h);

  recentOffsetsMs.forEach((o, i) => {
    const age = (i + 1) / recentOffsetsMs.length;
    g.fillStyle = Math.abs(o) <= windowMs ? '#9cff2e' : '#ff8a1f';
    g.globalAlpha = 0.25 + 0.75 * age;
    g.fillRect(x(Math.max(-range, Math.min(range, o))) - 2 * dpr, h * 0.2, 4 * dpr, h * 0.6);
  });
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(247, 241, 227, 0.6)';
  g.font = `${10 * dpr}px system-ui`;
  g.fillText('early', 4 * dpr, h - 4 * dpr);
  g.fillText('late', w - 26 * dpr, h - 4 * dpr);
}

function setVerdict(text: string, cls: string): void {
  verdict.textContent = text;
  verdict.className = cls;
}

let flashTimer: ReturnType<typeof setTimeout> | undefined;
function flashPad(judgement: string): void {
  pad.className = `flash-${judgement}`;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (pad.className = ''), 90);
}

function syncLabels(): void {
  bpmValue.textContent = bpmInput.value;
  windowValue.textContent = windowInput.value;
}

function ms(seconds: number | undefined): string {
  return seconds === undefined ? '-' : `${(seconds * 1000).toFixed(1)}ms`;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}
