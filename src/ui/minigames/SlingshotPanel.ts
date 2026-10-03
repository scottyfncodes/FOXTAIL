import type { Game } from '../../game/engine/Game';
import { SCOTT_APPEARANCE } from '../../game/data/character';
import { MiniGamePanel } from '../MiniGamePanel';
import type { CanvasPoint } from '../CanvasGamePanel';
import {
  CONE_R,
  POUCH,
  ROUNDS,
  STEP,
  aimGuide,
  launch,
  newCone,
  roundScore,
  stepCone,
  targetPos,
  type Cone,
  type Round,
  type TargetDef,
} from '../../game/systems/minigames/slingshot';

// Slingshot Targets in the rocky clearing. Pull back anywhere — the band
// stretches with you — and let go: the pinecone goes the other way, harder
// the further you pulled. Knock the painted wooden targets over; any
// pinecones left when a round's cleared are a point each.

const VIEW_X0 = -1.1;
const VIEW_W = 7.75;
const VIEW_H = 4.6;
/** How far the pouch can be drawn back, metres (on screen it's the band's full stretch). */
const MAX_DRAW = 0.7;
/** The guide by the slingshot: only the first tenth of a second of flight. */
const GUIDE_S = 0.1;
const SCOTT_X = -0.5;
const SHOULDER = { x: -0.42, y: 1.48 };
/** The slingshot: handle bottom, fork, and the two prong tips the band's tied to. */
const HANDLE = { x: POUCH.x, y: 0.98 };
const FORK = { x: POUCH.x, y: 1.14 };
const TIPS = [
  { x: POUCH.x - 0.08, y: 1.34 },
  { x: POUCH.x + 0.08, y: 1.34 },
];
const RED = SCOTT_APPEARANCE.flag;
const CREAM = '#f3e8cc';
const WOOD = '#9a7350';
const WOOD_DARK = '#6e4f34';

type Phase = 'aim' | 'flying' | 'between';

export class SlingshotPanel extends MiniGamePanel {
  private ri = 0;
  private up: boolean[] = [];
  /** When each target went over (round clock, s), for the flip. */
  private hitAt: number[] = [];
  private cones = 0;
  private score = 0;
  private roundScores: number[] = [];
  private cleared = 0;
  private phase: Phase = 'aim';
  private cone: Cone = newCone();
  /** Pinecones lying where they stopped this round. */
  private spent: { x: number; y: number; spin: number }[] = [];
  /** The round's clock: moving targets keep moving whatever you're doing. */
  private roundT = 0;
  private acc = 0;
  private dragFrom: CanvasPoint | null = null;
  private dragTo: CanvasPoint | null = null;
  /** When the band last snapped forward (round clock), for its twang. */
  private releasedAt = -10;
  private guide: { x: number; y: number }[] = [];
  private s = 30;
  private ox = 0;
  private gy = 0;

  constructor(game: Game) {
    super(game, 'slingshot');
  }

  private get round(): Round {
    return ROUNDS[this.ri];
  }

  protected start() {
    this.ri = 0;
    this.score = 0;
    this.roundScores = [];
    this.cleared = 0;
    this.startRound();
    this.setStatus(`Pull back anywhere to stretch the band and let go. Knock the wooden targets over. ${this.bestLine()}`);
    this.playingActions();
  }

  private startRound() {
    const r = this.round;
    this.up = r.targets.map(() => true);
    this.hitAt = r.targets.map(() => -10);
    this.cones = r.cones;
    this.spent = [];
    this.roundT = 0;
    this.phase = 'aim';
    this.cone = newCone();
    this.dragFrom = this.dragTo = null;
    this.banner = { text: `Round ${this.ri + 1}: ${r.name}`, sub: `${r.targets.length} targets · ${r.cones} pinecones`, until: performance.now() + 1700 };
    if (this.ri > 0) this.setStatus(this.ri === 2 ? 'These ones move. Lead them a little.' : `Spare pinecones are a point each if you clear the lot.`);
    this.refresh();
  }

