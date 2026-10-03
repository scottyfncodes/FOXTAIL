import type { Game } from '../../game/engine/Game';
import { MiniGamePanel } from '../MiniGamePanel';
import type { CanvasPoint } from '../CanvasGamePanel';
import { SCOTT_APPEARANCE, SCOUT_APPEARANCE } from '../../game/data/character';
import { mulberry32 } from '../../game/engine/Random';
import {
  BUSHES,
  CREEK_X,
  FIELD_L,
  LOG,
  PUDDLE,
  STEP,
  STICKS,
  STICK_ORDER,
  THROWS,
  bushAt,
  createFetch,
  flagFor,
  previewThrow,
  stepFetch,
  throwStick,
  whistle,
  type Bush,
  type FetchGame,
  type Stick,
  type StickKind,
  type ThrowScore,
} from '../../game/systems/minigames/stickFetch';

// Sticks for Scout. Looking up the meadow from just behind Scott: pick a
// stick from the pile at his feet, drag back and let go, and off it goes,
// with Scout bounding after it. A tap while she's out whistles her home a
// bit quicker. Five throws; the flag's where the bonus is.

/** A drag this long (as a share of the canvas height) is a full-strength throw. */
const FULL_PULL = 0.3;
/** How much of the arc the aiming guide shows: a hint, not the answer. */
const GUIDE = 0.3;
const S = SCOUT_APPEARANCE;
const P = SCOTT_APPEARANCE;

interface Puff {
  x: number;
  y: number;
  t0: number;
  kind: 'dust' | 'splash' | 'leaf' | 'drop';
}

interface Flower {
  x: number;
  y: number;
  c: string;
}

export class StickFetchPanel extends MiniGamePanel {
  private g: FetchGame = createFetch(1);
  private acc = 0;
  private kind: StickKind = 'good';
  private dragFrom: CanvasPoint | null = null;
  private dragTo: CanvasPoint | null = null;
  /** When Scott let go, for his arm's follow-through (ms). */
  private thrownAt = -1e9;
  private whistledAt = -1e9;
  private puffs: Puff[] = [];
  private flowers: Flower[] = [];
  private seed = 0;
  private lastPhase = '';
  private wasBelowGoal = true;
  // Layout: the meadow's near edge (Scott's feet) and far edge on the canvas.
  private base = 0;
  private top = 0;
  private sx = 10;

  constructor(game: Game) {
    super(game, 'stickFetch');
    // The meadow's wildflowers, scattered the same way every time.
    const r = mulberry32(4242);
    const cols = ['#f4efe0', '#f2d35a', '#e9a6c0', '#c9b6e8', '#f4efe0'];
    for (let i = 0; i < 110; i++) {
      const x = -11 + r() * 22;
      const y = 2 + r() * (FIELD_L - 2);
      if (x > CREEK_X - 0.5) continue;
      this.flowers.push({ x, y, c: cols[Math.floor(r() * cols.length)] });
    }
  }

  protected start() {
    this.seed = (Date.now() ^ (this.seed * 2654435761)) >>> 0;
    this.g = createFetch(this.seed);
    this.acc = 0;
    this.kind = 'good';
    this.dragFrom = this.dragTo = null;
    this.thrownAt = this.whistledAt = -1e9;
    this.puffs = [];
    this.lastPhase = '';
    this.wasBelowGoal = true;
    this.refresh();
    this.playingActions();
  }

  private refresh() {
    const g = this.g;
    const n = Math.min(g.n + 1, THROWS);
    this.setCard(`Throw ${n} of ${THROWS}`, `${g.total} ${this.def.unit}`);
    if (g.phase === 'aim') {
      this.setStatus(
        g.n === 0
          ? `Pick a stick, then drag back and let go to throw. Near the flag scores extra. ${this.bestLine()}`
          : g.n === THROWS - 1
            ? 'Last one. The flag’s right out by the creek.'
            : 'Pick a stick and throw again. The flag’s further out now.'
      );
    } else if (g.phase === 'flight' || g.phase === 'fetch') {
      this.setStatus('Tap to whistle her along.');
    }
  }

  // ------------------------------------------------------------ layout & projection

  protected layout() {
    this.top = Math.max(26, this.ch * 0.06);
    this.base = this.ch - 26;
    this.sx = this.cw / 24;
  }

  /** The meadow seen from behind Scott: further away is higher up the canvas, and narrower. */
  private project(x: number, y: number, z = 0) {
    const u = Math.max(-0.2, Math.min(1.08, y / FIELD_L));
    const f = u * (1.35 - 0.35 * u);
    const k = 1.25 - 0.55 * u;
    const m = this.sx * k;
    return { x: this.cw / 2 + x * m, y: this.base - (this.base - this.top) * f - z * m, m };
  }

