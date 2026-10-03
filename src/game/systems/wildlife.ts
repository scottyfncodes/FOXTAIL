import type { PlacedDecor, WeatherCondition } from '../state';
import { BRIDGES, CREEK_WATER, type Rect } from '../data/worldMap';
import { pondSize } from './koi';

// The creek's and the ponds' other residents, and the lightning bugs that
// come out over certain stretches of the valley after dark. Like the
// creek's koi, they follow smooth, endless paths worked out from the clock
// alone: nothing to save, nothing that ever jumps.

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const smooth = (u: number) => u * u * (3 - 2 * u);

// ---------------------------------------------------------------- turtles

export interface TurtleAt {
  x: number;
  y: number;
  /** Heading, radians, 0 = down the screen (+y), as for koi. */
  heading: number;
  /** Out on its stone (or the rim) in the sun, rather than swimming. */
  basking: boolean;
  /** How far under the water it is, 0 (dry) → 1 (just its shell showing). */
  wet: number;
  seed: number;
}

/**
 * One turtle's day, as a loop of `periodMs`: a long bask on its stone, then
 * it slides in, swims out and round through the open water, and hauls
 * itself back out onto the same stone.
 */
function turtleCycle(stone: { x: number; y: number }, out: { x: number; y: number }, now: number, periodMs: number, phase: number, seed: number): TurtleAt {
  const u = (now / periodMs + phase) % 1;
  const BASK = 0.55;
  if (u < BASK) {
    // Facing out over the water, as turtles do.
    const heading = Math.atan2(-(out.x - stone.x), out.y - stone.y);
    return { x: stone.x, y: stone.y, heading, basking: true, wet: 0, seed };
  }
  const s = (u - BASK) / (1 - BASK);
  const at = (v: number) => {
    // Out and back along a loop that starts and ends on the stone.
    const dx = out.x - stone.x;
    const dy = out.y - stone.y;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    const k = Math.sin(Math.PI * v);
    const side = Math.sin(2 * Math.PI * v) * len * 0.45;
    return { x: stone.x + dx * k + px * side, y: stone.y + dy * k + py * side };
  };
  const p = at(s);
  const q = at(Math.min(1, s + 0.01));
  const r = s >= 0.99 ? at(s - 0.01) : p;
  const hx = s >= 0.99 ? p.x - r.x : q.x - p.x;
  const hy = s >= 0.99 ? p.y - r.y : q.y - p.y;
  // In and out of the water at either end of the swim.
  const wet = smooth(Math.min(1, Math.min(s, 1 - s) / 0.08));
  return { x: p.x, y: p.y, heading: Math.atan2(-hx, hy), basking: false, wet, seed };
}

/** The creek's basking stones, one turtle to each: along the banks, clear of the bridges. */
export const TURTLE_STONES: { x: number; y: number }[] = [
  { x: CREEK_WATER.x + 0.35, y: 22.5 },
  { x: CREEK_WATER.x + CREEK_WATER.w - 0.35, y: 36.5 },
  { x: CREEK_WATER.x + 0.35, y: 57.5 },
];

/** Where each of the creek's turtles is at `now` (ms). */
export function riverTurtles(now: number): TurtleAt[] {
  return TURTLE_STONES.map((stone, i) => {
    const mid = CREEK_WATER.x + CREEK_WATER.w / 2;
    const out = { x: mid, y: stone.y + (hash(i + 4) - 0.5) * 4 };
    return turtleCycle(stone, out, now, 70000 + hash(i + 1) * 40000, hash(i + 2), Math.floor(hash(i + 3) * 1e9));
  });
}

/** How many turtles find their own way to a pond this size: the bigger ponds only. */
export function pondTurtleCount(d: Pick<PlacedDecor, 'w' | 'h' | 'rot'>): number {
  const { w, h } = pondSize(d);
  const area = w * h;
  return area >= 9 ? 2 : area >= 4.5 ? 1 : 0;
}

