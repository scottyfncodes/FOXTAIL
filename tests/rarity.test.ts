import { describe, it, expect } from 'vitest';
import { createNewGame, type GameState, type OwnedPlant } from '../src/game/state';
import { PLANTS, PLANT_LIST, RARITY_ORDER, RARITY_LABEL, rarityRank, specimenRarity, specimenName, fullName, latinLine } from '../src/game/data/plants';
import { DISCOVERY_SPOTS } from '../src/game/data/discoveryPoints';
import { spotPool, spotContent } from '../src/game/systems/spots';
import { canSell, sellItem, demandSpecies } from '../src/game/systems/market';
import { spreadStep, VOLUNTEER_POOL, DIVERSE_BED_SPECIES } from '../src/game/systems/wild';
import { pickFoxPlant } from '../src/game/systems/foxFinds';
import { listedSpecies } from '../src/game/systems/lineage';
import { discoveryFlourish, discoveryAside } from '../src/game/systems/rarity';
import { rollSport, crossPollinate, crossBlockReason, crossOf } from '../src/game/systems/propagation';
import { collectionTotals } from '../src/game/systems/collection';
import { STAGE_AT } from '../src/game/systems/growth';
import { SHOP_ITEMS } from '../src/game/data/shop';
import { mulberry32 } from '../src/game/engine/Random';

const ID = 'cannabisSativa';

/** Every listed plant, in every form, found: the only state in which anything unlisted turns up. */
function findEverything(state: GameState) {
  for (const p of listedSpecies()) state.collection[p.id] = { foundAt: 0, variants: p.variants.map((v) => v.id), grownVariants: p.variants.map((v) => v.id), grown: 0, propagated: 0, sold: 0, earned: 0, plantedOut: 0, displayed: 0 };
}

describe('the rarity ladder', () => {
  it('still climbs common → uncommon → rare → very rare → extremely rare, with one tier above', () => {
    expect(RARITY_ORDER).toEqual(['common', 'uncommon', 'rare', 'veryRare', 'extremelyRare', 'unheardOf', 'mythic']);
    // Rarer things are still rarer in the wild patches, all the way up.
    const counts: Record<string, number> = {};
    const state = createNewGame();
    for (let e = 0; e < 400; e++) {
      state.clock.totalMinutes = e * 360;
      for (const s of DISCOVERY_SPOTS.filter((d) => !d.foxLed)) {
        const c = spotContent(state, s);
        if (c) counts[specimenRarity(c.defId, c.variantId)] = (counts[specimenRarity(c.defId, c.variantId)] ?? 0) + 1;
      }
    }
    expect(counts.common).toBeGreaterThan(counts.uncommon);
    expect(counts.uncommon).toBeGreaterThan(counts.rare);
    expect(counts.rare).toBeGreaterThan(counts.veryRare ?? 0);
    expect(counts.mythic ?? 0).toBe(0);
    expect(counts.unheardOf ?? 0).toBe(0);
  });

  it('marks rarer finds in the world, quietly and the same way all the way to the top', () => {
    expect(discoveryFlourish('common', true)).toBe('none');
    expect(discoveryFlourish('rare', true)).toBe('glint');
    expect(discoveryFlourish('veryRare', true)).toBe('bloom');
    expect(discoveryFlourish('mythic', true)).toBe(discoveryFlourish('extremelyRare', true));
    expect(discoveryFlourish('mythic', false)).toBe('none');
    expect(discoveryAside('veryRare')).toMatch(/different/);
  });
});

