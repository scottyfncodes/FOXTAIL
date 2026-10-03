import { describe, it, expect, beforeEach } from 'vitest';
import { createNewGame, SAVE_VERSION } from '../src/game/state';
import { SHOP_ITEMS, PURPOSE_INFO, findShopItem } from '../src/game/data/shop';
import { buyItem, buyBlockReason, itemPrice, isShopItemNew, markShopSeen, priceOf, stallBonus, glutFactor, RARITY_PRICE, STAGE_PRICE_MULT, DEMAND_BONUS, GLUT_STEP, GLUT_FLOOR, GLUT_STEP_RARE, GLUT_FLOOR_RARE } from '../src/game/systems/market';
import { migrateSave, saveGame, loadGame } from '../src/game/engine/SaveManager';
import { nurserySpots } from '../src/game/systems/furniture';
import { STAGE_AT } from '../src/game/systems/growth';

const greenhouse = SHOP_ITEMS.filter((s) => s.category === 'greenhouse');

describe('market organisation', () => {
  it('keeps the five market categories', () => {
    expect([...new Set(SHOP_ITEMS.map((s) => s.category))].sort()).toEqual(['equipment', 'garden', 'greenhouse', 'pots', 'stall']);
  });

  it('gives every greenhouse item exactly one valid purpose and role, and nothing else gets one', () => {
    for (const item of greenhouse) {
      expect(Object.keys(PURPOSE_INFO), item.id).toContain(item.purpose);
      expect(['foundation', 'expansion', 'decoration'], item.id).toContain(item.role);
      expect(item.blurb, item.id).toBeTruthy();
    }
    for (const item of SHOP_ITEMS.filter((s) => s.category !== 'greenhouse')) expect(item.purpose, item.id).toBeUndefined();
  });

  it('classes growing capacity as production', () => {
    for (const id of ['doubleNurseryBed', 'growLights', 'growLamp']) expect(findShopItem(id)!.purpose, id).toBe('production');
  });

  it('classes stands, shelves, hooks and decor as display, and the sun room as space', () => {
    for (const id of ['hangingHooks', 'ceilingHook', 'plantShelf', 'tieredStand', 'plantStand', 'ironPedestal', 'wallTrellis', 'pottingTable', 'floorPlanter', 'wateringCan', 'houseRug']) {
      expect(findShopItem(id)!.purpose, id).toBe('display');
    }
    expect(findShopItem('sunRoom')!.purpose).toBe('space');
  });

  it('keeps the hook rail and the single ceiling hook clearly distinct', () => {
    expect(findShopItem('hangingHooks')!.name).toBe('Hanging Hook Rail');
    expect(findShopItem('ceilingHook')!.name).toBe('Ceiling Hook');
  });

  it('no longer sells propagation trays', () => {
    expect(findShopItem('propagationTray')).toBeUndefined();
  });
});

describe('prices and formulas are unchanged', () => {
  it('keeps every fixed shop price', () => {
    const expected: Record<string, number> = {
      hangingHooks: 90, plantShelf: 120, tieredStand: 240, growLights: 360, plantStand: 45, ironPedestal: 80, ceilingHook: 40,
      wallTrellis: 95, pottingTable: 85, floorPlanter: 110, growLamp: 150, wateringCan: 15, houseRug: 40, sunRoom: 700, pottingAnnex: 3500, orangery: 6000, roofLights: 9000,
      potGlazed: 25, potSpeckled: 35, potBasket: 40, potCopper: 70, potPorcelain: 140, potGilded: 900, potMidnight: 2400, weathervane: 1200, pergola: 1800, gardenPond: 3000,
      raisedBed: 90, steppingStones: 6, picketFence: 12, gardenLantern: 30, birdbath: 45, gardenBench: 60, gardenTrellis: 55,
      koi: 120,
      basketMedium: 80, basketLarge: 340, rootingKit: 260, miniTruck: 2800, stallAwning: 120, stallCrates: 260,
    };
    const state = createNewGame();
    for (const [id, price] of Object.entries(expected)) expect(itemPrice(state, id), id).toBe(price);
  });

  it('keeps the plant-selling formula constants', () => {
    expect(RARITY_PRICE).toEqual({ common: 18, uncommon: 40, rare: 100, veryRare: 260, extremelyRare: 700, unheardOf: 1600, mythic: 0 });
    expect(STAGE_PRICE_MULT).toEqual([0.3, 0.6, 1.1, 2.0, 3.2]);
    expect(DEMAND_BONUS).toBe(1.5);
    expect(GLUT_STEP).toBe(0.85);
    expect(GLUT_FLOOR).toBe(0.4);
    expect(GLUT_STEP_RARE).toBe(0.7);
    expect(GLUT_FLOOR_RARE).toBe(0.25);
    const state = createNewGame();
    expect(stallBonus(state)).toBe(1);
    expect(glutFactor(state, 'pothos')).toBe(1);
    state.clock.totalMinutes = 0;
    const p = priceOf(state, { defId: 'monstera', variantId: 'albo', growth: STAGE_AT.large });
    expect(p).toBeGreaterThan(0);
  });
});

