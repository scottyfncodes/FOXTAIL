import type { GameState, GrowthStage, OwnedPlant, PlacedFurniture } from '../state';
import type { PlantForm } from '../types';
import { PLANTS } from '../data/plants';
import { hashString, mulberry32 } from '../engine/Random';
import { SpatialGrid } from './spatial';
import { allFurniture } from './furniture';
import { gardenPlanter } from './decor';
import { zoneAt } from '../data/worldMap';

export const STAGES: GrowthStage[] = ['cutting', 'young', 'established', 'large', 'specimen'];

export const STAGE_LABEL: Record<GrowthStage, string> = {
  cutting: 'Cutting',
  young: 'Young',
  established: 'Established',
  large: 'Large',
  specimen: 'Specimen',
};

/**
 * Cumulative growth (effective game-minutes) needed to reach each stage.
 * At 2 game-minutes per real second: a cutting roots in about a minute and
 * a half, is established a few minutes later, and takes the better part of
 * half an hour of real time (or one long absence) to become a specimen.
 */
export const STAGE_AT: Record<GrowthStage, number> = {
  cutting: 0,
  young: 180,
  established: 540,
  large: 1500,
  specimen: 3600,
};

export function stageIndexOf(growth: number): number {
  let i = 0;
  while (i < STAGES.length - 1 && growth >= STAGE_AT[STAGES[i + 1]]) i++;
  return i;
}

export function stageOf(growth: number): GrowthStage {
  return STAGES[stageIndexOf(growth)];
}

/**
 * Past specimen a plant never stops: it keeps filling out — more fronds,
 * offshoots round its base, longer vines, a denser clump — easing toward
 * MATURE_SF. MATURITY_K is how much more growth (effective game-minutes)
 * that takes: about two thirds of the way after MATURITY_K, nearly all of
 * it after three times that. A few days away is enough to see it.
 */
export const MATURE_SF = 6;
export const MATURITY_K = 12000;

/**
 * 0 (fresh cutting) … 4 (specimen) … MATURE_SF (long-established and
 * overgrown), continuous, for drawing growth smoothly between stages.
 */
export function stageFloat(growth: number): number {
  const i = stageIndexOf(growth);
  if (i === STAGES.length - 1) return 4 + (MATURE_SF - 4) * (1 - Math.exp(-(growth - STAGE_AT.specimen) / MATURITY_K));
  const a = STAGE_AT[STAGES[i]];
  const b = STAGE_AT[STAGES[i + 1]];
  return i + (growth - a) / (b - a);
}

/** 0 at specimen, rising to 1 as a plant fills out into its fullest, overgrown self. */
export function maturity(growth: number): number {
  return Math.max(0, (stageFloat(growth) - 4) / (MATURE_SF - 4));
}

// ---------------------------------------------------------------- Titans
//
// Now and then a plant given long enough in its own country doesn't stop at
// its fullest: it grows on into a Titan, a garden centrepiece far beyond
// any ordinary specimen. Which plants can is fixed from the day they're
// planted (a roll on the plant's own seed, so it's the same every time the
// game asks), and only so many of a kind stand near each other.

/** Past MATURE_SF a Titan keeps growing toward this. */
export const TITAN_SF = 7;
/** Growth (effective game-minutes) past turning Titan for it to fill out about two thirds of the way. */
export const TITAN_K = 14000;
/** How filled-out (maturity, 0…1) an eligible plant must be before it turns. */
export const TITAN_READY = 0.8;
/** No two Titans of one species closer than this (tiles): the contrast is the point. */
export const TITAN_SPACING = 8;

/** How likely each form is to turn Titan, for species that don't say. Small, low things never do. */
const FORM_TITAN: Partial<Record<PlantForm, number>> = {
  fern: 0.1,
  splitleaf: 0.1,
  bamboo: 0.1,
  clump: 0.1,
  heart: 0.08,
  palm: 0.08,
  fan: 0.08,
  fig: 0.08,
  cane: 0.06,
  palmate: 0.06,
  patterned: 0.06,
  strappy: 0.06,
  cattail: 0.06,
  bloom: 0.04,
};

export function titanChance(defId: string): number {
  const def = PLANTS[defId];
  if (!def) return 0;
  return def.titanChance ?? FORM_TITAN[def.form] ?? 0;
}

/** This plant's own fixed roll (0…1) against its species' Titan chance. */
export function titanRoll(p: Pick<OwnedPlant, 'id' | 'seed'>): number {
  return mulberry32(hashString(`${p.id}:${p.seed}:titan`))();
}

/** Whether this plant was born with it in it: planted out, in its own country, a lucky roll. */
export function titanEligible(p: OwnedPlant): boolean {
  if (p.location.kind !== 'wild') return false;
  const def = PLANTS[p.defId];
  if (!def || def.water === 'only' || !def.habitat.includes(p.location.zone)) return false;
  return titanRoll(p) < titanChance(p.defId);
}

/** 0 until it turns Titan, then rising toward 1 as the Titan fills out. */
export function titanFill(p: Pick<OwnedPlant, 'growth' | 'titanAt'>): number {
  if (p.titanAt === undefined) return 0;
  return 1 - Math.exp(-Math.max(0, p.growth - p.titanAt) / TITAN_K);
}

/** How grown to draw this plant: stageFloat, carried on past MATURE_SF if it's a Titan. */
export function plantSf(p: Pick<OwnedPlant, 'growth' | 'titanAt'>): number {
  const sf = stageFloat(p.growth);
  return p.titanAt === undefined ? sf : MATURE_SF + (TITAN_SF - MATURE_SF) * titanFill(p);
}