  private chips() {
    const w = Math.min(74, this.cw * 0.21);
    const y = this.ch - 30;
    return STICK_ORDER.map((kind, i) => ({ kind, x: this.cw * [0.12, 0.31, 0.875][i], y, w, h: 50 }));
  }

  // ------------------------------------------------------------ input

  protected onDown(p: CanvasPoint) {
    if (this.finished) return;
    const g = this.g;
    if (g.phase === 'aim') {
      for (const c of this.chips()) {
        if (Math.abs(p.x - c.x) < c.w / 2 + 4 && p.y > c.y - c.h / 2 - 8) {
          this.kind = c.kind;
          return;
        }
      }
      this.dragFrom = p;
      this.dragTo = p;
    } else if (g.phase === 'flight' || g.phase === 'fetch') {
      if (!g.scout.hurry && g.scout.mode !== 'wag' && g.scout.mode !== 'drop') {
        whistle(g);
        this.whistledAt = performance.now();
      }
    }
  }

  protected onMove(p: CanvasPoint) {
    if (this.dragFrom) this.dragTo = p;
  }

  protected onCancel() {
    this.dragFrom = this.dragTo = null;
  }

  protected onUp(p: CanvasPoint) {
    if (!this.dragFrom || this.finished) return;
    this.dragTo = p;
    const aim = this.aim();
    this.dragFrom = this.dragTo = null;
    if (!aim || aim.power < 0.08) return;
    if (throwStick(this.g, this.kind, aim.angle, aim.power)) {
      this.thrownAt = performance.now();
      this.refresh();
    }
  }

  /** Pulling back throws the other way: drag down to throw up the meadow. */
  private aim(): { angle: number; power: number } | null {
    if (!this.dragFrom || !this.dragTo) return null;
    const dx = this.dragTo.x - this.dragFrom.x;
    const dy = this.dragTo.y - this.dragFrom.y;
    const len = Math.hypot(dx, dy);
    if (len < 4) return null;
    // Scott throws forwards, never over his shoulder.
    const angle = Math.max(0.2, Math.min(Math.PI - 0.2, Math.atan2(dy, -dx)));
    return { angle, power: Math.min(1, len / (this.ch * FULL_PULL)) };
  }

  // ------------------------------------------------------------ play

  protected update(dt: number, t: number) {
    const g = this.g;
    if (this.finished) return;
    if (g.phase !== 'aim' && g.phase !== 'done') {
      this.acc += dt;
      while (this.acc >= STEP) {
        this.acc -= STEP;
        stepFetch(g, STEP);
        this.react(t);
        // Stepping may have ended the throw (the phase changes under us).
        const phase: string = g.phase;
        if (phase === 'aim' || phase === 'done') break;
      }
    } else this.acc = 0;
    this.puffs = this.puffs.filter((p) => t - p.t0 < 900);
    if (g.phase !== this.lastPhase) {
      this.lastPhase = g.phase;
      this.refresh();
      if (g.phase === 'done') {
        const line = g.scores.map((s) => s.total).join(' · ');
        this.later(700, () => this.finish(g.total, `Five sticks, five happy returns: ${line}.`));
      }
    }
  }

  private react(t: number) {
    const g = this.g;
    const s = g.stick;
    for (const e of g.events) {
      if (s && (e === 'land' || e === 'bounce' || e === 'thunk')) this.puffs.push({ x: s.x, y: s.y, t0: t, kind: 'dust' });
      if (s && e === 'splash') this.puffs.push({ x: s.x, y: s.y, t0: t, kind: 'splash' });
      if (s && e === 'snag') this.puffs.push({ x: s.x, y: s.y, t0: t, kind: 'leaf' });
      if (e === 'puddle' || e === 'wade') this.puffs.push({ x: g.scout.x, y: g.scout.y, t0: t, kind: 'splash' });
      if (e === 'shake') for (let i = 0; i < 3; i++) this.puffs.push({ x: g.scout.x, y: g.scout.y, t0: t + i * 200, kind: 'drop' });
      if (e === 'scored') this.scored(g.scores[g.scores.length - 1], t);
    }
    g.events.length = 0;
  }

