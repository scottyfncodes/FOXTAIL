import { hasGrown } from './collection';
import type { CatState, GameState, PlayerState, ScottActivity, ScottState, ScoutState, TruckState } from '../state';
import { DRIVE_LOOP, SCOTT_SPOTS, VISIT_KINDS, findScottSpot, type ScottSpot, type ScottSpotKind } from '../data/scottSpots';
import { catLift } from './cat';
import { interiorWaypoint } from '../data/interior';
import { spotPosition, type AnchorOffset } from '../data/catSpots';
import { GREENHOUSE_DOOR, outdoorWaypoint, overlandWaypoint, TRUCK_KEEPOUT, zoneAt } from '../data/worldMap';
import type { ZoneId } from '../types';

// Ellen's husband, ambient and independent of the player: he potters
// between fixed spots on his own clock — tinkering, napping, snacking,
// practicing his golf swing and putting, fishing the creek, splitting
// firewood, baking a loaf — and, once Ellen's bought the truck, working on
// it or borrowing it for a drive. Now and then he wanders over to give Ranger a scratch, ruffle
// Scout's ears, or just say hello to Ellen. Not a companion, not a guide —
// just someone else who lives here.

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
  fish: [40, 80],
  chop: [25, 45],
  bake: [30, 50],
  wrench: [25, 45],
  // The drive itself runs the length of the loop; this is just a moment once he's parked.
  drive: [2, 4],
  pet: [10, 18],
  scout: [10, 18],
  ellen: [6, 10],
  // He'll wait by what he's found a good while; Ellen arriving ends it sooner.
  show: [240, 300],
};

export const ACTIVITY_FOR_KIND: Record<ScottSpotKind, Exclude<ScottActivity, 'traveling'>> = {
  tinker: 'tinkering',
  nap: 'napping',
  snack: 'snacking',
  golf: 'golfing',
  putt: 'putting',
  tv: 'watchingTV',
  drink: 'relaxing',
  fish: 'fishing',
  chop: 'choppingWood',
  bake: 'baking',
  wrench: 'fixingTruck',
  drive: 'driving',
  pet: 'pettingRanger',
  scout: 'playingWithScout',
  ellen: 'withEllen',
  show: 'showingPlant',
};

/** Truck speed on his drive, tiles/sec: an easy cruise. */
export const DRIVE_SPEED = 4.2;
/** How far he'll walk over to someone for a hello, in tiles. */
export const VISIT_RANGE = 22;
/** Once they've wandered this far off, he leaves them to it. */
const VISIT_LEAVE = 2.4;

/**
 * The truck's spots, once Ellen has one and isn't in it: under its front
 * bumper with a wrench wherever it's parked, and — when it's parked out in
 * the meadow, where his drive starts — the driver's door.
 */
export function truckSpots(truck: Pick<TruckState, 'x' | 'y' | 'facing'> | null | undefined): ScottSpot[] {
  if (!truck) return [];
  const side = truck.facing === 'left' || truck.facing === 'right';
  const ahead = truck.facing === 'left' ? -1 : 1;
  const bumper = side ? { x: truck.x + ahead * 1.6, y: truck.y + 0.1 } : { x: truck.x + 0.95, y: truck.y + 0.1 };
  const out: ScottSpot[] = [{ id: 'truck-fixing', kind: 'wrench', zone: zoneAt(bumper.x, bumper.y), x: bumper.x, y: bumper.y, face: side ? (ahead < 0 ? 'right' : 'left') : 'left' }];
  if (zoneAt(truck.x, truck.y) === 'meadow') out.push({ id: 'truck-drive', kind: 'drive', zone: 'meadow', x: truck.x, y: truck.y + 0.7 });
  return out;
}

/**
 * The company he might wander over to: Ranger where she's settled, Scout,
 * and Ellen. Each stands as a spot just beside them, recomputed each moment
 * so he walks to where they are now, not where they were.
 */
export function companySpots(state: { player: Pick<PlayerState, 'x' | 'y' | 'inGreenhouse'>; scout: Pick<ScoutState, 'x' | 'y'>; cat: CatState }): ScottSpot[] {
  const indoors = state.player.inGreenhouse;
  const zone = (x: number, y: number): ZoneId => (indoors ? 'greenhouse' : zoneAt(x, y));
  const out: ScottSpot[] = [];
  const cat = state.cat;
  // Ranger only gets a fuss when she's settled somewhere he can reach — not up on the TV.
  if ((cat.activity === 'sitting' || cat.activity === 'sleeping' || cat.activity === 'grooming') && catLift(cat) === 0) {
    out.push({ id: 'visit-ranger', kind: 'pet', zone: 'greenhouse', x: cat.x - 0.45, y: cat.y + 0.05, face: 'right' });
  }
  const sx = state.scout.x - 0.5;
  const sy = state.scout.y + 0.05;
  out.push({ id: 'visit-scout', kind: 'scout', zone: zone(sx, sy), x: sx, y: sy, face: 'right' });
  const ex = state.player.x + 0.75;
  const ey = state.player.y;
  out.push({ id: 'visit-ellen', kind: 'ellen', zone: zone(ex, ey), x: ex, y: ey, face: 'left' });
  return out;
}

