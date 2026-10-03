// Skipping stones on the slack water below Scott's fishing bend. A side
// view: Scott crouched on the near bank, the creek running away to the
// right, reeds and a heron on the far side.
//
// Pure simulation, no DOM. Distances are metres along the water from
// Scott's hand (x) and height above the surface (y, up). The stone flies
// under gravity; each time it meets the water it either skips — if it
// comes in shallow and quick enough — or goes in with a plop. A tap just
// as it touches down ("a good touch") is a little flick of luck and
// technique: it keeps more of its speed and skims flatter.

export const GRAVITY = 7;
/** Scott's crouched a little: the stone leaves his hand this high, metres. */
export const RELEASE_H = 0.6;
/** The far bank, metres from Scott's hand. A stone that gets there clatters up it. */
export const FAR_BANK = 28;
/** The hardest throw, metres a second. */
export const MAX_SPEED = 15;
/** Throws in a session. */
export const THROWS = 5;
/** What clattering up the far bank is worth, in skips. */
export const BANK_BONUS = 2;
/** It has to have skipped its way there: a lob over the water into the reeds earns nothing extra. */
export const BANK_MIN_SKIPS = 3;
/** Launch angles (radians) the arm can manage: a little down to fairly steep. */
export const MIN_ANGLE = (-12 * Math.PI) / 180;
export const MAX_ANGLE = (55 * Math.PI) / 180;
/** A tap this long before touchdown (seconds) counts as a good touch... */
export const TOUCH_EARLY = 0.14;
/** ...or this long after it, a moment of grace for slow thumbs. */
export const TOUCH_LATE = 0.06;
/** Taps further ahead of touchdown than this don't count at all (spamming won't help). */
export const TOUCH_ARM = 0.4;

export type StoneKind = 'flat' | 'round' | 'chip';

export interface StoneDef {
  kind: StoneKind;
  name: string;
  blurb: string;
  /** Fraction of forward speed kept by an ordinary skip... */
  keep: number;
  /** ...and by a good touch. */
  keepGood: number;
  /** How much of the downward speed comes back up. */
  rest: number;
  /** The water's lift at speed: a fast stone always hops a little, m/s per m/s. */
  lift: number;
  /** Steepest touchdown that still skips, degrees, with a full spin on it. */
  crit: number;
  /** Slower than this and it just goes in, m/s. */
  minSpeed: number;
  /** How fast it can be thrown, as a share of MAX_SPEED (a light chip doesn't carry the arm's weight). */
  speed: number;
  /** How much spin each ordinary skip loses. */
  spinLoss: number;
}

// Three kinds from the heap on the bank. The flat one is the classic; the
// round one is heavy and stubborn — few skips but it carries; the chip
// is a skittish little thing that dances when it's going slow.
export const STONES: Record<StoneKind, StoneDef> = {
  flat: { kind: 'flat', name: 'Flat', blurb: 'the best skipper', keep: 0.66, keepGood: 0.87, rest: 0.25, lift: 0.15, crit: 22, minSpeed: 2.8, speed: 1, spinLoss: 0.18 },
  round: { kind: 'round', name: 'Round', blurb: 'heavy, carries', keep: 0.8, keepGood: 0.93, rest: 0.2, lift: 0.12, crit: 18, minSpeed: 5.5, speed: 1, spinLoss: 0.12 },
  chip: { kind: 'chip', name: 'Chip', blurb: 'light, skittish', keep: 0.62, keepGood: 0.85, rest: 0.3, lift: 0.17, crit: 26, minSpeed: 1.6, speed: 0.8, spinLoss: 0.25 },
};

export const STONE_KINDS: StoneKind[] = ['flat', 'round', 'chip'];

export interface Stone {
  kind: StoneKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Spin, 1 fresh off the finger: a well-spun stone holds its line and skips steeper touchdowns. */
  spin: number;
  /** Seconds since the throw. */
  t: number;
  skips: number;
  goodTouches: number;
  /** In flight, sunk (plop), or up the far bank. */
  state: 'flying' | 'sunk' | 'bank';
  /** When the player tapped for this touchdown (stone time), if they have. */
  tapAt: number | null;
  /** The last touchdown, so a slightly late tap can still count. */
  lastSkip: { t: number; good: boolean } | null;
}

export type SkipEvent =
  | { type: 'skip'; x: number; good: boolean; n: number }
  | { type: 'sink'; x: number; why: 'steep' | 'slow' }
  | { type: 'bank'; x: number; clatter: boolean }

/** A fresh stone leaving Scott's hand at `angle` (radians up from level) with `power` 0..1. */
export function launch(kind: StoneKind, angle: number, power: number): Stone {
  const def = STONES[kind];
  const a = Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, angle));
  const p = Math.max(0, Math.min(1, power));
  const v = MAX_SPEED * def.speed * (0.25 + 0.75 * p);
  return {
    kind,
    x: 0,
    y: RELEASE_H,
    vx: Math.cos(a) * v,
    vy: Math.sin(a) * v,
    spin: 0.6 + 0.4 * p,
    t: 0,
    skips: 0,
    goodTouches: 0,
    state: 'flying',
    tapAt: null,
    lastSkip: null,
  };
}

