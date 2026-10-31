import { Game } from './game/game';
import { applyPaletteVars } from './ui/paletteVars';

applyPaletteVars();

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const ui = document.querySelector<HTMLDivElement>('#ui');
if (!canvas || !ui) throw new Error('index.html is missing #game or #ui');

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || Math.floor(Math.random() * 1e9);
const game = new Game(canvas, ui, { seed });

// Dev builds expose the game for debugging from the console.
if (import.meta.env.DEV) Object.assign(window, { game });
