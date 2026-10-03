// Laser pointer with Ranger on the living-room floor. Somebody on the
// couch has the pointer; Ranger has opinions. He watches the red dot,
// creeps up on it low to the boards, wiggles his back end, and leaps — and
// either lands with it under his paws (smug) or skids past it and licks a
// paw as if that was the plan all along.
//
// He's a cat, so what he does depends on how interesting the dot is: a
// dot that darts and stops near him, or ducks behind the couch and peeks
// out again, winds him up; one that's waved about wildly, parked in one
// place, or switched off bores him, and a bored cat grooms, chases a moth,
// stares at the wall or flops over instead. There's no losing: a minute
// of play, and the score is how many times he caught it.
//
// Pure simulation, no DOM. The floor is in "room units" (about a foot
// each), the couch's corner in the top-left; the UI steps it and draws it.

import { mulberry32 } from '../../engine/Random';

export const ROOM_W = 6;
export const ROOM_H = 8;
/** One minute on the clock: the session. */
export const SESSION_TIME = 60;
export const STEP = 1 / 120;
/** The couch's corner pokes into the room here: a dot in it is hidden from Ranger. */
export const COUCH = { x: 0, y: 0, w: 2.3, h: 1.5 };
/** Landing within this of the dot is a catch. */
export const CATCH_R = 0.42;
/** He'll only wiggle-and-pounce from this close. */
export const POUNCE_RANGE = 2.0;
/** Slower than this, the dot is "still" (units/s): it's stopped, and worth a pounce. */
export const MOVE_SPEED = 0.8;
/** Faster than this it's being flicked about, which is no fun at all. */
export const WILD_SPEED = 9;
/** How long a dot can sit still before it gets boring, seconds. */
export const STILL_BORING = 2.2;
/** He's only keen enough to stalk from this interest up. */
export const STALK_INTEREST = 0.4;

export type CatMode =
  | 'watch' // sitting up, head tracking the dot
  | 'search' // the dot's gone: looking about for it, puzzled
  | 'stalk' // low crouch, slow creep
  | 'wiggle' // the butt-wiggle: the tell before the pounce
  | 'pounce' // in the air
  | 'caught' // landed on it: smug
  | 'miss' // overshot, skidded, and now licking a paw as if he meant it
  | 'groom' // couldn't care less
  | 'moth' // something more interesting fluttered past
  | 'stare' // staring at the wall where the dot was
  | 'zoomies' // a sudden lap of the room
  | 'flop' // flopped over on his side
  | 'content'; // the end: flopped, happy

export interface Pt {
  x: number;
  y: number;
}

export interface LaserCat {
  x: number;
  y: number;
  /** Which way his body points (radians, 0 = +x, screen y down). */
  heading: number;
  /** Which way he's looking. */
  look: number;
  mode: CatMode;
  /** Seconds in the current mode, and how long it lasts (for the timed ones). */
  modeT: number;
  modeDur: number;
  /** A pounce or skid: where from and to. */
  from: Pt;
  to: Pt;
  /** Height off the floor, 0..1, mid-leap. */
  hop: number;
}

export type LaserEvent = 'catch' | 'miss' | 'pounce' | 'zoomies' | 'moth' | 'groom' | 'flop' | 'stare';

export interface LaserGame {
  t: number;
  rng: () => number;
  /** Where the pointer's aimed (null: switched off). */
  pointer: Pt | null;
  /** The dot as it lags behind the hand, before its tremble. */
  base: Pt;
  /** The dot as drawn and seen: base plus a little hand tremble. */
  dot: Pt;
  on: boolean;
  /** Under the couch's corner, where Ranger can't see it. */
  hidden: boolean;
  /** Smoothed speed of the dot, units/s. */
  speed: number;
  /** Where Ranger last saw it. */
  lastSeen: Pt;
  stillT: number;
  movingT: number;
  hiddenT: number;
  offT: number;
  /** 0 (bored) .. 1 (wound right up). */
  interest: number;
  cat: LaserCat;
  /** A moth, while there is one. */
  moth: Pt | null;
  catches: number;
  pounces: number;
  /** Things that just happened, for the UI to react to (drained by it). */
  events: LaserEvent[];
  /** Seconds until he next considers doing something else entirely. */
  whimT: number;
  over: boolean;
}

