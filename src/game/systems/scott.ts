import { hasGrown } from './collection';
import type { GameState, ScottActivity, ScottState } from '../state';
import { SCOTT_SPOTS, findScottSpot, type ScottSpot, type ScottSpotKind } from '../data/scottSpots';
import { interiorWaypoint } from '../data/interior';
import { spotPosition, type AnchorOffset } from '../data/catSpots';
import { outdoorWaypoint } from '../data/worldMap';

// Ellen's husband, ambient and independent of the player: he potters
// between fixed spots on his own clock, tinkering, napping, snacking,
// or practicing his golf swing and putting, with no awareness of where
// Ellen or Scout are. Not a companion, not a guide — just someone else who
// lives here.

const TRAVEL_SPEED = 2.0; // tiles/sec, unhurried
/** How much faster he goes when he's running back to work. */
export const HURRY_FACTOR = 2.2;
const ARRIVE_DIST = 0.3;

const DURATIONS: Record<ScottSpotKind, [number, number]> = {
  tinker: [20, 40],
  nap: [40, 90],
  snack: [15, 30],
  golf: [30, 60],
  putt: [25, 45],
  tv: [45, 100],
  drink: [25, 50],
};

export const ACTIVITY_FOR_KIND: Record<ScottSpotKind, Exclude<ScottActivity, 'traveling'>> = {
  tinker: 'tinkering',
  nap: 'napping',
  snack: 'snacking',
  golf: 'golfing',
  putt: 'putting',
  tv: 'watchingTV',
  drink: 'relaxing',
};

export interface ScottTickContext {
  dtSeconds: number;
  now: number; // game-minutes
  rand: () => number;
  /** How far the living-room furniture has been moved, so the couch and the mat take him with them. */
  offset?: AnchorOffset;
  /** Places he might go this evening that aren't on his usual round: the regions Ellen has named. */
  extraSpots?: ScottSpot[];
}

export function tickScott(scott: ScottState, ctx: ScottTickContext): void {
  if (scott.activity !== 'traveling') {
    const here = scott.currentSpotId ? findScottSpot(scott.currentSpotId) : undefined;
    if (here?.anchor) {
      const at = spotPosition(here, ctx.offset);
      scott.x = at.x;
      scott.y = at.y;
    }
    if (ctx.now < scott.nextChangeAt) return;
    const options = [...SCOTT_SPOTS, ...(ctx.extraSpots ?? [])].filter((s) => s.id !== scott.currentSpotId);
    const next = options[Math.floor(ctx.rand() * options.length)] ?? SCOTT_SPOTS[0];
    scott.targetSpotId = next.id;
    scott.activity = 'traveling';
    // Indoor and outdoor coordinates are different spaces entirely (like
    // the player stepping through the greenhouse door) — cross that
    // boundary instantly rather than pretending to walk through a wall.
    const crossingThreshold = (scott.zone === 'greenhouse') !== (next.zone === 'greenhouse');
    if (crossingThreshold) {
      const at = spotPosition(next, ctx.offset);
      scott.zone = next.zone;
      scott.x = at.x;
      scott.y = at.y;
    }
    return;
  }

  const spot = findScottSpot(scott.targetSpotId) ?? ctx.extraSpots?.find((s) => s.id === scott.targetSpotId);
  if (!spot) {
    // Data changed under him (or a save from an older spot list) — settle
    // wherever he is rather than getting stuck chasing a spot that's gone.
    scott.activity = 'tinkering';
    scott.currentSpotId = null;
    scott.nextChangeAt = ctx.now + 10;
    return;
  }

  const at = spotPosition(spot, ctx.offset);
  const d = Math.hypot(at.x - scott.x, at.y - scott.y);
  if (d > ARRIVE_DIST) {
    // Indoors, the living room and greenhouse are joined by one doorway.
    const wp = scott.zone === 'greenhouse' ? interiorWaypoint(scott.x, scott.y, at.x, at.y) : outdoorWaypoint(scott.x, scott.y, at.x, at.y);
    const dx = wp.x - scott.x;
    const dy = wp.y - scott.y;
    const wd = Math.hypot(dx, dy) || 1;
    const step = Math.min(TRAVEL_SPEED * (scott.hurrying ? HURRY_FACTOR : 1) * ctx.dtSeconds, wd);
    scott.x += (dx / wd) * step;
    scott.y += (dy / wd) * step;
    if (Math.abs(dx) > 0.03 || Math.abs(dy) > 0.03) {
      scott.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    }
    return;
  }

  scott.zone = spot.zone;
  scott.currentSpotId = spot.id;
  delete scott.hurrying;
  scott.activity = ACTIVITY_FOR_KIND[spot.kind];
  const [minD, maxD] = DURATIONS[spot.kind];
  scott.nextChangeAt = ctx.now + minD + ctx.rand() * (maxD - minD);
  // Putting is drawn side-on, lining up toward the hole on his right; on
  // the couch he's facing the TV, back to the room.
  scott.facing = spot.kind === 'putt' ? 'right' : spot.kind === 'tv' || spot.kind === 'drink' ? 'up' : 'down';
}

