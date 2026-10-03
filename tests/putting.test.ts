import { describe, it, expect } from 'vitest';
import {
  COURSE,
  COURSE_L,
  COURSE_W,
  BALL_R,
  CAPTURE_SPEED,
  ROLL,
  STROKE_LIMIT,
  simulatePutt,
  stepBall,
  strike,
  scoreName,
  toPar,
  type Ball,
  type Hole,
} from '../src/game/systems/putting';

/** A patient golfer: tries a fan of putts and takes the one that sinks, or leaves it closest. */
function playHole(hole: Hole): number {
  let at = { ...hole.tee };
  for (let stroke = 1; stroke <= STROKE_LIMIT; stroke++) {
    let best: { d: number; ball: Ball } | null = null;
    for (let a = -Math.PI; a < Math.PI; a += Math.PI / 180) {
      for (let p = 0.05; p <= 1.001; p += 0.025) {
        const r = simulatePutt(hole, at, a, p);
        if (r.sunk) return stroke;
        const d = Math.hypot(r.ball.x - hole.cup.x, r.ball.y - hole.cup.y);
        if (!best || d < best.d) best = { d, ball: r.ball };
      }
    }
    at = { x: best!.ball.x, y: best!.ball.y };
  }
  return STROKE_LIMIT + 1;
}

describe('putt-putt physics', () => {
  it('rolls to a stop on a level mat', () => {
    const hole = COURSE[0];
    const r = simulatePutt(hole, hole.tee, Math.PI / 2, 0.3);
    expect(r.sunk).toBe(false);
    expect(r.ball.vx).toBe(0);
    expect(r.ball.vy).toBe(0);
  });

  it('keeps the ball on the mat, bouncing off the edges', () => {
    const hole = COURSE[0];
    const r = simulatePutt(hole, hole.tee, 0.3, 1);
    expect(r.events).toContain('wall');
    expect(r.ball.x).toBeGreaterThanOrEqual(BALL_R - 1e-9);
    expect(r.ball.x).toBeLessThanOrEqual(COURSE_W - BALL_R + 1e-9);
    expect(r.ball.y).toBeGreaterThanOrEqual(BALL_R - 1e-9);
    expect(r.ball.y).toBeLessThanOrEqual(COURSE_L - BALL_R + 1e-9);
  });

  it('drops a gentle putt into the cup but lips out a screamer', () => {
    const hole = COURSE[0];
    const gentle: Ball = { x: hole.cup.x, y: hole.cup.y + 0.5, vx: 0, vy: -1.0 };
    let e = null;
    for (let i = 0; i < 400 && e !== 'sunk'; i++) e = stepBall(gentle, hole, 1 / 240);
    expect(e).toBe('sunk');

    const hot: Ball = { x: hole.cup.x + 0.08, y: hole.cup.y + 0.5, vx: 0, vy: -(CAPTURE_SPEED + 2.5) };
    const events = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const ev = stepBall(hot, hole, 1 / 240);
      if (ev) events.add(ev);
    }
    expect(events.has('sunk')).toBe(false);
    expect(events.has('lip')).toBe(true);
  });

  it('bounces off whatever is lying on the mat', () => {
    const hole = COURSE.find((h) => h.id === 'mug')!;
    const r = simulatePutt(hole, hole.tee, -Math.PI / 2, 0.9);
    expect(r.events).toContain('hit');
  });

  it('never lets a slope beat friction, so every ball comes to rest', () => {
    for (const hole of COURSE) expect(Math.hypot(hole.slope.x, hole.slope.y)).toBeLessThan(ROLL);
  });

  it('turns the putter into speed along the aim', () => {
    const b: Ball = { x: 1, y: 1, vx: 0, vy: 0 };
    strike(b, -Math.PI / 2, 1);
    expect(b.vx).toBeCloseTo(0, 6);
    expect(b.vy).toBeLessThan(0);
  });
});

describe('the course', () => {
  it('eases in: the front holes are open, the obstacles come later', () => {
    expect(COURSE[0].obstacles).toHaveLength(0);
    expect(COURSE[1].obstacles).toHaveLength(0);
    expect(COURSE[COURSE.length - 1].obstacles.length).toBeGreaterThan(0);
  });

  it('draws a nearly-there putt into the cup', () => {
    const hole = COURSE[0];
    // Rolling slowly, just past the edge of the cup: the lip gathers it in.
    const b: Ball = { x: hole.cup.x + 0.32, y: hole.cup.y + 0.6, vx: 0, vy: -0.95 };
    let e = null;
    for (let i = 0; i < 2000 && e !== 'sunk' && (b.vx !== 0 || b.vy !== 0); i++) e = stepBall(b, hole, 1 / 240);
    expect(e).toBe('sunk');
  });

  it('previews the line only as far as the first bounce', async () => {
    const { previewPath } = await import('../src/game/systems/putting');
    const hole = COURSE.find((h) => h.id === 'mug')!;
    const path = previewPath(hole, hole.tee, -Math.PI / 2, 1);
    const last = path[path.length - 1];
    // Stops at the mug, well short of the cup behind it.
    expect(last.y).toBeGreaterThan(hole.cup.y + 1);
    expect(path.length).toBeGreaterThan(2);
  });

  it('has twelve holes, every one laid out on the mat', () => {
    expect(COURSE).toHaveLength(12);
    expect(new Set(COURSE.map((h) => h.id)).size).toBe(12);
    for (const h of COURSE) {
      for (const p of [h.tee, h.cup]) {
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(COURSE_W);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(COURSE_L);
      }
    }
  });

  it('is playable: every hole can be made in par or better', () => {
    for (const hole of COURSE) expect(playHole(hole), hole.name).toBeLessThanOrEqual(hole.par);
  }, 60_000);

  it('allows a hole in one on the straight first hole', () => {
    expect(playHole(COURSE[0])).toBe(1);
  });

  it('names scores the golf way', () => {
    expect(scoreName(1, 3)).toBe('Hole in one!');
    expect(scoreName(2, 3)).toBe('Birdie!');
    expect(scoreName(3, 3)).toBe('Par.');
    expect(scoreName(4, 3)).toBe('Bogey.');
    expect(toPar(20, 15)).toBe('+5');
    expect(toPar(15, 15)).toBe('E');
  });
});

