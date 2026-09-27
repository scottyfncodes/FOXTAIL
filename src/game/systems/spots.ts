import type { DiscoverySpot, OutdoorZoneId, PlantDef, Rarity } from '../types';
import type { GameState } from '../state';
import { PLANTS, PLANT_LIST, rarityRank } from '../data/plants';
import { SPOT_EPOCH_MINUTES } from '../data/discoveryPoints';
import { hashString, mulberry32, weightedPick } from '../engine/Random';
import { isNight } from '../engine/Clock';
import { addToBasket, basketFull } from './basket';
import { hasFound, recordFound } from './collection';
import { variantAllowed } from './lineage';

/** Relative odds of each species rarity turning up in a patch. */
export const SPECIES_WEIGHT: Record<Rarity, number> = { common: 100, uncommon: 36, rare: 10, veryRare: 2.5, extremelyRare: 0.7, unheardOf: 0, mythic: 0 };
/** Relative odds of each variant, compared with a common standard form at 100. */
export const VARIANT_WEIGHT: Record<Rarity, number> = { common: 100, uncommon: 20, rare: 5, veryRare: 1.2, extremelyRare: 0.3, unheardOf: 0, mythic: 0 };

export interface SpotContent {
  defId: string;
  variantId: string;
  seed: number;
}

export function spotEpoch(totalMinutes: number): number {
  return Math.floor(totalMinutes / SPOT_EPOCH_MINUTES);
}

function conditionMet(state: GameState, def: PlantDef): boolean {
  if (def.needsLantern && !state.tools.lantern) return false;
  if (def.appearsWhen === 'night' && !isNight(state.clock.totalMinutes)) return false;
  if (def.appearsWhen === 'rain' && state.weather.condition !== 'rain') return false;
  return true;
}

export function spotPool(spot: DiscoverySpot): PlantDef[] {
  if (spot.pool) return spot.pool.map((id) => PLANTS[id]).filter(Boolean);
  return PLANT_LIST.filter((p) => !p.foxOnly && !p.secret && p.habitat.includes(spot.zone));
}

/**
 * What's growing in a patch right now. Deterministic for a given spot and
 * epoch, so it doesn't flicker; conditional species (rain, night, lantern)
 * only show while their condition holds, and the patch falls back to an
 * ordinary find otherwise.
 */
export function spotContent(state: GameState, spot: DiscoverySpot): SpotContent | null {
  const ss = state.spots[spot.id];
  if (spot.foxLed && !ss?.revealed) return null;
  const epoch = spotEpoch(state.clock.totalMinutes);
  if (ss?.collectedEpoch !== undefined && ss.collectedEpoch >= epoch) return null;

  const hunch = ss?.hunch;
  if (hunch && hunch.epoch === epoch && PLANTS[hunch.defId] && conditionMet(state, PLANTS[hunch.defId])) {
    return { defId: hunch.defId, variantId: hunch.variantId, seed: hashString(`${spot.id}:${epoch}:hunch`) };
  }

  const rand = mulberry32(hashString(`${spot.id}:${epoch}`));
  const pool = spotPool(spot);
  let def = weightedPick(pool, (p) => SPECIES_WEIGHT[p.rarity], rand);
  if (def && !conditionMet(state, def)) {
    const fallback = pool.filter((p) => !p.appearsWhen && !p.needsLantern);
    def = weightedPick(fallback, (p) => SPECIES_WEIGHT[p.rarity], rand);
  }
  if (!def) return null;
  // Only the forms already found, and the next one along the line, ever grow in a patch.
  const variant = weightedPick(def.variants, (v) => (v.sportOnly || !variantAllowed(state, def!.id, v.id) ? 0 : v === def!.variants[0] ? 100 : VARIANT_WEIGHT[v.rarity]), rand) ?? def.variants[0];
  return { defId: def.id, variantId: variant.id, seed: Math.floor(rand() * 1e9) };
}

export interface HunchTarget {
  defId: string;
  variantId: string;
  rank: number;
}

/**
 * What the fox might know about in this zone: rare-or-better forms native
 * here, never found, next along their line, and in season right now (the
 * rain, the dark, the lantern) — so a hunch never skips a plant's weather.
 */
export function hunchTargets(state: GameState, zone: OutdoorZoneId): HunchTarget[] {
  const out: HunchTarget[] = [];
  for (const def of PLANT_LIST) {
    if (def.secret || def.foxOnly || !def.habitat.includes(zone) || !conditionMet(state, def)) continue;
    for (const v of def.variants) {
      if (v.sportOnly || !variantAllowed(state, def.id, v.id) || hasFound(state, def.id, v.id)) continue;
      const rank = Math.max(rarityRank(v.rarity), rarityRank(def.rarity));
      if (rank >= 2) out.push({ defId: def.id, variantId: v.id, rank });
    }
  }
  return out;
}

export interface CollectSpotResult {
  ok: boolean;
  reason?: 'nothing-here' | 'basket-full';
  content?: SpotContent;
  newSpecies?: boolean;
  newVariant?: boolean;
}

/** Takes a cutting from a wild plant. The patch regrows — as something new, maybe — next epoch. */
export function collectSpot(state: GameState, spot: DiscoverySpot, now: number): CollectSpotResult {
  const content = spotContent(state, spot);
  if (!content) return { ok: false, reason: 'nothing-here' };
  if (basketFull(state)) return { ok: false, reason: 'basket-full', content };
  addToBasket(state, {
    defId: content.defId,
    variantId: content.variantId,
    seed: content.seed,
    growth: 0,
    generation: 0,
    origin: 'wild',
    collectedAt: now,
  });
  state.spots[spot.id] = { ...(state.spots[spot.id] ?? {}), collectedEpoch: spotEpoch(now) };
  const found = recordFound(state, content.defId, content.variantId, now);
  return { ok: true, content, newSpecies: found.newSpecies, newVariant: found.newVariant };
}