/** Seconds until the stone next meets the water (Infinity if it's done). */
export function timeToWater(s: Stone): number {
  if (s.state !== 'flying') return Infinity;
  // y + vy t - g t²/2 = 0
  const disc = s.vy * s.vy + 2 * GRAVITY * Math.max(0, s.y);
  return (s.vy + Math.sqrt(disc)) / GRAVITY;
}

/**
 * The player tapped. It counts for the coming touchdown only when it's near
 * enough (no tapping all the way down the creek); just after a plain skip it
 * can still turn that skip into a good one. Returns what the tap did.
 */
export function tap(s: Stone): 'armed' | 'late' | 'early' | 'none' {
  if (s.state !== 'flying') return 'none';
  if (s.lastSkip && !s.lastSkip.good && s.t - s.lastSkip.t <= TOUCH_LATE) {
    // Just missed it: upgrade the skip that's already happened.
    const def = STONES[s.kind];
    s.vx *= def.keepGood / effectiveKeep(def, s.spin, false);
    s.vy *= 0.78;
    s.spin = Math.min(1, s.spin + def.spinLoss * 0.7);
    s.lastSkip.good = true;
    s.goodTouches++;
    return 'late';
  }
  if (s.tapAt !== null) return 'none';
  const ttw = timeToWater(s);
  if (ttw > TOUCH_ARM) return 'early';
  s.tapAt = s.t;
  return 'armed';
}

function effectiveKeep(def: StoneDef, spin: number, good: boolean): number {
  // A wobbling stone (little spin) digs in a bit more on each touch.
  return (good ? def.keepGood : def.keep) * (0.93 + 0.07 * spin);
}

/** Steepest touchdown, radians, that still skips for this stone with this much spin. */
export function critAngle(kind: StoneKind, spin: number): number {
  return ((STONES[kind].crit * (0.75 + 0.25 * spin)) * Math.PI) / 180;
}

/** Advances the stone by `dt` seconds; returns what happened at the water, if anything. */
export function stepStone(s: Stone, dt: number): SkipEvent | null {
  if (s.state !== 'flying') return null;
  const def = STONES[s.kind];
  s.t += dt;
  s.vy -= GRAVITY * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  if (s.x >= FAR_BANK) {
    s.x = FAR_BANK;
    s.state = 'bank';
    return { type: 'bank', x: s.x, clatter: reachedBank(s) };
  }
  if (s.y > 0 || s.vy >= 0) return null;
  // Touchdown.
  s.y = 0;
  const incidence = Math.atan2(-s.vy, s.vx);
  if (incidence > critAngle(s.kind, s.spin)) {
    s.state = 'sunk';
    return { type: 'sink', x: s.x, why: 'steep' };
  }
  if (s.vx < def.minSpeed) {
    s.state = 'sunk';
    return { type: 'sink', x: s.x, why: 'slow' };
  }
  const good = s.tapAt !== null && s.t - s.tapAt <= TOUCH_EARLY;
  s.tapAt = null;
  // A steep touchdown digs in and bleeds speed; a shallow one barely kisses the water.
  const steep = incidence / critAngle(s.kind, s.spin);
  s.vx *= effectiveKeep(def, s.spin, good) * (1 - 0.3 * steep * steep);
  // Bounce: some of the fall comes back, plus the lift a quick stone gets planing.
  let up = -s.vy * def.rest + def.lift * s.vx;
  // A good touch skims it flat: longer, lower hops.
  if (good) up *= 0.78;
  s.vy = up;
  s.spin = Math.max(0, s.spin - def.spinLoss * (good ? 0.3 : 1));
  s.skips++;
  if (good) s.goodTouches++;
  s.lastSkip = { t: s.t, good };
  return { type: 'skip', x: s.x, good, n: s.skips };
}

/** It skipped all the way over and clattered up the far bank (not just lobbed into the reeds). */
export function reachedBank(s: Stone): boolean {
  return s.state === 'bank' && s.skips >= BANK_MIN_SKIPS;
}

/** Skips a throw scores: one per skip, and a bonus for skipping right up the far bank. */
export function throwScore(s: Stone): number {
  return s.skips + (reachedBank(s) ? BANK_BONUS : 0);
}

/**
 * Plays a whole throw out at a fixed step. `tapper` decides, each step,
 * whether to tap (for tests and a simulated player).
 */
export function simulateThrow(kind: StoneKind, angle: number, power: number, tapper?: (s: Stone) => boolean, step = 1 / 240): { stone: Stone; events: SkipEvent[] } {
  const s = launch(kind, angle, power);
  const events: SkipEvent[] = [];
  for (let i = 0; i < 240 * 30 && s.state === 'flying'; i++) {
    if (tapper?.(s)) tap(s);
    const e = stepStone(s, step);
    if (e) events.push(e);
  }
  return { stone: s, events };
}

/** Where the stone will be over the next `seconds`, for the faint aiming arc. */
export function previewArc(kind: StoneKind, angle: number, power: number, seconds: number, points = 10): { x: number; y: number }[] {
  const s = launch(kind, angle, power);
  const out: { x: number; y: number }[] = [];
  for (let i = 1; i <= points; i++) {
    const t = (seconds * i) / points;
    const y = s.y + s.vy * t - (GRAVITY * t * t) / 2;
    if (y < 0) break;
    out.push({ x: s.vx * t, y });
  }
  return out;
}
