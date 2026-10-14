import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BALL_R,
  COURSE,
  CUP_R,
  ROLL,
  STROKE_LIMIT,
  acesOn,
  courseBest,
  courseRounds,
  holeBest,
  holeL,
  holeW,
  obstacleAt,
  recordCourseRound,
  recordHole,
  simulatePutt,
  stepBall,
  surfaceAt,
  sweepResting,
  type Ball,
  type CapsuleObstacle,
  type Hole,
} from '../src/game/systems/putting';
import { GARDEN_HOLES } from '../src/game/data/gardenCourse';
import { COURSES, GARDEN_COURSE, LIVING_ROOM_COURSE, otherCourse } from '../src/game/systems/puttingCourses';
import { onFairway } from '../src/ui/putting/GardenCourseArt';
import { createNewGame, type PuttingRecord } from '../src/game/state';

/** A patient golfer: tries a fan of putts and takes the one that sinks, or leaves it closest. The creek costs a stroke and a replay. */
function playHole(hole: Hole): number {
  let at = { ...hole.tee };
  let strokes = 0;
  while (strokes < STROKE_LIMIT) {
    strokes++;
    let best: { d: number; ball: Ball } | null = null;
    for (let a = -Math.PI; a < Math.PI; a += Math.PI / 180) {
      for (let p = 0.05; p <= 1.001; p += 0.025) {
        const r = simulatePutt(hole, at, a, p);
        if (r.sunk) return strokes;
        if (r.splashed) continue;
        const d = Math.hypot(r.ball.x - hole.cup.x, r.ball.y - hole.cup.y);
        if (!best || d < best.d) best = { d, ball: r.ball };
      }
    }
    at = { x: best!.ball.x, y: best!.ball.y };
  }
  return STROKE_LIMIT + 1;
}

function roll(hole: Hole, ball: Ball, seconds = 10, t0 = 0) {
  const events: string[] = [];
  for (let t = 0; t < seconds && (ball.vx !== 0 || ball.vy !== 0); t += 1 / 240) {
    const e = stepBall(ball, hole, 1 / 240, t0 + t);
    if (e) events.push(e);
    if (e === 'sunk' || e === 'splash') break;
  }
  return events;
}

const flat = (over: Partial<Hole> = {}): Hole => ({ id: 't', name: 't', par: 2, tee: { x: 2.5, y: 8 }, cup: { x: 2.5, y: -20 }, slope: { x: 0, y: 0 }, obstacles: [], w: 5, l: 9, ...over });

