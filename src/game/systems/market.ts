import type { BasketItem, GameState } from '../state';
import type { Rarity } from '../types';
import { PLANTS, PLANT_LIST, specimenRarity, rarityRank } from '../data/plants';
import { findShopItem, SHOP_ITEMS, type DecorId, DECOR_IDS, type FurnitureId, FURNITURE_IDS, POND_DEFAULT, POND_MAX, POND_MIN, POND_PRICE_PER_TILE, POND_STEP, RESALE_RATE } from '../data/shop';
import { freeKoi, koiVariety, newKoi } from './koi';
import { MINUTES_PER_DAY } from '../engine/Clock';
import { hashString } from '../engine/Random';
import { takeFromBasket } from './basket';
import { findCarried } from './truck';
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
/**
 * The market for anything rare is thinner: a second rare specimen in a day
 * fetches a lot less than the first, and the floor is lower. Growing one
 * rare thing on is still a windfall; farming it is not a business.
 */
export const GLUT_STEP_RARE = 0.7;
export const GLUT_FLOOR_RARE = 0.25;

/** How the market tires of a species, by how rare what's being sold is. */
export function glutCurve(rarity: Rarity): { step: number; floor: number } {
  return rarityRank(rarity) >= rarityRank('rare') ? { step: GLUT_STEP_RARE, floor: GLUT_FLOOR_RARE } : { step: GLUT_STEP, floor: GLUT_FLOOR };
}

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
export function glutFactor(state: GameState, defId: string, ahead = 0, rarity: Rarity = 'common'): number {
  const { step, floor } = glutCurve(rarity);
  return Math.max(floor, Math.pow(step, soldToday(state, defId) + ahead));
}

/** Today's sought-after species: people are asking for it at the stall. */
export function demandSpecies(state: GameState): string {
  const day = Math.floor(state.clock.totalMinutes / MINUTES_PER_DAY);
  // Prefer something the player has actually found, so the tip is usable.
  const found = PLANT_LIST.filter((p) => state.collection[p.id] && !p.foxOnly && !p.secret && !p.keepsake && !p.season);
  const pool = found.length >= 2 ? found : PLANT_LIST.filter((p) => (p.rarity === 'common' || p.rarity === 'uncommon') && !p.secret && !p.season);
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
  return Math.max(1, Math.round(p * stallBonus(state) * glutFactor(state, item.defId, ahead, rarity)));
}

/**
 * What each basket item would fetch if sold top to bottom, in basket order:
 * a second plant of the same species is priced as the second sale.
 */
