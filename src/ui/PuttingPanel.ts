import type { Game } from '../game/engine/Game';
import { button } from './common';
import { CanvasGamePanel, type CanvasPoint } from './CanvasGamePanel';
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
  obstacleAt,
  TUBE_R,
  type Zone,
  type Tube,
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

export class PuttingPanel extends CanvasGamePanel {
  private hole = 0;
  private strokes: number[] = [];
  private ball: Ball = { x: 0, y: 0, vx: 0, vy: 0 };
  private phase: Phase = 'aim';
  private pull: { x: number; y: number } | null = null;
  private lastShotFrom = { x: 0, y: 0 };
  private acc = 0;
  /** Seconds into the current hole: Ranger's tail keeps swishing whether the ball's rolling or not. */
  private holeT = 0;
  /** Pixels per course unit, and the course's top-left on the canvas (CSS px). */
  private scale = 40;
  private ox = 0;
  private oy = 0;

  constructor(game: Game) {
    super(game, 'Putt-Putt', 'putt-mat');
  }

  protected start() {
    this.startRound();
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
    this.holeT = 0;
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
    if (this.phase === 'done') {
      this.setCard('Round complete', `${this.total} · ${toPar(this.total, COURSE_PAR)}`);
    } else {
      const played = this.strokes.slice(0, this.hole).reduce((s, n) => s + n, 0);
      const parPlayed = COURSE.slice(0, this.hole).reduce((s, x) => s + x.par, 0);
      this.setCard(`Hole ${this.hole + 1}/${COURSE.length} · Par ${h.par}`, `Stroke ${this.strokes[this.hole] + (this.phase === 'aim' ? 1 : 0)} · Round ${this.hole === 0 ? 'E' : toPar(played, parPlayed)}`);
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
    if (this.phase === 'done') {
      this.setActions(button('Play again', () => this.restart()), button('Done', () => this.panel.close(), 'secondary-btn'));
    } else {
      this.setActions(button('Start over', () => this.restart(), 'secondary-btn'));
    }
  }

  private scorecard(): string {
    return COURSE.map((h, i) => `${i + 1}: ${this.strokes[i]}`).join('  ·  ');
  }

  // ------------------------------------------------------------ input

  private toCourse(p: CanvasPoint) {
    return { x: (p.x - this.ox) / this.scale, y: (p.y - this.oy) / this.scale };
  }

  protected onDown(p: CanvasPoint) {
    if (this.phase !== 'aim') return;
    this.pull = this.toCourse(p);
  }

  protected onMove(p: CanvasPoint) {
    if (!this.pull) return;
    this.pull = this.toCourse(p);
  }

  protected onCancel() {
    this.pull = null;
  }

  protected onUp(p: CanvasPoint) {
    if (!this.pull || this.phase !== 'aim') return;
    this.pull = this.toCourse(p);
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

  protected update(dt: number) {
    this.holeT += dt;
    if (this.phase === 'rolling') {
      this.acc += dt;
      while (this.acc >= STEP && this.phase === 'rolling') {
        this.acc -= STEP;
        const ev = stepBall(this.ball, COURSE[this.hole], STEP, this.holeT - this.acc);
        if (ev === 'sunk') this.holed();
        if (this.phase === 'rolling' && !ballMoving(this.ball)) this.stopped();
      }
    } else this.acc = 0;
  }

  private stopped() {
    if (this.strokes[this.hole] >= STROKE_LIMIT) {
      // Pick it up: that'll do for this one.
      this.strokes[this.hole] = STROKE_LIMIT + 1;
      this.banner = { text: 'Picked up', sub: `${STROKE_LIMIT + 1} on this one`, until: performance.now() + 1800 };
      this.phase = 'holed';
      this.later(1800, () => this.next());
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
    this.later(2200, () => this.next());
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

  protected layout() {
    const w = this.cw;
    const h = this.ch;
    const pad = 14;
    this.scale = Math.min((w - pad * 2) / COURSE_W, (h - pad * 2) / COURSE_L);
    this.ox = (w - COURSE_W * this.scale) / 2;
    this.oy = (h - COURSE_L * this.scale) / 2;
  }

  protected draw(ctx: CanvasRenderingContext2D, t: number) {
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

    // Whatever's lying under or on the mat: the bath mat, the magazine, the paperback.
    for (const z of hole.zones ?? []) this.drawZone(ctx, z, X, Y, t);

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

    // Ranger's tail runs from him out to its swishing tip: draw the length of it first.
    for (const o of hole.obstacles) {
      if (o.kind !== 'tail' || o.shape !== 'circle' || !o.anchor) continue;
      const tip = obstacleAt(o, this.holeT);
      const base = o.anchor;
      const n = 10;
      for (let i = 0; i < n; i++) {
        const u = i / n;
        const px = base.x + (tip.x - base.x) * u;
        const py = base.y + (tip.y - base.y) * u;
        ctx.fillStyle = CAT_APPEARANCE.furBase;
        ctx.beginPath();
        ctx.arc(X(px), Y(py), this.scale * (0.13 + 0.05 * Math.sin(u * Math.PI)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const o of hole.obstacles) this.drawObstacle(ctx, obstacleAt(o, this.holeT), X, Y, t);
    for (const tube of hole.tubes ?? []) this.drawTube(ctx, tube, X, Y);

    // Aim line and power, while pulling back.
    const aim = this.phase === 'aim' ? this.aim() : null;
    if (aim && this.pull) {
      const bx = X(this.ball.x);
      const by = Y(this.ball.y);
      // The line it will take, as far as its first bounce: a guide, not the whole answer.
      const path = previewPath(hole, this.ball, aim.angle, aim.power, 3.2, this.holeT);
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
  }

  /** A bath mat (soft, fringed: it drags), a magazine left open (glossy: it runs), or a paperback under the mat (a ramp: arrows show which way it leans). */
  private drawZone(ctx: CanvasRenderingContext2D, z: Zone, X: (x: number) => number, Y: (y: number) => number, t: number) {
    const s = this.scale;
    const x = X(z.x);
    const y = Y(z.y);
    const w = z.w * s;
    const h = z.h * s;
    ctx.save();
    if (z.kind === 'rough') {
      ctx.fillStyle = '#9cc3cf';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let yy = y + 4; yy < y + h; yy += 7) for (let xx = x + ((yy / 7) % 2) * 3; xx < x + w; xx += 6) ctx.fillRect(xx, yy, 2, 2);
      ctx.strokeStyle = '#e8f1f2';
      ctx.lineWidth = 1.5;
      for (let xx = x + 3; xx < x + w; xx += 6) {
        ctx.beginPath();
        ctx.moveTo(xx, y);
        ctx.lineTo(xx, y - 5);
        ctx.moveTo(xx, y + h);
        ctx.lineTo(xx, y + h + 5);
        ctx.stroke();
      }
    } else if (z.kind === 'slick') {
      ctx.fillStyle = '#f4f0e6';
      ctx.fillRect(x, y, w, h);
      // Two open pages: a photo, some columns of text.
      ctx.fillStyle = '#c96a5a';
      ctx.fillRect(x + w * 0.08, y + h * 0.1, w * 0.35, h * 0.35);
      ctx.fillStyle = 'rgba(60,60,60,0.35)';
      for (let i = 0; i < 7; i++) ctx.fillRect(x + w * 0.55, y + h * (0.12 + i * 0.1), w * 0.36, 2);
      for (let i = 0; i < 4; i++) ctx.fillRect(x + w * 0.08, y + h * (0.55 + i * 0.1), w * 0.35, 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w / 2, y + h);
      ctx.stroke();
      // Its glossy sheen, sliding slowly.
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      const k = (t / 3000) % 1;
      g.addColorStop(Math.max(0, k - 0.15), 'rgba(255,255,255,0)');
      g.addColorStop(k, 'rgba(255,255,255,0.45)');
      g.addColorStop(Math.min(1, k + 0.15), 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    } else {
      // A raised hump in the mat, lighter where it's lifted, with arrows down the lean.
      const sl = z.slope ?? { x: 0, y: 0 };
      const a = Math.atan2(sl.y, sl.x);
      const g = ctx.createLinearGradient(x, y, x + Math.cos(a) * w, y + Math.sin(a) * h);
      g.addColorStop(0, 'rgba(255,255,220,0.28)');
      g.addColorStop(1, 'rgba(0,0,0,0.12)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(255,240,180,0.6)';
      ctx.lineWidth = 2;
      for (let gy = y + h * 0.25; gy < y + h; gy += h * 0.5) {
        for (let gx = x + w * 0.2; gx < x + w; gx += w * 0.3) {
          const phase = ((t / 700) % 1) * 8;
          ctx.save();
          ctx.translate(gx + Math.cos(a) * phase, gy + Math.sin(a) * phase);
          ctx.rotate(a);
          ctx.beginPath();
          ctx.moveTo(-5, -6);
          ctx.lineTo(3, 0);
          ctx.lineTo(-5, 6);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }

  /** A paper-towel tube lying across whatever's in the way, open at both ends. */
  private drawTube(ctx: CanvasRenderingContext2D, tube: Tube, X: (x: number) => number, Y: (y: number) => number) {
    const s = this.scale;
    const ax = X(tube.a.x);
    const ay = Y(tube.a.y);
    const bx = X(tube.b.x);
    const by = Y(tube.b.y);
    const r = TUBE_R * s * 1.15;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = r * 2 + 4;
    ctx.beginPath();
    ctx.moveTo(ax + 3, ay + 4);
    ctx.lineTo(bx + 3, by + 4);
    ctx.stroke();
    ctx.strokeStyle = '#c9a274';
    ctx.lineWidth = r * 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    // The spiral seam round the cardboard.
    ctx.strokeStyle = 'rgba(120,84,48,0.45)';
    ctx.lineWidth = 1.5;
    const n = Math.max(3, Math.round(Math.hypot(bx - ax, by - ay) / (r * 1.6)));
    const a = Math.atan2(by - ay, bx - ax);
    for (let i = 1; i < n; i++) {
      const cx = ax + ((bx - ax) * i) / n;
      const cy = ay + ((by - ay) * i) / n;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a + 1.2) * r, cy + Math.sin(a + 1.2) * r);
      ctx.lineTo(cx + Math.cos(a + Math.PI + 1.2) * r, cy + Math.sin(a + Math.PI + 1.2) * r);
      ctx.stroke();
    }
    // The open ends.
    for (const [x, y] of [
      [ax, ay],
      [bx, by],
    ]) {
      ctx.fillStyle = '#3a2a1a';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e0bf8f';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
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
    } else if (o.kind === 'tail' && o.shape === 'circle') {
      // The end of Ranger's tail, fluffy and swishing: orange, white at the tip.
      const cx = X(o.x);
      const cy = Y(o.y);
      const r = o.r * s;
      ctx.fillStyle = CAT_APPEARANCE.furBase;
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.arc(cx + Math.cos(k * 1.3) * r * 0.45, cy + Math.sin(k * 1.3) * r * 0.45, r * 0.62, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = CAT_APPEARANCE.furLight;
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.15, r * 0.55, 0, Math.PI * 2);
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
}
