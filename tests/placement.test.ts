import { describe, it, expect } from 'vitest';
import { createNewGame, type GameState } from '../src/game/state';
import {
  allFurniture,
  builtInFurniture,
  displaySlots,
  findFurniture,
  footprint,
  moveFurniture,
  nurserySpots,
  pickUpFurniture,
  placeFurniture,
  rotateFurniture,
  sitBlockReason,
} from '../src/game/systems/furniture';
import { indoorSolids, isBlockedIndoor } from '../src/game/world/Collision';
import { growthMultiplier } from '../src/game/systems/growth';
import { buyItem } from '../src/game/systems/market';
import { PARTITION_X, PARTITION_DOOR_YS, FRONT_DOOR } from '../src/game/data/interior';

function potted(state: GameState, id: string, where: { slotId?: string; bedId?: string }) {
  state.plants[id] = {
    id,
    defId: 'pothos',
    variantId: 'golden',
    seed: 1,
    growth: 600,
    location: where.bedId ? { kind: 'nursery', bedId: where.bedId } : { kind: 'display', slotId: where.slotId!, potId: 'terracotta' },
    plantedAt: 0,
    lastCuttingAt: null,
    generation: 0,
    bornWild: false,
  };
}

describe('free placement indoors', () => {
  it('sets pieces down at exact fractional positions, not just on a grid', () => {
    const state = createNewGame();
    state.furnitureStock = { plantStand: 1 };
    const stand = placeFurniture(state, 'plantStand', 12.375, 8.625)!;
    expect(stand).not.toBeNull();
    expect([stand.x, stand.y]).toEqual([12.375, 8.625]);
    expect(displaySlots(state).find((s) => s.id === stand.id)).toMatchObject({ x: 12.375, y: 8.625 });
  });

  it('lets two small pieces sit closer than a tile apart, but never overlap', () => {
    const state = createNewGame();
    state.furnitureStock = { plantStand: 3 };
    placeFurniture(state, 'plantStand', 12, 8.8);
    expect(sitBlockReason(state, 'plantStand', 12.62, 8.8)).toBeNull();
    expect(sitBlockReason(state, 'plantStand', 12.3, 8.8)).toBe('occupied');
  });

  it('moves the greenhouse’s original fittings too — and whatever grows in them comes along', () => {
    const state = createNewGame();
    potted(state, 'p', { bedId: 'bed1' });
    expect(builtInFurniture(state).some((f) => f.id === 'bed1')).toBe(true);
    expect(moveFurniture(state, 'bed1', 6.25, 6.5)).toBe(true);
    // It's now an ordinary placed piece with the same id, so the plant is still in it.
    expect(state.seededFixtures).toContain('bed1');
    expect(builtInFurniture(state).some((f) => f.id === 'bed1')).toBe(false);
    expect(findFurniture(state, 'bed1')).toMatchObject({ x: 6.25, y: 6.5 });
    expect(state.plants.p.location).toEqual({ kind: 'nursery', bedId: 'bed1' });
    expect(nurserySpots(state).filter((n) => n.id === 'bed1')).toHaveLength(1);
  });

  it('won’t put anything in a wall, across the doorway between rooms, or blocking a door out', () => {
    const state = createNewGame();
    expect(sitBlockReason(state, 'plantStand', 0.2, 5)).toBe('wall');
    expect(sitBlockReason(state, 'plantStand', PARTITION_X, 3)).toBe('wall');
    expect(sitBlockReason(state, 'plantStand', PARTITION_X - 1, PARTITION_DOOR_YS[0])).toBe('doorway');
    expect(sitBlockReason(state, 'plantStand', FRONT_DOOR.x, FRONT_DOOR.y - 1)).toBe('doorway');
    // Not on the couch, not on Scott's putting mat.
    expect(sitBlockReason(state, 'plantStand', 21, 3.3)).toBe('occupied');
    expect(sitBlockReason(state, 'plantStand', 20.5, 8.1)).toBe('occupied');
    // But there's plenty of free floor in the living room for plants.
    expect(sitBlockReason(state, 'plantStand', 19, 5.6)).toBeNull();
  });

  it('never drops a piece on top of Ellen', () => {
    const state = createNewGame();
    expect(sitBlockReason(state, 'plantStand', 12, 8, { avoid: [{ x: 12.5, y: 8.6 }] })).toBe('occupied');
  });

  it('turns tables, trays and rugs a quarter-turn, swapping their footprint', () => {
    const state = createNewGame();
    state.furnitureStock = { pottingTable: 1, plantStand: 1 };
    const table = placeFurniture(state, 'pottingTable', 6, 6.5)!;
    const before = footprint('pottingTable', table.x, table.y, 0);
    expect(rotateFurniture(state, table.id)).toBe(true);
    const after = footprint('pottingTable', table.x, table.y, table.rot);
    expect(after.w).toBeCloseTo(before.h);
    expect(after.h).toBeCloseTo(before.w);
    // Stands are round: nothing to turn.
    const stand = placeFurniture(state, 'plantStand', 14, 9)!;
    expect(rotateFurniture(state, stand.id)).toBe(false);
  });

  it('puts an empty piece back in stock, but not one with a plant in it', () => {
    const state = createNewGame();
    potted(state, 'p', { slotId: 'stand1' });
    expect(pickUpFurniture(state, 'stand1')).toBe(false);
    expect(pickUpFurniture(state, 'stand2')).toBe(true);
    expect(state.furnitureStock.plantStand).toBe(1);
    expect(allFurniture(state).some((f) => f.id === 'stand2')).toBe(false);
  });

  it('blocks walking exactly where a piece stands, and hanging hooks never do', () => {
    const state = createNewGame();
    state.furnitureStock = { floorPlanter: 1, ceilingHook: 1 };
    const planter = placeFurniture(state, 'floorPlanter', 6.3, 6.2)!;
    const hook = placeFurniture(state, 'ceilingHook', 6.5, 8.5)!;
    const solids = indoorSolids(state);
    const fp = footprint('floorPlanter', planter.x, planter.y);
    expect(isBlockedIndoor(fp.x + fp.w / 2, fp.y + fp.h / 2, solids)).toBe(true);
    expect(isBlockedIndoor(fp.x - 0.1, fp.y + fp.h / 2, solids)).toBe(false);
    expect(isBlockedIndoor(hook.x + 0.5, hook.y + 0.5, solids)).toBe(false);
  });

  it('sells new kinds of furniture: nursery beds that root cuttings, tables, planters, lamps', () => {
    const state = createNewGame();
    state.coins = 10_000;
    for (const id of ['doubleNurseryBed', 'pottingTable', 'floorPlanter', 'growLamp', 'wateringCan', 'houseRug']) expect(buyItem(state, id)).toBe(true);
    const tray = placeFurniture(state, 'nurseryBed', 12, 9)!;
    expect(nurserySpots(state).some((n) => n.id === tray.id)).toBe(true);
    const planter = placeFurniture(state, 'floorPlanter', 14, 9)!;
    expect(displaySlots(state).find((s) => s.id === planter.id)?.kind).toBe('planter');
  });

  it('grows plants near a grow lamp a third faster', () => {
    const state = createNewGame();
    potted(state, 'near', { slotId: 'stand1' });
    potted(state, 'far', { slotId: 'stand6' });
    const base = growthMultiplier(state, state.plants.near);
    state.furnitureStock = { growLamp: 1 };
    placeFurniture(state, 'growLamp', 10, 4.4);
    expect(growthMultiplier(state, state.plants.near)).toBeCloseTo(base * 1.3);
    expect(growthMultiplier(state, state.plants.far)).toBeCloseTo(base);
  });
});
