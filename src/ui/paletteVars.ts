import { common } from '../content/palettes';

/** Expose the shared palette as CSS custom properties (e.g. `--pumpkin`). */
export function applyPaletteVars(root: HTMLElement = document.documentElement): void {
  for (const [name, hex] of Object.entries(common)) {
    root.style.setProperty(`--${toKebab(name)}`, hex);
  }
}

function toKebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
