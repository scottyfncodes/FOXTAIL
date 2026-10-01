import { FLAGSTONE, STONES_PER_PIECE } from '../data/decor';
import { koiVariety } from '../systems/koi';

// Small pieces of garden art shared between the world and the UI: stepping
// stones (cut to the house's own flagstones), koi, and the stall's sign.

type Ctx = CanvasRenderingContext2D;

/** One flagstone at (x, y) on screen, `tile` pixels per tile; `i` picks its shade and tilt, as along the house path. */
export function drawFlagstone(ctx: Ctx, x: number, y: number, tile: number, i: number) {
  ctx.fillStyle = FLAGSTONE.colors[i % 2];
  ctx.beginPath();
  ctx.ellipse(x, y, tile * FLAGSTONE.rx, tile * FLAGSTONE.ry, 0.1 * (i % 3), 0, Math.PI * 2);
  ctx.fill();
}

/** Where each stone of a piece sits, in tiles from the piece's point: along the run, zigzagging across it like the house path. */
export function stonePositions(turned: boolean): { dx: number; dy: number }[] {
  const out: { dx: number; dy: number }[] = [];
  for (let k = 0; k < STONES_PER_PIECE; k++) {
    const along = (k - (STONES_PER_PIECE - 1) / 2) * FLAGSTONE.spacing;
    const across = FLAGSTONE.stagger[k % 2];
    out.push(turned ? { dx: across, dy: along } : { dx: along, dy: across });
  }
  return out;
}

/** A piece of stepping stones centred at (x, y) on screen: the same stones, the same size, wherever it's drawn. */
export function drawSteppingStonePiece(ctx: Ctx, x: number, y: number, tile: number, turned: boolean) {
  stonePositions(turned).forEach((p, k) => drawFlagstone(ctx, x + p.dx * tile, y + p.dy * tile, tile, k));
}

/**
 * A koi seen from above at (x, y), `len` pixels long, heading `heading`
 * (0 = down the screen). Its markings come from its seed, so each one is
 * its own; `alpha` lets water show through it.
 */
export function drawKoi(ctx: Ctx, x: number, y: number, heading: number, len: number, variety: string, seed: number, now: number, alpha = 0.85) {
  const v = koiVariety(variety);
  const W = len * 0.2;
  const L = len / 2;
  const sway = Math.sin(now * 0.006 + seed) * 0.35;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(heading);
  // Tail, flicking side to side.
  ctx.save();
  ctx.translate(0, -L * 0.7);
  ctx.rotate(sway);
  ctx.fillStyle = v.base;
  ctx.globalAlpha *= 0.85;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-W * 1.3, -L * 0.35, -W * 0.9, -L * 0.55);
  ctx.quadraticCurveTo(0, -L * 0.38, W * 0.9, -L * 0.55);
  ctx.quadraticCurveTo(W * 1.3, -L * 0.35, 0, 0);
  ctx.fill();
  ctx.restore();
  // Pectoral fins.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * W * 1.05, L * 0.35, W * 0.55, W * 0.28, s * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(0, L);
    ctx.bezierCurveTo(W * 1.25, L * 0.85, W * 1.1, -L * 0.3, 0, -L * 0.78);
    ctx.bezierCurveTo(-W * 1.1, -L * 0.3, -W * 1.25, L * 0.85, 0, L);
    ctx.closePath();
  };
  body();
  ctx.fillStyle = v.base;
  ctx.fill();
  ctx.save();
  body();
  ctx.clip();
  // Markings: a few blobs where this fish's seed puts them.
  let r = seed % 233280;
  const rand = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  if (v.headSpot) {
    ctx.fillStyle = v.patches[0];
    ctx.beginPath();
    ctx.arc(0, L * 0.55, W * 0.6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    v.patches.forEach((c, pi) => {
      ctx.fillStyle = c;
      const n = pi === 0 ? 2 + Math.floor(rand() * 2) : 1 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.ellipse((rand() - 0.5) * W * 1.2, L * (0.7 - rand() * 1.3), W * (pi === 0 ? 0.55 + rand() * 0.45 : 0.22 + rand() * 0.2), L * (pi === 0 ? 0.22 + rand() * 0.2 : 0.08 + rand() * 0.08), rand() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }
  if (v.sheen) {
    const g = ctx.createLinearGradient(-W, 0, W, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,250,220,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-W * 1.2, -L, W * 2.4, L * 2);
  }
  ctx.restore();
  body();
  ctx.strokeStyle = 'rgba(20,30,30,0.35)';
  ctx.lineWidth = Math.max(0.5, len * 0.02);
  ctx.stroke();
  ctx.restore();
}

export const MARKET_SIGN_TEXT = 'PLANT MARKET';

/**
 * The stall's sign: a painted plank on two short hangers above the canopy,
 * centred at `cx`, its bottom edge at `bottom`, about as wide as the stall.
 */
export function drawMarketSign(ctx: Ctx, cx: number, bottom: number, width: number, tile: number) {
  const h = tile * 0.26;
  const w = width;
  const x0 = cx - w / 2;
  const y0 = bottom - h;
  // Hangers down to the canopy.
  ctx.fillStyle = '#4a3320';
  ctx.fillRect(x0 + w * 0.12, bottom - tile * 0.02, tile * 0.04, tile * 0.08);
  ctx.fillRect(x0 + w * 0.88 - tile * 0.04, bottom - tile * 0.02, tile * 0.04, tile * 0.08);
  // The plank, with a darker edge and a lighter grain line.
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(x0 + tile * 0.03, y0 + tile * 0.03, w, h);
  ctx.fillStyle = '#6b4a2e';
  ctx.fillRect(x0, y0, w, h);
  ctx.strokeStyle = '#3f2b1a';
  ctx.lineWidth = Math.max(1, tile * 0.025);
  ctx.strokeRect(x0, y0, w, h);
  ctx.strokeStyle = 'rgba(160,120,80,0.45)';
  ctx.lineWidth = Math.max(0.5, tile * 0.01);
  ctx.beginPath();
  ctx.moveTo(x0 + tile * 0.06, y0 + h * 0.3);
  ctx.lineTo(x0 + w - tile * 0.06, y0 + h * 0.32);
  ctx.stroke();
  // The lettering, sized to the plank.
  let size = h * 0.62;
  ctx.font = `700 ${size}px Georgia, 'Times New Roman', serif`;
  const fit = (w - tile * 0.16) / Math.max(1, ctx.measureText(MARKET_SIGN_TEXT).width || 1);
  if (fit < 1) {
    size *= fit;
    ctx.font = `700 ${size}px Georgia, 'Times New Roman', serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f4e8c8';
  ctx.fillText(MARKET_SIGN_TEXT, cx, y0 + h * 0.54);
  return { x: x0, y: y0, w, h };
}
