import { describe, it, expect } from 'vitest';
import { createNewGame, type GameState, type OwnedPlant } from '../src/game/state';
import {
  STAGE_AT,
  MATURE_SF,
  TITAN_SF,
  TITAN_SPACING,
  checkTitans,
  gardenStageOf,
  maturity,
  plantSf,
  stageFloat,
  titanEligible,
  titanChance,
  titanRoll,
} from '../src/game/systems/growth';
import { advanceWorld, spreadStep, spreadHabit, WILD_TOTAL_CAP, isGardenPlant } from '../src/game/systems/wild';
import { advanceClock, ecologyMinutesFor } from '../src/game/engine/Clock';
import { migrateSave } from '../src/game/engine/SaveManager';
import { plantScale, plantStretch } from '../src/game/world/PlantArt';
import { foliageHides } from '../src/game/world/Renderer';
import { generateObstacles, buildBlockingSet } from '../src/game/world/Obstacles';
import { mulberry32 } from '../src/game/engine/Random';
import { isWater, zoneAt } from '../src/game/data/worldMap';
import { PLANTS, PLANT_LIST } from '../src/game/data/plants';
import { DISCOVERY_SPOTS, GIANT_SPOTS } from '../src/game/data/discoveryPoints';
import { spotContent, spotPool, hunchTargets, collectSpot } from '../src/game/systems/spots';
import { collectionTotals, recordGrown } from '../src/game/systems/collection';
import { journalComplete, listedSpecies } from '../src/game/systems/lineage';
import { GIANTS, giantTotals, giantsAwake, wakeGiants } from '../src/game/systems/giants';
import type { OutdoorZoneId } from '../src/game/types';

const HOUR = 3_600_000;
const T0 = 1_700_000_000_000;

// The real valley, as the game sees it: its trees, bushes, rocks and water.
const blocking = buildBlockingSet(generateObstacles(), new Set());
const open = (tx: number, ty: number) => !blocking.has(`${tx},${ty}`) && !isWater(tx, ty) && !DISCOVERY_SPOTS.some((s) => s.x === tx && s.y === ty);

function plant(state: GameState, id: string, defId: string, x: number, y: number, growth: number, extra: Partial<OwnedPlant> = {}): OwnedPlant {
  const p: OwnedPlant = {
    id,
    defId,
    variantId: PLANTS[defId].variants[0].id,
    seed: 3,
    growth,
    location: { kind: 'wild', x, y, zone: zoneAt(Math.floor(x), Math.floor(y)) as OutdoorZoneId },
    plantedAt: 0,
    lastCuttingAt: null,
    generation: 0,
    bornWild: false,
    ...extra,
  };
  state.plants[id] = p;
  return p;
}

/** A small garden of the player's own, just rooted: what someone leaves behind when they put the phone down. */
function garden(): GameState {
  const s = createNewGame();
  s.clock.lastRealTimestamp = T0;
  ['pothos', 'bostonFern', 'bamboo', 'monstera'].forEach((d, i) => plant(s, `p${i}`, d, 52.5 + i * 4, 27.5, STAGE_AT.young));
  return s;
}

/** Leaving for `hours` and coming back, the way Game.update plays it out. */
function returnAfter(state: GameState, hours: number, rand: () => number) {
  const clock = advanceClock(state, state.clock.lastRealTimestamp + hours * HOUR, rand);
  const world = advanceWorld(state, clock.elapsedMinutes, 0, open, rand, clock.ecologyMinutes - clock.elapsedMinutes);
  return { clock, world };
}

/** How wide a plant is drawn in the ground, relative to its species' own size. */
function drawnWidth(p: OwnedPlant): number {
  const form = PLANTS[p.defId].form;
  const sf = plantSf(p);
  return plantScale(form, sf, 'ground') * plantStretch(form, sf, 'ground').sx;
}

const count = (s: GameState) => Object.values(s.plants).filter((p) => p.location.kind === 'wild').length;

