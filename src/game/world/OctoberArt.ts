import type { Camera } from '../engine/Camera';
import { TILE_SIZE, HOUSE_FOOTPRINT, HOUSE_DOOR, GREENHOUSE_FOOTPRINT } from '../data/worldMap';
import type { ZoneId } from '../types';
import { FOG_BANKS, MOONLIT, PUMPKIN_PATCH, PORCH_LANTERN, type FaceId, type OldThingKind } from '../data/october';
import { eventAlpha, eventPos, type GhostState, type OctoberEvent } from '../systems/october';

// October's look, drawn over and under the ordinary valley: autumn trees
// and leaf litter, mist in the low places, pumpkins and lanterns, the old
// things nobody came back for — and the strange things, when they happen.
// Everything here is in the same procedural style as the rest of the art.

type Ctx = CanvasRenderingContext2D;
type Pt = { x: number; y: number };

export function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function scr(camera: Camera, x: number, y: number): Pt {
  return camera.worldToScreen(x * TILE_SIZE, y * TILE_SIZE);
}

function tileOf(camera: Camera): number {
  return TILE_SIZE * camera.zoom;
}

// ---------------------------------------------------------------- palette

/** Deep greens, autumn reds, muted golds and browns: a canopy for each tree. */
const CANOPIES: { shade: string; mid: string; lit: string }[] = [
  { shade: '#1d2c1c', mid: '#2c4228', lit: '#4a6b3e' }, // deep green, holding on
  { shade: '#4a1d12', mid: '#8a3520', lit: '#b9552e' }, // rust red
  { shade: '#5a3712', mid: '#9a6a22', lit: '#c99a3e' }, // muted gold
  { shade: '#3a2614', mid: '#6b4628', lit: '#93683c' }, // brown
  { shade: '#3e2410', mid: '#a0481e', lit: '#d07a34' }, // burnt orange
];

export const LEAF_COLORS = ['#a8401f', '#c25a26', '#d98a2c', '#b8862e', '#7a4a22', '#8e2f1c', '#c9a046'];

export function canopyFor(x: number, y: number) {
  const h = hash2(x + 3.1, y + 7.7);
  if (h < 0.3) return CANOPIES[0];
  if (h < 0.52) return CANOPIES[1];
  if (h < 0.72) return CANOPIES[2];
  if (h < 0.86) return CANOPIES[4];
  return CANOPIES[3];
}

// ---------------------------------------------------------------- trees and bushes

/** Gnarled bare branches, reaching up and out of (or instead of) a canopy. */
function gnarl(ctx: Ctx, x: number, y: number, tile: number, seed: number, n: number, reach: number) {
  ctx.strokeStyle = '#231710';
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (hash2(seed, i * 3.3) - 0.5) * 2.4;
    const len = tile * reach * (0.7 + hash2(i, seed) * 0.5);
    let px = x;
    let py = y;
    ctx.lineWidth = Math.max(1, tile * 0.045);
    ctx.beginPath();
    ctx.moveTo(px, py);
    // A crooked limb in three kinks, thinning as it goes, with a twig or two.
    for (let k = 1; k <= 3; k++) {
      const kink = (hash2(seed + k, i + k * 1.7) - 0.5) * 0.9;
      const nx = px + Math.cos(a + kink) * (len / 3);
      const ny = py + Math.sin(a + kink) * (len / 3);
      ctx.quadraticCurveTo(px + Math.cos(a - kink) * (len / 6), py + Math.sin(a - kink) * (len / 6), nx, ny);
      px = nx;
      py = ny;
    }
    ctx.stroke();
    ctx.lineWidth = Math.max(0.7, tile * 0.022);
    ctx.beginPath();
    for (let t = 0; t < 2; t++) {
      const ta = a + (t ? 0.7 : -0.8);
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + Math.cos(ta) * tile * 0.08, py + Math.sin(ta) * tile * 0.1, px + Math.cos(ta + 0.3) * tile * 0.16, py + Math.sin(ta + 0.3) * tile * 0.16);
    }
    ctx.stroke();
  }
}

