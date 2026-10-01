import { describe, it, expect } from 'vitest';
import { createNewGame } from '../src/game/state';
import { buyItem } from '../src/game/systems/market';
import { displaySlots, placeFurniture, placeBlockReason, pickUpFurniture } from '../src/game/systems/furniture';
import { indoorBlockingSet } from '../src/game/world/Collision';
import { GREENHOUSE_EXIT } from '../src/game/data/stations';
import { addToBasket } from '../src/game/systems/basket';
import { placeOnDisplay } from '../src/game/systems/propagation';

describe('greenhouse furniture', () => {
  it('is bought by the piece into stock, not as a one-off upgrade', () => {
    const state = createNewGame();
    state.coins = 1000;
    expect(buyItem(state, 'plantStand')).toBe(true);
    expect(buyItem(state, 'plantStand')).toBe(true);
    expect(state.furnitureStock.plantStand).toBe(2);
    expect(state.owned).not.toContain('plantStand');
  });

  it('each placed piece is a new display spot, and floor pieces block walking while hooks do not', () => {
    const state = createNewGame();
    state.furnitureStock = { wallTrellis: 1, ceilingHook: 1 };
    const before = displaySlots(state).length;
    const trellis = placeFurniture(state, 'wallTrellis', 3, 1)!;
    const hook = placeFurniture(state, 'ceilingHook', 8, 8)!;
    expect(displaySlots(state)).toHaveLength(before + 2);
    expect(displaySlots(state).find((s) => s.id === trellis.id)?.kind).toBe('trellis');
    const solid = indoorBlockingSet(state);
    expect(solid.has('3,1')).toBe(true);
    expect(solid.has(`${hook.x},${hook.y}`)).toBe(false);
  });

  it('refuses walls, the doorway, and tiles already taken', () => {
    const state = createNewGame();
    state.furnitureStock = { plantStand: 3, ceilingHook: 2 };
    expect(placeBlockReason(state, 'plantStand', 0, 5)).toBe('wall');
    expect(placeBlockReason(state, 'plantStand', GREENHOUSE_EXIT.x, GREENHOUSE_EXIT.y - 1)).toBe('doorway');
    expect(placeBlockReason(state, 'plantStand', 2, 2)).toBe('occupied'); // a nursery bed
    placeFurniture(state, 'plantStand', 3, 6);
    expect(placeBlockReason(state, 'plantStand', 3, 6)).toBe('occupied');
    // A hook can hang above a stand, but not above another hook.
    expect(placeBlockReason(state, 'ceilingHook', 3, 6)).toBeNull();
    placeFurniture(state, 'ceilingHook', 3, 6);
    expect(placeBlockReason(state, 'ceilingHook', 3, 6)).toBe('occupied');
    state.furnitureStock = {};
    expect(placeBlockReason(state, 'plantStand', 5, 6)).toBe('none-left');
  });

  it('can be picked up and moved only while empty', () => {
    const state = createNewGame();
    state.furnitureStock = { plantStand: 1 };
    const stand = placeFurniture(state, 'plantStand', 3, 6)!;
    state.collection.pothos = { foundAt: 0, variants: ['golden'], grown: 99, propagated: 0, sold: 0, earned: 0, plantedOut: 0, displayed: 0 };
    const item = addToBasket(state, { defId: 'pothos', variantId: 'golden', seed: 1, growth: 2000, generation: 0, origin: 'wild', collectedAt: 0 })!;
    expect(placeOnDisplay(state, item.uid, stand.id, 'terracotta', 0)).not.toBeNull();
    expect(pickUpFurniture(state, stand.id)).toBe(false);
    const plant = Object.values(state.plants)[0];
    delete state.plants[plant.id];
    expect(pickUpFurniture(state, stand.id)).toBe(true);
    expect(state.furniture).toHaveLength(0);
    expect(state.furnitureStock.plantStand).toBe(1);
  });
});

describe('nursery bed upgrades', () => {
  it('beds already bought with the old two-bed upgrades stay, though the upgrades are no longer sold', async () => {
    const { nurserySpots, sitBlockReason } = await import('../src/game/systems/furniture');
    const state = createNewGame();
    state.coins = 1000;
    const base = nurserySpots(state).length;
    expect(buyItem(state, 'nurseryBeds')).toBe(false);
    expect(buyItem(state, 'moreNurseryBeds')).toBe(false);
    state.owned.push('nurseryBeds', 'moreNurseryBeds');
    const spots = nurserySpots(state);
    expect(spots).toHaveLength(base + 4);
    // The beds stand clear of everything else in the room.
    for (const id of ['bed5', 'bed6', 'bed7', 'bed8']) {
      const bed = spots.find((b) => b.id === id)!;
      expect(sitBlockReason(state, bed.kind, bed.x, bed.y, { ignoreId: id })).toBeNull();
    }
  });
});
