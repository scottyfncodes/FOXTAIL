import type { DiscoverySpot, ZoneId } from '../types';
import type { FoxFindKind, GameState } from '../state';
import { hunchTargets, spotContent, spotEpoch } from './spots';
import { hasFound } from './collection';
import { BRIDGES, overlandWaypoint } from '../data/worldMap';
import { weightedPick } from '../engine/Random';

// The fox. It turns up now and then, never for long, and it always seems to
// be doing something. Sometimes it trots over to a patch it knows (its
// secret patches, or something growing nearby you've never seen). And
// sometimes it notices you, and runs — not far, and it stops to look back.
// Follow it, and it may lead you somewhere. Lose it, and it's gone.
//
// There is no objective, marker or counter for any of this. The fox just
// seems, occasionally, to know something.

const FOX_SPEED = 2.4; // tiles per real second, trotting
const FOX_RUN = 3.9; // running away: a bit quicker than Ellen walks
const PAUSE_MINUTES = 6; // ~3 real seconds at 2 game-min/sec
const COOLDOWN_MIN = 120;
const COOLDOWN_MAX = 300;
const TRAIL_COOLDOWN_MIN = 360;
const TRAIL_COOLDOWN_MAX = 900;
const ARRIVE_DIST = 0.6;

/** Odds that a visit which isn't going to a known patch becomes a trail. */
export const TRAIL_CHANCE = 0.5;
/** It runs if you come this close. */
export const STARTLE_DIST = 4.5;
/** It stops to look back once you're this far behind… */
export const WAIT_DIST = 6.5;
/** …and sets off again once you're this close. */
export const RESUME_DIST = 4.2;
/** Beyond this it has lost you (or you it). */
export const LOSE_DIST = 13;
/** Real seconds out of range before the trail goes cold. */
export const LOSE_AFTER = 6;
/** Real seconds it will watch you before giving up on you ever coming over. */
export const IGNORED_AFTER = 14;
/** You have to be this close when it reaches the place for it to count. */
export const ARRIVE_WITH_PLAYER = 7.5;
/** Real seconds before a trail simply peters out. */
export const TRAIL_MAX_SECONDS = 150;
const VANISH_SECONDS = 1.6;
/**
 * Odds the fox has a hunch about a rare find you're missing, when one is in
 * season nearby. Each time it could have and didn't, the odds grow by this
 * much again — so it's never quick, but it always comes in the end.
 */
export const HUNCH_CHANCE = 0.2;

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

// The fox shows you things. Its secret patches come first; otherwise it
// trots over to whatever's growing nearby that you've never seen.
function pickCandidate(state: GameState, zone: ZoneId, points: DiscoverySpot[], rand: () => number): DiscoverySpot | null {
  const inZone = points.filter((p) => p.zone === zone);
  const secret = inZone.filter((p) => p.foxLed && !state.spots[p.id]?.revealed);
  if (secret.length > 0) return secret[Math.floor(rand() * secret.length)];
  const unseen = inZone.filter((p) => {
    const c = spotContent(state, p);
    return !!c && !hasFound(state, c.defId, c.variantId);
  });
  if (unseen.length > 0) return unseen[Math.floor(rand() * unseen.length)];
  return followHunch(state, inZone, rand);
}

// Nothing new growing nearby by chance — but the fox may know where
// something rare is, if the weather's right for it. It keeps it there, for
// you, until the patch turns over or the weather does.
function followHunch(state: GameState, inZone: DiscoverySpot[], rand: () => number): DiscoverySpot | null {
  if (inZone.length === 0) return null;
  const targets = hunchTargets(state, inZone[0].zone);
  if (targets.length === 0) return null;
  const epoch = spotEpoch(state.clock.totalMinutes);
  const hosts = inZone.filter((p) => !p.foxLed && !p.pool && (state.spots[p.id]?.collectedEpoch ?? -1) < epoch);
  if (hosts.length === 0) return null;
  const misses = state.foxLog.hunchMisses;
  if (rand() >= HUNCH_CHANCE * (1 + misses)) {
    state.foxLog.hunchMisses = misses + 1;
    return null;
  }
  const target = weightedPick(targets, (t) => 1 / (1 + t.rank), rand)!;
  const spot = hosts[Math.floor(rand() * hosts.length) % hosts.length];
  state.spots[spot.id] = { ...(state.spots[spot.id] ?? {}), hunch: { defId: target.defId, variantId: target.variantId, epoch } };
  state.foxLog.hunchMisses = 0;
  return spot;
}

