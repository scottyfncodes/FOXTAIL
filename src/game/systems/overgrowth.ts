import type { GameState, GroundPatch } from '../state';
import type { OutdoorZoneId } from '../types';
import { GRID_W, GRID_H, zoneAt, isWater } from '../data/worldMap';
import { bedContains, onPath } from './landscape';
import { inPond } from './koi';

// Ground-level overgrowth: what nature itself does with the open ground,
// whether or not the player has planted anything. Moss creeps out from
// under the trees, clover knits through the grass, little ferns come up in
// the leaf litter, mushrooms push up in the damp, sedge thickens along the
// banks and lichen crusts the rocks. Each patch claims one tile; it fills
// in over time (level 1 → 4) and, once settled, creeps into a neighbouring
// tile. Nothing here dies: a patch only goes when the player clears the
// ground (a path, a bed, a clearing).
//
// The rules are local and simple, so it reads as colonisation rather than
// noise: patches start where something already grows (beside a tree, a
// bush, a rock, the water, or one of the player's plantings), spread to
// neighbours, never fill a tile that's already surrounded, and slow down as
// a region fills toward its share. The valley goes from bare, to
// established, to properly overgrown — and stops there.

export type CoverKind = 'moss' | 'clover' | 'fernlet' | 'mushrooms' | 'litter' | 'ivy' | 'wildflowers' | 'sedge' | 'lichen';

/** Saved by index: only ever add to the end. */
export const COVER_KINDS: CoverKind[] = ['moss', 'clover', 'fernlet', 'mushrooms', 'litter', 'ivy', 'wildflowers', 'sedge', 'lichen'];

export const COVER_LABEL: Record<CoverKind, string> = {
  moss: 'moss',
  clover: 'clover',
  fernlet: 'young ferns',
  mushrooms: 'mushrooms',
  litter: 'leaf litter',
  ivy: 'ivy',
  wildflowers: 'wildflowers',
  sedge: 'sedge',
  lichen: 'lichen',
};

/** What comes up in each region, and how often. */
export const ZONE_COVER: Record<OutdoorZoneId, Partial<Record<CoverKind, number>>> = {
  meadow: { clover: 4, wildflowers: 3, moss: 1 },
  overgrownClearing: { ivy: 3, wildflowers: 2, fernlet: 2, clover: 1 },
  woodland: { fernlet: 3, litter: 3, moss: 2, mushrooms: 1.5, ivy: 1 },
  dampForest: { moss: 4, fernlet: 3, mushrooms: 2.5, litter: 1 },
  creek: { sedge: 3, moss: 2, clover: 1, wildflowers: 1 },
  rockyClearing: { lichen: 3, moss: 2, wildflowers: 1 },
};

// ------------------------------------------------------------ balance
// Every number that sets the pace of the valley's own overgrowth. Checks run
// once per in-game hour (wild.ts SPREAD_STEP), which is about 30 real
// seconds of play.

export const MAX_LEVEL = 4;
/** New patches started per check, across the valley, while it's empty (falls as it fills). */
export const NUCLEATE_PER_STEP = 1.1;
/** Chance per check that a patch thickens one level. */
export const COVER_GROW_CHANCE = 0.04;
/** Chance per check that a patch of each level creeps into a neighbouring tile (levels 0–4). */
export const COVER_SPREAD_CHANCE = [0, 0, 0.008, 0.013, 0.018];
/** The most of a region's open ground the wild cover will ever claim. */
export const ZONE_COVER_MAX = 0.45;
/** Hard cap across the whole valley, whatever its size, for performance. */
export const COVER_TOTAL_CAP = 1600;
/** A tile with this many covered neighbours (of 8) is left open: cover is a mosaic, never a solid sheet. */
export const NEIGHBOUR_LIMIT = 6;
/** Patches beside one of the player's outdoor plants grow and spread this much faster. */
export const NURTURE_BOOST = 1.8;
/** The stall's leaf-mould mulch: everything in the ground cover goes this much faster. */
export const MULCH_BOOST = 1.5;
export const MULCH_ITEM = 'leafMould';

