// Sticks for Scout, out on the open meadow. Scott picks one from the pile
// — a light switch of a thing that flies far but floats about, a good
// reliable stick, or a big branch that doesn't go far but that Scout drags
// home like a trophy — and throws it up the meadow. Scout bounds out,
// noses about, digs it out of a bush or wades in after it if she has to,
// and trots it back to drop at his feet. Nothing she does can fail; she
// always brings it back.
//
// Five throws. Each scores for how far it went, a bonus for landing near
// Scott's old golf flag stuck in the meadow (it moves further out every
// throw, and closer to the bushes, the puddle, the log and the creek),
// and a little more for a clean landing in the grass.
//
// Pure simulation, no DOM. The meadow is in metres: Scott at (0, 0)
// looking up it, +y away from him, +x to his right, z up.

import { mulberry32 } from '../../engine/Random';

export const STEP = 1 / 120;
/** The meadow, either side of Scott, and how far up it runs to the hedgerow. */
export const FIELD_HALF = 11;
export const FIELD_L = 34;
/** Past this, to Scott's right, it's the creek. */
export const CREEK_X = 8.5;
export const THROWS = 5;
/** How steeply he throws: a good lob. */
const LAUNCH_ANGLE = (40 * Math.PI) / 180;

export type StickKind = 'switch' | 'good' | 'branch';

export interface StickDef {
  kind: StickKind;
  name: string;
  /** m/s at full power. */
  maxSpeed: number;
  gravity: number;
  /** Air drag on the horizontal, per second. */
  drag: number;
  /** How much of its fall it bounces back up. */
  bounce: number;
  /** How much it floats about in the air (m/s² of sideways wander). */
  wobble: number;
  /** Ground friction once it's sliding, m/s². */
  friction: number;
  /** How quickly Scout brings it home (her trot, m/s). */
  carrySpeed: number;
  /** Points for the sheer pride of it. */
  proud: number;
}

export const STICKS: Record<StickKind, StickDef> = {
  // Thin and whippy: goes a mile, but catches the air and wanders.
  switch: { kind: 'switch', name: 'Light switch', maxSpeed: 19.5, gravity: 7.2, drag: 0.3, bounce: 0.35, wobble: 2.6, friction: 5, carrySpeed: 7.5, proud: 0 },
  good: { kind: 'good', name: 'Good stick', maxSpeed: 16, gravity: 9.8, drag: 0.1, bounce: 0.22, wobble: 0.2, friction: 8, carrySpeed: 7, proud: 0 },
  // Heavy: a short throw, a thump, no bounce — and a very proud dog.
  branch: { kind: 'branch', name: 'Big branch', maxSpeed: 11.5, gravity: 9.8, drag: 0.06, bounce: 0.06, wobble: 0, friction: 14, carrySpeed: 4.6, proud: 6 },
};
export const STICK_ORDER: StickKind[] = ['switch', 'good', 'branch'];

export interface Pt {
  x: number;
  y: number;
}

export interface Bush extends Pt {
  r: number;
}

/** Bushes a stick snags in, and Scout runs round. */
export const BUSHES: Bush[] = [
  { x: -7, y: 11, r: 1.6 },
  { x: 2.6, y: 14.5, r: 1.3 },
  { x: -6.6, y: 18, r: 1.5 },
  { x: -5.8, y: 29, r: 1.8 },
  { x: 4.5, y: 31, r: 1.5 },
];
/** The muddy puddle: an ellipse. */
export const PUDDLE = { x: 3.4, y: 19.2, rx: 2.0, ry: 1.2 };
/** A fallen log lying across the meadow: a segment with a thickness. */
export const LOG = { a: { x: -5.6, y: 23.6 }, b: { x: 0.4, y: 24.3 }, r: 0.35 };
const BUSH_H = 1.1;
const LOG_H = 0.5;

/** Scott's old golf flag, stuck in the meadow further out for each throw. */
export const FLAGS: Pt[] = [
  { x: 1, y: 12.5 },
  { x: -4.4, y: 17 },
  { x: 5.4, y: 21 },
  { x: -2.6, y: 25.6 },
  { x: 5.8, y: 28 },
];

