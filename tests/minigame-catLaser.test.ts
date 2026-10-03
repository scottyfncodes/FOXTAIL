import { describe, it, expect } from 'vitest';
import {
  COUCH,
  ROOM_H,
  ROOM_W,
  SESSION_TIME,
  STEP,
  createLaser,
  inCouch,
  setPointer,
  stepLaser,
  type LaserGame,
  type Pt,
} from '../src/game/systems/minigames/catLaser';
import { mulberry32 } from '../src/game/engine/Random';

/** A hand on the pointer: something that decides where to aim each step (null: let go). */
type Hand = (g: LaserGame, dt: number) => Pt | null;

function play(seed: number, hand: Hand): LaserGame {
  const g = createLaser(seed);
  let guard = 0;
  while (!g.over && guard++ < 100000) {
    setPointer(g, hand(g, STEP));
    stepLaser(g, STEP);
  }
  return g;
}

/** Moves a point toward a target at a steady hand speed. */
function toward(p: Pt, q: Pt, speed: number, dt: number): Pt {
  const d = Math.hypot(q.x - p.x, q.y - p.y);
  if (d <= speed * dt) return { ...q };
  return { x: p.x + ((q.x - p.x) / d) * speed * dt, y: p.y + ((q.y - p.y) / d) * speed * dt };
}

/**
 * A thoughtful player: darts the dot to a spot a little way from Ranger,
 * stops it there, and holds still while he wiggles and leaps. After he
 * lands, a new spot.
 */
function thoughtful(seed: number): Hand {
  const r = mulberry32(seed * 7 + 1);
  let aim: Pt | null = null;
  let goal: Pt | null = null;
  let heldFor = 0;
  let lastMode = '';
  const newGoal = (g: LaserGame) => {
    for (let i = 0; i < 20; i++) {
      const a = r() * Math.PI * 2;
      const d = 1.1 + r() * 0.6;
      const p = { x: g.cat.x + Math.cos(a) * d, y: g.cat.y + Math.sin(a) * d };
      if (p.x > 0.4 && p.x < ROOM_W - 0.4 && p.y > 0.4 && p.y < ROOM_H - 0.4 && !inCouch(p)) return p;
    }
    return { x: ROOM_W / 2, y: ROOM_H / 2 };
  };
  return (g, dt) => {
    const m = g.cat.mode;
    if (!aim) {
      aim = newGoal(g);
      goal = aim;
    }
    if (m === 'wiggle' || m === 'pounce') return aim;
    const landed = lastMode === 'pounce' || (m !== lastMode && m === 'watch' && lastMode !== 'stalk');
    lastMode = m;
    if (landed) {
      goal = newGoal(g);
      heldFor = 0;
    }
    if (goal) {
      aim = toward(aim, goal, 3.5, dt);
      if (aim.x === goal.x && aim.y === goal.y) goal = null;
    } else {
      heldFor += dt;
      // Held long enough with nothing happening: a little dart to wake it up.
      if (heldFor > 1.4) {
        goal = newGoal(g);
        heldFor = 0;
      }
    }
    return aim;
  };
}

/** Waves it about the room as fast as a wrist will go. */
function flicker(seed: number): Hand {
  const r = mulberry32(seed);
  let aim: Pt = { x: 3, y: 4 };
  let goal: Pt = { x: 1, y: 6 };
  return (_g, dt) => {
    aim = toward(aim, goal, 14, dt);
    if (aim.x === goal.x && aim.y === goal.y) goal = { x: r() * ROOM_W, y: r() * ROOM_H };
    return aim;
  };
}

/** Points it somewhere and leaves it there, now and then picking somewhere else. */
function parker(seed: number): Hand {
  const r = mulberry32(seed);
  let aim: Pt = { x: r() * ROOM_W, y: r() * ROOM_H };
  let t = 0;
  return (_g, dt) => {
    t += dt;
    if (t > 6) {
      t = 0;
      aim = { x: r() * ROOM_W, y: r() * ROOM_H };
    }
    return aim;
  };
}

