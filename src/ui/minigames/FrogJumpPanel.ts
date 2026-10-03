import type { Game } from '../../game/engine/Game';
import type { CanvasPoint } from '../CanvasGamePanel';
import { MiniGamePanel } from '../MiniGamePanel';
import { scoreText } from '../../game/systems/minigames';
import {
  FAR_EDGE,
  FROG_R,
  JUMP_TIME,
  NEAR_DEPTH,
  POND_W,
  STAGES,
  FrogRun,
  chargeLength,
  padAt,
  type Pad,
  type Weather,
} from '../../game/systems/minigames/frogJump';

// A frog crossing the slack water on the lily pads, three stretches of it.
// Touch and hold: the frog turns to your finger and the jump gathers —
// swelling long and easing back short — so let go when the ring sits on
// a pad. A miss is a splash and a sheepish paddle back, nothing worse.

const STEP = 1 / 240;

// The creek's colours, from the game's own creek ground.
const WATER = '#3f6b6e';
const WATER_LIGHT = '#4a7a7a';
const WATER_DEEP = '#356060';
const PAD = '#4f8a3a';
const PAD_DARK = '#3c6e2c';
const FROG = '#6aa040';
const FROG_DARK = '#4e7e2e';

interface Fx {
  kind: 'ring' | 'splash' | 'text';
  x: number;
  y: number;
  t0: number;
  text?: string;
}