/** Where Scout sits, at Scott's feet. */
export const HOME: Pt = { x: 2.2, y: 1.4 };

export type Lie = 'grass' | 'bush' | 'puddle' | 'creek' | 'log';

export interface Stick {
  kind: StickKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Tumbling, radians. */
  rot: number;
  spin: number;
  rest: boolean;
  lie: Lie;
  bounces: number;
  /** For the wobble: phase and which way it wanders. */
  wob: number;
  wobDir: number;
  t: number;
}

export type ScoutMode = 'sit' | 'run' | 'distracted' | 'sniff' | 'dig' | 'pickup' | 'return' | 'shake' | 'drop' | 'wag';

export interface Scout {
  x: number;
  y: number;
  /** Which way she's going, radians in meadow coordinates. */
  heading: number;
  mode: ScoutMode;
  modeT: number;
  modeDur: number;
  /** Her paws are off the ground, hopping the log (0..1). */
  hop: number;
  wet: boolean;
  carrying: boolean;
  /** Scott whistled: she hurries. */
  hurry: boolean;
  /** She'll stop for a butterfly or a smell this far out (fraction of the run), or never (null). */
  distractAt: number | null;
  distraction: 'butterfly' | 'smell';
  runFrom: number;
  moving: boolean;
}

export interface ThrowScore {
  kind: StickKind;
  lie: Lie;
  /** Metres from Scott to where it ended up. */
  distance: number;
  distPts: number;
  /** Metres from the flag. */
  flagDist: number;
  accuracy: number;
  clean: number;
  proud: number;
  total: number;
}

export type FetchEvent = 'throw' | 'land' | 'bounce' | 'snag' | 'splash' | 'thunk' | 'wade' | 'puddle' | 'hop' | 'distracted' | 'dig' | 'pickup' | 'shake' | 'drop' | 'scored';

export type FetchPhase = 'aim' | 'flight' | 'fetch' | 'done';

export interface FetchGame {
  rng: () => number;
  phase: FetchPhase;
  /** Which throw (0-based). */
  n: number;
  t: number;
  stick: Stick | null;
  scout: Scout;
  scores: ThrowScore[];
  total: number;
  events: FetchEvent[];
  /** The score for the throw in progress, worked out when it comes to rest. */
  pending: ThrowScore | null;
}

export function createFetch(seed: number): FetchGame {
  return {
    rng: mulberry32(seed),
    phase: 'aim',
    n: 0,
    t: 0,
    stick: null,
    scout: newScout(),
    scores: [],
    total: 0,
    events: [],
    pending: null,
  };
}

function newScout(): Scout {
  return { x: HOME.x, y: HOME.y, heading: Math.PI / 2, mode: 'sit', modeT: 0, modeDur: 0, hop: 0, wet: false, carrying: false, hurry: false, distractAt: null, distraction: 'butterfly', runFrom: 0, moving: false };
}

export function flagFor(g: FetchGame): Pt {
  return FLAGS[Math.min(g.n, FLAGS.length - 1)];
}

// ------------------------------------------------------------ the meadow

function inEllipse(p: Pt, e: { x: number; y: number; rx: number; ry: number }) {
  const dx = (p.x - e.x) / e.rx;
  const dy = (p.y - e.y) / e.ry;
  return dx * dx + dy * dy <= 1;
}

export function inPuddle(p: Pt) {
  return inEllipse(p, PUDDLE);
}

export function inCreek(p: Pt) {
  return p.x > CREEK_X;
}

export function bushAt(p: Pt, pad = 0): Bush | undefined {
  return BUSHES.find((b) => Math.hypot(p.x - b.x, p.y - b.y) < b.r + pad);
}

/** Distance from p to the log's centre line. */
export function logDist(p: Pt): number {
  const { a, b } = LOG;
  const ax = b.x - a.x;
  const ay = b.y - a.y;
  const u = Math.max(0, Math.min(1, ((p.x - a.x) * ax + (p.y - a.y) * ay) / (ax * ax + ay * ay)));
  return Math.hypot(p.x - (a.x + ax * u), p.y - (a.y + ay * u));
}

// ------------------------------------------------------------ the throw

