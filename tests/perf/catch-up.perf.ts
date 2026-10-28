import { describe, it, expect } from 'vitest';
import { createNewGame, type GameState, type OwnedPlant } from '../../src/game/state';
import { STAGE_AT } from '../../src/game/systems/growth';
import { advanceWorld, WILD_TOTAL_CAP } from '../../src/game/systems/wild';
import { advanceClock } from '../../src/game/engine/Clock';
import { generateObstacles, buildBlockingSet } from '../../src/game/world/Obstacles';
import { mulberry32 } from '../../src/game/engine/Random';
import { isWater, zoneAt } from '../../src/game/data/worldMap';
import { PLANTS } from '../../src/game/data/plants';
import { DISCOVERY_SPOTS } from '../../src/game/data/discoveryPoints';
import type { OutdoorZoneId } from '../../src/game/types';

// Wall-clock budgets for catching up after time away. They measure the
// machine as much as the code, so they run on their own (npm run test:perf)
// and never gate a deploy. The same scenarios' correctness (caps, finite
// growth) is checked in overgrowth2.test.ts and takeover.test.ts.

const HOUR = 3_600_000;
const T0 = 1_700_000_000_000;
const blocking = buildBlockingSet(generateObstacles(), new Set());
const open = (tx: number, ty: number) => !blocking.has(`${tx},${ty}`) && !isWater(tx, ty) && !DISCOVERY_SPOTS.some((s) => s.x === tx && s.y === ty);

function plant(state: GameState, id: string, defId: string, x: number, y: number, growth: number) {
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
}

function returnAfter(state: GameState, hours: number, rand: () => number) {
  const clock = advanceClock(state, state.clock.lastRealTimestamp + hours * HOUR, rand);
  advanceWorld(state, clock.elapsedMinutes, 0, open, rand, clock.ecologyMinutes - clock.elapsedMinutes);
}

function timed(run: () => void): number {
  const t = performance.now();
  run();
  return performance.now() - t;
}

describe('catching up after time away stays fast', () => {
  it('a year away (ten, capped to one) on a small new garden: under 5 s', () => {
    const s = createNewGame();
    s.clock.lastRealTimestamp = T0;
    ['pothos', 'bostonFern', 'bamboo', 'monstera'].forEach((d, i) => plant(s, `p${i}`, d, 52.5 + i * 4, 27.5, STAGE_AT.young));
    expect(timed(() => returnAfter(s, 24 * 365 * 10, mulberry32(7)))).toBeLessThan(5000);
  }, 60_000);

  it('a week away on an already dense garden: under 4 s', () => {
    const s = createNewGame();
    s.clock.lastRealTimestamp = T0;
    const rand = mulberry32(11);
    let n = 0;
    for (let i = 0; i < 2000 && n < 420; i++) {
      const x = 47 + rand() * 42;
      const y = 1 + rand() * 60;
      if (!open(Math.floor(x), Math.floor(y))) continue;
      plant(s, `d${n++}`, ['pothos', 'bostonFern', 'moss', 'bamboo', 'hosta'][n % 5], x, y, STAGE_AT.specimen);
    }
    expect(timed(() => returnAfter(s, 24 * 7, rand))).toBeLessThan(4000);
  }, 60_000);

  it('a week away on a full valley: under 4 s', () => {
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
    expect(timed(() => returnAfter(s, 24 * 7, mulberry32(11)))).toBeLessThan(4000);
  }, 60_000);
});