// ---------------------------------------------------------------- the chase
// He takes no notice of Ellen — until she chases him. Keep after him long
// enough and he gives in: turns and does one of a few cute things, then
// smiles at her a while before he's off.

/** The cute things he might do once she's caught him. */
export type ChaseReaction = 'kiss' | 'spin' | 'boop';
const REACTIONS: ChaseReaction[] = ['kiss', 'spin', 'boop'];

/** How close counts as on his heels, in tiles. */
export const CHASE_RANGE = 1.6;
/** Real seconds of chasing before he stops and turns round. */
export const CHASE_SECONDS = 4;
/** The whole moment, in real seconds: whatever he does, then a smile before he's off. */
export const KISS_SECONDS = 6.4;
/** Where in the moment (0 → 1) the main move is over and they're standing, smiling at each other. */
export const DIP_END = 0.56;
/** Real seconds after a moment like this before another chase can count. */
export const KISS_COOLDOWN = 30;

export interface ChaseState {
  /** Seconds spent chasing so far; drains away when she stops. */
  chase: number;
  /** The moment under way, 0 → 1, or null. */
  kiss: { t: number; ellenLeft: boolean; reaction: ChaseReaction } | null;
  cooldown: number;
}

export function newChase(): ChaseState {
  return { chase: 0, kiss: null, cooldown: 0 };
}

/** Busy with something he'd not get up from: asleep, or sat on the couch. */
function settled(scott: ScottState): boolean {
  return scott.activity === 'napping' || scott.activity === 'watchingTV' || scott.activity === 'relaxing';
}

export interface ChaseContext {
  ellenX: number;
  ellenY: number;
  ellenIndoors: boolean;
  ellenMoving: boolean;
  dtSeconds: number;
  /** Picks which cute thing he does when caught; defaults to Math.random. */
  rand?: () => number;
}

/**
 * Advances the chase. Returns true on the frame the kiss begins; while it
 * runs, Scott and Ellen are held in place (the caller skips their usual
 * updates) and it plays out on its own.
 */
export function tickChase(ch: ChaseState, scott: ScottState, ctx: ChaseContext): boolean {
  if (ch.kiss) {
    ch.kiss.t += ctx.dtSeconds / KISS_SECONDS;
    if (ch.kiss.t >= 1) {
      ch.kiss = null;
      ch.cooldown = KISS_COOLDOWN;
      backToWork(scott);
    }
    return false;
  }
  ch.cooldown = Math.max(0, ch.cooldown - ctx.dtSeconds);
  const sameSide = (scott.zone === 'greenhouse') === ctx.ellenIndoors;
  const near = sameSide && Math.hypot(scott.x - ctx.ellenX, scott.y - ctx.ellenY) < CHASE_RANGE;
  if (near && ctx.ellenMoving && !settled(scott) && ch.cooldown === 0) ch.chase += ctx.dtSeconds;
  else ch.chase = Math.max(0, ch.chase - ctx.dtSeconds * 0.5);
  if (ch.chase < CHASE_SECONDS) return false;
  ch.chase = 0;
  const ellenLeft = ctx.ellenX <= scott.x;
  const rand = ctx.rand ?? Math.random;
  const reaction = REACTIONS[Math.floor(rand() * REACTIONS.length)];
  ch.kiss = { t: 0, ellenLeft, reaction };
  // He steps in beside her, and they face each other.
  scott.x = ctx.ellenX + (ellenLeft ? 0.5 : -0.5);
  scott.y = ctx.ellenY;
  scott.facing = ellenLeft ? 'left' : 'right';
  return true;
}

/** Off he runs to his workbench on this side of the door, a little quicker than usual. */
export function backToWork(scott: ScottState): void {
  const indoors = scott.zone === 'greenhouse';
  const bench = SCOTT_SPOTS.find((s) => s.kind === 'tinker' && (s.zone === 'greenhouse') === indoors);
  if (!bench) return;
  scott.targetSpotId = bench.id;
  scott.currentSpotId = null;
  scott.activity = 'traveling';
  scott.hurrying = true;
}

/** How far into the dip they are, 0 (standing) → 1 (fully dipped), easing in and out. */
export function dipAmount(t: number): number {
  const ease = (u: number) => u * u * (3 - 2 * u);
  if (t >= DIP_END) return 0;
  const u = t / DIP_END;
  if (u < 0.25) return ease(u / 0.25);
  if (u > 0.8) return ease(Math.max(0, (1 - u) / 0.2));
  return 1;
}

/** Up from the dip, the two of them just smiling at each other. */
export function smiling(t: number): boolean {
  return t >= DIP_END;
}

/** The valley's cannabis, in all three forms. */
const CANNABIS = ['cannabisSativa', 'cannabisIndica', 'cannabisHybrid'];

/**
 * Once the player has cultivated cannabis (grown one in their care), Scott
 * takes to wandering about with a joint. Nobody says anything about it.
 */
export function scottHasJoint(state: Pick<GameState, 'collection'>): boolean {
  return CANNABIS.some((id) => hasGrown(state, id));
}
