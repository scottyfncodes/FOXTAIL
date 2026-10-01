import type { GameState, GardenBed, FoxFind } from '../state';
import type { PlantForm } from '../types';
import { PLANTS, lookFor } from '../data/plants';
import { isNight } from '../engine/Clock';
import { bedContains, plantsInBed } from './landscape';
import { createFoxFinds } from './foxFinds';
import { isRooted } from './growth';

// A garden bed as a little ecosystem. What lives in it is what matters: a
// mix of kinds — something that trails, something that flowers, a fern, a
// succulent — draws more life than a row of one thing. The bed's card says
// how lively it is and what it's missing, butterflies show it by day and
// glow-worms after dark, and the liveliest beds throw sports more often,
// let odd seeds in with their visitors, and now and then turn up a
// curiosity of their own.

/** The kinds of plant a bed can be made up of. */
export type BedRole = 'trailer' | 'flowerer' | 'fern' | 'broadleaf' | 'succulent' | 'carnivore' | 'fungus' | 'groundcover';

export const BED_ROLES: BedRole[] = ['trailer', 'flowerer', 'fern', 'broadleaf', 'succulent', 'carnivore', 'fungus', 'groundcover'];

/** How each is named when the bed has it. */
export const ROLE_HAS: Record<BedRole, string> = {
  trailer: 'a trailer',
  flowerer: 'a flowerer',
  fern: 'a fern',
  broadleaf: 'a broad-leaved plant',
  succulent: 'a succulent',
  carnivore: 'a carnivore',
  fungus: 'mushrooms',
  groundcover: 'a ground cover',
};

/** How each is asked for, on the bed's card. */
export const ROLE_WANT: Record<BedRole, string> = {
  trailer: 'something that trails',
  flowerer: 'something that flowers',
  fern: 'a fern',
  broadleaf: 'a broad-leaved plant',
  succulent: 'a succulent',
  carnivore: 'a carnivore',
  fungus: 'some mushrooms',
  groundcover: 'something to cover the ground',
};

const FORM_ROLE: Record<PlantForm, BedRole> = {
  trailing: 'trailer',
  beads: 'trailer',
  bloom: 'flowerer',
  fern: 'fern',
  splitleaf: 'broadleaf',
  heart: 'broadleaf',
  patterned: 'broadleaf',
  fig: 'broadleaf',
  fan: 'broadleaf',
  palm: 'broadleaf',
  cane: 'broadleaf',
  coin: 'broadleaf',
  strappy: 'broadleaf',
  palmate: 'broadleaf',
  rosette: 'succulent',
  spear: 'succulent',
  column: 'succulent',
  globe: 'succulent',
  paddle: 'succulent',
  jade: 'succulent',
  spiky: 'succulent',
  stones: 'succulent',
  trap: 'carnivore',
  dew: 'carnivore',
  pitcher: 'carnivore',
  cups: 'carnivore',
  mushroom: 'fungus',
  bracket: 'fungus',
  coral: 'fungus',
  moss: 'groundcover',
  mat: 'groundcover',
  trefoil: 'groundcover',
  runner: 'groundcover',
  climber: 'trailer',
  clump: 'broadleaf',
  bamboo: 'broadleaf',
  lilypad: 'broadleaf',
  cattail: 'broadleaf',
};

/** What a plant brings to a bed. A flowering broadleaf counts as both. */
export function plantRoles(defId: string, variantId: string): BedRole[] {
  const def = PLANTS[defId];
  if (!def) return [];
  const roles: BedRole[] = [FORM_ROLE[def.form]];
  if (lookFor(defId, variantId).flowers && !roles.includes('flowerer')) roles.push('flowerer');
  return roles;
}

export const LIVELINESS_WORDS = ['Bare', 'Quiet', 'Stirring', 'Lively', 'Humming'] as const;
/** Species and kinds each count for half; this many of each is as good as it gets. */
export const FULL_SPECIES = 5;
export const FULL_ROLES = 4;
/** From this tier up, the bed's ecology kicks in (sports, volunteers, curiosities). */
export const LIVELY_TIER = 3;

export interface Liveliness {
  /** 0…1. */
  score: number;
  /** 0 (bare) … 4 (humming). */
  tier: number;
  word: (typeof LIVELINESS_WORDS)[number];
  species: number;
  roles: BedRole[];
  /** Kinds it hasn't got, in the order they're worth suggesting. */
  missing: BedRole[];
  plants: number;
}

/** How much life a bed has in it. Only rooted plants count: a cutting isn't a plant yet. */
export function bedLiveliness(state: GameState, bedId: string): Liveliness {
  const plants = plantsInBed(state, bedId).filter((p) => isRooted(p.growth));
  const species = new Set(plants.map((p) => p.defId)).size;
  const roles = new Set<BedRole>();
  for (const p of plants) for (const r of plantRoles(p.defId, p.variantId)) roles.add(r);
  const score = plants.length === 0 ? 0 : 0.5 * Math.min(1, species / FULL_SPECIES) + 0.5 * Math.min(1, roles.size / FULL_ROLES);
  const tier = score >= 0.85 ? 4 : score >= 0.65 ? 3 : score >= 0.4 ? 2 : score > 0 ? 1 : 0;
  return {
    score,
    tier,
    word: LIVELINESS_WORDS[tier],
    species,
    roles: BED_ROLES.filter((r) => roles.has(r)),
    missing: BED_ROLES.filter((r) => !roles.has(r)),
    plants: plants.length,
  };
}

/** Whether the bed is lively enough for its ecology to kick in. */
export function isBedLively(state: GameState, bedId: string): boolean {
  return bedLiveliness(state, bedId).tier >= LIVELY_TIER;
}

/** Chance per game-hour that a humming bed turns up a curiosity of its own. */
export const BED_CURIOSITY_CHANCE = 0.012;

function findInBed(state: GameState, bed: GardenBed): FoxFind | undefined {
  return state.foxFinds.find((f) => f.kind === 'curiosity' && bedContains(bed, f.x, f.y));
}

/**
 * The liveliest beds draw more than butterflies: every so often a
 * curiosity turns up in one, waiting like the ones at the end of a fox's
 * trail. At most one waits in a bed at a time.
 */
export function tickBedCuriosities(state: GameState, hours: number, now: number, rand: () => number = Math.random, isClear: (x: number, y: number) => boolean = () => true): FoxFind[] {
  const out: FoxFind[] = [];
  if (hours <= 0) return out;
  for (const bed of state.gardenBeds) {
    if (bedLiveliness(state, bed.id).tier < 4 || findInBed(state, bed)) continue;
    if (rand() >= 1 - Math.pow(1 - BED_CURIOSITY_CHANCE, hours)) continue;
    // Somewhere inside the bed, off its plants.
    for (let i = 0; i < 8; i++) {
      const x = bed.x + 0.5 + rand() * (bed.w - 1);
      const y = bed.y + 0.5 + rand() * (bed.h - 1);
      if (!bedContains(bed, x, y, 0.3) || !isClear(x, y)) continue;
      const zone = plantsInBed(state, bed.id)[0]?.location;
      const z = zone && zone.kind === 'wild' ? zone.zone : 'meadow';
      out.push(...createFoxFinds(state, x, y, z, 'curiosity', { night: isNight(now), rain: state.weather.condition === 'rain' }, now, rand, isClear).filter((f) => f.kind === 'curiosity'));
      break;
    }
  }
  return out;
}
