import { describe, it, expect } from 'vitest';
import { createNewGame, type GameState } from '../src/game/state';
import { tickFox, HUNCH_CHANCE } from '../src/game/systems/fox';
import { spotContent, hunchTargets } from '../src/game/systems/spots';
import { recordFound } from '../src/game/systems/collection';
import { DISCOVERY_SPOTS } from '../src/game/data/discoveryPoints';
import { PLANT_LIST } from '../src/game/data/plants';

// Everything found but the pitcher plant, with the damp forest's fox patch already shown.
function missingOnlyPitcher(): GameState {
  const state = createNewGame();
  for (const def of PLANT_LIST) {
    if (def.id === 'monkeyCups') continue;
    for (const v of def.variants) if (!v.sportOnly) recordFound(state, def.id, v.id, 0);
  }
  state.spots['sp-damp-fox'] = { revealed: true };
  state.foxLog.sightings = 5;
  state.foxLog.trailsStarted = 1;
  return state;
}

function foxVisit(state: GameState, rand: () => number) {
  state.fox.behavior = 'idle';
  state.fox.nextEventAt = 0;
  return tickFox(state, {
    playerZone: 'dampForest',
    playerX: 60,
    playerY: 12,
    inGreenhouse: false,
    dtSeconds: 1,
    now: state.clock.totalMinutes,
    discoveryPoints: DISCOVERY_SPOTS,
    rand,
  });
}

const hunchSpots = (state: GameState) => Object.entries(state.spots).filter(([, s]) => s.hunch);

describe('fox hunches', () => {
  it('only knows about the pitcher plant while it is raining', () => {
    const state = missingOnlyPitcher();
    state.weather.condition = 'clear';
    expect(hunchTargets(state, 'dampForest')).toEqual([]);
    foxVisit(state, () => 0.1);
    expect(hunchSpots(state)).toEqual([]);
    expect(state.foxLog.hunchMisses).toBe(0);
  });

  it('leads to a patch holding the pitcher plant in the rain', () => {
    const state = missingOnlyPitcher();
    state.weather.condition = 'rain';
    foxVisit(state, () => 0.1);
    expect(state.fox.behavior).toBe('leading');
    const spot = DISCOVERY_SPOTS.find((d) => d.id === state.fox.targetDiscoveryId)!;
    expect(spot.zone).toBe('dampForest');
    expect(spotContent(state, spot)?.defId).toBe('monkeyCups');
  });

  it('gets likelier each time it could have led you and did not', () => {
    const state = missingOnlyPitcher();
    state.weather.condition = 'rain';
    // A roll of 0.5 misses at 0.2 and 0.4, then lands at 0.6.
    expect(HUNCH_CHANCE).toBe(0.2);
    foxVisit(state, () => 0.5);
    expect(state.foxLog.hunchMisses).toBe(1);
    foxVisit(state, () => 0.5);
    expect(state.foxLog.hunchMisses).toBe(2);
    expect(hunchSpots(state)).toEqual([]);
    foxVisit(state, () => 0.5);
    expect(state.foxLog.hunchMisses).toBe(0);
    expect(hunchSpots(state)).toHaveLength(1);
  });

  it('is gone when the rain stops, and gone for good once the patch turns over', () => {
    const state = missingOnlyPitcher();
    state.weather.condition = 'rain';
    foxVisit(state, () => 0.1);
    const spot = DISCOVERY_SPOTS.find((d) => d.id === state.fox.targetDiscoveryId)!;
    state.weather.condition = 'clear';
    expect(spotContent(state, spot)?.defId).not.toBe('monkeyCups');
    state.weather.condition = 'rain';
    expect(spotContent(state, spot)?.defId).toBe('monkeyCups');
    state.clock.totalMinutes += 360;
    const withHunch = spotContent(state, spot);
    const { hunch: _, ...rest } = state.spots[spot.id];
    state.spots[spot.id] = rest;
    expect(withHunch).toEqual(spotContent(state, spot));
  });

  it('has no hunch about anything common', () => {
    const state = createNewGame();
    for (const t of hunchTargets(state, 'meadow')) expect(t.rank).toBeGreaterThanOrEqual(2);
  });
});
