import type { BasketItem, GameState } from '../state';
import type { Rarity } from '../types';
import { PLANTS, PLANT_LIST, specimenRarity } from '../data/plants';
import { findShopItem, type DecorId, DECOR_IDS, type FurnitureId, FURNITURE_IDS } from '../data/shop';
import { MINUTES_PER_DAY } from '../engine/Clock';
import { hashString } from '../engine/Random';
import { takeFromBasket } from './basket';
import { ensureRecord } from './collection';
import { stageIndexOf } from './growth';

// The farmer's market: the game's money loop. Commons pay the bills;
// something genuinely rare can pay for a whole greenhouse wing — which is
// exactly what makes selling one a real decision.

export const RARITY_PRICE: Record<Rarity, number> = {
  common: 18,
  uncommon: 40,
  rare: 100,
  veryRare: 260,
  extremelyRare: 700,
  unheardOf: 1600,
  mythic: 0,
};

/**
 * Bigger plants are worth much more than a snipped cutting. Cuttings are
 * nearly free to come by (every rooted plant gives one every couple of real
 * minutes), so they fetch little: the money is in growing things on.
 */
export const STAGE_PRICE_MULT = [0.3, 0.6, 1.1, 2.0, 3.2];
export const DEMAND_BONUS = 1.5;

/**
 * Each sale of a species on the same day knocks its price down a notch, so
 * a cutting farm of one plant can't flood the stall. It recovers overnight.
 */
export const GLUT_STEP = 0.85;
export const GLUT_FLOOR = 0.4;

function today(state: GameState): number {
  return Math.floor(state.clock.totalMinutes / MINUTES_PER_DAY);
}

/** How many of this species have already sold today. */
export function soldToday(state: GameState, defId: string): number {
  return state.market.day === today(state) ? state.market.sold[defId] ?? 0 : 0;
}

/**
 * 1 for the first sale of the day, falling with every repeat sale of the
 * same species. `ahead` counts sales not yet made but coming first (the
 * rows above this one in the basket), so a list can show each plant's real price.
 */
export function glutFactor(state: GameState, defId: string, ahead = 0): number {
  return Math.max(GLUT_FLOOR, Math.pow(GLUT_STEP, soldToday(state, defId) + ahead));
}

/** Today's sought-after species: people are asking for it at the stall. */
export function demandSpecies(state: GameState): string {
  const day = Math.floor(state.clock.totalMinutes / MINUTES_PER_DAY);
  // Prefer something the player has actually found, so the tip is usable.
  const found = PLANT_LIST.filter((p) => state.collection[p.id] && !p.foxOnly && !p.secret && !p.keepsake);
  const pool = found.length >= 2 ? found : PLANT_LIST.filter((p) => (p.rarity === 'common' || p.rarity === 'uncommon') && !p.secret);
  return pool[hashString(`demand:${day}`) % pool.length].id;
}

export function stallBonus(state: GameState): number {
  let b = 1;
  if (state.owned.includes('stallAwning')) b += 0.1;
  if (state.owned.includes('stallCrates')) b += 0.1;
  return b;
}

export function priceOf(state: GameState, item: Pick<BasketItem, 'defId' | 'variantId' | 'growth'>, ahead = 0): number {
  const rarity = specimenRarity(item.defId, item.variantId);
  let p = RARITY_PRICE[rarity] * STAGE_PRICE_MULT[stageIndexOf(item.growth)];
  if (demandSpecies(state) === item.defId) p *= DEMAND_BONUS;
  return Math.max(1, Math.round(p * stallBonus(state) * glutFactor(state, item.defId, ahead)));
}

/**
 * What each basket item would fetch if sold top to bottom, in basket order:
 * a second plant of the same species is priced as the second sale.
 */
export function basketPrices(state: GameState): number[] {
  const ahead: Record<string, number> = {};
  return state.basket.map((item) => {
    const n = ahead[item.defId] ?? 0;
    ahead[item.defId] = n + 1;
    return priceOf(state, item, n);
  });
}

/** Some plants aren't for sale at any price: the stall simply won't take them. */
export function canSell(defId: string): boolean {
  const def = PLANTS[defId];
  return !!def && !def.keepsake;
}

export function sellItem(state: GameState, uid: string, now: number): number | null {
  const item = state.basket.find((i) => i.uid === uid);
  if (!item || !canSell(item.defId)) return null;
  const price = priceOf(state, item);
  takeFromBasket(state, uid);
  state.coins += price;
  const day = today(state);
  if (state.market.day !== day) state.market = { day, sold: {} };
  state.market.sold[item.defId] = (state.market.sold[item.defId] ?? 0) + 1;
  const rec = ensureRecord(state, item.defId, now);
  rec.sold += 1;
  rec.earned += price;
  return price;
}

export type BuyBlock = 'owned' | 'locked' | 'coins';

/**
 * What an item costs right now. Most items have a fixed price; a few
 * repeatable ones (nursery beds) compound with every one already bought.
 */
export function itemPrice(state: Pick<GameState, 'purchases'>, itemId: string): number {
  const item = findShopItem(itemId);
  if (!item) return Infinity;
  if (!item.priceGrowth) return item.price;
  const bought = state.purchases?.[itemId] ?? 0;
  return Math.round(item.price * Math.pow(item.priceGrowth, bought));
}

/** Whether the market offers this item yet: unlocked by its prerequisite, or already owned. */
export function shopItemVisible(state: Pick<GameState, 'owned'>, itemId: string): boolean {
  const item = findShopItem(itemId);
  if (!item) return false;
  return !item.after || state.owned.includes(item.after) || state.owned.includes(item.id);
}

/** A shop item the player hasn't looked at yet. */
export function isShopItemNew(state: Pick<GameState, 'owned' | 'seenShop'>, itemId: string): boolean {
  return shopItemVisible(state, itemId) && !state.seenShop.includes(itemId);
}

/** Records that the player has seen these items, so they stop showing NEW. */
export function markShopSeen(state: Pick<GameState, 'seenShop'>, ids: string[]): void {
  for (const id of ids) if (!state.seenShop.includes(id)) state.seenShop.push(id);
}

export function buyBlockReason(state: GameState, itemId: string): BuyBlock | null {
  const item = findShopItem(itemId);
  if (!item) return 'locked';
  if (!item.repeatable && state.owned.includes(itemId)) return 'owned';
  if (item.after && !state.owned.includes(item.after)) return 'locked';
  if (state.coins < itemPrice(state, itemId)) return 'coins';
  return null;
}

export function buyItem(state: GameState, itemId: string): boolean {
  const item = findShopItem(itemId);
  if (!item || buyBlockReason(state, itemId)) return false;
  state.coins -= itemPrice(state, itemId);
  if (item.priceGrowth) state.purchases[itemId] = (state.purchases[itemId] ?? 0) + 1;
  markShopSeen(state, [itemId]);
  if (item.repeatable && (DECOR_IDS as string[]).includes(itemId)) {
    const id = itemId as DecorId;
    state.decorStock[id] = (state.decorStock[id] ?? 0) + 1;
  } else if (item.repeatable && (FURNITURE_IDS as string[]).includes(itemId)) {
    const id = itemId as FurnitureId;
    state.furnitureStock[id] = (state.furnitureStock[id] ?? 0) + 1;
  } else {
    state.owned.push(itemId);
  }
  return true;
}
