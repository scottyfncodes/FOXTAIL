import type { CoverKind } from '../systems/overgrowth';

/**
 * The valley's own ground cover (systems/overgrowth.ts), one tile at a time:
 * a cushion of moss, a mat of clover, a few young fern fronds, a little
 * cluster of mushrooms, fallen leaves, ivy, wildflowers, sedge, lichen.
 * Unlike the verge underneath (VergeArt.ts), which is quiet everywhere,
 * cover is meant to be noticed: richer colour, a soft shaped base, and it
 * visibly thickens as a patch goes from level 1 to 4 — a scrap, a tuft, a
 * drift, a carpet spilling over the tile's edge.
 *
 * Each look is drawn once into a small canvas and cached, and the ground
 * layer that uses them is itself cached, so cover costs nothing per frame.
 */

type Ctx = CanvasRenderingContext2D;

function hash(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function hsl(h: number, s: number, l: number, a = 1): string {
  return `hsla(${h} ${Math.max(0, Math.min(100, s))}% ${Math.max(0, Math.min(100, l))}% / ${a})`;
}

/** How far over the tile's own square a patch may reach, as a share of the tile. */
const REACH = [0, 0.22, 0.34, 0.46, 0.56];
/** How many of each element a patch carries at each level. */
const COUNT = [0, 4, 7, 11, 16];

interface Spot {
  x: number;
  y: number;
  r: number;
  v: number;
}

/** A soft, irregular base the patch's elements sit on, so it reads as one patch rather than confetti. */
function base(g: Ctx, cx: number, cy: number, rad: number, color: string, seed: number) {
  g.fillStyle = color;
  g.beginPath();
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = rad * (0.72 + 0.4 * hash(seed + i, i * 3.1));
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * 0.62;
    if (i === 0) g.moveTo(x, y);
    else g.quadraticCurveTo(cx + Math.cos(a - Math.PI / n) * rr * 1.08, cy + Math.sin(a - Math.PI / n) * rr * 0.68, x, y);
  }
  g.closePath();
  g.fill();
}

function mossTuft(g: Ctx, x: number, y: number, r: number, v: number) {
  const h = 96 + v * 28;
  g.fillStyle = hsl(h, 48, 24 + v * 6);
  g.beginPath();
  g.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = hsl(h - 6, 58, 36 + v * 8);
  g.beginPath();
  g.ellipse(x - r * 0.2, y - r * 0.2, r * 0.68, r * 0.45, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = hsl(h - 14, 70, 56, 0.75);
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.arc(x - r * 0.4 + i * r * 0.32, y - r * 0.32 + (i % 2) * r * 0.1, Math.max(0.6, r * 0.12), 0, Math.PI * 2);
    g.fill();
  }
}

