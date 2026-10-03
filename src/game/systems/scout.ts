import type { Facing, ScoutState } from '../state';
import { interiorWaypoint } from '../data/interior';
import { overlandWaypoint } from '../data/worldMap';

// Scout trails just behind and to the side of Ellen (a real walking-companion
// offset, not stacked on top of her), catching up briskly when she falls far
// behind and settling into idle flavor behaviors when Ellen pauses. She is a
// constant companion — unlike the fox, who is a rare, wordless lure toward
// hidden things, Scout's "noticing" is a small, frequent, unforced beat.

const FACING_VEC: Record<Facing, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

const TRAIL_DIST = 0.85;
const CATCHUP_SPEED = 4.6; // tiles/sec, used when far behind
const NORMAL_SPEED = 3.6;
const FAR_THRESHOLD = 3.0; // beyond this, trot to catch up
const SETTLE_DIST = 0.5; // close enough to stop closing the gap
const IDLE_MIN = 5; // game-minutes
const IDLE_MAX = 14;
const NOTICE_MIN = 4;
const NOTICE_MAX = 8;
const IDLE_START_CHANCE = 0.55;
const RECHECK_MIN = 2;
const RECHECK_MAX = 5;

const IDLE_BEHAVIORS: ScoutState['behavior'][] = ['idleSit', 'idleSniff', 'idleLook'];

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export function facingToward(dx: number, dy: number): Facing {
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
}

export interface ScoutTickContext {
  playerX: number;
  playerY: number;
  playerFacing: Facing;
  playerMoving: boolean;
  dtSeconds: number;
  now: number; // game-minutes
  /** Nearest not-yet-discovered thing worth a curious glance, if any is close. */
  nearbyUndiscovered: { x: number; y: number } | null;
  rand: () => number;
  /** Inside the house: the rooms are joined by one doorway, so she goes through it. */
  indoors?: boolean;
}

/** How far ahead of Ellen Scout will go after a scent, in tiles. */
export const SNIFF_MIN = 5;
export const SNIFF_MAX = 9;
/** Game-minutes between scents worth chasing, give or take. */
export const SNIFF_GAP: [number, number] = [240, 540];

/**
 * Off after a scent: she runs to the curiosity, then stands over it, nose
 * down and tail going, until Ellen comes to see (the game ends the lead once
 * she's looked, or the thing has gone).
 */
function tickLead(scout: ScoutState, ctx: ScoutTickContext): void {
  const to = scout.leadTo!;
  const stand = { x: to.x - 0.55, y: to.y + 0.1 };
  const d = dist(scout.x, scout.y, stand.x, stand.y);
  if (d > 0.08) {
    scout.behavior = 'leading';
    // Round the house and over a bridge, like anyone else on foot.
    const wp = overlandWaypoint(scout.x, scout.y, stand.x, stand.y);
    const wd = dist(scout.x, scout.y, wp.x, wp.y) || 1;
    const step = Math.min(CATCHUP_SPEED * ctx.dtSeconds, wd);
    scout.x += ((wp.x - scout.x) / wd) * step;
    scout.y += ((wp.y - scout.y) / wd) * step;
    scout.facing = facingToward(wp.x - scout.x, wp.y - scout.y);
    return;
  }
  scout.behavior = 'pointing';
  scout.facing = facingToward(to.x - scout.x, to.y - scout.y);
}

export function tickScout(scout: ScoutState, ctx: ScoutTickContext): void {
  if (scout.leadTo) {
    tickLead(scout, ctx);
    return;
  }
  if (scout.behavior === 'leading' || scout.behavior === 'pointing') scout.behavior = 'following';
  const [fx, fy] = FACING_VEC[ctx.playerFacing];
  // Trail behind Ellen's heading, offset slightly to her side so she reads as
  // walking alongside rather than glued to her back.
  const sideX = -fy;
  const sideY = fx;
  const targetX = ctx.playerX - fx * TRAIL_DIST + sideX * 0.35;
  const targetY = ctx.playerY - fy * TRAIL_DIST + sideY * 0.35;
  const d = dist(scout.x, scout.y, targetX, targetY);

  const isIdle = scout.behavior !== 'following';
  if (isIdle) {
    const shouldResume = ctx.playerMoving || d > FAR_THRESHOLD || ctx.now >= scout.nextEventAt;
    if (!shouldResume) {
      if (scout.behavior === 'noticing' && ctx.nearbyUndiscovered) {
        scout.facing = facingToward(ctx.nearbyUndiscovered.x - scout.x, ctx.nearbyUndiscovered.y - scout.y);
      }
      return; // hold the idle pose
    }
    scout.behavior = 'following';
  }

  if (d > SETTLE_DIST) {
    const speed = (d > FAR_THRESHOLD ? CATCHUP_SPEED : NORMAL_SPEED) * ctx.dtSeconds;
    const wp = ctx.indoors ? interiorWaypoint(scout.x, scout.y, targetX, targetY) : { x: targetX, y: targetY };
    const wd = Math.hypot(wp.x - scout.x, wp.y - scout.y) || 1;
    const step = Math.min(speed, wd);
    scout.x += ((wp.x - scout.x) / wd) * step;
    scout.y += ((wp.y - scout.y) / wd) * step;
    const mdx = targetX - scout.x;
    const mdy = targetY - scout.y;
    if (Math.abs(mdx) > 0.04 || Math.abs(mdy) > 0.04) {
      scout.facing = facingToward(mdx, mdy);
    }
    return;
  }

  // Settled beside Ellen: periodically consider a little idle flavor.
  if (ctx.playerMoving || ctx.now < scout.nextEventAt) return;

  if (ctx.nearbyUndiscovered && ctx.rand() < 0.7) {
    scout.behavior = 'noticing';
    scout.nextEventAt = ctx.now + NOTICE_MIN + ctx.rand() * (NOTICE_MAX - NOTICE_MIN);
    scout.facing = facingToward(ctx.nearbyUndiscovered.x - scout.x, ctx.nearbyUndiscovered.y - scout.y);
  } else if (ctx.rand() < IDLE_START_CHANCE) {
    scout.behavior = IDLE_BEHAVIORS[Math.floor(ctx.rand() * IDLE_BEHAVIORS.length)];
    scout.nextEventAt = ctx.now + IDLE_MIN + ctx.rand() * (IDLE_MAX - IDLE_MIN);
  } else {
    scout.nextEventAt = ctx.now + RECHECK_MIN + ctx.rand() * (RECHECK_MAX - RECHECK_MIN);
  }
}
