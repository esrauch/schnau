/**
 * The HUD (GAMEPLAY.md): treats in the jar, the dog's hearts, bones, the
 * dragon's courage while it's here, pop-up messages, the start menu (pick a
 * dog, then Play) and the end screen. Plain DOM over the canvas.
 */
import { DOG_INFO, type DogKind } from '../content/gameTuning';
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
  private readonly menuRoot: HTMLDivElement;
  private readonly top: HTMLDivElement;
  private readonly arrows: HTMLDivElement[] = [];
  private last = '';
  private messageTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(parent: HTMLElement) {
    this.root = div('hud');
    const top = div('hud-top');
    this.top = top;
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
    this.menuRoot = div('hud-menu');
    this.root.append(top, this.dragon, this.message, this.screen, this.menuRoot);
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

  /**
   * The start menu, over the live scene: the title, a button per dog (picking
   * one says what it's better at), and Play once a dog is picked.
   */
  menu(handlers: { onPick: (dog: DogKind) => void; onPlay: (dog: DogKind) => void }): void {
    this.top.style.display = 'none';
    this.menuRoot.innerHTML = `
      <div class="hud-title"><h1>Schnau</h1><p>Guard Grandma's treats!</p></div>
      <div class="hud-menu-bottom interactive">
        <p class="hud-strength">Who's on guard today?</p>
        <div class="hud-dogs"></div>
        <button class="hud-play" hidden>Play</button>
      </div>`;
    const strength = this.menuRoot.querySelector<HTMLParagraphElement>('.hud-strength');
    const row = this.menuRoot.querySelector<HTMLDivElement>('.hud-dogs');
    const play = this.menuRoot.querySelector<HTMLButtonElement>('.hud-play');
    let picked: DogKind | null = null;
    for (const dog of ['schnauzer', 'spitz'] as const) {
      const b = document.createElement('button');
      b.textContent = DOG_INFO[dog].name;
      b.dataset.dog = dog;
      b.addEventListener('click', () => {
        picked = dog;
        row?.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        if (strength) strength.textContent = DOG_INFO[dog].strength;
        if (play) play.hidden = false;
        handlers.onPick(dog);
      });
      row?.append(b);
    }
    play?.addEventListener('click', () => {
      if (!picked) return;
      this.hideMenu();
      handlers.onPlay(picked);
    });
    this.menuRoot.classList.add('shown');
  }

  hideMenu(): void {
    this.menuRoot.classList.remove('shown');
    this.menuRoot.innerHTML = '';
    this.top.style.display = '';
  }

  /** The end screen: play again with the same dog, or back to the menu. */
  end(won: boolean, jar: number, bones: number, onAgain: () => void, onMenu: () => void): void {
    this.showScreen(
      won
        ? `<h1>You did it!</h1><p>The dragon flew off. <b>${jar}</b> treats saved, <b>${bones}</b> bones.</p>`
        : `<h1>Oh no!</h1><p>The treat jar is empty. <b>${bones}</b> bones.</p>`,
      [
        ['Play again', '', onAgain],
        ['Menu', '', onMenu],
      ],
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
