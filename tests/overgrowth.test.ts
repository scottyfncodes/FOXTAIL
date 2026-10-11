import { describe, it, expect } from 'vitest';
import { createNewGame, type GameState, type OwnedPlant } from '../src/game/state';
import { STAGE_AT, MATURE_SF, stageFloat, stageOf, maturity, tickGrowth } from '../src/game/systems/growth';
import { advanceWorld, spreadStep } from '../src/game/systems/wild';
import { advanceClock, ecologyMinutesFor, ECOLOGY_MAX_EXTRA, OFFLINE_CAP_MINUTES, GAME_MINUTES_PER_REAL_SECOND } from '../src/game/engine/Clock';
import { migrateSave } from '../src/game/engine/SaveManager';
import { overgrowthOf } from '../src/game/world/PlantArt';
import { generateObstacles, buildBlockingSet } from '../src/game/world/Obstacles';
import { mulberry32 } from '../src/game/engine/Random';
import { isWater, zoneAt } from '../src/game/data/worldMap';

const HOUR = 3_600_000;

// The real valley: its trees, bushes and rocks, as the game sees them.
const blocking = buildBlockingSet(generateObstacles(), new Set());
const open = (tx: number, ty: number) => !blocking.has(`${tx},${ty}`) && !isWater(tx, ty);

function wild(state: GameState, id: string, x: number, y: number, growth: number, defId = 'bostonFern'): OwnedPlant {
  const p: OwnedPlant = {
    id,
    defId,
    variantId: defId === 'pothos' ? 'golden' : 'standard',
    seed: 3,
    growth,
    location: { kind: 'wild', x, y, zone: zoneAt(Math.floor(x), Math.floor(y)) as never },
    plantedAt: 0,
    lastCuttingAt: null,
    generation: 0,
    bornWild: false,
  };
  state.plants[id] = p;
  return p;
}

function wildPlants(state: GameState): OwnedPlant[] {
  return Object.values(state.plants).filter((p) => p.location.kind === 'wild');
}

/** What the player gets back after being away `hours`: the clock and the living world, as Game.update does it. */
function returnAfter(state: GameState, hours: number, rand: () => number) {
  const clock = advanceClock(state, state.clock.lastRealTimestamp + hours * HOUR, rand);
  const world = advanceWorld(state, clock.elapsedMinutes, 0, open, rand, clock.ecologyMinutes - clock.elapsedMinutes);
  return { clock, world };
}

describe('plants keep growing visibly', () => {
  it('advance through every stage, then keep filling out past specimen without ever passing the cap', () => {
    const state = createNewGame();
    state.plants.p = wild(state, 'p', 55.5, 28.5, 0);
    const seen: string[] = [];
    let last = -1;
    for (let i = 0; i < 400; i++) {
      tickGrowth(state, 120);
      const sf = stageFloat(state.plants.p.growth);
      expect(sf).toBeGreaterThanOrEqual(last);
      last = sf;
      const st = stageOf(state.plants.p.growth);
      if (seen[seen.length - 1] !== st) seen.push(st);
    }
    expect(seen).toEqual(['cutting', 'young', 'established', 'large', 'specimen']);
    // Specimen is not the end: it carries on toward its fullest.
    expect(stageFloat(STAGE_AT.specimen)).toBe(4);
    expect(stageFloat(STAGE_AT.specimen + 10_000)).toBeGreaterThan(4.6);
    expect(stageFloat(STAGE_AT.specimen * 1000)).toBeLessThanOrEqual(MATURE_SF);
    expect(maturity(STAGE_AT.specimen)).toBe(0);
    expect(maturity(STAGE_AT.specimen + 40_000)).toBeGreaterThan(0.9);
  });

  it('a mature plant is drawn fuller: offshoots start once a specimen fills out', () => {
    expect(overgrowthOf(3)).toBe(0);
    expect(overgrowthOf(4)).toBe(0);
    expect(overgrowthOf(5)).toBeGreaterThan(0);
    expect(overgrowthOf(MATURE_SF)).toBe(1);
    expect(overgrowthOf(99)).toBe(1);
  });
});