/** Where a pond's k-th turtle is at `now` (ms): basking on the stone rim, or out in the water. */
export function pondTurtleAt(d: Pick<PlacedDecor, 'x' | 'y' | 'w' | 'h' | 'rot'>, k: number, now: number): TurtleAt {
  const { w, h } = pondSize(d);
  const seed = Math.floor(hash(d.x * 31 + d.y * 17 + k) * 1e9);
  const a = hash(d.x + d.y * 3 + k * 5) * Math.PI * 2;
  const stone = { x: d.x + Math.cos(a) * (w / 2 - 0.05), y: d.y + Math.sin(a) * (h / 2 - 0.05) };
  const out = { x: d.x - Math.cos(a) * w * 0.12, y: d.y - Math.sin(a) * h * 0.12 };
  return turtleCycle(stone, out, now, 60000 + hash(seed) * 30000, hash(seed + 1), seed);
}

// ---------------------------------------------------------------- the alligator

export interface GatorAt {
  x: number;
  y: number;
  /** Heading, radians, 0 = down the screen (+y), as for koi and turtles. */
  heading: number;
  /** Hauled out on the bank, grinning at the sun. */
  basking: boolean;
  /** 0 (dry) → 1 (just eyes, nostrils and the ridge of its back showing). */
  wet: number;
}

/** Where the creek's alligator suns itself: hauled out on the east bank, snout to the water, between the turtles' stones. */
export const GATOR_BANK = { x: CREEK_WATER.x + CREEK_WATER.w + 0.3, y: 29.5 };
/** How far up and down the creek it cruises from there: well clear of both bridges. */
export const GATOR_REACH = 9.5;
const GATOR_PERIOD_MS = 150000;

const GATOR_BASK = 0.4;

/** Out from its bank and back, `s` 0 → 1: up the creek by `reach`, down past its spot, and back up to haul out. */
function gatorSwim(s: number, reach: number, wiggles: number): GatorAt {
  const mid = CREEK_WATER.x + CREEK_WATER.w / 2;
  const at = (v: number) => {
    const inWater = smooth(Math.min(1, Math.min(v, 1 - v) / 0.06));
    return {
      x: GATOR_BANK.x + (mid - GATOR_BANK.x) * inWater + Math.sin(v * Math.PI * wiggles) * 0.35 * inWater,
      y: GATOR_BANK.y - Math.sin(v * Math.PI * 2) * reach,
    };
  };
  const p = at(s);
  const q = at(Math.min(1, s + 0.004));
  const r = at(Math.max(0, s - 0.004));
  const wet = smooth(Math.min(1, Math.min(s, 1 - s) / 0.05));
  return { x: p.x, y: p.y, heading: Math.atan2(-(q.x - r.x), q.y - r.y), basking: false, wet };
}

const BASKING: GatorAt = { x: GATOR_BANK.x, y: GATOR_BANK.y, heading: Math.PI / 2, basking: true, wet: 0 };

/**
 * The creek's one alligator, and a friendly one: a long doze on the bank,
 * then it slips in and cruises lazily up the creek, back down past its
 * spot, and up again to haul out where it started.
 */
export function riverAlligator(now: number): GatorAt {
  const u = (now / GATOR_PERIOD_MS + 0.37) % 1;
  if (u < GATOR_BASK) return { ...BASKING };
  return gatorSwim((u - GATOR_BASK) / (1 - GATOR_BASK), GATOR_REACH, 6);
}

/** How much longer (ms) it'll lie on the bank before its own swim, or 0 if it's already out. */
export function gatorBaskLeftMs(now: number): number {
  const u = (now / GATOR_PERIOD_MS + 0.37) % 1;
  return u < GATOR_BASK ? (GATOR_BASK - u) * GATOR_PERIOD_MS : 0;
}

/** How long it takes Scout round the creek on its back. */
export const GATOR_RIDE_MS = 32000;
/** How far up and down the creek it takes her: not so far as on its own. */
export const GATOR_RIDE_REACH = 5;

/**
 * Where the alligator is at `now`: on its own round, or, if it set off
 * with Scout on its back at `rideStart`, taking her for a gentler turn up
 * and down the creek and back to the same spot on the bank.
 */
