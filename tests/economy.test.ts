import { describe, it, expect } from 'vitest';
import { createNewGame, type GameState } from '../src/game/state';
import { SHOP_ITEMS, POT_STYLES } from '../src/game/data/shop';
import { PLANT_LIST, RARITY_ORDER, specimenRarity } from '../src/game/data/plants';
import { priceOf, demandSpecies, itemPrice, buyItem, buyBlockReason, sellItem, glutFactor, RARITY_PRICE, STAGE_PRICE_MULT } from '../src/game/systems/market';
import { commissionPay, COMMISSION_MULT } from '../src/game/systems/commissions';
import { STAGE_AT, STAGES } from '../src/game/systems/growth';
import { addToBasket } from '../src/game/systems/basket';
import { bedCost } from '../src/game/systems/landscape';
import { migrateSave } from '../src/game/engine/SaveManager';
import { NURSERY_BEDS, DISPLAY_SLOTS } from '../src/game/data/stations';

/** A species and form of each rarity, so the ladder can be priced. */
function oneOfEach(): Record<string, { defId: string; variantId: string }> {
  const out: Record<string, { defId: string; variantId: string }> = {};
  for (const p of PLANT_LIST) for (const v of p.variants) {
    const r = specimenRarity(p.id, v.id);
    if (r !== 'mythic' && !out[r]) out[r] = { defId: p.id, variantId: v.id };
  }
  return out;
}

/** One rested absence: every nursery bed turns a cutting into a specimen (3 days cap ≥ 3600 growth at rate 1). */
function absenceIncome(state: GameState, beds: number, id: { defId: string; variantId: string }): number {
  let total = 0;
  const st = JSON.parse(JSON.stringify(state)) as GameState;
  for (let i = 0; i < beds; i++) {
    const item = addToBasket(st, { ...id, seed: i, growth: STAGE_AT.specimen, generation: 1, origin: 'lifted', collectedAt: 0 })!;
    total += sellItem(st, item.uid, st.clock.totalMinutes)!;
  }
  return total;
}

describe('the economy: earning', () => {
  it('prices climb with rarity and with size, and a fresh common cutting is pocket money', () => {
    const state = createNewGame();
    state.clock.totalMinutes = 3 * 1440;
    const ids = oneOfEach();
    const ladder = RARITY_ORDER.filter((r) => r !== 'mythic');
    for (let i = 1; i < ladder.length; i++) {
      for (const st of STAGES) expect(priceOf(state, { ...ids[ladder[i]], growth: STAGE_AT[st] })).toBeGreaterThan(priceOf(state, { ...ids[ladder[i - 1]], growth: STAGE_AT[st] }));
    }
    for (let i = 1; i < STAGES.length; i++) expect(STAGE_PRICE_MULT[i]).toBeGreaterThan(STAGE_PRICE_MULT[i - 1]);
    expect(RARITY_PRICE.common * STAGE_PRICE_MULT[0]).toBeLessThan(10);
  });

  it('a commission pays three times the sale price, so growing on beats selling the cutting', () => {
    const state = createNewGame();
    expect(COMMISSION_MULT).toBe(3);
    const ids = oneOfEach();
    const item = { ...ids.common, growth: STAGE_AT.large };
    // Not on a day the market is after this one anyway: that bonus is the market's, not the request's.
    while (demandSpecies(state) === item.defId) state.clock.totalMinutes += 1440;
    expect(commissionPay(state, item)).toBe(Math.round(priceOf(state, item) * 3));
  });

  it('the market tires of rare things faster than commons: a rare farm is not a business', () => {
    const state = createNewGame();
    state.market = { day: 0, sold: { a: 6, b: 6 } };
    state.clock.totalMinutes = 0;
    expect(glutFactor(state, 'a', 0, 'common')).toBeGreaterThan(glutFactor(state, 'b', 0, 'rare'));
    expect(glutFactor(state, 'b', 0, 'veryRare')).toBe(0.25);
    expect(glutFactor(state, 'a', 0, 'common')).toBeCloseTo(0.4);
    // A first rare sale of the day is still the full windfall.
    state.market = { day: 0, sold: {} };
    expect(glutFactor(state, 'b', 0, 'unheardOf')).toBe(1);
  });

  it('one absence with a full nursery of rare specimens does not pay for the big expansions outright', () => {
    const state = createNewGame();
    state.clock.totalMinutes = 3 * 1440;
    const ids = oneOfEach();
    const beds = NURSERY_BEDS.length; // every fixed bed, annex included
    const rare = absenceIncome(state, beds, ids.rare);
    const orangery = SHOP_ITEMS.find((i) => i.id === 'orangery')!.price;
    const roof = SHOP_ITEMS.find((i) => i.id === 'roofLights')!.price;
    expect(rare).toBeLessThan(orangery);
    expect(absenceIncome(state, beds, ids.veryRare)).toBeLessThan(roof);
    // Diversity pays: the same beds split across species earn more than one species farmed.
    const mixed = absenceIncome(state, beds / 2, ids.rare) + absenceIncome(state, beds / 2, ids.uncommon);
    expect(mixed).toBeGreaterThan(absenceIncome(state, beds, ids.uncommon));
  });
});

