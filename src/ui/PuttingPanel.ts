import type { Game } from '../game/engine/Game';
import { Panel } from './Panel';
import { el, clear } from './dom';
import { button } from './common';
import { CAT_APPEARANCE, SCOTT_APPEARANCE } from '../game/data/character';
import {
  ACE_REWARD,
  BALL_R,
  COURSE,
  COURSE_L,
  COURSE_PAR,
  COURSE_W,
  CUP_R,
  STROKE_LIMIT,
  ballMoving,
  scoreName,
  stepBall,
  strike,
  toPar,
  previewPath,
  bestRound,
  type Ball,
  type Obstacle,
} from '../game/systems/putting';

// Putt-putt on the living-room mat. Drag back from the ball like pulling a
// putter back, and let go: the further you pull, the harder the putt. Six
// holes, par for the course, and a best round the house remembers.

/** How far a drag (in course units) counts as full power. */
const FULL_PULL = 2.4;
const STEP = 1 / 240;

type Phase = 'aim' | 'rolling' | 'holed' | 'done';

export class PuttingPanel {
  private panel = new Panel('Putt-Putt');
  private card = el('div', 'putt-card');
  private canvas = el('canvas', 'putt-canvas') as HTMLCanvasElement;
  private status = el('p', 'putt-status');
  private actions = el('div', 'putt-actions');

  private hole = 0;
  private strokes: number[] = [];
  private ball: Ball = { x: 0, y: 0, vx: 0, vy: 0 };
  private phase: Phase = 'aim';
  private pull: { x: number; y: number } | null = null;
  private lastShotFrom = { x: 0, y: 0 };
  private banner: { text: string; sub: string; until: number } | null = null;
  private raf = 0;
  private lastT = 0;
  private acc = 0;
  /** Pixels per course unit, and the course's top-left on the canvas (CSS px). */
  private scale = 40;
  private ox = 0;
  private oy = 0;

