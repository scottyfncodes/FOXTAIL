import type { CatState, Facing, ScoutState } from '../state';
import { PARTITION_X, interiorWaypoint } from '../data/interior';

// In the greenhouse, Scout and the cat can't leave each other alone. One of
// them stalks — low, slow, eyes fixed — then pounces, and the chase is on,
// round the beds and stands until they catch each other. A breather, a
// look, and it's the other one's turn to hunt. Nobody wins; it just goes on
// for as long as Ellen is in there with them.

export type Playmate = 'cat' | 'scout';
export type PlayPhase = 'scatter' | 'stalk' | 'chase' | 'breather';

export interface PlayState {
  chaser: Playmate;
  phase: PlayPhase;
  /** Seconds left in this phase. */
  timer: number;
  /** Where the one being chased is running to. */
  fleeTo: { x: number; y: number } | null;
  /** How many times one has caught the other. */
  tags: number;
  /** Seconds into the current chase: the runner gets a head start, and no instant re-catches. */
  chaseTime?: number;
}

export interface PlayArea {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** The greenhouse floor, clear of the walls and the doorway to the living room. */
export const GREENHOUSE_PLAY_AREA: PlayArea = { minX: 1.6, maxX: PARTITION_X - 1.4, minY: 1.8, maxY: 10.2 };

/** Running flat out, tiles/sec: the hunter is a touch quicker, so the chase ends. */
const FLEE_SPEED = 3.1;
const CHASE_SPEED = 3.7;
/** Creeping up during a stalk. */
const STALK_SPEED = 0.75;
/** Close enough to count as caught. */
const TAG_DIST = 0.45;
/** When the hunter gets this close, the runner jinks off somewhere new. */
const JINK_DIST = 1.3;
/** A chase that goes on this long ends with the runner letting itself be caught. */
const CHASE_MAX = 7;
/** The runner's head start, and the shortest chase that can end in a catch, in seconds. */
const HEAD_START = 0.7;
const MIN_CHASE = 1.2;
/** Trotting off to a new spot after a catch, before the next stalk. */
const TROT_SPEED = 2.2;

export interface PlayContext {
  dtSeconds: number;
  rand: () => number;
  area?: PlayArea;
  /** Open floor (no furniture): somewhere worth running to. */
  isOpen?: (x: number, y: number) => boolean;
}

export function startPlay(rand: () => number): PlayState {
  return { chaser: rand() < 0.5 ? 'cat' : 'scout', phase: 'stalk', timer: 1.5 + rand() * 1.5, fleeTo: null, tags: 0 };
}

interface Body {
  x: number;
  y: number;
  facing: Facing;
}

function faceToward(b: Body, x: number, y: number) {
  const dx = x - b.x;
  const dy = y - b.y;
  if (Math.abs(dx) < 0.02 && Math.abs(dy) < 0.02) return;
  b.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
}

/** Moves toward (x, y) at `speed`, through the doorway if they're in different rooms. Returns true on arrival. */
function moveToward(b: Body, x: number, y: number, speed: number, dt: number): boolean {
  const wp = interiorWaypoint(b.x, b.y, x, y);
  const dx = wp.x - b.x;
  const dy = wp.y - b.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-3) return Math.hypot(x - b.x, y - b.y) < 0.05;
  const step = Math.min(speed * dt, d);
  b.x += (dx / d) * step;
  b.y += (dy / d) * step;
  faceToward(b, wp.x, wp.y);
  return step >= d && wp.x === x && wp.y === y;
}

/** Somewhere to run to: open floor, as far from the hunter as can be found. */
function pickFleeTarget(from: Body, hunter: Body, ctx: PlayContext): { x: number; y: number } {
  const a = ctx.area ?? GREENHOUSE_PLAY_AREA;
  let best: { x: number; y: number } | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < 10; i++) {
    const x = a.minX + ctx.rand() * (a.maxX - a.minX);
    const y = a.minY + ctx.rand() * (a.maxY - a.minY);
    if (ctx.isOpen && !ctx.isOpen(x, y)) continue;
    // Away from the hunter, but not a marathon from here.
    const score = Math.hypot(x - hunter.x, y - hunter.y) - Math.hypot(x - from.x, y - from.y) * 0.35;
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  return best ?? { x: (a.minX + a.maxX) / 2, y: (a.minY + a.maxY) / 2 };
}

/**
 * One step of play. Moves both animals and sets the poses the renderer
 * already knows (running, sitting, sniffing, grooming).
 */