  private scored(sc: ThrowScore, t: number) {
    const bits = [`${Math.round(sc.distance)} m`];
    if (sc.accuracy) bits.push(`flag +${sc.accuracy}`);
    if (sc.clean) bits.push(`clean +${sc.clean}`);
    if (sc.proud) bits.push(`proud +${sc.proud}`);
    if (sc.lie === 'creek') bits.push('a wet dog');
    else if (sc.lie === 'bush') bits.push('dug out of a bush');
    else if (sc.lie === 'puddle') bits.push('muddy');
    this.banner = { text: `+${sc.total}`, sub: bits.join(' · '), until: t + 1700 };
    if (this.wasBelowGoal && this.g.total >= this.def.goal) {
      this.wasBelowGoal = false;
      this.game.audio.playDiscoveryChime();
    }
    this.refresh();
  }

  // ------------------------------------------------------------ drawing

  protected draw(ctx: CanvasRenderingContext2D, t: number) {
    const g = this.g;
    this.drawMeadow(ctx, t);
    // Everything standing up in the meadow, far to near.
    const items: { y: number; draw: () => void }[] = [];
    for (const b of BUSHES) items.push({ y: b.y, draw: () => this.drawBush(ctx, b, t) });
    items.push({ y: (LOG.a.y + LOG.b.y) / 2 + 0.3, draw: () => this.drawLog(ctx) });
    const flag = flagFor(g);
    if (g.phase !== 'done') items.push({ y: flag.y, draw: () => this.drawFlag(ctx, flag.x, flag.y, t) });
    const s = g.stick;
    if (s) {
      // Snagged in a bush, it pokes out the front of it.
      const b = s.lie === 'bush' && s.rest && !g.scout.carrying ? bushAt(s) : undefined;
      items.push({ y: b ? b.y - b.r - 0.1 : s.y, draw: () => this.drawStick(ctx, s, b) });
    }
    items.push({ y: g.scout.y + 0.05, draw: () => this.drawScout(ctx, t) });
    items.sort((a, b) => b.y - a.y);
    for (const it of items) it.draw();
    for (const p of this.puffs) this.drawPuff(ctx, p, t);
    this.drawScott(ctx, t);
    if (g.phase === 'aim') {
      this.drawChips(ctx);
      this.drawGuide(ctx);
    }
    if (t - this.whistledAt < 700) {
      // A whistle: a little note over Scott's head.
      const u = (t - this.whistledAt) / 700;
      ctx.save();
      ctx.globalAlpha = 1 - u;
      ctx.fillStyle = '#f4ecd8';
      ctx.font = '600 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('♪', this.cw / 2 + 18, this.ch - this.scottH() - 6 - u * 18);
      ctx.restore();
    }
  }