describe('the original bug: past the first half hour away, the garden stopped changing', () => {
  it('longer absences now come back to visibly more garden: more plants, and bigger ones', () => {
    // Before Overgrowth 2.0 these all came back to exactly the same number of
    // plants (spreading only ran during the clock's capped catch-up, about 36
    // real minutes), and the plants were drawn barely any bigger.
    const results = [1, 8, 24, 72].map((h) => {
      const s = garden();
      returnAfter(s, h, mulberry32(5));
      return { plants: count(s), width: drawnWidth(s.plants.p3) };
    });
    for (let i = 1; i < results.length; i++) {
      expect(results[i].plants).toBeGreaterThan(results[i - 1].plants);
      expect(results[i].width).toBeGreaterThan(results[i - 1].width);
    }
    // And it's a big change, not a rounding error: three days away is a jungle next to one hour.
    expect(results[3].plants).toBeGreaterThan(results[0].plants * 4);
    expect(results[3].width).toBeGreaterThan(results[0].width * 1.25);
  });

  it('seedlings that came up from your plants grow on while you are away too', () => {
    const s = garden();
    const child = plant(s, 'kid', 'pothos', 70.5, 30.5, 0, { bornWild: true, generation: 1 });
    returnAfter(s, 24, mulberry32(2));
    expect(stageFloat(child.growth)).toBeGreaterThan(4);
  });

  it('a plant past specimen is drawn substantially bigger as it goes on filling out', () => {
    for (const id of ['monstera', 'bostonFern', 'bamboo', 'pothos']) {
      const form = PLANTS[id].form;
      const at = (sf: number) => plantScale(form, sf, 'ground') * Math.max(plantStretch(form, sf, 'ground').sx, plantStretch(form, sf, 'ground').sy);
      expect(at(MATURE_SF) / at(4)).toBeGreaterThan(1.3);
    }
  });
});

describe('species grow in their own ways', () => {
  const late = (form: Parameters<typeof plantStretch>[0]) => plantStretch(form, MATURE_SF, 'ground');
  it('ground covers spread wide and stay low; canes go up; broad leaves fill out; succulents barely change', () => {
    expect(late('moss').sx).toBeGreaterThan(1.4);
    expect(late('moss').sy).toBe(1);
    expect(late('bamboo').sy).toBeGreaterThan(late('bamboo').sx);
    expect(plantScale('heart', MATURE_SF, 'ground')).toBeGreaterThan(plantScale('stones', MATURE_SF, 'ground'));
    expect(plantScale('stones', MATURE_SF, 'ground') / plantScale('stones', 4, 'ground')).toBeLessThan(1.2);
  });

  it('nothing changes shape in a pot: only plants in the ground overgrow', () => {
    expect(plantStretch('moss', MATURE_SF, 'pot')).toEqual({ sx: 1, sy: 1 });
    expect(plantScale('heart', TITAN_SF, 'pot')).toBe(plantScale('heart', MATURE_SF, 'pot'));
  });

  it('each spreads its own way: creepers fill gaps close by, clonal canes thicken, broad leaves rarely set down another', () => {
    expect(spreadHabit('moss').reach[1]).toBeLessThan(spreadHabit('fern').reach[1]);
    expect(spreadHabit('bamboo').reach[1]).toBeLessThan(1.5);
    expect(spreadHabit('heart').rate).toBeLessThan(spreadHabit('fern').rate);
    expect(spreadHabit('gunnera').rate).toBeLessThan(spreadHabit('heart').rate);
  });

  it('over the same time, a creeping ground cover makes many more new plants than a broad-leaved one', () => {
    const run = (defId: string) => {
      const s = createNewGame();
      plant(s, 'a', defId, 60.5, 28.5, STAGE_AT.specimen);
      for (let i = 0; i < 400; i++) spreadStep(s, open, 0, mulberry32(i + 1));
      return count(s);
    };
    expect(run('moss')).toBeGreaterThan(run('monstera'));
  });

  it('moves through four visible garden stages, and a Titan is a fifth', () => {
    const p = { growth: 0 } as OwnedPlant;
    expect(gardenStageOf(p)).toBe('establishing');
    expect(gardenStageOf({ ...p, growth: STAGE_AT.established + 400 })).toBe('developing');
    expect(gardenStageOf({ ...p, growth: STAGE_AT.specimen })).toBe('mature');
    expect(gardenStageOf({ ...p, growth: STAGE_AT.specimen + 20_000 })).toBe('overgrown');
    expect(gardenStageOf({ ...p, growth: STAGE_AT.specimen + 20_000, titanAt: STAGE_AT.specimen + 20_000 })).toBe('titan');
  });
});

