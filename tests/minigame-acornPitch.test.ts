import { describe, it, expect } from 'vitest';
import {
  ACORNS_PER_TARGET,
  ACORN_R,
  MAX_POINTS,
  STEP,
  TARGETS,
  clampAngle,
  newAcorn,
  outcome,
  pointsFor,
  previewArc,
  simulateLob,
  stepAcorn,
  type Acorn,
  type Target,
} from '../src/game/systems/minigames/acornPitch';
import { mulberry32 } from '../src/game/engine/Random';

const DEG = Math.PI / 180;

/** Lets an acorn go from a standing start at (x, y) and runs it to rest. */
function drop(tg: Target, x: number, y: number, vx = 0): { a: Acorn; events: string[] } {
  const a = newAcorn();
  Object.assign(a, { x, y, vx, vy: 0 });
  const events: string[] = [];
  for (let i = 0; i < 4000 && !a.done; i++) {
    const ev = stepAcorn(a, tg, STEP);
    if (ev) events.push(ev);
  }
  return { a, events };
}

/** The range of power at an angle that gets it in (or on). */
function hitWindow(tg: Target, angle: number): [number, number] | null {
  let lo = -1;
  let hi = -1;
  for (let p = 0.1; p <= 1; p += 0.004) {
    if (simulateLob(tg, angle, p).outcome !== 'miss') {
      if (lo < 0) lo = p;
      hi = p;
    }
  }
  return lo < 0 ? null : [lo, hi];
}

const WINDOWS = TARGETS.map((tg) => hitWindow(tg, 45 * DEG));

/** Roughly normal noise from a seeded rng. */
function gauss(rand: () => number): number {
  let u = 0;
  for (let i = 0; i < 6; i++) u += rand();
  return (u - 3) / Math.sqrt(0.5);
}

/**
 * A steady thrower who knows roughly where each thing is and gets steadier
 * with each acorn (learning from the last one's trail). `px` is the wobble
 * in pull, in screen pixels of a ~220 px full pull, for acorns 1, 2 and 3.
 */
function play(rand: () => number, px: [number, number, number]): number {
  let total = 0;
  TARGETS.forEach((tg, i) => {
    const [lo, hi] = WINDOWS[i]!;
    const p = (lo + hi) / 2;
    for (let n = 1; n <= ACORNS_PER_TARGET; n++) {
      const angle = 45 * DEG + gauss(rand) * px[n - 1] * 0.6 * DEG;
      const power = p + (gauss(rand) * px[n - 1]) / 220;
      if (simulateLob(tg, angle, power).outcome !== 'miss') {
        total += pointsFor(n);
        break;
      }
    }
  });
  return total;
}

