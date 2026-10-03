import type { Game } from '../game/engine/Game';
import { Panel } from './Panel';
import { el, clear } from './dom';

// The frame every little game in the house and garden is played in, the
// putting mat's included: a panel with a line of score across the top, a
// canvas to play on, a line of instructions under it and a row of
// buttons. Touch first: one finger on the canvas, never a hover or a key,
// and the page doesn't scroll or zoom under it while you play.
//
// A game fills in `start` (a fresh session), `update` (fixed little steps
// of play) and `draw`, and listens to `onDown`/`onMove`/`onUp` in canvas
// pixels. Timers set with `later` are dropped if the panel closes or the
// game starts over, so nothing from an old session fires into a new one.

export interface Banner {
  text: string;
  sub: string;
  until: number;
}

export interface CanvasPoint {
  x: number;
  y: number;
}

export abstract class CanvasGamePanel {
  protected panel: Panel;
  protected card = el('div', 'putt-card');
  protected canvas = el('canvas', 'putt-canvas') as HTMLCanvasElement;
  protected status = el('p', 'putt-status');
  protected actions = el('div', 'putt-actions');
  protected banner: Banner | null = null;
  /** The canvas's size in CSS pixels. */
  protected cw = 0;
  protected ch = 0;
  /** Bumped every fresh session: timers from an older one are ignored. */
  protected session = 0;
  private raf = 0;
  private lastT = 0;
  private pointerId: number | null = null;

  constructor(
    protected game: Game,
    title: string,
    cls: string
  ) {
    this.panel = new Panel(title);
    this.panel.panel.classList.add('putt-panel', 'game-panel', cls);
    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('pointerdown', (e) => {
      // One finger plays: a second one landing is ignored, not a new gesture.
      if (this.pointerId !== null && this.pointerId !== e.pointerId) return;
      e.preventDefault();
      this.pointerId = e.pointerId;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic events have nothing to capture.
      }
      this.onDown(this.point(e), e);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pointerId) return;
      e.preventDefault();
      this.onMove(this.point(e), e);
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.onUp(this.point(e), e);
    });
    this.canvas.addEventListener('pointercancel', (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.onCancel();
    });
    // iOS: no magnifier, callout or double-tap zoom on a long press or a quick double tap.
    this.canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', () => {
      if (this.panel.isOpen) this.resize();
    });
    const close = this.panel.close.bind(this.panel);
    this.panel.close = () => {
      close();
      cancelAnimationFrame(this.raf);
      this.session++;
      this.pointerId = null;
    };
  }

  open() {
    this.session++;
    this.pointerId = null;
    this.banner = null;
    this.start();
    clear(this.panel.body);
    this.panel.body.append(this.card, this.canvas, this.status, this.actions);
    this.panel.open();
    cancelAnimationFrame(this.raf);
    requestAnimationFrame(() => {
      this.resize();
      this.lastT = performance.now();
      this.loop(this.lastT);
    });
  }

  get isOpen(): boolean {
    return this.panel.isOpen;
  }

  /** Starts a fresh session from scratch (Play again, Start over). */
  protected restart() {
    this.session++;
    this.pointerId = null;
    this.banner = null;
    this.start();
  }

  /** A fresh session: set up the first round and the text around the canvas. */
  protected abstract start(): void;
  /** Advances play by `dt` seconds; `t` is performance.now(). */
  protected abstract update(dt: number, t: number): void;
  /** Draws the whole canvas, in CSS pixels (the device-pixel scale is already set). */
  protected abstract draw(ctx: CanvasRenderingContext2D, t: number): void;

  /** The canvas was (re)sized to cw × ch. */
  protected layout(): void {}
  protected onDown(_p: CanvasPoint, _e: PointerEvent): void {}
  protected onMove(_p: CanvasPoint, _e: PointerEvent): void {}
  protected onUp(_p: CanvasPoint, _e: PointerEvent): void {}
  protected onCancel(): void {}

  /** How tall the canvas should be for this width: by default whatever the screen leaves room for. */
  protected canvasHeight(_w: number): number {
    // Leave room in the panel (at most 86% of the screen) for the header, scorecard, status and buttons.
    return Math.max(240, Math.min(window.innerHeight * 0.86 - 250, 620));
  }

  /** Runs `fn` after `ms`, unless the panel has closed or the game started over in the meantime. */
  protected later(ms: number, fn: () => void) {
    const s = this.session;
    setTimeout(() => {
      if (s === this.session && this.panel.isOpen) fn();
    }, ms);
  }

  protected point(e: PointerEvent): CanvasPoint {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  protected setCard(left: string, right: string) {
    clear(this.card);
    this.card.append(el('span', 'putt-hole', left), el('span', 'putt-score', right));
  }

  protected setStatus(text: string) {
    this.status.textContent = text;
  }

  protected setActions(...buttons: HTMLElement[]) {
    clear(this.actions);
    this.actions.append(...buttons);
  }

  protected resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(200, this.panel.body.clientWidth - 36);
    const h = Math.round(this.canvasHeight(w));
    this.cw = w;
    this.ch = h;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layout();
  }

  private loop = (t: number) => {
    if (!this.panel.isOpen) return;
    const dt = Math.min(0.05, Math.max(0, (t - this.lastT) / 1000));
    this.lastT = t;
    this.update(dt, t);
    const ctx = this.canvas.getContext('2d');
    if (ctx) {
      this.draw(ctx, t);
      if (this.banner && t < this.banner.until) this.drawBanner(ctx, this.banner);
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  /** The dark rounded card across the middle: "Hole 3", "Birdie!", "12 skips". */
  protected drawBanner(ctx: CanvasRenderingContext2D, b: { text: string; sub: string }) {
    const w = this.cw;
    const h = this.ch;
    const bw = Math.min(w - 24, 300);
    const bh = 70;
    const x = (w - bw) / 2;
    const y = h * 0.42 - bh / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(20,30,20,0.82)';
    ctx.beginPath();
    ctx.roundRect(x, y, bw, bh, 12);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4ecd8';
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillText(b.text, w / 2, y + 31, bw - 16);
    ctx.fillStyle = '#cfe6c6';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(b.sub, w / 2, y + 54, bw - 16);
    ctx.restore();
  }
}
