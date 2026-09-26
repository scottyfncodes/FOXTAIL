// Putt-putt on the living-room mat: a nine-hole course laid out with
// whatever was lying around the house — a mug, a slipper, a couple of
// books, and the cat, who got there first.
//
// Pure simulation, no DOM: the course is in "mat units" (the mat turned
// lengthwise, tee at the bottom, cup at the top), and the UI just steps it
// and draws it.

import type { PuttingRecord } from '../state';

export const COURSE_W = 3.6;
export const COURSE_L = 9;
export const BALL_R = 0.1;
export const CUP_R = 0.25;
/** Rolling resistance, units/s². */
export const ROLL = 1.3;
/** The hardest putt, units/s. */
export const MAX_SPEED = 5.4;
/** Faster than this over the cup and it lips out. */
export const CAPTURE_SPEED = 2.5;
/** Near the cup a slow ball is drawn in, like the lip of a real hole, units/s². */
const CUP_PULL = 2.2;
/** How far out that pull reaches, as a multiple of the cup's radius. */
const CUP_PULL_REACH = 2.2;
/** Give up on a hole after this many strokes. */
export const STROKE_LIMIT = 6;
const STOP_SPEED = 0.06;
const WALL_BOUNCE = 0.7;
const OBSTACLE_BOUNCE = 0.55;

export type ObstacleKind = 'mug' | 'book' | 'slipper' | 'cat';

export interface CircleObstacle {
  shape: 'circle';
  kind: ObstacleKind;
  x: number;
  y: number;
  r: number;
}

export interface RectObstacle {
  shape: 'rect';
  kind: ObstacleKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Obstacle = CircleObstacle | RectObstacle;

export interface Hole {
  id: string;
  name: string;
  par: number;
  tee: { x: number; y: number };
  cup: { x: number; y: number };
  /** The mat's lean: a constant pull on the ball, units/s² (kept below ROLL so a ball can stop). */
  slope: { x: number; y: number };
  obstacles: Obstacle[];
}

// The course is drawn a little wider than the real mat, so it plays well on a
// phone. It starts gentle and saves the tricky ones for the back nine.
export const COURSE: Hole[] = [
  {
    id: 'hallway',
    name: 'The Hallway Straight',
    par: 2,
    tee: { x: 1.8, y: 8.1 },
    cup: { x: 1.8, y: 1.2 },
    slope: { x: 0, y: 0 },
    obstacles: [],
  },
  {
    id: 'rug',
    name: 'Rug Run',
    par: 2,
    tee: { x: 0.8, y: 8.1 },
    cup: { x: 2.7, y: 1.4 },
    slope: { x: 0, y: 0 },
    obstacles: [],
  },
  {
    id: 'mug',
    name: 'Around the Mug',
    par: 2,
    tee: { x: 1.8, y: 8.1 },
    cup: { x: 1.8, y: 1.15 },
    slope: { x: 0, y: 0 },
    obstacles: [{ shape: 'circle', kind: 'mug', x: 1.8, y: 4.4, r: 0.36 }],
  },
  {
    id: 'uphill',
    name: 'Uphill Lie',
    par: 2,
    tee: { x: 1.0, y: 8.1 },
    cup: { x: 2.6, y: 1.5 },
    // The far end of the mat is propped on a paperback: everything rolls back toward the tee.
    slope: { x: 0, y: 0.28 },
    obstacles: [],
  },
  {
    id: 'chicane',
    name: 'Coaster Chicane',
    par: 3,
    tee: { x: 1.8, y: 8.1 },
    cup: { x: 1.8, y: 1.2 },
    slope: { x: 0, y: 0 },
    obstacles: [
      { shape: 'circle', kind: 'mug', x: 1.15, y: 5.6, r: 0.3 },
      { shape: 'circle', kind: 'mug', x: 2.45, y: 3.4, r: 0.3 },
    ],
  },
  {
    id: 'slipper',
    name: 'Slipper Dogleg',
    par: 3,
    tee: { x: 2.8, y: 8.25 },
    cup: { x: 0.75, y: 1.05 },
    slope: { x: 0, y: 0 },
    obstacles: [
      { shape: 'rect', kind: 'slipper', x: 0, y: 4.0, w: 2.0, h: 0.42 },
      { shape: 'rect', kind: 'book', x: 1.75, y: 6.2, w: 1.85, h: 0.38 },
    ],
  },
  {
    id: 'gate',
    name: 'The Book Gate',
    par: 3,
    tee: { x: 1.8, y: 8.1 },
    cup: { x: 1.1, y: 1.2 },
    // …and the floor isn't quite level either.
    slope: { x: 0.14, y: 0 },
    obstacles: [
      { shape: 'rect', kind: 'book', x: 0, y: 4.5, w: 1.3, h: 0.38 },
      { shape: 'rect', kind: 'book', x: 2.35, y: 4.5, w: 1.25, h: 0.38 },
    ],
  },
  {
    id: 'cat',
    name: 'Ranger’s Nap',
    par: 3,
    tee: { x: 1.8, y: 8.1 },
    cup: { x: 1.8, y: 1.2 },
    slope: { x: 0, y: 0 },
    obstacles: [
      { shape: 'circle', kind: 'cat', x: 1.8, y: 3.0, r: 0.6 },
      { shape: 'circle', kind: 'mug', x: 0.6, y: 5.55, r: 0.3 },
    ],
  },
  {
    id: 'nightcap',
    name: 'Nightcap',
    par: 3,
    tee: { x: 1.8, y: 8.1 },
    cup: { x: 1.8, y: 1.3 },
    slope: { x: 0, y: 0 },
    // Someone left their tea right in front of the hole. Go round, or bank it.
    obstacles: [
      { shape: 'circle', kind: 'mug', x: 1.8, y: 2.7, r: 0.34 },
      { shape: 'rect', kind: 'slipper', x: 0, y: 5.6, w: 1.1, h: 0.4 },
    ],
  },
];

export const COURSE_PAR = COURSE.reduce((s, h) => s + h.par, 0);

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export type BallEvent = 'wall' | 'hit' | 'lip' | 'sunk' | 'stopped';

export function ballMoving(b: Ball): boolean {
  return b.vx !== 0 || b.vy !== 0;
}

/** Strikes the ball: `power` 0..1, `angle` the direction of travel in radians (0 = right, −π/2 = up the mat). */
export function strike(ball: Ball, angle: number, power: number) {
  const p = Math.max(0, Math.min(1, power));
  // A touch of curve on power so short putts are easy to judge.
  const speed = MAX_SPEED * (0.12 + 0.88 * p * p);
  ball.vx = Math.cos(angle) * speed;
  ball.vy = Math.sin(angle) * speed;
}

function bounceOff(ball: Ball, nx: number, ny: number, k: number) {
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn >= 0) return false;
  ball.vx -= (1 + k) * vn * nx;
  ball.vy -= (1 + k) * vn * ny;
  return true;
}

