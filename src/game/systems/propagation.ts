import type { BasketItem, GameState, OwnedPlant, PlantLocation } from '../state';
import { makeUid } from '../state';
import type { OutdoorZoneId, Rarity } from '../types';
import { PLANTS, rarityRank, specimenRarity } from '../data/plants';
import { addToBasket, basketFull, takeFromBasket } from './basket';
import { ensureRecord, isEstablished, recordFound } from './collection';
import { isRooted, stageIndexOf } from './growth';
import { nextInLine } from './lineage';

/** Game-minutes a plant needs to recover before another cutting: a full day (halved with the rooting kit). */
export const CUTTING_COOLDOWN = 1440;
const BASE_SPORT_CHANCE = 0.06;

/**
 * Chance a cutting fails to strike, by what it's taken from. The rarer
 * the plant, the harder it is to root; the rooting kit halves the odds.
 */
export const CUTTING_FAIL: Record<Rarity, number> = { common: 0.05, uncommon: 0.12, rare: 0.22, veryRare: 0.32, extremelyRare: 0.42, unheardOf: 0.5, mythic: 0.5 };

export function cuttingCooldown(state: GameState): number {
  return state.owned.includes('rootingKit') ? CUTTING_COOLDOWN / 2 : CUTTING_COOLDOWN;
}

export function sportChance(state: GameState): number {
  return state.owned.includes('rootingKit') ? BASE_SPORT_CHANCE * 2 : BASE_SPORT_CHANCE;
}

export function cuttingFailChance(state: GameState, plant: Pick<OwnedPlant, 'defId' | 'variantId'>): number {
  const base = CUTTING_FAIL[specimenRarity(plant.defId, plant.variantId)] ?? 0;
  return state.owned.includes('rootingKit') ? base / 2 : base;
}

/** A plain line for the card: how often a cutting from this plant takes. */
export function cuttingOdds(state: GameState, plant: Pick<OwnedPlant, 'defId' | 'variantId'>): string | null {
  const fail = cuttingFailChance(state, plant);
  if (fail <= 0) return null;
  const takes = Math.round((1 - fail) * 10);
  return takes >= 10 ? null : `Cuttings from it take about ${takes} times in 10${state.owned.includes('rootingKit') ? '' : ' — better with a rooting kit'}.`;
}

/**
 * A "sport": the plant throws a shoot unlike its parent. It is always the
 * next form along the species' line — the second from the first, the
 * third from the second — never a leap. The form nature never made is
 * only on the table when `beyond` is true: a cutting from a big, settled
 * plant, or a seedling in a lively bed.
 */
export function rollSport(defId: string, fromVariantId: string, _rand: () => number, beyond = false): string | null {
  const next = nextInLine(defId, fromVariantId);
  if (!next || (next.sportOnly && !beyond)) return null;
  return next.id;
}

export type CuttingBlock = 'not-rooted' | 'recovering' | 'basket-full';

export function cuttingBlockReason(state: GameState, plant: OwnedPlant, now: number): CuttingBlock | null {
  if (!isRooted(plant.growth)) return 'not-rooted';
  if (plant.lastCuttingAt !== null && now - plant.lastCuttingAt < cuttingCooldown(state)) return 'recovering';
  if (basketFull(state)) return 'basket-full';
  return null;
}

export interface CuttingResult {
  /** What went in the basket — nothing, if the cutting didn't take. */
  item: BasketItem | null;
  sport: boolean;
  newVariant: boolean;
  /** The cutting failed to strike. The parent still needs its recovery time. */
  failed: boolean;
}

/**
 * Snips a cutting into the basket. The parent is never harmed — it just
 * needs time to recover, whether or not the cutting took.
 */
