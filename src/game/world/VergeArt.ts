import type { ZoneId } from '../types';

/**
 * The verge: what nature grows in the gaps the player can't fill. Every
 * open tile of the valley gets an undergrowth of its own — meadow grass
 * and clover, woodland fern and ivy, moss and dock in the damp, sedge
 * and reed along the water, lichen and tufts on the rock — thick enough
 * that no ground reads as bare, and quiet enough (low contrast, colours
 * close to the soil) that the player's plants still stand out of it.
 *
 * Tiles are drawn once per look and cached, so a screenful costs one
 * drawImage a tile.
 */

type Ctx = CanvasRenderingContext2D;

/** How thick the growth is on a tile. */
export type VergeLevel = 0 | 1 | 2;

interface Palette {
  /** Hue / saturation / lightness of the main growth. */
  h: number;
  s: number;
  l: number;
  /** Small colour accents: flowers, lichen, fungi. */
  accents: string[];
}

const PALETTE: Record<Exclude<ZoneId, 'greenhouse'>, Palette> = {
  meadow: { h: 92, s: 46, l: 42, accents: ['rgba(252,248,236,0.9)', 'rgba(250,214,96,0.9)', 'rgba(196,208,248,0.85)'] },
  overgrownClearing: { h: 98, s: 44, l: 36, accents: ['rgba(236,150,196,0.9)', 'rgba(200,170,240,0.85)', 'rgba(252,248,236,0.85)'] },
  woodland: { h: 104, s: 34, l: 31, accents: ['rgba(214,184,140,0.85)', 'rgba(236,228,200,0.6)'] },
  dampForest: { h: 118, s: 40, l: 28, accents: ['rgba(224,232,220,0.55)', 'rgba(150,200,150,0.5)'] },
  creek: { h: 100, s: 40, l: 38, accents: ['rgba(252,248,236,0.8)', 'rgba(170,130,90,0.9)'] },
  rockyClearing: { h: 82, s: 30, l: 46, accents: ['rgba(206,212,180,0.55)', 'rgba(250,214,96,0.7)'] },
};

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function hsl(h: number, s: number, l: number, a = 1): string {
  return `hsla(${h} ${Math.max(0, Math.min(100, s))}% ${Math.max(0, Math.min(100, l))}% / ${a})`;
}

/** A grass blade: a thin tapered stroke leaning with the wind, lit on one edge. */
function blade(g: Ctx, x: number, y: number, len: number, lean: number, pal: Palette, dl: number) {
  const w = Math.max(0.8, len * 0.16);
  g.beginPath();
  g.moveTo(x - w, y);
  g.quadraticCurveTo(x + lean * 0.5, y - len * 0.6, x + lean, y - len);
  g.quadraticCurveTo(x + lean * 0.5 + w * 0.6, y - len * 0.5, x + w, y);
  g.closePath();
  g.fillStyle = hsl(pal.h, pal.s, pal.l + dl - 5);
  g.fill();
  g.strokeStyle = hsl(pal.h + 8, pal.s + 6, pal.l + dl + 12, 0.7);
  g.lineWidth = Math.max(0.6, len * 0.05);
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(x + lean * 0.5, y - len * 0.6, x + lean, y - len);
  g.stroke();
}

/** A tuft: a fan of blades from one root. */
function tuft(g: Ctx, x: number, y: number, size: number, pal: Palette, seed: number) {
  const n = 4 + Math.floor(hash2(seed, 3) * 3);
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1) - 0.5) * 2;
    blade(g, x + t * size * 0.12, y, size * (0.7 + 0.4 * hash2(seed + i, 1)), t * size * 0.5 + (hash2(seed, i) - 0.5) * size * 0.2, pal, (hash2(i, seed) - 0.5) * 10);
  }
}