function cloverLeaf(g: Ctx, x: number, y: number, r: number, v: number, flower: boolean) {
  g.fillStyle = hsl(112 + v * 10, 46, 34 + v * 10);
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3 + v;
    g.beginPath();
    g.arc(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.6, r * 0.62, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = hsl(100, 40, 62, 0.6);
  g.beginPath();
  g.arc(x, y, r * 0.22, 0, Math.PI * 2);
  g.fill();
  if (flower) {
    // A white (or now and then pink) clover head standing a little proud.
    g.fillStyle = v > 0.7 ? 'rgba(240,170,200,0.95)' : 'rgba(250,248,240,0.95)';
    g.beginPath();
    g.arc(x + r * 0.5, y - r * 1.4, r * 0.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(200,190,170,0.6)';
    g.beginPath();
    g.arc(x + r * 0.62, y - r * 1.3, r * 0.25, 0, Math.PI * 2);
    g.fill();
  }
}

function frond(g: Ctx, x: number, y: number, len: number, lean: number, v: number) {
  const h = 108 + v * 22;
  const tipX = x + lean * len;
  const tipY = y - len;
  g.strokeStyle = hsl(h, 40, 24);
  g.lineWidth = Math.max(0.7, len * 0.05);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(x + lean * len * 0.2, y - len * 0.7, tipX, tipY);
  g.stroke();
  const n = 7;
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const px = x + (tipX - x) * t + lean * len * 0.1 * Math.sin(t * Math.PI);
    const py = y + (tipY - y) * t;
    const L = len * 0.32 * (1 - t * 0.75);
    for (const side of [-1, 1]) {
      g.fillStyle = hsl(h + side * 4, 58, 36 + t * 18);
      g.beginPath();
      g.ellipse(px + side * L * 0.5, py + L * 0.12, L * 0.55, L * 0.2, side * 0.5 - lean * 0.4, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function toadstool(g: Ctx, x: number, y: number, r: number, v: number) {
  const capHue = v < 0.35 ? 18 : v < 0.7 ? 32 : 4;
  const capSat = v < 0.7 ? 46 : 70;
  const h = r * 1.4;
  g.fillStyle = 'rgba(236,226,204,0.95)';
  g.fillRect(x - r * 0.2, y - h, r * 0.4, h);
  g.fillStyle = hsl(capHue, capSat, 38 + v * 10);
  g.beginPath();
  g.ellipse(x, y - h, r, r * 0.62, 0, Math.PI, 0);
  g.closePath();
  g.fill();
  g.fillStyle = hsl(capHue, capSat, 58, 0.7);
  g.beginPath();
  g.ellipse(x - r * 0.3, y - h - r * 0.32, r * 0.32, r * 0.16, -0.3, 0, Math.PI * 2);
  g.fill();
  if (v >= 0.7) {
    g.fillStyle = 'rgba(250,246,236,0.9)';
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(x + (i - 1) * r * 0.42, y - h - r * 0.28 + (i % 2) * r * 0.12, Math.max(0.5, r * 0.1), 0, Math.PI * 2);
      g.fill();
    }
  }
}

function fallenLeaf(g: Ctx, x: number, y: number, r: number, v: number) {
  const hue = 18 + v * 30;
  g.fillStyle = hsl(hue, 52 + v * 14, 34 + v * 14, 0.95);
  g.beginPath();
  g.ellipse(x, y, r, r * 0.48, v * Math.PI * 2, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = hsl(hue, 40, 22, 0.6);
  g.lineWidth = Math.max(0.5, r * 0.08);
  g.beginPath();
  g.moveTo(x - Math.cos(v * Math.PI * 2) * r, y - Math.sin(v * Math.PI * 2) * r * 0.48);
  g.lineTo(x + Math.cos(v * Math.PI * 2) * r, y + Math.sin(v * Math.PI * 2) * r * 0.48);
  g.stroke();
}

function ivyLeaf(g: Ctx, x: number, y: number, r: number, v: number) {
  g.fillStyle = hsl(128 + v * 14, 38, 20 + v * 10);
  g.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + ((i - 2) * Math.PI) / 3.2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r * 0.9;
    if (i === 0) g.moveTo(px, py);
    else g.quadraticCurveTo(x + Math.cos(a - 0.3) * r * 0.45, y + Math.sin(a - 0.3) * r * 0.45, px, py);
  }
  g.closePath();
  g.fill();
  g.strokeStyle = hsl(90, 30, 56, 0.55);
  g.lineWidth = Math.max(0.4, r * 0.08);
  g.beginPath();
  g.moveTo(x, y + r * 0.3);
  g.lineTo(x, y - r * 0.7);
  g.stroke();
}

const FLOWER_COLORS = ['rgba(250,214,80,0.95)', 'rgba(170,190,250,0.95)', 'rgba(240,150,196,0.95)', 'rgba(250,248,240,0.95)'];

function wildflower(g: Ctx, x: number, y: number, r: number, v: number) {
  const stem = r * 2.2;
  g.strokeStyle = hsl(104, 40, 30);
  g.lineWidth = Math.max(0.6, r * 0.14);
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(x + (v - 0.5) * r, y - stem * 0.6, x + (v - 0.5) * r * 1.4, y - stem);
  g.stroke();
  g.fillStyle = hsl(104, 44, 34);
  g.beginPath();
  g.ellipse(x - r * 0.4, y - stem * 0.35, r * 0.45, r * 0.18, -0.6, 0, Math.PI * 2);
  g.fill();
  const fx = x + (v - 0.5) * r * 1.4;
  const fy = y - stem;
  g.fillStyle = FLOWER_COLORS[Math.floor(v * FLOWER_COLORS.length) % FLOWER_COLORS.length];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.beginPath();
    g.arc(fx + Math.cos(a) * r * 0.42, fy + Math.sin(a) * r * 0.42, r * 0.36, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(240,190,60,0.95)';
  g.beginPath();
  g.arc(fx, fy, r * 0.25, 0, Math.PI * 2);
  g.fill();
}

function sedgeClump(g: Ctx, x: number, y: number, len: number, v: number) {
  g.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const t = (i / 4 - 0.5) * 2;
    g.strokeStyle = hsl(84 + v * 16 + i * 2, 38, 30 + i * 4);
    g.lineWidth = Math.max(0.7, len * 0.07);
    g.beginPath();
    g.moveTo(x + t * len * 0.08, y);
    g.quadraticCurveTo(x + t * len * 0.2, y - len * 0.6, x + t * len * 0.55, y - len * (0.9 + 0.15 * hash(v, i)));
    g.stroke();
  }
}

function lichenCrust(g: Ctx, x: number, y: number, r: number, v: number) {
  g.fillStyle = v > 0.6 ? 'rgba(226,170,70,0.85)' : v > 0.3 ? 'rgba(196,206,170,0.9)' : 'rgba(160,184,150,0.9)';
  for (let i = 0; i < 4; i++) {
    const a = v * 9 + i * 1.7;
    g.beginPath();
    g.arc(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.3, r * (0.35 + 0.2 * hash(v, i)), 0, Math.PI * 2);
    g.fill();
  }
}

/** The base colour under each kind of patch (null: none, it's just scattered over the soil). */
const BASE: Record<CoverKind, string | null> = {
  moss: 'rgba(36,74,30,0.6)',
  clover: 'rgba(52,96,40,0.45)',
  fernlet: 'rgba(30,64,30,0.5)',
  mushrooms: 'rgba(40,62,30,0.5)',
  litter: 'rgba(92,62,34,0.35)',
  ivy: 'rgba(24,52,26,0.45)',
  wildflowers: 'rgba(62,104,46,0.45)',
  sedge: 'rgba(52,84,40,0.35)',
  lichen: 'rgba(120,132,106,0.3)',
};

function paintCover(g: Ctx, kind: CoverKind, level: number, variant: number, px: number, pad: number) {
  const cx = pad + px / 2;
  const cy = pad + px / 2;
  const reach = px * (0.5 + REACH[level]);
  const seed = variant * 13.7 + level * 3.3 + kind.length;
  const spots: Spot[] = [];
  const n = COUNT[level];
  for (let i = 0; i < n; i++) {
    // Spread over a disc that widens with the level, denser toward the middle.
    const a = hash(seed + i, i * 1.9) * Math.PI * 2;
    const d = Math.sqrt(hash(i * 2.7, seed)) * reach * 0.82;
    spots.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.7, r: hash(seed - i, i * 4.1), v: hash(i * 5.3, seed + 1) });
  }
  spots.sort((a, b) => a.y - b.y);
  const b = BASE[kind];
  if (b) base(g, cx, cy, reach * (0.55 + level * 0.08), b, seed);
  for (const [i, s] of spots.entries()) {
    switch (kind) {
      case 'moss':
        mossTuft(g, s.x, s.y, px * (0.1 + 0.08 * s.r) * (0.8 + level * 0.08), s.v);
        break;
      case 'clover':
        cloverLeaf(g, s.x, s.y, px * (0.045 + 0.025 * s.r), s.v, level >= 2 && i % 4 === 1);
        break;
      case 'fernlet':
        if (i % 2 === 0 || level <= 1) frond(g, s.x, s.y, px * (0.32 + 0.16 * s.r) * (0.75 + level * 0.12), (s.v - 0.5) * 1.4, s.v);
        else mossTuft(g, s.x, s.y, px * 0.07, s.v);
        break;
      case 'mushrooms':
        if (i % 3 === 2) mossTuft(g, s.x, s.y, px * 0.08, s.v);
        else toadstool(g, s.x, s.y, px * (0.085 + 0.06 * s.r) * (0.8 + level * 0.08), (variant % 3) / 3 + s.v * 0.3);
        break;
      case 'litter':
        fallenLeaf(g, s.x, s.y, px * (0.06 + 0.04 * s.r), s.v);
        break;
      case 'ivy':
        ivyLeaf(g, s.x, s.y, px * (0.07 + 0.04 * s.r), s.v);
        break;
      case 'wildflowers':
        if (i % 3 === 0) cloverLeaf(g, s.x, s.y, px * 0.04, s.v, false);
        else wildflower(g, s.x, s.y, px * (0.055 + 0.025 * s.r), (s.v + variant * 0.27) % 1);
        break;
      case 'sedge':
        sedgeClump(g, s.x, s.y, px * (0.22 + 0.12 * s.r) * (0.8 + level * 0.1), s.v);
        break;
      case 'lichen':
        lichenCrust(g, s.x, s.y, px * (0.07 + 0.05 * s.r), s.v);
        break;
    }
  }
}

export class CoverTiles {
  private cache = new Map<string, HTMLCanvasElement>();

  constructor(private dpr: () => number) {}

  /** Padding around a tile, in pixels: a thick patch spills over its edges. */
  static pad(px: number): number {
    return Math.ceil(Math.round(px) * 0.6);
  }

  get(kind: CoverKind, level: number, variant: number, px: number): HTMLCanvasElement | null {
    const dpr = this.dpr();
    const size = Math.round(px);
    const key = `${kind}|${level}|${variant}|${size}|${dpr}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    if (this.cache.size > 500) this.cache.clear();
    if (typeof document === 'undefined') return null;
    const pad = CoverTiles.pad(size);
    const c = document.createElement('canvas');
    c.width = Math.ceil((size + pad * 2) * dpr);
    c.height = Math.ceil((size + pad * 2) * dpr);
    const g = c.getContext('2d');
    if (!g) return null;
    g.scale(dpr, dpr);
    paintCover(g, kind, level, variant, size, pad);
    this.cache.set(key, c);
    return c;
  }
}
