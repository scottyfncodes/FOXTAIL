import { describe, it, expect } from 'vitest';
import { createNewGame, type GameState, type OwnedPlant } from '../src/game/state';
import { STAGE_AT, MATURE_SF, stageFloat, stageOf, maturity, tickGrowth } from '../src/game/systems/growth';
import { advanceWorld, spreadStep, computeLushness, coverCell, MIN_SPACING, WILD_TOTAL_CAP, WILD_ZONE_CAP } from '../src/game/systems/wild';
import {
  COVER_TOTAL_CAP,
  COVER_KINDS,
  MAX_LEVEL,
  coverFill,
  coverPhase,
  coverStep,
  coverWorld,
  patchesOf,
  sanitizeCover,
} from '../src/game/systems/overgrowth';
import { advanceClock, ecologyMinutesFor, ECOLOGY_MAX_EXTRA, OFFLINE_CAP_MINUTES, GAME_MINUTES_PER_REAL_SECOND } from '../src/game/engine/Clock';
import { migrateSave } from '../src/game/engine/SaveManager';
import { createBed, createPath, type LandscapeWorld } from '../src/game/systems/landscape';
import { overgrowthOf } from '../src/game/world/PlantArt';
import { generateObstacles, buildBlockingSet } from '../src/game/world/Obstacles';
import { mulberry32 } from '../src/game/engine/Random';
import { GRID_W, isWater, zoneAt } from '../src/game/data/worldMap';

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
  const world = advanceWorld(state, clock.ecologyMinutes, 0, open, rand, { clockSpan: clock.elapsedMinutes, cover: true });
  return { clock, world };
}

const landWorld: LandscapeWorld = { obstacleAt: () => null, isBuiltOrWater: (tx, ty) => isWater(tx, ty), isSpot: () => false };

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
    const before = { plants: wildPlants(state).length, cover: patchesOf(state).length, fern: stageFloat(state.plants.fern.growth) };
    const rand = mulberry32(21);
    const { world } = returnAfter(state, 72, rand);
    expect(stageFloat(state.plants.fern.growth)).toBeGreaterThan(before.fern + 0.5);
    expect(wildPlants(state).length).toBeGreaterThan(before.plants);
    expect(patchesOf(state).length).toBeGreaterThan(before.cover + 50);
    expect(world.cover.some((e) => e.kind === 'new')).toBe(true);
    // Anything new is dated within the clock's own span, never in the future.
    for (const p of wildPlants(state)) expect(p.plantedAt).toBeLessThanOrEqual(state.clock.totalMinutes);
    for (const p of patchesOf(state)) expect(p[4]).toBeLessThanOrEqual(state.clock.totalMinutes + 1e-6);
  });

  it('bare → low → established → overgrown, each a real step on from the last', () => {
    const state = createNewGame();
    const rand = mulberry32(4);
    expect(coverPhase(coverFill(state, open))).toBe('bare');
    const phases: string[] = [];
    for (let i = 0; i < 40; i++) {
      advanceWorld(state, 2000, 0, open, rand, { cover: true });
      const ph = coverPhase(coverFill(state, open));
      if (phases[phases.length - 1] !== ph) phases.push(ph);
    }
    expect(phases).toEqual(['bare', 'low', 'established', 'overgrown']);
  });
});

describe('natural reproduction', () => {
  it('mature plants seed nearby; seedlings keep their distance and never stack', () => {
    const state = createNewGame();
    wild(state, 'p', 55.5, 28.5, STAGE_AT.specimen * 3, 'pothos');
    const rand = mulberry32(8);
    for (let i = 0; i < 3000; i++) {
      for (const p of wildPlants(state)) p.growth = Math.max(p.growth, STAGE_AT.specimen);
      spreadStep(state, open, 0, rand);
    }
    const all = wildPlants(state);
    expect(all.length).toBeGreaterThan(5);
    // Never two in one place: every seedling came up at least MIN_SPACING from everything before it.
    for (const a of all) {
      if (!a.bornWild) continue;
      for (const b of all) {
        if (a === b || a.location.kind !== 'wild' || b.location.kind !== 'wild') continue;
        expect(Math.hypot(a.location.x - b.location.x, a.location.y - b.location.y)).toBeGreaterThanOrEqual(MIN_SPACING - 1e-9);
      }
    }
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
  });

  it('a filling region gets harder to spread into', () => {
    const rate = (n: number) => {
      const state = createNewGame();
      // A region already holding n plants (far off, so they don't crowd the test plant).
      for (let i = 0; i < n; i++) wild(state, `f${i}`, 47 + (i % 40) * 1.05, 26 + Math.floor(i / 40) * 1.2, 0, 'clover');
      wild(state, 'p', 70.5, 41.5, STAGE_AT.specimen, 'pothos');
      const rand = mulberry32(2);
      let born = 0;
      for (let i = 0; i < 400; i++) {
        born += spreadStep(state, open, 0, rand).length;
        for (const k of wildPlants(state)) if (k.bornWild) delete state.plants[k.id];
      }
      return born;
    };
    expect(rate(110)).toBeLessThan(rate(0) / 2);
  });

  it('established plants (not yet large) do not spread', () => {
    const state = createNewGame();
    wild(state, 'p', 55.5, 28.5, STAGE_AT.established, 'pothos');
    for (let i = 0; i < 100; i++) spreadStep(state, open, 0, () => 0.001);
    expect(wildPlants(state)).toHaveLength(1);
  });
});

