import { describe, it, expect } from 'vitest';
import { createNewGame } from '../src/game/state';
import { tickFox } from '../src/game/systems/fox';
import { DISCOVERY_SPOTS } from '../src/game/data/discoveryPoints';

describe('fox behavior', () => {
  it('stays invisible while the player is inside the greenhouse', () => {
    const state = createNewGame();
    state.fox.visible = true;
    tickFox(state, {
      playerZone: 'meadow',
      playerX: 10,
      playerY: 10,
      inGreenhouse: true,
      dtSeconds: 1,
      now: state.clock.totalMinutes,
      discoveryPoints: DISCOVERY_SPOTS,
      rand: () => 0.5,
    });
    expect(state.fox.visible).toBe(false);
  });

  it('eventually starts a leading or wandering sequence once its cooldown has passed', () => {
    const state = createNewGame();
    state.fox.behavior = 'idle';
    state.fox.nextEventAt = 0;
    tickFox(state, {
      playerZone: 'woodland',
      playerX: 10,
      playerY: 10,
      inGreenhouse: false,
      dtSeconds: 1,
      now: 100,
      discoveryPoints: DISCOVERY_SPOTS,
      rand: () => 0.1, // < 0.65 so it chooses to lead if a candidate exists
    });
    expect(['leading', 'wandering']).toContain(state.fox.behavior);
    expect(state.fox.visible).toBe(true);
  });

  it('reveals a fox-led patch once the fox arrives at it', () => {
    const state = createNewGame();
    const target = DISCOVERY_SPOTS.find((d) => d.id === 'sp-over-fox')!;
    state.fox.behavior = 'leading';
    state.fox.targetDiscoveryId = target.id;
    state.fox.x = target.x + 0.01;
    state.fox.y = target.y;
    state.fox.zone = target.zone;
    expect(state.spots[target.id]?.revealed).toBeFalsy();

    const result = tickFox(state, {
      playerZone: target.zone,
      playerX: target.x,
      playerY: target.y,
      inGreenhouse: false,
      dtSeconds: 0.1,
      now: state.clock.totalMinutes,
      discoveryPoints: DISCOVERY_SPOTS,
      rand: () => 0.5,
    });

    expect(result.revealedDiscoveryId).toBe(target.id);
    expect(state.spots[target.id]?.revealed).toBe(true);
    expect(state.fox.behavior).toBe('paused');
  });

  it('sometimes wanders without leading anywhere in particular', () => {
    const state = createNewGame();
    state.fox.behavior = 'idle';
    state.fox.nextEventAt = 0;
    // Not its first visit, and it has run once already: it pleases itself.
    state.foxLog.sightings = 4;
    state.foxLog.trailsStarted = 1;
    // rand > 0.65 means "don't lead" on the decision roll.
    tickFox(state, {
      playerZone: 'meadow',
      playerX: 66,
      playerY: 30,
      inGreenhouse: false,
      dtSeconds: 1,
      now: 0,
      discoveryPoints: DISCOVERY_SPOTS,
      rand: () => 0.9,
    });
    expect(state.fox.behavior).toBe('wandering');
    expect(state.fox.targetDiscoveryId).toBeNull();
  });
});

describe('the fox and a new player', () => {
  const ctx = (state: ReturnType<typeof createNewGame>, rand: () => number) => ({
    playerZone: 'meadow' as const,
    playerX: 64,
    playerY: 44,
    inGreenhouse: false,
    dtSeconds: 1,
    now: state.clock.totalMinutes,
    discoveryPoints: DISCOVERY_SPOTS,
    rand,
    pickTrailDestination: () => ({ x: 52, y: 30 }),
  });

  it('always shows something on its first visit, whatever the dice say', () => {
    const state = createNewGame();
    state.fox.behavior = 'gone';
    state.fox.nextEventAt = 0;
    tickFox(state, ctx(state, () => 0.99));
    expect(state.fox.behavior).toBe('leading');
    expect(state.fox.targetDiscoveryId).not.toBeNull();
  });

  it('runs from you by its third visit if it has not yet', () => {
    const state = createNewGame();
    state.foxLog.sightings = 2;
    state.fox.behavior = 'gone';
    state.fox.nextEventAt = 0;
    tickFox(state, ctx(state, () => 0.1));
    expect(state.fox.behavior).toBe('lookingBack');
    expect(state.fox.destX).toBe(52);
  });

  it('goes back to pleasing itself once it has run once', () => {
    const state = createNewGame();
    state.foxLog.sightings = 5;
    state.foxLog.trailsStarted = 1;
    state.fox.behavior = 'gone';
    state.fox.nextEventAt = 0;
    tickFox(state, ctx(state, () => 0.1));
    expect(state.fox.behavior).toBe('leading');
  });
});

describe('the fox and the creek', () => {
  it('leads you round by a bridge to a patch across the creek, never through the water', async () => {
    const { isWater } = await import('../src/game/data/worldMap');
    const state = createNewGame();
    const spot = { id: 'far-side', zone: 'woodland' as const, x: 30, y: 33 };
    state.fox.behavior = 'leading';
    state.fox.visible = true;
    state.fox.targetDiscoveryId = spot.id;
    state.fox.x = 50;
    state.fox.y = 33;
    let crossed = false;
    for (let i = 0; i < 4000 && state.fox.behavior === 'leading'; i++) {
      tickFox(state, { playerZone: 'meadow', playerX: 50, playerY: 33, inGreenhouse: false, dtSeconds: 0.05, now: 100, discoveryPoints: [spot], rand: () => 0.5 });
      expect(isWater(Math.floor(state.fox.x), Math.floor(state.fox.y))).toBe(false);
      if (state.fox.x < 40) crossed = true;
    }
    expect(crossed).toBe(true);
    expect(state.fox.behavior).toBe('paused');
  });
});
