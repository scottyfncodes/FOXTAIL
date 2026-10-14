// Putt-putt. Two nine-hole courses share one simulation: the course on
// the living-room mat, laid out with whatever was lying around the house
// (a mug, a slipper, a couple of books, and the cat, who got there first),
// and Scott's nine-hole garden course under the oaks (see data/gardenCourse).
//
// Pure simulation, no DOM: a hole is in "course units" (tee at the bottom,
// cup at the top), and the UI just steps it and draws it. Everything here
// is deterministic, so a putt struck the same way rolls the same way —
// a great shot is earned, never a fluke of the frame rate.

import type { PuttingRecord } from '../state';

/** The living-room mat, turned lengthwise. Garden holes may be wider. */
export const COURSE_W = 3.6;
export const COURSE_L = 9;
export const BALL_R = 0.1;
export const CUP_R = 0.25;
/** Rolling resistance, units/s². */
export const ROLL = 1.3;
/** The hardest putt, units/s. */
export const MAX_SPEED = 5.4;
/** Faster than this over the middle of the cup and it lips out (a ball catching the edge has to be slower still). */
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
/** A fairway's edging (timber or stone along a garden hole's boundary): its half-thickness. */
export const EDGE_R = 0.04;

export type ObstacleKind =
  // The living room.
  | 'mug'
  | 'book'
  | 'slipper'
  | 'cat'
  | 'tail'
  // The garden.
  | 'root'
  | 'stone'
  | 'stump'
  | 'toadstool'
  | 'log'
  | 'rail'
  | 'hedgehog'
  | 'branch'
  | 'fern';

export interface CircleObstacle {
  shape: 'circle';
  kind: ObstacleKind;
  x: number;
  y: number;
  r: number;
  /** It moves: swinging back and forth by (dx, dy) over `period` seconds (Ranger's tail, a hedgehog). */
  swing?: { dx: number; dy: number; period: number; phase?: number };
  /** It's the end of something rooted here (the tail's base, at Ranger): the whole length between is solid too. */
  anchor?: { x: number; y: number };
  /** How lively a bounce off it is (a toadstool's springy cap); defaults to a dead thump. */
  bounce?: number;
}

export interface RectObstacle {
  shape: 'rect';
  kind: ObstacleKind;
  x: number;
  y: number;
  w: number;
  h: number;
  bounce?: number;
}

/**
 * Something long and round lying across the course — a root, a log, a
 * rail, a branch — from `a` to `b`, `r` thick. A branch may swing from `a`
 * like a pendulum, through ±`amp` radians every `period` seconds.
 */
export interface CapsuleObstacle {
  shape: 'capsule';
  kind: ObstacleKind;
  a: { x: number; y: number };
  b: { x: number; y: number };
  r: number;
  pendulum?: { amp: number; period: number; phase?: number };
  bounce?: number;
}

export type Obstacle = CircleObstacle | RectObstacle | CapsuleObstacle;

/**
 * Patches that change how the ball rolls. On the mat: a bath mat (rough —
 * it drags), a glossy magazine (slick — it runs on), or a paperback slid
 * under the mat (a ramp — it leans the ball one way). In the garden: long
 * grass (rough), a flagstone path (slick), a bank (ramp), the creek
 * (water: the ball's lost and comes back with a stroke added), a log
 * bridge over it (safe, whatever's under it), and mounds and hollows
 * (hill: a round rise that sheds the ball, or with a negative pull a dip
 * that gathers it).
 */
export interface Zone {
  kind: 'rough' | 'slick' | 'ramp' | 'water' | 'bridge' | 'hill';
  x: number;
  y: number;
  w: number;
  h: number;
  /** For a ramp: its pull, units/s² (kept below ROLL). */
  slope?: { x: number; y: number };
  /** For a hill: the steepest pull on its flank, units/s²; positive sheds (a mound), negative gathers (a hollow). */
  pull?: number;
  /** Water that's a round pond (the ellipse in its box) rather than a band of creek. Hills are always round. */
  round?: boolean;
}

