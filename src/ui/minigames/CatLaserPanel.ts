import type { Game } from '../../game/engine/Game';
import { MiniGamePanel } from '../MiniGamePanel';
import type { CanvasPoint } from '../CanvasGamePanel';
import { CAT_APPEARANCE, SCOTT_APPEARANCE } from '../../game/data/character';
import {
  COUCH,
  ROOM_H,
  ROOM_W,
  STEP,
  createLaser,
  interestPaws,
  setPointer,
  stepLaser,
  timeLeft,
  type LaserGame,
} from '../../game/systems/minigames/catLaser';

// Laser pointer with Ranger, on the living-room boards. Touch and drag and
// the red dot goes where you point; lift your finger and it clicks off.
// Darting it about and stopping just in front of him is what gets him
// going — then it's the crouch, the wiggle, and the leap. A minute on the
// clock, and the score is how many times he lands on it.

/** On a touch screen the dot sits this far above your fingertip, so you can see it (CSS px). */
const FINGER_LIFT = 42;
/** Lingers on the content cat this long before the result goes up, ms. */
const END_PAUSE = 1800;

interface Heart {
  x: number;
  y: number;
  t0: number;
}

const A = CAT_APPEARANCE;

export class CatLaserPanel extends MiniGamePanel {
  private g: LaserGame = createLaser(1);
  private acc = 0;
  /** The clock starts the first time the pointer's switched on. */
  private running = false;
  private ending = false;
  private hearts: Heart[] = [];
  private shownCard = '';
  private seed = 0;
  /** Pixels per room unit and the room's top-left on the canvas. */
  private s = 50;
  private ox = 0;
  private oy = 0;

  constructor(game: Game) {
    super(game, 'catLaser');
  }

  protected start() {
    this.seed = (Date.now() ^ (this.seed * 2654435761)) >>> 0;
    this.g = createLaser(this.seed);
    this.acc = 0;
    this.running = false;
    this.ending = false;
    this.hearts = [];
    this.shownCard = '';
    this.refreshCard();
    this.setStatus(`Touch and drag to shine the dot; lift to switch it off. Dart it near Ranger and stop. ${this.bestLine()}`);
    this.playingActions();
  }

