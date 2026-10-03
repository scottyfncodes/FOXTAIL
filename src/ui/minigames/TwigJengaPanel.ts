import type { Game } from '../../game/engine/Game';
import { button } from '../common';
import { MiniGamePanel } from '../MiniGamePanel';
import type { CanvasPoint } from '../CanvasGamePanel';
import { SCOTT_APPEARANCE } from '../../game/data/character';
import { mulberry32 } from '../../game/engine/Random';
import {
  COLLAPSE_LEAN,
  CREAK_LEAN,
  SESSION_PILES,
  canPull,
  leanGuess,
  leanOf,
  makePile,
  pull,
  sessionSeed,
  type Pile,
  type Twig,
} from '../../game/systems/minigames/twigJenga';

// Twig Jenga at the kindling heap beside Scott's woodpile. Tap a twig and
// Scott slides it out and tosses it on the kindling; hold one first and the
// pile shifts a little the way it would go, so you can feel the danger
// before you commit. Three piles, each less steady than the last. When one
// goes over it's a clatter of sticks, not a failure: the next pile's waiting.

/** Visual steps for the flying and tumbling twigs. */
const STEP = 1 / 120;
const GRAVITY = 1800;

type Phase = 'play' | 'tumble' | 'between' | 'done';

/** A twig in the air: on its way to the kindling heap, or part of a pile going over. */
interface Flyer {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  va: number;
  len: number;
  thick: number;
  twig: Twig;
  /** Seconds left sliding out before it flies (Scott's hand on it). */
  slide: number;
  /** Heading for the heap: lands and joins it. */
  toHeap: boolean;
  resting: boolean;
}

export class TwigJengaPanel extends MiniGamePanel {
  private pileIndex = 0;
  private pile: Pile = makePile(0, 1);
  private perPile: number[] = [];
  private phase: Phase = 'play';
  private starts = 0;
  private seed = 1;
  private held: { layer: number; slot: number } | null = null;
  /** The lean as drawn: eased toward the real one, with a springy wobble after each pull. */
  private shownLean = 0;
  private leanVel = 0;
  private flyers: Flyer[] = [];
  /** Twigs that have landed on the kindling heap (drawn there). */
  private heap = 0;
  private acc = 0;
  private hint = '';
  // Layout, CSS px.
  private groundY = 0;
  private rowH = 44;
  private towerW = 200;
  private towerX = 0;
  private heapX = 0;

  constructor(game: Game) {
    super(game, 'twigJenga');
  }

  // ------------------------------------------------------------ session

  protected start() {
    this.starts++;
    const plays = this.game.state.minigames[this.id]?.plays ?? 0;
    this.seed = sessionSeed(plays * 13 + this.starts);
    this.perPile = [];
    this.heap = 0;
    this.flyers = [];
    this.startPile(0);
  }

  private get total(): number {
    return this.perPile.reduce((s, n) => s + n, 0);
  }

  private startPile(i: number) {
    this.pileIndex = i;
    this.pile = makePile(i, this.seed);
    this.perPile[i] = 0;
    this.phase = 'play';
    this.held = null;
    this.shownLean = this.pile.baseLean;
    this.leanVel = 0;
    // Last pile's tumble is swept aside; the heap stays.
    this.flyers = this.flyers.filter((f) => f.toHeap && !f.resting);
    this.hint = '';
    this.banner = { text: `Pile ${i + 1} of ${SESSION_PILES}`, sub: this.pile.name, until: performance.now() + 1500 };
    this.layout();
    this.refresh();
  }

  private refresh() {
    this.setCard(`Pile ${this.pileIndex + 1}/${SESSION_PILES}`, `${this.total} ${this.def.unit}`);
    if (this.hint) this.setStatus(this.hint);
    else if (this.pileIndex === 0)
      this.setStatus('Tap a twig to slide it out. A layer stands on its middle twig or both ends; hold a twig first to feel which way the pile would lean.');
    else if (this.pileIndex === 1) this.setStatus('Taller now. Two middle-only layers stacked will pivot, so mix them up.');
    else this.setStatus('This one already leans. Crooked twigs drag the pile the way they hook.');
    this.setActions(button('Stop here', () => this.stopHere(), 'secondary-btn'), button('Start over', () => this.restart(), 'secondary-btn'));
  }

