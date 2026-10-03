import type { OutdoorZoneId, ZoneId } from './types';
import type { DecorId, FurnitureId } from './data/shop';
import { MARKET_STALL, PLAYER_START } from './data/worldMap';
import { SHOP_ITEMS } from './data/shop';
import type { GolfBallRecord } from './systems/golfBalls';

// Bump SAVE_VERSION when the state shape changes; SaveManager.migrateSave
// fills new fields from createNewGame(). The storage key stays fixed.
export const SAVE_VERSION = 13;
// The storage key keeps the game's working title so existing saves carry over.
export const SAVE_KEY = 'foxtrot-save-v4';

export type Facing = 'up' | 'down' | 'left' | 'right';

export interface PlayerState {
  x: number;
  y: number;
  facing: Facing;
  inGreenhouse: boolean;
  /** Behind the wheel of the mini truck. */
  riding?: boolean;
}

/** The mini truck: where it's parked, which way it faces, and what's riding in the back. */
export interface TruckState {
  x: number;
  y: number;
  facing: Facing;
  bed: BasketItem[];
}

export interface ClockState {
  totalMinutes: number;
  lastRealTimestamp: number;
}

export type WeatherCondition = 'clear' | 'rain' | 'overcast';

export interface WeatherState {
  condition: WeatherCondition;
  nextChangeAt: number;
}

export type GrowthStage = 'cutting' | 'young' | 'established' | 'large' | 'specimen';

/** Where an owned plant lives. Every plant the player has is exactly one of these. */
export type PlantLocation =
  | { kind: 'nursery'; bedId: string }
  | { kind: 'display'; slotId: string; potId: string }
  | { kind: 'wild'; x: number; y: number; zone: OutdoorZoneId; bedId?: string };

export interface OwnedPlant {
  id: string;
  defId: string;
  variantId: string;
  /** Drives this individual's shape: leaf angles, lean, flip. */
  seed: number;
  /** Accumulated growth, in effective game-minutes. Stage is derived from it. */
  growth: number;
  location: PlantLocation;
  plantedAt: number;
  lastCuttingAt: number | null;
  /** 0 for a plant raised from a wild find; +1 for every cutting or seedling down the line. */
  generation: number;
  /** Sprouted by itself from one of the player's outdoor plants. */
  bornWild: boolean;
  /** A wild-born sport the player hasn't walked up to yet. */
  unnoticed?: boolean;
  /** Has counted toward its species' "grown" tally (reached established while in the player's care). */
  countedGrown?: boolean;
}

/** A plant being carried: a fresh cutting (growth 0) or a potted plant lifted from somewhere. */
export interface BasketItem {
  uid: string;
  defId: string;
  variantId: string;
  seed: number;
  growth: number;
  generation: number;
  origin: 'wild' | 'cutting' | 'lifted';
  collectedAt: number;
  countedGrown?: boolean;
  /** The pot it was lifted in, if it came off display. */
  potId?: string;
}

/** A request pinned on the board by the stall: someone wants a particular plant, grown on. */
export interface Commission {
  id: string;
  /** The species asked for (unless it's "anything from a region"). */
  defId?: string;
  /** A named variety, when the buyer is particular. */
  variantId?: string;
  /** The smallest it may be. */
  minStage: GrowthStage;
  /** In this pot, when the buyer is particular. */
  potId?: string;
  /** Anything native to this region, instead of a species. */
  zone?: OutdoorZoneId;
  postedAt: number;
  expiresAt: number;
  /** The player has read it at the stall. */
  seen: boolean;
  filledAt?: number;
  filledWith?: string;
  note?: string;
}

/** A region the player has named: the plaque stands where its growth was thickest. */
export interface NamedRegion {
  name: string;
  x: number;
  y: number;
  namedAt: number;
}

export interface CommissionLog {
  filled: number;
  /** What buyers said, newest first. */
  notes: { text: string; what: string; at: number }[];
}

export interface SpeciesRecord {
  foundAt: number;
  /** Variants found (a cutting taken, a sport noticed…). */
  variants: string[];
  /** Variants successfully grown — a plant of it rooted in your care. Only these count as discovered in the journal. */
  grownVariants?: string[];
  grown: number;
  propagated: number;
  sold: number;
  earned: number;
  plantedOut: number;
  displayed: number;
}

export interface SpotState {
  collectedEpoch?: number;
  revealed?: boolean;
  /** A rare find the fox led you to: it grows here for this epoch, while its weather holds. */
  hunch?: { defId: string; variantId: string; epoch: number };
}