export function createLaser(seed: number): LaserGame {
  const rng = mulberry32(seed);
  const c = { x: ROOM_W * 0.55, y: ROOM_H * 0.62 };
  return {
    t: 0,
    rng,
    pointer: null,
    base: { ...c },
    dot: { ...c },
    on: false,
    hidden: false,
    speed: 0,
    lastSeen: { x: ROOM_W / 2, y: ROOM_H * 0.3 },
    stillT: 0,
    movingT: 0,
    hiddenT: 0,
    offT: 0,
    interest: 0.5,
    cat: { x: c.x, y: c.y, heading: -Math.PI / 2, look: -Math.PI / 2, mode: 'search', modeT: 0, modeDur: 0, from: { ...c }, to: { ...c }, hop: 0 },
    moth: null,
    catches: 0,
    pounces: 0,
    events: [],
    whimT: 2,
    over: false,
  };
}

/** The hand moved (or let go: null). Points are clamped into the room. */
export function setPointer(g: LaserGame, p: Pt | null) {
  if (!p) {
    g.pointer = null;
    return;
  }
  g.pointer = { x: clamp(p.x, 0.05, ROOM_W - 0.05), y: clamp(p.y, 0.05, ROOM_H - 0.05) };
}

export function inCouch(p: Pt): boolean {
  return p.x < COUCH.x + COUCH.w && p.y < COUCH.y + COUCH.h;
}

/** Time left on the clock, seconds. */
export function timeLeft(g: LaserGame): number {
  return Math.max(0, SESSION_TIME - g.t);
}

