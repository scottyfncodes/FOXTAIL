import { inPond } from './koi';
import type { GameState, GardenBed, GardenPath, OwnedPlant } from '../state';
import { makeUid } from '../state';
import type { OutdoorZoneId } from '../types';
import { PLANTS, lookFor, specimenName } from '../data/plants';
import { GRID_H, GRID_W, zoneAt, isWater } from '../data/worldMap';
import { MINUTES_PER_DAY } from '../engine/Clock';
import { stageFloat, stageIndexOf } from './growth';
import { SpatialGrid } from './spatial';

// Shaping the land: digging garden beds, carving paths through what has
// grown up, composting plants that ended up in the wrong place, and moving
// young ones before they settle in. None of it is a construction menu —
// every change is something the player does to a particular place, and the
// world keeps growing around it afterwards.

// ---------------------------------------------------------------- the world

/** What the landscape tools need to know about the ground that isn't in GameState. */
export interface LandscapeWorld {
  /** Uncleared wild obstacle on this tile, if any. */
  obstacleAt(tx: number, ty: number): 'tree' | 'bush' | 'rock' | 'flower' | 'reed' | null;
  /** House, greenhouse, stall, water, map edge: nothing can go here. */
  isBuiltOrWater(tx: number, ty: number): boolean;
  /** A wild discovery patch (left alone by the tools). */
  isSpot(tx: number, ty: number): boolean;
}

/** What it costs to have one rock dug out and carted away. */
export const ROCK_REMOVAL_COST = 20;
/** What the crew charges to clear each kind of thing standing in the way, for good. */
export const CLEAR_COST: Record<string, number> = { rock: ROCK_REMOVAL_COST, tree: 60, bush: 15 };
/** The word for having each kind of thing cleared. */
export const CLEAR_VERB: Record<string, { label: string; done: string; name: string }> = {
  rock: { label: 'Have this rock hauled away', done: 'Rock hauled away', name: 'A rock' },
  tree: { label: 'Have this tree felled', done: 'Tree felled and carted off', name: 'A tree' },
  bush: { label: 'Have this bush grubbed out', done: 'Bush grubbed out', name: 'A bush' },
};

/** The tool from the stall that each kind of clearing needs before it can be done at all. */
export const CLEAR_TOOL: Record<string, 'rockHammer' | 'chainsaw'> = { rock: 'rockHammer', tree: 'chainsaw', bush: 'chainsaw' };
export const TOOL_NAME: Record<'rockHammer' | 'chainsaw', string> = { rockHammer: 'rock hammer', chainsaw: 'chainsaw' };

/** Whether Ellen owns the tool this kind of thing needs to be cleared. */
export function hasClearTool(state: Pick<GameState, 'owned'>, kind: string): boolean {
  const tool = CLEAR_TOOL[kind];
  return !tool || state.owned.includes(tool);
}

/** What it costs to clear whatever stands on this tile, or null if nothing clearable does. */
export function clearCost(world: LandscapeWorld, tx: number, ty: number): number | null {
  const kind = world.obstacleAt(tx, ty);
  return kind && kind in CLEAR_COST ? CLEAR_COST[kind] : null;
}

export type RockBlock = 'no-rock' | 'tool' | 'coins';
export type ClearBlock = 'nothing' | 'tool' | 'coins';

export function clearBlock(state: GameState, world: LandscapeWorld, tx: number, ty: number): ClearBlock | null {
  const cost = clearCost(world, tx, ty);
  if (cost === null) return 'nothing';
  if (!hasClearTool(state, world.obstacleAt(tx, ty)!)) return 'tool';
  if (state.coins < cost) return 'coins';
  return null;
}

/** Pays to have a rock, tree or bush cleared: the tile becomes open ground for good. */
export function clearObstacle(state: GameState, world: LandscapeWorld, tx: number, ty: number): { kind: string; cost: number } | null {
  if (clearBlock(state, world, tx, ty)) return null;
  const kind = world.obstacleAt(tx, ty)!;
  const cost = CLEAR_COST[kind];
  state.coins -= cost;
  state.clearedObstacles.push(`${tx},${ty}`);
  return { kind, cost };
}

export function rockRemovalBlock(state: GameState, world: LandscapeWorld, tx: number, ty: number): RockBlock | null {
  if (world.obstacleAt(tx, ty) !== 'rock') return 'no-rock';
  if (!hasClearTool(state, 'rock')) return 'tool';
  if (state.coins < ROCK_REMOVAL_COST) return 'coins';
  return null;
}

