import { describe, it, expect } from 'vitest';
import { createNewGame, type GameState } from '../src/game/state';
import { tickFox, nextLeg, rollTrailReward, STARTLE_DIST, LOSE_DIST, type FoxTickContext } from '../src/game/systems/fox';
import { createFoxFinds, collectFoxFind, expireFoxFinds, pickFoxPlant, pickCuriosity, FOX_FIND_LIFETIME } from '../src/game/systems/foxFinds';
import { DISCOVERY_SPOTS } from '../src/game/data/discoveryPoints';
import { PLANTS, rarityRank } from '../src/game/data/plants';
import { mulberry32 } from '../src/game/engine/Random';

function ctx(state: GameState, over: Partial<FoxTickContext> = {}): FoxTickContext {
  return {
    playerZone: 'meadow',
    playerX: 60,
    playerY: 30,
    inGreenhouse: false,
    dtSeconds: 0.1,
    now: 1000,
    discoveryPoints: [],
    rand: () => 0.9,
    pickTrailDestination: () => ({ x: 80, y: 30 }),
    ...over,
  };
}

/** Puts the fox at the start of a trail, watching the player from a distance. */
function startTrail(state: GameState) {
  state.fox.behavior = 'gone';
  state.fox.nextEventAt = 0;
  // A fox that has been about a while: its first-visit and third-visit habits don't apply.
  state.foxLog.sightings = 5;
  state.foxLog.trailsStarted = 1;
  // 0.9: don't lead to a patch; then 0.1: take the trail.
  const rolls = [0.9, 0.1, 0.5, 0.5, 0.5];
  let i = 0;
  tickFox(state, ctx(state, { rand: () => rolls[i++ % rolls.length] }));
}

describe('the fox’s trails', () => {
  it('appears a little way off and watches, then runs when you come closer', () => {
    const state = createNewGame();
    startTrail(state);
    expect(state.fox.behavior).toBe('lookingBack');
    expect(state.fox.destX).toBe(80);
    const d = Math.hypot(state.fox.x - 60, state.fox.y - 30);
    expect(d).toBeGreaterThan(STARTLE_DIST);
    const res = tickFox(state, ctx(state, { playerX: state.fox.x - 2, playerY: state.fox.y }));
    expect(res.trailStarted).toBe(true);
    expect(state.fox.behavior).toBe('fleeing');
    expect(state.foxLog.trailsStarted).toBe(2);
  });

  it('stops and looks back when you fall behind, and waits for you', () => {
    const state = createNewGame();
    startTrail(state);
    const px = state.fox.x - 2;
    tickFox(state, ctx(state, { playerX: px, playerY: state.fox.y }));
    for (let i = 0; i < 40 && state.fox.behavior === 'fleeing'; i++) tickFox(state, ctx(state, { playerX: px, playerY: state.fox.y }));
    expect(state.fox.behavior).toBe('lookingBack');
    tickFox(state, ctx(state, { playerX: state.fox.x - 3, playerY: state.fox.y }));
    expect(state.fox.behavior).toBe('fleeing');
  });

  it('is lost if you let it get too far ahead — and leaves nothing', () => {
    const state = createNewGame();
    startTrail(state);
    tickFox(state, ctx(state, { playerX: state.fox.x - 2, playerY: state.fox.y }));
    let lost = false;
    for (let i = 0; i < 400 && state.fox.behavior !== 'gone'; i++) {
      const r = tickFox(state, ctx(state, { playerX: state.fox.x - LOSE_DIST - 2, playerY: state.fox.y }));
      lost = lost || !!r.trailLost;
    }
    expect(lost).toBe(true);
    expect(state.foxLog.trailsLost).toBe(1);
    expect(state.fox.visible).toBe(false);
  });

  it('leads somewhere if you keep up, then slips away into the undergrowth', () => {
    const state = createNewGame();
    startTrail(state);
    let ended: ReturnType<typeof tickFox>['trailEnded'];
    for (let i = 0; i < 3000 && !ended; i++) {
      // Keep a couple of tiles behind it, like a player following.
      const r = tickFox(state, ctx(state, { playerX: state.fox.x - 2.5, playerY: state.fox.y }));
      ended = r.trailEnded;
    }
    expect(ended).toBeDefined();
    expect(ended!.x).toBe(80);
    expect(state.fox.behavior).toBe('vanishing');
    expect(state.foxLog.trailsFollowed).toBe(1);
  });

  it('never shows the way with a marker: sometimes there’s simply nothing there', () => {
    const rand = mulberry32(3);
    const rolls = Array.from({ length: 500 }, () => rollTrailReward(rand));
    expect(rolls).toContain('nothing');
    expect(rolls).toContain('plant');
    expect(rolls).toContain('grove');
    expect(rolls).toContain('curiosity');
  });

  it('crosses the creek by a bridge, not through the water', () => {
    const leg = nextLeg(30, 20, 60, 20);
    expect(leg.y).toBeGreaterThanOrEqual(13);
    expect(leg.y).toBeLessThanOrEqual(16);
    expect(leg.x).toBeLessThan(42);
    expect(nextLeg(50, 20, 60, 25)).toEqual({ x: 60, y: 25 });
  });

  it('still reveals its secret patches, as before', () => {
    const state = createNewGame();
    state.fox.behavior = 'idle';
    state.fox.nextEventAt = 0;
    tickFox(state, ctx(state, { playerZone: 'woodland', discoveryPoints: DISCOVERY_SPOTS, rand: () => 0.1 }));
    expect(state.fox.behavior).toBe('leading');
  });
});