/** What's waiting at the end of a trail. Often nothing much. */
export function rollTrailReward(rand: () => number): FoxFindKind | 'nothing' {
  const r = rand();
  if (r < 0.3) return 'nothing';
  if (r < 0.68) return 'plant';
  if (r < 0.8) return 'grove';
  return 'curiosity';
}

export interface FoxTickContext {
  playerZone: ZoneId;
  playerX: number;
  playerY: number;
  inGreenhouse: boolean;
  dtSeconds: number;
  now: number; // game-minutes
  discoveryPoints: DiscoverySpot[];
  rand: () => number;
  /** Somewhere far off and overgrown for a trail to end, or null if nowhere suits. */
  pickTrailDestination?: (rand: () => number) => { x: number; y: number } | null;
  /** Whether the fox could be standing here (not in the creek, on a roof, inside a tree). */
  isOpen?: (x: number, y: number) => boolean;
}

/** A spot near (x, y) at roughly this distance where the fox can actually be. */
function placeNear(ctx: FoxTickContext, x: number, y: number, dist: number, angle: number | null): { x: number; y: number } {
  for (let i = 0; i < 12; i++) {
    const a = angle !== null && i < 6 ? angle + (i % 2 ? 1 : -1) * i * 0.35 : ctx.rand() * Math.PI * 2;
    const r = angle !== null ? dist : dist * (0.5 + ctx.rand() * 0.5);
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (!ctx.isOpen || ctx.isOpen(px, py)) return { x: px, y: py };
  }
  // Nowhere clear at that distance: closer in, and never out in the creek.
  for (let i = 0; i < 12; i++) {
    const px = x + (ctx.rand() - 0.5) * 3;
    const py = y + (ctx.rand() - 0.5) * 3;
    if (!ctx.isOpen || ctx.isOpen(px, py)) return { x: px, y: py };
  }
  return { x, y };
}

export interface FoxTickResult {
  revealedDiscoveryId?: string;
  /** It has stopped at a patch it had a hunch about, with you close enough to see. */
  hunchDiscoveryId?: string;
  /** It just noticed you and ran. */
  trailStarted?: boolean;
  /** You lost it. */
  trailLost?: boolean;
  /** You kept up: it has reached the place, and slipped away. */
  trailEnded?: { x: number; y: number; reward: FoxFindKind | 'nothing' };
}

/** Where to run next: straight for the destination, or over a bridge if the creek is in the way. */
export const nextLeg = overlandWaypoint;

function goAway(state: GameState, now: number, rand: () => number, long: boolean) {
  const fox = state.fox;
  fox.behavior = 'gone';
  fox.visible = false;
  fox.targetDiscoveryId = null;
  fox.destX = null;
  fox.destY = null;
  fox.trailReward = null;
  fox.lostFor = 0;
  fox.trailTime = 0;
  fox.fled = false;
  const [a, b] = long ? [TRAIL_COOLDOWN_MIN, TRAIL_COOLDOWN_MAX] : [COOLDOWN_MIN, COOLDOWN_MAX];
  fox.nextEventAt = now + a + rand() * (b - a);
}

function vanish(state: GameState) {
  state.fox.behavior = 'vanishing';
  state.fox.trailTime = 0;
}