/** How established the valley's ground cover is, from its share of the open ground it could claim. */
export type CoverPhase = 'bare' | 'low' | 'established' | 'overgrown';
export const PHASE_AT = { low: 0.02, established: 0.2, overgrown: 0.55 };

// ------------------------------------------------------------ state

export function coverKey(tx: number, ty: number): number {
  return ty * GRID_W + tx;
}

export function patchesOf(state: GameState): GroundPatch[] {
  if (!state.ground || !Array.isArray(state.ground.patches)) state.ground = { patches: [] };
  return state.ground.patches;
}

/** One patch per tile: a lookup from tile key to patch. */
export function coverIndex(state: GameState): Map<number, GroundPatch> {
  const map = new Map<number, GroundPatch>();
  for (const p of patchesOf(state)) map.set(coverKey(p[0], p[1]), p);
  return map;
}

export function coverAt(state: GameState, tx: number, ty: number): GroundPatch | undefined {
  return patchesOf(state).find((p) => p[0] === tx && p[1] === ty);
}

/** Drops anything malformed, out of bounds or doubled up (one patch per tile, the first wins). */
export function sanitizeCover(raw: unknown): { patches: GroundPatch[] } {
  const out: GroundPatch[] = [];
  const seen = new Set<number>();
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { patches?: unknown }).patches) ? (raw as { patches: unknown[] }).patches : [];
  for (const p of list) {
    if (!Array.isArray(p) || p.length < 5 || !p.every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
    const [x, y, k, lv, at] = p as number[];
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
    if (!COVER_KINDS[k]) continue;
    const key = coverKey(x, y);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([x, y, k, Math.max(1, Math.min(MAX_LEVEL, Math.round(lv))), at]);
    if (out.length >= COVER_TOTAL_CAP) break;
  }
  return { patches: out };
}

// ------------------------------------------------------------ where it can grow

export type OpenCheck = (tx: number, ty: number) => boolean;

const OUTDOOR: OutdoorZoneId[] = ['meadow', 'woodland', 'creek', 'dampForest', 'rockyClearing', 'overgrownClearing'];
const N8: [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/** Whether wild cover could take this tile: open, dry ground that isn't the player's bed, path, pond or decor. */
export function coverAllowed(state: GameState, isOpen: OpenCheck, tx: number, ty: number, now: number): boolean {
  if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return false;
  if (zoneAt(tx, ty) === 'greenhouse' || isWater(tx, ty) || !isOpen(tx, ty)) return false;
  const cx = tx + 0.5;
  const cy = ty + 0.5;
  // Beds are the player's, and stay that way.
  if (state.gardenBeds.some((b) => bedContains(b, cx, cy, -0.3))) return false;
  // The verges of a path creep in, but never down the middle where people walk.
  if (state.paths.length && onPath(state, cx, cy, now, true)) return false;
  if (inPond(state, cx, cy)) return false;
  if (state.decor.some((d) => Math.abs(d.x - cx) < 0.8 && Math.abs(d.y - cy) < 0.8)) return false;
  return true;
}

/** Open tiles each region has for cover to claim (worked out once per catch-up). */
export function openTilesByZone(isOpen: OpenCheck): Record<OutdoorZoneId, number> {
  const out = Object.fromEntries(OUTDOOR.map((z) => [z, 0])) as Record<OutdoorZoneId, number>;
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const z = zoneAt(x, y);
      if (z === 'greenhouse' || isWater(x, y) || !isOpen(x, y)) continue;
      out[z]++;
    }
  }
  return out;
}

function pickKind(zone: OutdoorZoneId, rand: () => number, shore: boolean): number {
  const w = { ...ZONE_COVER[zone] };
  // By the water, sedge and moss come first wherever you are.
  if (shore) {
    w.sedge = (w.sedge ?? 0) + 2;
    w.moss = (w.moss ?? 0) + 1;
  }
  const entries = Object.entries(w) as [CoverKind, number][];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  let r = rand() * total;
  for (const [k, v] of entries) {
    if (r < v) return COVER_KINDS.indexOf(k);
    r -= v;
  }
  return COVER_KINDS.indexOf(entries[0][0]);
}

