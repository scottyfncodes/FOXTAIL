import type { BasketItem, GameState } from '../state';
import { makeUid } from '../state';
import { TRUCK_BED_CAP } from './truck';

export function basketCapacity(state: GameState): number {
  if (state.owned.includes('basketLarge')) return 16;
  if (state.owned.includes('basketMedium')) return 10;
  return 6;
}

/** Driving, anything that won't fit in the basket rides in the back of the truck. */
function bedHasRoom(state: GameState): boolean {
  return !!state.truck && !!state.player.riding && state.truck.bed.length < TRUCK_BED_CAP;
}

export function basketFull(state: GameState): boolean {
  return state.basket.length >= basketCapacity(state) && !bedHasRoom(state);
}

export function addToBasket(state: GameState, item: Omit<BasketItem, 'uid'>): BasketItem | null {
  if (basketFull(state)) return null;
  const full: BasketItem = { uid: makeUid('item'), ...item };
  if (state.basket.length < basketCapacity(state)) state.basket.push(full);
  else state.truck!.bed.push(full);
  return full;
}

/** Whether a carried item is riding in the truck rather than in the basket. */
export function inTruck(state: GameState, uid: string): boolean {
  return !!state.truck?.bed.some((i) => i.uid === uid);
}

/** Takes an item out of the basket — or out of the truck bed, if that's where it is. */
export function takeFromBasket(state: GameState, uid: string): BasketItem | null {
  const idx = state.basket.findIndex((i) => i.uid === uid);
  if (idx !== -1) return state.basket.splice(idx, 1)[0];
  const t = state.truck;
  if (!t) return null;
  const bi = t.bed.findIndex((i) => i.uid === uid);
  if (bi === -1) return null;
  return t.bed.splice(bi, 1)[0];
}