/** How much a zone multiplies the rolling resistance. */
export const ZONE_FRICTION: Record<Zone['kind'], number> = { rough: 2.6, slick: 0.4, ramp: 1, water: 1, bridge: 1, hill: 1 };

/** A cardboard tube (or a hollow log): a ball rolling into one mouth comes out of the other at the same speed. */
export interface Tube {
  a: { x: number; y: number };
  b: { x: number; y: number };
}
/** How close to a tube's mouth the ball has to roll to go in. */
export const TUBE_R = 0.22;

export interface Hole {
  id: string;
  name: string;
  par: number;
  tee: { x: number; y: number };
  cup: { x: number; y: number };
  /** The course's lean: a constant pull on the ball, units/s² (kept below ROLL so a ball can stop). */
  slope: { x: number; y: number };
  obstacles: Obstacle[];
  zones?: Zone[];
  tubes?: Tube[];
  /** The hole's box, if it isn't the mat's 3.6 × 9. */
  w?: number;
  l?: number;
  /** The fairway's outline, if it isn't the whole box: a closed polygon with edging the ball bounces off. */
  boundary?: { x: number; y: number }[];
  /** A few words on what's special about it, for the hole's title card. */
  tip?: string;
}

export function holeW(h: Hole): number {
  return h.w ?? COURSE_W;
}

export function holeL(h: Hole): number {
  return h.l ?? COURSE_L;
}

/** Where an obstacle is at `t` seconds into the hole (most don't move). */
export function obstacleAt<T extends Obstacle>(o: T, t: number): T {
  if (o.shape === 'circle' && o.swing) {
    const k = Math.sin((t / o.swing.period) * Math.PI * 2 + (o.swing.phase ?? 0));
    return { ...o, x: o.x + o.swing.dx * k, y: o.y + o.swing.dy * k };
  }
  if (o.shape === 'capsule' && o.pendulum) {
    const ang = o.pendulum.amp * Math.sin((t / o.pendulum.period) * Math.PI * 2 + (o.pendulum.phase ?? 0));
    const dx = o.b.x - o.a.x;
    const dy = o.b.y - o.a.y;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    return { ...o, b: { x: o.a.x + dx * c - dy * s, y: o.a.y + dx * s + dy * c } };
  }
  return o;
}

export function obstacleMoves(o: Obstacle): boolean {
  return (o.shape === 'circle' && !!o.swing) || (o.shape === 'capsule' && !!o.pendulum);
}

function inZone(z: Zone, x: number, y: number): boolean {
  if (x < z.x || x > z.x + z.w || y < z.y || y > z.y + z.h) return false;
  // Hills and ponds are round: the ellipse inside their box.
  if (z.kind !== 'hill' && !z.round) return true;
  const rx = z.w / 2;
  const ry = z.h / 2;
  const dx = (x - (z.x + rx)) / rx;
  const dy = (y - (z.y + ry)) / ry;
  return dx * dx + dy * dy <= 1;
}

/** What the ground's like under (x, y): how it drags, which way it leans, and whether it's water. */
export interface Surface {
  roll: number;
  ax: number;
  ay: number;
  water: boolean;
  kind: Zone['kind'] | null;
}

export function surfaceAt(hole: Hole, x: number, y: number): Surface {
  let roll = ROLL;
  let ax = hole.slope.x;
  let ay = hole.slope.y;
  let water = false;
  let bridge = false;
  let kind: Zone['kind'] | null = null;
  let frictionSet = false;
  for (const z of hole.zones ?? []) {
    if (!inZone(z, x, y)) continue;
    if (z.kind === 'bridge') {
      bridge = true;
      kind = 'bridge';
      continue;
    }
    if (z.kind === 'water') {
      water = true;
      kind = kind ?? 'water';
      continue;
    }
    if (z.kind === 'ramp' && z.slope) {
      ax += z.slope.x;
      ay += z.slope.y;
    }
    if (z.kind === 'hill' && z.pull) {
      // A smooth round rise (or dip): flat on top and at its foot, steepest halfway down its flank.
      const rx = z.w / 2;
      const ry = z.h / 2;
      const dx = x - (z.x + rx);
      const dy = y - (z.y + ry);
      const r = Math.hypot(dx / rx, dy / ry);
      const d = Math.hypot(dx, dy);
      if (r < 1 && d > 1e-6) {
        const mag = z.pull * Math.sin(Math.PI * r);
        ax += (dx / d) * mag;
        ay += (dy / d) * mag;
      }
    }
    if (!frictionSet && (z.kind === 'rough' || z.kind === 'slick' || z.kind === 'ramp' || z.kind === 'hill')) {
      roll = ROLL * ZONE_FRICTION[z.kind];
      kind = z.kind;
      frictionSet = z.kind === 'rough' || z.kind === 'slick';
    }
  }
  if (bridge) {
    water = false;
    kind = 'bridge';
  }
  return { roll, ax, ay, water, kind };
}

