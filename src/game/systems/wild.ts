import type { GameState, OwnedPlant } from '../state';
import { makeUid } from '../state';
import type { LandscapeCharacter, OutdoorZoneId, PlantForm } from '../types';
import { PLANTS, lookFor } from '../data/plants';
import { GRID_W, GRID_H, zoneAt, isWater } from '../data/worldMap';
import { stageFloat, stageIndexOf, tickGrowth, type StageUp } from './growth';
import { rollSport, crossOf } from './propagation';
import { hasFound } from './collection';
import { journalComplete, variantAllowed } from './lineage';
import { SpatialGrid } from './spatial';
import { bedContains, onPath } from './landscape';
import { bedLiveliness, LIVELY_TIER } from './beds';
import { inPond } from './koi';

// Plants the player puts outdoors aren't decorations: once they're large
// they start seeding, creeping and throwing out runners into the ground
// around them, and every so often one of those new plants comes up as
// something different. Left alone long enough, a region disappears under
// whatever the player chose to plant there.

/** Game-minutes between spread checks. */
export const SPREAD_STEP = 60;
export const WILD_ZONE_CAP = 140;
/** No single species takes over a region completely: there's always room for the next thing. */
export const WILD_SPECIES_ZONE_CAP = 55;
export const WILD_TOTAL_CAP = 560;
const SEEDLING_SPORT_CHANCE = 0.035;
/**
 * A bed lively enough (see systems/beds.ts: a mix of species and kinds)
 * draws birds and insects, and odd seeds come in with them.
 */
export const DIVERSE_BED_SPECIES = 5;
/** Sports come up more often among a mix of species. */
const DIVERSE_SPORT_BOOST = 1.6;
/** Chance a seedling in a diverse bed is something no one planted. */
export const VOLUNTEER_CHANCE = 0.004;
export const VOLUNTEER_SPECIES = 'cannabisSativa';
/** Every species that can come up as a volunteer. */
export const VOLUNTEER_POOL = ['cannabisSativa', 'cannabisIndica'];
/** Chance a seedling of one cannabis parent, with the other growing close by, comes up a cross. */
export const CROSS_SEEDLING_CHANCE = 0.25;
const CROSS_RADIUS = 3;
/**
 * Once the field journal is complete, the valley's own cannabis starts
 * coming up wild on open ground in its home regions: slowly, one seedling
 * every couple of days on average, and only until a few have taken hold.
 * After that they spread (or don't) like anything else outdoors.
 */
export const SELF_SOW_CHANCE = 0.02;
/** No new self-sown seedlings while this many cannabis plants already grow wild. */
export const SELF_SOW_MAX = 5;
/** Forms that run along the ground (or climb over it), so their seedlings come up a little further out. */
const RUNNING_FORMS: PlantForm[] = ['trailing', 'beads', 'runner', 'climber', 'mat', 'moss', 'trefoil'];
const MIN_SPACING = 0.85;
const CROWD_RADIUS = 2;
const CROWD_LIMIT = 7;

export interface SpreadEvent {
  parentId: string;
  childId: string;
  /** The seedling came up as a different variant from its parent. */
  sport: boolean;
}

export type GroundCheck = (tileX: number, tileY: number) => boolean;

function wildPlants(state: GameState): OwnedPlant[] {
  return Object.values(state.plants).filter((p) => p.location.kind === 'wild');
}

function tooClose(plants: OwnedPlant[] | SpatialGrid<OwnedPlant>, x: number, y: number): { tooClose: boolean; crowd: number } {
  let crowd = 0;
  let close = false;
  const check = (p: OwnedPlant) => {
    if (p.location.kind !== 'wild') return false;
    const d = Math.hypot(p.location.x - x, p.location.y - y);
    if (d < MIN_SPACING) {
      close = true;
      return true;
    }
    if (d < CROWD_RADIUS) crowd++;
    return false;
  };
  if (Array.isArray(plants)) {
    for (const p of plants) if (check(p)) break;
  } else plants.query(x, y, CROWD_RADIUS, check);
  return { tooClose: close, crowd };
}