  private stopHere() {
    if (this.phase !== 'play' || this.finished) return;
    this.phase = 'between';
    this.held = null;
    const n = this.perPile[this.pileIndex];
    this.banner = { text: 'Still standing', sub: `${n} ${n === 1 ? 'twig' : 'twigs'} from this pile`, until: performance.now() + 1500 };
    this.later(1500, () => this.nextPile());
  }

  private nextPile() {
    if (this.pileIndex < SESSION_PILES - 1) {
      this.startPile(this.pileIndex + 1);
      return;
    }
    this.phase = 'done';
    const summary = this.perPile.map((n, i) => `Pile ${i + 1}: ${n}`).join(' · ');
    this.finish(this.total, summary);
  }

  // ------------------------------------------------------------ layout & hit testing

  protected layout() {
    const w = this.cw;
    const h = this.ch;
    if (!w || !h) return;
    this.groundY = h - 30;
    const layers = this.pile.layers.length;
    // Rows as tall as the canvas allows (44px+ on a phone), a fat tower to tap.
    this.rowH = Math.max(26, Math.min(58, (this.groundY - 52) / layers));
    this.towerW = Math.min(w * 0.6, this.rowH * 5.4, 250);
    this.towerX = w * 0.42;
    this.heapX = Math.min(w - 50, this.towerX + this.towerW / 2 + (w - this.towerX - this.towerW / 2) / 2 + 4);
  }

  /** Where layer `i` sits, with the lean: its centre, and its tilt. */
  private layerPos(i: number, lean: number, t: number) {
    const n = this.pile.layers.length;
    const k = n > 1 ? i / (n - 1) : 0;
    // A creaking pile trembles, more the further it's gone.
    const tremble = Math.max(0, Math.abs(lean) - CREAK_LEAN) * 3 * Math.sin(t / 37 + i) * k;
    const x = this.towerX + lean * this.towerW * 0.3 * Math.pow(k, 1.3) + tremble;
    const y = this.groundY - (i + 0.5) * this.rowH;
    return { x, y, tilt: lean * 0.07 * k };
  }

  private twigAt(p: CanvasPoint): { layer: number; slot: number } | null {
    const n = this.pile.layers.length;
    const i = Math.floor((this.groundY - p.y) / this.rowH);
    if (i < 0 || i >= n) return null;
    const pos = this.layerPos(i, this.shownLean, 0);
    const u = (p.x - pos.x) / (this.towerW / 3) + 1.5;
    // Generous: a little way past either end still counts as that end's twig.
    if (u < -0.7 || u > 3.7) return null;
    const slot = Math.max(0, Math.min(2, Math.floor(u)));
    if (!this.pile.layers[i][slot].present) return null;
    return { layer: i, slot };
  }

  // ------------------------------------------------------------ input

  protected onDown(p: CanvasPoint) {
    if (this.finished || this.phase !== 'play') return;
    const hit = this.twigAt(p);
    if (!hit) return;
    if (hit.layer === this.pile.layers.length - 1) {
      this.hint = 'The top layer holds the rest down: those stay put.';
      this.refresh();
      return;
    }
    this.held = hit;
  }

  protected onUp(p: CanvasPoint) {
    const h = this.held;
    this.held = null;
    if (!h || this.finished || this.phase !== 'play') return;
    // Sliding sideways is fine (that's pulling it); wandering well off the row is changing your mind.
    const rowY = this.groundY - (h.layer + 0.5) * this.rowH;
    if (Math.abs(p.y - rowY) > this.rowH * 1.4) return;
    this.pullTwig(h.layer, h.slot);
  }

  protected onCancel() {
    this.held = null;
  }