  private drawMeadow(ctx: CanvasRenderingContext2D, t: number) {
    const cw = this.cw;
    const ch = this.ch;
    const pr = (x: number, y: number) => this.project(x, y);
    // The woods beyond the hedgerow.
    ctx.fillStyle = '#2f4c2c';
    ctx.fillRect(0, 0, cw, this.top + 8);
    ctx.fillStyle = '#3d5e37';
    for (let i = 0; i < 14; i++) {
      const x = (i / 13) * cw;
      ctx.beginPath();
      ctx.arc(x, this.top - 2 + ((i * 7) % 5), 12 + ((i * 5) % 7), 0, Math.PI * 2);
      ctx.fill();
    }
    // The meadow, in mown stripes going away.
    ctx.fillStyle = '#7aa04e';
    ctx.fillRect(0, this.top, cw, ch - this.top);
    ctx.fillStyle = 'rgba(255,255,220,0.07)';
    for (let y = 0; y < FIELD_L; y += 4) {
      const a = pr(-14, y);
      const b = pr(14, y + 2);
      ctx.fillRect(0, b.y, cw, a.y - b.y);
    }
    // The hedgerow along the top.
    const h0 = pr(0, FIELD_L);
    ctx.fillStyle = '#4a7038';
    for (let i = 0; i < 18; i++) {
      const x = (i / 17) * cw;
      ctx.beginPath();
      ctx.arc(x, h0.y - 1, 7 + ((i * 3) % 4), 0, Math.PI * 2);
      ctx.fill();
    }
    // The creek down the right-hand side, with its muddy bank.
    const bank = [pr(CREEK_X - 0.5, -3), pr(CREEK_X - 0.5, FIELD_L), pr(16, FIELD_L), pr(16, -3)];
    ctx.fillStyle = '#8a7350';
    ctx.beginPath();
    bank.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.fill();
    const water = [pr(CREEK_X, -3), pr(CREEK_X, FIELD_L), pr(16, FIELD_L), pr(16, -3)];
    ctx.fillStyle = '#4f8aa0';
    ctx.beginPath();
    water.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 14; i++) {
      // Ripples drifting downstream (toward Scott).
      const y = FIELD_L - (((t / 1000) * 1.5 + i * 2.6) % (FIELD_L + 3));
      const a = pr(CREEK_X + 0.8 + (i % 3) * 0.7, y);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + a.m * 0.7, a.y);
      ctx.stroke();
    }
    // Wildflowers.
    for (const f of this.flowers) {
      const q = pr(f.x, f.y);
      ctx.fillStyle = f.c;
      ctx.beginPath();
      ctx.arc(q.x, q.y, Math.max(1, q.m * 0.09), 0, Math.PI * 2);
      ctx.fill();
    }
    // The muddy puddle.
    this.groundEllipse(ctx, PUDDLE.x, PUDDLE.y, PUDDLE.rx + 0.35, PUDDLE.ry + 0.3, '#7a6244');
    this.groundEllipse(ctx, PUDDLE.x, PUDDLE.y, PUDDLE.rx, PUDDLE.ry, '#6d8590');
    this.groundEllipse(ctx, PUDDLE.x - 0.5, PUDDLE.y + 0.2, PUDDLE.rx * 0.4, PUDDLE.ry * 0.25, 'rgba(255,255,255,0.25)');
    // The mown patch round the flag: where the bonus is.
    if (this.g.phase !== 'done') {
      const f = flagFor(this.g);
      this.groundEllipse(ctx, f.x, f.y, 4, 4, 'rgba(255,255,220,0.12)');
      this.groundEllipse(ctx, f.x, f.y, 2, 2, 'rgba(255,255,220,0.16)');
    }
  }

  /** An ellipse lying flat on the meadow, in metres. */
  private groundEllipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const q = this.project(x + Math.cos(a) * rx, y + Math.sin(a) * ry);
      if (i) ctx.lineTo(q.x, q.y);
      else ctx.moveTo(q.x, q.y);
    }
    ctx.fill();
  }

  private drawBush(ctx: CanvasRenderingContext2D, b: Bush, t: number) {
    const g = this.g;
    const q = this.project(b.x, b.y);
    const r = b.r * q.m;
    // Rustling: Scout's in it after a stick, or one's just landed in it.
    const digging = g.scout.mode === 'dig' && g.stick && bushAt(g.stick) === b;
    const jig = digging ? Math.sin(t / 30) * r * 0.06 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(q.x, q.y + r * 0.1, r * 1.05, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    const blobs: [number, number, number, string][] = [
      [-0.5, -0.35, 0.55, '#3c6a33'],
      [0.5, -0.35, 0.55, '#3c6a33'],
      [0, -0.65, 0.65, '#457a3a'],
      [-0.25, -0.95, 0.45, '#558c44'],
      [0.3, -0.9, 0.42, '#558c44'],
    ];
    for (const [bx, by, br, c] of blobs) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(q.x + bx * r + jig * (bx > 0 ? 1 : -1), q.y + by * r, br * r, 0, Math.PI * 2);
      ctx.fill();
    }
    // A few berries.
    ctx.fillStyle = '#c9584a';
    for (const [bx, by] of [
      [-0.4, -0.6],
      [0.35, -0.5],
      [0.05, -1.05],
    ]) {
      ctx.beginPath();
      ctx.arc(q.x + bx * r, q.y + by * r, Math.max(1, r * 0.07), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawLog(ctx: CanvasRenderingContext2D) {
    const a = this.project(LOG.a.x, LOG.a.y);
    const b = this.project(LOG.b.x, LOG.b.y);
    const w = LOG.r * 2 * (a.m + b.m) * 0.5;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y + w * 0.35);
    ctx.lineTo(b.x, b.y + w * 0.35);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#6b4a2e';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - w * 0.2);
    ctx.lineTo(b.x, b.y - w * 0.2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,230,190,0.18)';
    ctx.lineWidth = w * 0.25;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - w * 0.45);
    ctx.lineTo(b.x, b.y - w * 0.45);
    ctx.stroke();
    // The cut ends, and a tuft of moss.
    for (const e of [a, b]) {
      ctx.fillStyle = '#c9a274';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y - w * 0.2, w * 0.28, w * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#6f9a4a';
    ctx.beginPath();
    ctx.ellipse(a.x + (b.x - a.x) * 0.4, a.y + (b.y - a.y) * 0.4 - w * 0.65, w * 0.6, w * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawFlag(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
    const q = this.project(x, y);
    const h = q.m * 1.9;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(q.x + h * 0.25, q.y, h * 0.3, h * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e6e2d6';
    ctx.lineWidth = Math.max(1.2, q.m * 0.09);
    ctx.beginPath();
    ctx.moveTo(q.x, q.y);
    ctx.lineTo(q.x, q.y - h);
    ctx.stroke();
    const flap = Math.sin(t / 260) * h * 0.05;
    ctx.fillStyle = P.flag;
    ctx.beginPath();
    ctx.moveTo(q.x, q.y - h);
    ctx.lineTo(q.x + h * 0.5, q.y - h * 0.86 + flap);
    ctx.lineTo(q.x, q.y - h * 0.68);
    ctx.closePath();
    ctx.fill();
  }

  /** A stick, in the air (with its shadow on the grass under it) or lying in the meadow. */
  private drawStick(ctx: CanvasRenderingContext2D, s: Stick, inBush?: Bush) {
    const ground = this.project(s.x, s.y);
    const at = this.project(s.x, s.y, s.z);
    const m = ground.m;
    const len = { switch: 1.3, good: 1.0, branch: 1.7 }[s.kind] * m * 1.25 * (inBush ? 0.6 : 1);
    if (!inBush) {
      ctx.fillStyle = s.lie === 'creek' || s.lie === 'puddle' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(ground.x, ground.y, len * 0.45, len * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const y = inBush ? this.project(inBush.x, inBush.y).y - inBush.r * m * 0.2 : at.y;
    this.stickShape(ctx, s.kind, at.x, y, len, s.rot, m);
  }

  private stickShape(ctx: CanvasRenderingContext2D, kind: StickKind, x: number, y: number, len: number, rot: number, m: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.lineCap = 'round';
    if (kind === 'switch') {
      ctx.strokeStyle = '#c9a878';
      ctx.lineWidth = Math.max(1.3, m * 0.07);
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.quadraticCurveTo(0, -len * 0.08, len / 2, len * 0.03);
      ctx.stroke();
      ctx.fillStyle = '#8fb35a';
      ctx.beginPath();
      ctx.ellipse(len / 2, len * 0.03, len * 0.08, len * 0.04, 0.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 'good') {
      ctx.strokeStyle = '#7a5232';
      ctx.lineWidth = Math.max(2, m * 0.14);
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.lineTo(len / 2, 0);
      ctx.moveTo(len * 0.15, 0);
      ctx.lineTo(len * 0.35, -len * 0.16);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#5a3d24';
      ctx.lineWidth = Math.max(3, m * 0.26);
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.lineTo(len / 2, 0);
      ctx.stroke();
      ctx.lineWidth = Math.max(1.5, m * 0.1);
      ctx.beginPath();
      ctx.moveTo(-len * 0.1, 0);
      ctx.lineTo(len * 0.12, -len * 0.25);
      ctx.moveTo(len * 0.2, 0);
      ctx.lineTo(len * 0.4, len * 0.2);
      ctx.stroke();
      ctx.fillStyle = '#5f9444';
      for (const [lx, ly] of [
        [len * 0.13, -len * 0.27],
        [len * 0.42, len * 0.22],
        [len * 0.5, -len * 0.04],
      ]) {
        ctx.beginPath();
        ctx.arc(lx, ly, len * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawPuff(ctx: CanvasRenderingContext2D, p: Puff, t: number) {
    const u = (t - p.t0) / 900;
    if (u < 0 || u > 1) return;
    const q = this.project(p.x, p.y);
    ctx.save();
    ctx.globalAlpha = 1 - u;
    if (p.kind === 'splash') {
      ctx.strokeStyle = 'rgba(230,245,250,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(q.x, q.y, q.m * (0.3 + u * 1.2), q.m * (0.1 + u * 0.4), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === 'drop') {
      // A shake-off: droplets flung out either side.
      ctx.fillStyle = '#cfe6f0';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(q.x + Math.cos(a) * q.m * (0.3 + u * 1.2), q.y - q.m * 0.5 + Math.sin(a) * q.m * 0.4 * (0.3 + u), 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = p.kind === 'leaf' ? '#5f9444' : 'rgba(200,180,140,0.8)';
      for (let i = 0; i < 4; i++) {
        const a = -Math.PI * (0.15 + i * 0.23);
        ctx.beginPath();
        ctx.arc(q.x + Math.cos(a) * q.m * u * 0.9, q.y + Math.sin(a) * q.m * u * 0.7 + u * u * q.m * 0.4, Math.max(1.2, q.m * 0.1 * (1 - u * 0.5)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ Scout

  private drawScout(ctx: CanvasRenderingContext2D, t: number) {
    const sc = this.g.scout;
    const q = this.project(sc.x, sc.y, sc.hop * 0.55);
    const tile = q.m * 4.2;
    const mode = sc.mode;
    const sitting = mode === 'sit' || mode === 'wag' || (mode === 'distracted' && sc.distraction === 'butterfly');
    const running = sc.moving && (mode === 'run' || mode === 'return');
    const sniffing = mode === 'sniff' || mode === 'pickup' || mode === 'drop' || (mode === 'distracted' && sc.distraction === 'smell');
    const digging = mode === 'dig';
    // Which way she faces on screen: up the meadow is up the canvas.
    let dx = Math.cos(sc.heading);
    let dy = -Math.sin(sc.heading) * 0.6;
    if (sitting) {
      // Sat at his feet facing up the meadow, a little turned toward him.
      dx = mode === 'distracted' ? 0.6 : -0.25;
      dy = -0.5;
    }
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl;
    dy /= dl;
    const bodyScaleY = sitting ? 0.62 : 1;
    // A bounding run: the whole dog lifts and drops.
    const gallop = running ? Math.abs(Math.sin(t / (sc.hurry ? 55 : 70))) * tile * 0.05 : 0;
    const shake = mode === 'shake' ? Math.sin(t / 22) * tile * 0.04 : 0;
    const cx = q.x + shake;
    const cy = q.y - tile * 0.12 - gallop;

    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(q.x, this.project(sc.x, sc.y).y, tile * 0.17, tile * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tail: going like the clappers when she's happy.
    const wagRate = mode === 'wag' || mode === 'sit' ? 45 : running ? 70 : 110;
    const wag = Math.sin(t / wagRate) * (mode === 'wag' ? 0.9 : 0.5);
    const tbx = cx - dx * tile * 0.14;
    const tby = cy - dy * tile * 0.1;
    ctx.strokeStyle = S.furDark;
    ctx.lineWidth = Math.max(1.2, tile * 0.045);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tbx, tby);
    ctx.quadraticCurveTo(tbx - dx * tile * 0.12 + wag * tile * 0.08, tby - tile * 0.12, tbx - dx * tile * 0.04 + wag * tile * 0.16, tby - tile * 0.18);
    ctx.stroke();

    // Legs.
    ctx.lineWidth = Math.max(1.2, tile * 0.04);
    if (sitting) {
      for (const side of [-1, 1]) {
        ctx.strokeStyle = S.furBase;
        ctx.beginPath();
        ctx.moveTo(cx + dx * tile * 0.06 + side * tile * 0.04, cy);
        ctx.lineTo(cx + dx * tile * 0.06 + side * tile * 0.04, cy + tile * 0.12);
        ctx.stroke();
      }
    } else {
      const sw = running ? Math.sin(t / (sc.hurry ? 55 : 70)) * tile * 0.07 : digging ? Math.sin(t / 40) * tile * 0.03 : 0;
      const legs: [number, number, number][] = [
        [0.09, -1, sw],
        [0.09, 1, -sw],
        [-0.09, -1, -sw],
        [-0.09, 1, sw],
      ];
      for (const [along, side, swing] of legs) {
        const lx = cx + dx * tile * along + -dy * side * tile * 0.05;
        const ly = cy + dy * tile * along * 0.5;
        ctx.strokeStyle = side < 0 ? S.furDark : S.furBase;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + dx * swing, ly + tile * 0.13);
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';

    // Body, with a scruffy darker patch.
    const tilt = digging ? 0.25 * Math.sign(dx || 1) : 0;
    ctx.fillStyle = S.furBase;
    ctx.beginPath();
    ctx.ellipse(cx, cy - tile * 0.02, tile * 0.15, tile * 0.11 * bodyScaleY, tilt, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = S.furDark;
    ctx.beginPath();
    ctx.ellipse(cx - dx * tile * 0.03, cy - tile * 0.05, tile * 0.08, tile * 0.05 * bodyScaleY, 0, 0, Math.PI * 2);
    ctx.fill();
    if (this.g.scout.wet) {
      ctx.fillStyle = '#cfe6f0';
      for (let i = 0; i < 3; i++) {
        const k = ((t / 400 + i / 3) % 1) * tile * 0.12;
        ctx.beginPath();
        ctx.arc(cx + (i - 1) * tile * 0.07, cy + tile * 0.06 + k, Math.max(1, tile * 0.012), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Head: down when she's nosing about or digging in.
    const drop = sniffing ? tile * 0.07 : digging ? tile * 0.1 : 0;
    const hx = cx + dx * tile * 0.15;
    const hy = cy + dy * tile * 0.1 - tile * 0.05 + drop;
    ctx.fillStyle = S.furBase;
    ctx.beginPath();
    ctx.arc(hx, hy, tile * 0.09, 0, Math.PI * 2);
    ctx.fill();
    // Floppy ears, one a little crooked, flapping when she runs.
    const flop = running ? Math.sin(t / 60) * tile * 0.03 : 0;
    ctx.fillStyle = S.furDark;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(hx + side * tile * 0.05, hy - tile * 0.06);
      ctx.quadraticCurveTo(hx + side * tile * 0.14, hy - tile * 0.04 - flop * side, hx + side * tile * (side < 0 ? 0.11 : 0.12), hy + tile * 0.04 - flop);
      ctx.lineTo(hx + side * tile * 0.04, hy - tile * 0.01);
      ctx.closePath();
      ctx.fill();
    }
    // Muzzle and nose, toward where she's facing.
    ctx.fillStyle = S.furLight;
    ctx.beginPath();
    ctx.ellipse(hx + dx * tile * 0.06, hy + tile * 0.025 + Math.max(0, dy) * tile * 0.03, tile * 0.05, tile * 0.037, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = S.nose;
    ctx.beginPath();
    ctx.arc(hx + dx * tile * 0.095, hy + tile * 0.02 + Math.max(0, dy) * tile * 0.04, Math.max(1, tile * 0.017), 0, Math.PI * 2);
    ctx.fill();
    // One good eye and the patch over the other (marked with a small x), when she's not facing away.
    if (dy > -0.95) {
      const e1x = hx + dx * tile * 0.02 - tile * 0.035;
      const e2x = hx + dx * tile * 0.02 + tile * 0.035;
      const ey = hy - tile * 0.015;
      const good = dx >= 0 ? e2x : e1x;
      const patch = dx >= 0 ? e1x : e2x;
      ctx.fillStyle = S.eye;
      ctx.beginPath();
      ctx.arc(good, ey, Math.max(0.9, tile * 0.016), 0, Math.PI * 2);
      ctx.fill();
      const r = tile * 0.017;
      ctx.strokeStyle = S.eyePatch;
      ctx.lineWidth = Math.max(0.8, tile * 0.016);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(patch - r, ey - r);
      ctx.lineTo(patch + r, ey + r);
      ctx.moveTo(patch + r, ey - r);
      ctx.lineTo(patch - r, ey + r);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    // Her green collar.
    ctx.strokeStyle = S.collar;
    ctx.lineWidth = Math.max(1.2, tile * 0.03);
    ctx.beginPath();
    ctx.arc(hx, hy + tile * 0.07, tile * 0.06, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();

    if (mode === 'distracted') {
      if (sc.distraction === 'butterfly') {
        // A butterfly she simply has to watch for a second.
        const bx = hx + tile * 0.25 + Math.sin(t / 300) * tile * 0.12;
        const by = hy - tile * 0.25 + Math.sin(t / 170) * tile * 0.06;
        const f = Math.abs(Math.sin(t / 50));
        ctx.fillStyle = '#f2d35a';
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(bx + side * tile * 0.03 * f, by, tile * 0.03 * f + 0.6, tile * 0.04, side * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Something wonderful in the grass: wavy lines of smell.
        ctx.strokeStyle = 'rgba(255,255,240,0.6)';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 2; i++) {
          const sx0 = hx + dx * tile * 0.12 + (i - 0.5) * tile * 0.08;
          ctx.beginPath();
          for (let k = 0; k <= 6; k++) {
            const yy = hy + tile * 0.08 - k * tile * 0.04;
            const xx = sx0 + Math.sin(k + t / 150 + i) * tile * 0.02;
            if (k) ctx.lineTo(xx, yy);
            else ctx.moveTo(xx, yy);
          }
          ctx.stroke();
        }
      }
    }
  }

  // ------------------------------------------------------------ Scott, from behind

  private scottH() {
    return Math.max(58, Math.min(96, this.ch * 0.17));
  }

  private drawScott(ctx: CanvasRenderingContext2D, t: number) {
    const H = this.scottH();
    const x = this.cw / 2;
    const feet = this.ch - 4;
    const u = H / 10;
    const aim = this.g.phase === 'aim' ? this.aim() : null;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(x, feet - u * 0.2, u * 2.4, u * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Boots and overall legs.
    ctx.fillStyle = P.boots;
    ctx.fillRect(x - u * 1.5, feet - u * 0.9, u * 1.2, u * 0.8);
    ctx.fillRect(x + u * 0.3, feet - u * 0.9, u * 1.2, u * 0.8);
    ctx.fillStyle = P.overalls;
    ctx.fillRect(x - u * 1.45, feet - u * 4.4, u * 1.1, u * 3.6);
    ctx.fillRect(x + u * 0.35, feet - u * 4.4, u * 1.1, u * 3.6);
    ctx.fillRect(x - u * 1.5, feet - u * 5.2, u * 3, u * 1.2);
    // Chambray shirt across his back.
    ctx.fillStyle = P.shirt;
    ctx.beginPath();
    ctx.roundRect(x - u * 1.7, feet - u * 8.2, u * 3.4, u * 3.4, u * 0.6);
    ctx.fill();
    // Overall straps crossing his back.
    ctx.strokeStyle = P.overallsTrim;
    ctx.lineWidth = u * 0.4;
    ctx.beginPath();
    ctx.moveTo(x - u * 1.0, feet - u * 8.0);
    ctx.lineTo(x + u * 0.7, feet - u * 5.0);
    ctx.moveTo(x + u * 1.0, feet - u * 8.0);
    ctx.lineTo(x - u * 0.7, feet - u * 5.0);
    ctx.stroke();
    // Left arm, easy at his side.
    ctx.strokeStyle = P.shirt;
    ctx.lineCap = 'round';
    ctx.lineWidth = u * 0.85;
    ctx.beginPath();
    ctx.moveTo(x - u * 1.6, feet - u * 7.6);
    ctx.lineTo(x - u * 2.0, feet - u * 5.0);
    ctx.stroke();
    // Throwing arm: drawn back while aiming, whipped up and over on the throw.
    const since = (t - this.thrownAt) / 1000;
    let armA: number;
    if (aim) armA = Math.PI * 0.55 + aim.power * Math.PI * 0.35;
    else if (since < 0.35) armA = Math.PI * (0.9 - (since / 0.35) * 1.15);
    else armA = Math.PI * 0.62;
    const sx = x + u * 1.6;
    const sy = feet - u * 7.6;
    const hx = sx + Math.sin(armA) * u * 2.8 * 0.6;
    const hy = sy + Math.cos(armA) * u * 2.8;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.fillStyle = P.skin;
    ctx.beginPath();
    ctx.arc(hx, hy, u * 0.45, 0, Math.PI * 2);
    ctx.fill();
    if (this.g.phase === 'aim') this.stickShape(ctx, this.kind, hx, hy, u * (this.kind === 'branch' ? 3.4 : 2.6), -0.9, u * 0.6);
    // Neck, ears and the back of his blonde head.
    ctx.fillStyle = P.skin;
    ctx.fillRect(x - u * 0.45, feet - u * 8.8, u * 0.9, u * 0.8);
    ctx.beginPath();
    ctx.arc(x - u * 1.0, feet - u * 9.3, u * 0.28, 0, Math.PI * 2);
    ctx.arc(x + u * 1.0, feet - u * 9.3, u * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = P.hair;
    ctx.beginPath();
    ctx.ellipse(x, feet - u * 9.4, u * 1.0, u * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.ellipse(x - u * 0.3, feet - u * 9.9, u * 0.4, u * 0.3, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------------ the stick pile and the aiming guide

  private drawChips(ctx: CanvasRenderingContext2D) {
    ctx.save();
    for (const c of this.chips()) {
      const sel = c.kind === this.kind;
      ctx.fillStyle = sel ? 'rgba(244,236,216,0.92)' : 'rgba(20,30,20,0.38)';
      ctx.beginPath();
      ctx.roundRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h, 10);
      ctx.fill();
      if (sel) {
        ctx.strokeStyle = '#355228';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      this.stickShape(ctx, c.kind, c.x, c.y - 7, c.w * (c.kind === 'branch' ? 0.66 : 0.6), -0.25, c.w / 9);
      ctx.fillStyle = sel ? '#2c3a22' : '#f4ecd8';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(STICKS[c.kind].name, c.x, c.y + c.h / 2 - 7, c.w - 6);
    }
    ctx.restore();
  }

  private drawGuide(ctx: CanvasRenderingContext2D) {
    const aim = this.aim();
    if (!aim || !this.dragFrom || !this.dragTo) return;
    const path = previewThrow(this.kind, aim.angle, aim.power, GUIDE);
    ctx.save();
    ctx.fillStyle = `rgba(255,255,255,${0.5 + aim.power * 0.4})`;
    for (const pt of path) {
      const q = this.project(pt.x, pt.y, pt.z);
      ctx.beginPath();
      ctx.arc(q.x, q.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // The pull itself: a faint line back from where the drag started, and its strength.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(this.dragFrom.x, this.dragFrom.y);
    ctx.lineTo(this.dragTo.x, this.dragTo.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(this.cw - 14, this.ch * 0.35, 6, this.ch * 0.3);
    ctx.fillStyle = `hsl(${120 - aim.power * 110},70%,55%)`;
    ctx.fillRect(this.cw - 14, this.ch * 0.65 - this.ch * 0.3 * aim.power, 6, this.ch * 0.3 * aim.power);
    ctx.restore();
  }
}
