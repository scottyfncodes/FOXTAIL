import { describe, it, expect } from 'vitest';
import { createNewGame } from '../src/game/state';
import { PLANT_LIST, PLANTS, rarityRank, specimenRarity } from '../src/game/data/plants';
import { DISCOVERY_SPOTS } from '../src/game/data/discoveryPoints';
import { spotContent } from '../src/game/systems/spots';
import { rollSport, takeCutting } from '../src/game/systems/propagation';
import { pickFoxPlant, createFoxFinds } from '../src/game/systems/foxFinds';
import { RARITY_PRICE } from '../src/game/systems/market';
import { discoveryAside } from '../src/game/systems/rarity';
import { mulberry32 } from '../src/game/engine/Random';
import { STAGE_AT } from '../src/game/systems/growth';

const listed = PLANT_LIST.filter((p) => !p.unlisted);
const beyond = (id: string) => PLANTS[id].variants.find((v) => v.sportOnly)!;
/** The last form nature did make: the one a sport steps from to reach the one it didn't. */
const before = (id: string) => PLANTS[id].variants[PLANTS[id].variants.indexOf(beyond(id)) - 1];

describe('the form nature never made', () => {
  it('every listed species has exactly one, unheard of and sport-only, glowing after dark', () => {
    for (const def of listed) {
      const vs = def.variants.filter((v) => v.sportOnly);
      expect(vs.length, def.id).toBe(1);
      expect(vs[0].rarity, def.id).toBe('unheardOf');
      expect(vs[0].id, def.id).not.toBe(def.variants[0].id);
      const look = { ...def.look, ...vs[0].look };
      expect(look.variegation, def.id).toBe('glow');
      expect(look.variegationColor, def.id).toBeDefined();
      expect(rarityRank(specimenRarity(def.id, vs[0].id))).toBe(rarityRank('unheardOf'));
    }
    expect(rarityRank('unheardOf')).toBeGreaterThan(rarityRank('extremelyRare'));
    expect(rarityRank('unheardOf')).toBeLessThan(rarityRank('mythic'));
  });

  it('never grows in a wild patch, and never at the end of a trail', () => {
    const state = createNewGame();
    for (let e = 0; e < 300; e++) {
      state.clock.totalMinutes = e * 360;
      for (const s of DISCOVERY_SPOTS) {
        const c = spotContent(state, s);
        if (c) expect(PLANTS[c.defId].variants.find((v) => v.id === c.variantId)?.sportOnly).toBeFalsy();
      }
    }
    const rand = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const p = pickFoxPlant(state, 'dampForest', rand);
      if (p) expect(PLANTS[p.defId].variants.find((v) => v.id === p.variantId)?.sportOnly).toBeFalsy();
      const finds = createFoxFinds(state, 10, 10, 'meadow', 'grove', { night: false, rain: false }, 0, rand);
      for (const f of finds) if (f.defId) expect(PLANTS[f.defId].variants.find((v) => v.id === f.variantId)?.sportOnly).toBeFalsy();
      state.foxFinds = [];
    }
  });

  it('only comes as a sport from a big plant, never from a young one — and only from the form just before it', () => {
    const rand = mulberry32(3);
    expect(rollSport('pothos', before('pothos').id, rand)).toBeNull();
    expect(rollSport('pothos', before('pothos').id, rand, true)).toBe(beyond('pothos').id);
    // It's the last step of the line: nothing earlier can leap to it.
    for (const v of PLANTS.pothos.variants) if (v !== before('pothos') && v !== beyond('pothos')) expect(rollSport('pothos', v.id, rand, true)).not.toBe(beyond('pothos').id);
    // And it's the end of the line.
    expect(rollSport('pothos', beyond('pothos').id, rand, true)).toBeNull();
  });

  it('a cutting from a large plant can throw it; from a young one it cannot', () => {
    const young = createNewGame();
    young.plants.p = { id: 'p', defId: 'pothos', variantId: before('pothos').id, seed: 1, growth: STAGE_AT.young, location: { kind: 'nursery', bedId: 'bed1' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false };
    const big = createNewGame();
    big.plants.p = { ...young.plants.p, growth: STAGE_AT.large };
    let fromYoung = 0;
    let fromBig = 0;
    for (let i = 0; i < 3000; i++) {
      const r = mulberry32(i);
      const a = takeCutting(young, 'p', 0, r);
      if (a?.item?.variantId === beyond('pothos').id) fromYoung++;
      young.basket = [];
      young.plants.p.lastCuttingAt = null;
      const b = takeCutting(big, 'p', 0, mulberry32(i));
      if (b?.item?.variantId === beyond('pothos').id) fromBig++;
      big.basket = [];
      big.plants.p.lastCuttingAt = null;
    }
    expect(fromYoung).toBe(0);
    expect(fromBig).toBeGreaterThan(0);
  });

  it('is worth more than anything found in the wild, and gets its own quiet line', () => {
    expect(RARITY_PRICE.unheardOf).toBeGreaterThan(RARITY_PRICE.extremelyRare);
    expect(discoveryAside('unheardOf')).toMatch(/nothing like it/i);
    expect(discoveryAside('mythic')).not.toMatch(/nothing like it/i);
  });
});