export function isVisit(spot: Pick<ScottSpot, 'kind'>): boolean {
  return VISIT_KINDS.includes(spot.kind);
}

/** Something worth a word that happened on his rounds. */
export type ScottEvent = 'baked';

export interface ScottTickContext {
  dtSeconds: number;
  now: number; // game-minutes
  rand: () => number;
  /** How far the living-room furniture has been moved, so the couch and the mat take him with them. */
  offset?: AnchorOffset;
  /** Places he might go that aren't on his usual round: the regions Ellen has named, the truck, his family. */
  extraSpots?: ScottSpot[];
  /** Ellen's truck, when she has one and isn't driving it: what he borrows for a drive. */
  truck?: TruckState | null;
  /** Something he's spotted and wants to show Ellen: he drops what he's doing and goes straight there. */
  summon?: ScottSpot | null;
}

export function tickScott(scott: ScottState, ctx: ScottTickContext): ScottEvent | null {
  const call = ctx.summon;
  if (call && scott.activity !== 'driving' && scott.targetSpotId !== call.id && scott.currentSpotId !== call.id) {
    // Whatever he was doing can wait. From indoors he comes out the garden door.
    if (scott.zone === 'greenhouse') {
      scott.zone = 'meadow';
      scott.x = GREENHOUSE_DOOR.x + 0.5;
      scott.y = GREENHOUSE_DOOR.y + 0.6;
    }
    scott.targetSpotId = call.id;
    scott.currentSpotId = null;
    scott.activity = 'traveling';
    scott.hurrying = true;
  }
  if (scott.activity === 'driving') {
    drive(scott, ctx);
    return null;
  }
  if (scott.activity !== 'traveling') {
    const here = scott.currentSpotId ? findScottSpot(scott.currentSpotId) : undefined;
    if (here?.anchor) {
      const at = spotPosition(here, ctx.offset);
      scott.x = at.x;
      scott.y = at.y;
    }
    // Keeping someone company: once they've moved off (or gone through a door), so does he.
    if (scott.currentSpotId?.startsWith('visit-')) {
      const them = ctx.extraSpots?.find((s) => s.id === scott.currentSpotId);
      const sameSide = them && (them.zone === 'greenhouse') === (scott.zone === 'greenhouse');
      if (!them || !sameSide || Math.hypot(them.x - scott.x, them.y - scott.y) > VISIT_LEAVE) scott.nextChangeAt = Math.min(scott.nextChangeAt, ctx.now);
    }
    if (ctx.now < scott.nextChangeAt) return null;
    const event: ScottEvent | null = here?.kind === 'bake' ? 'baked' : null;
    if (event === 'baked') scott.loafUntil = ctx.now + LOAF_MINUTES;
    const indoors = scott.zone === 'greenhouse';
    const options = [...SCOTT_SPOTS, ...(ctx.extraSpots ?? [])].filter((s) => {
      if (s.id === scott.currentSpotId) return false;
      if (!isVisit(s)) return true;
      // Company only on his own side of the door, and not right across the valley.
      return (s.zone === 'greenhouse') === indoors && Math.hypot(s.x - scott.x, s.y - scott.y) <= VISIT_RANGE;
    });
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
    return event;
  }

  let spot = findScottSpot(scott.targetSpotId) ?? (ctx.summon?.id === scott.targetSpotId ? ctx.summon : undefined) ?? ctx.extraSpots?.find((s) => s.id === scott.targetSpotId);
  // Whoever he was off to see has gone through a door: that's that.
  if (spot && isVisit(spot) && (spot.zone === 'greenhouse') !== (scott.zone === 'greenhouse')) spot = undefined;
  if (!spot) {
    // Data changed under him (or a save from an older spot list), or whoever
    // he was off to see has gone indoors — settle wherever he is rather than
    // getting stuck chasing a spot that's gone.
    const visiting = scott.targetSpotId.startsWith('visit-') || scott.targetSpotId.startsWith('truck-') || scott.targetSpotId.startsWith('show-');
    scott.activity = visiting ? 'relaxing' : 'tinkering';
    scott.currentSpotId = null;
    scott.nextChangeAt = ctx.now + (visiting ? 1 : 10);
    return null;
  }

  const at = spotPosition(spot, ctx.offset);
  const d = Math.hypot(at.x - scott.x, at.y - scott.y);
  if (d > ARRIVE_DIST) {
    // Indoors, the living room and greenhouse are joined by one doorway.
    const wp = scott.zone === 'greenhouse' ? interiorWaypoint(scott.x, scott.y, at.x, at.y) : overlandWaypoint(scott.x, scott.y, at.x, at.y);
    stepToward(scott, wp, TRAVEL_SPEED * (scott.hurrying ? HURRY_FACTOR : 1) * ctx.dtSeconds);
    return null;
  }

  scott.zone = spot.zone;
  scott.currentSpotId = spot.id;
  delete scott.hurrying;
  scott.activity = ACTIVITY_FOR_KIND[spot.kind];
  const [minD, maxD] = DURATIONS[spot.kind];
  scott.nextChangeAt = ctx.now + minD + ctx.rand() * (maxD - minD);
  // Putting is drawn side-on, lining up toward the hole on his right; on
  // the couch he's facing the TV, back to the room.
  scott.facing = spot.face ?? (spot.kind === 'putt' ? 'right' : spot.kind === 'tv' || spot.kind === 'drink' ? 'up' : 'down');
  if (spot.kind === 'drive') {
    const t = ctx.truck;
    if (!t) {
      // She's taken it (or it's gone): never mind.
      scott.activity = 'relaxing';
      scott.nextChangeAt = ctx.now + 1;
      return null;
    }
    // Into the cab and away, remembering where she'd left it.
    scott.driveHome = { x: t.x, y: t.y, facing: t.facing };
    scott.x = t.x;
    scott.y = t.y;
    scott.facing = t.facing;
    scott.driveLeg = 0;
  }
  return null;
}