// The course is drawn a little wider than the real mat, so it plays well on a
// phone. Nine holes: it starts gentle and saves the tricky ones for the back: a
// glossy magazine that doesn't, a paperback ramp under the
// mat, a paper-towel tube to putt through, Ranger, whose tail won't keep still,
// and a bath mat across the last.
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
    id: 'magazine',
    name: 'The Glossy Magazine',
    par: 2,
    tee: { x: 2.8, y: 8.1 },
    cup: { x: 0.9, y: 1.7 },
    slope: { x: 0, y: 0 },
    obstacles: [{ shape: 'circle', kind: 'mug', x: 2.5, y: 4.6, r: 0.3 }],
    // A magazine left open round the cup: hit it like the rest and it runs right on by.
    zones: [{ kind: 'slick', x: 0.1, y: 0.4, w: 2.2, h: 2.9 }],
  },
  {
    id: 'tunnel',
    name: 'Paper-Towel Tunnel',
    par: 3,
    tee: { x: 2.7, y: 8.1 },
    cup: { x: 1.8, y: 1.2 },
    slope: { x: 0, y: 0 },
    // A wall of books right across: the only way through is the tube.
    obstacles: [{ shape: 'rect', kind: 'book', x: 0, y: 4.3, w: 3.6, h: 0.4 }],
    tubes: [{ a: { x: 0.65, y: 5.7 }, b: { x: 2.95, y: 3.2 } }],
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
    id: 'ramp',
    name: 'Paperback Ramp',
    par: 3,
    tee: { x: 1.8, y: 8.1 },
    cup: { x: 1.1, y: 1.2 },
    slope: { x: 0, y: 0 },
    obstacles: [
      { shape: 'rect', kind: 'book', x: 0, y: 4.5, w: 1.3, h: 0.38 },
      { shape: 'rect', kind: 'book', x: 2.35, y: 4.5, w: 1.25, h: 0.38 },
    ],
    // A paperback slid under the mat before the gate: it leans everything to the right.
    zones: [{ kind: 'ramp', x: 0, y: 5.3, w: 3.6, h: 1.9, slope: { x: 0.7, y: 0 } }],
  },
  {
    id: 'tail',
    name: 'Ranger’s Tail',
    par: 3,
    tee: { x: 1.8, y: 8.1 },
    cup: { x: 1.8, y: 1.2 },
    slope: { x: 0, y: 0 },
    obstacles: [
      // He's asleep at the side of the mat, but his tail sweeps right across it.
      { shape: 'circle', kind: 'cat', x: 3.25, y: 3.6, r: 0.55 },
      { shape: 'circle', kind: 'tail', x: 1.85, y: 3.75, r: 0.24, swing: { dx: 1.15, dy: 0, period: 2.6 }, anchor: { x: 3.1, y: 3.7 } },
      { shape: 'circle', kind: 'mug', x: 0.6, y: 5.9, r: 0.3 },
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
  {
    id: 'grandTour',
    name: 'The Grand Tour',
    par: 3,
    tee: { x: 0.6, y: 8.2 },
    cup: { x: 2.9, y: 1.1 },
    slope: { x: 0, y: 0 },
    // Everything at once: a book wall with a gap at the far side, the bath
    // mat beyond it, and the magazine round the cup.
    obstacles: [
      { shape: 'rect', kind: 'book', x: 0, y: 5.0, w: 2.5, h: 0.4 },
      { shape: 'circle', kind: 'mug', x: 1.4, y: 2.9, r: 0.3 },
    ],
    zones: [
      { kind: 'rough', x: 0, y: 3.5, w: 3.6, h: 1.0 },
      { kind: 'slick', x: 1.7, y: 0.3, w: 1.8, h: 2.1 },
    ],
  },
];

/** Which course a best round was set on: a redesigned course starts a fresh record. */
export const COURSE_ID = 'living-room-9';

export const COURSE_PAR = COURSE.reduce((s, h) => s + h.par, 0);

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** The tube mouth it just came out of: it has to roll clear before it can go back in. */
  tubeExit?: { x: number; y: number };
}

