import type { GameState, PlacedFurniture } from '../state';
import { makeUid } from '../state';
import type { FurnitureId } from '../data/shop';
import { DISPLAY_SLOTS, GREENHOUSE_FURNITURE, NURSERY_BEDS, STORAGE_CRATES, type DisplayKind, type DisplaySlot } from '../data/stations';
import { FURNITURE_DEFS, GROW_LAMP_RADIUS, type FurnitureDef } from '../data/furniture';
import { INTERIOR_H, INTERIOR_W, LIVING_FIXTURES, PARTITION_X, PUTTING_CUP_OFFSET, isKeepClearTile, type InteriorRect, type LivingFixture } from '../data/interior';
import { occupantOf } from './propagation';

// Indoor furniture: everything that stands, hangs or lies in the house and
// greenhouse, placed freely (any fraction of a tile) and moved whenever the
// player likes. Nursery beds and trays root cuttings; stands, shelves,
// tables, planters and hooks each hold one displayed plant; lamps and the
// odd watering can just make the place theirs.
//
// The greenhouse's original fittings are "virtual" until first moved: they
// stand where the layout data puts them, so old saves and a fresh game look
// the same, and the first time the player picks one up it becomes an
// ordinary placed piece with the same id — so whatever is growing in it
// comes along. The living room's furniture works the same way, except it
// can only be moved, never put away: the cat is not giving up his bed, and
// Scout isn't giving up hers.

export const FURNITURE_SLOT_KIND: Partial<Record<FurnitureId, DisplayKind>> = Object.fromEntries(
  Object.values(FURNITURE_DEFS)
    .filter((d) => d.slotKind)
    .map((d) => [d.id, d.slotKind])
);

const BUILT_IN_KIND: Record<DisplayKind, FurnitureId> = {
  stand: 'plantStand',
  hanging: 'ceilingHook',
  shelf: 'wallShelf',
  tiered: 'tieredStand',
  sunroom: 'sunroomStand',
  pedestal: 'ironPedestal',
  trellis: 'wallTrellis',
  planter: 'floorPlanter',
  table: 'pottingTable',
};

/** The original fittings still standing where the layout put them. */
export function builtInFurniture(state: Pick<GameState, 'owned' | 'seededFixtures'>): PlacedFurniture[] {
  const has = (req?: string) => !req || state.owned.includes(req);
  const seeded = state.seededFixtures ?? [];
  const out: PlacedFurniture[] = [];
  for (const b of NURSERY_BEDS) if (has(b.requires) && !seeded.includes(b.id)) out.push({ id: b.id, kind: 'nurseryBed', x: b.x, y: b.y });
  for (const s of DISPLAY_SLOTS) if (has(s.requires) && !seeded.includes(s.id)) out.push({ id: s.id, kind: BUILT_IN_KIND[s.kind], x: s.x, y: s.y });
  for (const f of LIVING_FIXTURES) if (!seeded.includes(f.id)) out.push(fixtureHome(f));
  // Scout's bed and Ellen's desk, where the greenhouse layout puts them.
  for (const f of GREENHOUSE_FURNITURE) if (!seeded.includes(f.id)) out.push({ id: f.id, kind: f.id, x: f.x, y: f.y });
  return out;
}

/** A living-room fixture as a piece, standing where the layout puts it (the inverse of footprint()). */
function fixtureHome(f: LivingFixture): PlacedFurniture {
  return { id: f.id, kind: f.kind, x: f.x + f.w / 2 - 0.5, y: f.y + f.h / 2 - 0.56 };
}

/** How far a living-room fixture has been moved from its original place, in tiles. */
export function fixtureOffset(state: Pick<GameState, 'owned' | 'seededFixtures' | 'furniture'>, fixtureId: string): { dx: number; dy: number } {
  const f = LIVING_FIXTURES.find((l) => l.id === fixtureId);
  if (!f || !(state.seededFixtures ?? []).includes(fixtureId)) return { dx: 0, dy: 0 };
  const piece = state.furniture.find((p) => p.id === fixtureId);
  if (!piece) return { dx: 0, dy: 0 };
  const home = fixtureHome(f);
  return { dx: piece.x - home.x, dy: piece.y - home.y };
}

/** Where the putting mat's cup is right now, in interior tiles. */
export function puttingCup(state: Pick<GameState, 'owned' | 'seededFixtures' | 'furniture'>): { x: number; y: number } {
  const mat = LIVING_FIXTURES.find((f) => f.kind === 'puttingMat')!;
  const { dx, dy } = fixtureOffset(state, mat.id);
  return { x: mat.x + PUTTING_CUP_OFFSET.x + dx, y: mat.y + PUTTING_CUP_OFFSET.y + dy };
}