describe('the garden course', () => {
  it('is nine holes with their own names, par 26, every hole id unique across both courses', () => {
    expect(GARDEN_HOLES).toHaveLength(9);
    expect(GARDEN_COURSE.par).toBe(GARDEN_HOLES.reduce((s, h) => s + h.par, 0));
    const ids = COURSES.flatMap((c) => c.holes.map((h) => h.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(GARDEN_HOLES.map((h) => h.name)).size).toBe(9);
    for (const h of GARDEN_HOLES) expect(h.tip?.length).toBeGreaterThan(0);
  });

  it('puts every tee and cup on the fairway, clear of water and anything solid', () => {
    for (const h of GARDEN_HOLES) {
      for (const p of [h.tee, h.cup]) {
        expect(onFairway(h, p.x, p.y), h.id).toBe(true);
        expect(surfaceAt(h, p.x, p.y).water, h.id).toBe(false);
        for (const o of h.obstacles) {
          // The ball sat there can't be inside anything.
          const ball: Ball = { x: p.x, y: p.y, vx: 0.001, vy: 0 };
          stepBall(ball, { ...h, obstacles: [o] }, 1 / 240, 0);
          expect(Math.hypot(ball.x - p.x, ball.y - p.y), `${h.id} ${o.kind}`).toBeLessThan(0.01);
        }
      }
      expect(holeW(h)).toBe(5);
      expect(holeL(h)).toBe(9);
    }
  });

  it('gives each hole something of its own: roots, springy caps, the creek and bridges, a hollow log, banks, a hedgehog, the dell, a swinging branch', () => {
    const all = GARDEN_HOLES;
    const has = (f: (h: Hole) => boolean) => all.some(f);
    expect(has((h) => h.obstacles.some((o) => o.kind === 'root'))).toBe(true);
    expect(has((h) => h.obstacles.some((o) => o.kind === 'toadstool' && (o.bounce ?? 0) > 0.8))).toBe(true);
    expect(has((h) => !!h.zones?.some((z) => z.kind === 'water') && !!h.zones?.some((z) => z.kind === 'bridge'))).toBe(true);
    expect(has((h) => !!h.tubes?.length)).toBe(true);
    expect(has((h) => !!h.zones?.some((z) => z.kind === 'ramp'))).toBe(true);
    expect(has((h) => h.obstacles.some((o) => o.kind === 'hedgehog' && o.shape === 'circle' && !!o.swing))).toBe(true);
    expect(has((h) => !!h.zones?.some((z) => z.kind === 'hill' && (z.pull ?? 0) > 0) && !!h.zones?.some((z) => z.kind === 'hill' && (z.pull ?? 0) < 0))).toBe(true);
    expect(has((h) => h.obstacles.some((o) => o.shape === 'capsule' && !!o.pendulum))).toBe(true);
    // Not one shape of fairway: winding, ovals, a dogleg.
    expect(all.filter((h) => h.boundary).length).toBe(9);
    for (const h of all) expect(Math.hypot(h.slope.x, h.slope.y)).toBeLessThan(ROLL);
  });

  it('is playable: every hole can be made in par or better', () => {
    for (const hole of GARDEN_HOLES) expect(playHole(hole), hole.name).toBeLessThanOrEqual(hole.par);
  }, 120_000);
});

describe('putt-putt physics, outdoors', () => {
  it('loses a ball in the creek, but not one rolled across the bridge', () => {
    const creek = flat({ zones: [{ kind: 'water', x: 0, y: 4, w: 5, h: 1 }, { kind: 'bridge', x: 2.2, y: 3.9, w: 0.6, h: 1.2 }] });
    const wet: Ball = { x: 1.0, y: 7, vx: 0, vy: -4 };
    expect(roll(creek, wet)).toContain('splash');
    expect(wet.vx).toBe(0);
    expect(wet.vy).toBe(0);
    const dry: Ball = { x: 2.5, y: 7, vx: 0, vy: -4 };
    const ev = roll(creek, dry);
    expect(ev).not.toContain('splash');
    expect(dry.y).toBeLessThan(3.9);
  });

  it('turns a ball aside on a mound, and gathers one into a hollow', () => {
    const mound = flat({ zones: [{ kind: 'hill', x: 1.5, y: 3, w: 2, h: 2, pull: 1.2 }] });
    // Struck a little off the crown, it's shed to that side; dead straight, it runs on true.
    const off: Ball = { x: 2.75, y: 7.5, vx: 0, vy: -3.8 };
    roll(mound, off);
    expect(off.x).toBeGreaterThan(3.0);
    const straight: Ball = { x: 2.5, y: 7.5, vx: 0, vy: -3.8 };
    roll(mound, straight);
    expect(Math.abs(straight.x - 2.5)).toBeLessThan(0.01);
    // A dip bends a ball rolling past its side in toward its middle.
    const hollow = flat({ zones: [{ kind: 'hill', x: 1.5, y: 3, w: 2, h: 2, pull: -1.0 }] });
    const b: Ball = { x: 3.0, y: 5.5, vx: 0, vy: -2.4 };
    roll(hollow, b);
    expect(b.x).toBeLessThan(2.85);
  });

  it('bounces off a root lying across the fairway, and springs harder off a toadstool cap', () => {
    const root: CapsuleObstacle = { shape: 'capsule', kind: 'root', a: { x: 0, y: 4 }, b: { x: 5, y: 4 }, r: 0.2 };
    const h = flat({ obstacles: [root] });
    const b: Ball = { x: 2.5, y: 6, vx: 0, vy: -3 };
    expect(roll(h, b)).toContain('hit');
    expect(b.y).toBeGreaterThan(4.2);
    const speedAfter = (bounce: number | undefined) => {
      const hole = flat({ obstacles: [{ shape: 'circle', kind: 'toadstool', x: 2.5, y: 4, r: 0.2, bounce }] });
      const ball: Ball = { x: 2.5, y: 5, vx: 0, vy: -3 };
      for (let i = 0; i < 240; i++) if (stepBall(ball, hole, 1 / 240) === 'hit') break;
      return Math.hypot(ball.vx, ball.vy);
    };
    expect(speedAfter(0.9)).toBeGreaterThan(speedAfter(undefined) * 1.4);
  });

  it('keeps the ball inside a hole’s edging', () => {
    for (const h of GARDEN_HOLES) {
      for (const a of [0.3, 1.1, 2.0, -2.4, -1.2]) {
        const r = simulatePutt(h, h.tee, a, 1);
        if (r.splashed) continue;
        expect(onFairway(h, r.ball.x, r.ball.y), `${h.id} at ${a}`).toBe(true);
      }
    }
  });

  it('a hedgehog trundling into a ball at rest knocks it on; a branch swings', () => {
    const hog = GARDEN_HOLES.find((h) => h.id === 'g-hedgehog')!;
    const o = hog.obstacles.find((x) => x.kind === 'hedgehog')!;
    if (o.shape !== 'circle' || !o.swing) throw new Error('hedgehog');
    // A ball left right in his path, just past the middle of his beat.
    const ball: Ball = { x: o.x + 0.3, y: o.y, vx: 0, vy: 0 };
    let knocked = false;
    for (let t = 0; t < o.swing.period && !knocked; t += 1 / 120) knocked = sweepResting(ball, hog, t) === 'hit';
    expect(knocked).toBe(true);
    expect(ball.vx).toBeGreaterThan(0);
    const home = GARDEN_HOLES.find((h) => h.id === 'g-home')!;
    const br = home.obstacles.find((x) => x.kind === 'branch') as CapsuleObstacle;
    const tips = [0, 1, 2, 3].map((t) => obstacleAt(br, t).b.x);
    expect(Math.max(...tips) - Math.min(...tips)).toBeGreaterThan(0.5);
    // Nothing that stands still ever knocks a resting ball.
    const still: Ball = { x: 2.5, y: 8, vx: 0, vy: 0 };
    expect(sweepResting(still, GARDEN_HOLES[0], 3)).toBeNull();
  });

  it('drops a ball through the middle of the cup that would lip out off the edge', () => {
    const h = flat({ cup: { x: 2.5, y: 3 } });
    const middle: Ball = { x: 2.5, y: 3.6, vx: 0, vy: -2.6 };
    // Just under the speed limit by the time it gets there: dead centre it drops…
    expect(roll(h, middle)).toContain('sunk');
    // …catching the edge at the same pace, it doesn't.
    const edge: Ball = { x: 2.5 + CUP_R * 0.85, y: 3.6, vx: 0, vy: -2.6 };
    const ev = roll(h, edge);
    expect(ev).not.toContain('sunk');
    expect(ev).toContain('lip');
    expect(BALL_R).toBeLessThan(CUP_R);
  });
});

describe('putting records across courses', () => {
  let rec: PuttingRecord;
  beforeEach(() => {
    rec = createNewGame().putting;
  });

  it('keeps the best on each hole, and calls only a real improvement a new best', () => {
    expect(holeBest(rec, 'g-moss')).toBeNull();
    expect(recordHole(rec, 'g-moss', 3)).toEqual({ best: false, first: true, previous: null });
    expect(recordHole(rec, 'g-moss', 4)).toEqual({ best: false, first: false, previous: 3 });
    expect(recordHole(rec, 'g-moss', 2)).toEqual({ best: true, first: false, previous: 3 });
    expect(holeBest(rec, 'g-moss')).toBe(2);
  });

  it('keeps each course’s best round apart', () => {
    expect(recordCourseRound(rec, GARDEN_COURSE, 30)).toBe(true);
    expect(recordCourseRound(rec, GARDEN_COURSE, 33)).toBe(false);
    expect(courseBest(rec, GARDEN_COURSE)).toBe(30);
    expect(courseRounds(rec, GARDEN_COURSE)).toBe(2);
    expect(courseBest(rec, LIVING_ROOM_COURSE)).toBeNull();
    expect(rec.rounds).toBe(0);
    expect(recordCourseRound(rec, LIVING_ROOM_COURSE, 31)).toBe(true);
    expect(courseBest(rec, LIVING_ROOM_COURSE)).toBe(31);
    expect(courseRounds(rec, LIVING_ROOM_COURSE)).toBe(1);
    rec.aces.push('hallway', 'g-root', 'g-log');
    expect(acesOn(rec, LIVING_ROOM_COURSE)).toBe(1);
    expect(acesOn(rec, GARDEN_COURSE)).toBe(2);
    expect(otherCourse(LIVING_ROOM_COURSE)).toBe(GARDEN_COURSE);
    expect(otherCourse(GARDEN_COURSE)).toBe(LIVING_ROOM_COURSE);
  });

  it('plays both courses as nines; the mat’s old twelve-hole best is its own record, not this course’s', () => {
    expect(LIVING_ROOM_COURSE.holes).toBe(COURSE);
    for (const c of COURSES) expect(c.holes).toHaveLength(9);
    expect(LIVING_ROOM_COURSE.recordId).toBe('living-room-9');
    const old = { rounds: 6, best: 30, holes: 12, course: 'living-room-12', aces: ['hallway', 'mug'] };
    expect(courseBest(old, LIVING_ROOM_COURSE)).toBeNull();
    expect(recordCourseRound(old, LIVING_ROOM_COURSE, 25)).toBe(true);
    expect(old).toMatchObject({ rounds: 7, best: 25, holes: 9, course: 'living-room-9' });
    // Aces are kept by hole: one on a hole that's still played still counts.
    expect(acesOn(old, LIVING_ROOM_COURSE)).toBe(1);
  });
});

describe('the putting panel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function makePanel() {
    const noop = () => {};
    const canvas = document.createElement('canvas');
    const ctx = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? canvas : k === 'getTransform' ? () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) : noop), set: () => true });
    vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    const { Game } = await import('../src/game/engine/Game');
    const { PuttingPanel } = await import('../src/ui/PuttingPanel');
    const game = new Game(canvas);
    const panel = new PuttingPanel(game);
    const p = panel as unknown as {
      phase: string;
      hole: number;
      strokes: number[];
      ball: Ball;
      course: { id: string; holes: Hole[] };
      cw: number;
      ch: number;
      update(dt: number): void;
      putt(aim: { angle: number; power: number }): void;
      layout(): void;
      restart(): void;
      onDown(p: { x: number; y: number }): void;
    };
    return { game, panel, p };
  }

  /** Lines the ball up just short of the cup and taps it in, then lets it all play out. */
  function tapIn(p: Awaited<ReturnType<typeof makePanel>>['p']) {
    const h = p.course.holes[p.hole];
    p.ball = { x: h.cup.x, y: h.cup.y + 0.5, vx: 0, vy: 0 };
    p.putt({ angle: -Math.PI / 2, power: 0.36 });
    for (let i = 0; i < 600 && p.phase === 'rolling'; i++) p.update(1 / 60);
    vi.advanceTimersByTime(400);
  }

  it('plays a round on the garden course to the end, keeps its records, and starts again', async () => {
    const { game, panel, p } = await makePanel();
    panel.openCourse('garden');
    p.cw = 360;
    p.ch = 560;
    p.layout();
    const coins = game.state.coins;
    for (let hole = 0; hole < 9; hole++) {
      expect(p.hole).toBe(hole);
      tapIn(p);
      expect(p.phase, `hole ${hole}`).toBe('holed');
      expect(p.strokes[hole]).toBe(1);
      // A tap moves on without waiting.
      p.onDown({ x: 10, y: 10 });
    }
    expect(p.phase).toBe('done');
    const rec = game.state.putting;
    expect(rec.courses?.['garden-9']).toEqual({ rounds: 1, best: 9 });
    expect(rec.holeBests?.['g-dell']).toBe(1);
    expect(acesOn(rec, GARDEN_COURSE)).toBe(9);
    expect(game.state.coins).toBe(coins + 9 * 10);
    // The mat's record is its own.
    expect(rec.rounds).toBe(0);
    // Play again: a fresh round, the record kept.
    p.restart();
    expect(p.phase).toBe('aim');
    expect(p.hole).toBe(0);
    expect(p.strokes).toEqual([0]);
    expect(rec.courses?.['garden-9']?.rounds).toBe(1);
    panel['panel'].close();
  });

  it('puts a ball in the creek back where it was struck, a stroke the worse', async () => {
    const { panel, p } = await makePanel();
    panel.openCourse('garden');
    p.cw = 360;
    p.ch = 560;
    p.layout();
    // The bridge hole, struck well wide of the plank.
    (p as unknown as { hole: number }).hole = 3;
    (panel as unknown as { startHole(): void }).startHole();
    const tee = { ...p.course.holes[3].tee };
    p.putt({ angle: -Math.PI / 2 - 0.25, power: 0.7 });
    for (let i = 0; i < 600 && p.phase === 'rolling'; i++) p.update(1 / 60);
    expect(p.phase).toBe('splash');
    expect(p.strokes[3]).toBe(2);
    vi.advanceTimersByTime(1000);
    expect(p.phase).toBe('aim');
    expect(p.ball).toMatchObject({ x: tee.x, y: tee.y, vx: 0, vy: 0 });
    panel['panel'].close();
  });

  it('never lets a stale timer from one hole move another on', async () => {
    const { panel, p } = await makePanel();
    panel.openCourse('livingRoom');
    p.cw = 360;
    p.ch = 560;
    p.layout();
    tapIn(p);
    expect(p.phase).toBe('holed');
    p.onDown({ x: 1, y: 1 });
    expect(p.hole).toBe(1);
    // The first hole's own "next" timer still fires — and does nothing.
    vi.advanceTimersByTime(3000);
    expect(p.hole).toBe(1);
    expect(p.phase).toBe('aim');
    panel['panel'].close();
  });
});