describe('ground cover', () => {
  it('starts beside something already growing and creeps out from there', () => {
    const state = createNewGame();
    const w = coverWorld(state, open);
    const rand = mulberry32(13);
    for (let i = 0; i < 60; i++) coverStep(state, w, open, i * 60, rand);
    const list = patchesOf(state);
    expect(list.length).toBeGreaterThan(10);
    for (const [x, y, k, lv] of list) {
      expect(COVER_KINDS[k]).toBeDefined();
      expect(lv).toBeGreaterThanOrEqual(1);
      expect(lv).toBeLessThanOrEqual(MAX_LEVEL);
      expect(zoneAt(x, y)).not.toBe('greenhouse');
      expect(isWater(x, y)).toBe(false);
      expect(open(x, y)).toBe(true);
    }
  });

  it('one patch per tile, ever, and never a solid sheet', () => {
    const state = createNewGame();
    advanceWorld(state, 60_000, 0, open, mulberry32(5), { cover: true });
    const keys = patchesOf(state).map(([x, y]) => y * GRID_W + x);
    expect(new Set(keys).size).toBe(keys.length);
    // Somewhere in the valley a tile is left open among covered ones: the mosaic rule at work.
    const set = new Set(keys);
    const fullySurrounded = keys.filter((k) => [-GRID_W - 1, -GRID_W, -GRID_W + 1, -1, 1, GRID_W - 1, GRID_W, GRID_W + 1].every((d) => set.has(k + d)));
    expect(fullySurrounded.length).toBeLessThan(keys.length * 0.25);
  });

  it('is capped however long the valley is left alone, and so are the wild plants', () => {
    const state = createNewGame();
    for (let i = 0; i < 6; i++) wild(state, `p${i}`, 50.5 + i * 4, 30.5, STAGE_AT.specimen, i % 2 ? 'pothos' : 'clover');
    advanceWorld(state, 200_000, 0, open, mulberry32(3), { cover: true });
    expect(patchesOf(state).length).toBeLessThanOrEqual(COVER_TOTAL_CAP);
    expect(wildPlants(state).length).toBeLessThanOrEqual(WILD_TOTAL_CAP);
    const meadow = wildPlants(state).filter((p) => p.location.kind === 'wild' && p.location.zone === 'meadow').length;
    expect(meadow).toBeLessThanOrEqual(WILD_ZONE_CAP);
  });

  it('keeps out of beds, off the middle of paths, and is scraped away when ground is worked', () => {
    const state = createNewGame();
    state.coins = 100_000;
    advanceWorld(state, 40_000, 0, open, mulberry32(6), { cover: true });
    const inside = (x: number, y: number) => x >= 50 && x < 54 && y >= 27 && y < 30;
    // Make sure there's some cover where the bed will go.
    for (let x = 50; x < 54; x++) if (!patchesOf(state).some((p) => p[0] === x && p[1] === 28)) patchesOf(state).push([x, 28, 1, 2, 0]);
    const bed = createBed(state, { x: 50, y: 27, w: 4, h: 3, shape: 'rect' }, landWorld, 0);
    expect(bed).not.toBeNull();
    expect(patchesOf(state).some(([x, y]) => inside(x + 0.5, y + 0.5))).toBe(false);
    // And nothing grows back inside it.
    advanceWorld(state, 20_000, 0, open, mulberry32(7), { cover: true });
    expect(patchesOf(state).some(([x, y]) => inside(x + 0.5, y + 0.5))).toBe(false);
    // A path cuts through whatever's there.
    for (let x = 56; x < 64; x++) if (!patchesOf(state).some((p) => p[0] === x && p[1] === 34)) patchesOf(state).push([x, 34, 0, 3, 0]);
    expect(createPath(state, [56, 34.5, 60, 34.5, 63.5, 34.5], landWorld, 0)).not.toBeNull();
    expect(patchesOf(state).some(([x, y]) => y === 34 && x >= 56 && x <= 63)).toBe(false);
  });

  it('shows up in the lush field the renderer draws from', () => {
    const state = createNewGame();
    patchesOf(state).push([50, 30, COVER_KINDS.indexOf('mushrooms'), 3, 0]);
    const lush = computeLushness(state);
    expect(coverCell(lush.cover[30 * GRID_W + 50])).toEqual({ kind: COVER_KINDS.indexOf('mushrooms'), level: 3 });
    expect(coverCell(lush.cover[30 * GRID_W + 51])).toBeNull();
  });

  it('grows faster with the leaf-mould mulch, but grows anyway without it', () => {
    const run = (mulch: boolean) => {
      const state = createNewGame();
      if (mulch) state.owned.push('leafMould');
      advanceWorld(state, 8000, 0, open, mulberry32(10), { cover: true });
      return patchesOf(state).length;
    };
    expect(run(false)).toBeGreaterThan(20);
    expect(run(true)).toBeGreaterThan(run(false));
  });
});