/** How long a fresh loaf sits cooling on the coffee table, in game minutes. */
export const LOAF_MINUTES = 6 * 60;

function stepToward(scott: ScottState, wp: { x: number; y: number }, maxStep: number): number {
  const dx = wp.x - scott.x;
  const dy = wp.y - scott.y;
  const wd = Math.hypot(dx, dy) || 1;
  const step = Math.min(maxStep, wd);
  scott.x += (dx / wd) * step;
  scott.y += (dy / wd) * step;
  if (Math.abs(dx) > 0.03 || Math.abs(dy) > 0.03) {
    scott.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  }
  return wd - step;
}

/** One stretch of the drive: on round the loop, then home to where the truck was parked, and out of the cab. */
function drive(scott: ScottState, ctx: ScottTickContext): void {
  const t = ctx.truck;
  const home = scott.driveHome;
  if (t && home) {
    const route = [...DRIVE_LOOP, home];
    let leg = scott.driveLeg ?? 0;
    let budget = DRIVE_SPEED * ctx.dtSeconds;
    while (leg < route.length && budget > 0) {
      const target = route[leg];
      // Round the house and greenhouse, never up over them.
      const wp = outdoorWaypoint(scott.x, scott.y, target.x, target.y, TRUCK_KEEPOUT);
      const before = Math.hypot(wp.x - scott.x, wp.y - scott.y);
      const left = stepToward(scott, wp, budget);
      budget -= before - left;
      if (left > 0.01) break;
      if (wp.x === target.x && wp.y === target.y) leg++;
    }
    scott.driveLeg = leg;
    t.x = scott.x;
    t.y = scott.y;
    t.facing = scott.facing;
    if (leg < route.length) return;
    t.facing = home.facing;
  }
  // Parked (or the truck's gone from under him): he climbs out by the driver's door, and he's done.
  if (t) {
    scott.x = t.x;
    scott.y = t.y + 0.7;
  }
  scott.facing = 'down';
  scott.activity = 'relaxing';
  scott.currentSpotId = null;
  scott.nextChangeAt = Math.min(scott.nextChangeAt, ctx.now + 2);
  delete scott.driveLeg;
  delete scott.driveHome;
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

/** Busy with something he'd not get up from: asleep, sat on the couch, or behind the wheel. */
function settled(scott: ScottState): boolean {
  return scott.activity === 'napping' || scott.activity === 'watchingTV' || scott.activity === 'relaxing' || scott.activity === 'driving';
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
export const CANNABIS = ['cannabisSativa', 'cannabisIndica', 'cannabisHybrid'];

/**
 * Once the player has cultivated cannabis (grown one in their care), Scott
 * takes to wandering about with a joint. Nobody says anything about it.
 */
export function scottHasJoint(state: Pick<GameState, 'collection'>): boolean {
  return CANNABIS.some((id) => hasGrown(state, id));
}