export function takeCutting(state: GameState, plantId: string, now: number, rand: () => number = Math.random): CuttingResult | null {
  const plant = state.plants[plantId];
  if (!plant || cuttingBlockReason(state, plant, now)) return null;
  if (rand() < cuttingFailChance(state, plant)) {
    plant.lastCuttingAt = now;
    if (plant.unnoticed) plant.unnoticed = false;
    return { item: null, sport: false, newVariant: false, failed: true };
  }
  let variantId = plant.variantId;
  let sport = false;
  // Bigger, older plants are more likely to throw something unusual.
  const chance = sportChance(state) * (0.6 + stageIndexOf(plant.growth) * 0.25);
  if (rand() < chance) {
    const v = rollSport(plant.defId, plant.variantId, rand, stageIndexOf(plant.growth) >= 3);
    if (v) {
      variantId = v;
      sport = true;
    }
  }
  const item = addToBasket(state, {
    defId: plant.defId,
    variantId,
    seed: Math.floor(rand() * 1e9),
    growth: 0,
    generation: plant.generation + 1,
    origin: 'cutting',
    collectedAt: now,
  });
  if (!item) return null;
  plant.lastCuttingAt = now;
  if (plant.unnoticed) plant.unnoticed = false;
  ensureRecord(state, plant.defId, now).propagated += 1;
  const found = recordFound(state, plant.defId, variantId, now);
  return { item, sport, newVariant: found.newVariant, failed: false };
}

/** For one parent of a cross, its partner and what the two make together. */
export function crossOf(defId: string): { partner: string; child: string } | null {
  for (const def of Object.values(PLANTS)) {
    if (!def.parents) continue;
    const [a, b] = def.parents;
    if (defId === a) return { partner: b, child: def.id };
    if (defId === b) return { partner: a, child: def.id };
  }
  return null;
}

export type CrossBlock = 'no-cross' | 'no-partner' | 'not-rooted' | 'recovering' | 'basket-full';

/** A rooted plant of the partner species the player is growing, ready to give pollen. */
export function crossPartner(state: GameState, plant: OwnedPlant, now: number): OwnedPlant | undefined {
  const cross = crossOf(plant.defId);
  if (!cross) return undefined;
  const ready = (p: OwnedPlant) => isRooted(p.growth) && (p.lastCuttingAt === null || now - p.lastCuttingAt >= cuttingCooldown(state));
  return Object.values(state.plants).find((p) => p.defId === cross.partner && p.id !== plant.id && ready(p));
}

export function crossBlockReason(state: GameState, plant: OwnedPlant, now: number): CrossBlock | null {
  const cross = crossOf(plant.defId);
  if (!cross) return 'no-cross';
  if (!Object.values(state.plants).some((p) => p.defId === cross.partner)) return 'no-partner';
  const own = cuttingBlockReason(state, plant, now);
  if (own) return own;
  if (!crossPartner(state, plant, now)) return 'recovering';
  return null;
}

/**
 * Cross-pollinates a plant with a rooted one of its partner species: the
 * seed that sets comes up as the hybrid, straight into the basket. Both
 * parents then need the same rest they would after a cutting.
 */
export function crossPollinate(state: GameState, plantId: string, now: number, rand: () => number = Math.random): { item: BasketItem; newSpecies: boolean } | null {
  const plant = state.plants[plantId];
  if (!plant || crossBlockReason(state, plant, now)) return null;
  const partner = crossPartner(state, plant, now)!;
  const child = crossOf(plant.defId)!.child;
  const item = addToBasket(state, {
    defId: child,
    variantId: PLANTS[child].variants[0].id,
    seed: Math.floor(rand() * 1e9),
    growth: 0,
    generation: Math.max(plant.generation, partner.generation) + 1,
    origin: 'cutting',
    collectedAt: now,
  });
  if (!item) return null;
  plant.lastCuttingAt = now;
  partner.lastCuttingAt = now;
  ensureRecord(state, plant.defId, now).propagated += 1;
  const found = recordFound(state, child, item.variantId, now);
  return { item, newSpecies: found.newSpecies };
}

function newPlantFrom(item: BasketItem, location: PlantLocation, now: number): OwnedPlant {
  return {
    id: makeUid('plant'),
    defId: item.defId,
    variantId: item.variantId,
    seed: item.seed,
    growth: item.growth,
    location,
    plantedAt: now,
    lastCuttingAt: null,
    generation: item.generation,
    bornWild: false,
    countedGrown: item.countedGrown,
  };
}

