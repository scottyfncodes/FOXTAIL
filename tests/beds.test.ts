import { describe, it, expect } from 'vitest';
import { createNewGame, type GameState, type OwnedPlant } from '../src/game/state';
import { bedLiveliness, isBedLively, plantRoles, tickBedCuriosities, LIVELY_TIER, BED_CURIOSITY_CHANCE } from '../src/game/systems/beds';
import { STAGE_AT } from '../src/game/systems/growth';

function bedded(state: GameState, id: string, defId: string, growth = STAGE_AT.established, variantId?: string): OwnedPlant {
  const p: OwnedPlant = { id, defId, variantId: variantId ?? 'standard', seed: 1, growth, location: { kind: 'wild', x: 11, y: 11, zone: 'meadow', bedId: 'b' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false };
  state.plants[id] = p;
  return p;
}

function withBed(): GameState {
  const state = createNewGame();
  state.gardenBeds.push({ id: 'b', x: 10, y: 10, w: 4, h: 3, shape: 'rect', createdAt: 0 });
  return state;
}

describe('what a plant brings to a bed', () => {
  it('sorts plants into kinds, and a flowering broadleaf counts twice', () => {
    expect(plantRoles('pothos', 'golden')).toEqual(['trailer']);
    expect(plantRoles('bostonFern', 'standard')).toEqual(['fern']);
    expect(plantRoles('echeveria', 'standard')).toEqual(['succulent']);
    expect(plantRoles('venusFlytrap', 'standard')).toEqual(['carnivore']);
    expect(plantRoles('peaceLily', 'standard')).toContain('flowerer');
  });
});

describe('how lively a bed is', () => {
  it('is bare with nothing in it, and cuttings don’t count until they root', () => {
    const state = withBed();
    expect(bedLiveliness(state, 'b').word).toBe('Bare');
    bedded(state, 'p1', 'pothos', 0);
    const l = bedLiveliness(state, 'b');
    expect(l.word).toBe('Bare');
    expect(l.plants).toBe(0);
  });

  it('rises with species and with a mix of kinds, and says what is missing', () => {
    const state = withBed();
    bedded(state, 'p1', 'pothos');
    const one = bedLiveliness(state, 'b');
    expect(one.word).toBe('Quiet');
    expect(one.missing[0]).toBe('flowerer');
    bedded(state, 'p2', 'peaceLily');
    bedded(state, 'p3', 'bostonFern');
    const three = bedLiveliness(state, 'b');
    expect(three.tier).toBeGreaterThanOrEqual(LIVELY_TIER);
    expect(isBedLively(state, 'b')).toBe(true);
    expect(three.roles).toEqual(['trailer', 'flowerer', 'fern']);
    bedded(state, 'p4', 'echeveria');
    bedded(state, 'p5', 'venusFlytrap');
    const five = bedLiveliness(state, 'b');
    expect(five.word).toBe('Humming');
    expect(five.missing).toEqual(['broadleaf', 'fungus']);
  });

  it('three of the same kind is not lively, however many there are', () => {
    const state = withBed();
    for (let i = 0; i < 6; i++) bedded(state, `p${i}`, ['pothos', 'tradescantia', 'stringOfPearls'][i % 3]);
    const l = bedLiveliness(state, 'b');
    expect(l.species).toBe(3);
    expect(l.roles).toEqual(['trailer']);
    expect(isBedLively(state, 'b')).toBe(false);
  });
});

describe('curiosities in the liveliest beds', () => {
  it('turns one up in a humming bed, at most one at a time, and never in a quieter bed', () => {
    const state = withBed();
    for (const [i, d] of ['pothos', 'peaceLily', 'bostonFern', 'echeveria', 'venusFlytrap'].entries()) bedded(state, `p${i}`, d);
    expect(bedLiveliness(state, 'b').tier).toBe(4);
    const always = () => 0;
    expect(tickBedCuriosities(state, 1, 600, always).length).toBe(1);
    expect(state.foxFinds[0].kind).toBe('curiosity');
    expect(state.foxFinds[0].x).toBeGreaterThanOrEqual(10);
    expect(state.foxFinds[0].x).toBeLessThanOrEqual(14);
    expect(tickBedCuriosities(state, 1, 700, always).length).toBe(0);
    const quiet = withBed();
    bedded(quiet, 'p1', 'pothos');
    expect(tickBedCuriosities(quiet, 100, 600, always).length).toBe(0);
    // The odds are small per hour.
    expect(tickBedCuriosities(withBed(), 1, 0, () => BED_CURIOSITY_CHANCE + 0.01).length).toBe(0);
  });
});
