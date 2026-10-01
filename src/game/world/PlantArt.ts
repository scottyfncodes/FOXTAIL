import type { PlantForm, PlantLook } from '../types';
import { PLANTS, lookFor } from '../data/plants';
import { mulberry32 } from '../engine/Random';

// Procedural houseplant art. Every species has its own silhouette (form),
// every variant its own colouring and variegation, and every individual its
// own leaf layout (seed). Growth is continuous: a plant gains leaves, size,
// splits, runners and flowers as it moves from cutting to specimen.
//
// Drawing this many leaves every frame would be far too slow, so plants are
// rendered once into offscreen sprites (PlantSpriteCache) keyed by species,
// variant, a growth bucket, a seed bucket and zoom, and blitted with a
// little wind sway.

export type PlantMode = 'ground' | 'pot' | 'hanging';

const STAGE_SCALE = [0.42, 0.62, 0.86, 1.1, 1.34];

export function stageScale(sf: number): number {
  if (sf >= 4) return STAGE_SCALE[4] + Math.min(0.6, sf - 4) * 0.25;
  const i = Math.floor(Math.max(0, sf));
  const f = Math.max(0, sf) - i;
  return STAGE_SCALE[i] + (STAGE_SCALE[i + 1] - STAGE_SCALE[i]) * f;
}

function hsl(h: number, s: number, l: number, a = 1): string {
  const ss = Math.max(0, Math.min(100, s));
  const ll = Math.max(0, Math.min(100, l));
  return a >= 1 ? `hsl(${h},${ss}%,${ll}%)` : `hsla(${h},${ss}%,${ll}%,${a})`;
}

interface Paint {
  ctx: CanvasRenderingContext2D;
  look: PlantLook;
  rand: () => number;
  /** Pixels per tile. */
  unit: number;
  /** Overall plant scale in px (unit × species size × stage scale). */
  S: number;
  sf: number;
  mode: PlantMode;
}

// ------------------------------------------------------------ leaf shapes

type LeafShape = 'heart' | 'oval' | 'lance' | 'succulent' | 'spear' | 'spike' | 'fiddle';

/** Builds a leaf path at the origin, attached at (0,0), pointing up (−y). */
function leafPath(ctx: CanvasRenderingContext2D, shape: LeafShape, L: number, W: number, ruffle: number) {
  ctx.beginPath();
  if (shape === 'heart') {
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(W * 0.6, W * 0.4, W * 1.2, -L * 0.1, W * 0.98, -L * 0.42);
    ctx.bezierCurveTo(W * 0.8, -L * 0.72, W * 0.22, -L * 0.9, 0, -L);
    ctx.bezierCurveTo(-W * 0.22, -L * 0.9, -W * 0.8, -L * 0.72, -W * 0.98, -L * 0.42);
    ctx.bezierCurveTo(-W * 1.2, -L * 0.1, -W * 0.6, W * 0.4, 0, 0);
  } else if (shape === 'spear') {
    ctx.moveTo(-W, 0);
    ctx.lineTo(-W * 0.85, -L * 0.8);
    ctx.quadraticCurveTo(-W * 0.4, -L * 0.97, 0, -L);
    ctx.quadraticCurveTo(W * 0.4, -L * 0.97, W * 0.85, -L * 0.8);
    ctx.lineTo(W, 0);
    ctx.closePath();
  } else if (shape === 'spike') {
    ctx.moveTo(-W, 0);
    ctx.quadraticCurveTo(-W * 0.9, -L * 0.55, 0, -L);
    ctx.quadraticCurveTo(W * 0.9, -L * 0.55, W, 0);
    ctx.closePath();
  } else if (shape === 'fiddle') {
    // Narrow at the stalk, pinched at the waist, broad and rounded at the top.
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(W * 0.5, -L * 0.04, W * 0.78, -L * 0.28, W * 0.64, -L * 0.46);
    ctx.bezierCurveTo(W * 0.56, -L * 0.56, W * 1.12, -L * 0.6, W * 1.02, -L * 0.84);
    ctx.bezierCurveTo(W * 0.92, -L * 1.02, W * 0.28, -L * 1.04, 0, -L * 0.96);
    ctx.bezierCurveTo(-W * 0.28, -L * 1.04, -W * 0.92, -L * 1.02, -W * 1.02, -L * 0.84);
    ctx.bezierCurveTo(-W * 1.12, -L * 0.6, -W * 0.56, -L * 0.56, -W * 0.64, -L * 0.46);
    ctx.bezierCurveTo(-W * 0.78, -L * 0.28, -W * 0.5, -L * 0.04, 0, 0);
  } else if (shape === 'succulent') {
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(W * 1.35, -L * 0.15, W * 1.0, -L * 0.8, 0, -L);
    ctx.bezierCurveTo(-W * 1.0, -L * 0.8, -W * 1.35, -L * 0.15, 0, 0);
  } else {
    const k = shape === 'lance' ? 0.85 : 1.15;
    if (ruffle > 0) {
      // Wavy margin: walk each side in small steps with a sine offset.
      const steps = 14;
      ctx.moveTo(0, 0);
      for (const side of [1, -1]) {
        for (let i = 1; i <= steps; i++) {
          const t = side === 1 ? i / steps : 1 - i / steps;
          const base = Math.sin(Math.PI * Math.pow(t, 0.8)) * W * k;
          const wob = Math.sin(t * Math.PI * 9) * W * 0.16 * ruffle;
          ctx.lineTo(side * (base + wob), -L * t);
        }
      }
      ctx.closePath();
    } else {
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(W * 1.1 * k, -L * 0.12, W * 1.0 * k, -L * 0.78, 0, -L);
      ctx.bezierCurveTo(-W * 1.0 * k, -L * 0.78, -W * 1.1 * k, -L * 0.12, 0, 0);
    }
  }
}

function leafFill(p: Paint, L: number, dim = 0): CanvasGradient {
  const { look, rand } = p;
  const j = (rand() - 0.5) * 8 - dim;
  const g = p.ctx.createLinearGradient(0, 0, 0, -L);
  g.addColorStop(0, hsl(look.hue, look.sat - 4, look.light - 9 + j));
  g.addColorStop(0.6, hsl(look.hue, look.sat, look.light + j));
  g.addColorStop(1, hsl(look.hue + 4, look.sat + 4, look.light + 8 + j));
  return g;
}