/** Whether a new plant could go at (x, y): open ground, not crowded, not on top of another plant. */
export function canPlantAt(state: GameState, x: number, y: number, isOpenGround: GroundCheck): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return false;
  if (zoneAt(tx, ty) === 'greenhouse' || isWater(tx, ty)) return false;
  if (!isOpenGround(tx, ty)) return false;
  return !tooClose(wildPlants(state), x, y).tooClose;
}

/** One spread check across every outdoor plant. */
export function spreadStep(state: GameState, isOpenGround: GroundCheck, now: number, rand: () => number): SpreadEvent[] {
  const events: SpreadEvent[] = [];
  const wild = wildPlants(state);
  if (wild.length >= WILD_TOTAL_CAP) return events;
  const perZone: Partial<Record<OutdoorZoneId, number>> = {};
  const perSpecies: Record<string, number> = {};
  for (const p of wild) {
    if (p.location.kind !== 'wild') continue;
    perZone[p.location.zone] = (perZone[p.location.zone] ?? 0) + 1;
    perSpecies[`${p.location.zone}:${p.defId}`] = (perSpecies[`${p.location.zone}:${p.defId}`] ?? 0) + 1;
  }

  const grid = new SpatialGrid<OwnedPlant>(2);
  for (const p of wild) if (p.location.kind === 'wild') grid.insert(p.location.x, p.location.y, p);
  // How lively each bed is, worked out once: a varied bed is a livelier ecosystem.
  const bedTier = new Map<string, number>();
  for (const bed of state.gardenBeds) bedTier.set(bed.id, bedLiveliness(state, bed.id).tier);
  // Nothing nobody planted comes up until the field journal is complete: every listed plant, in every form, grown.
  const gateOpen = journalComplete(state);

  for (const parent of wild) {
    if (parent.location.kind !== 'wild') continue;
    const stage = stageIndexOf(parent.growth);
    if (stage < 3) continue;
    const def = PLANTS[parent.defId];
    if (!def) continue;
    // Per spread step (an in-game hour): a vigorous large pothos throws out a
    // new plant every day or two of game time; a slow aroid far less often.
    const chance = def.spread * 0.03 * (stage >= 4 ? 1.5 : 1);
    if (rand() >= chance) continue;

    // A plant in a garden bed spreads only within it; one outside never
    // seeds into a bed. Beds are the player's, and they stay that way.
    const bedId = parent.location.bedId;
    const bed = bedId ? state.gardenBeds.find((b) => b.id === bedId) : undefined;
    const tier = bed ? bedTier.get(bed.id) ?? 0 : 0;
    const diverse = !!bed && tier >= LIVELY_TIER;
    const reach = (RUNNING_FORMS.includes(def.form) ? 1.35 : 1) * (bed ? 0.8 : 1);
    for (let attempt = 0; attempt < (bed ? 6 : 4); attempt++) {
      const a = rand() * Math.PI * 2;
      const d = (1.1 + rand() * 1.7) * reach;
      const x = parent.location.x + Math.cos(a) * d;
      const y = parent.location.y + Math.sin(a) * d;
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) continue;
      const zone = zoneAt(tx, ty);
      if (zone === 'greenhouse' || isWater(tx, ty) || !isOpenGround(tx, ty)) continue;
      if (bed ? !bedContains(bed, x, y, 0.2) : state.gardenBeds.some((b) => bedContains(b, x, y, -0.2))) continue;
      if (state.paths.length && onPath(state, x, y, now, true)) continue;
      if (inPond(state, x, y)) continue;
      if ((perZone[zone] ?? 0) >= WILD_ZONE_CAP) continue;
      if ((perSpecies[`${zone}:${parent.defId}`] ?? 0) >= WILD_SPECIES_ZONE_CAP) continue;
      const near = tooClose(grid, x, y);
      if (near.tooClose || near.crowd >= CROWD_LIMIT) continue;

      let defId = parent.defId;
      let variantId = parent.variantId;
      let sport = false;
      const cross = crossOf(parent.defId);
      const partnerNear =
        cross &&
        wild.some((o) => o.defId === cross.partner && o.location.kind === 'wild' && stageIndexOf(o.growth) >= 3 && Math.hypot(o.location.x - (parent.location as { x: number }).x, o.location.y - (parent.location as { y: number }).y) <= CROSS_RADIUS);
      if (cross && partnerNear && rand() < CROSS_SEEDLING_CHANCE) {
        // Wind-carried pollen from the other parent growing close by.
        defId = cross.child;
        variantId = PLANTS[cross.child].variants[0].id;
        sport = true;
      } else if (diverse && gateOpen && rand() < VOLUNTEER_CHANCE * (tier >= 4 ? 2 : 1) && PLANTS[VOLUNTEER_SPECIES]) {
        // Something nobody planted: a seed carried in by whatever visits a
        // bed this full of life.
        defId = VOLUNTEER_POOL[Math.floor(rand() * VOLUNTEER_POOL.length) % VOLUNTEER_POOL.length];
        variantId = PLANTS[defId].variants[0].id;
        sport = true;
      } else if (rand() < SEEDLING_SPORT_CHANCE * (diverse ? DIVERSE_SPORT_BOOST : 1)) {
        // The next form along the line — and only once the one before it has been found.
        const v = rollSport(parent.defId, parent.variantId, rand, diverse);
        if (v && variantAllowed(state, parent.defId, v)) {
          variantId = v;
          sport = true;
        }
      }
      const child: OwnedPlant = {
        id: makeUid('plant'),
        defId,
        variantId,
        seed: Math.floor(rand() * 1e9),
        growth: 0,
        location: { kind: 'wild', x, y, zone },
        plantedAt: now,
        lastCuttingAt: null,
        generation: parent.generation + 1,
        bornWild: true,
        unnoticed: !hasFound(state, defId, variantId),
      };
      if (bed && child.location.kind === 'wild') child.location.bedId = bed.id;
      state.plants[child.id] = child;
      wild.push(child);
      grid.insert(x, y, child);
      perZone[zone] = (perZone[zone] ?? 0) + 1;
      perSpecies[`${zone}:${parent.defId}`] = (perSpecies[`${zone}:${parent.defId}`] ?? 0) + 1;
      events.push({ parentId: parent.id, childId: child.id, sport });
      break;
    }
    if (wild.length >= WILD_TOTAL_CAP) break;
  }
  return events;
}

