import { describe, it, expect } from 'vitest';
import {
  CONE_R,
  GRAVITY,
  POUCH,
  ROUNDS,
  STEP,
  aimGuide,
  launch,
  newCone,
  roundScore,
  simulateShot,
  solids,
  stepCone,
  targetPos,
  type Round,
} from '../src/game/systems/minigames/slingshot';
import { mulberry32 } from '../src/game/engine/Random';

const DEG = Math.PI / 180;

function gauss(rand: () => number): number {
  let u = 0;
  for (let i = 0; i < 6; i++) u += rand();
  return (u - 3) / Math.sqrt(0.5);
}

/** The middle of the widest run of angles, at any of a few stretches, that knocks target `i` at time `t`. */
function aimFor(round: Round, up: boolean[], t: number, i: number): { a: number; p: number; n: number } | null {
  let best: { a: number; p: number; n: number } | null = null;
  for (let p = 0.5; p <= 1.001; p += 0.1) {
    let run: number[] = [];
    let cur: number[] = [];
    for (let a = -6; a <= 40; a += 1) {
      if (simulateShot(round, up.slice(), t, a * DEG, p).hits.includes(i)) cur.push(a);
      else {
        if (cur.length > run.length) run = cur;
        cur = [];
      }
    }
    if (cur.length > run.length) run = cur;
    if (run.length && (!best || run.length > best.n)) best = { a: run[Math.floor(run.length / 2)], p, n: run.length };
  }
  return best;
}

/**
 * A player who lines up on whichever standing target looks easiest, with
 * a wobble of `sa` degrees, `sp` of the stretch and `st` seconds of timing.
 */
function play(rand: () => number, sa: number, sp: number, st: number): { score: number; shots: number } {
  let score = 0;
  let shots = 0;
  for (const round of ROUNDS) {
    const up = round.targets.map(() => true);
    let cones = round.cones;
    let t = 1.5;
    while (cones > 0 && up.some(Boolean)) {
      let pick: { a: number; p: number; n: number } | null = null;
      up.forEach((u, i) => {
        if (!u) return;
        const s = aimFor(round, up, t, i);
        if (s && (!pick || s.n > pick.n)) pick = s;
      });
      const { a, p } = pick ?? { a: 10, p: 0.7 };
      simulateShot(round, up, t + gauss(rand) * st, (a + gauss(rand) * sa) * DEG, p + gauss(rand) * sp);
      cones--;
      shots++;
      t += 2.5 + rand();
    }
    score += roundScore(round, up, cones);
  }
  return { score, shots };
}

describe('slingshot physics', () => {
  it('flies flat and quick, then comes down and stops', () => {
    const round: Round = { name: 'empty', targets: [], cones: 1 };
    const c = newCone();
    launch(c, 0, 1);
    let t = 0;
    while (c.x < 3) {
      stepCone(c, round, [], t, STEP);
      t += STEP;
    }
    // Three metres out, a level shot has barely dropped.
    expect(POUCH.y - c.y).toBeLessThan(0.4);
    const r = simulateShot(round, [], 0, 10 * DEG, 0.3);
    expect(r.cone.done).toBe(true);
    expect(r.cone.y).toBeCloseTo(CONE_R, 2);
    expect(r.cone.t).toBeLessThan(5);
  });

  it('gravity is gentler than a thrown acorn', () => {
    expect(GRAVITY).toBeLessThan(9.8);
  });

  it('a pinecone at a disc knocks it over, and bounces back off it', () => {
    const round = ROUNDS[0];
    const d = round.targets[0];
    const s = aimFor(round, [true, true, true], 0, 0)!;
    const up = [true, true, true];
    const r = simulateShot(round, up, 0, s.a * DEG, s.p);
    expect(r.hits).toContain(0);
    expect(up[0]).toBe(false);
    expect(r.cone.x).toBeLessThan(d.x + 1);
  });

  it("a target that's down can't be knocked again", () => {
    const round = ROUNDS[0];
    const s = aimFor(round, [true, true, true], 0, 0)!;
    const up = [false, true, true];
    expect(simulateShot(round, up, 0, s.a * DEG, s.p).hits).not.toContain(0);
  });

  it('a pinecone at a post clocks off it without knocking anything', () => {
    const round = ROUNDS[0];
    const post = solids(round)[0];
    const c = newCone();
    Object.assign(c, { x: post.x0 - 0.5, y: post.y1 / 2, vx: 6, vy: 0 });
    const events: string[] = [];
    const up = [true, true, true];
    for (let i = 0; i < 2000 && !c.done; i++) {
      const ev = stepCone(c, round, up, i * STEP, STEP);
      if (ev) events.push(ev.kind);
    }
    expect(events).toContain('tock');
    expect(up).toEqual([true, true, true]);
    expect(c.x).toBeLessThan(post.x0);
  });

  it('the duck slides along its rail and the disc swings on its rope', () => {
    const duck = ROUNDS[2].targets.find((d) => d.kind === 'duck')!;
    const xs = [0, 0.5, 1, 1.5, 2].map((t) => targetPos(duck, t).x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.5);
    xs.forEach((x) => expect(Math.abs(x - duck.x)).toBeLessThanOrEqual(duck.slide!.dx + 1e-9));
    const sw = ROUNDS[2].targets.find((d) => d.kind === 'swing')!;
    for (const t of [0, 0.4, 1.1, 2.3]) {
      const p = targetPos(sw, t);
      expect(Math.hypot(p.x - sw.x, p.y - sw.y)).toBeCloseTo(sw.swing!.len, 6);
      expect(p.y).toBeGreaterThan(0.5);
    }
  });

  it('the aim guide is short: just off the fork', () => {
    const g = aimGuide(10 * DEG, 1, 0.1);
    const last = g[g.length - 1];
    expect(last.x - POUCH.x).toBeLessThan(1.6);
  });

  it('every shot settles within a few seconds', () => {
    const rand = mulberry32(2);
    for (let i = 0; i < 40; i++) {
      const round = ROUNDS[i % ROUNDS.length];
      const r = simulateShot(round, round.targets.map(() => true), rand() * 5, (-20 + rand() * 90) * DEG, rand());
      expect(r.cone.done).toBe(true);
      expect(r.cone.t).toBeLessThan(6.01);
    }
  });
});