// ------------------------------------------------------------ the step

export interface CoverWorld {
  index: Map<number, GroundPatch>;
  open: Record<OutdoorZoneId, number>;
  count: Record<OutdoorZoneId, number>;
  /** Tiles beside the player's outdoor plants, where cover grows faster. */
  nurtured: Set<number>;
}

/** Everything a run of cover steps needs, built once. */
export function coverWorld(state: GameState, isOpen: OpenCheck): CoverWorld {
  const index = coverIndex(state);
  const count = Object.fromEntries(OUTDOOR.map((z) => [z, 0])) as Record<OutdoorZoneId, number>;
  for (const p of patchesOf(state)) {
    const z = zoneAt(p[0], p[1]);
    if (z !== 'greenhouse') count[z]++;
  }
  const nurtured = new Set<number>();
  for (const pl of Object.values(state.plants)) {
    if (pl.location.kind !== 'wild') continue;
    const { x, y } = pl.location;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) nurtured.add(coverKey(Math.floor(x) + dx, Math.floor(y) + dy));
  }
  return { index, open: openTilesByZone(isOpen), count, nurtured };
}

export interface CoverEvent {
  x: number;
  y: number;
  /** 'new': a patch came up; 'grow': one thickened. */
  kind: 'new' | 'grow';
}

function zoneRoom(w: CoverWorld, zone: OutdoorZoneId): number {
  const max = w.open[zone] * ZONE_COVER_MAX;
  if (max <= 0) return 0;
  return Math.max(0, 1 - w.count[zone] / max);
}

function coveredNeighbours(w: CoverWorld, tx: number, ty: number): number {
  let n = 0;
  for (const [dx, dy] of N8) if (w.index.has(coverKey(tx + dx, ty + dy))) n++;
  return n;
}

/** Somewhere something already grows: beside a tree, bush, rock, wall or the water, or one of the player's plantings. */
function isSeedSource(w: CoverWorld, isOpen: OpenCheck, tx: number, ty: number): boolean {
  if (w.nurtured.has(coverKey(tx, ty))) return true;
  for (const [dx, dy] of N8) {
    const x = tx + dx;
    const y = ty + dy;
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
    if (isWater(x, y) || !isOpen(x, y)) return true;
  }
  return false;
}

function addPatch(state: GameState, w: CoverWorld, tx: number, ty: number, kind: number, now: number, events: CoverEvent[]) {
  const p: GroundPatch = [tx, ty, kind, 1, Math.round(now)];
  patchesOf(state).push(p);
  w.index.set(coverKey(tx, ty), p);
  const z = zoneAt(tx, ty) as OutdoorZoneId;
  w.count[z]++;
  events.push({ x: tx, y: ty, kind: 'new' });
}

/**
 * One in-game hour of the valley's own overgrowth: patches thicken, settled
 * ones creep into the next tile, and now and then a new one starts beside
 * something already growing. Never needs a coin.
 */
