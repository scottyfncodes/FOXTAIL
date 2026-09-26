import { describe, it, expect } from 'vitest';
import { createNewGame, type GameState, type OwnedPlant } from '../src/game/state';
import {
  takeCutting,
  cuttingBlockReason,
  potInNursery,
  placeOnDisplay,
  plantOutdoors,
  liftPlant,
  creditGrown,
  placementBlockReason,
  CUTTING_COOLDOWN,
  CUTTING_FAIL,
  cuttingFailChance,
  rollSport,
} from '../src/game/systems/propagation';
import { addToBasket } from '../src/game/systems/basket';
import { isEstablished, ESTABLISH_THRESHOLD, recordFound, recordGrown, hasGrown, collectionTotals } from '../src/game/systems/collection';
import { tickGrowth } from '../src/game/systems/growth';
import { STAGE_AT } from '../src/game/systems/growth';
import { PLANTS } from '../src/game/data/plants';

function nurseryPlant(state: GameState, id: string, growth: number, bedId = 'bed1'): OwnedPlant {
  const p: OwnedPlant = {
    id,
    defId: 'monstera',
    variantId: 'deliciosa',
    seed: 5,
    growth,
    location: { kind: 'nursery', bedId },
    plantedAt: 0,
    lastCuttingAt: null,
    generation: 0,
    bornWild: false,
  };
  state.plants[id] = p;
  return p;
}

const never = () => 0.99; // takes, no sport
/** A cutting that takes, then throws a sport. */
const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++] ?? 0.5;
};
const always = () => seq(0.5, 0.0);

describe('cuttings', () => {
  it('cannot be taken until the plant has rooted', () => {
    const state = createNewGame();
    const p = nurseryPlant(state, 'a', 10);
    expect(cuttingBlockReason(state, p, 0)).toBe('not-rooted');
    expect(takeCutting(state, 'a', 0, never)).toBeNull();
  });

  it('puts a fresh cutting in the basket without harming the parent, then needs recovery time', () => {
    const state = createNewGame();
    const p = nurseryPlant(state, 'a', STAGE_AT.young + 5);
    const res = takeCutting(state, 'a', 100, never)!;
    expect(res.item).toMatchObject({ defId: 'monstera', variantId: 'deliciosa', growth: 0, generation: 1 });
    expect(state.plants.a.growth).toBe(STAGE_AT.young + 5);
    expect(cuttingBlockReason(state, p, 100 + CUTTING_COOLDOWN - 1)).toBe('recovering');
    expect(cuttingBlockReason(state, p, 100 + CUTTING_COOLDOWN)).toBeNull();
    expect(state.collection.monstera.propagated).toBe(1);
  });

  it('sometimes throws a sport: a different variant of the same species, recorded as a find', () => {
    const state = createNewGame();
    nurseryPlant(state, 'a', STAGE_AT.large);
    const res = takeCutting(state, 'a', 0, always())!;
    expect(res.sport).toBe(true);
    expect(res.item!.variantId).not.toBe('deliciosa');
    expect(state.collection.monstera.variants).toContain(res.item!.variantId);
  });

  it('a sport is always the next of the species’ own variants', () => {
    for (let i = 0; i < 50; i++) {
      const v = rollSport('pothos', 'golden', Math.random);
      expect(PLANTS.pothos.variants.map((x) => x.id)).toContain(v);
      expect(v).toBe(PLANTS.pothos.variants[1].id);
    }
  });

  it('needs a full day between cuttings from the same plant', () => {
    expect(CUTTING_COOLDOWN).toBe(1440);
  });

  it('sometimes fails to take — more often the rarer the plant — and the parent still needs its day', () => {
    const state = createNewGame();
    const p = nurseryPlant(state, 'a', STAGE_AT.large);
    const res = takeCutting(state, 'a', 50, () => 0.0)!;
    expect(res.failed).toBe(true);
    expect(res.item).toBeNull();
    expect(state.basket).toHaveLength(0);
    expect(p.lastCuttingAt).toBe(50);
    expect(cuttingBlockReason(state, p, 60)).toBe('recovering');
    const ranks = ['common', 'uncommon', 'rare', 'veryRare', 'extremelyRare', 'unheardOf'] as const;
    for (let i = 1; i < ranks.length; i++) expect(CUTTING_FAIL[ranks[i]]).toBeGreaterThan(CUTTING_FAIL[ranks[i - 1]]);
    const kit = createNewGame();
    kit.owned.push('rootingKit');
    expect(cuttingFailChance(kit, p)).toBeCloseTo(cuttingFailChance(state, p) / 2);
  });

  it('refuses when the basket is full', () => {
    const state = createNewGame();
    nurseryPlant(state, 'a', STAGE_AT.large);
    for (let i = 0; i < 6; i++) addToBasket(state, { defId: 'pothos', variantId: 'golden', seed: i, growth: 0, generation: 0, origin: 'wild', collectedAt: 0 });
    expect(cuttingBlockReason(state, state.plants.a, 0)).toBe('basket-full');
  });
});