describe('acorn pitch physics', () => {
  it('a lob comes down, rolls a little in the leaves and stops', () => {
    const r = simulateLob(TARGETS[0], 45 * DEG, 0.05);
    expect(r.acorn.done).toBe(true);
    expect(r.acorn.y).toBeCloseTo(ACORN_R, 2);
    expect(r.acorn.x).toBeGreaterThan(0.3);
    expect(r.acorn.x).toBeLessThan(TARGETS[0].x - TARGETS[0].w / 2);
    expect(r.outcome).toBe('miss');
  });

  it('harder throws go further', () => {
    const tg = { ...TARGETS[0], x: 50 };
    const near = simulateLob(tg, 45 * DEG, 0.3).acorn.x;
    const far = simulateLob(tg, 45 * DEG, 0.6).acorn.x;
    expect(far).toBeGreaterThan(near + 1);
  });

  it('dropped in from above, it counts as in', () => {
    const tg = TARGETS[1];
    const r = drop(tg, tg.x, tg.base + tg.h + 1);
    expect(r.events).toContain('in');
    expect(outcome(r.a, tg)).toBe('in');
  });

  it('coming down on the rim, it clonks off', () => {
    const tg = TARGETS[1];
    const rimX = tg.x + (tg.w + tg.mouth) / 4 + 0.01;
    const r = drop(tg, rimX, tg.base + tg.h + 1);
    expect(r.events).toContain('clonk');
    expect(outcome(r.a, tg)).toBe('miss');
  });

  it("it can't get in through the side", () => {
    const tg = TARGETS[1];
    const r = drop(tg, tg.x - 1.2, ACORN_R + 0.01, 4);
    expect(outcome(r.a, tg)).toBe('miss');
    expect(r.a.x).toBeLessThan(tg.x - tg.w / 2);
  });

  it('dropped on the stump, it stays on top', () => {
    const tg = TARGETS.find((t) => t.kind === 'stump')!;
    const r = drop(tg, tg.x + 0.1, tg.base + tg.h + 1.5);
    expect(outcome(r.a, tg)).toBe('on');
  });

  it('a breeze at your back carries it further', () => {
    const calm = { ...TARGETS[0], x: 50, wind: 0 };
    const breezy = { ...calm, wind: 2.5 };
    expect(simulateLob(breezy, 45 * DEG, 0.6).acorn.x).toBeGreaterThan(simulateLob(calm, 45 * DEG, 0.6).acorn.x + 0.1);
  });

  it('aims are kept forwards and upwards', () => {
    expect(clampAngle(-0.5)).toBeCloseTo(5 * DEG);
    expect(clampAngle(2.5)).toBeCloseTo(85 * DEG);
    expect(clampAngle(-2.5)).toBeCloseTo(5 * DEG);
    expect(clampAngle(0.7)).toBeCloseTo(0.7);
  });

  it('the preview only shows the start of the flight', () => {
    const tg = TARGETS[2];
    const [lo] = WINDOWS[2]!;
    const arc = previewArc(tg, 45 * DEG, lo, 0.28);
    const last = arc[arc.length - 1];
    expect(last.x).toBeLessThan(tg.x * 0.6);
  });

  it('every throw settles in a few seconds', () => {
    const rand = mulberry32(5);
    for (let i = 0; i < 60; i++) {
      const r = simulateLob(TARGETS[i % TARGETS.length], rand() * 1.6, rand());
      expect(r.acorn.done).toBe(true);
      expect(r.acorn.t).toBeLessThan(6);
    }
  });
});

describe('acorn pitch targets and scoring', () => {
  it('scores 3, 2, 1 for the first, second and third acorn', () => {
    expect([1, 2, 3, 4].map(pointsFor)).toEqual([3, 2, 1, 0]);
    expect(MAX_POINTS).toBe(18);
  });

  it('every target can be hit with a sensible lob, with room for a thumb', () => {
    WINDOWS.forEach((w) => {
      expect(w).not.toBeNull();
      // At least ~6 px of pull on a phone (a ~220 px full pull).
      expect((w![1] - w![0]) * 220).toBeGreaterThan(6);
    });
  });

  it('they get harder: further away and smaller windows', () => {
    for (let i = 1; i < TARGETS.length; i++) expect(TARGETS[i].x).toBeGreaterThan(TARGETS[i - 1].x);
    const width = WINDOWS.map((w) => w![1] - w![0]);
    expect(width[0]).toBeGreaterThan(width[width.length - 1] * 2);
    expect(TARGETS.slice(3).some((t) => t.wind !== 0)).toBe(true);
  });

  it('a steady thrower reaches the goal of 14 most of the time', () => {
    const rand = mulberry32(11);
    const scores = Array.from({ length: 24 }, () => play(rand, [8, 5, 4]));
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(mean).toBeGreaterThanOrEqual(14);
    expect(scores.filter((s) => s >= 14).length).toBeGreaterThan(scores.length * 0.7);
  });

  it("a sloppy thrower doesn't, and a perfect one can't beat 18", () => {
    const rand = mulberry32(12);
    const sloppy = Array.from({ length: 16 }, () => play(rand, [25, 20, 16]));
    expect(sloppy.reduce((a, b) => a + b, 0) / sloppy.length).toBeLessThan(14);
    expect(play(rand, [0, 0, 0])).toBe(18);
  });

  it('flinging acorns about at random gets nowhere near the goal', () => {
    const rand = mulberry32(3);
    for (let k = 0; k < 20; k++) {
      let total = 0;
      for (const tg of TARGETS) {
        for (let n = 1; n <= ACORNS_PER_TARGET; n++) {
          if (simulateLob(tg, (10 + rand() * 75) * DEG, rand()).outcome !== 'miss') {
            total += pointsFor(n);
            break;
          }
        }
      }
      expect(total).toBeLessThan(14);
    }
  });
});
