import { describe, it, expect } from 'vitest';
import { tickScott, ACTIVITY_FOR_KIND } from '../src/game/systems/scott';
import { SCOTT_SPOTS, findScottSpot } from '../src/game/data/scottSpots';
import { createNewGame } from '../src/game/state';
import { generateObstacles, buildBlockingSet } from '../src/game/world/Obstacles';
import { zoneAt } from '../src/game/data/worldMap';
import { roomAt, PARTITION_DOOR_YS } from '../src/game/data/interior';
import { isCouchSpot } from '../src/game/data/scottSpots';
import { migrateSave } from '../src/game/engine/SaveManager';

describe('Scott (ambient NPC)', () => {
  it('starts already settled into an activity at his starting spot', () => {
    const state = createNewGame();
    expect(state.scott.activity).not.toBe('traveling');
    expect(state.scott.currentSpotId).toBeTruthy();
  });

  it('stays put until his current activity\'s time is up', () => {
    const state = createNewGame();
    state.scott.nextChangeAt = 9999;
    const before = { x: state.scott.x, y: state.scott.y, activity: state.scott.activity };
    tickScott(state.scott, { dtSeconds: 1, now: 100, rand: () => 0.3 });
    expect(state.scott).toMatchObject(before);
  });

  it('heads toward a new spot once his time is up, and eventually settles into that spot\'s activity', () => {
    const state = createNewGame();
    state.scott.x = 5;
    state.scott.y = 7;
    state.scott.zone = 'greenhouse';
    state.scott.nextChangeAt = 0; // already due
    tickScott(state.scott, { dtSeconds: 1, now: 100, rand: () => 0.5 });
    expect(state.scott.activity).toBe('traveling');
    const target = findScottSpot(state.scott.targetSpotId)!;
    expect(target).toBeTruthy();

    // Walk him all the way there.
    let guard = 0;
    while (state.scott.activity === 'traveling' && guard < 500) {
      tickScott(state.scott, { dtSeconds: 1, now: 100 + guard, rand: () => 0.5 });
      guard++;
    }
    expect(guard).toBeLessThan(500);
    expect(state.scott.currentSpotId).toBe(target.id);
    expect(state.scott.activity).toBe(ACTIVITY_FOR_KIND[target.kind]);
    expect(Math.hypot(state.scott.x - target.x, state.scott.y - target.y)).toBeLessThan(0.5);
  });

  it('teleports across the indoor/outdoor boundary rather than trying to walk through a wall', () => {
    const state = createNewGame();
    // Force his next target to be an outdoor spot while he's indoors.
    const outdoorSpot = SCOTT_SPOTS.find((s) => s.zone !== 'greenhouse')!;
    const indoorIndex = SCOTT_SPOTS.findIndex((s) => s.zone === 'greenhouse');
    state.scott.zone = 'greenhouse';
    state.scott.currentSpotId = SCOTT_SPOTS[indoorIndex].id;
    state.scott.x = SCOTT_SPOTS[indoorIndex].x;
    state.scott.y = SCOTT_SPOTS[indoorIndex].y;
    state.scott.nextChangeAt = 0;
    // Bias rand toward picking the outdoor spot: keep rolling until we land on it,
    // since spot order/selection is randomized — deterministic rand that always
    // returns the index of our chosen outdoor spot.
    const options = SCOTT_SPOTS.filter((s) => s.id !== state.scott.currentSpotId);
    const idx = options.findIndex((s) => s.id === outdoorSpot.id);
    tickScott(state.scott, { dtSeconds: 1, now: 100, rand: () => (idx + 0.5) / options.length });
    expect(state.scott.zone).toBe(outdoorSpot.zone);
    expect(state.scott.x).toBe(outdoorSpot.x);
    expect(state.scott.y).toBe(outdoorSpot.y);
  });

  it('never picks his own current spot as the next destination', () => {
    const state = createNewGame();
    state.scott.currentSpotId = SCOTT_SPOTS[0].id;
    state.scott.nextChangeAt = 0;
    for (let trial = 0; trial < 20; trial++) {
      state.scott.activity = 'tinkering';
      state.scott.currentSpotId = SCOTT_SPOTS[0].id;
      state.scott.nextChangeAt = 0;
      tickScott(state.scott, { dtSeconds: 1, now: 100, rand: () => trial / 20 });
      expect(state.scott.targetSpotId).not.toBe(SCOTT_SPOTS[0].id);
    }
  });

  it('has a driving range and a putting green, and every outdoor spot is on open ground in its own region', () => {
    expect(SCOTT_SPOTS.some((s) => s.kind === 'golf')).toBe(true);
    expect(SCOTT_SPOTS.some((s) => s.kind === 'putt')).toBe(true);
    const blocked = buildBlockingSet(generateObstacles());
    for (const spot of SCOTT_SPOTS.filter((s) => s.zone !== 'greenhouse')) {
      expect(zoneAt(spot.x, spot.y)).toBe(spot.zone);
      expect(blocked.has(`${spot.x},${spot.y}`)).toBe(false);
    }
  });

  it('settles into golfing or putting at those spots, lining up side-on to putt', () => {
    const state = createNewGame();
    const green = SCOTT_SPOTS.find((s) => s.kind === 'putt')!;
    Object.assign(state.scott, { zone: green.zone, x: green.x, y: green.y, activity: 'traveling', targetSpotId: green.id });
    tickScott(state.scott, { dtSeconds: 1, now: 100, rand: () => 0.5 });
    expect(state.scott.activity).toBe('putting');
    expect(state.scott.facing).toBe('right');
  });

  it('spends some of his time at home: the ball game on the couch, a drink, a nap, the putting mat, a loaf in the kitchen', () => {
    const living = SCOTT_SPOTS.filter((s) => s.zone === 'greenhouse' && roomAt(s.x) === 'living');
    expect(living.map((s) => s.kind).sort()).toEqual(['bake', 'drink', 'nap', 'putt', 'tv']);
    expect(ACTIVITY_FOR_KIND.tv).toBe('watchingTV');
    expect(ACTIVITY_FOR_KIND.drink).toBe('relaxing');
    // …but only occasionally: most of his spots are elsewhere.
    expect(living.length / SCOTT_SPOTS.length).toBeLessThan(0.35);
  });

  it('sits facing the TV, and walks through the doorway to get there', () => {
    const state = createNewGame();
    const s = state.scott;
    s.zone = 'greenhouse';
    s.x = 8;
    s.y = 4;
    s.activity = 'traveling';
    s.targetSpotId = 'living-couch-tv';
    let crossed = false;
    for (let i = 0; i < 500 && s.activity === 'traveling'; i++) {
      const before = roomAt(s.x);
      tickScott(s, { dtSeconds: 0.1, now: 100, rand: () => 0.5 });
      if (before !== roomAt(s.x)) {
        crossed = true;
        expect(PARTITION_DOOR_YS).toContain(Math.floor(s.y));
      }
    }
    expect(crossed).toBe(true);
    expect(s.activity).toBe('watchingTV');
    expect(s.facing).toBe('up');
    expect(isCouchSpot(s.currentSpotId)).toBe(true);
  });
});