export interface PlacedFurniture {
  id: string;
  kind: FurnitureId;
  /**
   * Interior position of the piece's tile-sized cell (its centre is
   * x + 0.5, y + 0.5). Any fraction of a tile: placement is free.
   */
  x: number;
  y: number;
  /** Quarter-turns, for pieces that can be turned (0 or 1). */
  rot?: number;
}

/** A contained growing area the player dug outdoors. Plants inside spread only within it. */
export interface GardenBed {
  id: string;
  /** Top-left corner and size, in world tiles. */
  x: number;
  y: number;
  w: number;
  h: number;
  shape: 'rect' | 'oval';
  createdAt: number;
  /** A timber raised bed bought at the stall and set down, rather than dug. */
  raised?: boolean;
  /** What digging it cost, so filling it in can give some of it back. */
  paid?: number;
}

/** A walking path carved through the vegetation: a polyline, stored flat as x0,y0,x1,y1,… */
export interface GardenPath {
  id: string;
  points: number[];
  width: number;
  createdAt: number;
}

/** Ground cleared back to bare earth in a square or a circle: a fresh start, drawn over whatever was worked there before. */
export interface GardenClearing {
  id: string;
  x: number;
  y: number;
  size: number;
  shape: 'square' | 'circle';
  createdAt: number;
}

export type FoxFindKind = 'plant' | 'grove' | 'curiosity';

/** Something the fox led the player to. It waits, hidden, until found or forgotten. */
export interface FoxFind {
  id: string;
  kind: FoxFindKind;
  x: number;
  y: number;
  zone: OutdoorZoneId;
  defId?: string;
  variantId?: string;
  seed: number;
  curiosityId?: string;
  createdAt: number;
  expiresAt: number;
}

export interface FoxLog {
  sightings: number;
  trailsStarted: number;
  trailsFollowed: number;
  trailsLost: number;
  finds: number;
  lastTrailAt: number | null;
  /** Times the fox could have led you to a rare find and didn't; each one makes the next likelier. */
  hunchMisses: number;
}

export interface PlacedDecor {
  id: string;
  decorId: DecorId;
  x: number;
  y: number;
  /** Quarter-turns, for pieces that can be turned (0 or 1). */
  rot?: number;
  /** A pond's size as dug, in tiles at rotation 0 (the original size if unset). */
  w?: number;
  h?: number;
  /** The koi let go in a pond, by id. */
  koi?: string[];
}

/** One of the player's koi: its variety and the seed that makes its markings its own. */
export interface Koi {
  id: string;
  variety: string;
  seed: number;
}

export type FoxBehavior = 'idle' | 'wandering' | 'leading' | 'paused' | 'gone' | 'fleeing' | 'lookingBack' | 'vanishing';

export interface FoxState {
  x: number;
  y: number;
  zone: ZoneId;
  behavior: FoxBehavior;
  targetDiscoveryId: string | null;
  nextEventAt: number;
  visible: boolean;
  /** Where a fleeing fox is heading — somewhere it seems to know about. */
  destX: number | null;
  destY: number | null;
  facing: 'left' | 'right';
  /** Real seconds the player has been too far behind to keep it in sight. */
  lostFor: number;
  /** Real seconds spent on the current trail. */
  trailTime: number;
  /** What's waiting at the end of the trail, decided when the fox sets off. */
  trailReward: FoxFindKind | 'nothing' | null;
  /** It has actually run from you on this visit (rather than just watching). */
  fled: boolean;
}

export type ScoutBehavior = 'following' | 'idleSit' | 'idleSniff' | 'idleLook' | 'noticing' | 'leading' | 'pointing' | 'chasingFrog';

export interface ScoutState {
  x: number;
  y: number;
  facing: Facing;
  behavior: ScoutBehavior;
  nextEventAt: number;
  /** Off after a scent: the curiosity he's leading Ellen to. */
  leadTo?: { x: number; y: number; findId: string };
  /** Game-minute he might next catch a scent worth following. */
  nextSniffAt?: number;
  /** After a frog: the seed of the one she's chasing. */
  frog?: number;
}

export type ScottActivity =
  | 'traveling'
  | 'tinkering'
  | 'napping'
  | 'snacking'
  | 'golfing'
  | 'putting'
  | 'watchingTV'
  | 'relaxing'
  | 'fishing'
  | 'choppingWood'
  | 'baking'
  | 'fixingTruck'
  | 'driving'
  | 'pettingRanger'
  | 'playingWithScout'
  | 'withEllen'
  | 'showingPlant';

