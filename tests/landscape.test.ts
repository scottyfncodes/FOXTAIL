import { describe, it, expect } from 'vitest';
import { SHOP_ITEMS } from '../src/game/data/shop';
import { createNewGame, type GameState, type OwnedPlant } from '../src/game/state';
import {
  bedBlockReason,
  bedContains,
  bedCost,
  canTransplant,
  checkPlanting,
  compostPlant,
  placeRaisedBed,
  bedRefund,
  createBed,
  createPath,
  encroachment,
  ENCROACH_MINUTES,
  onPath,
  plantsInBed,
  previewPath,
  removeBed,
  removePath,
  rotateBed,
  bedTurnBlock,
  simplifyRoute,
  transplant,
  type LandscapeWorld,
} from '../src/game/systems/landscape';
import { spreadStep, advanceWorld } from '../src/game/systems/wild';
import { STAGE_AT, growthMultiplier } from '../src/game/systems/growth';
import { RAISED_BED } from '../src/game/data/shop';
import { mulberry32 } from '../src/game/engine/Random';

/** A patch of open meadow with a tree at (60,30) and a bush at (62,30). */
function world(extra: Record<string, 'tree' | 'bush' | 'rock' | 'flower'> = {}): LandscapeWorld {
  const obs: Record<string, string> = { '60,30': 'tree', '62,30': 'bush', '63,31': 'flower', ...extra };
  return {
    obstacleAt: (x, y) => (obs[`${x},${y}`] as 'tree') ?? null,
    isBuiltOrWater: (x, y) => x < 0 || y < 0 || x >= 90 || y >= 64 || (x >= 40 && x < 44),
    isSpot: (x, y) => x === 70 && y === 26,
  };
}