export type BallEvent = 'wall' | 'hit' | 'lip' | 'sunk' | 'stopped' | 'tube' | 'splash';

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

/** The point on a segment nearest p, and how far along it is (0 at a, 1 at b). */
function nearestOnSegment(ax: number, ay: number, bx: number, by: number, px: number, py: number) {
  const sx = bx - ax;
  const sy = by - ay;
  const len2 = sx * sx + sy * sy || 1e-9;
  const u = Math.max(0, Math.min(1, ((px - ax) * sx + (py - ay) * sy) / len2));
  return { x: ax + sx * u, y: ay + sy * u, u };
}

/** Where on an obstacle the ball is touching (or nearest), the obstacle's thickness there, and how far along it that is. */
function contactOn(o: Obstacle, px: number, py: number): { x: number; y: number; r: number; u: number } {
  if (o.shape === 'circle') {
    // Anchored (a tail), it's a fat line from the anchor out to the tip.
    if (o.anchor) {
      const q = nearestOnSegment(o.anchor.x, o.anchor.y, o.x, o.y, px, py);
      return { x: q.x, y: q.y, r: q.u >= 1 ? o.r : o.r * 0.7, u: q.u };
    }
    return { x: o.x, y: o.y, r: o.r, u: 1 };
  }
  if (o.shape === 'capsule') {
    const q = nearestOnSegment(o.a.x, o.a.y, o.b.x, o.b.y, px, py);
    return { x: q.x, y: q.y, r: o.r, u: q.u };
  }
  return { x: Math.max(o.x, Math.min(px, o.x + o.w)), y: Math.max(o.y, Math.min(py, o.y + o.h)), r: 0, u: 0 };
}

/** The same point `u` along an obstacle (for working out how fast that part of it is moving). */
function pointAlong(o: Obstacle, u: number): { x: number; y: number } {
  if (o.shape === 'circle') {
    if (!o.anchor) return { x: o.x, y: o.y };
    return { x: o.anchor.x + (o.x - o.anchor.x) * u, y: o.anchor.y + (o.y - o.anchor.y) * u };
  }
  if (o.shape === 'capsule') return { x: o.a.x + (o.b.x - o.a.x) * u, y: o.a.y + (o.b.y - o.a.y) * u };
  return { x: o.x, y: o.y };
}

/**
 * Bounces the ball off a surface with outward normal n, moving at (ox, oy)
 * itself (a swishing tail, a swinging branch): only the ball's speed
 * *into* it is turned round, and whatever's moving gives it a push.
 */
function bounceOff(ball: Ball, nx: number, ny: number, k: number, ox = 0, oy = 0): boolean {
  const vn = (ball.vx - ox) * nx + (ball.vy - oy) * ny;
  if (vn >= 0) return false;
  ball.vx -= (1 + k) * vn * nx;
  ball.vy -= (1 + k) * vn * ny;
  return true;
}

