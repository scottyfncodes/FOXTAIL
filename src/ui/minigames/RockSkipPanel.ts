import type { Game } from '../../game/engine/Game';
import type { CanvasPoint } from '../CanvasGamePanel';
import { MiniGamePanel } from '../MiniGamePanel';
import { scoreText } from '../../game/systems/minigames';
import { SCOTT_APPEARANCE } from '../../game/data/character';
import {
  BANK_BONUS,
  FAR_BANK,
  MAX_ANGLE,
  MIN_ANGLE,
  RELEASE_H,
  STONES,
  STONE_KINDS,
  THROWS,
  TOUCH_ARM,
  launch,
  previewArc,
  reachedBank,
  stepStone,
  tap,
  throwScore,
  timeToWater,
  type Stone,
  type StoneKind,
} from '../../game/systems/minigames/rockSkip';

// Skipping stones on the slack water below the fishing bend. Pick a stone
// from the heap on the shingle, drag back and let go — low and flat skims,
// steep just plops — and tap as it kisses the water to keep it going.
// Five throws; every skip counts.

const STEP = 1 / 240;
/** How long a skip's rings hang about on the water, seconds. */
const RIPPLE_LIFE = 2.6;

type Phase = 'aim' | 'flying' | 'settle';

interface Ripple {
  x: number;
  t0: number;
  good: boolean;
  big: boolean;
}

// The creek's colours, from the game's own creek ground.
const WATER_FAR = '#4a7a7a';
const WATER_MID = '#3f6b6e';
const WATER_NEAR = '#356060';

export class RockSkipPanel extends MiniGamePanel {
  private phase: Phase = 'aim';
  private throwNo = 0;
  private results: number[] = [];
  private banks = 0;
  private kind: StoneKind = 'flat';
  private stone: Stone | null = null;
  private pull: { sx: number; sy: number; x: number; y: number } | null = null;
  private ripples: Ripple[] = [];
  private acc = 0;
  /** Seconds since the panel opened: the water keeps moving whatever's happening. */
  private clock = 0;
  /** When the throw left Scott's hand (clock), for the follow-through. */
  private thrownAt = -10;
  /** A little gold flash on a good touch. */
  private flashAt = -10;
  private flashX = 0;
  /** The heron on the far bank takes umbrage at a stone landing at her feet. */
  private heronStartled = -10;
  private turtleDuck = -10;

  // Layout, CSS px.
  private waterY = 0;
  private handX = 0;
  private sx = 10;
  private sy = 30;
  private shoreTop = 0;

  constructor(game: Game) {
    super(game, 'rockSkip');
  }

  protected start() {
    this.phase = 'aim';
    this.throwNo = 0;
    this.results = [];
    this.banks = 0;
    this.kind = 'flat';
    this.stone = null;
    this.pull = null;
    this.ripples = [];
    this.acc = 0;
    this.thrownAt = -10;
    this.flashAt = -10;
    this.heronStartled = -10;
    this.turtleDuck = -10;
    this.setStatus('Pick a stone, then drag back anywhere and let go. Low and flat skips best.');
    this.playingActions();
    this.refreshCard();
    this.banner = { text: 'Rock Skip', sub: `${THROWS} throws · every skip counts`, until: performance.now() + 1600 };
  }

  private get total(): number {
    return this.results.reduce((s, n) => s + n, 0);
  }

  private refreshCard() {
    if (this.finished) return;
    const n = Math.min(THROWS, this.throwNo + 1);
    this.setCard(`Throw ${n}/${THROWS}`, scoreText(this.def, this.total));
  }

  // ------------------------------------------------------------ layout & mapping

  protected layout() {
    const w = this.cw;
    const h = this.ch;
    this.shoreTop = h - Math.max(70, Math.min(96, h * 0.18));
    this.waterY = h * 0.56;
    this.handX = w * 0.15;
    this.sx = (w * 0.94 - this.handX) / FAR_BANK;
    // Heights are drawn taller than they are: a skimming stone only lifts a hand's breadth.
    this.sy = Math.max(22, Math.min(36, h * 0.065));
  }

  private X(x: number) {
    return this.handX + x * this.sx;
  }

  private Y(y: number) {
    return this.waterY - y * this.sy;
  }

  // ------------------------------------------------------------ input

