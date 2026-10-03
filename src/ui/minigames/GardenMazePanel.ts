import type { Game } from '../../game/engine/Game';
import { MiniGamePanel } from '../MiniGamePanel';
import { scoreText } from '../../game/systems/minigames';
import type { CanvasPoint } from '../CanvasGamePanel';
import { SCOTT_APPEARANCE, SCOUT_APPEARANCE } from '../../game/data/character';
import { PLANTS } from '../../game/data/plants';
import { mulberry32 } from '../../game/engine/Random';
import {
  SESSION_MAZES,
  collect,
  finishPoints,
  glidePath,
  hedgeBloom,
  isOpen,
  linePath,
  mazeFor,
  same,
  sessionSeed,
  solve,
  ITEM_POINTS,
  type Cell,
  type Dir,
  type HedgeBloom,
  type Item,
  type Maze,
} from '../../game/systems/minigames/gardenMaze';

// The garden maze in the meadow west of the greenhouse, seen from above:
// clipped hedges of the garden's own plants, gravel paths, the hedge arch
// at the bottom. Swipe and Scott walks that way to the next turning; tap a
// spot in line with him and he walks there. The hedges flower as Ellen's
// collection grows: a new garden's maze is plain green box.

const STEP = 1 / 120;
/** Scott's walking pace, cells a second: brisk, but you can see him go. */
const WALK_SPEED = 6;
/** How far a finger has to travel before it's a swipe and not a tap. */
const SWIPE_PX = 24;
/** After this long in one maze, Scout's paw prints start showing the way. */
const HINT_AFTER = 45;

type Phase = 'walk' | 'out' | 'done';

/** A dab of hedge, precomputed per maze in cell units so drawing is just a loop. */
interface Dab {
  x: number;
  y: number;
  r: number;
  c: string;
}

interface Seg {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class GardenMazePanel extends MiniGamePanel {
  private mazeIndex = 0;
  private maze: Maze = mazeFor(0, 1);
  private seed = 1;
  private starts = 0;
  private scores: number[] = [];
  private found = 0;
  private phase: Phase = 'walk';
  private bloom: HedgeBloom = { amount: 0, colours: [], named: [] };
  // Scott: where he is (cell units, fractional while walking), where he's headed, which way he faces.
  private sx = 0;
  private sy = 0;
  private path: Cell[] = [];
  private facing: Dir = 'N';
  private walkT = 0;
  private queued: { dir?: Dir; to?: Cell } | null = null;
  /** Seconds in this maze, counted from the first step. */
  private clock = 0;
  private started = false;
  private shownSecond = -1;
  private acc = 0;
  private pops: { x: number; y: number; t: number; text: string }[] = [];
  private down: CanvasPoint | null = null;
  private swiped = false;
  // Precomputed hedges for this maze.
  private segs: Seg[] = [];
  private dabs: Dab[] = [];
  private flowers: Dab[] = [];
  private gravel: Dab[] = [];
  /** Scout's paw prints from where Scott's standing, worked out once per spot. */
  private hint: { from: Cell; way: Cell[] } | null = null;
  private namedAt: { x: number; y: number; i: number }[] = [];
  // Layout, CSS px.
  private cs = 40;
  private ox = 0;
  private oy = 0;

  constructor(game: Game) {
    super(game, 'gardenMaze');
  }

  // ------------------------------------------------------------ session

  protected start() {
    this.starts++;
    const plays = this.game.state.minigames[this.id]?.plays ?? 0;
    this.seed = sessionSeed(plays * 17 + this.starts);
    this.scores = [];
    this.found = 0;
    this.bloom = hedgeBloom(Object.keys(this.game.state.collection), PLANTS, this.seed);
    this.startMaze(0);
  }

  private get total(): number {
    return this.scores.reduce((s, n) => s + n, 0);
  }

  private startMaze(i: number) {
    this.mazeIndex = i;
    this.maze = mazeFor(i, this.seed);
    this.phase = 'walk';
    this.sx = this.maze.entrance.x;
    this.sy = this.maze.entrance.y + 0.6;
    this.path = [{ ...this.maze.entrance }];
    this.facing = 'N';
    this.queued = null;
    this.clock = 0;
    this.started = false;
    this.shownSecond = -1;
    this.pops = [];
    this.hint = null;
    this.precompute();
    this.layout();
    this.banner = { text: `Maze ${i + 1} of ${SESSION_MAZES}`, sub: `${this.maze.cols} × ${this.maze.rows} · find the way out at the top`, until: performance.now() + 1500 };
    this.setStatus('Swipe to send Scott along a path, or tap a spot in line with him. Things dropped in the dead ends are worth a look.');
    this.playingActions();
    this.refreshCard();
  }

