import type { GameState, OwnedPlant } from '../state';
import { makeUid } from '../state';
import type { LandscapeCharacter, OutdoorZoneId, PlantForm } from '../types';
import { PLANTS, lookFor } from '../data/plants';
import { GRID_W, GRID_H, zoneAt, isWater, GREENHOUSE_DOOR, GREENHOUSE_BACK_DOOR, GREENHOUSE_SIDE_DOOR, HOUSE_DOOR, HOUSE_BACK_DOOR } from '../data/worldMap';
import { checkTitans, stageFloat, stageIndexOf, tickGrowth, type StageUp } from './growth';
import { rollSport, crossOf } from './propagation';
import { hasFound } from './collection';
import { journalComplete, variantAllowed } from './lineage';
import { SpatialGrid } from './spatial';
import { bedContains, currentRadius, onPath } from './landscape';
import { bedLiveliness, LIVELY_TIER } from './beds';
import { inPond } from './koi';
import { DISCOVERY_SPOTS } from '../data/discoveryPoints';

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
const MIN_SPACING = 0.85;

/**
 * How each kind of plant takes new ground. Ferns throw up new crowns a
 * stride or two off; bamboo, reeds and cattails thicken into tight
 * clonal stands; moss, thyme and clover creep outward and fill the gaps;
 * vines run; the big broad-leaved plants mostly just get bigger, and only
 * now and then set a new one down. `rate` scales the species' own spread,
 * `reach` is how far off (tiles) the new one comes up, and `spacing` how
 * close it may stand to anything else.
 */
export interface SpreadHabit {
  rate: number;
  reach: [number, number];
  spacing: number;
}

const DEFAULT_HABIT: SpreadHabit = { rate: 1, reach: [1.1, 2.8], spacing: MIN_SPACING };
const RUNNER: SpreadHabit = { rate: 1, reach: [1.5, 3.8], spacing: MIN_SPACING };
const CREEPER: SpreadHabit = { rate: 1.25, reach: [0.7, 1.8], spacing: 0.6 };
const CLONAL: SpreadHabit = { rate: 1, reach: [0.6, 1.3], spacing: 0.65 };
const BROADLEAF: SpreadHabit = { rate: 0.45, reach: [1.3, 2.6], spacing: 1 };

export const SPREAD_HABIT: Partial<Record<PlantForm, SpreadHabit>> = {
  trailing: RUNNER,
  beads: RUNNER,
  runner: RUNNER,
  climber: RUNNER,
  moss: CREEPER,
  mat: CREEPER,
  trefoil: CREEPER,
  bamboo: CLONAL,
  cattail: CLONAL,
  spear: CLONAL,
  heart: BROADLEAF,
  splitleaf: BROADLEAF,
  patterned: BROADLEAF,
  fig: BROADLEAF,
  fan: BROADLEAF,
  palm: BROADLEAF,
  cane: BROADLEAF,
  palmate: BROADLEAF,
  clump: BROADLEAF,
  // The Giants: the reed runs underground into a thicket; the rest mostly fill out where they stand.
  giantReed: { rate: 0.9, reach: [0.7, 1.5], spacing: 0.7 },
  treeFern: { rate: 0.5, reach: [1.6, 3.2], spacing: 1.5 },
  elephantEar: { rate: 0.35, reach: [1.7, 2.6], spacing: 1.3 },
  canna: { rate: 0.5, reach: [0.9, 1.8], spacing: 1 },
  giantHosta: { rate: 0.25, reach: [1.6, 2.5], spacing: 1.3 },
  gunnera: { rate: 0.15, reach: [2.1, 3.1], spacing: 1.8 },
};

/** Giants whose canopy spreads wide enough that nothing new comes up underneath. */
const CANOPY_FORMS = new Set<PlantForm | undefined>(['treeFern', 'elephantEar', 'gunnera', 'giantHosta']);

export function spreadHabit(form: PlantForm): SpreadHabit {
  return SPREAD_HABIT[form] ?? DEFAULT_HABIT;
}

/**
 * The plants the valley's growth while you're away belongs to: the ones you
 * set out, and everything that's come up from them. Not the odd thing that
 * came up by itself from nothing of yours.
 */