export function alligatorAt(now: number, rideStart: number | null = null): GatorAt {
  if (rideStart !== null && now >= rideStart && now < rideStart + GATOR_RIDE_MS) return gatorSwim((now - rideStart) / GATOR_RIDE_MS, GATOR_RIDE_REACH, 4);
  return riverAlligator(now);
}

// ---------------------------------------------------------------- frogs

export interface FrogAt {
  x: number;
  y: number;
  /** Mid-hop, 0 → 1, or null sitting. */
  hop: number | null;
  /** How high the hop has it, in tiles. */
  lift: number;
  /** Facing right (true) or left. */
  right: boolean;
  /** Throat puffed out mid-croak, 0 → 1. */
  croak: number;
  seed: number;
}

const HOP_MS = 520;

/**
 * A frog sits on one perch, then another: at the end of each sit it hops,
 * in a short arc, to the next. Every so often it croaks, more after dark.
 */
function frogBetween(perches: { x: number; y: number }[], now: number, seed: number, night: boolean): FrogAt {
  const period = 7000 + hash(seed) * 9000;
  const t = now + hash(seed + 1) * period;
  const c = Math.floor(t / period);
  const into = t - c * period;
  const n = perches.length;
  const step = n > 2 ? 1 + (seed % (n - 1)) : 1;
  const from = perches[(c * step) % n];
  const to = perches[((c + 1) * step) % n];
  const croakEvery = night ? 2600 : 9000;
  const cu = ((now + hash(seed + 2) * croakEvery) % croakEvery) / 700;
  const croak = cu < 1 ? Math.sin(cu * Math.PI) : 0;
  if (into < period - HOP_MS) return { x: from.x, y: from.y, hop: null, lift: 0, right: to.x >= from.x, croak, seed };
  const u = (into - (period - HOP_MS)) / HOP_MS;
  const e = smooth(u);
  return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, hop: u, lift: Math.sin(u * Math.PI) * 0.45, right: to.x >= from.x, croak: 0, seed };
}

/** The creek's frogs: a few on each bank, keeping to the water's edge either side of a bridge. */
export const RIVER_FROGS = 7;

export function riverFrogs(now: number, night: boolean): FrogAt[] {
  const out: FrogAt[] = [];
  const cuts = [...BRIDGES].sort((a, b) => a.y - b.y);
  for (let i = 0; i < RIVER_FROGS; i++) {
    const west = i % 2 === 0;
    const bank = west ? CREEK_WATER.x + 0.15 : CREEK_WATER.x + CREEK_WATER.w - 0.15;
    let y = 4 + hash(i + 40) * 56;
    // Not on a bridge: all three perches clear of one.
    for (const b of cuts) if (y > b.y - 2.8 && y < b.y + b.h + 1) y = b.y + b.h + 1.5;
    const perches = [
      { x: bank, y },
      { x: bank + (west ? 0.5 : -0.5), y: y + 0.9 },
      { x: bank, y: y + 1.8 },
    ];
    out.push(frogBetween(perches, now, 1000 + i * 13, night));
  }
  return out;
}

/**
 * The lily pads drawn on a pond, in tiles: where its frogs sit. The
 * renderer draws its pads at exactly these places.
 */
export function pondPads(d: Pick<PlacedDecor, 'x' | 'y' | 'w' | 'h' | 'rot'>, defaultArea: number): { x: number; y: number }[] {
  const size = pondSize(d);
  const scale = (size.w * size.h) / defaultArea;
  const rx = size.w / 2 - 0.15;
  const ry = size.h / 2 - 0.15;
  const n = Math.max(3, Math.min(14, Math.round(5 * scale)));
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const k = 0.35 + 0.3 * ((i * 0.618) % 1);
    out.push({ x: d.x + Math.cos(i * 2.1 + d.x) * rx * (0.55 + (k - 0.5) * 0.4), y: d.y + Math.sin(i * 2.1 + d.x) * ry * (0.55 + (k - 0.5) * 0.4) });
  }
  return out;
}