describe('nursery beds', () => {
  it('are sold only in pairs: one unlimited double bed, no single bed and no one-off two-bed upgrades', () => {
    const beds = SHOP_ITEMS.filter((s) => (s.stock ?? s.id).toLowerCase().includes('nurserybed'));
    expect(beds.map((b) => b.id)).toEqual(['doubleNurseryBed']);
    expect(findShopItem('nurseryBed')).toBeUndefined();
    expect(findShopItem('nurseryBeds')).toBeUndefined();
    expect(findShopItem('moreNurseryBeds')).toBeUndefined();
    expect(findShopItem('doubleNurseryBed')!.repeatable).toBe(true);
  });

  it('can be bought without limit, two planting spaces at a time, each pair costing what two single beds did', () => {
    const state = createNewGame();
    state.coins = 100_000;
    const prices: number[] = [];
    for (let i = 0; i < 3; i++) {
      prices.push(itemPrice(state, 'doubleNurseryBed'));
      expect(buyItem(state, 'doubleNurseryBed')).toBe(true);
    }
    // The old singles were 45, 68, 101, 152, 228, 342: each pair is two of them in turn.
    expect(prices).toEqual([113, 253, 570]);
    expect(state.furnitureStock.nurseryBed).toBe(6);
    expect(state.purchases.nurseryBed).toBe(6);
    expect(buyBlockReason(state, 'doubleNurseryBed')).toBeNull();
  });

  it('prices on from singles bought before, and refuses when it cannot be afforded', () => {
    const state = createNewGame();
    state.purchases.nurseryBed = 3;
    state.coins = 379;
    expect(buyBlockReason(state, 'doubleNurseryBed')).toBe('coins');
    state.coins = 380;
    expect(buyItem(state, 'doubleNurseryBed')).toBe(true);
    expect(state.coins).toBe(0);
    expect(state.furnitureStock.nurseryBed).toBe(2);
  });
});

describe('purchase and unlock behaviour', () => {
  it('one-off items become owned once; repeatable ones can be bought again', () => {
    const state = createNewGame();
    state.coins = 10_000;
    // The shelf comes after the hook rail.
    expect(buyItem(state, 'plantShelf')).toBe(false);
    expect(buyItem(state, 'hangingHooks')).toBe(true);
    expect(buyItem(state, 'plantShelf')).toBe(true);
    expect(buyBlockReason(state, 'plantShelf')).toBe('owned');
    expect(buyItem(state, 'plantShelf')).toBe(false);
    expect(buyItem(state, 'plantStand')).toBe(true);
    expect(buyItem(state, 'plantStand')).toBe(true);
    expect(state.furnitureStock.plantStand).toBe(2);
    expect(buyItem(state, 'doubleNurseryBed')).toBe(true);
    expect(state.furnitureStock.nurseryBed).toBe(2);
    expect(nurserySpots(state).length).toBe(4);
  });

  it('keeps the existing prerequisite chains', () => {
    const state = createNewGame();
    state.coins = 10_000;
    expect(buyBlockReason(state, 'stallCrates')).toBe('locked');
    buyItem(state, 'stallAwning');
    expect(buyBlockReason(state, 'stallCrates')).toBeNull();
  });
});