/** Pays to have a rock hauled away: the tile becomes open ground for good. */
export function removeRock(state: GameState, world: LandscapeWorld, tx: number, ty: number): boolean {
  if (rockRemovalBlock(state, world, tx, ty)) return false;
  return !!clearObstacle(state, world, tx, ty);
}

/** Trees and rocks stand in the way of beds and plantings (unless you pay to have them cleared); bushes, flowers and reeds give way to them. */
export function isHardObstacle(kind: string | null): boolean {
  return kind === 'tree' || kind === 'rock';
}

// ---------------------------------------------------------------- sizes

/** How much ground a plant covers, fully grown, in tiles (radius). */
const FORM_RADIUS: Record<string, number> = {
  trailing: 0.8,
  fern: 0.7,
  splitleaf: 0.8,
  heart: 0.65,
  strappy: 0.62,
  spear: 0.4,
  rosette: 0.38,
  coin: 0.48,
  patterned: 0.6,
  beads: 0.6,
  bloom: 0.55,
  column: 0.4,
  globe: 0.42,
  paddle: 0.52,
  jade: 0.5,
  spiky: 0.46,
  stones: 0.3,
  palmate: 0.62,
  trap: 0.34,
  dew: 0.3,
  pitcher: 0.45,
  cups: 0.62,
  mushroom: 0.4,
  coral: 0.38,
  moss: 0.45,
  mat: 0.42,
  trefoil: 0.4,
  runner: 0.55,
  climber: 0.6,
  clump: 0.6,
  bamboo: 0.5,
  lilypad: 0.55,
  cattail: 0.45,
  fig: 0.6,
  fan: 0.62,
  palm: 0.6,
  cane: 0.5,
};

export function matureRadius(defId: string, variantId?: string): number {
  const def = PLANTS[defId];
  if (!def) return 0.5;
  const look = lookFor(defId, variantId ?? def.variants[0].id);
  return (FORM_RADIUS[def.form] ?? 0.55) * Math.max(0.7, look.size);
}

/** How much ground it covers right now, as it grows. */
export function currentRadius(p: Pick<OwnedPlant, 'defId' | 'variantId' | 'growth'>): number {
  const sf = Math.min(4, stageFloat(p.growth));
  return matureRadius(p.defId, p.variantId) * (0.35 + 0.65 * (sf / 4));
}

// ---------------------------------------------------------------- spatial index

export function wildGrid(state: GameState): SpatialGrid<OwnedPlant> {
  const grid = new SpatialGrid<OwnedPlant>(2);
  for (const p of Object.values(state.plants)) if (p.location.kind === 'wild') grid.insert(p.location.x, p.location.y, p);
  return grid;
}

// ---------------------------------------------------------------- beds

export const BED_MIN = 1.5;
export const BED_MAX = 9;

/** What a bed of this size costs to dig: a base plus the ground, and each bed dug so far makes the next dearer. */
export const BED_BASE_COST = 40;
export const BED_COST_PER_TILE = 12;
export const BED_COST_GROWTH = 1.25;

export function bedsDug(state: Pick<GameState, 'purchases'>): number {
  return state.purchases?.gardenBed ?? 0;
}

export function bedCost(state: Pick<GameState, 'purchases'>, w: number, h: number): number {
  return Math.round((BED_BASE_COST + BED_COST_PER_TILE * Math.ceil(w * h)) * Math.pow(BED_COST_GROWTH, bedsDug(state)));
}

export function bedContains(bed: Pick<GardenBed, 'x' | 'y' | 'w' | 'h' | 'shape'>, x: number, y: number, inset = 0): boolean {
  if (bed.shape === 'oval') {
    const rx = bed.w / 2 - inset;
    const ry = bed.h / 2 - inset;
    if (rx <= 0 || ry <= 0) return false;
    const dx = (x - (bed.x + bed.w / 2)) / rx;
    const dy = (y - (bed.y + bed.h / 2)) / ry;
    return dx * dx + dy * dy <= 1;
  }
  return x >= bed.x + inset && x <= bed.x + bed.w - inset && y >= bed.y + inset && y <= bed.y + bed.h - inset;
}

export function bedAt(state: GameState, x: number, y: number): GardenBed | undefined {
  return state.gardenBeds.find((b) => bedContains(b, x, y));
}

export function findBed(state: GameState, id: string): GardenBed | undefined {
  return state.gardenBeds.find((b) => b.id === id);
}