  private pullTwig(layer: number, slot: number) {
    if (!canPull(this.pile, layer, slot)) return;
    const twig = this.pile.layers[layer][slot];
    const pos = this.layerPos(layer, this.shownLean, performance.now());
    const res = pull(this.pile, layer, slot);
    if (!res.ok) return;
    this.hint = '';
    // The pile gives a little shudder either way.
    this.leanVel += (twig.nudge >= 0 ? 1 : -1) * 0.6;
    if (res.collapsed) {
      this.collapse(res.reason === 'empty' ? 'Nothing left under it' : 'Over she goes');
      return;
    }
    this.perPile[this.pileIndex] += 1;
    // Out it slides sideways (the middle one comes straight toward you), then onto the heap.
    const dir = slot === 0 ? -1 : slot === 2 ? 1 : 0.4;
    const sx = pos.x + (slot - 1) * (this.towerW / 3);
    const fly: Flyer = {
      x: sx,
      y: pos.y,
      vx: dir * this.towerW * 1.4,
      vy: 0,
      a: this.twigAngle(layer),
      va: 0,
      len: this.towerW / 3,
      thick: this.rowH * 0.5,
      twig: { ...twig, present: true },
      slide: 0.22,
      toHeap: true,
      resting: false,
    };
    this.flyers.push(fly);
    if (Math.abs(res.lean) > CREAK_LEAN) this.hint = 'It creaks…';
    this.refresh();
  }

  private collapse(text: string) {
    this.phase = 'tumble';
    this.held = null;
    this.hint = '';
    this.setStatus(this.pileIndex < SESSION_PILES - 1 ? 'Clatter! Scott stacks up the next one.' : 'Clatter! That was the last of the kindling.');
    const rand = mulberry32(this.seed + this.pileIndex * 101 + this.perPile[this.pileIndex]);
    const side = this.shownLean + this.leanVel * 0.1 >= 0 ? 1 : -1;
    const t = performance.now();
    // Every twig still in the pile goes its own way, mostly the way it was leaning.
    this.pile.layers.forEach((layer, i) => {
      const pos = this.layerPos(i, this.shownLean, t);
      layer.forEach((tw, s) => {
        if (!tw.present) return;
        const k = i / this.pile.layers.length;
        this.flyers.push({
          x: pos.x + (s - 1) * (this.towerW / 3),
          y: pos.y,
          vx: side * (60 + 260 * k + rand() * 120) + (rand() - 0.5) * 140,
          vy: -80 - rand() * 220 * k,
          a: this.twigAngle(i) + pos.tilt,
          va: side * (2 + rand() * 7) * (rand() < 0.2 ? -1 : 1),
          len: this.towerW / 3,
          thick: this.rowH * 0.5,
          twig: tw,
          slide: 0,
          toHeap: false,
          resting: false,
        });
        tw.present = false;
      });
    });
    const n = this.perPile[this.pileIndex];
    this.later(1300, () => {
      this.banner = { text: `${text}!`, sub: `${n} ${n === 1 ? 'twig' : 'twigs'} from this pile`, until: performance.now() + 1700 };
    });
    this.later(3000, () => this.nextPile());
  }

  // ------------------------------------------------------------ play

