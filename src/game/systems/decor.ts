import type { GameState, PlacedDecor } from '../state';
import { makeUid } from '../state';
import type { DecorId } from '../data/shop';
import { decorTurn } from '../data/decor';
import { nextRot, normalRot } from '../data/turn';
import { POND_DEFAULT } from '../data/shop';
import { occupantOf } from './propagation';

/**
 * Decor that holds a potted plant, the way a stand or the wall trellis does
 * indoors: the garden trellis. Its plant lives on display (slotId = the
 * trellis's id) and travels with it when it's moved.
 */
export function isGardenPlanter(decorId: DecorId): boolean {
  return decorId === 'gardenTrellis';
}

/** The garden planter with this id, if it is one. */
export function gardenPlanter(state: Pick<GameState, 'decor'>, id: string): PlacedDecor | undefined {
  return state.decor.find((d) => d.id === id && isGardenPlanter(d.decorId));
}

/** Puts a piece of stocked garden decor down at (x, y), turned `rot` quarter-turns if it can be. */
export function placeDecor(state: GameState, decorId: DecorId, x: number, y: number, rot = 0): PlacedDecor | null {
  if ((state.decorStock[decorId] ?? 0) <= 0) return null;
  if (state.decor.some((d) => Math.hypot(d.x - x, d.y - y) < 0.7)) return null;
  state.decorStock[decorId] = (state.decorStock[decorId] ?? 0) - 1;
  const placed: PlacedDecor = { id: makeUid('decor'), decorId, x, y };
  const turn = normalRot(decorTurn(decorId), rot);
  if (turn) placed.rot = turn;
  if (decorId === 'gardenPond') {
    // Dug to the size it was bought at (the original size for one bought before ponds came in sizes).
    const size = nextPondSize(state);
    if (state.pondStock.length) state.pondStock.shift();
    placed.w = size.w;
    placed.h = size.h;
  }
  state.decor.push(placed);
  return placed;
}

export function nearestDecor(state: GameState, x: number, y: number, range: number): PlacedDecor | null {
  let best: PlacedDecor | null = null;
  let bestD = range;
  for (const d of state.decor) {
    const dist = Math.hypot(d.x - x, d.y - y);
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return best;
}

/** Room for a piece at (x, y): not on top of another piece (ignoring the one being moved). */
export function decorFits(state: GameState, x: number, y: number, ignoreId?: string): boolean {
  return !state.decor.some((d) => d.id !== ignoreId && Math.hypot(d.x - x, d.y - y) < 0.7);
}

/** Moves a placed piece straight to (x, y), if there's room for it there. */
export function moveDecor(state: GameState, id: string, x: number, y: number): boolean {
  const piece = state.decor.find((d) => d.id === id);
  if (!piece || !decorFits(state, x, y, id)) return false;
  piece.x = x;
  piece.y = y;
  return true;
}

/** Turns a piece in place: a quarter-turn for pieces with a long side, round to face the other way for standing ones. Decor keeps clear of other decor by distance, so a turn always fits. */
export function rotateDecor(state: GameState, id: string): boolean {
  const piece = state.decor.find((d) => d.id === id);
  if (!piece) return false;
  const rot = nextRot(decorTurn(piece.decorId), piece.rot ?? 0);
  if (rot) piece.rot = rot;
  else delete piece.rot;
  return true;
}

/** Picks a placed piece back up into stock, to move it somewhere else. A planter with a plant in it stays. */
export function pickUpDecor(state: GameState, id: string): boolean {
  const idx = state.decor.findIndex((d) => d.id === id);
  if (idx === -1 || occupantOf(state, { slotId: id })) return false;
  const [d] = state.decor.splice(idx, 1);
  state.decorStock[d.decorId] = (state.decorStock[d.decorId] ?? 0) + 1;
  // A pond keeps its size in stock; its koi go back in their bags.
  if (d.decorId === 'gardenPond') state.pondStock.unshift({ w: d.w ?? POND_DEFAULT.w, h: d.h ?? POND_DEFAULT.h });
  return true;
}

/** The size the next pond set down will be dug at. */
export function nextPondSize(state: Pick<GameState, 'pondStock'>): { w: number; h: number } {
  return state.pondStock[0] ? { ...state.pondStock[0] } : { ...POND_DEFAULT };
}
