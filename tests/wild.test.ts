import { describe, it, expect } from 'vitest';
import { createNewGame, type GameState, type OwnedPlant } from '../src/game/state';
import { spreadStep, advanceWorld, computeLushness, canPlantAt, WILD_SPECIES_ZONE_CAP, describeRegion } from '../src/game/systems/wild';
import { STAGE_AT } from '../src/game/systems/growth';
import { mulberry32 } from '../src/game/engine/Random';

const open = () => true;

function wild(state: GameState, id: string, x: number, y: number, growth: number, defId = 'pothos', variantId = 'golden'): OwnedPlant {
  const p: OwnedPlant = {
    id,
    defId,
    variantId,
    seed: 1,
    growth,
    location: { kind: 'wild', x, y, zone: 'meadow' },
    plantedAt: 0,
    lastCuttingAt: null,
    generation: 0,
    bornWild: false,
  };
  state.plants[id] = p;
  return p;
}

function wildCount(state: GameState) {
  return Object.values(state.plants).filter((p) => p.location.kind === 'wild').length;
}

describe('outdoor spreading', () => {
  it('young plants never spread; large ones do', () => {
    const state = createNewGame();
    state.collection.pothos = { foundAt: 0, variants: ['golden'], grown: 2, propagated: 0, sold: 0, earned: 0, plantedOut: 1, displayed: 0 };
    wild(state, 'young', 60, 28, STAGE_AT.young);
    for (let i = 0; i < 50; i++) spreadStep(state, open, 0, () => 0.001);
    expect(wildCount(state)).toBe(1);
    state.plants.young.growth = STAGE_AT.large;
    spreadStep(state, open, 0, () => 0.001);
    expect(wildCount(state)).toBe(2);
  });

  it('new seedlings land on open ground near the parent, not on top of it', () => {
    const state = createNewGame();
    const parent = wild(state, 'p', 60, 28, STAGE_AT.large);
    const rand = mulberry32(3);
    for (let i = 0; i < 200; i++) spreadStep(state, open, 0, rand);
    const kids = Object.values(state.plants).filter((p) => p.bornWild);
    expect(kids.length).toBeGreaterThan(0);
    const loc = parent.location as { x: number; y: number };
    for (const k of kids) {
      const l = k.location as { x: number; y: number };
      expect(Math.hypot(l.x - loc.x, l.y - loc.y)).toBeGreaterThan(0.8);
      expect(k.growth).toBe(0);
    }
    expect(spreadStep(createNewGame(), () => false, 0, rand)).toHaveLength(0);
  });

  it('no single species can swallow a whole region', () => {
    const state = createNewGame();
    wild(state, 'p', 65, 30, STAGE_AT.specimen);
    const rand = mulberry32(7);
    const inMeadow = () => Object.values(state.plants).filter((p) => p.location.kind === 'wild' && p.location.zone === 'meadow').length;
    // Every plant a specimen, spreading as hard as it can, until the stand has stopped growing for a good while.
    let flat = 0;
    for (let i = 0; i < 4000 && flat < 150; i++) {
      const before = inMeadow();
      for (const p of Object.values(state.plants)) p.growth = STAGE_AT.specimen;
      spreadStep(state, open, 0, rand);
      flat = inMeadow() === before ? flat + 1 : 0;
    }
    expect(inMeadow()).toBeGreaterThan(WILD_SPECIES_ZONE_CAP * 0.9);
    expect(inMeadow()).toBeLessThanOrEqual(WILD_SPECIES_ZONE_CAP);
  }, 20000);

  it('seedlings of an unseen variant arrive unnoticed, to be discovered in the world', () => {
    const state = createNewGame();
    state.collection.pothos = { foundAt: 0, variants: ['golden'], grown: 2, propagated: 0, sold: 0, earned: 0, plantedOut: 1, displayed: 0 };
    wild(state, 'p', 60, 28, STAGE_AT.large);
    spreadStep(state, open, 0, () => 0.001); // low rolls: spread and sport
    const kid = Object.values(state.plants).find((p) => p.bornWild)!;
    expect(kid.variantId).not.toBe('golden');
    expect(kid.unnoticed).toBe(true);
  });

  it('a long absence plays out like the same time spent in the game', () => {
    const state = createNewGame();
    wild(state, 'p', 60, 28, STAGE_AT.young);
    const res = advanceWorld(state, 3 * 1440, 0, open, mulberry32(11));
    expect(res.ups.length).toBeGreaterThan(0);
    expect(state.plants.p.growth).toBeGreaterThan(STAGE_AT.large);
    expect(res.spreads.length).toBeGreaterThan(0);
    // Growth is modest: one plant doesn't carpet a region in one absence.
    expect(wildCount(state)).toBeLessThan(15);
  });

  it('will not plant into water, the greenhouse, or on top of another plant', () => {
    const state = createNewGame();
    wild(state, 'p', 60.5, 28.5, 0);
    expect(canPlantAt(state, 41.5, 30.5, open)).toBe(false);
    expect(canPlantAt(state, 62.5, 34.5, open)).toBe(false);
    expect(canPlantAt(state, 60.7, 28.6, open)).toBe(false);
    expect(canPlantAt(state, 63.5, 28.5, open)).toBe(true);
  });
});

describe('the landscape', () => {
  it('overgrowth rises with plant count and size, and takes on the character of what was planted', () => {
    const state = createNewGame();
    const empty = computeLushness(state);
    expect(empty.zoneCover.meadow).toBe(0);
    for (let i = 0; i < 12; i++) wild(state, `f${i}`, 55 + (i % 4) * 1.5, 28 + Math.floor(i / 4) * 1.5, STAGE_AT.large, 'bostonFern', 'standard');
    const ferns = computeLushness(state);
    expect(ferns.zoneCover.meadow).toBeGreaterThan(0);
    expect(ferns.zoneCharacter.meadow).toBe('fern');
    for (const p of Object.values(state.plants)) p.growth = STAGE_AT.specimen * 2;
    expect(computeLushness(state).zoneCover.meadow).toBeGreaterThan(ferns.zoneCover.meadow);
    expect(describeRegion(0.4, 12, 'fern')).toMatch(/fronds/);
  });

  it('leaves the soil around a garden bed alone, while its plants still count as yours', () => {
    const state = createNewGame();
    for (let i = 0; i < 6; i++) wild(state, `a${i}`, 55 + (i % 3), 28 + Math.floor(i / 3), STAGE_AT.specimen, 'foxglowAroid', 'standard');
    const loose = computeLushness(state);
    const i = 29 * 90 + 56;
    expect(loose.lush[i]).toBeGreaterThan(0.1);
    for (const p of Object.values(state.plants)) if (p.location.kind === 'wild') p.location.bedId = 'bed';
    const bedded = computeLushness(state);
    expect(bedded.lush[i]).toBe(0);
    expect(bedded.character[i]).toBe(255);
    expect(bedded.zoneCover.meadow).toBeGreaterThan(0);
    expect(bedded.zoneCharacter.meadow).toBe('strange');
  });
});
