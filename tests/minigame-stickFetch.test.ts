import { describe, it, expect } from 'vitest';
import {
  BUSHES,
  FLAGS,
  HOME,
  LOG,
  PUDDLE,
  STEP,
  STICK_ORDER,
  THROWS,
  createFetch,
  inCreek,
  logDist,
  playSession,
  previewThrow,
  scoreThrow,
  simulateThrow,
  stepFetch,
  throwStick,
  whistle,
  type FetchGame,
  type StickKind,
} from '../src/game/systems/minigames/stickFetch';
import { mulberry32 } from '../src/game/engine/Random';

const UP = Math.PI / 2;

/** Aims straight at the flag and finds the power that lands it closest (ignoring any wander). */
function planAt(kind: StickKind, flag: { x: number; y: number }) {
  const angle = Math.atan2(flag.y, flag.x);
  let best = { power: 1, d: Infinity };
  for (let p = 0.15; p <= 1.0001; p += 0.01) {
    const s = simulateThrow(kind, angle, p, 1);
    const d = Math.hypot(s.x - flag.x, s.y - flag.y);
    if (d < best.d) best = { power: p, d };
  }
  return { kind, angle, power: best.power };
}

/**
 * A decent player: the branch for the near flags (it's proud work), the
 * good stick for the far ones, aimed at the flag — with a human hand's
 * wobble in the angle and the pull.
 */
function decent(seed: number, angleErr: number, powerErr: number) {
  const r = mulberry32(seed * 31 + 7);
  return (g: FetchGame) => {
    const flag = FLAGS[g.n];
    const kind: StickKind = Math.hypot(flag.x, flag.y) < 15 ? 'branch' : 'good';
    const p = planAt(kind, flag);
    return { kind, angle: p.angle + (r() * 2 - 1) * angleErr, power: Math.min(1, p.power + (r() * 2 - 1) * powerErr) };
  };
}

function random(seed: number) {
  const r = mulberry32(seed * 99);
  return () => ({ kind: STICK_ORDER[Math.floor(r() * 3)], angle: UP + (r() - 0.5) * 1.4, power: 0.2 + r() * 0.8 });
}