describe('offline progression is persistent, deterministic and bounded', () => {
  it('the same garden left for the same time comes back exactly the same', () => {
    const a = garden();
    const b = garden();
    returnAfter(a, 30, mulberry32(9));
    returnAfter(b, 30, mulberry32(9));
    const shape = (s: GameState) => Object.values(s.plants).map((p) => [p.defId, p.growth.toFixed(6), p.location]).sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
    expect(shape(a)).toEqual(shape(b));
  });

  it('a second resume at the same moment adds nothing: no duplicate growth', () => {
    const s = garden();
    const now = T0 + 12 * HOUR;
    const first = advanceClock(s, now, () => 0.5);
    advanceWorld(s, first.elapsedMinutes, 0, open, mulberry32(1), first.ecologyMinutes - first.elapsedMinutes);
    const snap = JSON.stringify(s.plants);
    for (let i = 0; i < 3; i++) {
      const again = advanceClock(s, now, () => 0.5);
      expect(again.elapsedMinutes).toBe(0);
      expect(again.ecologyMinutes).toBe(0);
      advanceWorld(s, again.elapsedMinutes, 0, open, mulberry32(1), again.ecologyMinutes - again.elapsedMinutes);
    }
    expect(JSON.stringify(s.plants)).toBe(snap);
  });

  it('survives a save and reload in between: two half-day absences, nothing lost or redone', () => {
    const s = garden();
    returnAfter(s, 12, mulberry32(3));
    const mid = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(Object.keys(mid.plants).sort()).toEqual(Object.keys(s.plants).sort());
    const before = mid.plants.p0.growth;
    returnAfter(mid, 12, mulberry32(4));
    expect(mid.plants.p0.growth).toBeGreaterThan(before);
  });

  it('a year away is capped: a full garden, not a broken one', () => {
    const s = garden();
    const t = performance.now();
    returnAfter(s, 24 * 365 * 10, mulberry32(7));
    expect(performance.now() - t).toBeLessThan(5000);
    expect(count(s)).toBeLessThanOrEqual(WILD_TOTAL_CAP);
    expect(ecologyMinutesFor(10 * 365 * 24 * HOUR)).toBe(ecologyMinutesFor(365 * 24 * HOUR));
    for (const p of Object.values(s.plants)) {
      expect(Number.isFinite(p.growth)).toBe(true);
      expect(plantSf(p)).toBeLessThanOrEqual(TITAN_SF);
    }
  });

  it('an unreadable time, or a save stamped in the future, moves nothing on', () => {
    const s = garden();
    const snap = JSON.stringify(s);
    expect(advanceClock(s, NaN).elapsedMinutes).toBe(0);
    expect(advanceClock(s, Infinity).elapsedMinutes).toBe(0);
    expect(JSON.stringify(s)).toBe(snap);
    const future = JSON.parse(snap);
    future.clock.lastRealTimestamp = Date.now() + 400 * 24 * HOUR;
    const loaded = migrateSave(future)!;
    expect(loaded.clock.lastRealTimestamp).toBeLessThanOrEqual(Date.now());
  });

  it('a garden left for a week stays fast to catch up, even when it is already dense', () => {
    const s = createNewGame();
    s.clock.lastRealTimestamp = T0;
    const rand = mulberry32(11);
    let n = 0;
    for (let i = 0; i < 2000 && n < 420; i++) {
      const x = 47 + rand() * 42;
      const y = 1 + rand() * 60;
      if (!open(Math.floor(x), Math.floor(y))) continue;
      plant(s, `d${n++}`, ['pothos', 'bostonFern', 'moss', 'bamboo', 'hosta'][n % 5], x, y, STAGE_AT.specimen);
    }
    const t = performance.now();
    returnAfter(s, 24 * 7, rand);
    expect(performance.now() - t).toBeLessThan(4000);
    expect(count(s)).toBeLessThanOrEqual(WILD_TOTAL_CAP);
  });
});