export function basketPrices(state: GameState, items: BasketItem[] = state.basket): number[] {
  const ahead: Record<string, number> = {};
  return items.map((item) => {
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
  const item = findCarried(state, uid);
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
 * repeatable ones (nursery beds, ponds) compound with every one already
 * bought. A pack (the double bed) costs what its units would one after
 * another, so buying beds in pairs costs exactly what buying them singly did.
 */
export function itemPrice(state: Pick<GameState, 'purchases'>, itemId: string): number {
  const item = findShopItem(itemId);
  if (!item) return Infinity;
  if (!item.priceGrowth) return item.price * (item.pack ?? 1);
  const bought = state.purchases?.[item.priceKey ?? itemId] ?? 0;
  let total = 0;
  for (let i = 0; i < (item.pack ?? 1); i++) total += item.price * Math.pow(item.priceGrowth, bought + i);
  return Math.round(total);
}

/** A pond size the crew will dig: clamped to the allowed range and rounded to the step. */
export function clampPondSize(w: number, h: number): { w: number; h: number } {
  const fit = (v: number, lo: number, hi: number) => {
    const n = Number.isFinite(v) ? v : lo;
    return Math.min(hi, Math.max(lo, Math.round(n / POND_STEP) * POND_STEP));
  };
  return { w: fit(w, POND_MIN.w, POND_MAX.w), h: fit(h, POND_MIN.h, POND_MAX.h) };
}

/** A pond's list price by size alone: area times the price per square tile. */
export function pondBasePrice(w: number, h: number): number {
  return Math.round((POND_PRICE_PER_TILE * w * h) / 10) * 10;
}

/** What digging a pond this size costs right now: its list price, compounding with every pond already bought. */
export function pondPrice(state: Pick<GameState, 'purchases'>, w: number, h: number): number {
  // The original size predates the size steps, so it's taken as it is.
  const size = w === POND_DEFAULT.w && h === POND_DEFAULT.h ? { w, h } : clampPondSize(w, h);
  const growth = findShopItem('gardenPond')?.priceGrowth ?? 1;
  return Math.round(pondBasePrice(size.w, size.h) * Math.pow(growth, state.purchases?.gardenPond ?? 0));
}

type BoughtState = Pick<GameState, 'owned'> & Partial<Pick<GameState, 'bought' | 'decorStock' | 'furnitureStock' | 'decor' | 'furniture' | 'koi' | 'purchases'>>;

/**
 * Whether this has ever been bought: a one-off owned, or a repeatable bought
 * at least once — or, for a save from before that was noted, anything of it
 * already about the place.
 */
export function hasBought(state: BoughtState, itemId: string): boolean {
  if (state.owned.includes(itemId) || (state.bought ?? []).includes(itemId)) return true;
  const item = findShopItem(itemId);
  if (!item?.repeatable) return false;
  const target = item.stock ?? itemId;
  if (itemId === 'koi') return (state.koi?.length ?? 0) > 0;
  return (
    ((state.decorStock as Record<string, number> | undefined)?.[target] ?? 0) > 0 ||
    ((state.furnitureStock as Record<string, number> | undefined)?.[target] ?? 0) > 0 ||
    (state.decor ?? []).some((d) => d.decorId === target) ||
    (state.furniture ?? []).some((f) => f.kind === target && f.id.startsWith('furniture')) ||
    (state.purchases?.[item.priceKey ?? itemId] ?? 0) > 0
  );
}

/** Whether the market offers this item yet: the one before it in its line bought, or already bought itself. */
export function shopItemVisible(state: BoughtState, itemId: string): boolean {
  const item = findShopItem(itemId);
  if (!item) return false;
  return !item.after || hasBought(state, item.after) || hasBought(state, item.id);
}

/** A shop item the player hasn't looked at yet. */
export function isShopItemNew(state: BoughtState & Pick<GameState, 'seenShop'>, itemId: string): boolean {
  return shopItemVisible(state, itemId) && !state.seenShop.includes(itemId);
}

/** Records that the player has seen these items, so they stop showing NEW. */
export function markShopSeen(state: Pick<GameState, 'seenShop'>, ids: string[]): void {
  for (const id of ids) if (!state.seenShop.includes(id)) state.seenShop.push(id);
}

/** Options for an item bought to order: the size of a pond. */
export interface BuyOptions {
  pond?: { w: number; h: number };
}

function priceFor(state: GameState, itemId: string, opts: BuyOptions): number {
  if (itemId === 'gardenPond') {
    const size = opts.pond ? clampPondSize(opts.pond.w, opts.pond.h) : POND_DEFAULT;
    return pondPrice(state, size.w, size.h);
  }
  return itemPrice(state, itemId);
}

export function buyBlockReason(state: GameState, itemId: string, opts: BuyOptions = {}): BuyBlock | null {
  const item = findShopItem(itemId);
  if (!item) return 'locked';
  if (!item.repeatable && state.owned.includes(itemId)) return 'owned';
  if (!shopItemVisible(state, itemId)) return 'locked';
  if (state.coins < priceFor(state, itemId, opts)) return 'coins';
  return null;
}

export function buyItem(state: GameState, itemId: string, opts: BuyOptions = {}): boolean {
  const item = findShopItem(itemId);
  if (!item || buyBlockReason(state, itemId, opts)) return false;
  state.coins -= priceFor(state, itemId, opts);
  const units = item.pack ?? 1;
  if (item.priceGrowth) state.purchases[item.priceKey ?? itemId] = (state.purchases[item.priceKey ?? itemId] ?? 0) + units;
  markShopSeen(state, [itemId]);
  if (item.repeatable && !state.bought.includes(itemId)) state.bought.push(itemId);
  const target = item.stock ?? itemId;
  if (itemId === 'koi') {
    state.koi.push(newKoi());
  } else if (item.repeatable && (DECOR_IDS as string[]).includes(target)) {
    const id = target as DecorId;
    state.decorStock[id] = (state.decorStock[id] ?? 0) + units;
    if (id === 'gardenPond') state.pondStock.push(opts.pond ? clampPondSize(opts.pond.w, opts.pond.h) : { ...POND_DEFAULT });
  } else if (item.repeatable && (FURNITURE_IDS as string[]).includes(target)) {
    const id = target as FurnitureId;
    state.furnitureStock[id] = (state.furnitureStock[id] ?? 0) + units;
  } else {
    state.owned.push(itemId);
  }
  return true;
}

// ---------------------------------------------------------------- selling back

/**
 * Something the market will buy back: a piece of decor or furniture still in
 * stock (unplaced), or a koi not in a pond. Placed pieces are picked up first.
 * One-off upgrades are part of the place now and can't be sold.
 */
export interface Resellable {
  /** 'decor' | 'furniture' by stock id; 'pond' by its index in the pond stock; 'koi' by koi id. */
  kind: 'decor' | 'furniture' | 'pond' | 'koi';
  id: string;
  name: string;
  /** How many of it are in stock (always 1 for a pond or a koi). */
  count: number;
  value: number;
}

/** The shop item a stock kind was bought as, and its list price per unit. */
function listPrice(stockId: string): { name: string; price: number } | null {
  const item = SHOP_ITEMS.find((s) => (s.stock ?? s.id) === stockId && s.repeatable);
  return item ? { name: stockId === 'nurseryBed' ? 'Nursery Bed' : item.name, price: item.price } : null;
}

/** What the market pays back: a fixed share of the list price, rounded down. Always less than anything costs to buy. */
export function resalePrice(listPrice: number): number {
  return Math.max(0, Math.floor(listPrice * RESALE_RATE));
}

/** The pond sizes in stock, one per pond: sizes chosen when bought, the original size for any bought before ponds came in sizes. */
export function stockedPonds(state: Pick<GameState, 'decorStock' | 'pondStock'>): { w: number; h: number }[] {
  const n = state.decorStock.gardenPond ?? 0;
  const sized = state.pondStock.slice(0, n);
  while (sized.length < n) sized.push({ ...POND_DEFAULT });
  return sized;
}

/** Everything the player could sell back right now, with what each fetches. */
export function resellables(state: GameState): Resellable[] {
  const out: Resellable[] = [];
  for (const id of DECOR_IDS) {
    const n = state.decorStock[id] ?? 0;
    if (n <= 0) continue;
    if (id === 'gardenPond') {
      stockedPonds(state).forEach((size, i) => out.push({ kind: 'pond', id: String(i), name: `Ornamental Pond (${size.w} × ${size.h})`, count: 1, value: resalePrice(pondBasePrice(size.w, size.h)) }));
      continue;
    }
    const list = listPrice(id);
    if (list) out.push({ kind: 'decor', id, name: list.name, count: n, value: resalePrice(list.price) });
  }
  for (const id of FURNITURE_IDS) {
    const n = state.furnitureStock[id] ?? 0;
    const list = listPrice(id);
    if (n > 0 && list) out.push({ kind: 'furniture', id, name: list.name, count: n, value: resalePrice(list.price) });
  }
  const koiPrice = findShopItem('koi')?.price ?? 0;
  for (const k of freeKoi(state)) out.push({ kind: 'koi', id: k.id, name: `${koiVariety(k.variety).name} koi`, count: 1, value: resalePrice(koiPrice) });
  return out;
}

/** Sells one of something back to the market. Returns the coins paid, or null if the player doesn't have it to sell. */
export function sellBack(state: GameState, kind: Resellable['kind'], id: string): number | null {
  const entry = resellables(state).find((r) => r.kind === kind && r.id === id);
  if (!entry || entry.count <= 0) return null;
  if (kind === 'decor') state.decorStock[id as DecorId] = (state.decorStock[id as DecorId] ?? 0) - 1;
  else if (kind === 'furniture') state.furnitureStock[id as FurnitureId] = (state.furnitureStock[id as FurnitureId] ?? 0) - 1;
  else if (kind === 'pond') {
    const i = Number(id);
    state.decorStock.gardenPond = (state.decorStock.gardenPond ?? 0) - 1;
    if (i < state.pondStock.length) state.pondStock.splice(i, 1);
  } else {
    state.koi = state.koi.filter((k) => k.id !== id);
  }
  state.coins += entry.value;
  return entry.value;
}