describe('NEW tags', () => {
  beforeEach(() => localStorage.clear());

  it('a fresh game shows nothing as NEW until something unlocks', () => {
    const state = createNewGame();
    expect(SHOP_ITEMS.filter((s) => isShopItemNew(state, s.id))).toEqual([]);
    state.coins = 1000;
    buyItem(state, 'basketMedium');
    expect(isShopItemNew(state, 'basketLarge')).toBe(true);
    markShopSeen(state, ['basketLarge']);
    expect(isShopItemNew(state, 'basketLarge')).toBe(false);
  });

  it('locked items are never NEW', () => {
    const state = createNewGame();
    state.seenShop = [];
    expect(isShopItemNew(state, 'stallCrates')).toBe(false);
    expect(isShopItemNew(state, 'stallAwning')).toBe(true);
  });

  it('persists what has been seen across save and load', () => {
    const state = createNewGame();
    state.coins = 1000;
    buyItem(state, 'stallAwning');
    expect(isShopItemNew(state, 'stallCrates')).toBe(true);
    markShopSeen(state, ['stallCrates']);
    saveGame(state);
    const loaded = loadGame()!;
    expect(isShopItemNew(loaded, 'stallCrates')).toBe(false);
  });
});

describe('older saves', () => {
  function v6Save() {
    const s = createNewGame() as unknown as Record<string, unknown>;
    delete s.purchases;
    delete s.seenShop;
    s.version = 6;
    return s;
  }

  it('load without the new fields, with only genuinely new items marked NEW', () => {
    const raw = v6Save();
    raw.owned = ['basketMedium'];
    const state = migrateSave(JSON.parse(JSON.stringify(raw)))!;
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.purchases).toEqual({});
    expect(isShopItemNew(state, 'doubleNurseryBed')).toBe(true);
    expect(isShopItemNew(state, 'plantStand')).toBe(false);
    expect(isShopItemNew(state, 'basketLarge')).toBe(false);
    expect(isShopItemNew(state, 'stallCrates')).toBe(false);
  });

  it('turn propagation trays into nursery beds, keeping their plants and pricing the next bed on from them', () => {
    const raw = v6Save();
    raw.furniture = [{ id: 'furniture-t1', kind: 'propagationTray', x: 12, y: 9 }];
    raw.furnitureStock = { propagationTray: 2, plantStand: 1 };
    raw.plants = {
      p: { id: 'p', defId: 'pothos', variantId: 'golden', seed: 1, growth: 5, location: { kind: 'nursery', bedId: 'furniture-t1' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false },
    };
    const state = migrateSave(JSON.parse(JSON.stringify(raw)))!;
    expect(state.furniture).toEqual([{ id: 'furniture-t1', kind: 'nurseryBed', x: 12, y: 9 }]);
    expect(state.furnitureStock).toEqual({ nurseryBed: 2, plantStand: 1 });
    expect(state.plants.p.location).toEqual({ kind: 'nursery', bedId: 'furniture-t1' });
    expect(nurserySpots(state).some((b) => b.id === 'furniture-t1')).toBe(true);
    expect(itemPrice(state, 'doubleNurseryBed')).toBe(380);
  });

  it('a current save round-trips its purchases', () => {
    const state = createNewGame();
    state.purchases.nurseryBed = 2;
    const again = migrateSave(JSON.parse(JSON.stringify(state)))!;
    expect(again.purchases.nurseryBed).toBe(2);
    expect(again.seenShop).toEqual(state.seenShop);
  });
});

describe('the market, one step at a time', () => {
  it('starts with only the first of each line on offer', async () => {
    const { shopItemVisible } = await import('../src/game/systems/market');
    const { SHOP_ITEMS } = await import('../src/game/data/shop');
    const state = createNewGame();
    const visible = SHOP_ITEMS.filter((i) => shopItemVisible(state, i.id)).map((i) => i.id);
    expect(visible).toContain('potGlazed');
    expect(visible).not.toContain('potSpeckled');
    expect(visible).toContain('gardenLantern');
    expect(visible).not.toContain('koi');
    // Well under half the market shows at first.
    expect(visible.length).toBeLessThan(SHOP_ITEMS.length / 2);
  });

  it('keeps what an older save had already opened up: a stand placed or a lantern in stock counts as bought', async () => {
    const { shopItemVisible, hasBought } = await import('../src/game/systems/market');
    const state = createNewGame();
    state.bought = [];
    state.furniture.push({ id: 'furniture-old-1', kind: 'plantStand', x: 12, y: 8 });
    state.decorStock.gardenLantern = 1;
    expect(hasBought(state, 'plantStand')).toBe(true);
    expect(shopItemVisible(state, 'ironPedestal')).toBe(true);
    expect(shopItemVisible(state, 'birdbath')).toBe(true);
    // The greenhouse's own built-in stands don't count: they weren't bought.
    expect(hasBought(createNewGame(), 'plantStand')).toBe(false);
  });
});