/** Pushes the ball out of anything it's overlapping on the course, and bounces it. Returns 'wall' or 'hit' if it bounced. */
function collide(ball: Ball, hole: Hole, t: number): BallEvent | null {
  let event: BallEvent | null = null;
  // A garden hole's edging, all the way round its fairway.
  const edge = hole.boundary;
  if (edge) {
    for (let i = 0; i < edge.length; i++) {
      const p = edge[i];
      const q = edge[(i + 1) % edge.length];
      const c = nearestOnSegment(p.x, p.y, q.x, q.y, ball.x, ball.y);
      const dx = ball.x - c.x;
      const dy = ball.y - c.y;
      const d = Math.hypot(dx, dy) || 1e-9;
      const pen = EDGE_R + BALL_R - d;
      if (pen > 0) {
        ball.x += (dx / d) * pen;
        ball.y += (dy / d) * pen;
        if (bounceOff(ball, dx / d, dy / d, WALL_BOUNCE)) event = event ?? 'wall';
      }
    }
  }
  for (const still of hole.obstacles) {
    const o = obstacleAt(still, t);
    let nx: number;
    let ny: number;
    let pen: number;
    const c = contactOn(o, ball.x, ball.y);
    if (o.shape === 'rect') {
      const dx = ball.x - c.x;
      const dy = ball.y - c.y;
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
    } else {
      const dx = ball.x - c.x;
      const dy = ball.y - c.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      pen = c.r + BALL_R - d;
      nx = dx / d;
      ny = dy / d;
    }
    if (pen > 0) {
      ball.x += nx * pen;
      ball.y += ny * pen;
      // How fast that bit of it is moving, if it moves at all.
      let ox = 0;
      let oy = 0;
      if (obstacleMoves(still)) {
        const h = 1 / 480;
        const now = pointAlong(o, c.u);
        const before = pointAlong(obstacleAt(still, t - h), c.u);
        ox = (now.x - before.x) / h;
        oy = (now.y - before.y) / h;
      }
      if (bounceOff(ball, nx, ny, o.bounce ?? OBSTACLE_BOUNCE, ox, oy)) event = event ?? 'hit';
    }
  }
  return event;
}

/**
 * A ball at rest can still be knocked on by something that moves (a
 * hedgehog trundling into it, a branch swinging through): returns 'hit'
 * if it was, and the ball is rolling again.
 */
export function sweepResting(ball: Ball, hole: Hole, t: number): BallEvent | null {
  if (ballMoving(ball) || !hole.obstacles.some(obstacleMoves)) return null;
  const moving: Hole = { ...hole, boundary: undefined, obstacles: hole.obstacles.filter(obstacleMoves) };
  const e = collide(ball, moving, t);
  return e && ballMoving(ball) ? 'hit' : null;
}

/**
 * Advances the ball by `dt` seconds, `t` seconds into the hole (for
 * anything that moves); returns what happened, if anything. Call with small steps.
 */