/** Clover: three round leaflets on a short stem. */
function clover(g: Ctx, x: number, y: number, r: number, pal: Palette, dl: number) {
  g.fillStyle = hsl(pal.h + 14, pal.s + 4, pal.l + dl);
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
    g.beginPath();
    g.arc(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8, r * 0.8, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = hsl(pal.h + 14, pal.s, pal.l + dl + 12, 0.5);
  g.beginPath();
  g.arc(x, y - r * 0.4, r * 0.35, 0, Math.PI * 2);
  g.fill();
}

/** A small fern frond: a tapered midrib with paired pinnae. */
function frond(g: Ctx, x: number, y: number, len: number, rot: number, pal: Palette, dl: number) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.strokeStyle = hsl(pal.h + 6, pal.s + 4, pal.l + dl + 2);
  g.lineWidth = Math.max(0.7, len * 0.05);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(len, 0);
  g.stroke();
  const pairs = 5 + Math.floor(len / 9);
  g.fillStyle = hsl(pal.h + 4, pal.s + 6, pal.l + dl - 2);
  for (let i = 1; i <= pairs; i++) {
    const px = (i / (pairs + 0.6)) * len;
    const pl = len * 0.22 * (1 - Math.abs(i / pairs - 0.45) * 1.1);
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(px, 0);
      g.quadraticCurveTo(px + pl * 0.35, side * pl * 0.6, px + pl * 0.25, side * pl);
      g.quadraticCurveTo(px + pl * 0.6, side * pl * 0.4, px + pl * 0.5, 0);
      g.closePath();
      g.fill();
    }
  }
  g.restore();
}

/** A broad low leaf — dock, plantain, wild ginger — with a pale midrib. */
function dock(g: Ctx, x: number, y: number, len: number, rot: number, pal: Palette, dl: number) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = hsl(pal.h - 4, pal.s + 6, pal.l + dl - 4);
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.5, -len * 0.42, len, 0);
  g.quadraticCurveTo(len * 0.5, len * 0.42, 0, 0);
  g.fill();
  g.strokeStyle = hsl(pal.h, pal.s, pal.l + dl + 16, 0.6);
  g.lineWidth = Math.max(0.6, len * 0.04);
  g.beginPath();
  g.moveTo(len * 0.05, 0);
  g.lineTo(len * 0.9, 0);
  g.stroke();
  g.restore();
}

/** A pad of moss: a soft mound in a slightly different green, with a lit crown. */
function moss(g: Ctx, x: number, y: number, r: number, pal: Palette, dl: number) {
  g.fillStyle = hsl(pal.h + 10, pal.s + 8, pal.l + dl + 2, 0.85);
  g.beginPath();
  g.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = hsl(pal.h + 14, pal.s + 8, pal.l + dl + 12, 0.5);
  g.beginPath();
  g.ellipse(x - r * 0.15, y - r * 0.15, r * 0.55, r * 0.3, 0, 0, Math.PI * 2);
  g.fill();
}

/** Lichen or a scatter of tiny stones on rock. */
function lichen(g: Ctx, x: number, y: number, r: number, color: string) {
  g.fillStyle = color;
  for (let i = 0; i < 4; i++) {
    const a = hash2(x + i, y) * Math.PI * 2;
    const d = hash2(i, x - y) * r;
    g.beginPath();
    g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, r * (0.25 + 0.3 * hash2(i * 3, y)), 0, Math.PI * 2);
    g.fill();
  }
}

/** Ivy: a small heart-shaped leaf on the ground. */
function ivy(g: Ctx, x: number, y: number, r: number, rot: number, pal: Palette, dl: number) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = hsl(pal.h + 2, pal.s + 10, pal.l + dl - 6);
  g.beginPath();
  g.moveTo(0, r);
  g.bezierCurveTo(-r * 1.3, -r * 0.2, -r * 0.5, -r * 1.1, 0, -r * 0.4);
  g.bezierCurveTo(r * 0.5, -r * 1.1, r * 1.3, -r * 0.2, 0, r);
  g.fill();
  g.strokeStyle = hsl(pal.h, pal.s, pal.l + dl + 18, 0.55);
  g.lineWidth = Math.max(0.5, r * 0.12);
  g.beginPath();
  g.moveTo(0, -r * 0.3);
  g.lineTo(0, r * 0.8);
  g.stroke();
  g.restore();
}

/** A reed or sedge by the water: tall, straight, with a brown head sometimes. */
function reed(g: Ctx, x: number, y: number, len: number, lean: number, pal: Palette, head: boolean) {
  g.strokeStyle = hsl(pal.h + 4, pal.s, pal.l + 2);
  g.lineWidth = Math.max(0.8, len * 0.05);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(x + lean * 0.3, y - len * 0.5, x + lean, y - len);
  g.stroke();
  if (head) {
    g.fillStyle = 'rgba(120,84,52,0.95)';
    g.beginPath();
    g.ellipse(x + lean * 0.92, y - len * 0.88, len * 0.05, len * 0.16, Math.atan2(lean, len) , 0, Math.PI * 2);
    g.fill();
  }
}