export interface ScottState {
  x: number;
  y: number;
  zone: ZoneId;
  facing: Facing;
  activity: ScottActivity;
  currentSpotId: string | null;
  targetSpotId: string;
  nextChangeAt: number;
  /** Jogging back to work after being caught (and kissed). */
  hurrying?: boolean;
  /** Out for a drive in Ellen's truck: which leg of the loop he's on. */
  driveLeg?: number;
  /** Where the truck was parked when he took it, so he can put it back. */
  driveHome?: { x: number; y: number; facing: Facing };
  /** Game-minute until which his last loaf sits cooling on the coffee table. */
  loafUntil?: number;
  /** The cannabis seedling he's waiting by to show Ellen, and since when. */
  showPlant?: { plantId: string; since: number };
  /** Wild cannabis he's already shown her (or that was there before he started looking). */
  shownPlants?: string[];
}

export type CatActivity = 'wandering' | 'sitting' | 'grooming' | 'sleeping' | 'investigating' | 'hiding';

export interface CatState {
  x: number;
  y: number;
  facing: Facing;
  activity: CatActivity;
  currentSpotId: string | null;
  targetSpotId: string;
  nextChangeAt: number;
  /** Where she's headed when it isn't one of her fixed spots (a plant to sniff, a place to hide). */
  targetX?: number | null;
  targetY?: number | null;
  targetActivity?: CatActivity | null;
  /** The plant she's sniffing at, so she faces it. */
  lookX?: number | null;
}

export interface PuttingRecord {
  /** Rounds played to the end. */
  rounds: number;
  /** Fewest strokes for the full course, or null before the first finished round. */
  best: number | null;
  /** How many holes the course had when that best was set: a longer course starts a fresh record. */
  holes?: number;
  /** Which course that best was set on: a redesigned course starts a fresh record. */
  course?: string;
  /** Holes aced at least once, by hole id. */
  aces: string[];
}

/** One of the little games around the property (see systems/minigames). */
export interface MiniGameRecord {
  /** Games played to the end. */
  plays: number;
  /** Best score, or null before the first finished game. */
  best: number | null;
  /** Whether its goal has been reached (and the one-off reward paid). */
  goal: boolean;
}

/**
 * What October has left in the save. Nothing here is ever announced: the
 * strange things are only counted, and the journal's October page shows
 * what has been seen once it has been. Switching the look back to Classic
 * leaves all of it as it is.
 */
export interface OctoberLog {
  /** How many times each strange thing has been seen, by id. */
  seen: Record<string, number>;
  /** Pumpkins carved into jack-o'-lanterns: pumpkin id → face. */
  carved: Record<string, string>;
  /** Every face ever carved, in the order first carved. */
  faces: string[];
  /** Times the pale thing has left something behind. */
  gifts: number;
  /** The game day it last did (it only does once a night). */
  giftDay: number | null;
  /** A pumpkin that's turned up where nobody put it, until the morning. */
  stray: { x: number; y: number; face: string; until: number } | null;
}

export interface GameState {
  version: number;
  createdAt: number;
  player: PlayerState;
  /** The mini truck, once bought. */
  truck: TruckState | null;
  clock: ClockState;
  weather: WeatherState;
  coins: number;
  /** One-off shop purchases. */
  owned: string[];
  /** Repeatable shop items bought at least once (one-offs live in `owned`): what opens up the next step in the market. */
  bought: string[];
  /** How many of each price-escalating repeatable item have been bought. */
  purchases: Record<string, number>;
  /** Shop items the player has already looked at; anything else shows NEW. */
  seenShop: string[];
  /** Garden decor bought but not yet placed. */
  decorStock: Partial<Record<DecorId, number>>;
  decor: PlacedDecor[];
  /** The sizes of ponds bought but not yet dug, in the order they'll be set down. */
  pondStock: { w: number; h: number }[];
  /** Every koi the player owns: in a pond (a pond lists it) or waiting in its bag. */
  koi: Koi[];
  /** Where the Plant Stand & Supply stall stands: its top-left tile. It can be moved like the decor. */
  stall: { x: number; y: number; /** Turned round to face the other way (2), or as built (0). */ rot?: number };
  /** Greenhouse furniture bought but not yet placed. */
  furnitureStock: Partial<Record<FurnitureId, number>>;
  /** Stands, hooks, trays, tables… the player has placed or moved indoors. */
  furniture: PlacedFurniture[];
  /**
   * The greenhouse's original fittings (nursery beds, the first stands…)
   * stand where the layout put them until the player first moves one; from
   * then on it lives in `furniture` like anything else. Ids listed here have
   * been taken over that way.
   */
  seededFixtures: string[];
  gardenBeds: GardenBed[];
  paths: GardenPath[];
  /** Squares and circles cleared to bare earth, oldest first: each newer one lies over what it covers. */
  clearings: GardenClearing[];
  /** Wild bushes, flowers and reeds cleared away by paths and beds ("x,y" tiles). */
  clearedObstacles: string[];
  foxFinds: FoxFind[];
  foxLog: FoxLog;
  /** Putt-putt on the living-room mat. */
  putting: PuttingRecord;
  /** Acorn pitch, rock skipping, the garden maze and the rest, by game id. */
  minigames: Record<string, MiniGameRecord>;
  /** Mushrooms, insects and other oddities found in the wild, by id. */
  curiosities: Record<string, { foundAt: number; count: number }>;
  /** The golf ball collection: how many of each kind of lost golf ball have been found, by id. */
  golfBalls: Record<string, GolfBallRecord>;
  tools: { lantern: number };
  basket: BasketItem[];
  plants: Record<string, OwnedPlant>;
  collection: Record<string, SpeciesRecord>;
  spots: Record<string, SpotState>;
  /** One-time guidance already shown. */
  hints: string[];
  fox: FoxState;
  scout: ScoutState;
  scott: ScottState;
  cat: CatState;
  /** Today's sales by species, so repeat sales of one plant fetch less. */
  market: { day: number; sold: Record<string, number> };
  /** The request pinned on the board by the stall, if any. */
  commission: Commission | null;
  commissions: CommissionLog;
  /** Regions the player has named. */
  regions: Partial<Record<OutdoorZoneId, NamedRegion>>;
  /** The highest cover tier each region has reached, so each crossing is noticed once. */
  regionTier: Partial<Record<OutdoorZoneId, number>>;
  /** October's pumpkins, and the strange things seen while it lasted. */
  october: OctoberLog;
}