describe('slingshot rounds and scoring', () => {
  it('each round has its targets and two spare pinecones, and gets busier', () => {
    expect(ROUNDS.length).toBeGreaterThanOrEqual(4);
    for (const r of ROUNDS) expect(r.cones).toBe(r.targets.length + 2);
    expect(ROUNDS[0].targets.every((d) => !d.slide && !d.swing)).toBe(true);
    expect(ROUNDS.slice(2).every((r) => r.targets.some((d) => d.slide || d.swing))).toBe(true);
    expect(ROUNDS[ROUNDS.length - 1].targets.length).toBeGreaterThan(ROUNDS[0].targets.length);
  });

  it('only wooden things: discs, a duck cut-out, a swinging disc and a windmill', () => {
    for (const r of ROUNDS) for (const d of r.targets) expect(['disc', 'small', 'duck', 'swing', 'windmill']).toContain(d.kind);
  });

  it('scores a point a target (two for small or moving ones), and the spares only when cleared', () => {
    const round = ROUNDS[2];
    expect(roundScore(round, [false, true, true], 3)).toBe(1);
    expect(roundScore(round, [false, false, true], 2)).toBe(3);
    expect(roundScore(round, [false, false, false], 2)).toBe(5 + 2);
    expect(roundScore(round, [true, true, true], 5)).toBe(0);
  });

  it('every target can be knocked over from the start, moving ones at any moment', () => {
    for (const round of ROUNDS) {
      round.targets.forEach((d, i) => {
        const times = d.slide || d.swing ? [0.3, 1.1, 1.9, 2.6] : [0];
        for (const t of times) expect(aimFor(round, round.targets.map(() => true), t, i), `${round.name} #${i} at ${t}`).not.toBeNull();
      });
    }
  });

  it('a decent shot reaches 20 most of the time, in a sensible number of shots', () => {
    const rand = mulberry32(21);
    // A few degrees of wobble, a fair bit of stretch, and a fifth of a second either way on the movers.
    const games = Array.from({ length: 5 }, () => play(rand, 3.5, 0.07, 0.2));
    const mean = games.reduce((a, g) => a + g.score, 0) / games.length;
    expect(mean).toBeGreaterThanOrEqual(22);
    expect(games.filter((g) => g.score >= 20).length).toBeGreaterThanOrEqual(4);
    // Sessions are short: never more pinecones than the baskets hold (≈ 2–3 s a shot).
    games.forEach((g) => expect(g.shots).toBeLessThanOrEqual(ROUNDS.reduce((s, r) => s + r.cones, 0)));
  }, 60000);

  it('firing away at random rarely gets to 20', () => {
    const rand = mulberry32(4);
    const totals: number[] = [];
    for (let k = 0; k < 40; k++) {
      let total = 0;
      for (const round of ROUNDS) {
        const up = round.targets.map(() => true);
        let cones = round.cones;
        let t = 1;
        while (cones > 0 && up.some(Boolean)) {
          simulateShot(round, up, t, (-15 + rand() * 65) * DEG, rand());
          cones--;
          t += 2.5;
        }
        total += roundScore(round, up, cones);
      }
      totals.push(total);
    }
    expect(totals.reduce((a, b) => a + b, 0) / totals.length).toBeLessThan(16);
    expect(totals.filter((t) => t >= 20).length).toBeLessThanOrEqual(totals.length * 0.1);
  });
});