  protected update(dt: number) {
    // The drawn lean springs toward the real one; holding a twig leans it part way toward where it'd go.
    let target = this.pile.collapsed ? this.shownLean : leanOf(this.pile);
    if (this.held && this.phase === 'play') {
      const g = leanGuess(this.pile, this.held.layer, this.held.slot);
      const ghost = g.collapsed ? (g.lean >= 0 ? 1 : -1) * COLLAPSE_LEAN * 1.05 : g.lean;
      target += (ghost - target) * 0.4;
    }
    this.acc += dt;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      if (this.phase !== 'tumble') {
        this.leanVel += ((target - this.shownLean) * 90 - this.leanVel * 9) * STEP;
        this.shownLean += this.leanVel * STEP;
      }
      for (const f of this.flyers) this.stepFlyer(f);
    }
  }

  private stepFlyer(f: Flyer) {
    if (f.resting) return;
    if (f.slide > 0) {
      // Sliding out of the pile: straight along, no gravity yet.
      f.slide -= STEP;
      f.x += f.vx * STEP * 0.35;
      if (f.slide <= 0) {
        // Tossed underarm onto the heap: aim for it.
        const tx = this.heapX + ((this.heap % 5) - 2) * 7;
        const ty = this.groundY - 6 - Math.min(40, this.heap * 1.4);
        const time = 0.55;
        f.vx = (tx - f.x) / time;
        f.vy = (ty - f.y) / time - (GRAVITY * time) / 2;
        f.va = (f.vx >= 0 ? 1 : -1) * 9;
      }
      return;
    }
    f.vy += GRAVITY * STEP;
    f.x += f.vx * STEP;
    f.y += f.vy * STEP;
    f.a += f.va * STEP;
    if (f.toHeap) {
      const ty = this.groundY - 6 - Math.min(40, this.heap * 1.4);
      if (f.vy > 0 && f.y >= ty) {
        f.resting = true;
        this.heap += 1;
      }
      return;
    }
    // Tumbling: bounce on the ground, skitter, settle.
    const floor = this.groundY - f.thick * 0.35;
    if (f.y > floor) {
      f.y = floor;
      if (Math.abs(f.vy) < 90) {
        f.vy = 0;
        f.vx *= 0.8;
        f.va *= 0.6;
        if (Math.abs(f.vx) < 6) f.resting = true;
      } else {
        f.vy *= -0.35;
        f.vx *= 0.7;
        f.va *= -0.6;
      }
    }
    if (f.x < 10 || f.x > this.cw - 10) {
      f.x = Math.max(10, Math.min(this.cw - 10, f.x));
      f.vx *= -0.4;
    }
  }

  /** Layers alternate: seen from the corner, one runs this way, the next that. */
  private twigAngle(layer: number): number {
    return layer % 2 === 0 ? -0.14 : 0.14;
  }

  // ------------------------------------------------------------ drawing

  protected draw(ctx: CanvasRenderingContext2D, t: number) {
    const w = this.cw;
    const h = this.ch;
    // Under the trees: dappled green-brown, the woodpile behind.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2f4a2c');
    g.addColorStop(0.7, '#3d5a32');
    g.addColorStop(1, '#4a3a26');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(220,240,180,0.035)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(((i * 97) % 100) / 100 * w, ((i * 53) % 60) / 100 * h, 20 + (i % 3) * 14, 0, Math.PI * 2);
      ctx.fill();
    }
    this.drawWoodpile(ctx);
    // The ground, with leaf litter.
    ctx.fillStyle = '#5a4430';
    ctx.fillRect(0, this.groundY, w, h - this.groundY);
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = i % 3 === 0 ? '#8a5a2a' : i % 3 === 1 ? '#a0703a' : '#6a7a3a';
      ctx.beginPath();
      ctx.ellipse(((i * 61) % 100) / 100 * w, this.groundY + 4 + ((i * 37) % 22), 4, 2, i, 0, Math.PI * 2);
      ctx.fill();
    }

    this.drawHeap(ctx);
    if (!this.pile.collapsed) this.drawPile(ctx, t);
    for (const f of this.flyers) this.drawFlyer(ctx, f);
    this.drawPlumb(ctx);
  }

  /** Scott's woodpile behind it all: log ends, softly out of focus. */
  private drawWoodpile(ctx: CanvasRenderingContext2D) {
    const y0 = this.groundY - 4;
    const r = Math.max(7, this.rowH * 0.2);
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 5 - row; i++) {
        const x = this.cw - 10 - (i + row * 0.5) * r * 2.05;
        const y = y0 - r - row * r * 1.75;
        ctx.fillStyle = 'rgba(70,48,30,0.3)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(190,160,120,0.22)';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.75, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawPile(ctx: CanvasRenderingContext2D, t: number) {
    const lean = this.shownLean;
    // Its shadow, sliding the way it leans.
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(this.towerX + lean * 30, this.groundY + 3, this.towerW * 0.62, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    const n = this.pile.layers.length;
    for (let i = 0; i < n; i++) {
      const pos = this.layerPos(i, lean, t);
      const layer = this.pile.layers[i];
      for (let s = 0; s < 3; s++) {
        const tw = layer[s];
        if (!tw.present) continue;
        const held = this.held && this.held.layer === i && this.held.slot === s;
        const x = pos.x + (s - 1) * (this.towerW / 3) * Math.cos(pos.tilt);
        const y = pos.y + (s - 1) * (this.towerW / 3) * Math.sin(pos.tilt);
        // A held twig is already easing out.
        const ease = held ? (s === 0 ? -6 : s === 2 ? 6 : 3) : 0;
        this.drawTwig(ctx, tw, x + ease, y, this.twigAngle(i) + pos.tilt, this.towerW / 3, this.rowH * 0.5, i === n - 1, !!held, i % 2 === 1);
      }
    }
    // Creaks: little strain marks on the side it's going.
    if (Math.abs(lean) > CREAK_LEAN && this.phase === 'play') {
      const side = lean > 0 ? 1 : -1;
      const top = this.layerPos(n - 1, lean, t);
      ctx.strokeStyle = `rgba(255,240,200,${0.3 + 0.4 * Math.abs(Math.sin(t / 120))})`;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const cx = top.x + side * (this.towerW / 2 + 12 + k * 7);
        const cy = top.y + this.rowH * (0.5 + k * 0.9);
        ctx.beginPath();
        ctx.moveTo(cx, cy - 6);
        ctx.quadraticCurveTo(cx + side * 5, cy, cx, cy + 6);
        ctx.stroke();
      }
    }
  }

  /** One twig, seen from the pile's corner: bark along it, the cut end showing at the front. */
  private drawTwig(ctx: CanvasRenderingContext2D, tw: Twig, x: number, y: number, a: number, len: number, thick: number, top: boolean, held: boolean, endLeft = false) {
    const half = len * 0.46;
    const bark = tw.kind === 'damp' ? '#4a3a2a' : tw.shade < 0.33 ? '#7a5a3a' : tw.shade < 0.66 ? '#8a6a44' : '#6e4e30';
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Soft shadow under it.
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = thick;
    ctx.beginPath();
    ctx.moveTo(-half + 2, 3);
    ctx.lineTo(half + 2, 3);
    ctx.stroke();
    if (held) {
      ctx.strokeStyle = 'rgba(255,240,190,0.55)';
      ctx.lineWidth = thick + 6;
      ctx.beginPath();
      ctx.moveTo(-half, 0);
      ctx.lineTo(half, 0);
      ctx.stroke();
    }
    ctx.strokeStyle = bark;
    ctx.lineWidth = thick;
    ctx.beginPath();
    if (tw.kind === 'crooked') {
      // A kink in the middle and a hook at one end: it drags the pile the way it hooks.
      const hook = tw.nudge >= 0 ? 1 : -1;
      ctx.moveTo(-half * hook, thick * 0.05);
      ctx.lineTo(-half * hook * 0.1, -thick * 0.22);
      ctx.lineTo(half * hook * 0.62, thick * 0.08);
      ctx.stroke();
      // The hook itself, thinner, curling up at the end.
      ctx.lineWidth = thick * 0.6;
      ctx.beginPath();
      ctx.moveTo(half * hook * 0.62, thick * 0.08);
      ctx.quadraticCurveTo(half * hook * 0.95, thick * 0.05, half * hook * 1.02, -thick * 0.7);
    } else {
      ctx.moveTo(-half, 0);
      ctx.lineTo(half, 0);
    }
    ctx.stroke();
    // Bark grain.
    ctx.strokeStyle = 'rgba(40,24,12,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-half * 0.6, -thick * 0.18);
    ctx.lineTo(half * 0.3, -thick * 0.2);
    ctx.moveTo(-half * 0.2, thick * 0.2);
    ctx.lineTo(half * 0.6, thick * 0.17);
    ctx.stroke();
    if (tw.kind === 'knotty') {
      ctx.fillStyle = '#3e2a18';
      for (const k of [-0.35, 0.3]) {
        ctx.beginPath();
        ctx.ellipse(half * k, -thick * 0.05, thick * 0.2, thick * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (tw.kind === 'damp') {
      // Moss on the damp ones: heavy and dark.
      ctx.fillStyle = '#6a8a3a';
      for (const k of [-0.5, -0.1, 0.35]) {
        ctx.beginPath();
        ctx.arc(half * k, -thick * 0.25, thick * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // The cut end, facing out of the pile: right on one layer, left on the next, the way a log cabin's corners go.
    if (tw.kind !== 'crooked') {
      const ex = endLeft ? -half : half;
      ctx.fillStyle = top ? '#b89868' : '#c8a878';
      ctx.beginPath();
      ctx.ellipse(ex, 0, thick * 0.22, thick * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(110,74,40,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(ex, 0, thick * 0.11, thick * 0.24, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawFlyer(ctx: CanvasRenderingContext2D, f: Flyer) {
    if (f.toHeap && f.resting) return;
    this.drawTwig(ctx, f.twig, f.x, f.y, f.a, f.len, f.thick, false, false);
    if (f.slide > 0) {
      // Scott's hand on the end of it, chambray cuff and all.
      const hx = f.x + (f.vx >= 0 ? 1 : -1) * f.len * 0.46;
      ctx.fillStyle = SCOTT_APPEARANCE.shirt;
      ctx.beginPath();
      ctx.roundRect(hx + (f.vx >= 0 ? 6 : -22), f.y - 9, 16, 18, 5);
      ctx.fill();
      ctx.fillStyle = SCOTT_APPEARANCE.skin;
      ctx.beginPath();
      ctx.arc(hx, f.y, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** The kindling heap: everything pulled so far, criss-crossed, with a count. */
  private drawHeap(ctx: CanvasRenderingContext2D) {
    const x0 = this.heapX;
    const y0 = this.groundY;
    const n = Math.min(this.heap, 40);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(x0, y0 + 2, 36, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const row = Math.floor(Math.sqrt(i * 1.6));
      const k = (i * 0.618) % 1;
      const x = x0 + (k - 0.5) * Math.max(14, 64 - row * 9);
      const y = y0 - 5 - row * 5.5;
      const a = ((i * 2.4) % 1.2) - 0.6;
      ctx.strokeStyle = i % 3 === 0 ? '#7a5a3a' : i % 3 === 1 ? '#8a6a44' : '#6e4e30';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(a) * 15, y - Math.sin(a) * 15);
      ctx.lineTo(x + Math.cos(a) * 15, y + Math.sin(a) * 15);
      ctx.stroke();
    }
    // The count, on a little plank.
    ctx.fillStyle = '#c8a878';
    ctx.beginPath();
    ctx.roundRect(x0 - 18, y0 + 6, 36, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#3e2a18';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(this.total), x0, y0 + 19);
  }

  /** A plumb bob on a string from a stick: it swings with the pile and turns red when it's about to go. */
  private drawPlumb(ctx: CanvasRenderingContext2D) {
    const x = this.cw - 36;
    const y = 12;
    const len = 46;
    const lean = this.pile.collapsed ? 0 : this.shownLean;
    const max = 0.75;
    // The danger arc behind it.
    ctx.lineWidth = 6;
    ctx.lineCap = 'butt';
    const seg = (from: number, to: number, c: string) => {
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, len, Math.PI / 2 - to * max, Math.PI / 2 - from * max);
      ctx.stroke();
    };
    seg(-1, -CREAK_LEAN, 'rgba(200,85,61,0.55)');
    seg(-CREAK_LEAN, CREAK_LEAN, 'rgba(160,200,120,0.45)');
    seg(CREAK_LEAN, 1, 'rgba(200,85,61,0.55)');
    const a = Math.max(-1.1, Math.min(1.1, lean)) * max;
    const bx = x + Math.sin(a) * len;
    const by = y + Math.cos(a) * len;
    ctx.strokeStyle = '#6b4a2e';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 14, y);
    ctx.lineTo(x + 14, y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(240,230,210,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.fillStyle = Math.abs(lean) > CREAK_LEAN ? SCOTT_APPEARANCE.flag : '#c9a258';
    ctx.beginPath();
    ctx.arc(bx, by, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}