export function plantsInBed(state: GameState, bedId: string): OwnedPlant[] {
  return Object.values(state.plants).filter((p) => p.location.kind === 'wild' && p.location.bedId === bedId);
}

/** How many different species grow together in a bed. */
export function bedDiversity(state: GameState, bedId: string): number {
  return new Set(plantsInBed(state, bedId).map((p) => p.defId)).size;
}

export type BedBlock = 'too-small' | 'too-big' | 'coins' | 'blocked' | 'patch' | 'overlap';

function rectsTouch(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, gap = 0): boolean {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

/** Normalises a dragged rectangle (any corner to any corner). */
export function normRect(x0: number, y0: number, x1: number, y1: number) {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

/** Tiles a rectangle of ground covers (any overlap). */
function tilesUnder(r: { x: number; y: number; w: number; h: number }): [number, number][] {
  const out: [number, number][] = [];
  for (let ty = Math.floor(r.y); ty < Math.ceil(r.y + r.h); ty++) for (let tx = Math.floor(r.x); tx < Math.ceil(r.x + r.w); tx++) out.push([tx, ty]);
  return out;
}

export interface BedCheckOptions {
  /** A bed being turned or moved: it doesn't overlap itself. */
  ignoreId?: string;
  /** No coins change hands (turning a bed already dug). */
  free?: boolean;
}

export function bedBlockReason(state: GameState, bed: Omit<GardenBed, 'id' | 'createdAt'>, world: LandscapeWorld, opts: BedCheckOptions = {}): BedBlock | null {
  if (bed.w < BED_MIN || bed.h < BED_MIN) return 'too-small';
  if (bed.w > BED_MAX || bed.h > BED_MAX) return 'too-big';
  for (const [tx, ty] of tilesUnder(bed)) {
    // Oval beds only care about the tiles their ellipse actually reaches.
    if (bed.shape === 'oval' && !bedContains(bed, tx + 0.5, ty + 0.5, -0.35)) continue;
    if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return 'blocked';
    if (world.isBuiltOrWater(tx, ty) || isHardObstacle(world.obstacleAt(tx, ty))) return 'blocked';
    if (world.isSpot(tx, ty)) return 'patch';
  }
  if (state.gardenBeds.some((b) => b.id !== opts.ignoreId && rectsTouch(b, bed, 0.2))) return 'overlap';
  if (!opts.free && !bed.raised && state.coins < bedCost(state, bed.w, bed.h)) return 'coins';
  return null;
}

/** Clears the scrub (bushes, flowers, reeds) inside a bed; trees and rocks would have blocked it. */
function clearScrubUnder(state: GameState, bed: GardenBed, world: LandscapeWorld): number {
  let cleared = 0;
  for (const [tx, ty] of tilesUnder(bed)) {
    if (!bedContains(bed, tx + 0.5, ty + 0.5, -0.2)) continue;
    const key = `${tx},${ty}`;
    const kind = world.obstacleAt(tx, ty);
    if (kind && !isHardObstacle(kind) && !state.clearedObstacles.includes(key)) {
      state.clearedObstacles.push(key);
      cleared++;
    }
  }
  return cleared;
}

export interface BedResult {
  bed: GardenBed;
  cleared: number;
  adopted: number;
}

/** Digs a bed: clears the scrub inside it, and takes in whatever you'd already planted there. */
export function createBed(state: GameState, spec: Omit<GardenBed, 'id' | 'createdAt'>, world: LandscapeWorld, now: number): BedResult | null {
  if (bedBlockReason(state, spec, world)) return null;
  let paid = 0;
  if (!spec.raised) {
    paid = bedCost(state, spec.w, spec.h);
    state.coins -= paid;
    state.purchases.gardenBed = bedsDug(state) + 1;
  }
  const bed: GardenBed = { id: makeUid('bed'), ...spec, createdAt: now, paid };
  state.gardenBeds.push(bed);
  const cleared = clearScrubUnder(state, bed, world);
  let adopted = 0;
  for (const p of Object.values(state.plants)) {
    if (p.location.kind !== 'wild' || p.location.bedId) continue;
    if (bedContains(bed, p.location.x, p.location.y)) {
      p.location.bedId = bed.id;
      adopted++;
    }
  }
  return { bed, cleared, adopted };
}

/** What filling a bed in gives back: half of what it cost to dig; a raised bed goes back in stock instead. */
export function bedRefund(bed: GardenBed): number {
  return bed.raised ? 0 : Math.floor((bed.paid ?? 0) / 2);
}

/** Sets a stocked raised bed down, centred on (x, y): a bed like any other, just not dug. */
export function placeRaisedBed(state: GameState, x: number, y: number, world: LandscapeWorld, now: number, size: { w: number; h: number }): BedResult | null {
  if ((state.decorStock.raisedBed ?? 0) <= 0) return null;
  const spec = { x: Math.round((x - size.w / 2) * 4) / 4, y: Math.round((y - size.h / 2) * 4) / 4, w: size.w, h: size.h, shape: 'rect' as const, raised: true };
  const res = createBed(state, spec, world, now);
  if (res) state.decorStock.raisedBed = (state.decorStock.raisedBed ?? 0) - 1;
  return res;
}

/** The bed turned a quarter-turn about its centre (a raised bed keeps to quarter tiles). */
export function turnedBedSpec(bed: GardenBed): Omit<GardenBed, 'id' | 'createdAt'> {
  const cx = bed.x + bed.w / 2;
  const cy = bed.y + bed.h / 2;
  let x = cx - bed.h / 2;
  let y = cy - bed.w / 2;
  if (bed.raised) {
    x = Math.round(x * 4) / 4;
    y = Math.round(y * 4) / 4;
  }
  const { id: _id, createdAt: _at, ...rest } = bed;
  return { ...rest, x, y, w: bed.h, h: bed.w };
}

/** Why a bed can't be turned where it is; null means it can. A square bed has nothing to turn. */
export function bedTurnBlock(state: GameState, id: string, world: LandscapeWorld): BedBlock | 'square' | null {
  const bed = findBed(state, id);
  if (!bed) return 'blocked';
  if (Math.abs(bed.w - bed.h) < 0.01) return 'square';
  return bedBlockReason(state, turnedBedSpec(bed), world, { ignoreId: id, free: true });
}

/**
 * Turns a bed a quarter-turn about its centre. Whatever grows in it turns
 * with it, so every plant ends up where it was relative to the edges; scrub
 * under the newly covered ground is cleared, as when the bed was dug.
 */
export function rotateBed(state: GameState, id: string, world: LandscapeWorld): boolean {
  const bed = findBed(state, id);
  if (!bed || bedTurnBlock(state, id, world)) return false;
  const cx = bed.x + bed.w / 2;
  const cy = bed.y + bed.h / 2;
  const spec = turnedBedSpec(bed);
  const ncx = spec.x + spec.w / 2;
  const ncy = spec.y + spec.h / 2;
  for (const p of Object.values(state.plants)) {
    if (p.location.kind !== 'wild' || p.location.bedId !== id) continue;
    // A quarter-turn clockwise about the centre: (dx, dy) becomes (-dy, dx).
    const dx = p.location.x - cx;
    const dy = p.location.y - cy;
    p.location.x = Math.round((ncx - dy) * 100) / 100;
    p.location.y = Math.round((ncy + dx) * 100) / 100;
  }
  Object.assign(bed, spec);
  clearScrubUnder(state, bed, world);
  return true;
}

/** Fills a bed back in: its plants stay where they are, now free to roam. Half the coins come back; a raised bed goes back in stock. */
export function removeBed(state: GameState, id: string): boolean {
  const idx = state.gardenBeds.findIndex((b) => b.id === id);
  if (idx === -1) return false;
  const [bed] = state.gardenBeds.splice(idx, 1);
  if (bed.raised) state.decorStock.raisedBed = (state.decorStock.raisedBed ?? 0) + 1;
  else state.coins += bedRefund(bed);
  for (const p of Object.values(state.plants)) if (p.location.kind === 'wild' && p.location.bedId === id) delete p.location.bedId;
  return true;
}

// ---------------------------------------------------------------- paths

export const PATH_WIDTH = 0.9;
export const PATH_MIN_LENGTH = 2;
export const PATH_MAX_POINTS = 80;
/** Game-minutes for the verges of a path to creep most of the way in. */
export const ENCROACH_MINUTES = 4 * MINUTES_PER_DAY;

export function pathPairs(points: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < points.length; i += 2) out.push([points[i], points[i + 1]]);
  return out;
}

/** Thins a traced route to points about half a tile apart, rounded for a compact save. */
export function simplifyRoute(route: { x: number; y: number }[], spacing = 0.5): number[] {
  const pts: number[] = [];
  let lx = NaN;
  let ly = NaN;
  for (const p of route) {
    if (!Number.isNaN(lx) && Math.hypot(p.x - lx, p.y - ly) < spacing) continue;
    pts.push(Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10);
    lx = p.x;
    ly = p.y;
    if (pts.length >= PATH_MAX_POINTS * 2) break;
  }
  const last = route[route.length - 1];
  if (last && pts.length >= 2 && Math.hypot(last.x - lx, last.y - ly) > 0.15 && pts.length < PATH_MAX_POINTS * 2) {
    pts.push(Math.round(last.x * 10) / 10, Math.round(last.y * 10) / 10);
  }
  return pts;
}

export function routeLength(points: number[]): number {
  let len = 0;
  for (let i = 2; i + 1 < points.length; i += 2) len += Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
  return len;
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function distToRoute(points: number[], x: number, y: number): number {
  if (points.length < 2) return Infinity;
  if (points.length < 4) return Math.hypot(x - points[0], y - points[1]);
  let best = Infinity;
  for (let i = 2; i + 1 < points.length; i += 2) {
    const d = segDist(x, y, points[i - 2], points[i - 1], points[i], points[i + 1]);
    if (d < best) best = d;
  }
  return best;
}

/** 0 for a fresh path, rising toward 1 as its verges creep back in. */
export function encroachment(path: GardenPath, now: number): number {
  return Math.max(0, Math.min(1, (now - path.createdAt) / ENCROACH_MINUTES));
}

/**
 * Whether (x, y) is on a path. `forSeedlings` uses the path's current,
 * narrowing clear strip: over time new growth takes hold along its edges,
 * but never down the middle where people walk.
 */
export function onPath(state: GameState, x: number, y: number, now: number, forSeedlings = false): GardenPath | undefined {
  for (const path of state.paths) {
    const half = path.width / 2;
    const clear = forSeedlings ? half * (1 - encroachment(path, now) * 0.45) : half * 0.9;
    if (distToRoute(path.points, x, y) < clear) return path;
  }
  return undefined;
}

export type PathBlock = 'too-short' | 'blocked' | 'bed' | 'coins';

/** What a path costs: the labour by the pace, and a lot more for every tree felled and rock dug out. */
export const PATH_BASE_COST = 30;
export const PATH_COST_PER_PACE = 12;
export const PATH_COST_TREE = 50;
export const PATH_COST_ROCK = 25;
/** Without a chainsaw (or rock hammer) of your own, the crew brings theirs — and charges for it. */
export const PATH_COST_TREE_HIRED = 110;
export const PATH_COST_ROCK_HIRED = 55;

export interface PathPreview {
  block: PathBlock | null;
  /** Your plants that would be composted to make way. */
  plants: OwnedPlant[];
  /** Scrub that would be cleared. */
  scrub: string[];
  /** Points along the route that can't be cleared (water, buildings, the map's edge). */
  badPoints: number[];
  /** Trees and rocks on the route, which the crew will clear for a price ("x,y" tiles). */
  trees: string[];
  rocks: string[];
  /** What it all costs. */
  cost: number;
}

export function pathCost(length: number, trees: number, rocks: number, hire: { chainsaw?: boolean; rockHammer?: boolean } = {}): number {
  const tree = hire.chainsaw ? PATH_COST_TREE_HIRED : PATH_COST_TREE;
  const rock = hire.rockHammer ? PATH_COST_ROCK_HIRED : PATH_COST_ROCK;
  return Math.round(PATH_BASE_COST + PATH_COST_PER_PACE * length + tree * trees + rock * rocks);
}

export function previewPath(state: GameState, points: number[], world: LandscapeWorld, width = PATH_WIDTH): PathPreview {
  const res: PathPreview = { block: null, plants: [], scrub: [], badPoints: [], trees: [], rocks: [], cost: 0 };
  if (points.length < 4 || routeLength(points) < PATH_MIN_LENGTH) res.block = 'too-short';
  // Check the whole centreline, not just the traced points: a straight
  // stretch mustn't slip past a tree between two of them. Trees and rocks
  // on the line are cleared, at a price; water and buildings stop it.
  const pairs = pathPairs(points);
  const bad = new Set<string>();
  const hard = new Set<string>();
  const test = (x: number, y: number) => {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const key = `${tx},${ty}`;
    if (bad.has(key) || hard.has(key)) return;
    if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H || world.isBuiltOrWater(tx, ty)) {
      bad.add(key);
      res.badPoints.push(x, y);
      return;
    }
    const o = world.obstacleAt(tx, ty);
    if (o === 'tree' || o === 'rock') {
      hard.add(key);
      (o === 'tree' ? res.trees : res.rocks).push(key);
    }
  };
  if (pairs.length === 1) test(pairs[0][0], pairs[0][1]);
  for (let i = 1; i < pairs.length; i++) {
    const [ax, ay] = pairs[i - 1];
    const [bx, by] = pairs[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.3));
    for (let k = 0; k <= n; k++) test(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
  }
  if (res.badPoints.length) res.block = res.block ?? 'blocked';
  // Paths go around garden beds, not through them.
  if (!res.block && state.gardenBeds.some((b) => pathPairs(points).some(([x, y]) => bedContains(b, x, y, -width / 2 + 0.15)))) res.block = 'bed';
  const half = width / 2;
  const xs = points.filter((_, i) => i % 2 === 0);
  const ys = points.filter((_, i) => i % 2 === 1);
  if (xs.length) {
    const x0 = Math.floor(Math.min(...xs) - half);
    const x1 = Math.floor(Math.max(...xs) + half);
    const y0 = Math.floor(Math.min(...ys) - half);
    const y1 = Math.floor(Math.max(...ys) + half);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const kind = world.obstacleAt(tx, ty);
        if (!kind || isHardObstacle(kind)) continue;
        if (distToRoute(points, tx + 0.5, ty + 0.5) < half + 0.25) res.scrub.push(`${tx},${ty}`);
      }
    }
  }
  for (const p of Object.values(state.plants)) {
    if (p.location.kind !== 'wild') continue;
    if (distToRoute(points, p.location.x, p.location.y) < half + currentRadius(p) * 0.35) res.plants.push(p);
  }
  // Felling trees and breaking rocks needs the tools for it. Without your own,
  // the crew brings theirs: the path still goes ahead, those just cost more.
  const hired = pathToolsNeeded(state, res);
  res.cost = pathCost(routeLength(points), res.trees.length, res.rocks.length, { chainsaw: hired.includes('chainsaw'), rockHammer: hired.includes('rockHammer') });
  if (!res.block && state.coins < res.cost) res.block = 'coins';
  return res;
}

