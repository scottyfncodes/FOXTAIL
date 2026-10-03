import type { Game } from '../../game/engine/Game';
import { SCOTT_APPEARANCE } from '../../game/data/character';
import { MiniGamePanel } from '../MiniGamePanel';
import type { CanvasPoint } from '../CanvasGamePanel';
import {
  ACORN_R,
  ACORNS_PER_TARGET,
  RELEASE,
  STEP,
  TARGETS,
  clampAngle,
  lob,
  newAcorn,
  outcome,
  pointsFor,
  previewArc,
  stepAcorn,
  type Acorn,
  type Target,
} from '../../game/systems/minigames/acornPitch';

// Acorn Pitch, under the oaks at the woodland's edge. Drag back anywhere
// and let go, like the putter on the mat: the further back, the further
// Scott lobs it. Three acorns at each thing, and in with the first is best.

/** The stretch of the world in view, metres: a little behind Scott to just past the woodpile. */
const VIEW_X0 = -1.05;
const VIEW_W = 8.85;
const VIEW_H = 6;
/** Where Scott stands (his feet), and his throwing shoulder. */
const SCOTT_X = -0.45;
const SHOULDER = { x: -0.38, y: 1.42 };
const ARM = Math.hypot(RELEASE.x - SHOULDER.x, RELEASE.y - SHOULDER.y);
/** The arm's angle forward of straight down when the acorn leaves the hand. */
const RELEASE_SWING = Math.atan2(RELEASE.x - SHOULDER.x, SHOULDER.y - RELEASE.y);
/** How much of the flight the faint preview shows, seconds. */
const PREVIEW_S = 0.28;

type Phase = 'aim' | 'flying' | 'between';

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const LEAF_COLORS = ['#b8743a', '#8a5a2c', '#d0a050', '#6e4a2a'];

export class AcornPitchPanel extends MiniGamePanel {
  private ti = 0;
  /** Acorns thrown at the current target. */
  private thrown = 0;
  /** Points from each target so far. */
  private points: number[] = [];
  /** Which acorn got each target (0 for none of them). */
  private hitWith: number[] = [];
  private phase: Phase = 'aim';
  private acorn: Acorn = newAcorn();
  private acc = 0;
  private dragFrom: CanvasPoint | null = null;
  private dragTo: CanvasPoint | null = null;
  /** The last acorn's flight at this target, faintly: something to adjust from. */
  private trace: { x: number; y: number }[] = [];
  private traceTick = 0;
  private preview: { x: number; y: number }[] = [];
  /** When the arm swung through (ms), for the follow-through. */
  private swingAt = -1e9;
  /** The target rocks when hit: when, and how hard. */
  private rockAt = -1e9;
  private rockAmp = 0;
  private bits: Bit[] = [];
  private clonked = false;
  /** Pixels per metre, the world's left edge offset, and the ground line. */
  private s = 30;
  private ox = 0;
  private gy = 0;