/** A dot of colour: a wildflower head, a bud, a berry. */
function flower(g: Ctx, x: number, y: number, r: number, color: string, petals: boolean) {
  g.fillStyle = color;
  if (petals) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.beginPath();
      g.arc(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, r * 0.5, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(250,214,96,0.95)';
    g.beginPath();
    g.arc(x, y, r * 0.32, 0, Math.PI * 2);
    g.fill();
  } else {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
}

/** A small toadstool for the woods, only where it's thick. */
function toadstool(g: Ctx, x: number, y: number, r: number, color: string) {
  g.strokeStyle = 'rgba(236,228,200,0.9)';
  g.lineWidth = Math.max(0.7, r * 0.35);
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x, y - r * 1.1);
  g.stroke();
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y - r * 1.1, r, r * 0.55, 0, Math.PI, Math.PI * 2);
  g.fill();
}

/** Counts per level, by zone: how many of each thing a tile gets. */
interface Mix {
  blades: [number, number, number];
  tufts: [number, number, number];
  clover: [number, number, number];
  fronds: [number, number, number];
  docks: [number, number, number];
  moss: [number, number, number];
  ivy: [number, number, number];
  lichen: [number, number, number];
  flowers: [number, number, number];
  /** Relative height of the growth, 1 = a blade about a fifth of a tile. */
  height: number;
}

const MIX: Record<Exclude<ZoneId, 'greenhouse'>, Mix> = {
  meadow: { blades: [10, 18, 26], tufts: [1, 2, 3], clover: [2, 4, 6], fronds: [0, 0, 0], docks: [0, 0, 1], moss: [0, 0, 0], ivy: [0, 0, 0], lichen: [0, 0, 0], flowers: [0, 1, 3], height: 1 },
  overgrownClearing: { blades: [10, 16, 22], tufts: [1, 3, 4], clover: [1, 2, 3], fronds: [0, 1, 1], docks: [1, 2, 3], moss: [0, 0, 0], ivy: [0, 0, 0], lichen: [0, 0, 0], flowers: [1, 2, 4], height: 1.25 },
  woodland: { blades: [6, 10, 14], tufts: [0, 1, 2], clover: [1, 2, 3], fronds: [2, 3, 5], docks: [1, 2, 3], moss: [1, 2, 3], ivy: [4, 7, 10], lichen: [0, 0, 0], flowers: [0, 1, 1], height: 0.95 },
  dampForest: { blades: [2, 4, 6], tufts: [0, 0, 1], clover: [0, 0, 0], fronds: [2, 4, 6], docks: [2, 3, 4], moss: [2, 3, 5], ivy: [1, 2, 3], lichen: [0, 1, 1], flowers: [0, 0, 1], height: 0.95 },
  creek: { blades: [6, 10, 14], tufts: [1, 2, 3], clover: [0, 1, 1], fronds: [0, 0, 1], docks: [0, 1, 1], moss: [0, 1, 2], ivy: [0, 0, 0], lichen: [0, 0, 1], flowers: [0, 1, 1], height: 1.3 },
  rockyClearing: { blades: [3, 6, 8], tufts: [1, 2, 3], clover: [0, 0, 1], fronds: [0, 0, 0], docks: [0, 0, 0], moss: [0, 0, 1], ivy: [0, 0, 0], lichen: [1, 2, 2], flowers: [0, 0, 1], height: 0.7 },
};

/** Something laid over a verge tile once it's drawn (October's fallen leaves). */
export type VergeExtra = (g: CanvasRenderingContext2D, px: number, pad: number, zone: Exclude<ZoneId, 'greenhouse'>, variant: number) => void;

export class VergeTiles {
  private cache = new Map<string, HTMLCanvasElement>();

  constructor(
    private dpr: () => number,
    private extra?: VergeExtra
  ) {}

  clear() {
    this.cache.clear();
  }