export function tickFox(state: GameState, ctx: FoxTickContext): FoxTickResult {
  const fox = state.fox;
  const result: FoxTickResult = {};

  if (ctx.inGreenhouse) {
    fox.visible = false;
    return result;
  }
  const dp = dist(fox.x, fox.y, ctx.playerX, ctx.playerY);

  switch (fox.behavior) {
    case 'idle':
    case 'gone': {
      if (ctx.now < fox.nextEventAt) return result;
      state.foxLog.sightings++;
      // Its first visit always shows you something, so it's understood as
      // part of the world from the start; and if it hasn't yet run from you
      // by its third, it does then. Neither is ever announced.
      const firstVisit = state.foxLog.sightings <= 1;
      const owesTrail = state.foxLog.trailsStarted === 0 && state.foxLog.sightings >= 3;
      const wantsToLead = firstVisit || (!owesTrail && ctx.rand() < 0.65);
      const candidate = wantsToLead ? pickCandidate(state, ctx.playerZone, ctx.discoveryPoints, ctx.rand) : null;
      fox.zone = ctx.playerZone;
      fox.visible = true;
      fox.targetDiscoveryId = null;
      if (candidate) {
        const at = placeNear(ctx, ctx.playerX, ctx.playerY, 2.1, null);
        fox.x = at.x;
        fox.y = at.y;
        fox.behavior = 'leading';
        fox.targetDiscoveryId = candidate.id;
        break;
      }
      const dest = ctx.pickTrailDestination && (owesTrail || ctx.rand() < TRAIL_CHANCE) ? ctx.pickTrailDestination(ctx.rand) : null;
      if (dest) {
        // It appears a little way off, and watches you.
        const a = Math.atan2(dest.y - ctx.playerY, dest.x - ctx.playerX) + (ctx.rand() - 0.5) * 1.2;
        const at = placeNear(ctx, ctx.playerX, ctx.playerY, 5.5, a);
        fox.x = at.x;
        fox.y = at.y;
        fox.behavior = 'lookingBack';
        fox.destX = dest.x;
        fox.destY = dest.y;
        fox.lostFor = 0;
        fox.trailTime = 0;
        fox.trailReward = rollTrailReward(ctx.rand);
        fox.fled = false;
        fox.facing = ctx.playerX < fox.x ? 'left' : 'right';
        break;
      }
      const at = placeNear(ctx, ctx.playerX, ctx.playerY, 2.1, null);
      fox.x = at.x;
      fox.y = at.y;
      fox.behavior = 'wandering';
      break;
    }
    case 'leading':
    case 'wandering': {
      let tx: number;
      let ty: number;
      if (fox.behavior === 'leading' && fox.targetDiscoveryId) {
        const dp2 = ctx.discoveryPoints.find((p) => p.id === fox.targetDiscoveryId);
        tx = dp2?.x ?? fox.x;
        ty = dp2?.y ?? fox.y;
      } else {
        tx = fox.x;
        ty = fox.y;
      }
      const d = dist(fox.x, fox.y, tx, ty);
      if (d > ARRIVE_DIST) {
        // Round the house, not over it, and over a bridge, never through the creek.
        const wp = overlandWaypoint(fox.x, fox.y, tx, ty);
        const wd = Math.max(0.0001, dist(fox.x, fox.y, wp.x, wp.y));
        const step = Math.min(FOX_SPEED * ctx.dtSeconds, wd);
        fox.x += ((wp.x - fox.x) / wd) * step;
        fox.y += ((wp.y - fox.y) / wd) * step;
        if (Math.abs(wp.x - fox.x) > 0.05) fox.facing = wp.x > fox.x ? 'right' : 'left';
      } else {
        if (fox.behavior === 'leading' && fox.targetDiscoveryId) {
          const spot = ctx.discoveryPoints.find((p) => p.id === fox.targetDiscoveryId);
          if (spot && spot.foxLed && !state.spots[spot.id]?.revealed) {
            state.spots[spot.id] = { ...(state.spots[spot.id] ?? {}), revealed: true };
            result.revealedDiscoveryId = spot.id;
          } else if (spot && state.spots[spot.id]?.hunch?.epoch === spotEpoch(state.clock.totalMinutes) && dp <= LOSE_DIST) {
            result.hunchDiscoveryId = spot.id;
          }
        }
        fox.behavior = 'paused';
        fox.nextEventAt = ctx.now + PAUSE_MINUTES;
      }
      break;
    }
    case 'paused': {
      if (ctx.now >= fox.nextEventAt) goAway(state, ctx.now, ctx.rand, false);
      break;
    }
    case 'lookingBack': {
      fox.trailTime += ctx.dtSeconds;
      fox.facing = ctx.playerX < fox.x ? 'left' : 'right';
      const atDest = fox.destX !== null && fox.destY !== null && dist(fox.x, fox.y, fox.destX, fox.destY) <= ARRIVE_DIST;
      if (atDest && fox.fled && dp <= ARRIVE_WITH_PLAYER) {
        result.trailEnded = { x: fox.destX!, y: fox.destY!, reward: fox.trailReward ?? 'nothing' };
        state.foxLog.trailsFollowed++;
        vanish(state);
        break;
      }
      if (!atDest && dp < (fox.fled ? RESUME_DIST : STARTLE_DIST)) {
        if (!fox.fled) {
          fox.fled = true;
          state.foxLog.trailsStarted++;
          state.foxLog.lastTrailAt = ctx.now;
          result.trailStarted = true;
        }
        fox.behavior = 'fleeing';
        fox.lostFor = 0;
        break;
      }
      // Too far behind — or, before it's run at all, simply never coming over.
      const losing = fox.fled ? dp > LOSE_DIST : fox.trailTime > IGNORED_AFTER;
      fox.lostFor = losing ? fox.lostFor + ctx.dtSeconds : Math.max(0, fox.lostFor - ctx.dtSeconds);
      if (fox.lostFor > LOSE_AFTER || fox.trailTime > TRAIL_MAX_SECONDS) {
        if (fox.fled) {
          state.foxLog.trailsLost++;
          result.trailLost = true;
        }
        vanish(state);
      }
      break;
    }
    case 'fleeing': {
      fox.trailTime += ctx.dtSeconds;
      if (fox.destX === null || fox.destY === null) {
        vanish(state);
        break;
      }
      const toDest = dist(fox.x, fox.y, fox.destX, fox.destY);
      if (dp > WAIT_DIST || toDest <= ARRIVE_DIST) {
        // Stop and look back: are you coming?
        fox.behavior = 'lookingBack';
        break;
      }
      const leg = nextLeg(fox.x, fox.y, fox.destX, fox.destY);
      const d = Math.max(0.0001, dist(fox.x, fox.y, leg.x, leg.y));
      const step = Math.min(FOX_RUN * ctx.dtSeconds, d);
      fox.x += ((leg.x - fox.x) / d) * step;
      fox.y += ((leg.y - fox.y) / d) * step;
      if (Math.abs(leg.x - fox.x) > 0.05) fox.facing = leg.x > fox.x ? 'right' : 'left';
      if (fox.trailTime > TRAIL_MAX_SECONDS) {
        state.foxLog.trailsLost++;
        result.trailLost = true;
        vanish(state);
      }
      break;
    }
    case 'vanishing': {
      fox.trailTime += ctx.dtSeconds;
      if (fox.trailTime >= VANISH_SECONDS) goAway(state, ctx.now, ctx.rand, true);
      break;
    }
  }
  return result;
}

/** 0…1: how faded the fox is as it slips into the undergrowth. */
export function foxFade(state: GameState): number {
  return state.fox.behavior === 'vanishing' ? Math.min(1, state.fox.trailTime / VANISH_SECONDS) : 0;
}