export function stepBall(ball: Ball, hole: Hole, dt: number, t = 0): BallEvent | null {
  if (!ballMoving(ball)) return null;
  let event: BallEvent | null = null;

  const speed = Math.hypot(ball.vx, ball.vy);
  const ground = surfaceAt(hole, ball.x, ball.y);
  if (speed < STOP_SPEED && Math.hypot(ground.ax, ground.ay) < ground.roll) {
    ball.vx = 0;
    ball.vy = 0;
    return 'stopped';
  }
  // Rolling resistance against the direction of travel, plus the lean of the ground.
  const drag = Math.min(speed, ground.roll * dt);
  const wasOverCup = Math.hypot(ball.x - hole.cup.x, ball.y - hole.cup.y) < CUP_R;
  ball.vx += (-ball.vx / speed) * drag + ground.ax * dt;
  ball.vy += (-ball.vy / speed) * drag + ground.ay * dt;
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
    // How square it's coming in: 0 through the middle, 1 just catching the edge.
    const off = v > 1e-6 ? Math.min(1, Math.abs(dxc * ball.vy - dyc * ball.vx) / v / CUP_R) : 0;
    // Dead centre it can be going a fair clip and still drop; on the edge it has to be dying.
    if (v < CAPTURE_SPEED * (1 - 0.45 * off * off)) {
      ball.x = hole.cup.x;
      ball.y = hole.cup.y;
      ball.vx = 0;
      ball.vy = 0;
      return 'sunk';
    }
    // Too hot: as it arrives it catches the lip, loses some pace and curls away — more, the
    // more of the edge it caught. Through the middle it just hops the far side.
    if (!wasOverCup) {
      const ux = ball.vx / v;
      const uy = ball.vy / v;
      const along = dxc * ux + dyc * uy;
      let px = dxc - ux * along;
      let py = dyc - uy * along;
      const pl = Math.hypot(px, py);
      if (pl > 1e-6) {
        px /= pl;
        py /= pl;
      } else {
        px = -uy;
        py = ux;
      }
      const th = 0.75 * off;
      const sp = v * (0.82 - 0.06 * off);
      ball.vx = sp * (Math.cos(th) * ux + Math.sin(th) * px);
      ball.vy = sp * (Math.cos(th) * uy + Math.sin(th) * py);
      event = 'lip';
    }
  }

  // The box's edges (the mat's wooden rail; a garden hole's outer hedge).
  const W = holeW(hole);
  const L = holeL(hole);
  if (ball.x < BALL_R) {
    ball.x = BALL_R;
    if (bounceOff(ball, 1, 0, WALL_BOUNCE)) event = event ?? 'wall';
  } else if (ball.x > W - BALL_R) {
    ball.x = W - BALL_R;
    if (bounceOff(ball, -1, 0, WALL_BOUNCE)) event = event ?? 'wall';
  }
  if (ball.y < BALL_R) {
    ball.y = BALL_R;
    if (bounceOff(ball, 0, 1, WALL_BOUNCE)) event = event ?? 'wall';
  } else if (ball.y > L - BALL_R) {
    ball.y = L - BALL_R;
    if (bounceOff(ball, 0, -1, WALL_BOUNCE)) event = event ?? 'wall';
  }

  // Into the water: plop. It's gone; the hole puts it back where it was struck from.
  if (surfaceAt(hole, ball.x, ball.y).water) {
    ball.vx = 0;
    ball.vy = 0;
    return 'splash';
  }

  // A tube: in at one mouth, out of the other, still rolling.
  if (ball.tubeExit && Math.hypot(ball.x - ball.tubeExit.x, ball.y - ball.tubeExit.y) > TUBE_R * 1.6) delete ball.tubeExit;
  if (!ball.tubeExit) {
    for (const tube of hole.tubes ?? []) {
      for (const [from, to] of [
        [tube.a, tube.b],
        [tube.b, tube.a],
      ] as const) {
        if (Math.hypot(ball.x - from.x, ball.y - from.y) < TUBE_R) {
          ball.x = to.x;
          ball.y = to.y;
          ball.tubeExit = { x: to.x, y: to.y };
          return event ?? 'tube';
        }
      }
    }
  }

  const hit = collide(ball, hole, t);
  return event ?? hit;
}

/** Simulates a putt to rest (or the cup, or the water), for tests and aim previews. */
export function simulatePutt(hole: Hole, from: { x: number; y: number }, angle: number, power: number, maxSeconds = 20, t0 = 0): { ball: Ball; sunk: boolean; splashed: boolean; events: BallEvent[] } {
  const ball: Ball = { x: from.x, y: from.y, vx: 0, vy: 0 };
  strike(ball, angle, power);
  const events: BallEvent[] = [];
  const dt = 1 / 240;
  for (let t = 0; t < maxSeconds && ballMoving(ball); t += dt) {
    const e = stepBall(ball, hole, dt, t0 + t);
    if (e) events.push(e);
    if (e === 'sunk') return { ball, sunk: true, splashed: false, events };
    if (e === 'splash') return { ball, sunk: false, splashed: true, events };
  }
  return { ball, sunk: false, splashed: false, events };
}

/**
 * Where a putt would roll, up to its first bounce (or a short way, whichever
 * comes first): the faint guide drawn while aiming. It never gives away the
 * whole putt, just the line.
 */