describe('spreading keeps the garden usable', () => {
  it('never comes up on or right beside a patch you take cuttings from, or a garden piece', () => {
    const s = createNewGame();
    const spot = DISCOVERY_SPOTS.find((d) => d.id === 'sp-meadow-3')!;
    s.decor.push({ id: 'bench', decorId: 'bench', x: spot.x + 3, y: spot.y + 0.5, rot: 0 } as never);
    plant(s, 'm', 'moss', spot.x + 1.6, spot.y + 0.5, STAGE_AT.specimen);
    for (let i = 0; i < 600; i++) spreadStep(s, open, 0, mulberry32(i + 3));
    for (const p of Object.values(s.plants)) {
      if (p.id === 'm' || p.location.kind !== 'wild') continue;
      expect(Math.hypot(p.location.x - (spot.x + 0.5), p.location.y - (spot.y + 0.5))).toBeGreaterThanOrEqual(1.1);
      expect(Math.hypot(p.location.x - (spot.x + 3), p.location.y - (spot.y + 0.5))).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('nothing new comes up under a Giant gunnera', () => {
    const s = createNewGame();
    const g = plant(s, 'g', 'giantGunnera', 60.5, 28.5, STAGE_AT.specimen);
    plant(s, 'm', 'moss', 62.4, 28.5, STAGE_AT.specimen);
    for (let i = 0; i < 400; i++) spreadStep(s, open, 0, mulberry32(i + 5));
    for (const p of Object.values(s.plants)) {
      if (p.id === 'g' || p.id === 'm' || p.location.kind !== 'wild') continue;
      expect(Math.hypot(p.location.x - 60.5, p.location.y - 28.5)).toBeGreaterThan(1.9);
    }
    expect(g.location.kind).toBe('wild');
  });

  it("a big plant's leaves fade where they would cover the player, a patch or a garden piece just behind it", () => {
    expect(foliageHides(10, 10.5, 5, 1, 10, 10)).toBe(true);
    expect(foliageHides(10, 9.5, 5, 1, 10, 10)).toBe(false);
    expect(foliageHides(10, 12.5, 6.5, 2, 10, 10)).toBe(true);
    expect(foliageHides(10, 12.5, 2, 1, 10, 10)).toBe(false);
  });

  it('the extra time away belongs to your garden: self-sown strangers keep the clock’s pace', () => {
    expect(isGardenPlant({ bornWild: false, generation: 0 })).toBe(true);
    expect(isGardenPlant({ bornWild: true, generation: 2 })).toBe(true);
    expect(isGardenPlant({ bornWild: true, generation: 0 })).toBe(false);
  });
});

describe('Titans', () => {
  /** A plant that will turn Titan: in its own country, and its roll comes up. */
  function lucky(state: GameState, defId: string, x: number, y: number, growth: number): OwnedPlant {
    for (let seed = 1; seed < 5000; seed++) {
      const p = plant(state, `t${seed}`, defId, x, y, growth, { seed });
      if (titanEligible(p)) return p;
      delete state.plants[p.id];
    }
    throw new Error('no lucky seed');
  }

  it('are rare and fixed from the start: the same plant always rolls the same', () => {
    const p = { id: 'plant-x-1', seed: 77 };
    expect(titanRoll(p)).toBe(titanRoll(p));
    let eligible = 0;
    for (let i = 0; i < 2000; i++) if (titanRoll({ id: `plant-${i}`, seed: i * 13 }) < titanChance('bostonFern')) eligible++;
    expect(eligible / 2000).toBeGreaterThan(0.05);
    expect(eligible / 2000).toBeLessThan(0.16);
    // Small low things never do.
    expect(titanChance('moss')).toBe(0);
    expect(titanChance('livingStones' in PLANTS ? 'livingStones' : 'moss')).toBe(0);
  });

  it('only turn once they are near their fullest, only in their own country, and only with a lucky roll', () => {
    const s = createNewGame();
    const p = lucky(s, 'treeFern', 60.5, 12.5, STAGE_AT.specimen);
    expect(checkTitans(s)).toEqual([]);
    p.growth = STAGE_AT.specimen + 40_000;
    expect(maturity(p.growth)).toBeGreaterThan(0.8);
    expect(checkTitans(s)).toEqual([p.id]);
    expect(p.titanAt).toBe(p.growth);
    // Out of its own country, the same lucky plant never would have.
    const s2 = createNewGame();
    const q = plant(s2, p.id, 'treeFern', 60.5, 52.5, STAGE_AT.specimen + 40_000, { seed: p.seed });
    expect(zoneAt(60, 52)).toBe('rockyClearing');
    expect(checkTitans(s2)).toEqual([]);
    expect(q.titanAt).toBeUndefined();
  });

  it('keep growing past an ordinary plant’s fullest, but never past their own', () => {
    const s = createNewGame();
    const p = lucky(s, 'giantElephantEar', 39.5, 33.5, STAGE_AT.specimen + 40_000);
    checkTitans(s);
    expect(plantSf(p)).toBe(MATURE_SF);
    p.growth += 30_000;
    expect(plantSf(p)).toBeGreaterThan(MATURE_SF + 0.8);
    p.growth += 1e9;
    expect(plantSf(p)).toBeLessThanOrEqual(TITAN_SF);
    // And a Titan is drawn far bigger than the same plant at its ordinary fullest.
    expect(plantScale('elephantEar', TITAN_SF, 'ground')).toBeGreaterThan(plantScale('elephantEar', MATURE_SF, 'ground') * 1.2);
  });

  it('never stand two of a kind close together', () => {
    const s = createNewGame();
    const a = lucky(s, 'titanHosta', 20.5, 10.5, STAGE_AT.specimen + 40_000);
    const b = lucky(s, 'titanHosta', 20.5 + TITAN_SPACING - 2, 10.5, STAGE_AT.specimen + 40_000);
    const turned = checkTitans(s);
    expect(turned).toHaveLength(1);
    expect([a.titanAt, b.titanAt].filter((v) => v !== undefined)).toHaveLength(1);
  });

  it('come about through time away, too, and persist through saving', () => {
    const s = createNewGame();
    s.clock.lastRealTimestamp = T0;
    const p = lucky(s, 'giantGunnera', 39.5, 45.5, STAGE_AT.specimen);
    s.collection.giantGunnera = { foundAt: 0, variants: ['manicata'], grownVariants: ['manicata'], grown: 2, propagated: 0, sold: 0, earned: 0, plantedOut: 1, displayed: 0 };
    const before = collectionTotals(s);
    const { world } = returnAfter(s, 24 * 30, mulberry32(1));
    expect(world.titans).toContain(p.id);
    expect(s.collection.giantGunnera.titan).toBe(true);
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(loaded.plants[p.id].titanAt).toBe(p.titanAt);
    expect(gardenStageOf(loaded.plants[p.id])).toBe('titan');
    // A Titan isn't a new species or a new form.
    expect(collectionTotals(loaded)).toEqual(before);
    expect(loaded.collection.giantGunnera.variants).toEqual(['manicata']);
  });

  it('an unreadable Titan mark in a save is dropped, not trusted', () => {
    const s = createNewGame();
    plant(s, 'a', 'bostonFern', 60.5, 12.5, 5000, { titanAt: 9000 });
    plant(s, 'b', 'bostonFern', 62.5, 12.5, 5000, { titanAt: 'x' as never });
    plant(s, 'c', 'bostonFern', 64.5, 12.5, 9000, { titanAt: 8000 });
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(loaded.plants.a.titanAt).toBeUndefined();
    expect(loaded.plants.b.titanAt).toBeUndefined();
    expect(loaded.plants.c.titanAt).toBe(8000);
  });
});

describe('the Giants collection', () => {
  const NAMES = ['Tree Fern', 'Giant Elephant Ear', 'Giant Reed Grass', 'Giant Gunnera', 'Giant Canna', 'Titan Hosta'];

  it('is six distinct species with stable ids, each its own form', () => {
    expect(GIANTS.map((g) => g.name)).toEqual(NAMES);
    expect(GIANTS.map((g) => g.id)).toEqual(['treeFern', 'giantElephantEar', 'giantReed', 'giantGunnera', 'giantCanna', 'titanHosta']);
    expect(new Set(GIANTS.map((g) => g.form)).size).toBe(6);
    for (const g of GIANTS) {
      expect(PLANT_LIST.filter((p) => p.form === g.form)).toHaveLength(1);
      expect(g.unlisted).toBe(true);
      expect(g.variants.length).toBeGreaterThanOrEqual(2);
      expect(g.habitat.length).toBeGreaterThan(0);
    }
  });

  it('keep out of the field journal’s count, so a finished journal stays finished', () => {
    const s = createNewGame();
    for (const def of listedSpecies()) s.collection[def.id] = { foundAt: 0, variants: def.variants.map((v) => v.id), grownVariants: def.variants.map((v) => v.id), grown: 2, propagated: 0, sold: 0, earned: 0, plantedOut: 0, displayed: 0 };
    expect(journalComplete(s)).toBe(true);
    const totals = collectionTotals(s);
    expect(totals.species).toBe(totals.totalSpecies);
    expect(listedSpecies().some((d) => d.giant)).toBe(false);
    // …and nothing is counted as found just because it exists.
    expect(giantTotals(s)).toEqual({ grown: 0, total: 6, forms: 0, totalForms: GIANTS.reduce((n, g) => n + g.variants.length, 0), titans: 0 });
  });

  it('never turn up in an ordinary patch or as a fox’s hunch', () => {
    const s = createNewGame();
    for (const spot of DISCOVERY_SPOTS) if (!spot.giant) expect(spotPool(spot).some((d) => d.giant)).toBe(false);
    for (const z of ['meadow', 'woodland', 'creek', 'dampForest', 'rockyClearing', 'overgrownClearing'] as OutdoorZoneId[]) expect(hunchTargets(s, z).some((h) => PLANTS[h.defId].giant)).toBe(false);
  });

  it('their patches are bare until your garden wakes them: a plant you set out, grown large', () => {
    const s = createNewGame();
    for (const spot of GIANT_SPOTS) expect(spotContent(s, spot)).toBeNull();
    const p = plant(s, 'mine', 'bostonFern', 60.5, 28.5, STAGE_AT.established);
    expect(wakeGiants(s, 100)).toBe(false);
    // Something that came up by itself doesn't count.
    plant(s, 'self', 'bostonFern', 64.5, 28.5, STAGE_AT.large, { bornWild: true, generation: 1 });
    expect(wakeGiants(s, 100)).toBe(false);
    p.growth = STAGE_AT.large;
    expect(wakeGiants(s, 120)).toBe(true);
    expect(wakeGiants(s, 130)).toBe(false);
    expect(giantsAwake(s)).toBe(true);
    for (const spot of GIANT_SPOTS) {
      const c = spotContent(s, spot)!;
      expect(c).not.toBeNull();
      expect(PLANTS[c.defId].giant).toBe(true);
      expect(PLANTS[c.defId].habitat).toContain(spot.zone);
    }
  });

  it('are found, rooted and recorded like anything else, on their own page', () => {
    const s = createNewGame();
    s.giantsAwakeAt = 0;
    const spot = GIANT_SPOTS[0];
    const res = collectSpot(s, spot, 10);
    expect(res.ok).toBe(true);
    expect(s.basket[0].defId).toBe('treeFern');
    expect(giantTotals(s).grown).toBe(0);
    s.plants.n = { id: 'n', defId: 'treeFern', variantId: 'soft', seed: 1, growth: STAGE_AT.young, location: { kind: 'nursery', bedId: 'bed1' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false };
    recordGrown(s, 20);
    expect(giantTotals(s).grown).toBe(1);
    expect(collectionTotals(s).species).toBe(0);
  });

  it('their patches sit on open ground in their own country, clear of every other patch', () => {
    for (const g of GIANT_SPOTS) {
      expect(zoneAt(g.x, g.y)).toBe(g.zone);
      expect(open(g.x, g.y) || DISCOVERY_SPOTS.some((s) => s.x === g.x && s.y === g.y)).toBe(true);
      expect(blocking.has(`${g.x},${g.y}`)).toBe(false);
      expect(isWater(g.x, g.y)).toBe(false);
      for (const o of DISCOVERY_SPOTS) if (o !== g) expect(Math.hypot(o.x - g.x, o.y - g.y)).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('old saves', () => {
  it('a save from before the Giants loads with everything intact and the Giants still asleep', () => {
    const s = createNewGame();
    plant(s, 'old', 'monstera', 60.5, 28.5, 8000);
    s.collection.mooncap = { foundAt: 0, variants: ['pale'], grownVariants: ['pale'], grown: 1, propagated: 0, sold: 0, earned: 0, plantedOut: 0, displayed: 0 };
    s.collection.hoya = { foundAt: 0, variants: ['carnosa'], grown: 0, propagated: 0, sold: 0, earned: 0, plantedOut: 0, displayed: 0 };
    const raw = JSON.parse(JSON.stringify(s));
    delete raw.giantsAwakeAt;
    const loaded = migrateSave(raw)!;
    expect(loaded.giantsAwakeAt).toBeNull();
    expect(loaded.plants.old.growth).toBe(8000);
    expect(loaded.plants.old.titanAt).toBeUndefined();
    expect(loaded.collection.mooncap.grownVariants).toEqual(['pale']);
    expect(loaded.collection.hoya.variants).toEqual(['carnosa']);
    // The first catch-up after loading wakes them, since a large plant of yours is already out there.
    expect(wakeGiants(loaded, loaded.clock.totalMinutes)).toBe(true);
  });
});

describe('the way home stays clear', () => {
  it('nothing seeds itself in front of a door or the stall', async () => {
    const { DOORS } = await import('../src/game/systems/wild');
    const s = createNewGame();
    plant(s, 'b', 'bamboo', 64.5, 43.5, STAGE_AT.specimen);
    plant(s, 'm', 'moss', 67.5, 43.5, STAGE_AT.specimen);
    for (let i = 0; i < 800; i++) spreadStep(s, open, 0, mulberry32(i + 9));
    for (const p of Object.values(s.plants)) {
      if (p.id === 'b' || p.id === 'm' || p.location.kind !== 'wild') continue;
      for (const d of DOORS) expect(Math.hypot(p.location.x - (d.x + 0.5), p.location.y - (d.y + 0.5))).toBeGreaterThanOrEqual(2.5);
      expect(Math.hypot(p.location.x - (s.stall.x + 1), p.location.y - (s.stall.y + 0.5))).toBeGreaterThanOrEqual(1.8);
    }
  });
});