describe('more to play around', () => {
  it('varies the holes: rough, slick and ramped patches, a tube, and something that moves', () => {
    expect(COURSE.some((h) => h.zones?.some((z) => z.kind === 'rough'))).toBe(true);
    expect(COURSE.some((h) => h.zones?.some((z) => z.kind === 'slick'))).toBe(true);
    expect(COURSE.some((h) => h.zones?.some((z) => z.kind === 'ramp'))).toBe(true);
    expect(COURSE.some((h) => h.tubes?.length)).toBe(true);
    expect(COURSE.some((h) => h.obstacles.some((o) => o.shape === 'circle' && o.swing))).toBe(true);
    // Not every hole tees off from the middle.
    expect(new Set(COURSE.map((h) => h.tee.x)).size).toBeGreaterThan(3);
  });

  it('drags on the bath mat and runs on the magazine', async () => {
    const { ZONE_FRICTION } = await import('../src/game/systems/putting');
    const flat: Hole = { id: 'f', name: 'f', par: 2, tee: { x: 1.8, y: 8.5 }, cup: { x: 1.8, y: -5 }, slope: { x: 0, y: 0 }, obstacles: [] };
    const roll = (kind?: 'rough' | 'slick') => simulatePutt(kind ? { ...flat, zones: [{ kind, x: 0, y: 0, w: 3.6, h: 9 }] } : flat, flat.tee, -Math.PI / 2, 0.45).ball.y;
    expect(ZONE_FRICTION.rough).toBeGreaterThan(1);
    expect(ZONE_FRICTION.slick).toBeLessThan(1);
    // Further up the mat is a smaller y: rough stops it soonest, slick lets it run furthest.
    expect(roll('rough')).toBeGreaterThan(roll());
    expect(roll('slick')).toBeLessThan(roll());
  });

  it('sends the ball through the tube and out of the other end, still rolling', () => {
    const hole = COURSE.find((h) => h.id === 'tunnel')!;
    const tube = hole.tubes![0];
    const from = { x: tube.a.x, y: tube.a.y + 1 };
    const r = simulatePutt(hole, from, -Math.PI / 2, 0.6);
    expect(r.events).toContain('tube');
    // It came out the far side of the book wall.
    expect(r.ball.y).toBeLessThan(4.3);
  });

  it('moves Ranger’s tail across the fairway as time passes', async () => {
    const { obstacleAt } = await import('../src/game/systems/putting');
    const tail = COURSE.find((h) => h.id === 'tail')!.obstacles.find((o) => o.kind === 'tail')!;
    const xs = [0, 0.65, 1.3, 1.95].map((t) => obstacleAt(tail, t).x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1.5);
  });
});

describe('the putting record', () => {
  it('pays for the first ace on each hole only, and keeps the best round', async () => {
    const { recordAce, recordRound } = await import('../src/game/systems/putting');
    const rec = { rounds: 0, best: null as number | null, aces: [] as string[] };
    expect(recordAce(rec, 'hallway')).toBe(true);
    expect(recordAce(rec, 'hallway')).toBe(false);
    expect(recordRound(rec, 18)).toBe(true);
    expect(recordRound(rec, 20)).toBe(false);
    expect(recordRound(rec, 16)).toBe(true);
    expect(rec).toMatchObject({ rounds: 3, best: 16, aces: ['hallway'] });
  });

  it('starts a fresh best when the course grows', async () => {
    const { recordRound, bestRound } = await import('../src/game/systems/putting');
    // A best set on an older course.
    const rec = { rounds: 4, best: 15, aces: ['mug'] as string[] };
    expect(bestRound(rec)).toBeNull();
    expect(recordRound(rec, 26)).toBe(true);
    expect(bestRound(rec)).toBe(26);
    expect(rec.aces).toEqual(['mug']);
  });
});

describe('Ranger’s tail', () => {
  it('is solid all along its length, not just at the tip', () => {
    const hole = COURSE.find((h) => h.id === 'tail')!;
    const tail = hole.obstacles.find((o) => o.kind === 'tail')!;
    if (tail.shape !== 'circle' || !tail.anchor) throw new Error('tail');
    // Struck as the tail sweeps out to its furthest, rolled straight up into the middle of its length.
    const out = tail.x - tail.swing!.dx;
    const midX = (out + tail.anchor.x) / 2;
    const r = simulatePutt(hole, { x: midX, y: 6 }, -Math.PI / 2, 0.8, 20, (tail.swing!.period * 3) / 4 - 0.6);
    expect(r.events).toContain('hit');
    expect(r.ball.y).toBeGreaterThan(tail.y);
  });
});
