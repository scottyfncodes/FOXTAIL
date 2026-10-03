// Acorn Pitch: Scott under the oaks at the woodland's edge, lobbing acorns
// underhand at whatever's lying about — a flower pot, a bucket, the stump,
// the watering can, the bird table, a pail up on the woodpile. Three
// acorns a go: in with the first is worth 3, the second 2, the third 1.
//
// Pure simulation, no DOM. The world is a side view in metres: x runs from
// Scott (at 0) out towards the trees, y is up, and the ground is y = 0.

export const GRAVITY = 9.8;
/** Air drag, per second, against the air (which may be drifting with the breeze). */
export const DRAG = 0.12;
/** Big for an acorn, but it has to read on a phone. */
export const ACORN_R = 0.055;
/** The hardest lob, m/s, and the gentlest that still counts as a throw. */
export const MAX_SPEED = 10.8;
export const MIN_SPEED = 2.2;
/** Where the acorn leaves Scott's hand, swung underhand from about hip height. */
export const RELEASE = { x: 0, y: 0.95 };
export const ACORNS_PER_TARGET = 3;
/** Throws are kept between a skim and straight up. */
export const MIN_ANGLE = (5 * Math.PI) / 180;
export const MAX_ANGLE = (85 * Math.PI) / 180;
/** Leaf litter soaks up a bounce and slows a roll. */
const GROUND_BOUNCE = 0.3;
const GROUND_ROLL = 4;
const WOOD_BOUNCE = 0.42;
/** Inside a pot or a bucket it's soil, seed or a drop of water: it thuds and stays. */
const INSIDE_BOUNCE = 0.12;
const STOP_SPEED = 0.1;
const REST_TIME = 0.25;
const MAX_TIME = 8;
/** Past this, it's rolled off into the trees. */
const FAR_X = 11;
const NEAR_X = -2.5;

export type TargetKind = 'pot' | 'bucket' | 'stump' | 'can' | 'birdTable' | 'pail';

export interface Target {
  kind: TargetKind;
  name: string;
  /** Centre of the thing, metres from Scott. */
  x: number;
  /** Height of its bottom (on a post or a woodpile it's off the ground). */
  base: number;
  /** Outside width and height. */
  w: number;
  h: number;
  /** Inside width of the opening; 0 for something you land on (the stump). */
  mouth: number;
  /** The breeze, m/s; positive blows from Scott towards the target. */
  wind: number;
  /** Whatever it sits on: a post, the woodpile. Solid, but not part of the target. */
  stand?: { w: number; h: number };
}

/** Six things to aim at, getting further, smaller and breezier. */
export const TARGETS: Target[] = [
  { kind: 'pot', name: 'the flower pot', x: 2.3, base: 0, w: 0.96, h: 0.55, mouth: 0.82, wind: 0 },
  { kind: 'bucket', name: 'the bucket', x: 3.4, base: 0, w: 0.78, h: 0.66, mouth: 0.68, wind: 0 },
  { kind: 'stump', name: 'the top of the stump', x: 4.35, base: 0, w: 0.9, h: 0.55, mouth: 0, wind: 0 },
  { kind: 'can', name: 'the watering can', x: 5.2, base: 0, w: 0.74, h: 0.55, mouth: 0.56, wind: 1.4 },
  { kind: 'birdTable', name: 'the bird table', x: 6.05, base: 1.45, w: 0.84, h: 0.12, mouth: 0.76, wind: -1.8, stand: { w: 0.1, h: 1.45 } },
  { kind: 'pail', name: 'the pail on the woodpile', x: 7.0, base: 0.7, w: 0.7, h: 0.5, mouth: 0.62, wind: 2.4, stand: { w: 1.2, h: 0.7 } },
];

export const MAX_POINTS = TARGETS.length * ACORNS_PER_TARGET;

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Acorn {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Its tumble, radians — just for drawing. */
  spin: number;
  /** Dropped in through the opening. */
  inside: boolean;
  /** Seconds it's been sitting still. */
  still: number;
  /** Seconds since it left the hand. */
  t: number;
  done: boolean;
  /** Resting on something this step (the ground, a stump top, a floor). */
  supported: boolean;
}

export type Outcome = 'in' | 'on' | 'miss';

/** What happened in a step, for the panel's little touches. */
export type StepEvent = null | 'in' | 'clonk' | 'thud';

