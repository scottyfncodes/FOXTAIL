import type { BasketItem, Commission, GameState, GrowthStage } from '../state';
import { makeUid } from '../state';
import type { OutdoorZoneId } from '../types';
import { PLANTS, PLANT_LIST, findVariant, specimenName, specimenRarity } from '../data/plants';
import { POT_STYLES, findPotStyle } from '../data/shop';
import { ZONES } from '../data/zones';
import { MINUTES_PER_DAY } from '../engine/Clock';
import { hashString, weightedPick } from '../engine/Random';
import { STAGES, STAGE_LABEL, stageIndexOf } from './growth';
import { RARITY_PRICE, STAGE_PRICE_MULT, stallBonus } from './market';
import { takeFromBasket } from './basket';
import { ensureRecord } from './collection';

// Commissions: the board by the stall. Someone in town wants a particular
// plant — grown on to a size, sometimes a named variety, sometimes in a
// particular pot, sometimes just something big from one part of the valley
// — and will pay well over the going rate for it. One request is pinned up
// at a time; fill it and the buyer leaves a line about where it went, which
// the stall keeps. It's the reason to grow a plant on instead of selling
// the cutting, and the reason a pot style is worth owning.

/** What a filled request pays, over the ordinary sale price. */
export const COMMISSION_MULT = 3;
/** Game-minutes a request stays pinned before someone else's goes up instead. */
export const COMMISSION_DAYS = 2;
/** How many buyers' notes the stall keeps. */
export const NOTES_KEPT = 6;

/** What buyers say afterwards. Picked by the request's id, so each reads as its own person. */
export const BUYER_NOTES = [
  'It’s on her kitchen windowsill now.',
  'He carried it home on the bus, on his lap.',
  'She says the cat has already tried to eat it.',
  'It went in the window of the bakery in town.',
  'For his mother’s birthday. She cried, apparently.',
  'The teacher put it on the classroom sill. The children have named it.',
  'He’s built a shelf for it. Just for it.',
  'She sends a photo of it every week now.',
  'It lives in the hairdresser’s, by the door, and everyone asks about it.',
  'They put it on the table at the wedding.',
  'He says it’s the first thing he hasn’t killed.',
  'She talks to it. She said so herself.',
];

/** Game-day number of a moment. */
export function dayOf(totalMinutes: number): number {
  return Math.floor(totalMinutes / MINUTES_PER_DAY);
}

/** Species a request may ask for: ones the player knows, or the friendly commons to start with. */
function askable(state: GameState) {
  const known = PLANT_LIST.filter((p) => state.collection[p.id] && !p.secret && !p.keepsake && !p.unlisted && !p.foxOnly);
  if (known.length) return known;
  return PLANT_LIST.filter((p) => p.rarity === 'common' && p.habitat.includes('meadow') && !p.secret && !p.season);
}

const STAGE_WEIGHT: Partial<Record<GrowthStage, number>> = { established: 25, large: 55, specimen: 20 };

/**
 * Pins a new request. Early on it asks for something the player can manage
 * soon (an established common); later for bigger plants, named varieties,
 * particular pots, or anything large from one region.
 */
export function postCommission(state: GameState, now: number, rand: () => number = Math.random): Commission {
  const filled = state.commissions.filled;
  const pool = askable(state);
  const def = weightedPick(pool, (p) => (p.rarity === 'common' ? 3 : p.rarity === 'uncommon' ? 2 : 1), rand) ?? pool[0];
  let minStage: GrowthStage = filled === 0 ? 'established' : (weightedPick(Object.keys(STAGE_WEIGHT) as GrowthStage[], (s) => STAGE_WEIGHT[s] ?? 0, rand) ?? 'large');
  const c: Commission = { id: makeUid('req'), defId: def.id, minStage, postedAt: now, expiresAt: now + COMMISSION_DAYS * MINUTES_PER_DAY, seen: false };

  // Something big from a part of the valley, once the player has a few things growing.
  if (filled >= 2 && rand() < 0.15) {
    const zones = (Object.keys(ZONES) as OutdoorZoneId[]).filter((z) => z !== ('greenhouse' as string) && PLANT_LIST.filter((p) => p.habitat.includes(z) && !p.season && state.collection[p.id]).length >= 2);
    if (zones.length) {
      c.zone = zones[Math.floor(rand() * zones.length) % zones.length];
      c.defId = undefined;
      c.minStage = 'large';
      return c;
    }
  }
  // A named variety the player has come across.
  const rec = state.collection[def.id];
  const variants = def.variants.filter((v) => v.id !== def.variants[0].id && rec?.variants.includes(v.id));
  if (variants.length && rand() < 0.35) c.variantId = variants[Math.floor(rand() * variants.length) % variants.length].id;
  // A pot the player owns: what the pot styles are for.
  const pots = POT_STYLES.filter((p) => p.requires && state.owned.includes(p.requires));
  if (pots.length && rand() < 0.4) c.potId = pots[Math.floor(rand() * pots.length) % pots.length].id;
  return c;
}

