import { describe, it, expect } from 'vitest';
import { createNewGame } from '../src/game/state';
import { priceOf, sellItem, buyItem, buyBlockReason, demandSpecies, GLUT_FLOOR } from '../src/game/systems/market';
import { addToBasket, basketCapacity } from '../src/game/systems/basket';
import { placeDecor, pickUpDecor } from '../src/game/systems/decor';
import { STAGE_AT } from '../src/game/systems/growth';
import { MINUTES_PER_DAY } from '../src/game/engine/Clock';

describe('Plant Stand & Supply', () => {
  it('pays more for rarer plants and for bigger ones', () => {
    const state = createNewGame();
    state.clock.totalMinutes = 0;
    const not = (id: string) => demandSpecies(state) !== id;
    const cutting = { defId: 'monstera', variantId: 'deliciosa', growth: 0 };
    const grown = { ...cutting, growth: STAGE_AT.large };
    const albo = { ...cutting, variantId: 'albo' };
    const thai = { ...cutting, variantId: 'thaiConstellation' };
    expect(priceOf(state, grown)).toBeGreaterThan(priceOf(state, cutting));
    expect(priceOf(state, albo)).toBeGreaterThan(priceOf(state, cutting) * 4);
    expect(priceOf(state, thai)).toBeGreaterThan(priceOf(state, albo));
    if (not('pothos') && not('monstera')) {
      expect(priceOf(state, { defId: 'pothos', variantId: 'golden', growth: 0 })).toBeLessThan(priceOf(state, cutting));
    }
  });

  it('selling pays out, removes the plant and keeps a record', () => {
    const state = createNewGame();
    const item = addToBasket(state, { defId: 'pothos', variantId: 'neon', seed: 1, growth: 0, generation: 0, origin: 'wild', collectedAt: 0 })!;
    const expected = priceOf(state, item);
    const before = state.coins;
    expect(sellItem(state, item.uid, 0)).toBe(expected);
    expect(state.coins).toBe(before + expected);
    expect(state.basket).toHaveLength(0);
    expect(state.collection.pothos.sold).toBe(1);
    expect(state.collection.pothos.earned).toBe(expected);
  });

  it('upgrades cost money, can only be bought once, and some unlock others', () => {
    const state = createNewGame();
    state.coins = 0;
    expect(buyBlockReason(state, 'basketMedium')).toBe('coins');
    state.coins = 1000;
    expect(buyBlockReason(state, 'basketLarge')).toBe('locked');
    expect(buyItem(state, 'basketMedium')).toBe(true);
    expect(basketCapacity(state)).toBe(10);
    expect(buyBlockReason(state, 'basketMedium')).toBe('owned');
    expect(buyItem(state, 'basketLarge')).toBe(true);
    expect(basketCapacity(state)).toBe(16);
  });

  it('the stall awning raises every price', () => {
    const state = createNewGame();
    const item = { defId: 'monstera', variantId: 'albo', growth: STAGE_AT.large };
    const before = priceOf(state, item);
    state.coins = 1000;
    buyItem(state, 'stallAwning');
    expect(priceOf(state, item)).toBeGreaterThan(before);
  });

  it('garden decor is bought by the piece, placed, and can be picked up again', () => {
    const state = createNewGame();
    state.coins = 1000;
    state.bought.push('gardenLantern', 'birdbath');
    buyItem(state, 'gardenBench');
    buyItem(state, 'gardenBench');
    expect(state.decorStock.gardenBench).toBe(2);
    const d = placeDecor(state, 'gardenBench', 60, 30)!;
    expect(state.decor).toHaveLength(1);
    expect(placeDecor(state, 'gardenBench', 60.2, 30)).toBeNull(); // too close
    expect(pickUpDecor(state, d.id)).toBe(true);
    expect(state.decorStock.gardenBench).toBe(2);
  });

  it('selling the same species over and over in one day pays less each time, and recovers overnight', () => {
    const state = createNewGame();
    const sellOne = () => {
      const item = addToBasket(state, { defId: 'pothos', variantId: 'golden', seed: 1, growth: STAGE_AT.large, generation: 0, origin: 'cutting', collectedAt: 0 })!;
      return sellItem(state, item.uid, 0)!;
    };
    const first = sellOne();
    const second = sellOne();
    expect(second).toBeLessThan(first);
    for (let i = 0; i < 20; i++) sellOne();
    expect(sellOne()).toBeGreaterThanOrEqual(Math.floor(first * GLUT_FLOOR) - 1);
    // Other species are unaffected.
    expect(priceOf(state, { defId: 'monstera', variantId: 'deliciosa', growth: STAGE_AT.large })).toBeGreaterThan(0);
    state.clock.totalMinutes += MINUTES_PER_DAY;
    const next = priceOf(state, { defId: 'pothos', variantId: 'golden', growth: STAGE_AT.large });
    expect(Math.abs(next - first)).toBeLessThanOrEqual(first * 0.5 + 1); // demand bonus may differ by day
    expect(state.market.sold.pothos).toBe(23);
  });

  it('a fresh cutting is worth little; the money is in growing it on', () => {
    const state = createNewGame();
    const cutting = priceOf(state, { defId: 'pothos', variantId: 'golden', growth: 0 });
    const specimen = priceOf(state, { defId: 'pothos', variantId: 'golden', growth: STAGE_AT.specimen });
    expect(specimen).toBeGreaterThanOrEqual(cutting * 9);
  });
});

import { moveDecor, decorFits } from '../src/game/systems/decor';

describe('moving garden pieces', () => {
  it('moves a placed piece to open space, but not on top of another', () => {
    const state = createNewGame();
    state.decorStock = { gardenTrellis: 1, birdbath: 1 };
    const trellis = placeDecor(state, 'gardenTrellis', 50, 30)!;
    const bath = placeDecor(state, 'birdbath', 52, 30)!;
    expect(moveDecor(state, trellis.id, 52.2, 30)).toBe(false);
    expect(decorFits(state, 51, 31, trellis.id)).toBe(true);
    expect(moveDecor(state, trellis.id, 51, 31)).toBe(true);
    expect(state.decor.find((d) => d.id === trellis.id)).toMatchObject({ x: 51, y: 31 });
    // A piece never collides with itself.
    expect(moveDecor(state, bath.id, 52.1, 30.1)).toBe(true);
  });

  it('sells a garden trellis as a repeatable piece of decor', () => {
    const state = createNewGame();
    state.coins = 200;
    state.bought.push('steppingStones', 'picketFence');
    expect(buyItem(state, 'gardenTrellis')).toBe(true);
    expect(buyItem(state, 'gardenTrellis')).toBe(true);
    expect(state.decorStock.gardenTrellis).toBe(2);
  });
});

describe('what each basket item will actually fetch', () => {
  it('prices a second plant of the same species as the second sale of the day', async () => {
    const { createNewGame } = await import('../src/game/state');
    const { addToBasket } = await import('../src/game/systems/basket');
    const { basketPrices, priceOf } = await import('../src/game/systems/market');
    const state = createNewGame();
    const item = { defId: 'pothos', variantId: 'golden', seed: 1, growth: 1500, generation: 0, origin: 'wild' as const, collectedAt: 0 };
    addToBasket(state, item);
    addToBasket(state, item);
    addToBasket(state, { ...item, defId: 'spiderPlant', variantId: 'green' });
    const prices = basketPrices(state);
    expect(prices[0]).toBe(priceOf(state, item));
    expect(prices[1]).toBeLessThan(prices[0]);
    expect(prices[2]).toBe(priceOf(state, { ...item, defId: 'spiderPlant', variantId: 'green' }));
  });
});
