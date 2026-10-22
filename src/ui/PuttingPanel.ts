import type { Game } from '../game/engine/Game';
import { button } from './common';
import { CanvasGamePanel, type CanvasPoint } from './CanvasGamePanel';
import { SCOTT_APPEARANCE } from '../game/data/character';
import {
  BALL_R,
  CUP_R,
  STROKE_LIMIT,
  ballMoving,
  courseBest as courseBestFor,
  holeBest,
  holeL,
  holeW,
  obstacleAt,
  obstacleTouching,
  previewPath,
  scoreName,
  stepBall,
  strike,
  sweepResting,
  toPar,
  type Ball,
  type BallEvent,
  type Hole,
} from '../game/systems/putting';
import { LIVING_ROOM_COURSE, findCourse, otherCourse, type Course, type CourseId } from '../game/systems/puttingCourses';
import { drawMatObstacle, drawMatTailLength, drawMatTube, drawMatZone } from './putting/LivingRoomCourseArt';
import { drawDappledLight, drawGardenObstacle, drawHollowLog, drawWaterLife, paintGardenBackdrop } from './putting/GardenCourseArt';

// Putt-putt: the living-room mat and Scott's garden course. Put a finger
// down anywhere and pull back, the way you'd draw a putter back, and let
// go: the further back, the harder the putt. The ring round the ball shows
// how hard; a faint line shows the start of the roll, as far as its first
// bounce. Pull back to where you started to change your mind.
//
// The course does the explaining: what drags, what runs, what's springy,
// what moves. Little things are said when they happen — a lip-out, a putt
// that stopped on the edge, a bank shot that dropped — and each hole and
// each course keeps its best.

const STEP = 1 / 240;
/** A drag shorter than this (CSS px) isn't aiming: let go there and nothing happens. */
const DEAD_ZONE = 12;
/** How long the hole's name stays up, ms. */
const TITLE_MS = 1400;
/** How long a holed putt is celebrated before the next tee (a tap moves on sooner), ms. */
const HOLED_MS = 1500;
const ACE_MS = 2400;

type Phase = 'aim' | 'rolling' | 'dropping' | 'splash' | 'holed' | 'done';

/** What happened on the putt in progress, for what's said about it afterwards. */
interface Shot {
  from: { x: number; y: number };
  power: number;
  bounces: number;
  /** The last thing it came off: 'wall', or an obstacle kind. */
  lastOff: string | null;
  /** Its closest pass to the cup's centre. */
  minCup: number;
  lipped: boolean;
  tubed: boolean;
  /** How far from the cup it was struck. */
  startDist: number;
  /** Not struck at all: knocked on by something that moves. */
  nudged: boolean;
}

interface Fx {
  kind: 'ring' | 'puff' | 'splash' | 'gold' | 'petal';
  x: number;
  y: number;
  t0: number;
  dur: number;
  a?: number;
  c?: string;
}

interface Aim {
  angle: number;
  power: number;
}

interface RoundResult {
  total: number;
  newBest: boolean;
  first: boolean;
  best: number | null;
}

export class PuttingPanel extends CanvasGamePanel {
  private course: Course = LIVING_ROOM_COURSE;
  private hole = 0;
  private strokes: number[] = [];
  /** Per hole: an ace, or a new best on it, this round. */
  private notes: { ace: boolean; pb: boolean; splashes: number }[] = [];
  private ball: Ball = { x: 0, y: 0, vx: 0, vy: 0 };
  private phase: Phase = 'aim';
  private drag: { start: CanvasPoint; cur: CanvasPoint; samples: { t: number; aim: Aim }[]; pulled: boolean } | null = null;
  private acc = 0;
  /** Seconds into the current hole: things that move keep moving whether the ball's rolling or not. */
  private holeT = 0;
  /** Bumped every hole, so a timer from the last one never fires into this one. */
  private holeToken = 0;
  private shot: Shot | null = null;
  private trail: { x: number; y: number; t: number }[] = [];
  /** How far the ball has rolled (for its turning dimples), and which way. */
  private rolled = 0;
  private rollDir = -Math.PI / 2;
  private fx: Fx[] = [];
  private caption: { text: string; t0: number } | null = null;
  /** When each obstacle was last hit, by index (holeT seconds). */
  private hitAt = new Map<number, number>();
  /** The ball going down: where it was as it dropped, and when (ms). */
  private drop: { x: number; y: number; t0: number } | null = null;
  private holeShownAt = 0;
  private round: RoundResult | null = null;
  private backdrop: { key: string; canvas: HTMLCanvasElement } | null = null;
  /** Pixels per course unit, and the hole box's top-left on the canvas (CSS px). */
  private scale = 40;
  private ox = 0;
  private oy = 0;

  constructor(game: Game) {
    super(game, 'Putt-Putt', 'putt-mat');
  }

  /** Opens on a course: the mat indoors, the garden course from its first tee. */
  openCourse(id: CourseId) {
    this.course = findCourse(id) ?? LIVING_ROOM_COURSE;
    this.open();
  }

  protected start() {
    this.panel.setTitle(this.course.name);
    this.hole = 0;
    this.strokes = [];
    this.notes = [];
    this.round = null;
    this.startHole();
  }

