import { describe, it, expect } from 'vitest';
import { createNewGame, type OwnedPlant } from '../src/game/state';
import { PLANTS, PLANT_LIST } from '../src/game/data/plants';
import { DISCOVERY_SPOTS, SPOT_EPOCH_MINUTES } from '../src/game/data/discoveryPoints';
import { spotContent } from '../src/game/systems/spots';
import { checkPlanting } from '../src/game/systems/landscape';
import { spreadStep } from '../src/game/systems/wild';
import { isWater } from '../src/game/data/worldMap';
import { inPond } from '../src/game/systems/koi';
import { buyItem } from '../src/game/systems/market';
import { placeDecor } from '../src/game/systems/decor';
import { scottHasJoint } from '../src/game/systems/scott';
import { STAGE_AT } from '../src/game/systems/growth';
import { listedSpecies } from '../src/game/systems/lineage';
import { mulberry32 } from '../src/game/engine/Random';

const world = { obstacleAt: () => null, isBuiltOrWater: (tx: number, ty: number) => isWater(tx, ty), isSpot: () => false };
// Open creek water (between the bridges), and dry bank beside it.
const CREEK = { x: 41.6, y: 22.5 };
const BANK = { x: 46.5, y: 22.5 };

describe('lily pads and cattails', () => {
  it('are listed species of the creek, each drawn its own way, with lines of rarer forms', () => {
    for (const id of ['lilyPad', 'cattail']) {
      const def = PLANTS[id];
      expect(def, id).toBeDefined();
      expect(listedSpecies()).toContain(def);
      expect(def.habitat).toContain('creek');
      expect(PLANT_LIST.filter((p) => p.form === def.form)).toEqual([def]);
      expect(def.variants.length).toBeGreaterThanOrEqual(4);
    }
    expect(PLANTS.lilyPad.water).toBe('only');
    expect(PLANTS.cattail.water).toBe('also');
  });

  it('turn up in the wild patches', () => {
    const state = createNewGame();
    state.weather.condition = 'clear';
    state.weather.nextChangeAt = Infinity;
    const seen = new Set<string>();
    for (let e = 0; e < 300 && seen.size < 2; e++) {
      state.clock.totalMinutes = e * SPOT_EPOCH_MINUTES + 12 * 60;
      for (const spot of DISCOVERY_SPOTS) {
        const c = spotContent(state, spot);
        if (c && (c.defId === 'lilyPad' || c.defId === 'cattail')) seen.add(c.defId);
      }
    }
    expect([...seen].sort()).toEqual(['cattail', 'lilyPad']);
  });

  it('a lily pad is planted only on open water: the creek or a pond', () => {
    const state = createNewGame();
    expect(isWater(Math.floor(CREEK.x), Math.floor(CREEK.y))).toBe(true);
    expect(checkPlanting(state, 'lilyPad', CREEK.x, CREEK.y, world, 0).block).toBeNull();
    expect(checkPlanting(state, 'lilyPad', BANK.x, BANK.y, world, 0).block).toBe('dry');
    state.coins = 1e5;
    state.bought.push('gardenLantern', 'birdbath', 'gardenBench');
    buyItem(state, 'gardenPond', { pond: { w: 4, h: 3 } });
    placeDecor(state, 'gardenPond', 55.5, 25.5);
    expect(inPond(state, 55.5, 25.5)).toBe(true);
    expect(checkPlanting(state, 'lilyPad', 55.5, 25.5, world, 0).block).toBeNull();
  });

  it('a cattail grows on the bank or in the shallows; a land plant still can’t go in the water', () => {
    const state = createNewGame();
    expect(checkPlanting(state, 'cattail', CREEK.x, CREEK.y, world, 0).block).toBeNull();
    expect(checkPlanting(state, 'cattail', BANK.x, BANK.y, world, 0).block).toBeNull();
    expect(checkPlanting(state, 'pothos', CREEK.x, CREEK.y, world, 0).block).toBe('water');
    expect(checkPlanting(state, 'pothos', BANK.x, BANK.y, world, 0).block).toBeNull();
  });

  it('lily pads spread only across the water; cattails spread into the water and onto the bank', () => {
    const grow = (defId: string) => {
      const state = createNewGame();
      state.plants.p = { id: 'p', defId, variantId: PLANTS[defId].variants[0].id, seed: 1, growth: STAGE_AT.specimen, location: { kind: 'wild', x: 42, y: 30, zone: 'creek' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false } as OwnedPlant;
      const rand = mulberry32(21);
      const wet: boolean[] = [];
      for (let i = 0; i < 2000; i++) {
        for (const ev of spreadStep(state, () => true, 0, rand)) {
          const c = state.plants[ev.childId];
          if (c.location.kind === 'wild') wet.push(isWater(Math.floor(c.location.x), Math.floor(c.location.y)));
          delete state.plants[ev.childId];
        }
      }
      return wet;
    };
    const pads = grow('lilyPad');
    expect(pads.length).toBeGreaterThan(5);
    expect(pads.every(Boolean)).toBe(true);
    const tails = grow('cattail');
    expect(tails.some(Boolean)).toBe(true);
    expect(tails.some((w) => !w)).toBe(true);
    // An ordinary plant by the creek never seeds into it.
    const land = grow('spiderPlant');
    expect(land.length).toBeGreaterThan(0);
    expect(land.some(Boolean)).toBe(false);
  });
});

describe('Scott and the cannabis', () => {
  it('only walks about with a joint once the player has cultivated cannabis — found isn’t enough', () => {
    const state = createNewGame();
    expect(scottHasJoint(state)).toBe(false);
    state.collection.cannabisSativa = { foundAt: 0, variants: ['wild'], grown: 0, propagated: 0, sold: 0, earned: 0, plantedOut: 0, displayed: 0 };
    expect(scottHasJoint(state)).toBe(false);
    state.collection.cannabisSativa.grownVariants = ['wild'];
    expect(scottHasJoint(state)).toBe(true);
    const other = createNewGame();
    other.collection.cannabisHybrid = { foundAt: 0, variants: ['cross'], grownVariants: ['cross'], grown: 1, propagated: 0, sold: 0, earned: 0, plantedOut: 0, displayed: 0 };
    expect(scottHasJoint(other)).toBe(true);
  });

  it('the joint is drawn only while he is walking, indoors and out', async () => {
    const src = (await import('../src/game/world/Renderer.ts?raw')).default as string;
    expect(src).toContain('if (joint && moving) this.drawJoint(');
    expect(src.match(/scottHasJoint\(state\)/g)?.length).toBe(2);
  });
});