/** Starts a stick flying: `angle` along the ground (π/2 is straight up the meadow), `power` 0..1. */
export function launch(kind: StickKind, angle: number, power: number, rng: () => number): Stick {
  const d = STICKS[kind];
  const v = d.maxSpeed * Math.max(0, Math.min(1, power));
  const vh = v * Math.cos(LAUNCH_ANGLE);
  return {
    kind,
    x: Math.cos(angle) * 0.4,
    y: Math.sin(angle) * 0.4,
    z: 1.8,
    vx: Math.cos(angle) * vh,
    vy: Math.sin(angle) * vh,
    vz: v * Math.sin(LAUNCH_ANGLE),
    rot: angle,
    spin: (kind === 'branch' ? 4 : 9) * (rng() < 0.5 ? -1 : 1),
    rest: false,
    lie: 'grass',
    bounces: 0,
    wob: rng() * Math.PI * 2,
    wobDir: rng() < 0.5 ? -1 : 1,
    t: 0,
  };
}

/** One fixed step of a stick in the air or along the grass. Returns what happened, if anything. */
export function stepStick(s: Stick, dt: number): FetchEvent | null {
  if (s.rest) return null;
  const d = STICKS[s.kind];
  s.t += dt;
  s.rot += s.spin * dt;
  const airborne = s.z > 0 || s.vz > 0;
  if (airborne) {
    s.vx -= s.vx * d.drag * dt;
    s.vy -= s.vy * d.drag * dt;
    // A light switch catches the air and wanders off its line, this way and that.
    if (d.wobble > 0) {
      const sp = Math.hypot(s.vx, s.vy) || 1;
      const w = d.wobble * (0.6 * Math.sin(s.t * 3.1 + s.wob) + 0.4 * s.wobDir) * dt;
      s.vx += (-s.vy / sp) * w;
      s.vy += (s.vx / sp) * w;
    }
    s.vz -= d.gravity * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    if (s.z < BUSH_H && bushAt(s)) return snag(s, 'bush');
    if (s.z < LOG_H && logDist(s) < LOG.r) return snag(s, 'log');
    if (s.z <= 0) {
      s.z = 0;
      if (inCreek(s)) return snag(s, 'creek');
      if (inPuddle(s)) return snag(s, 'puddle');
      const up = -s.vz * d.bounce;
      s.bounces++;
      if (up > 1.2) {
        s.vz = up;
        s.vx *= 0.6;
        s.vy *= 0.6;
        s.spin *= -0.7;
        return s.bounces === 1 ? 'land' : 'bounce';
      }
      // Down: it tumbles along the grass.
      s.vz = 0;
      s.vx *= 0.5;
      s.vy *= 0.5;
      s.spin *= 0.5;
      return s.bounces === 1 ? 'land' : null;
    }
  } else {
    const sp = Math.hypot(s.vx, s.vy);
    const nsp = Math.max(0, sp - d.friction * dt);
    if (sp > 0) {
      s.vx *= nsp / sp;
      s.vy *= nsp / sp;
    }
    s.spin *= Math.max(0, 1 - dt * 4);
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (bushAt(s)) return snag(s, 'bush');
    if (logDist(s) < LOG.r) return snag(s, 'log');
    if (inCreek(s)) return snag(s, 'creek');
    if (inPuddle(s)) return snag(s, 'puddle');
    if (nsp < 0.15) {
      s.rest = true;
      s.vx = s.vy = 0;
    }
  }
  // The hedgerow at the top and the long grass at the left edge stop it.
  if (s.y > FIELD_L - 0.5 || s.x < -FIELD_HALF + 0.3 || s.y < -0.5) {
    s.x = Math.max(-FIELD_HALF + 0.3, s.x);
    s.y = Math.max(-0.5, Math.min(FIELD_L - 0.5, s.y));
    s.z = 0;
    s.rest = true;
    return 'land';
  }
  return null;
}