/** Wanders it about at random, not watching the cat at all. */
function aimless(seed: number): Hand {
  const r = mulberry32(seed);
  let aim: Pt = { x: r() * ROOM_W, y: r() * ROOM_H };
  let goal: Pt = { x: r() * ROOM_W, y: r() * ROOM_H };
  let speed = 2;
  let off = 0;
  let pause = 0;
  return (_g, dt) => {
    if (off > 0) {
      off -= dt;
      return null;
    }
    if (pause > 0) {
      pause -= dt;
      return aim;
    }
    aim = toward(aim, goal, speed, dt);
    if (aim.x === goal.x && aim.y === goal.y) {
      goal = { x: r() * ROOM_W, y: r() * ROOM_H };
      speed = 1 + r() * 10;
      pause = r() < 0.5 ? r() * 2 : 0;
      if (r() < 0.15) off = r() * 2;
    }
    return aim;
  };
}

describe('cat laser: the dot', () => {
  it('lags the hand, trembles a little, and goes off when let go', () => {
    const g = createLaser(1);
    setPointer(g, { x: 3, y: 4 });
    stepLaser(g, STEP);
    expect(g.on).toBe(true);
    setPointer(g, { x: 5, y: 4 });
    stepLaser(g, STEP);
    expect(g.base.x).toBeGreaterThan(3);
    expect(g.base.x).toBeLessThan(5);
    for (let i = 0; i < 120; i++) stepLaser(g, STEP);
    expect(g.base.x).toBeCloseTo(5, 2);
    expect(Math.hypot(g.dot.x - g.base.x, g.dot.y - g.base.y)).toBeLessThan(0.06);
    setPointer(g, null);
    stepLaser(g, STEP);
    expect(g.on).toBe(false);
  });

  it('hides behind the couch, and is clamped into the room', () => {
    const g = createLaser(1);
    setPointer(g, { x: COUCH.w / 2, y: COUCH.h / 2 });
    stepLaser(g, STEP);
    expect(g.hidden).toBe(true);
    setPointer(g, { x: -5, y: 99 });
    expect(g.pointer!.x).toBeGreaterThan(0);
    expect(g.pointer!.y).toBeLessThan(ROOM_H);
  });

  it('peekaboo from behind the couch winds him up', () => {
    const g = createLaser(3);
    setPointer(g, { x: 1, y: 0.7 });
    for (let i = 0; i < 120; i++) stepLaser(g, STEP);
    const before = g.interest;
    // Edging out from under it, at an easy hand speed.
    for (let i = 0; i < 60; i++) {
      setPointer(g, { x: 1 + i * 0.03, y: 0.7 + i * 0.02 });
      stepLaser(g, STEP);
    }
    expect(g.interest).toBeGreaterThan(before + 0.1);
  });

  it('a dot waved about wildly bores him; stop-and-go near him interests him', () => {
    const wild = play(5, flicker(5));
    expect(wild.interest).toBeLessThan(0.3);
    const g = createLaser(5);
    g.interest = 0.3;
    // A dart near him, then a stop.
    let aim = { x: g.cat.x + 1.5, y: g.cat.y };
    for (let i = 0; i < 60; i++) {
      aim = { x: aim.x, y: aim.y - 0.02 };
      setPointer(g, aim);
      stepLaser(g, STEP);
    }
    for (let i = 0; i < 30; i++) stepLaser(g, STEP);
    expect(g.interest).toBeGreaterThan(0.4);
  });
});

