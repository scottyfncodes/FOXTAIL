// Slingshot Targets: backyard target practice in the rocky clearing. Scott
// has a wooden slingshot and a basket of pinecones, and somebody (Scott)
// has painted rings on a few wooden discs and nailed them to posts, cut a
// duck out of plywood to slide along a rail, hung a disc from a branch on a
// rope and put up a little wooden windmill. Knock them over; they clack
// and flip and get stood back up for the next go. Nothing alive, ever.
//
// Pure simulation, no DOM. A side view in metres: the slingshot's pouch is
// near x = 0, targets stand out to the right, y is up and the ground is 0.

/** Modest: a slingshot sends a pinecone out flat and quick. */
export const GRAVITY = 6;
export const MAX_SPEED = 13.5;
export const MIN_SPEED = 3;
export const CONE_R = 0.075;
/** Where the pouch rests, between the fork's prongs: the launch point. */
export const POUCH = { x: 0.3, y: 1.25 };
const GROUND_BOUNCE = 0.32;
const POST_BOUNCE = 0.4;
/** Knocking a target takes most of the pinecone's go out of it. */
const TARGET_BOUNCE = 0.25;
const ROLL = 3;
const STOP_SPEED = 0.12;
const REST_TIME = 0.2;
const MAX_TIME = 6;
const FAR_X = 10;
const NEAR_X = -2;

export type TargetKind = 'disc' | 'small' | 'duck' | 'swing' | 'windmill';

export interface TargetDef {
  kind: TargetKind;
  /** Where it stands (for a swing, the pivot's x). */
  x: number;
  /** Height of its centre (for a swing, the pivot on the branch). */
  y: number;
  /** How big it is to hit. */
  r: number;
  points: number;
  /** The duck on its rail: slides ±dx about x, once each `period` seconds. */
  slide?: { dx: number; period: number; phase: number };
  /** On a rope of length `len` from the pivot, swinging ±`amp` radians each `period`. */
  swing?: { len: number; amp: number; period: number; phase: number };
}

export interface Round {
  name: string;
  targets: TargetDef[];
  /** Pinecones in the basket: one each and two spare. */
  cones: number;
}

const disc = (x: number, y: number): TargetDef => ({ kind: 'disc', x, y, r: 0.24, points: 1 });
const small = (x: number, y: number): TargetDef => ({ kind: 'small', x, y, r: 0.16, points: 2 });
const windmill = (x: number, y: number): TargetDef => ({ kind: 'windmill', x, y, r: 0.2, points: 1 });
const duck = (x: number, y: number, dx: number, period: number, phase = 0): TargetDef => ({ kind: 'duck', x, y, r: 0.22, points: 2, slide: { dx, period, phase } });
const swing = (x: number, y: number, len: number, amp: number, period: number, phase = 0): TargetDef => ({
  kind: 'swing',
  x,
  y,
  r: 0.2,
  points: 2,
  swing: { len, amp, period, phase },
});

/** Four arrangements: a few on posts, then smaller and further, then moving, then all sorts. */
export const ROUNDS: Round[] = [
  { name: 'Three on posts', targets: [disc(2.9, 1.0), disc(4.0, 1.3), disc(5.1, 1.65)], cones: 5 },
  { name: 'Smaller and further', targets: [disc(3.3, 1.05), small(4.2, 1.75), windmill(5.0, 1.25), small(5.8, 1.95)], cones: 6 },
  { name: 'On the move', targets: [disc(3.0, 0.75), duck(4.3, 0.95, 0.75, 4.2), swing(5.5, 3.3, 1.7, 0.42, 3.0)], cones: 5 },
  {
    name: 'All sorts',
    targets: [small(2.8, 0.7), duck(4.1, 0.85, 0.65, 3.4, 0.3), small(5.5, 1.0), swing(5.0, 3.3, 1.75, 0.5, 2.7, 0.5), windmill(6.0, 2.2)],
    cones: 7,
  },
];