export function occupantOf(state: GameState, where: { bedId?: string; slotId?: string }): OwnedPlant | undefined {
  return Object.values(state.plants).find(
    (p) =>
      (where.bedId && p.location.kind === 'nursery' && p.location.bedId === where.bedId) ||
      (where.slotId && p.location.kind === 'display' && p.location.slotId === where.slotId)
  );
}

/** Pots a cutting (or any carried plant) into a nursery bed. */
export function potInNursery(state: GameState, uid: string, bedId: string, now: number): OwnedPlant | null {
  if (occupantOf(state, { bedId })) return null;
  const item = takeFromBasket(state, uid);
  if (!item) return null;
  const plant = newPlantFrom(item, { kind: 'nursery', bedId }, now);
  state.plants[plant.id] = plant;
  return plant;
}

export type PlacementBlock = 'not-established' | 'not-rooted';

/** Displaying or planting out needs a rooted plant of a species you've grown twice. */
export function placementBlockReason(state: GameState, item: BasketItem): PlacementBlock | null {
  if (!isRooted(item.growth)) return 'not-rooted';
  if (!isEstablished(state, item.defId)) return 'not-established';
  return null;
}

export function placeOnDisplay(state: GameState, uid: string, slotId: string, potId: string, now: number): OwnedPlant | null {
  if (occupantOf(state, { slotId })) return null;
  const item = state.basket.find((i) => i.uid === uid);
  if (!item || placementBlockReason(state, item)) return null;
  takeFromBasket(state, uid);
  const plant = newPlantFrom(item, { kind: 'display', slotId, potId }, now);
  state.plants[plant.id] = plant;
  ensureRecord(state, item.defId, now).displayed += 1;
  return plant;
}

/** Plants a carried plant into the ground outdoors, for good. */
export function plantOutdoors(state: GameState, uid: string, x: number, y: number, zone: OutdoorZoneId, now: number): OwnedPlant | null {
  const item = state.basket.find((i) => i.uid === uid);
  if (!item || placementBlockReason(state, item)) return null;
  takeFromBasket(state, uid);
  const plant = newPlantFrom(item, { kind: 'wild', x, y, zone }, now);
  state.plants[plant.id] = plant;
  ensureRecord(state, item.defId, now).plantedOut += 1;
  return plant;
}

/** Lifts a nursery or display plant back into the basket, pot and all. Outdoor plants stay put. */
export function liftPlant(state: GameState, plantId: string, now: number): BasketItem | null {
  const plant = state.plants[plantId];
  if (!plant || plant.location.kind === 'wild' || basketFull(state)) return null;
  const item = addToBasket(state, {
    defId: plant.defId,
    variantId: plant.variantId,
    seed: plant.seed,
    growth: plant.growth,
    generation: plant.generation,
    origin: 'lifted',
    collectedAt: now,
    countedGrown: plant.countedGrown,
    potId: plant.location.kind === 'display' ? plant.location.potId : undefined,
  });
  if (!item) return null;
  delete state.plants[plantId];
  return item;
}

export function setPot(state: GameState, plantId: string, potId: string) {
  const plant = state.plants[plantId];
  if (plant && plant.location.kind === 'display') plant.location.potId = potId;
}

/**
 * Counts plants reaching "established" in the player's care toward the
 * species' establishment. Returns the species that just crossed the line.
 */
export function creditGrown(state: GameState, plantId: string, now: number): string | null {
  const plant = state.plants[plantId];
  if (!plant || plant.bornWild || plant.countedGrown) return null;
  if (stageIndexOf(plant.growth) < 2) return null;
  plant.countedGrown = true;
  const rec = ensureRecord(state, plant.defId, now);
  const wasEstablished = isEstablished(state, plant.defId);
  rec.grown += 1;
  return !wasEstablished && isEstablished(state, plant.defId) ? plant.defId : null;
}

export function isRarerThanStandard(defId: string, variantId: string): boolean {
  const def = PLANTS[defId];
  const v = def?.variants.find((x) => x.id === variantId);
  return !!def && !!v && rarityRank(v.rarity) > rarityRank(def.variants[0].rarity);
}