  private refreshCard() {
    const s = Math.floor(this.clock);
    this.shownSecond = s;
    const clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.setCard(`Maze ${this.mazeIndex + 1}/${SESSION_MAZES} · ${clock}`, scoreText(this.def, this.total));
  }

  // ------------------------------------------------------------ precomputed hedges

  private precompute() {
    const m = this.maze;
    const rand = mulberry32(m.seed ^ 0x4ed9e);
    const segs: Seg[] = [];
    for (let y = 0; y < m.rows; y++)
      for (let x = 0; x < m.cols; x++) {
        const c = { x, y };
        if (!isOpen(m, c, 'N')) segs.push({ x0: x, y0: y, x1: x + 1, y1: y });
        if (!isOpen(m, c, 'W')) segs.push({ x0: x, y0: y, x1: x, y1: y + 1 });
        if (y === m.rows - 1 && !isOpen(m, c, 'S')) segs.push({ x0: x, y0: y + 1, x1: x + 1, y1: y + 1 });
        if (x === m.cols - 1 && !isOpen(m, c, 'E')) segs.push({ x0: x + 1, y0: y, x1: x + 1, y1: y + 1 });
      }
    this.segs = segs;
    // Box and yew: a few greens, dabbed along every hedge for a leafy, clipped look.
    const greens = ['#3f7a38', '#4a8a3e', '#356d32', '#2f5e2c', '#5a9446'];
    const dabs: Dab[] = [];
    const flowers: Dab[] = [];
    const amount = this.bloom.amount;
    for (const s of segs) {
      for (let k = 0; k < 7; k++) {
        const u = (k + rand()) / 7;
        dabs.push({ x: s.x0 + (s.x1 - s.x0) * u + (rand() - 0.5) * 0.12, y: s.y0 + (s.y1 - s.y0) * u + (rand() - 0.5) * 0.12, r: 0.06 + rand() * 0.05, c: greens[Math.floor(rand() * greens.length)] });
      }
      // Flowers come with the garden: none in a new one, plenty in a grown one.
      for (let k = 0; k < 4; k++) {
        if (rand() > amount * 0.85 || !this.bloom.colours.length) continue;
        const u = rand();
        flowers.push({
          x: s.x0 + (s.x1 - s.x0) * u + (rand() - 0.5) * 0.18,
          y: s.y0 + (s.y1 - s.y0) * u + (rand() - 0.5) * 0.18,
          r: 0.04 + rand() * 0.03,
          c: this.bloom.colours[Math.floor(rand() * this.bloom.colours.length)],
        });
      }
    }
    this.dabs = dabs;
    this.flowers = flowers;
    // Gravel speckle on the paths.
    const gravel: Dab[] = [];
    const n = m.cols * m.rows * 5;
    for (let i = 0; i < n; i++) gravel.push({ x: rand() * m.cols, y: rand() * m.rows, r: 0.02 + rand() * 0.025, c: rand() < 0.5 ? '#b9a682' : '#e6dbc0' });
    this.gravel = gravel;
    // A couple of Ellen's own plants grown into the hedge, on long straight runs away from the arch.
    const inner = segs.filter((s) => s.x0 > 0 && s.x1 < m.cols && s.y0 > 0 && s.y1 < m.rows);
    this.namedAt = this.bloom.named.map((_, i) => {
      const s = inner[Math.floor(rand() * inner.length)] ?? segs[0];
      return { x: (s.x0 + s.x1) / 2, y: (s.y0 + s.y1) / 2, i };
    });
  }

  // ------------------------------------------------------------ layout

  protected layout() {
    const m = this.maze;
    if (!this.cw || !this.ch) return;
    const fitW = (this.cw - 16) / m.cols;
    const fitH = (this.ch - 44) / m.rows;
    this.cs = Math.max(36, Math.min(fitW, fitH, 64));
    this.ox = (this.cw - m.cols * this.cs) / 2;
    this.oy = this.camY();
  }