function wild(state: GameState, id: string, x: number, y: number, growth: number, defId = 'pothos', variantId = 'golden'): OwnedPlant {
  const p: OwnedPlant = { id, defId, variantId, seed: 3, growth, location: { kind: 'wild', x, y, zone: 'meadow' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false };
  state.plants[id] = p;
  return p;
}

describe('precise outdoor planting', () => {
  it('fits a young plant in between two others when there’s physically room', () => {
    const state = createNewGame();
    wild(state, 'a', 55, 28, STAGE_AT.young, 'snakePlant', 'standard');
    wild(state, 'b', 56.4, 28, STAGE_AT.young, 'snakePlant', 'standard');
    expect(checkPlanting(state, 'snakePlant', 55.7, 28, world(), 0).block).toBeNull();
    // …but not on top of one.
    const c = checkPlanting(state, 'snakePlant', 55.15, 28, world(), 0);
    expect(c.block).toBe('crowded');
    expect(c.blocker?.id).toBe('a');
  });

  it('leaves more room around a plant as it grows', () => {
    const state = createNewGame();
    const m = wild(state, 'm', 55, 28, STAGE_AT.young, 'monstera', 'deliciosa');
    expect(checkPlanting(state, 'fittonia', 55.8, 28, world(), 0).block).toBeNull();
    m.growth = STAGE_AT.specimen;
    expect(checkPlanting(state, 'fittonia', 55.8, 28, world(), 0).block).toBe('crowded');
  });

  it('refuses water, trees, wild patches, paths and garden decor — but not a wildflower', () => {
    const state = createNewGame();
    expect(checkPlanting(state, 'pothos', 41.5, 30.5, world(), 0).block).toBe('water');
    expect(checkPlanting(state, 'pothos', 60.5, 30.5, world(), 0).block).toBe('obstacle');
    expect(checkPlanting(state, 'pothos', 70.5, 26.5, world(), 0).block).toBe('spot');
    expect(checkPlanting(state, 'pothos', 63.5, 31.5, world(), 0).block).toBeNull();
    state.decor.push({ id: 'd', decorId: 'birdbath', x: 50, y: 30 });
    expect(checkPlanting(state, 'pothos', 50.2, 30.1, world(), 0).block).toBe('decor');
    state.paths.push({ id: 'p', points: [48, 34, 52, 34], width: 1.15, createdAt: 0 });
    expect(checkPlanting(state, 'pothos', 50, 34.1, world(), 0).block).toBe('path');
  });

  it('knows when the spot is inside one of your garden beds', () => {
    const state = createNewGame();
    state.gardenBeds.push({ id: 'bed', x: 50, y: 28, w: 3, h: 3, shape: 'rect', createdAt: 0 });
    expect(checkPlanting(state, 'pothos', 51, 29, world(), 0).bedId).toBe('bed');
    expect(checkPlanting(state, 'pothos', 54, 29, world(), 0).bedId).toBeUndefined();
  });
});

describe('moving plants outdoors', () => {
  it('moves a young plant to exactly where you put it, keeping its growth', () => {
    const state = createNewGame();
    const p = wild(state, 'p', 55, 28, STAGE_AT.established);
    expect(canTransplant(p)).toBe(true);
    expect(transplant(state, 'p', 57.35, 29.8, world(), 0)).toBe(true);
    expect(p.location).toMatchObject({ kind: 'wild', x: 57.35, y: 29.8 });
    expect(p.growth).toBe(STAGE_AT.established);
  });

  it('won’t move a plant once it’s large — it has settled in', () => {
    const state = createNewGame();
    const p = wild(state, 'p', 55, 28, STAGE_AT.large);
    expect(canTransplant(p)).toBe(false);
    expect(transplant(state, 'p', 57, 29, world(), 0)).toBe(false);
    expect(p.location).toMatchObject({ x: 55, y: 28 });
  });

  it('moving a plant into a bed makes it part of the bed', () => {
    const state = createNewGame();
    state.gardenBeds.push({ id: 'bed', x: 50, y: 28, w: 3, h: 3, shape: 'rect', createdAt: 0 });
    wild(state, 'p', 55, 28, STAGE_AT.young);
    transplant(state, 'p', 51, 29, world(), 0);
    expect(plantsInBed(state, 'bed').map((x) => x.id)).toEqual(['p']);
  });
});

describe('composting wild plants', () => {
  it('clears the ground, and gives nothing back but maybe a cutting', () => {
    const state = createNewGame();
    wild(state, 'small', 55, 28, 10);
    wild(state, 'big', 58, 28, STAGE_AT.specimen);
    const coins = state.coins;
    const a = compostPlant(state, 'small', 0, () => 0.99)!;
    compostPlant(state, 'big', 0, () => 0.99)!;
    expect(state.coins).toBe(coins);
    expect(state.plants.small).toBeUndefined();
    expect(state.plants.big).toBeUndefined();
    expect(a.cutting).toBeNull();
  });

  it('sometimes saves a cutting — but not guaranteed, and not always true to type', () => {
    const state = createNewGame();
    const outcomes = new Map<string, number>();
    const rand = mulberry32(42);
    for (let i = 0; i < 300; i++) {
      wild(state, `p${i}`, 55, 28, STAGE_AT.large, 'pothos', 'manjula');
      const r = compostPlant(state, `p${i}`, 0, rand)!;
      const key = r.cutting ? (r.cutting.variantId === 'manjula' ? 'same' : 'different') : 'none';
      outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
      state.basket = [];
    }
    expect(outcomes.get('none')).toBeGreaterThan(50);
    expect(outcomes.get('same')).toBeGreaterThan(30);
    expect(outcomes.get('different')).toBeGreaterThan(30);
  });

  it('only composts plants out in the landscape', () => {
    const state = createNewGame();
    state.plants.n = { id: 'n', defId: 'pothos', variantId: 'golden', seed: 1, growth: 999, location: { kind: 'nursery', bedId: 'bed1' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false };
    expect(compostPlant(state, 'n', 0)).toBeNull();
    expect(state.plants.n).toBeDefined();
  });
});

describe('garden beds', () => {
  it('cost coins, clear the scrub inside, and take in plants already growing there', () => {
    const state = createNewGame();
    state.coins = 500;
    wild(state, 'inside', 62.5, 31.2, STAGE_AT.young);
    const spec = { x: 61.5, y: 29.5, w: 3, h: 3, shape: 'rect' as const };
    const cost = bedCost(state, 3, 3);
    expect(cost).toBeGreaterThan(0);
    const res = createBed(state, spec, world(), 5)!;
    expect(res).not.toBeNull();
    expect(state.coins).toBe(500 - cost);
    expect(res.bed.paid).toBe(cost);
    expect(state.clearedObstacles).toEqual(expect.arrayContaining(['62,30', '63,31']));
    expect(state.plants.inside.location).toMatchObject({ bedId: res.bed.id });
  });

  it('cost more each time you dig one, and more for bigger ones', () => {
    const state = createNewGame();
    state.coins = 5000;
    const first = bedCost(state, 3, 3);
    expect(bedCost(state, 4, 4)).toBeGreaterThan(first);
    createBed(state, { x: 50, y: 20, w: 3, h: 3, shape: 'rect' }, world(), 0);
    expect(bedCost(state, 3, 3)).toBeGreaterThan(first);
  });

  it('can’t be dug through trees, over water, over wild patches, on another bed, or without coins', () => {
    const state = createNewGame();
    state.coins = 5000;
    expect(bedBlockReason(state, { x: 59.5, y: 29.5, w: 2, h: 2, shape: 'rect' }, world())).toBe('blocked');
    expect(bedBlockReason(state, { x: 39, y: 20, w: 3, h: 2, shape: 'rect' }, world())).toBe('blocked');
    expect(bedBlockReason(state, { x: 69.5, y: 25.5, w: 2, h: 2, shape: 'rect' }, world())).toBe('patch');
    expect(bedBlockReason(state, { x: 50, y: 20, w: 1, h: 3, shape: 'rect' }, world())).toBe('too-small');
    createBed(state, { x: 50, y: 20, w: 3, h: 3, shape: 'oval' }, world(), 0);
    expect(bedBlockReason(state, { x: 52, y: 21, w: 3, h: 3, shape: 'rect' }, world())).toBe('overlap');
    state.coins = 0;
    expect(bedBlockReason(state, { x: 70, y: 40, w: 3, h: 3, shape: 'rect' }, world())).toBe('coins');
  });

  it('come raised, from the stall: set down from the basket, no coins at dig time, and taken up again whole', () => {
    const state = createNewGame();
    state.coins = 0;
    state.decorStock.raisedBed = 1;
    const spec = { x: 50, y: 20, w: RAISED_BED.w, h: RAISED_BED.h, shape: 'rect' as const };
    expect(bedBlockReason(state, { ...spec, raised: true }, world())).toBeNull();
    const res = placeRaisedBed(state, 50, 20, world(), 0, RAISED_BED)!;
    expect(res).not.toBeNull();
    expect(res.bed.raised).toBe(true);
    expect(state.decorStock.raisedBed).toBe(0);
    expect(state.coins).toBe(0);
    expect(bedRefund(res.bed)).toBe(0);
    expect(removeBed(state, res.bed.id)).toBe(true);
    expect(state.decorStock.raisedBed).toBe(1);
    expect(state.coins).toBe(0);
  });

  it('come in round shapes too', () => {
    const oval = { x: 0, y: 0, w: 4, h: 2, shape: 'oval' as const };
    expect(bedContains(oval, 2, 1)).toBe(true);
    expect(bedContains(oval, 0.1, 0.1)).toBe(false);
    expect(bedContains({ ...oval, shape: 'rect' }, 0.1, 0.1)).toBe(true);
  });

  it('keep their plants’ spreading inside the bed — and keep outsiders out', () => {
    const state = createNewGame();
    state.gardenBeds.push({ id: 'bed', x: 50, y: 20, w: 3, h: 3, shape: 'rect', createdAt: 0 });
    const inBed = wild(state, 'in', 51.5, 21.5, STAGE_AT.specimen);
    (inBed.location as { bedId?: string }).bedId = 'bed';
    wild(state, 'out', 55.5, 21.5, STAGE_AT.specimen);
    const rand = mulberry32(9);
    for (let i = 0; i < 600; i++) spreadStep(state, () => true, 0, rand);
    const kids = Object.values(state.plants).filter((p) => p.bornWild && p.location.kind === 'wild');
    const bedKids = kids.filter((k) => (k.location as { bedId?: string }).bedId === 'bed');
    expect(bedKids.length).toBeGreaterThan(0);
    for (const k of kids) {
      const l = k.location as { x: number; y: number; bedId?: string };
      const inside = bedContains(state.gardenBeds[0], l.x, l.y);
      expect(inside).toBe(l.bedId === 'bed');
    }
    // Everything the bed plant spawned stayed inside the bed.
    expect(bedKids.every((k) => bedContains(state.gardenBeds[0], (k.location as { x: number }).x, (k.location as { y: number }).y))).toBe(true);
  });

  it('are good ground: plants in them grow a little faster, and keep growing over time', () => {
    const state = createNewGame();
    const a = wild(state, 'a', 51, 21, STAGE_AT.young);
    const b = wild(state, 'b', 70, 21, STAGE_AT.young);
    state.gardenBeds.push({ id: 'bed', x: 50, y: 20, w: 3, h: 3, shape: 'rect', createdAt: 0 });
    (a.location as { bedId?: string }).bedId = 'bed';
    expect(growthMultiplier(state, a)).toBeGreaterThan(growthMultiplier(state, b));
    advanceWorld(state, 2000, 0, () => true, mulberry32(1));
    expect(a.growth).toBeGreaterThan(b.growth);
    expect(a.growth).toBeGreaterThan(STAGE_AT.large);
  });

  it('can be filled back in: the plants stay, free to roam, with half the coins back', () => {
    const state = createNewGame();
    state.coins = 500;
    wild(state, 'p', 51.5, 21.5, STAGE_AT.young);
    const res = createBed(state, { x: 50, y: 20, w: 3, h: 3, shape: 'rect' }, world(), 0)!;
    const left = state.coins;
    expect(removeBed(state, res.bed.id)).toBe(true);
    expect(state.gardenBeds).toHaveLength(0);
    expect(state.plants.p).toBeDefined();
    expect((state.plants.p.location as { bedId?: string }).bedId).toBeUndefined();
    expect(state.coins).toBe(left + bedRefund(res.bed));
    expect(bedRefund(res.bed)).toBe(Math.floor(res.bed.paid! / 2));
  });
});

describe('turning garden beds', () => {
  it('turns a bed a quarter-turn about its centre, and its plants turn with it', () => {
    const state = createNewGame();
    state.coins = 1000;
    const res = createBed(state, { x: 50, y: 20, w: 4, h: 2, shape: 'rect' }, world(), 0)!;
    const p = wild(state, 'p', 51, 20.5, 300);
    p.location = { ...p.location, kind: 'wild', bedId: res.bed.id } as OwnedPlant['location'];
    expect(bedTurnBlock(state, res.bed.id, world())).toBeNull();
    const coins = state.coins;
    expect(rotateBed(state, res.bed.id, world())).toBe(true);
    expect(res.bed).toMatchObject({ x: 51, y: 19, w: 2, h: 4 });
    expect(state.coins).toBe(coins);
    // (51, 20.5) sat a tile left of centre and a little above; a quarter-turn clockwise puts it a little right and a tile up.
    expect(p.location).toMatchObject({ x: 52.5, y: 20, bedId: res.bed.id });
    expect(bedContains(res.bed, 52.5, 20)).toBe(true);
    expect(plantsInBed(state, res.bed.id)).toHaveLength(1);
  });

  it('won’t turn into a tree, another bed, or a wild patch — and a square bed has nothing to turn', () => {
    const state = createNewGame();
    state.coins = 100000;
    // Stood on end this bed would cover the tree at (60,30).
    const byTree = createBed(state, { x: 58, y: 28, w: 4, h: 2, shape: 'rect' }, world(), 0)!;
    expect(bedTurnBlock(state, byTree.bed.id, world())).toBe('blocked');
    expect(rotateBed(state, byTree.bed.id, world())).toBe(false);
    expect(byTree.bed).toMatchObject({ x: 58, y: 28, w: 4, h: 2 });
    // Turned, this one would run into its neighbour below.
    const upper = createBed(state, { x: 50, y: 20, w: 4, h: 2, shape: 'rect' }, world(), 0)!;
    createBed(state, { x: 50, y: 23, w: 4, h: 2, shape: 'rect' }, world(), 0);
    expect(bedTurnBlock(state, upper.bed.id, world())).toBe('overlap');
    // Turned, this one would reach the wild patch at (70,26).
    const byPatch = createBed(state, { x: 68, y: 24, w: 4, h: 2, shape: 'rect' }, world(), 0)!;
    expect(bedTurnBlock(state, byPatch.bed.id, world())).toBe('patch');
    const square = createBed(state, { x: 75, y: 40, w: 3, h: 3, shape: 'oval' }, world(), 0)!;
    expect(bedTurnBlock(state, square.bed.id, world())).toBe('square');
    expect(rotateBed(state, square.bed.id, world())).toBe(false);
  });

  it('keeps a raised bed on quarter tiles when it turns, and clears the scrub it now covers', () => {
    const state = createNewGame();
    state.decorStock.raisedBed = 1;
    const w = world();
    const res = placeRaisedBed(state, 62, 29.25, w, 0, RAISED_BED)!;
    expect(res.bed).toMatchObject({ x: 60.75, y: 28.5, w: 2.5, h: 1.5 });
    // Lying flat it stops short of the bush at (62,30); stood on end it covers it, and the bush is cleared like any bed's scrub.
    expect(state.clearedObstacles).not.toContain('62,30');
    expect(rotateBed(state, res.bed.id, w)).toBe(true);
    expect(res.bed).toMatchObject({ x: 61.25, y: 28, w: 1.5, h: 2.5, raised: true });
    expect(state.clearedObstacles).toContain('62,30');
  });
});

describe('carved paths', () => {
  const route = [
    { x: 58, y: 34 },
    { x: 60, y: 34.2 },
    { x: 62.5, y: 34.4 },
    { x: 65, y: 34.5 },
  ];

  it('are traced as a compact, thinned route', () => {
    const pts = simplifyRoute([...route, { x: 65.05, y: 34.5 }]);
    expect(pts.length % 2).toBe(0);
    expect(pts.length / 2).toBeLessThanOrEqual(8);
    expect(pts.slice(0, 2)).toEqual([58, 34]);
  });

  it('clear the scrub in the way, dig up your plants that stood on the route, and cost coins', () => {
    const state = createNewGame();
    state.coins = 1000;
    wild(state, 'inWay', 61, 34.2, STAGE_AT.large);
    wild(state, 'besides', 61, 36.5, STAGE_AT.large);
    const pts = simplifyRoute(route);
    const w = world({ '61,34': 'bush' });
    const preview = previewPath(state, pts, w);
    expect(preview.block).toBeNull();
    expect(preview.plants.map((p) => p.id)).toEqual(['inWay']);
    expect(preview.cost).toBeGreaterThan(0);
    const res = createPath(state, pts, w, 100)!;
    expect(res.dugUp).toBe(1);
    expect(res.cost).toBe(preview.cost);
    expect(state.coins).toBe(1000 - res.cost);
    expect(state.plants.inWay).toBeUndefined();
    expect(state.plants.besides).toBeDefined();
    expect(state.clearedObstacles).toContain('61,34');
    expect(onPath(state, 62, 34.3, 100)).toBeDefined();
  });

  it('need a chainsaw to go through trees and a rock hammer to go through rocks', () => {
    const state = createNewGame();
    state.coins = 5000;
    const route = simplifyRoute([{ x: 58, y: 36.5 }, { x: 62, y: 36.5 }]);
    expect(previewPath(state, route, world({ '60,36': 'tree' })).block).toBe('tool');
    expect(previewPath(state, route, world({ '60,36': 'rock' })).block).toBe('tool');
    // Scrub is just trampled: no tools needed for a bush.
    expect(previewPath(state, route, world({ '60,36': 'bush' })).block).toBeNull();
    state.owned.push('chainsaw');
    expect(previewPath(state, route, world({ '60,36': 'tree' })).block).toBeNull();
    expect(previewPath(state, route, world({ '60,36': 'rock' })).block).toBe('tool');
    state.owned.push('rockHammer');
    expect(previewPath(state, route, world({ '60,36': 'rock' })).block).toBeNull();
  });

  it('go through trees and rocks for a higher price, but never water or a garden bed', () => {
    const state = createNewGame();
    state.coins = 5000;
    state.owned.push('chainsaw', 'rockHammer');
    const plain = previewPath(state, simplifyRoute([{ x: 58, y: 36.5 }, { x: 62, y: 36.5 }]), world({}));
    const treed = previewPath(state, simplifyRoute([{ x: 58, y: 36.5 }, { x: 62, y: 36.5 }]), world({ '60,36': 'tree' }));
    const rocky = previewPath(state, simplifyRoute([{ x: 58, y: 36.5 }, { x: 62, y: 36.5 }]), world({ '60,36': 'rock' }));
    expect(treed.block).toBeNull();
    expect(treed.trees).toHaveLength(1);
    expect(treed.cost).toBeGreaterThan(plain.cost);
    expect(rocky.rocks).toHaveLength(1);
    expect(rocky.cost).toBeGreaterThan(plain.cost);
    state.coins = 0;
    expect(previewPath(state, simplifyRoute([{ x: 58, y: 36.5 }, { x: 62, y: 36.5 }]), world({})).block).toBe('coins');
    state.coins = 5000;
    expect(previewPath(state, simplifyRoute([{ x: 38, y: 20 }, { x: 45, y: 20 }]), world()).block).toBe('blocked');
    state.gardenBeds.push({ id: 'bed', x: 59, y: 33, w: 3, h: 3, shape: 'rect', createdAt: 0 });
    expect(previewPath(state, simplifyRoute(route), world()).block).toBe('bed');
    expect(previewPath(state, simplifyRoute([{ x: 50, y: 50 }, { x: 50.5, y: 50 }]), world()).block).toBe('too-short');
  });

  it('stay clear down the middle, while the verges slowly grow back in', () => {
    const state = createNewGame();
    state.coins = 1000;
    const pts = simplifyRoute(route);
    const path = createPath(state, pts, world(), 0)!.path;
    // New seedlings can't come up on a fresh path at all…
    expect(onPath(state, 61, 34.2 + 0.5, 0, true)).toBeDefined();
    // …but after a few days they can take hold along its edges, never the middle.
    const later = ENCROACH_MINUTES;
    expect(encroachment(path, later)).toBe(1);
    expect(onPath(state, 61, 34.2 + 0.5, later, true)).toBeUndefined();
    expect(onPath(state, 61, 34.25, later, true)).toBeDefined();
    // Spreading respects it: nothing seeds onto the walking line.
    wild(state, 'p', 61, 36, STAGE_AT.specimen);
    const rand = mulberry32(5);
    for (let i = 0; i < 400; i++) spreadStep(state, () => true, 0, rand);
    for (const k of Object.values(state.plants).filter((p) => p.bornWild)) {
      expect(onPath(state, (k.location as { x: number }).x, (k.location as { y: number }).y, 0, true)).toBeUndefined();
    }
  });

  it('can be let go again, and reshaped by carving a new one', () => {
    const state = createNewGame();
    state.coins = 1000;
    const res = createPath(state, simplifyRoute(route), world(), 0)!;
    expect(removePath(state, res.path.id)).toBe(true);
    expect(state.paths).toHaveLength(0);
    expect(createPath(state, simplifyRoute(route.map((p) => ({ x: p.x, y: p.y + 2 }))), world(), 0)).not.toBeNull();
    expect(state.paths).toHaveLength(1);
  });
});

import { removeRock, rockRemovalBlock, ROCK_REMOVAL_COST, clearObstacle, clearBlock, clearCost, CLEAR_COST } from '../src/game/systems/landscape';
import { buildBlockingSet as blockingFrom, generateObstacles as allObstacles } from '../src/game/world/Obstacles';

describe('hauling rocks away', () => {
  const obstacles = allObstacles();
  const rock = obstacles.find((o) => o.kind === 'rock')!;
  const tree = obstacles.find((o) => o.kind === 'tree')!;
  const worldFor = (cleared: string[]) => ({
    obstacleAt: (tx: number, ty: number) => {
      const o = obstacles.find((b) => b.x === tx && b.y === ty);
      return o && !cleared.includes(`${tx},${ty}`) ? o.kind : null;
    },
    isBuiltOrWater: () => false,
    isSpot: () => false,
  });

  it('needs a rock hammer from the stall first', () => {
    const state = createNewGame();
    state.coins = 1000;
    expect(rockRemovalBlock(state, worldFor([]), rock.x, rock.y)).toBe('tool');
    expect(removeRock(state, worldFor([]), rock.x, rock.y)).toBe(false);
    expect(state.coins).toBe(1000);
    expect(SHOP_ITEMS.find((i) => i.id === 'rockHammer')?.category).toBe('equipment');
  });

  it('costs coins and leaves open ground behind', () => {
    const state = createNewGame();
    state.owned.push('rockHammer');
    state.coins = ROCK_REMOVAL_COST - 1;
    expect(rockRemovalBlock(state, worldFor(state.clearedObstacles), rock.x, rock.y)).toBe('coins');
    expect(removeRock(state, worldFor(state.clearedObstacles), rock.x, rock.y)).toBe(false);
    state.coins = ROCK_REMOVAL_COST + 5;
    expect(removeRock(state, worldFor(state.clearedObstacles), rock.x, rock.y)).toBe(true);
    expect(state.coins).toBe(5);
    expect(blockingFrom(obstacles, state.clearedObstacles).has(`${rock.x},${rock.y}`)).toBe(false);
    // Already gone: nothing more to pay for.
    expect(rockRemovalBlock(state, worldFor(state.clearedObstacles), rock.x, rock.y)).toBe('no-rock');
  });

  it('only works on rocks', () => {
    const state = createNewGame();
    state.coins = 1000;
    expect(removeRock(state, worldFor([]), tree.x, tree.y)).toBe(false);
    expect(state.coins).toBe(1000);
  });
});

describe('clearing trees and bushes', () => {
  const obstacles = allObstacles();
  const tree = obstacles.find((o) => o.kind === 'tree')!;
  const bush = obstacles.find((o) => o.kind === 'bush')!;
  const flower = obstacles.find((o) => o.kind === 'flower')!;
  const worldFor = (cleared: string[]) => ({
    obstacleAt: (tx: number, ty: number) => {
      const o = obstacles.find((b) => b.x === tx && b.y === ty);
      return o && !cleared.includes(`${tx},${ty}`) ? o.kind : null;
    },
    isBuiltOrWater: () => false,
    isSpot: () => false,
  });

  it('needs a chainsaw from the stall first, for trees and bushes alike', () => {
    const state = createNewGame();
    state.coins = 1000;
    const w = worldFor([]);
    expect(clearBlock(state, w, tree.x, tree.y)).toBe('tool');
    expect(clearBlock(state, w, bush.x, bush.y)).toBe('tool');
    expect(clearObstacle(state, w, bush.x, bush.y)).toBeNull();
    // A rock hammer is no use on a tree.
    state.owned.push('rockHammer');
    expect(clearBlock(state, w, tree.x, tree.y)).toBe('tool');
    state.owned.push('chainsaw');
    expect(clearBlock(state, w, tree.x, tree.y)).toBeNull();
    expect(SHOP_ITEMS.find((i) => i.id === 'chainsaw')?.category).toBe('equipment');
  });

  it('costs by kind: a bush is cheap, a tree is dear, and the ground is open for good after', () => {
    expect(CLEAR_COST.tree).toBeGreaterThan(CLEAR_COST.rock);
    expect(CLEAR_COST.rock).toBeGreaterThan(CLEAR_COST.bush);
    const state = createNewGame();
    state.owned.push('chainsaw');
    const w = worldFor(state.clearedObstacles);
    expect(clearCost(w, tree.x, tree.y)).toBe(CLEAR_COST.tree);
    expect(clearCost(w, bush.x, bush.y)).toBe(CLEAR_COST.bush);
    state.coins = CLEAR_COST.tree - 1;
    expect(clearBlock(state, w, tree.x, tree.y)).toBe('coins');
    expect(clearObstacle(state, w, tree.x, tree.y)).toBeNull();
    state.coins = CLEAR_COST.tree + CLEAR_COST.bush;
    expect(clearObstacle(state, w, tree.x, tree.y)).toEqual({ kind: 'tree', cost: CLEAR_COST.tree });
    expect(clearObstacle(state, w, bush.x, bush.y)).toEqual({ kind: 'bush', cost: CLEAR_COST.bush });
    expect(state.coins).toBe(0);
    expect(blockingFrom(obstacles, state.clearedObstacles).has(`${tree.x},${tree.y}`)).toBe(false);
    expect(clearBlock(state, w, tree.x, tree.y)).toBe('nothing');
  });

  it('has nothing to charge for on flowers, reeds or open ground', () => {
    const state = createNewGame();
    state.coins = 1000;
    const w = worldFor([]);
    expect(clearCost(w, flower.x, flower.y)).toBeNull();
    expect(clearObstacle(state, w, flower.x, flower.y)).toBeNull();
    expect(clearObstacle(state, w, 0, 0)).toBeNull();
    expect(state.coins).toBe(1000);
  });
});


describe('garden trellis', () => {
  it('is a planter, like the wall trellis indoors: pot a plant in it, and it moves with it', async () => {
    const { createNewGame } = await import('../src/game/state');
    const { buyItem } = await import('../src/game/systems/market');
    const { placeDecor, moveDecor, pickUpDecor, gardenPlanter } = await import('../src/game/systems/decor');
    const { placeOnDisplay, occupantOf, liftPlant } = await import('../src/game/systems/propagation');
    const state = createNewGame();
    state.coins = 500;
    expect(buyItem(state, 'gardenTrellis')).toBe(true);
    const t = placeDecor(state, 'gardenTrellis', 60.5, 42.5)!;
    expect(gardenPlanter(state, t.id)).toBe(t);
    state.collection.pothos = { foundAt: 0, variants: ['golden'], grown: 2, propagated: 0, sold: 0, earned: 0, plantedOut: 0, displayed: 0 };
    state.basket.push({ uid: 'u', defId: 'pothos', variantId: 'golden', seed: 1, growth: 600, generation: 1, origin: 'lifted', collectedAt: 0 });
    const plant = placeOnDisplay(state, 'u', t.id, 'terracotta', 0)!;
    expect(plant.location).toEqual({ kind: 'display', slotId: t.id, potId: 'terracotta' });
    // Can't be put away with a plant in it; moving it takes the plant along.
    expect(pickUpDecor(state, t.id)).toBe(false);
    expect(moveDecor(state, t.id, 55.5, 30.5)).toBe(true);
    expect(occupantOf(state, { slotId: t.id })?.id).toBe(plant.id);
    // Lift the plant out and it can be put away again.
    expect(liftPlant(state, plant.id, 0)).not.toBeNull();
    expect(pickUpDecor(state, t.id)).toBe(true);
  });

  it('grows its plant as an outdoor plant — by the country it stands in, not the greenhouse lights', async () => {
    const { createNewGame } = await import('../src/game/state');
    const { growthMultiplier } = await import('../src/game/systems/growth');
    const { PLANTS } = await import('../src/game/data/plants');
    const state = createNewGame();
    state.owned.push('growLights');
    state.decor.push({ id: 'meadowT', decorId: 'gardenTrellis', x: 60.5, y: 30.5 }, { id: 'rockyT', decorId: 'gardenTrellis', x: 60.5, y: 50.5 });
    const base = { variantId: 'golden', seed: 1, growth: 600, plantedAt: 0, lastCuttingAt: null, generation: 1, bornWild: false, defId: 'pothos' };
    const inMeadow = { ...base, id: 'a', location: { kind: 'display' as const, slotId: 'meadowT', potId: 'terracotta' } };
    const onRocks = { ...base, id: 'b', location: { kind: 'display' as const, slotId: 'rockyT', potId: 'terracotta' } };
    const indoors = { ...base, id: 'c', location: { kind: 'display' as const, slotId: 'stand1', potId: 'terracotta' } };
    expect(growthMultiplier(state, inMeadow)).toBeCloseTo(PLANTS.pothos.growthRate * 1.3);
    expect(growthMultiplier(state, onRocks)).toBeCloseTo(PLANTS.pothos.growthRate * 0.85);
    expect(growthMultiplier(state, indoors)).toBeCloseTo(PLANTS.pothos.growthRate * 1.5);
  });
});