  constructor(game: Game) {
    super(game, 'acornPitch');
    for (let i = 0; i < 28; i++) this.bits.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, color: LEAF_COLORS[0] });
  }

  private get target(): Target {
    return TARGETS[this.ti];
  }

  private get total(): number {
    return this.points.reduce((a, b) => a + b, 0);
  }

  protected start() {
    this.ti = 0;
    this.points = [];
    this.hitWith = [];
    this.startTarget();
    this.setStatus(`Drag back anywhere and let go to lob an acorn: further back, further it goes. Land it in ${this.target.name}. ${this.bestLine()}`);
    this.playingActions();
  }

  private startTarget() {
    this.thrown = 0;
    this.trace = [];
    this.phase = 'aim';
    this.acorn = newAcorn();
    this.dragFrom = this.dragTo = null;
    this.rockAmp = 0;
    const tg = this.target;
    const air = tg.wind === 0 ? 'Still air under the oaks.' : `A ${Math.abs(tg.wind) > 2 ? 'fair' : 'light'} breeze ${tg.wind > 0 ? 'at your back' : 'in your face'}.`;
    this.banner = { text: `${this.ti + 1}. ${cap(tg.name)}`, sub: air, until: performance.now() + 1700 };
    if (this.ti > 0) this.setStatus(tg.mouth > 0 ? `In ${tg.name}.` : `Land one on ${tg.name} and keep it there.`);
    this.refresh();
  }

  private refresh() {
    const n = Math.min(ACORNS_PER_TARGET, this.thrown + (this.phase === 'aim' ? 1 : 0));
    this.setCard(`Target ${this.ti + 1}/${TARGETS.length} · Acorn ${Math.max(1, n)} of ${ACORNS_PER_TARGET}`, `${this.total} points`);
  }

  // ------------------------------------------------------------ input

  private aim(): { angle: number; power: number } | null {
    if (!this.dragFrom || !this.dragTo) return null;
    const dx = this.dragFrom.x - this.dragTo.x;
    const dy = this.dragFrom.y - this.dragTo.y;
    const d = Math.hypot(dx, dy);
    if (d < 4) return null;
    // Pulling back aims the other way; the screen's y runs down, the world's up.
    return { angle: clampAngle(Math.atan2(-dy, dx)), power: Math.min(1, d / this.fullPull()) };
  }

  /** A full-power pull, in CSS px: long enough to be fine-grained, short enough for a thumb. */
  private fullPull(): number {
    return Math.max(140, Math.min(260, Math.min(this.cw, this.ch) * 0.62));
  }

  protected onDown(p: CanvasPoint) {
    if (this.finished || this.phase !== 'aim') return;
    this.dragFrom = p;
    this.dragTo = p;
  }

  protected onMove(p: CanvasPoint) {
    if (this.dragFrom) this.dragTo = p;
  }

  protected onCancel() {
    this.dragFrom = this.dragTo = null;
  }

  protected onUp(p: CanvasPoint) {
    if (!this.dragFrom || this.finished || this.phase !== 'aim') {
      this.dragFrom = this.dragTo = null;
      return;
    }
    this.dragTo = p;
    const aim = this.aim();
    this.dragFrom = this.dragTo = null;
    // A tap, or barely a pull: not a throw.
    if (!aim || aim.power < 0.03) return;
    lob(this.acorn, aim.angle, aim.power);
    this.thrown += 1;
    this.phase = 'flying';
    this.trace = [{ x: RELEASE.x, y: RELEASE.y }];
    this.traceTick = 0;
    this.clonked = false;
    this.swingAt = performance.now();
    this.refresh();
  }

  // ------------------------------------------------------------ play

  protected update(dt: number, t: number) {
    for (const b of this.bits) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.vy -= 6 * dt;
      b.vx *= Math.exp(-3 * dt);
      b.x += b.vx * dt;
      b.y = Math.max(0.01, b.y + b.vy * dt);
    }
    if (this.phase !== 'flying') {
      this.acc = 0;
      return;
    }
    this.acc += dt;
    while (this.acc >= STEP && this.phase === 'flying') {
      this.acc -= STEP;
      const ev = stepAcorn(this.acorn, this.target, STEP);
      if (ev === 'clonk') {
        this.clonked = true;
        this.rock(t, 0.12);
      } else if (ev === 'in') {
        this.rock(t, 0.06);
        this.puff(this.acorn.x, this.target.base + this.target.h, 4, '#5a3e26');
      } else if (ev === 'thud') this.puff(this.acorn.x, 0, 7);
      if (++this.traceTick % 6 === 0 && this.trace.length < 300) this.trace.push({ x: this.acorn.x, y: this.acorn.y });
      if (this.acorn.done) this.landed();
    }
  }

  private rock(t: number, amp: number) {
    this.rockAt = t;
    this.rockAmp = amp;
  }

  /** A little puff of leaf litter (or soil) where it came down. */
  private puff(x: number, y: number, n: number, color?: string) {
    let k = 0;
    for (const b of this.bits) {
      if (b.life > 0) continue;
      const a = Math.PI * (0.15 + 0.7 * ((k * 0.37 + x * 3.1) % 1));
      const v = 0.8 + ((k * 0.53) % 1) * 1.2;
      b.x = x;
      b.y = y + 0.02;
      b.vx = Math.cos(a) * v;
      b.vy = Math.sin(a) * v;
      b.life = 0.5 + ((k * 0.29) % 1) * 0.4;
      b.color = color ?? LEAF_COLORS[k % LEAF_COLORS.length];
      if (++k >= n) break;
    }
  }

  private landed() {
    const tg = this.target;
    const res = outcome(this.acorn, tg);
    this.phase = 'between';
    const now = performance.now();
    if (res !== 'miss') {
      const pts = pointsFor(this.thrown);
      this.points[this.ti] = pts;
      this.hitWith[this.ti] = this.thrown;
      if (this.thrown === 1) this.game.audio.playDiscoveryChime();
      const text = this.thrown === 1 ? (res === 'on' ? 'Right on top!' : 'In first go!') : res === 'on' ? 'It stayed put' : 'In!';
      this.banner = { text, sub: `+${pts} point${pts === 1 ? '' : 's'}`, until: now + 1600 };
      this.refresh();
      this.later(1600, () => this.next());
      return;
    }
    if (this.thrown >= ACORNS_PER_TARGET) {
      this.points[this.ti] = 0;
      this.hitWith[this.ti] = 0;
      this.banner = { text: 'Not this one', sub: 'The squirrels will have those', until: now + 1600 };
      this.refresh();
      this.later(1600, () => this.next());
      return;
    }
    // Soft and a bit funny: what it did, and go again.
    const top = tg.base + tg.h;
    const why = this.clonked
      ? 'Clonk. Off the rim.'
      : tg.mouth <= 0 && Math.abs(this.acorn.x - tg.x) < tg.w
        ? 'It rolled off.'
        : this.acorn.x < tg.x
          ? 'A touch short.'
          : this.acorn.y > top
            ? 'Over the top.'
            : 'A bit long.';
    const left = ACORNS_PER_TARGET - this.thrown;
    this.banner = { text: why, sub: `${left} acorn${left === 1 ? '' : 's'} left`, until: now + 1100 };
    this.later(900, () => {
      this.phase = 'aim';
      this.acorn = newAcorn();
      this.refresh();
    });
  }

  private next() {
    if (this.ti < TARGETS.length - 1) {
      this.ti += 1;
      this.startTarget();
      return;
    }
    const firsts = this.hitWith.filter((n) => n === 1).length;
    const seconds = this.hitWith.filter((n) => n === 2).length;
    const thirds = this.hitWith.filter((n) => n === 3).length;
    const misses = this.hitWith.filter((n) => n === 0).length;
    const parts = [`${firsts} with the first acorn`];
    if (seconds) parts.push(`${seconds} with the second`);
    if (thirds) parts.push(`${thirds} with the third`);
    const tail = misses ? ` ${misses} got away.` : ' Not one got away.';
    this.finish(this.total, `${parts.join(', ')}.${tail}`);
  }

  // ------------------------------------------------------------ drawing

  protected canvasHeight(w: number): number {
    return Math.min(super.canvasHeight(w), Math.max(240, w * 0.95));
  }

  protected layout() {
    this.s = Math.min(this.cw / VIEW_W, this.ch / VIEW_H);
    this.ox = (this.cw - VIEW_W * this.s) / 2 - VIEW_X0 * this.s;
    this.gy = this.ch - Math.max(this.ch * 0.12, this.s * 0.55);
  }

  private X(x: number) {
    return this.ox + x * this.s;
  }

  private Y(y: number) {
    return this.gy - y * this.s;
  }

  protected draw(ctx: CanvasRenderingContext2D, t: number) {
    const s = this.s;
    this.drawWoods(ctx, t);
    this.drawBreeze(ctx, t);

    const tg = this.target;
    // The last acorn's flight, faintly: a crumb trail to adjust from.
    if (this.trace.length > 1 && this.phase === 'aim') {
      ctx.fillStyle = 'rgba(255,240,200,0.32)';
      for (let i = 1; i < this.trace.length; i += 1) {
        ctx.beginPath();
        ctx.arc(this.X(this.trace[i].x), this.Y(this.trace[i].y), 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const ar = Math.max(4, ACORN_R * s * 1.15);
    const aim = this.phase === 'aim' ? this.aim() : null;
    if (aim) {
      // The first stretch of the arc: a guide, not the answer.
      const path = previewArc(tg, aim.angle, aim.power, PREVIEW_S, this.preview);
      ctx.save();
      ctx.setLineDash([2, 6]);
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(255,248,225,${0.35 + aim.power * 0.35})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(this.X(RELEASE.x), this.Y(RELEASE.y));
      for (const p of path) ctx.lineTo(this.X(p.x), this.Y(p.y));
      ctx.stroke();
      ctx.restore();
      // Where the finger went down, and how far back it's pulled.
      if (this.dragFrom && this.dragTo) {
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.dragFrom.x, this.dragFrom.y);
        ctx.lineTo(this.dragTo.x, this.dragTo.y);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.arc(this.dragFrom.x, this.dragFrom.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // The target: an acorn that's dropped in sits behind its front wall.
    const inside = this.acorn.inside && this.phase !== 'aim';
    if (inside) this.drawAcorn(ctx, this.X(this.acorn.x), this.Y(this.acorn.y), ar, this.acorn.spin);
    this.drawTarget(ctx, tg, t);
    if (!inside && this.phase !== 'aim') this.drawAcorn(ctx, this.X(this.acorn.x), this.Y(this.acorn.y), ar, this.acorn.spin);

    const hand = this.drawScott(ctx, t, aim?.power ?? 0);
    if (this.phase === 'aim' && !this.finished) this.drawAcorn(ctx, hand.x, hand.y - ar * 0.3, ar, -0.4);

    for (const b of this.bits) {
      if (b.life <= 0) continue;
      ctx.globalAlpha = Math.min(1, b.life * 2.5);
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.ellipse(this.X(b.x), this.Y(b.y), 2.6, 1.4, b.vx + b.life * 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Acorns left for this target, tucked in the corner.
    if (!this.finished) {
      const left = ACORNS_PER_TARGET - this.thrown;
      ctx.fillStyle = 'rgba(30,24,14,0.35)';
      ctx.beginPath();
      ctx.roundRect(5, 6, ACORNS_PER_TARGET * 16 + 6, 25, 12);
      ctx.fill();
      for (let i = 0; i < ACORNS_PER_TARGET; i++) {
        ctx.globalAlpha = i < left ? 0.95 : 0.22;
        this.drawAcorn(ctx, 16 + i * 16, 18, 5.5, 0);
      }
      ctx.globalAlpha = 1;
    }

    // A first-time nudge: the whole canvas is the place to drag.
    if (this.phase === 'aim' && this.ti === 0 && this.thrown === 0 && !this.dragFrom && (!this.banner || t > this.banner.until)) {
      const k = (t % 1600) / 1600;
      const x0 = this.cw * 0.55;
      const y0 = this.ch * 0.42;
      ctx.fillStyle = `rgba(255,255,255,${0.45 * (1 - k)})`;
      ctx.beginPath();
      ctx.arc(x0 - k * 50, y0 + k * 34, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Dappled oak woods: warm light between the trunks, a canopy overhead, leaf litter underfoot. */
  private drawWoods(ctx: CanvasRenderingContext2D, t: number) {
    const w = this.cw;
    const h = this.ch;
    const s = this.s;
    const g = ctx.createLinearGradient(0, 0, 0, this.gy);
    g.addColorStop(0, '#9fae6c');
    g.addColorStop(0.55, '#d9c48a');
    g.addColorStop(1, '#c7a56a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Far trunks, hazy, then nearer oaks.
    for (const [x, tw, a] of [
      [0.75, 0.2, 0.25],
      [1.75, 0.26, 0.3],
      [4.0, 0.24, 0.28],
      [6.55, 0.3, 0.3],
      [7.6, 0.18, 0.25],
    ] as const) {
      ctx.fillStyle = `rgba(110,84,58,${a})`;
      ctx.fillRect(this.X(x) - (tw * s) / 2, 0, tw * s, this.gy);
    }
    for (const [x, tw] of [
      [-0.9, 0.55],
      [2.85, 0.44],
      [5.65, 0.5],
    ] as const) {
      const cx = this.X(x);
      ctx.fillStyle = '#5c4430';
      ctx.beginPath();
      ctx.moveTo(cx - (tw * s) / 2, this.gy + 2);
      ctx.lineTo(cx - (tw * s) / 2.6, 0);
      ctx.lineTo(cx + (tw * s) / 2.6, 0);
      ctx.lineTo(cx + (tw * s) / 2, this.gy + 2);
      ctx.closePath();
      ctx.fill();
      // Bark furrows.
      ctx.strokeStyle = 'rgba(40,28,18,0.35)';
      ctx.lineWidth = 1.5;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(cx + k * tw * s * 0.18, 0);
        ctx.lineTo(cx + k * tw * s * 0.22, this.gy);
        ctx.stroke();
      }
      // A splash of light down one side.
      ctx.fillStyle = 'rgba(255,220,150,0.12)';
      ctx.fillRect(cx - (tw * s) / 2.6, 0, (tw * s) / 5, this.gy);
    }

    // The canopy: oak leaves in heavy clumps, darker further up, and sun coming through in dapples.
    const canopyY = h * 0.16;
    ctx.fillStyle = '#344c25';
    ctx.fillRect(0, 0, w, Math.max(0, canopyY - 24));
    const clumps = Math.ceil(w / 34) + 2;
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < clumps; i++) {
        const x = i * 34 - 20 + row * 17;
        const y = canopyY - 26 + row * 22 + Math.sin(i * 2.3 + row) * 7;
        const r = 20 + ((i * 37 + row * 11) % 14);
        ctx.fillStyle = row === 0 ? (i % 2 ? '#3a5428' : '#405e2c') : i % 3 === 0 ? '#4c6a32' : i % 3 === 1 ? '#56763a' : '#48662f';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (let i = 0; i < 9; i++) {
      const x = ((i * 0.618 + t / 60000) % 1) * w;
      const y = canopyY - 20 + ((i * 0.41) % 1) * 34;
      ctx.fillStyle = 'rgba(255,236,160,0.18)';
      ctx.beginPath();
      ctx.ellipse(x, y, 6 + (i % 3) * 3, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // A few acorns still up there, in their little clusters.
    for (let i = 0; i < 5; i++) {
      const x = ((i * 0.29 + 0.12) % 1) * w;
      const y = canopyY + 4 + (i % 2) * 8;
      this.drawAcorn(ctx, x, y, 3, 0.3);
    }

    // Sun dapples on the ground, drifting a touch as the leaves move.
    for (let i = 0; i < 7; i++) {
      const x = ((i * 0.37 + 0.1) % 1) * w + Math.sin(t / 2400 + i) * 4;
      ctx.fillStyle = 'rgba(255,230,160,0.18)';
      ctx.beginPath();
      ctx.ellipse(x, this.gy + 6 + (i % 3) * 5, 16 + (i % 2) * 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Leaf litter.
    ctx.fillStyle = '#7a5634';
    ctx.fillRect(0, this.gy, w, h - this.gy);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, this.gy, w, 3);
    for (let i = 0; i < 70; i++) {
      const x = ((i * 0.6180339) % 1) * w;
      const y = this.gy + 3 + ((i * 0.381966) % 1) * (h - this.gy - 4);
      ctx.fillStyle = LEAF_COLORS[i % LEAF_COLORS.length];
      ctx.beginPath();
      ctx.ellipse(x, y, 3.2, 1.6, i, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Leaves on the air: drifting with the breeze, or just falling in still air. */
  private drawBreeze(ctx: CanvasRenderingContext2D, t: number) {
    const wind = this.target.wind;
    const sec = t / 1000;
    const top = this.Y(VIEW_H * 0.7);
    const span = this.gy - top;
    for (let i = 0; i < 7; i++) {
      let x: number;
      let y: number;
      if (wind === 0) {
        x = VIEW_X0 + ((i * 0.618 + 0.05) % 1) * VIEW_W + Math.sin(sec * 0.9 + i) * 0.25;
        y = this.Y(0) - (1 - ((sec * 0.05 + i * 0.37) % 1)) * span;
      } else {
        const u = (((i * 0.618 + (sec * wind * 0.55) / VIEW_W) % 1) + 1) % 1;
        x = VIEW_X0 + u * VIEW_W;
        y = top + span * (0.15 + ((i * 0.43) % 0.75)) + Math.sin(sec * 1.7 + i * 2) * 10;
      }
      const px = this.X(x);
      ctx.save();
      ctx.translate(px, y);
      ctx.rotate(sec * (1.5 + (i % 3)) * (wind < 0 ? -1 : 1) + i);
      ctx.fillStyle = LEAF_COLORS[(i + 1) % LEAF_COLORS.length];
      ctx.beginPath();
      ctx.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawAcorn(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(1, r * 0.9, r * 0.8, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(spin);
    ctx.fillStyle = '#a8743c';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.22, r * 0.78, r * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,230,180,0.35)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.28, r * 0.25, r * 0.18, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6a4a2a';
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.42, r * 0.92, r * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-r * 0.1, -r * 1.1, r * 0.2, r * 0.4);
    ctx.restore();
  }

  /** The current thing to aim at, rocking a little when an acorn clonks it or drops in. */
  private drawTarget(ctx: CanvasRenderingContext2D, tg: Target, t: number) {
    const s = this.s;
    const cx = this.X(tg.x);
    const by = this.Y(tg.base);
    const w = tg.w * s;
    const h = tg.h * s;
    const m = tg.mouth * s;
    const top = by - h;

    // Whatever it stands on first: the post under the bird table, the woodpile under the pail.
    if (tg.stand) {
      const sw = tg.stand.w * s;
      const sh = tg.stand.h * s;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(cx, this.gy + 2, sw * 0.7 + 4, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      if (tg.kind === 'pail') {
        // Split logs, ends on.
        const rows = 3;
        const lr = sh / rows / 2;
        for (let r = 0; r < rows; r++) {
          const n = Math.max(1, Math.round(sw / (lr * 2)) - (r === rows - 1 ? 1 : 0));
          const rowW = n * lr * 2;
          for (let k = 0; k < n; k++) {
            const lx = cx - rowW / 2 + lr + k * lr * 2;
            const ly = this.gy - lr - r * lr * 2;
            ctx.fillStyle = '#7a5a3a';
            ctx.beginPath();
            ctx.arc(lx, ly, lr, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#d2ad78';
            ctx.beginPath();
            ctx.arc(lx, ly, lr * 0.72, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(122,90,58,0.6)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(lx, ly, lr * 0.38, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      } else {
        ctx.fillStyle = '#6e5038';
        ctx.fillRect(cx - sw / 2, this.gy - sh, sw, sh);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(cx - sw / 2, this.gy - sh, sw * 0.35, sh);
      }
    }

    const since = t - this.rockAt;
    const ang = this.rockAmp * Math.exp(-since / 320) * Math.sin(since / 55);
    ctx.save();
    ctx.translate(cx, by);
    ctx.rotate(Math.abs(ang) < 1e-4 ? 0 : ang);
    if (!tg.stand) {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(3, 2, w * 0.62, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const open = (fill: string) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.ellipse(0, -h, m / 2, Math.max(2, m * 0.12), 0, 0, Math.PI * 2);
      ctx.fill();
    };
    switch (tg.kind) {
      case 'pot': {
        // Terracotta, wider at the top, with its rolled rim.
        ctx.fillStyle = '#c0704a';
        ctx.beginPath();
        ctx.moveTo(-w * 0.38, 0);
        ctx.lineTo(w * 0.38, 0);
        ctx.lineTo(w * 0.47, -h * 0.8);
        ctx.lineTo(-w * 0.47, -h * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#cf8058';
        ctx.fillRect(-w / 2, -h, w, h * 0.22);
        open('#4a3020');
        ctx.fillStyle = 'rgba(255,220,190,0.2)';
        ctx.fillRect(-w * 0.36, -h * 0.75, w * 0.12, h * 0.7);
        break;
      }
      case 'bucket': {
        // Galvanised, a couple of ribs, and the handle up.
        ctx.strokeStyle = '#8f969a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, -h, w * 0.5, h * 0.55, 0, Math.PI, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#a9b0b3';
        ctx.beginPath();
        ctx.moveTo(-w * 0.4, 0);
        ctx.lineTo(w * 0.4, 0);
        ctx.lineTo(w * 0.5, -h);
        ctx.lineTo(-w * 0.5, -h);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(80,88,92,0.5)';
        ctx.lineWidth = 1.5;
        for (const k of [0.3, 0.65]) {
          ctx.beginPath();
          ctx.moveTo(-w * (0.4 + 0.1 * k), -h * k);
          ctx.lineTo(w * (0.4 + 0.1 * k), -h * k);
          ctx.stroke();
        }
        open('#3e4448');
        break;
      }
      case 'stump': {
        ctx.fillStyle = '#6a4c32';
        ctx.beginPath();
        ctx.moveTo(-w * 0.6, 0);
        ctx.lineTo(-w / 2, -h);
        ctx.lineTo(w / 2, -h);
        ctx.lineTo(w * 0.6, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(40,26,14,0.4)';
        ctx.lineWidth = 1.5;
        for (const k of [-0.3, 0, 0.28]) {
          ctx.beginPath();
          ctx.moveTo(w * k, -h + 3);
          ctx.lineTo(w * k * 1.15, 0);
          ctx.stroke();
        }
        // The cut top, mossy at the edge, rings in the middle.
        ctx.fillStyle = '#6e8a3c';
        ctx.beginPath();
        ctx.ellipse(0, -h, w / 2, Math.max(3, w * 0.12), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#d6b07a';
        ctx.beginPath();
        ctx.ellipse(0, -h, w * 0.4, Math.max(2, w * 0.09), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(140,100,60,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(0, -h, w * 0.22, Math.max(1, w * 0.05), 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'can': {
        // A green watering can: spout off to the left, handle over the back, fill hole on top.
        ctx.strokeStyle = '#3f6e4a';
        ctx.lineWidth = Math.max(3, s * 0.07);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-w * 0.4, -h * 0.35);
        ctx.lineTo(-w * 0.95, -h * 1.05);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(w * 0.5, -h * 0.55, h * 0.32, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
        ctx.fillStyle = '#4f8a5a';
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h, w, h, 4);
        ctx.fill();
        ctx.fillStyle = '#3f6e4a';
        ctx.fillRect(-w * 1.02, -h * 1.12, w * 0.16, h * 0.12);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(-w * 0.42, -h * 0.9, w * 0.12, h * 0.8);
        open('#203a28');
        break;
      }
      case 'birdTable': {
        // A tray with a low lip, a scatter of seed.
        ctx.fillStyle = '#8a6a48';
        ctx.fillRect(-w / 2, -h, w, h);
        ctx.fillStyle = '#5a3e26';
        ctx.beginPath();
        ctx.ellipse(0, -h, m / 2, Math.max(2, m * 0.1), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e0c890';
        for (let k = -3; k <= 3; k++) ctx.fillRect(k * m * 0.12 - 1, -h - 1, 2, 2);
        break;
      }
      case 'pail': {
        // A little enamel pail, cream with a blue rim.
        ctx.fillStyle = '#e8e0cc';
        ctx.beginPath();
        ctx.moveTo(-w * 0.42, 0);
        ctx.lineTo(w * 0.42, 0);
        ctx.lineTo(w * 0.5, -h);
        ctx.lineTo(-w * 0.5, -h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#4a6a8a';
        ctx.fillRect(-w / 2, -h, w, h * 0.12);
        open('#3a3226');
        break;
      }
    }
    ctx.restore();
  }

  /** Scott, side on, swinging underhand. Returns where his hand is (for the acorn in it). */
  private drawScott(ctx: CanvasRenderingContext2D, t: number, power: number): CanvasPoint {
    const s = this.s;
    const A = SCOTT_APPEARANCE;
    const X = (x: number) => this.X(x);
    const Y = (y: number) => this.Y(y);
    // Shadow, boots, legs.
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(X(SCOTT_X), Y(0) + 2, 0.36 * s, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    const breath = Math.sin(t / 900) * 0.008;
    ctx.fillStyle = A.overalls;
    ctx.fillRect(X(SCOTT_X - 0.15), Y(0.95), 0.13 * s, 0.88 * s);
    ctx.fillStyle = A.overallsTrim;
    ctx.fillRect(X(SCOTT_X + 0.02), Y(0.95), 0.13 * s, 0.88 * s);
    ctx.fillStyle = A.boots;
    ctx.fillRect(X(SCOTT_X - 0.17), Y(0.08), 0.2 * s, 0.08 * s);
    ctx.fillRect(X(SCOTT_X + 0.01), Y(0.08), 0.2 * s, 0.08 * s);
    // Far arm hanging, chambray shirt, overalls bib.
    ctx.strokeStyle = A.shirt;
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.1 * s;
    ctx.beginPath();
    ctx.moveTo(X(SCOTT_X - 0.05), Y(1.42));
    ctx.lineTo(X(SCOTT_X - 0.12), Y(0.95));
    ctx.stroke();
    ctx.fillStyle = A.shirt;
    ctx.beginPath();
    ctx.roundRect(X(SCOTT_X - 0.17), Y(1.52 + breath), 0.34 * s, 0.6 * s, 0.08 * s);
    ctx.fill();
    ctx.fillStyle = A.overalls;
    ctx.fillRect(X(SCOTT_X - 0.15), Y(1.28), 0.3 * s, 0.38 * s);
    ctx.fillStyle = A.overallsTrim;
    ctx.fillRect(X(SCOTT_X - 0.1), Y(1.45), 0.04 * s, 0.18 * s);
    // Head: blonde hair, short beard, looking out at the target.
    const hx = X(SCOTT_X + 0.02);
    const hy = Y(1.67 + breath);
    ctx.fillStyle = A.skin;
    ctx.beginPath();
    ctx.arc(hx, hy, 0.13 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = A.hair;
    ctx.beginPath();
    ctx.arc(hx - 0.02 * s, hy - 0.03 * s, 0.135 * s, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
    ctx.fillStyle = A.beard;
    ctx.beginPath();
    ctx.arc(hx + 0.03 * s, hy + 0.04 * s, 0.1 * s, Math.PI * 0.05, Math.PI * 0.85);
    ctx.fill();
    ctx.fillStyle = '#3a2e22';
    ctx.beginPath();
    ctx.arc(hx + 0.07 * s, hy - 0.02 * s, Math.max(1, 0.018 * s), 0, Math.PI * 2);
    ctx.fill();

    // The throwing arm: drawn back with the pull, swung through on the throw, then down again.
    const since = (performance.now() - this.swingAt) / 1000;
    let swing: number;
    if (this.phase === 'aim') swing = RELEASE_SWING - 0.25 - power * 1.3;
    else if (since < 0.12) swing = RELEASE_SWING + (since / 0.12) * 0.9;
    else if (since < 0.7) swing = RELEASE_SWING + 0.9 - ((since - 0.12) / 0.58) * (RELEASE_SWING + 0.8);
    else swing = 0.1;
    const sx = X(SHOULDER.x);
    const sy = Y(SHOULDER.y + breath);
    const hand = { x: sx + Math.sin(swing) * ARM * s, y: sy + Math.cos(swing) * ARM * s };
    ctx.strokeStyle = A.shirt;
    ctx.lineWidth = 0.11 * s;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(hand.x, hand.y);
    ctx.stroke();
    ctx.fillStyle = A.skin;
    ctx.beginPath();
    ctx.arc(hand.x, hand.y, 0.055 * s, 0, Math.PI * 2);
    ctx.fill();
    return hand;
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