/** The tools a path would need that Ellen hasn't got: a chainsaw for trees on it, a rock hammer for rocks. */
export function pathToolsNeeded(state: Pick<GameState, 'owned'>, p: Pick<PathPreview, 'trees' | 'rocks'>): ('rockHammer' | 'chainsaw')[] {
  const out: ('rockHammer' | 'chainsaw')[] = [];
  if (p.trees.length && !hasClearTool(state, 'tree')) out.push('chainsaw');
  if (p.rocks.length && !hasClearTool(state, 'rock')) out.push('rockHammer');
  return out;
}

/** "a chainsaw", "a rock hammer", or "a chainsaw and a rock hammer". */
export function toolList(tools: ('rockHammer' | 'chainsaw')[]): string {
  return tools.map((t) => `a ${TOOL_NAME[t]}`).join(' and ');
}

export interface PathResult {
  path: GardenPath;
  /** Plants of yours that were dug up to make way. */
  dugUp: number;
  /** Scrub cleared along it. */
  cleared: number;
  trees: number;
  rocks: number;
  cost: number;
}

/** Carves a path: pays the crew, clears everything along it (scrub, trees, rocks) and digs up whatever of yours was in the way. */
export function createPath(state: GameState, points: number[], world: LandscapeWorld, now: number): PathResult | null {
  const preview = previewPath(state, points, world);
  if (preview.block) return null;
  for (const p of preview.plants) delete state.plants[p.id];
  state.coins -= preview.cost;
  for (const key of [...preview.scrub, ...preview.trees, ...preview.rocks]) if (!state.clearedObstacles.includes(key)) state.clearedObstacles.push(key);
  const path: GardenPath = { id: makeUid('path'), points: [...points], width: PATH_WIDTH, createdAt: now };
  state.paths.push(path);
  return { path, dugUp: preview.plants.length, cleared: preview.scrub.length, trees: preview.trees.length, rocks: preview.rocks.length, cost: preview.cost };
}

