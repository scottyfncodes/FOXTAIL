import type { GameState } from '../state';
import type { DecorId } from '../data/shop';
import { MARKET_STALL, rectContains, type Rect } from '../data/worldMap';
import { decorFits, moveDecor, placeDecor } from './decor';
import { DECOR_DEFS, decorSize, decorTurn } from '../data/decor';
import { swapsFootprint } from '../data/turn';
import type { LandscapeWorld } from './landscape';

// Outdoor arranging: the garden's movable pieces — every bit of decor, and
// the Plant Stand & Supply stall itself — dragged around the same way the
// furniture is indoors. Decor sits anywhere on open ground; the stall snaps
// to whole tiles, since the valley's ground is tiled and the stall blocks
// the tiles it stands on.

/** The stall's id among the yard's pieces. */
export const STALL_ID = 'stall';

export interface YardPiece {
  id: string;
  kind: DecorId | 'stall';
  /** Decor: its base point. The stall: its top-left tile. */
  x: number;
  y: number;
  /** Quarter-turns, 0–3 (standing pieces and the stall use 0 and 2: facing either way). */
  rot?: number;
  /** A pond: its size as dug, at rotation 0. */
  size?: { w: number; h: number };
}

export type YardBlock = 'none-left' | 'ground' | 'occupied';

/** Where the stall stands (its top-left tile). */
export function stallPos(state: Pick<GameState, 'stall'>): { x: number; y: number } {
  return state.stall;
}

/** The tiles the stall covers right now. */
export function stallRect(state: Pick<GameState, 'stall'>): Rect {
  const p = stallPos(state);
  return { x: p.x, y: p.y, w: MARKET_STALL.w, h: MARKET_STALL.h };
}

/** Every movable piece outdoors. */
export function yardPieces(state: GameState): YardPiece[] {
  const s = stallPos(state);
  return [{ id: STALL_ID, kind: 'stall', x: s.x, y: s.y, rot: state.stall.rot ?? 0 }, ...state.decor.map((d) => ({ id: d.id, kind: d.decorId, x: d.x, y: d.y, rot: d.rot ?? 0, size: d.w && d.h ? { w: d.w, h: d.h } : undefined }))];
}

export function findYardPiece(state: GameState, id: string): YardPiece | undefined {
  return yardPieces(state).find((p) => p.id === id);
}

/** The ground a piece stands on (for grabbing and outlines), turned `rot` quarter-turns. */
export function yardFootprint(kind: YardPiece['kind'], x: number, y: number, rot = 0, size?: { w: number; h: number }): Rect {
  if (kind === 'stall') return { x, y, w: MARKET_STALL.w, h: MARKET_STALL.h };
  // A pond is as big as it was dug.
  const turned = swapsFootprint(decorTurn(kind), rot);
  const { w, h } = size ? (turned ? { w: size.h, h: size.w } : size) : decorSize(kind, rot);
  const centred = DECOR_DEFS[kind].anchor === 'centre';
  return { x: x - w / 2, y: centred ? y - h / 2 : y - h * 0.6, w, h };
}

/** Whether a tile is open ground a garden piece could stand on. */
export type OpenGround = (tx: number, ty: number) => boolean;

/** Fallback open-ground test from the landscape alone: no tree, bush or rock, nothing built, no wild patch. */
export function worldOpenGround(world: LandscapeWorld): OpenGround {
  return (tx, ty) => {
    const o = world.obstacleAt(tx, ty);
    if (o === 'tree' || o === 'bush' || o === 'rock') return false;
    return !world.isBuiltOrWater(tx, ty) && !world.isSpot(tx, ty);
  };
}

/** Whether a piece of decor could stand at (x, y); null means yes. */
export function decorBlockReason(state: GameState, open: OpenGround, x: number, y: number, ignoreId?: string): Exclude<YardBlock, 'none-left'> | null {
  if (!open(Math.floor(x), Math.floor(y))) return 'ground';
  if (!decorFits(state, x, y, ignoreId)) return 'occupied';
  return null;
}

/** Whether the stall could stand with its top-left on tile (x, y); null means yes. */
export function stallBlockReason(state: GameState, open: OpenGround, x: number, y: number, avoid: { x: number; y: number }[] = []): Exclude<YardBlock, 'none-left'> | null {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return 'ground';
  const here = stallRect(state);
  const next: Rect = { x, y, w: MARKET_STALL.w, h: MARKET_STALL.h };
  for (let ty = y; ty < y + next.h; ty++) {
    for (let tx = x; tx < x + next.w; tx++) {
      // Its own tiles count as built while it stands there; they're fine to move onto.
      if (rectContains(here, tx, ty)) continue;
      if (!open(tx, ty)) return 'ground';
    }
  }
  // Someone has to be able to walk up to the counter.
  let front = false;
  for (let tx = x; tx < x + next.w; tx++) if (rectContains(here, tx, y + next.h) || open(tx, y + next.h)) front = true;
  if (!front) return 'ground';
  const inside = (px: number, py: number, m: number) => px >= x - m && px < x + next.w + m && py >= y - m && py < y + next.h + m;
  if (state.decor.some((d) => inside(d.x, d.y, 0.3))) return 'occupied';
  for (const p of Object.values(state.plants)) {
    if (p.location.kind === 'wild' && inside(p.location.x, p.location.y, 0.15)) return 'occupied';
  }
  for (const a of avoid) if (inside(a.x, a.y, 0.2)) return 'occupied';
  return null;
}

/** Whether a piece could go to (x, y); null means yes. */
export function yardBlockReason(state: GameState, open: OpenGround, id: string, x: number, y: number, avoid: { x: number; y: number }[] = []): Exclude<YardBlock, 'none-left'> | null {
  if (id === STALL_ID) return stallBlockReason(state, open, x, y, avoid);
  return decorBlockReason(state, open, x, y, id);
}

/** Moves a piece to (x, y), if it fits there. */
export function moveYardPiece(state: GameState, open: OpenGround, id: string, x: number, y: number, avoid: { x: number; y: number }[] = []): boolean {
  if (yardBlockReason(state, open, id, x, y, avoid)) return false;
  if (id === STALL_ID) {
    state.stall = { ...state.stall, x, y };
    return true;
  }
  return moveDecor(state, id, x, y);
}

/** Sets a piece of stocked decor down at (x, y), turned `rot` quarter-turns. */
export function placeYardDecor(state: GameState, open: OpenGround, decorId: DecorId, x: number, y: number, rot = 0): string | null {
  if ((state.decorStock[decorId] ?? 0) <= 0) return null;
  if (decorBlockReason(state, open, x, y)) return null;
  return placeDecor(state, decorId, x, y, rot)?.id ?? null;
}

/** Stall positions snap to whole tiles; decor to an eighth of a tile. */
export function snapYard(id: string | 'stall', x: number, y: number): { x: number; y: number } {
  if (id === STALL_ID) return { x: Math.round(x), y: Math.round(y) };
  return { x: Math.round(x * 8) / 8, y: Math.round(y * 8) / 8 };
}