export const MAX_SCORE = ROUNDS.reduce((s, r) => s + r.targets.reduce((a, t) => a + t.points, 0) + (r.cones - r.targets.length), 0);

/** Where a target is at time `t` (seconds into the round). */
export function targetPos(d: TargetDef, t: number): { x: number; y: number; angle: number } {
  if (d.slide) {
    const k = Math.sin((2 * Math.PI * t) / d.slide.period + d.slide.phase * 2 * Math.PI);
    return { x: d.x + d.slide.dx * k, y: d.y, angle: 0 };
  }
  if (d.swing) {
    const a = d.swing.amp * Math.sin((2 * Math.PI * t) / d.swing.period + d.swing.phase * 2 * Math.PI);
    return { x: d.x + Math.sin(a) * d.swing.len, y: d.y - Math.cos(a) * d.swing.len, angle: a };
  }
  return { x: d.x, y: d.y, angle: 0 };
}

/** How far the duck's rail runs past the ends of its slide. */
export const RAIL_END = 0.28;

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Posts and rails a pinecone can bounce off: they stay put whether the target's up or down. */
export function solids(round: Round): Rect[] {
  const out: Rect[] = [];
  for (const d of round.targets) {
    if (d.kind === 'disc' || d.kind === 'small' || d.kind === 'windmill') {
      out.push({ x0: d.x - 0.05, y0: 0, x1: d.x + 0.05, y1: d.y - d.r * 0.9 });
    } else if (d.kind === 'duck' && d.slide) {
      // The rail the duck rides on, on two short legs.
      const top = d.y - d.r * 0.85;
      out.push({ x0: d.x - d.slide.dx - RAIL_END, y0: top - 0.05, x1: d.x + d.slide.dx + RAIL_END, y1: top });
    }
  }
  return out;
}

export interface Cone {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  still: number;
  t: number;
  done: boolean;
}

export function newCone(): Cone {
  return { x: POUCH.x, y: POUCH.y, vx: 0, vy: 0, spin: 0, still: 0, t: 0, done: false };
}

export function launchSpeed(power: number): number {
  return MIN_SPEED + Math.max(0, Math.min(1, power)) * (MAX_SPEED - MIN_SPEED);
}

/** Lets fly: `angle` up from level (anything goes, it's a slingshot), `power` 0..1 of the stretch. */
export function launch(c: Cone, angle: number, power: number) {
  const v = launchSpeed(power);
  c.x = POUCH.x;
  c.y = POUCH.y;
  c.vx = Math.cos(angle) * v;
  c.vy = Math.sin(angle) * v;
  c.spin = 0;
  c.still = 0;
  c.t = 0;
  c.done = false;
}

function collideRect(c: Cone, r: Rect, bounce: number): boolean {
  const cx = Math.min(r.x1, Math.max(r.x0, c.x));
  const cy = Math.min(r.y1, Math.max(r.y0, c.y));
  const dx = c.x - cx;
  const dy = c.y - cy;
  const d = Math.hypot(dx, dy);
  if (d >= CONE_R) return false;
  let nx: number;
  let ny: number;
  if (d < 1e-9) {
    const l = c.x - r.x0;
    const rt = r.x1 - c.x;
    const up = r.y1 - c.y;
    const m = Math.min(l, rt, up);
    [nx, ny] = m === up ? [0, 1] : m === l ? [-1, 0] : [1, 0];
    if (nx !== 0) c.x = (nx < 0 ? r.x0 : r.x1) + nx * CONE_R;
    else c.y = r.y1 + CONE_R;
  } else {
    nx = dx / d;
    ny = dy / d;
    c.x = cx + nx * CONE_R;
    c.y = cy + ny * CONE_R;
  }
  const vn = c.vx * nx + c.vy * ny;
  if (vn >= 0) return false;
  c.vx -= (1 + bounce) * vn * nx;
  c.vy -= (1 + bounce) * vn * ny;
  c.vx *= 0.9;
  return true;
}