  constructor(private game: Game) {
    this.panel.panel.classList.add('putt-panel');
    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.onUp(e));
    this.canvas.addEventListener('pointercancel', () => (this.pull = null));
    const close = this.panel.close.bind(this.panel);
    this.panel.close = () => {
      close();
      cancelAnimationFrame(this.raf);
    };
  }

  open() {
    this.startRound();
    clear(this.panel.body);
    this.panel.body.append(this.card, this.canvas, this.status, this.actions);
    this.panel.open();
    requestAnimationFrame(() => {
      this.resize();
      this.lastT = performance.now();
      this.loop(this.lastT);
    });
  }

  private startRound() {
    this.hole = 0;
    this.strokes = [];
    this.startHole();
  }

  private startHole() {
    const h = COURSE[this.hole];
    this.ball = { x: h.tee.x, y: h.tee.y, vx: 0, vy: 0 };
    this.strokes[this.hole] = 0;
    this.phase = 'aim';
    this.pull = null;
    this.banner = { text: `Hole ${this.hole + 1}`, sub: `${h.name} · Par ${h.par}`, until: performance.now() + 1600 };
    this.refresh();
  }

  private get total(): number {
    return this.strokes.reduce((s, n) => s + (n ?? 0), 0);
  }

  // ------------------------------------------------------------ text around the green

  private refresh() {
    const h = COURSE[this.hole];
    clear(this.card);
    if (this.phase === 'done') {
      this.card.append(el('span', 'putt-hole', 'Round complete'), el('span', 'putt-score', `${this.total} · ${toPar(this.total, COURSE_PAR)}`));
    } else {
      const played = this.strokes.slice(0, this.hole).reduce((s, n) => s + n, 0);
      const parPlayed = COURSE.slice(0, this.hole).reduce((s, x) => s + x.par, 0);
      this.card.append(
        el('span', 'putt-hole', `Hole ${this.hole + 1}/${COURSE.length} · Par ${h.par}`),
        el('span', 'putt-score', `Stroke ${this.strokes[this.hole] + (this.phase === 'aim' ? 1 : 0)} · Round ${this.hole === 0 ? 'E' : toPar(played, parPlayed)}`)
      );
    }
    const best = bestRound(this.game.state.putting);
    if (this.phase === 'done') {
      this.status.textContent = this.scorecard();
    } else if (this.phase === 'aim') {
      const acesLeft = this.game.state.putting.aces.length < COURSE.length;
      this.status.textContent =
        this.strokes[this.hole] === 0
          ? `Drag back from the ball and let go to putt. Further back, harder putt.${acesLeft && this.game.state.putting.rounds === 0 ? ` The first hole in one on each hole is worth ${ACE_REWARD} coins.` : ''}`
          : 'Line it up again.';
    } else {
      this.status.textContent = best === null ? '' : `Best round: ${best} (${toPar(best, COURSE_PAR)})`;
    }
    clear(this.actions);
    if (this.phase === 'done') {
      this.actions.append(button('Play again', () => this.startRound()), button('Done', () => this.panel.close(), 'secondary-btn'));
    } else {
      this.actions.append(button('Start over', () => this.startRound(), 'secondary-btn'));
    }
  }

  private scorecard(): string {
    return COURSE.map((h, i) => `${i + 1}: ${this.strokes[i]}`).join('  ·  ');
  }

  // ------------------------------------------------------------ input

  private toCourse(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - this.ox) / this.scale, y: (e.clientY - r.top - this.oy) / this.scale };
  }

  private onDown(e: PointerEvent) {
    if (this.phase !== 'aim') return;
    this.canvas.setPointerCapture(e.pointerId);
    this.pull = this.toCourse(e);
  }

  private onMove(e: PointerEvent) {
    if (!this.pull) return;
    this.pull = this.toCourse(e);
  }

  private onUp(e: PointerEvent) {
    if (!this.pull || this.phase !== 'aim') return;
    this.pull = this.toCourse(e);
    const aim = this.aim();
    this.pull = null;
    // A tap, or barely any pull: not a putt.
    if (!aim || aim.power < 0.04) return;
    this.lastShotFrom = { x: this.ball.x, y: this.ball.y };
    strike(this.ball, aim.angle, aim.power);
    this.strokes[this.hole] += 1;
    this.phase = 'rolling';
    this.refresh();
  }

  /** Pulling back from the ball aims the other way. */
  private aim(): { angle: number; power: number } | null {
    if (!this.pull) return null;
    const dx = this.ball.x - this.pull.x;
    const dy = this.ball.y - this.pull.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-3) return null;
    return { angle: Math.atan2(dy, dx), power: Math.min(1, d / FULL_PULL) };
  }

  // ------------------------------------------------------------ play

  private loop = (t: number) => {
    if (!this.panel.isOpen) return;
    const dt = Math.min(0.05, (t - this.lastT) / 1000);
    this.lastT = t;
    if (this.phase === 'rolling') {
      this.acc += dt;
      while (this.acc >= STEP && this.phase === 'rolling') {
        this.acc -= STEP;
        const ev = stepBall(this.ball, COURSE[this.hole], STEP);
        if (ev === 'sunk') this.holed();
        if (this.phase === 'rolling' && !ballMoving(this.ball)) this.stopped();
      }
    } else this.acc = 0;
    this.draw(t);
    this.raf = requestAnimationFrame(this.loop);
  };

  private stopped() {
    if (this.strokes[this.hole] >= STROKE_LIMIT) {
      // Pick it up: that'll do for this one.
      this.strokes[this.hole] = STROKE_LIMIT + 1;
      this.banner = { text: 'Picked up', sub: `${STROKE_LIMIT + 1} on this one`, until: performance.now() + 1800 };
      this.phase = 'holed';
      setTimeout(() => this.next(), 1800);
      this.refresh();
      return;
    }
    this.phase = 'aim';
    this.refresh();
  }

  private holed() {
    const h = COURSE[this.hole];
    const n = this.strokes[this.hole];
    this.phase = 'holed';
    let sub = n === 1 ? 'One stroke.' : `${n} strokes on a par ${h.par}.`;
    if (n === 1) {
      const coins = this.game.puttingAce(h.id);
      if (coins) sub = `First one on this hole: +${coins} coins`;
    }
    this.game.audio.playDiscoveryChime();
    this.banner = { text: scoreName(n, h.par), sub, until: performance.now() + 2200 };
    setTimeout(() => this.next(), 2200);
    this.refresh();
  }

  private next() {
    if (!this.panel.isOpen) return;
    if (this.hole < COURSE.length - 1) {
      this.hole += 1;
      this.startHole();
      return;
    }
    this.phase = 'done';
    const best = this.game.finishPuttingRound(this.total);
    const first = this.game.state.putting.rounds === 1;
    this.banner = {
      text: `${this.total} · ${toPar(this.total, COURSE_PAR)}`,
      sub: first ? 'Your first round on the mat.' : best ? 'A new best round!' : `Best round: ${bestRound(this.game.state.putting)}`,
      until: Infinity,
    };
    this.refresh();
  }

  // ------------------------------------------------------------ drawing

  private resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.panel.body.clientWidth - 36;
    // Leave room in the panel (at most 86% of the screen) for the header, scorecard, status and buttons.
    const h = Math.max(240, Math.min(window.innerHeight * 0.86 - 250, 620));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const pad = 14;
    this.scale = Math.min((w - pad * 2) / COURSE_W, (h - pad * 2) / COURSE_L);
    this.ox = (w - COURSE_W * this.scale) / 2;
    this.oy = (h - COURSE_L * this.scale) / 2;
    this.canvas.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private draw(t: number) {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const s = this.scale;
    const X = (x: number) => this.ox + x * s;
    const Y = (y: number) => this.oy + y * s;
    const hole = COURSE[this.hole];
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    // The living-room floor around the mat.
    ctx.fillStyle = '#8a6444';
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = 'rgba(60,40,24,0.25)';
    ctx.lineWidth = 1;
    for (let y = 0; y < ch; y += 22) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cw, y);
      ctx.stroke();
    }

    // The mat, with its wooden edge.
    ctx.fillStyle = '#5b3c26';
    ctx.fillRect(X(0) - 6, Y(0) - 6, COURSE_W * s + 12, COURSE_L * s + 12);
    ctx.fillStyle = '#3f7a3c';
    ctx.fillRect(X(0), Y(0), COURSE_W * s, COURSE_L * s);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < COURSE_L; i += 1) if (i % 2 === 0) ctx.fillRect(X(0), Y(i), COURSE_W * s, s);

    // The mat's lean, as faint chevrons.
    const sl = Math.hypot(hole.slope.x, hole.slope.y);
    if (sl > 0) {
      const a = Math.atan2(hole.slope.y, hole.slope.x);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 2;
      for (let gy = 1.5; gy < COURSE_L; gy += 2) {
        for (let gx = 0.9; gx < COURSE_W; gx += 1.8) {
          const phase = ((t / 900) % 1) * 0.35;
          const cx = X(gx + Math.cos(a) * phase);
          const cy = Y(gy + Math.sin(a) * phase);
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(a);
          ctx.beginPath();
          ctx.moveTo(-6, -7);
          ctx.lineTo(3, 0);
          ctx.lineTo(-6, 7);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // Tee mark and cup with its flag.
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(X(hole.tee.x), Y(hole.tee.y), BALL_R * s * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#16240f';
    ctx.beginPath();
    ctx.arc(X(hole.cup.x), Y(hole.cup.y), CUP_R * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    for (const o of hole.obstacles) this.drawObstacle(ctx, o, X, Y, t);

    // Aim line and power, while pulling back.
    const aim = this.phase === 'aim' ? this.aim() : null;
    if (aim && this.pull) {
      const bx = X(this.ball.x);
      const by = Y(this.ball.y);
      // The line it will take, as far as its first bounce: a guide, not the whole answer.
      const path = previewPath(hole, this.ball, aim.angle, aim.power);
      ctx.setLineDash([2, 7]);
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(255,255,255,${0.55 + aim.power * 0.35})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      for (const pt of path) ctx.lineTo(X(pt.x), Y(pt.y));
      ctx.stroke();
      ctx.setLineDash([]);
      // The putter, drawn back behind the ball.
      ctx.strokeStyle = SCOTT_APPEARANCE.flag;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(X(this.pull.x), Y(this.pull.y));
      ctx.stroke();
      // Power meter along the mat's edge.
      const mh = COURSE_L * s * 0.5;
      const mx = X(COURSE_W) + 10;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(mx, Y(COURSE_L) - mh, 6, mh);
      ctx.fillStyle = `hsl(${120 - aim.power * 110},70%,55%)`;
      ctx.fillRect(mx, Y(COURSE_L) - mh * aim.power, 6, mh * aim.power);
    } else if (this.phase === 'aim' && this.strokes[this.hole] === 0 && (!this.banner || t > this.banner.until)) {
      // A gentle pulse on the ball: this is the thing to drag.
      const pulse = 1 + 0.5 * (0.5 + 0.5 * Math.sin(t / 250));
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(X(this.ball.x), Y(this.ball.y), BALL_R * s * 2.2 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    // The ball (hidden once it has dropped).
    if (this.phase !== 'holed' || this.strokes[this.hole] > STROKE_LIMIT) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(X(this.ball.x) + 1.5, Y(this.ball.y) + 2, BALL_R * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = SCOTT_APPEARANCE.golfBall;
      ctx.beginPath();
      ctx.arc(X(this.ball.x), Y(this.ball.y), BALL_R * s, 0, Math.PI * 2);
      ctx.fill();
    }
    // The flag stands over the cup.
    const fx = X(hole.cup.x);
    const fy = Y(hole.cup.y);
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx, fy - s * 0.9);
    ctx.stroke();
    ctx.fillStyle = SCOTT_APPEARANCE.flag;
    ctx.beginPath();
    ctx.moveTo(fx, fy - s * 0.9);
    ctx.lineTo(fx + s * 0.42, fy - s * 0.76);
    ctx.lineTo(fx, fy - s * 0.62);
    ctx.closePath();
    ctx.fill();

    if (this.banner && t < this.banner.until) this.drawBanner(ctx, this.banner);
  }

  private drawObstacle(ctx: CanvasRenderingContext2D, o: Obstacle, X: (x: number) => number, Y: (y: number) => number, t: number) {
    const s = this.scale;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    if (o.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(X(o.x) + 3, Y(o.y) + 4, o.r * s, 0, Math.PI * 2);
      ctx.fill();
    } else ctx.fillRect(X(o.x) + 3, Y(o.y) + 4, o.w * s, o.h * s);

    if (o.kind === 'mug' && o.shape === 'circle') {
      const cx = X(o.x);
      const cy = Y(o.y);
      const r = o.r * s;
      ctx.strokeStyle = '#e9e2d4';
      ctx.lineWidth = r * 0.28;
      ctx.beginPath();
      ctx.arc(cx + r * 0.95, cy, r * 0.42, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.fillStyle = '#e9e2d4';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a3a22';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
      ctx.fill();
    } else if (o.kind === 'cat' && o.shape === 'circle') {
      // Ranger, curled up asleep, his fluffy tail round his nose, breathing slowly.
      const cx = X(o.x);
      const cy = Y(o.y);
      const r = o.r * s * (1 + Math.sin(t / 700) * 0.02);
      ctx.fillStyle = CAT_APPEARANCE.furBase;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.86, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = CAT_APPEARANCE.furDark;
      ctx.lineWidth = r * 0.12;
      for (const k of [0.35, 0.6]) {
        ctx.beginPath();
        ctx.arc(cx, cy, r * k, Math.PI * 0.9, Math.PI * 1.9);
        ctx.stroke();
      }
      ctx.fillStyle = CAT_APPEARANCE.furLight;
      ctx.beginPath();
      ctx.arc(cx + r * 0.45, cy + r * 0.3, r * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = CAT_APPEARANCE.furBase;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + r * 0.45 + side * r * 0.22, cy + r * 0.06);
        ctx.lineTo(cx + r * 0.45 + side * r * 0.08, cy - r * 0.18);
        ctx.lineTo(cx + r * 0.45 + side * r * 0.02, cy + r * 0.06);
        ctx.fill();
      }
      // The long plumed tail, orange to a white tip.
      for (let i = 0; i <= 10; i++) {
        const u = i / 10;
        const a = Math.PI * (0.05 + u * 0.8);
        ctx.fillStyle = u > 0.75 ? CAT_APPEARANCE.furLight : CAT_APPEARANCE.furBase;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r * 0.98, cy + Math.sin(a) * r * 0.86, r * (0.2 - u * 0.05), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (o.shape === 'rect') {
      const x = X(o.x);
      const y = Y(o.y);
      const w = o.w * s;
      const h = o.h * s;
      if (o.kind === 'slipper') {
        ctx.fillStyle = '#c96f86';
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, h / 2);
        ctx.fill();
        ctx.fillStyle = '#f2e4d8';
        ctx.beginPath();
        ctx.roundRect(x + w * 0.55, y + h * 0.15, w * 0.4, h * 0.7, h * 0.35);
        ctx.fill();
      } else {
        ctx.fillStyle = '#2f5a7a';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#efe6d2';
        ctx.fillRect(x, y + h * 0.72, w, h * 0.2);
        ctx.fillStyle = '#d8b24a';
        ctx.fillRect(x + w * 0.1, y + h * 0.2, w * 0.35, h * 0.12);
      }
    }
    ctx.restore();
  }

  private drawBanner(ctx: CanvasRenderingContext2D, b: { text: string; sub: string }) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const bw = Math.min(w - 24, 300);
    const bh = 70;
    const x = (w - bw) / 2;
    const y = h * 0.42 - bh / 2;
    ctx.fillStyle = 'rgba(20,30,20,0.82)';
    ctx.beginPath();
    ctx.roundRect(x, y, bw, bh, 12);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4ecd8';
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillText(b.text, w / 2, y + 31);
    ctx.fillStyle = '#cfe6c6';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(b.sub, w / 2, y + 54);
  }
}