  /** One tile of undergrowth for this zone at this thickness; `shore` adds reeds along the water. */
  get(zone: ZoneId, level: VergeLevel, variant: number, shore: boolean, px: number): HTMLCanvasElement | null {
    if (zone === 'greenhouse') return null;
    const dpr = this.dpr();
    const key = `${zone}|${level}|${variant}|${shore ? 1 : 0}|${Math.round(px)}|${dpr}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    if (this.cache.size > 400) this.cache.clear();
    const c = this.draw(zone, level, variant, shore, Math.round(px), dpr);
    if (c) this.cache.set(key, c);
    return c;
  }

  /** Padding around a tile, in pixels, so growth can lean past the tile edge. */
  static pad(px: number): number {
    return Math.ceil(Math.round(px) * 0.35);
  }

  private draw(zone: Exclude<ZoneId, 'greenhouse'>, level: VergeLevel, variant: number, shore: boolean, px: number, dpr: number): HTMLCanvasElement | null {
    const pad = VergeTiles.pad(px);
    const size = px + pad * 2;
    const c = document.createElement('canvas');
    c.width = Math.ceil(size * dpr);
    c.height = Math.ceil(size * dpr);
    const g = c.getContext('2d');
    if (!g) return null;
    g.scale(dpr, dpr);
    const pal = PALETTE[zone];
    const mix = MIX[zone];
    const seed = variant * 17.3 + zone.length * 3.1 + level * 7.7;
    let k = 0;
    const at = () => {
      k++;
      return { x: pad + hash2(seed + k * 3.7, k * 1.3) * px, y: pad + hash2(k * 2.9, seed - k * 1.7) * px, r: hash2(k * 7.3, seed + 0.5), dl: (hash2(k, seed + 2) - 0.5) * 12 };
    };
    // Low things first, so blades and fronds lie over them.
    for (let i = 0; i < mix.moss[level]; i++) {
      const p = at();
      moss(g, p.x, p.y, px * (0.05 + 0.07 * p.r), pal, p.dl);
    }
    for (let i = 0; i < mix.lichen[level]; i++) {
      const p = at();
      lichen(g, p.x, p.y, px * (0.04 + 0.05 * p.r), pal.accents[0]);
    }
    for (let i = 0; i < mix.ivy[level]; i++) {
      const p = at();
      ivy(g, p.x, p.y, px * (0.05 + 0.04 * p.r), p.r * Math.PI * 2, pal, p.dl);
    }
    for (let i = 0; i < mix.clover[level]; i++) {
      const p = at();
      clover(g, p.x, p.y, px * (0.028 + 0.02 * p.r), pal, p.dl);
    }
    for (let i = 0; i < mix.docks[level]; i++) {
      const p = at();
      dock(g, p.x, p.y, px * (0.16 + 0.12 * p.r), p.r * Math.PI * 2, pal, p.dl);
    }
    for (let i = 0; i < mix.fronds[level]; i++) {
      const p = at();
      frond(g, p.x, p.y, px * (0.2 + 0.16 * p.r), p.r * Math.PI * 2, pal, p.dl);
    }
    // Sort blades by y so the nearer ones lie over the farther.
    const blades: { x: number; y: number; len: number; lean: number; dl: number }[] = [];
    for (let i = 0; i < mix.blades[level]; i++) {
      const p = at();
      blades.push({ x: p.x, y: p.y, len: px * (0.12 + 0.14 * p.r) * mix.height, lean: (hash2(k, seed * 0.7) - 0.5) * px * 0.12, dl: p.dl });
    }
    blades.sort((a, b) => a.y - b.y);
    for (const b of blades) blade(g, b.x, b.y, b.len, b.lean, pal, b.dl);
    for (let i = 0; i < mix.tufts[level]; i++) {
      const p = at();
      tuft(g, p.x, p.y, px * (0.16 + 0.1 * p.r) * mix.height, pal, seed + i);
    }
    if (shore) {
      const n = 3 + level * 2;
      for (let i = 0; i < n; i++) {
        const p = at();
        reed(g, p.x, p.y, px * (0.32 + 0.2 * p.r), (hash2(k, seed) - 0.5) * px * 0.1, pal, p.r > 0.6);
      }
    }
    for (let i = 0; i < mix.flowers[level]; i++) {
      const p = at();
      const color = pal.accents[Math.floor(p.r * pal.accents.length) % pal.accents.length];
      flower(g, p.x, p.y, px * (0.02 + 0.015 * p.r), color, p.r > 0.5 && zone !== 'dampForest');
    }
    if (zone === 'woodland' && level === 2 && hash2(seed, 9) < 0.5) {
      const p = at();
      toadstool(g, p.x, p.y, px * 0.035, pal.accents[0]);
    }
    this.extra?.(g, px, pad, zone, variant);
    return c;
  }
}