/**
 * Turns every plant that's ready into a Titan, and returns their ids.
 * Deterministic: the same garden gives the same Titans.
 */
export function checkTitans(state: GameState): string[] {
  const out: string[] = [];
  let grid: SpatialGrid<OwnedPlant> | null = null;
  for (const p of Object.values(state.plants)) {
    if (p.titanAt !== undefined || p.location.kind !== 'wild' || maturity(p.growth) < TITAN_READY || !titanEligible(p)) continue;
    if (!grid) {
      grid = new SpatialGrid<OwnedPlant>(4);
      for (const o of Object.values(state.plants)) if (o.titanAt !== undefined && o.location.kind === 'wild') grid.insert(o.location.x, o.location.y, o);
    }
    const { x, y } = p.location;
    let crowded = false;
    grid.query(x, y, TITAN_SPACING, (o) => {
      if (o.defId === p.defId && o.location.kind === 'wild' && Math.hypot(o.location.x - x, o.location.y - y) < TITAN_SPACING) {
        crowded = true;
        return true;
      }
      return false;
    });
    if (crowded) continue;
    p.titanAt = p.growth;
    grid.insert(x, y, p);
    const rec = state.collection[p.defId];
    if (rec) rec.titan = true;
    out.push(p.id);
  }
  return out;
}

// ---------------------------------------------------------------- Garden stages
//
// What the player sees of a plant out in the valley, in four steps (and a
// rare fifth): the collection's own stages (cutting … specimen) still decide
// rooting, establishing and spreading underneath.

export type GardenStage = 'establishing' | 'developing' | 'mature' | 'overgrown' | 'titan';

export const GARDEN_STAGE_LABEL: Record<GardenStage, string> = {
  establishing: 'Establishing',
  developing: 'Developing',
  mature: 'Mature',
  overgrown: 'Overgrown',
  titan: 'Titan',
};

/** Where an overgrown plant begins: halfway from specimen to its fullest. */
export const OVERGROWN_SF = 5;

export function gardenStageOf(p: Pick<OwnedPlant, 'growth' | 'titanAt'>): GardenStage {
  if (p.titanAt !== undefined) return 'titan';
  const sf = stageFloat(p.growth);
  if (sf < 2) return 'establishing';
  if (sf < 4) return 'developing';
  if (sf < OVERGROWN_SF) return 'mature';
  return 'overgrown';
}

export function isRooted(growth: number): boolean {
  return growth >= STAGE_AT.young;
}

/** Plants in a garden bed grow a little faster. */
export const BED_GROWTH_BOOST = 1.15;

/** Lookups shared by every plant in one growth tick, so they're built once. */
export interface GrowthContext {
  furniture: Map<string, PlacedFurniture>;
}

export function growthContext(state: GameState): GrowthContext {
  return { furniture: new Map(allFurniture(state).map((f) => [f.id, f])) };
}

/** Growth per game-minute for this plant where it currently lives. */
export function growthMultiplier(state: GameState, plant: OwnedPlant, ctx?: GrowthContext): number {
  const def = PLANTS[plant.defId];
  if (!def) return 0;
  let m = def.growthRate;
  const planter = plant.location.kind === 'display' ? gardenPlanter(state, plant.location.slotId) : undefined;
  if (plant.location.kind === 'wild') {
    // Planted out in its own kind of country, a plant romps away; anywhere
    // else it still grows, just more slowly.
    m *= def.habitat.includes(plant.location.zone) ? 1.3 : 0.85;
    if (plant.location.bedId) m *= BED_GROWTH_BOOST;
  } else if (planter) {
    // Potted up on a garden trellis it's outdoors, in whatever country the trellis stands in.
    const zone = zoneAt(Math.floor(planter.x), Math.floor(planter.y));
    m *= zone !== 'greenhouse' && def.habitat.includes(zone) ? 1.3 : 0.85;
  } else {
    if (state.owned.includes('roofLights')) m *= 2;
    else if (state.owned.includes('growLights')) m *= 1.5;
    void ctx;
  }
  return m;
}

/** Game-minutes until the next stage, or null if it's already a specimen. */
export function minutesToNextStage(state: GameState, plant: OwnedPlant): number | null {
  const i = stageIndexOf(plant.growth);
  if (i >= STAGES.length - 1) return null;
  const need = STAGE_AT[STAGES[i + 1]] - plant.growth;
  return need / Math.max(0.01, growthMultiplier(state, plant));
}

export interface StageUp {
  plantId: string;
  from: GrowthStage;
  to: GrowthStage;
}

/** Advances every owned plant by `minutes` of game time. Nothing ever dies or shrinks. */
export function tickGrowth(state: GameState, minutes: number, only?: (plant: OwnedPlant) => boolean): StageUp[] {
  const ups: StageUp[] = [];
  if (minutes <= 0) return ups;
  const ctx = growthContext(state);
  for (const plant of Object.values(state.plants)) {
    if (only && !only(plant)) continue;
    const before = stageIndexOf(plant.growth);
    const grown = plant.growth + minutes * growthMultiplier(state, plant, ctx);
    plant.growth = grown;
    const after = stageIndexOf(plant.growth);
    if (after !== before) ups.push({ plantId: plant.id, from: STAGES[before], to: STAGES[after] });
  }
  return ups;
}
