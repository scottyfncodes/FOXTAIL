import { describe, it, expect } from 'vitest';
import { createNewGame, type GameState } from '../src/game/state';
import { PLANTS, PLANT_LIST } from '../src/game/data/plants';
import { CURIOSITIES, CURIOSITY_SPECIES } from '../src/game/data/curiosities';
import { DISCOVERY_SPOTS, SPOT_EPOCH_MINUTES } from '../src/game/data/discoveryPoints';
import { spotContent, spotPool } from '../src/game/systems/spots';
import { plantRoles } from '../src/game/systems/beds';
import { matureRadius } from '../src/game/systems/landscape';
import { listedSpecies } from '../src/game/systems/lineage';
import { hasFound } from '../src/game/systems/collection';
import { selfSowStep, advanceWorld, SELF_SOW_MAX, VOLUNTEER_POOL } from '../src/game/systems/wild';
import { zoneAt } from '../src/game/data/worldMap';
import { migrateSave } from '../src/game/engine/SaveManager';
import { mulberry32 } from '../src/game/engine/Random';

const FUNGI = PLANT_LIST.filter((p) => p.form === 'mushroom' || p.form === 'bracket' || p.form === 'coral');

function findEverything(state: GameState) {
  for (const p of listedSpecies()) state.collection[p.id] = { foundAt: 0, variants: p.variants.map((v) => v.id), grownVariants: p.variants.map((v) => v.id), grown: 0, propagated: 0, sold: 0, earned: 0, plantedOut: 0, displayed: 0 };
}

describe('the mushroom family', () => {
  it('is a family of its own: a dozen species, each with a line of rarer forms', () => {
    expect(FUNGI.length).toBeGreaterThanOrEqual(10);
    for (const def of FUNGI) {
      const [standard, ...rest] = def.variants;
      expect(standard.rarity, def.id).toBe(def.rarity);
      expect(rest.length, def.id).toBeGreaterThan(0);
      expect(def.secret, def.id).toBeFalsy();
      expect(matureRadius(def.id)).toBeGreaterThan(0.2);
      expect(plantRoles(def.id, standard.id)).toContain('fungus');
    }
    // All three shapes of fungus are there.
    expect(new Set(FUNGI.map((p) => p.form))).toEqual(new Set(['mushroom', 'bracket', 'coral']));
  });

  it('grows wild in the valley’s patches, mostly where it’s damp and wooded', () => {
    for (const def of FUNGI) {
      const spots = DISCOVERY_SPOTS.filter((s) => !s.foxLed && def.habitat.includes(s.zone));
      expect(spots.some((s) => spotPool(s).includes(def)), def.id).toBe(true);
    }
    const state = createNewGame();
    state.weather.condition = 'clear';
    state.weather.nextChangeAt = Infinity;
    const seen = new Set<string>();
    for (let e = 0; e < 200; e++) {
      state.clock.totalMinutes = e * SPOT_EPOCH_MINUTES + 12 * 60;
      for (const spot of DISCOVERY_SPOTS) {
        const c = spotContent(state, spot);
        if (c && FUNGI.some((f) => f.id === c.defId)) seen.add(c.defId);
      }
    }
    expect(seen).toContain('chanterelle');
    expect(seen).toContain('oysterMushroom');
    // The fairy ring only comes up after rain, and the ghost fungus only shows by lantern light after dark.
    expect(seen).not.toContain('fairyRingChampignon');
    expect(seen).not.toContain('ghostFungus');
  });

  it('is no longer a curiosity: the old mushroom notes become finds of the species', () => {
    expect(CURIOSITIES.some((c) => (c.kind as string) === 'fungus')).toBe(false);
    for (const id of Object.keys(CURIOSITY_SPECIES)) expect(CURIOSITIES.some((c) => c.id === id)).toBe(false);
    for (const sp of Object.values(CURIOSITY_SPECIES)) expect(PLANTS[sp.defId].variants[0].id).toBe(sp.variantId);

    const old = createNewGame() as unknown as Record<string, unknown>;
    old.curiosities = { flyAgaric: { foundAt: 40, count: 3 }, lunaMoth: { foundAt: 50, count: 1 } };
    old.foxFinds = [{ id: 'f', kind: 'curiosity', x: 20, y: 20, zone: 'woodland', seed: 1, curiosityId: 'ghostPipe', createdAt: 0, expiresAt: 9999 }];
    const state = migrateSave(JSON.parse(JSON.stringify(old)))!;
    expect(state.curiosities.flyAgaric).toBeUndefined();
    expect(state.curiosities.lunaMoth.count).toBe(1);
    expect(hasFound(state, 'flyAgaric', 'scarlet')).toBe(true);
    expect(state.foxFinds[0]).toMatchObject({ kind: 'plant', defId: 'ghostPipe', variantId: 'white' });
    expect(state.foxFinds[0].curiosityId).toBeUndefined();
  });
});

