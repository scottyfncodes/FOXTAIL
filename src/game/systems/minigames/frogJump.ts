// A frog crossing the slack water of the creek on the lily pads, seen from
// above: the near bank at the bottom, the far bank at the top. Hold to
// gather the jump — it swells and eases back, so let go at the right
// moment — and the frog leaps toward your finger.
//
// Pure simulation, no DOM. "Pond units" across (POND_W) and along (each
// stage's length, near bank at the bottom, far bank at y = 0). Three
// stretches of water, each a little harder: pads further apart and
// smaller, some drifting on the current, flowering ones that bob under
// for a moment, and a turtle who doesn't mind a passenger until she dives.
// A miss is a splash and a paddle back, never a game over.

export const POND_W = 6;
/** The far bank: land beyond this line and the stretch is crossed. */
export const FAR_EDGE = 0.6;
/** The near bank's depth at the bottom of each stretch. */
export const NEAR_DEPTH = 0.6;
export const FROG_R = 0.22;
export const MIN_JUMP = 0.7;
export const MAX_JUMP = 3.0;
/** Seconds for the gathered jump to swell to full and ease back again. */
export const CHARGE_PERIOD = 1.5;
/** Seconds in the air. */
export const JUMP_TIME = 0.42;
/** A landing this far past a pad's rim still counts: frogs are grabby. */
export const LAND_SLACK = 0.14;
/** A splash: a moment of indignation, then a paddle back at this speed (units/s). */
export const SPLASH_PAUSE = 0.6;
export const SWIM_SPEED = 2.2;
/** How close to a dragonfly a landing has to be to snap it up. */
export const FLY_REACH = 0.75;

/** A hop onto a new pad further across than the frog has been yet... */
export const HOP_POINTS = 2;
/** ...or onto a new one off to the side (worth a look, but it isn't progress). */
export const SIDE_POINTS = 1;
export const FLY_POINTS = 3;
export const STAGE_POINTS = 4;
/** The run of clean hops that starts paying a bonus, and the one that pays double. */
export const COMBO_1 = 4;
export const COMBO_2 = 8;

export type PadKind = 'pad' | 'flower' | 'turtle';

export interface Pad {
  kind: PadKind;
  x: number;
  y: number;
  r: number;
  /** Swaying across on the current: x moves by `amp` either way over `period` seconds. */
  drift?: { amp: number; period: number; phase: number };
  /** Goes under for `under` seconds every `period` (flowering pads, the turtle diving). */
  bob?: { period: number; under: number; phase: number };
}

export interface Fly {
  /** The pad it hovers over. */
  pad: number;
  dx: number;
  dy: number;
}

export type Weather = 'sun' | 'evening' | 'rain';

export interface Stage {
  name: string;
  sub: string;
  weather: Weather;
  /** Depth of the stretch: the near bank's edge is at length − NEAR_DEPTH. */
  length: number;
  pads: Pad[];
  flies: Fly[];
}

/** How long before a pad goes under it starts to rock: the cue to get off it. */
export const ROCK_WARNING = 1.4;