/** Floor thickness of a container. */
const FLOOR = 0.05;

/** The solid parts of a target and its stand: walls, floor, the stump itself. */
export function targetSolids(tg: Target): Rect[] {
  const out: Rect[] = [];
  const x0 = tg.x - tg.w / 2;
  const x1 = tg.x + tg.w / 2;
  const top = tg.base + tg.h;
  if (tg.stand) out.push({ x0: tg.x - tg.stand.w / 2, y0: 0, x1: tg.x + tg.stand.w / 2, y1: tg.stand.h });
  if (tg.mouth <= 0) {
    out.push({ x0, y0: tg.base, x1, y1: top });
    return out;
  }
  const m0 = tg.x - tg.mouth / 2;
  const m1 = tg.x + tg.mouth / 2;
  out.push({ x0, y0: tg.base, x1: m0, y1: top });
  out.push({ x0: m1, y0: tg.base, x1, y1: top });
  out.push({ x0: m0, y0: tg.base, x1: m1, y1: tg.base + FLOOR });
  return out;
}

/** The hollow inside an open container: an acorn whose centre gets below the rim in here is in. */
export function cavity(tg: Target): Rect | null {
  if (tg.mouth <= 0) return null;
  return { x0: tg.x - tg.mouth / 2, y0: tg.base + FLOOR, x1: tg.x + tg.mouth / 2, y1: tg.base + tg.h };
}

export function newAcorn(): Acorn {
  return { x: RELEASE.x, y: RELEASE.y, vx: 0, vy: 0, spin: 0, inside: false, still: 0, t: 0, done: false, supported: false };
}

export function clampAngle(angle: number): number {
  // Anything aimed back over his shoulder is just a steep lob forwards; anything down is a skim.
  if (angle > Math.PI / 2 || angle < -Math.PI / 2) return angle > 0 ? MAX_ANGLE : MIN_ANGLE;
  return Math.min(MAX_ANGLE, Math.max(MIN_ANGLE, angle));
}

/** Lob it: `power` 0..1 of the hardest throw, `angle` up from level. */
export function lob(a: Acorn, angle: number, power: number) {
  const ang = clampAngle(angle);
  const v = MIN_SPEED + Math.max(0, Math.min(1, power)) * (MAX_SPEED - MIN_SPEED);
  a.x = RELEASE.x;
  a.y = RELEASE.y;
  a.vx = Math.cos(ang) * v;
  a.vy = Math.sin(ang) * v;
  a.spin = 0;
  a.inside = false;
  a.still = 0;
  a.t = 0;
  a.done = false;
  a.supported = false;
}

/** Pushes the acorn out of a rectangle and bounces it; the impact speed, or 0 if they didn't touch. */
function collideRect(a: Acorn, r: Rect, bounce: number, grip: number): number {
  const cx = Math.min(r.x1, Math.max(r.x0, a.x));
  const cy = Math.min(r.y1, Math.max(r.y0, a.y));
  const dx = a.x - cx;
  const dy = a.y - cy;
  const d = Math.hypot(dx, dy);
  if (d >= ACORN_R) return 0;
  let nx: number;
  let ny: number;
  if (d < 1e-9) {
    // Its centre got inside: out the nearest side.
    const left = a.x - r.x0;
    const right = r.x1 - a.x;
    const below = a.y - r.y0;
    const above = r.y1 - a.y;
    const m = Math.min(left, right, below, above);
    if (m === above) [nx, ny] = [0, 1];
    else if (m === left) [nx, ny] = [-1, 0];
    else if (m === right) [nx, ny] = [1, 0];
    else [nx, ny] = [0, -1];
    if (nx !== 0) a.x = (nx < 0 ? r.x0 : r.x1) + nx * ACORN_R;
    else a.y = (ny < 0 ? r.y0 : r.y1) + ny * ACORN_R;
  } else {
    nx = dx / d;
    ny = dy / d;
    a.x = cx + nx * ACORN_R;
    a.y = cy + ny * ACORN_R;
  }
  const vn = a.vx * nx + a.vy * ny;
  if (ny > 0.7) a.supported = true;
  if (vn >= 0) return 0;
  // Bounce off along the normal, and lose a little sideways speed to the scuff.
  const tx = a.vx - vn * nx;
  const ty = a.vy - vn * ny;
  a.vx = tx * grip - bounce * vn * nx;
  a.vy = ty * grip - bounce * vn * ny;
  return -vn;
}