describe('stick fetch: throwing', () => {
  it('goes further with more pull, and each stick has its own reach', () => {
    for (const k of STICK_ORDER) {
      const near = simulateThrow(k, UP, 0.4, 2);
      const far = simulateThrow(k, UP, 0.8, 2);
      expect(far.y).toBeGreaterThan(near.y);
      expect(near.rest && far.rest).toBe(true);
    }
    const sw = simulateThrow('switch', UP, 0.9, 2).y;
    const good = simulateThrow('good', UP, 0.9, 2).y;
    const branch = simulateThrow('branch', UP, 0.9, 2).y;
    expect(sw).toBeGreaterThan(good);
    expect(good).toBeGreaterThan(branch + 8);
  });

  it('a light switch wanders off its line; a good stick flies true', () => {
    const spread = (k: StickKind) => {
      const xs = [1, 2, 3, 4, 5, 6].map((seed) => simulateThrow(k, UP, 0.75, seed).x);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(spread('switch')).toBeGreaterThan(1.5);
    expect(spread('good')).toBeLessThan(1);
  });

  it('snags in a bush, splashes in the puddle and the creek, and thunks against the log', () => {
    const at = (p: { x: number; y: number }, kind: StickKind = 'good') => {
      const plan = planAt(kind, p);
      return simulateThrow(kind, plan.angle, plan.power, 1);
    };
    expect(at(BUSHES[1]).lie).toBe('bush');
    expect(at(PUDDLE).lie).toBe('puddle');
    expect(simulateThrow('good', Math.atan2(20, 10), 0.85, 1).lie).toBe('creek');
    // Just short of the log's middle, along the ground: it fetches up against it.
    const mid = { x: (LOG.a.x + LOG.b.x) / 2, y: (LOG.a.y + LOG.b.y) / 2 };
    const angle = Math.atan2(mid.y, mid.x);
    const lies = new Set<string>();
    for (let p = 0.7; p < 0.95; p += 0.01) lies.add(simulateThrow('good', angle, p, 1).lie);
    expect(lies.has('log')).toBe(true);
  });

  it('the aiming guide is only the start of the arc', () => {
    const path = previewThrow('good', UP, 0.8, 0.35);
    const end = simulateThrow('good', UP, 0.8, 1);
    expect(path.length).toBeGreaterThan(3);
    expect(path[path.length - 1].y).toBeLessThan(end.y * 0.6);
  });

  it('scores distance, nearness to the flag, a clean landing and a proud branch', () => {
    const flag = { x: 0, y: 20 };
    const onIt = scoreThrow('good', { x: 0.5, y: 20 }, 'grass', flag);
    expect(onIt.accuracy).toBe(15);
    expect(onIt.clean).toBe(3);
    expect(onIt.distPts).toBe(10);
    const wet = scoreThrow('good', { x: 0.5, y: 20 }, 'creek', flag);
    expect(wet.total).toBe(onIt.total - 3);
    const wide = scoreThrow('good', { x: 9, y: 20 }, 'grass', flag);
    expect(wide.accuracy).toBe(0);
    expect(scoreThrow('branch', { x: 0.5, y: 20 }, 'grass', flag).total).toBeGreaterThan(onIt.total);
  });
});

describe('stick fetch: Scout', () => {
  it('runs out, picks it up, brings it back and drops it at his feet', () => {
    const g = createFetch(4);
    throwStick(g, 'good', UP, 0.7);
    const modes = new Set<string>();
    let farthest = 0;
    let t = 0;
    while (g.n === 0 && t < 30) {
      stepFetch(g, STEP);
      t += STEP;
      modes.add(g.scout.mode);
      farthest = Math.max(farthest, g.scout.y);
    }
    expect(g.n).toBe(1);
    expect(farthest).toBeGreaterThan(10);
    for (const m of ['run', 'sniff', 'pickup', 'return', 'drop', 'wag']) expect(modes.has(m)).toBe(true);
    expect(g.scores.length).toBe(1);
    expect(Math.hypot(g.scout.x - HOME.x, g.scout.y - HOME.y)).toBeLessThan(0.5);
    // Brisk: a few seconds there and back.
    expect(t).toBeLessThan(9);
  });

  it('steers round bushes rather than through them', () => {
    const g = createFetch(4);
    // Something the far side of the second bush.
    const b = BUSHES[1];
    const target = { x: b.x + 0.4, y: b.y + 4 };
    const plan = planAt('good', target);
    throwStick(g, 'good', plan.angle, plan.power);
    while (g.n === 0) {
      stepFetch(g, STEP);
      if (g.scout.mode === 'run' || g.scout.mode === 'return') {
        for (const bb of BUSHES) {
          if (g.stick?.lie === 'bush') continue;
          expect(Math.hypot(g.scout.x - bb.x, g.scout.y - bb.y)).toBeGreaterThan(bb.r);
        }
      }
    }
  });

  it('digs a stick out of a bush, shakes off after the puddle, wades the creek and hops the log', () => {
    const seen = (target: { x: number; y: number }, kind: StickKind = 'good') => {
      const g = createFetch(8);
      const plan = planAt(kind, target);
      throwStick(g, kind, plan.angle, plan.power);
      const ev = new Set<string>();
      const modes = new Set<string>();
      let t = 0;
      while (g.n === 0 && t < 40) {
        stepFetch(g, STEP);
        t += STEP;
        for (const e of g.events) ev.add(e);
        g.events.length = 0;
        modes.add(g.scout.mode);
      }
      expect(g.n).toBe(1);
      return { ev, modes, t };
    };
    const bush = seen(BUSHES[1]);
    expect(bush.modes.has('dig')).toBe(true);
    const puddle = seen(PUDDLE);
    expect(puddle.ev.has('puddle')).toBe(true);
    expect(puddle.modes.has('shake')).toBe(true);
    const g = createFetch(8);
    throwStick(g, 'good', Math.atan2(20, 10), 0.85);
    const ev = new Set<string>();
    while (g.n === 0) {
      stepFetch(g, STEP);
      for (const e of g.events) ev.add(e);
      g.events.length = 0;
    }
    expect(ev.has('wade')).toBe(true);
    expect(g.scores[0].lie).toBe('creek');
    const log = seen({ x: -2.4, y: 27 });
    expect(log.ev.has('hop')).toBe(true);
  });

  it('a whistle hurries her along', () => {
    const time = (hurry: boolean) => {
      const g = createFetch(3);
      throwStick(g, 'good', UP, 0.9);
      if (hurry) whistle(g);
      let t = 0;
      while (g.n === 0) {
        stepFetch(g, STEP);
        t += STEP;
      }
      return t;
    };
    expect(time(true)).toBeLessThan(time(false) - 1);
  });

  it('never wanders off the meadow, whatever is thrown', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const g = createFetch(seed);
      const aim = random(seed);
      while (g.phase !== 'done') {
        if (g.phase === 'aim') {
          const a = aim();
          throwStick(g, a.kind, a.angle, a.power);
        }
        stepFetch(g, STEP);
        expect(Math.abs(g.scout.x)).toBeLessThan(12);
        expect(g.scout.y).toBeGreaterThan(-1);
        expect(g.scout.y).toBeLessThan(35);
        if (!inCreek(g.scout)) expect(logDist(g.scout)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('stick fetch: a session', () => {
  it('is five throws, and the fetching is brisk', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const g = playSession(seed, random(seed));
      expect(g.scores.length).toBe(THROWS);
      expect(g.phase).toBe('done');
      // Under ~75 s of fetching, leaving plenty of a 2.5 minute session for aiming.
      expect(g.t).toBeLessThan(75);
    }
  });

  it('a decent player reaches 120; a careless one does not', () => {
    const run = (f: (s: number) => (g: FetchGame) => { kind: StickKind; angle: number; power: number }) => {
      const out: number[] = [];
      for (let seed = 1; seed <= 12; seed++) out.push(playSession(seed, f(seed)).total);
      return out;
    };
    const steady = run((s) => decent(s, 0.04, 0.04));
    const shaky = run((s) => decent(s, 0.12, 0.1));
    const careless = run(random);
    const maxed = run(() => () => ({ kind: 'switch', angle: UP, power: 1 }));
    const maxedGood = run(() => () => ({ kind: 'good', angle: UP, power: 1 }));
    // eslint-disable-next-line no-console
    console.log('steady', steady.join(' '), '| shaky', shaky.join(' '), '| careless', careless.join(' '), '| maxed', maxed.join(' '), '| maxed good', maxedGood.join(' '));
    expect(steady.filter((s) => s >= 120).length).toBeGreaterThanOrEqual(9);
    for (const s of [...careless, ...maxed, ...maxedGood]) expect(s).toBeLessThan(120);
  });
});