describe('what the fox leads you to', () => {
  it('is something unusual — never an everyday plant', () => {
    const state = createNewGame();
    const rand = mulberry32(8);
    for (let i = 0; i < 200; i++) {
      const p = pickFoxPlant(state, 'woodland', rand)!;
      const def = PLANTS[p.defId];
      const v = def.variants.find((x) => x.id === p.variantId)!;
      expect(def.foxOnly || rarityRank(v.rarity) >= 2 || rarityRank(def.rarity) >= 2).toBe(true);
    }
  });

  it('can be taken home as a cutting, and counts as a discovery', () => {
    const state = createNewGame();
    const [f] = createFoxFinds(state, 20, 20, 'woodland', 'plant', { night: false, rain: false }, 0, mulberry32(2));
    const res = collectFoxFind(state, f.id, 5);
    expect(res.ok).toBe(true);
    expect(res.newSpecies).toBe(true);
    expect(state.basket).toHaveLength(1);
    expect(state.foxFinds).toHaveLength(0);
    expect(state.foxLog.finds).toBe(1);
  });

  it('may be a little grove of the same thing', () => {
    const state = createNewGame();
    const finds = createFoxFinds(state, 20, 20, 'woodland', 'grove', { night: false, rain: false }, 0, mulberry32(4));
    expect(finds.length).toBeGreaterThan(1);
    expect(new Set(finds.map((f) => f.defId)).size).toBe(1);
  });

  it('may be a curiosity — some only by night, or in the rain — noted in the journal', () => {
    const state = createNewGame();
    const night = createFoxFinds(state, 20, 20, 'woodland', 'curiosity', { night: true, rain: false }, 0, mulberry32(1));
    expect(night[0].kind).toBe('curiosity');
    const res = collectFoxFind(state, night[0].id, 0);
    expect(res.newCuriosity).toBe(true);
    expect(state.curiosities[night[0].curiosityId!].count).toBe(1);
    // Day-only creatures never turn up after dark.
    for (let i = 0; i < 50; i++) {
      const [f] = createFoxFinds(state, 20, 20, 'meadow', 'curiosity', { night: true, rain: false }, 0, mulberry32(i));
      expect(['swallowtail', 'emeraldDragonfly', 'jewelBeetle']).not.toContain(f.curiosityId);
    }
  });

  it('doesn’t wait forever', () => {
    const state = createNewGame();
    createFoxFinds(state, 20, 20, 'woodland', 'plant', { night: false, rain: false }, 0, mulberry32(2));
    expect(expireFoxFinds(state, FOX_FIND_LIFETIME - 1)).toBe(0);
    expect(expireFoxFinds(state, FOX_FIND_LIFETIME + 1)).toBe(1);
  });
});

describe('repeat curiosities', () => {
  it('something already noted turns up again only now and then, and less each time', () => {
    const rate = (count: number) => {
      const state = createNewGame();
      if (count) state.curiosities.splitGeode = { foundAt: 0, count };
      const rand = mulberry32(5);
      let hits = 0;
      for (let i = 0; i < 6000; i++) if (pickCuriosity(state, 'rockyClearing', { night: true, rain: false }, rand)?.id === 'splitGeode') hits++;
      return hits;
    };
    const fresh = rate(0);
    const once = rate(1);
    const many = rate(4);
    expect(once).toBeLessThan(fresh * 0.3);
    expect(many).toBeLessThan(once * 0.5);
    expect(once).toBeGreaterThan(0);
  });

  it('a trail that would have led to a repeat leads to a plant instead', () => {
    const state = createNewGame();
    for (const id of ['splitGeode', 'lostGolfBall', 'jewelBeetle']) state.curiosities[id] = { foundAt: 0, count: 50 };
    const rand = mulberry32(9);
    let curios = 0;
    let plants = 0;
    for (let i = 0; i < 400; i++) {
      state.foxFinds = [];
      const out = createFoxFinds(state, 20, 20, 'rockyClearing', 'curiosity', { night: true, rain: false }, 0, rand);
      if (out[0]?.kind === 'curiosity' && out[0].curiosityId !== 'lostGolfBall') curios++;
      else if (out[0]?.kind === 'plant') plants++;
    }
    expect(curios).toBeLessThan(10);
    expect(plants).toBeGreaterThan(240);
  });
});