/** One small step of flight, bounce and roll. */
export function stepAcorn(a: Acorn, tg: Target, dt: number): StepEvent {
  if (a.done) return null;
  let ev: StepEvent = null;
  a.t += dt;
  a.supported = false;
  // Gravity, and the air: drag against the breeze, which carries it along a little.
  a.vx += DRAG * (tg.wind - a.vx) * dt;
  a.vy += (-GRAVITY - DRAG * a.vy) * dt;
  a.x += a.vx * dt;
  a.y += a.vy * dt;
  a.spin += (a.vx / ACORN_R) * dt * 0.5;

  // A stump's top is soft and mossy: it takes the life out of an acorn.
  const mossy = tg.mouth <= 0;
  for (const r of targetSolids(tg)) {
    const soft = a.inside || (mossy && a.y > r.y1);
    const hit = collideRect(a, r, soft ? INSIDE_BOUNCE : WOOD_BOUNCE, soft ? 0.5 : 0.85);
    if (hit > 1.2 && !soft && !ev) ev = 'clonk';
  }
  const cav = cavity(tg);
  if (cav && !a.inside && a.x > cav.x0 && a.x < cav.x1 && a.y < cav.y1 && a.y > cav.y0) {
    a.inside = true;
    ev = 'in';
  }

  // The ground: leaf litter, a soft thud and a short roll.
  if (a.y < ACORN_R) {
    a.y = ACORN_R;
    if (a.vy < 0) {
      if (a.vy < -1.5 && !ev) ev = 'thud';
      a.vy = -a.vy * GROUND_BOUNCE;
      if (a.vy < 0.4) a.vy = 0;
    }
    a.supported = true;
  }
  if (a.supported) {
    a.vx *= Math.exp(-(a.inside || (mossy && a.y > ACORN_R * 2) ? 12 : GROUND_ROLL) * dt);
  }

  const speed = Math.hypot(a.vx, a.vy);
  if (a.supported && speed < STOP_SPEED) {
    a.still += dt;
    if (a.still >= REST_TIME) {
      a.vx = 0;
      a.vy = 0;
      a.done = true;
    }
  } else a.still = 0;
  if (a.x > FAR_X || a.x < NEAR_X || a.t > MAX_TIME) a.done = true;
  return ev;
}

/** How a throw ended up: in the container, sitting on the stump, or not. */
export function outcome(a: Acorn, tg: Target): Outcome {
  if (a.inside) return 'in';
  if (tg.mouth <= 0) {
    const top = tg.base + tg.h;
    if (Math.abs(a.x - tg.x) <= tg.w / 2 && a.y >= top && a.y < top + ACORN_R * 1.5) return 'on';
  }
  return 'miss';
}

/** Points for getting it in with the nth acorn (1-based): 3, 2, 1. */
export function pointsFor(n: number): number {
  return Math.max(0, ACORNS_PER_TARGET + 1 - n);
}

export const STEP = 1 / 240;

/** Throws one acorn all the way through: where it ended and how. */
export function simulateLob(tg: Target, angle: number, power: number): { outcome: Outcome; acorn: Acorn; clonked: boolean } {
  const a = newAcorn();
  lob(a, angle, power);
  let clonked = false;
  for (let i = 0; i < MAX_TIME / STEP + 10 && !a.done; i++) {
    if (stepAcorn(a, tg, STEP) === 'clonk') clonked = true;
  }
  return { outcome: outcome(a, tg), acorn: a, clonked };
}

/**
 * The first stretch of the flight, for the faint preview: a guide to the
 * angle and the oomph, never the whole answer of where it lands.
 */
export function previewArc(tg: Target, angle: number, power: number, seconds: number, out: { x: number; y: number }[] = []) {
  out.length = 0;
  const a = newAcorn();
  lob(a, angle, power);
  const dt = 1 / 60;
  for (let s = 0; s < seconds; s += dt) {
    a.vx += DRAG * (tg.wind - a.vx) * dt;
    a.vy += (-GRAVITY - DRAG * a.vy) * dt;
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    if (a.y < 0) break;
    out.push({ x: a.x, y: a.y });
  }
  return out;
}