  private get h(): Hole {
    return this.course.holes[this.hole];
  }

  private get garden(): boolean {
    return this.course.theme === 'garden';
  }

  private startHole() {
    const h = this.h;
    this.holeToken++;
    this.ball = { x: h.tee.x, y: h.tee.y, vx: 0, vy: 0 };
    this.strokes[this.hole] = 0;
    this.notes[this.hole] = { ace: false, pb: false, splashes: 0 };
    this.holeT = 0;
    this.acc = 0;
    this.phase = 'aim';
    this.drag = null;
    this.shot = null;
    this.trail = [];
    this.fx = [];
    this.caption = null;
    this.drop = null;
    this.hitAt.clear();
    this.holeShownAt = performance.now();
    const best = holeBest(this.game.state.putting, h.id);
    this.banner = { text: `Hole ${this.hole + 1} · ${h.name}`, sub: `Par ${h.par}${best !== null ? ` · your best ${best}` : ''}`, until: performance.now() + TITLE_MS };
    if (this.cw) this.layout();
    this.refresh();
  }

  private get total(): number {
    return this.strokes.reduce((s, n) => s + (n ?? 0), 0);
  }

  // ------------------------------------------------------------ text around the green

  private refresh() {
    const h = this.h;
    const holes = this.course.holes;
    if (this.phase === 'done') {
      this.setCard('Round complete', `${this.total} · ${toPar(this.total, this.course.par)}`);
    } else {
      const played = this.strokes.slice(0, this.hole).reduce((s, n) => s + n, 0);
      const parPlayed = holes.slice(0, this.hole).reduce((s, x) => s + x.par, 0);
      const stroke = this.strokes[this.hole] + (this.phase === 'aim' ? 1 : 0);
      this.setCard(`Hole ${this.hole + 1}/${holes.length} · Par ${h.par}`, `Stroke ${Math.min(stroke, STROKE_LIMIT + 1)} · Round ${this.hole === 0 ? 'E' : toPar(played, parPlayed)}`);
    }
    const rec = this.game.state.putting;
    if (this.phase === 'done') {
      const best = courseBestFor(rec, this.course);
      this.status.textContent = best !== null ? `Best round on ${this.course.short}: ${best} (${toPar(best, this.course.par)})` : '';
      const next = otherCourse(this.course);
      this.setActions(
        button('Play again', () => this.restart()),
        button(next.theme === 'garden' ? 'Garden' : 'The mat', () => {
          this.course = next;
          this.restart();
        }, 'secondary-btn'),
        button('Done', () => this.panel.close(), 'secondary-btn')
      );
      return;
    }
    if (this.phase === 'aim') {
      if (this.strokes[this.hole] > 0) this.status.textContent = 'Line it up again.';
      else if (this.hole === 0) this.status.textContent = `Touch anywhere, pull back and let go to putt. Further back, harder. ${h.tip ?? ''}`.trim();
      else this.status.textContent = h.tip ?? 'Pull back and let go.';
    } else if (this.phase === 'rolling') {
      const best = courseBestFor(rec, this.course);
      this.status.textContent = best === null ? '' : `Best round here: ${best} (${toPar(best, this.course.par)})`;
    }
    this.setActions(button('Start over', () => this.restart(), 'secondary-btn'));
  }

  private say(text: string) {
    this.caption = { text, t0: performance.now() };
  }

  // ------------------------------------------------------------ input

  /** How far a pull (CSS px) counts as full power: a comfortable thumb's reach on any screen. */
  private get fullPull(): number {
    return Math.max(110, Math.min(190, Math.min(this.cw, this.ch) * 0.36));
  }

  protected onDown(p: CanvasPoint) {
    if (this.phase === 'holed') {
      // Don't make anyone wait: a tap moves on to the next tee.
      this.next(this.holeToken);
      return;
    }
    if (this.phase !== 'aim') return;
    this.drag = { start: p, cur: p, samples: [], pulled: false };
  }

  protected onMove(p: CanvasPoint) {
    if (!this.drag) return;
    this.drag.cur = p;
    const aim = this.aim();
    if (aim) {
      this.drag.pulled = true;
      const t = performance.now();
      this.drag.samples.push({ t, aim });
      while (this.drag.samples.length > 12) this.drag.samples.shift();
    }
  }

  protected onCancel() {
    this.drag = null;
  }