/** Paints the variegation pattern inside the current (already built) leaf path. */
function variegate(p: Paint, L: number, W: number, opts: { bands?: boolean } = {}) {
  const { ctx, look, rand } = p;
  if (look.variegation === 'none' || !look.variegationColor) return;
  const [vh, vs, vl] = look.variegationColor;
  const vc = (a = 1) => hsl(vh, vs, vl, a);
  ctx.save();
  ctx.clip();
  switch (look.variegation) {
    case 'marble': {
      ctx.strokeStyle = vc(0.8);
      ctx.lineCap = 'round';
      const n = 3 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        ctx.lineWidth = W * (0.08 + rand() * 0.22);
        const y0 = -L * (0.1 + rand() * 0.5);
        ctx.beginPath();
        ctx.moveTo((rand() - 0.5) * W * 0.6, y0);
        ctx.quadraticCurveTo((rand() - 0.5) * W * 2, y0 - L * 0.25, (rand() - 0.5) * W * 1.6, y0 - L * (0.3 + rand() * 0.3));
        ctx.stroke();
      }
      break;
    }
    case 'splash': {
      ctx.fillStyle = vc(0.95);
      if (rand() < 0.12) {
        ctx.fillRect(-W * 2, -L * 1.2, W * 4, L * 1.4);
      } else {
        const side = rand() < 0.5 ? -1 : 1;
        ctx.beginPath();
        ctx.ellipse(side * W * (0.3 + rand() * 0.6), -L * (0.3 + rand() * 0.4), W * (0.5 + rand() * 0.7), L * (0.2 + rand() * 0.3), rand() - 0.5, 0, Math.PI * 2);
        ctx.fill();
        if (rand() < 0.6) {
          ctx.beginPath();
          ctx.ellipse(-side * W * 0.5, -L * (0.2 + rand() * 0.6), W * 0.25, L * 0.12, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'edge': {
      ctx.strokeStyle = vc(0.95);
      ctx.lineWidth = Math.max(1.2, W * 0.42);
      ctx.stroke();
      break;
    }
    case 'speckle': {
      ctx.fillStyle = vc(0.9);
      const n = 10 + Math.floor(rand() * 16);
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.arc((rand() - 0.5) * W * 2, -rand() * L, W * (0.04 + rand() * 0.08), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'stripe': {
      ctx.strokeStyle = vc(0.75);
      if (opts.bands) {
        // The floor shrinks with the leaf so bands on a small plant don't merge into one.
        ctx.lineWidth = Math.max(L * 0.035, Math.min(1, L * 0.05));
        for (let y = -L * 0.08; y > -L; y -= L * 0.11) {
          ctx.beginPath();
          ctx.moveTo(-W * 1.2, y);
          for (let x = -W; x <= W * 1.2; x += W * 0.4) ctx.lineTo(x, y + (Math.round(x / (W * 0.4)) % 2 ? L * 0.02 : -L * 0.02));
          ctx.stroke();
        }
      } else {
        ctx.lineWidth = Math.max(1, W * 0.28);
        for (const s of [-0.5, 0.5]) {
          ctx.beginPath();
          ctx.moveTo(s * W, 0);
          ctx.quadraticCurveTo(s * W * 1.2, -L * 0.5, 0, -L);
          ctx.stroke();
        }
      }
      break;
    }
    case 'veins':
    case 'glow': {
      if (look.variegation === 'glow') {
        ctx.shadowColor = vc(1);
        ctx.shadowBlur = Math.max(2, W * 0.5);
      }
      ctx.strokeStyle = vc(look.variegation === 'glow' ? 1 : 0.85);
      ctx.lineWidth = Math.max(0.8, W * 0.07);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -L * 0.95);
      for (let t = 0.14; t < 0.9; t += 0.13) {
        for (const s of [-1, 1]) {
          ctx.moveTo(0, -L * t);
          ctx.quadraticCurveTo(s * W * 0.5, -L * (t + 0.02), s * W * 1.05, -L * (t + 0.1));
        }
      }
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

interface LeafOpts {
  shape: LeafShape;
  L: number;
  W: number;
  dim?: number;
  bands?: boolean;
  midrib?: boolean;
}

/** A complete, shaded, variegated leaf at the current transform. */
function leaf(p: Paint, o: LeafOpts) {
  const { ctx, look } = p;
  const ruffle = look.ruffled ? 1 : 0;
  leafPath(ctx, o.shape, o.L, o.W, o.shape === 'oval' || o.shape === 'lance' ? ruffle : 0);
  ctx.fillStyle = leafFill(p, o.L, o.dim);
  ctx.fill();
  variegate(p, o.L, o.W, { bands: o.bands });
  leafPath(ctx, o.shape, o.L, o.W, o.shape === 'oval' || o.shape === 'lance' ? ruffle : 0);
  ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 20, 0.55);
  ctx.lineWidth = Math.max(0.6, o.W * 0.05);
  ctx.stroke();
  if (o.midrib !== false && look.variegation !== 'veins' && look.variegation !== 'glow') {
    ctx.strokeStyle = hsl(look.hue, look.sat - 10, look.light - 14, 0.45);
    ctx.lineWidth = Math.max(0.6, o.W * 0.07);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -o.L * 0.9);
    ctx.stroke();
  }
}

function withTransform(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, fn: () => void) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  fn();
  ctx.restore();
}

function stemColor(look: PlantLook, dl = 0): string {
  return hsl(look.hue, Math.max(10, look.sat - 12), Math.max(12, look.light - 10 + dl));
}

function stroke(ctx: CanvasRenderingContext2D, color: string, width: number, build: () => void) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  build();
  ctx.stroke();
}

// ------------------------------------------------------------ forms

function drawFern(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const n = Math.min(18, Math.round(4 + sf * 3.2));
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.abs(b - (n - 1) / 2) - Math.abs(a - (n - 1) / 2));
  for (const i of order) {
    const bend = -1 + (2 * (i + 0.5)) / n + (rand() - 0.5) * 0.25;
    const len = S * (0.8 + rand() * 0.35) * (1 - Math.abs(bend) * 0.12);
    const droop = Math.abs(bend) * len * 0.55;
    const x2 = bend * len * 0.85;
    const y2 = -len * 0.72 + droop;
    const cx = bend * len * 0.25;
    const cy = -len * 0.95;
    const dim = Math.abs(bend) < 0.4 ? 0 : 6;
    stroke(ctx, stemColor(look, -dim), Math.max(0.8, S * 0.018), () => {
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(cx, cy, x2, y2);
    });
    const step = look.ruffled ? 0.045 : 0.062;
    const path = new Path2D();
    const gold = new Path2D();
    let k = 0;
    for (let t = 0.1; t < 0.97; t += step, k++) {
      const mt = 1 - t;
      const px = 2 * mt * t * cx + t * t * x2;
      const py = 2 * mt * t * cy + t * t * y2;
      const tx = 2 * mt * cx + 2 * t * (x2 - cx);
      const ty = 2 * mt * cy + 2 * t * (y2 - cy);
      const ang = Math.atan2(ty, tx);
      const ll = len * 0.24 * (1 - t * 0.7) * (look.ruffled ? 1.15 : 1);
      const lw = ll * 0.38;
      const target = look.variegation === 'stripe' && k % 4 < 2 ? gold : path;
      for (const s of [-1, 1]) {
        const a = ang + s * 1.15;
        const ex = px + Math.cos(a) * ll;
        const ey = py + Math.sin(a) * ll;
        const nx = -Math.sin(a) * lw;
        const ny = Math.cos(a) * lw;
        target.moveTo(px, py);
        target.quadraticCurveTo((px + ex) / 2 + nx, (py + ey) / 2 + ny, ex, ey);
        target.quadraticCurveTo((px + ex) / 2 - nx, (py + ey) / 2 - ny, px, py);
      }
    }
    ctx.fillStyle = hsl(look.hue, look.sat, look.light - dim + (rand() - 0.5) * 6);
    ctx.fill(path);
    if (look.variegationColor) {
      const [vh, vs, vl] = look.variegationColor;
      ctx.fillStyle = hsl(vh, vs, vl - 8);
      ctx.fill(gold);
    }
  }
}

function petioleLeaves(p: Paint, opts: { n: number; spread: number; stemLen: [number, number]; L: [number, number]; widthK: number; shape: LeafShape; splits?: boolean }) {
  const { ctx, look, rand, S, sf } = p;
  const leaves = Array.from({ length: opts.n }, (_, i) => {
    const t = opts.n === 1 ? 0.5 : i / (opts.n - 1);
    const a = -Math.PI / 2 + (t - 0.5) * 2 * opts.spread + (rand() - 0.5) * 0.35;
    return { a, stem: S * (opts.stemLen[0] + rand() * (opts.stemLen[1] - opts.stemLen[0])), L: S * (opts.L[0] + rand() * (opts.L[1] - opts.L[0])) };
  });
  // Outer leaves first so the upright centre sits in front.
  leaves.sort((a, b) => Math.abs(b.a + Math.PI / 2) - Math.abs(a.a + Math.PI / 2));
  for (const lf of leaves) {
    const ex = Math.cos(lf.a) * lf.stem;
    const ey = Math.sin(lf.a) * lf.stem * 0.9;
    stroke(ctx, stemColor(look), Math.max(0.8, S * 0.022), () => {
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(ex * 0.3, ey * 0.8, ex, ey);
    });
    const W = lf.L * opts.widthK * (look.leafWidth ?? 1);
    // Leaves hang off the petiole, tipping outward and a little down.
    const tilt = lf.a + Math.PI / 2 + (lf.a + Math.PI / 2) * 0.6;
    withTransform(ctx, ex, ey, tilt, () => {
      leaf(p, { shape: opts.shape, L: lf.L, W, dim: Math.abs(lf.a + Math.PI / 2) > 0.8 ? 5 : 0 });
      if (opts.splits && sf >= 1.5) {
        // Fenestration: slits from the margin toward the midrib, and holes
        // once it's older. Drawn in deep shadow so they read as gaps.
        const gap = 'rgba(16,28,18,0.88)';
        const slits = Math.min(5, 1 + Math.floor((sf - 1.5) * 2));
        ctx.strokeStyle = gap;
        ctx.lineWidth = Math.max(1, W * 0.09);
        ctx.lineCap = 'round';
        for (let k = 0; k < slits; k++) {
          const t = 0.2 + (k / Math.max(1, slits)) * 0.62;
          for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(s * W * 1.02 * Math.sin(Math.PI * t), -lf.L * t);
            ctx.lineTo(s * W * 0.32, -lf.L * (t + 0.05));
            ctx.stroke();
          }
        }
        if (sf >= 2.6) {
          ctx.fillStyle = gap;
          for (let k = 0; k < 3; k++) {
            for (const s of [-1, 1]) {
              ctx.beginPath();
              ctx.ellipse(s * W * 0.2, -lf.L * (0.3 + k * 0.18), W * 0.06, lf.L * 0.035, 0, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
    });
  }
}

function drawSplitleaf(p: Paint) {
  const n = Math.min(8, Math.round(1 + p.sf * 1.6));
  petioleLeaves(p, { n, spread: 1.15, stemLen: [0.25, 0.5], L: [0.45, 0.6], widthK: 0.52, shape: 'heart', splits: true });
}

function drawHeart(p: Paint) {
  const n = Math.min(14, Math.round(2 + p.sf * 2.3));
  petioleLeaves(p, { n, spread: 1.3, stemLen: [0.12, 0.42], L: [0.3, 0.42], widthK: 0.48, shape: 'heart' });
}

function drawPatterned(p: Paint) {
  const n = Math.min(14, Math.round(3 + p.sf * 2.2));
  petioleLeaves(p, { n, spread: 1.35, stemLen: [0.08, 0.3], L: [0.34, 0.46], widthK: 0.36, shape: 'oval' });
  if (p.look.flowers && p.sf >= 2.4) drawSprays(p, Math.floor(p.sf - 1.5));
}

function drawSprays(p: Paint, count: number) {
  const { ctx, look, rand, S } = p;
  for (let i = 0; i < count; i++) {
    const x = (rand() - 0.5) * S * 0.5;
    const top = -S * (0.65 + rand() * 0.25);
    stroke(ctx, stemColor(look, 8), Math.max(0.7, S * 0.012), () => {
      ctx.moveTo(x * 0.3, 0);
      ctx.quadraticCurveTo(x, top * 0.5, x, top);
    });
    ctx.fillStyle = hsl(look.accentHue, look.accentSat ?? 60, look.accentLight ?? 70);
    for (let k = 0; k < 7; k++) {
      ctx.beginPath();
      ctx.arc(x + (rand() - 0.5) * S * 0.08, top + k * S * 0.03, S * 0.022, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawTrailing(p: Paint) {
  const { ctx, look, rand, S, sf, mode } = p;
  const leafL = S * 0.2;
  const vineN = Math.min(9, Math.round(2 + sf * 1.6));
  const vines: { pts: [number, number][] }[] = [];
  for (let i = 0; i < vineN; i++) {
    const len = S * (0.45 + sf * 0.28) * (0.7 + rand() * 0.45) * (mode === 'hanging' ? 1.35 : 1);
    const pts: [number, number][] = [];
    if (mode === 'ground') {
      const a = rand() * Math.PI * 2;
      const wob = (rand() - 0.5) * 1.2;
      for (let t = 0; t <= 1.001; t += 0.1) {
        const aa = a + Math.sin(t * 3) * wob * 0.4;
        pts.push([Math.cos(aa) * len * t, Math.sin(aa) * len * t * 0.55 + S * 0.02]);
      }
    } else {
      const side = i % 2 === 0 ? -1 : 1;
      const sx = side * S * (0.12 + rand() * 0.16);
      const out = side * S * (0.05 + rand() * 0.2);
      for (let t = 0; t <= 1.001; t += 0.1) {
        pts.push([sx + out * Math.sin(t * Math.PI * 0.8) + Math.sin(t * 5 + i) * S * 0.03, -S * 0.02 + len * t]);
      }
    }
    vines.push({ pts });
  }
  const drawVines = () => {
    for (const v of vines) {
      stroke(ctx, stemColor(look, -4), Math.max(0.8, S * 0.016), () => {
        ctx.moveTo(v.pts[0][0], v.pts[0][1]);
        for (const [x, y] of v.pts) ctx.lineTo(x, y);
      });
      for (let k = 1; k < v.pts.length; k++) {
        const [x, y] = v.pts[k];
        const [px, py] = v.pts[k - 1];
        const along = Math.atan2(y - py, x - px);
        const side = k % 2 === 0 ? 1 : -1;
        const sz = leafL * (1 - k * 0.04) * (0.8 + rand() * 0.3);
        withTransform(ctx, x, y, along + Math.PI / 2 + side * 1.1, () => leaf(p, { shape: 'heart', L: sz, W: sz * 0.5 * (look.leafWidth ?? 1), dim: 4 }));
      }
      if (look.flowers && sf >= 3 && v.pts.length > 6) drawStarCluster(p, v.pts[6][0], v.pts[6][1]);
    }
  };
  const drawMound = () => {
    const mound = Math.min(10, Math.round(3 + sf * 1.6));
    for (let i = 0; i < mound; i++) {
      const a = -Math.PI / 2 + (rand() - 0.5) * 2.4;
      const r = S * (0.05 + rand() * 0.14);
      const sz = leafL * (1 + rand() * 0.3);
      withTransform(ctx, Math.cos(a) * r, Math.sin(a) * r * 0.8 - S * 0.04, a + Math.PI / 2 + (rand() - 0.5) * 0.6, () =>
        leaf(p, { shape: 'heart', L: sz, W: sz * 0.5 * (look.leafWidth ?? 1) })
      );
    }
  };
  if (mode === 'ground') {
    drawVines();
    drawMound();
  } else {
    drawMound();
    drawVines();
  }
}

function drawStarCluster(p: Paint, x: number, y: number) {
  const { ctx, look, S } = p;
  ctx.fillStyle = hsl(look.accentHue, look.accentSat ?? 55, look.accentLight ?? 82);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const cx = x + Math.cos(a) * S * 0.045;
    const cy = y + Math.sin(a) * S * 0.035;
    ctx.beginPath();
    for (let j = 0; j < 5; j++) {
      const aa = (j / 5) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(cx + Math.cos(aa) * S * 0.025, cy + Math.sin(aa) * S * 0.025);
      ctx.lineTo(cx + Math.cos(aa + Math.PI / 5) * S * 0.01, cy + Math.sin(aa + Math.PI / 5) * S * 0.01);
    }
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(160,40,60,0.8)';
  ctx.beginPath();
  ctx.arc(x, y, S * 0.012, 0, Math.PI * 2);
  ctx.fill();
}

/** A ribbon leaf following a curve, tapering to a point. */
function ribbon(p: Paint, dir: number, len: number, width: number, upright: number, dim: number) {
  const { ctx, look, rand } = p;
  const cx = dir * len * (0.3 + (1 - upright) * 0.35);
  const cy = -len * (0.75 + upright * 0.35);
  const ex = dir * len * (0.45 + (1 - upright) * 0.6);
  const ey = -len * (0.15 + upright * 0.8);
  const n = 16;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  const mid: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const mt = 1 - t;
    const x = 2 * mt * t * cx + t * t * ex;
    const y = 2 * mt * t * cy + t * t * ey;
    const tx = 2 * mt * cx + 2 * t * (ex - cx);
    const ty = 2 * mt * cy + 2 * t * (ey - cy);
    const l = Math.hypot(tx, ty) || 1;
    let w = width * (1 - t * 0.85);
    if (look.ruffled) w *= 1 + Math.sin(t * 22) * 0.25;
    left.push([x - (ty / l) * w, y + (tx / l) * w]);
    right.push([x + (ty / l) * w, y - (tx / l) * w]);
    mid.push([x, y]);
  }
  const build = () => {
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (const [x, y] of left) ctx.lineTo(x, y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
  };
  build();
  ctx.fillStyle = hsl(look.hue, look.sat, look.light - dim + (rand() - 0.5) * 6);
  ctx.fill();
  if (look.variegationColor && (look.variegation === 'stripe' || look.variegation === 'edge')) {
    const [vh, vs, vl] = look.variegationColor;
    ctx.save();
    build();
    ctx.clip();
    ctx.strokeStyle = hsl(vh, vs, vl, 0.95);
    if (look.variegation === 'stripe') {
      ctx.lineWidth = width * 0.7;
      ctx.beginPath();
      mid.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    } else {
      ctx.lineWidth = width * 0.55;
      build();
      ctx.stroke();
    }
    ctx.restore();
  }
  build();
  ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 22, 0.5);
  ctx.lineWidth = Math.max(0.5, width * 0.12);
  ctx.stroke();
}

function drawStrappy(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const wide = (look.leafWidth ?? 1) > 1.4;
  const n = wide ? Math.min(12, Math.round(3 + sf * 2)) : Math.min(26, Math.round(5 + sf * 4));
  const blades = Array.from({ length: n }, (_, i) => ({
    dir: (i % 2 === 0 ? -1 : 1) * (0.2 + rand() * 0.8),
    len: S * (wide ? 0.75 + rand() * 0.3 : 0.7 + rand() * 0.4),
    up: wide ? 0.6 + rand() * 0.35 : 0.35 + rand() * 0.55,
  })).sort((a, b) => a.up - b.up);
  for (const b of blades) ribbon(p, b.dir, b.len, S * (wide ? 0.085 : 0.045) * (look.leafWidth ?? 1) * (wide ? 0.6 : 1), b.up, b.up < 0.4 ? 6 : 0);
  if (!wide && sf >= 3) {
    // Runners with baby plantlets dangling off the ends.
    const runners = Math.min(4, Math.floor(sf - 1.5));
    for (let i = 0; i < runners; i++) {
      const dir = i % 2 === 0 ? -1 : 1;
      const ex = dir * S * (0.7 + rand() * 0.3);
      const ey = -S * 0.05 + (p.mode === 'ground' ? 0 : S * 0.3);
      stroke(ctx, hsl(look.accentHue, 30, 70), Math.max(0.6, S * 0.01), () => {
        ctx.moveTo(0, -S * 0.1);
        ctx.quadraticCurveTo(dir * S * 0.45, -S * 0.55, ex, ey);
      });
      ctx.save();
      ctx.translate(ex, ey);
      for (let k = 0; k < 5; k++) ribbon({ ...p, S: S * 0.3 }, (k % 2 ? 1 : -1) * (0.3 + rand() * 0.6), S * 0.14, S * 0.012, 0.3 + rand() * 0.4, 0);
      ctx.restore();
    }
  }
  if (wide) {
    // Fuzzy nest at the heart of a bird's nest fern.
    ctx.fillStyle = hsl(30, 35, 25);
    ctx.beginPath();
    ctx.ellipse(0, -S * 0.03, S * 0.09, S * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSpear(p: Paint) {
  const { look, rand, S, sf } = p;
  if ((look.leafWidth ?? 1) >= 1.15) return drawLadder(p);
  const n = Math.min(13, Math.round(2 + sf * 2.2));
  const blades = Array.from({ length: n }, (_, i) => ({ x: (rand() - 0.5) * S * 0.28, a: (rand() - 0.5) * 0.7, h: S * (0.55 + rand() * 0.45) * (i === 0 ? 1.1 : 1) })).sort(
    (a, b) => Math.abs(b.a) - Math.abs(a.a)
  );
  for (const b of blades) {
    withTransform(p.ctx, b.x, 0, b.a, () => leaf(p, { shape: 'spear', L: b.h, W: S * 0.07, bands: look.variegation === 'stripe', midrib: false, dim: Math.abs(b.a) > 0.25 ? 5 : 0 }));
  }
}

function drawLadder(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const n = Math.min(10, Math.round(2 + sf * 1.7));
  for (let i = 0; i < n; i++) {
    const a = (rand() - 0.5) * 1.0;
    const h = S * (0.5 + rand() * 0.45);
    withTransform(ctx, (rand() - 0.5) * S * 0.15, 0, a, () => {
      stroke(ctx, stemColor(look, -6), Math.max(1, S * 0.03), () => {
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -h);
      });
      for (let t = 0.3; t <= 1.0; t += 0.12) {
        for (const s of [-1, 1]) {
          withTransform(ctx, 0, -h * t, s * (0.9 - t * 0.3), () => leaf(p, { shape: 'oval', L: S * 0.13, W: S * 0.045 }));
        }
      }
      withTransform(ctx, 0, -h, 0, () => leaf(p, { shape: 'oval', L: S * 0.13, W: S * 0.045 }));
    });
  }
}

function rosette(p: Paint, cx: number, cy: number, R: number, layers: number) {
  const { ctx, look, rand } = p;
  for (let layer = 0; layer < layers; layer++) {
    const t = layer / Math.max(1, layers);
    const count = 7 + (layer % 2);
    const L = R * (1 - t * 0.55);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + layer * 0.4 + rand() * 0.1;
      withTransform(ctx, cx, cy, a + Math.PI / 2, () => {
        ctx.scale(1, 0.62);
        leaf(p, { shape: 'succulent', L, W: L * 0.36, dim: (layers - layer) * 3, midrib: false });
        // Blushing tips.
        ctx.fillStyle = hsl(look.accentHue, look.accentSat ?? 45, look.accentLight ?? 70, 0.7);
        ctx.beginPath();
        ctx.arc(0, -L * 0.93, L * 0.07, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
  ctx.fillStyle = hsl(look.hue, look.sat, look.light + 10);
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

function drawRosette(p: Paint) {
  const { look, rand, S, sf } = p;
  if (look.ruffled) {
    // Cristata: the growing point smeared into a wavy crest.
    const segs = Math.round(4 + sf * 3);
    for (let i = 0; i < segs; i++) {
      const t = i / Math.max(1, segs - 1) - 0.5;
      rosette(p, t * S * 1.1, -S * 0.14 - Math.sin(t * 6) * S * 0.1, S * 0.28, 2);
    }
    return;
  }
  const pups = sf >= 2 ? Math.min(6, Math.floor((sf - 1.5) * 2)) : 0;
  for (let i = 0; i < pups; i++) {
    const a = (i / Math.max(1, pups)) * Math.PI * 2 + rand();
    rosette(p, Math.cos(a) * S * 0.55, Math.sin(a) * S * 0.25 - S * 0.05, S * (0.2 + rand() * 0.08), 2);
  }
  rosette(p, 0, -S * 0.12, S * 0.52, 2 + Math.floor(sf / 1.5));
}

function drawCoin(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const n = Math.min(16, Math.round(3 + sf * 3));
  const trunk = S * (0.1 + sf * 0.06);
  stroke(ctx, stemColor(look, -4), Math.max(1, S * 0.035), () => {
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -trunk);
  });
  const leaves = Array.from({ length: n }, () => ({ a: -Math.PI / 2 + (rand() - 0.5) * 2.7, len: S * (0.25 + rand() * 0.3), r: S * (0.1 + rand() * 0.06) })).sort(
    (a, b) => Math.sin(a.a) - Math.sin(b.a)
  );
  for (const lf of leaves) {
    const ex = Math.cos(lf.a) * lf.len;
    const ey = -trunk + Math.sin(lf.a) * lf.len * 0.85;
    stroke(ctx, stemColor(look, 4), Math.max(0.6, S * 0.012), () => {
      ctx.moveTo(0, -trunk);
      ctx.quadraticCurveTo(ex * 0.5, -trunk + (ey + trunk) * 0.2 - S * 0.08, ex, ey);
    });
    ctx.save();
    ctx.translate(ex, ey);
    ctx.scale(1, 0.8);
    ctx.beginPath();
    ctx.arc(0, 0, lf.r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(-lf.r * 0.3, -lf.r * 0.3, 0, 0, 0, lf.r);
    g.addColorStop(0, hsl(look.hue, look.sat, look.light + 9));
    g.addColorStop(1, hsl(look.hue, look.sat, look.light - 6));
    ctx.fillStyle = g;
    ctx.fill();
    variegate(p, lf.r * 2, lf.r);
    ctx.beginPath();
    ctx.arc(0, 0, lf.r, 0, Math.PI * 2);
    ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 20, 0.5);
    ctx.lineWidth = Math.max(0.5, lf.r * 0.08);
    ctx.stroke();
    ctx.fillStyle = hsl(look.hue, look.sat, look.light - 16, 0.6);
    ctx.beginPath();
    ctx.arc(0, 0, lf.r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawBeads(p: Paint) {
  const { ctx, look, rand, S, sf, mode } = p;
  const strands = Math.min(12, Math.round(3 + sf * 2));
  const r = S * 0.036;
  const beads: [number, number][] = [];
  for (let i = 0; i < strands; i++) {
    const len = S * (0.35 + sf * 0.22) * (0.7 + rand() * 0.5) * (mode === 'hanging' ? 1.4 : 1);
    const a = rand() * Math.PI * 2;
    const side = i % 2 === 0 ? -1 : 1;
    const pts: [number, number][] = [];
    for (let d = 0; d <= len; d += r * 2.1) {
      const t = d / len;
      if (mode === 'ground') pts.push([Math.cos(a + Math.sin(t * 4) * 0.3) * d, Math.sin(a) * d * 0.5 + S * 0.02]);
      else pts.push([side * S * 0.15 + side * Math.sin(t * 2) * S * 0.12 + Math.sin(t * 7 + i) * S * 0.02, d - S * 0.03]);
    }
    stroke(ctx, stemColor(look, 10), Math.max(0.5, S * 0.008), () => pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))));
    beads.push(...pts);
  }
  for (let i = 0; i < 6 + sf * 3; i++) beads.push([(rand() - 0.5) * S * 0.3, -rand() * S * 0.15]);
  for (const [x, y] of beads) {
    const pink = look.variegation === 'splash' && rand() < 0.35;
    const [vh, vs, vl] = look.variegationColor ?? [0, 0, 0];
    ctx.fillStyle = pink ? hsl(vh, vs, vl) : hsl(look.hue, look.sat, look.light + (rand() - 0.5) * 8);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBloom(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const n = Math.min(14, Math.round(3 + sf * 2.4));
  const leaves = Array.from({ length: n }, () => ({ a: (rand() - 0.5) * 1.6, L: S * (0.42 + rand() * 0.22) })).sort((a, b) => Math.abs(b.a) - Math.abs(a.a));
  for (const lf of leaves) {
    withTransform(ctx, 0, 0, lf.a, () => leaf(p, { shape: 'lance', L: lf.L, W: lf.L * 0.2, dim: Math.abs(lf.a) > 0.5 ? 5 : 0 }));
  }
  if (!look.flowers || sf < 1.8) return;
  const flowers = Math.min(7, Math.floor((sf - 1.2) * 1.8));
  for (let i = 0; i < flowers; i++) {
    const x = (rand() - 0.5) * S * 0.45;
    const top = -S * (0.72 + rand() * 0.22);
    stroke(ctx, stemColor(look, 6), Math.max(0.7, S * 0.014), () => {
      ctx.moveTo(x * 0.2, 0);
      ctx.quadraticCurveTo(x * 0.8, top * 0.6, x, top);
    });
    withTransform(ctx, x, top + S * 0.02, (rand() - 0.5) * 0.4, () => {
      ctx.fillStyle = hsl(look.accentHue, look.accentSat ?? 20, look.accentLight ?? 95);
      leafPath(ctx, 'oval', S * 0.2, S * 0.08, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = hsl(52, 70, 70);
      ctx.beginPath();
      ctx.ellipse(0, -S * 0.08, S * 0.016, S * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

// ------------------------------------------------------------ cacti & succulents

function spineColor(look: PlantLook, a = 1): string {
  const [h, s, l] = look.spines ?? [50, 30, 88];
  return hsl(h, s, l, a);
}

/** A woolly areole at (x, y) with a tuft of spines (none when len is 0). */
function areole(p: Paint, x: number, y: number, len: number, dot: number) {
  const { ctx, look, rand } = p;
  ctx.fillStyle = spineColor(look, 0.95);
  ctx.beginPath();
  ctx.arc(x, y, dot, 0, Math.PI * 2);
  ctx.fill();
  if (len <= 0) return;
  ctx.strokeStyle = spineColor(look, 0.8);
  ctx.lineWidth = Math.max(0.35, len * 0.08);
  ctx.lineCap = 'round';
  ctx.beginPath();
  const n = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len * 0.75);
  }
  ctx.stroke();
}

function cactusFlower(p: Paint, x: number, y: number, r: number) {
  const { ctx, look } = p;
  const petal = hsl(look.accentHue, look.accentSat ?? 75, look.accentLight ?? 64);
  for (let i = 0; i < 8; i++) {
    const a = (i / 7 - 0.5) * 2.4;
    withTransform(ctx, x, y, a, () => {
      ctx.fillStyle = petal;
      leafPath(ctx, 'lance', r * 1.3, r * 0.34, 0);
      ctx.fill();
    });
  }
  ctx.fillStyle = hsl(52, 80, 72);
  ctx.beginPath();
  ctx.arc(x, y - r * 0.25, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

function columnPath(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(-w * 0.92, 0);
  ctx.lineTo(-w, -h + w);
  ctx.bezierCurveTo(-w, -h - w * 0.28, w, -h - w * 0.28, w, -h + w);
  ctx.lineTo(w * 0.92, 0);
  ctx.closePath();
}

/** One ribbed, spined cactus stem of half-width w and height h, rising from (0,0). */
function cactusColumn(p: Paint, w: number, h: number, ribs: number) {
  const { ctx, look, rand } = p;
  columnPath(ctx, w, h);
  const g = ctx.createLinearGradient(-w, 0, w, 0);
  g.addColorStop(0, hsl(look.hue, look.sat - 6, look.light - 12));
  g.addColorStop(0.38, hsl(look.hue, look.sat, look.light + 6));
  g.addColorStop(1, hsl(look.hue, look.sat - 4, look.light - 14));
  ctx.fillStyle = g;
  ctx.fill();
  variegate(p, h, w);
  // Ribs are meridians seen side-on, so they bunch up toward the edges.
  const ribX = (t: number) => Math.sin((t - 0.5) * Math.PI) * w * 0.92;
  for (let j = 0; j < ribs; j++) {
    const x = ribX((j + 0.5) / ribs);
    stroke(ctx, hsl(look.hue, look.sat, look.light - 18, 0.5), Math.max(0.5, w * 0.06), () => {
      ctx.moveTo(x * 0.92, 0);
      ctx.lineTo(x, -h + w);
      ctx.quadraticCurveTo(x, -h + w * 0.1, x * 0.2, -h + w * 0.05);
    });
  }
  const spine = look.spineLength ?? 1;
  for (let j = 1; j < ribs; j++) {
    const x = ribX(j / ribs);
    const face = 1 - Math.abs(x / w) * 0.5;
    for (let y = w * 0.4; y < h - w * 0.3; y += w * 0.55) {
      areole(p, x, -y, w * 0.34 * spine * face, Math.max(0.4, w * 0.06));
    }
  }
  columnPath(ctx, w, h);
  ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 24, 0.6);
  ctx.lineWidth = Math.max(0.5, w * 0.05);
  ctx.stroke();
  if (look.hairy) {
    ctx.strokeStyle = spineColor(look, 0.8);
    ctx.lineWidth = Math.max(0.4, w * 0.05);
    ctx.lineCap = 'round';
    const n = Math.round((h / w) * 7);
    for (let i = 0; i < n; i++) {
      const x = (rand() - 0.5) * w * 2;
      const y = -w * 0.2 - rand() * (h - w * 0.2);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + (rand() - 0.5) * w, y + w * 0.5, x + (rand() - 0.5) * w * 1.4, y + w, x + (rand() - 0.5) * w * 1.2, y + w * (1.1 + rand()));
      ctx.stroke();
    }
    ctx.fillStyle = spineColor(look, 0.7);
    ctx.beginPath();
    ctx.ellipse(0, -h + w * 0.1, w * 0.75, w * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawColumn(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const n = Math.min(7, 1 + Math.floor(sf * 1.4));
  const stems = Array.from({ length: n }, (_, i) => ({
    x: i === 0 ? 0 : (rand() - 0.5) * S * 0.62,
    h: S * (i === 0 ? 1.0 : 0.4 + rand() * 0.5),
    w: S * (0.1 + rand() * 0.025) * (look.leafWidth ?? 1),
    arm: rand(),
    flower: rand(),
  })).sort((a, b) => b.h - a.h);
  for (const s of stems) {
    withTransform(ctx, s.x, 0, (s.x / S) * 0.25, () => {
      // Older, taller stems throw out an elbowed arm, drawn behind the stem.
      if (sf >= 2.6 && s.h > S * 0.7 && s.arm < 0.6) {
        const side = s.arm < 0.3 ? -1 : 1;
        const ay = -s.h * (0.35 + s.arm * 0.3);
        const aw = s.w * 0.72;
        withTransform(ctx, side * s.w * 0.5, ay, (side * Math.PI) / 2, () => cactusColumn(p, aw, s.w * 1.5, 3));
        withTransform(ctx, side * s.w * 1.75, ay + aw * 0.9, 0, () => cactusColumn(p, aw, s.h * 0.42, 4));
      }
      cactusColumn(p, s.w, s.h, 5);
      if (look.flowers && sf >= 2.4 && s.flower < 0.6) cactusFlower(p, 0, -s.h - s.w * 0.1, s.w * 0.9);
    });
  }
}

/** A ribbed ball cactus of radius R sitting on (cx, cy). */
function cactusGlobe(p: Paint, cx: number, cy: number, R: number, ribs: number) {
  const { ctx, look } = p;
  const ry = R * 0.9;
  withTransform(ctx, cx, cy, 0, () => {
    const body = () => {
      ctx.beginPath();
      ctx.ellipse(0, -ry, R, ry, 0, 0, Math.PI * 2);
    };
    body();
    const g = ctx.createRadialGradient(-R * 0.35, -ry * 1.4, R * 0.1, 0, -ry, R * 1.05);
    g.addColorStop(0, hsl(look.hue, look.sat, look.light + 10));
    g.addColorStop(0.7, hsl(look.hue, look.sat, look.light - 2));
    g.addColorStop(1, hsl(look.hue, look.sat - 6, look.light - 16));
    ctx.fillStyle = g;
    ctx.fill();
    body();
    variegate(p, ry * 2, R);
    const meridian = (t: number, phi: number): [number, number] => [R * t * Math.cos(phi), -ry - ry * Math.sin(phi)];
    for (let j = 0; j < ribs; j++) {
      const t = Math.sin(((j + 0.5) / ribs - 0.5) * Math.PI);
      stroke(ctx, hsl(look.hue, look.sat, look.light - 18, 0.5), Math.max(0.5, R * 0.025), () => {
        for (let k = 0; k <= 12; k++) {
          const [x, y] = meridian(t, -Math.PI / 2 + (k / 12) * Math.PI);
          if (k) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
      });
    }
    const spine = look.spineLength ?? 1;
    for (let j = 1; j < ribs; j++) {
      const t = Math.sin((j / ribs - 0.5) * Math.PI);
      for (let phi = -0.9; phi < 1.35; phi += 0.32) {
        const [x, y] = meridian(t, phi);
        areole(p, x, y, R * 0.24 * spine * (1 - Math.abs(t) * 0.4), Math.max(0.4, R * 0.035));
      }
    }
    body();
    ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 24, 0.6);
    ctx.lineWidth = Math.max(0.5, R * 0.025);
    ctx.stroke();
    if (look.spines && spine > 0) {
      // The woolly crown where new spines come from.
      ctx.fillStyle = spineColor(look, 0.6);
      ctx.beginPath();
      ctx.ellipse(0, -ry * 1.92, R * 0.2, R * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawGlobe(p: Paint) {
  const { look, rand, S, sf } = p;
  const R = S * 0.36 * (look.leafWidth ?? 1);
  if (look.grafted) {
    // A plain green rootstock with the bright, chlorophyll-less ball perched on top.
    const stock: PlantLook = { ...look, hue: 115, sat: 40, light: 36, variegation: 'none', spines: [50, 20, 80], spineLength: 0.5, flowers: false };
    const sh = S * (0.3 + Math.min(sf, 4) * 0.07);
    cactusColumn({ ...p, look: stock }, S * 0.085, sh, 3);
    cactusGlobe(p, 0, -sh + S * 0.06, R * 0.62, 9);
    if (look.flowers && sf >= 2.6) cactusFlower(p, 0, -sh - R * 1.05, R * 0.2);
    return;
  }
  const pups = sf >= 2.2 ? Math.min(5, Math.floor((sf - 1.8) * 2)) : 0;
  const around = Array.from({ length: pups }, (_, i) => {
    const a = (i / Math.max(1, pups)) * Math.PI * 2 + rand();
    return { x: Math.cos(a) * R * 1.15, y: Math.sin(a) * R * 0.3, r: R * (0.3 + rand() * 0.15) };
  });
  for (const b of around.filter((b) => b.y < 0)) cactusGlobe(p, b.x, b.y, b.r, 8);
  cactusGlobe(p, 0, 0, R, 12);
  for (const b of around.filter((b) => b.y >= 0)) cactusGlobe(p, b.x, b.y, b.r, 8);
  if (look.flowers && sf >= 2.6) {
    const k = Math.min(4, Math.floor(sf - 1.5));
    for (let i = 0; i < k; i++) cactusFlower(p, (i - (k - 1) / 2) * R * 0.3, -R * 1.7, R * 0.17);
  }
}

/** One flat pad of half-width w and height h, standing on (0,0). */
function cactusPad(p: Paint, w: number, h: number) {
  const { ctx, look } = p;
  const ry = h / 2;
  const body = () => {
    ctx.beginPath();
    ctx.ellipse(0, -ry, w, ry, 0, 0, Math.PI * 2);
  };
  body();
  const g = ctx.createRadialGradient(-w * 0.3, -ry * 1.3, w * 0.1, 0, -ry, ry * 1.1);
  g.addColorStop(0, hsl(look.hue, look.sat, look.light + 9));
  g.addColorStop(1, hsl(look.hue, look.sat - 4, look.light - 10));
  ctx.fillStyle = g;
  ctx.fill();
  body();
  variegate(p, h, w);
  body();
  ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 22, 0.55);
  ctx.lineWidth = Math.max(0.5, w * 0.05);
  ctx.stroke();
  const spine = look.spineLength ?? 1;
  let row = 0;
  for (let y = -h * 0.12; y > -h * 0.92; y -= h * 0.15, row++) {
    for (let x = -w + (row % 2) * w * 0.28; x < w; x += w * 0.56) {
      const nx = x / w;
      const ny = (y + ry) / ry;
      if (nx * nx + ny * ny < 0.72) areole(p, x, y, w * 0.2 * spine, Math.max(0.5, w * 0.07));
    }
  }
}

function drawPaddle(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const pw = S * 0.19 * (look.leafWidth ?? 1);
  const ph = S * 0.3;
  const n = Math.min(13, 1 + Math.round(sf * 2.6));
  const pads = [{ x: 0, y: 0, a: (rand() - 0.5) * 0.2, k: 1, depth: 0 }];
  while (pads.length < n) {
    const parent = pads[Math.floor(rand() * pads.length)];
    if (parent.depth >= 3) continue;
    const side = rand() < 0.5 ? -1 : 1;
    const rim = parent.a + side * (0.25 + rand() * 0.35);
    const top = ph * parent.k * 0.9;
    pads.push({
      x: parent.x + Math.sin(rim) * top,
      y: parent.y - Math.cos(rim) * top,
      a: Math.max(-1.3, Math.min(1.3, parent.a + side * (0.35 + rand() * 0.55))),
      k: parent.k * (0.76 + rand() * 0.12),
      depth: parent.depth + 1,
    });
  }
  for (const pad of pads) withTransform(ctx, pad.x, pad.y, pad.a, () => cactusPad(p, pw * pad.k, ph * pad.k));
  if (look.flowers && sf >= 3) {
    for (const pad of pads.filter((q) => q.depth >= 2).slice(0, 4)) {
      withTransform(ctx, pad.x, pad.y, pad.a, () => cactusFlower(p, 0, -ph * pad.k * 0.98, pw * pad.k * 0.45));
    }
  }
}

function drawJade(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  // Young stems are green; older wood browns and thickens.
  const age = Math.min(1, sf / 3.5);
  const bark = hsl(look.hue + (28 - look.hue) * age, 22 + (1 - age) * 10, 30 + (1 - age) * 6);
  const tips: [number, number, number][] = [];
  const branch = (x: number, y: number, a: number, len: number, width: number, depth: number) => {
    const ex = x + Math.sin(a) * len;
    const ey = y - Math.cos(a) * len;
    stroke(ctx, bark, width, () => {
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.sin(a) * len * 0.5 + (rand() - 0.5) * len * 0.25, y - Math.cos(a) * len * 0.5, ex, ey);
    });
    if (depth <= 0) {
      tips.push([ex, ey, a]);
      return;
    }
    const kids = rand() < 0.3 ? 3 : 2;
    for (let k = 0; k < kids; k++) branch(ex, ey, a + (k - (kids - 1) / 2) * (0.55 + rand() * 0.3), len * (0.62 + rand() * 0.15), width * 0.68, depth - 1);
  };
  const depth = sf < 1 ? 0 : sf < 2.2 ? 1 : sf < 3.4 ? 2 : 3;
  branch(0, 0, (rand() - 0.5) * 0.15, S * (0.18 + Math.min(sf, 4) * 0.06), Math.max(1, S * (0.035 + Math.min(sf, 4) * 0.012)), depth);
  const narrow = (look.leafWidth ?? 1) < 0.7;
  for (const [x, y, a] of tips) {
    const n = 4 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const L = S * (0.12 + rand() * 0.05);
      withTransform(ctx, x, y, a + (i / (n - 1) - 0.5) * 2.4, () => {
        leaf(p, { shape: 'succulent', L, W: L * 0.44 * (look.leafWidth ?? 1), midrib: false, dim: i % 2 ? 4 : 0 });
        // Gollum's tube leaves end in a little red suction cup; the rest just blush.
        ctx.fillStyle = hsl(look.accentHue, look.accentSat ?? 55, look.accentLight ?? 50, narrow ? 0.85 : 0.35);
        ctx.beginPath();
        ctx.ellipse(0, -L * 0.94, L * (narrow ? 0.12 : 0.1), L * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
}

function drawFig(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  // A cutting is a green stem with a leaf or two; with age the stem browns
  // into a trunk, grows taller, and a big plant throws out a side branch.
  const age = Math.min(1, sf / 3);
  // Turn toward bark brown the short way round the colour wheel (a burgundy stem shouldn't pass through blue).
  const dh = ((30 - look.hue + 540) % 360) - 180;
  const bark = hsl(look.hue + dh * age, 20 + (1 - age) * 14, 30 + (1 - age) * 8);
  const H = S * (0.42 + Math.min(sf, 4.6) * 0.3);
  const lean = (rand() - 0.5) * 0.12;
  const trunkW = Math.max(1, S * (0.035 + Math.min(sf, 4) * 0.012));
  const at = (t: number) => ({ x: Math.sin(lean) * H * t + Math.sin(t * Math.PI) * S * 0.04, y: -H * t });
  stroke(ctx, bark, trunkW, () => {
    ctx.moveTo(0, 0);
    for (let i = 1; i <= 8; i++) {
      const q = at(i / 8);
      ctx.lineTo(q.x, q.y);
    }
  });
  // Stems that carry leaves: the trunk, plus a branch or two on a big plant.
  const stems: { from: number; to: number; x0: number; y0: number; a: number; len: number }[] = [];
  const tip = at(1);
  stems.push({ from: 0.3, to: 1, x0: 0, y0: 0, a: lean, len: H });
  const branches = sf >= 3.2 ? (sf >= 4 ? 2 : 1) : 0;
  for (let b = 0; b < branches; b++) {
    const t = 0.5 + b * 0.14 + rand() * 0.06;
    const o = at(t);
    const side = b % 2 === 0 ? 1 : -1;
    const a = lean + side * (0.55 + rand() * 0.25);
    const len = H * (0.34 + rand() * 0.08);
    stroke(ctx, bark, trunkW * 0.62, () => {
      ctx.moveTo(o.x, o.y);
      ctx.quadraticCurveTo(o.x + Math.sin(a) * len * 0.4, o.y - len * 0.35, o.x + Math.sin(a) * len, o.y - Math.cos(a) * len);
    });
    stems.push({ from: 0.35, to: 1, x0: o.x, y0: o.y, a, len });
  }
  const fiddle = !!look.fiddle;
  const wide = look.leafWidth ?? 1;
  const baseL = S * (fiddle ? 0.5 : 0.44) * (0.8 + Math.min(sf, 3) * 0.07);
  const drawLeafAt = (x: number, y: number, a: number, L: number, dim: number) =>
    withTransform(ctx, x, y, a, () => {
      // A short stalk, then the leaf.
      stroke(ctx, stemColor(look, -4), Math.max(0.6, L * 0.04), () => {
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -L * 0.12);
      });
      ctx.translate(0, -L * 0.1);
      leaf(p, { shape: fiddle ? 'fiddle' : 'oval', L, W: L * (fiddle ? 0.5 : 0.34) * wide, dim });
    });
  for (const st of stems) {
    const n = Math.max(1, Math.round((st === stems[0] ? 1.5 : 1) + Math.min(sf, 4.6) * (st === stems[0] ? 1.2 : 0.7)));
    for (let i = 0; i < n; i++) {
      // Leaves alternate up the stem, lower ones wider and drooping, upper ones lifting.
      const t = st.from + (st.to - st.from) * (n === 1 ? 1 : i / (n - 1));
      const x = st.x0 + Math.sin(st.a) * st.len * t;
      const y = st.y0 - Math.cos(st.a) * st.len * t;
      const side = i % 2 === 0 ? 1 : -1;
      const spread = (1.25 - t * 0.7) * (0.85 + rand() * 0.3);
      const L = baseL * (1.05 - t * 0.25) * (0.88 + rand() * 0.2);
      drawLeafAt(x, y, st.a + side * spread, L, (1 - t) * 8);
    }
  }
  // The newest leaf at the very top, still upright, and the sheath it came out of.
  const topL = baseL * 0.62;
  drawLeafAt(tip.x, tip.y, lean + (rand() - 0.5) * 0.3, topL, -2);
  ctx.fillStyle = hsl(look.accentHue, look.accentSat ?? 50, look.accentLight ?? 45, 0.9);
  withTransform(ctx, tip.x, tip.y, lean, () => {
    ctx.beginPath();
    ctx.moveTo(-topL * 0.06, 0);
    ctx.quadraticCurveTo(-topL * 0.05, -topL * 0.3, 0, -topL * 0.42);
    ctx.quadraticCurveTo(topL * 0.05, -topL * 0.3, topL * 0.06, 0);
    ctx.closePath();
    ctx.fill();
  });
}

function drawSpiky(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const pups = sf >= 2.5 ? Math.min(4, Math.floor((sf - 2) * 2)) : 0;
  for (let i = 0; i < pups; i++) {
    const side = i % 2 ? 1 : -1;
    withTransform(ctx, side * S * (0.55 + rand() * 0.2), S * (rand() - 0.5) * 0.1, 0, () => drawSpiky({ ...p, S: S * (0.4 + rand() * 0.12), sf: 1 }));
  }
  const n = Math.min(18, Math.round(4 + sf * 3));
  const W = S * 0.075 * (look.leafWidth ?? 1);
  const blades = Array.from({ length: n }, () => {
    const a = (rand() - 0.5) * 2.5;
    return { a, L: S * (0.45 + rand() * 0.3) * (1 - Math.abs(a) * 0.2) };
  }).sort((a, b) => Math.abs(b.a) - Math.abs(a.a));
  for (const b of blades) {
    withTransform(ctx, Math.sin(b.a) * S * 0.04, 0, b.a, () => {
      leaf(p, { shape: 'spike', L: b.L, W, bands: look.variegation === 'stripe', midrib: false, dim: Math.abs(b.a) > 0.7 ? 6 : 0 });
      if (!look.spines) return;
      // Soft teeth along both margins.
      ctx.strokeStyle = spineColor(look, 0.85);
      ctx.lineWidth = Math.max(0.4, W * 0.08);
      ctx.beginPath();
      for (let t = 0.12; t < 0.85; t += 0.1) {
        for (const s of [-1, 1]) {
          const u = 1 - t;
          const x = s * (u * u * W + 2 * u * t * W * 0.9);
          const y = -2 * u * t * b.L * 0.55 - t * t * b.L;
          ctx.moveTo(x, y);
          ctx.lineTo(x + s * W * 0.22, y - W * 0.12);
        }
      }
      ctx.stroke();
    });
  }
  if (!look.flowers || sf < 3) return;
  // A tall flower spike hung with tubular blooms.
  const top = -S * 1.3;
  stroke(ctx, stemColor(look, 4), Math.max(0.8, S * 0.018), () => {
    ctx.moveTo(0, -S * 0.2);
    ctx.quadraticCurveTo(S * 0.05, top * 0.6, 0, top);
  });
  ctx.fillStyle = hsl(look.accentHue, look.accentSat ?? 80, look.accentLight ?? 60);
  for (let i = 0; i < 9; i++) {
    const y = top + i * S * 0.035;
    const x = (i % 2 ? 1 : -1) * S * 0.025;
    ctx.beginPath();
    ctx.ellipse(x, y + S * 0.03, S * 0.014, S * 0.04, x > 0 ? 0.4 : -0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A living stone: two fat leaves pressed into a squat dome, split down the middle. */
function stone(p: Paint, r: number) {
  const { ctx, look, rand } = p;
  const h = r * 1.2;
  for (const s of [-1, 1]) {
    const body = () => {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.04, 0);
      ctx.lineTo(s * r * 0.95, 0);
      ctx.bezierCurveTo(s * r * 1.05, -h * 0.6, s * r * 0.85, -h, s * r * 0.45, -h);
      ctx.quadraticCurveTo(s * r * 0.1, -h, s * r * 0.04, -h * 0.82);
      ctx.closePath();
    };
    body();
    const g = ctx.createLinearGradient(0, -h, 0, 0);
    g.addColorStop(0, hsl(look.hue, look.sat, look.light + 8));
    g.addColorStop(1, hsl(look.hue, look.sat - 6, look.light - 14));
    ctx.fillStyle = g;
    ctx.fill();
    body();
    variegate(p, h, r);
    // The translucent "window" on top, mottled like the stones it hides among.
    body();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = hsl(look.accentHue, look.accentSat ?? 25, look.accentLight ?? 40, 0.55);
    ctx.beginPath();
    ctx.ellipse(s * r * 0.5, -h * 0.94, r * 0.42, h * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hsl(look.accentHue, look.accentSat ?? 25, (look.accentLight ?? 40) - 12, 0.6);
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(s * r * (0.2 + rand() * 0.6), -h * (0.82 + rand() * 0.14), r * (0.04 + rand() * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    body();
    ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 26, 0.6);
    ctx.lineWidth = Math.max(0.5, r * 0.04);
    ctx.stroke();
  }
}

function drawStones(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const n = Math.min(7, 1 + Math.floor(sf * 1.3));
  const r = S * 0.17;
  const bodies = Array.from({ length: n }, (_, i) =>
    i === 0 ? { x: 0, y: 0, k: 1 } : { x: (rand() - 0.5) * S * 0.75, y: (rand() - 0.5) * S * 0.18, k: 0.75 + rand() * 0.3 }
  ).sort((a, b) => a.y - b.y);
  for (const b of bodies) withTransform(ctx, b.x, b.y, 0, () => stone(p, r * b.k));
  if (!look.flowers || sf < 2.8) return;
  // Daisies push up out of the split.
  for (const b of bodies.slice(-Math.min(3, Math.floor(sf - 1.8)))) {
    const cx = b.x;
    const cy = b.y - r * b.k * 1.25;
    for (let i = 0; i < 14; i++) {
      withTransform(ctx, cx, cy, (i / 14) * Math.PI * 2, () => {
        ctx.fillStyle = hsl(50, 90, 66);
        ctx.scale(1, 0.6);
        leafPath(ctx, 'lance', r * 0.55, r * 0.07, 0);
        ctx.fill();
      });
    }
    ctx.fillStyle = hsl(42, 80, 55);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** One narrow, saw-edged leaflet pointing up from the origin. */
function serratedLeaflet(p: Paint, L: number, W: number, dim: number) {
  const { ctx, look } = p;
  const teeth = Math.max(4, Math.round(L / Math.max(1.2, W * 0.9)));
  const build = () => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    // Right edge up, with small forward-pointing teeth.
    for (let i = 1; i <= teeth; i++) {
      const t = i / teeth;
      const w = Math.sin(Math.PI * Math.min(1, t * 1.05)) * W * 0.5;
      ctx.lineTo(w + W * 0.08, -L * (t - 0.5 / teeth));
      ctx.lineTo(w * 0.8, -L * t);
    }
    ctx.lineTo(0, -L * 1.02);
    for (let i = teeth; i >= 1; i--) {
      const t = i / teeth;
      const w = Math.sin(Math.PI * Math.min(1, t * 1.05)) * W * 0.5;
      ctx.lineTo(-w * 0.8, -L * t);
      ctx.lineTo(-w - W * 0.08, -L * (t - 0.5 / teeth));
    }
    ctx.closePath();
  };
  build();
  ctx.fillStyle = leafFill(p, L, dim);
  ctx.fill();
  ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 18, 0.5);
  ctx.lineWidth = Math.max(0.5, W * 0.06);
  ctx.stroke();
  ctx.strokeStyle = hsl(look.hue, look.sat - 12, look.light + 10, 0.55);
  ctx.lineWidth = Math.max(0.5, W * 0.08);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -L * 0.92);
  ctx.stroke();
}

/** A palmate leaf: an odd number of leaflets fanned from the end of a petiole, longest in the middle. */
function palmateLeaf(p: Paint, size: number, dim: number) {
  const { ctx, rand, look } = p;
  const n = size > p.S * 0.3 ? 7 : 5;
  const spread = 2.3 + rand() * 0.3;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1) - 0.5;
    const L = size * (1 - Math.abs(k) * 1.05);
    withTransform(ctx, 0, 0, k * spread, () => serratedLeaflet(p, L, L * 0.2 * (look.leafWidth ?? 1), dim + Math.abs(k) * 6));
  }
}

function drawPalmate(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const height = S * (0.7 + Math.min(4.4, sf) * 0.2);
  const stems = sf < 1.5 ? 1 : sf < 3 ? 2 : 3;
  const stem = stemColor(look, 4);
  for (let s = 0; s < stems; s++) {
    const lean = (s - (stems - 1) / 2) * 0.28 + (rand() - 0.5) * 0.08;
    const h = height * (s === Math.floor(stems / 2) ? 1 : 0.78 + rand() * 0.1);
    const tipX = Math.sin(lean) * h;
    const tipY = -Math.cos(lean) * h;
    stroke(ctx, stem, Math.max(1, S * 0.03), () => {
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(tipX * 0.4, tipY * 0.55, tipX, tipY);
    });
    // Leaves in opposite pairs up the stem, shrinking toward the top.
    const nodes = Math.max(1, Math.min(5, Math.round(1 + sf)));
    for (let i = 0; i < nodes; i++) {
      const t = 0.3 + (i / nodes) * 0.62;
      const nx = tipX * t * (0.4 + 0.6 * t);
      const ny = tipY * t;
      const size = S * (0.42 - t * 0.2) * (0.9 + rand() * 0.2);
      for (const side of [-1, 1]) {
        const petiole = size * 0.35;
        const a = side * (0.95 + rand() * 0.25) + lean;
        const px = nx + Math.sin(a) * petiole;
        const py = ny - Math.cos(a) * petiole * 0.7;
        stroke(ctx, stem, Math.max(0.6, S * 0.012), () => {
          ctx.moveTo(nx, ny);
          ctx.lineTo(px, py);
        });
        withTransform(ctx, px, py, a * 0.75, () => palmateLeaf(p, size, i % 2 ? 4 : 0));
      }
    }
    // The growing tip: a small upright cluster of young leaves.
    withTransform(ctx, tipX, tipY, lean * 0.5, () => palmateLeaf(p, S * 0.2, -4));
  }
}

// ------------------------------------------------------------ carnivores

/** Point and tangent on a cubic Bézier from (0,0) through c1, c2 to e. */
function cubicAt(t: number, c1x: number, c1y: number, c2x: number, c2y: number, ex: number, ey: number) {
  const u = 1 - t;
  return {
    x: 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex,
    y: 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey,
    tx: 3 * u * u * c1x + 6 * u * t * (c2x - c1x) + 3 * t * t * (ex - c2x),
    ty: 3 * u * u * c1y + 6 * u * t * (c2y - c1y) + 3 * t * t * (ey - c2y),
  };
}

/** One flytrap at the current transform: two toothed lobes hinged at the base, open or snapped shut. */
function flytrap(p: Paint, size: number, shut: boolean) {
  const { ctx, look } = p;
  const teeth = size * 0.3 * (look.spineLength ?? 1);
  const spread = shut ? 0.06 : 0.5;
  for (const side of [-1, 1]) {
    withTransform(ctx, 0, 0, side * spread, () => {
      const c1x = side * size * 0.55;
      const c2x = side * size * 0.62;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(c1x, -size * 0.05, c2x, -size * 0.85, 0, -size);
      ctx.closePath();
      ctx.fillStyle = leafFill(p, size);
      ctx.fill();
      if (!shut) {
        // The red inner face, showing because the trap is open.
        ctx.beginPath();
        ctx.moveTo(side * size * 0.05, -size * 0.1);
        ctx.bezierCurveTo(side * size * 0.42, -size * 0.14, side * size * 0.48, -size * 0.8, side * size * 0.05, -size * 0.9);
        ctx.closePath();
        ctx.fillStyle = hsl(look.accentHue, look.accentSat ?? 68, look.accentLight ?? 44);
        ctx.fill();
      }
      ctx.strokeStyle = hsl(look.hue, look.sat, look.light + 14, 0.95);
      ctx.lineWidth = Math.max(0.4, size * 0.035);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 2; i < 12; i++) {
        const q = cubicAt(i / 12, c1x, -size * 0.05, c2x, -size * 0.85, 0, -size);
        const len = Math.hypot(q.tx, q.ty) || 1;
        // Outward normal: the side of the tangent that points away from the midrib.
        let nx = -q.ty / len;
        let ny = q.tx / len;
        if (nx * side < 0) {
          nx = -nx;
          ny = -ny;
        }
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x + nx * teeth, q.y + ny * teeth - teeth * 0.3);
      }
      ctx.stroke();
    });
  }
}

/** Venus flytrap: a low rosette of leaves, each ending in a hinged, toothed trap. */
function drawTrap(p: Paint) {
  const { ctx, rand, S, sf } = p;
  const n = Math.min(10, Math.round(2 + sf * 1.8));
  const traps = Array.from({ length: n }, (_, i) => ({
    a: (n === 1 ? 0 : -1.25 + (2.5 * i) / (n - 1)) + (rand() - 0.5) * 0.3,
    L: S * (0.3 + rand() * 0.14),
    shut: rand() < 0.2,
  })).sort((a, b) => Math.abs(b.a) - Math.abs(a.a));
  for (const t of traps) {
    withTransform(ctx, 0, 0, t.a, () => {
      leaf(p, { shape: 'lance', L: t.L, W: t.L * 0.15, dim: Math.abs(t.a) > 0.7 ? 5 : 0 });
      withTransform(ctx, 0, -t.L * 0.92, 0, () => flytrap(p, S * 0.22, t.shut));
    });
  }
}

/** A sundew blade: a spoon of leaf covered in red hairs, each holding a bead of glue. */
function sundewBlade(p: Paint, L: number) {
  const { ctx, look, rand } = p;
  const W = L * 0.34;
  leaf(p, { shape: 'oval', L, W, midrib: false });
  const hair = hsl(look.accentHue, look.accentSat ?? 70, look.accentLight ?? 46);
  const hl = L * 0.2;
  const tips: [number, number][] = [];
  ctx.strokeStyle = hair;
  ctx.lineWidth = Math.max(0.35, L * 0.025);
  ctx.beginPath();
  for (let t = 0.12; t < 1.0; t += 0.1) {
    for (const s of [-1, 1]) {
      const bx = Math.sin(Math.PI * Math.pow(t, 0.8)) * W * 1.1 * s;
      const by = -L * t;
      const a = Math.atan2(by + L * 0.45, bx) + (rand() - 0.5) * 0.3;
      const ex = bx + Math.cos(a) * hl;
      const ey = by + Math.sin(a) * hl;
      ctx.moveTo(bx, by);
      ctx.lineTo(ex, ey);
      tips.push([ex, ey]);
    }
  }
  ctx.moveTo(0, -L);
  ctx.lineTo(0, -L - hl);
  tips.push([0, -L - hl]);
  ctx.stroke();
  // Shorter hairs over the face of the leaf.
  for (let i = 0; i < 6; i++) tips.push([(rand() - 0.5) * W, -L * (0.3 + rand() * 0.55)]);
  const r = Math.max(0.45, L * 0.034);
  for (const [x, y] of tips) {
    ctx.fillStyle = hsl(look.accentHue, 35, 88, 0.7);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Sundew: a low rosette of glittering spoons, with a wiry flower stalk once it's grown. */
function drawDew(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const n = Math.min(16, Math.round(4 + sf * 2.6));
  const leaves = Array.from({ length: n }, (_, i) => ({
    a: (n === 1 ? 0 : -1.45 + (2.9 * i) / (n - 1)) + (rand() - 0.5) * 0.25,
    L: S * (0.32 + rand() * 0.2),
  })).sort((a, b) => Math.abs(b.a) - Math.abs(a.a));
  for (const lf of leaves) {
    withTransform(ctx, 0, 0, lf.a, () => {
      stroke(ctx, stemColor(look, 4), Math.max(0.5, S * 0.018), () => {
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -lf.L * 0.45);
      });
      withTransform(ctx, 0, -lf.L * 0.42, 0, () => sundewBlade(p, lf.L * 0.62));
    });
  }
  if (!look.flowers || sf < 2) return;
  const stalks = sf >= 3.2 ? 2 : 1;
  for (let k = 0; k < stalks; k++) {
    const x = (k === 0 ? 1 : -1) * S * (0.1 + rand() * 0.1);
    const h = S * (1.05 + rand() * 0.25);
    stroke(ctx, stemColor(look, -2), Math.max(0.5, S * 0.014), () => {
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(x * 1.5, -h * 0.5, x, -h);
    });
    for (let i = 0; i < 3; i++) {
      const fx = x + (i - 1) * S * 0.06;
      const fy = -h + Math.abs(i - 1) * S * 0.06;
      ctx.fillStyle = hsl(328, 55, 84);
      for (let j = 0; j < 5; j++) {
        const a = (j / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(fx + Math.cos(a) * S * 0.028, fy + Math.sin(a) * S * 0.028, S * 0.024, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = hsl(50, 80, 62);
      ctx.beginPath();
      ctx.arc(fx, fy, S * 0.018, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function veinColor(look: PlantLook, a = 1): string {
  const [h, s, l] = look.variegationColor ?? [look.accentHue, 50, 30];
  return hsl(h, s, l, a);
}

/** One hooded trumpet, base at the origin. */
function trumpet(p: Paint, h: number, dim: number) {
  const { ctx, look, rand, S } = p;
  const w0 = S * 0.026;
  const w1 = S * 0.085;
  const tube = () => {
    ctx.beginPath();
    ctx.moveTo(-w0, 0);
    ctx.quadraticCurveTo(-w0 * 1.3, -h * 0.55, -w1, -h);
    ctx.lineTo(w1, -h);
    ctx.quadraticCurveTo(w0 * 1.3, -h * 0.55, w0, 0);
    ctx.closePath();
  };
  const g = ctx.createLinearGradient(0, 0, 0, -h);
  g.addColorStop(0, hsl(look.hue, look.sat - 6, look.light - 12 - dim));
  g.addColorStop(0.5, hsl(look.hue, look.sat, look.light - dim));
  g.addColorStop(1, hsl(look.accentHue, look.accentSat ?? 60, (look.accentLight ?? 55) - dim * 0.5));
  tube();
  ctx.fillStyle = g;
  ctx.fill();
  // Veins netting the throat.
  ctx.save();
  tube();
  ctx.clip();
  ctx.strokeStyle = veinColor(look, 0.55);
  ctx.lineWidth = Math.max(0.4, S * 0.008);
  ctx.beginPath();
  for (let i = -2; i <= 2; i++) {
    const x = (i / 2.5) * w1;
    ctx.moveTo(x * 0.45, -h * 0.45);
    ctx.lineTo(x, -h);
  }
  ctx.stroke();
  ctx.restore();
  tube();
  ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 24, 0.5);
  ctx.lineWidth = Math.max(0.5, S * 0.01);
  ctx.stroke();
  // The open mouth, and the hood leaning over it.
  ctx.fillStyle = hsl(look.hue, look.sat, 12, 0.85);
  ctx.beginPath();
  ctx.ellipse(0, -h, w1, w1 * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  withTransform(ctx, w1 * 0.2, -h - w1 * 0.15, (rand() - 0.3) * 0.5, () => {
    leafPath(ctx, 'heart', w1 * 2.1, w1 * 0.95, 0);
    ctx.fillStyle = hsl(look.accentHue, look.accentSat ?? 60, (look.accentLight ?? 55) + 4 - dim * 0.5);
    ctx.fill();
    ctx.save();
    leafPath(ctx, 'heart', w1 * 2.1, w1 * 0.95, 0);
    ctx.clip();
    ctx.strokeStyle = veinColor(look, 0.7);
    ctx.lineWidth = Math.max(0.4, S * 0.009);
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(i * w1 * 0.3, -w1, i * w1 * 0.45, -w1 * 2);
    }
    ctx.stroke();
    ctx.restore();
  });
}

/** Trumpet pitcher: a stand of hooded tubes, and nodding flowers on older plants. */
function drawPitcher(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const n = Math.min(10, Math.round(2 + sf * 1.7));
  const tubes = Array.from({ length: n }, (_, i) => ({
    x: (rand() - 0.5) * S * 0.32,
    a: (rand() - 0.5) * 0.5,
    h: S * (0.75 + rand() * 0.55) * (i === 0 ? 1.1 : 1),
  })).sort((a, b) => Math.abs(b.a) - Math.abs(a.a));
  for (const t of tubes) withTransform(ctx, t.x, 0, t.a, () => trumpet(p, t.h, Math.abs(t.a) > 0.18 ? 6 : 0));
  if (!look.flowers || sf < 2.5) return;
  const x = S * (0.28 + rand() * 0.1) * (rand() < 0.5 ? -1 : 1);
  const h = S * 0.8;
  stroke(ctx, stemColor(look, -4), Math.max(0.6, S * 0.016), () => {
    ctx.moveTo(x * 0.3, 0);
    ctx.quadraticCurveTo(x, -h * 0.7, x * 1.1, -h);
  });
  // A nodding flower: an umbrella of drooping petals.
  ctx.fillStyle = hsl(look.accentHue, look.accentSat ?? 70, (look.accentLight ?? 60) - 4);
  for (let i = 0; i < 5; i++) {
    withTransform(ctx, x * 1.1, -h + S * 0.02, Math.PI + (i / 4 - 0.5) * 1.6, () => {
      leafPath(ctx, 'lance', S * 0.13, S * 0.035, 0);
      ctx.fill();
    });
  }
}

/** A hanging monkey cup with its rim at (0,0): bulbous body, a ribbed lip and a lid. */
function monkeyCup(p: Paint, s: number) {
  const { ctx, look, rand } = p;
  const w = s * 0.5;
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(-w * 0.55, 0);
    ctx.bezierCurveTo(-w * 0.72, s * 0.3, -w * 1.1, s * 0.72, -w * 0.5, s * 0.98);
    ctx.quadraticCurveTo(0, s * 1.08, w * 0.5, s * 0.98);
    ctx.bezierCurveTo(w * 1.1, s * 0.72, w * 0.72, s * 0.3, w * 0.55, 0);
    ctx.closePath();
  };
  const ah = look.accentHue;
  const as = look.accentSat ?? 45;
  const al = look.accentLight ?? 46;
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, hsl(ah, as, al + 8));
  g.addColorStop(0.6, hsl(ah, as, al));
  g.addColorStop(1, hsl(ah, as, al - 10));
  body();
  ctx.fillStyle = g;
  ctx.fill();
  if (look.variegationColor) {
    ctx.save();
    body();
    ctx.clip();
    ctx.fillStyle = veinColor(look, 0.55);
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.arc((rand() - 0.5) * w * 1.6, s * (0.2 + rand() * 0.8), Math.max(0.4, s * 0.03), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  body();
  ctx.strokeStyle = hsl(ah, as, al - 22, 0.6);
  ctx.lineWidth = Math.max(0.5, s * 0.03);
  ctx.stroke();
  // Lid, tilted up and back.
  withTransform(ctx, w * 0.15, -s * 0.02, 0.5, () => {
    leafPath(ctx, 'oval', s * 0.38, s * 0.2, 0);
    ctx.fillStyle = hsl(ah, as, al + 4);
    ctx.fill();
  });
  // The dark mouth and the glossy peristome lip around it.
  ctx.fillStyle = hsl(ah, as, 10, 0.9);
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.55, w * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = veinColor(look, 1);
  ctx.lineWidth = Math.max(0.6, s * 0.07);
  ctx.stroke();
}

/** Tropical pitcher plant: leaves up a scrambling stem, tendrils ending in hanging cups. */
function drawCups(p: Paint) {
  const { ctx, look, rand, S, sf, mode } = p;
  const stemH = S * (0.35 + Math.min(4, sf) * 0.15);
  const topX = (rand() - 0.5) * S * 0.12;
  const n = Math.min(9, Math.round(2 + sf * 1.6));
  const hang = mode === 'ground' ? 0.3 : 0.85;
  const cups: { x: number; y: number; s: number; tx: number; ty: number; side: number }[] = [];
  const leaves: { y: number; a: number; L: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 1 : i / (n - 1);
    const y = -stemH * (0.12 + 0.88 * t);
    const side = i % 2 ? 1 : -1;
    const a = side * (0.95 + rand() * 0.35);
    const L = S * (0.32 + rand() * 0.1);
    leaves.push({ y, a, L });
    // Not every leaf has managed a cup yet.
    if (i === n - 1 && n > 2) continue;
    const tx = Math.sin(a) * L;
    const ty = y - Math.cos(a) * L;
    const s = S * (0.2 + rand() * 0.06);
    const cy = Math.min(ty + S * hang * (0.7 + rand() * 0.5), mode === 'ground' ? -s * 0.9 : Infinity);
    cups.push({ x: tx + side * S * 0.1, y: cy, s, tx, ty, side });
  }
  stroke(ctx, stemColor(look, -6), Math.max(1, S * 0.03), () => {
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(S * 0.08, -stemH * 0.5, topX, -stemH);
  });
  for (const lf of leaves) withTransform(ctx, 0, lf.y, lf.a, () => leaf(p, { shape: 'lance', L: lf.L, W: lf.L * 0.22, dim: 3 }));
  for (const c of cups) {
    stroke(ctx, stemColor(look, 2), Math.max(0.5, S * 0.012), () => {
      ctx.moveTo(c.tx, c.ty);
      ctx.quadraticCurveTo(c.tx + c.side * S * 0.14, c.ty, c.x + c.side * c.s * 0.2, c.y - c.s * 0.1);
    });
    withTransform(ctx, c.x, c.y, c.side * 0.12, () => monkeyCup(p, c.s));
  }
}

// ------------------------------------------------------------ crowned stems: fans, palms & canes

/** A crane-headed bird of paradise flower: a boat-shaped bract held out sideways like a beak, with a crest of spiky petals rising from its heel. */
function craneFlower(p: Paint, dir: number, s: number) {
  const { ctx, look, rand } = p;
  // The bract: a long boat, paler than the leaves and flushed red along its keel, pointing out to `dir`.
  const boat = () => {
    ctx.beginPath();
    ctx.moveTo(-dir * s * 0.1, -s * 0.06);
    ctx.quadraticCurveTo(dir * s * 0.35, s * 0.16, dir * s * 0.85, -s * 0.16);
    ctx.quadraticCurveTo(dir * s * 0.35, -s * 0.1, -dir * s * 0.1, -s * 0.06);
    ctx.closePath();
  };
  boat();
  ctx.fillStyle = hsl(look.hue + 15, look.sat - 5, look.light + 14);
  ctx.fill();
  ctx.strokeStyle = hsl(355, 60, 42, 0.85);
  ctx.lineWidth = Math.max(0.8, s * 0.04);
  ctx.beginPath();
  ctx.moveTo(-dir * s * 0.1, -s * 0.06);
  ctx.quadraticCurveTo(dir * s * 0.35, s * 0.16, dir * s * 0.85, -s * 0.16);
  ctx.stroke();
  // The crest: petals fanning up from the heel, leaning toward the beak.
  const petals = 4;
  for (let i = 0; i < petals; i++) {
    const L = s * (0.62 - i * 0.05) * (0.95 + rand() * 0.1);
    withTransform(ctx, dir * s * (0.02 + i * 0.09), -s * 0.05, dir * (-0.15 + i * 0.32), () => {
      ctx.fillStyle = hsl(look.accentHue, look.accentSat ?? 90, look.accentLight ?? 58);
      leafPath(ctx, 'spike', L, L * 0.13, 0);
      ctx.fill();
      ctx.strokeStyle = hsl(look.accentHue, look.accentSat ?? 90, (look.accentLight ?? 58) - 18, 0.6);
      ctx.lineWidth = Math.max(0.5, L * 0.03);
      ctx.stroke();
    });
  }
  // And the one blue tongue every bird of paradise carries.
  withTransform(ctx, dir * s * 0.22, -s * 0.03, dir * 0.55, () => {
    ctx.fillStyle = hsl(232, 65, 46);
    leafPath(ctx, 'spike', s * 0.42, s * 0.075, 0);
    ctx.fill();
  });
}

function drawFan(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  // Long stalks fanning up from the base, all in one plane, each carrying a
  // big paddle leaf. A cutting is one or two stalks; a specimen is a whole
  // fan, with crane-headed flowers standing up between the leaves.
  const n = Math.min(11, Math.round(2 + sf * 2));
  const stalks = Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    return { a: (t - 0.5) * 1.35 + (rand() - 0.5) * 0.15, len: S * (0.5 + rand() * 0.25) * (0.8 + Math.min(sf, 3) * 0.1) };
  }).sort((a, b) => Math.abs(b.a) - Math.abs(a.a));
  for (const s of stalks) {
    const ex = Math.sin(s.a) * s.len;
    const ey = -Math.cos(s.a) * s.len;
    stroke(ctx, stemColor(look, -2), Math.max(0.8, S * 0.028), () => {
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(ex * 0.3, ey * 0.6, ex, ey);
    });
    // The paddle continues the stalk's line, tipping a little further outward.
    const L = s.len * 0.8;
    withTransform(ctx, ex, ey, s.a * 1.05, () => leaf(p, { shape: 'oval', L, W: L * 0.3 * (look.leafWidth ?? 1), dim: Math.abs(s.a) > 0.5 ? 6 : 0 }));
  }
  if (!look.flowers || sf < 2.4) return;
  const flowers = Math.min(3, Math.floor(sf - 1.6));
  for (let i = 0; i < flowers; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    const x = dir * S * (0.05 + rand() * 0.2);
    // Flower stalks stand clear above the leaves.
    const top = -S * (1.15 + rand() * 0.2) * (0.8 + Math.min(sf, 3) * 0.1);
    stroke(ctx, stemColor(look, -2), Math.max(0.8, S * 0.022), () => {
      ctx.moveTo(x * 0.2, 0);
      ctx.quadraticCurveTo(x * 0.6, top * 0.55, x, top);
    });
    withTransform(ctx, x, top, dir * 0.1, () => craneFlower(p, dir, S * 0.5));
  }
}

/** A pinnate frond arching out from the origin toward `dir`: a rachis with a row of leaflets down either side. */
function frond(p: Paint, dir: number, len: number, upright: number, dim: number) {
  const { ctx, look, rand } = p;
  const cx = dir * len * (0.3 + (1 - upright) * 0.3);
  const cy = -len * (0.7 + upright * 0.4);
  const ex = dir * len * (0.55 + (1 - upright) * 0.5);
  const ey = -len * (0.05 + upright * 0.75);
  stroke(ctx, stemColor(look, -2), Math.max(0.6, len * 0.022), () => {
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(cx, cy, ex, ey);
  });
  const n = 8 + Math.floor(rand() * 3);
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const mt = 1 - t;
    const x = 2 * mt * t * cx + t * t * ex;
    const y = 2 * mt * t * cy + t * t * ey;
    const ra = Math.atan2(2 * mt * cy + 2 * t * (ey - cy), 2 * mt * cx + 2 * t * (ex - cx));
    const L = len * (0.2 + Math.sin(Math.PI * t) * 0.1) * (0.9 + rand() * 0.2);
    for (const side of [-1, 1]) {
      // Each leaflet leans forward off the rachis, both sides, a little narrower toward the tip.
      const la = ra + side * 0.9 * (1 - t * 0.3);
      withTransform(ctx, x, y, Math.atan2(Math.cos(la), -Math.sin(la)), () => leaf(p, { shape: 'lance', L, W: L * 0.1 * (look.leafWidth ?? 1), dim, midrib: false }));
    }
  }
}

function drawPalm(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  // A clump of slender ringed canes, one more with each stage, each crowned
  // with fronds: the outer ones arch and droop, the newest stands upright.
  const canes = Math.min(5, 1 + Math.floor(sf * 0.9));
  const H = S * (0.3 + Math.min(sf, 4.6) * 0.16);
  const heads: { x: number; y: number; h: number }[] = [];
  for (let c = 0; c < canes; c++) {
    const x0 = c === 0 ? 0 : (rand() - 0.5) * S * 0.35;
    const lean = (rand() - 0.5) * 0.25;
    const h = H * (c === 0 ? 1 : 0.6 + rand() * 0.35);
    const tx = x0 + Math.sin(lean) * h;
    const ty = -h;
    stroke(ctx, stemColor(look, 8), Math.max(1, S * 0.03), () => {
      ctx.moveTo(x0, 0);
      ctx.lineTo(tx, ty);
    });
    // The rings where old fronds fell away.
    ctx.strokeStyle = hsl(look.hue, look.sat - 10, look.light + 12, 0.6);
    ctx.lineWidth = Math.max(0.5, S * 0.006);
    for (let t = 0.15; t < 0.95; t += 0.16) {
      ctx.beginPath();
      ctx.moveTo(x0 + (tx - x0) * t - S * 0.02, -h * t);
      ctx.lineTo(x0 + (tx - x0) * t + S * 0.02, -h * t);
      ctx.stroke();
    }
    heads.push({ x: tx, y: ty, h });
  }
  // Fronds, drawn back to front so the smaller canes sit behind the main one.
  heads.reverse();
  for (const head of heads) {
    const fronds = Math.min(7, 2 + Math.round(sf * 1.1));
    const set = Array.from({ length: fronds }, (_, i) => {
      const t = fronds === 1 ? 0.5 : i / (fronds - 1);
      const out = Math.abs(t - 0.5) * 2;
      return { dir: t < 0.5 ? -1 : 1, up: 1 - out * 0.85 + (rand() - 0.5) * 0.1, len: S * (0.4 + rand() * 0.2) * (0.8 + Math.min(sf, 3) * 0.08) * (head.h / H) };
    }).sort((a, b) => a.up - b.up);
    withTransform(ctx, head.x, head.y, 0, () => {
      for (const f of set) frond(p, f.dir, f.len, f.up, f.up < 0.4 ? 6 : 0);
    });
  }
}

function drawCane(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const bulb = !!look.bulb;
  // A dragon tree is one slim cane that forks into two or three heads with
  // age; a ponytail palm is one fat trunk on a swollen base. Either way each
  // head wears a tuft of ribbon leaves: stiff and spiky on the tree, a long
  // drooping fountain on the ponytail.
  const age = Math.min(1, sf / 3);
  const dh = ((30 - look.hue + 540) % 360) - 180;
  const bark = hsl(look.hue + dh * age, 18 + (1 - age) * 12, 32 + (1 - age) * 8);
  const H = S * (bulb ? 0.22 + Math.min(sf, 4.6) * 0.11 : 0.25 + Math.min(sf, 4.6) * 0.18);
  const trunkW = Math.max(1, S * (bulb ? 0.05 + Math.min(sf, 4) * 0.016 : 0.035 + Math.min(sf, 4) * 0.012));
  const lean = (rand() - 0.5) * 0.15;
  const top = { x: Math.sin(lean) * H, y: -H };
  stroke(ctx, bark, trunkW, () => {
    ctx.moveTo(0, 0);
    ctx.lineTo(top.x, top.y);
  });
  const heads: { x: number; y: number; a: number }[] = [{ x: top.x, y: top.y, a: lean }];
  if (bulb) {
    // The swollen base, cracked like an elephant's foot.
    const r = S * (0.07 + Math.min(sf, 4.6) * 0.035);
    ctx.fillStyle = bark;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.5, r, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hsl(30, 20, 18, 0.45);
    ctx.lineWidth = Math.max(0.5, r * 0.06);
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI * 0.85 + i * 0.55 + rand() * 0.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.25, -r * 0.5 + Math.sin(a) * r * 0.2);
      ctx.lineTo(Math.cos(a) * r * 0.9, -r * 0.5 + Math.sin(a) * r * 0.62);
      ctx.stroke();
    }
  } else {
    const forks = sf >= 2.6 ? (sf >= 3.8 ? 2 : 1) : 0;
    for (let f = 0; f < forks; f++) {
      const t = 0.55 + f * 0.15 + rand() * 0.08;
      const ox = Math.sin(lean) * H * t;
      const oy = -H * t;
      const side = f % 2 === 0 ? 1 : -1;
      const a = lean + side * (0.5 + rand() * 0.25);
      const len = H * (0.35 + rand() * 0.1);
      stroke(ctx, bark, trunkW * 0.7, () => {
        ctx.moveTo(ox, oy);
        ctx.quadraticCurveTo(ox + Math.sin(a) * len * 0.3, oy - len * 0.4, ox + Math.sin(a) * len, oy - Math.cos(a) * len);
      });
      heads.push({ x: ox + Math.sin(a) * len, y: oy - Math.cos(a) * len, a });
    }
  }
  for (const h of heads) {
    const n = bulb ? Math.min(30, Math.round(8 + sf * 5)) : Math.min(22, Math.round(8 + sf * 3));
    const blades = Array.from({ length: n }, (_, i) => ({
      dir: (i % 2 === 0 ? -1 : 1) * (0.15 + rand() * 0.85),
      len: S * (bulb ? 0.5 + rand() * 0.35 : 0.36 + rand() * 0.22) * (0.8 + Math.min(sf, 4) * 0.1),
      // A ribbon below 0 arches up and over, then hangs: the ponytail's cascade.
      up: bulb ? -0.3 + rand() * 0.8 : 0.5 + rand() * 0.5,
    })).sort((a, b) => a.up - b.up);
    withTransform(ctx, h.x, h.y, h.a, () => {
      for (const b of blades) ribbon(p, b.dir, b.len, S * (bulb ? 0.022 : 0.05) * (look.leafWidth ?? 1), b.up, b.up < 0.35 ? 6 : 0);
    });
  }
}

// ------------------------------------------------------------ fungi

function stipeColor(look: PlantLook, dl = 0, a = 1): string {
  const [h, s, l] = look.stipe ?? [40, 22, 88];
  return hsl(h, s, l + dl, a);
}

function glowing(look: PlantLook): boolean {
  return look.variegation === 'glow' && !!look.variegationColor;
}

/** Strokes the current path in the look's glow colour, blurred into a halo. Does nothing for a form that doesn't glow. */
function glowStroke(p: Paint, width: number) {
  const { ctx, look } = p;
  if (!glowing(look)) return;
  const [h, s, l] = look.variegationColor!;
  ctx.save();
  ctx.shadowColor = hsl(h, s, l);
  ctx.shadowBlur = Math.max(2, width * 4);
  ctx.strokeStyle = hsl(h, s, l, 0.95);
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

function capFill(p: Paint, top: number, bottom: number): CanvasGradient {
  const { look } = p;
  const g = p.ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, hsl(look.hue, look.sat, look.light + 10));
  g.addColorStop(0.55, hsl(look.hue, look.sat, look.light));
  g.addColorStop(1, hsl(look.hue, look.sat - 4, look.light - 12));
  return g;
}

function gillColor(look: PlantLook, dl = 0, a = 1): string {
  return hsl(look.accentHue, look.accentSat ?? 30, (look.accentLight ?? 85) + dl, a);
}

/** A tapering stem from (0,0) up to (tx, -h). */
function stipe(p: Paint, h: number, w: number, tx: number) {
  const { ctx, look } = p;
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.quadraticCurveTo(-w * 1.05 + tx * 0.3, -h * 0.5, -w * 0.72 + tx, -h);
    ctx.lineTo(w * 0.72 + tx, -h);
    ctx.quadraticCurveTo(w * 1.05 + tx * 0.3, -h * 0.5, w, 0);
    ctx.closePath();
  };
  const g = ctx.createLinearGradient(-w, 0, w, 0);
  g.addColorStop(0, stipeColor(look, -14));
  g.addColorStop(0.45, stipeColor(look, 4));
  g.addColorStop(1, stipeColor(look, -8));
  body();
  ctx.fillStyle = g;
  ctx.fill();
  body();
  ctx.strokeStyle = stipeColor(look, -30, 0.45);
  ctx.lineWidth = Math.max(0.4, w * 0.12);
  ctx.stroke();
}

/** Scatters the cap's warts or patches over the current (already built) cap path. */
function warts(p: Paint, cx: number, cy: number, rx: number, ry: number) {
  const { ctx, look, rand } = p;
  if (!look.warts) return;
  const [h, s, l] = look.warts;
  ctx.save();
  ctx.clip();
  ctx.fillStyle = hsl(h, s, l, 0.95);
  if (glowing(look)) {
    ctx.shadowColor = hsl(h, s, l);
    ctx.shadowBlur = Math.max(1.5, rx * 0.25);
  }
  const n = 7 + Math.floor(rand() * 5);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI;
    const d = Math.sqrt(rand());
    const x = cx + Math.cos(a) * rx * d * 0.92;
    const y = cy - Math.sin(a) * ry * d * 0.9;
    ctx.beginPath();
    ctx.ellipse(x, y, rx * (0.06 + rand() * 0.06), ry * (0.05 + rand() * 0.05), rand(), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** One fruiting body with its base at the origin. `open` runs from a closed button (0) to a spread cap (1). */
function mushroomBody(p: Paint, h: number, r: number, open: number, lean: number) {
  const { ctx, look, rand } = p;
  const shape = look.cap ?? 'dome';
  const w = r * 0.24 * (look.leafWidth ?? 1);
  const tx = lean * r * 0.5;
  const top = -h;

  if (shape === 'funnel') {
    // Stem and cap are one piece: flaring up into a wavy-rimmed vase, ridges running down.
    const rw = r * (0.55 + open * 0.45);
    const flare = () => {
      ctx.beginPath();
      ctx.moveTo(-w, 0);
      ctx.bezierCurveTo(-w, top * 0.5, -rw * 0.6 + tx, top * 0.85, -rw + tx, top);
      ctx.lineTo(rw + tx, top);
      ctx.bezierCurveTo(rw * 0.6 + tx, top * 0.85, w, top * 0.5, w, 0);
      ctx.closePath();
    };
    flare();
    ctx.fillStyle = capFill(p, top, 0);
    ctx.fill();
    ctx.save();
    flare();
    ctx.clip();
    ctx.strokeStyle = gillColor(look, -8, 0.8);
    ctx.lineWidth = Math.max(0.4, r * 0.03);
    ctx.beginPath();
    for (let i = -4; i <= 4; i++) {
      ctx.moveTo((i / 4) * rw * 0.95 + tx, top);
      ctx.quadraticCurveTo((i / 4) * rw * 0.4 + tx * 0.5, top * 0.7, (i / 4) * w * 0.6, top * 0.35);
    }
    ctx.stroke();
    if (glowing(look)) {
      ctx.beginPath();
      for (let i = -4; i <= 4; i++) {
        ctx.moveTo((i / 4) * rw * 0.95 + tx, top);
        ctx.quadraticCurveTo((i / 4) * rw * 0.4 + tx * 0.5, top * 0.7, (i / 4) * w * 0.6, top * 0.35);
      }
      glowStroke(p, Math.max(0.5, r * 0.035));
    }
    ctx.restore();
    // The wavy rim, seen from a little above: the cap's dished top.
    ctx.beginPath();
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const wob = 1 + Math.sin(a * 5 + rand()) * 0.06;
      const x = tx + Math.cos(a) * rw * wob;
      const y = top + Math.sin(a) * rw * 0.3 * wob;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(tx, top, 0, tx, top, rw);
    g.addColorStop(0, hsl(look.hue, look.sat, look.light - 14));
    g.addColorStop(1, hsl(look.hue, look.sat, look.light + 8));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 20, 0.6);
    ctx.lineWidth = Math.max(0.4, r * 0.035);
    ctx.stroke();
    return;
  }

  if (shape === 'nodding') {
    // A waxy stem that bows over at the top into a downturned bell.
    const sw = r * 0.14;
    const ex = tx + r * 0.55;
    const ey = top * 0.9;
    stroke(ctx, stipeColor(look, -10), sw * 2, () => {
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(0, top * 0.6, tx + r * 0.05, top * 1.08, ex, ey);
    });
    stroke(ctx, stipeColor(look, 4), sw * 1.1, () => {
      ctx.moveTo(-sw * 0.3, 0);
      ctx.bezierCurveTo(-sw * 0.3, top * 0.6, tx, top * 1.05, ex - sw * 0.2, ey - sw * 0.3);
    });
    withTransform(ctx, ex, ey, 2.5, () => {
      const bl = r * 0.75;
      const bw = r * 0.3;
      ctx.beginPath();
      ctx.moveTo(-sw, 0);
      ctx.bezierCurveTo(-bw * 1.3, -bl * 0.3, -bw * 1.2, -bl * 0.9, -bw * 0.9, -bl);
      ctx.quadraticCurveTo(0, -bl * 0.9, bw * 0.9, -bl);
      ctx.bezierCurveTo(bw * 1.2, -bl * 0.9, bw * 1.3, -bl * 0.3, sw, 0);
      ctx.closePath();
      ctx.fillStyle = capFill(p, 0, -bl);
      ctx.fill();
      ctx.strokeStyle = gillColor(look, -40, 0.5);
      ctx.lineWidth = Math.max(0.4, r * 0.03);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-bw * 0.9, -bl);
      ctx.quadraticCurveTo(0, -bl * 0.9, bw * 0.9, -bl);
      glowStroke(p, Math.max(0.6, r * 0.06));
    });
    return;
  }

  stipe(p, h, w, tx);

  if (shape === 'shaggy' || shape === 'honeycomb') {
    // A tall cap that hangs down over the top of the stem.
    const rw = r * (shape === 'shaggy' ? 0.6 : 0.52) * (shape === 'honeycomb' ? look.leafWidth ?? 1 : 1) * (shape === 'honeycomb' ? 0.75 : 1);
    const ch = r * (shape === 'shaggy' ? 1.7 + (1 - open) * 0.3 : 1.55);
    const hem = shape === 'shaggy' ? r * 0.35 : r * 0.05;
    const cap = () => {
      ctx.beginPath();
      ctx.moveTo(tx - rw, top + hem);
      ctx.bezierCurveTo(tx - rw * 1.08, top - ch * 0.55, tx - rw * 0.55, top - ch * 0.98, tx, top - ch);
      ctx.bezierCurveTo(tx + rw * 0.55, top - ch * 0.98, tx + rw * 1.08, top - ch * 0.55, tx + rw, top + hem);
      ctx.quadraticCurveTo(tx, top + hem * 1.3, tx - rw, top + hem);
      ctx.closePath();
    };
    cap();
    ctx.fillStyle = capFill(p, top - ch, top + hem);
    ctx.fill();
    ctx.save();
    cap();
    ctx.clip();
    if (shape === 'shaggy') {
      // Upturned scales in rows, and the hem running to ink.
      ctx.strokeStyle = hsl(look.hue, look.sat + 10, look.light - 22, 0.55);
      ctx.lineWidth = Math.max(0.4, r * 0.035);
      ctx.beginPath();
      for (let row = 0; row < 5; row++) {
        const y = top - ch * (0.12 + row * 0.17);
        const k = Math.sin(Math.acos(Math.min(1, Math.abs(y - (top - ch * 0.45)) / (ch * 0.62))));
        for (let i = -2; i <= 2; i++) {
          const x = tx + (i + (row % 2) * 0.5) * rw * 0.38 * k;
          ctx.moveTo(x - r * 0.06, y - r * 0.06);
          ctx.lineTo(x, y);
          ctx.lineTo(x + r * 0.06, y - r * 0.06);
        }
      }
      ctx.stroke();
      const ink = ctx.createLinearGradient(0, top - ch * 0.35, 0, top + hem * 1.3);
      ink.addColorStop(0, gillColor(look, 0, 0));
      ink.addColorStop(1, gillColor(look, 0, 0.95));
      ctx.fillStyle = ink;
      ctx.fillRect(tx - rw * 1.2, top - ch * 0.35, rw * 2.4, ch * 0.35 + hem * 1.4);
      warts(p, tx, top + hem, rw, ch);
    } else {
      // Pits between pale ridges.
      ctx.fillStyle = gillColor(look, 0, 0.9);
      if (glowing(look)) {
        const [gh, gs, gl] = look.variegationColor!;
        ctx.fillStyle = hsl(gh, gs, gl);
        ctx.shadowColor = hsl(gh, gs, gl);
        ctx.shadowBlur = Math.max(1.5, r * 0.15);
      }
      const rows = 6;
      for (let row = 0; row < rows; row++) {
        const y = top - ch * (0.08 + (row / rows) * 0.86);
        for (let i = -3; i <= 3; i++) {
          const x = tx + (i + (row % 2) * 0.5) * rw * 0.3;
          ctx.beginPath();
          ctx.ellipse(x + (rand() - 0.5) * r * 0.04, y, rw * 0.11, ch * 0.055, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
    cap();
    ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 24, 0.55);
    ctx.lineWidth = Math.max(0.4, r * 0.035);
    ctx.stroke();
    if (shape === 'shaggy') {
      ctx.beginPath();
      ctx.moveTo(tx - rw, top + hem);
      ctx.quadraticCurveTo(tx, top + hem * 1.3, tx + rw, top + hem);
      glowStroke(p, Math.max(0.6, r * 0.06));
    }
    return;
  }

  // Dome or flat: gills underneath, then the cap over them.
  const rx = r * (0.62 + open * 0.38);
  const ry = r * (shape === 'flat' ? 0.95 - open * 0.6 : 1.0 - open * 0.3) * (look.leafWidth && look.leafWidth > 1.5 ? 0.85 : 1);
  ctx.beginPath();
  ctx.ellipse(tx, top, rx * 0.96, rx * 0.2 * open + r * 0.03, 0, 0, Math.PI * 2);
  ctx.fillStyle = gillColor(look, -6);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = gillColor(look, -24, 0.6);
  ctx.lineWidth = Math.max(0.3, r * 0.02);
  ctx.beginPath();
  for (let i = -6; i <= 6; i++) {
    ctx.moveTo(tx, top + rx * 0.05);
    ctx.lineTo(tx + (i / 6) * rx, top + rx * 0.2);
  }
  ctx.stroke();
  ctx.restore();
  if (glowing(look)) {
    ctx.beginPath();
    ctx.ellipse(tx, top + rx * 0.04, rx * 0.8, rx * 0.12 * open + r * 0.02, 0, 0, Math.PI);
    glowStroke(p, Math.max(0.6, r * 0.07));
  }
  const cap = () => {
    ctx.beginPath();
    ctx.moveTo(tx - rx, top);
    if (shape === 'flat') {
      ctx.bezierCurveTo(tx - rx, top - ry * 0.9, tx - rx * 0.35, top - ry, tx - rx * 0.18, top - ry * 1.05);
      ctx.quadraticCurveTo(tx, top - ry * 1.35, tx + rx * 0.18, top - ry * 1.05);
      ctx.bezierCurveTo(tx + rx * 0.35, top - ry, tx + rx, top - ry * 0.9, tx + rx, top);
    } else {
      ctx.bezierCurveTo(tx - rx * 1.02, top - ry * 1.3, tx + rx * 1.02, top - ry * 1.3, tx + rx, top);
    }
    ctx.quadraticCurveTo(tx, top + rx * 0.12, tx - rx, top);
    ctx.closePath();
  };
  cap();
  ctx.fillStyle = capFill(p, top - ry, top);
  ctx.fill();
  // A soft shine on the crown.
  ctx.save();
  cap();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.ellipse(tx - rx * 0.3, top - ry * 0.7, rx * 0.35, ry * 0.22, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  cap();
  warts(p, tx, top, rx, ry);
  cap();
  ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 22, 0.6);
  ctx.lineWidth = Math.max(0.4, r * 0.035);
  ctx.stroke();
}

/** A clump of mushrooms (or a fairy ring of them) that thickens as it grows. */
function drawMushroom(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const shape = look.cap ?? 'dome';
  const ring = !!look.ring;
  const n = Math.min(ring ? 11 : 7, Math.round(1 + sf * (ring ? 2.4 : 1.4)));
  const open = Math.min(1, 0.2 + sf * 0.3);
  const tall = shape === 'nodding' ? 1.5 : shape === 'shaggy' ? 1.0 : shape === 'honeycomb' ? 0.6 : shape === 'funnel' ? 0.85 : 0.8;
  const bodies = Array.from({ length: n }, (_, i) => {
    if (ring && n > 3) {
      const a = (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.3;
      const R = S * (0.3 + Math.min(4, sf) * 0.14);
      return { x: Math.cos(a) * R, y: Math.sin(a) * R * 0.42, k: 0.7 + rand() * 0.35 };
    }
    return i === 0 ? { x: 0, y: 0, k: 1 } : { x: (rand() - 0.5) * S * 0.75, y: (rand() - 0.5) * S * 0.18, k: 0.45 + rand() * 0.45 };
  }).sort((a, b) => a.y - b.y);
  for (const b of bodies) {
    const lean = (rand() - 0.5) * 0.6 + (b.x / S) * 0.4;
    withTransform(ctx, b.x, b.y, 0, () => mushroomBody(p, S * 0.62 * tall * b.k, S * 0.3 * b.k, open * (0.75 + b.k * 0.25), lean));
  }
}

/** One shelf fanning out sideways from the wood at the origin, seen a little from above: cap on top, gills (or pores) peeping out beneath. */
function shelf(p: Paint, rw: number, rd: number, side: number) {
  const { ctx, look, rand } = p;
  const wobs = Array.from({ length: 5 }, () => rand() * Math.PI * 2);
  const fan = (dy: number, k: number) => {
    ctx.beginPath();
    ctx.moveTo(0, dy - rd * 0.55 * k);
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + (i / steps) * Math.PI;
      const wob = 1 + Math.sin(a * 7 + wobs[0]) * 0.04 + Math.sin(a * 3 + wobs[1]) * 0.05;
      ctx.lineTo(side * Math.cos(a) * rw * k * wob, dy + Math.sin(a) * rd * k * wob);
    }
    ctx.lineTo(0, dy + rd * 0.55 * k);
    ctx.closePath();
  };
  // The underside, a little below the cap's edge.
  fan(rd * 0.32, 0.97);
  ctx.fillStyle = gillColor(look, -8);
  ctx.fill();
  ctx.save();
  fan(rd * 0.32, 0.97);
  ctx.clip();
  ctx.strokeStyle = gillColor(look, -26, 0.55);
  ctx.lineWidth = Math.max(0.3, rw * 0.025);
  ctx.beginPath();
  for (let i = 1; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI;
    ctx.moveTo(0, rd * 0.32);
    ctx.lineTo(side * Math.cos(a) * rw, rd * 0.32 + Math.sin(a) * rd);
  }
  ctx.stroke();
  ctx.restore();
  if (glowing(look)) {
    fan(rd * 0.32, 0.97);
    glowStroke(p, Math.max(0.6, rw * 0.06));
  }
  // The cap.
  fan(0, 1);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rw * 1.05);
  g.addColorStop(0, hsl(look.hue, look.sat, look.light - 14));
  g.addColorStop(0.75, hsl(look.hue, look.sat, look.light));
  g.addColorStop(1, hsl(look.hue, look.sat - 6, look.light + 12));
  ctx.fillStyle = g;
  ctx.fill();
  if (look.zoned) {
    // Bands out from where it holds on, alternating with the accent.
    ctx.save();
    fan(0, 1);
    ctx.clip();
    ctx.lineWidth = Math.max(0.6, rw * 0.1);
    for (let i = 6; i >= 1; i--) {
      ctx.strokeStyle = i % 2 ? hsl(look.accentHue, look.accentSat ?? 25, look.accentLight ?? 60, 0.85) : hsl(look.hue, look.sat + 8, look.light - 18, 0.8);
      ctx.beginPath();
      ctx.ellipse(0, 0, rw * (i / 6.3), rd * (i / 6.3), 0, -Math.PI / 2, Math.PI / 2, side < 0);
      ctx.stroke();
      if (glowing(look) && i % 2) glowStroke(p, Math.max(0.5, rw * 0.05));
    }
    ctx.restore();
  } else {
    // Fine radial streaks across the cap.
    ctx.save();
    fan(0, 1);
    ctx.clip();
    ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 10, 0.35);
    ctx.lineWidth = Math.max(0.3, rw * 0.02);
    ctx.beginPath();
    for (let i = 1; i < 8; i++) {
      const a = -Math.PI / 2 + (i / 8) * Math.PI;
      ctx.moveTo(0, 0);
      ctx.lineTo(side * Math.cos(a) * rw, Math.sin(a) * rd);
    }
    ctx.stroke();
    ctx.restore();
  }
  fan(0, 1);
  ctx.strokeStyle = hsl(look.hue, look.sat - 10, Math.min(96, look.light + 24), 0.85);
  ctx.lineWidth = Math.max(0.5, rw * 0.045);
  ctx.stroke();
}

/** A mossy stump with shelves of fungus tiered up it. */
function drawBracket(p: Paint) {
  const { ctx, rand, S, sf } = p;
  const sw = S * 0.22;
  const sh = S * (0.42 + Math.min(4, sf) * 0.1);
  const n = Math.min(9, Math.round(1 + sf * 1.8));
  // Higher shelves are drawn last: seen from a little above, each one lies over the one below.
  const shelves = Array.from({ length: n }, (_, i) => ({
    side: i % 2 ? 1 : -1,
    y: -sh * (0.12 + rand() * 0.8),
    rw: S * (0.24 + rand() * 0.12) * (0.8 + Math.min(4, sf) * 0.06),
  })).sort((a, b) => b.y - a.y);
  // They grow out from behind the stump, so it hides where they hold on.
  for (const s of shelves) withTransform(ctx, s.side * sw * 0.3, s.y, -s.side * 0.1, () => shelf(p, s.rw + sw * 0.7, (s.rw + sw * 0.7) * 0.38, s.side));
  // The stump: bark sides and a pale cut top with its rings.
  const g = ctx.createLinearGradient(-sw, 0, sw, 0);
  g.addColorStop(0, hsl(26, 28, 20));
  g.addColorStop(0.5, hsl(28, 30, 32));
  g.addColorStop(1, hsl(26, 28, 22));
  ctx.beginPath();
  ctx.moveTo(-sw * 1.2, 0);
  ctx.quadraticCurveTo(-sw, -sh * 0.2, -sw, -sh);
  ctx.lineTo(sw, -sh);
  ctx.quadraticCurveTo(sw, -sh * 0.2, sw * 1.25, 0);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = hsl(25, 25, 14, 0.5);
  ctx.lineWidth = Math.max(0.5, S * 0.012);
  ctx.beginPath();
  for (let i = -2; i <= 2; i++) {
    ctx.moveTo(i * sw * 0.36, -sh * 0.95);
    ctx.lineTo(i * sw * 0.4 + (rand() - 0.5) * sw * 0.2, -sh * 0.05);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, -sh, sw, sw * 0.32, 0, 0, Math.PI * 2);
  ctx.fillStyle = hsl(34, 35, 58);
  ctx.fill();
  ctx.strokeStyle = hsl(30, 30, 42, 0.7);
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.ellipse(0, -sh, sw * (i / 3.6), sw * 0.32 * (i / 3.6), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Moss at the foot.
  ctx.fillStyle = hsl(95, 40, 34, 0.85);
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.ellipse((rand() - 0.5) * sw * 2.2, -rand() * sh * 0.15, sw * (0.25 + rand() * 0.2), sw * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** One branch of coral fungus, forking until it ends in blunt tips. */
function coralBranch(p: Paint, len: number, w: number, depth: number) {
  const { ctx, look, rand } = p;
  const t = depth / 3;
  const col = hsl(look.hue, look.sat * (1 - t * 0.6), look.light + t * 18);
  stroke(ctx, col, w, () => {
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -len);
  });
  if (depth === 0) {
    ctx.fillStyle = hsl(look.hue, look.sat, Math.min(94, look.light + 10));
    ctx.beginPath();
    ctx.arc(0, -len, w * 0.62, 0, Math.PI * 2);
    ctx.fill();
    if (glowing(look)) {
      ctx.beginPath();
      ctx.arc(0, -len, w * 0.4, 0, Math.PI * 2);
      glowStroke(p, Math.max(0.6, w * 0.6));
    }
    return;
  }
  const forks = 2 + (rand() < 0.4 ? 1 : 0);
  for (let i = 0; i < forks; i++) {
    const a = (forks === 2 ? (i ? 1 : -1) * 0.38 : (i - 1) * 0.45) + (rand() - 0.5) * 0.2;
    withTransform(ctx, 0, -len, a, () => coralBranch(p, len * (0.68 + rand() * 0.12), w * 0.72, depth - 1));
  }
}

/** Lion's mane: a rounded mass with soft spines hanging in tiers from it. */
function maneLobe(p: Paint, r: number) {
  const { ctx, look, rand } = p;
  ctx.beginPath();
  ctx.ellipse(0, -r, r, r * 0.8, 0, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(-r * 0.3, -r * 1.3, 0, 0, -r, r * 1.2);
  g.addColorStop(0, hsl(look.hue, look.sat, Math.min(98, look.light + 6)));
  g.addColorStop(1, hsl(look.accentHue, look.accentSat ?? 25, look.accentLight ?? 80));
  ctx.fillStyle = g;
  ctx.fill();
  const rows = 4;
  for (let row = 0; row < rows; row++) {
    const y = -r * (1.25 - row * 0.32);
    const half = r * Math.sqrt(Math.max(0, 1 - Math.pow((y + r) / (r * 0.8), 2))) * 0.95;
    const n = 6 + row * 2;
    ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 4 - row * 3, 0.95);
    ctx.lineWidth = Math.max(0.5, r * 0.05);
    ctx.lineCap = 'round';
    ctx.beginPath();
    const tips: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const x = -half + (2 * half * (i + 0.5)) / n;
      const L = r * (0.28 + rand() * 0.18 + row * 0.04);
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * r * 0.04, y + L);
      tips.push([x, y + L]);
    }
    ctx.stroke();
    if (glowing(look)) {
      const [gh, gs, gl] = look.variegationColor!;
      ctx.save();
      ctx.fillStyle = hsl(gh, gs, gl);
      ctx.shadowColor = hsl(gh, gs, gl);
      ctx.shadowBlur = Math.max(1.5, r * 0.12);
      for (const [x, y] of tips) {
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.5, r * 0.035), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

/** Coral fungus (branching fingers) or lion's mane (hanging spines), clumping as it grows. */
function drawCoral(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  if (look.icicles) {
    const n = Math.min(4, 1 + Math.floor(sf * 0.8));
    const lobes = Array.from({ length: n }, (_, i) =>
      i === 0 ? { x: 0, y: 0, k: 1 } : { x: (rand() - 0.5) * S * 0.7, y: (rand() - 0.5) * S * 0.14, k: 0.55 + rand() * 0.3 }
    ).sort((a, b) => a.y - b.y);
    for (const l of lobes) withTransform(ctx, l.x, l.y - S * 0.08 * l.k, 0, () => maneLobe(p, S * 0.32 * l.k));
    return;
  }
  const n = Math.min(6, 1 + Math.round(sf * 1.1));
  const clumps = Array.from({ length: n }, (_, i) =>
    i === 0 ? { x: 0, y: 0, k: 1 } : { x: (rand() - 0.5) * S * 0.7, y: (rand() - 0.5) * S * 0.14, k: 0.55 + rand() * 0.35 }
  ).sort((a, b) => a.y - b.y);
  for (const c of clumps) {
    withTransform(ctx, c.x, c.y, 0, () => {
      // A thick pale base, branching up into the colour.
      stroke(ctx, gillColor(look, 0), S * 0.12 * c.k, () => {
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -S * 0.1 * c.k);
      });
      const trunks = 3;
      for (let i = 0; i < trunks; i++) {
        withTransform(ctx, 0, -S * 0.08 * c.k, (i - 1) * 0.42 + (rand() - 0.5) * 0.2, () => coralBranch(p, S * 0.22 * c.k, S * 0.07 * c.k, 3));
      }
    });
  }
}

// ------------------------------------------------------------ ground layer, clumps and climbers

/** Colour for one of a mat's tiny leaves: the look's green, jittered, now and then in its variegation colour. */
function tinyLeafColor(p: Paint, lift = 0): string {
  const { look, rand } = p;
  if (look.variegationColor && look.variegation !== 'none' && look.variegation !== 'glow' && rand() < 0.3) {
    const [h, s, l] = look.variegationColor;
    return hsl(h, s, l);
  }
  return hsl(look.hue + (rand() - 0.5) * 8, look.sat + (rand() - 0.5) * 8, look.light + lift + (rand() - 0.5) * 12);
}

/** A scatter of glowing specks over whatever is clipped (glowing forms only). */
function glowSpecks(p: Paint, n: number, x0: number, y0: number, w: number, h: number, r: number) {
  const { ctx, look, rand } = p;
  if (!glowing(look)) return;
  const [gh, gs, gl] = look.variegationColor!;
  ctx.save();
  ctx.fillStyle = hsl(gh, gs, gl);
  ctx.shadowColor = hsl(gh, gs, gl);
  ctx.shadowBlur = Math.max(1.5, r * 3);
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(x0 + rand() * w, y0 + rand() * h, Math.max(0.4, r), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** One springy cushion of moss, base at the origin. */
function mossCushion(p: Paint, r: number) {
  const { ctx, look, rand } = p;
  const h = r * 0.55;
  const dome = () => {
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.bezierCurveTo(-r * 0.95, -h * 1.3, r * 0.95, -h * 1.3, r, 0);
    ctx.quadraticCurveTo(0, r * 0.16, -r, 0);
    ctx.closePath();
  };
  const g = ctx.createLinearGradient(0, -h, 0, r * 0.1);
  g.addColorStop(0, hsl(look.accentHue, look.accentSat ?? 50, look.accentLight ?? 46));
  g.addColorStop(0.5, hsl(look.hue, look.sat, look.light));
  g.addColorStop(1, hsl(look.hue, look.sat, look.light - 12));
  dome();
  ctx.fillStyle = g;
  ctx.fill();
  // The texture: countless tiny shoots, lighter on the crown.
  ctx.save();
  dome();
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(0.35, r * 0.035);
  for (let i = 0; i < 46; i++) {
    const x = (rand() - 0.5) * 2 * r;
    const y = -rand() * h;
    ctx.strokeStyle = tinyLeafColor(p, y < -h * 0.5 ? 8 : -4);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * r * 0.08, y - r * 0.08);
    ctx.stroke();
  }
  glowSpecks(p, 14, -r, -h, 2 * r, h, r * 0.035);
  ctx.restore();
  dome();
  ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 18, 0.45);
  ctx.lineWidth = Math.max(0.4, r * 0.03);
  ctx.stroke();
  if (look.tufts) {
    // Haircap: stiff little stems standing up out of the cushion, each tipped with a star.
    for (let i = 0; i < 9; i++) {
      const x = (rand() - 0.5) * r * 1.5;
      const base = -h * (0.55 + rand() * 0.35) * (1 - Math.abs(x) / (r * 1.1));
      const top = base - r * (0.18 + rand() * 0.14);
      stroke(ctx, hsl(look.hue, look.sat, look.light - 6), Math.max(0.35, r * 0.03), () => {
        ctx.moveTo(x, base);
        ctx.lineTo(x, top);
      });
      ctx.strokeStyle = hsl(look.hue, look.sat + 8, look.light + 10);
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        ctx.moveTo(x, top);
        ctx.lineTo(x + Math.cos(a) * r * 0.07, top + Math.sin(a) * r * 0.045);
      }
      ctx.stroke();
    }
  }
}

/** Moss: low cushions that merge into a patch as it grows. No stem, no pot-plant shape: just ground. */
function drawMoss(p: Paint) {
  const { ctx, rand, S, sf } = p;
  const n = Math.min(8, 1 + Math.round(sf * 1.6));
  const spread = S * (0.12 + Math.min(4.6, sf) * 0.15);
  const cushions = Array.from({ length: n }, (_, i) =>
    i === 0 ? { x: 0, y: 0, k: 1 } : { x: (rand() - 0.5) * 2 * spread, y: (rand() - 0.5) * spread * 0.35, k: 0.5 + rand() * 0.45 }
  ).sort((a, b) => a.y - b.y);
  for (const c of cushions) withTransform(ctx, c.x, c.y, 0, () => mossCushion(p, S * 0.3 * c.k));
}

/** Creeping thyme: a flat, irregular mat of tiny leaves over wiry stems, hugging the ground. */
function drawMat(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const rx = S * (0.2 + Math.min(4.6, sf) * 0.15);
  const ry = rx * 0.34;
  const h = S * 0.1;
  const wob = Array.from({ length: 4 }, () => rand() * Math.PI * 2);
  const edge = (a: number) => 0.84 + Math.sin(a * 3 + wob[0]) * 0.08 + Math.sin(a * 5 + wob[1]) * 0.06;
  ctx.beginPath();
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const k = edge(a);
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * ry * k - (Math.sin(a) < 0 ? h * -Math.sin(a) : 0);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = hsl(look.hue, look.sat, look.light - 12);
  ctx.fill();
  // Wiry stems poking out at the edge.
  ctx.strokeStyle = hsl(look.accentHue, look.accentSat ?? 30, look.accentLight ?? 32, 0.8);
  ctx.lineWidth = Math.max(0.35, S * 0.008);
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = rand() * Math.PI * 2;
    const k = edge(a);
    ctx.moveTo(Math.cos(a) * rx * k * 0.8, Math.sin(a) * ry * k * 0.8);
    ctx.lineTo(Math.cos(a) * rx * (k + 0.12), Math.sin(a) * ry * (k + 0.12));
  }
  ctx.stroke();
  // The leaves: a dense pile of tiny ovals, higher toward the middle.
  const n = Math.min(240, 50 + Math.round(sf * 42));
  const leaves = Array.from({ length: n }, () => {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * edge(a);
    return { x: Math.cos(a) * rx * d, y: Math.sin(a) * ry * d - h * (1 - d * d), a: rand() * Math.PI };
  }).sort((a, b) => a.y - b.y);
  const lr = S * 0.026;
  for (const l of leaves) {
    ctx.fillStyle = tinyLeafColor(p, l.y < -h * 0.4 ? 6 : 0);
    ctx.beginPath();
    ctx.ellipse(l.x, l.y, lr, lr * 0.55, l.a, 0, Math.PI * 2);
    ctx.fill();
  }
  if (look.hairy) {
    ctx.fillStyle = 'rgba(245,245,240,0.45)';
    for (let i = 0; i < n * 0.4; i++) {
      const l = leaves[Math.floor(rand() * leaves.length)];
      ctx.beginPath();
      ctx.arc(l.x + (rand() - 0.5) * lr, l.y - lr * 0.3, lr * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  glowSpecks(p, Math.round(n * 0.15), -rx * 0.8, -h - ry * 0.6, rx * 1.6, ry * 1.4 + h, lr * 0.4);
}

/** One clover leaf seen from a little above: three (or four) notched leaflets, each with its chevron. */
function cloverLeaf(p: Paint, Lf: number) {
  const { ctx, look, rand } = p;
  const count = look.fourLeaf ? 4 : 3;
  const turn = rand() * Math.PI * 2;
  ctx.save();
  ctx.scale(1, 0.6);
  for (let i = 0; i < count; i++) {
    const a = turn + (i / count) * Math.PI * 2;
    withTransform(ctx, 0, 0, a + Math.PI / 2, () =>
      withTransform(ctx, 0, -Lf, Math.PI, () => {
        // A heart turned round: the notch out at the rim, the point at the stalk.
        const W = Lf * 0.62;
        leafPath(ctx, 'heart', Lf, W, 0);
        ctx.fillStyle = leafFill(p, Lf);
        ctx.fill();
        leafPath(ctx, 'heart', Lf, W, 0);
        ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 18, 0.5);
        ctx.lineWidth = Math.max(0.35, Lf * 0.05);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-W * 0.55, -Lf * 0.28);
        ctx.lineTo(0, -Lf * 0.55);
        ctx.lineTo(W * 0.55, -Lf * 0.28);
        ctx.strokeStyle = hsl(look.accentHue, look.accentSat ?? 25, look.accentLight ?? 74, 0.85);
        ctx.lineWidth = Math.max(0.4, Lf * 0.13);
        ctx.lineCap = 'round';
        ctx.stroke();
        glowStroke(p, Math.max(0.4, Lf * 0.1));
      })
    );
  }
  ctx.restore();
}

/** Clover: a low, spreading carpet of leaves on short stalks of different heights. */
function drawTrefoil(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const n = Math.min(26, 3 + Math.round(sf * 5));
  const rx = S * (0.1 + Math.min(4.6, sf) * 0.15);
  const ry = rx * 0.38;
  const leaves = Array.from({ length: n }, (_, i) => {
    const a = rand() * Math.PI * 2;
    const d = i === 0 ? 0 : Math.sqrt(rand());
    return { x: Math.cos(a) * rx * d, y: Math.sin(a) * ry * d, h: S * (0.08 + rand() * 0.18), L: S * (0.09 + rand() * 0.035) };
  }).sort((a, b) => a.y - b.y);
  for (const l of leaves) {
    stroke(ctx, stemColor(look, 10), Math.max(0.4, S * 0.01), () => {
      ctx.moveTo(l.x, l.y);
      ctx.quadraticCurveTo(l.x + (rand() - 0.5) * S * 0.05, l.y - l.h * 0.5, l.x, l.y - l.h);
    });
    withTransform(ctx, l.x, l.y - l.h, 0, () => cloverLeaf(p, l.L));
  }
}

/** One round leaf for creeping jenny, attached at the origin. */
function coinLeaf(p: Paint, L: number, dim: number) {
  leaf(p, { shape: 'oval', L, W: L * 0.5, dim, midrib: false });
}

/** Creeping jenny: flat stems running out over the ground (or spilling down from a pot), strung with pairs of round leaves. */
function drawRunner(p: Paint) {
  const { ctx, look, rand, S, sf, mode } = p;
  const stems = Math.min(9, Math.round(2 + sf * 1.5));
  const paths: [number, number][][] = [];
  for (let i = 0; i < stems; i++) {
    const len = S * (0.35 + sf * 0.3) * (0.5 + rand() * 0.6) * (mode === 'hanging' ? 1.3 : 1);
    const pts: [number, number][] = [];
    if (mode === 'ground') {
      // Flat to the ground, wandering: a loose, low tangle of runners.
      const a = (i / stems) * Math.PI * 2 + (rand() - 0.5) * 1.1;
      const bend = (rand() - 0.5) * 1.6;
      for (let t = 0; t <= 1.001; t += 0.12) {
        const aa = a + bend * t;
        pts.push([Math.cos(aa) * len * t, Math.sin(aa) * len * t * 0.36]);
      }
    } else {
      const side = i % 2 === 0 ? -1 : 1;
      const sx = side * S * (0.08 + rand() * 0.14);
      for (let t = 0; t <= 1.001; t += 0.12) pts.push([sx + side * S * 0.12 * Math.sin(t * 2.2) + Math.sin(t * 6 + i) * S * 0.015, -S * 0.02 + len * t]);
    }
    paths.push(pts);
  }
  const leafL = S * 0.125;
  // Back runners (those heading away) first.
  paths.sort((a, b) => a[a.length - 1][1] - b[b.length - 1][1]);
  for (const pts of paths) {
    stroke(ctx, stemColor(look, -2), Math.max(0.5, S * 0.012), () => {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts) ctx.lineTo(x, y);
    });
    for (let k = 1; k < pts.length; k++) {
      const [x, y] = pts[k];
      const [px, py] = pts[k - 1];
      const along = Math.atan2(y - py, x - px);
      const L = leafL * (1 - (k / pts.length) * 0.35);
      // A pair at every node, one each side, angled a little forward along the runner.
      for (const side of [-1, 1]) withTransform(ctx, x, y, along + side * 1.3 + Math.PI / 2, () => coinLeaf(p, L, side > 0 ? 4 : 0));
    }
  }
  // A little tuft of leaves where it roots.
  for (let i = 0; i < 6; i++) withTransform(ctx, (rand() - 0.5) * S * 0.08, -S * 0.02, (rand() - 0.5) * 2.4, () => coinLeaf(p, leafL, 0));
}

/** One Virginia creeper leaf: five toothed leaflets held out like a hand from the end of the stalk. */
function creeperLeaf(p: Paint, size: number, dim: number) {
  const fan = [-1.15, -0.58, 0, 0.58, 1.15];
  const len = [0.6, 0.85, 1, 0.85, 0.6];
  fan.forEach((a, i) => withTransform(p.ctx, 0, 0, a, () => leaf(p, { shape: 'lance', L: size * len[i], W: size * len[i] * 0.3, dim: dim + (i === 2 ? 0 : 3) })));
}

/** Virginia creeper: a vine of five-leaflet hands, scrambling over the ground or hanging (and, on a trellis, climbing). */
function drawClimber(p: Paint) {
  const { ctx, look, rand, S, sf, mode } = p;
  const vines = Math.min(7, Math.round(2 + sf * 1.2));
  const leafS = S * 0.34;
  const all: { x: number; y: number; a: number; s: number; dim: number }[] = [];
  for (let i = 0; i < vines; i++) {
    const len = S * (0.4 + sf * 0.3) * (0.7 + rand() * 0.4) * (mode === 'hanging' ? 1.35 : 1);
    const pts: [number, number][] = [];
    if (mode === 'ground') {
      // Scrambling: arching low and outward, a couple reaching up looking for something to climb.
      const up = i < 2;
      const dir = i % 2 ? 1 : -1;
      const ex = dir * len * (up ? 0.35 : 0.9);
      const ey = up ? -len * 0.75 : (rand() - 0.3) * len * 0.3;
      const cx = dir * len * 0.3;
      const cy = up ? -len * 0.5 : -len * 0.3;
      for (let t = 0; t <= 1.001; t += 0.1) {
        const u = 1 - t;
        pts.push([2 * u * t * cx + t * t * ex, 2 * u * t * cy + t * t * ey]);
      }
    } else {
      const side = i % 2 === 0 ? -1 : 1;
      const sx = side * S * (0.1 + rand() * 0.18);
      for (let t = 0; t <= 1.001; t += 0.1) pts.push([sx + side * S * 0.18 * Math.sin(t * 2) + Math.sin(t * 5 + i) * S * 0.03, -S * 0.02 + len * t]);
    }
    stroke(ctx, hsl(look.accentHue, 35, 28), Math.max(0.6, S * 0.014), () => {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts) ctx.lineTo(x, y);
    });
    for (let k = 2; k < pts.length; k += 3) {
      const [x, y] = pts[k];
      const side = (k / 3) % 2 < 1 ? 1 : -1;
      // Leaves held up toward the light on the ground, out to the sides when it hangs.
      const a = mode === 'ground' ? side * (0.5 + rand() * 0.4) : side * (1.2 + rand() * 0.5);
      all.push({ x, y, a, s: leafS * (0.75 + rand() * 0.3) * (1 - k * 0.025), dim: k % 4 ? 3 : 0 });
    }
  }
  for (const l of all) {
    const px = l.x + Math.sin(l.a) * l.s * 0.3;
    const py = l.y - Math.cos(l.a) * l.s * 0.3;
    stroke(ctx, stemColor(look, 4), Math.max(0.4, S * 0.009), () => {
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(px, py);
    });
    withTransform(ctx, px, py, l.a, () => creeperLeaf(p, l.s, l.dim));
  }
}

/** One broad hosta leaf with its deep parallel ribs, attached at the origin. */
function hostaLeaf(p: Paint, L: number, W: number, dim: number) {
  const { ctx, look } = p;
  leaf(p, { shape: 'heart', L, W, dim, midrib: true });
  ctx.save();
  leafPath(ctx, 'heart', L, W, 0);
  ctx.clip();
  ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 16 - dim, 0.5);
  ctx.lineWidth = Math.max(0.4, W * 0.035);
  ctx.beginPath();
  for (const s of [-1, 1]) {
    for (let k = 1; k <= 4; k++) {
      const f = k / 4;
      ctx.moveTo(0, -L * 0.04);
      ctx.quadraticCurveTo(s * W * 1.1 * f, -L * (0.3 + f * 0.1), s * W * 0.3 * f, -L * (0.86 + f * 0.04));
    }
  }
  ctx.stroke();
  ctx.restore();
}

/** Hosta: a wide, low mound of broad ribbed leaves arching out from the crown. */
function drawClump(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const n = Math.min(14, Math.round(3 + sf * 2.4));
  const leaves = Array.from({ length: n }, () => {
    const a = (rand() - 0.5) * 2.7;
    return { a, stalk: S * (0.14 + rand() * 0.14) * (1 - Math.abs(a) * 0.2), L: S * (0.4 + rand() * 0.14) };
  }).sort((x, y) => Math.abs(x.a) - Math.abs(y.a));
  for (const l of leaves) {
    const tx = Math.sin(l.a) * l.stalk;
    const ty = -Math.cos(l.a) * l.stalk;
    stroke(ctx, stemColor(look, 6), Math.max(0.6, S * 0.022), () => {
      ctx.moveTo(0, 0);
      ctx.lineTo(tx, ty);
    });
    // Outer leaves lie out flatter, and nearer the eye, so they're drawn last.
    withTransform(ctx, tx, ty, l.a * 1.2, () => hostaLeaf(p, l.L, l.L * 0.42 * (look.leafWidth ?? 1), Math.abs(l.a) < 0.5 ? 6 : 0));
  }
}

/** One spray of narrow bamboo leaves hanging from a twig end. */
function bambooSpray(p: Paint, side: number, L: number) {
  const n = 3 + Math.floor(p.rand() * 3);
  for (let i = 0; i < n; i++) {
    const a = side * (1.5 + (i / n) * 0.9 + (p.rand() - 0.5) * 0.2);
    withTransform(p.ctx, 0, 0, a, () => leaf(p, { shape: 'lance', L: L * (0.8 + p.rand() * 0.3), W: L * 0.12, dim: i % 2 ? 4 : 0 }));
  }
}

/** Bamboo: a stand of tall jointed canes, sprays of narrow leaves at the upper nodes. The tallest thing you can plant. */
function drawBamboo(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const n = Math.min(7, 1 + Math.round(sf * 1.4));
  const culms = Array.from({ length: n }, (_, i) => ({
    x: i === 0 ? 0 : (rand() - 0.5) * S * 0.7,
    h: S * (0.55 + Math.min(4.6, sf) * 0.42) * (i === 0 ? 1 : 0.7 + rand() * 0.3),
    lean: (rand() - 0.5) * 0.1,
  })).sort((a, b) => a.h - b.h);
  const culmCol = (dl: number) => hsl(look.accentHue, look.accentSat ?? 40, (look.accentLight ?? 42) + dl);
  for (const c of culms) {
    withTransform(ctx, c.x, 0, c.lean + (c.x / S) * 0.08, () => {
      const w = S * 0.045;
      const seg = S * 0.24;
      const nodes = Math.max(2, Math.round(c.h / seg));
      // The cane, shaded round, then its nodes.
      const g = ctx.createLinearGradient(-w, 0, w, 0);
      g.addColorStop(0, culmCol(-12));
      g.addColorStop(0.4, culmCol(8));
      g.addColorStop(1, culmCol(-8));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-w, 0);
      ctx.lineTo(-w * 0.75, -c.h);
      ctx.lineTo(w * 0.75, -c.h);
      ctx.lineTo(w, 0);
      ctx.closePath();
      ctx.fill();
      for (let k = 1; k <= nodes; k++) {
        const y = -(c.h * k) / nodes;
        const ww = w * (1 - (k / nodes) * 0.25);
        ctx.beginPath();
        ctx.moveTo(-ww * 1.1, y);
        ctx.lineTo(ww * 1.1, y);
        ctx.strokeStyle = culmCol(-20);
        ctx.lineWidth = Math.max(0.6, w * 0.32);
        ctx.stroke();
        if (glowing(look)) glowStroke(p, Math.max(0.6, w * 0.25));
        ctx.strokeStyle = culmCol(16);
        ctx.lineWidth = Math.max(0.4, w * 0.12);
        ctx.beginPath();
        ctx.moveTo(-ww, y + w * 0.3);
        ctx.lineTo(ww, y + w * 0.3);
        ctx.stroke();
        // Twigs and leaf sprays from the upper nodes, alternating sides.
        if (k / nodes < 0.4 && nodes > 3) continue;
        const side = k % 2 ? 1 : -1;
        const tx = side * S * (0.1 + rand() * 0.06);
        const ty = y - S * 0.06;
        stroke(ctx, culmCol(-6), Math.max(0.4, w * 0.25), () => {
          ctx.moveTo(0, y);
          ctx.lineTo(tx, ty);
        });
        withTransform(ctx, tx, ty, 0, () => bambooSpray(p, side, S * 0.2));
      }
      withTransform(ctx, 0, -c.h, 0, () => {
        bambooSpray(p, 1, S * 0.18);
        bambooSpray(p, -1, S * 0.18);
      });
    });
  }
}

const FORM_DRAW: Record<PlantForm, (p: Paint) => void> = {
  fern: drawFern,
  splitleaf: drawSplitleaf,
  heart: drawHeart,
  trailing: drawTrailing,
  strappy: drawStrappy,
  spear: drawSpear,
  rosette: drawRosette,
  coin: drawCoin,
  patterned: drawPatterned,
  beads: drawBeads,
  bloom: drawBloom,
  column: drawColumn,
  globe: drawGlobe,
  paddle: drawPaddle,
  jade: drawJade,
  spiky: drawSpiky,
  stones: drawStones,
  palmate: drawPalmate,
  trap: drawTrap,
  dew: drawDew,
  pitcher: drawPitcher,
  cups: drawCups,
  fig: drawFig,
  fan: drawFan,
  palm: drawPalm,
  cane: drawCane,
  mushroom: drawMushroom,
  bracket: drawBracket,
  coral: drawCoral,
  moss: drawMoss,
  mat: drawMat,
  trefoil: drawTrefoil,
  runner: drawRunner,
  climber: drawClimber,
  clump: drawClump,
  bamboo: drawBamboo,
};

/**
 * Draws a plant with its base at (0,0) of the current transform.
 * `unit` is pixels per tile.
 */
export function paintPlant(ctx: CanvasRenderingContext2D, defId: string, variantId: string, sf: number, seed: number, unit: number, mode: PlantMode) {
  const def = PLANTS[defId];
  if (!def) return;
  const look = lookFor(defId, variantId);
  const S = unit * look.size * stageScale(sf) * 0.62;
  const p: Paint = { ctx, look, rand: mulberry32(seed * 7919 + 13), unit, S, sf, mode };
  ctx.save();
  FORM_DRAW[def.form](p);
  ctx.restore();
}

/** Bounding box (in units of S) each form needs around its base. */
function extent(form: PlantForm, mode: PlantMode): { w: number; up: number; down: number } {
  const trailing = form === 'trailing' || form === 'beads';
  if (trailing && mode === 'ground') return { w: 2.6, up: 1.2, down: 1.3 };
  if (trailing) return { w: 1.4, up: 1.1, down: mode === 'hanging' ? 3.4 : 2.6 };
  if (form === 'strappy') return { w: 1.9, up: 1.5, down: mode === 'ground' ? 0.4 : 0.9 };
  if (form === 'fern') return { w: 1.8, up: 1.4, down: 0.6 };
  if (form === 'coin') return { w: 1.2, up: 1.5, down: 0.4 };
  if (form === 'paddle' || form === 'jade' || form === 'spiky') return { w: 1.6, up: 1.6, down: 0.4 };
  if (form === 'stones') return { w: 1.0, up: 0.9, down: 0.4 };
  if (form === 'palmate') return { w: 1.5, up: 2.35, down: 0.4 };
  if (form === 'trap') return { w: 1.3, up: 1.0, down: 0.4 };
  if (form === 'dew') return { w: 1.3, up: 1.6, down: 0.4 };
  if (form === 'pitcher') return { w: 1.2, up: 2.1, down: 0.4 };
  if (form === 'fig') return { w: 1.5, up: 2.5, down: 0.4 };
  if (form === 'cups') return { w: 1.7, up: 1.6, down: mode === 'ground' ? 0.5 : 1.4 };
  if (form === 'fan') return { w: 1.7, up: 2.4, down: 0.4 };
  if (form === 'palm') return { w: 1.9, up: 2.3, down: 0.4 };
  if (form === 'cane') return { w: 2.0, up: 2.3, down: 0.5 };
  if (form === 'mushroom') return { w: 1.5, up: 1.8, down: 0.5 };
  if (form === 'bracket') return { w: 1.5, up: 1.4, down: 0.4 };
  if (form === 'coral') return { w: 1.3, up: 1.4, down: 0.4 };
  if (form === 'moss') return { w: 1.4, up: 0.7, down: 0.4 };
  if (form === 'mat') return { w: 1.2, up: 0.6, down: 0.45 };
  if (form === 'trefoil') return { w: 1.0, up: 0.8, down: 0.45 };
  if (form === 'runner') return mode === 'ground' ? { w: 1.9, up: 0.8, down: 0.8 } : { w: 1.3, up: 0.6, down: mode === 'hanging' ? 2.8 : 2.2 };
  if (form === 'climber') return mode === 'ground' ? { w: 1.9, up: 1.9, down: 0.6 } : { w: 1.6, up: 1.0, down: mode === 'hanging' ? 3.0 : 2.4 };
  if (form === 'clump') return { w: 1.6, up: 1.3, down: 0.4 };
  if (form === 'bamboo') return { w: 1.2, up: 3.1, down: 0.4 };
  return { w: 1.35, up: 1.6, down: 0.5 };
}

export interface PlantSprite {
  canvas: HTMLCanvasElement;
  /** Anchor (plant base) inside the sprite, in CSS pixels. */
  ox: number;
  oy: number;
  w: number;
  h: number;
}

export class PlantSpriteCache {
  private map = new Map<string, PlantSprite>();
  /** The last sprite built for each plant at any zoom: stands in, scaled, while a new size is built. */
  private anySize = new Map<string, { sprite: PlantSprite; unit: number }>();
  private pixels = 0;
  private budget = 26_000_000;
  private builtThisFrame = 0;
  maxBuildsPerFrame = 28;

  beginFrame() {
    this.builtThisFrame = 0;
  }

  get(defId: string, variantId: string, sf: number, seed: number, unit: number, mode: PlantMode, dpr: number): PlantSprite | null {
    const def = PLANTS[defId];
    if (!def) return null;
    const sfB = Math.round(Math.min(4.6, sf) * 3) / 3;
    const seedB = seed % 5;
    const unitB = Math.max(8, Math.round(unit / 4) * 4);
    // Match the world canvas density exactly; a lower-res sprite stretched up reads as blur.
    const scale = dpr;
    const key = `${defId}|${variantId}|${sfB}|${seedB}|${unitB}|${mode}|${scale}`;
    const hit = this.map.get(key);
    if (hit) {
      // Refresh LRU position.
      this.map.delete(key);
      this.map.set(key, hit);
      return hit;
    }
    const sizeless = `${defId}|${variantId}|${sfB}|${seedB}|${mode}|${scale}`;
    if (this.builtThisFrame >= this.maxBuildsPerFrame) {
      // Out of build budget this frame (mid-pinch, say): draw the nearest size
      // we have, scaled, rather than let the plant blink out.
      const other = this.anySize.get(sizeless);
      if (!other) return null;
      const f = unitB / other.unit;
      const o = other.sprite;
      return { canvas: o.canvas, ox: o.ox * f, oy: o.oy * f, w: o.w * f, h: o.h * f };
    }
    this.builtThisFrame++;

    const look = lookFor(defId, variantId);
    const S = unitB * look.size * stageScale(sfB) * 0.62;
    const e = extent(def.form, mode);
    const pad = 4;
    const w = Math.ceil(S * e.w * 2 + pad * 2);
    const h = Math.ceil(S * (e.up + e.down) + pad * 2);
    const ox = w / 2;
    const oy = S * e.up + pad;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(w * scale));
    canvas.height = Math.max(1, Math.ceil(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(scale, 0, 0, scale, ox * scale, oy * scale);
    paintPlant(ctx, defId, variantId, sfB, seedB + 1, unitB, mode);
    const sprite: PlantSprite = { canvas, ox, oy, w, h };
    this.map.set(key, sprite);
    this.anySize.set(sizeless, { sprite, unit: unitB });
    this.pixels += canvas.width * canvas.height;
    while (this.pixels > this.budget && this.map.size > 1) {
      const oldest = this.map.keys().next().value as string;
      const old = this.map.get(oldest)!;
      this.pixels -= old.canvas.width * old.canvas.height;
      this.map.delete(oldest);
      // Let the stand-in go too, if it was this one (key minus its size field).
      const parts = oldest.split('|');
      parts.splice(4, 1);
      const sizeless = parts.join('|');
      if (this.anySize.get(sizeless)?.sprite === old) this.anySize.delete(sizeless);
    }
    return sprite;
  }
}

/**
 * Renders a plant portrait into a canvas element for the UI (collection
 * cards, basket rows). A silhouette is a dark shape only — enough to make
 * you wonder what it is.
 */
export function drawPortrait(canvas: HTMLCanvasElement, defId: string, variantId: string, sf: number, seed: number, silhouette = false) {
  const ctx = canvas.getContext('2d');
  const def = PLANTS[defId];
  if (!ctx || !def) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cssW = canvas.clientWidth || canvas.width;
  const cssH = canvas.clientHeight || canvas.height;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  // Paint at a generous size offscreen, then crop to the pixels the plant
  // actually covers, so every form — a sprawling vine or a tidy rosette —
  // is framed snugly in the card. A fresh cutting is framed as if slightly
  // bigger, so it reads as a small plant rather than filling the card.
  const unit = 90;
  const look = lookFor(defId, variantId);
  const e = extent(def.form, 'ground');
  const S = unit * look.size * stageScale(sf) * 0.62;
  const Sref = unit * look.size * stageScale(Math.max(sf, 1.6)) * 0.62;
  const w = Math.ceil(Sref * e.w * 2 + 20);
  const h = Math.ceil(Sref * (e.up + e.down) + 20);
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d');
  if (!octx) return;
  octx.translate(w / 2, Sref * e.up + 10);
  paintPlant(octx, defId, variantId, sf, seed, unit, 'ground');
  const data = octx.getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (x1 <= x0 || y1 <= y0) return;
  // Growth shows as size: scale relative to the reference framing.
  const boxW = x1 - x0 + 1;
  const boxH = y1 - y0 + 1;
  const growScale = Math.min(1, S / Sref) * 0.35 + 0.65;
  const fit = Math.min((canvas.width * 0.92) / boxW, (canvas.height * 0.92) / boxH) * (sf < 1.6 ? growScale : 1);
  const dw = boxW * fit;
  const dh = boxH * fit;
  const dx = (canvas.width - dw) / 2;
  const dy = (canvas.height - dh) / 2 + (canvas.height - dh) * 0.2;
  // The pass above only measures. Stretching its bitmap to fit would blur
  // thin forms and young cuttings (their crop is tiny), so paint the plant
  // again straight onto the card at the final scale — the art is all vector
  // paths, so it stays crisp at any size.
  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, dw, dh);
  ctx.clip();
  ctx.translate(dx - x0 * fit, dy - y0 * fit);
  ctx.scale(fit, fit);
  ctx.translate(w / 2, Sref * e.up + 10);
  paintPlant(ctx, defId, variantId, sf, seed, unit, 'ground');
  ctx.restore();
  if (silhouette) {
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = 'rgba(60,48,32,0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
  }
}