/** A tree in October: turned, thinned, some bare and crooked, a few hung with webs. */
export function drawAutumnTree(ctx: Ctx, sx: number, sy: number, tile: number, ox: number, oy: number, now: number) {
  const h = hash2(ox, oy);
  const jitter = h - 0.5;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + tile * 0.32, tile * 0.34, tile * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  const bare = hash2(ox + 11, oy + 5) < 0.09;
  // Trunk: a little crooked in October.
  ctx.fillStyle = '#3d2a1c';
  ctx.beginPath();
  ctx.moveTo(sx - tile * 0.06, sy + tile * 0.3);
  ctx.quadraticCurveTo(sx - tile * 0.09 + jitter * tile * 0.1, sy, sx - tile * 0.04, sy - tile * 0.18);
  ctx.lineTo(sx + tile * 0.05, sy - tile * 0.18);
  ctx.quadraticCurveTo(sx + tile * 0.08 + jitter * tile * 0.1, sy, sx + tile * 0.06, sy + tile * 0.3);
  ctx.closePath();
  ctx.fill();
  if (bare) {
    gnarl(ctx, sx, sy - tile * 0.12, tile, ox * 7 + oy, 5, 0.55);
    // A few last leaves clinging on.
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = LEAF_COLORS[Math.floor(hash2(ox + i, oy) * LEAF_COLORS.length)];
      ctx.beginPath();
      ctx.ellipse(sx + (hash2(i, ox) - 0.5) * tile * 0.6, sy - tile * (0.3 + hash2(oy, i) * 0.3), tile * 0.04, tile * 0.025, i, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  const c = canopyFor(ox, oy);
  const sway = Math.sin(now * 0.0011 + ox * 0.7 + oy * 0.3) * tile * 0.012;
  ctx.fillStyle = c.shade;
  ctx.beginPath();
  ctx.arc(sx + jitter * tile * 0.15 + sway, sy - tile * 0.28, tile * 0.37, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.mid;
  ctx.beginPath();
  ctx.arc(sx + jitter * tile * 0.15 + sway, sy - tile * 0.34, tile * 0.31, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx - tile * 0.2 + sway, sy - tile * 0.2, tile * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx + tile * 0.22 + sway, sy - tile * 0.18, tile * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.lit;
  ctx.beginPath();
  ctx.arc(sx + jitter * tile * 0.1 - tile * 0.08 + sway, sy - tile * 0.42, tile * 0.13, 0, Math.PI * 2);
  ctx.fill();
  // Speckled with a second colour, as turning trees are.
  const other = canopyFor(ox + 1, oy + 2);
  ctx.fillStyle = other.lit;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(sx + (hash2(i * 2.1, ox) - 0.5) * tile * 0.55 + sway, sy - tile * (0.15 + hash2(oy, i * 1.9) * 0.4), tile * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }
  // Some poke crooked limbs out over the top.
  if (hash2(ox + 2, oy + 9) < 0.22) gnarl(ctx, sx + jitter * tile * 0.1, sy - tile * 0.45, tile, ox * 3 + oy * 5, 2, 0.32);
  if (hash2(ox + 8, oy + 1) < 0.12) drawWeb(ctx, sx - tile * 0.28, sy - tile * 0.02, tile * 0.2, -0.6, 0.5);
}

export function drawAutumnBush(ctx: Ctx, sx: number, sy: number, tile: number, ox: number, oy: number) {
  const c = canopyFor(ox + 4, oy + 1);
  ctx.fillStyle = c.mid;
  ctx.beginPath();
  ctx.arc(sx, sy, tile * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx - tile * 0.16, sy + tile * 0.06, tile * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.lit;
  ctx.beginPath();
  ctx.arc(sx + tile * 0.08, sy - tile * 0.1, tile * 0.1, 0, Math.PI * 2);
  ctx.fill();
  // Berries on a few.
  if (hash2(ox, oy + 6) < 0.3) {
    ctx.fillStyle = '#7e1c22';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(sx + (hash2(i, ox) - 0.5) * tile * 0.4, sy + (hash2(oy, i) - 0.5) * tile * 0.3, tile * 0.025, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (hash2(ox + 3, oy) < 0.1) drawWeb(ctx, sx + tile * 0.18, sy - tile * 0.05, tile * 0.14, 0.4, 0.45);
}

/** A cobweb: spokes and a spiral, catching what light there is. */
export function drawWeb(ctx: Ctx, x: number, y: number, r: number, rot: number, alpha: number, spokes = 7) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.strokeStyle = `rgba(232,234,244,${alpha})`;
  ctx.lineWidth = Math.max(0.5, r * 0.035);
  ctx.beginPath();
  // A corner web: spokes fanned through a quarter-and-a-bit.
  const span = Math.PI * 0.75;
  for (let i = 0; i <= spokes; i++) {
    const a = -span / 2 + (i / spokes) * span;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  for (let ring = 1; ring <= 4; ring++) {
    const rr = (r * ring) / 4.4;
    for (let i = 0; i <= spokes; i++) {
      const a = -span / 2 + (i / spokes) * span;
      const sag = i > 0 ? 0.88 : 1;
      const px = Math.cos(a) * rr * sag;
      const py = Math.sin(a) * rr * sag;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  }
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- the ground

const LITTER_DENSITY: Record<ZoneId, number> = {
  greenhouse: 0,
  woodland: 0.9,
  dampForest: 0.8,
  overgrownClearing: 0.6,
  meadow: 0.3,
  creek: 0.3,
  rockyClearing: 0.22,
};

/** Fallen leaves laid over a tile of undergrowth: baked into the tile, so they cost nothing to draw. */
export function scatterLeaves(g: Ctx, px: number, pad: number, zone: ZoneId, variant: number) {
  const dens = LITTER_DENSITY[zone] ?? 0;
  const n = Math.round(dens * 7.5 * (0.5 + hash2(variant, zone.length)));
  for (let k = 0; k < n; k++) {
    const x = pad + px * hash2(variant * 7 + k, k * 1.3 + zone.length);
    const y = pad + px * hash2(k * 2.9, variant * 5 - k);
    const rot = hash2(variant + k * 3, k) * Math.PI * 2;
    const sz = px * (0.045 + hash2(k, variant + 9) * 0.035);
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = LEAF_COLORS[Math.floor(hash2(k * 5.5, variant + zone.length) * LEAF_COLORS.length)];
    g.globalAlpha = 0.7;
    g.beginPath();
    // A pointed leaf: an almond with a vein down it.
    g.moveTo(-sz * 1.4, 0);
    g.quadraticCurveTo(0, -sz * 0.9, sz * 1.4, 0);
    g.quadraticCurveTo(0, sz * 0.9, -sz * 1.4, 0);
    g.fill();
    g.globalAlpha = 0.45;
    g.strokeStyle = 'rgba(60,30,12,0.8)';
    g.lineWidth = Math.max(0.5, sz * 0.15);
    g.beginPath();
    g.moveTo(-sz * 1.4, 0);
    g.lineTo(sz * 1.7, 0);
    g.stroke();
    g.restore();
  }
}

export class LeafLitter {
  private fog: HTMLCanvasElement | null = null;

  /** A soft white puff, drawn scaled for every bit of mist. */
  fogSprite(): HTMLCanvasElement | null {
    if (this.fog) return this.fog;
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d');
    if (!g) return null;
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(226,232,240,1)');
    gr.addColorStop(0.45, 'rgba(220,228,236,0.55)');
    gr.addColorStop(1, 'rgba(210,220,232,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    this.fog = c;
    return c;
  }

  /** The grass has gone over: a warm, faded wash under everything that stands. (The leaves are in the undergrowth tiles.) */
  drawWash(ctx: Ctx, camera: Camera) {
    ctx.fillStyle = 'rgba(150,96,40,0.13)';
    ctx.fillRect(0, 0, camera.viewW, camera.viewH);
  }

  /** Mist lying in the low places: thin by day, thicker after dark, never everywhere. */
  drawFog(ctx: Ctx, camera: Camera, b: { minX: number; maxX: number; minY: number; maxY: number }, darkness: number, now: number) {
    const sprite = this.fogSprite();
    if (!sprite) return;
    const tile = tileOf(camera);
    ctx.save();
    for (let bi = 0; bi < FOG_BANKS.length; bi++) {
      const bank = FOG_BANKS[bi];
      const strength = bank.night ? Math.max(0, darkness - 0.3) / 0.7 : 0.45 + darkness * 0.55;
      if (strength < 0.02) continue;
      if (bank.x + bank.w < b.minX - 3 || bank.x > b.maxX + 3 || bank.y + bank.h < b.minY - 3 || bank.y > b.maxY + 3) continue;
      const n = Math.max(2, Math.round((bank.w * bank.h) / 14));
      for (let i = 0; i < n; i++) {
        const t = now * 0.00004 * (0.6 + hash2(i, bi) * 0.8);
        const fx = bank.x + ((hash2(i * 3.1, bi * 7) * bank.w + Math.sin(t * 6 + i) * 1.6 + t * 9) % bank.w);
        const fy = bank.y + hash2(bi * 1.3, i * 2.2) * bank.h + Math.cos(t * 5 + i * 2) * 0.6;
        if (fx < b.minX - 3 || fx > b.maxX + 3 || fy < b.minY - 3 || fy > b.maxY + 3) continue;
        const r = tile * (1.6 + hash2(i, bi + 3) * 1.6);
        const breathe = 0.75 + 0.25 * Math.sin(now * 0.0004 + i * 1.7);
        ctx.globalAlpha = 0.16 * strength * breathe;
        const s = scr(camera, fx, fy);
        ctx.drawImage(sprite, s.x - r, s.y - r * 0.55, r * 2, r * 1.1);
      }
    }
    ctx.restore();
  }

  /** A patch of fog that forms out of nothing, hangs a moment, and goes. */
  drawFogPuff(ctx: Ctx, camera: Camera, e: OctoberEvent, now: number) {
    const sprite = this.fogSprite();
    if (!sprite || e.age < 0) return;
    const tile = tileOf(camera);
    const t = e.age / e.dur;
    const a = Math.sin(Math.min(1, t) * Math.PI);
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const s = scr(camera, e.x + Math.cos(i * 1.7 + now * 0.0002) * 0.6, e.y + Math.sin(i * 2.3) * 0.3);
      const r = tile * (0.9 + t * 1.2 + i * 0.25);
      ctx.globalAlpha = 0.32 * a;
      ctx.drawImage(sprite, s.x - r, s.y - r * 0.5, r * 2, r);
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- pumpkins

/** A pumpkin: ribbed, stalked, and — carved — a face that glows once it's dark. */
export function drawPumpkin(ctx: Ctx, x: number, y: number, tile: number, size: number, face: FaceId | string | null, glow: number, now: number, seed = 0) {
  const r = tile * 0.2 * size;
  const hue = 24 + (hash2(seed, 3) - 0.5) * 8;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.7, r * 1.2, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  // Lobes, back ones darker.
  const lobes = [-0.7, 0.7, -0.32, 0.32, 0];
  lobes.forEach((o, i) => {
    const edge = Math.abs(o);
    ctx.fillStyle = `hsl(${hue} ${78 - edge * 10}% ${46 - edge * 12 + i * 1.5}%)`;
    ctx.beginPath();
    ctx.ellipse(x + o * r * 0.78, y, r * (0.52 - edge * 0.12), r * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = `hsla(${hue + 8} 90% 70% / 0.35)`;
  ctx.beginPath();
  ctx.ellipse(x - r * 0.25, y - r * 0.38, r * 0.22, r * 0.12, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // Stalk.
  ctx.strokeStyle = '#5a4a24';
  ctx.lineWidth = Math.max(1.2, r * 0.2);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.68);
  ctx.quadraticCurveTo(x + r * 0.05, y - r * 0.95, x + r * 0.22, y - r * 1.02);
  ctx.stroke();
  if (!face) return;
  const lit = glow > 0.05;
  const flick = lit ? 0.85 + 0.15 * Math.sin(now * 0.017 + seed) * Math.sin(now * 0.0061 + seed * 2) : 0;
  ctx.fillStyle = lit ? `rgba(255,${190 + flick * 40},${70 + flick * 30},${0.55 + glow * 0.45})` : 'rgba(60,24,6,0.9)';
  drawFace(ctx, x, y, r, face as FaceId);
}

function tri(ctx: Ctx, ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.closePath();
}

function drawFace(ctx: Ctx, x: number, y: number, r: number, face: FaceId) {
  ctx.beginPath();
  const ey = y - r * 0.18;
  const ex = r * 0.3;
  switch (face) {
    case 'happy':
      tri(ctx, x - ex - r * 0.12, ey + r * 0.08, x - ex, ey - r * 0.14, x - ex + r * 0.12, ey + r * 0.08);
      tri(ctx, x + ex - r * 0.12, ey + r * 0.08, x + ex, ey - r * 0.14, x + ex + r * 0.12, ey + r * 0.08);
      ctx.moveTo(x - r * 0.42, y + r * 0.12);
      ctx.quadraticCurveTo(x, y + r * 0.62, x + r * 0.42, y + r * 0.12);
      ctx.quadraticCurveTo(x, y + r * 0.36, x - r * 0.42, y + r * 0.12);
      break;
    case 'goofy':
      ctx.ellipse(x - ex, ey, r * 0.11, r * 0.13, 0, 0, Math.PI * 2);
      ctx.moveTo(x + ex + r * 0.07, ey - r * 0.02);
      ctx.ellipse(x + ex, ey - r * 0.02, r * 0.07, r * 0.08, 0, 0, Math.PI * 2);
      ctx.moveTo(x - r * 0.35, y + r * 0.15);
      ctx.quadraticCurveTo(x, y + r * 0.42, x + r * 0.35, y + r * 0.12);
      ctx.lineTo(x + r * 0.12, y + r * 0.3);
      ctx.lineTo(x + r * 0.05, y + r * 0.45);
      ctx.lineTo(x - r * 0.05, y + r * 0.31);
      ctx.closePath();
      break;
    case 'surprised':
      ctx.ellipse(x - ex, ey, r * 0.1, r * 0.14, 0, 0, Math.PI * 2);
      ctx.moveTo(x + ex + r * 0.1, ey);
      ctx.ellipse(x + ex, ey, r * 0.1, r * 0.14, 0, 0, Math.PI * 2);
      ctx.moveTo(x + r * 0.12, y + r * 0.3);
      ctx.ellipse(x, y + r * 0.3, r * 0.12, r * 0.16, 0, 0, Math.PI * 2);
      break;
    case 'spooky':
      tri(ctx, x - ex - r * 0.14, ey - r * 0.1, x - ex + r * 0.12, ey - r * 0.02, x - ex - r * 0.06, ey + r * 0.1);
      tri(ctx, x + ex + r * 0.14, ey - r * 0.1, x + ex - r * 0.12, ey - r * 0.02, x + ex + r * 0.06, ey + r * 0.1);
      ctx.moveTo(x - r * 0.45, y + r * 0.12);
      for (let i = 0; i <= 6; i++) ctx.lineTo(x - r * 0.45 + (i * r * 0.9) / 6, y + r * (i % 2 ? 0.26 : 0.12));
      ctx.lineTo(x + r * 0.35, y + r * 0.42);
      ctx.lineTo(x - r * 0.35, y + r * 0.42);
      ctx.closePath();
      break;
    case 'verySpooky':
      tri(ctx, x - ex - r * 0.16, ey - r * 0.16, x - ex + r * 0.14, ey - r * 0.02, x - ex - r * 0.1, ey + r * 0.14);
      tri(ctx, x + ex + r * 0.16, ey - r * 0.16, x + ex - r * 0.14, ey - r * 0.02, x + ex + r * 0.1, ey + r * 0.14);
      // A wide jagged grin, all teeth.
      ctx.moveTo(x - r * 0.55, y + r * 0.05);
      ctx.quadraticCurveTo(x, y + r * 0.75, x + r * 0.55, y + r * 0.05);
      for (let i = 0; i <= 8; i++) {
        const px = x + r * 0.55 - (i * r * 1.1) / 8;
        ctx.lineTo(px, y + r * (0.18 + (i % 2 ? 0.16 : 0) + Math.sin((i / 8) * Math.PI) * 0.12));
      }
      ctx.closePath();
      break;
    case 'wink':
      tri(ctx, x - ex - r * 0.12, ey + r * 0.08, x - ex, ey - r * 0.14, x - ex + r * 0.12, ey + r * 0.08);
      ctx.moveTo(x + ex - r * 0.14, ey + r * 0.02);
      ctx.lineTo(x + ex + r * 0.14, ey - r * 0.02);
      ctx.lineTo(x + ex + r * 0.14, ey + r * 0.05);
      ctx.lineTo(x + ex - r * 0.14, ey + r * 0.07);
      ctx.closePath();
      ctx.moveTo(x - r * 0.3, y + r * 0.2);
      ctx.quadraticCurveTo(x + r * 0.05, y + r * 0.5, x + r * 0.38, y + r * 0.12);
      ctx.quadraticCurveTo(x + r * 0.05, y + r * 0.32, x - r * 0.3, y + r * 0.2);
      break;
    case 'moon':
      // Crescent eyes and a star where the nose would be.
      for (const s of [-1, 1]) {
        ctx.moveTo(x + s * ex + r * 0.12, ey);
        ctx.arc(x + s * ex, ey, r * 0.12, 0, Math.PI, false);
        ctx.arc(x + s * ex, ey - r * 0.04, r * 0.09, Math.PI, 0, true);
      }
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        const b = a + Math.PI / 5;
        if (i === 0) ctx.moveTo(x + Math.cos(a) * r * 0.13, y + r * 0.22 + Math.sin(a) * r * 0.13);
        else ctx.lineTo(x + Math.cos(a) * r * 0.13, y + r * 0.22 + Math.sin(a) * r * 0.13);
        ctx.lineTo(x + Math.cos(b) * r * 0.055, y + r * 0.22 + Math.sin(b) * r * 0.055);
      }
      ctx.closePath();
      break;
    case 'fox':
      // Two slanted eyes and a pointed muzzle: someone was thinking of something.
      tri(ctx, x - ex - r * 0.14, ey + r * 0.06, x - ex + r * 0.12, ey - r * 0.04, x - ex + r * 0.06, ey + r * 0.1);
      tri(ctx, x + ex + r * 0.14, ey + r * 0.06, x + ex - r * 0.12, ey - r * 0.04, x + ex - r * 0.06, ey + r * 0.1);
      tri(ctx, x - r * 0.16, y + r * 0.12, x + r * 0.16, y + r * 0.12, x, y + r * 0.4);
      // Ears cut in the top.
      tri(ctx, x - r * 0.42, y - r * 0.38, x - r * 0.26, y - r * 0.62, x - r * 0.16, y - r * 0.36);
      tri(ctx, x + r * 0.42, y - r * 0.38, x + r * 0.26, y - r * 0.62, x + r * 0.16, y - r * 0.36);
      break;
  }
  ctx.fill('evenodd');
}

/** Vines and big leaves between the pumpkins in the patch. */
export function drawPumpkinPatch(ctx: Ctx, camera: Camera) {
  const tile = tileOf(camera);
  const p = PUMPKIN_PATCH;
  const tl = scr(camera, p.x, p.y);
  if (tl.x > camera.viewW + tile * 2 || tl.y > camera.viewH + tile * 2 || tl.x + p.w * tile < -tile * 2 || tl.y + p.h * tile < -tile * 2) return;
  // Turned earth in loose clods, not a neat bed.
  ctx.fillStyle = 'rgba(80,56,30,0.16)';
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.ellipse(tl.x + (0.15 + hash2(i, 4) * 0.7) * p.w * tile, tl.y + (0.15 + hash2(4, i) * 0.7) * p.h * tile, tile * (0.6 + hash2(i, i) * 0.5), tile * (0.35 + hash2(i, 2) * 0.25), hash2(2, i) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#4c5a26';
  ctx.lineWidth = Math.max(1, tile * 0.03);
  for (let i = 0; i < 7; i++) {
    const x0 = tl.x + hash2(i, 1) * p.w * tile;
    const y0 = tl.y + hash2(1, i) * p.h * tile;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(x0 + tile * 0.5, y0 - tile * 0.3, x0 + tile * 0.6, y0 + tile * 0.4, x0 + tile * 1.1, y0 + tile * 0.1);
    ctx.stroke();
    ctx.fillStyle = hash2(i, 9) < 0.5 ? '#5c6a2c' : '#7a6a2a';
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      ctx.ellipse(x0 + tile * (0.35 + k * 0.45), y0 + tile * (k ? 0.12 : -0.08), tile * 0.13, tile * 0.09, hash2(i, k), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------- lanterns

/** An old iron lantern post. */
export function drawLanternPost(ctx: Ctx, x: number, y: number, tile: number, glow: number, now: number, seed: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y + tile * 0.05, tile * 0.14, tile * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1e1a18';
  ctx.lineWidth = Math.max(1.2, tile * 0.05);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - tile * 1.05);
  ctx.quadraticCurveTo(x, y - tile * 1.2, x + tile * 0.16, y - tile * 1.2);
  ctx.stroke();
  drawHangingLantern(ctx, x + tile * 0.16, y - tile * 1.12, tile * 0.9, glow, now, seed);
}

/** A little lantern hanging from a hook: cage, glass, a flame when it's lit. */
export function drawHangingLantern(ctx: Ctx, x: number, y: number, tile: number, glow: number, now: number, seed: number) {
  const swing = Math.sin(now * 0.0016 + seed) * 0.05;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(swing);
  ctx.fillStyle = '#26201c';
  ctx.fillRect(-tile * 0.09, tile * 0.02, tile * 0.18, tile * 0.04);
  const lit = glow > 0.05;
  ctx.fillStyle = lit ? `rgba(255,${200 + glow * 30},${110 + glow * 40},${0.6 + glow * 0.4})` : 'rgba(150,140,110,0.45)';
  ctx.fillRect(-tile * 0.07, tile * 0.06, tile * 0.14, tile * 0.16);
  ctx.strokeStyle = '#26201c';
  ctx.lineWidth = Math.max(0.8, tile * 0.025);
  ctx.strokeRect(-tile * 0.07, tile * 0.06, tile * 0.14, tile * 0.16);
  ctx.beginPath();
  ctx.moveTo(0, tile * 0.06);
  ctx.lineTo(0, tile * 0.22);
  ctx.stroke();
  ctx.fillStyle = '#26201c';
  ctx.beginPath();
  ctx.moveTo(-tile * 0.1, tile * 0.06);
  ctx.lineTo(0, -tile * 0.03);
  ctx.lineTo(tile * 0.1, tile * 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-tile * 0.08, tile * 0.22, tile * 0.16, tile * 0.03);
  ctx.restore();
}

// ---------------------------------------------------------------- the old things

export function drawOldThing(ctx: Ctx, kind: OldThingKind, x: number, y: number, tile: number, now: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y + tile * 0.04, tile * 0.3, tile * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  const wood = '#5b4532';
  const dark = '#2e241c';
  ctx.lineCap = 'round';
  switch (kind) {
    case 'scarecrow': {
      const lean = 0.12;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(lean);
      ctx.strokeStyle = wood;
      ctx.lineWidth = Math.max(1.5, tile * 0.07);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -tile * 1.4);
      ctx.moveTo(-tile * 0.45, -tile * 1.05);
      ctx.lineTo(tile * 0.45, -tile * 1.0);
      ctx.stroke();
      // A shirt gone to rags, stirring.
      const flap = Math.sin(now * 0.002) * tile * 0.03;
      ctx.fillStyle = '#6a5a3e';
      ctx.beginPath();
      ctx.moveTo(-tile * 0.4, -tile * 1.08);
      ctx.lineTo(tile * 0.4, -tile * 1.04);
      ctx.lineTo(tile * 0.22, -tile * 0.55);
      for (let i = 0; i <= 5; i++) ctx.lineTo(tile * (0.22 - i * 0.088), -tile * (0.55 - (i % 2 ? 0.08 : 0)) + flap * (i % 2 ? 1 : -1));
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#4e4230';
      ctx.fillRect(-tile * 0.06, -tile * 0.95, tile * 0.12, tile * 0.3);
      // Straw at the cuffs.
      ctx.strokeStyle = '#c9a85a';
      ctx.lineWidth = Math.max(0.7, tile * 0.02);
      for (const s of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(s * tile * 0.42, -tile * 1.05);
          ctx.lineTo(s * tile * (0.5 + i * 0.02), -tile * (1.0 - i * 0.04) + flap);
          ctx.stroke();
        }
      }
      // A sack head with a stitched face, and a hat.
      ctx.fillStyle = '#b39a6c';
      ctx.beginPath();
      ctx.arc(0, -tile * 1.35, tile * 0.17, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = Math.max(0.7, tile * 0.02);
      ctx.beginPath();
      ctx.moveTo(-tile * 0.09, -tile * 1.39);
      ctx.lineTo(-tile * 0.03, -tile * 1.37);
      ctx.moveTo(tile * 0.03, -tile * 1.37);
      ctx.lineTo(tile * 0.09, -tile * 1.39);
      ctx.moveTo(-tile * 0.08, -tile * 1.28);
      for (let i = 1; i <= 4; i++) ctx.lineTo(-tile * 0.08 + i * tile * 0.04, -tile * (1.28 + (i % 2 ? 0.02 : 0)));
      ctx.stroke();
      ctx.fillStyle = '#3a3026';
      ctx.fillRect(-tile * 0.24, -tile * 1.5, tile * 0.48, tile * 0.05);
      ctx.beginPath();
      ctx.moveTo(-tile * 0.13, -tile * 1.5);
      ctx.lineTo(-tile * 0.06, -tile * 1.72);
      ctx.lineTo(tile * 0.12, -tile * 1.68);
      ctx.lineTo(tile * 0.13, -tile * 1.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'signpost': {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.16);
      ctx.fillStyle = wood;
      ctx.fillRect(-tile * 0.04, -tile * 1.1, tile * 0.08, tile * 1.1);
      ctx.fillStyle = '#6e5840';
      // Two boards, pointing two ways, whatever they once said worn off.
      ctx.beginPath();
      ctx.moveTo(-tile * 0.05, -tile * 1.0);
      ctx.lineTo(tile * 0.42, -tile * 1.02);
      ctx.lineTo(tile * 0.52, -tile * 0.92);
      ctx.lineTo(tile * 0.42, -tile * 0.83);
      ctx.lineTo(-tile * 0.05, -tile * 0.84);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.rotate(0.35);
      ctx.beginPath();
      ctx.moveTo(tile * -0.2, -tile * 0.66);
      ctx.lineTo(-tile * 0.55, -tile * 0.66);
      ctx.lineTo(-tile * 0.63, -tile * 0.58);
      ctx.lineTo(-tile * 0.55, -tile * 0.5);
      ctx.lineTo(tile * -0.2, -tile * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.restore();
      break;
    }
    case 'wheelbarrow': {
      ctx.fillStyle = '#5e4a3a';
      ctx.beginPath();
      ctx.moveTo(x - tile * 0.35, y - tile * 0.38);
      ctx.lineTo(x + tile * 0.3, y - tile * 0.4);
      ctx.lineTo(x + tile * 0.2, y - tile * 0.12);
      ctx.lineTo(x - tile * 0.28, y - tile * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(150,80,40,0.5)';
      ctx.fillRect(x - tile * 0.2, y - tile * 0.32, tile * 0.18, tile * 0.1);
      ctx.strokeStyle = dark;
      ctx.lineWidth = Math.max(1, tile * 0.035);
      ctx.beginPath();
      ctx.arc(x + tile * 0.24, y - tile * 0.06, tile * 0.08, 0, Math.PI * 2);
      ctx.moveTo(x - tile * 0.3, y - tile * 0.18);
      ctx.lineTo(x - tile * 0.55, y - tile * 0.06);
      ctx.moveTo(x - tile * 0.22, y - tile * 0.12);
      ctx.lineTo(x - tile * 0.24, y);
      ctx.stroke();
      // Gourds left in it.
      const gourds = ['#c48a2a', '#e6d39a', '#6f8a3a'];
      gourds.forEach((g, i) => {
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x - tile * 0.15 + i * tile * 0.15, y - tile * 0.42, tile * 0.08, tile * 0.06, i, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    }
    case 'bench': {
      ctx.fillStyle = '#4e3e30';
      ctx.fillRect(x - tile * 0.45, y - tile * 0.32, tile * 0.9, tile * 0.08);
      ctx.fillRect(x - tile * 0.45, y - tile * 0.52, tile * 0.9, tile * 0.07);
      ctx.fillStyle = dark;
      ctx.fillRect(x - tile * 0.4, y - tile * 0.25, tile * 0.05, tile * 0.25);
      ctx.fillRect(x + tile * 0.35, y - tile * 0.25, tile * 0.05, tile * 0.25);
      // A lantern someone left on it, a long time ago.
      drawHangingLantern(ctx, x + tile * 0.18, y - tile * 0.56, tile * 0.85, 0, 0, 0);
      ctx.fillStyle = 'rgba(70,90,50,0.6)';
      ctx.beginPath();
      ctx.ellipse(x - tile * 0.3, y - tile * 0.3, tile * 0.12, tile * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'gate': {
      ctx.fillStyle = '#3a3230';
      ctx.fillRect(x - tile * 0.55, y - tile * 0.9, tile * 0.08, tile * 0.9);
      ctx.fillRect(x + tile * 0.47, y - tile * 0.9, tile * 0.08, tile * 0.9);
      // Hanging open off one hinge, going nowhere: there's no fence.
      ctx.strokeStyle = '#4a3c36';
      ctx.lineWidth = Math.max(1, tile * 0.03);
      ctx.save();
      ctx.translate(x - tile * 0.47, y - tile * 0.8);
      ctx.rotate(0.22);
      ctx.strokeRect(0, 0, tile * 0.6, tile * 0.62);
      for (let i = 1; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo((i * tile * 0.6) / 5, 0);
        ctx.lineTo((i * tile * 0.6) / 5, tile * 0.62);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
  }
}

// ---------------------------------------------------------------- the house and the greenhouse, outside

/** The house after dark in October: a wreath, the porch lantern and its spider, candles and curtains. */
export function drawOctoberHouse(ctx: Ctx, camera: Camera, darkness: number, now: number, webGrowth: number, windowEvent: OctoberEvent | null) {
  const tile = tileOf(camera);
  const f = HOUSE_FOOTPRINT;
  const tl = scr(camera, f.x, f.y);
  const w = f.w * tile;
  const h = f.h * tile;
  const wallTop = tl.y + h * 0.58;
  const door = scr(camera, HOUSE_DOOR.x, HOUSE_DOOR.y);
  const night = darkness > 0.45;
  // The windows: curtains drawn half across, a candle on each sill, and once in a long while somebody walking past.
  const wins = [tl.x + tile * 0.55, tl.x + w - tile * 1.35];
  wins.forEach((wx, i) => {
    const wy = wallTop + tile * 0.55;
    const ww = tile * 0.8;
    const wh = tile * 0.7;
    if (night) {
      const breathe = 0.9 + 0.1 * Math.sin(now * 0.0023 + i * 2) * Math.sin(now * 0.0071 + i);
      ctx.fillStyle = `rgba(255,150,60,${0.25 * breathe})`;
      ctx.fillRect(wx, wy, ww, wh);
      if (windowEvent) drawWindowFigure(ctx, wx, wy, ww, wh, windowEvent, i);
    }
    ctx.fillStyle = night ? '#6e2a22' : '#8a3a2e';
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.lineTo(wx + ww * 0.28, wy);
    ctx.quadraticCurveTo(wx + ww * 0.12, wy + wh * 0.5, wx + ww * 0.2, wy + wh);
    ctx.lineTo(wx, wy + wh);
    ctx.closePath();
    ctx.moveTo(wx + ww, wy);
    ctx.lineTo(wx + ww * 0.72, wy);
    ctx.quadraticCurveTo(wx + ww * 0.88, wy + wh * 0.5, wx + ww * 0.8, wy + wh);
    ctx.lineTo(wx + ww, wy + wh);
    ctx.closePath();
    ctx.fill();
    // A candle on the sill.
    const cx = wx + ww * 0.5;
    const cy = wy + wh - tile * 0.02;
    ctx.fillStyle = '#efe2c4';
    ctx.fillRect(cx - tile * 0.03, cy - tile * 0.14, tile * 0.06, tile * 0.14);
    if (night) {
      const fl = Math.sin(now * 0.02 + i * 3) * tile * 0.008;
      ctx.fillStyle = '#ffd77a';
      ctx.beginPath();
      ctx.ellipse(cx + fl, cy - tile * 0.18, tile * 0.022, tile * 0.04, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#f4ecdc';
    ctx.lineWidth = Math.max(1, tile * 0.05);
    ctx.strokeRect(wx, wy, ww, wh);
  });
  // An autumn wreath on the door.
  const wxc = door.x + tile * 0.5;
  const wyc = door.y - tile * 0.66;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    ctx.fillStyle = LEAF_COLORS[i % LEAF_COLORS.length];
    ctx.beginPath();
    ctx.ellipse(wxc + Math.cos(a) * tile * 0.15, wyc + Math.sin(a) * tile * 0.15, tile * 0.07, tile * 0.04, a + 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#8a1e22';
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.arc(wxc + Math.cos(a) * tile * 0.13, wyc + Math.sin(a) * tile * 0.13, tile * 0.025, 0, Math.PI * 2);
    ctx.fill();
  }
  // The porch lantern on its bracket, and the odd spider's web beneath it.
  const pl = scr(camera, PORCH_LANTERN.x, PORCH_LANTERN.y);
  ctx.strokeStyle = '#1e1a18';
  ctx.lineWidth = Math.max(1, tile * 0.04);
  ctx.beginPath();
  ctx.moveTo(pl.x + tile * 0.16, pl.y - tile * 0.12);
  ctx.lineTo(pl.x, pl.y - tile * 0.12);
  ctx.lineTo(pl.x, pl.y - tile * 0.05);
  ctx.stroke();
  drawHangingLantern(ctx, pl.x, pl.y - tile * 0.07, tile * 0.95, night ? 1 : 0, now, 7);
  drawWeb(ctx, pl.x + tile * 0.16, pl.y - tile * 0.12, tile * (0.18 + webGrowth * 0.22), 2.2, 0.5, 6 + Math.round(webGrowth * 3));
  drawLanternSpider(ctx, pl.x - tile * 0.02 + Math.sin(now * 0.0007) * tile * 0.02, pl.y + tile * 0.16 + webGrowth * tile * 0.05, tile, now);
  // Bunting of little paper bats along the eave.
  ctx.fillStyle = '#231c22';
  for (let i = 0; i < 6; i++) {
    const bx = tl.x + tile * 0.4 + (i * (w - tile * 0.8)) / 5;
    const by = wallTop + tile * 0.12 + Math.sin((i / 5) * Math.PI) * tile * 0.12;
    drawPaperBat(ctx, bx, by, tile * 0.12, Math.sin(now * 0.002 + i) * 0.15);
  }
}

function drawPaperBat(ctx: Ctx, x: number, y: number, s: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.2);
  ctx.quadraticCurveTo(-s * 0.5, -s * 0.6, -s, -s * 0.2);
  ctx.quadraticCurveTo(-s * 0.7, -s * 0.05, -s * 0.6, s * 0.25);
  ctx.quadraticCurveTo(-s * 0.3, 0, 0, s * 0.3);
  ctx.quadraticCurveTo(s * 0.3, 0, s * 0.6, s * 0.25);
  ctx.quadraticCurveTo(s * 0.7, -s * 0.05, s, -s * 0.2);
  ctx.quadraticCurveTo(s * 0.5, -s * 0.6, 0, -s * 0.2);
  ctx.fill();
  ctx.restore();
}

/** Somebody passing behind the front windows: one, then the other. */
function drawWindowFigure(ctx: Ctx, wx: number, wy: number, ww: number, wh: number, e: OctoberEvent, i: number) {
  const t = e.age / e.dur;
  // Crosses the first window in the first half, the second in the second.
  const local = i === 0 ? t * 2 : t * 2 - 1;
  if (local < -0.2 || local > 1.2) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(wx, wy, ww, wh);
  ctx.clip();
  const x = wx - ww * 0.4 + local * ww * 1.8;
  ctx.fillStyle = 'rgba(30,18,16,0.82)';
  ctx.beginPath();
  ctx.arc(x, wy + wh * 0.3, ww * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - ww * 0.3, wy + wh);
  ctx.quadraticCurveTo(x - ww * 0.26, wy + wh * 0.46, x, wy + wh * 0.44);
  ctx.quadraticCurveTo(x + ww * 0.26, wy + wh * 0.46, x + ww * 0.3, wy + wh);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** The odd spider: orange and violet, small, and very much at home. */
export function drawLanternSpider(ctx: Ctx, x: number, y: number, tile: number, now: number) {
  const s = tile * 0.045;
  ctx.strokeStyle = '#2a1a2a';
  ctx.lineWidth = Math.max(0.6, s * 0.3);
  const twitch = Math.sin(now * 0.004) * s * 0.2;
  ctx.beginPath();
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const a = -0.9 + i * 0.6;
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + side * s * 1.4, y + Math.sin(a) * s * 1.2 - s, x + side * s * 2.2, y + Math.sin(a) * s * 1.6 + (i === 0 ? twitch : 0));
    }
  }
  ctx.stroke();
  ctx.fillStyle = '#d06a24';
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.6, s * 0.9, s * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6a3a8a';
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.6, s * 0.4, s * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a2238';
  ctx.beginPath();
  ctx.arc(x, y - s * 0.5, s * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(230,230,240,0.5)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.lineTo(x, y - tile * 0.25);
  ctx.stroke();
}

/** Cobwebs in the greenhouse's corners, from outside. */
export function drawOctoberGreenhouseOutside(ctx: Ctx, camera: Camera) {
  const tile = tileOf(camera);
  const g = GREENHOUSE_FOOTPRINT;
  const tl = scr(camera, g.x, g.y);
  drawWeb(ctx, tl.x + tile * 0.1, tl.y + g.h * tile * 0.45, tile * 0.45, 0.3, 0.35);
  drawWeb(ctx, tl.x + g.w * tile - tile * 0.1, tl.y + g.h * tile * 0.5, tile * 0.38, Math.PI - 0.3, 0.3);
}

// ---------------------------------------------------------------- creatures

/** A bat: wings up, wings down. */
export function drawBat(ctx: Ctx, x: number, y: number, s: number, phase: number) {
  const up = Math.sin(phase);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x - s * 0.5, y - s * 0.6 * up - s * 0.1, x - s, y - s * 0.3 * up);
  ctx.quadraticCurveTo(x - s * 0.55, y + s * 0.05, x, y + s * 0.18);
  ctx.quadraticCurveTo(x + s * 0.55, y + s * 0.05, x + s, y - s * 0.3 * up);
  ctx.quadraticCurveTo(x + s * 0.5, y - s * 0.6 * up - s * 0.1, x, y);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y + s * 0.02, s * 0.14, 0, Math.PI * 2);
  ctx.fill();
}

/** Bats round the roof at dusk and over the woods after dark. */
export function drawBats(ctx: Ctx, camera: Camera, centres: Pt[], darkness: number, now: number) {
  if (darkness < 0.3) return;
  const tile = tileOf(camera);
  ctx.save();
  ctx.fillStyle = `rgba(28,22,34,${Math.min(1, (darkness - 0.3) * 2.5) * 0.9})`;
  centres.forEach((c, ci) => {
    for (let i = 0; i < 4; i++) {
      const sp = 0.0006 + i * 0.00013;
      const a = now * sp + i * 1.9 + ci;
      const x = c.x + Math.cos(a) * (2.4 + i * 0.5) + Math.sin(a * 2.3) * 0.6;
      const y = c.y + Math.sin(a * 1.3) * (1.2 + i * 0.2) - 1.5;
      const s = scr(camera, x, y);
      if (s.x < -tile || s.y < -tile || s.x > camera.viewW + tile || s.y > camera.viewH + tile) continue;
      drawBat(ctx, s.x, s.y, tile * 0.16, now * 0.03 + i * 2);
    }
  });
  ctx.restore();
}

/** The owl, on a branch at the top of its tree, turning its head to follow her. */
export function drawOwl(ctx: Ctx, x: number, y: number, tile: number, lookX: number, alpha: number, now: number) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const s = tile * 0.14;
  ctx.fillStyle = '#5a4430';
  ctx.beginPath();
  ctx.ellipse(x, y, s * 1.1, s * 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c8b090';
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.35, s * 0.65, s * 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head: tufts, a disc of a face, and eyes that follow.
  const turn = Math.max(-1, Math.min(1, lookX)) * s * 0.35;
  ctx.fillStyle = '#5a4430';
  ctx.beginPath();
  ctx.arc(x + turn * 0.4, y - s * 1.3, s * 0.95, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + turn * 0.4 - s * 0.8, y - s * 1.8);
  ctx.lineTo(x + turn * 0.4 - s * 0.55, y - s * 2.35);
  ctx.lineTo(x + turn * 0.4 - s * 0.25, y - s * 1.95);
  ctx.moveTo(x + turn * 0.4 + s * 0.8, y - s * 1.8);
  ctx.lineTo(x + turn * 0.4 + s * 0.55, y - s * 2.35);
  ctx.lineTo(x + turn * 0.4 + s * 0.25, y - s * 1.95);
  ctx.fill();
  const blink = Math.sin(now * 0.0009) > 0.985;
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#e8c860';
    ctx.beginPath();
    ctx.arc(x + turn + side * s * 0.38, y - s * 1.35, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#16100c';
    if (blink) ctx.fillRect(x + turn + side * s * 0.38 - s * 0.3, y - s * 1.38, s * 0.6, s * 0.08);
    else {
      ctx.beginPath();
      ctx.arc(x + turn * 1.3 + side * s * 0.38, y - s * 1.35, s * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = '#c08a3a';
  ctx.beginPath();
  ctx.moveTo(x + turn - s * 0.1, y - s * 1.1);
  ctx.lineTo(x + turn + s * 0.1, y - s * 1.1);
  ctx.lineTo(x + turn, y - s * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A black cat, sitting very upright among the pumpkins; it doesn't let you close. */
export function drawBlackCat(ctx: Ctx, x: number, y: number, tile: number, alpha: number, now: number, faceLeft: boolean) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (faceLeft) ctx.scale(-1, 1);
  const s = tile * 0.12;
  ctx.fillStyle = '#121014';
  ctx.beginPath();
  ctx.ellipse(0, -s * 1.2, s * 1.0, s * 1.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.15, -s * 2.8, s * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 0.5, -s * 3.2);
  ctx.lineTo(-s * 0.35, -s * 4.0);
  ctx.lineTo(s * 0.05, -s * 3.45);
  ctx.moveTo(s * 0.3, -s * 3.45);
  ctx.lineTo(s * 0.75, -s * 4.0);
  ctx.lineTo(s * 0.85, -s * 3.1);
  ctx.fill();
  // The tail, curling and uncurling.
  const flick = Math.sin(now * 0.0025) * s * 0.8;
  ctx.strokeStyle = '#121014';
  ctx.lineWidth = Math.max(1.2, s * 0.35);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-s * 0.7, -s * 0.2);
  ctx.quadraticCurveTo(-s * 2.0, -s * 0.2, -s * 1.8 + flick * 0.3, -s * 1.6 + flick);
  ctx.stroke();
  const blink = Math.sin(now * 0.0013) > 0.97;
  if (!blink) {
    ctx.fillStyle = '#e8d24a';
    ctx.beginPath();
    ctx.ellipse(-s * 0.15, -s * 2.85, s * 0.18, s * 0.12, 0, 0, Math.PI * 2);
    ctx.ellipse(s * 0.5, -s * 2.85, s * 0.18, s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A pale moth, round and round a light. */
export function drawMoth(ctx: Ctx, cx: number, cy: number, tile: number, now: number, seed: number) {
  const a = now * 0.0032 + seed;
  const x = cx + Math.cos(a) * tile * 0.32 + Math.sin(a * 3.1) * tile * 0.06;
  const y = cy + Math.sin(a * 1.4) * tile * 0.22;
  const flap = Math.abs(Math.sin(now * 0.05 + seed)) * tile * 0.05 + tile * 0.01;
  ctx.fillStyle = 'rgba(236,240,255,0.9)';
  ctx.beginPath();
  ctx.ellipse(x - flap * 0.6, y, flap, tile * 0.04, 0.4, 0, Math.PI * 2);
  ctx.ellipse(x + flap * 0.6, y, flap, tile * 0.04, -0.4, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(x, y, 0, x, y, tile * 0.2);
  g.addColorStop(0, 'rgba(200,220,255,0.35)');
  g.addColorStop(1, 'rgba(200,220,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - tile * 0.2, y - tile * 0.2, tile * 0.4, tile * 0.4);
}

// ---------------------------------------------------------------- the pale thing

/**
 * It: small, round-headed, a hem that won't keep still, eyes a little too
 * big and a little too far apart. A leaf has stuck to it. Looking at you, it
 * tilts its head.
 */
export function drawGhostFigure(ctx: Ctx, x: number, y: number, tile: number, alpha: number, now: number, opts: { looking?: boolean; waving?: number; seed?: number } = {}) {
  if (alpha <= 0.01) return;
  const seed = opts.seed ?? 0;
  const bob = Math.sin(now * 0.0021 + seed) * tile * 0.05;
  const s = tile * 0.22;
  ctx.save();
  ctx.translate(x, y - tile * 0.45 + bob);
  ctx.rotate(opts.looking ? -0.2 : Math.sin(now * 0.0008 + seed) * 0.05);
  ctx.globalAlpha = alpha;
  // A soft halo.
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 3);
  halo.addColorStop(0, 'rgba(210,225,255,0.22)');
  halo.addColorStop(1, 'rgba(210,225,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(-s * 3, -s * 3, s * 6, s * 6);
  // The body: dome, sides, a hem in three scallops that ripple.
  ctx.fillStyle = 'rgba(238,242,255,0.82)';
  ctx.beginPath();
  ctx.moveTo(-s, 0);
  ctx.arc(0, 0, s, Math.PI, 0);
  ctx.lineTo(s * 0.95, s * 1.1);
  for (let i = 0; i < 3; i++) {
    const x0 = s * 0.95 - ((i + 1) * s * 1.9) / 3;
    const wob = Math.sin(now * 0.006 + i * 2 + seed) * s * 0.1;
    ctx.quadraticCurveTo(x0 + s * 0.32, s * 1.45 + wob, x0, s * 1.1);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,170,200,0.4)';
  ctx.lineWidth = Math.max(0.6, s * 0.05);
  ctx.stroke();
  // A little arm, when it waves.
  if (opts.waving !== undefined) {
    const wave = Math.sin(opts.waving * 9) * 0.4;
    ctx.save();
    ctx.translate(s * 0.85, s * 0.35);
    ctx.rotate(-0.9 + wave);
    ctx.fillStyle = 'rgba(238,242,255,0.82)';
    ctx.beginPath();
    ctx.ellipse(s * 0.25, 0, s * 0.3, s * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Eyes: too big, too far apart, and very dark.
  ctx.fillStyle = '#17141f';
  ctx.beginPath();
  ctx.ellipse(-s * 0.4, -s * 0.05, s * 0.17, s * 0.24, 0.1, 0, Math.PI * 2);
  ctx.ellipse(s * 0.4, -s * 0.05, s * 0.17, s * 0.24, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(-s * 0.45, -s * 0.13, s * 0.05, 0, Math.PI * 2);
  ctx.arc(s * 0.35, -s * 0.13, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
  // The leaf it's carrying around without knowing.
  ctx.fillStyle = '#c25a26';
  ctx.beginPath();
  ctx.ellipse(s * 0.55, s * 0.75, s * 0.18, s * 0.09, 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Only in the water: upside down, wavering, and nothing standing above it. */
export function drawGhostReflection(ctx: Ctx, x: number, y: number, tile: number, alpha: number, now: number, seed: number) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - tile, y - tile * 0.1, tile * 2, tile * 1.3);
  ctx.clip();
  const slices = 6;
  for (let i = 0; i < slices; i++) {
    ctx.save();
    ctx.beginPath();
    const top = y - tile * 0.1 + (i * tile * 1.3) / slices;
    ctx.rect(x - tile, top, tile * 2, (tile * 1.3) / slices + 1);
    ctx.clip();
    ctx.translate(Math.sin(now * 0.004 + i * 1.3) * tile * 0.04, 0);
    ctx.translate(x, y);
    ctx.scale(1, -1);
    drawGhostFigure(ctx, 0, -tile * 0.15, tile, alpha * 0.45, now, { seed });
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- strange things

/** A dark someone, very still, at the edge of the trees. */
function drawFigure(ctx: Ctx, x: number, y: number, tile: number, alpha: number, height = 1.7) {
  const h = tile * height;
  ctx.fillStyle = `rgba(10,10,16,${0.82 * alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y - h * 0.86, h * 0.09, h * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - h * 0.13, y);
  ctx.quadraticCurveTo(x - h * 0.17, y - h * 0.45, x - h * 0.12, y - h * 0.7);
  ctx.quadraticCurveTo(x, y - h * 0.78, x + h * 0.12, y - h * 0.7);
  ctx.quadraticCurveTo(x + h * 0.17, y - h * 0.45, x + h * 0.13, y);
  ctx.closePath();
  ctx.fill();
}

/** A fox shape, sitting up: the shadow fox, or something larger. */
function drawSittingFox(ctx: Ctx, x: number, y: number, s: number, fill: string, dir: number, headTurn = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.fillStyle = fill;
  // Tail, wrapped round.
  ctx.beginPath();
  ctx.moveTo(-s * 0.3, 0);
  ctx.quadraticCurveTo(-s * 1.1, -s * 0.05, -s * 0.9, -s * 0.6);
  ctx.quadraticCurveTo(-s * 0.7, -s * 0.25, -s * 0.1, -s * 0.1);
  ctx.closePath();
  ctx.fill();
  // Body.
  ctx.beginPath();
  ctx.moveTo(-s * 0.4, 0);
  ctx.quadraticCurveTo(-s * 0.45, -s * 0.9, -s * 0.05, -s * 1.15);
  ctx.quadraticCurveTo(s * 0.3, -s * 0.95, s * 0.35, 0);
  ctx.closePath();
  ctx.fill();
  // Head, with ears and a muzzle; turned toward you, the muzzle shortens.
  const hx = s * (0.12 - headTurn * 0.12);
  ctx.beginPath();
  ctx.arc(hx, -s * 1.3, s * 0.27, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hx - s * 0.22, -s * 1.42);
  ctx.lineTo(hx - s * 0.16, -s * 1.85);
  ctx.lineTo(hx + s * 0.0, -s * 1.5);
  ctx.moveTo(hx + s * 0.06, -s * 1.5);
  ctx.lineTo(hx + s * 0.22, -s * 1.85);
  ctx.lineTo(hx + s * 0.27, -s * 1.38);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hx + s * 0.2, -s * 1.38);
  ctx.lineTo(hx + s * (0.55 - headTurn * 0.35), -s * 1.22);
  ctx.lineTo(hx + s * 0.18, -s * 1.12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Things that show from behind the trees: drawn before the trees, so the trees cover them. */
export function drawBehindTrees(ctx: Ctx, camera: Camera, events: OctoberEvent[]) {
  const tile = tileOf(camera);
  for (const e of events) {
    if (e.kind !== 'shadow') continue;
    const a = eventAlpha(e);
    if (a <= 0) continue;
    const t = e.age / e.dur;
    const out = Math.sin(Math.min(1, t) * Math.PI);
    const s = scr(camera, e.x + 0.5 + e.dir * out * 0.42, e.y + 0.5);
    drawFigure(ctx, s.x, s.y + tile * 0.25, tile, a, 1.1);
  }
}

/** Strange things that stand in the scene (depth-sorted with everything else). */
export function drawStandingEvent(ctx: Ctx, camera: Camera, e: OctoberEvent, now: number) {
  const tile = tileOf(camera);
  const a = eventAlpha(e);
  if (a <= 0) return;
  const p = eventPos(e);
  const s = scr(camera, p.x, p.y);
  ctx.save();
  switch (e.kind) {
    case 'watcher':
      drawFigure(ctx, s.x, s.y, tile, a);
      break;
    case 'shadowFox': {
      // There, utterly still — and then, at the very end, not.
      const end = e.age > e.dur - 0.15 ? 0 : 1;
      drawSittingFox(ctx, s.x, s.y, tile * 0.42, `rgba(14,12,18,${0.88 * a * end})`, e.dir);
      if (end) {
        ctx.fillStyle = `rgba(200,220,170,${0.5 * a})`;
        ctx.beginPath();
        ctx.arc(s.x + e.dir * tile * 0.12, s.y - tile * 0.56, tile * 0.018, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'visitor': {
      // It stands quite still; then, having seen what it came to see, it turns and goes back into the trees.
      const visits = e.visits ?? 0;
      const leaving = Math.max(0, (e.age - 8) / 3);
      const turnToYou = visits >= 2 && e.age > 5.5 && e.age < 8 ? Math.sin(((e.age - 5.5) / 2.5) * Math.PI) : 0;
      const dir = leaving > 0 ? -e.dir : e.dir;
      const x = s.x + (leaving > 0 ? -e.dir * leaving * tile * 1.2 : 0);
      const alpha = a * (1 - Math.min(1, leaving));
      const sz = tile * 0.95;
      // A faint warm rim, as if lit from somewhere you can't see.
      ctx.fillStyle = `rgba(150,80,40,${0.25 * alpha})`;
      ctx.save();
      ctx.translate(tile * 0.03 * e.dir, -tile * 0.02);
      drawSittingFox(ctx, x, s.y, sz, `rgba(150,80,40,${0.25 * alpha})`, dir, turnToYou);
      ctx.restore();
      drawSittingFox(ctx, x, s.y, sz, `rgba(12,10,16,${0.9 * alpha})`, dir, turnToYou);
      if (visits >= 1 && leaving <= 0) {
        const hx = x + dir * sz * (0.12 - turnToYou * 0.12 + 0.12);
        ctx.fillStyle = `rgba(255,170,70,${0.75 * alpha})`;
        ctx.beginPath();
        ctx.arc(hx, s.y - sz * 1.32, tile * 0.022, 0, Math.PI * 2);
        if (turnToYou > 0.3) ctx.arc(hx - dir * sz * 0.16, s.y - sz * 1.32, tile * 0.022, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'lantern': {
      const bob = Math.sin(now * 0.003 + e.seed) * tile * 0.08;
      drawHangingLantern(ctx, s.x, s.y - tile * 0.9 + bob, tile * 1.1, a * (e.arrived ? 1.3 : 1), now, e.seed);
      break;
    }
    case 'silhouette': {
      // Far off: small, walking.
      const step = Math.abs(Math.sin(e.age * 5)) * tile * 0.03;
      drawFigure(ctx, s.x, s.y - step, tile, a * 0.7, 0.75);
      break;
    }
  }
  ctx.restore();
}

/** The light-giving strange things, drawn into the night's light pass. */
export function drawEventLights(ctx: Ctx, camera: Camera, events: OctoberEvent[], now: number, glow: (x: number, y: number, r: number, c: [number, number, number], a: number) => void) {
  const tile = tileOf(camera);
  for (const e of events) {
    const a = eventAlpha(e);
    if (a <= 0) continue;
    const p = eventPos(e);
    if (e.kind === 'eyes') {
      // Two small lights, low in the leaves. They blink.
      const blink = Math.sin(e.age * 2.3 + e.seed) > 0.93 ? 0.1 : 1;
      const s = scr(camera, p.x + 0.5, p.y + 0.42);
      const gap = tile * 0.07;
      for (const side of [-1, 1]) {
        const gr = ctx.createRadialGradient(s.x + side * gap, s.y, 0, s.x + side * gap, s.y, tile * 0.12);
        gr.addColorStop(0, `rgba(230,255,170,${0.9 * a * blink})`);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(s.x + side * gap - tile * 0.12, s.y - tile * 0.12, tile * 0.24, tile * 0.24);
        ctx.fillStyle = `rgba(255,255,220,${0.95 * a * blink})`;
        ctx.beginPath();
        ctx.ellipse(s.x + side * gap, s.y, tile * 0.022, tile * 0.014 * blink + 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (e.kind === 'wisp') {
      const bob = Math.sin(now * 0.004 + e.seed) * 0.15;
      glow(p.x + 0.5, p.y + 0.1 + bob, 1.1, [150, 230, 210], 0.55 * a);
      const s = scr(camera, p.x + 0.5, p.y + 0.1 + bob);
      ctx.fillStyle = `rgba(230,255,245,${0.9 * a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, tile * 0.05, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === 'lantern') {
      glow(p.x, p.y - 0.75, e.arrived ? 2.6 : 1.8, [255, 196, 110], 0.5 * a);
    }
  }
}

/** Fallen leaves on the air: a few, drifting down and across. */
export function drawDriftingLeaves(ctx: Ctx, camera: Camera, zone: ZoneId, now: number, wind: number) {
  const w = camera.viewW;
  const h = camera.viewH;
  const n = zone === 'woodland' || zone === 'dampForest' ? 16 : zone === 'overgrownClearing' ? 12 : 8;
  for (let i = 0; i < n; i++) {
    const seed = i * 97.3;
    const speed = 0.018 + (i % 5) * 0.004;
    const y = ((now * speed + seed * 7) % (h + 60)) - 30;
    const x = (seed * 13 + now * 0.012 * wind + Math.sin(now * 0.0011 + i) * 30 + w * 4) % (w + 40) - 20;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(now * 0.0016 * (i % 2 ? 1 : -1) + i);
    ctx.scale(1, 0.4 + 0.6 * Math.abs(Math.sin(now * 0.002 + i)));
    ctx.fillStyle = LEAF_COLORS[i % LEAF_COLORS.length];
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.quadraticCurveTo(0, -3.4, 5, 0);
    ctx.quadraticCurveTo(0, 3.4, -5, 0);
    ctx.fill();
    ctx.restore();
  }
}

/** After dark: motes drifting up, slow, and pockets where the moon gets in. */
export function drawNightAir(ctx: Ctx, camera: Camera, b: { minX: number; maxX: number; minY: number; maxY: number }, darkness: number, now: number) {
  if (darkness < 0.25) return;
  const tile = tileOf(camera);
  const k = Math.min(1, (darkness - 0.25) / 0.6);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const m of MOONLIT) {
    if (m.x + m.r < b.minX || m.x - m.r > b.maxX || m.y + m.r < b.minY || m.y - m.r > b.maxY) continue;
    const s = scr(camera, m.x, m.y);
    const r = m.r * tile;
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
    g.addColorStop(0, `rgba(120,150,200,${0.16 * k})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(s.x - r, s.y - r, r * 2, r * 2);
  }
  const w = camera.viewW;
  const h = camera.viewH;
  for (let i = 0; i < 14; i++) {
    const seed = i * 53.7;
    const x = (seed * 11 + Math.sin(now * 0.0005 + i) * 24 + w * 3) % w;
    const y = h - ((now * (0.006 + (i % 4) * 0.002) + seed * 9) % (h + 20));
    const tw = 0.5 + 0.5 * Math.sin(now * 0.003 + i * 1.7);
    ctx.fillStyle = `rgba(190,225,255,${0.35 * tw * k})`;
    ctx.beginPath();
    ctx.arc(x, y, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Lights far off in the trees, going on and off on their own time. */
export const DISTANT_LIGHTS: Pt[] = [
  { x: 84, y: 6 },
  { x: 58, y: 3 },
  { x: 4, y: 58 },
  { x: 3, y: 9 },
  { x: 27, y: 61 },
];

export function distantLightLevel(i: number, now: number): number {
  // Each is on for a while once every few minutes, out of step with the others.
  const period = 170000 + i * 37000;
  const t = ((now + i * 51000) % period) / period;
  return t < 0.12 ? Math.sin((t / 0.12) * Math.PI) : 0;
}

/**
 * October's colour: warmer and a little dimmer by day; at night the middle
 * of the screen stays clear, and only the edges go to dark. Drawn once into
 * a small canvas whenever the light has moved on enough, then stretched over
 * the view: gradients across the whole screen every frame are dear on a phone.
 */
export class Grade {
  private canvas: HTMLCanvasElement | null = null;
  private key = '';

  draw(ctx: Ctx, camera: Camera, darkness: number) {
    const w = camera.viewW;
    const h = camera.viewH;
    // A quarter of the size is plenty: it's all soft gradients.
    const cw = Math.max(8, Math.ceil(w / 4));
    const ch = Math.max(8, Math.ceil(h / 4));
    const key = `${cw}x${ch}|${Math.round(darkness * 50)}`;
    if (key !== this.key || !this.canvas) {
      this.canvas ??= document.createElement('canvas');
      this.canvas.width = cw;
      this.canvas.height = ch;
      const g = this.canvas.getContext('2d');
      if (!g) return;
      this.key = key;
      g.clearRect(0, 0, cw, ch);
      // Golden-hour warmth, deepest at dusk.
      const dusk = Math.max(0, 1 - Math.abs(darkness - 0.5) * 2.2);
      g.fillStyle = `rgba(120,60,20,${0.06 + dusk * 0.08})`;
      g.fillRect(0, 0, cw, ch);
      if (dusk > 0.05) {
        const lg = g.createLinearGradient(0, 0, 0, ch);
        lg.addColorStop(0, `rgba(90,40,90,${0.12 * dusk})`);
        lg.addColorStop(1, 'rgba(90,40,90,0)');
        g.fillStyle = lg;
        g.fillRect(0, 0, cw, ch);
      }
      // Pockets of mystery at the edges; the middle, where you are, stays seen.
      const r = Math.hypot(cw, ch) / 2;
      const v = g.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.32, cw / 2, ch / 2, r);
      v.addColorStop(0, 'rgba(6,8,16,0)');
      v.addColorStop(1, `rgba(6,8,16,${0.12 + darkness * 0.3})`);
      g.fillStyle = v;
      g.fillRect(0, 0, cw, ch);
    }
    ctx.drawImage(this.canvas, 0, 0, w, h);
  }
}

/** A bush or tree shivering when nothing's there to shake it, and a leaf or two shaken off. */
export function drawRustle(ctx: Ctx, camera: Camera, e: OctoberEvent) {
  const a = eventAlpha(e);
  if (a <= 0) return;
  const tile = tileOf(camera);
  const s = scr(camera, e.x + 0.5, e.y + 0.3);
  const t = e.age / e.dur;
  ctx.save();
  ctx.strokeStyle = `rgba(40,30,20,${0.5 * a * (1 - t)})`;
  ctx.lineWidth = Math.max(0.8, tile * 0.025);
  const shake = Math.sin(e.age * 40) * tile * 0.04;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s.x + side * tile * 0.32 + shake, s.y - tile * 0.2);
    ctx.lineTo(s.x + side * tile * 0.42 + shake, s.y - tile * 0.35);
    ctx.moveTo(s.x + side * tile * 0.35 - shake, s.y - tile * 0.05);
    ctx.lineTo(s.x + side * tile * 0.48 - shake, s.y - tile * 0.1);
    ctx.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const lx = s.x + (i - 1) * tile * 0.2 + Math.sin(e.age * 3 + i) * tile * 0.1;
    const ly = s.y - tile * 0.3 + t * tile * (0.5 + i * 0.15);
    ctx.fillStyle = LEAF_COLORS[(e.seed + i) % LEAF_COLORS.length];
    ctx.globalAlpha = a * (1 - t * 0.6);
    ctx.beginPath();
    ctx.ellipse(lx, ly, tile * 0.05, tile * 0.025, e.age * 4 + i, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- indoors

/** The greenhouse after dark in October: fogged glass, moonlight, vines, webs; sometimes something on the other side of the glass. */
export function drawOctoberGreenhouseShell(ctx: Ctx, camera: Camera, ghW: number, ghH: number, darkness: number, now: number, events: OctoberEvent[]) {
  const tile = tileOf(camera);
  const tl = scr(camera, 0, 0);
  // Moonlight through the glass, in place of the sun.
  if (darkness > 0.3) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(140,170,230,${0.06 * darkness})`;
    for (let i = 0; i < 3; i++) {
      const a = scr(camera, 3 + i * 5, 1);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + tile * 1.2, a.y);
      ctx.lineTo(a.x - tile * 0.6, a.y + tile * 9.5);
      ctx.lineTo(a.x - tile * 1.8, a.y + tile * 9.5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  // Whatever's outside the north glass, seen through it.
  for (const e of events) {
    const a = eventAlpha(e);
    if (a <= 0) continue;
    const p = eventPos(e);
    ctx.save();
    // On the other side of the north glass, or the south.
    const row = Math.floor(p.y);
    ctx.beginPath();
    ctx.rect(tl.x + tile, tl.y + row * tile, (ghW - 2) * tile, tile);
    ctx.clip();
    const s = scr(camera, p.x, row);
    if (e.kind === 'glassFigure') {
      // Tall-eared, quite still, looking in.
      ctx.fillStyle = `rgba(14,16,22,${0.75 * a})`;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + tile * 0.95, tile * 0.24, tile * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(s.x, s.y + tile * 0.35, tile * 0.17, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s.x - tile * 0.14, s.y + tile * 0.3);
      ctx.lineTo(s.x - tile * 0.1, s.y - tile * 0.05);
      ctx.lineTo(s.x - tile * 0.02, s.y + tile * 0.24);
      ctx.moveTo(s.x + tile * 0.02, s.y + tile * 0.24);
      ctx.lineTo(s.x + tile * 0.1, s.y - tile * 0.05);
      ctx.lineTo(s.x + tile * 0.14, s.y + tile * 0.3);
      ctx.fill();
    } else if (e.kind === 'glassShadow') {
      const g = ctx.createRadialGradient(s.x, s.y + tile * 0.5, 0, s.x, s.y + tile * 0.5, tile * 0.9);
      g.addColorStop(0, `rgba(10,14,20,${0.6 * a})`);
      g.addColorStop(1, 'rgba(10,14,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(s.x - tile, s.y, tile * 2, tile);
    }
    ctx.restore();
  }
  // Condensation: the glass gone milky, beaded and run.
  ctx.save();
  ctx.fillStyle = `rgba(226,234,238,${0.2 + darkness * 0.08})`;
  ctx.fillRect(tl.x, tl.y, ghW * tile, tile);
  ctx.fillRect(tl.x, tl.y + (ghH - 1) * tile, ghW * tile, tile);
  ctx.fillRect(tl.x, tl.y + tile, tile, (ghH - 2) * tile);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 40; i++) {
    const along = hash2(i, 3) * ghW;
    const top = i % 3 !== 0;
    const x = top ? tl.x + along * tile : tl.x + hash2(i, 9) * tile;
    const y = top ? tl.y + hash2(7, i) * tile * 0.9 : tl.y + tile + hash2(i, 5) * (ghH - 2) * tile;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.6, tile * 0.02 * (0.6 + hash2(i, i))), 0, Math.PI * 2);
    ctx.fill();
    if (i % 5 === 0) ctx.fillRect(x - 0.4, y, 0.8, tile * 0.18 * hash2(i, 1));
  }
  ctx.restore();
  // Vines hung down from the roof beam.
  ctx.save();
  ctx.strokeStyle = '#3e5a2c';
  ctx.lineWidth = Math.max(1, tile * 0.025);
  for (let i = 0; i < 7; i++) {
    const vx = 1.6 + i * 2.25;
    if (vx > 8.4 && vx < 9.8) continue;
    const len = 0.7 + hash2(i, 2) * 0.9;
    const sway = Math.sin(now * 0.0009 + i) * tile * 0.05;
    const s = scr(camera, vx, 0.95);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.quadraticCurveTo(s.x + sway, s.y + len * tile * 0.5, s.x + sway * 1.6, s.y + len * tile);
    ctx.stroke();
    ctx.fillStyle = i % 2 ? '#4a6a34' : '#6a5a2a';
    for (let k = 1; k <= 3; k++) {
      ctx.beginPath();
      ctx.ellipse(s.x + sway * (k / 3) * 1.4 + (k % 2 ? 3 : -3), s.y + (k / 3.2) * len * tile, tile * 0.06, tile * 0.035, k, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  // Webs in the corners.
  drawWeb(ctx, tl.x + tile * 1.02, tl.y + tile * 1.02, tile * 0.7, Math.PI / 4, 0.4);
  drawWeb(ctx, tl.x + (ghW - 1.02) * tile, tl.y + tile * 1.02, tile * 0.6, (Math.PI * 3) / 4, 0.35);
  drawWeb(ctx, tl.x + tile * 1.02, tl.y + (ghH - 1.02) * tile, tile * 0.5, -Math.PI / 4, 0.3);
}

/** Glowing mushrooms in a crock: a corner of the greenhouse that's gone a little strange. */
export function drawMushroomCrock(ctx: Ctx, x: number, y: number, tile: number, now: number, hue: number) {
  ctx.fillStyle = '#4a3a30';
  ctx.beginPath();
  ctx.moveTo(x - tile * 0.18, y - tile * 0.2);
  ctx.lineTo(x + tile * 0.18, y - tile * 0.2);
  ctx.lineTo(x + tile * 0.14, y);
  ctx.lineTo(x - tile * 0.14, y);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    const mx = x + (i - 1.5) * tile * 0.08;
    const h = tile * (0.12 + hash2(i, hue) * 0.12);
    ctx.strokeStyle = 'rgba(230,230,220,0.9)';
    ctx.lineWidth = Math.max(0.7, tile * 0.02);
    ctx.beginPath();
    ctx.moveTo(mx, y - tile * 0.2);
    ctx.lineTo(mx, y - tile * 0.2 - h);
    ctx.stroke();
    const pulse = 0.8 + 0.2 * Math.sin(now * 0.002 + i);
    ctx.fillStyle = `hsla(${hue} 80% ${68 * pulse}% / 0.95)`;
    ctx.beginPath();
    ctx.ellipse(mx, y - tile * 0.2 - h, tile * 0.06, tile * 0.04, 0, Math.PI, 0);
    ctx.fill();
  }
}

/** The living room in October: a garland, curtains at night, candles. */
export function drawOctoberLivingRoom(ctx: Ctx, camera: Camera, partitionX: number, interiorW: number, windows: { wall: 'north' | 'east'; x?: number; y?: number; span: number }[], darkness: number, now: number) {
  const tile = tileOf(camera);
  // A garland of autumn leaves along the north wall.
  const a = scr(camera, partitionX + 1, 0.9);
  const b = scr(camera, interiorW - 1, 0.9);
  ctx.strokeStyle = '#5a4026';
  ctx.lineWidth = Math.max(1, tile * 0.02);
  ctx.beginPath();
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n;
    const y = a.y + Math.sin((i / n) * Math.PI * 3) * tile * 0.06 + tile * 0.04;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  for (let i = 0; i <= n * 3; i++) {
    const x = a.x + ((b.x - a.x) * i) / (n * 3);
    const y = a.y + Math.sin((i / (n * 3)) * Math.PI * 3) * tile * 0.06 + tile * 0.06;
    ctx.fillStyle = LEAF_COLORS[i % LEAF_COLORS.length];
    ctx.beginPath();
    ctx.ellipse(x, y, tile * 0.06, tile * 0.035, i, 0, Math.PI * 2);
    ctx.fill();
  }
  // Curtains drawn across the windows after dark.
  if (darkness > 0.45) {
    for (const w of windows) {
      if (w.wall === 'north' && w.x !== undefined) {
        const s = scr(camera, w.x, 0.15);
        ctx.fillStyle = '#6e2a22';
        ctx.fillRect(s.x, s.y, w.span * tile * 0.35, tile * 0.7);
        ctx.fillRect(s.x + w.span * tile * 0.65, s.y, w.span * tile * 0.35, tile * 0.7);
      } else if (w.wall === 'east' && w.y !== undefined) {
        const s = scr(camera, interiorW - 0.85, w.y);
        ctx.fillStyle = '#6e2a22';
        ctx.fillRect(s.x, s.y, tile * 0.7, w.span * tile * 0.35);
        ctx.fillRect(s.x, s.y + w.span * tile * 0.65, tile * 0.7, w.span * tile * 0.35);
      }
    }
  }
  void now;
}

/** A candle (or three) with a live flame. */
export function drawCandles(ctx: Ctx, x: number, y: number, tile: number, now: number, n = 3) {
  for (let i = 0; i < n; i++) {
    const cx = x + (i - (n - 1) / 2) * tile * 0.1;
    const h = tile * (0.14 + (i % 2) * 0.06);
    ctx.fillStyle = '#efe2c4';
    ctx.fillRect(cx - tile * 0.03, y - h, tile * 0.06, h);
    const fl = Math.sin(now * 0.021 + i * 2.7) * tile * 0.008;
    ctx.fillStyle = '#ffd77a';
    ctx.beginPath();
    ctx.ellipse(cx + fl, y - h - tile * 0.04, tile * 0.022, tile * 0.042, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