  private refresh() {
    this.setCard(`Round ${this.ri + 1}/${ROUNDS.length} · ${this.cones} pinecone${this.cones === 1 ? '' : 's'}`, plural(this.score + this.liveRoundPoints(), 'point'));
  }

  /** Points knocked down so far this round (the spare-pinecone bonus comes at the end). */
  private liveRoundPoints(): number {
    if (this.phase === 'between') return 0;
    return this.round.targets.reduce((s, d, i) => s + (this.up[i] ? 0 : d.points), 0);
  }

  // ------------------------------------------------------------ input

  /** The pull, as a fraction of the full stretch and the way it'll fly. */
  private aim(): { angle: number; power: number; pullX: number; pullY: number } | null {
    if (!this.dragFrom || !this.dragTo) return null;
    const dx = this.dragTo.x - this.dragFrom.x;
    const dy = this.dragTo.y - this.dragFrom.y;
    const d = Math.hypot(dx, dy);
    if (d < 4) return null;
    const full = this.fullPull();
    const power = Math.min(1, d / full);
    // It flies away from the pull (screen y runs down, the world's up); kept forwards.
    let angle = Math.atan2(dy, -dx);
    const lim = Math.PI / 2.4;
    if (angle > lim || angle < -Math.PI / 6) angle = angle > lim || angle < -Math.PI / 2 ? lim : -Math.PI / 6;
    return { angle, power, pullX: -Math.cos(angle) * power, pullY: -Math.sin(angle) * power };
  }

  private fullPull(): number {
    return Math.max(110, Math.min(200, Math.min(this.cw, this.ch) * 0.45));
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
    if (!aim || aim.power < 0.05) return;
    launch(this.cone, aim.angle, aim.power);
    this.cones -= 1;
    this.phase = 'flying';
    this.releasedAt = this.roundT;
    this.refresh();
  }

  // ------------------------------------------------------------ play

  protected update(dt: number) {
    if (this.finished) return;
    if (this.phase !== 'flying') {
      this.roundT += dt;
      this.acc = 0;
      return;
    }
    this.acc += dt;
    while (this.acc >= STEP && this.phase === 'flying') {
      this.acc -= STEP;
      this.roundT += STEP;
      const ev = stepCone(this.cone, this.round, this.up, this.roundT, STEP);
      if (ev?.kind === 'hit') {
        this.hitAt[ev.index] = this.roundT;
        this.refresh();
      }
      if (this.cone.done) this.coneDone();
    }
  }

  private coneDone() {
    if (this.cone.x > VIEW_X0 && this.cone.x < VIEW_X0 + VIEW_W && this.spent.length < 12) {
      this.spent.push({ x: this.cone.x, y: this.cone.y, spin: this.cone.spin });
    }
    const allDown = this.up.every((u) => !u);
    if (!allDown && this.cones > 0) {
      this.phase = 'aim';
      this.cone = newCone();
      return;
    }
    // The round's over: tot it up.
    this.phase = 'between';
    const pts = roundScore(this.round, this.up, this.cones);
    this.roundScores.push(pts);
    this.score += pts;
    const now = performance.now();
    if (allDown) {
      this.cleared += 1;
      if (this.cones > 0) this.game.audio.playDiscoveryChime();
      this.banner = {
        text: 'All down!',
        sub: this.cones > 0 ? `+${this.cones} for the spare pinecone${this.cones === 1 ? '' : 's'}` : 'With the very last pinecone',
        until: now + 1900,
      };
    } else {
      const down = this.up.filter((u) => !u).length;
      this.banner = { text: 'Out of pinecones', sub: `${down} of ${this.up.length} down. Scott stands them back up.`, until: now + 1900 };
    }
    this.refresh();
    this.later(1900, () => this.next());
  }

  private next() {
    if (this.ri < ROUNDS.length - 1) {
      this.ri += 1;
      this.startRound();
      return;
    }
    const summary = `${this.cleared} of ${ROUNDS.length} rounds cleared · ${this.roundScores.join(' + ')}`;
    this.finish(this.score, summary);
  }

