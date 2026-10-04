import type { DiscoverySpot, OutdoorZoneId, PlantDef, Rarity } from '../types';
import type { GameState } from '../state';
import { PLANTS, PLANT_LIST, rarityRank } from '../data/plants';
import { DISCOVERY_SPOTS, SPOT_EPOCH_MINUTES } from '../data/discoveryPoints';
import { hashString, mulberry32, weightedPick } from '../engine/Random';
import { isNight } from '../engine/Clock';
import { addToBasket, basketFull } from './basket';
import { hasFound, recordFound } from './collection';
import { variantAllowed } from './lineage';
import { isOctober } from '../season';

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

// The plant list and the patches never change while the game runs, so each
// patch's pool is worked out once: it's asked for every frame, for every patch.
const poolCache = new WeakMap<DiscoverySpot, readonly PlantDef[]>();

/** The species that can come up in a patch (shared: don't modify it). */
export function spotPool(spot: DiscoverySpot): readonly PlantDef[] {
  let pool = poolCache.get(spot);
  if (!pool) {
    pool = spot.pool ? spot.pool.map((id) => PLANTS[id]).filter(Boolean) : PLANT_LIST.filter((p) => !p.foxOnly && !p.secret && !p.season && p.habitat.includes(spot.zone));
    poolCache.set(spot, pool);
  }
  return pool;
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

  // A fox's secret patch shows its rare plant once. After that it moves on.
  if (spot.foxLed && ss?.collectedEpoch !== undefined) return null;
  const wanderer = wanderingRareAt(state, spot, epoch);
  if (wanderer) return wanderer;
  const seasonal = seasonalAt(state, spot, epoch);
  if (seasonal) return seasonal;

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

/** While the October look is on: the chance, each patch season, that a patch comes up as something of the season instead. */
export const SEASONAL_CHANCE = 0.14;

/** The season's plants that could come up in this patch now (none outside October). */
export function seasonalPool(state: GameState, spot: DiscoverySpot): PlantDef[] {
  if (!isOctober() || spot.foxLed || spot.pool) return [];
  return octoberNatives(spot.zone).filter((p) => conditionMet(state, p));
}

const octoberByZone = new Map<OutdoorZoneId, readonly PlantDef[]>();
/** October's own plants native to a zone, in list order (worked out once). */
function octoberNatives(zone: OutdoorZoneId): readonly PlantDef[] {
  let list = octoberByZone.get(zone);
  if (!list) {
    list = PLANT_LIST.filter((p) => p.season === 'october' && !p.secret && p.habitat.includes(zone));
    octoberByZone.set(zone, list);
  }
  return list;
}

/**
 * October's own plants, now and then, in place of the usual. Rolled on its
 * own stream so the ordinary patches come up exactly as they always would
 * whenever this doesn't.
 */
function seasonalAt(state: GameState, spot: DiscoverySpot, epoch: number): SpotContent | null {
  const pool = seasonalPool(state, spot);
  if (!pool.length) return null;
  const rand = mulberry32(hashString(`${spot.id}:${epoch}:october`));
  if (rand() >= SEASONAL_CHANCE) return null;
  const def = weightedPick(pool, (p) => SPECIES_WEIGHT[p.rarity], rand);
  if (!def) return null;
  const variant = weightedPick(def.variants, (v) => (v.sportOnly || !variantAllowed(state, def.id, v.id) ? 0 : v === def.variants[0] ? 100 : VARIANT_WEIGHT[v.rarity]), rand) ?? def.variants[0];
  return { defId: def.id, variantId: variant.id, seed: Math.floor(rand() * 1e9) };
}

/** Chance, each patch season, that a rare plant the fox once showed you comes up again somewhere in its region. */
export const WANDER_CHANCE = 0.3;

/** Ordinary patches in a region that a wandering rare plant might come up in. */
const hostsByZone = new Map<OutdoorZoneId, readonly DiscoverySpot[]>();
function wanderHosts(zone: OutdoorZoneId): readonly DiscoverySpot[] {
  let hosts = hostsByZone.get(zone);
  if (!hosts) {
    hosts = DISCOVERY_SPOTS.filter((s) => s.zone === zone && !s.foxLed && !s.pool);
    hostsByZone.set(zone, hosts);
  }
  return hosts;
}

function rawWanderHost(origin: DiscoverySpot, epoch: number): number | null {
  const rand = mulberry32(hashString(`${origin.id}:${epoch}:wander`));
  if (rand() >= WANDER_CHANCE) return null;
  return Math.floor(rand() * wanderHosts(origin.zone).length);
}

/**
 * Where a fox patch's rare plant has come up this season, if anywhere: a
 * different ordinary patch of its region each time it reappears, and never
 * the same one two seasons running.
 */
export function wanderHost(origin: DiscoverySpot, epoch: number): DiscoverySpot | null {
  const hosts = wanderHosts(origin.zone);
  if (!hosts.length) return null;
  const i = rawWanderHost(origin, epoch);
  if (i === null) return null;
  const prev = rawWanderHost(origin, epoch - 1);
  return hosts[(prev === i ? i + 1 : i) % hosts.length];
}

/** The rare plant from a fox's patch, come up in this ordinary patch this season (once it's been picked from its first home). */
function wanderingRareAt(state: GameState, spot: DiscoverySpot, epoch: number): SpotContent | null {
  if (spot.foxLed || spot.pool) return null;
  for (const origin of DISCOVERY_SPOTS) {
    if (!origin.foxLed || origin.zone !== spot.zone) continue;
    const os = state.spots[origin.id];
    if (!os?.revealed || os.collectedEpoch === undefined) continue;
    if (wanderHost(origin, epoch)?.id !== spot.id) continue;
    const rand = mulberry32(hashString(`${origin.id}:${epoch}:wander:plant`));
    const def = weightedPick(spotPool(origin).filter((d) => conditionMet(state, d)), (p) => SPECIES_WEIGHT[p.rarity] || 1, rand);
    if (!def) continue;
    const variant = weightedPick(def.variants, (v) => (v.sportOnly || !variantAllowed(state, def.id, v.id) ? 0 : v === def.variants[0] ? 100 : VARIANT_WEIGHT[v.rarity]), rand) ?? def.variants[0];
    return { defId: def.id, variantId: variant.id, seed: Math.floor(rand() * 1e9) };
  }
  return null;
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
    if (def.secret || def.foxOnly || def.season || !def.habitat.includes(zone) || !conditionMet(state, def)) continue;
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