  /** Centred if it fits; otherwise the view follows Scott up the maze. */
  private camY(): number {
    const mh = this.maze.rows * this.cs;
    if (mh + 44 <= this.ch) return (this.ch - mh) / 2;
    const want = this.ch / 2 - (this.sy + 0.5) * this.cs;
    return Math.max(this.ch - mh - 26, Math.min(26, want));
  }

  private toCell(p: CanvasPoint): Cell {
    return { x: Math.floor((p.x - this.ox) / this.cs), y: Math.floor((p.y - this.oy) / this.cs) };
  }

  // ------------------------------------------------------------ input

  protected onDown(p: CanvasPoint) {
    if (this.finished || this.phase !== 'walk') return;
    this.down = p;
    this.swiped = false;
  }

  protected onMove(p: CanvasPoint) {
    if (!this.down || this.swiped) return;
    // A swipe counts the moment it's clearly one: no need to lift the finger.
    const dx = p.x - this.down.x;
    const dy = p.y - this.down.y;
    if (Math.hypot(dx, dy) < SWIPE_PX) return;
    this.swiped = true;
    this.order({ dir: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N' });
  }

  protected onUp(p: CanvasPoint) {
    const d = this.down;
    this.down = null;
    if (!d || this.swiped || this.finished || this.phase !== 'walk') return;
    const dx = p.x - d.x;
    const dy = p.y - d.y;
    if (Math.hypot(dx, dy) >= SWIPE_PX) {
      this.order({ dir: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N' });
      return;
    }
    // A tap: a spot in line with him, or failing that, the way the tap is from him.
    this.order({ to: this.toCell(p) });
  }

  protected onCancel() {
    this.down = null;
  }

  /** Walk now if he's standing still; otherwise remember it for when he gets there. */
  private order(o: { dir?: Dir; to?: Cell }) {
    if (this.path.length) this.queued = o;
    else this.go(o);
  }

  private go(o: { dir?: Dir; to?: Cell }) {
    const at = this.here();
    let path: Cell[] = [];
    if (o.to) {
      path = linePath(this.maze, at, o.to);
      if (!path.length && !same(at, o.to)) {
        const dx = o.to.x - at.x;
        const dy = o.to.y - at.y;
        path = glidePath(this.maze, at, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N');
      }
    } else if (o.dir) {
      path = glidePath(this.maze, at, o.dir);
      // From the exit cell, up and out.
      if (!path.length && o.dir === 'N' && same(at, this.maze.exit)) path = [{ x: at.x, y: -1 }];
    }
    if (!path.length) return;
    this.started = true;
    this.path = path;
  }

  private here(): Cell {
    return { x: Math.round(this.sx), y: Math.min(this.maze.rows - 1, Math.round(this.sy)) };
  }

  // ------------------------------------------------------------ play

  protected update(dt: number) {
    if (this.phase === 'walk' && this.started) {
      const was = this.clock;
      this.clock += dt;
      if (was < HINT_AFTER && this.clock >= HINT_AFTER) this.setStatus("Taking a while? Scout's left paw prints toward the way out.");
    }
    if (this.phase === 'walk' && Math.floor(this.clock) !== this.shownSecond) this.refreshCard();
    this.acc += dt;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.walkT += STEP;
      this.stepWalk();
    }
    for (const p of this.pops) p.t += dt;
    if (this.pops.length && this.pops[0].t > 1.2) this.pops.shift();
    if (this.phase !== 'done') this.oy += (this.camY() - this.oy) * Math.min(1, dt * 6);
  }

  private stepWalk() {
    const next = this.path[0];
    if (!next) return;
    const dx = next.x - this.sx;
    const dy = next.y - this.sy;
    const d = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) this.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N';
    const move = WALK_SPEED * STEP;
    if (d > move) {
      this.sx += (dx / d) * move;
      this.sy += (dy / d) * move;
      return;
    }
    this.sx = next.x;
    this.sy = next.y;
    this.path.shift();
    if (this.phase !== 'walk') {
      return;
    }
    if (next.y < 0) {
      this.out();
      return;
    }
    for (const it of collect(this.maze, [next])) this.picked(it);
    // At the exit he keeps going, out through the gap.
    if (!this.path.length && same(next, this.maze.exit)) this.path = [{ x: next.x, y: -1 }];
    if (!this.path.length && this.queued) {
      const q = this.queued;
      this.queued = null;
      this.go(q);
    }
  }

  private picked(it: Item) {
    this.found += 1;
    const name = it.kind === 'ball' ? "Scout's ball" : it.kind === 'ladybird' ? 'A ladybird' : 'Petals';
    this.pops.push({ x: it.x + 0.5, y: it.y + 0.2, t: 0, text: `${name} +${ITEM_POINTS}` });
    this.scores[this.mazeIndex] = (this.scores[this.mazeIndex] ?? 0) + ITEM_POINTS;
    this.refreshCard();
  }

  private out() {
    this.phase = 'out';
    this.queued = null;
    const pts = finishPoints(this.clock);
    this.scores[this.mazeIndex] = (this.scores[this.mazeIndex] ?? 0) + pts;
    const s = Math.floor(this.clock);
    const finds = this.maze.items.filter((i) => i.taken).length;
    this.game.audio.playDiscoveryChime();
    this.banner = {
      text: `Out! +${pts}`,
      sub: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}${finds ? ` · ${finds} found (+${finds * ITEM_POINTS})` : ''}`,
      until: performance.now() + 1900,
    };
    this.refreshCard();
    this.later(1900, () => {
      if (this.mazeIndex < SESSION_MAZES - 1) this.startMaze(this.mazeIndex + 1);
      else {
        this.phase = 'done';
        this.finish(this.total, `${this.scores.map((n, i) => `Maze ${i + 1}: ${n}`).join(' · ')}${this.found ? ` · ${this.found} found` : ''}`);
      }
    });
  }

  // ------------------------------------------------------------ drawing

  protected draw(ctx: CanvasRenderingContext2D, t: number) {
    const m = this.maze;
    const cs = this.cs;
    const X = (x: number) => this.ox + x * cs;
    const Y = (y: number) => this.oy + y * cs;
    // The meadow around it.
    ctx.fillStyle = '#6f9a4a';
    ctx.fillRect(0, 0, this.cw, this.ch);
    ctx.fillStyle = 'rgba(40,80,30,0.25)';
    for (let i = 0; i < 40; i++) {
      const gx = ((i * 67) % 100) / 100 * this.cw;
      const gy = ((i * 41) % 100) / 100 * this.ch;
      ctx.fillRect(gx, gy, 2, 5);
      ctx.fillRect(gx + 3, gy + 1, 2, 4);
    }
    // The way out: a gravel path on toward the greenhouse.
    ctx.fillStyle = '#d8c8a0';
    ctx.fillRect(X(m.exit.x + 0.18), 0, cs * 0.64, Math.max(0, Y(0)));
    // The way in: under the arch from the meadow.
    ctx.fillRect(X(m.entrance.x + 0.18), Y(m.rows), cs * 0.64, this.ch);
    // Gravel inside.
    ctx.fillStyle = '#d8c8a0';
    ctx.fillRect(X(0), Y(0), m.cols * cs, m.rows * cs);
    for (const g of this.gravel) {
      ctx.fillStyle = g.c;
      ctx.fillRect(X(g.x), Y(g.y), g.r * cs, g.r * cs);
    }

    // Scout's paw prints toward the way out, if it's taking a while.
    if (this.phase === 'walk' && this.clock > HINT_AFTER && !this.path.length) {
      const at = this.here();
      if (!this.hint || !same(this.hint.from, at)) this.hint = { from: at, way: solve(m, at, m.exit).slice(0, 4) };
      ctx.fillStyle = SCOUT_APPEARANCE.furDark;
      ctx.globalAlpha = 0.45 + 0.2 * Math.sin(t / 300);
      this.hint.way.forEach((c, i) => {
        const px = X(c.x + 0.5) + (i % 2 ? 4 : -4);
        const py = Y(c.y + 0.5);
        ctx.beginPath();
        ctx.arc(px, py, cs * 0.07, 0, Math.PI * 2);
        ctx.fill();
        for (let k = -1; k <= 1; k++) {
          ctx.beginPath();
          ctx.arc(px + k * cs * 0.06, py - cs * 0.09, cs * 0.03, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.globalAlpha = 1;
    }

    // Things dropped in the dead ends.
    for (const it of m.items) if (!it.taken) this.drawItem(ctx, it, X(it.x + 0.5), Y(it.y + 0.5), t);

    // Hedges: shadow, body, clipped top, leaves, flowers.
    const T = cs * 0.34;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = T;
    ctx.beginPath();
    for (const s of this.segs) {
      ctx.moveTo(X(s.x0) + 2, Y(s.y0) + 4);
      ctx.lineTo(X(s.x1) + 2, Y(s.y1) + 4);
    }
    ctx.stroke();
    ctx.strokeStyle = '#2a5428';
    ctx.beginPath();
    for (const s of this.segs) {
      ctx.moveTo(X(s.x0), Y(s.y0));
      ctx.lineTo(X(s.x1), Y(s.y1));
    }
    ctx.stroke();
    ctx.strokeStyle = '#3a7034';
    ctx.lineWidth = T * 0.62;
    ctx.beginPath();
    for (const s of this.segs) {
      ctx.moveTo(X(s.x0) - 1, Y(s.y0) - 1);
      ctx.lineTo(X(s.x1) - 1, Y(s.y1) - 1);
    }
    ctx.stroke();
    for (const d of this.dabs) {
      ctx.fillStyle = d.c;
      ctx.beginPath();
      ctx.arc(X(d.x), Y(d.y), d.r * cs, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const f of this.flowers) {
      ctx.fillStyle = f.c;
      ctx.beginPath();
      ctx.arc(X(f.x), Y(f.y), f.r * cs, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,240,170,0.9)';
      ctx.beginPath();
      ctx.arc(X(f.x), Y(f.y), f.r * cs * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const n of this.namedAt) this.drawNamed(ctx, X(n.x), Y(n.y), this.bloom.named[n.i]);

    this.drawScott(ctx, X(this.sx + 0.5), Y(this.sy + 0.5), t);
    this.drawArch(ctx, X(m.entrance.x), Y(m.rows), cs);

    // "+10" floating up from a find.
    ctx.textAlign = 'center';
    ctx.font = '600 12px system-ui, sans-serif';
    for (const p of this.pops) {
      ctx.fillStyle = `rgba(255,250,235,${Math.max(0, 1 - p.t / 1.2)})`;
      ctx.fillText(p.text, X(p.x), Y(p.y) - p.t * 24);
    }
  }

  /** The hedge arch over the way in, seen from above: two clipped pillars and a thin leafy bow across, flowering with the garden. */
  private drawArch(ctx: CanvasRenderingContext2D, x: number, y: number, cs: number) {
    ctx.save();
    const l = x - cs * 0.06;
    const r = x + cs * 1.06;
    // The bow over the path: thin enough to see the gravel under it.
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = cs * 0.12;
    ctx.beginPath();
    ctx.moveTo(l + 2, y + 5);
    ctx.quadraticCurveTo(x + cs * 0.5 + 2, y + cs * 0.3 + 5, r + 2, y + 5);
    ctx.stroke();
    ctx.strokeStyle = '#2f5e2c';
    ctx.beginPath();
    ctx.moveTo(l, y);
    ctx.quadraticCurveTo(x + cs * 0.5, y + cs * 0.3, r, y);
    ctx.stroke();
    ctx.fillStyle = '#4a8a3e';
    for (let k = 1; k < 6; k++) {
      const u = k / 6;
      const px = l + (r - l) * u;
      const py = y + cs * 0.3 * 2 * u * (1 - u);
      ctx.beginPath();
      ctx.arc(px, py, cs * 0.055, 0, Math.PI * 2);
      ctx.fill();
    }
    // Pillars at either side.
    for (const px of [l, r]) {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.arc(px + 2, y + 4, cs * 0.21, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#244a22';
      ctx.beginPath();
      ctx.arc(px, y, cs * 0.21, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4a8a3e';
      ctx.beginPath();
      ctx.arc(px - 2, y - 2, cs * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    const cols = this.bloom.colours;
    const n = Math.round(this.bloom.amount * 6);
    for (let i = 0; i < n && cols.length; i++) {
      const u = (i + 0.5) / 6;
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath();
      ctx.arc(l + (r - l) * u, y + cs * 0.3 * 2 * u * (1 - u) - cs * 0.03, cs * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** One of Ellen's own species grown into the hedge, with a little plant tag. */
  private drawNamed(ctx: CanvasRenderingContext2D, x: number, y: number, p: HedgeBloom['named'][number]) {
    const cs = this.cs;
    ctx.fillStyle = p.leaf;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * cs * 0.12, y + Math.sin(a) * cs * 0.12, cs * 0.13, cs * 0.08, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = p.colour;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(x + (k - 1) * cs * 0.1, y - cs * 0.04 + (k % 2) * cs * 0.07, cs * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = '600 9px system-ui, sans-serif';
    const w = Math.min(cs * 1.6, ctx.measureText(p.name).width + 8);
    ctx.fillStyle = 'rgba(250,246,232,0.92)';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y + cs * 0.16, w, 13, 3);
    ctx.fill();
    ctx.fillStyle = '#3a4a2a';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, x, y + cs * 0.16 + 10, w - 4);
  }

  private drawItem(ctx: CanvasRenderingContext2D, it: Item, x: number, y: number, t: number) {
    // Drawn a touch large, so they read from across the maze.
    const cs = this.cs * 1.4;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 3, cs * 0.14, cs * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    if (it.kind === 'ball') {
      // One of Scout's tennis balls, a bit chewed.
      ctx.fillStyle = '#cfe04a';
      ctx.beginPath();
      ctx.arc(x, y, cs * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f6f6e8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x - cs * 0.13, y, cs * 0.11, -0.9, 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + cs * 0.13, y, cs * 0.11, Math.PI - 0.9, Math.PI + 0.9);
      ctx.stroke();
    } else if (it.kind === 'ladybird') {
      const wob = Math.sin(t / 400) * 0.3;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(wob);
      ctx.fillStyle = '#2a2018';
      ctx.beginPath();
      ctx.arc(0, -cs * 0.09, cs * 0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d23a2a';
      ctx.beginPath();
      ctx.ellipse(0, 0, cs * 0.09, cs * 0.11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a2018';
      ctx.fillRect(-0.5, -cs * 0.1, 1, cs * 0.2);
      for (const [dx, dy] of [
        [-0.04, -0.03],
        [0.04, -0.03],
        [-0.045, 0.04],
        [0.045, 0.04],
      ]) {
        ctx.beginPath();
        ctx.arc(dx * cs, dy * cs, cs * 0.018, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else {
      // A little drift of fallen petals, in the garden's colours.
      const cols = this.bloom.colours.length ? this.bloom.colours : ['#f2d0e0', '#f6e8f0'];
      for (let k = 0; k < 6; k++) {
        const a = k * 1.9;
        ctx.fillStyle = cols[k % cols.length];
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(a) * cs * 0.1, y + Math.sin(a) * cs * 0.08, cs * 0.06, cs * 0.035, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** Scott from above: blonde head, chambray shoulders, overall straps, arms swinging as he walks. */
  private drawScott(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
    const cs = this.cs;
    const r = cs * 0.3;
    const walking = this.path.length > 0;
    const a = { N: -Math.PI / 2, E: 0, S: Math.PI / 2, W: Math.PI }[this.facing] + Math.PI / 2;
    const swing = walking ? Math.sin(t / 90) * 0.5 : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(2, 4, r * 1.2, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(a);
    // Arms, swinging.
    ctx.fillStyle = SCOTT_APPEARANCE.shirt;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * r * 1.0, side * swing * r * 0.5, r * 0.28, r * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = SCOTT_APPEARANCE.skin;
      ctx.beginPath();
      ctx.arc(side * r * 1.0, side * swing * r * 0.5 - r * 0.45, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = SCOTT_APPEARANCE.shirt;
    }
    // Shoulders: chambray shirt, overalls over it.
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.95, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SCOTT_APPEARANCE.overalls;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.05, r * 0.6, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = SCOTT_APPEARANCE.overallsTrim;
    ctx.lineWidth = r * 0.16;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * r * 0.35, -r * 0.45);
      ctx.lineTo(side * r * 0.35, r * 0.45);
      ctx.stroke();
    }
    // The blonde top of his head, a little forward.
    ctx.fillStyle = SCOTT_APPEARANCE.hair;
    ctx.beginPath();
    ctx.arc(0, -r * 0.1, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,245,200,0.35)';
    ctx.beginPath();
    ctx.arc(-r * 0.12, -r * 0.22, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