describe('Cannabis sativa', () => {
  const def = PLANTS[ID];

  it('is a plant in the collection, named by its scientific name only', () => {
    expect(def).toBeDefined();
    expect(def.name).toBe('Cannabis sativa');
    expect(def.latin).toBe('Cannabis sativa');
    expect(specimenName(ID, 'wild')).toBe('Cannabis sativa');
    expect(fullName(ID, 'wild')).toBe('Cannabis sativa');
    expect(latinLine(ID)).toBe('');
    const text = `${def.name} ${def.description} ${def.hint} ${def.variants.map((v) => v.name + v.description).join(' ')}`.toLowerCase();
    for (const word of ['weed', 'marijuana', 'pot ', 'high', 'smoke', 'drug']) expect(text).not.toContain(word);
  });

  it('is, with its cannabis kin, the rarest plant in the game', () => {
    expect(specimenRarity(ID, 'wild')).toBe('mythic');
    expect(RARITY_LABEL.mythic).toBeTruthy();
    const others = PLANT_LIST.filter((p) => !p.id.startsWith('cannabis')).flatMap((p) => p.variants.map((v) => specimenRarity(p.id, v.id)));
    expect(others.every((r) => rarityRank(r) < rarityRank('mythic'))).toBe(true);
  });

  it('never grows in an ordinary wild patch, and is never a sport of something else', () => {
    for (const s of DISCOVERY_SPOTS) expect(spotPool(s).some((p) => p.id === ID)).toBe(false);
    // It has a single form: nothing to mutate into.
    expect(rollSport(ID, 'wild', mulberry32(1))).toBeNull();
  });

  it('can’t be sold, bought, or asked for at the market', () => {
    const state = createNewGame();
    expect(canSell(ID)).toBe(false);
    state.basket.push({ uid: 'c', defId: ID, variantId: 'wild', seed: 1, growth: 2000, generation: 0, origin: 'wild', collectedAt: 0 });
    expect(sellItem(state, 'c', 0)).toBeNull();
    expect(state.basket).toHaveLength(1);
    expect(state.coins).toBe(20);
    expect(SHOP_ITEMS.some((i) => i.id.toLowerCase().includes('cannabis'))).toBe(false);
    for (const p of PLANT_LIST) state.collection[p.id] = { foundAt: 0, variants: [], grown: 0, propagated: 0, sold: 0, earned: 0, plantedOut: 0, displayed: 0 };
    for (let d = 0; d < 200; d++) {
      state.clock.totalMinutes = d * 1440;
      expect(demandSpecies(state)).not.toBe(ID);
    }
  });

  it('may very rarely be where the fox leads — but only once everything listed has been found, in open country', () => {
    const state = createNewGame();
    const rand = mulberry32(12);
    const tally = (zone: 'meadow' | 'woodland') => {
      let n = 0;
      for (let i = 0; i < 4000; i++) if (pickFoxPlant(state, zone, rand)?.defId === ID) n++;
      return n;
    };
    expect(tally('meadow')).toBe(0);
    // Nearly everything isn't enough: one form found but not yet grown into the journal.
    findEverything(state);
    const last = listedSpecies()[listedSpecies().length - 1];
    state.collection[last.id].grownVariants!.pop();
    expect(tally('meadow')).toBe(0);
    findEverything(state);
    const meadow = tally('meadow');
    expect(meadow).toBeGreaterThan(20);
    expect(meadow).toBeLessThan(400);
    expect(tally('woodland')).toBe(0);
  });

  it('may very rarely come up by itself in a garden bed full of different plants — and nowhere else, and only once everything listed has been found', () => {
    const grow = (species: string[], bed: boolean, found = true) => {
      const state = createNewGame();
      if (found) findEverything(state);
      if (bed) state.gardenBeds.push({ id: 'bed', x: 45, y: 20, w: 9, h: 9, shape: 'rect', createdAt: 0 });
      species.forEach((defId, i) => {
        const p: OwnedPlant = {
          id: `p${i}`,
          defId,
          variantId: PLANTS[defId].variants[0].id,
          seed: i,
          growth: STAGE_AT.specimen,
          location: { kind: 'wild', x: 46.5 + (i % 3) * 3, y: 21.5 + Math.floor(i / 3) * 3, zone: 'meadow', ...(bed ? { bedId: 'bed' } : {}) },
          plantedAt: 0,
          lastCuttingAt: null,
          generation: 0,
          bornWild: false,
        };
        state.plants[p.id] = p;
      });
      return state;
    };
    const count = (state: GameState) => {
      const rand = mulberry32(77);
      let volunteers = 0;
      for (let i = 0; i < 1500; i++) {
        for (const ev of spreadStep(state, () => true, 0, rand)) {
          const child = state.plants[ev.childId];
          if (VOLUNTEER_POOL.includes(child.defId)) volunteers++;
          delete state.plants[ev.childId]; // keep the bed from filling up
        }
      }
      return volunteers;
    };
    const mix = ['pothos', 'bostonFern', 'fittonia', 'peaceLily', 'calathea', 'spiderPlant'];
    expect(mix.length).toBeGreaterThanOrEqual(DIVERSE_BED_SPECIES);
    expect(count(grow(mix, true))).toBeGreaterThan(0);
    expect(count(grow(mix, true, false))).toBe(0);
    expect(count(grow(mix, false))).toBe(0);
    expect(count(grow(['pothos', 'pothos', 'pothos', 'pothos', 'pothos', 'pothos'], true))).toBe(0);
  });

  it('once found, grows and propagates like any other plant', () => {
    expect(def.growthRate).toBeGreaterThan(0);
    expect(def.spread).toBeGreaterThan(0);
    expect(def.habitat.length).toBeGreaterThan(0);
  });
});

