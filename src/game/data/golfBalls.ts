import type { Rarity } from '../types';

// Every golf ball Scout and the fox turn up is one of these. They're the
// same lost golf balls that have always been lying about the valley — the
// collection only gives each one a name. Adding another kind is adding
// another line here: the journal, the rack by the putting mat, the odds
// and the save all read this list.

export type GolfBallRarity = 'common' | 'uncommon' | 'rare' | 'veryRare' | 'legendary';

export const GOLF_BALL_RARITIES: GolfBallRarity[] = ['common', 'uncommon', 'rare', 'veryRare', 'legendary'];

export const GOLF_BALL_RARITY_LABEL: Record<GolfBallRarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  veryRare: 'Very Rare',
  legendary: 'Legendary',
};

/** The game's own rarity ladder, for its colours, pips and discovery flourishes. */
export const GOLF_BALL_GAME_RARITY: Record<GolfBallRarity, Rarity> = {
  common: 'common',
  uncommon: 'uncommon',
  rare: 'rare',
  veryRare: 'veryRare',
  legendary: 'extremelyRare',
};

/** How the ball is painted: a base colour and one distinguishing mark. */
export type GolfBallMark = 'none' | 'scuff' | 'range' | 'stripe' | 'logo' | 'vintage' | 'tournament' | 'glitter' | 'number' | 'gold' | 'fox' | 'ace';

export interface GolfBallLook {
  base: string;
  /** The colour of its mark (stripe, logo, number…). */
  accent?: string;
  mark: GolfBallMark;
}

export interface GolfBallDef {
  id: string;
  name: string;
  rarity: GolfBallRarity;
  description: string;
  look: GolfBallLook;
  /**
   * Kept secret until found: the journal shows this name and no rarity,
   * and draws only a question mark. Its real name and look appear once
   * it's in hand.
   */
  hidden?: { name: string };
}

export const GOLF_BALLS: GolfBallDef[] = [
  { id: 'oldWhite', name: 'Old White', rarity: 'common', description: 'Gone a little yellow, the way old white things do. Still round.', look: { base: '#ece6d2', mark: 'none' } },
  { id: 'scuffedWhite', name: 'Scuffed White', rarity: 'common', description: 'Scuffed, grass-stained, and a long way from any hole. Someone around here has a slice.', look: { base: '#f7f5ee', accent: '#6f9a4a', mark: 'scuff' } },
  { id: 'yellowBall', name: 'Yellow Ball', rarity: 'common', description: 'Optic yellow, bought so it would be easy to find. Apparently not.', look: { base: '#e8dc5a', mark: 'none' } },
  { id: 'rangeBall', name: 'Range Ball', rarity: 'common', description: 'A hard old driving-range ball with a red band round it. A long way from the range.', look: { base: '#f2efe4', accent: '#c0443a', mark: 'range' } },
  { id: 'pinkBall', name: 'Pink Ball', rarity: 'uncommon', description: 'Soft matte pink. It was hiding very badly in the clover.', look: { base: '#eba7b8', mark: 'none' } },
  { id: 'orangeBall', name: 'Orange Ball', rarity: 'uncommon', description: 'Bright orange, for playing in the snow. It isn’t snowing.', look: { base: '#ec9a48', mark: 'none' } },
  { id: 'stripeBall', name: 'Stripe Ball', rarity: 'uncommon', description: 'A black line round its middle, for lining up putts. It did not help.', look: { base: '#f7f5ee', accent: '#2a2a2a', mark: 'stripe' } },
  { id: 'logoBall', name: 'Logo Ball', rarity: 'uncommon', description: 'From a hardware shop’s charity day, years ago. The logo has nearly worn away.', look: { base: '#f7f5ee', accent: '#3a6aa8', mark: 'logo' } },
  { id: 'vintageBall', name: 'Vintage Ball', rarity: 'rare', description: 'Cream and crazed, with old-fashioned dimples. Older than Scott, probably.', look: { base: '#e2d2ac', accent: '#8a6a3a', mark: 'vintage' } },
  { id: 'tournamentBall', name: 'Tournament Ball', rarity: 'rare', description: 'Stamped for a club championship nobody remembers holding.', look: { base: '#fbfaf4', accent: '#1f5a3a', mark: 'tournament' } },
  { id: 'glitterBall', name: 'Glitter Ball', rarity: 'rare', description: 'Clear plastic shell, full of glitter. It catches the light from across the grass.', look: { base: '#b9c8e8', accent: '#ffffff', mark: 'glitter' } },
  { id: 'numberedBall', name: 'Numbered Ball', rarity: 'rare', description: 'A big red 7 on it. Lucky for somebody, once.', look: { base: '#f7f5ee', accent: '#b8322a', mark: 'number' } },
  { id: 'goldenBall', name: 'Golden Ball', rarity: 'veryRare', description: 'Gold all over. It isn’t really gold, but it’s heavy enough to make you wonder.', look: { base: '#d8a838', accent: '#fff2b8', mark: 'gold' } },
  { id: 'foxBall', name: 'Fox Ball', rarity: 'veryRare', description: 'Russet, with a little white-tipped tail painted round it. The fox seemed pleased with this one.', look: { base: '#c8642a', accent: '#f4ecdc', mark: 'fox' } },
  {
    id: 'mysteryBall',
    name: 'Scott’s Hole-in-One Ball',
    rarity: 'legendary',
    description: 'Signed, dated, and missing for years. Scott always said the dog took it. The dog never said anything.',
    look: { base: '#f7f5ee', accent: '#2a3a6a', mark: 'ace' },
    hidden: { name: 'Mystery Ball' },
  },
];

export function findGolfBall(id: string): GolfBallDef | undefined {
  return GOLF_BALLS.find((b) => b.id === id);
}

/** The curiosity every golf ball turns up as. */
export const GOLF_BALL_CURIOSITY = 'lostGolfBall';

/**
 * How often each rarity turns up, shared out among the balls of that
 * rarity: the weight is per tier, so adding another common ball doesn't
 * make commons any more common.
 */
export const GOLF_BALL_TIER_WEIGHT: Record<GolfBallRarity, number> = { common: 60, uncommon: 25, rare: 10, veryRare: 4, legendary: 1 };

/**
 * Kinds not yet found turn up this many times more often. Golf balls are
 * only found every few in-game hours, so without it the last few would
 * take a very long time indeed — with it, a Legendary is something you
 * find after a long while, not never.
 */
export const GOLF_BALL_UNFOUND_BOOST = 4;