function snag(s: Stick, lie: Lie): FetchEvent {
  s.rest = true;
  s.lie = lie;
  s.vx = s.vy = s.vz = 0;
  s.spin = 0;
  if (lie === 'log') {
    // It thunks against the log and drops on this side of it.
    const { a, b } = LOG;
    const nx = -(b.y - a.y);
    const ny = b.x - a.x;
    const nl = Math.hypot(nx, ny);
    const side = (s.x - a.x) * nx + (s.y - a.y) * ny < 0 ? -1 : 1;
    s.x += (nx / nl) * side * 0.25;
    s.y += (ny / nl) * side * 0.25;
    s.z = 0;
    return 'thunk';
  }
  if (lie === 'bush') {
    s.z = Math.min(Math.max(s.z, 0.3), 0.8);
    return 'snag';
  }
  s.z = 0;
  // Over the creek it drops in the near shallows (the far bank is out of reach).
  if (lie === 'creek') s.x = Math.min(s.x, FIELD_HALF - 0.8);
  return 'splash';
}

/** Where a throw would go if nothing wandered it off line: for the aiming guide, only the first part. */
export function previewThrow(kind: StickKind, angle: number, power: number, fraction: number): { x: number; y: number; z: number }[] {
  const s = launch(kind, angle, power, () => 0.5);
  s.wobDir = 0;
  const d = STICKS[kind];
  // Time to land, roughly, so we know how much of the arc a fraction is.
  const tLand = (s.vz + Math.sqrt(s.vz * s.vz + 2 * d.gravity * s.z)) / d.gravity;
  const out: { x: number; y: number; z: number }[] = [];
  const stop = tLand * fraction;
  let t = 0;
  let k = 0;
  while (t < stop && !s.rest && s.z > 0) {
    s.vx -= s.vx * d.drag * STEP;
    s.vy -= s.vy * d.drag * STEP;
    s.vz -= d.gravity * STEP;
    s.x += s.vx * STEP;
    s.y += s.vy * STEP;
    s.z += s.vz * STEP;
    t += STEP;
    if (k++ % 6 === 0) out.push({ x: s.x, y: s.y, z: Math.max(0, s.z) });
  }
  return out;
}

/** Runs a throw to rest, for tests and planning. */
export function simulateThrow(kind: StickKind, angle: number, power: number, seed = 1): Stick {
  const s = launch(kind, angle, power, mulberry32(seed));
  for (let i = 0; i < 120 * 20 && !s.rest; i++) stepStick(s, STEP);
  return s;
}

/** What a throw's worth: distance, nearness to the flag, a clean landing, and pride. */
export function scoreThrow(kind: StickKind, at: Pt, lie: Lie, flag: Pt): ThrowScore {
  const distance = Math.hypot(at.x, at.y);
  const distPts = Math.round(distance * 0.5);
  const flagDist = Math.hypot(at.x - flag.x, at.y - flag.y);
  const accuracy = flagDist < 2 ? 15 : flagDist < 4 ? 10 : flagDist < 6 ? 5 : 0;
  const clean = lie === 'grass' ? 3 : 0;
  const proud = STICKS[kind].proud;
  return { kind, lie, distance, distPts, flagDist, accuracy, clean, proud, total: distPts + accuracy + clean + proud };
}

// ------------------------------------------------------------ a session

/** Scott throws. Ignored unless it's time to aim. */
export function throwStick(g: FetchGame, kind: StickKind, angle: number, power: number): boolean {
  if (g.phase !== 'aim' || g.n >= THROWS) return false;
  g.stick = launch(kind, angle, power, g.rng);
  g.phase = 'flight';
  g.pending = null;
  const sc = g.scout;
  sc.mode = 'run';
  // A beat to see it go before she's off.
  sc.modeT = -0.25;
  sc.hurry = false;
  sc.wet = false;
  sc.carrying = false;
  // Now and then something catches her nose or eye on the way out.
  sc.distractAt = g.rng() < 0.35 ? 0.3 + g.rng() * 0.4 : null;
  sc.distraction = g.rng() < 0.5 ? 'butterfly' : 'smell';
  sc.runFrom = 0;
  g.events.push('throw');
  return true;
}

/** Scott whistles: she hurries, and whatever she'd stopped for can wait. */
export function whistle(g: FetchGame) {
  const sc = g.scout;
  if (g.phase !== 'flight' && g.phase !== 'fetch') return;
  sc.hurry = true;
  sc.distractAt = null;
  if (sc.mode === 'distracted') setScout(sc, 'run');
}