/** Advances the ball by `dt` seconds; returns what happened, if anything. Call with small steps. */
export function stepBall(ball: Ball, hole: Hole, dt: number): BallEvent | null {
  if (!ballMoving(ball)) return null;
  let event: BallEvent | null = null;

  const speed = Math.hypot(ball.vx, ball.vy);
  const slope = hole.slope;
  if (speed < STOP_SPEED && Math.hypot(slope.x, slope.y) < ROLL) {
    ball.vx = 0;
    ball.vy = 0;
    return 'stopped';
  }
  // Rolling resistance against the direction of travel, plus the mat's lean.
  const drag = Math.min(speed, ROLL * dt);
  const wasOverCup = Math.hypot(ball.x - hole.cup.x, ball.y - hole.cup.y) < CUP_R;
  ball.vx += (-ball.vx / speed) * drag + slope.x * dt;
  ball.vy += (-ball.vy / speed) * drag + slope.y * dt;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // The cup.
  const dxc = ball.x - hole.cup.x;
  const dyc = ball.y - hole.cup.y;
  const dc = Math.hypot(dxc, dyc);
  // A slow ball near the hole is drawn toward it: a putt that's nearly there drops.
  if (dc > 1e-6 && dc < CUP_R * CUP_PULL_REACH && Math.hypot(ball.vx, ball.vy) < CAPTURE_SPEED) {
    ball.vx -= (dxc / dc) * CUP_PULL * dt;
    ball.vy -= (dyc / dc) * CUP_PULL * dt;
  }
  if (dc < CUP_R) {
    const v = Math.hypot(ball.vx, ball.vy);
    if (v < CAPTURE_SPEED) {
      ball.x = hole.cup.x;
      ball.y = hole.cup.y;
      ball.vx = 0;
      ball.vy = 0;
      return 'sunk';
    }
    // Too hot: as it arrives it catches the lip, loses a little pace and kicks off to one side.
    if (!wasOverCup) {
      const nx = dxc / dc;
      const ny = dyc / dc;
      const tangential = ball.vx * -ny + ball.vy * nx;
      ball.vx = ball.vx * 0.8 + -ny * tangential * 0.3;
      ball.vy = ball.vy * 0.8 + nx * tangential * 0.3;
      event = 'lip';
    }
  }

  // The mat's wooden edges.
  if (ball.x < BALL_R) {
    ball.x = BALL_R;
    if (bounceOff(ball, 1, 0, WALL_BOUNCE)) event = event ?? 'wall';
  } else if (ball.x > COURSE_W - BALL_R) {
    ball.x = COURSE_W - BALL_R;
    if (bounceOff(ball, -1, 0, WALL_BOUNCE)) event = event ?? 'wall';
  }
  if (ball.y < BALL_R) {
    ball.y = BALL_R;
    if (bounceOff(ball, 0, 1, WALL_BOUNCE)) event = event ?? 'wall';
  } else if (ball.y > COURSE_L - BALL_R) {
    ball.y = COURSE_L - BALL_R;
    if (bounceOff(ball, 0, -1, WALL_BOUNCE)) event = event ?? 'wall';
  }

  for (const o of hole.obstacles) {
    let nx: number;
    let ny: number;
    let pen: number;
    if (o.shape === 'circle') {
      const dx = ball.x - o.x;
      const dy = ball.y - o.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      pen = o.r + BALL_R - d;
      nx = dx / d;
      ny = dy / d;
    } else {
      const cx = Math.max(o.x, Math.min(ball.x, o.x + o.w));
      const cy = Math.max(o.y, Math.min(ball.y, o.y + o.h));
      const dx = ball.x - cx;
      const dy = ball.y - cy;
      const d = Math.hypot(dx, dy);
      if (d > 1e-6) {
        pen = BALL_R - d;
        nx = dx / d;
        ny = dy / d;
      } else {
        // Centre inside the rect (a very fast ball): push out the nearest side.
        const sides = [
          { pen: ball.x - o.x, nx: -1, ny: 0 },
          { pen: o.x + o.w - ball.x, nx: 1, ny: 0 },
          { pen: ball.y - o.y, nx: 0, ny: -1 },
          { pen: o.y + o.h - ball.y, nx: 0, ny: 1 },
        ].sort((a, b) => a.pen - b.pen)[0];
        pen = sides.pen + BALL_R;
        nx = sides.nx;
        ny = sides.ny;
      }
    }
    if (pen > 0) {
      ball.x += nx * pen;
      ball.y += ny * pen;
      if (bounceOff(ball, nx, ny, OBSTACLE_BOUNCE)) event = event ?? 'hit';
    }
  }
  return event;
}