export function previewPath(hole: Hole, from: { x: number; y: number }, angle: number, power: number, maxLength = 3.2, t0 = 0): { x: number; y: number }[] {
  const ball: Ball = { x: from.x, y: from.y, vx: 0, vy: 0 };
  strike(ball, angle, power);
  const pts = [{ x: ball.x, y: ball.y }];
  const dt = 1 / 120;
  let travelled = 0;
  for (let t = 0; t < 6 && ballMoving(ball) && travelled < maxLength; t += dt) {
    const px = ball.x;
    const py = ball.y;
    const e = stepBall(ball, hole, dt, t0 + t);
    travelled += Math.hypot(ball.x - px, ball.y - py);
    if (Math.round(t / dt) % 4 === 0) pts.push({ x: ball.x, y: ball.y });
    if (e === 'wall' || e === 'hit' || e === 'sunk' || e === 'lip' || e === 'tube' || e === 'splash') break;
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

/** The best round on the course as it is now (a best from an older course doesn't count). */
export function bestRound(rec: PuttingRecord): number | null {
  return rec.course === COURSE_ID ? rec.best : null;
}

/** Notes a finished round; true if it's a new best. */
export function recordRound(rec: PuttingRecord, total: number): boolean {
  rec.rounds += 1;
  if (rec.course !== COURSE_ID) {
    rec.course = COURSE_ID;
    rec.holes = COURSE.length;
    rec.best = null;
  }
  if (rec.best === null || total < rec.best) {
    rec.best = total;
    return true;
  }
  return false;
}

// ------------------------------------------------------------ records across courses

/** A course, as far as its record is concerned: which record it keeps, and its holes. */
export interface CourseRef {
  recordId: string;
  holes: Hole[];
}

/** The fewest strokes ever taken on a hole, or null if it's never been finished. */
export function holeBest(rec: PuttingRecord, holeId: string): number | null {
  const n = rec.holeBests?.[holeId];
  return typeof n === 'number' ? n : null;
}

/** Notes a finished hole. `best` is a new personal best (not the first time it's been played). */
export function recordHole(rec: PuttingRecord, holeId: string, strokes: number): { best: boolean; first: boolean; previous: number | null } {
  const bests = (rec.holeBests ??= {});
  const previous = typeof bests[holeId] === 'number' ? bests[holeId] : null;
  const s = Math.max(1, Math.round(strokes));
  if (previous === null || s < previous) bests[holeId] = s;
  return { best: previous !== null && s < previous, first: previous === null, previous };
}

/** The best round on a course as it is now, or null. */
export function courseBest(rec: PuttingRecord, course: CourseRef): number | null {
  if (course.recordId === COURSE_ID) return bestRound(rec);
  return rec.courses?.[course.recordId]?.best ?? null;
}

/** Rounds played to the end on a course. */
export function courseRounds(rec: PuttingRecord, course: CourseRef): number {
  if (course.recordId === COURSE_ID) return rec.rounds;
  return rec.courses?.[course.recordId]?.rounds ?? 0;
}

/** Notes a finished round on a course; true if it's a new best (or the first). */
export function recordCourseRound(rec: PuttingRecord, course: CourseRef, total: number): boolean {
  if (course.recordId === COURSE_ID) return recordRound(rec, total);
  const cs = (rec.courses ??= {});
  const r = (cs[course.recordId] ??= { rounds: 0, best: null });
  r.rounds += 1;
  if (r.best === null || total < r.best) {
    r.best = total;
    return true;
  }
  return false;
}

/** How many of a course's holes have been aced at least once. */
export function acesOn(rec: PuttingRecord, course: CourseRef): number {
  return course.holes.filter((h) => rec.aces.includes(h.id)).length;
}

/**
 * Which obstacle the ball at (x, y) is touching (or nearest, within a
 * ball's width), `t` seconds into the hole: its index, or -1. For the UI's
 * reactions — a cap that squashes, a hedgehog that tucks his nose in.
 */
export function obstacleTouching(hole: Hole, x: number, y: number, t: number): number {
  let best = -1;
  let bestGap = BALL_R * 1.2;
  hole.obstacles.forEach((still, i) => {
    const o = obstacleAt(still, t);
    const c = contactOn(o, x, y);
    const gap = Math.hypot(x - c.x, y - c.y) - c.r - BALL_R;
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  });
  return best;
}