// Three stretches, crossed in turn. Laid out by hand so there's always a
// way across, with a pad or two off to the side for a dragonfly.
export const STAGES: Stage[] = [
  {
    name: 'The Shallows',
    sub: 'Sunny, big still pads',
    weather: 'sun',
    length: 9,
    pads: [
      { kind: 'pad', x: 3.0, y: 7.0, r: 0.66 },
      { kind: 'pad', x: 1.8, y: 5.5, r: 0.62 },
      { kind: 'pad', x: 3.5, y: 4.3, r: 0.62 },
      { kind: 'pad', x: 2.2, y: 2.9, r: 0.6 },
      { kind: 'pad', x: 3.7, y: 1.8, r: 0.58 },
      { kind: 'pad', x: 5.0, y: 6.1, r: 0.5 },
      { kind: 'pad', x: 0.8, y: 3.7, r: 0.5 },
      { kind: 'pad', x: 5.1, y: 3.2, r: 0.48 },
    ],
    flies: [{ pad: 5, dx: 0.1, dy: -0.2 }],
  },
  {
    name: 'Bend in the Creek',
    sub: 'Evening · the current carries some',
    weather: 'evening',
    length: 12,
    pads: [
      { kind: 'pad', x: 2.6, y: 10.0, r: 0.56 },
      { kind: 'pad', x: 4.0, y: 8.4, r: 0.52, drift: { amp: 0.6, period: 5, phase: 0 } },
      { kind: 'pad', x: 2.2, y: 6.9, r: 0.5 },
      { kind: 'flower', x: 3.8, y: 5.4, r: 0.52, bob: { period: 6.5, under: 1.6, phase: 0.2 } },
      { kind: 'pad', x: 1.8, y: 4.0, r: 0.48, drift: { amp: 0.7, period: 6, phase: 1.5 } },
      { kind: 'pad', x: 3.4, y: 2.6, r: 0.48 },
      { kind: 'pad', x: 2.4, y: 1.5, r: 0.46 },
      { kind: 'pad', x: 0.9, y: 8.0, r: 0.42 },
      { kind: 'pad', x: 5.2, y: 3.4, r: 0.42 },
      { kind: 'pad', x: 5.1, y: 6.3, r: 0.4, drift: { amp: 0.3, period: 4, phase: 0.7 } },
    ],
    flies: [
      { pad: 7, dx: 0, dy: -0.2 },
      { pad: 8, dx: -0.1, dy: -0.15 },
    ],
  },
  {
    name: 'Rain on the Water',
    sub: 'A light shower · mind the turtle',
    weather: 'rain',
    length: 14,
    pads: [
      { kind: 'pad', x: 3.0, y: 12.0, r: 0.5 },
      { kind: 'flower', x: 1.7, y: 10.4, r: 0.46, bob: { period: 6, under: 1.6, phase: 0.5 } },
      { kind: 'pad', x: 3.6, y: 9.4, r: 0.44, drift: { amp: 0.8, period: 5.5, phase: 0.4 } },
      { kind: 'turtle', x: 3.0, y: 7.6, r: 0.48, drift: { amp: 1.9, period: 11, phase: 0 }, bob: { period: 9, under: 2.0, phase: 0.6 } },
      { kind: 'pad', x: 1.5, y: 6.2, r: 0.42 },
      { kind: 'flower', x: 3.4, y: 5.0, r: 0.44, bob: { period: 7, under: 1.7, phase: 0 } },
      { kind: 'pad', x: 2.0, y: 3.6, r: 0.4, drift: { amp: 0.9, period: 6.5, phase: 2 } },
      { kind: 'pad', x: 3.8, y: 2.4, r: 0.4 },
      { kind: 'pad', x: 2.6, y: 1.4, r: 0.4 },
      { kind: 'pad', x: 5.2, y: 10.8, r: 0.38 },
      { kind: 'pad', x: 0.7, y: 4.6, r: 0.38 },
      { kind: 'pad', x: 5.0, y: 4.0, r: 0.36, drift: { amp: 0.4, period: 4.5, phase: 1 } },
    ],
    flies: [
      { pad: 9, dx: 0, dy: -0.2 },
      { pad: 10, dx: 0.1, dy: -0.2 },
      { pad: 3, dx: 0, dy: -0.35 },
    ],
  },
];

export interface PadState {
  x: number;
  y: number;
  r: number;
  under: boolean;
  /** 0..1: how hard it's rocking, as it gets ready to go under. */
  rock: number;
}

/** Where a pad is at `t` seconds into the stretch, and whether it's above water. */
export function padAt(p: Pad, t: number): PadState {
  let x = p.x;
  if (p.drift) x += p.drift.amp * Math.sin((t / p.drift.period) * Math.PI * 2 + p.drift.phase);
  let under = false;
  let rock = 0;
  if (p.bob) {
    const c = (((t / p.bob.period + p.bob.phase) % 1) + 1) % 1;
    const upFor = 1 - p.bob.under / p.bob.period;
    if (c >= upFor) under = true;
    else {
      const toUnder = (upFor - c) * p.bob.period;
      if (toUnder < ROCK_WARNING) rock = 1 - toUnder / ROCK_WARNING;
    }
  }
  return { x, y: p.y, r: p.r, under, rock };
}

/** How far a jump goes after holding for `hold` seconds: swelling to full and easing back. */
export function chargeLength(hold: number): number {
  const u = 0.5 - 0.5 * Math.cos((Math.max(0, hold) / CHARGE_PERIOD) * Math.PI * 2);
  return MIN_JUMP + (MAX_JUMP - MIN_JUMP) * u;
}

/** The shortest hold that gives a jump of `len` (for the tests' frogs). */
export function holdFor(len: number): number {
  const u = Math.max(0, Math.min(1, (len - MIN_JUMP) / (MAX_JUMP - MIN_JUMP)));
  return (Math.acos(1 - 2 * u) / (Math.PI * 2)) * CHARGE_PERIOD;
}