  private refreshCard() {
    const left = Math.ceil(timeLeft(this.g));
    const text = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}|${this.g.catches}`;
    if (text === this.shownCard) return;
    this.shownCard = text;
    this.setCard(`${this.def.name} · ${text.split('|')[0]}`, `${this.g.catches} ${this.g.catches === 1 ? 'pounce' : this.def.unit}`);
  }

  // ------------------------------------------------------------ input

  private toRoom(p: CanvasPoint, e: PointerEvent) {
    const lift = e.pointerType === 'touch' ? FINGER_LIFT : 0;
    return { x: (p.x - this.ox) / this.s, y: (p.y - lift - this.oy) / this.s };
  }

  protected onDown(p: CanvasPoint, e: PointerEvent) {
    if (this.finished || this.ending) return;
    this.running = true;
    setPointer(this.g, this.toRoom(p, e));
  }

  protected onMove(p: CanvasPoint, e: PointerEvent) {
    if (this.finished || this.ending || !this.g.pointer) return;
    setPointer(this.g, this.toRoom(p, e));
  }

  protected onUp() {
    setPointer(this.g, null);
  }

  protected onCancel() {
    setPointer(this.g, null);
  }

  // ------------------------------------------------------------ play

  protected update(dt: number, t: number) {
    if (!this.running || this.finished) return;
    const g = this.g;
    if (!g.over) {
      this.acc += dt;
      while (this.acc >= STEP && !g.over) {
        this.acc -= STEP;
        stepLaser(g, STEP);
      }
    }
    for (const e of g.events) {
      if (e === 'catch') {
        for (let i = 0; i < 3; i++) this.hearts.push({ x: g.cat.x + (i - 1) * 0.22, y: g.cat.y - 0.3, t0: t + i * 120 });
        // The goal reached: a genuinely good moment.
        if (g.catches === this.def.goal) this.game.audio.playDiscoveryChime();
      }
    }
    g.events.length = 0;
    this.hearts = this.hearts.filter((h) => t - h.t0 < 1400);
    this.refreshCard();
    if (g.over && !this.ending) {
      this.ending = true;
      setPointer(g, null);
      // Whoever had the pointer has put it down.
      g.on = false;
      this.setStatus('Time. Ranger flops down on the boards, very pleased with himself.');
      const n = g.catches;
      const summary =
        n === 0
          ? 'Not a single catch, but he had a lovely time.'
          : `He caught it ${n} time${n === 1 ? '' : 's'} in ${g.pounces} pounce${g.pounces === 1 ? '' : 's'}, and he's very pleased with himself.`;
      this.later(END_PAUSE, () => this.finish(n, summary));
    }
  }

  // ------------------------------------------------------------ drawing

  protected layout() {
    this.s = Math.min(this.cw / ROOM_W, this.ch / ROOM_H);
    this.ox = (this.cw - ROOM_W * this.s) / 2;
    this.oy = (this.ch - ROOM_H * this.s) / 2;
  }

  protected draw(ctx: CanvasRenderingContext2D, t: number) {
    const g = this.g;
    const s = this.s;
    ctx.save();
    this.drawFloor(ctx);
    ctx.translate(this.ox, this.oy);
    ctx.scale(s, s);
    this.drawRug(ctx);
    this.drawMat(ctx);
    // The dot goes under the couch's corner, so it's drawn first and the couch hides it.
    if (g.on && g.hidden) this.drawDot(ctx, t);
    this.drawCouch(ctx, t);
    if (g.on && g.hidden) {
      // A faint red glow leaking out from under the couch.
      ctx.fillStyle = 'rgba(255,40,40,0.18)';
      ctx.beginPath();
      ctx.ellipse(Math.min(g.base.x, COUCH.w), Math.min(g.base.y, COUCH.h), 0.2, 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (g.moth) this.drawMoth(ctx, g.moth.x, g.moth.y, t);
    // Caught, the dot's under his paws: drawn first, so his paws cover it.
    if (g.on && !g.hidden && g.cat.mode === 'caught') this.drawDot(ctx, t);
    this.drawRanger(ctx, t);
    if (g.on && !g.hidden && g.cat.mode !== 'caught') this.drawDot(ctx, t);
    for (const h of this.hearts) this.drawHeart(ctx, h, t);
    ctx.restore();
    this.drawGauge(ctx);
    if (!this.running && !this.finished) {
      // Before the first touch: a soft hint where to start.
      ctx.save();
      ctx.fillStyle = 'rgba(20,30,20,0.55)';
      ctx.beginPath();
      ctx.roundRect(this.cw / 2 - 110, this.ch - 46, 220, 32, 10);
      ctx.fill();
      ctx.fillStyle = '#f4ecd8';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Touch and drag to switch it on', this.cw / 2, this.ch - 25);
      ctx.restore();
    }
  }

  private drawFloor(ctx: CanvasRenderingContext2D) {
    const cw = this.cw;
    const ch = this.ch;
    const s = this.s;
    ctx.fillStyle = '#8a6444';
    ctx.fillRect(0, 0, cw, ch);
    // Floorboards, with staggered end-joints.
    const bw = s * 0.62;
    ctx.strokeStyle = 'rgba(60,40,24,0.28)';
    ctx.lineWidth = 1;
    let row = 0;
    for (let y = this.oy % bw; y < ch; y += bw, row++) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cw, y);
      ctx.stroke();
      const off = ((row * 37) % 5) * s * 0.55;
      for (let x = off - s * 3; x < cw; x += s * 2.8) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + bw);
        ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(255,230,190,0.05)';
    for (let y = this.oy % bw, r = 0; y < ch; y += bw, r++) if (r % 3 === 1) ctx.fillRect(0, y, cw, bw);
    // The skirting board along the wall at the top.
    ctx.fillStyle = '#d9ccb2';
    ctx.fillRect(0, 0, cw, this.oy + s * 0.14);
    ctx.fillStyle = '#efe6d2';
    ctx.fillRect(0, this.oy + s * 0.08, cw, s * 0.08);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, this.oy + s * 0.16, cw, s * 0.06);
  }

  private drawRug(ctx: CanvasRenderingContext2D) {
    // An old braided oval rug, half under the bottom-right.
    const cx = ROOM_W * 0.78;
    const cy = ROOM_H * 0.86;
    const rings = ['#9a6a48', '#b98a5a', '#7c8a5c', '#c9a274', '#a5584a', '#d4b483'];
    for (let i = 0; i < rings.length; i++) {
      ctx.fillStyle = rings[i];
      ctx.beginPath();
      ctx.ellipse(cx, cy, 2.6 - i * 0.36, 1.7 - i * 0.24, -0.15, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawMat(ctx: CanvasRenderingContext2D) {
    // The putting mat, peeking in along the left edge, a ball left on it.
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(-0.4, 4.25, 1.18, 4);
    ctx.fillStyle = '#5b3c26';
    ctx.fillRect(-0.5, 4.1, 1.18, 4);
    ctx.fillStyle = '#3f7a3c';
    ctx.fillRect(-0.5, 4.2, 1.08, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let y = 4.2; y < 8; y += 0.8) ctx.fillRect(-0.5, y, 1.08, 0.4);
    ctx.fillStyle = SCOTT_APPEARANCE.golfBall;
    ctx.beginPath();
    ctx.arc(0.3, 6.9, 0.09, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawCouch(ctx: CanvasRenderingContext2D, t: number) {
    const { x, y, w, h } = COUCH;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.roundRect(x - 0.2, y - 0.2, w + 0.32, h + 0.34, 0.2);
    ctx.fill();
    // The seat and back, and the rolled arm along the room side.
    ctx.fillStyle = '#6f7d5c';
    ctx.beginPath();
    ctx.roundRect(x - 0.2, y - 0.2, w + 0.2, h + 0.2, 0.18);
    ctx.fill();
    ctx.fillStyle = '#5f6c4e';
    ctx.fillRect(x - 0.2, y - 0.2, w + 0.2, 0.42);
    ctx.fillStyle = '#7d8b68';
    ctx.beginPath();
    ctx.roundRect(x + w - 0.42, y - 0.2, 0.42, h + 0.2, 0.2);
    ctx.fill();
    // A seam between the cushions.
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.42, y + 0.25);
    ctx.lineTo(x + w * 0.42, y + h);
    ctx.stroke();
    // One of Ellen's crochet blankets thrown over the arm.
    ctx.fillStyle = SCOTT_APPEARANCE.napBlanket;
    ctx.beginPath();
    ctx.moveTo(x + w - 0.55, y + 0.35);
    ctx.lineTo(x + w + 0.05, y + 0.3);
    ctx.lineTo(x + w + 0.08, y + 1.0);
    ctx.lineTo(x + w - 0.5, y + 1.1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,210,0.35)';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) ctx.fillRect(x + w - 0.48 + j * 0.18, y + 0.42 + i * 0.17, 0.07, 0.07);
    // Fringe off the end, stirring.
    ctx.strokeStyle = SCOTT_APPEARANCE.napBlanket;
    ctx.lineWidth = 0.03;
    for (let i = 0; i < 6; i++) {
      const fx = x + w - 0.48 + i * 0.1;
      const fy = y + 1.08 - i * 0.01;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + Math.sin(t / 900 + i) * 0.02, fy + 0.12);
      ctx.stroke();
    }
  }

  private drawDot(ctx: CanvasRenderingContext2D, t: number) {
    const { x, y } = this.g.dot;
    const px = 1 / this.s;
    const pulse = 1 + Math.sin(t / 90) * 0.08;
    ctx.fillStyle = 'rgba(255,30,30,0.22)';
    ctx.beginPath();
    ctx.arc(x, y, 10 * px * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,40,40,0.5)';
    ctx.beginPath();
    ctx.arc(x, y, 5.5 * px, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff2a2a';
    ctx.beginPath();
    ctx.arc(x, y, 3.6 * px, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd6d6';
    ctx.beginPath();
    ctx.arc(x, y, 1.4 * px, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawMoth(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
    const flap = Math.abs(Math.sin(t / 45));
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(x + 0.15, y + 0.35, 0.08, 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8ccb4';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(x + side * 0.07 * flap, y, 0.08 * flap + 0.01, 0.06, side * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#7a6a54';
    ctx.beginPath();
    ctx.ellipse(x, y, 0.015, 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawHeart(ctx: CanvasRenderingContext2D, h: Heart, t: number) {
    const u = (t - h.t0) / 1400;
    if (u < 0) return;
    const x = h.x + Math.sin(u * 6 + h.x * 9) * 0.06;
    const y = h.y - u * 0.8;
    const r = 0.07;
    ctx.globalAlpha = Math.max(0, 1 - u);
    ctx.fillStyle = '#f07a8a';
    ctx.beginPath();
    ctx.arc(x - r * 0.5, y, r * 0.6, Math.PI, 0);
    ctx.arc(x + r * 0.5, y, r * 0.6, Math.PI, 0);
    ctx.lineTo(x, y + r * 1.2);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** How keen he is, as five little paw prints in the corner. */
  private drawGauge(ctx: CanvasRenderingContext2D) {
    const n = this.running ? interestPaws(this.g) : 3;
    const x0 = this.cw - 16 - 4 * 15;
    const y0 = this.ch - 16;
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const x = x0 + i * 15;
      const y = y0 - (i % 2) * 5;
      ctx.fillStyle = i < n ? 'rgba(248,242,232,0.9)' : 'rgba(248,242,232,0.22)';
      ctx.beginPath();
      ctx.ellipse(x, y + 1.5, 3.4, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      for (const [dx, dy] of [
        [-3.4, -2.6],
        [-1.2, -4.4],
        [1.2, -4.4],
        [3.4, -2.6],
      ]) {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ Ranger, from above

  private drawRanger(ctx: CanvasRenderingContext2D, t: number) {
    const g = this.g;
    const c = g.cat;
    const mode = c.mode;
    const sitting = mode === 'watch' || mode === 'search' || mode === 'stare' || mode === 'moth' || mode === 'groom' || (mode === 'miss' && c.modeT > 0.45);
    const crouch = mode === 'stalk' || mode === 'wiggle' || mode === 'caught';
    const stretch = mode === 'pounce' || mode === 'zoomies' || (mode === 'miss' && c.modeT <= 0.45);
    const flop = mode === 'flop' || mode === 'content';
    const hop = c.hop;
    // Licking a paw after a miss, as if he meant it; grooming when he's lost interest.
    const licking = mode === 'groom' || (mode === 'miss' && c.modeT > 0.6);

    // His shadow stays on the floor while he's in the air.
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(c.x + 0.05, c.y + 0.08, 0.55 - hop * 0.12, 0.4 - hop * 0.1, c.heading, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(c.x, c.y - hop * 0.35);
    ctx.rotate(c.heading);
    // Drawn a little larger than life, so his face reads on a phone.
    const k = (1 + hop * 0.18) * 1.2;
    ctx.scale(k, k);

    // Ears up and forward when he's keen, swept back when he's hunting, slack when he's bored.
    const keen = g.interest;
    const wig = mode === 'wiggle' ? Math.sin(t / 26) * 0.06 : 0;
    const tailSway = Math.sin(t / (mode === 'stalk' || mode === 'wiggle' ? 110 : 520)) * (mode === 'stalk' || mode === 'wiggle' ? 0.08 : 0.18);

    if (flop) {
      this.drawFlopped(ctx, t, mode === 'content');
      ctx.restore();
      return;
    }

    // The tail first: under everything.
    const tail = (u: number): [number, number] => {
      if (sitting || (mode === 'caught' && c.modeT > 0.3)) {
        // Wrapped round beside him, the tip by his front paws, ticking.
        const a = Math.PI * (1 - u * 0.85);
        return [Math.cos(a) * 0.36 + 0.02, 0.28 + Math.sin(a) * 0.06 - u * 0.02 + (u > 0.7 ? tailSway * (u - 0.7) * 2 : 0)];
      }
      if (stretch) return [-0.5 - u * 0.62, Math.sin(u * 2 + t / 120) * 0.04 * u];
      // Low and out behind, the tip flicking.
      return [-0.42 - u * 0.6, wig + Math.sin(u * 2.4) * 0.1 * u + tailSway * u * u * 2];
    };
    for (let i = 0; i <= 11; i++) {
      const u = i / 11;
      const [tx, ty] = tail(u);
      const r = 0.075 + 0.04 * Math.sin(u * Math.PI * 0.85);
      ctx.fillStyle = u > 0.8 ? A.furLight : A.furBase;
      ctx.beginPath();
      ctx.arc(tx, ty, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Paws: white socks.
    const paw = (x: number, y: number) => {
      ctx.fillStyle = A.furLight;
      ctx.beginPath();
      ctx.ellipse(x, y, 0.08, 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    if (crouch) {
      paw(0.36, -0.16);
      paw(0.36, 0.16);
      paw(-0.28 + 0, -0.22 + wig);
      paw(-0.28, 0.22 + wig);
    } else if (stretch) {
      const run = mode === 'zoomies' ? Math.sin(t / 40) * 0.08 : 0;
      paw(0.6 + run, -0.1);
      paw(0.6 - run, 0.1);
      paw(-0.55 - run, -0.12);
      paw(-0.55 + run, 0.12);
    } else {
      paw(0.3, -0.08);
      if (!licking) paw(0.3, 0.08);
    }

    // The body: a fluffy orange blob, a white chest, darker tabby bars across the back.
    const fluffy = (x: number, y: number, rx: number, ry: number, color: string, tufts: number) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < tufts; i++) {
        const a = (i / tufts) * Math.PI * 2 + 0.3;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * rx * 0.88, y + Math.sin(a) * ry * 0.88, Math.min(rx, ry) * 0.36, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    let headX: number;
    if (sitting) {
      // Sat up, from above: broad haunches behind, a white chest in front.
      fluffy(-0.1, 0, 0.3, 0.3, A.furBase, 10);
      ctx.fillStyle = A.furLight;
      ctx.beginPath();
      ctx.ellipse(0.13, 0, 0.16, 0.17, 0, 0, Math.PI * 2);
      ctx.fill();
      headX = 0.12;
    } else if (crouch) {
      fluffy(-0.18, wig * 0.8, 0.26, 0.24, A.furBase, 8);
      fluffy(0.08, 0, 0.34, 0.2, A.furBase, 8);
      headX = 0.42;
    } else {
      fluffy(0, 0, 0.5, 0.2, A.furBase, 10);
      headX = 0.5;
    }
    ctx.strokeStyle = 'rgba(150,80,24,0.55)';
    ctx.lineWidth = 0.05;
    ctx.lineCap = 'round';
    const bars = sitting ? [-0.28, -0.16, -0.04] : [-0.3, -0.15, 0, 0.15];
    for (const bx of bars) {
      const w = sitting ? 0.2 : 0.13;
      ctx.beginPath();
      ctx.moveTo(bx + 0.03, -w);
      ctx.quadraticCurveTo(bx - 0.03, 0, bx + 0.03, w);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';

    // The head turns to look, within reason.
    let rel = c.look - c.heading;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    rel = Math.max(-1.3, Math.min(1.3, rel));
    if (licking) rel = 0.9 + Math.sin(t / 160) * 0.08;
    ctx.save();
    ctx.translate(headX, 0);
    ctx.rotate(rel);
    if (licking) {
      // A front paw raised to his mouth.
      ctx.fillStyle = A.furLight;
      ctx.beginPath();
      ctx.ellipse(0.18, 0.02, 0.08, 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const earMode = mode === 'stalk' || mode === 'wiggle' ? 'back' : keen > 0.55 || mode === 'pounce' || mode === 'zoomies' ? 'up' : keen < 0.3 ? 'slack' : 'mid';
    this.drawHead(ctx, t, earMode, mode === 'caught' && c.modeT > 0.25, mode === 'stalk' || mode === 'wiggle' || mode === 'pounce');
    ctx.restore();
    ctx.restore();
  }

  /** His head from above, facing +x: ears, cheek ruff, white muzzle, green eyes. */
  private drawHead(ctx: CanvasRenderingContext2D, t: number, ears: 'up' | 'mid' | 'back' | 'slack', smug: boolean, wide: boolean) {
    const tip: Record<typeof ears, [number, number]> = { up: [0.04, 0.27], mid: [-0.05, 0.27], back: [-0.2, 0.2], slack: [-0.1, 0.28] };
    const [tx, ty] = tip[ears];
    const twitch = ears === 'up' ? Math.max(0, Math.sin(t / 700)) ** 8 * 0.04 : 0;
    for (const side of [-1, 1]) {
      ctx.fillStyle = A.furBase;
      ctx.beginPath();
      ctx.moveTo(0.04, side * 0.06);
      ctx.lineTo(tx + twitch, side * ty);
      ctx.lineTo(-0.1, side * 0.13);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = A.nose;
      ctx.beginPath();
      ctx.moveTo(0.01, side * 0.09);
      ctx.lineTo(tx * 0.8 + twitch, side * ty * 0.86);
      ctx.lineTo(-0.06, side * 0.13);
      ctx.closePath();
      ctx.fill();
    }
    // Cheek ruff.
    ctx.fillStyle = A.furBase;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 0.19, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(150,80,24,0.5)';
    ctx.beginPath();
    ctx.ellipse(-0.06, 0, 0.07, 0.03, 0, 0, Math.PI * 2);
    ctx.fill();
    // White muzzle and bib, pink nose.
    ctx.fillStyle = A.furLight;
    ctx.beginPath();
    ctx.ellipse(0.13, 0, 0.08, 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = A.nose;
    ctx.beginPath();
    ctx.arc(0.2, 0, 0.028, 0, Math.PI * 2);
    ctx.fill();
    // Green eyes; pupils go wide when he's hunting, and he shuts them, smug, when he's caught it.
    for (const side of [-1, 1]) {
      if (smug) {
        ctx.strokeStyle = '#3a2a1a';
        ctx.lineWidth = 0.022;
        ctx.beginPath();
        ctx.arc(0.08, side * 0.085, 0.035, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = A.eye;
      ctx.beginPath();
      ctx.ellipse(0.09, side * 0.085, 0.035, 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#16120c';
      ctx.beginPath();
      ctx.ellipse(0.095, side * 0.085, wide ? 0.026 : 0.012, wide ? 0.024 : 0.026, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** On his side, belly to the room, paws in the air. Content, at the end, with a slow breath. */
  private drawFlopped(ctx: CanvasRenderingContext2D, t: number, content: boolean) {
    const breathe = 1 + Math.sin(t / (content ? 900 : 500)) * 0.03;
    const roll = content ? 0 : Math.sin(t / 300) * 0.05;
    ctx.rotate(roll);
    // Tail out in a lazy curve.
    for (let i = 0; i <= 11; i++) {
      const u = i / 11;
      const a = Math.PI * (0.9 + u * 0.5);
      ctx.fillStyle = u > 0.8 ? A.furLight : A.furBase;
      ctx.beginPath();
      ctx.arc(-0.4 + Math.cos(a) * 0.45 + 0.45, -0.25 + Math.sin(a) * 0.4 - 0.05, 0.075 + 0.04 * Math.sin(u * Math.PI * 0.85), 0, Math.PI * 2);
      ctx.fill();
    }
    // Paws stuck out to the side, curled.
    ctx.fillStyle = A.furLight;
    for (const [x, y] of [
      [0.3, 0.32],
      [0.14, 0.36],
      [-0.2, 0.34],
      [-0.34, 0.3],
    ]) {
      ctx.beginPath();
      ctx.ellipse(x, y + Math.sin(t / 400 + x * 5) * (content ? 0 : 0.02), 0.07, 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = A.furBase;
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.48, 0.28 * breathe, 0, 0, Math.PI * 2);
    ctx.fill();
    // The white belly, the side he's showing the room.
    ctx.fillStyle = A.belly;
    ctx.beginPath();
    ctx.ellipse(0.02, 0.1, 0.36, 0.16 * breathe, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,80,24,0.5)';
    ctx.lineWidth = 0.05;
    ctx.lineCap = 'round';
    for (const bx of [-0.25, -0.1, 0.05]) {
      ctx.beginPath();
      ctx.moveTo(bx, -0.24);
      ctx.quadraticCurveTo(bx - 0.04, -0.12, bx + 0.02, -0.04);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.save();
    ctx.translate(0.5, 0.02);
    ctx.rotate(0.5);
    this.drawHead(ctx, t, 'slack', true, false);
    ctx.restore();
  }
}