import { CHARACTER_SCALE } from '../src/game/data/character';

describe('Scott and Ellen side by side', () => {
  it('stand at their real heights: 6\'3" to 5\'3"', () => {
    // Sole-to-crown heights of the unscaled art, in tiles (hat aside).
    const scott = 0.682 * CHARACTER_SCALE.scott;
    const ellen = 0.65 * CHARACTER_SCALE.ellen;
    expect(scott / ellen).toBeCloseTo(75 / 63, 1);
  });
});

import { tickChase, newChase, dipAmount, smiling, DIP_END, CHASE_SECONDS, KISS_SECONDS, KISS_COOLDOWN, HURRY_FACTOR } from '../src/game/systems/scott';

describe('Ellen chasing Scott', () => {
  const setup = () => {
    const state = createNewGame();
    const scott = state.scott;
    scott.zone = 'meadow';
    scott.activity = 'traveling';
    scott.x = 50;
    scott.y = 30;
    return { scott, ch: newChase() };
  };
  const chase = (ch: ReturnType<typeof newChase>, scott: ReturnType<typeof setup>['scott'], seconds: number, opts: { x?: number; moving?: boolean; indoors?: boolean } = {}) => {
    let started = false;
    for (let t = 0; t < seconds; t += 0.1) {
      if (tickChase(ch, scott, { ellenX: opts.x ?? 49.2, ellenY: 30, ellenIndoors: opts.indoors ?? false, ellenMoving: opts.moving ?? true, dtSeconds: 0.1 })) started = true;
    }
    return started;
  };

  it('ends in a dip and a kiss if she keeps after him long enough', () => {
    const { scott, ch } = setup();
    expect(chase(ch, scott, CHASE_SECONDS - 0.5)).toBe(false);
    expect(chase(ch, scott, 0.7)).toBe(true);
    expect(ch.kiss).not.toBeNull();
    // He steps in beside her and turns to face her.
    expect(scott.x).toBeCloseTo(49.7);
    expect(scott.facing).toBe('left');
  });

  it('plays out and then leaves a pause before it can happen again', () => {
    const { scott, ch } = setup();
    chase(ch, scott, CHASE_SECONDS + 0.2);
    chase(ch, scott, KISS_SECONDS + 0.2);
    expect(ch.kiss).toBeNull();
    expect(ch.cooldown).toBeGreaterThan(KISS_COOLDOWN - 1);
    expect(chase(ch, scott, CHASE_SECONDS + 1)).toBe(false);
  });

  it('does not count standing still, keeping a distance, or being on the other side of a wall', () => {
    for (const opts of [{ moving: false }, { x: 45 }, { indoors: true }]) {
      const { scott, ch } = setup();
      expect(chase(ch, scott, CHASE_SECONDS * 2, opts)).toBe(false);
    }
  });

  it('leaves him be while he naps or sits on the couch', () => {
    const { scott, ch } = setup();
    scott.activity = 'napping';
    expect(chase(ch, scott, CHASE_SECONDS * 2)).toBe(false);
  });

  it('smiles a while after the kiss, then runs back to work', () => {
    const { scott, ch } = setup();
    chase(ch, scott, CHASE_SECONDS + 0.2);
    // Up from the dip, still together, just smiling.
    chase(ch, scott, KISS_SECONDS * (DIP_END + 0.1));
    expect(ch.kiss).not.toBeNull();
    expect(smiling(ch.kiss!.t)).toBe(true);
    expect(dipAmount(ch.kiss!.t)).toBe(0);
    chase(ch, scott, KISS_SECONDS);
    expect(ch.kiss).toBeNull();
    expect(scott.activity).toBe('traveling');
    expect(findScottSpot(scott.targetSpotId)?.kind).toBe('tinker');
    expect(findScottSpot(scott.targetSpotId)?.zone).not.toBe('greenhouse');
    expect(scott.hurrying).toBe(true);
    // Quicker than his usual amble, and back to normal once he's there.
    const from = { x: scott.x, y: scott.y };
    tickScott(scott, { dtSeconds: 0.1, now: 0, rand: () => 0 });
    expect(Math.hypot(scott.x - from.x, scott.y - from.y)).toBeCloseTo(0.2 * HURRY_FACTOR, 5);
    for (let i = 0; i < 2000 && scott.activity === 'traveling'; i++) tickScott(scott, { dtSeconds: 0.1, now: 0, rand: () => 0 });
    expect(scott.activity).toBe('tinkering');
    expect(scott.hurrying).toBeUndefined();
  });

  it('eases into the dip, holds it, and eases out', () => {
    expect(dipAmount(0)).toBe(0);
    expect(dipAmount(DIP_END / 2)).toBe(1);
    expect(dipAmount(DIP_END)).toBe(0);
    expect(dipAmount(1)).toBe(0);
    expect(dipAmount(0.1)).toBeGreaterThan(0);
    expect(dipAmount(0.1)).toBeLessThan(1);
  });
});

describe('where Scott naps', () => {
  it('only ever in the house, on the living-room couch', () => {
    const naps = SCOTT_SPOTS.filter((s) => s.kind === 'nap');
    expect(naps.length).toBeGreaterThan(0);
    for (const s of naps) {
      expect(s.zone).toBe('greenhouse');
      expect(roomAt(s.x)).toBe('living');
    }
  });

  it('an old save napping at a spot that no longer exists gets up and moves on', () => {
    const state = createNewGame();
    state.scott = { ...state.scott, zone: 'meadow', activity: 'napping', currentSpotId: 'meadow-sun-nap', x: 75, y: 30, nextChangeAt: state.clock.totalMinutes + 80 };
    const loaded = migrateSave(JSON.parse(JSON.stringify(state)))!;
    expect(loaded.scott.nextChangeAt).toBe(loaded.clock.totalMinutes);
    tickScott(loaded.scott, { dtSeconds: 0.1, now: loaded.clock.totalMinutes, rand: () => 0 });
    expect(loaded.scott.activity).toBe('traveling');
  });
});