export function tickPlay(play: PlayState, scout: ScoutState, cat: CatState, ctx: PlayContext): void {
  const dt = ctx.dtSeconds;
  const hunter: Body = play.chaser === 'cat' ? cat : scout;
  const quarry: Body = play.chaser === 'cat' ? scout : cat;
  cat.currentSpotId = null;
  cat.targetX = null;
  cat.targetY = null;
  cat.targetActivity = null;
  play.timer -= dt;

  const pose = (who: Playmate, moving: boolean, still: 'sit' | 'busy' | 'alert') => {
    if (who === 'cat') cat.activity = moving ? 'wandering' : still === 'busy' ? 'grooming' : 'sitting';
    else scout.behavior = moving ? 'following' : still === 'sit' ? 'idleSit' : still === 'busy' ? 'idleSniff' : 'idleLook';
  };
  const quarryName: Playmate = play.chaser === 'cat' ? 'scout' : 'cat';

  if (play.phase === 'scatter') {
    // The one who'll be hunted next trots off somewhere; the hunter watches it go.
    if (!play.fleeTo) play.fleeTo = pickFleeTarget(quarry, hunter, ctx);
    const arrived = moveToward(quarry, play.fleeTo.x, play.fleeTo.y, TROT_SPEED, dt);
    faceToward(hunter, quarry.x, quarry.y);
    pose(quarryName, true, 'busy');
    pose(play.chaser, false, 'alert');
    if (arrived || play.timer <= 0) {
      play.phase = 'stalk';
      play.timer = 1.5 + ctx.rand() * 2;
      play.fleeTo = null;
    }
    return;
  }

  if (play.phase === 'stalk') {
    // The quarry busies itself, none the wiser; the hunter creeps in.
    const d = Math.hypot(quarry.x - hunter.x, quarry.y - hunter.y);
    const moving = d > 1.4;
    if (moving) moveToward(hunter, quarry.x, quarry.y, d > 4 ? CHASE_SPEED : STALK_SPEED, dt);
    else faceToward(hunter, quarry.x, quarry.y);
    pose(play.chaser, moving, 'alert');
    pose(quarryName, false, 'busy');
    if (play.timer <= 0 && !(d > 4)) {
      // Pounce!
      startChase(play, quarry, hunter, ctx, 0);
    }
    return;
  }

  if (play.phase === 'chase') {
    if (!play.fleeTo) play.fleeTo = pickFleeTarget(quarry, hunter, ctx);
    play.chaseTime = (play.chaseTime ?? 0) + dt;
    const arrived = moveToward(quarry, play.fleeTo.x, play.fleeTo.y, play.timer > 0 ? FLEE_SPEED : FLEE_SPEED * 0.4, dt);
    const hunterGo = play.chaseTime > HEAD_START;
    if (hunterGo) moveToward(hunter, quarry.x, quarry.y, CHASE_SPEED, dt);
    else faceToward(hunter, quarry.x, quarry.y);
    pose(quarryName, true, 'alert');
    pose(play.chaser, hunterGo, 'alert');
    const d = Math.hypot(quarry.x - hunter.x, quarry.y - hunter.y);
    if (d < TAG_DIST && play.chaseTime > MIN_CHASE) {
      // Caught! A breather, then it's the other one's turn to hunt.
      play.tags += 1;
      play.phase = 'breather';
      play.timer = 0.8 + ctx.rand() * 1.2;
      play.fleeTo = null;
      faceToward(hunter, quarry.x, quarry.y);
      faceToward(quarry, hunter.x, hunter.y);
      return;
    }
    if (arrived || d < JINK_DIST) play.fleeTo = pickFleeTarget(quarry, hunter, ctx);
    return;
  }

  // Breather: face to face, catching their breath.
  pose('cat', false, 'sit');
  pose('scout', false, 'sit');
  if (play.timer <= 0) {
    play.chaser = play.chaser === 'cat' ? 'scout' : 'cat';
    const h = play.chaser === 'cat' ? cat : scout;
    const q = play.chaser === 'cat' ? scout : cat;
    // Sometimes it bolts and the chase is straight back on; sometimes it
    // wanders off first and gets stalked all over again.
    if (ctx.rand() < 0.55) startChase(play, q, h, ctx, HEAD_START);
    else {
      play.phase = 'scatter';
      play.timer = 4;
      play.fleeTo = pickFleeTarget(q, h, ctx);
    }
  }
}

function startChase(play: PlayState, quarry: Body, hunter: Body, ctx: PlayContext, headStart: number) {
  play.phase = 'chase';
  play.timer = CHASE_MAX;
  play.chaseTime = headStart > 0 ? 0 : HEAD_START;
  play.fleeTo = pickFleeTarget(quarry, hunter, ctx);
}

/** Play's over (Ellen left the room): the cat goes back to his own business, Scout to Ellen. */
export function endPlay(scout: ScoutState, cat: CatState, now: number) {
  scout.behavior = 'following';
  cat.activity = 'sitting';
  cat.currentSpotId = null;
  cat.nextChangeAt = now;
}