describe('the two-plant threshold', () => {
  it('establishes a species once two plants have been raised to "established"', () => {
    const state = createNewGame();
    nurseryPlant(state, 'a', STAGE_AT.established);
    nurseryPlant(state, 'b', STAGE_AT.young, 'bed2');
    expect(creditGrown(state, 'a', 0)).toBeNull();
    expect(creditGrown(state, 'b', 0)).toBeNull(); // not established yet
    expect(isEstablished(state, 'monstera')).toBe(false);
    state.plants.b.growth = STAGE_AT.established;
    expect(creditGrown(state, 'b', 0)).toBe('monstera');
    expect(state.collection.monstera.grown).toBe(ESTABLISH_THRESHOLD);
    expect(isEstablished(state, 'monstera')).toBe(true);
    // Each plant only ever counts once.
    expect(creditGrown(state, 'a', 0)).toBeNull();
    expect(state.collection.monstera.grown).toBe(ESTABLISH_THRESHOLD);
  });

  it('keeps unestablished species out of the gallery and the wild', () => {
    const state = createNewGame();
    const item = addToBasket(state, { defId: 'monstera', variantId: 'deliciosa', seed: 1, growth: STAGE_AT.established, generation: 0, origin: 'lifted', collectedAt: 0 })!;
    expect(placementBlockReason(state, item)).toBe('not-established');
    expect(placeOnDisplay(state, item.uid, 'stand1', 'terracotta', 0)).toBeNull();
    expect(plantOutdoors(state, item.uid, 30, 10, 'woodland', 0)).toBeNull();
    expect(state.basket).toHaveLength(1);
  });

  it('a raw cutting must root in the nursery before it can go anywhere else', () => {
    const state = createNewGame();
    state.collection.monstera = { foundAt: 0, variants: ['deliciosa'], grown: 2, propagated: 0, sold: 0, earned: 0, plantedOut: 0, displayed: 0 };
    const item = addToBasket(state, { defId: 'monstera', variantId: 'deliciosa', seed: 1, growth: 0, generation: 0, origin: 'cutting', collectedAt: 0 })!;
    expect(placementBlockReason(state, item)).toBe('not-rooted');
  });
});

describe('greenhouse vs wild', () => {
  function established(state: GameState) {
    state.collection.monstera = { foundAt: 0, variants: ['deliciosa'], grown: 2, propagated: 0, sold: 0, earned: 0, plantedOut: 0, displayed: 0 };
  }

  it('pots cuttings into free nursery beds only', () => {
    const state = createNewGame();
    const a = addToBasket(state, { defId: 'pothos', variantId: 'golden', seed: 1, growth: 0, generation: 0, origin: 'wild', collectedAt: 0 })!;
    const b = addToBasket(state, { defId: 'pothos', variantId: 'golden', seed: 2, growth: 0, generation: 0, origin: 'wild', collectedAt: 0 })!;
    expect(potInNursery(state, a.uid, 'bed1', 0)).not.toBeNull();
    expect(potInNursery(state, b.uid, 'bed1', 0)).toBeNull();
    expect(state.basket).toHaveLength(1);
  });

  it('displays an established plant in a chosen pot, keeping its growth', () => {
    const state = createNewGame();
    established(state);
    const item = addToBasket(state, { defId: 'monstera', variantId: 'deliciosa', seed: 1, growth: 800, generation: 1, origin: 'lifted', collectedAt: 0 })!;
    const p = placeOnDisplay(state, item.uid, 'stand1', 'copper', 0)!;
    expect(p.location).toEqual({ kind: 'display', slotId: 'stand1', potId: 'copper' });
    expect(p.growth).toBe(800);
    expect(state.collection.monstera.displayed).toBe(1);
  });

  it('plants out into the wild for good: outdoor plants cannot be lifted', () => {
    const state = createNewGame();
    established(state);
    const item = addToBasket(state, { defId: 'monstera', variantId: 'deliciosa', seed: 1, growth: 800, generation: 1, origin: 'lifted', collectedAt: 0 })!;
    const p = plantOutdoors(state, item.uid, 30.5, 10.5, 'woodland', 0)!;
    expect(p.location.kind).toBe('wild');
    expect(liftPlant(state, p.id, 0)).toBeNull();
    expect(state.collection.monstera.plantedOut).toBe(1);
  });

  it('lifts nursery plants back into the basket with their growth', () => {
    const state = createNewGame();
    nurseryPlant(state, 'a', 900);
    const item = liftPlant(state, 'a', 0)!;
    expect(item.growth).toBe(900);
    expect(state.plants.a).toBeUndefined();
  });
});

describe('the journal only counts what’s been grown', () => {
  it('records a find once a plant of it has rooted, not when the cutting is taken', () => {
    const state = createNewGame();
    recordFound(state, 'monstera', 'deliciosa', 0);
    const p = nurseryPlant(state, 'm', 0);
    state.plants.m = p;
    expect(recordGrown(state, 0)).toEqual([]);
    expect(hasGrown(state, 'monstera')).toBe(false);
    expect(collectionTotals(state).species).toBe(0);

    tickGrowth(state, 10_000);
    expect(recordGrown(state, 1)).toEqual([{ defId: 'monstera', variantId: 'deliciosa' }]);
    expect(hasGrown(state, 'monstera', 'deliciosa')).toBe(true);
    expect(collectionTotals(state)).toMatchObject({ species: 1, variants: 1 });
    // Once is enough — and it stays recorded after the plant has gone.
    expect(recordGrown(state, 2)).toEqual([]);
    delete state.plants.m;
    expect(hasGrown(state, 'monstera', 'deliciosa')).toBe(true);
  });

  it('waits for a sport out in the valley to be noticed', () => {
    const state = createNewGame();
    state.plants.s = { ...nurseryPlant(state, 's', STAGE_AT.large), variantId: 'albo', unnoticed: true, location: { kind: 'wild', x: 55, y: 30, zone: 'woodland' } };
    expect(recordGrown(state, 0)).toEqual([]);
    delete state.plants.s.unnoticed;
    expect(recordGrown(state, 0)).toEqual([{ defId: 'monstera', variantId: 'albo' }]);
  });
});
