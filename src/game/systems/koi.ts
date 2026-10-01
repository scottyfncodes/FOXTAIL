import type { GameState, Koi, PlacedDecor } from '../state';
import { makeUid } from '../state';
import { BRIDGES, CREEK_WATER, GRID_H } from '../data/worldMap';
import { POND_DEFAULT } from '../data/shop';

// Koi: a few wild ones live in the creek, drifting up and down between the
// bridges, and the player can buy their own and let them go in a pond dug
// big enough for them. Each koi is a variety (its colours) and a seed (where
// its markings fall), so no two look quite the same.

export interface KoiVariety {
  id: string;
  name: string;
  /** Body colour. */
  base: string;
  /** Patch colours, in the order they're laid on. */
  patches: string[];
  /** Tancho: one red spot on the head, nothing else. */
  headSpot?: boolean;
  /** A metallic sheen along the back (ogon). */
  sheen?: boolean;
}

export const KOI_VARIETIES: KoiVariety[] = [
  { id: 'kohaku', name: 'Kohaku', base: '#f4f1ea', patches: ['#d8452e'] },
  { id: 'sanke', name: 'Sanke', base: '#f4f1ea', patches: ['#d8452e', '#1d1d22'] },
  { id: 'showa', name: 'Showa', base: '#1d1d22', patches: ['#d8452e', '#f4f1ea'] },
  { id: 'tancho', name: 'Tancho', base: '#f4f1ea', patches: ['#d8452e'], headSpot: true },
  { id: 'ogon', name: 'Ogon', base: '#e9b53a', patches: [], sheen: true },
  { id: 'asagi', name: 'Asagi', base: '#7f97ab', patches: ['#e07a3c'] },
  { id: 'chagoi', name: 'Chagoi', base: '#9a6b3e', patches: [], sheen: true },
];

export function koiVariety(id: string): KoiVariety {
  return KOI_VARIETIES.find((v) => v.id === id) ?? KOI_VARIETIES[0];
}

/** A new koi of a random variety. */
export function newKoi(rand: () => number = Math.random): Koi {
  const variety = KOI_VARIETIES[Math.floor(rand() * KOI_VARIETIES.length) % KOI_VARIETIES.length].id;
  return { id: makeUid('koi'), variety, seed: Math.floor(rand() * 1e9) };
}

// ---------------------------------------------------------------- ponds

/** A pond's size on the ground right now, turned or not. */
export function pondSize(d: Pick<PlacedDecor, 'w' | 'h' | 'rot'>): { w: number; h: number } {
  const w = d.w ?? POND_DEFAULT.w;
  const h = d.h ?? POND_DEFAULT.h;
  return (d.rot ?? 0) % 2 === 1 ? { w: h, h: w } : { w, h };
}

/** Whether (x, y) is on a dug pond's water or rim. */
export function inPond(state: Pick<GameState, 'decor'>, x: number, y: number): boolean {
  return state.decor.some((d) => {
    if (d.decorId !== 'gardenPond') return false;
    const { w, h } = pondSize(d);
    const dx = (x - d.x) / (w / 2);
    const dy = (y - d.y) / (h / 2);
    return dx * dx + dy * dy <= 1;
  });
}

/** Ponds smaller than this (in square tiles) are too small to keep koi at all. */
export const KOI_MIN_AREA = 2;
/** About this much water per koi. */
export const KOI_AREA_EACH = 1.1;
export const KOI_MAX_PER_POND = 12;

/** How many koi a pond of this size can reasonably hold. */
export function koiCapacity(w: number, h: number): number {
  const area = w * h;
  if (!(area >= KOI_MIN_AREA)) return 0;
  return Math.min(KOI_MAX_PER_POND, Math.floor(area / KOI_AREA_EACH));
}

export function pondCapacity(d: Pick<PlacedDecor, 'w' | 'h'>): number {
  return koiCapacity(d.w ?? POND_DEFAULT.w, d.h ?? POND_DEFAULT.h);
}

/** The koi in a pond, as the player's own koi. */
export function koiInPond(state: Pick<GameState, 'koi'>, d: Pick<PlacedDecor, 'koi'>): Koi[] {
  return (d.koi ?? []).map((id) => state.koi.find((k) => k.id === id)).filter((k): k is Koi => !!k);
}

/** The player's koi not in any pond: still in their bags, ready to let go. */
export function freeKoi(state: Pick<GameState, 'koi' | 'decor'>): Koi[] {
  const placed = new Set(state.decor.flatMap((d) => d.koi ?? []));
  return state.koi.filter((k) => !placed.has(k.id));
}

export type KoiBlock = 'no-pond' | 'not-yours' | 'in-a-pond' | 'too-small' | 'full';