export function isGardenPlant(p: Pick<OwnedPlant, 'bornWild' | 'generation'>): boolean {
  return !p.bornWild || p.generation > 0;
}

/** Room kept clear round the things you use: patches, garden pieces, the stall and the doors home. */
const KEEP_CLEAR_SPOT = 1.1;
const KEEP_CLEAR_DECOR = 0.7;
const KEEP_CLEAR_STALL = 1.8;
const KEEP_CLEAR_DOOR = 2.5;
/** Every door in and out of the greenhouse and the house, as the tile in its wall. */
export const DOORS = [GREENHOUSE_DOOR, GREENHOUSE_BACK_DOOR, GREENHOUSE_SIDE_DOOR, HOUSE_DOOR, HOUSE_BACK_DOOR];
/** The player can plant closer than anything seeds itself (see landscape.ts checkPlanting). */
const PLANT_SPACING = 0.5;
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

function tooClose(plants: OwnedPlant[] | SpatialGrid<OwnedPlant>, x: number, y: number, spacing = MIN_SPACING): { tooClose: boolean; crowd: number } {
  let crowd = 0;
  let close = false;
  const check = (p: OwnedPlant) => {
    if (p.location.kind !== 'wild') return false;
    const d = Math.hypot(p.location.x - x, p.location.y - y);
    // Nothing comes up under a Giant's spreading canopy.
    if (d < spacing || (CANOPY_FORMS.has(PLANTS[p.defId]?.form) && d < currentRadius(p))) {
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
  return !tooClose(wildPlants(state), x, y, PLANT_SPACING).tooClose;
}

/** Whether new growth may come up at (x, y) without crowding something you use. */
function keepsClear(state: GameState, x: number, y: number, spots: readonly { x: number; y: number }[]): boolean {
  for (const sp of spots) if (Math.hypot(sp.x + 0.5 - x, sp.y + 0.5 - y) < KEEP_CLEAR_SPOT) return false;
  for (const d of state.decor) if (Math.hypot(d.x - x, d.y - y) < KEEP_CLEAR_DECOR) return false;
  for (const d of DOORS) if (Math.hypot(d.x + 0.5 - x, d.y + 0.5 - y) < KEEP_CLEAR_DOOR) return false;
  return Math.hypot(state.stall.x + 1 - x, state.stall.y + 0.5 - y) >= KEEP_CLEAR_STALL;
}

/**
 * One spread check across every outdoor plant. `parents`, if given, picks
 * which plants may spread this time (the rest still count as neighbours).
 */
export function spreadStep(
  state: GameState,
  isOpenGround: GroundCheck,
  now: number,
  rand: () => number,
  parents?: (p: OwnedPlant) => boolean,
  spots: readonly { x: number; y: number }[] = DISCOVERY_SPOTS
): SpreadEvent[] {
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

  const parentCount = wild.length;
  for (let pi = 0; pi < parentCount; pi++) {
    const parent = wild[pi];
    if (parent.location.kind !== 'wild') continue;
    const stage = stageIndexOf(parent.growth);
    if (stage < 3) continue;
    if (parents && !parents(parent)) continue;
    const def = PLANTS[parent.defId];
    if (!def) continue;
    const habit = spreadHabit(def.form);
    // Per spread step (an in-game hour): a vigorous large pothos throws out a
    // new plant every day or two of game time; a slow aroid far less often.
    const chance = def.spread * habit.rate * 0.03 * (stage >= 4 ? 1.5 : 1);
    if (rand() >= chance) continue;

    // A plant in a garden bed spreads only within it; one outside never
    // seeds into a bed. Beds are the player's, and they stay that way.
    const bedId = parent.location.bedId;
    const bed = bedId ? state.gardenBeds.find((b) => b.id === bedId) : undefined;
    const tier = bed ? bedTier.get(bed.id) ?? 0 : 0;
    const diverse = !!bed && tier >= LIVELY_TIER;
    const reach = bed ? 0.8 : 1;
    for (let attempt = 0; attempt < (bed ? 6 : 4); attempt++) {
      const a = rand() * Math.PI * 2;
      const d = (habit.reach[0] + rand() * (habit.reach[1] - habit.reach[0])) * reach;
      const x = parent.location.x + Math.cos(a) * d;
      const y = parent.location.y + Math.sin(a) * d;
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) continue;
      const zone = zoneAt(tx, ty);
      if (zone === 'greenhouse') continue;
      // Water plants seed out onto the water (a lily pad nowhere else); everything else keeps to dry ground.
      const wet = isWater(tx, ty) || inPond(state, x, y);
      if (def.water === 'only' && !wet) continue;
      if (wet) {
        if (!def.water || bed) continue;
      } else {
        if (!isOpenGround(tx, ty)) continue;
        if (bed ? !bedContains(bed, x, y, 0.2) : state.gardenBeds.some((b) => bedContains(b, x, y, -0.2))) continue;
        if (state.paths.length && onPath(state, x, y, now, true)) continue;
        if (!keepsClear(state, x, y, spots)) continue;
      }
      if ((perZone[zone] ?? 0) >= WILD_ZONE_CAP) continue;
      if ((perSpecies[`${zone}:${parent.defId}`] ?? 0) >= WILD_SPECIES_ZONE_CAP) continue;
      const near = tooClose(grid, x, y, habit.spacing);
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
  /** Plants that grew into Titans. */
  titans: string[];
  carry: number;
}

/**
 * Grows everything and lets outdoor plants spread, interleaved in
 * SPREAD_STEP chunks so a long absence plays out the same way as the same
 * time spent in-game: seedlings grow up and spread in their turn.
 *
 * `gardenExtra` is the extra time (game-minutes) the garden gets after a
 * long absence, past what the clock itself catches up (see Clock's
 * ecologyMinutesFor). Your plants, and everything come up from them, go on
 * growing and spreading through it, in the same hourly steps as ever: so a
 * day away, three days and a week each come back to a fuller garden than
 * the last. Nothing else in the valley moves on in that time (no weather,
 * no self-sown strangers): it's the garden's time only.
 */
export function advanceWorld(
  state: GameState,
  minutes: number,
  carry: number,
  isOpenGround: GroundCheck,
  rand: () => number = Math.random,
  gardenExtra = 0
): WorldAdvance {
  const ups: StageUp[] = [];
  const spreads: SpreadEvent[] = [];
  const sown: string[] = [];
  const titans: string[] = [];
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
      titans.push(...checkTitans(state));
    }
  }
  // The garden's own extra time: dated at the clock's present, since it's
  // time the clock never ran through.
  const now = state.clock.totalMinutes;
  let extra = Number.isFinite(gardenExtra) ? Math.max(0, gardenExtra) : 0;
  while (extra > 1e-9) {
    const dt = Math.min(extra, SPREAD_STEP);
    ups.push(...tickGrowth(state, dt, isGardenPlant));
    extra -= dt;
    if (dt >= SPREAD_STEP - 1e-9) spreads.push(...spreadStep(state, isOpenGround, now, rand, isGardenPlant));
    titans.push(...checkTitans(state));
  }
  if (minutes > 1e-9 && !titans.length) titans.push(...checkTitans(state));
  return { ups, spreads, sown, titans, carry: c };
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
    // A long-established plant fills out (see growth.ts), but its ground
    // carpet stops growing a little past specimen, except for the creepers
    // and runners, whose whole way of growing is to cover the ground.
    const creeps = spreadHabit(def.form) === CREEPER || spreadHabit(def.form) === RUNNER;
    const sf = Math.min(creeps ? 5.6 : 4.6, stageFloat(p.growth));
    const r = (0.7 + sf * 0.6) * Math.max(0.7, look.size);
    const w = 0.18 + sf * 0.16;
    const ci = CHARACTERS.indexOf(def.landscape);
    const variegated = look.variegation !== 'none' && look.variegation !== 'glow';
    zoneCount[p.location.zone]++;
    zoneCharW[p.location.zone][ci] += w;
    // Out on the water, it doesn't change the ground.
    if (def.water === 'only') continue;
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