/** Every piece of furniture indoors right now. */
export function allFurniture(state: Pick<GameState, 'owned' | 'seededFixtures' | 'furniture'>): PlacedFurniture[] {
  return [...builtInFurniture(state), ...state.furniture];
}

export function findFurniture(state: GameState, id: string): PlacedFurniture | undefined {
  return allFurniture(state).find((f) => f.id === id);
}

export function furnitureDef(kind: FurnitureId): FurnitureDef {
  return FURNITURE_DEFS[kind];
}

/** The floor a piece covers, in interior tiles. */
export function footprint(kind: FurnitureId, x: number, y: number, rot = 0): InteriorRect {
  const def = FURNITURE_DEFS[kind];
  const turned = def.rotatable && rot % 2 === 1;
  const w = turned ? def.h : def.w;
  const h = turned ? def.w : def.h;
  const cx = x + 0.5;
  const cy = y + 0.56;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function rectsOverlap(a: InteriorRect, b: InteriorRect, margin = 0): boolean {
  return a.x < b.x + b.w + margin && a.x + a.w + margin > b.x && a.y < b.y + b.h + margin && a.y + a.h + margin > b.y;
}

function rectTouchesTile(r: InteriorRect, tx: number, ty: number): boolean {
  return rectsOverlap(r, { x: tx, y: ty, w: 1, h: 1 }, -0.001);
}

/** Every display spot indoors: stands, shelves, hooks, tables, planters… */
export function displaySlots(state: GameState): DisplaySlot[] {
  return allFurniture(state)
    .filter((f) => FURNITURE_DEFS[f.kind]?.role === 'display')
    .map((f) => ({ id: f.id, x: f.x, y: f.y, kind: FURNITURE_DEFS[f.kind].slotKind! }));
}

/** Every place a cutting can root: nursery beds and propagation trays. */
export function nurserySpots(state: GameState): PlacedFurniture[] {
  return allFurniture(state).filter((f) => FURNITURE_DEFS[f.kind]?.role === 'nursery');
}

/** Things that aren't furniture but still take up floor: the sun room's crates, until it's cleared. */
export function staticSolids(state: Pick<GameState, 'owned'>): InteriorRect[] {
  const rects: InteriorRect[] = [];
  if (!state.owned.includes('sunRoom')) for (const c of STORAGE_CRATES) rects.push({ x: c.x + 0.06, y: c.y + 0.1, w: 0.88, h: 0.8 });
  return rects;
}

export type PlaceBlock = 'none-left' | 'wall' | 'doorway' | 'occupied';

export interface SitOptions {
  rot?: number;
  /** The piece being moved: it doesn't collide with itself. */
  ignoreId?: string;
  /** Points that must stay clear (whoever is standing there). */
  avoid?: { x: number; y: number }[];
}

/** Whether a piece of this kind could stand at (x, y); null means yes. */
export function sitBlockReason(state: GameState, kind: FurnitureId, x: number, y: number, opts: SitOptions = {}): Exclude<PlaceBlock, 'none-left'> | null {
  const def = FURNITURE_DEFS[kind];
  if (!def) return 'wall';
  const r = footprint(kind, x, y, opts.rot ?? 0);
  // Inside the walls, and not straddling the wall between the rooms.
  // The north wall is drawn low, so things can stand right up against it (the TV, the bookshelf).
  if (r.x < 1 || r.y < 0.7 || r.x + r.w > INTERIOR_W - 1 || r.y + r.h > INTERIOR_H - 1) return 'wall';
  if (r.x < PARTITION_X + 1 && r.x + r.w > PARTITION_X) return 'wall';
  if (def.layer === 'overhead') {
    // A hook can hang above anything, just not right next to another hook.
    const others = allFurniture(state).filter((f) => f.id !== opts.ignoreId && FURNITURE_DEFS[f.kind]?.layer === 'overhead');
    if (others.some((f) => Math.hypot(f.x - x, f.y - y) < 0.55)) return 'occupied';
    return null;
  }
  if (def.layer === 'flat') {
    // A rug goes anywhere; the cat's bed or the putting mat needs clear floor.
    if (!def.reserves) return null;
    for (const f of allFurniture(state)) {
      if (f.id === opts.ignoreId) continue;
      const fd = FURNITURE_DEFS[f.kind];
      if (!fd || !(fd.layer === 'floor' || fd.reserves)) continue;
      if (rectsOverlap(r, footprint(f.kind, f.x, f.y, f.rot ?? 0))) return 'occupied';
    }
    for (const s of staticSolids(state)) if (rectsOverlap(r, s)) return 'occupied';
    return null;
  }
  for (let ty = Math.floor(r.y); ty <= Math.floor(r.y + r.h); ty++) {
    for (let tx = Math.floor(r.x); tx <= Math.floor(r.x + r.w); tx++) {
      if (isKeepClearTile(tx, ty) && rectTouchesTile(r, tx, ty)) return 'doorway';
    }
  }
  for (const f of allFurniture(state)) {
    if (f.id === opts.ignoreId) continue;
    const fd = FURNITURE_DEFS[f.kind];
    if (!fd) continue;
    if (fd.layer === 'floor' && rectsOverlap(r, footprint(f.kind, f.x, f.y, f.rot ?? 0), 0.02)) return 'occupied';
    // Floor you can walk on but can't furnish: the putting mat, the cat's bed…
    if (fd.reserves && rectsOverlap(r, footprint(f.kind, f.x, f.y, f.rot ?? 0))) return 'occupied';
  }
  for (const s of staticSolids(state)) if (rectsOverlap(r, s)) return 'occupied';
  for (const p of opts.avoid ?? []) if (rectsOverlap(r, { x: p.x - 0.3, y: p.y - 0.3, w: 0.6, h: 0.6 })) return 'occupied';
  return null;
}

export function placeBlockReason(state: GameState, kind: FurnitureId, x: number, y: number, opts: SitOptions = {}): PlaceBlock | null {
  if ((state.furnitureStock[kind] ?? 0) <= 0) return 'none-left';
  return sitBlockReason(state, kind, x, y, opts);
}

/** Sets a piece from stock down at (x, y). */
export function placeFurniture(state: GameState, kind: FurnitureId, x: number, y: number, opts: SitOptions = {}): PlacedFurniture | null {
  if (placeBlockReason(state, kind, x, y, opts)) return null;
  state.furnitureStock[kind] = (state.furnitureStock[kind] ?? 0) - 1;
  const piece: PlacedFurniture = { id: makeUid('furniture'), kind, x, y };
  if (opts.rot) piece.rot = opts.rot % 2;
  state.furniture.push(piece);
  return piece;
}

/** Turns an original fitting into an ordinary placed piece (same id), ready to move. */
function takeOver(state: GameState, id: string): PlacedFurniture | undefined {
  const own = state.furniture.find((f) => f.id === id);
  if (own) return own;
  const built = builtInFurniture(state).find((f) => f.id === id);
  if (!built) return undefined;
  state.seededFixtures.push(id);
  state.furniture.push(built);
  return built;
}

/** Moves a piece — and whatever is growing in it — to (x, y). */
export function moveFurniture(state: GameState, id: string, x: number, y: number, opts: Omit<SitOptions, 'ignoreId'> = {}): boolean {
  const piece = findFurniture(state, id);
  if (!piece) return false;
  const rot = opts.rot ?? piece.rot ?? 0;
  if (sitBlockReason(state, piece.kind, x, y, { ...opts, rot, ignoreId: id })) return false;
  const owned = takeOver(state, id)!;
  owned.x = x;
  owned.y = y;
  if (FURNITURE_DEFS[owned.kind].rotatable) owned.rot = rot % 2;
  return true;
}

/** A quarter-turn in place, if there's room for it. */
export function rotateFurniture(state: GameState, id: string, avoid?: { x: number; y: number }[]): boolean {
  const piece = findFurniture(state, id);
  if (!piece || !FURNITURE_DEFS[piece.kind].rotatable) return false;
  return moveFurniture(state, id, piece.x, piece.y, { rot: ((piece.rot ?? 0) + 1) % 2, avoid });
}

/** Picks an empty piece back up into stock, to set it down somewhere else. */
export function pickUpFurniture(state: GameState, id: string): boolean {
  const piece = findFurniture(state, id);
  if (!piece || FURNITURE_DEFS[piece.kind].fixed) return false;
  if (occupantOf(state, { slotId: id }) || occupantOf(state, { bedId: id })) return false;
  takeOver(state, id);
  const idx = state.furniture.findIndex((f) => f.id === id);
  const [f] = state.furniture.splice(idx, 1);
  state.furnitureStock[f.kind] = (state.furnitureStock[f.kind] ?? 0) + 1;
  return true;
}

/** Vines and trailers climb a trellis; anything else just sits in its pot at the foot. */
export function climbsTrellis(form: string): boolean {
  return form === 'trailing' || form === 'beads' || form === 'climber';
}

/** Centres of every grow lamp, for growth. */
export function growLampCenters(state: GameState): { x: number; y: number }[] {
  return state.furniture.filter((f) => f.kind === 'growLamp').map((f) => ({ x: f.x + 0.5, y: f.y + 0.5 }));
}

/** Whether an indoor plant living in this piece sits in a grow lamp's light. */
export function underGrowLamp(lamps: { x: number; y: number }[], piece: PlacedFurniture | undefined): boolean {
  if (!piece || lamps.length === 0) return false;
  return lamps.some((l) => Math.hypot(l.x - (piece.x + 0.5), l.y - (piece.y + 0.5)) <= GROW_LAMP_RADIUS);
}