/** Whether a basket item is what the request asks for. */
export function itemFits(c: Commission, item: BasketItem): boolean {
  if (stageIndexOf(item.growth) < STAGES.indexOf(c.minStage)) return false;
  if (c.zone) return !!PLANTS[item.defId]?.habitat.includes(c.zone) && !PLANTS[item.defId]?.keepsake;
  if (c.defId && item.defId !== c.defId) return false;
  if (c.variantId && item.variantId !== c.variantId) return false;
  if (c.potId && item.potId !== c.potId) return false;
  return true;
}

export type FitBlock = 'stage' | 'species' | 'variant' | 'pot' | 'zone';

/** Why the closest thing in the basket doesn't fit, for the board to say in a few words. */
export function fitBlock(c: Commission, item: BasketItem): FitBlock | null {
  if (c.zone) {
    if (!PLANTS[item.defId]?.habitat.includes(c.zone)) return 'zone';
  } else {
    if (c.defId && item.defId !== c.defId) return 'species';
    if (c.variantId && item.variantId !== c.variantId) return 'variant';
  }
  if (stageIndexOf(item.growth) < STAGES.indexOf(c.minStage)) return 'stage';
  if (c.potId && item.potId !== c.potId) return 'pot';
  return null;
}

/** The basket item that fills the request, if any: the least valuable one that does. */
export function fittingItem(state: GameState, c: Commission): BasketItem | undefined {
  return state.basket.filter((i) => itemFits(c, i)).sort((a, b) => commissionPay(state, a) - commissionPay(state, b))[0];
}

/** What the request pays for this item: the plant's own worth at its size, three times over, with the stall's bonuses. */
export function commissionPay(state: GameState, item: Pick<BasketItem, 'defId' | 'variantId' | 'growth'>): number {
  const rarity = specimenRarity(item.defId, item.variantId);
  return Math.max(1, Math.round(RARITY_PRICE[rarity] * STAGE_PRICE_MULT[stageIndexOf(item.growth)] * COMMISSION_MULT * stallBonus(state)));
}

/** The request in words: "a Large Pothos ‘Neon’ in a copper pot". */
export function describeCommission(c: Commission): string {
  const size = STAGE_LABEL[c.minStage].toLowerCase();
  const article = /^[aeiou]/.test(size) ? 'an' : 'a';
  let what: string;
  if (c.zone) what = `${article} ${size} plant, or bigger, from ${ZONES[c.zone].name.replace(/^The /, 'the ')}`;
  else {
    const name = c.variantId ? specimenName(c.defId!, c.variantId) : PLANTS[c.defId!]?.name ?? 'plant';
    what = `${article} ${size} ${name}${c.minStage === 'specimen' ? '' : ' or bigger'}`;
  }
  if (c.potId) what += ` in a ${findPotStyle(c.potId).name.toLowerCase()} pot`;
  return what;
}

/** What the board should show a picture of. */
export function commissionPortrait(c: Commission): { defId: string; variantId: string } | null {
  if (!c.defId) return null;
  return { defId: c.defId, variantId: c.variantId ?? findVariant(c.defId, '')?.id ?? PLANTS[c.defId].variants[0].id };
}

export interface FillResult {
  pay: number;
  note: string;
  item: BasketItem;
}

/** Hands the plant over: coins, a note from the buyer, and the board is clear until tomorrow. */
export function fillCommission(state: GameState, itemUid: string, now: number): FillResult | null {
  const c = state.commission;
  if (!c || c.filledAt !== undefined) return null;
  const item = state.basket.find((i) => i.uid === itemUid);
  if (!item || !itemFits(c, item)) return null;
  takeFromBasket(state, itemUid);
  const pay = commissionPay(state, item);
  state.coins += pay;
  const note = BUYER_NOTES[hashString(c.id) % BUYER_NOTES.length];
  c.filledAt = now;
  c.note = note;
  c.filledWith = specimenName(item.defId, item.variantId);
  state.commissions.filled += 1;
  state.commissions.notes.unshift({ text: note, what: `${STAGE_LABEL[STAGES[stageIndexOf(item.growth)]]} ${specimenName(item.defId, item.variantId)}`, at: now });
  state.commissions.notes.length = Math.min(state.commissions.notes.length, NOTES_KEPT);
  const rec = ensureRecord(state, item.defId, now);
  rec.sold += 1;
  rec.earned += pay;
  return { pay, note, item };
}

/**
 * Keeps the board current: a new request is pinned when there is none, when
 * the last was filled on an earlier day, or when one has hung unanswered
 * for a couple of days. Returns the new request if one went up.
 */
export function tickCommissions(state: GameState, now: number, rand: () => number = Math.random): Commission | null {
  const c = state.commission;
  const due = !c || (c.filledAt !== undefined ? dayOf(now) > dayOf(c.filledAt) : now >= c.expiresAt);
  if (!due) return null;
  state.commission = postCommission(state, now, rand);
  return state.commission;
}

/** Whether a request is pinned and waiting. */
export function openCommission(state: GameState): Commission | null {
  const c = state.commission;
  return c && c.filledAt === undefined ? c : null;
}
