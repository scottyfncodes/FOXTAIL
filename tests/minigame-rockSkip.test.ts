import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../src/game/engine/Random';
import { findMiniGame } from '../src/game/systems/minigames';
import {
  BANK_BONUS,
  FAR_BANK,
  STONE_KINDS,
  THROWS,
  TOUCH_ARM,
  launch,
  reachedBank,
  simulateThrow,
  stepStone,
  tap,
  throwScore,
  timeToWater,
  type Stone,
  type StoneKind,
} from '../src/game/systems/minigames/rockSkip';

const deg = (d: number) => (d * Math.PI) / 180;

/** Taps right on the touchdown — but only for hops long enough for a real thumb to catch. */
const humanTapper = (s: Stone) => {
  const ttw = timeToWater(s);
  const hop = s.t - (s.lastSkip?.t ?? 0) + ttw;
  return s.tapAt === null && ttw < 0.05 && hop > 0.3;
};

describe('rock skip physics', () => {
  it('skims a low, hard throw several times', () => {
    const r = simulateThrow('flat', deg(5), 1);
    expect(r.stone.skips).toBeGreaterThanOrEqual(3);
    expect(r.events.filter((e) => e.type === 'skip').length).toBe(r.stone.skips);
  });

  it('plops a steep throw straight in', () => {
    for (const k of STONE_KINDS) {
      const r = simulateThrow(k, deg(35), 0.8);
      expect(r.stone.skips).toBe(0);
      expect(r.events[0]).toMatchObject({ type: 'sink', why: 'steep' });
      // A big lob might sail over into the reeds, but that's no skip and no bonus.
      expect(throwScore(simulateThrow(k, deg(35), 1).stone)).toBe(0);
    }
  });

  it('a feeble lob just goes in', () => {
    const r = simulateThrow('round', 0, 0.1);
    expect(r.stone.skips).toBe(0);
    expect(r.stone.state).toBe('sunk');
  });

  it('skips get shorter and closer together as it slows', () => {
    const r = simulateThrow('flat', deg(3), 1);
    const xs = r.events.filter((e) => e.type === 'skip').map((e) => e.x);
    for (let i = 2; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeLessThan(xs[i - 1] - xs[i - 2] + 1e-9);
  });

  it('good touches keep it going further and longer', () => {
    const plain = simulateThrow('flat', deg(3), 0.9);
    const timed = simulateThrow('flat', deg(3), 0.9, humanTapper);
    expect(timed.stone.goodTouches).toBeGreaterThan(0);
    expect(timed.stone.skips).toBeGreaterThan(plain.stone.skips);
    expect(timed.stone.x).toBeGreaterThan(plain.stone.x);
  });

  it("won't arm a tap from way up in the air", () => {
    const s = launch('flat', deg(10), 1);
    expect(timeToWater(s)).toBeGreaterThan(TOUCH_ARM);
    expect(tap(s)).toBe('early');
    expect(s.tapAt).toBeNull();
  });

  it('a slightly late tap still upgrades the skip it just missed', () => {
    const s = launch('flat', deg(3), 1);
    let e = null;
    while (!e) e = stepStone(s, 1 / 240);
    expect(e.type).toBe('skip');
    const vx = s.vx;
    expect(tap(s)).toBe('late');
    expect(s.vx).toBeGreaterThan(vx);
    expect(s.goodTouches).toBe(1);
  });

  it('the stones behave differently', () => {
    const counts = Object.fromEntries(STONE_KINDS.map((k) => [k, simulateThrow(k, deg(3), 1, humanTapper).stone])) as Record<StoneKind, Stone>;
    // The round one carries but skips less; the chip dances more at the end.
    expect(counts.round.skips).toBeLessThan(counts.chip.skips + 1);
    expect(new Set(STONE_KINDS.map((k) => counts[k].x.toFixed(1))).size).toBe(3);
  });

  it('a great throw can clatter up the far bank for a bonus', () => {
    let found: Stone | null = null;
    for (const k of STONE_KINDS)
      for (let a = 0; a <= 15 && !found; a += 1) {
        const r = simulateThrow(k, deg(a), 1, humanTapper);
        if (reachedBank(r.stone)) found = r.stone;
      }
    expect(found).not.toBeNull();
    expect(found!.x).toBe(FAR_BANK);
    expect(throwScore(found!)).toBe(found!.skips + BANK_BONUS);
  });

  it('every throw ends in a few seconds', () => {
    for (const k of STONE_KINDS)
      for (let a = -12; a <= 55; a += 4)
        for (const p of [0.1, 0.5, 1]) {
          const r = simulateThrow(k, deg(a), p, humanTapper);
          expect(r.stone.state).not.toBe('flying');
          expect(r.stone.t).toBeLessThan(6);
        }
  });
});

describe('rock skip session and goal', () => {
  const goal = findMiniGame('rockSkip')!.goal;

  /** Five throws by someone who has the knack: low angle, good arm, taps the hops they can see. */
  function skilled(seed: number): number {
    const rng = mulberry32(seed);
    let total = 0;
    for (let i = 0; i < THROWS; i++) {
      const a = deg(2 + rng() * 6);
      const p = 0.82 + rng() * 0.18;
      total += throwScore(simulateThrow('flat', a, p, (s) => humanTapper(s) && rng() < 0.75).stone);
    }
    return total;
  }

  /** Five throws flung any old how, no tapping. */
  function aimless(seed: number): number {
    const rng = mulberry32(seed);
    let total = 0;
    for (let i = 0; i < THROWS; i++) {
      const k = STONE_KINDS[Math.floor(rng() * 3)];
      total += throwScore(simulateThrow(k, deg(-10 + rng() * 60), 0.2 + rng() * 0.8).stone);
    }
    return total;
  }

  it('the goal is reachable with some technique', () => {
    const scores = Array.from({ length: 20 }, (_, i) => skilled(i + 1));
    const reached = scores.filter((s) => s >= goal).length;
    expect(reached).toBeGreaterThanOrEqual(12);
  });

  it("can't be reached by flinging without technique", () => {
    for (let i = 1; i <= 40; i++) expect(aimless(i)).toBeLessThan(goal);
  });

  it('even perfect form without any touches falls short', () => {
    let total = 0;
    for (let i = 0; i < THROWS; i++) total += throwScore(simulateThrow('flat', deg(5), 1).stone);
    expect(total).toBeLessThan(goal);
  });
});
