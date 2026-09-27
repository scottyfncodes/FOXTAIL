import { describe, it, expect } from 'vitest';
import { createNewGame, type GameState } from '../src/game/state';
import { addToBasket, basketFull, basketCapacity, takeFromBasket } from '../src/game/systems/basket';
import { buyItem, sellItem } from '../src/game/systems/market';
import { potInNursery } from '../src/game/systems/propagation';
import { deliverTruck, boardTruck, parkTruck, truckNear, reachable, loadTruck, unloadTruck, takeOut, putIn, truckCovers, TRUCK_BED_CAP, TRUCK_PARK } from '../src/game/systems/truck';
import { GREENHOUSE_DOOR } from '../src/game/data/worldMap';
import { migrateSave } from '../src/game/engine/SaveManager';
import { STAGE_AT } from '../src/game/systems/growth';

const cutting = (i: number) => ({ defId: 'pothos', variantId: 'golden', seed: i, growth: 0, generation: 0, origin: 'wild' as const, collectedAt: 0 });

function withTruck(): GameState {
  const state = createNewGame();
  state.coins = 5000;
  expect(buyItem(state, 'miniTruck')).toBe(true);
  deliverTruck(state, () => true);
  return state;
}

describe('the mini truck', () => {
  it('is bought at the stall and delivered to the lane by the house', () => {
    const state = withTruck();
    expect(state.owned).toContain('miniTruck');
    expect(state.truck).toMatchObject({ x: TRUCK_PARK.x, y: TRUCK_PARK.y, bed: [] });
    // Or the nearest open ground to it.
    const s2 = createNewGame();
    const t = deliverTruck(s2, (tx, ty) => ty > Math.floor(TRUCK_PARK.y) + 1);
    expect(t.y).toBeGreaterThan(TRUCK_PARK.y);
  });

  it('can be climbed into beside it and parked again with a step out', () => {
    const state = withTruck();
    state.player.x = state.truck!.x + 1;
    state.player.y = state.truck!.y;
    expect(boardTruck(state)).toBe(true);
    expect(state.player.riding).toBe(true);
    expect(state.player.x).toBe(state.truck!.x);
    // Drive somewhere.
    state.player.x = 50;
    state.player.y = 30;
    state.player.facing = 'up';
    expect(parkTruck(state, () => true)).toBe(true);
    expect(state.player.riding).toBe(false);
    expect(state.truck).toMatchObject({ x: 50, y: 30, facing: 'up' });
    expect(Math.hypot(state.player.x - 50, state.player.y - 30)).toBeGreaterThan(0.5);
    expect(truckCovers(state.truck!, state.player.x, state.player.y)).toBe(false);
    // Nowhere to step out: stays behind the wheel.
    boardTruck(state);
    expect(parkTruck(state, () => false)).toBe(false);
    expect(state.player.riding).toBe(true);
  });

  it('can’t be boarded from indoors, and the parked truck blocks the ground it stands on', () => {
    const state = withTruck();
    state.player.inGreenhouse = true;
    expect(boardTruck(state)).toBe(false);
    const t = state.truck!;
    expect(truckCovers(t, t.x, t.y - 0.2)).toBe(true);
    expect(truckCovers(t, t.x + 0.9, t.y - 0.2)).toBe(true);
    expect(truckCovers(t, t.x, t.y - 3)).toBe(false);
    expect(truckCovers({ ...t, facing: 'up' }, t.x + 0.9, t.y - 0.2)).toBe(false);
  });

  it('carries the overflow in the back while driving — and only then', () => {
    const state = withTruck();
    const cap = basketCapacity(state);
    for (let i = 0; i < cap; i++) addToBasket(state, cutting(i));
    expect(basketFull(state)).toBe(true);
    expect(addToBasket(state, cutting(99))).toBeNull();
    state.player.x = state.truck!.x;
    state.player.y = state.truck!.y;
    boardTruck(state);
    expect(basketFull(state)).toBe(false);
    for (let i = 0; i < TRUCK_BED_CAP; i++) expect(addToBasket(state, cutting(100 + i))).not.toBeNull();
    expect(state.basket).toHaveLength(cap);
    expect(state.truck!.bed).toHaveLength(TRUCK_BED_CAP);
    expect(basketFull(state)).toBe(true);
    expect(addToBasket(state, cutting(200))).toBeNull();
  });

  it('is within reach when driving, beside it, or indoors with it parked at the greenhouse door', () => {
    const state = withTruck();
    const t = state.truck!;
    state.player.x = t.x + 10;
    state.player.y = t.y;
    expect(truckNear(state)).toBe(false);
    state.player.x = t.x + 1.5;
    expect(truckNear(state)).toBe(true);
    state.player.inGreenhouse = true;
    expect(truckNear(state)).toBe(false);
    t.x = GREENHOUSE_DOOR.x + 0.5;
    t.y = GREENHOUSE_DOOR.y + 2.5;
    expect(truckNear(state)).toBe(true);
  });

  it('loads and unloads beside it, one at a time or all at once', () => {
    const state = withTruck();
    const t = state.truck!;
    state.player.x = t.x + 1;
    state.player.y = t.y;
    const cap = basketCapacity(state);
    for (let i = 0; i < 4; i++) addToBasket(state, cutting(i));
    expect(putIn(state, state.basket[0].uid)).not.toBeNull();
    expect(t.bed).toHaveLength(1);
    expect(loadTruck(state, cap)).toBe(3);
    expect(state.basket).toHaveLength(0);
    expect(reachable(state)).toHaveLength(4);
    expect(takeOut(state, t.bed[0].uid, cap)).not.toBeNull();
    expect(unloadTruck(state, cap)).toBe(3);
    expect(t.bed).toHaveLength(0);
    // Out of reach, nothing moves and the bed isn't listed.
    loadTruck(state, cap);
    state.player.x = t.x + 10;
    expect(reachable(state)).toHaveLength(0);
    expect(unloadTruck(state, cap)).toBe(0);
    expect(t.bed).toHaveLength(4);
  });

  it('sells and pots straight from the bed when the truck is in reach', () => {
    const state = withTruck();
    const t = state.truck!;
    state.player.x = t.x + 1;
    state.player.y = t.y;
    addToBasket(state, cutting(1));
    loadTruck(state, basketCapacity(state));
    const uid = t.bed[0].uid;
    const coins = state.coins;
    expect(sellItem(state, uid, 0)).toBeGreaterThan(0);
    expect(state.coins).toBeGreaterThan(coins);
    expect(t.bed).toHaveLength(0);
    addToBasket(state, { ...cutting(2), growth: STAGE_AT.young });
    loadTruck(state, basketCapacity(state));
    const uid2 = t.bed[0].uid;
    expect(potInNursery(state, uid2, 'bed1', 0)).not.toBeNull();
    expect(t.bed).toHaveLength(0);
    expect(takeFromBasket(state, 'nope')).toBeNull();
  });

  it('is kept across saves, and an older save simply has no truck', () => {
    const state = withTruck();
    state.truck!.bed.push({ uid: 'b', ...cutting(3) });
    state.player.riding = true;
    const loaded = migrateSave(JSON.parse(JSON.stringify(state)))!;
    expect(loaded.truck).toEqual(state.truck);
    expect(loaded.player.riding).toBe(true);
    const old = createNewGame() as unknown as Record<string, unknown>;
    delete old.truck;
    old.version = 10;
    const migrated = migrateSave(old)!;
    expect(migrated.truck).toBeNull();
    expect(migrated.player.riding).toBe(false);
  });
});