  /** Which stone in the heap is under the finger, if any. */
  private stoneButton(p: CanvasPoint): StoneKind | null {
    if (p.y < this.shoreTop - 8) return null;
    const i = Math.max(0, Math.min(2, Math.floor((p.x / this.cw) * 3)));
    return STONE_KINDS[i];
  }

  protected onDown(p: CanvasPoint) {
    if (this.finished) return;
    if (this.phase === 'flying' && this.stone) {
      tap(this.stone);
      return;
    }
    if (this.phase !== 'aim' || this.throwNo >= THROWS) return;
    const b = this.stoneButton(p);
    if (b) {
      this.kind = b;
      return;
    }
    this.pull = { sx: p.x, sy: p.y, x: p.x, y: p.y };
  }

  protected onMove(p: CanvasPoint) {
    if (!this.pull) return;
    this.pull.x = p.x;
    this.pull.y = p.y;
  }

  protected onCancel() {
    this.pull = null;
  }

  protected onUp(p: CanvasPoint) {
    if (!this.pull || this.phase !== 'aim' || this.finished) {
      this.pull = null;
      return;
    }
    this.pull.x = p.x;
    this.pull.y = p.y;
    const aim = this.aim();
    this.pull = null;
    if (!aim || aim.power < 0.08) return;
    this.stone = launch(this.kind, aim.angle, aim.power);
    this.phase = 'flying';
    this.thrownAt = this.clock;
    this.acc = 0;
    if (this.throwNo === 0) this.setStatus('Tap just as it touches the water for a good touch.');
  }