function setScout(sc: Scout, mode: ScoutMode, dur = 0) {
  sc.mode = mode;
  sc.modeT = 0;
  sc.modeDur = dur;
}

export function stepFetch(g: FetchGame, dt: number) {
  if (g.phase === 'done') return;
  g.t += dt;
  const s = g.stick;
  if (s && !s.rest) {
    const ev = stepStick(s, dt);
    if (ev) g.events.push(ev);
    if (s.rest && !g.pending) {
      g.pending = scoreThrow(s.kind, s, s.lie, flagFor(g));
      g.phase = 'fetch';
    }
  }
  stepScout(g, dt);
}

const RUN_SPEED = 9;

function stepScout(g: FetchGame, dt: number) {
  const sc = g.scout;
  const s = g.stick;
  sc.modeT += dt;
  sc.moving = false;
  const hurry = sc.hurry ? 1.5 : 1;
  switch (sc.mode) {
    case 'sit':
    case 'wag':
      sc.heading = Math.PI / 2;
      if (sc.mode === 'wag' && sc.modeT >= sc.modeDur) finishThrow(g);
      break;
    case 'run': {
      if (!s || sc.modeT < 0) break;
      // Where it'll come down, or where it is: she watches it and runs under it.
      const target = { x: s.x, y: s.y };
      const d = Math.hypot(target.x - sc.x, target.y - sc.y);
      // Snagged in a bush, she gets as far as its edge and digs in.
      const bush = s.rest && s.lie === 'bush' ? bushAt(s) : undefined;
      const arrived = bush ? Math.hypot(bush.x - sc.x, bush.y - sc.y) < bush.r + 0.5 : d < 0.55;
      if (sc.runFrom === 0) sc.runFrom = Math.max(1, d);
      if (s.rest && arrived) {
        // In the water after it: she's going to need a shake.
        if ((s.lie === 'creek' || s.lie === 'puddle') && !sc.wet) {
          sc.wet = true;
          g.events.push(s.lie === 'creek' ? 'wade' : 'puddle');
        }
        setScout(sc, 'sniff', sc.hurry ? 0.2 : 0.45);
        break;
      }
      if (sc.distractAt !== null && s.rest && d < sc.runFrom * (1 - sc.distractAt)) {
        sc.distractAt = null;
        g.events.push('distracted');
        setScout(sc, 'distracted', 0.9);
        break;
      }
      // Not past the stick while it's still in the air.
      const speed = s.rest || d > 1 ? RUN_SPEED * hurry : 2;
      moveScout(g, target, speed, dt, bush);
      break;
    }
    case 'distracted':
      if (sc.modeT >= sc.modeDur) setScout(sc, 'run');
      break;
    case 'sniff':
      if (sc.modeT >= sc.modeDur) {
        if (s && s.lie === 'bush') {
          // In she goes, back end wiggling, the whole bush rustling.
          g.events.push('dig');
          setScout(sc, 'dig', sc.hurry ? 0.9 : 1.4);
        } else setScout(sc, 'pickup', 0.3);
      }
      break;
    case 'dig':
      if (sc.modeT >= sc.modeDur) setScout(sc, 'pickup', 0.3);
      break;
    case 'pickup':
      if (sc.modeT >= sc.modeDur) {
        sc.carrying = true;
        g.events.push('pickup');
        setScout(sc, 'return');
      }
      break;
    case 'return': {
      const d = Math.hypot(HOME.x - sc.x, HOME.y - sc.y);
      if (s) {
        // The stick comes with her, in her mouth (or dragging, if it's the branch).
        s.x = sc.x + Math.cos(sc.heading) * 0.5;
        s.y = sc.y + Math.sin(sc.heading) * 0.5;
        s.z = s.kind === 'branch' ? 0.15 : 0.45;
        s.rot = sc.heading + Math.PI / 2;
      }
      if (d < 0.35) {
        sc.heading = Math.PI / 2;
        if (sc.wet) {
          g.events.push('shake');
          setScout(sc, 'shake', 0.9);
        } else setScout(sc, 'drop', 0.35);
        break;
      }
      moveScout(g, HOME, (s ? STICKS[s.kind].carrySpeed : 7) * hurry, dt);
      break;
    }
    case 'shake':
      if (sc.modeT >= sc.modeDur) {
        sc.wet = false;
        setScout(sc, 'drop', 0.35);
      }
      break;
    case 'drop':
      if (sc.modeT >= sc.modeDur) {
        sc.carrying = false;
        if (s) {
          s.x = 0.35;
          s.y = 1.2;
          s.z = 0;
          s.rot = 0.3;
        }
        g.events.push('drop');
        if (g.pending) {
          g.scores.push(g.pending);
          g.total += g.pending.total;
          g.events.push('scored');
        }
        setScout(sc, 'wag', 1.0);
      }
      break;
  }
}