export type Perch = number | 'near' | 'far';

export interface Frog {
  x: number;
  y: number;
  /** Which way it faces, radians (−π/2 is up the screen, toward the far bank). */
  face: number;
  on: Perch;
  /** Where on the pad it's sitting, from the centre. */
  offX: number;
  offY: number;
  phase: 'sit' | 'jump' | 'swim';
  /** The jump in progress: from, to, and when it left. */
  jump: { sx: number; sy: number; tx: number; ty: number; t0: number };
  /** Where it jumped from: where a splash swims back to. */
  from: Perch;
  /** Swimming back: to which perch, and since when. */
  swimTo: Perch;
  swimT0: number;
}

export type FrogEvent =
  | { type: 'hop'; points: number; combo: number; fresh: boolean; pad: number }
  | { type: 'fly'; points: number }
  | { type: 'splash'; dunk: boolean }
  | { type: 'ashore' }
  | { type: 'stage'; points: number; last: boolean };

export class FrogRun {
  stage = 0;
  /** Seconds into the current stretch. */
  t = 0;
  score = 0;
  combo = 0;
  hops = 0;
  splashes = 0;
  fliesCaught = 0;
  /** Waiting for the next stretch (the panel shows its banner first). */
  cleared = false;
  done = false;
  visited = new Set<number>();
  /** The furthest across the frog has got this stretch (smallest y). */
  furthest = 0;
  caught = new Set<number>();
  frog: Frog;

  constructor() {
    this.frog = this.freshFrog();
    this.furthest = this.frog.y;
  }

  get stageDef(): Stage {
    return STAGES[this.stage];
  }

  private freshFrog(): Frog {
    const L = STAGES[this.stage].length;
    return {
      x: POND_W / 2,
      y: L - NEAR_DEPTH / 2,
      face: -Math.PI / 2,
      on: 'near',
      offX: 0,
      offY: 0,
      phase: 'sit',
      jump: { sx: 0, sy: 0, tx: 0, ty: 0, t0: 0 },
      from: 'near',
      swimTo: 'near',
      swimT0: 0,
    };
  }

  /** On to the next stretch, from its near bank. */
  nextStage() {
    if (!this.cleared || this.done) return;
    this.stage++;
    this.t = 0;
    this.cleared = false;
    this.visited.clear();
    this.caught.clear();
    this.frog = this.freshFrog();
    this.furthest = this.frog.y;
  }

  get canJump(): boolean {
    return this.frog.phase === 'sit' && !this.cleared && !this.done;
  }

  /** Where a jump would land: `len` units toward (dx, dy) from the frog, kept inside the creek's width. */
  target(dx: number, dy: number, len: number): { x: number; y: number } {
    const d = Math.hypot(dx, dy) || 1;
    const x = Math.max(0.15, Math.min(POND_W - 0.15, this.frog.x + (dx / d) * len));
    const y = Math.max(-0.2, Math.min(this.stageDef.length, this.frog.y + (dy / d) * len));
    return { x, y };
  }

  /** Let go: leap toward (dx, dy) after holding for `hold` seconds. */
  jump(dx: number, dy: number, hold: number): boolean {
    if (!this.canJump) return false;
    const f = this.frog;
    const to = this.target(dx, dy, chargeLength(hold));
    f.face = Math.atan2(to.y - f.y, to.x - f.x);
    f.jump = { sx: f.x, sy: f.y, tx: to.x, ty: to.y, t0: this.t };
    f.from = f.on;
    f.phase = 'jump';
    return true;
  }

  /** Where a perch is right now (pads move). */
  perchAt(p: Perch): { x: number; y: number; under: boolean } {
    const L = this.stageDef.length;
    if (p === 'near') return { x: POND_W / 2, y: L - NEAR_DEPTH / 2, under: false };
    if (p === 'far') return { x: this.frog.x, y: FAR_EDGE / 2, under: false };
    const s = padAt(this.stageDef.pads[p], this.t);
    return { x: s.x, y: s.y, under: s.under };
  }

  /** Where a dragonfly is hovering right now. */
  flyAt(i: number): { x: number; y: number } {
    const fl = this.stageDef.flies[i];
    const s = padAt(this.stageDef.pads[fl.pad], this.t);
    return { x: s.x + fl.dx, y: s.y + fl.dy };
  }

