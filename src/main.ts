import { Game } from './game/game';
import { installErrorOverlay } from './dev/errorOverlay';
import { applyPaletteVars } from './ui/paletteVars';

if (import.meta.env.DEV) installErrorOverlay();

applyPaletteVars();

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const ui = document.querySelector<HTMLDivElement>('#ui');
if (!canvas || !ui) throw new Error('index.html is missing #game or #ui');

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || Math.floor(Math.random() * 1e9);
// ?outline=0 turns off the cel line art; ?contour=white|black|off picks the hero's outer contour.
const CONTOURS: Record<string, number | null> = { white: 0xffffff, black: 0x1f2430, off: null };
const game = new Game(canvas, ui, {
  seed,
  outline: params.get('outline') !== '0',
  contour: CONTOURS[params.get('contour') ?? 'white'] ?? null,
});

// Dev builds expose the game for debugging from the console.
if (import.meta.env.DEV) Object.assign(window, { game });