/** Lets a path grow back over. The scrub it cleared stays cleared — whatever grows there now is up to your plants. */
export function removePath(state: GameState, id: string): boolean {
  const idx = state.paths.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  state.paths.splice(idx, 1);
  return true;
}

export function pathAt(state: GameState, x: number, y: number, slack = 0.2): GardenPath | undefined {
  return state.paths.find((p) => distToRoute(p.points, x, y) < p.width / 2 + slack);
}

// ---------------------------------------------------------------- clearings

// A clearing isn't a bed: nothing is dug and nothing is left behind. It's
// the ground under a square or a circle taken right back to bare earth —
// scrub, trees, rocks and whatever was growing there — for a fresh start.
// What grows there next is up to you (and, in time, the wild).

export type ClearingShape = 'square' | 'circle';

export interface ClearingSpec {
  x: number;
  y: number;
  /** Width and height: always the same, it's a square or a circle. */
  size: number;
  shape: ClearingShape;
}

/** The square (or the circle's bounding square) dragged out from a to b, kept to quarter tiles. */
export function clearingSpecOf(a: { x: number; y: number }, b: { x: number; y: number }, shape: ClearingShape): ClearingSpec {
  const q = (v: number) => Math.round(v * 4) / 4;
  const size = q(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)));
  return { x: q(b.x < a.x ? a.x - size : a.x), y: q(b.y < a.y ? a.y - size : a.y), size, shape };
}