/** Simulates a putt to rest (or the cup), for tests and aim previews. */
export function simulatePutt(hole: Hole, from: { x: number; y: number }, angle: number, power: number, maxSeconds = 20): { ball: Ball; sunk: boolean; events: BallEvent[] } {
  const ball: Ball = { x: from.x, y: from.y, vx: 0, vy: 0 };
  strike(ball, angle, power);
  const events: BallEvent[] = [];
  const dt = 1 / 240;
  for (let t = 0; t < maxSeconds && ballMoving(ball); t += dt) {
    const e = stepBall(ball, hole, dt);
    if (e) events.push(e);
    if (e === 'sunk') return { ball, sunk: true, events };
  }
  return { ball, sunk: false, events };
}

/**
 * Where a putt would roll, up to its first bounce (or a short way, whichever
 * comes first): the faint guide drawn while aiming. It never gives away the
 * whole putt, just the line.
 */
export function previewPath(hole: Hole, from: { x: number; y: number }, angle: number, power: number, maxLength = 3.2): { x: number; y: number }[] {
  const ball: Ball = { x: from.x, y: from.y, vx: 0, vy: 0 };
  strike(ball, angle, power);
  const pts = [{ x: ball.x, y: ball.y }];
  const dt = 1 / 120;
  let travelled = 0;
  for (let t = 0; t < 6 && ballMoving(ball) && travelled < maxLength; t += dt) {
    const px = ball.x;
    const py = ball.y;
    const e = stepBall(ball, hole, dt);
    travelled += Math.hypot(ball.x - px, ball.y - py);
    if (Math.round(t / dt) % 4 === 0) pts.push({ x: ball.x, y: ball.y });
    if (e === 'wall' || e === 'hit' || e === 'sunk' || e === 'lip') break;
  }
  pts.push({ x: ball.x, y: ball.y });
  return pts;
}

/** Golf's names for a score against par. */
export function scoreName(strokes: number, par: number): string {
  if (strokes === 1) return 'Hole in one!';
  const d = strokes - par;
  if (d <= -2) return 'Eagle!';
  if (d === -1) return 'Birdie!';
  if (d === 0) return 'Par.';
  if (d === 1) return 'Bogey.';
  if (d === 2) return 'Double bogey.';
  return `${d} over.`;
}

/** “+2”, “−1”, “E”. */
export function toPar(strokes: number, par: number): string {
  const d = strokes - par;
  return d === 0 ? 'E' : d > 0 ? `+${d}` : `−${-d}`;
}

/** Coins for the first hole in one on each hole. */
export const ACE_REWARD = 10;

/** Notes an ace; true (and a reward) only the first time on this hole. */
export function recordAce(rec: PuttingRecord, holeId: string): boolean {
  if (rec.aces.includes(holeId)) return false;
  rec.aces.push(holeId);
  return true;
}

/** The best round on the course as it is now (a best from an older, shorter course doesn't count). */
export function bestRound(rec: PuttingRecord): number | null {
  return rec.holes === COURSE.length ? rec.best : null;
}

/** Notes a finished round; true if it's a new best. */
export function recordRound(rec: PuttingRecord, total: number): boolean {
  rec.rounds += 1;
  if (rec.holes !== COURSE.length) {
    rec.holes = COURSE.length;
    rec.best = null;
  }
  if (rec.best === null || total < rec.best) {
    rec.best = total;
    return true;
  }
  return false;
}