/**
 * One self-sowing check (an in-game hour). Returns the new seedling, if
 * one came up: somewhere open in the species' home regions, out of the
 * player's beds and off their paths. It isn't announced, and it doesn't
 * sparkle: it's just there, for whoever walks past.
 */
export function selfSowStep(state: GameState, isOpenGround: GroundCheck, now: number, rand: () => number): OwnedPlant | null {
  if (!journalComplete(state) || rand() >= SELF_SOW_CHANCE) return null;
  const wild = wildPlants(state);
  if (wild.length >= WILD_TOTAL_CAP) return null;
  if (wild.filter((p) => VOLUNTEER_POOL.includes(p.defId)).length >= SELF_SOW_MAX) return null;
  const defId = VOLUNTEER_POOL[Math.floor(rand() * VOLUNTEER_POOL.length) % VOLUNTEER_POOL.length];
  const def = PLANTS[defId];
  if (!def) return null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const x = 1 + rand() * (GRID_W - 2);
    const y = 1 + rand() * (GRID_H - 2);
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const zone = zoneAt(tx, ty);
    if (zone === 'greenhouse' || !def.habitat.includes(zone)) continue;
    if (isWater(tx, ty) || !isOpenGround(tx, ty)) continue;
    if (state.gardenBeds.some((b) => bedContains(b, x, y, -0.5))) continue;
    if (state.paths.length && onPath(state, x, y, now, true)) continue;
    const near = tooClose(wild, x, y);
    if (near.tooClose || near.crowd >= CROWD_LIMIT) continue;
    const variantId = def.variants[0].id;
    const plant: OwnedPlant = {
      id: makeUid('plant'),
      defId,
      variantId,
      seed: Math.floor(rand() * 1e9),
      growth: 0,
      location: { kind: 'wild', x, y, zone },
      plantedAt: now,
      lastCuttingAt: null,
      generation: 0,
      bornWild: true,
      unnoticed: !hasFound(state, defId, variantId),
    };
    state.plants[plant.id] = plant;
    return plant;
  }
  return null;
}

export interface WorldAdvance {
  ups: StageUp[];
  spreads: SpreadEvent[];
  /** Plants that came up wild by themselves, from no plant of the player's. */
  sown: string[];
  carry: number;
}