describe('time away matters', () => {
  it('a short absence is the same as play; longer ones keep adding growth, more slowly, up to a cap', () => {
    const tenMin = ecologyMinutesFor(10 * 60_000);
    expect(tenMin).toBeCloseTo(600 * GAME_MINUTES_PER_REAL_SECOND);
    const hour = ecologyMinutesFor(HOUR);
    const day = ecologyMinutesFor(24 * HOUR);
    const days3 = ecologyMinutesFor(72 * HOUR);
    const week = ecologyMinutesFor(7 * 24 * HOUR);
    const year = ecologyMinutesFor(365 * 24 * HOUR);
    expect(hour).toBeGreaterThan(OFFLINE_CAP_MINUTES);
    expect(day).toBeGreaterThan(hour);
    expect(days3).toBeGreaterThan(day);
    expect(week).toBeGreaterThan(days3);
    // Diminishing returns: the second day adds less than the first.
    expect(ecologyMinutesFor(48 * HOUR) - day).toBeLessThan(day - hour);
    expect(year).toBe(OFFLINE_CAP_MINUTES + ECOLOGY_MAX_EXTRA);
  });

  it('the clock itself still only catches up its usual cap; the living world gets the extra', () => {
    const state = createNewGame();
    state.clock.lastRealTimestamp = 1_700_000_000_000;
    const r = advanceClock(state, state.clock.lastRealTimestamp + 3 * 24 * HOUR, () => 0.5);
    expect(r.wasOffline).toBe(true);
    expect(r.elapsedMinutes).toBe(OFFLINE_CAP_MINUTES);
    expect(r.ecologyMinutes).toBeGreaterThan(r.elapsedMinutes);
    const s2 = createNewGame();
    s2.clock.lastRealTimestamp = 1_700_000_000_000;
    const play = advanceClock(s2, s2.clock.lastRealTimestamp + 500, () => 0.5);
    expect(play.ecologyMinutes).toBe(play.elapsedMinutes);
  });

  it('coming back after a few days, the valley has visibly moved on', () => {
    const state = createNewGame();
    state.clock.lastRealTimestamp = 1_700_000_000_000;
    wild(state, 'fern', 55.5, 28.5, STAGE_AT.large);
    wild(state, 'shroom', 60.5, 12.5, STAGE_AT.established, 'chanterelle');
    const before = { plants: wildPlants(state).length, fern: stageFloat(state.plants.fern.growth) };
    const rand = mulberry32(21);
    returnAfter(state, 72, rand);
    expect(stageFloat(state.plants.fern.growth)).toBeGreaterThan(before.fern + 0.5);
    expect(wildPlants(state).length).toBeGreaterThan(before.plants);
    // Anything new is dated within the clock's own span, never in the future.
    for (const p of wildPlants(state)) expect(p.plantedAt).toBeLessThanOrEqual(state.clock.totalMinutes);
  });

  it("the extra growth from a long absence goes only to plants you set out, not ones that came up by themselves", () => {
    const state = createNewGame();
    const mine = wild(state, 'mine', 55.5, 28.5, STAGE_AT.specimen);
    const self = wild(state, 'self', 60.5, 28.5, STAGE_AT.specimen);
    self.bornWild = true;
    advanceWorld(state, 0, 0, open, () => 0.99, 5000);
    expect(mine.growth).toBeGreaterThan(STAGE_AT.specimen);
    expect(self.growth).toBe(STAGE_AT.specimen);
  });

});

describe('natural reproduction', () => {
  it('established plants (not yet large) do not spread', () => {
    const state = createNewGame();
    wild(state, 'p', 55.5, 28.5, STAGE_AT.established, 'pothos');
    for (let i = 0; i < 100; i++) spreadStep(state, open, 0, () => 0.001);
    expect(wildPlants(state)).toHaveLength(1);
  });
});

describe('no coins needed, nothing else disturbed', () => {
  it('a penniless garden still grows and spreads, and the coins are untouched', () => {
    const state = createNewGame();
    state.coins = 0;
    wild(state, 'p', 55.5, 28.5, STAGE_AT.large, 'pothos');
    const res = advanceWorld(state, 20_000, 0, open, mulberry32(1));
    expect(state.coins).toBe(0);
    expect(res.ups.length + res.spreads.length).toBeGreaterThan(0);
  });

  it('leaves the fox, Scout, Scott, Ranger, the collection and indoor plants as they were', () => {
    const state = createNewGame();
    state.collection.pothos = { foundAt: 0, variants: ['golden'], grown: 2, propagated: 1, sold: 0, earned: 0, plantedOut: 1, displayed: 0 };
    state.plants.pot = { id: 'pot', defId: 'pothos', variantId: 'golden', seed: 1, growth: 100, location: { kind: 'nursery', bedId: 'bed1' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false };
    const snap = JSON.stringify({ fox: state.fox, scout: state.scout, scott: state.scott, cat: state.cat, koi: state.koi, regions: state.regions, collection: state.collection });
    advanceWorld(state, 30_000, 0, open, mulberry32(2));
    expect(JSON.stringify({ fox: state.fox, scout: state.scout, scott: state.scott, cat: state.cat, koi: state.koi, regions: state.regions, collection: state.collection })).toBe(snap);
    // The potted plant grew where it was, and stayed potted.
    expect(state.plants.pot.location).toEqual({ kind: 'nursery', bedId: 'bed1' });
    expect(state.plants.pot.growth).toBeGreaterThan(100);
  });
});

describe('persistence', () => {
  it('growth survives a save and reload', () => {
    const state = createNewGame();
    wild(state, 'p', 55.5, 28.5, STAGE_AT.large, 'pothos');
    advanceWorld(state, 15_000, 0, open, mulberry32(9));
    const loaded = migrateSave(JSON.parse(JSON.stringify(state)))!;
    expect(loaded).not.toBeNull();
    expect(Object.keys(loaded.plants).sort()).toEqual(Object.keys(state.plants).sort());
    expect(loaded.plants.p.growth).toBe(state.plants.p.growth);
  });

  it('leaving and coming back twice adds up: nothing is lost or redone in between', () => {
    const state = createNewGame();
    state.clock.lastRealTimestamp = 1_700_000_000_000;
    wild(state, 'p', 55.5, 28.5, STAGE_AT.large, 'pothos');
    const rand = mulberry32(31);
    returnAfter(state, 24, rand);
    const mid = migrateSave(JSON.parse(JSON.stringify(state)))!;
    const growthMid = mid.plants.p.growth;
    returnAfter(mid, 24, rand);
    expect(mid.plants.p.growth).toBeGreaterThan(growthMid);
  });
});
