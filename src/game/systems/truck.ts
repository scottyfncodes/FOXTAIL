import type { BasketItem, Facing, GameState, TruckState } from '../state';
import { BUILDING_DOORS } from '../data/interior';
import { GREENHOUSE_FOOTPRINT, HOUSE_FOOTPRINT, type Rect } from '../data/worldMap';

/**
 * The mini truck: bought at the stall, parked by the house. Drive it
 * anywhere the ground is open — twice walking pace, and thickets don't
 * slow it — and carry a dozen more plants in the back. Anything gathered
 * while driving rides in the bed once the basket is full, and the bed is
 * within reach whenever you're driving, standing beside the truck, or
 * indoors with it parked at the greenhouse door.
 */
export const TRUCK_BED_CAP = 12;
/** Driving speed as a multiple of walking. */
export const TRUCK_SPEED = 2.0;
/** How close you stand to the truck for its bed to be within reach, in tiles. */
export const TRUCK_REACH = 2.2;
/** How far from a greenhouse door the truck can be parked and still count as "at the greenhouse". */
export const TRUCK_DOOR_REACH = 3.5;
/** Where the truck is delivered: the lane beside the house. */
export const TRUCK_PARK = { x: 69.5, y: 45.5 };

export function hasTruck(state: GameState): boolean {
  return !!state.truck;
}

export function riding(state: GameState): boolean {
  return !!state.truck && !!state.player.riding;
}

/** Scott's borrowed it and is out for a drive. */
export function scottDriving(state: Pick<GameState, 'scott'>): boolean {
  return state.scott.activity === 'driving';
}

/** Whether the truck's bed is within reach right now. */
export function truckNear(state: GameState): boolean {
  const t = state.truck;
  if (!t || scottDriving(state)) return false;
  if (state.player.riding) return true;
  if (state.player.inGreenhouse) return BUILDING_DOORS.some((d) => Math.hypot(t.x - (d.outside.x + 0.5), t.y - (d.outside.y + 0.5)) <= TRUCK_DOOR_REACH);
  return Math.hypot(t.x - state.player.x, t.y - state.player.y) <= TRUCK_REACH;
}

export function bedFull(state: GameState): boolean {
  return !state.truck || state.truck.bed.length >= TRUCK_BED_CAP;
}

/** Everything you can put your hands on: the basket, and the truck bed when it's within reach. */
export function reachable(state: GameState): BasketItem[] {
  return truckNear(state) ? [...state.basket, ...state.truck!.bed] : state.basket;
}

/** Finds a carried item by uid, in the basket or the truck bed. */
export function findCarried(state: GameState, uid: string): BasketItem | undefined {
  return state.basket.find((i) => i.uid === uid) ?? state.truck?.bed.find((i) => i.uid === uid);
}

/** Moves as much of the basket as fits into the bed. Returns how many went in. */
export function loadTruck(state: GameState, basketCap: number): number {
  const t = state.truck;
  if (!t || !truckNear(state)) return 0;
  let n = 0;
  while (state.basket.length && t.bed.length < TRUCK_BED_CAP) {
    t.bed.push(state.basket.shift()!);
    n++;
  }
  void basketCap;
  return n;
}

/** Moves as much of the bed as fits into the basket. Returns how many came out. */
export function unloadTruck(state: GameState, basketCap: number): number {
  const t = state.truck;
  if (!t || !truckNear(state)) return 0;
  let n = 0;
  while (t.bed.length && state.basket.length < basketCap) {
    state.basket.push(t.bed.shift()!);
    n++;
  }
  return n;
}

/** Takes one item out of the bed into the basket, if there's room. */
export function takeOut(state: GameState, uid: string, basketCap: number): BasketItem | null {
  const t = state.truck;
  if (!t || !truckNear(state) || state.basket.length >= basketCap) return null;
  const i = t.bed.findIndex((b) => b.uid === uid);
  if (i === -1) return null;
  const item = t.bed.splice(i, 1)[0];
  state.basket.push(item);
  return item;
}

