import { describe, it, expect } from 'vitest';
import { createNewGame } from '../src/game/state';
import { DISCOVERY_SPOTS, SPOT_EPOCH_MINUTES } from '../src/game/data/discoveryPoints';
import { spotContent, wanderHost } from '../src/game/systems/spots';
import { tickScout } from '../src/game/systems/scout';
import { tickScott } from '../src/game/systems/scott';
import type { ScottSpot } from '../src/game/data/scottSpots';

describe('rare plants from the fox’s patches', () => {
  const fox = DISCOVERY_SPOTS.find((s) => s.id === 'sp-wood-fox')!;

  it('grow in the fox’s patch once, then come up somewhere different in the region each time they reappear', () => {
    const state = createNewGame();
    state.spots[fox.id] = { revealed: true };
    expect(spotContent(state, fox)?.defId).toBe('foxglowAroid');
    state.spots[fox.id] = { revealed: true, collectedEpoch: 0 };
    const hosts: string[] = [];
    let prev: string | null = null;
    for (let epoch = 1; epoch < 300; epoch++) {
      state.clock.totalMinutes = epoch * SPOT_EPOCH_MINUTES + 1;
      // Never back in its old home.
      expect(spotContent(state, fox)).toBeNull();
      const host = wanderHost(fox, epoch);
      if (host) {
        expect(host.zone).toBe(fox.zone);
        expect(host.foxLed).toBeFalsy();
        expect(host.id).not.toBe(prev);
        expect(spotContent(state, host)?.defId).toBe('foxglowAroid');
        hosts.push(host.id);
      }
      prev = host?.id ?? null;
    }
    expect(new Set(hosts).size).toBeGreaterThanOrEqual(4);
    // Turns up now and then, not every season.
    expect(hosts.length).toBeGreaterThan(30);
    expect(hosts.length).toBeLessThan(150);
  });

  it('don’t wander before you’ve picked one from the fox’s patch', () => {
    const state = createNewGame();
    state.spots[fox.id] = { revealed: true };
    const ordinary = DISCOVERY_SPOTS.filter((s) => s.zone === fox.zone && !s.foxLed);
    for (let epoch = 1; epoch < 120; epoch++) {
      state.clock.totalMinutes = epoch * SPOT_EPOCH_MINUTES + 1;
      for (const s of ordinary) expect(spotContent(state, s)?.defId).not.toBe('foxglowAroid');
    }
  });
});

describe('Scout following a scent', () => {
  it('runs to the curiosity and stands over it until the lead ends', () => {
    const state = createNewGame();
    const sc = state.scout;
    sc.leadTo = { x: sc.x + 6, y: sc.y + 2, findId: 'f1' };
    const ctx = { playerX: sc.x, playerY: sc.y, playerFacing: 'down' as const, playerMoving: false, dtSeconds: 0.1, now: 0, nearbyUndiscovered: null, rand: () => 0.5 };
    tickScout(sc, ctx);
    expect(sc.behavior).toBe('leading');
    for (let i = 0; i < 100; i++) tickScout(sc, ctx);
    expect(sc.behavior).toBe('pointing');
    expect(Math.hypot(sc.x - sc.leadTo.x, sc.y - sc.leadTo.y)).toBeLessThan(0.8);
    // Lead over: back to Ellen.
    delete sc.leadTo;
    tickScout(sc, ctx);
    expect(sc.behavior).toBe('following');
  });
});

describe('Scott showing Ellen a seedling', () => {
  const seedling: ScottSpot = { id: 'show-p1', kind: 'show', zone: 'meadow', x: 80, y: 30, face: 'left' };

  it('drops what he’s doing, comes out of the house if he’s in it, and waves her over', () => {
    const state = createNewGame();
    const s = state.scott;
    expect(s.zone).toBe('greenhouse');
    s.nextChangeAt = 1e9;
    tickScott(s, { dtSeconds: 0.1, now: 100, rand: () => 0.5, summon: seedling });
    expect(s.zone).not.toBe('greenhouse');
    expect(s.activity).toBe('traveling');
    expect(s.targetSpotId).toBe(seedling.id);
    let guard = 0;
    while (s.activity === 'traveling' && guard < 2000) {
      tickScott(s, { dtSeconds: 0.1, now: 100, rand: () => 0.5, summon: seedling });
      guard++;
    }
    expect(s.activity).toBe('showingPlant');
    expect(s.facing).toBe('left');
    expect(Math.hypot(s.x - seedling.x, s.y - seedling.y)).toBeLessThan(0.4);
  });

  it('won’t be pulled out of the truck mid-drive', () => {
    const state = createNewGame();
    Object.assign(state.scott, { zone: 'meadow', activity: 'driving', x: 70, y: 27, driveLeg: 1 });
    tickScott(state.scott, { dtSeconds: 0.1, now: 100, rand: () => 0.5, summon: seedling });
    expect(state.scott.targetSpotId).not.toBe(seedling.id);
  });
});