export function coverStep(state: GameState, w: CoverWorld, isOpen: OpenCheck, now: number, rand: () => number): CoverEvent[] {
  const events: CoverEvent[] = [];
  const list = patchesOf(state);
  const boost = state.owned.includes(MULCH_ITEM) ? MULCH_BOOST : 1;
  const total = () => list.length;
  const n = list.length;
  for (let i = 0; i < n; i++) {
    const p = list[i];
    const [tx, ty, kind, lv] = p;
    const nurture = w.nurtured.has(coverKey(tx, ty)) ? NURTURE_BOOST : 1;
    if (lv < MAX_LEVEL && rand() < COVER_GROW_CHANCE * nurture * boost) {
      p[3] = lv + 1;
      events.push({ x: tx, y: ty, kind: 'grow' });
    }
    if (total() >= COVER_TOTAL_CAP) continue;
    const zone = zoneAt(tx, ty);
    if (zone === 'greenhouse') continue;
    const chance = (COVER_SPREAD_CHANCE[lv] ?? 0) * nurture * boost * zoneRoom(w, zone) ** 1.5;
    if (chance <= 0 || rand() >= chance) continue;
    const [dx, dy] = N8[Math.floor(rand() * 8) % 8];
    const nx = tx + dx;
    const ny = ty + dy;
    if (w.index.has(coverKey(nx, ny)) || !coverAllowed(state, isOpen, nx, ny, now)) continue;
    const nz = zoneAt(nx, ny) as OutdoorZoneId;
    if (zoneRoom(w, nz) <= 0 || coveredNeighbours(w, nx, ny) >= NEIGHBOUR_LIMIT) continue;
    // Mostly more of the same; now and then whatever else that ground favours.
    const shore = N8.some(([ax, ay]) => isWater(nx + ax, ny + ay));
    const k = rand() < 0.82 && ZONE_COVER[nz][COVER_KINDS[kind]] ? kind : pickKind(nz, rand, shore);
    addPatch(state, w, nx, ny, k, now, events);
  }
  // New patches, starting beside something already growing.
  const fill = total() / COVER_TOTAL_CAP;
  let starts = NUCLEATE_PER_STEP * boost * Math.max(0, 1 - fill);
  while (starts > 0 && total() < COVER_TOTAL_CAP) {
    const go = starts >= 1 || rand() < starts;
    starts -= 1;
    if (!go) break;
    for (let attempt = 0; attempt < 8; attempt++) {
      const tx = Math.floor(rand() * GRID_W);
      const ty = Math.floor(rand() * GRID_H);
      if (w.index.has(coverKey(tx, ty)) || !coverAllowed(state, isOpen, tx, ty, now)) continue;
      const zone = zoneAt(tx, ty) as OutdoorZoneId;
      if (zoneRoom(w, zone) <= 0 || !isSeedSource(w, isOpen, tx, ty)) continue;
      const shore = N8.some(([ax, ay]) => isWater(tx + ax, ty + ay));
      addPatch(state, w, tx, ty, pickKind(zone, rand, shore), now, events);
      break;
    }
  }
  return events;
}

// ------------------------------------------------------------ reading it

/** How much of the ground the cover could claim it has claimed, 0…1 (levels count: a thin patch is less than a thick one). */
export function coverFill(state: GameState, isOpen: OpenCheck): number {
  const open = openTilesByZone(isOpen);
  const room = Math.min(COVER_TOTAL_CAP, Object.values(open).reduce((s, v) => s + v, 0) * ZONE_COVER_MAX);
  if (room <= 0) return 0;
  const weight = patchesOf(state).reduce((s, p) => s + p[3] / MAX_LEVEL, 0);
  return Math.min(1, weight / room);
}

export function coverPhase(fill: number): CoverPhase {
  if (fill >= PHASE_AT.overgrown) return 'overgrown';
  if (fill >= PHASE_AT.established) return 'established';
  if (fill >= PHASE_AT.low) return 'low';
  return 'bare';
}

export const PHASE_LABEL: Record<CoverPhase, string> = {
  bare: 'The open ground is still mostly bare. Give it time: moss and clover will find it.',
  low: 'Left to itself, the valley is greening: the first moss and clover are creeping out from the edges.',
  established: 'Ground cover has taken hold across the valley: moss, ferns and clover lie in drifts.',
  overgrown: 'The valley is overgrown: the wild has claimed every corner it can.',
};

/** The commonest kinds of cover, most first. */
export function commonestCover(state: GameState, n = 3): CoverKind[] {
  const tally = new Map<number, number>();
  for (const p of patchesOf(state)) tally.set(p[2], (tally.get(p[2]) ?? 0) + 1);
  return [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => COVER_KINDS[k]);
}