export const CLEARING_MIN = 1;
export const CLEARING_MAX = 12;
export const CLEARING_BASE_COST = 20;
export const CLEARING_COST_PER_TILE = 3;

export type ClearingBlock = 'too-small' | 'too-big' | 'empty' | 'coins';

export interface ClearingPreview {
  block: ClearingBlock | null;
  /** Plants that would be composted (yours and the wild's alike; those in garden beds are left be). */
  plants: OwnedPlant[];
  /** Bushes, flowers and reeds that would be grubbed out ("x,y" tiles). */
  scrub: string[];
  trees: string[];
  rocks: string[];
  cost: number;
}

function clearingAsBed(spec: ClearingSpec): Pick<GardenBed, 'x' | 'y' | 'w' | 'h' | 'shape'> {
  return { x: spec.x, y: spec.y, w: spec.size, h: spec.size, shape: spec.shape === 'circle' ? 'oval' : 'rect' };
}

export function inClearing(spec: ClearingSpec, x: number, y: number, inset = 0): boolean {
  return bedContains(clearingAsBed(spec), x, y, inset);
}

export function clearingCost(size: number, shape: ClearingShape, trees: number, rocks: number, hire: { chainsaw?: boolean; rockHammer?: boolean } = {}): number {
  const area = shape === 'circle' ? (Math.PI * size * size) / 4 : size * size;
  const tree = hire.chainsaw ? PATH_COST_TREE_HIRED : PATH_COST_TREE;
  const rock = hire.rockHammer ? PATH_COST_ROCK_HIRED : PATH_COST_ROCK;
  return Math.round(CLEARING_BASE_COST + CLEARING_COST_PER_TILE * area + tree * trees + rock * rocks);
}