/**
 * Grows everything and lets outdoor plants spread, interleaved in
 * SPREAD_STEP chunks so a long absence plays out the same way as the same
 * time spent in-game: seedlings grow up and spread in their turn.
 */
export function advanceWorld(
  state: GameState,
  minutes: number,
  carry: number,
  isOpenGround: GroundCheck,
  rand: () => number = Math.random
): WorldAdvance {
  const ups: StageUp[] = [];
  const spreads: SpreadEvent[] = [];
  const sown: string[] = [];
  let left = minutes;
  let c = carry;
  const startNow = state.clock.totalMinutes - minutes;
  while (left > 1e-9) {
    const dt = Math.min(left, SPREAD_STEP - c);
    ups.push(...tickGrowth(state, dt));
    c += dt;
    left -= dt;
    if (c >= SPREAD_STEP - 1e-9) {
      c = 0;
      const at = startNow + (minutes - left);
      spreads.push(...spreadStep(state, isOpenGround, at, rand));
      const seedling = selfSowStep(state, isOpenGround, at, rand);
      if (seedling) sown.push(seedling.id);
    }
  }
  return { ups, spreads, sown, carry: c };
}

// ---------------------------------------------------------------- Lushness

export const CHARACTERS: LandscapeCharacter[] = ['fern', 'jungle', 'vine', 'flower', 'arid', 'color', 'strange'];

export interface LushField {
  /** 0…~2 per tile: how buried in the player's plants the ground is. */
  lush: Float32Array;
  /** Index into CHARACTERS of the tile's dominant landscape, or 255 for none. */
  character: Uint8Array;
  /**
   * The leaf colour of what covers each tile (hue, saturation, lightness,
   * weighted by cover) and how much of it is variegated, so overgrown
   * ground can be drawn as that plant's own foliage rather than a generic green.
   */
  leaf: Float32Array;
  pale: Float32Array;
  /** 0…1 per region: share of it that's been overgrown. */
  zoneCover: Record<OutdoorZoneId, number>;
  /** Number of the player's plants per region. */
  zoneCount: Record<OutdoorZoneId, number>;
  /** Dominant landscape per region. */
  zoneCharacter: Partial<Record<OutdoorZoneId, LandscapeCharacter>>;
}

const OUTDOOR_ZONES: OutdoorZoneId[] = ['meadow', 'woodland', 'creek', 'dampForest', 'rockyClearing', 'overgrownClearing'];
let tileZones: (OutdoorZoneId | null)[] | null = null;

function zonesByTile(): (OutdoorZoneId | null)[] {
  if (tileZones) return tileZones;
  tileZones = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const z = zoneAt(x, y);
      tileZones.push(z === 'greenhouse' || isWater(x, y) ? null : z);
    }
  }
  return tileZones;
}