  protected onUp(p: CanvasPoint) {
    if (!this.drag || this.phase !== 'aim') {
      this.drag = null;
      return;
    }
    this.drag.cur = p;
    let aim = this.aim();
    // A finger lifting off nudges the line a little: if the aim was steady a moment ago, trust that.
    const now = performance.now();
    const steady = [...this.drag.samples].reverse().find((s) => now - s.t >= 45);
    if (aim && steady) {
      let d = aim.angle - steady.aim.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < 0.3 && Math.abs(aim.power - steady.aim.power) < 0.12) aim = { angle: steady.aim.angle, power: aim.power };
    }
    this.drag = null;
    // Barely any pull (or pulled back to where it started): not a putt.
    if (!aim || aim.power < 0.02) return;
    this.putt(aim);
  }

  /** Pulling back from where the finger went down aims the other way. */
  private aim(): Aim | null {
    if (!this.drag) return null;
    const dx = this.drag.start.x - this.drag.cur.x;
    const dy = this.drag.start.y - this.drag.cur.y;
    const len = Math.hypot(dx, dy);
    if (len < DEAD_ZONE) return null;
    return { angle: Math.atan2(dy, dx), power: Math.min(1, (len - DEAD_ZONE) / (this.fullPull - DEAD_ZONE)) };
  }

  private putt(aim: Aim) {
    const h = this.h;
    this.shot = {
      from: { x: this.ball.x, y: this.ball.y },
      power: aim.power,
      bounces: 0,
      lastOff: null,
      minCup: Infinity,
      lipped: false,
      tubed: false,
      startDist: Math.hypot(this.ball.x - h.cup.x, this.ball.y - h.cup.y),
      nudged: false,
    };
    strike(this.ball, aim.angle, aim.power);
    this.rollDir = aim.angle;
    this.trail = [];
    this.strokes[this.hole] += 1;
    this.phase = 'rolling';
    this.caption = null;
    this.game.audio.playPutt(aim.power);
    this.refresh();
  }

  // ------------------------------------------------------------ play

  protected update(dt: number) {
    this.holeT += dt;
    const h = this.h;
    if (this.phase === 'aim' && !this.drag) {
      // Something that moves can knock a ball at rest on its way.
      if (sweepResting(this.ball, h, this.holeT)) {
        const i = obstacleTouching(h, this.ball.x, this.ball.y, this.holeT);
        const kind = i >= 0 ? h.obstacles[i].kind : '';
        if (i >= 0) this.hitAt.set(i, this.holeT);
        this.say(kind === 'hedgehog' ? 'The hedgehog nudged it on.' : kind === 'tail' ? 'Ranger flicked it on.' : kind === 'branch' ? 'The branch caught it.' : 'Knocked on.');
        this.shot = { from: { x: this.ball.x, y: this.ball.y }, power: 0, bounces: 1, lastOff: kind, minCup: Infinity, lipped: false, tubed: false, startDist: 0, nudged: true };
        this.phase = 'rolling';
        this.refresh();
      }
    }
    if (this.phase !== 'rolling') {
      this.acc = 0;
      return;
    }
    this.acc += dt;
    const now = performance.now();
    while (this.acc >= STEP && this.phase === 'rolling') {
      this.acc -= STEP;
      const px = this.ball.x;
      const py = this.ball.y;
      const ev = stepBall(this.ball, h, STEP, this.holeT - this.acc);
      const moved = Math.hypot(this.ball.x - px, this.ball.y - py);
      if (moved < 0.5) {
        this.rolled += moved;
        if (moved > 1e-5) this.rollDir = Math.atan2(this.ball.y - py, this.ball.x - px);
      }
      if (this.shot) this.shot.minCup = Math.min(this.shot.minCup, Math.hypot(this.ball.x - h.cup.x, this.ball.y - h.cup.y));
      if (ev) this.onBallEvent(ev, px, py, now);
      if (this.phase === 'rolling' && !ballMoving(this.ball)) this.stopped();
    }
    const last = this.trail[this.trail.length - 1];
    if (this.phase === 'rolling' && (!last || Math.hypot(last.x - this.ball.x, last.y - this.ball.y) > 0.05)) this.trail.push({ x: this.ball.x, y: this.ball.y, t: now });
    this.trail = this.trail.filter((p) => now - p.t < 320);
  }

  private onBallEvent(ev: BallEvent, px: number, py: number, now: number) {
    const h = this.h;
    const shot = this.shot;
    const speed = Math.hypot(this.ball.vx, this.ball.vy);
    if (ev === 'wall') {
      if (shot) {
        shot.bounces++;
        shot.lastOff = 'wall';
      }
      this.fx.push({ kind: 'ring', x: this.ball.x, y: this.ball.y, t0: now, dur: 380 });
      this.game.audio.playClack(this.garden ? 0.25 : 0.4, speed);
    } else if (ev === 'hit') {
      const i = obstacleTouching(h, this.ball.x, this.ball.y, this.holeT);
      const kind = i >= 0 ? h.obstacles[i].kind : 'thing';
      if (i >= 0) this.hitAt.set(i, this.holeT);
      if (shot) {
        shot.bounces++;
        shot.lastOff = kind;
      }
      if (kind === 'toadstool') this.game.audio.playBoing(speed);
      else this.game.audio.playClack(kind === 'stone' || kind === 'mug' ? 0.8 : 0.35, speed);
      this.fx.push({ kind: 'puff', x: this.ball.x, y: this.ball.y, t0: now, dur: 420 });
    } else if (ev === 'lip') {
      if (shot) shot.lipped = true;
      this.say(Math.random() < 0.5 ? 'Lipped out!' : 'Round the rim and out!');
      this.game.audio.playClack(1, speed);
    } else if (ev === 'tube') {
      if (shot) shot.tubed = true;
      this.fx.push({ kind: 'puff', x: px, y: py, t0: now, dur: 300 });
      this.game.audio.playClack(0.1, 2);
    } else if (ev === 'splash') {
      this.phase = 'splash';
      this.strokes[this.hole] += 1;
      this.notes[this.hole].splashes++;
      this.fx.push({ kind: 'splash', x: this.ball.x, y: this.ball.y, t0: now, dur: 900 });
      this.game.audio.playSplash();
      this.say('Splash! Back where you struck it, plus a stroke.');
      const token = this.holeToken;
      this.later(950, () => {
        if (token !== this.holeToken || this.phase !== 'splash') return;
        const from = shot?.from ?? this.h.tee;
        this.ball = { x: from.x, y: from.y, vx: 0, vy: 0 };
        this.trail = [];
        if (this.strokes[this.hole] >= STROKE_LIMIT) return this.pickUp();
        this.phase = 'aim';
        this.refresh();
      });
      this.refresh();
    } else if (ev === 'sunk') {
      this.phase = 'dropping';
      this.drop = { x: px, y: py, t0: now };
      this.game.audio.playCupDrop();
      const token = this.holeToken;
      this.later(380, () => {
        if (token === this.holeToken) this.holed();
      });
    }
  }

  private stopped() {
    const h = this.h;
    const shot = this.shot;
    if (shot && !shot.lipped) {
      const left = Math.hypot(this.ball.x - h.cup.x, this.ball.y - h.cup.y);
      if (shot.minCup < CUP_R * 1.8 && left < 0.7) this.say(left < CUP_R * 1.6 ? 'Hanging on the edge!' : 'So close.');
      else if (shot.minCup < CUP_R * 1.8) this.say('Over the top of it!');
      else if (!shot.nudged && left < 0.45) this.say('Tap-in.');
    }
    if (this.strokes[this.hole] >= STROKE_LIMIT) return this.pickUp();
    this.phase = 'aim';
    this.refresh();
  }

  /** Six strokes and it's still out there: pick it up, that'll do for this one. */
  private pickUp() {
    this.strokes[this.hole] = STROKE_LIMIT + 1;
    this.banner = { text: 'Picked up', sub: `${STROKE_LIMIT + 1} on this one`, until: performance.now() + 1600 };
    this.phase = 'holed';
    const token = this.holeToken;
    this.later(1600, () => this.next(token));
    this.refresh();
  }

  private holed() {
    const h = this.h;
    const n = this.strokes[this.hole];
    const shot = this.shot;
    this.phase = 'holed';
    const now = performance.now();
    const rec = this.game.puttingHole(h.id, n);
    this.notes[this.hole].pb = rec.best;
    let sub: string;
    if (n === 1) {
      this.notes[this.hole].ace = true;
      const coins = this.game.puttingAce(h.id);
      sub = coins ? `First one on this hole: +${coins} coins` : shot?.tubed ? (this.garden ? 'Straight through the hollow log!' : 'Straight through the tube!') : shot && shot.bounces > 0 ? 'Off the side and in!' : 'One stroke.';
      // A ring of gold out from the cup, and (in the garden) a few petals lifting off the moss.
      this.fx.push({ kind: 'gold', x: h.cup.x, y: h.cup.y, t0: now, dur: 1400 });
      if (this.garden) {
        const cols = ['#f4efe0', '#f2d35a', '#e9a6c0', '#c9b6e8'];
        for (let i = 0; i < 10; i++) this.fx.push({ kind: 'petal', x: h.cup.x, y: h.cup.y, t0: now + i * 40, dur: 1500, a: (i / 10) * Math.PI * 2 + Math.random() * 0.4, c: cols[i % cols.length] });
      }
    } else {
      this.game.audio.playDiscoveryChime();
      sub = shot?.nudged
        ? 'With a little help.'
        : shot?.tubed
          ? this.garden
            ? 'Through the hollow log!'
            : 'Through the tube!'
          : shot && shot.bounces > 0 && shot.lastOff === 'toadstool'
            ? 'Off the toadstool and in!'
            : shot && shot.bounces > 0
              ? 'Banked it in!'
              : shot && shot.startDist > 3
                ? 'From a long way out!'
                : `${n} strokes on a par ${h.par}.`;
    }
    if (rec.best) sub += ' · best here yet';
    this.banner = { text: scoreName(n, h.par), sub, until: now + (n === 1 ? ACE_MS : HOLED_MS) };
    const token = this.holeToken;
    this.later(n === 1 ? ACE_MS : HOLED_MS, () => this.next(token));
    this.refresh();
  }

  private next(token: number) {
    if (!this.panel.isOpen || token !== this.holeToken || this.phase !== 'holed') return;
    if (this.hole < this.course.holes.length - 1) {
      this.hole += 1;
      this.startHole();
      return;
    }
    this.holeToken++;
    this.phase = 'done';
    const best = this.game.finishPuttingRound(this.course, this.total);
    const rec = this.game.state.putting;
    const bestNow = courseBestFor(rec, this.course);
    const first = this.course.recordId === LIVING_ROOM_COURSE.recordId ? rec.rounds === 1 : (rec.courses?.[this.course.recordId]?.rounds ?? 0) === 1;
    this.round = { total: this.total, newBest: best && !first, first, best: bestNow };
    this.banner = null;
    this.refresh();
  }

  // ------------------------------------------------------------ layout

  /** The course is the whole point: it gets as much of the screen as the score line, a line of text and a button leave. */
  protected canvasHeight(_w: number): number {
    // (On a short landscape screen the buttons are a small scroll away, rather than the course a squint.)
    return Math.max(Math.min(300, window.innerHeight - 120), Math.min(window.innerHeight - 200, 700));
  }

  protected layout() {
    const h = this.h;
    const W = holeW(h);
    const L = holeL(h);
    const pad = 8;
    this.scale = Math.min((this.cw - pad * 2) / W, (this.ch - pad * 2) / L);
    this.ox = (this.cw - W * this.scale) / 2;
    this.oy = (this.ch - L * this.scale) / 2;
  }

  // ------------------------------------------------------------ drawing

  protected draw(ctx: CanvasRenderingContext2D, t: number) {
    const s = this.scale;
    const X = (x: number) => this.ox + x * s;
    const Y = (y: number) => this.oy + y * s;
    const h = this.h;
    if (this.garden) this.drawGardenGround(ctx, X, Y, t);
    else this.drawMatGround(ctx, X, Y, t);

    // The tee, and the cup.
    ctx.fillStyle = this.garden ? 'rgba(255,255,230,0.28)' : 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(X(h.tee.x), Y(h.tee.y), BALL_R * s * 1.6, 0, Math.PI * 2);
    ctx.fill();
    this.drawCup(ctx, X(h.cup.x), Y(h.cup.y), CUP_R * s);

    // What's on the course.
    if (!this.garden) {
      for (const o of h.obstacles) if (o.kind === 'tail' && o.shape === 'circle') drawMatTailLength(ctx, o, this.holeT, X, Y, s);
    }
    h.obstacles.forEach((o, i) => {
      const at = obstacleAt(o, this.holeT);
      if (this.garden) {
        const since = this.hitAt.has(i) ? this.holeT - this.hitAt.get(i)! : 99;
        drawGardenObstacle(ctx, at, X, Y, s, t, since, this.facing(o));
      } else drawMatObstacle(ctx, at, X, Y, s, t);
    });
    for (const tube of h.tubes ?? []) {
      if (this.garden) drawHollowLog(ctx, tube, X, Y, s);
      else drawMatTube(ctx, tube, X, Y, s);
    }

    this.drawTrail(ctx, X, Y);
    this.drawAim(ctx, X, Y, t);
    this.drawBall(ctx, X, Y, t);
    this.drawFlag(ctx, X(h.cup.x), Y(h.cup.y), t);
    this.drawFx(ctx, X, Y, t);
    this.drawCaption(ctx, t);

    // Each new hole fades up from the last.
    const fade = 1 - (t - this.holeShownAt) / 260;
    if (fade > 0 && this.phase !== 'done') {
      ctx.fillStyle = `rgba(20,26,16,${Math.min(1, fade) * 0.85})`;
      ctx.fillRect(0, 0, this.cw, this.ch);
    }
    if (this.phase === 'done' && this.round) this.drawScorecard(ctx);
  }

  /** Which way something that walks is facing: the way it's going. */
  private facing(o: Hole['obstacles'][number]): number {
    if (o.shape !== 'circle' || !o.swing) return 1;
    const k = Math.cos((this.holeT / o.swing.period) * Math.PI * 2 + (o.swing.phase ?? 0));
    return Math.sign(o.swing.dx * k) || 1;
  }

  private drawGardenGround(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (y: number) => number, t: number) {
    const h = this.h;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const key = `${this.course.id}:${h.id}:${this.cw}x${this.ch}:${dpr}`;
    if (!this.backdrop || this.backdrop.key !== key) this.backdrop = { key, canvas: paintGardenBackdrop(h, this.cw, this.ch, this.ox, this.oy, this.scale, dpr) };
    ctx.drawImage(this.backdrop.canvas, 0, 0, this.cw, this.ch);
    drawWaterLife(ctx, h, X, Y, this.scale, t);
    drawDappledLight(ctx, X(0), Y(0), holeW(h) * this.scale, holeL(h) * this.scale, t);
  }

  private drawMatGround(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (y: number) => number, t: number) {
    const s = this.scale;
    const h = this.h;
    const W = holeW(h);
    const L = holeL(h);
    const cw = this.cw;
    const ch = this.ch;
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
    // The mat, with its wooden edge and its shadow on the boards.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(X(0) - 4, Y(0) - 2, W * s + 12, L * s + 12);
    ctx.fillStyle = '#5b3c26';
    ctx.fillRect(X(0) - 6, Y(0) - 6, W * s + 12, L * s + 12);
    ctx.fillStyle = 'rgba(255,230,190,0.18)';
    ctx.fillRect(X(0) - 6, Y(0) - 6, W * s + 12, 2);
    ctx.fillStyle = '#3f7a3c';
    ctx.fillRect(X(0), Y(0), W * s, L * s);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < L; i += 1) if (i % 2 === 0) ctx.fillRect(X(0), Y(i), W * s, s);
    // A lamp's warm light falling across the far end of the mat.
    const g = ctx.createRadialGradient(X(W * 0.8), Y(L * 0.15), 0, X(W * 0.8), Y(L * 0.15), L * s * 0.6);
    g.addColorStop(0, 'rgba(255,220,160,0.14)');
    g.addColorStop(1, 'rgba(255,220,160,0)');
    ctx.fillStyle = g;
    ctx.fillRect(X(0), Y(0), W * s, L * s);

    // The mat's lean, as faint chevrons.
    const sl = Math.hypot(h.slope.x, h.slope.y);
    if (sl > 0) {
      const a = Math.atan2(h.slope.y, h.slope.x);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 2;
      for (let gy = 1.5; gy < L; gy += 2) {
        for (let gx = 0.9; gx < W; gx += 1.8) {
          const phase = ((t / 900) % 1) * 0.35;
          ctx.save();
          ctx.translate(X(gx + Math.cos(a) * phase), Y(gy + Math.sin(a) * phase));
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
    for (const z of h.zones ?? []) drawMatZone(ctx, z, X, Y, s, t);
  }

  /** The cup: a dark hole with depth, its rim catching the light (in the garden, an old tin can's rim). */
  private drawCup(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    ctx.save();
    ctx.fillStyle = this.garden ? '#8f948f' : 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(x, y, r + Math.max(1.5, r * 0.12), 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(x + r * 0.25, y + r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, '#0c120a');
    g.addColorStop(0.7, '#141d10');
    g.addColorStop(1, '#2a3522');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // The inside wall, lit on the far side.
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.86, Math.PI * 0.05, Math.PI * 0.95);
    ctx.stroke();
    ctx.restore();
  }

  /** The flag in the cup. It stands aside (fades) while the ball's close, so you can see the putt drop. */
  private drawFlag(ctx: CanvasRenderingContext2D, fx: number, fy: number, t: number) {
    const s = this.scale;
    const h = this.h;
    const near = Math.hypot(this.ball.x - h.cup.x, this.ball.y - h.cup.y);
    const busy = this.phase === 'rolling' || this.phase === 'dropping';
    const alpha = busy && near < 1.4 ? 0.3 + 0.7 * Math.max(0, (near - 0.6) / 0.8) : 1;
    const ace = this.phase === 'holed' && this.notes[this.hole]?.ace;
    const wave = Math.sin(t / (ace ? 90 : 420)) * (ace ? 0.12 : 0.05);
    const H = s * 0.95;
    ctx.save();
    ctx.globalAlpha = alpha;
    // Its shadow, falling down and right across the course.
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + H * 0.45, fy + H * 0.2);
    ctx.stroke();
    ctx.strokeStyle = this.garden ? '#b89a62' : '#ddd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx, fy - H);
    ctx.stroke();
    ctx.fillStyle = SCOTT_APPEARANCE.flag;
    ctx.beginPath();
    ctx.moveTo(fx, fy - H);
    ctx.quadraticCurveTo(fx + s * 0.22, fy - H + s * (0.1 + wave), fx + s * 0.44, fy - H + s * (0.14 + wave * 1.6));
    ctx.lineTo(fx, fy - H + s * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** A faint streak behind a quick ball: where it's just been. */
  private drawTrail(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (y: number) => number) {
    if (this.trail.length < 2 || this.phase !== 'rolling') return;
    const now = performance.now();
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1];
      const b = this.trail[i];
      const k = 1 - (now - b.t) / 320;
      if (k <= 0) continue;
      ctx.strokeStyle = `rgba(255,255,245,${0.22 * k})`;
      ctx.lineWidth = BALL_R * this.scale * 1.3 * k;
      ctx.beginPath();
      ctx.moveTo(X(a.x), Y(a.y));
      ctx.lineTo(X(b.x), Y(b.y));
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawAim(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (y: number) => number, t: number) {
    if (this.phase !== 'aim') return;
    const s = this.scale;
    const bx = X(this.ball.x);
    const by = Y(this.ball.y);
    const r = BALL_R * s;
    const aim = this.aim();
    if (aim && this.drag) {
      // The line it will take, as far as its first bounce: a guide, not the whole answer.
      const path = previewPath(this.h, this.ball, aim.angle, aim.power, 1.2 + aim.power * 2.4, this.holeT);
      ctx.save();
      ctx.setLineDash([2, 7]);
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(255,255,255,${0.6 + aim.power * 0.3})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      for (const pt of path) ctx.lineTo(X(pt.x), Y(pt.y));
      ctx.stroke();
      ctx.setLineDash([]);
      // The putter, drawn back behind the ball as far as the pull.
      const back = r * 2.2 + aim.power * s * 0.9;
      const px = bx - Math.cos(aim.angle) * back;
      const py = by - Math.sin(aim.angle) * back;
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(bx - Math.cos(aim.angle) * r * 1.6 + 2, by - Math.sin(aim.angle) * r * 1.6 + 3);
      ctx.lineTo(px + 2, py + 3);
      ctx.stroke();
      ctx.strokeStyle = '#d8d4c8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bx - Math.cos(aim.angle) * r * 1.6, by - Math.sin(aim.angle) * r * 1.6);
      ctx.lineTo(px, py);
      ctx.stroke();
      // The putter's head, square to the line.
      ctx.save();
      ctx.translate(bx - Math.cos(aim.angle) * r * 1.6, by - Math.sin(aim.angle) * r * 1.6);
      ctx.rotate(aim.angle);
      ctx.fillStyle = '#5a5e66';
      ctx.fillRect(-r * 0.5, -r * 1.3, r * 0.7, r * 2.6);
      ctx.restore();
      // How hard: a ring round the ball, filling from the top, green to amber to red.
      const R = r * 3 + 6;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.arc(bx, by, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `hsl(${120 - aim.power * 115},75%,58%)`;
      ctx.beginPath();
      ctx.arc(bx, by, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, aim.power));
      ctx.stroke();
      ctx.restore();
      // Where the finger is, back from where it went down: a faint tether.
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.drag.start.x, this.drag.start.y);
      ctx.lineTo(this.drag.cur.x, this.drag.cur.y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(this.drag.start.x, this.drag.start.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (this.drag?.pulled) {
      // Pulled all the way back in: let go and nothing happens.
      ctx.save();
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText('Let go to cancel', bx, by - r * 3 - 10);
      ctx.restore();
    } else if (this.strokes[this.hole] === 0 && (!this.banner || t > this.banner.until)) {
      // A gentle pulse on the ball until the first putt: this is what you're putting.
      const pulse = 1 + 0.5 * (0.5 + 0.5 * Math.sin(t / 250));
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx, by, r * 2.2 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** The ball: lit from the top left, dimples turning as it rolls; as it drops, it slips into the cup and down. */
  private drawBall(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (y: number) => number, t: number) {
    const h = this.h;
    let x = this.ball.x;
    let y = this.ball.y;
    let k = 1;
    if (this.phase === 'holed' && this.strokes[this.hole] <= STROKE_LIMIT) return;
    if (this.phase === 'dropping' && this.drop) {
      const u = Math.min(1, (t - this.drop.t0) / 340);
      const e = u * u;
      x = this.drop.x + (h.cup.x - this.drop.x) * Math.min(1, u * 2.2);
      y = this.drop.y + (h.cup.y - this.drop.y) * Math.min(1, u * 2.2);
      k = 1 - e * 0.55;
      if (u >= 1) return;
    }
    if (this.phase === 'splash') return;
    const r = BALL_R * this.scale * k;
    const bx = X(x);
    const by = Y(y);
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.3 * k})`;
    ctx.beginPath();
    ctx.ellipse(bx + r * 0.35, by + r * 0.5, r, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(bx - r * 0.35, by - r * 0.4, r * 0.1, bx, by, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.6, SCOTT_APPEARANCE.golfBall);
    g.addColorStop(1, this.phase === 'dropping' ? '#8d8a80' : '#cfcabc');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
    // Dimples coming over the top as it rolls.
    const phase = this.rolled / BALL_R;
    const ux = Math.cos(this.rollDir);
    const uy = Math.sin(this.rollDir);
    for (let i = 0; i < 4; i++) {
      const p = phase + i * (Math.PI / 2);
      const c = Math.cos(p);
      if (c <= 0) continue;
      const off = Math.sin(p) * r * 0.62;
      const side = (i % 2 ? 1 : -1) * r * 0.25;
      ctx.fillStyle = `rgba(120,115,100,${0.35 * c})`;
      ctx.beginPath();
      ctx.arc(bx + ux * off - uy * side, by + uy * off + ux * side, Math.max(0.7, r * 0.16), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawFx(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (y: number) => number, t: number) {
    const s = this.scale;
    this.fx = this.fx.filter((f) => t - f.t0 < f.dur);
    ctx.save();
    for (const f of this.fx) {
      const u = (t - f.t0) / f.dur;
      if (u < 0) continue;
      const x = X(f.x);
      const y = Y(f.y);
      if (f.kind === 'ring') {
        ctx.strokeStyle = `rgba(255,255,240,${0.45 * (1 - u)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, BALL_R * s * (1.2 + u * 1.6), 0, Math.PI * 2);
        ctx.stroke();
      } else if (f.kind === 'puff') {
        ctx.fillStyle = this.garden ? `rgba(200,220,160,${0.5 * (1 - u)})` : `rgba(255,255,255,${0.4 * (1 - u)})`;
        for (let i = 0; i < 4; i++) {
          const a = i * 1.7 + f.x * 3;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * s * 0.18 * u, y + Math.sin(a) * s * 0.18 * u, Math.max(0.8, s * 0.03 * (1 - u)), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (f.kind === 'splash') {
        ctx.strokeStyle = `rgba(235,248,252,${0.8 * (1 - u)})`;
        ctx.lineWidth = 1.5;
        for (const k of [0, 0.25]) {
          const v = Math.max(0, u - k);
          ctx.beginPath();
          ctx.ellipse(x, y, s * (0.1 + v * 0.6), s * (0.07 + v * 0.42), 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        // A few drops thrown up, falling back.
        ctx.fillStyle = `rgba(235,248,252,${0.9 * (1 - u)})`;
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI * (0.15 + i * 0.17);
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * s * 0.35 * u, y + Math.sin(a) * s * 0.5 * u + u * u * s * 0.6, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (f.kind === 'gold') {
        ctx.strokeStyle = `rgba(242,211,90,${0.8 * (1 - u)})`;
        ctx.lineWidth = 3 * (1 - u) + 1;
        ctx.beginPath();
        ctx.arc(x, y, CUP_R * s * (1 + u * 4), 0, Math.PI * 2);
        ctx.stroke();
      } else if (f.kind === 'petal') {
        const a = f.a ?? 0;
        const d = s * (0.3 + u * 1.3);
        ctx.fillStyle = f.c ?? '#f4efe0';
        ctx.globalAlpha = 1 - u;
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d - Math.sin(u * Math.PI) * s * 0.5, s * 0.06, s * 0.035, a + u * 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  /** A small line along the top: "Lipped out!", "So close." — said once, and fading. */
  private drawCaption(ctx: CanvasRenderingContext2D, t: number) {
    const c = this.caption;
    if (!c) return;
    const u = (t - c.t0) / 1800;
    if (u >= 1) {
      this.caption = null;
      return;
    }
    const a = u < 0.1 ? u / 0.1 : u > 0.75 ? (1 - u) / 0.25 : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = '600 14px system-ui, sans-serif';
    const w = Math.min(this.cw - 20, ctx.measureText(c.text).width + 24);
    ctx.fillStyle = 'rgba(20,30,20,0.72)';
    ctx.beginPath();
    ctx.roundRect((this.cw - w) / 2, 10, w, 28, 14);
    ctx.fill();
    ctx.fillStyle = '#f4ecd8';
    ctx.textAlign = 'center';
    ctx.fillText(c.text, this.cw / 2, 29, w - 12);
    ctx.restore();
  }

  /** The end of a round: every hole's score against its par, the total, and the best. */
  private drawScorecard(ctx: CanvasRenderingContext2D) {
    const round = this.round!;
    const holes = this.course.holes;
    const w = Math.min(this.cw - 16, 380);
    const n = holes.length;
    const colW = (w - 56) / n;
    const hgt = 232;
    const x0 = (this.cw - w) / 2;
    const y0 = Math.max(8, (this.ch - hgt) / 2);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, this.cw, this.ch);
    ctx.fillStyle = '#f4ecd8';
    ctx.beginPath();
    ctx.roundRect(x0, y0, w, hgt, 14);
    ctx.fill();
    ctx.strokeStyle = '#c9b48a';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#3a4a2c';
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillText(this.course.name, this.cw / 2, y0 + 26, w - 20);
    // The card itself: hole, par, strokes.
    const gy = y0 + 44;
    const rowH = 22;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#7a6a50';
    ['Hole', 'Par', 'You'].forEach((label, r) => ctx.fillText(label, x0 + 10, gy + 15 + r * rowH));
    ctx.textAlign = 'center';
    for (let i = 0; i < n; i++) {
      const cx = x0 + 48 + colW * (i + 0.5);
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(120,100,60,0.08)';
        ctx.fillRect(cx - colW / 2, gy, colW, rowH * 3);
      }
      ctx.fillStyle = '#7a6a50';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(String(i + 1), cx, gy + 15);
      ctx.fillText(String(holes[i].par), cx, gy + 15 + rowH);
      const sc = this.strokes[i];
      const d = sc - holes[i].par;
      const note = this.notes[i];
      if (note?.ace) {
        ctx.fillStyle = '#f2d35a';
        ctx.beginPath();
        ctx.arc(cx, gy + 11 + rowH * 2, Math.min(9, colW * 0.42), 0, Math.PI * 2);
        ctx.fill();
      } else if (d < 0) {
        ctx.strokeStyle = '#4f8a3a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, gy + 11 + rowH * 2, Math.min(9, colW * 0.42), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = d < 0 ? '#2f6a2a' : d === 0 ? '#3a3a30' : '#9a4a3a';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillText(String(sc), cx, gy + 16 + rowH * 2);
      if (note?.pb) {
        // A new best on this hole: a little dot under it.
        ctx.fillStyle = '#4f8a3a';
        ctx.beginPath();
        ctx.arc(cx, gy + 25 + rowH * 2, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(120,100,60,0.3)';
    ctx.beginPath();
    ctx.moveTo(x0 + 10, gy + rowH * 3 + 4);
    ctx.lineTo(x0 + w - 10, gy + rowH * 3 + 4);
    ctx.stroke();
    // The total, big, against par.
    ctx.fillStyle = '#2c3a22';
    ctx.font = '600 30px system-ui, sans-serif';
    ctx.fillText(`${round.total}`, this.cw / 2 - 28, y0 + 158);
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.fillStyle = round.total <= this.course.par ? '#2f6a2a' : '#7a5a40';
    ctx.fillText(toPar(round.total, this.course.par), this.cw / 2 + 30, y0 + 156);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = '#5a5040';
    const aces = this.notes.filter((x) => x?.ace).length;
    const line = round.first ? `Your first round on ${this.course.short}.` : round.newBest ? 'A new best round!' : `Best round: ${round.best} (${toPar(round.best ?? 0, this.course.par)})`;
    ctx.fillText(line, this.cw / 2, y0 + 186, w - 20);
    ctx.fillStyle = '#7a6a50';
    ctx.font = '12px system-ui, sans-serif';
    const bits = [`Par ${this.course.par}`];
    if (aces) bits.push(`${aces} hole${aces === 1 ? '' : 's'} in one`);
    const pbs = this.notes.filter((x) => x?.pb).length;
    if (pbs) bits.push(`${pbs} best${pbs === 1 ? '' : 's'} on a hole`);
    ctx.fillText(bits.join(' · '), this.cw / 2, y0 + 210, w - 20);
    ctx.restore();
  }
}