export function addKoiBlock(state: Pick<GameState, 'koi' | 'decor'>, pondId: string, koiId: string): KoiBlock | null {
  const pond = state.decor.find((d) => d.id === pondId && d.decorId === 'gardenPond');
  if (!pond) return 'no-pond';
  if (!state.koi.some((k) => k.id === koiId)) return 'not-yours';
  if (!freeKoi(state).some((k) => k.id === koiId)) return 'in-a-pond';
  const cap = pondCapacity(pond);
  if (cap === 0) return 'too-small';
  if ((pond.koi?.length ?? 0) >= cap) return 'full';
  return null;
}

/** Lets one of the player's koi go in a pond, if there's room for it. */
export function addKoiToPond(state: Pick<GameState, 'koi' | 'decor'>, pondId: string, koiId: string): boolean {
  if (addKoiBlock(state, pondId, koiId)) return false;
  const pond = state.decor.find((d) => d.id === pondId)!;
  (pond.koi ??= []).push(koiId);
  return true;
}

/** Nets a koi back out of a pond into its bag. */
export function removeKoiFromPond(state: Pick<GameState, 'decor'>, pondId: string, koiId: string): boolean {
  const pond = state.decor.find((d) => d.id === pondId);
  const i = pond?.koi?.indexOf(koiId) ?? -1;
  if (!pond || i < 0) return false;
  pond.koi!.splice(i, 1);
  return true;
}

// ---------------------------------------------------------------- swimming

export interface KoiAt {
  x: number;
  y: number;
  /** Heading, radians, 0 = swimming down the screen (+y). */
  heading: number;
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** The stretches of creek between the bridges, in tiles. */
export function creekReaches(): { y0: number; y1: number }[] {
  const cuts = [...BRIDGES].sort((a, b) => a.y - b.y);
  const out: { y0: number; y1: number }[] = [];
  let y = CREEK_WATER.y;
  for (const b of cuts) {
    if (b.y > y) out.push({ y0: y, y1: b.y });
    y = b.y + b.h;
  }
  if (y < Math.min(GRID_H, CREEK_WATER.y + CREEK_WATER.h)) out.push({ y0: y, y1: Math.min(GRID_H, CREEK_WATER.y + CREEK_WATER.h) });
  return out;
}

/** The creek's own koi: a handful, never a crowd. */
export const RIVER_KOI = 8;

export interface RiverKoi extends KoiAt {
  variety: string;
  seed: number;
}

/**
 * Where each of the creek's koi is at `now` (ms). Each keeps to one reach
 * between the bridges, drifting slowly up and down it and wandering from
 * bank to bank, at its own pace: a smooth, endless path, so nothing needs
 * saving and nothing ever jumps.
 */
export function riverKoi(now: number): RiverKoi[] {
  const reaches = creekReaches();
  const out: RiverKoi[] = [];
  const margin = 1.2;
  for (let i = 0; i < RIVER_KOI; i++) {
    const r = reaches[i % reaches.length];
    const len = Math.max(0.5, r.y1 - r.y0 - margin * 2);
    const w = 0.00006 + hash(i + 1) * 0.00005;
    const p = hash(i + 7) * Math.PI * 2;
    const w2 = w * (2.2 + hash(i + 3));
    const p2 = hash(i + 11) * Math.PI * 2;
    // Keep to the open water, clear of the reeds along both banks.
    const half = (CREEK_WATER.w - 2.2) / 2;
    const y = r.y0 + margin + len * (0.5 - 0.5 * Math.cos(w * now + p));
    const x = CREEK_WATER.x + CREEK_WATER.w / 2 + half * Math.sin(w2 * now + p2);
    const dy = len * 0.5 * w * Math.sin(w * now + p);
    const dx = half * w2 * Math.cos(w2 * now + p2);
    out.push({ x, y, heading: Math.atan2(-dx, dy), variety: KOI_VARIETIES[i % KOI_VARIETIES.length].id, seed: Math.floor(hash(i + 19) * 1e9) });
  }
  return out;
}

/** Where the k-th of n koi in a pond is at `now` (ms): circling slowly, each on its own loop, always inside the water. */
export function pondKoiAt(d: Pick<PlacedDecor, 'x' | 'y' | 'w' | 'h' | 'rot'>, k: number, now: number): KoiAt {
  const { w, h } = pondSize(d);
  // The open water, inside the stone rim, with room for a koi's length.
  const rx = Math.max(0.05, w / 2 - 0.45);
  const ry = Math.max(0.05, h / 2 - 0.4);
  const dir = k % 2 ? -1 : 1;
  const om = dir * (0.00025 + hash(k + 5) * 0.0002);
  const ph = hash(k + 2) * Math.PI * 2;
  const rr = 0.45 + hash(k + 9) * 0.5;
  const a = om * now + ph;
  const wob = 1 + 0.08 * Math.sin(a * 3 + k);
  const x = d.x + Math.cos(a) * rx * rr * wob;
  const y = d.y + Math.sin(a) * ry * rr * wob;
  const dx = -Math.sin(a) * rx * rr * om;
  const dy = Math.cos(a) * ry * rr * om;
  return { x, y, heading: Math.atan2(-dx, dy) };
}
