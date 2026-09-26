import type { GameState, GrowthStage, OwnedPlant, PlacedFurniture } from '../state';
import { PLANTS } from '../data/plants';
import { GROW_LAMP_BOOST } from '../data/furniture';
import { allFurniture, growLampCenters, underGrowLamp } from './furniture';
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

/** 0 (fresh cutting) … 4 (specimen), continuous, for drawing growth smoothly between stages. */
export function stageFloat(growth: number): number {
  const i = stageIndexOf(growth);
  if (i === STAGES.length - 1) return Math.min(4.6, 4 + (growth - STAGE_AT.specimen) / (STAGE_AT.specimen * 2));
  const a = STAGE_AT[STAGES[i]];
  const b = STAGE_AT[STAGES[i + 1]];
  return i + (growth - a) / (b - a);
}

export function isRooted(growth: number): boolean {
  return growth >= STAGE_AT.young;
}

/** Plants in a garden bed grow a little faster. */
export const BED_GROWTH_BOOST = 1.15;

/** Lookups shared by every plant in one growth tick, so they're built once. */
export interface GrowthContext {
  lamps: { x: number; y: number }[];
  furniture: Map<string, PlacedFurniture>;
}

export function growthContext(state: GameState): GrowthContext {
  return { lamps: growLampCenters(state), furniture: new Map(allFurniture(state).map((f) => [f.id, f])) };
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
    const c = ctx ?? growthContext(state);
    if (c.lamps.length) {
      const pieceId = plant.location.kind === 'nursery' ? plant.location.bedId : plant.location.slotId;
      if (underGrowLamp(c.lamps, c.furniture.get(pieceId))) m *= GROW_LAMP_BOOST;
    }
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
export function tickGrowth(state: GameState, minutes: number): StageUp[] {
  const ups: StageUp[] = [];
  if (minutes <= 0) return ups;
  const ctx = growthContext(state);
  for (const plant of Object.values(state.plants)) {
    const before = stageIndexOf(plant.growth);
    const grown = plant.growth + minutes * growthMultiplier(state, plant, ctx);
    plant.growth = grown;
    const after = stageIndexOf(plant.growth);
    if (after !== before) ups.push({ plantId: plant.id, from: STAGES[before], to: STAGES[after] });
  }
  return ups;
}