export function newOctoberLog(): OctoberLog {
  return { seen: {}, carved: {}, faces: [], gifts: 0, giftDay: null, stray: null };
}

let uidCounter = 0;
export function makeUid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${uidCounter}`;
}

export function createNewGame(): GameState {
  const now = Date.now();
  return {
    version: SAVE_VERSION,
    createdAt: now,
    player: { x: PLAYER_START.x, y: PLAYER_START.y, facing: 'down', inGreenhouse: false, riding: false },
    truck: null,
    clock: { totalMinutes: 8 * 60, lastRealTimestamp: now },
    weather: { condition: 'clear', nextChangeAt: 8 * 60 + 360 },
    coins: 20,
    owned: [],
    bought: [],
    purchases: {},
    // Everything on sale from the start counts as seen: NEW is for what
    // unlocks later, not the whole catalogue on day one.
    seenShop: SHOP_ITEMS.filter((s) => !s.after).map((s) => s.id),
    decorStock: {},
    decor: [],
    pondStock: [],
    koi: [],
    stall: { x: MARKET_STALL.x, y: MARKET_STALL.y },
    furnitureStock: {},
    furniture: [],
    seededFixtures: [],
    gardenBeds: [],
    paths: [],
    clearings: [],
    clearedObstacles: [],
    foxFinds: [],
    foxLog: { sightings: 0, trailsStarted: 0, trailsFollowed: 0, trailsLost: 0, finds: 0, lastTrailAt: null, hunchMisses: 0 },
    putting: { rounds: 0, best: null, aces: [] },
    minigames: {},
    curiosities: {},
    golfBalls: {},
    tools: { lantern: 0 },
    basket: [],
    plants: {},
    collection: {},
    spots: {},
    hints: [],
    fox: {
      x: PLAYER_START.x + 4,
      y: PLAYER_START.y + 2,
      zone: 'meadow',
      behavior: 'idle',
      targetDiscoveryId: null,
      nextEventAt: 8 * 60 + 5,
      visible: true,
      destX: null,
      destY: null,
      facing: 'right',
      lostFor: 0,
      trailTime: 0,
      trailReward: null,
      fled: false,
    },
    scout: { x: PLAYER_START.x - 0.8, y: PLAYER_START.y + 0.8, facing: 'down', behavior: 'following', nextEventAt: 8 * 60 + 10 },
    scott: {
      x: 8,
      y: 7,
      zone: 'greenhouse',
      facing: 'down',
      activity: 'tinkering',
      currentSpotId: 'greenhouse-tinker',
      targetSpotId: 'greenhouse-tinker',
      nextChangeAt: 8 * 60 + 20,
    },
    market: { day: 0, sold: {} },
    commission: null,
    commissions: { filled: 0, notes: [] },
    regions: {},
    regionTier: {},
    october: newOctoberLog(),
    cat: {
      x: 21.95,
      y: 3.5,
      facing: 'down',
      activity: 'sleeping',
      currentSpotId: 'couch-nap',
      targetSpotId: 'couch-nap',
      nextChangeAt: 8 * 60 + 15,
      targetX: null,
      targetY: null,
      targetActivity: null,
      lookX: null,
    },
  };
}