  /** Dragging back (left and down) throws forward (right and up); the further, the harder. */
  private aim(): { angle: number; power: number } | null {
    if (!this.pull) return null;
    const fx = this.pull.sx - this.pull.x;
    const fy = this.pull.y - this.pull.sy;
    const d = Math.hypot(fx, fy);
    if (d < 4) return null;
    const angle = Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, Math.atan2(fy, Math.max(0.0001, fx))));
    return { angle, power: Math.min(1, d / (this.cw * 0.42)) };
  }

  // ------------------------------------------------------------ play

  protected update(dt: number) {
    this.clock += dt;
    if (this.phase !== 'flying' || !this.stone) return;
    this.acc += dt;
    while (this.acc >= STEP && this.phase === 'flying' && this.stone) {
      this.acc -= STEP;
      const e = stepStone(this.stone, STEP);
      if (!e) continue;
      const now = this.clock - this.acc;
      if (e.type === 'skip') {
        this.ripples.push({ x: e.x, t0: now, good: e.good, big: false });
        if (e.good) {
          this.flashAt = now;
          this.flashX = e.x;
        }
        if (Math.abs(e.x - TURTLE_X) < 3) this.turtleDuck = now;
      } else if (e.type === 'sink') {
        this.ripples.push({ x: e.x, t0: now, good: false, big: true });
        if (Math.abs(e.x - TURTLE_X) < 3) this.turtleDuck = now;
        this.landed();
      } else if (e.type === 'bank') {
        if (e.clatter) this.heronStartled = now;
        this.landed();
      }
    }
    // Keep the ring list short: old rings have faded anyway.
    if (this.ripples.length > 40) this.ripples.splice(0, this.ripples.length - 40);
  }

  private landed() {
    const s = this.stone!;
    const n = throwScore(s);
    this.results.push(n);
    this.throwNo++;
    this.phase = 'settle';
    if (reachedBank(s)) this.banks++;
    const metres = Math.round(s.x);
    let text = n === 0 ? 'Plop.' : n === 1 ? '1 skip' : `${n} skips`;
    let sub: string;
    if (s.state === 'bank' && !reachedBank(s)) {
      text = n === 0 ? 'Into the reeds' : `${n} skip${n === 1 ? '' : 's'}`;
      sub = 'Lobbed clean over the water.';
    } else if (reachedBank(s)) {
      text = `${n} skips!`;
      sub = `Clattered up the far bank: +${BANK_BONUS}`;
      this.game.audio.playDiscoveryChime();
    } else if (s.skips === 0) {
      sub = s.x < 4 ? 'Not much behind that one.' : 'Too steep — it went straight in.';
    } else {
      const touches = s.goodTouches ? ` · ${s.goodTouches} good touch${s.goodTouches === 1 ? '' : 'es'}` : '';
      sub = `${metres} m out${touches}`;
    }
    this.banner = { text, sub, until: performance.now() + 1700 };
    this.refreshCard();
    this.later(1800, () => this.next());
  }

  private next() {
    if (this.finished) return;
    if (this.throwNo >= THROWS) {
      const bank = this.banks ? ` · ${this.banks} up the far bank` : '';
      this.finish(this.total, `${this.results.join(' · ')}${bank}`);
      return;
    }
    this.stone = null;
    this.phase = 'aim';
    this.refreshCard();
  }

  // ------------------------------------------------------------ drawing

  protected draw(ctx: CanvasRenderingContext2D, t: number) {
    const w = this.cw;
    const h = this.ch;
    const wy = this.waterY;
    const time = this.clock;

    // Sky, soft and late-morning, with a cloud or two drifting.
    const backY = h * 0.26;
    const sky = ctx.createLinearGradient(0, 0, 0, backY);
    sky.addColorStop(0, '#bcd6d0');
    sky.addColorStop(1, '#e4e6c8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 3; i++) {
      const cx = ((i * 0.37 * w + time * (3 + i)) % (w + 120)) - 60;
      const cy = backY * (0.18 + i * 0.13);
      ctx.beginPath();
      ctx.ellipse(cx, cy, 26 + i * 6, 6, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 14, cy - 4, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // The far side of the creek: a wooded bank across the whole back, round crowns over a darker understorey.
    ctx.fillStyle = '#5a7a44';
    for (let i = 0; i < 9; i++) {
      const tx = (i + 0.3) * (w / 8);
      const tr = 14 + 10 * Math.abs(Math.sin(i * 2.1));
      ctx.beginPath();
      ctx.arc(tx, backY - tr * 0.9, tr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#4d6b3a';
    ctx.beginPath();
    ctx.moveTo(0, backY + 6);
    for (let x = 0; x <= w + 20; x += 18) ctx.lineTo(x, backY - 16 - 10 * Math.abs(Math.sin(x * 0.07)) - 6 * Math.sin(x * 0.19));
    ctx.lineTo(w, backY + 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3c5a2e';
    ctx.beginPath();
    ctx.moveTo(0, backY + 8);
    for (let x = 0; x <= w + 20; x += 13) ctx.lineTo(x, backY - 5 - 7 * Math.abs(Math.sin(x * 0.11 + 1)));
    ctx.lineTo(w, backY + 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6b5a3e';
    ctx.fillRect(0, backY, w, 5);

    // The slack water, lighter toward the far side.
    const water = ctx.createLinearGradient(0, backY, 0, this.shoreTop);
    water.addColorStop(0, WATER_FAR);
    water.addColorStop(0.55, WATER_MID);
    water.addColorStop(1, WATER_NEAR);
    ctx.fillStyle = water;
    ctx.fillRect(0, backY + 6, w, this.shoreTop - backY);
    // The trees' reflection, dark and wavering.
    ctx.fillStyle = 'rgba(30,50,30,0.2)';
    ctx.beginPath();
    ctx.moveTo(0, backY + 5);
    for (let x = 0; x <= w + 10; x += 10) ctx.lineTo(x, backY + 14 + 6 * Math.abs(Math.sin(x * 0.07)) + Math.sin(x * 0.5 + time * 2) * 1.5);
    ctx.lineTo(w, backY + 5);
    ctx.closePath();
    ctx.fill();
    // The sky's light on the open water, brightest midstream.
    ctx.fillStyle = 'rgba(220,240,232,0.06)';
    ctx.fillRect(0, (backY + wy) / 2 - 8, w, 16);
    // Lazy glints drifting downstream.
    ctx.strokeStyle = 'rgba(220,240,232,0.16)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 14; i++) {
      const gy = backY + 14 + ((i * 37) % Math.max(1, this.shoreTop - backY - 20));
      const gx = (((i * 97 + time * (8 + (i % 3) * 3)) % (w + 60)) + w + 60) % (w + 60) - 30;
      const len = 10 + (i % 4) * 6;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + len, gy);
      ctx.stroke();
    }

    this.drawTurtle(ctx, time);
    this.drawFarBank(ctx, time);

    // The stone's lane: a faint lighter sheen where it'll skip.
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, wy - 3, w, 6);

    // Ripples: each skip's rings, spreading and fading so the trail stays readable.
    for (const r of this.ripples) {
      const age = time - r.t0;
      if (age < 0 || age > RIPPLE_LIFE) continue;
      const k = age / RIPPLE_LIFE;
      const cx = this.X(r.x);
      for (let ring = 0; ring < (r.big ? 3 : 2); ring++) {
        const a = age - ring * 0.22;
        if (a <= 0) continue;
        const rad = (r.big ? 5 : 3) + a * (r.big ? 22 : 16);
        ctx.strokeStyle = r.good ? `rgba(255,236,170,${0.75 * (1 - k)})` : `rgba(230,245,240,${0.6 * (1 - k)})`;
        ctx.lineWidth = r.good ? 2 : 1.5;
        ctx.beginPath();
        ctx.ellipse(cx, wy, rad, rad * 0.28, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // The little splash at the moment of the touch.
      if (age < 0.25) {
        ctx.fillStyle = `rgba(240,250,248,${0.8 * (1 - age / 0.25)})`;
        const n = r.big ? 6 : 4;
        for (let i = 0; i < n; i++) {
          const ang = Math.PI * (0.15 + (0.7 * i) / (n - 1));
          const d = age * (r.big ? 90 : 50);
          ctx.beginPath();
          ctx.arc(cx - Math.cos(ang) * d * 0.6, wy - Math.sin(ang) * d * 0.7 + age * age * 200, r.big ? 2 : 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    this.drawNearBank(ctx);
    this.drawScott(ctx, time);

    // The stone in flight, its shadow on the water, and the touch cue.
    const s = this.stone;
    if (s && s.state === 'flying') {
      const px = this.X(s.x);
      const py = this.Y(s.y);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(px, wy + 2, 5, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
      const ttw = timeToWater(s);
      if (s.vy < 0 && ttw < TOUCH_ARM) {
        // A ring closing on the touchdown point: tap as it closes.
        const k = ttw / TOUCH_ARM;
        const cx = px + s.vx * ttw * this.sx;
        ctx.strokeStyle = s.tapAt !== null ? 'rgba(255,226,140,0.9)' : `rgba(255,255,255,${0.25 + 0.55 * (1 - k)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx, wy, 6 + 26 * k, (6 + 26 * k) * 0.32, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      this.drawStone(ctx, s.kind, px, py, 1, time * (6 + 14 * s.spin));
    }
    // The gold glint of a good touch.
    const fa = time - this.flashAt;
    if (fa >= 0 && fa < 0.35) {
      const fx = this.X(this.flashX);
      ctx.strokeStyle = `rgba(255,230,150,${1 - fa / 0.35})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const r0 = 4 + fa * 30;
        ctx.beginPath();
        ctx.moveTo(fx + Math.cos(a) * r0, wy - 4 + Math.sin(a) * r0 * 0.6);
        ctx.lineTo(fx + Math.cos(a) * (r0 + 6), wy - 4 + Math.sin(a) * (r0 + 6) * 0.6);
        ctx.stroke();
      }
    }

    // Aiming: a faint arc for the first stretch of the flight, and the pull.
    const aim = this.phase === 'aim' ? this.aim() : null;
    if (aim && this.pull) {
      const arc = previewArc(this.kind, aim.angle, aim.power, 0.32, 8);
      ctx.setLineDash([2, 6]);
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(255,255,255,${0.45 + aim.power * 0.35})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(this.X(0), this.Y(RELEASE_H));
      for (const pt of arc) ctx.lineTo(this.X(pt.x), this.Y(pt.y));
      ctx.stroke();
      ctx.setLineDash([]);
      // The drag itself, faint, so the finger knows what it's doing.
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.pull.sx, this.pull.sy);
      ctx.lineTo(this.pull.x, this.pull.y);
      ctx.stroke();
      // Power, as a little arc by Scott's hand: green when gentle, warm when hard.
      const hx = this.X(0);
      const hy = this.Y(RELEASE_H);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(hx, hy, 26, -Math.PI * 0.9, -Math.PI * 0.1);
      ctx.stroke();
      ctx.strokeStyle = `hsl(${120 - aim.power * 100},65%,58%)`;
      ctx.beginPath();
      ctx.arc(hx, hy, 26, -Math.PI * 0.9, -Math.PI * 0.9 + Math.PI * 0.8 * aim.power);
      ctx.stroke();
    } else if (this.phase === 'aim' && this.throwNo === 0 && (!this.banner || t > this.banner.until)) {
      const pulse = 0.5 + 0.5 * Math.sin(t / 260);
      ctx.strokeStyle = `rgba(255,255,255,${0.3 + 0.3 * pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.X(0), this.Y(RELEASE_H), 10 + pulse * 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    this.drawShore(ctx, t);
  }

  /** Where the turtle basks, metres out. */
  private turtleBaseX() {
    return this.X(TURTLE_X);
  }

  /** A turtle sunning on a rock out in the middle; it pulls its head in when a stone comes close. */
  private drawTurtle(ctx: CanvasRenderingContext2D, time: number) {
    const x = this.turtleBaseX();
    const y = this.waterY - 16;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 18, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7d7a72';
    ctx.beginPath();
    ctx.ellipse(x, y, 16, 6, 0, Math.PI, 0);
    ctx.fill();
    const duck = time - this.turtleDuck < 2.2;
    ctx.fillStyle = '#6a7a4a';
    if (!duck) {
      ctx.beginPath();
      ctx.ellipse(x + 11, y - 9, 3.6, 2.4, -0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#4e5a32';
    ctx.beginPath();
    ctx.ellipse(x, y - 7, 9, 5, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.ellipse(x - 2, y - 10, 4, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** The far bank at the end of the run: a shingle beach, reeds, and the heron. */
  private drawFarBank(ctx: CanvasRenderingContext2D, time: number) {
    const x0 = this.X(FAR_BANK);
    const wy = this.waterY;
    const w = this.cw;
    ctx.fillStyle = '#8a7a5e';
    ctx.beginPath();
    ctx.moveTo(x0 - 6, wy + 6);
    ctx.quadraticCurveTo(x0 + 6, wy - 6, w, wy - 14);
    ctx.lineTo(w, this.shoreTop);
    ctx.lineTo(x0 + 10, this.shoreTop);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#a3957a';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.ellipse(x0 + 4 + i * 4, wy - 1 - i * 1.6, 2.4, 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Reeds swaying.
    ctx.strokeStyle = '#5e7a3a';
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const rx = x0 - 4 + i * 4;
      const sway = Math.sin(time * 1.3 + i) * 3;
      ctx.beginPath();
      ctx.moveTo(rx, wy - 8 - i);
      ctx.quadraticCurveTo(rx + sway * 0.5, wy - 30 - i, rx + sway, wy - 44 - (i % 3) * 6);
      ctx.stroke();
    }
    ctx.fillStyle = '#6b4a2e';
    for (let i = 1; i < 7; i += 2) {
      const rx = x0 - 4 + i * 4 + Math.sin(time * 1.3 + i) * 3;
      ctx.beginPath();
      ctx.ellipse(rx, wy - 46 - (i % 3) * 6, 1.8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // The heron, wading in the shallows just this side of the reeds.
    const hx = x0 - 16;
    const hy = this.waterY - 26;
    const startled = time - this.heronStartled < 2.5;
    ctx.strokeStyle = '#6d6a62';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hx - 2, hy + 10);
    ctx.lineTo(hx - 2, hy + 22);
    ctx.moveTo(hx + 2, hy + 10);
    ctx.lineTo(hx + 2, hy + 22);
    ctx.stroke();
    ctx.fillStyle = '#9aa3a8';
    ctx.beginPath();
    ctx.ellipse(hx, hy + 4, 9, 6, -0.3, 0, Math.PI * 2);
    ctx.fill();
    if (startled) {
      // Wings up, much put out.
      ctx.fillStyle = '#b6bec2';
      const flap = Math.sin(time * 14) * 6;
      ctx.beginPath();
      ctx.moveTo(hx - 4, hy + 2);
      ctx.lineTo(hx - 16, hy - 10 - flap);
      ctx.lineTo(hx + 4, hy - 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = '#9aa3a8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(hx - 5, hy);
    ctx.quadraticCurveTo(hx - 10, hy - 10, hx - 6, hy - 16);
    ctx.stroke();
    ctx.fillStyle = '#c8cdd0';
    ctx.beginPath();
    ctx.arc(hx - 6, hy - 17, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c9a24a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hx - 8, hy - 17);
    ctx.lineTo(hx - 15, hy - 15);
    ctx.stroke();
  }

  /** Scott's bank: a grassy lip at the left with the water lapping it. */
  private drawNearBank(ctx: CanvasRenderingContext2D) {
    const wy = this.waterY;
    const edge = this.handX + 4;
    ctx.fillStyle = '#6b5a3e';
    ctx.beginPath();
    ctx.moveTo(0, wy - 10);
    ctx.lineTo(edge - 14, wy - 8);
    ctx.quadraticCurveTo(edge, wy - 4, edge + 6, wy + 8);
    ctx.lineTo(edge + 12, this.shoreTop);
    ctx.lineTo(0, this.shoreTop);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#5a7a3a';
    ctx.beginPath();
    ctx.moveTo(0, wy - 14);
    ctx.lineTo(edge - 12, wy - 11);
    ctx.quadraticCurveTo(edge - 4, wy - 9, edge - 2, wy - 6);
    ctx.lineTo(0, wy - 4);
    ctx.closePath();
    ctx.fill();
  }

  /** Scott, crouched sidearm at the water's edge, facing downstream. */
  private drawScott(ctx: CanvasRenderingContext2D, time: number) {
    const A = SCOTT_APPEARANCE;
    const feetY = this.waterY - 10;
    const hipX = this.handX - 18;
    const k = Math.max(0.8, Math.min(1.3, this.ch / 460));
    const hipY = feetY - 22 * k;
    const shoulderX = hipX + 10 * k;
    const shoulderY = hipY - 24 * k;
    ctx.save();
    ctx.lineCap = 'round';
    // Shadow on the bank.
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(hipX + 4, feetY + 1, 16, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Legs, knees bent into the crouch.
    ctx.strokeStyle = A.overalls;
    ctx.lineWidth = 7 * k;
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(hipX + 12 * k, hipY + 9 * k);
    ctx.lineTo(hipX + 8 * k, feetY - 2);
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(hipX - 6 * k, hipY + 11 * k);
    ctx.lineTo(hipX - 12 * k, feetY - 2);
    ctx.stroke();
    ctx.fillStyle = A.boots;
    ctx.beginPath();
    ctx.ellipse(hipX + 11 * k, feetY - 1, 5 * k, 2.6 * k, 0, 0, Math.PI * 2);
    ctx.ellipse(hipX - 9 * k, feetY - 1, 5 * k, 2.6 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body, leaning into the throw: chambray shirt under the overall bib.
    ctx.strokeStyle = A.shirt;
    ctx.lineWidth = 11 * k;
    ctx.beginPath();
    ctx.moveTo(hipX, hipY - 2);
    ctx.lineTo(shoulderX, shoulderY);
    ctx.stroke();
    ctx.strokeStyle = A.overalls;
    ctx.lineWidth = 8 * k;
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(hipX + 5 * k, hipY - 12 * k);
    ctx.stroke();
    // The other arm, braced on the knee.
    ctx.strokeStyle = A.shirt;
    ctx.lineWidth = 4 * k;
    ctx.beginPath();
    ctx.moveTo(shoulderX - 2, shoulderY + 3);
    ctx.lineTo(hipX + 10 * k, hipY + 6 * k);
    ctx.stroke();
    // Head: blonde hair, short beard.
    const hx = shoulderX + 5 * k;
    const hy = shoulderY - 9 * k;
    ctx.fillStyle = A.skin;
    ctx.beginPath();
    ctx.arc(hx, hy, 6.5 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = A.beard;
    ctx.beginPath();
    ctx.arc(hx + 1.5 * k, hy + 2 * k, 5 * k, 0.1, Math.PI * 0.95);
    ctx.fill();
    ctx.fillStyle = A.hair;
    ctx.beginPath();
    ctx.arc(hx - 0.5 * k, hy - 1.5 * k, 6.6 * k, Math.PI * 1.02, Math.PI * 2.05);
    ctx.fill();
    // The throwing arm: drawn back with the pull, swept through after the throw, resting otherwise.
    const hand = { x: this.X(0), y: this.Y(RELEASE_H) };
    const aim = this.phase === 'aim' ? this.aim() : null;
    const since = time - this.thrownAt;
    if (aim) {
      const back = 12 + 22 * aim.power;
      hand.x = shoulderX - Math.cos(aim.angle) * back;
      hand.y = shoulderY + 14 * k + Math.sin(aim.angle) * back * 0.6;
    } else if (since < 0.5) {
      const f = since / 0.5;
      hand.x += 6 + 10 * f;
      hand.y -= 4 + 8 * f;
    }
    ctx.strokeStyle = A.shirt;
    ctx.lineWidth = 4.5 * k;
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY + 2);
    ctx.quadraticCurveTo((shoulderX + hand.x) / 2, Math.max(shoulderY, hand.y) + 6, hand.x, hand.y);
    ctx.stroke();
    ctx.fillStyle = A.skin;
    ctx.beginPath();
    ctx.arc(hand.x, hand.y, 3 * k, 0, Math.PI * 2);
    ctx.fill();
    // The chosen stone, in hand, until it's thrown.
    if (this.phase === 'aim') this.drawStone(ctx, this.kind, hand.x + 2, hand.y - 1, 0.9, 0);
    ctx.restore();
  }

  private drawStone(ctx: CanvasRenderingContext2D, kind: StoneKind, x: number, y: number, size: number, spinA: number) {
    const shape = STONE_SHAPE[kind];
    const wob = Math.sin(spinA) * 0.15;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(wob);
    ctx.fillStyle = shape.dark;
    ctx.beginPath();
    ctx.ellipse(0, 0.6 * size, shape.rx * size, shape.ry * size, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shape.light;
    ctx.beginPath();
    ctx.ellipse(-0.4 * size, -0.3 * size, shape.rx * 0.82 * size, shape.ry * 0.7 * size, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** The shingle in the foreground, and the heap of three kinds of stone to pick from. */
  private drawShore(ctx: CanvasRenderingContext2D, t: number) {
    const w = this.cw;
    const top = this.shoreTop;
    const h = this.ch;
    ctx.fillStyle = '#7a6a50';
    ctx.beginPath();
    ctx.moveTo(0, top + 6);
    ctx.quadraticCurveTo(w * 0.5, top - 6, w, top + 4);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    // Pebbles scattered across it (a fixed scatter, not random each frame).
    for (let i = 0; i < 40; i++) {
      const px = (i * 53.7) % w;
      const py = top + 10 + ((i * 29.3) % Math.max(1, h - top - 14));
      ctx.fillStyle = i % 3 === 0 ? '#948670' : i % 3 === 1 ? '#6a5c44' : '#a69a84';
      ctx.beginPath();
      ctx.ellipse(px, py, 2 + (i % 3), 1.3 + (i % 2), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const active = this.phase === 'aim' && !this.finished;
    for (let i = 0; i < 3; i++) {
      const kind = STONE_KINDS[i];
      const cx = (w / 3) * (i + 0.5);
      const cy = top + (h - top) * 0.42;
      const sel = kind === this.kind;
      if (sel) {
        ctx.fillStyle = active ? 'rgba(255,248,220,0.22)' : 'rgba(255,248,220,0.1)';
        ctx.beginPath();
        ctx.roundRect(cx - w / 6 + 6, top + 6, w / 3 - 12, h - top - 10, 10);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(cx + 2, cy + 6, STONE_SHAPE[kind].rx * 2.3, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      const bob = sel && active ? Math.sin(t / 300) * 1.5 : 0;
      this.drawStone(ctx, kind, cx, cy + bob, 2.3, 0);
      ctx.textAlign = 'center';
      ctx.fillStyle = sel ? '#fbf3dc' : 'rgba(251,243,220,0.7)';
      ctx.font = `${sel ? 600 : 500} 12px system-ui, sans-serif`;
      ctx.fillText(STONES[kind].name, cx, h - 22);
      ctx.fillStyle = 'rgba(251,243,220,0.6)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(STONES[kind].blurb, cx, h - 9);
    }
  }
}

/** The turtle's rock, metres out from Scott. */
const TURTLE_X = 13;

const STONE_SHAPE: Record<StoneKind, { rx: number; ry: number; light: string; dark: string }> = {
  flat: { rx: 5.5, ry: 2, light: '#a8acae', dark: '#6e7479' },
  round: { rx: 4.6, ry: 3.6, light: '#b4aea2', dark: '#7c766a' },
  chip: { rx: 3.6, ry: 1.4, light: '#c2b8a8', dark: '#8a8070' },
};