describe('the valley’s own cannabis', () => {
  it('never self-sows until every listed plant, in every form, has been found', () => {
    const state = createNewGame();
    const rand = mulberry32(1);
    for (let i = 0; i < 2000; i++) expect(selfSowStep(state, () => true, 0, rand)).toBeNull();
  });

  it('stays locked while forms have only been found, not yet grown into the journal', () => {
    const state = createNewGame();
    for (const p of listedSpecies()) state.collection[p.id] = { foundAt: 0, variants: p.variants.map((v) => v.id), grown: 0, propagated: 0, sold: 0, earned: 0, plantedOut: 0, displayed: 0 };
    const rand = mulberry32(4);
    for (let i = 0; i < 2000; i++) expect(selfSowStep(state, () => true, 0, rand)).toBeNull();
  });

  it('then slowly starts coming up wild in its home regions, out of beds, with nothing to mark it', () => {
    const state = createNewGame();
    findEverything(state);
    state.gardenBeds.push({ id: 'gb', x: 50, y: 20, w: 20, h: 20, shape: 'rect', createdAt: 0 });
    const rand = mulberry32(5);
    let hours = 0;
    let first = null;
    while (!first && hours < 5000) {
      first = selfSowStep(state, () => true, 0, rand);
      hours++;
    }
    expect(first).not.toBeNull();
    // Slowly: not within the first game-day, on average.
    expect(hours).toBeGreaterThan(5);
    const p = first!;
    expect(VOLUNTEER_POOL).toContain(p.defId);
    expect(p.location.kind).toBe('wild');
    if (p.location.kind !== 'wild') return;
    expect(PLANTS[p.defId].habitat).toContain(zoneAt(Math.floor(p.location.x), Math.floor(p.location.y)));
    expect(p.location.bedId).toBeUndefined();
    expect(p.location.x < 50 || p.location.x > 70 || p.location.y < 20 || p.location.y > 40).toBe(true);
    expect(p.bornWild).toBe(true);
    expect(p.growth).toBe(0);
    // Not yet found: it waits to be noticed, but (being secret) the world draws no sparkle over it.
    expect(p.unnoticed).toBe(true);
    expect(PLANTS[p.defId].secret).toBe(true);
  });

  it('stops self-sowing once a few have taken hold, leaving the rest to spreading', () => {
    const state = createNewGame();
    findEverything(state);
    const rand = mulberry32(9);
    for (let i = 0; i < 20000; i++) selfSowStep(state, () => true, 0, rand);
    const wildCannabis = Object.values(state.plants).filter((p) => VOLUNTEER_POOL.includes(p.defId));
    expect(wildCannabis.length).toBe(SELF_SOW_MAX);
  });

  it('comes up as the world advances, reported as sown rather than spread', () => {
    const state = createNewGame();
    findEverything(state);
    let sown = 0;
    const rand = mulberry32(2);
    for (let d = 0; d < 30 && !sown; d++) sown += advanceWorld(state, 1440, 0, () => true, rand).sown.length;
    expect(sown).toBeGreaterThan(0);
  });
});
