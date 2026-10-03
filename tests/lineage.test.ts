import { describe, it, expect } from 'vitest';
import { createNewGame, type GameState, type OwnedPlant } from '../src/game/state';
import { PLANTS, PLANT_LIST } from '../src/game/data/plants';
import { collectionTotals } from '../src/game/systems/collection';
import { DISCOVERY_SPOTS } from '../src/game/data/discoveryPoints';
import { variantIndex, nextInLine, nextVariantIndex, variantAllowed, variantsAhead, everythingFound, journalComplete, listedSpecies, formsFound } from '../src/game/systems/lineage';
import { rollSport, takeCutting } from '../src/game/systems/propagation';
import { spotContent } from '../src/game/systems/spots';
import { pickFoxPlant, createFoxFinds } from '../src/game/systems/foxFinds';
import { spreadStep } from '../src/game/systems/wild';
import { compostPlant } from '../src/game/systems/landscape';
import { recordFound } from '../src/game/systems/collection';
import { STAGE_AT } from '../src/game/systems/growth';
import { mulberry32 } from '../src/game/engine/Random';

const pothos = PLANTS.pothos.variants;

function wild(state: GameState, id: string, defId: string, variantId: string, x: number, y: number, growth = STAGE_AT.specimen, extra: Partial<OwnedPlant> = {}): OwnedPlant {
  const p: OwnedPlant = { id, defId, variantId, seed: 1, growth, location: { kind: 'wild', x, y, zone: 'meadow' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false, ...extra };
  state.plants[id] = p;
  return p;
}

describe('each species’ forms come in a line', () => {
  it('knows where each form sits, and what comes after it', () => {
    expect(variantIndex('pothos', pothos[0].id)).toBe(0);
    expect(variantIndex('pothos', 'nonsense')).toBe(-1);
    expect(nextInLine('pothos', pothos[0].id)).toBe(pothos[1]);
    expect(nextInLine('pothos', pothos[pothos.length - 1].id)).toBeNull();
    expect(nextInLine('nonsense', 'x')).toBeNull();
  });

  it('only the next unfound form is allowed until it’s been found', () => {
    const state = createNewGame();
    expect(nextVariantIndex(state, 'pothos')).toBe(0);
    expect(variantAllowed(state, 'pothos', pothos[0].id)).toBe(true);
    expect(variantAllowed(state, 'pothos', pothos[1].id)).toBe(false);
    recordFound(state, 'pothos', pothos[0].id, 0);
    expect(nextVariantIndex(state, 'pothos')).toBe(1);
    expect(variantAllowed(state, 'pothos', pothos[1].id)).toBe(true);
    expect(variantAllowed(state, 'pothos', pothos[2].id)).toBe(false);
    expect(variantsAhead(state, 'pothos')).toEqual(pothos.slice(1));
    for (const v of pothos) recordFound(state, 'pothos', v.id, 0);
    expect(nextVariantIndex(state, 'pothos')).toBe(pothos.length);
    expect(variantsAhead(state, 'pothos')).toEqual([]);
    expect(variantAllowed(state, 'pothos', pothos[pothos.length - 1].id)).toBe(true);
  });

  it('a sport is always exactly one step along the line', () => {
    const rand = mulberry32(1);
    for (const def of PLANT_LIST) {
      for (let i = 0; i < def.variants.length; i++) {
        const v = rollSport(def.id, def.variants[i].id, rand, true);
        expect(v, `${def.id}/${def.variants[i].id}`).toBe(def.variants[i + 1]?.id ?? null);
      }
    }
  });

  it('a wild patch never grows a form ahead of the line', () => {
    const state = createNewGame();
    for (let e = 0; e < 200; e++) {
      state.clock.totalMinutes = e * 360;
      for (const s of DISCOVERY_SPOTS) {
        const c = spotContent(state, s);
        if (c) expect(variantAllowed(state, c.defId, c.variantId), `${c.defId}/${c.variantId}`).toBe(true);
      }
    }
    // Once the second form of pothos is found, the third can appear — but not the fourth.
    recordFound(state, 'pothos', pothos[0].id, 0);
    recordFound(state, 'pothos', pothos[1].id, 0);
    const seen = new Set<string>();
    for (let e = 0; e < 400; e++) {
      state.clock.totalMinutes = e * 360;
      for (const s of DISCOVERY_SPOTS) {
        const c = spotContent(state, s);
        if (c?.defId === 'pothos') seen.add(c.variantId);
      }
    }
    expect(seen.has(pothos[2].id)).toBe(true);
    expect(seen.has(pothos[3].id)).toBe(false);
  });

  it('the fox never leads to a form ahead of the line', () => {
    const state = createNewGame();
    const rand = mulberry32(4);
    for (let i = 0; i < 300; i++) {
      const p = pickFoxPlant(state, 'dampForest', rand);
      if (p) expect(variantAllowed(state, p.defId, p.variantId), `${p.defId}/${p.variantId}`).toBe(true);
      for (const f of createFoxFinds(state, 10, 10, 'meadow', 'grove', { night: false, rain: false }, 0, rand)) {
        if (f.defId && f.variantId) expect(variantAllowed(state, f.defId, f.variantId)).toBe(true);
      }
      state.foxFinds = [];
    }
  });

  it('seedlings only sport into the next form, and only once the one before is found', () => {
    const state = createNewGame();
    for (let k = 0; k < 6; k++) wild(state, `p${k}`, 'pothos', pothos[1].id, 40 + k * 4, 20, STAGE_AT.specimen, { unnoticed: true });
    const rand = mulberry32(9);
    const sportsBefore = new Set<string>();
    for (let i = 0; i < 2500; i++) {
      for (const ev of spreadStep(state, () => true, 0, rand)) {
        const c = state.plants[ev.childId];
        if (ev.sport) sportsBefore.add(c.variantId);
        delete state.plants[ev.childId];
      }
    }
    // Nobody has found the second form yet, so nothing can step to the third.
    expect(sportsBefore.size).toBe(0);
    recordFound(state, 'pothos', pothos[0].id, 0);
    recordFound(state, 'pothos', pothos[1].id, 0);
    const sportsAfter = new Set<string>();
    for (let i = 0; i < 2500; i++) {
      for (const ev of spreadStep(state, () => true, 0, rand)) {
        const c = state.plants[ev.childId];
        if (ev.sport) sportsAfter.add(c.variantId);
        delete state.plants[ev.childId];
      }
    }
    expect([...sportsAfter]).toEqual([pothos[2].id]);
  });



  it('a cutting’s sport steps one form along', () => {
    const state = createNewGame();
    state.plants.p = { id: 'p', defId: 'pothos', variantId: pothos[1].id, seed: 1, growth: STAGE_AT.large, location: { kind: 'nursery', bedId: 'bed1' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false };
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const res = takeCutting(state, 'p', 0, mulberry32(i));
      if (res?.item) seen.add(res.item.variantId);
      state.basket = [];
      state.plants.p.lastCuttingAt = null;
    }
    expect(seen.has(pothos[1].id)).toBe(true);
    expect(seen.has(pothos[2].id)).toBe(true);
    expect(seen.size).toBe(2);
  });
});

describe('everything found', () => {
  it('means every listed species in every form — the secret ones don’t count', () => {
    const state = createNewGame();
    expect(everythingFound(state)).toBe(false);
    expect(listedSpecies().some((p) => p.id.startsWith('cannabis'))).toBe(false);
    for (const p of listedSpecies()) state.collection[p.id] = { foundAt: 0, variants: p.variants.map((v) => v.id), grown: 0, propagated: 0, sold: 0, earned: 0, plantedOut: 0, displayed: 0 };
    expect(everythingFound(state)).toBe(true);
    const f = formsFound(state);
    expect(f.found).toBe(f.total);
    state.collection.pothos.variants.pop();
    expect(everythingFound(state)).toBe(false);
    expect(formsFound(state).found).toBe(f.total - 1);
  });
});

describe('the journal complete', () => {
  it('means every listed form grown, exactly when the journal’s own count is full — finding them isn’t enough', () => {
    const state = createNewGame();
    for (const p of listedSpecies()) state.collection[p.id] = { foundAt: 0, variants: p.variants.map((v) => v.id), grown: 0, propagated: 0, sold: 0, earned: 0, plantedOut: 0, displayed: 0 };
    expect(everythingFound(state)).toBe(true);
    expect(journalComplete(state)).toBe(false);
    for (const p of listedSpecies()) state.collection[p.id].grownVariants = p.variants.map((v) => v.id);
    expect(journalComplete(state)).toBe(true);
    const t = collectionTotals(state);
    expect(t.species).toBe(t.totalSpecies);
    expect(t.variants).toBe(t.totalVariants);
    state.collection.flyAgaric.grownVariants!.pop();
    expect(journalComplete(state)).toBe(false);
    expect(collectionTotals(state).variants).toBe(t.totalVariants - 1);
  });
});