/** How keen he looks: the interest, in five paw prints. */
export function interestPaws(g: LaserGame): number {
  return Math.round(g.interest * 5);
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Turns angle `a` toward `b` by at most `rate` radians. */
function turn(a: number, b: number, rate: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + clamp(d, -rate, rate);
}

function setMode(g: LaserGame, mode: CatMode, dur = 0) {
  g.cat.mode = mode;
  g.cat.modeT = 0;
  g.cat.modeDur = dur;
}

/** Keeps him on the floor and out from under the couch. */
function keepInRoom(c: LaserCat) {
  const m = 0.5;
  c.x = clamp(c.x, m, ROOM_W - m);
  c.y = clamp(c.y, m, ROOM_H - m);
  if (c.x < COUCH.x + COUCH.w + m && c.y < COUCH.y + COUCH.h + m) {
    // Out the nearer side.
    const outX = COUCH.x + COUCH.w + m - c.x;
    const outY = COUCH.y + COUCH.h + m - c.y;
    if (outX < outY) c.x += outX;
    else c.y += outY;
  }
}

/** One fixed step of play. */
export function stepLaser(g: LaserGame, dt: number) {
  if (g.over) return;
  g.t += dt;
  stepDot(g, dt);
  stepInterest(g, dt);
  stepCat(g, dt);
  if (g.t >= SESSION_TIME) {
    g.over = true;
    // The end: he flops down where he is, happy.
    setMode(g, 'content');
    g.cat.hop = 0;
  }
}

// ------------------------------------------------------------ the dot

function stepDot(g: LaserGame, dt: number) {
  const wasHidden = g.hidden;
  if (!g.pointer) {
    if (g.on) g.lastSeen = { ...g.base };
    g.on = false;
    g.hidden = false;
    g.speed = 0;
    g.offT += dt;
    g.movingT = 0;
    g.stillT = 0;
    return;
  }
  if (!g.on) {
    // It clicks on right where the hand is pointing.
    g.on = true;
    g.base = { ...g.pointer };
    g.speed = 0;
    g.stillT = 0;
    g.movingT = 0;
    g.offT = 0;
  } else {
    // A hand-held pointer lags a touch behind where you mean it to be.
    const k = 1 - Math.exp(-dt * 18);
    const ox = g.base.x;
    const oy = g.base.y;
    g.base.x += (g.pointer.x - g.base.x) * k;
    g.base.y += (g.pointer.y - g.base.y) * k;
    const inst = Math.hypot(g.base.x - ox, g.base.y - oy) / dt;
    g.speed += (inst - g.speed) * Math.min(1, dt * 12);
  }
  // ...and trembles a little, the way a hand does.
  const t = g.t;
  g.dot.x = g.base.x + 0.022 * (Math.sin(t * 13.1) + Math.sin(t * 5.7 + 1.3));
  g.dot.y = g.base.y + 0.022 * (Math.sin(t * 11.3 + 0.4) + Math.sin(t * 6.1 + 2.2));
  g.hidden = inCouch(g.base);
  if (g.hidden) g.hiddenT += dt;
  else {
    if (wasHidden && g.hiddenT > 0.3 && g.hiddenT < 4) {
      // Peekaboo from behind the couch: the best thing that's ever happened.
      g.interest = Math.min(1, g.interest + 0.14);
    }
    g.hiddenT = 0;
    g.lastSeen = { ...g.base };
  }
}

function stepInterest(g: LaserGame, dt: number) {
  const c = g.cat;
  const busy = c.mode === 'pounce' || c.mode === 'caught' || c.mode === 'miss';
  if (!g.on) g.interest -= 0.05 * dt;
  else if (g.hidden) {
    if (g.hiddenT > 4) g.interest -= 0.06 * dt;
  } else {
    const d = dist(c, g.base);
    const near = d > 0.6 && d < 3;
    if (g.speed > WILD_SPEED) {
      // Waved about like that it's just a streak: no fun to chase.
      g.interest -= 0.9 * dt;
      g.movingT = 0;
      g.stillT = 0;
    } else if (g.speed > MOVE_SPEED) {
      g.movingT += dt;
      g.stillT = 0;
      g.interest += (near ? 0.06 : 0.02) * dt;
    } else {
      // Stop-and-go is what does it: a dart, then a sudden stop.
      if (g.movingT > 0.2) g.interest += near ? 0.14 : 0.06;
      g.movingT = 0;
      g.stillT += dt;
      if (g.stillT > STILL_BORING && !busy) g.interest -= 0.2 * dt;
    }
    // Shone right on him, it's just confusing.
    if (d < 0.45 && !busy) g.interest -= 0.15 * dt;
  }
  g.interest = clamp(g.interest, 0, 1);
}

// ------------------------------------------------------------ Ranger

const WHIMS: CatMode[] = ['groom', 'moth', 'stare', 'zoomies', 'flop'];
const WHIM_DUR: Record<string, number> = { groom: 2.4, moth: 2.6, stare: 1.8, zoomies: 2.4, flop: 2.2 };

function visible(g: LaserGame) {
  return g.on && !g.hidden;
}

function stepCat(g: LaserGame, dt: number) {
  const c = g.cat;
  c.modeT += dt;
  const toDot = Math.atan2(g.base.y - c.y, g.base.x - c.x);
  const d = dist(c, g.base);
  switch (c.mode) {
    case 'watch': {
      c.hop = 0;
      if (!g.on) {
        setMode(g, 'search');
        break;
      }
      // Head follows the dot (or the couch edge where it vanished); the body comes round slowly.
      const target = g.hidden ? Math.atan2(g.lastSeen.y - c.y, g.lastSeen.x - c.x) : toDot;
      c.look = turn(c.look, target, dt * 9);
      c.heading = turn(c.heading, target, dt * 2.2);
      if (whim(g, dt)) break;
      if (visible(g) && g.interest >= STALK_INTEREST && c.modeT > 0.6 + (1 - g.interest) * 1.5) setMode(g, 'stalk');
      break;
    }
    case 'search': {
      // Where'd it go? Looking this way and that.
      c.look = c.heading + Math.sin(c.modeT * 2.4) * 1.1;
      if (g.on) {
        g.interest = Math.min(1, g.interest + 0.05);
        setMode(g, 'watch');
      } else if (c.modeT > 3) {
        setMode(g, 'stare', 99);
      }
      break;
    }
    case 'stalk': {
      if (!visible(g) || g.interest < 0.25 || c.modeT > 5) {
        setMode(g, 'watch');
        break;
      }
      c.look = turn(c.look, toDot, dt * 9);
      c.heading = turn(c.heading, toDot, dt * 4);
      if (d > POUNCE_RANGE * 0.85) {
        // Low to the boards, creeping in.
        const sp = 0.9 * dt;
        c.x += Math.cos(c.heading) * sp;
        c.y += Math.sin(c.heading) * sp;
        keepInRoom(c);
      }
      if (d <= POUNCE_RANGE && g.speed < MOVE_SPEED) setMode(g, 'wiggle', 0.6 + g.rng() * 0.6);
      break;
    }
    case 'wiggle': {
      c.look = turn(c.look, toDot, dt * 9);
      c.heading = turn(c.heading, toDot, dt * 4);
      if (!visible(g)) {
        setMode(g, 'watch');
        break;
      }
      if (c.modeT >= c.modeDur) {
        if (d > POUNCE_RANGE * 1.3) {
          setMode(g, 'stalk');
          break;
        }
        // He leaps for where the dot is right now — and he's only as good a shot as he is keen.
        const spread = 0.3 + 0.7 * (1 - g.interest) ** 2 + 0.1 * d;
        const err = spread * g.rng();
        const ea = g.rng() * Math.PI * 2;
        c.from = { x: c.x, y: c.y };
        c.to = { x: g.base.x + Math.cos(ea) * err, y: g.base.y + Math.sin(ea) * err };
        c.heading = Math.atan2(c.to.y - c.y, c.to.x - c.x);
        c.look = c.heading;
        g.pounces++;
        g.events.push('pounce');
        setMode(g, 'pounce', 0.22 + 0.07 * d);
      }
      break;
    }
    case 'pounce': {
      const u = Math.min(1, c.modeT / c.modeDur);
      const e = 1 - (1 - u) * (1 - u);
      c.x = c.from.x + (c.to.x - c.from.x) * e;
      c.y = c.from.y + (c.to.y - c.from.y) * e;
      c.hop = Math.sin(u * Math.PI);
      if (u >= 1) {
        c.hop = 0;
        keepInRoom(c);
        if (visible(g) && dist(c.to, g.base) < CATCH_R) {
          g.catches++;
          g.interest = Math.min(1, g.interest + 0.04);
          g.events.push('catch');
          setMode(g, 'caught', 1.8);
        } else {
          // Overshoots, and skids on the boards.
          c.from = { x: c.x, y: c.y };
          c.to = { x: c.x + Math.cos(c.heading) * 0.55, y: c.y + Math.sin(c.heading) * 0.55 };
          g.events.push('miss');
          setMode(g, 'miss', 2.0);
        }
      }
      break;
    }
    case 'caught': {
      // Smug. The dot is under his paws, so he says.
      if (c.modeT >= c.modeDur) setMode(g, 'watch');
      break;
    }
    case 'miss': {
      const u = Math.min(1, c.modeT / 0.4);
      const e = 1 - (1 - u) * (1 - u);
      c.x = c.from.x + (c.to.x - c.from.x) * e;
      c.y = c.from.y + (c.to.y - c.from.y) * e;
      keepInRoom(c);
      if (c.modeT >= c.modeDur) setMode(g, 'watch');
      break;
    }
    case 'zoomies': {
      // A lap of the room, flat out, for no reason anyone can tell.
      const u = c.modeT / c.modeDur;
      const a = c.from.x + u * Math.PI * 2;
      const nx = ROOM_W * 0.55 + Math.cos(a) * 2;
      const ny = ROOM_H * 0.58 + Math.sin(a) * 2.4;
      // Chasing a point round the loop, so he swings out onto it rather than jumping there.
      c.heading = Math.atan2(ny - c.y, nx - c.x);
      c.look = c.heading;
      const k = Math.min(1, dt * 8);
      c.x += (nx - c.x) * k;
      c.y += (ny - c.y) * k;
      keepInRoom(c);
      if (c.modeT >= c.modeDur) {
        g.interest = Math.min(1, g.interest + 0.25);
        setMode(g, 'watch');
      }
      break;
    }
    case 'moth': {
      // A moth (or a dust mote in the light) drifting past his nose.
      const k = c.modeT;
      g.moth = { x: c.x + Math.cos(k * 1.6) * 0.9 + k * 0.25, y: c.y - 0.6 + Math.sin(k * 3.1) * 0.35 - k * 0.3 };
      c.look = Math.atan2(g.moth.y - c.y, g.moth.x - c.x);
      if (c.modeT >= c.modeDur) {
        g.moth = null;
        setMode(g, 'watch');
      }
      break;
    }
    case 'stare': {
      // At the wall, where the dot was. Something might still be there.
      const wall = { x: clamp(g.lastSeen.x, 0, ROOM_W), y: 0 };
      c.look = turn(c.look, Math.atan2(wall.y - c.y, wall.x - c.x), dt * 4);
      if (g.on && c.modeDur > 50) {
        g.interest = Math.min(1, g.interest + 0.05);
        setMode(g, 'watch');
      } else if (c.modeT >= c.modeDur) setMode(g, g.on ? 'watch' : 'search');
      break;
    }
    case 'groom':
    case 'flop': {
      if (c.modeT >= c.modeDur) {
        if (c.mode === 'flop') g.interest = Math.min(1, g.interest + 0.05);
        setMode(g, 'watch');
      }
      break;
    }
    case 'content':
      break;
  }
}

/** Now and then, and more often the more bored he is, he does something else entirely. */
function whim(g: LaserGame, dt: number): boolean {
  g.whimT -= dt;
  if (g.whimT > 0) return false;
  g.whimT = 1;
  const p = 0.03 + 0.3 * (1 - g.interest) ** 2;
  if (g.rng() >= p) return false;
  const m = WHIMS[Math.floor(g.rng() * WHIMS.length)];
  setMode(g, m, WHIM_DUR[m]);
  if (m === 'zoomies') g.cat.from = { x: Math.atan2(g.cat.y - ROOM_H * 0.58, g.cat.x - ROOM_W * 0.55), y: 0 };
  g.events.push(m as LaserEvent);
  // No two whims back to back.
  g.whimT = WHIM_DUR[m] + 2;
  return true;
}