describe('Cannabis indica and the hybrid', () => {
  const plant = (state: GameState, id: string, defId: string, extra: Partial<OwnedPlant> = {}): OwnedPlant => {
    const p: OwnedPlant = {
      id,
      defId,
      variantId: PLANTS[defId].variants[0].id,
      seed: 1,
      growth: STAGE_AT.established,
      location: { kind: 'nursery', bedId: id },
      plantedAt: 0,
      lastCuttingAt: null,
      generation: 0,
      bornWild: false,
      ...extra,
    };
    state.plants[id] = p;
    return p;
  };

  it('are mythic keepsakes that never grow in an ordinary patch', () => {
    for (const id of ['cannabisIndica', 'cannabisHybrid']) {
      expect(specimenRarity(id, PLANTS[id].variants[0].id)).toBe('mythic');
      expect(canSell(id)).toBe(false);
      for (const s of DISCOVERY_SPOTS) expect(spotPool(s).some((p) => p.id === id)).toBe(false);
    }
  });

  it('the fox may lead to indica, but never to the hybrid', () => {
    const state = createNewGame();
    findEverything(state);
    const rand = mulberry32(5);
    const seen = new Set<string>();
    for (let i = 0; i < 6000; i++) {
      const pick = pickFoxPlant(state, 'rockyClearing', rand);
      if (pick) seen.add(pick.defId);
    }
    expect(seen.has('cannabisIndica')).toBe(true);
    expect(seen.has('cannabisHybrid')).toBe(false);
  });

  it('crossing a rooted sativa with a rooted indica puts a hybrid seedling in the basket', () => {
    const state = createNewGame();
    const sat = plant(state, 's', 'cannabisSativa');
    expect(crossBlockReason(state, sat, 0)).toBe('no-partner');
    const ind = plant(state, 'i', 'cannabisIndica');
    expect(crossBlockReason(state, sat, 0)).toBeNull();
    const res = crossPollinate(state, 's', 0)!;
    expect(res.item.defId).toBe('cannabisHybrid');
    expect(res.item.growth).toBe(0);
    expect(res.newSpecies).toBe(true);
    expect(state.collection.cannabisHybrid).toBeDefined();
    // Both parents need to rest afterwards.
    expect(sat.lastCuttingAt).toBe(0);
    expect(ind.lastCuttingAt).toBe(0);
    expect(crossBlockReason(state, ind, 1)).toBe('recovering');
  });

  it('won’t cross an unrooted plant, or anything without a partner species', () => {
    const state = createNewGame();
    const young = plant(state, 's', 'cannabisSativa', { growth: 0 });
    plant(state, 'i', 'cannabisIndica');
    expect(crossBlockReason(state, young, 0)).toBe('not-rooted');
    const pothos = plant(state, 'p', 'pothos');
    expect(crossBlockReason(state, pothos, 0)).toBe('no-cross');
    expect(crossOf('cannabisHybrid')).toBeNull();
  });

  it('grown near each other outdoors, the two parents seed hybrids', () => {
    const state = createNewGame();
    plant(state, 's', 'cannabisSativa', { growth: STAGE_AT.specimen, location: { kind: 'wild', x: 46.5, y: 21.5, zone: 'meadow' } });
    plant(state, 'i', 'cannabisIndica', { growth: STAGE_AT.specimen, location: { kind: 'wild', x: 48.5, y: 21.5, zone: 'meadow' } });
    const rand = mulberry32(3);
    let hybrids = 0;
    for (let i = 0; i < 1500; i++) {
      for (const ev of spreadStep(state, () => true, 0, rand)) {
        if (state.plants[ev.childId].defId === 'cannabisHybrid') hybrids++;
        delete state.plants[ev.childId];
      }
    }
    expect(hybrids).toBeGreaterThan(0);
  });

  it('none of the three appear in the field journal or its totals', () => {
    const state = createNewGame();
    const totals = collectionTotals(state);
    expect(totals.totalSpecies).toBe(PLANT_LIST.length - 3);
    for (const id of ['cannabisSativa', 'cannabisIndica', 'cannabisHybrid']) expect(PLANTS[id].unlisted).toBe(true);
  });
});