  step(dt: number): FrogEvent[] {
    const out: FrogEvent[] = [];
    if (this.done || this.cleared) return out;
    this.t += dt;
    const f = this.frog;
    if (f.phase === 'sit') {
      if (typeof f.on === 'number') {
        const s = padAt(this.stageDef.pads[f.on], this.t);
        f.x = s.x + f.offX;
        f.y = s.y + f.offY;
        if (s.under) {
          // The pad's gone out from under it (or the turtle dived): a dunking.
          this.combo = 0;
          this.splashes++;
          f.phase = 'swim';
          f.swimTo = f.from === f.on ? 'near' : f.from;
          f.swimT0 = this.t;
          out.push({ type: 'splash', dunk: true });
        }
      }
    } else if (f.phase === 'jump') {
      const u = (this.t - f.jump.t0) / JUMP_TIME;
      if (u >= 1) {
        f.x = f.jump.tx;
        f.y = f.jump.ty;
        this.land(out);
      } else {
        f.x = f.jump.sx + (f.jump.tx - f.jump.sx) * u;
        f.y = f.jump.sy + (f.jump.ty - f.jump.sy) * u;
      }
    } else if (f.phase === 'swim') {
      if (this.t - f.swimT0 > SPLASH_PAUSE) {
        const to = this.perchAt(f.swimTo);
        const dx = to.x - f.x;
        const dy = to.y - f.y;
        const d = Math.hypot(dx, dy);
        const step = SWIM_SPEED * dt;
        if (d <= step + 0.02) {
          // Climbed back out, once there's something to climb onto.
          if (!to.under) {
            f.x = to.x;
            f.y = to.y;
            f.on = f.swimTo;
            f.offX = 0;
            f.offY = 0;
            f.phase = 'sit';
            f.face = -Math.PI / 2;
          }
        } else {
          f.x += (dx / d) * step;
          f.y += (dy / d) * step;
          f.face = Math.atan2(dy, dx);
        }
      }
    }
    return out;
  }

  private land(out: FrogEvent[]) {
    const f = this.frog;
    const st = this.stageDef;
    if (f.y <= FAR_EDGE) {
      f.on = 'far';
      f.phase = 'sit';
      const last = this.stage === STAGES.length - 1;
      this.score += STAGE_POINTS;
      this.cleared = true;
      if (last) this.done = true;
      out.push({ type: 'stage', points: STAGE_POINTS, last });
      return;
    }
    if (f.y >= st.length - NEAR_DEPTH) {
      f.on = 'near';
      f.phase = 'sit';
      f.offX = 0;
      f.offY = 0;
      out.push({ type: 'ashore' });
      return;
    }
    // The pad under it, if any (the nearest, if two overlap).
    let best = -1;
    let bestD = Infinity;
    st.pads.forEach((p, i) => {
      const s = padAt(p, this.t);
      if (s.under) return;
      const d = Math.hypot(f.x - s.x, f.y - s.y);
      if (d <= s.r + LAND_SLACK && d < bestD) {
        best = i;
        bestD = d;
      }
    });
    if (best < 0) {
      this.combo = 0;
      this.splashes++;
      f.phase = 'swim';
      f.swimTo = f.from;
      f.swimT0 = this.t;
      out.push({ type: 'splash', dunk: false });
      return;
    }
    const s = padAt(st.pads[best], this.t);
    // Sit where it landed, scooted in a little from the rim.
    let ox = f.x - s.x;
    let oy = f.y - s.y;
    const od = Math.hypot(ox, oy);
    const keep = s.r * 0.5;
    if (od > keep) {
      ox *= keep / od;
      oy *= keep / od;
    }
    f.on = best;
    f.offX = ox;
    f.offY = oy;
    f.phase = 'sit';
    const fresh = !this.visited.has(best) && best !== f.from;
    let points = 0;
    if (fresh) {
      this.visited.add(best);
      this.combo++;
      this.hops++;
      const forward = s.y < this.furthest - 0.3;
      points = (forward ? HOP_POINTS : SIDE_POINTS) + (this.combo >= COMBO_2 ? 2 : this.combo >= COMBO_1 ? 1 : 0);
      this.score += points;
    }
    this.furthest = Math.min(this.furthest, s.y);
    out.push({ type: 'hop', points, combo: this.combo, fresh, pad: best });
    // Any dragonfly close enough is snapped up on the way down.
    st.flies.forEach((_, i) => {
      if (this.caught.has(i)) return;
      const p = this.flyAt(i);
      if (Math.hypot(p.x - f.x, p.y - f.y) <= FLY_REACH) {
        this.caught.add(i);
        this.fliesCaught++;
        this.score += FLY_POINTS;
        out.push({ type: 'fly', points: FLY_POINTS });
      }
    });
  }
}