export function computeLushness(state: GameState): LushField {
  const n = GRID_W * GRID_H;
  const lush = new Float32Array(n);
  // Plants in a garden bed are kept: they count toward how much of a region
  // is yours, but don't change the soil around the bed.
  const bedded = new Float32Array(n);
  const charW = new Float32Array(n * CHARACTERS.length);
  const leaf = new Float32Array(n * 3);
  const leafW = new Float32Array(n);
  const paleW = new Float32Array(n);
  const zoneCount = Object.fromEntries(OUTDOOR_ZONES.map((z) => [z, 0])) as Record<OutdoorZoneId, number>;
  const zoneCharW: Record<string, number[]> = Object.fromEntries(OUTDOOR_ZONES.map((z) => [z, CHARACTERS.map(() => 0)]));

  for (const p of Object.values(state.plants)) {
    if (p.location.kind !== 'wild') continue;
    const def = PLANTS[p.defId];
    if (!def) continue;
    const look = lookFor(p.defId, p.variantId);
    const sf = stageFloat(p.growth);
    const r = (0.7 + sf * 0.6) * Math.max(0.7, look.size);
    const w = 0.18 + sf * 0.16;
    const ci = CHARACTERS.indexOf(def.landscape);
    const variegated = look.variegation !== 'none' && look.variegation !== 'glow';
    zoneCount[p.location.zone]++;
    zoneCharW[p.location.zone][ci] += w;
    const { x, y, bedId } = p.location;
    const x0 = Math.max(0, Math.floor(x - r));
    const x1 = Math.min(GRID_W - 1, Math.floor(x + r));
    const y0 = Math.max(0, Math.floor(y - r));
    const y1 = Math.min(GRID_H - 1, Math.floor(y + r));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y);
        if (d >= r) continue;
        const v = w * (1 - d / r);
        const i = ty * GRID_W + tx;
        if (bedId) {
          bedded[i] += v;
          continue;
        }
        lush[i] += v;
        charW[i * CHARACTERS.length + ci] += v;
        leaf[i * 3] += look.hue * v;
        leaf[i * 3 + 1] += look.sat * v;
        leaf[i * 3 + 2] += look.light * v;
        leafW[i] += v;
        if (variegated) paleW[i] += v;
      }
    }
  }
  const pale = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (leafW[i] <= 0) continue;
    leaf[i * 3] /= leafW[i];
    leaf[i * 3 + 1] /= leafW[i];
    leaf[i * 3 + 2] /= leafW[i];
    pale[i] = paleW[i] / leafW[i];
  }

  // A light blur so overgrowth spreads over the ground in soft drifts
  // rather than tile-shaped squares.
  const raw = lush.slice();
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      let sum = 0;
      let wsum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= GRID_W || yy >= GRID_H) continue;
          const w = dx === 0 && dy === 0 ? 2 : 1;
          sum += raw[yy * GRID_W + xx] * w;
          wsum += w;
        }
      }
      lush[y * GRID_W + x] = sum / wsum;
    }
  }

  const character = new Uint8Array(n).fill(255);
  const zones = zonesByTile();
  const coverSum: Record<string, number> = Object.fromEntries(OUTDOOR_ZONES.map((z) => [z, 0]));
  const tiles: Record<string, number> = Object.fromEntries(OUTDOOR_ZONES.map((z) => [z, 0]));
  for (let i = 0; i < n; i++) {
    const z = zones[i];
    if (z) {
      tiles[z]++;
      coverSum[z] += Math.min(1, (lush[i] + bedded[i]) / 0.9);
    }
    if (lush[i] <= 0.02) continue;
    let best = 0;
    let bi = 0;
    for (let c = 0; c < CHARACTERS.length; c++) {
      const v = charW[i * CHARACTERS.length + c];
      if (v > best) {
        best = v;
        bi = c;
      }
    }
    character[i] = bi;
  }
  const zoneCover = Object.fromEntries(OUTDOOR_ZONES.map((z) => [z, tiles[z] ? coverSum[z] / tiles[z] : 0])) as Record<OutdoorZoneId, number>;
  const zoneCharacter: Partial<Record<OutdoorZoneId, LandscapeCharacter>> = {};
  for (const z of OUTDOOR_ZONES) {
    const ws = zoneCharW[z];
    const max = Math.max(...ws);
    if (max > 0) zoneCharacter[z] = CHARACTERS[ws.indexOf(max)];
  }
  return { lush, character, leaf, pale, zoneCover, zoneCount, zoneCharacter };
}

/** A few words describing what a region is turning into. */
export function describeRegion(cover: number, count: number, character?: LandscapeCharacter): string {
  if (count === 0) return 'Untouched wilderness.';
  const what: Record<LandscapeCharacter, [string, string, string]> = {
    fern: ['a few ferns taking hold', 'a fern glade', 'a sea of fronds'],
    jungle: ['a little green corner', 'a leafy thicket', 'a full-blown jungle'],
    vine: ['vines creeping in', 'a tangle of trailing vines', 'a green carpet of vines'],
    flower: ['a scattering of blooms', 'a flowering garden', 'a riot of flowers'],
    arid: ['a few hardy succulents', 'a succulent garden', 'a stone-and-sword desert garden'],
    color: ['splashes of colour', 'a painted garden', 'a stained-glass carpet of colour'],
    strange: ['something strange growing', 'an uncanny grove', 'a garden from another world'],
  };
  const tier = cover < 0.08 ? 0 : cover < 0.28 ? 1 : 2;
  const label = character ? what[character][tier] : 'your plants';
  return label.charAt(0).toUpperCase() + label.slice(1) + '.';
}