export type ConeEvent = { kind: 'hit'; index: number } | { kind: 'tock' } | { kind: 'thud' } | null;

/**
 * One small step. `up[i]` says which targets are still standing; a hit
 * knocks one down here and returns which. `t` is the round's clock (the
 * moving targets go on moving whatever the pinecone's doing).
 */
export function stepCone(c: Cone, round: Round, up: boolean[], t: number, dt: number): ConeEvent {
  if (c.done) return null;
  let ev: ConeEvent = null;
  c.t += dt;
  c.vy -= GRAVITY * dt;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  c.spin += c.vx * dt * 4;

  for (let i = 0; i < round.targets.length; i++) {
    if (!up[i]) continue;
    const d = round.targets[i];
    const p = targetPos(d, t);
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < d.r + CONE_R) {
      up[i] = false;
      // Clack: it bounces back off the wood with most of its go spent.
      const nx = dist > 1e-6 ? dx / dist : -1;
      const ny = dist > 1e-6 ? dy / dist : 0;
      const vn = c.vx * nx + c.vy * ny;
      if (vn < 0) {
        c.vx -= (1 + TARGET_BOUNCE) * vn * nx;
        c.vy -= (1 + TARGET_BOUNCE) * vn * ny;
      }
      c.vx *= 0.6;
      c.vy *= 0.6;
      ev = { kind: 'hit', index: i };
      break;
    }
  }

  for (const r of solids(round)) {
    if (collideRect(c, r, POST_BOUNCE) && !ev && Math.hypot(c.vx, c.vy) > 1.5) ev = { kind: 'tock' };
  }

  let grounded = false;
  if (c.y < CONE_R) {
    c.y = CONE_R;
    if (c.vy < 0) {
      if (c.vy < -1.5 && !ev) ev = { kind: 'thud' };
      c.vy = -c.vy * GROUND_BOUNCE;
      if (c.vy < 0.4) c.vy = 0;
    }
    grounded = true;
  }
  if (grounded) c.vx *= Math.exp(-ROLL * dt);
  // Resting on a rail counts as resting too.
  const resting = grounded || Math.abs(c.vy) < 0.05;
  if (resting && Math.hypot(c.vx, c.vy) < STOP_SPEED) {
    c.still += dt;
    if (c.still >= REST_TIME) c.done = true;
  } else c.still = 0;
  if (c.x > FAR_X || c.x < NEAR_X || c.t > MAX_TIME) c.done = true;
  return ev;
}

export const STEP = 1 / 240;

/** Fires one pinecone through to rest at time `t0` into the round; which targets it knocked down. */
export function simulateShot(round: Round, up: boolean[], t0: number, angle: number, power: number): { hits: number[]; cone: Cone; t: number } {
  const c = newCone();
  launch(c, angle, power);
  const hits: number[] = [];
  let t = t0;
  for (let i = 0; i < MAX_TIME / STEP + 10 && !c.done; i++) {
    t += STEP;
    const ev = stepCone(c, round, up, t, STEP);
    if (ev?.kind === 'hit') hits.push(ev.index);
  }
  return { hits, cone: c, t };
}

/** Points for a round: each target knocked down, and, if they all went, a point per pinecone left. */
export function roundScore(round: Round, up: boolean[], conesLeft: number): number {
  let s = 0;
  round.targets.forEach((d, i) => {
    if (!up[i]) s += d.points;
  });
  if (up.every((u) => !u)) s += conesLeft;
  return s;
}

/** The short faint guide by the slingshot: the first few metres of the flight. */
export function aimGuide(angle: number, power: number, seconds: number, out: { x: number; y: number }[] = []) {
  out.length = 0;
  const v = launchSpeed(power);
  for (let s = 0; s <= seconds; s += 1 / 60) {
    out.push({ x: POUCH.x + Math.cos(angle) * v * s, y: POUCH.y + Math.sin(angle) * v * s - 0.5 * GRAVITY * s * s });
  }
  return out;
}