export function previewClearing(state: GameState, spec: ClearingSpec, world: LandscapeWorld): ClearingPreview {
  const res: ClearingPreview = { block: null, plants: [], scrub: [], trees: [], rocks: [], cost: 0 };
  if (spec.size < CLEARING_MIN) res.block = 'too-small';
  else if (spec.size > CLEARING_MAX) res.block = 'too-big';
  for (const [tx, ty] of tilesUnder({ x: spec.x, y: spec.y, w: spec.size, h: spec.size })) {
    if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) continue;
    if (!inClearing(spec, tx + 0.5, ty + 0.5, -0.2)) continue;
    // The house, the water and the wild patches are left as they are.
    if (world.isBuiltOrWater(tx, ty) || world.isSpot(tx, ty)) continue;
    const kind = world.obstacleAt(tx, ty);
    if (!kind) continue;
    const key = `${tx},${ty}`;
    if (kind === 'tree') res.trees.push(key);
    else if (kind === 'rock') res.rocks.push(key);
    else res.scrub.push(key);
  }
  for (const p of Object.values(state.plants)) {
    if (p.location.kind !== 'wild' || p.location.bedId) continue;
    if (inClearing(spec, p.location.x, p.location.y)) res.plants.push(p);
  }
  const hired = pathToolsNeeded(state, res);
  res.cost = clearingCost(spec.size, spec.shape, res.trees.length, res.rocks.length, { chainsaw: hired.includes('chainsaw'), rockHammer: hired.includes('rockHammer') });
  if (!res.block && !res.plants.length && !res.scrub.length && !res.trees.length && !res.rocks.length) res.block = 'empty';
  if (!res.block && state.coins < res.cost) res.block = 'coins';
  return res;
}

export interface ClearingResult {
  composted: number;
  scrub: number;
  trees: number;
  rocks: number;
  cost: number;
}