/** A pond's frogs: one for every few square tiles of water, up to four, hopping pad to pad. */
export function pondFrogCount(d: Pick<PlacedDecor, 'w' | 'h' | 'rot'>): number {
  const { w, h } = pondSize(d);
  return Math.max(1, Math.min(4, Math.floor((w * h) / 2.5)));
}

export function pondFrogs(d: Pick<PlacedDecor, 'x' | 'y' | 'w' | 'h' | 'rot'>, defaultArea: number, now: number, night: boolean): FrogAt[] {
  const pads = pondPads(d, defaultArea);
  const n = pondFrogCount(d);
  const out: FrogAt[] = [];
  for (let k = 0; k < n; k++) {
    // Each frog keeps to its own run of pads, so they don't pile onto one.
    const mine = pads.filter((_, i) => i % n === k);
    const perches = mine.length >= 2 ? mine : [pads[k % pads.length], pads[(k + 1) % pads.length]];
    out.push(frogBetween(perches, now, Math.floor(d.x * 97 + d.y * 61) + k * 7, night));
  }
  return out;
}

// ---------------------------------------------------------------- lightning bugs

export interface FireflyArea {
  id: string;
  rect: Rect;
}

/**
 * Where the lightning bugs come out: the long grass under the damp forest's
 * edge, the creek banks, a glade in the woods and the hollow in the
 * overgrown clearing. Nowhere else.
 */
export const FIREFLY_AREAS: FireflyArea[] = [
  { id: 'meadow-edge', rect: { x: 47, y: 24, w: 30, h: 7 } },
  { id: 'creek-banks', rect: { x: 36, y: 17, w: 12, h: 30 } },
  { id: 'woodland-glade', rect: { x: 16, y: 12, w: 16, h: 12 } },
  { id: 'overgrown-hollow', rect: { x: 4, y: 42, w: 20, h: 14 } },
];

/** About one bug to every six square tiles, and no more than this many to an area. */
export const FIREFLIES_PER_AREA_MAX = 45;

export function fireflyCount(r: Rect): number {
  return Math.min(FIREFLIES_PER_AREA_MAX, Math.round((r.w * r.h) / 6));
}

/** How strongly they're out: none by day or in the rain, rising with the dark. */
export function fireflyStrength(darkness: number, weather: WeatherCondition): number {
  if (weather === 'rain') return 0;
  const k = Math.max(0, Math.min(1, (darkness - 0.3) / 0.4));
  return weather === 'overcast' ? k * 0.7 : k;
}

export interface FireflyAt {
  x: number;
  y: number;
  /** Lit right now, 0 → 1. */
  glow: number;
}

/**
 * Where an area's bugs are at `now` (ms): each drifts on its own slow loop
 * inside the area, low over the ground, and flashes on its own rhythm —
 * a slow rise, a bright moment, and a long dark.
 */
export function fireflies(area: FireflyArea, now: number): FireflyAt[] {
  const r = area.rect;
  const n = fireflyCount(r);
  const out: FireflyAt[] = [];
  const base = area.id.length * 101 + r.x * 7 + r.y * 13;
  for (let i = 0; i < n; i++) {
    const h = (k: number) => hash(base + i * 17 + k);
    const cx = r.x + h(1) * r.w;
    const cy = r.y + h(2) * r.h;
    const w1 = 0.00018 + h(3) * 0.00022;
    const w2 = 0.00023 + h(4) * 0.0002;
    const x = cx + Math.sin(now * w1 + h(5) * 6.28) * 1.4;
    const y = cy + Math.cos(now * w2 + h(6) * 6.28) * 0.9 - 0.4 - 0.25 * Math.sin(now * 0.0011 + i);
    const period = 2600 + h(7) * 3400;
    const u = ((now + h(8) * period) % period) / period;
    const glow = u < 0.15 ? smooth(u / 0.15) : u < 0.38 ? 1 - smooth((u - 0.15) / 0.23) : 0;
    out.push({ x: Math.max(r.x, Math.min(r.x + r.w, x)), y: Math.max(r.y, Math.min(r.y + r.h, y)), glow });
  }
  return out;
}
