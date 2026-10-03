import type { GameState } from '../state';
import { GOLF_BALLS, GOLF_BALL_TIER_WEIGHT, GOLF_BALL_UNFOUND_BOOST, findGolfBall, type GolfBallDef } from '../data/golfBalls';
import { weightedPick } from '../engine/Random';

// The golf ball collection: which kinds of lost golf ball have turned up,
// and how many of each. The first of a kind is a discovery; the rest are
// kept too (as a count), just without the fuss.

export interface GolfBallRecord {
  foundAt: number;
  count: number;
  /** Found but not yet looked at in the journal: it wears a NEW tag until then. */
  fresh?: boolean;
}

export function hasGolfBall(state: Pick<GameState, 'golfBalls'>, id: string): boolean {
  return (state.golfBalls[id]?.count ?? 0) > 0;
}

/** Golf Balls X / TOTAL: kinds found against kinds there are. */
export function golfBallTotals(state: Pick<GameState, 'golfBalls'>): { found: number; total: number; balls: number } {
  let found = 0;
  let balls = 0;
  for (const b of GOLF_BALLS) {
    const n = state.golfBalls[b.id]?.count ?? 0;
    if (n > 0) found++;
    balls += n;
  }
  return { found, total: GOLF_BALLS.length, balls };
}

export function golfCollectionComplete(state: Pick<GameState, 'golfBalls'>): boolean {
  return GOLF_BALLS.every((b) => hasGolfBall(state, b.id));
}

/** Which kind of ball this one turns out to be. */
export function pickGolfBall(state: Pick<GameState, 'golfBalls'>, rand: () => number): GolfBallDef {
  const perTier = new Map<string, number>();
  for (const b of GOLF_BALLS) perTier.set(b.rarity, (perTier.get(b.rarity) ?? 0) + 1);
  const weight = (b: GolfBallDef) => (GOLF_BALL_TIER_WEIGHT[b.rarity] / perTier.get(b.rarity)!) * (hasGolfBall(state, b.id) ? 1 : GOLF_BALL_UNFOUND_BOOST);
  return weightedPick(GOLF_BALLS, weight, rand) ?? GOLF_BALLS[0];
}

export interface GolfBallFind {
  ball: GolfBallDef;
  isNew: boolean;
  count: number;
}

/** Adds one ball of this kind to the collection. */
export function recordGolfBall(state: Pick<GameState, 'golfBalls'>, id: string, now: number): GolfBallFind | null {
  const ball = findGolfBall(id);
  if (!ball) return null;
  const rec = state.golfBalls[id];
  const isNew = !rec || rec.count <= 0;
  const next: GolfBallRecord = { foundAt: isNew ? now : rec.foundAt, count: (isNew ? 0 : rec.count) + 1 };
  if (isNew || rec.fresh) next.fresh = true;
  state.golfBalls[id] = next;
  return { ball, isNew, count: next.count };
}

/** Finds a lost golf ball: rolls which kind it is and records it. */
export function findGolfBallFor(state: Pick<GameState, 'golfBalls'>, now: number, rand: () => number): GolfBallFind {
  return recordGolfBall(state, pickGolfBall(state, rand).id, now)!;
}

/** The journal page has been looked at: nothing on it is NEW any more. */
export function markGolfBallsSeen(state: Pick<GameState, 'golfBalls'>): void {
  for (const rec of Object.values(state.golfBalls)) delete rec.fresh;
}

/** The name the player may see: a hidden ball keeps its secret until it's found. */
export function golfBallDisplayName(state: Pick<GameState, 'golfBalls'>, ball: GolfBallDef): string {
  return ball.hidden && !hasGolfBall(state, ball.id) ? ball.hidden.name : ball.name;
}