/** Puts one basket item into the bed, if there's room. */
export function putIn(state: GameState, uid: string): BasketItem | null {
  const t = state.truck;
  if (!t || !truckNear(state) || t.bed.length >= TRUCK_BED_CAP) return null;
  const i = state.basket.findIndex((b) => b.uid === uid);
  if (i === -1) return null;
  const item = state.basket.splice(i, 1)[0];
  t.bed.push(item);
  return item;
}

/** The ground the parked truck stands on, so nobody walks through it. */
export function truckCovers(t: Pick<TruckState, 'x' | 'y' | 'facing'>, x: number, y: number): boolean {
  const side = t.facing === 'left' || t.facing === 'right';
  const hw = side ? 1.05 : 0.6;
  const top = side ? 0.55 : 0.95;
  return x >= t.x - hw && x <= t.x + hw && y >= t.y - top && y <= t.y + 0.15;
}

/** The ground the truck's body covers as drawn — long side-on, and rising up the screen from its wheels. */
export function truckFootprint(x: number, y: number, facing: Facing): Rect {
  const side = facing === 'left' || facing === 'right';
  return side ? { x: x - 1.1, y: y - 1.1, w: 2.2, h: 1.3 } : { x: x - 0.65, y: y - 1.2, w: 1.3, h: 1.4 };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Whether the truck here would be up over the greenhouse, the house, or anything else in `extra` (the stall). */
export function truckHitsBuilding(x: number, y: number, facing: Facing, extra: Rect[] = []): boolean {
  const fp = truckFootprint(x, y, facing);
  return [GREENHOUSE_FOOTPRINT, HOUSE_FOOTPRINT, ...extra].some((r) => overlaps(fp, r));
}

/** Delivers the truck to the lane by the house, or the nearest open ground to it. */
export function deliverTruck(state: GameState, open: (tx: number, ty: number) => boolean): TruckState {
  let best = { x: TRUCK_PARK.x, y: TRUCK_PARK.y };
  outer: for (let r = 0; r < 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = Math.floor(TRUCK_PARK.x) + dx;
        const ty = Math.floor(TRUCK_PARK.y) + dy;
        if (open(tx, ty) && open(tx + 1, ty) && open(tx - 1, ty)) {
          best = { x: tx + 0.5, y: ty + 0.5 };
          break outer;
        }
      }
    }
  }
  const truck: TruckState = { x: best.x, y: best.y, facing: 'right', bed: [] };
  state.truck = truck;
  return truck;
}

/** Climbs in: the truck goes where she goes from here. */
export function boardTruck(state: GameState): boolean {
  const t = state.truck;
  if (!t || state.player.riding || state.player.inGreenhouse || scottDriving(state)) return false;
  state.player.x = t.x;
  state.player.y = t.y;
  state.player.facing = t.facing;
  state.player.riding = true;
  return true;
}

/** Parks where she stopped and steps out beside it, if there's room to. */
export function parkTruck(state: GameState, canStand: (x: number, y: number) => boolean): boolean {
  const t = state.truck;
  if (!t || !state.player.riding) return false;
  const p = state.player;
  const parked = { x: p.x, y: p.y, facing: p.facing };
  const spots: [number, number][] = [
    [p.x, p.y + 1.0],
    [p.x - 1.5, p.y],
    [p.x + 1.5, p.y],
    [p.x, p.y - 1.4],
    [p.x - 1.5, p.y + 1.0],
    [p.x + 1.5, p.y + 1.0],
  ];
  const out = spots.find(([x, y]) => canStand(x, y) && !truckCovers(parked, x, y));
  if (!out) return false;
  t.x = parked.x;
  t.y = parked.y;
  t.facing = parked.facing;
  p.x = out[0];
  p.y = out[1];
  p.riding = false;
  return true;
}

export function truckFacing(f: Facing): Facing {
  return f;
}