function finishThrow(g: FetchGame) {
  g.n++;
  g.stick = null;
  g.pending = null;
  setScout(g.scout, 'sit');
  g.scout.x = HOME.x;
  g.scout.y = HOME.y;
  g.phase = g.n >= THROWS ? 'done' : 'aim';
}

/** Runs her toward `target`, steering round bushes; she hops the log and splashes through water. */
function moveScout(g: FetchGame, target: Pt, speed: number, dt: number, except?: Bush) {
  const sc = g.scout;
  let dx = target.x - sc.x;
  let dy = target.y - sc.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return;
  dx /= d;
  dy /= d;
  for (const b of BUSHES) {
    if (b === except) continue;
    const R = b.r + 0.6;
    const bx = b.x - sc.x;
    const by = b.y - sc.y;
    const along = bx * dx + by * dy;
    if (along < 0 || along > d) continue;
    const perp = bx * -dy + by * dx;
    if (Math.abs(perp) < R) {
      // Veer to whichever side is nearer, more the closer she is to it.
      const side = perp > 0 ? -1 : 1;
      const k = (R - Math.abs(perp)) / R + Math.max(0, 1 - along / (R * 2.5));
      const nx = dx - dy * side * k * 1.2;
      const ny = dy + dx * side * k * 1.2;
      const l = Math.hypot(nx, ny);
      dx = nx / l;
      dy = ny / l;
    }
  }
  let sp = speed;
  const p = { x: sc.x, y: sc.y };
  if (inCreek(p)) {
    // Wading.
    sp = Math.min(sp, 3);
    if (!sc.wet) g.events.push('wade');
    sc.wet = true;
  } else if (inPuddle(p)) {
    sp *= 0.8;
    if (!sc.wet) g.events.push('puddle');
    sc.wet = true;
  }
  // Never closer than the bushes let her (unless that's where the stick is).
  sc.x += dx * Math.min(sp * dt, d);
  sc.y += dy * Math.min(sp * dt, d);
  for (const b of BUSHES) {
    if (b === except) continue;
    const ox = sc.x - b.x;
    const oy = sc.y - b.y;
    const od = Math.hypot(ox, oy);
    if (od < b.r + 0.3 && od > 1e-6) {
      sc.x = b.x + (ox / od) * (b.r + 0.3);
      sc.y = b.y + (oy / od) * (b.r + 0.3);
    }
  }
  const want = Math.atan2(dy, dx);
  let dh = want - sc.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  sc.heading += Math.max(-dt * 10, Math.min(dt * 10, dh));
  // Hopping the log.
  const ld = logDist(sc);
  const wasHop = sc.hop > 0;
  sc.hop = ld < 0.9 ? Math.cos((ld / 0.9) * (Math.PI / 2)) : 0;
  if (sc.hop > 0 && !wasHop) g.events.push('hop');
  sc.moving = true;
}

/** Whole session, end to end, for a player that throws each time `aim(g)` says. */
export function playSession(seed: number, aim: (g: FetchGame) => { kind: StickKind; angle: number; power: number }, hurry = false): FetchGame {
  const g = createFetch(seed);
  let guard = 0;
  while (g.phase !== 'done' && guard++ < 120 * 600) {
    if (g.phase === 'aim') {
      const a = aim(g);
      throwStick(g, a.kind, a.angle, a.power);
      if (hurry) whistle(g);
    }
    stepFetch(g, STEP);
    g.events.length = 0;
  }
  return g;
}