/** Clears the ground under a square or circle back to bare earth, for a price. */
export function createClearing(state: GameState, spec: ClearingSpec, world: LandscapeWorld): ClearingResult | null {
  const preview = previewClearing(state, spec, world);
  if (preview.block) return null;
  for (const p of preview.plants) delete state.plants[p.id];
  state.coins -= preview.cost;
  for (const key of [...preview.scrub, ...preview.trees, ...preview.rocks]) if (!state.clearedObstacles.includes(key)) state.clearedObstacles.push(key);
  return { composted: preview.plants.length, scrub: preview.scrub.length, trees: preview.trees.length, rocks: preview.rocks.length, cost: preview.cost };
}

// ---------------------------------------------------------------- compost

export interface CompostResult {
  name: string;
}

/**
 * Composts an outdoor plant, clearing its ground — and that's all: nothing
 * comes back to the basket. Take a cutting first if you want one.
 */
export function compostPlant(state: GameState, plantId: string): CompostResult | null {
  const p = state.plants[plantId];
  if (!p || p.location.kind !== 'wild') return null;
  const name = specimenName(p.defId, p.variantId);
  delete state.plants[plantId];
  return { name };
}

// ---------------------------------------------------------------- planting & moving

/** (Paths don't stop planting: you can set something right down on one, though nothing seeds itself there.) */
export type PlantingBlock = 'bounds' | 'water' | 'dry' | 'building' | 'obstacle' | 'spot' | 'crowded' | 'decor';

export interface PlantingCheck {
  block: PlantingBlock | null;
  /** The plant that's in the way, for 'crowded'. */
  blocker?: OwnedPlant;
  zone: OutdoorZoneId | null;
  bedId?: string;
}

/**
 * Whether a plant of this species could be planted exactly at (x, y).
 * Plants can go close together — right between two others, if there's
 * physically room for a young one — but not on top of one another.
 */
export function checkPlanting(
  state: GameState,
  defId: string,
  x: number,
  y: number,
  world: LandscapeWorld,
  now: number,
  opts: { ignoreId?: string; grid?: SpatialGrid<OwnedPlant> } = {}
): PlantingCheck {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return { block: 'bounds', zone: null };
  const zone = zoneAt(tx, ty);
  if (zone === 'greenhouse') return { block: 'building', zone: null };
  const oz = zone as OutdoorZoneId;
  // Water plants go out on the creek or a pond; a lily pad goes nowhere else.
  const def = PLANTS[defId];
  const wet = isWater(tx, ty) || inPond(state, x, y);
  if (def?.water === 'only' && !wet) return { block: 'dry', zone: oz };
  if (!(wet && def?.water)) {
    if (world.isBuiltOrWater(tx, ty)) return { block: 'water', zone: oz };
    if (world.obstacleAt(tx, ty) && world.obstacleAt(tx, ty) !== 'flower') return { block: 'obstacle', zone: oz };
    if (world.isSpot(tx, ty)) return { block: 'spot', zone: oz };
    if (state.decor.some((d) => Math.hypot(d.x - x, d.y - y) < 0.55) || inPond(state, x, y)) return { block: 'decor', zone: oz };
  }
  const mine = matureRadius(defId) * 0.4;
  let blocker: OwnedPlant | undefined;
  const test = (p: OwnedPlant) => {
    if (p.id === opts.ignoreId || p.location.kind !== 'wild') return false;
    const need = Math.max(0.55, currentRadius(p) * 0.62 + mine);
    if (Math.hypot(p.location.x - x, p.location.y - y) < need) {
      blocker = p;
      return true;
    }
    return false;
  };
  if (opts.grid) opts.grid.query(x, y, 2, test);
  else for (const p of Object.values(state.plants)) if (test(p)) break;
  if (blocker) return { block: 'crowded', blocker, zone: oz };
  return { block: null, zone: oz, bedId: wet ? undefined : bedAt(state, x, y)?.id };
}

/** Young plants can still be dug up and moved; once large, they've settled in for good. */
export function canTransplant(p: OwnedPlant): boolean {
  return p.location.kind === 'wild' && stageIndexOf(p.growth) < 3;
}

export function transplant(state: GameState, plantId: string, x: number, y: number, world: LandscapeWorld, now: number): boolean {
  const p = state.plants[plantId];
  if (!p || !canTransplant(p)) return false;
  const check = checkPlanting(state, p.defId, x, y, world, now, { ignoreId: plantId });
  if (check.block || !check.zone) return false;
  p.location = { kind: 'wild', x, y, zone: check.zone };
  if (check.bedId) p.location.bedId = check.bedId;
  return true;
}
