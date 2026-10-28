import { describe, it, expect } from 'vitest';
import { createNewGame, type GameState, type OwnedPlant } from '../src/game/state';
import { STAGE_AT } from '../src/game/systems/growth';
import { advanceWorld, computeLushness, WILD_TOTAL_CAP, WILD_ZONE_CAP, WILD_SPECIES_ZONE_CAP } from '../src/game/systems/wild';
import { advanceClock } from '../src/game/engine/Clock';
import { generateObstacles, buildBlockingSet } from '../src/game/world/Obstacles';
import { mulberry32 } from '../src/game/engine/Random';
import { isWater, zoneAt } from '../src/game/data/worldMap';
import { PLANTS } from '../src/game/data/plants';
import { DISCOVERY_SPOTS } from '../src/game/data/discoveryPoints';
import type { OutdoorZoneId } from '../src/game/types';

// The complaint behind this: coming back to the game, the plants set out in
// a region had stopped taking it over. Every region stalled at about half
// covered after the first day away, however long you were gone, because the
// region could only hold 140 of your plants. These pin the takeover.

const HOUR = 3_600_000;
const T0 = 1_700_000_000_000;
const blocking = buildBlockingSet(generateObstacles(), new Set());
const open = (tx: number, ty: number) => !blocking.has(`${tx},${ty}`) && !isWater(tx, ty) && !DISCOVERY_SPOTS.some((s) => s.x === tx && s.y === ty);

function plant(state: GameState, id: string, defId: string, x: number, y: number, growth: number): OwnedPlant {
  const p: OwnedPlant = {
    id,
    defId,
    variantId: PLANTS[defId].variants[0].id,
    seed: 3,
    growth,
    location: { kind: 'wild', x, y, zone: zoneAt(Math.floor(x), Math.floor(y)) as OutdoorZoneId },
    plantedAt: 0,
    lastCuttingAt: null,
    generation: 0,
    bornWild: false,
  };
  state.plants[id] = p;
  return p;
}

/** Half a dozen just-rooted plants in a row across a region: an afternoon's planting, then the phone goes down. */
function garden(y: number): GameState {
  const s = createNewGame();
  s.clock.lastRealTimestamp = T0;
  ['pothos', 'bostonFern', 'bamboo', 'monstera', 'hosta', 'moss'].forEach((d, i) => plant(s, `p${i}`, d, 52.5 + i * 5, y, STAGE_AT.young));
  return s;
}

function returnAfter(state: GameState, hours: number, seed = 5) {
  const rand = mulberry32(seed);
  const clock = advanceClock(state, state.clock.lastRealTimestamp + hours * HOUR, rand);
  return advanceWorld(state, clock.elapsedMinutes, 0, open, rand, clock.ecologyMinutes - clock.elapsedMinutes);
}

const count = (s: GameState) => Object.values(s.plants).filter((p) => p.location.kind === 'wild').length;
const cover = (s: GameState, zone: OutdoorZoneId) => computeLushness(s).zoneCover[zone];

describe('what you plant takes the region over', () => {
  it('a night away comes back to most of the meadow yours, a few days to nearly all of it', () => {
    const after = (h: number) => {
      const s = garden(30.5);
      returnAfter(s, h);
      return { plants: count(s), cover: cover(s, 'meadow') };
    };
    const night = after(8);
    const day = after(24);
    const days3 = after(72);
    expect(night.cover).toBeGreaterThan(0.55);
    expect(day.cover).toBeGreaterThan(0.7);
    expect(days3.cover).toBeGreaterThan(0.78);
    // And it keeps going, rather than stopping at the first day: the old plateau.
    expect(day.plants).toBeGreaterThan(night.plants * 1.5);
    expect(days3.plants).toBeGreaterThan(day.plants * 1.2);
  });

  it('the same in the rocky clearing, rocks and all', () => {
    const s = garden(54.5);
    returnAfter(s, 24);
    expect(cover(s, 'rockyClearing')).toBeGreaterThan(0.75);
  });

  it('spills over into the regions next door', () => {
    const s = garden(30.5);
    returnAfter(s, 72);
    const lush = computeLushness(s);
    expect(lush.zoneCount.dampForest + lush.zoneCount.rockyClearing).toBeGreaterThan(100);
  });

  it('a region holds enough of your plants to be overgrown, no one species all of it, and the valley stays bounded', () => {
    expect(WILD_ZONE_CAP).toBeGreaterThanOrEqual(400);
    expect(WILD_SPECIES_ZONE_CAP).toBeLessThan(WILD_ZONE_CAP);
    expect(WILD_TOTAL_CAP).toBeLessThanOrEqual(2000);
    const s = garden(30.5);
    returnAfter(s, 24 * 7);
    expect(count(s)).toBeLessThanOrEqual(WILD_TOTAL_CAP);
    const lush = computeLushness(s);
    for (const z of Object.keys(lush.zoneCount) as OutdoorZoneId[]) expect(lush.zoneCount[z]).toBeLessThanOrEqual(WILD_ZONE_CAP);
  });

  // How long this takes is checked in tests/perf (npm run test:perf).
  it('a full valley left for a week catches up within the cap', () => {
    const s = createNewGame();
    s.clock.lastRealTimestamp = T0;
    const rand = mulberry32(11);
    let n = 0;
    for (let i = 0; i < 20000 && n < WILD_TOTAL_CAP - 50; i++) {
      const x = 1 + rand() * 88;
      const y = 1 + rand() * 62;
      if (!open(Math.floor(x), Math.floor(y)) || zoneAt(Math.floor(x), Math.floor(y)) === 'greenhouse') continue;
      plant(s, `d${n++}`, ['pothos', 'bostonFern', 'moss', 'bamboo', 'hosta'][n % 5], x, y, STAGE_AT.specimen);
    }
    returnAfter(s, 24 * 7, 11);
    expect(count(s)).toBeLessThanOrEqual(WILD_TOTAL_CAP);
  });
});
