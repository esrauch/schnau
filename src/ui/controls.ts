/**
 * The on-screen controls (GAMEPLAY.md): a direction circle on the left, Dash
 * and Woof on the right. Multi-touch, so steering and barking work at once.
 *
 * - The circle floats: touch anywhere in the left part of the screen and it
 *   centres there; drag to steer, to its edge for full speed.
 * - Woof: a tap is a yip; hold to charge a WOOF (the button fills), let go to
 *   fire it. Dash: a press.
 * - Keys on a desktop: WASD or arrows, Shift to dash, Space to woof.
 *
 * `read()` gives the input for a simulation step, in ground directions.
 */
import type { StepInput } from '../sim/run';
import './controls.css';

/** The stick's travel, in CSS pixels from its centre to its edge. */
const STICK_RADIUS = 56;

export class Controls {
  private stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
  private woofPointers = new Set<number>();
  private dashQueued = false;
  private readonly keys = new Set<string>();
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly woofButton: HTMLButtonElement;
  private readonly dashButton: HTMLButtonElement;
  readonly root: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'controls');
    const pad = el('div', 'controls-pad interactive');
    this.base = el('div', 'controls-stick');
    this.knob = el('div', 'controls-knob');
    this.base.append(this.knob);
    pad.append(this.base);
    const buttons = el('div', 'controls-buttons');
    this.dashButton = button('controls-dash interactive', 'DASH');
    this.woofButton = button('controls-woof interactive', 'WOOF');
    buttons.append(this.dashButton, this.woofButton);
    this.root.append(pad, buttons);
    parent.append(this.root);

    pad.addEventListener('pointerdown', (e) => {
      if (this.stick) return;
      pad.setPointerCapture(e.pointerId);
      this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      this.drawStick();
    });
    pad.addEventListener('pointermove', (e) => {
      if (this.stick?.id !== e.pointerId) return;
      this.stick.x = e.clientX;
      this.stick.y = e.clientY;
      this.drawStick();
    });
    const release = (e: PointerEvent): void => {
      if (this.stick?.id !== e.pointerId) return;
      this.stick = null;
      this.drawStick();
    };
    pad.addEventListener('pointerup', release);
    pad.addEventListener('pointercancel', release);

    this.dashButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.dashQueued = true;
    });
    this.woofButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.woofButton.setPointerCapture(e.pointerId);
      this.woofPointers.add(e.pointerId);
    });
    const woofUp = (e: PointerEvent): void => {
      this.woofPointers.delete(e.pointerId);
    };
    this.woofButton.addEventListener('pointerup', woofUp);
    this.woofButton.addEventListener('pointercancel', woofUp);

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.dashQueued = true;
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.woofPointers.clear();
      this.stick = null;
      this.drawStick();
    });
    this.drawStick();
  }

  /** The input for the next simulation step (a dash press is used up by reading it). */
  read(): StepInput {
    let moveX = 0;
    let moveZ = 0;
    if (this.stick) {
      // Screen right is +x on the ground; screen down is +z (toward the camera).
      const dx = this.stick.x - this.stick.ox;
      const dy = this.stick.y - this.stick.oy;
      const len = Math.hypot(dx, dy);
      const k = len > STICK_RADIUS ? 1 / len : 1 / STICK_RADIUS;
      // A small dead zone, so resting a thumb doesn't creep.
      if (len > 6) {
        moveX = dx * k;
        moveZ = dy * k;
      }
    }
    const key = (...codes: string[]): number => (codes.some((c) => this.keys.has(c)) ? 1 : 0);
    moveX += key('KeyD', 'ArrowRight') - key('KeyA', 'ArrowLeft');
    moveZ += key('KeyS', 'ArrowDown') - key('KeyW', 'ArrowUp');
    const dash = this.dashQueued;
    this.dashQueued = false;
    return { moveX, moveZ, dash, woof: this.woofPointers.size > 0 || this.keys.has('Space') };
  }

  /** Show or hide the controls (hidden on the start screen). */
  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }

  /** Show the WOOF's charge (0..1) and whether the buttons are ready. */
  show(state: { charge: number; dashReady: number; woofReady: boolean; enabled: boolean }): void {
    this.woofButton.style.setProperty('--charge', String(state.charge));
    this.woofButton.classList.toggle('charged', state.charge >= 1);
    this.woofButton.classList.toggle('cooling', !state.woofReady);
    this.dashButton.style.setProperty('--ready', String(state.dashReady));
    this.root.classList.toggle('disabled', !state.enabled);
  }

  private drawStick(): void {
    if (!this.stick) {
      this.base.classList.remove('active');
      this.base.style.removeProperty('left');
      this.base.style.removeProperty('top');
      this.knob.style.transform = '';
      return;
    }
    const rect = this.base.parentElement?.getBoundingClientRect();
    this.base.classList.add('active');
    this.base.style.left = `${this.stick.ox - (rect?.left ?? 0)}px`;
    this.base.style.top = `${this.stick.oy - (rect?.top ?? 0)}px`;
    const dx = this.stick.x - this.stick.ox;
    const dy = this.stick.y - this.stick.oy;
    const len = Math.hypot(dx, dy);
    const k = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
    this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  }
}

function el(tag: 'div', className: string): HTMLDivElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function button(className: string, label: string): HTMLButtonElement {
  const node = document.createElement('button');
  node.className = className;
  node.textContent = label;
  return node;
}