/** A cheap, steady scatter for the rain: the same drop lands in the same place each time round. */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export class FrogJumpPanel extends MiniGamePanel {
  private run = new FrogRun();
  private acc = 0;
  /** Seconds since the session started: the water and the weather keep going. */
  private clock = 0;
  /** Holding to jump: how long, and where the finger is (canvas px). */
  private charge: { hold: number; x: number; y: number } | null = null;
  private fx: Fx[] = [];
  private camY = 0;
  private scale = 50;
  private ox = 0;
  /** Waiting on the stretch's celebration before the next one. */
  private between = false;

  constructor(game: Game) {
    super(game, 'frogJump');
  }

  protected start() {
    this.run = new FrogRun();
    this.acc = 0;
    this.charge = null;
    this.fx = [];
    this.between = false;
    this.snapCamera();
    this.introBanner();
    this.setStatus('Touch and hold: the frog faces your finger and the jump grows and shrinks. Let go when the ring sits on a pad.');
    this.playingActions();
    this.refreshCard();
  }

  private introBanner() {
    const st = this.run.stageDef;
    this.banner = { text: st.name, sub: `Stretch ${this.run.stage + 1} of ${STAGES.length} · ${st.sub}`, until: performance.now() + 1800 };
  }

  private refreshCard() {
    if (this.finished) return;
    const combo = this.run.combo >= 2 ? ` · ${this.run.combo} in a row` : '';
    this.setCard(`Stretch ${this.run.stage + 1}/${STAGES.length}${combo}`, scoreText(this.def, this.run.score));
  }

  // ------------------------------------------------------------ layout & mapping

  protected layout() {
    // The creek fills the width, but keep a decent stretch of it in view on a short, wide canvas.
    this.scale = Math.min(this.cw / POND_W, this.ch / 6.2);
    this.ox = (this.cw - POND_W * this.scale) / 2;
    this.snapCamera();
  }

  private X(x: number) {
    return this.ox + x * this.scale;
  }

  private Y(y: number) {
    return (y - this.camY) * this.scale;
  }

  private cameraTarget(): number {
    const viewH = this.ch / this.scale;
    const L = this.run.stageDef.length;
    const top = -1.1;
    const bottom = L + 0.5;
    if (bottom - top <= viewH) return (top + bottom - viewH) / 2;
    const want = this.run.frog.y - viewH * 0.66;
    return Math.max(top, Math.min(bottom - viewH, want));
  }

  private snapCamera() {
    if (this.ch > 0) this.camY = this.cameraTarget();
  }

  // ------------------------------------------------------------ input

  protected onDown(p: CanvasPoint) {
    if (this.finished || this.between || !this.run.canJump) return;
    this.charge = { hold: 0, x: p.x, y: p.y };
    this.aimFrog();
  }

  protected onMove(p: CanvasPoint) {
    if (!this.charge) return;
    this.charge.x = p.x;
    this.charge.y = p.y;
    this.aimFrog();
  }

  protected onCancel() {
    this.charge = null;
  }

  protected onUp(p: CanvasPoint) {
    const c = this.charge;
    this.charge = null;
    if (!c || this.finished || !this.run.canJump) return;
    c.x = p.x;
    c.y = p.y;
    const d = this.aimDir(c);
    this.run.jump(d.x, d.y, c.hold);
  }

  /** Which way the frog should go: toward the finger, or straight on if the finger's on the frog. */
  private aimDir(c: { x: number; y: number }): { x: number; y: number } {
    const f = this.run.frog;
    const wx = (c.x - this.ox) / this.scale;
    const wy = c.y / this.scale + this.camY;
    const dx = wx - f.x;
    const dy = wy - f.y;
    if (Math.hypot(dx, dy) < 0.3) return { x: Math.cos(f.face), y: Math.sin(f.face) };
    return { x: dx, y: dy };
  }

  private aimFrog() {
    if (!this.charge) return;
    const d = this.aimDir(this.charge);
    this.run.frog.face = Math.atan2(d.y, d.x);
  }

  // ------------------------------------------------------------ play

  protected update(dt: number) {
    this.clock += dt;
    if (this.charge) this.charge.hold += dt;
    this.acc += dt;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      for (const e of this.run.step(STEP)) this.onEvent(e);
    }
    // The camera eases after the frog.
    const target = this.cameraTarget();
    this.camY += (target - this.camY) * Math.min(1, dt * 3);
    if (this.fx.length > 30) this.fx.splice(0, this.fx.length - 30);
  }

  private onEvent(e: ReturnType<FrogRun['step']>[number]) {
    const f = this.run.frog;
    const now = this.clock;
    switch (e.type) {
      case 'hop':
        this.fx.push({ kind: 'ring', x: f.x, y: f.y, t0: now });
        if (e.points > 0) this.fx.push({ kind: 'text', x: f.x, y: f.y - 0.4, t0: now, text: `+${e.points}` });
        this.refreshCard();
        break;
      case 'fly':
        this.fx.push({ kind: 'text', x: f.x, y: f.y - 0.85, t0: now + 0.15, text: `dragonfly +${e.points}` });
        this.refreshCard();
        break;
      case 'splash':
        this.charge = null;
        this.fx.push({ kind: 'splash', x: f.x, y: f.y, t0: now });
        this.fx.push({ kind: 'ring', x: f.x, y: f.y, t0: now });
        this.fx.push({ kind: 'text', x: f.x, y: f.y - 0.5, t0: now, text: e.dunk ? 'glub' : 'sploosh' });
        this.refreshCard();
        break;
      case 'ashore':
        break;
      case 'stage': {
        this.charge = null;
        this.between = true;
        const st = this.run.stageDef;
        this.fx.push({ kind: 'text', x: f.x, y: f.y + 0.3, t0: now, text: `+${e.points}` });
        this.refreshCard();
        this.game.audio.playDiscoveryChime();
        const caught = this.run.caught.size;
        this.banner = {
          text: e.last ? 'All the way across!' : 'Across!',
          sub: `${st.name} crossed${caught ? ` · ${caught} dragonfl${caught === 1 ? 'y' : 'ies'}` : ''}`,
          until: performance.now() + 2000,
        };
        this.later(2100, () => {
          if (this.run.done) {
            const r = this.run;
            this.finish(r.score, `${r.hops} pads · ${r.fliesCaught} dragonfl${r.fliesCaught === 1 ? 'y' : 'ies'} · ${r.splashes} splash${r.splashes === 1 ? '' : 'es'}`);
            return;
          }
          this.run.nextStage();
          this.between = false;
          this.fx = [];
          this.snapCamera();
          this.introBanner();
          this.refreshCard();
        });
        break;
      }
    }
  }

  // ------------------------------------------------------------ drawing

  protected draw(ctx: CanvasRenderingContext2D, t: number) {
    const w = this.cw;
    const h = this.ch;
    const s = this.scale;
    const run = this.run;
    const st = run.stageDef;
    const time = this.clock;

    // The water.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, WATER_LIGHT);
    g.addColorStop(0.5, WATER);
    g.addColorStop(1, WATER_DEEP);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // The current: soft streaks drifting across.
    ctx.strokeStyle = 'rgba(220,240,232,0.10)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const y0 = Math.floor(this.camY * 2) / 2;
    for (let wy = y0; wy < this.camY + h / s + 0.5; wy += 0.5) {
      const k = Math.round(wy * 2);
      const speed = 0.25 + hash(k) * 0.2;
      const len = 0.4 + hash(k + 7) * 0.6;
      const span = POND_W + 2;
      const wx = ((((hash(k + 3) * span + time * speed) % span) + span) % span) - 1;
      ctx.beginPath();
      ctx.moveTo(this.X(wx), this.Y(wy + hash(k + 5) * 0.3));
      ctx.lineTo(this.X(wx + len), this.Y(wy + hash(k + 5) * 0.3));
      ctx.stroke();
    }
    if (st.weather === 'rain') this.drawRainRipples(ctx, time);

    this.drawBanks(ctx, time);

    // Pads, the turtle, and anything that's gone under, as a dark shape below the surface.
    st.pads.forEach((p) => this.drawPad(ctx, p, time));

    // Effects on the water: rings and splashes.
    for (const f of this.fx) {
      const age = time - f.t0;
      if (age < 0) continue;
      const fx = this.X(f.x);
      const fy = this.Y(f.y);
      if (f.kind === 'ring' && age < 1.4) {
        for (let i = 0; i < 2; i++) {
          const a = age - i * 0.25;
          if (a <= 0) continue;
          ctx.strokeStyle = `rgba(230,245,240,${0.55 * (1 - age / 1.4)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(fx, fy, s * (0.25 + a * 0.6), s * (0.2 + a * 0.5), 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (f.kind === 'splash' && age < 0.6) {
        ctx.fillStyle = `rgba(240,250,248,${0.9 * (1 - age / 0.6)})`;
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          const d = s * (0.15 + age * 1.6);
          ctx.beginPath();
          ctx.arc(fx + Math.cos(a) * d, fy + Math.sin(a) * d * 0.8 - Math.sin(age * 5) * 6, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Dragonflies, hovering.
    st.flies.forEach((_, i) => {
      if (run.caught.has(i)) return;
      const p = run.flyAt(i);
      this.drawDragonfly(ctx, this.X(p.x + Math.sin(time * 1.7 + i) * 0.12), this.Y(p.y + Math.cos(time * 2.3 + i) * 0.08), time, i);
    });

    // Charging: dots out toward the finger and a soft ring where it'll land.
    if (this.charge && run.canJump) {
      const d = this.aimDir(this.charge);
      const len = chargeLength(this.charge.hold);
      const to = run.target(d.x, d.y, len);
      const fx0 = this.X(run.frog.x);
      const fy0 = this.Y(run.frog.y);
      const tx = this.X(to.x);
      const ty = this.Y(to.y);
      const n = Math.max(2, Math.round(len * 3));
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let i = 1; i < n; i++) {
        const u = i / n;
        ctx.beginPath();
        ctx.arc(fx0 + (tx - fx0) * u, fy0 + (ty - fy0) * u, 2 + 1.2 * Math.sin(t / 90 - i), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(tx, ty, FROG_R * s * 1.5, FROG_R * s * 1.25, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
    } else if (run.canJump && run.hops === 0 && run.stage === 0 && !this.between && (!this.banner || t > this.banner.until)) {
      // The first time: a gentle pulse to say "touch here, somewhere ahead".
      const pulse = 0.5 + 0.5 * Math.sin(t / 260);
      ctx.strokeStyle = `rgba(255,255,255,${0.3 + 0.3 * pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.X(run.frog.x), this.Y(run.frog.y), FROG_R * s * (1.6 + pulse * 0.5), 0, Math.PI * 2);
      ctx.stroke();
    }

    this.drawFrog(ctx, time);

    // Floating bits of text: "+2", "sploosh".
    ctx.textAlign = 'center';
    ctx.font = '600 14px system-ui, sans-serif';
    for (const f of this.fx) {
      if (f.kind !== 'text') continue;
      const age = time - f.t0;
      if (age < 0 || age > 1.2) continue;
      ctx.fillStyle = `rgba(255,250,230,${1 - age / 1.2})`;
      ctx.fillText(f.text ?? '', this.X(f.x), this.Y(f.y) - age * 22);
    }

    this.drawWeather(ctx, st.weather, time);
  }

  private drawBanks(ctx: CanvasRenderingContext2D, time: number) {
    const L = this.run.stageDef.length;
    const w = this.cw;
    // Far bank: from the top of the world down to FAR_EDGE.
    const farY = this.Y(FAR_EDGE);
    if (farY > 0) {
      ctx.fillStyle = '#6b5a3e';
      ctx.fillRect(0, 0, w, farY + 4);
      ctx.fillStyle = '#5a7a3a';
      ctx.fillRect(0, 0, w, farY - this.scale * 0.25);
      this.drawBankDetail(ctx, farY - this.scale * 0.25, -1);
      this.drawReeds(ctx, farY - 2, time, 1);
    }
    const nearY = this.Y(L - NEAR_DEPTH);
    if (nearY < this.ch) {
      ctx.fillStyle = '#6b5a3e';
      ctx.fillRect(0, nearY - 4, w, this.ch - nearY + 4);
      ctx.fillStyle = '#5a7a3a';
      ctx.fillRect(0, nearY + this.scale * 0.22, w, this.ch);
      this.drawBankDetail(ctx, nearY + this.scale * 0.22, 1);
      this.drawReeds(ctx, nearY + 2, time, -1);
    }
    // Wide screen: grassy margins either side of the creek.
    if (this.ox > 2) {
      ctx.fillStyle = '#5a7a3a';
      ctx.fillRect(0, 0, this.ox - 4, this.ch);
      ctx.fillRect(this.ox + POND_W * this.scale + 4, 0, this.ox, this.ch);
      ctx.fillStyle = '#6b5a3e';
      ctx.fillRect(this.ox - 4, 0, 4, this.ch);
      ctx.fillRect(this.ox + POND_W * this.scale, 0, 4, this.ch);
    }
  }

  /** Grass tufts, a few clover flowers, and pebbles along the muddy lip of a bank. */
  private drawBankDetail(ctx: CanvasRenderingContext2D, grassEdge: number, dir: number) {
    const w = this.cw;
    // The muddy lip, darker toward the water.
    ctx.fillStyle = 'rgba(40,30,20,0.18)';
    ctx.fillRect(0, dir > 0 ? grassEdge - this.scale * 0.12 : grassEdge, w, this.scale * 0.12);
    for (let i = 0; i < 12; i++) {
      const x = hash(i * 5.1 + dir) * w;
      const y = grassEdge - dir * this.scale * (0.06 + hash(i * 2.7 + dir) * 0.12);
      ctx.fillStyle = i % 2 ? '#948670' : '#a69a84';
      ctx.beginPath();
      ctx.ellipse(x, y, 2.6, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#4e6e30';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 22; i++) {
      const x = hash(i * 3.7 + dir * 9) * w;
      const y = grassEdge + dir * (6 + hash(i * 1.9 + dir) * this.scale * 0.9);
      ctx.beginPath();
      ctx.moveTo(x - 3, y - 4);
      ctx.lineTo(x, y + 1);
      ctx.lineTo(x + 3, y - 4);
      ctx.moveTo(x, y + 1);
      ctx.lineTo(x, y - 5);
      ctx.stroke();
      if (i % 5 === 0) {
        ctx.fillStyle = i % 10 === 0 ? '#f4ecd8' : '#e8c95a';
        ctx.beginPath();
        ctx.arc(x + 5, y - 2, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** A fringe of reeds along a bank's edge, leaning a little in the breeze. */
  private drawReeds(ctx: CanvasRenderingContext2D, edgeY: number, time: number, dir: number) {
    ctx.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      if (hash(i * 3.3 + dir) < 0.45) continue;
      const x = (i + 0.5) * (this.cw / 16) + (hash(i) - 0.5) * 10;
      const len = 10 + hash(i + 9) * 14;
      const sway = Math.sin(time * 1.2 + i) * 2.5;
      ctx.strokeStyle = '#4e6e30';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, edgeY);
      ctx.quadraticCurveTo(x + sway * 0.5, edgeY - (len / 2) * dir, x + sway, edgeY - len * dir);
      ctx.stroke();
      if (hash(i + 4) > 0.6) {
        ctx.fillStyle = '#6b4a2e';
        ctx.beginPath();
        ctx.ellipse(x + sway, edgeY - len * dir, 2, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawPad(ctx: CanvasRenderingContext2D, p: Pad, time: number) {
    const st = padAt(p, this.run.t);
    const s = this.scale;
    const cx = this.X(st.x);
    const cy = this.Y(st.y);
    const r = st.r * s;
    if (cy < -r * 2 || cy > this.ch + r * 2) return;
    if (st.under) {
      // Just a dark shape under the surface, and a few bubbles.
      ctx.fillStyle = 'rgba(20,50,40,0.35)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 0.85, r * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(230,245,240,0.5)';
      for (let i = 0; i < 3; i++) {
        const k = (time * 0.9 + i / 3) % 1;
        ctx.beginPath();
        ctx.arc(cx + (i - 1) * r * 0.35, cy - k * r * 0.4, 1.5 + k * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    // Rocking before it goes under: a wobble you can see from anywhere.
    const wob = st.rock * Math.sin(time * 14) * 0.18;
    const jig = st.rock * Math.sin(time * 11) * 2;
    if (p.kind === 'turtle') {
      this.drawTurtle(ctx, cx + jig, cy, r, p.drift ? Math.cos((this.run.t / p.drift.period) * Math.PI * 2 + p.drift.phase) : 1, time, st.rock);
      return;
    }
    ctx.save();
    ctx.translate(cx + jig, cy);
    ctx.rotate(wob + hash(p.x * 10 + p.y) * 6);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.arc(2, 3, r, 0.35, Math.PI * 2 - 0.05);
    ctx.lineTo(2, 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PAD;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0.35, Math.PI * 2 - 0.05);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    // Veins.
    ctx.strokeStyle = PAD_DARK;
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const a = 0.6 + (i / 7) * (Math.PI * 2 - 0.8);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.3, -r * 0.35, r * 0.4, r * 0.2, -0.5, 0, Math.PI * 2);
    ctx.fill();
    if (p.kind === 'flower') {
      // A water lily in bloom: pretty, and a sign this one bobs under now and then.
      const fr = r * 0.32;
      ctx.translate(r * 0.38, r * 0.28);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.fillStyle = i % 2 ? '#f2c4d4' : '#f8e6ee';
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * fr * 0.6, Math.sin(a) * fr * 0.6, fr * 0.6, fr * 0.28, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#f0d060';
      ctx.beginPath();
      ctx.arc(0, 0, fr * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** A turtle paddling across, happy to be a stepping stone until she dives. */
  private drawTurtle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, heading: number, time: number, rock: number) {
    const dir = heading >= 0 ? 1 : -1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(2, 3, r, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    // Flippers, paddling.
    ctx.fillStyle = '#6a7a4a';
    const pad = Math.sin(time * 5) * 0.25;
    for (const [sx, sy] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      ctx.beginPath();
      ctx.ellipse(sx * r * 0.7, sy * r * 0.62, r * 0.28, r * 0.14, sy * (0.6 + pad * sx * dir), 0, Math.PI * 2);
      ctx.fill();
    }
    // Head, toward where she's going; tucked as she's about to dive.
    ctx.beginPath();
    ctx.ellipse(dir * r * (1.05 - rock * 0.25), 0, r * 0.26, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4e5a32';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.88, r * 0.76, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,40,20,0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, -r * 0.6);
    ctx.lineTo(-r * 0.3, r * 0.6);
    ctx.moveTo(r * 0.3, -r * 0.6);
    ctx.lineTo(r * 0.3, r * 0.6);
    ctx.moveTo(-r * 0.8, 0);
    ctx.lineTo(r * 0.8, 0);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.25, -r * 0.3, r * 0.35, r * 0.18, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawDragonfly(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, i: number) {
    const k = this.scale / 50;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(time * 0.8 + i) * 0.4);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(6 * k, 10 * k, 6 * k, 2 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    const flick = 0.6 + 0.4 * Math.abs(Math.sin(time * 40 + i));
    ctx.fillStyle = `rgba(220,240,255,${0.55 * flick})`;
    for (const [dy, len] of [
      [-2, 9],
      [2, 8],
    ]) {
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * len * 0.5 * k, dy * k, len * 0.55 * k, 2 * k, side * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = '#2f9a9a';
    ctx.lineWidth = 2.2 * k;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -4 * k);
    ctx.lineTo(0, 10 * k);
    ctx.stroke();
    ctx.fillStyle = '#2a6a7a';
    ctx.beginPath();
    ctx.arc(0, -5 * k, 2.4 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawFrog(ctx: CanvasRenderingContext2D, time: number) {
    const f = this.run.frog;
    const s = this.scale;
    let lift = 0;
    if (f.phase === 'jump') {
      const u = Math.min(1, (this.run.t - f.jump.t0) / JUMP_TIME);
      lift = Math.sin(u * Math.PI);
    }
    const x = this.X(f.x);
    const y = this.Y(f.y);
    // Drawn a touch larger than it sits, so it reads on a phone.
    const r = FROG_R * s * 1.3;
    const swim = f.phase === 'swim';
    // Shadow on the water (further below the frog the higher it goes).
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(x + 2 + lift * 6, y + 3 + lift * 10, r * (1 - lift * 0.2), r * 0.8 * (1 - lift * 0.2), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y - lift * 10);
    const sc = 1 + lift * 0.35;
    ctx.scale(sc, sc);
    ctx.rotate(f.face + Math.PI / 2);
    if (swim) {
      // Paddling: just the head and a ring of water, legs kicking behind.
      ctx.strokeStyle = 'rgba(230,245,240,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.3, r * 1.3, 0, 0, Math.PI * 2);
      ctx.stroke();
      const kick = Math.sin(time * 12) * 0.4;
      ctx.strokeStyle = FROG_DARK;
      ctx.lineWidth = r * 0.25;
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * r * 0.3, r * 0.4);
        ctx.lineTo(side * r * (0.8 + kick * side), r * 1.3);
        ctx.stroke();
      }
    } else {
      // Back legs folded (or kicked out, mid-leap), front feet.
      const out = lift;
      ctx.fillStyle = FROG_DARK;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * r * (0.75 + out * 0.2), r * (0.45 + out * 0.6), r * 0.32, r * (0.6 + out * 0.3), side * (0.5 - out * 0.4), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(side * r * 0.62, -r * 0.55, r * 0.16, r * 0.24, side * -0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = FROG;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.78, r, 0, 0, Math.PI * 2);
    ctx.fill();
    // Spots on its back.
    ctx.fillStyle = FROG_DARK;
    for (const [sx, sy, sr] of [
      [-0.3, 0.25, 0.14],
      [0.28, 0.4, 0.12],
      [0.05, 0.65, 0.1],
    ]) {
      ctx.beginPath();
      ctx.arc(sx * r, sy * r, sr * r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Eyes bulging up top, and the throat going while it sits and thinks.
    for (const side of [-1, 1]) {
      ctx.fillStyle = FROG;
      ctx.beginPath();
      ctx.arc(side * r * 0.42, -r * 0.62, r * 0.27, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2f0d8';
      ctx.beginPath();
      ctx.arc(side * r * 0.44, -r * 0.66, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a2a14';
      ctx.beginPath();
      ctx.arc(side * r * 0.44, -r * 0.68, r * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    if (f.phase === 'sit') {
      const puff = this.charge ? 0.9 : 0.5 + 0.5 * Math.sin(time * 4);
      ctx.fillStyle = 'rgba(242,240,216,0.85)';
      ctx.beginPath();
      ctx.ellipse(0, -r * 1.02, r * 0.3 * (0.5 + puff * 0.6), r * 0.16 * (0.5 + puff * 0.6), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawRainRipples(ctx: CanvasRenderingContext2D, time: number) {
    const s = this.scale;
    const viewH = this.ch / s;
    ctx.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      const period = 1.1 + hash(i) * 0.6;
      const cyc = Math.floor((time + i * 0.37) / period);
      const age = ((time + i * 0.37) % period) / period;
      const x = hash(i * 13 + cyc * 7.1) * POND_W;
      const y = this.camY + hash(i * 17 + cyc * 3.7) * viewH;
      ctx.strokeStyle = `rgba(230,245,240,${0.4 * (1 - age)})`;
      ctx.beginPath();
      ctx.ellipse(this.X(x), this.Y(y), 2 + age * s * 0.3, 1.5 + age * s * 0.24, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** The light: plain sun, a warm low evening, or a grey drizzle. */
  private drawWeather(ctx: CanvasRenderingContext2D, weather: Weather, time: number) {
    const w = this.cw;
    const h = this.ch;
    if (weather === 'sun') {
      const g = ctx.createRadialGradient(w * 0.85, -h * 0.1, 0, w * 0.85, -h * 0.1, h * 0.8);
      g.addColorStop(0, 'rgba(255,245,200,0.16)');
      g.addColorStop(1, 'rgba(255,245,200,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else if (weather === 'evening') {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,160,80,0.2)');
      g.addColorStop(1, 'rgba(60,30,70,0.22)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = 'rgba(90,100,110,0.16)';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(220,230,235,0.28)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 40; i++) {
        const sp = 260 + hash(i) * 120;
        const x = ((hash(i * 7) * (w + 40) + time * 30) % (w + 40)) - 20;
        const y = ((hash(i * 11) * h + time * sp) % (h + 20)) - 10;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 2, y + 9);
        ctx.stroke();
      }
    }
  }
}
