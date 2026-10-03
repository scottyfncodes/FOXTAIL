// The little things there are to do around the place besides putt-putt:
// acorns to lob at a bucket, a kindling heap to pick apart, flat stones by
// the creek, a maze grown into the meadow, Ranger and the laser pointer,
// sticks for Scout, a slingshot and some pinecones, and a frog on the lily
// pads. None of it is a job; it's just what Scott gets up to when he's
// outside, and Ellen can join in whenever she walks past.
//
// Each one is found somewhere on the property (or, for the laser pointer,
// wherever Ranger is) and keeps the same small record the putting mat
// does: how many times it's been played, the best score, and whether the
// one-off reward for reaching its goal has been paid. Pure data and
// bookkeeping, no DOM.

import type { MiniGameRecord } from '../state';
import type { OutdoorZoneId } from '../types';
import { ACE_REWARD } from './putting';

export type MiniGameId = 'acornPitch' | 'twigJenga' | 'rockSkip' | 'gardenMaze' | 'catLaser' | 'stickFetch' | 'slingshot' | 'frogJump';

export interface MiniGameDef {
  id: MiniGameId;
  name: string;
  emoji: string;
  /** Where it's found outdoors (tile coords, centre of the prop), or 'ranger': wherever Ranger is, indoors. */
  where: { zone: OutdoorZoneId; x: number; y: number } | 'ranger';
  /** What walking up to it says, before the best score. */
  prompt: string;
  /** What a score counts, for "best 12 skips". */
  unit: string;
  /** The score that earns the one-off reward. */
  goal: number;
}

/**
 * Reaching a game's goal for the first time pays the same as a first hole
 * in one on the putting mat: a pleasant surprise, not a living.
 */
export const MINI_GAME_REWARD = ACE_REWARD;

export const MINI_GAMES: MiniGameDef[] = [
  {
    id: 'acornPitch',
    name: 'Acorn Pitch',
    emoji: '🌰',
    // Under the last oaks at the woodland's edge: a bucket, an upturned pot and a pocketful of acorns.
    where: { zone: 'woodland', x: 32.5, y: 27.5 },
    prompt: 'Pitch acorns at the bucket',
    unit: 'points',
    goal: 14,
  },
  {
    id: 'twigJenga',
    name: 'Twig Jenga',
    emoji: '🪵',
    // The kindling heap beside Scott's woodpile.
    where: { zone: 'woodland', x: 27.5, y: 22.5 },
    prompt: 'Pick apart the kindling pile',
    unit: 'twigs',
    goal: 20,
  },
  {
    id: 'rockSkip',
    name: 'Rock Skip',
    emoji: '🪨',
    // A heap of flat stones on the creek bank, below Scott's fishing bend.
    where: { zone: 'creek', x: 44.5, y: 36.5 },
    prompt: 'Skip stones on the creek',
    unit: 'skips',
    goal: 24,
  },
  {
    id: 'gardenMaze',
    name: 'Garden Maze',
    emoji: '🌿',
    // A hedge arch in the meadow, west of the greenhouse.
    where: { zone: 'meadow', x: 49.5, y: 41.5 },
    prompt: 'Walk the garden maze',
    unit: 'points',
    goal: 240,
  },
  {
    id: 'catLaser',
    name: 'Cat Laser',
    emoji: '🐈',
    where: 'ranger',
    prompt: 'Play laser pointer with Ranger',
    unit: 'pounces',
    goal: 12,
  },
  {
    id: 'stickFetch',
    name: 'Stick Fetch',
    emoji: '🐕',
    // A bucket of good sticks out on the open meadow, where there's room to throw.
    where: { zone: 'meadow', x: 78.5, y: 30.5 },
    prompt: 'Throw sticks for Scout',
    unit: 'points',
    goal: 120,
  },
  {
    id: 'slingshot',
    name: 'Slingshot Targets',
    emoji: '🎯',
    // A painted board on a post in the rocky clearing, and a basket of pinecones.
    where: { zone: 'rockyClearing', x: 56.5, y: 51.5 },
    prompt: 'Pinecones at the wooden targets',
    unit: 'points',
    goal: 20,
  },
  {
    id: 'frogJump',
    name: 'Frog Jump',
    emoji: '🐸',
    // The lily pads in the slack water on the creek's west bank.
    where: { zone: 'creek', x: 39.5, y: 23.5 },
    prompt: 'Help the frog across the lily pads',
    unit: 'points',
    goal: 60,
  },
];

export function findMiniGame(id: string): MiniGameDef | undefined {
  return MINI_GAMES.find((g) => g.id === id);
}

export function miniGameRecord(records: Record<string, MiniGameRecord>, id: MiniGameId): MiniGameRecord {
  const r = records[id];
  if (r) return r;
  const fresh: MiniGameRecord = { plays: 0, best: null, goal: false };
  records[id] = fresh;
  return fresh;
}

/** What walking up to it says: the prompt, then the best so far (or what the goal pays, until it's paid). */
export function miniGameLabel(def: MiniGameDef, rec: MiniGameRecord | undefined): string {
  const best = rec?.best ?? null;
  if (best === null) return `${def.prompt} · reach ${def.goal} for ${MINI_GAME_REWARD} coins`;
  return `${def.prompt} · best ${best} ${def.unit}${rec?.goal ? '' : ` · ${def.goal} pays ${MINI_GAME_REWARD}`}`;
}

export interface MiniGameResult {
  /** A new best score (not counting the very first game, which is simply the first). */
  best: boolean;
  first: boolean;
  /** Coins paid: the goal reached for the first time. */
  coins: number;
}

/** Notes a finished game; scores are whole and never negative. */
export function recordMiniGame(records: Record<string, MiniGameRecord>, id: MiniGameId, score: number): MiniGameResult {
  const def = findMiniGame(id)!;
  const s = Math.max(0, Math.round(score));
  const rec = miniGameRecord(records, id);
  rec.plays += 1;
  const first = rec.best === null;
  const best = !first && s > rec.best!;
  if (first || s > rec.best!) rec.best = s;
  let coins = 0;
  if (!rec.goal && s >= def.goal) {
    rec.goal = true;
    coins = MINI_GAME_REWARD;
  }
  return { best, first, coins };
}