  // ------------------------------------------------------------ drawing

  protected canvasHeight(w: number): number {
    return Math.min(super.canvasHeight(w), Math.max(240, w * 0.88));
  }

  protected layout() {
    this.s = Math.min(this.cw / VIEW_W, this.ch / VIEW_H);
    this.ox = (this.cw - VIEW_W * this.s) / 2 - VIEW_X0 * this.s;
    this.gy = this.ch - Math.max(this.ch * 0.13, this.s * 0.6);
  }

  private X(x: number) {
    return this.ox + x * this.s;
  }

  private Y(y: number) {
    return this.gy - y * this.s;
  }

  protected draw(ctx: CanvasRenderingContext2D, t: number) {
    this.drawClearing(ctx, t);
    const round = this.round;
    for (let i = 0; i < round.targets.length; i++) this.drawTarget(ctx, round.targets[i], i);
    for (const c of this.spent) this.drawCone(ctx, this.X(c.x), this.Y(c.y), c.spin);

    const aim = this.phase === 'aim' && !this.finished ? this.aim() : null;
    const pouch = aim ? { x: POUCH.x + aim.pullX * MAX_DRAW, y: POUCH.y + aim.pullY * MAX_DRAW } : this.restingPouch();

    if (aim) {
      // A short faint guide just off the fork: which way, not where it lands.
      const path = aimGuide(aim.angle, aim.power, GUIDE_S, this.guide);
      ctx.save();
      ctx.setLineDash([2, 6]);
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(255,255,255,${0.4 + aim.power * 0.35})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(this.X(POUCH.x), this.Y(POUCH.y));
      for (const p of path) ctx.lineTo(this.X(p.x), this.Y(p.y));
      ctx.stroke();
      ctx.restore();
    }

    this.drawScott(ctx, t, pouch, !!aim);
    if (this.phase === 'aim' && !this.finished) this.drawCone(ctx, this.X(pouch.x), this.Y(pouch.y), 0);
    if (this.phase === 'flying') this.drawCone(ctx, this.X(this.cone.x), this.Y(this.cone.y), this.cone.spin);

    // Pinecones left in the basket, in the corner.
    if (!this.finished) {
      const n = this.cones - (this.phase === 'aim' ? 1 : 0);
      ctx.fillStyle = 'rgba(60,50,30,0.25)';
      ctx.beginPath();
      ctx.roundRect(5, 6, Math.max(1, this.round.cones) * 13 + 8, 24, 12);
      ctx.fill();
      for (let i = 0; i < this.round.cones; i++) {
        ctx.globalAlpha = i < Math.max(0, n) ? 1 : 0.22;
        this.drawCone(ctx, 15 + i * 13, 18, Math.PI / 2, 0.8);
      }
      ctx.globalAlpha = 1;
    }

    // First go: a nudge showing the pull.
    if (this.phase === 'aim' && this.ri === 0 && this.cones === this.round.cones && !this.dragFrom && (!this.banner || t > this.banner.until)) {
      const k = (t % 1600) / 1600;
      const x0 = this.X(POUCH.x) + 30;
      const y0 = this.Y(POUCH.y) - 10;
      ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - k)})`;
      ctx.beginPath();
      ctx.arc(x0 - k * 40, y0 + k * 18, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** At rest the pouch hangs between the prongs, and twangs a moment after a shot. */
  private restingPouch() {
    const since = this.roundT - this.releasedAt;
    const wob = since < 0.6 ? Math.sin(since * 40) * Math.exp(-since * 7) * 0.12 : 0;
    return { x: POUCH.x + wob, y: POUCH.y - 0.02 };
  }

  /** A sunny rocky clearing: big sky, pines at the edge, boulders, dry grass. */
  private drawClearing(ctx: CanvasRenderingContext2D, t: number) {
    const w = this.cw;
    const h = this.ch;
    const s = this.s;
    const g = ctx.createLinearGradient(0, 0, 0, this.gy);
    g.addColorStop(0, '#8ec6e6');
    g.addColorStop(0.7, '#cfe6ee');
    g.addColorStop(1, '#eef0dc');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // The sun, warm in the corner.
    const sx = w * 0.82;
    const sy = h * 0.14;
    const sun = ctx.createRadialGradient(sx, sy, 4, sx, sy, 60);
    sun.addColorStop(0, 'rgba(255,248,210,0.95)');
    sun.addColorStop(0.3, 'rgba(255,240,180,0.5)');
    sun.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(sx - 60, sy - 60, 120, 120);
    ctx.fillStyle = '#fff6d6';
    ctx.beginPath();
    ctx.arc(sx, sy, 14, 0, Math.PI * 2);
    ctx.fill();
    // A couple of slow clouds.
    for (let i = 0; i < 3; i++) {
      const cx = ((((i * 0.37 + t / 90000) % 1) + 1) % 1) * (w + 120) - 60;
      const cy = h * (0.1 + i * 0.09);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (const [dx, dy, r] of [
        [0, 0, 13],
        [14, -5, 16],
        [30, 0, 12],
      ] as const) {
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Pines on the far side of the clearing.
    for (let i = 0; i < 14; i++) {
      const px = (i / 13) * (w + 40) - 20;
      const ph = s * (1.4 + ((i * 0.618) % 1) * 1.2);
      const base = this.gy - s * 0.25;
      ctx.fillStyle = i % 2 ? '#6f9a74' : '#7ea880';
      ctx.beginPath();
      ctx.moveTo(px - ph * 0.28, base);
      ctx.lineTo(px, base - ph);
      ctx.lineTo(px + ph * 0.28, base);
      ctx.closePath();
      ctx.fill();
    }
    // The old pine on the right, whose branch the rope hangs from.
    const tx = this.X(VIEW_X0 + VIEW_W - 0.25);
    ctx.fillStyle = '#6a4e36';
    ctx.fillRect(tx - s * 0.18, this.Y(4.6), s * 0.36, this.gy - this.Y(4.6) + 2);
    ctx.strokeStyle = '#6a4e36';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(4, s * 0.14);
    ctx.beginPath();
    ctx.moveTo(tx, this.Y(3.55));
    ctx.quadraticCurveTo(this.X(5.5), this.Y(3.25), this.X(4.6), this.Y(3.45));
    ctx.stroke();
    ctx.fillStyle = '#3f6e48';
    for (const [bx, by, r] of [
      [4.85, 3.58, 0.38],
      [5.6, 3.5, 0.48],
      [6.2, 3.85, 0.6],
      [6.35, 4.6, 0.7],
    ] as const) {
      ctx.beginPath();
      ctx.ellipse(this.X(bx), this.Y(by), r * s * 1.2, r * s * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // The ground: dusty and sunlit, with tufts of dry grass.
    ctx.fillStyle = '#cdb98e';
    ctx.fillRect(0, this.gy, w, h - this.gy);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, this.gy, w, 2);
    ctx.strokeStyle = '#8ea85e';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 26; i++) {
      const x = ((i * 0.6180339 + 0.2) % 1) * w;
      const y = this.gy + 4 + ((i * 0.381966) % 1) * (h - this.gy - 6);
      for (const a of [-0.5, 0, 0.5]) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + a * 6, y - 6);
        ctx.stroke();
      }
    }
    // Rocks: a few boulders sitting in the clearing (just scenery).
    for (const [rx, rw, rh, c] of [
      [-0.95, 0.75, 0.42, '#a8a08e'],
      [1.9, 0.5, 0.26, '#9a917e'],
      [3.65, 0.38, 0.2, '#b0a894'],
      [5.75, 0.6, 0.32, '#9d947f'],
    ] as const) {
      const x = this.X(rx);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(x + 3, this.gy + 2, rw * s * 0.55, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(x, this.gy, rw * s * 0.5, rh * s, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.ellipse(x - rw * s * 0.15, this.gy - rh * s * 0.6, rw * s * 0.18, rh * s * 0.22, -0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Painted rings on a wooden disc: cream and red, a wooden rim. */
  private rings(ctx: CanvasRenderingContext2D, r: number) {
    ctx.fillStyle = WOOD_DARK;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    const bands = [CREAM, RED, CREAM, RED];
    bands.forEach((c, k) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(0, 0, r * (0.9 - k * 0.22), 0, Math.PI * 2);
      ctx.fill();
    });
  }

  /** The plain wooden back of a disc, seen once it's flipped. */
  private back(ctx: CanvasRenderingContext2D, r: number) {
    ctx.fillStyle = WOOD;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,56,36,0.4)';
    ctx.lineWidth = 1;
    for (const k of [-0.4, 0, 0.4]) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, k * r);
      ctx.lineTo(r * 0.8, k * r);
      ctx.stroke();
    }
  }

  private drawTarget(ctx: CanvasRenderingContext2D, d: TargetDef, i: number) {
    const s = this.s;
    const p = targetPos(d, this.roundT);
    const r = d.r * s;
    const down = !this.up[i];
    const since = this.roundT - this.hitAt[i];
    ctx.save();
    if (d.kind === 'disc' || d.kind === 'small' || d.kind === 'windmill') {
      // The post.
      const top = d.y - d.r * 0.9;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(this.X(d.x) + 2, this.gy + 2, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = WOOD_DARK;
      ctx.fillRect(this.X(d.x - 0.05), this.Y(top), 0.1 * s, top * s);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(this.X(d.x - 0.05), this.Y(top), 0.03 * s, top * s);
    }
    if (d.kind === 'disc' || d.kind === 'small') {
      // Hinged at the bottom: it flips over backwards and clatters flat.
      const hx = this.X(p.x);
      const hy = this.Y(d.y - d.r * 0.9);
      let k = 0;
      if (down) k = Math.min(1, since / 0.28);
      const ang = (k * Math.PI) / 2 + (down && since > 0.28 ? Math.sin((since - 0.28) * 30) * Math.exp(-(since - 0.28) * 8) * 0.15 : 0);
      const sy = Math.cos(ang);
      ctx.translate(hx, hy - r * 0.9 * sy);
      ctx.scale(1, Math.max(0.12, Math.abs(sy)));
      if (k < 0.75) this.rings(ctx, r);
      else this.back(ctx, r);
    } else if (d.kind === 'windmill') {
      // A little wooden windmill: blades turning in the breeze, the painted hub the thing to hit.
      ctx.translate(this.X(p.x), this.Y(p.y));
      const spin = down ? 2 + 14 * Math.exp(-since * 1.2) : 1.2;
      const a = (performance.now() / 1000) * (down ? 1 : 0.6) * spin;
      ctx.fillStyle = WOOD;
      for (let b = 0; b < 4; b++) {
        ctx.save();
        ctx.rotate(a + (b * Math.PI) / 2);
        ctx.fillRect(-r * 0.16, -r * 2.1, r * 0.32, r * 1.6);
        ctx.restore();
      }
      if (down) {
        // Turned to show its plain back as it went over.
        ctx.scale(Math.max(0.15, Math.cos(Math.min(1, since / 0.3) * Math.PI * 0.9)), 1);
        this.back(ctx, r);
      } else this.rings(ctx, r);
    } else if (d.kind === 'duck' && d.slide) {
      // The rail, on two short legs, and the plywood duck riding it.
      const top = d.y - d.r * 0.85;
      const x0 = this.X(d.x - d.slide.dx - 0.35);
      const x1 = this.X(d.x + d.slide.dx + 0.35);
      ctx.fillStyle = WOOD_DARK;
      ctx.fillRect(x0, this.Y(top), x1 - x0, 0.05 * s);
      for (const lx of [x0 + 4, x1 - 8]) ctx.fillRect(lx, this.Y(top), 4, top * s);
      const hx = this.X(p.x);
      const hy = this.Y(top);
      let k = 0;
      if (down) k = Math.min(1, since / 0.3);
      const sy = Math.cos((k * Math.PI) / 2);
      ctx.translate(hx, hy);
      ctx.scale(1, Math.max(0.1, sy));
      this.duck(ctx, r, k > 0.7);
    } else if (d.kind === 'swing' && d.swing) {
      // The rope from the branch, and a disc that spins round on it when struck.
      ctx.strokeStyle = '#d8c49a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.X(d.x), this.Y(d.y));
      ctx.lineTo(this.X(p.x), this.Y(p.y + d.r));
      ctx.stroke();
      ctx.translate(this.X(p.x), this.Y(p.y));
      ctx.rotate(-p.angle);
      if (down) {
        const turn = Math.min(Math.PI, since * 9) + Math.sin(since * 5) * Math.exp(-since * 2) * 0.5;
        const c = Math.cos(turn);
        ctx.scale(Math.max(0.08, Math.abs(c)), 1);
        if (c > 0) this.rings(ctx, r);
        else this.back(ctx, r);
      } else this.rings(ctx, r);
    }
    ctx.restore();
  }

  /** A plywood duck cut-out, painted: it's the base of it at (0, 0). */
  private duck(ctx: CanvasRenderingContext2D, r: number, back: boolean) {
    const body = back ? WOOD : '#e2b54c';
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.7, r * 1.15, r * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-r * 0.75, -r * 1.55, r * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(r * 0.9, -r * 0.95);
    ctx.lineTo(r * 1.5, -r * 1.35);
    ctx.lineTo(r * 1.1, -r * 0.5);
    ctx.fill();
    if (back) return;
    ctx.fillStyle = '#d9822e';
    ctx.beginPath();
    ctx.moveTo(-r * 1.15, -r * 1.65);
    ctx.lineTo(-r * 1.6, -r * 1.5);
    ctx.lineTo(-r * 1.15, -r * 1.4);
    ctx.fill();
    ctx.fillStyle = '#2a2018';
    ctx.beginPath();
    ctx.arc(-r * 0.85, -r * 1.65, Math.max(1, r * 0.09), 0, Math.PI * 2);
    ctx.fill();
    // A painted target on its side.
    ctx.fillStyle = CREAM;
    ctx.beginPath();
    ctx.arc(r * 0.1, -r * 0.7, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.arc(r * 0.1, -r * 0.7, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawCone(ctx: CanvasRenderingContext2D, x: number, y: number, spin: number, scale = 1) {
    const r = Math.max(4, CONE_R * this.s * 1.25) * scale;
    ctx.save();
    ctx.translate(x, y);
    if (scale === 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.ellipse(1, r * 0.8, r * 0.9, r * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.rotate(spin);
    ctx.fillStyle = '#8a5a32';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.15, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Its scales, in little chevrons.
    ctx.strokeStyle = '#5e3c20';
    ctx.lineWidth = Math.max(1, r * 0.18);
    for (const k of [-0.5, 0, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(k * r - r * 0.25, -r * 0.55);
      ctx.lineTo(k * r + r * 0.15, 0);
      ctx.lineTo(k * r - r * 0.25, r * 0.55);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Scott, side on, slingshot held out in one hand, the pouch in the other. */
  private drawScott(ctx: CanvasRenderingContext2D, t: number, pouch: { x: number; y: number }, pulling: boolean) {
    const s = this.s;
    const A = SCOTT_APPEARANCE;
    const X = (x: number) => this.X(x);
    const Y = (y: number) => this.Y(y);
    const breath = Math.sin(t / 900) * 0.008;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(X(SCOTT_X), Y(0) + 2, 0.38 * s, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Legs apart in a steady stance.
    ctx.fillStyle = A.overallsTrim;
    ctx.beginPath();
    ctx.moveTo(X(SCOTT_X - 0.02), Y(0.95));
    ctx.lineTo(X(SCOTT_X - 0.24), Y(0.06));
    ctx.lineTo(X(SCOTT_X - 0.1), Y(0.06));
    ctx.lineTo(X(SCOTT_X + 0.1), Y(0.95));
    ctx.fill();
    ctx.fillStyle = A.overalls;
    ctx.beginPath();
    ctx.moveTo(X(SCOTT_X - 0.12), Y(0.95));
    ctx.lineTo(X(SCOTT_X + 0.1), Y(0.06));
    ctx.lineTo(X(SCOTT_X + 0.24), Y(0.06));
    ctx.lineTo(X(SCOTT_X + 0.12), Y(0.95));
    ctx.fill();
    ctx.fillStyle = A.boots;
    ctx.fillRect(X(SCOTT_X - 0.3), Y(0.08), 0.2 * s, 0.08 * s);
    ctx.fillRect(X(SCOTT_X + 0.1), Y(0.08), 0.22 * s, 0.08 * s);
    ctx.fillStyle = A.shirt;
    ctx.beginPath();
    ctx.roundRect(X(SCOTT_X - 0.17), Y(1.55 + breath), 0.34 * s, 0.62 * s, 0.08 * s);
    ctx.fill();
    ctx.fillStyle = A.overalls;
    ctx.fillRect(X(SCOTT_X - 0.15), Y(1.3), 0.3 * s, 0.38 * s);
    const hx = X(SCOTT_X + 0.03);
    const hy = Y(1.7 + breath);
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
    // Squinting down the band while he aims.
    if (pulling) ctx.fillRect(hx + 0.05 * s, hy - 0.025 * s, 0.05 * s, Math.max(1, 0.012 * s));
    else ctx.arc(hx + 0.07 * s, hy - 0.02 * s, Math.max(1, 0.018 * s), 0, Math.PI * 2);
    ctx.fill();

    // The far arm holds the slingshot out; the near hand has the pouch.
    const sx = X(SHOULDER.x);
    const sy = Y(SHOULDER.y + breath);
    ctx.lineCap = 'round';
    ctx.strokeStyle = A.shirt;
    ctx.lineWidth = 0.1 * s;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(X(HANDLE.x - 0.02), Y(HANDLE.y + 0.06));
    ctx.stroke();
    // The slingshot: a forked stick.
    ctx.strokeStyle = '#7a5232';
    ctx.lineWidth = Math.max(2.5, 0.05 * s);
    ctx.beginPath();
    ctx.moveTo(X(HANDLE.x), Y(HANDLE.y - 0.05));
    ctx.lineTo(X(FORK.x), Y(FORK.y));
    ctx.lineTo(X(TIPS[0].x), Y(TIPS[0].y));
    ctx.moveTo(X(FORK.x), Y(FORK.y));
    ctx.lineTo(X(TIPS[1].x), Y(TIPS[1].y));
    ctx.stroke();
    ctx.fillStyle = A.skin;
    ctx.beginPath();
    ctx.arc(X(HANDLE.x), Y(HANDLE.y + 0.04), 0.05 * s, 0, Math.PI * 2);
    ctx.fill();
    // The band, stretched to the pouch.
    ctx.strokeStyle = '#4a3a2a';
    ctx.lineWidth = Math.max(1.5, 0.025 * s);
    ctx.beginPath();
    ctx.moveTo(X(TIPS[0].x), Y(TIPS[0].y));
    ctx.lineTo(X(pouch.x), Y(pouch.y));
    ctx.lineTo(X(TIPS[1].x), Y(TIPS[1].y));
    ctx.stroke();
    ctx.fillStyle = '#5a4030';
    ctx.beginPath();
    ctx.ellipse(X(pouch.x), Y(pouch.y), 0.06 * s, 0.045 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    const hand = pulling ? { x: X(pouch.x - 0.06), y: Y(pouch.y) } : { x: X(SHOULDER.x + 0.08), y: Y(0.98) };
    ctx.strokeStyle = A.shirt;
    ctx.lineWidth = 0.11 * s;
    ctx.beginPath();
    ctx.moveTo(sx + 0.03 * s, sy);
    ctx.lineTo(hand.x, hand.y);
    ctx.stroke();
    ctx.fillStyle = A.skin;
    ctx.beginPath();
    ctx.arc(hand.x, hand.y, 0.055 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