describe('cat laser: Ranger', () => {
  it('stalks, wiggles, pounces and catches a dot held still just in front of him', () => {
    const g = createLaser(11);
    g.interest = 0.9;
    const seen = new Set<string>();
    const aim = { x: g.cat.x, y: g.cat.y - 1.3 };
    for (let i = 0; i < 120 * 8 && g.catches === 0; i++) {
      // A little dart first, then still.
      setPointer(g, i < 30 ? { x: aim.x + 0.4 - i * 0.013, y: aim.y } : aim);
      stepLaser(g, STEP);
      seen.add(g.cat.mode);
    }
    expect(seen.has('stalk') || seen.has('wiggle')).toBe(true);
    expect(seen.has('pounce')).toBe(true);
    expect(g.catches).toBeGreaterThan(0);
    expect(g.cat.mode).toBe('caught');
  });

  it('misses when the dot is whisked away mid-leap, and skids', () => {
    const g = createLaser(12);
    g.interest = 0.9;
    const aim = { x: g.cat.x, y: g.cat.y - 1.3 };
    let missed = false;
    for (let i = 0; i < 120 * 10 && !missed; i++) {
      const p = g.cat.mode === 'pounce' ? { x: 0.5, y: ROOM_H - 0.5 } : i < 30 ? { x: aim.x + 0.4 - i * 0.013, y: aim.y } : aim;
      setPointer(g, p);
      stepLaser(g, STEP);
      if (g.events.includes('miss')) missed = true;
      g.events.length = 0;
    }
    expect(missed).toBe(true);
    expect(g.catches).toBe(0);
  });

  it('looks about for it when it goes off, then stares at the wall', () => {
    const g = createLaser(2);
    setPointer(g, null);
    for (let i = 0; i < 120 * 4; i++) stepLaser(g, STEP);
    expect(g.cat.mode).toBe('stare');
  });

  it('stays in the room and out from under the couch', () => {
    for (const seed of [1, 2, 3, 4]) {
      const g = createLaser(seed);
      const hand = aimless(seed);
      while (!g.over) {
        setPointer(g, hand(g, STEP));
        stepLaser(g, STEP);
        expect(g.cat.x).toBeGreaterThanOrEqual(0);
        expect(g.cat.x).toBeLessThanOrEqual(ROOM_W);
        expect(g.cat.y).toBeGreaterThanOrEqual(0);
        expect(g.cat.y).toBeLessThanOrEqual(ROOM_H);
        if (g.cat.mode !== 'pounce') expect(inCouch(g.cat)).toBe(false);
      }
    }
  });

  it('gets distracted now and then, more when bored', () => {
    const whims = (hand: (s: number) => Hand) => {
      let n = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const g = createLaser(seed);
        const h = hand(seed);
        while (!g.over) {
          setPointer(g, h(g, STEP));
          stepLaser(g, STEP);
          for (const e of g.events) if (['groom', 'moth', 'stare', 'zoomies', 'flop'].includes(e)) n++;
          g.events.length = 0;
        }
      }
      return n;
    };
    expect(whims(thoughtful)).toBeGreaterThan(0);
    expect(whims(parker)).toBeGreaterThan(whims(thoughtful));
  });
});

describe('cat laser: a session', () => {
  it('lasts a minute and ends with him flopped down content', () => {
    const g = play(1, aimless(1));
    expect(g.t).toBeGreaterThanOrEqual(SESSION_TIME);
    expect(g.t).toBeLessThan(SESSION_TIME + 0.1);
    expect(g.cat.mode).toBe('content');
  });

  it('is deterministic for a seed and a hand', () => {
    expect(play(9, thoughtful(9)).catches).toBe(play(9, thoughtful(9)).catches);
  });

  it('a thoughtful player usually reaches the goal of 12', () => {
    const scores: number[] = [];
    for (let seed = 1; seed <= 20; seed++) scores.push(play(seed, thoughtful(seed)).catches);
    const reached = scores.filter((s) => s >= 12).length;
    // eslint-disable-next-line no-console
    console.log('thoughtful', scores.join(' '));
    expect(reached).toBeGreaterThanOrEqual(12);
    expect(Math.max(...scores)).toBeLessThan(24);
  });

  it('an aimless, wild or lazy player does not', () => {
    const run = (hand: (s: number) => Hand) => {
      const s: number[] = [];
      for (let seed = 1; seed <= 20; seed++) s.push(play(seed, hand(seed)).catches);
      return s;
    };
    const a = run(aimless);
    const f = run(flicker);
    const p = run(parker);
    // eslint-disable-next-line no-console
    console.log('aimless', a.join(' '), '| flicker', f.join(' '), '| parker', p.join(' '));
    for (const s of [...a, ...f, ...p]) expect(s).toBeLessThan(12);
  });
});
