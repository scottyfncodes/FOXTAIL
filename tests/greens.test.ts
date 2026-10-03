import { describe, it, expect } from 'vitest';
import { createNewGame, type OwnedPlant } from '../src/game/state';
import { PLANTS, PLANT_LIST } from '../src/game/data/plants';
import { DISCOVERY_SPOTS, SPOT_EPOCH_MINUTES } from '../src/game/data/discoveryPoints';
import { spotContent, spotPool, collectSpot } from '../src/game/systems/spots';
import { plantRoles } from '../src/game/systems/beds';
import { matureRadius } from '../src/game/systems/landscape';
import { climbsTrellis } from '../src/game/systems/furniture';
import { spreadStep } from '../src/game/systems/wild';
import { priceOf, RARITY_PRICE } from '../src/game/systems/market';
import { STAGE_AT } from '../src/game/systems/growth';
import { migrateSave } from '../src/game/engine/SaveManager';
import { mulberry32 } from '../src/game/engine/Random';

const GREENS = ['moss', 'creepingThyme', 'clover', 'creepingJenny', 'virginiaCreeper', 'hosta', 'bamboo'];
const GROUND_COVERS = ['moss', 'creepingThyme', 'clover', 'creepingJenny', 'virginiaCreeper'];

describe('the seven green plants', () => {
  it('are each a listed species with its own silhouette and a line of rarer forms', () => {
    const forms = new Set<string>();
    for (const id of GREENS) {
      const def = PLANTS[id];
      expect(def, id).toBeDefined();
      expect(def.unlisted || def.secret || def.foxOnly, id).toBeFalsy();
      forms.add(def.form);
      // A form of its own: no existing species shares it.
      expect(PLANT_LIST.filter((p) => p.form === def.form).map((p) => p.id)).toEqual([id]);
      const [standard, ...rest] = def.variants;
      expect(standard.rarity, id).toBe(def.rarity);
      expect(rest.length, id).toBeGreaterThanOrEqual(3);
      expect(matureRadius(id)).toBeGreaterThan(0.3);
    }
    expect(forms.size).toBe(7);
  });

  it('are foliage plants: none of them flowers, in any form', () => {
    for (const id of GREENS) for (const v of PLANTS[id].variants) expect({ ...PLANTS[id].look, ...v.look }.flowers, `${id}/${v.id}`).toBeFalsy();
  });

  it('sit in the everyday tiers, priced like the plants already there', () => {
    for (const id of GREENS) expect(['common', 'uncommon']).toContain(PLANTS[id].rarity);
    const state = createNewGame();
    const item = (defId: string) => ({ defId, variantId: PLANTS[defId].variants[0].id, growth: STAGE_AT.large });
    // Off the market's wanted day for either, so only rarity and size count.
    state.clock.totalMinutes = 7 * 1440;
    expect(priceOf(state, item('moss'))).toBe(priceOf(state, item('spiderPlant')));
    expect(priceOf(state, item('hosta'))).toBeLessThan(RARITY_PRICE.rare * 4);
  });

  it('grow wild in the valley’s patches and can be gathered from them', () => {
    for (const id of GREENS) {
      const def = PLANTS[id];
      expect(DISCOVERY_SPOTS.some((s) => !s.foxLed && def.habitat.includes(s.zone) && spotPool(s).includes(def)), id).toBe(true);
    }
    const state = createNewGame();
    state.weather.condition = 'clear';
    state.weather.nextChangeAt = Infinity;
    const seen = new Set<string>();
    for (let e = 0; e < 300 && seen.size < GREENS.length; e++) {
      state.clock.totalMinutes = e * SPOT_EPOCH_MINUTES + 12 * 60;
      for (const spot of DISCOVERY_SPOTS) {
        const c = spotContent(state, spot);
        if (!c || !GREENS.includes(c.defId) || seen.has(c.defId)) continue;
        state.basket = [];
        const res = collectSpot(state, spot, state.clock.totalMinutes);
        expect(res.ok).toBe(true);
        expect(state.basket[0].defId).toBe(c.defId);
        seen.add(c.defId);
      }
    }
    expect([...seen].sort()).toEqual([...GREENS].sort());
  });

  it('bring the right kinds to a garden bed', () => {
    for (const id of ['moss', 'creepingThyme', 'clover', 'creepingJenny']) expect(plantRoles(id, PLANTS[id].variants[0].id)).toEqual(['groundcover']);
    expect(plantRoles('virginiaCreeper', 'green')).toEqual(['trailer']);
    expect(plantRoles('hosta', 'plantain')).toEqual(['broadleaf']);
    expect(plantRoles('bamboo', 'green')).toEqual(['broadleaf']);
  });

  it('only Virginia creeper climbs a trellis', () => {
    expect(climbsTrellis('virginiaCreeper')).toBe(true);
    for (const id of GREENS.filter((g) => g !== 'virginiaCreeper')) expect(climbsTrellis(id), id).toBe(false);
  });

  it('planted out and grown large, the ground covers spread faster than the clumps', () => {
    const counts: Record<string, number> = {};
    for (const id of GREENS) {
      const state = createNewGame();
      state.plants.p = { id: 'p', defId: id, variantId: PLANTS[id].variants[0].id, seed: 1, growth: STAGE_AT.specimen, location: { kind: 'wild', x: 46.5, y: 21.5, zone: 'meadow' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false } as OwnedPlant;
      const rand = mulberry32(11);
      let n = 0;
      for (let i = 0; i < 600; i++) {
        for (const ev of spreadStep(state, () => true, 0, rand)) {
          n++;
          delete state.plants[ev.childId];
        }
      }
      counts[id] = n;
    }
    for (const g of GROUND_COVERS) expect(counts[g], g).toBeGreaterThan(counts.hosta);
    expect(counts.hosta).toBeGreaterThan(0);
    expect(counts.bamboo).toBeGreaterThan(0);
  });

  it('survive a save and reload, wherever they are', () => {
    const state = createNewGame();
    GREENS.forEach((id, i) => {
      state.plants[id] = { id, defId: id, variantId: PLANTS[id].variants[0].id, seed: i, growth: 900, location: { kind: 'wild', x: 40 + i, y: 30, zone: 'meadow' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false } as OwnedPlant;
    });
    const loaded = migrateSave(JSON.parse(JSON.stringify(state)))!;
    for (const id of GREENS) expect(loaded.plants[id]?.defId).toBe(id);
  });
});

describe('vines on a trellis', () => {
  it('every vine climbs, whatever its leaves: the trailers, and the heart-leaved, split-leaved and pitcher-hung ones too', () => {
    for (const id of ['pothos', 'scindapsus', 'tradescantia', 'hoya', 'stringOfPearls', 'burrosTail', 'virginiaCreeper', 'philodendron', 'syngonium', 'swissCheeseVine', 'monstera', 'monkeyCups']) {
      expect(climbsTrellis(id), id).toBe(true);
    }
    // Plants that aren't vines just sit in their pot at the foot.
    for (const id of ['spiderPlant', 'fiddleLeafFig', 'snakePlant', 'alocasia', 'anthurium', 'echeveria', 'hosta']) {
      expect(climbsTrellis(id), id).toBe(false);
    }
  });
});