describe('the economy: spending', () => {
  it('the early game is untouched: the first extras are cheap and nothing common got dearer', () => {
    const state = createNewGame();
    expect(state.coins).toBe(20);
    expect(itemPrice(state, 'plantStand')).toBeLessThanOrEqual(45);
    expect(itemPrice(state, 'nurseryBed')).toBe(45);
    buyItem({ ...state, coins: 1e6 } as GameState, 'nurseryBed');
    const second = createNewGame();
    second.purchases.nurseryBed = 1;
    expect(itemPrice(second, 'nurseryBed')).toBeLessThanOrEqual(70);
    expect(bedCost(state, 3, 3)).toBeLessThan(160);
    expect(SHOP_ITEMS.filter((i) => i.price <= 100).length).toBeGreaterThanOrEqual(12);
  });

  it('production is the throttle: a dozen extra nursery beds cost more than the orangery', () => {
    const state = createNewGame();
    state.coins = 1e9;
    let total = 0;
    for (let i = 0; i < 12; i++) {
      total += itemPrice(state, 'nurseryBed');
      buyItem(state, 'nurseryBed');
    }
    expect(total).toBeGreaterThan(SHOP_ITEMS.find((i) => i.id === 'orangery')!.price);
    expect(total).toBeLessThan(15000);
  });

  it('a 20k-coin player still has somewhere to put it: luxury sinks that add no production', () => {
    const luxury = SHOP_ITEMS.filter((i) => i.price >= 900 && (i.category === 'pots' || i.category === 'garden' || i.role === 'decoration'));
    expect(luxury.map((i) => i.id)).toEqual(expect.arrayContaining(['potGilded', 'potMidnight', 'weathervane', 'pergola', 'gardenPond']));
    expect(luxury.reduce((a, i) => a + i.price, 0)).toBeGreaterThan(9000);
    for (const id of ['gilded', 'midnight']) expect(POT_STYLES.some((p) => p.id === id)).toBe(true);
    const oneOff = SHOP_ITEMS.filter((i) => !i.repeatable).reduce((a, i) => a + i.price, 0);
    expect(oneOff).toBeGreaterThan(28000);
  });

  it('a 20k-coin player can buy every one-off in some order without a blocked prerequisite, and never goes negative', () => {
    const state = createNewGame();
    state.coins = 20_000;
    let spent = 0;
    const oneOff = SHOP_ITEMS.filter((i) => !i.repeatable).sort((a, b) => a.price - b.price);
    const bought = new Set<string>();
    let progress = true;
    while (progress) {
      progress = false;
      for (const item of oneOff) {
        if (bought.has(item.id)) continue;
        const block = buyBlockReason(state, item.id);
        if (block === 'coins') continue;
        if (block) continue;
        expect(buyItem(state, item.id)).toBe(true);
        spent += item.price;
        bought.add(item.id);
        progress = true;
        expect(state.coins).toBeGreaterThanOrEqual(0);
      }
    }
    // Everything it could not afford is only blocked by coins, never by a missing unlock it can't reach.
    for (const item of oneOff) if (!bought.has(item.id)) expect(buyBlockReason(state, item.id)).toBe('coins');
    expect(spent).toBeGreaterThan(13_000);
    expect(state.coins).toBe(20_000 - spent);
    // What's left is less than the cheapest thing still on the list: the coins were usable, not stranded.
    const cheapestLeft = Math.min(...oneOff.filter((i) => !bought.has(i.id)).map((i) => i.price));
    expect(state.coins).toBeLessThan(cheapestLeft);
  });

  it('a fully kitted-out save loads back with everything, and no currency is ever negative', () => {
    const state = createNewGame();
    state.coins = 100_000;
    for (const item of SHOP_ITEMS) buyItem(state, item.id);
    for (let i = 0; i < 5; i++) buyItem(state, 'nurseryBed');
    const loaded = migrateSave(JSON.parse(JSON.stringify(state)))!;
    expect(loaded.owned).toEqual(state.owned);
    expect(loaded.purchases).toEqual(state.purchases);
    expect(loaded.coins).toBe(state.coins);
    expect(loaded.coins).toBeGreaterThanOrEqual(0);
    // Nothing sells for less than a coin, whatever the glut.
    const poor = createNewGame();
    poor.market = { day: 0, sold: { pothos: 50 } };
    expect(priceOf(poor, { defId: 'pothos', variantId: 'golden', growth: 0 })).toBeGreaterThanOrEqual(1);
    // More room to grow and show than a new player has: production and display both expand.
    expect(NURSERY_BEDS.length).toBeGreaterThanOrEqual(12);
    expect(DISPLAY_SLOTS.length).toBeGreaterThanOrEqual(20);
  });
});