describe('no coins needed, nothing else disturbed', () => {
  it('a penniless garden still grows, spreads and greens over, and the coins are untouched', () => {
    const state = createNewGame();
    state.coins = 0;
    wild(state, 'p', 55.5, 28.5, STAGE_AT.large, 'pothos');
    const res = advanceWorld(state, 20_000, 0, open, mulberry32(1), { cover: true });
    expect(state.coins).toBe(0);
    expect(res.ups.length + res.spreads.length).toBeGreaterThan(0);
    expect(patchesOf(state).length).toBeGreaterThan(0);
  });

  it('leaves the fox, Scout, Scott, Ranger, the collection and indoor plants as they were', () => {
    const state = createNewGame();
    state.collection.pothos = { foundAt: 0, variants: ['golden'], grown: 2, propagated: 1, sold: 0, earned: 0, plantedOut: 1, displayed: 0 };
    state.plants.pot = { id: 'pot', defId: 'pothos', variantId: 'golden', seed: 1, growth: 100, location: { kind: 'nursery', bedId: 'bed1' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false };
    const snap = JSON.stringify({ fox: state.fox, scout: state.scout, scott: state.scott, cat: state.cat, koi: state.koi, regions: state.regions, collection: state.collection });
    advanceWorld(state, 30_000, 0, open, mulberry32(2), { cover: true });
    expect(JSON.stringify({ fox: state.fox, scout: state.scout, scott: state.scott, cat: state.cat, koi: state.koi, regions: state.regions, collection: state.collection })).toBe(snap);
    // The potted plant grew where it was, and stayed potted.
    expect(state.plants.pot.location).toEqual({ kind: 'nursery', bedId: 'bed1' });
    expect(state.plants.pot.growth).toBeGreaterThan(100);
  });
});

describe('persistence', () => {
  it('growth and ground cover survive a save and reload', () => {
    const state = createNewGame();
    wild(state, 'p', 55.5, 28.5, STAGE_AT.large, 'pothos');
    advanceWorld(state, 15_000, 0, open, mulberry32(9), { cover: true });
    const loaded = migrateSave(JSON.parse(JSON.stringify(state)))!;
    expect(loaded).not.toBeNull();
    expect(loaded.ground.patches).toEqual(state.ground.patches);
    expect(Object.keys(loaded.plants).sort()).toEqual(Object.keys(state.plants).sort());
    expect(loaded.plants.p.growth).toBe(state.plants.p.growth);
  });

  it('a save from before overgrowth loads with bare ground, and a damaged one is cleaned up', () => {
    const old = JSON.parse(JSON.stringify(createNewGame()));
    delete old.ground;
    expect(migrateSave(old)!.ground.patches).toEqual([]);
    const clean = sanitizeCover({ patches: [[1, 1, 0, 2, 0], [1, 1, 3, 4, 0], [2, 1, 99, 1, 0], [-1, 0, 0, 1, 0], [3, 1, 0, 9, 0], 'junk', [4, 1, 0, 1]] });
    expect(clean.patches).toEqual([
      [1, 1, 0, 2, 0],
      [3, 1, 0, 4, 0],
    ]);
  });

  it('leaving and coming back twice adds up: nothing is lost or redone in between', () => {
    const state = createNewGame();
    state.clock.lastRealTimestamp = 1_700_000_000_000;
    wild(state, 'p', 55.5, 28.5, STAGE_AT.large, 'pothos');
    const rand = mulberry32(31);
    returnAfter(state, 24, rand);
    const mid = migrateSave(JSON.parse(JSON.stringify(state)))!;
    const coverMid = mid.ground.patches.length;
    const growthMid = mid.plants.p.growth;
    returnAfter(mid, 24, rand);
    expect(mid.ground.patches.length).toBeGreaterThan(coverMid);
    expect(mid.plants.p.growth).toBeGreaterThan(growthMid);
  });
});
