/**
 * The HUD (GAMEPLAY.md): treats in the jar, the dog's hearts, bones, the
 * dragon's courage while it's here, pop-up messages, and the start (pick a
 * dog) and end screens. Plain DOM over the canvas.
 */
import type { DogKind } from '../content/gameTuning';
import './hud.css';

export interface HudState {
  readonly jar: number;
  readonly hearts: number;
  readonly maxHearts: number;
  readonly bones: number;
  /** The dragon's courage left (0..1), or null when there's no dragon. */
  readonly dragon: number | null;
}

export class Hud {
  private readonly root: HTMLDivElement;
  private readonly jar: HTMLDivElement;
  private readonly hearts: HTMLDivElement;
  private readonly bones: HTMLDivElement;
  private readonly dragon: HTMLDivElement;
  private readonly dragonFill: HTMLDivElement;
  private readonly message: HTMLDivElement;
  private readonly screen: HTMLDivElement;
  private readonly arrows: HTMLDivElement[] = [];
  private last = '';
  private messageTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(parent: HTMLElement) {
    this.root = div('hud');
    const top = div('hud-top');
    this.jar = div('hud-jar');
    this.bones = div('hud-bones');
    this.hearts = div('hud-hearts');
    top.append(this.jar, this.bones, this.hearts);
    this.dragon = div('hud-dragon');
    this.dragon.innerHTML = '<span>DRAGON</span>';
    const bar = div('hud-dragon-bar');
    this.dragonFill = div('hud-dragon-fill');
    bar.append(this.dragonFill);
    this.dragon.append(bar);
    this.message = div('hud-message');
    this.screen = div('hud-screen interactive');
    this.root.append(top, this.dragon, this.message, this.screen);
    parent.append(this.root);
  }

  update(s: HudState): void {
    const key = `${s.jar}|${s.hearts}|${s.maxHearts}|${s.bones}|${s.dragon?.toFixed(2)}`;
    if (key === this.last) return;
    this.last = key;
    this.jar.innerHTML = `<b>${s.jar}</b> treats`;
    this.bones.innerHTML = `<b>${s.bones}</b> bones`;
    this.hearts.textContent =
      '♥'.repeat(s.hearts) + '♡'.repeat(Math.max(0, s.maxHearts - s.hearts));
    this.dragon.classList.toggle('shown', s.dragon !== null);
    this.dragonFill.style.width = `${(s.dragon ?? 0) * 100}%`;
  }

  /**
   * Arrows at the screen's edge toward enemies out of view. Positions are in
   * normalised screen units (−1..1, y up); angle is the direction, in screen radians.
   */
  pointers(marks: readonly { x: number; y: number; angle: number; kind: string }[]): void {
    while (this.arrows.length < marks.length) {
      const arrow = div('hud-arrow');
      this.root.append(arrow);
      this.arrows.push(arrow);
    }
    this.arrows.forEach((arrow, i) => {
      const m = marks[i];
      arrow.style.display = m ? '' : 'none';
      if (!m) return;
      arrow.dataset.kind = m.kind;
      arrow.style.left = `${(m.x * 0.5 + 0.5) * 100}%`;
      arrow.style.top = `${(-m.y * 0.5 + 0.5) * 100}%`;
      arrow.style.transform = `translate(-50%, -50%) rotate(${m.angle}rad)`;
    });
  }

  /** A pop-up message in the middle of the screen. */
  say(text: string, seconds = 2): void {
    this.message.textContent = text;
    this.message.classList.remove('shown');
    void this.message.offsetWidth; // restart the pop animation
    this.message.classList.add('shown');
    if (this.messageTimer) clearTimeout(this.messageTimer);
    this.messageTimer = setTimeout(() => this.message.classList.remove('shown'), seconds * 1000);
  }

  /** The start screen: pick a dog. */
  pickDog(onPick: (dog: DogKind) => void): void {
    this.showScreen(
      `<h1>Schnau</h1>
       <p>Guard Grandma's treats! Bark at goblins, bugs and the dragon to scare them off.</p>
       <p class="hud-hint">Tap WOOF to yip · hold it to charge a big WOOF</p>`,
      [
        ['Schnauzer', 'Big WOOF', () => onPick('schnauzer')],
        ['Spitz', 'Quick yips, fast dash', () => onPick('spitz')],
      ],
    );
  }

  /** The end screen. */
  end(won: boolean, jar: number, bones: number, onAgain: () => void): void {
    this.showScreen(
      won
        ? `<h1>You did it!</h1><p>The dragon flew off. <b>${jar}</b> treats saved, <b>${bones}</b> bones.</p>`
        : `<h1>Oh no!</h1><p>The treat jar is empty. <b>${bones}</b> bones.</p>`,
      [['Play again', '', onAgain]],
    );
  }

  hideScreen(): void {
    this.screen.classList.remove('shown');
    this.screen.innerHTML = '';
  }

  private showScreen(html: string, buttons: [string, string, () => void][]): void {
    this.screen.innerHTML = `<div class="hud-card">${html}<div class="hud-buttons"></div></div>`;
    const row = this.screen.querySelector('.hud-buttons');
    for (const [label, note, onClick] of buttons) {
      const b = document.createElement('button');
      b.innerHTML = note ? `${label}<small>${note}</small>` : label;
      b.addEventListener('click', () => {
        this.hideScreen();
        onClick();
      });
      row?.append(b);
    }
    this.screen.classList.add('shown');
  }
}

function div(className: string): HTMLDivElement {
  const node = document.createElement('div');
  node.className = className;
  return node;
}
