import type { Facing, GameState, OwnedPlant } from '../state';
import { makeUid } from '../state';
import { loadOrCreate, saveGame, resetGame } from './SaveManager';
import { advanceClock } from './Clock';
import { Camera } from './Camera';
import { Input } from './Input';
import { AudioManager } from './AudioManager';
import { Renderer } from '../world/Renderer';
import { generateObstacles, buildBlockingSet, type Obstacle } from '../world/Obstacles';
import { isBlockedOutdoor, isBlockedIndoor, indoorSolids, type IndoorSolids } from '../world/Collision';
import { tryMove } from '../world/Movement';
import { HOUSE_DOOR, GRID_W, GRID_H, TILE_SIZE, zoneAt, rectContains, isInBounds, isWater, isInsideHomeFootprint, segmentHitsRect, GREENHOUSE_FOOTPRINT, HOUSE_FOOTPRINT } from '../data/worldMap';
import { FRONT_DOOR, roomAt, GREENHOUSE_DOORS, BUILDING_DOORS, DOOR_OUTWARD, type GreenhouseDoor } from '../data/interior';
import { FURNITURE_DEFS } from '../data/furniture';
import { displaySlots, nurserySpots, placeFurniture, placeBlockReason, pickUpFurniture, findFurniture, fixtureOffset, footprint } from '../systems/furniture';
import { ACE_REWARD, COURSE, COURSE_PAR, bestRound, recordAce, recordRound, toPar } from '../systems/putting';
import { MINI_GAMES, findMiniGame, miniGameLabel, recordMiniGame, type MiniGameId, type MiniGameResult } from '../systems/minigames';
import { endPlay, startPlay, tickPlay, type PlayState } from '../systems/play';
import { makeIndoorCamera, screenToTiles } from '../world/IndoorCamera';
import { Camera as CameraClass } from './Camera';
import { ToolController, type ToolOutcome } from './Tools';
import {
  compostPlant,
  removeBed,
  findBed,
  removePath,
  onPath,
  bedAt,
  pathAt,
  wildGrid,
  currentRadius,
  type LandscapeWorld,
  clearCost,
  clearBlock,
  clearObstacle,
  hasClearTool,
  CLEAR_TOOL,
  TOOL_NAME,
  CLEAR_VERB,
  bedTurnBlock,
  rotateBed,
} from '../systems/landscape';
import { createFoxFinds, collectFoxFind, expireFoxFinds, pickCuriosity, FOX_FIND_LIFETIME } from '../systems/foxFinds';
import { findCuriosity } from '../data/curiosities';
import { findKeepsake } from '../data/keepsakes';
import { GOLF_BALL_CURIOSITY, GOLF_BALL_GAME_RARITY, GOLF_BALL_RARITY_LABEL } from '../data/golfBalls';
import type { GolfBallFind } from '../systems/golfBalls';
import { discoveryFlourish, discoveryAside, type Flourish } from '../systems/rarity';
import type { CatInterest } from '../systems/cat';
import { KIND_SIGNIFICANCE, type Significance, type ToastKind, type ToastOptions } from '../systems/toasts';
import { isNight, MINUTES_PER_DAY, GAME_MINUTES_PER_REAL_SECOND } from './Clock';
import type { Rarity } from '../types';
import { DISCOVERY_SPOTS } from '../data/discoveryPoints';
import { TOOL_PICKUPS } from '../data/toolPickups';
import { PLANTS, specimenName, specimenRarity, rarityRank, RARITY_LABEL, fullName } from '../data/plants';
import { findShopItem, type DecorId, type FurnitureId } from '../data/shop';
import { ZONES } from '../data/zones';
import type { OutdoorZoneId, ZoneId } from '../types';
import { tickFox } from '../systems/fox';
import { tickScout, facingToward, SNIFF_MIN, SNIFF_MAX, SNIFF_GAP, FROG_SIGHT, FROG_CATCH_CHANCE } from '../systems/scout';
import { riverFrogs, alligatorAt, gatorBaskLeftMs, GATOR_BANK, GATOR_RIDE_MS, type FrogAt } from '../systems/wildlife';
import { overlandWaypoint } from '../data/worldMap';
import { tickScott, tickChase, newChase, companySpots, truckSpots, CANNABIS } from '../systems/scott';
import type { ScottSpot } from '../data/scottSpots';
import { tickCat } from '../systems/cat';
import { spotContent, collectSpot } from '../systems/spots';
import { advanceWorld, canPlantAt, computeLushness, type LushField } from '../systems/wild';
import { STAGE_LABEL, stageIndexOf, stageOf } from '../systems/growth';
import { hasFound, recordFound, isEstablished, recordGrown } from '../systems/collection';
import {
  takeCutting,
  cuttingBlockReason,
  potInNursery,
  placeOnDisplay,
  plantOutdoors,
  liftPlant,
  setPot,
  creditGrown,
  occupantOf,
  occupantsByPlace,
  crossBlockReason,
  crossPollinate,
  crossOf,
} from '../systems/propagation';
import { sellItem, buyItem, sellBack, resellables, type BuyOptions, type Resellable } from '../systems/market';
import { addKoiToPond, removeKoiFromPond, koiVariety, pondCapacity, pondSize } from '../systems/koi';
import { tickCommissions, fillCommission, openCommission } from '../systems/commissions';
import { tickBedCuriosities } from '../systems/beds';
import { checkRegionTiers, eveningStroll, lushestTile, nameRegion, regionLabel, suggestedName } from '../systems/regions';
import { describeRegion } from '../systems/wild';
import { catAvoids } from '../systems/cat';
import { minuteOfDay } from './Clock';
import { pickUpDecor, nearestDecor, moveDecor, decorFits, isGardenPlanter } from '../systems/decor';
import { stallRect } from '../systems/yard';
import { boardTruck, parkTruck, deliverTruck, truckCovers, truckHitsBuilding, scottDriving, loadTruck, unloadTruck, takeOut, TRUCK_SPEED, TRUCK_BED_CAP } from '../systems/truck';
import { basketCapacity } from '../systems/basket';
import { daylightFactor } from './Clock';
import { initTheme, isOctober, onThemeChange } from '../season';
import { PUMPKINS, LANTERN_POSTS, PORCH_LANTERN, OWL_PERCH, BLACK_CAT_SPOT, findFace } from '../data/october';
import {
  newDirector,
  tickDirector,
  newGhost,
  tickGhost,
  ghostApproachable,
  meetGhost,
  carvePumpkin,
  lanternsLit,
  nextDawn,
  strayPumpkin,
  noteSeen,
  leaveFind,
  pickLanternFind,
  gameDay,
  type OctoberDirector,
  type GhostState,
  type OctoberView,
  type OctoberEventKind,
} from '../systems/october';
import { MYSTERIES, MYSTERY_IDS, ON_TRACK_CUTTING, markNudged, markOnTrack, mysteryStage, nudgeText, pendingNudge, solutionUnannounced, tickMysteries, type MysteryId, type NudgeContext } from '../systems/mysteries';

export type InteractableKind =
  | 'plaque'
  | 'spot'
  | 'wildPlant'
  | 'market'
  | 'lantern'
  | 'greenhouseDoor'
  | 'greenhouseExit'
  | 'houseDoor'
  | 'frontDoor'
  | 'foxFind'
  | 'bed'
  | 'display'
  | 'puttingMat'
  | 'miniGame'
  | 'rock'
  | 'decor'
  | 'pond'
  | 'setDown'
  | 'truck'
  | 'pumpkin'
  | 'ghost';

export interface Interactable {
  kind: InteractableKind;
  id: string;
  x: number;
  y: number;
  label: string;
  available: boolean;
}

export interface ToastEvent {
  id: string;
  text: string;
  kind: ToastKind;
  /** How much it matters: decides how long it stays and what may interrupt it. */
  significance: Significance;
  /** Whether it's still worth showing, and what to note once it has been. */
  opts?: ToastOptions;
  /** A new kind of golf ball: shown with the ball itself. */
  golfBall?: string;
}

/**
 * How important each kind of thing to interact with is. When two are both
 * within reach, the more important one wins, however close the other is:
 * a door is never lost behind a seedling, nor the stall behind the plants
 * that have grown up around it. Distance only decides between equals.
 */
export const INTERACT_PRIORITY: Record<InteractableKind, number> = {
  setDown: 0,
  greenhouseDoor: 0,
  greenhouseExit: 0,
  houseDoor: 0,
  frontDoor: 0,
  market: 1,
  bed: 2,
  display: 2,
  puttingMat: 2,
  miniGame: 4,
  foxFind: 3,
  lantern: 3,
  plaque: 3,
  spot: 4,
  decor: 5,
  pond: 5,
  rock: 5,
  wildPlant: 6,
  truck: 1,
  ghost: 2,
  pumpkin: 4,
};

/** Picks what a press of the button should act on: the highest priority within reach, nearest among equals. */
export function pickInteractable<T extends { kind: InteractableKind; dist: number }>(candidates: T[]): T | null {
  let best: T | null = null;
  for (const c of candidates) {
    if (!best) {
      best = c;
      continue;
    }
    const pc = INTERACT_PRIORITY[c.kind];
    const pb = INTERACT_PRIORITY[best.kind];
    if (pc < pb || (pc === pb && c.dist < best.dist)) best = c;
  }
  return best;
}

const AUTOSAVE_MS = 8000;

// The zoom is a per-device view preference, not part of the saved game.
const ZOOM_KEY = 'foxtail-zoom';

function loadZoom(): number {
  try {
    const v = Number(localStorage.getItem(ZOOM_KEY));
    return Number.isFinite(v) && v > 0 ? v : 1;
  } catch {
    return 1;
  }
}

function preventDefault(e: Event) {
  e.preventDefault();
}

function saveZoom(z: number) {
  try {
    localStorage.setItem(ZOOM_KEY, z.toFixed(3));
  } catch {
    // Private browsing or storage off: the zoom just won't be remembered.
  }
}
const MOVE_SPEED = 3.4; // tiles per second
/** Walking a path you carved is easy going… */
const PATH_SPEED = 1.2;
/** …pushing through thick growth is not. */
const MAX_THICKET_SLOW = 0.45;
/** How far away you can tap a plant or bed to look at it. */
const TAP_REACH = 7;
const FADE_MS = 380;
const CAT_INTEREST_MS = 2500;

/** A brief shimmer in the world where something rare was just found. */
export interface WorldFlourish {
  x: number;
  y: number;
  kind: Flourish;
  rarity: Rarity;
  start: number;
}
const INTERACT_RANGE = 1.3;
const NOTICE_RANGE = 2.2;
/** Real seconds between one of the last mysteries' observations and the next. */
const MYSTERY_QUIET_SECONDS = 90;

/** A secret plant has nothing about it to catch the eye: you have to walk right up to it. */
const SECRET_NOTICE_RANGE = 1.0;
const LUSH_REFRESH_MS = 1500;

function spanText(gameMinutes: number): string {
  const hours = gameMinutes / 60;
  return hours >= 36 ? `${Math.round(hours / 24)} days` : hours >= 20 ? 'about a day' : hours >= 1.5 ? `${Math.round(hours)} hours` : 'a little while';
}

/** "the Meadow", or the name Ellen gave it — for use mid-sentence. */
export function zoneLabel(z: ZoneId, state?: Pick<GameState, 'regions'>): string {
  if (state && z !== 'greenhouse' && state.regions[z]) return state.regions[z]!.name;
  return ZONES[z].name.replace(/^The /, 'the ');
}

function listZones(zones: string[], state: Pick<GameState, 'regions'>): string {
  const names = zones.map((z) => zoneLabel(z as ZoneId, state));
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export class Game {
  state: GameState;
  isNew = false;
  camera = new Camera();
  input = new Input();
  audio = new AudioManager();
  renderer: Renderer;
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  obstacles: Obstacle[];
  blockingSet: Set<string>;
  indoorSolid: IndoorSolids;
  nearest: Interactable | null = null;
  lush: LushField;
  onToast: ((t: ToastEvent) => void) | null = null;
  onStateTouched: (() => void) | null = null;
  onOpenGreenhouse: ((target: { kind: 'bed' | 'display'; id: string }) => void) | null = null;
  onOpenMarket: (() => void) | null = null;
  onOpenPond: ((pondId: string) => void) | null = null;
  onOpenPutting: (() => void) | null = null;
  /** One of the little games around the property: acorns, stones, the maze, the laser pointer… */
  onOpenMiniGame: ((id: MiniGameId) => void) | null = null;
  onOpenPlantCard: ((plantId: string) => void) | null = null;
  onOpenGroundCard: ((target: { kind: 'bed' | 'path'; id: string }) => void) | null = null;
  /** The journal's Regions page: where a region is named. */
  onOpenRegions: (() => void) | null = null;
  onFrame: (() => void) | null = null;
  tools: ToolController;
  world: LandscapeWorld;
  obstacleMap = new Map<string, Obstacle>();
  /** Ellen chasing Scott, and the kiss it ends in. */
  chase = newChase();
  /** The garden piece Ellen is carrying to somewhere new, if any. */
  carryingDecorId: string | null = null;
  cleared = new Set<string>();
  flourishes: WorldFlourish[] = [];
  /** performance.now() when the last doorway was stepped through, for a soft fade. */
  fadeFrom = 0;
  /** Indoors while arranging, the view can be panned away from Ellen. */
  indoorFocus: { x: number; y: number } | null = null;
  /** The same outdoors, while arranging the garden. */
  outdoorFocus: { x: number; y: number } | null = null;
  private catInterests: CatInterest[] = [];
  private catInterestAcc = CAT_INTEREST_MS;
  private press: {
    id: number;
    sx: number;
    sy: number;
    kind: 'tool' | 'pan' | 'tap';
    lastSX: number;
    lastSY: number;
    moved: boolean;
    touch: boolean;
    /** What was selected in arrange mode before this press, to restore if it turns into a pinch. */
    prevSelected?: string | null;
  } | null = null;
  /** Every finger currently on the canvas, for pinching. */
  private pointers = new Map<number, { x: number; y: number }>();
  /** A two-finger pinch in progress: the spread and zoom it started from. */
  private pinch: { startDist: number; startZoom: number } | null = null;
  private lastFrame = performance.now();
  /** Creek frogs out of sight, by seed, until when (performance.now() ms): fled into the water, or eaten. */
  private frogsGone = new Map<number, number>();
  /** When (performance.now() ms) the alligator set off round the creek with Scout on its back, while it's out. */
  private gatorRide: number | null = null;
  /** Not another ride before this (performance.now() ms): the old thing likes its rest. */
  private nextGatorRideAt = 0;
  /** Where a frog's just plopped into the creek, for the ripple. */
  private frogSplashes: { x: number; y: number; start: number }[] = [];
  private autosaveAcc = 0;
  private spreadCarry = 0;
  private lushAcc = 0;
  private lushDirty = true;
  private started = false;
  private rafId = 0;
  /** Game-minute timestamp until which Ellen renders in her brief collect/crouch pose. */
  actionAnimUntil = 0;
  /** October's strange things: what's happening, and when the next might. */
  private octDirector: OctoberDirector = newDirector();
  /** The pale thing. */
  private ghost: GhostState = newGhost();
  /** What the renderer draws of October this frame (null in Classic). */
  private octView: OctoberView | null = null;
  /** Trees and bushes by their centres, for strange things to stand behind. */
  private octTrees: { x: number; y: number }[] = [];
  private octBushes: { x: number; y: number }[] = [];
  /** The owl's tree: the one nearest its perch. */
  private owlPerch: { x: number; y: number } = { x: OWL_PERCH.x, y: OWL_PERCH.y - 0.75 };
  private owlAlpha = 0;
  private blackCat = 0;
  /** The game day the black cat was last made to go: it doesn't come back till the next night. */
  private blackCatGoneDay = -1;
  /** October's creatures already noticed this visit, so each is only counted once a visit. */
  private octNoticed = new Set<string>();
  private strayNoticed = -1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.renderer = new Renderer(ctx);
    initTheme();
    const { state, isNew } = loadOrCreate();
    this.state = state;
    this.isNew = isNew;
    this.obstacles = generateObstacles();
    for (const o of this.obstacles) this.obstacleMap.set(`${o.x},${o.y}`, o);
    for (const o of this.obstacles) {
      if (o.kind === 'tree') this.octTrees.push({ x: o.x + 0.5, y: o.y + 0.5 });
      else if (o.kind === 'bush') this.octBushes.push({ x: o.x + 0.5, y: o.y + 0.5 });
    }
    const perch = this.octTrees.reduce<{ x: number; y: number } | null>((best, t) => (!best || Math.hypot(t.x - OWL_PERCH.x, t.y - OWL_PERCH.y) < Math.hypot(best.x - OWL_PERCH.x, best.y - OWL_PERCH.y) ? t : best), null);
    if (perch) this.owlPerch = { x: perch.x, y: perch.y - 0.62 };
    // Switching the look changes nothing that's kept: only what's drawn, and what may happen next.
    onThemeChange(() => {
      this.octDirector = newDirector();
      this.ghost = newGhost();
      this.octView = null;
      this.onStateTouched?.();
    });
    this.cleared = new Set(this.state.clearedObstacles);
    this.blockingSet = buildBlockingSet(this.obstacles, this.cleared);
    this.indoorSolid = indoorSolids(this.state);
    this.lush = computeLushness(this.state);
    // Saves from before the journal waited for things to be grown: whatever is already rooted counts.
    recordGrown(this.state, this.state.clock.totalMinutes);
    this.world = {
      obstacleAt: (tx, ty) => {
        const key = `${tx},${ty}`;
        const o = this.obstacleMap.get(key);
        return o && !this.cleared.has(key) ? o.kind : null;
      },
      isBuiltOrWater: (tx, ty) =>
        !isInBounds(tx, ty) ||
        isWater(tx, ty) ||
        isInsideHomeFootprint(tx, ty) ||
        rectContains(stallRect(this.state), tx, ty) ||
        BUILDING_DOORS.some((d) => {
          const o = DOOR_OUTWARD[d.wall];
          return (tx === d.outside.x && ty === d.outside.y) || (tx === d.outside.x + o.x && ty === d.outside.y + o.y);
        }) ||
        (tx === HOUSE_DOOR.x && (ty === HOUSE_DOOR.y || ty === HOUSE_DOOR.y + 1)),
      isSpot: (tx, ty) => DISCOVERY_SPOTS.some((s) => s.x === tx && s.y === ty),
    };
    this.tools = new ToolController({
      state: this.state,
      world: this.world,
      now: () => this.state.clock.totalMinutes,
      player: () => ({ x: this.state.player.x, y: this.state.player.y }),
      openGround: (tx, ty) => this.isOpenGround(tx, ty),
    });
    this.tools.onChange = () => {
      if (this.tools.mode.kind !== 'arrange') this.indoorFocus = null;
      if (this.tools.mode.kind !== 'yard') this.outdoorFocus = null;
      this.onToolsChanged?.();
    };

    this.input.onInteract(() => {
      if (!this.tools.active) this.interactWithNearest();
    });
    window.addEventListener('keydown', this.onToolKey);
    window.addEventListener('keydown', this.onZoomKey);
    this.camera.setUserZoom(loadZoom());
    this.bindPointer();
    window.addEventListener('resize', this.handleResize);
    document.addEventListener('visibilitychange', this.saveWhenHidden);
    document.addEventListener('visibilitychange', this.pauseWhenHidden);
    window.addEventListener('pagehide', this.saveNow);
    this.handleResize();
  }

  // Mobile browsers often kill a backgrounded tab without warning, so don't
  // wait for the next autosave tick to persist what just happened.
  private saveNow = () => {
    if (this.started) saveGame(this.state);
  };
  private saveWhenHidden = () => {
    if (document.visibilityState === 'hidden') this.saveNow();
  };

  private handleResize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.camera.resize(w, h);
  };

  start() {
    this.started = true;
    this.lastFrame = performance.now();
    if (this.isNew) {
      this.hint('start', 'Wild plants grow in patches all over the valley. Walk up and take a cutting.', 'important', () => this.outdoors() && Object.keys(this.state.collection).length === 0);
    }
    this.rafId = requestAnimationFrame(this.loop);
  }

  private loop = (now: number) => {
    this.rafId = 0;
    const dtMs = Math.min(100, now - this.lastFrame);
    this.lastFrame = now;
    this.update(dtMs);
    this.render(now);
    this.onFrame?.();
    // Out of sight, nothing is drawn or stepped at all (the clock catches up
    // from the wall clock on return, as it does after any time away).
    if (!this.pausedHidden) this.rafId = requestAnimationFrame(this.loop);
  };

  /** Whether the frame loop is stood down because the page is hidden. */
  private pausedHidden = false;

  private pauseWhenHidden = () => {
    if (!this.started) return;
    if (document.visibilityState === 'hidden') {
      this.pausedHidden = true;
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    } else if (this.pausedHidden) {
      this.pausedHidden = false;
      if (!this.rafId) this.rafId = requestAnimationFrame(this.loop);
    }
  };

  onToolsChanged: (() => void) | null = null;

  stop() {
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    document.removeEventListener('visibilitychange', this.pauseWhenHidden);
    window.removeEventListener('keydown', this.onToolKey);
    window.removeEventListener('keydown', this.onZoomKey);
    this.input.destroy();
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.saveWhenHidden);
    window.removeEventListener('pagehide', this.saveNow);
  }

  private pushToast(text: string, kind: ToastKind = 'info', significance: Significance = KIND_SIGNIFICANCE[kind], opts?: ToastOptions) {
    this.onToast?.({ id: makeUid('toast'), text, kind, significance, opts });
  }

  /** Hints queued but not yet on screen, so asking twice doesn't queue twice. */
  private pendingHints = new Set<string>();

  /**
   * One-time guidance: a single line, shown the first time it's relevant
   * and never again. It only counts as shown once it has actually
   * appeared; if `stillRelevant` turns false while it waits its turn (the
   * cutting got potted, the tool was put away), it's quietly dropped and
   * may come round again when it next applies. Returns true if it was
   * raised now, false if it has already been seen.
   */
  hint(id: string, text: string, significance: Significance = 'important', stillRelevant?: () => boolean): boolean {
    if (this.state.hints.includes(id)) return false;
    if (this.pendingHints.has(id)) return true;
    this.pendingHints.add(id);
    this.pushToast(text, 'hint', significance, {
      valid: () => !stillRelevant || stillRelevant(),
      onShown: () => {
        this.pendingHints.delete(id);
        if (!this.state.hints.includes(id)) this.state.hints.push(id);
      },
      onDropped: () => this.pendingHints.delete(id),
    });
    return true;
  }

  // ---- What the hints are about: the situations they belong to ----

  private outdoors = () => !this.state.player.inGreenhouse;
  private carryingCutting = () => this.state.basket.some((b) => b.growth === 0);
  private inTool = (kind: string) => this.tools.mode.kind === kind;
  private nurseryFull = () => nurserySpots(this.state).every((bed) => !!occupantOf(this.state, { bedId: bed.id }));
  /** Real seconds spent pushing through thick growth, for the path nudge. */
  private thicketSeconds = 0;

  /** Open outdoor ground: no tree/rock, not the house, stall or a wild patch. */
  isOpenGround = (tx: number, ty: number): boolean => {
    if (this.blockingSet.has(`${tx},${ty}`)) return false;
    if (this.world.isBuiltOrWater(tx, ty)) return false;
    return !this.world.isSpot(tx, ty);
  };

  /**
   * Scott keeps an eye out for cannabis coming up on its own, out in the
   * valley. When a new seedling shows, he drops whatever he's doing, walks
   * out to it and waves Ellen over, and waits there until she comes to see
   * (or, after a few hours, gives up and wanders off). Each plant only once,
   * and only while it's still a seedling.
   */
  private scottShowSpot(): ScottSpot | null {
    const st = this.state;
    const sc = st.scott;
    const now = st.clock.totalMinutes;
    const wildCannabis = () => Object.values(st.plants).filter((p) => p.location.kind === 'wild' && p.bornWild && CANNABIS.includes(p.defId));
    if (!sc.shownPlants) {
      // Whatever was already growing when he started looking doesn't count as news.
      sc.shownPlants = wildCannabis().map((p) => p.id);
      return null;
    }
    const shown = sc.shownPlants;
    if (sc.showPlant) {
      const plant = st.plants[sc.showPlant.plantId];
      const done = () => {
        shown.push(sc.showPlant!.plantId);
        delete sc.showPlant;
        if (sc.activity === 'showingPlant') sc.nextChangeAt = Math.min(sc.nextChangeAt, now + 3);
        return null;
      };
      if (!plant || plant.location.kind !== 'wild') return done();
      const { x, y } = plant.location;
      if (!st.player.inGreenhouse && Math.hypot(st.player.x - x, st.player.y - y) < 2.4 && sc.activity === 'showingPlant') {
        this.pushToast(`Scott nods down at the ${PLANTS[plant.defId]?.name ?? 'seedling'}, grinning. “Came up all by itself.”`, 'discovery');
        return done();
      }
      // He's waited his while and wandered off, or it's been hours: let it be.
      if (now - sc.showPlant.since > 480 || (sc.currentSpotId === `show-${plant.id}` && sc.activity !== 'showingPlant')) return done();
      return { id: `show-${plant.id}`, kind: 'show', zone: zoneAt(x + 0.7, y), x: x + 0.7, y, face: 'left' };
    }
    if (sc.activity === 'driving' || this.chase.kiss) return null;
    for (const p of wildCannabis()) {
      if (shown.includes(p.id) || p.location.kind !== 'wild') continue;
      // Only news while it's just come up; anything older he lets be.
      if (stageIndexOf(p.growth) > 0) {
        shown.push(p.id);
        continue;
      }
      sc.showPlant = { plantId: p.id, since: now };
      this.pushToast(`Scott’s waving you over — something’s come up on its own in ${regionLabel(st, p.location.zone)}. Follow him.`, 'discovery', 'important');
      return { id: `show-${p.id}`, kind: 'show', zone: zoneAt(p.location.x + 0.7, p.location.y), x: p.location.x + 0.7, y: p.location.y, face: 'left' };
    }
    return null;
  }

  /**
   * Scout's nose: every so often, out walking, she catches a scent and
   * runs off a little way ahead to a curiosity — a hedgehog, a geode, a
   * moth — and waits there with it until Ellen comes to look. The lead
   * ends once Ellen's noted it down, it's gone, or Ellen's gone indoors or
   * into the truck.
   */
  private tendScoutLead() {
    const st = this.state;
    const sc = st.scout;
    const now = st.clock.totalMinutes;
    if (sc.leadTo) {
      const find = st.foxFinds.find((f) => f.id === sc.leadTo!.findId);
      if (!find || st.player.inGreenhouse || this.riding()) {
        delete sc.leadTo;
        sc.behavior = 'following';
      }
      return;
    }
    if (sc.nextSniffAt === undefined) sc.nextSniffAt = now + SNIFF_GAP[0];
    if (now < sc.nextSniffAt || st.player.inGreenhouse || this.riding() || this.chase.kiss) return;
    // Not while the fox has her on a trail: one guide at a time.
    if (st.fox.behavior === 'leading' || st.fox.behavior === 'paused' || st.fox.behavior === 'lookingBack') return;
    sc.nextSniffAt = now + SNIFF_GAP[0] + Math.random() * (SNIFF_GAP[1] - SNIFF_GAP[0]);
    const p = st.player;
    for (let attempt = 0; attempt < 24; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const r = SNIFF_MIN + Math.random() * (SNIFF_MAX - SNIFF_MIN);
      const x = p.x + Math.cos(a) * r;
      const y = p.y + Math.sin(a) * r;
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      const zone = zoneAt(tx, ty);
      if (zone === 'greenhouse' || zone === 'creek' && isWater(tx, ty)) continue;
      if (!this.isOpenGround(tx, ty) || this.blockedOutdoor(x, y)) continue;
      // Somewhere Ellen can see her go: not round the far side of the house, not over the creek.
      if (segmentHitsRect(GREENHOUSE_FOOTPRINT, p.x, p.y, x, y) || segmentHitsRect(HOUSE_FOOTPRINT, p.x, p.y, x, y)) continue;
      if ((p.x < 42) !== (x < 42)) continue;
      const c = pickCuriosity(st, zone, { night: isNight(now), rain: st.weather.condition === 'rain' }, Math.random);
      if (!c) continue;
      const find = { id: makeUid('find'), kind: 'curiosity' as const, x, y, zone, seed: Math.floor(Math.random() * 1e9), curiosityId: c.id, createdAt: now, expiresAt: now + FOX_FIND_LIFETIME };
      st.foxFinds.push(find);
      sc.leadTo = { x, y, findId: find.id };
      sc.behavior = 'leading';
      this.pushToast('Scout’s caught a scent and she’s off — follow her and see what she’s found.', 'discovery');
      return;
    }
  }

  /** Rebuilds everything that depends on which wild scrub has been cleared. */
  private refreshCleared() {
    this.cleared = new Set(this.state.clearedObstacles);
    this.blockingSet = buildBlockingSet(this.obstacles, this.cleared);
    this.lushDirty = true;
    this.lushAcc = LUSH_REFRESH_MS;
  }

  /** Rebuilds indoor collision after furniture moved. */
  refreshIndoor() {
    this.indoorSolid = indoorSolids(this.state);
    this.catInterestAcc = CAT_INTEREST_MS;
  }

  /** Marks a find in the world, if it's special enough to deserve it. */
  flourish(x: number, y: number, rarity: Rarity, isNew: boolean) {
    const kind = discoveryFlourish(rarity, isNew);
    if (kind === 'none') return;
    this.flourishes.push({ x, y, kind, rarity, start: performance.now() });
    if (this.flourishes.length > 6) this.flourishes.shift();
  }

  /** Advances the living world by `elapsed` game-minutes and reports what changed. */
  private simulate(elapsed: number, offline: boolean) {
    const result = advanceWorld(this.state, elapsed, this.spreadCarry, this.isOpenGround);
    this.spreadCarry = result.carry;
    const now = this.state.clock.totalMinutes;
    if (result.ups.length || result.spreads.length || result.sown.length) this.lushDirty = true;
    // A find only goes in the journal once it's been grown: a plant of it rooted in your care.
    for (const g of recordGrown(this.state, now)) {
      if (!offline) this.pushToast(`${specimenName(g.defId, g.variantId)} took — it’s in your field journal now.`, 'discovery');
    }

    const grew = new Set<string>();
    for (const up of result.ups) {
      const plant = this.state.plants[up.plantId];
      if (!plant) continue;
      grew.add(plant.id);
      const established = creditGrown(this.state, plant.id, now);
      const def = PLANTS[plant.defId];
      if (established) {
        const first = this.hint('established', `${def.name} is established: lift one to display it, or plant it out.`, 'major');
        if (!first) this.pushToast(`${def.name} is established now: display it, or plant it out.`, 'discovery', 'major');
      }
      if (offline) continue;
      const name = specimenName(plant.defId, plant.variantId);
      if (plant.location.kind === 'nursery' || plant.location.kind === 'display') {
        if (up.to === 'young') {
          this.pushToast(`Your ${name} cutting has rooted.`, 'growth');
          this.hint('rooted', 'Rooted plants give cuttings. Grow two of a kind to establish it.', 'important', () => !isEstablished(this.state, plant.defId));
        } else this.pushToast(`Your ${name} is now ${STAGE_LABEL[up.to].toLowerCase()}.`, 'growth');
      } else if (up.to === 'large' && !plant.bornWild) {
        this.pushToast(`Your ${name} in ${zoneLabel(plant.location.zone, this.state)} has grown large — it may start to spread.`, 'growth');
        // Now that spreading is about to begin, a bed is worth knowing about.
        if (this.state.gardenBeds.length === 0) this.hint('beds', 'Large plants spread. A garden bed (🌿) keeps them where you put them.', 'important', () => this.outdoors() && this.state.gardenBeds.length === 0);
      } else if (up.to === 'specimen' && !plant.bornWild) {
        this.pushToast(`Your ${name} in ${zoneLabel(plant.location.zone, this.state)} is a magnificent specimen now.`, 'growth', 'important');
      }
    }

    // The liveliest beds turn up curiosities of their own now and then.
    if (tickBedCuriosities(this.state, elapsed / 60, now, Math.random, (gx, gy) => this.isOpenGround(Math.floor(gx), Math.floor(gy))).length && !offline) {
      this.pushToast('Something has turned up in one of your beds.', 'discovery', 'normal');
    }
    // A secret plant coming up is never announced, whether it seeded itself or came in with a bed's visitors.
    const sports = result.spreads.filter((s) => {
      const child = this.state.plants[s.childId];
      return child?.unnoticed && !PLANTS[child.defId]?.secret;
    });
    if (!offline) {
      const first = result.spreads.map((s) => this.state.plants[s.childId]).find((c) => c && !PLANTS[c.defId]?.secret);
      if (first) {
        const child = first;
        if (child.location.kind === 'wild') {
          this.hint('spread', `A ${PLANTS[child.defId].name} seedling came up by itself in ${zoneLabel(child.location.zone, this.state)}.`, 'major');
        }
      }
      for (const s of sports) {
        const child = this.state.plants[s.childId];
        if (child?.location.kind === 'wild') this.pushToast(`Something unusual has sprouted among your ${PLANTS[child.defId].name} plants in ${zoneLabel(child.location.zone, this.state)}…`, 'discovery');
      }
    }

    if (offline) {
      const zones = [...new Set(result.spreads.map((s) => this.state.plants[s.childId]).filter((p) => p?.location.kind === 'wild').map((p) => (p!.location as { zone: string }).zone))];
      const parts: string[] = [];
      if (grew.size > 0) parts.push(grew.size === 1 ? 'one of your plants grew' : `${grew.size} of your plants grew`);
      if (result.spreads.length > 0) parts.push(`${result.spreads.length} new seedling${result.spreads.length === 1 ? '' : 's'} came up in ${listZones(zones, this.state)}`);
      const body = parts.length ? `: ${parts.join(', and ')}` : '';
      this.pushToast(`Welcome back — ${spanText(elapsed)} passed${body}.`, 'info', 'important');
      if (sports.length > 0) this.pushToast(`And something you’ve never seen before is growing among them. Go and look.`, 'discovery');
    }
  }

  private update(dtMs: number) {
    const dtSeconds = dtMs / 1000;
    // Wall-clock time, not the rAF timestamp: rAF time restarts near zero on
    // every page load, so it can't measure how long the player was away.
    const clockResult = advanceClock(this.state, Date.now());
    if (clockResult.elapsedMinutes > 0) this.simulate(clockResult.elapsedMinutes, clockResult.wasOffline);
    if (tickCommissions(this.state, this.state.clock.totalMinutes)) {
      this.onStateTouched?.();
      // The board is the way to find out what's wanted; only the very first request is pointed at.
      this.hint('commission', 'Someone has pinned a request on the board by the stall.', 'important', () => this.outdoors() && !!openCommission(this.state) && !openCommission(this.state)!.seen);
    }

    this.lushAcc += dtMs;
    if (this.lushDirty && this.lushAcc > LUSH_REFRESH_MS) {
      this.lush = computeLushness(this.state);
      this.lushDirty = false;
      this.lushAcc = 0;
      this.noticeRegions();
    }

    // Mid-kiss, she's not going anywhere.
    const move = this.chase.kiss ? { x: 0, y: 0 } : this.input.getMoveVector();
    const riding = this.riding();
    if (move.x !== 0 || move.y !== 0) {
      // The truck doesn't care how thick the growth is.
      const speed = MOVE_SPEED * (riding ? TRUCK_SPEED : this.groundSpeed());
      const dx = move.x * speed * dtSeconds;
      const dy = move.y * speed * dtSeconds;
      const p = this.state.player;
      const want: Facing = Math.abs(move.x) > Math.abs(move.y) ? (move.x > 0 ? 'right' : 'left') : move.y > 0 ? 'down' : 'up';
      // Driving, the whole truck keeps off the greenhouse, the house and the stall —
      // it can't even turn where its nose would swing up over them.
      const buildings = [stallRect(this.state)];
      const facing = riding && truckHitsBuilding(p.x, p.y, want, buildings) && !truckHitsBuilding(p.x, p.y, p.facing, buildings) ? p.facing : want;
      const stuckIn = riding && truckHitsBuilding(p.x, p.y, facing, buildings);
      const truckBlocked = (x: number, y: number) => riding && !stuckIn && truckHitsBuilding(x, y, facing, buildings);
      const blocked = p.inGreenhouse ? (x: number, y: number) => isBlockedIndoor(x, y, this.indoorSolid) : (x: number, y: number) => this.blockedOutdoor(x, y) || truckBlocked(x, y);
      const next = tryMove(p.x, p.y, dx, dy, blocked);
      p.x = next.x;
      p.y = next.y;
      p.facing = facing;
      if (riding && this.state.truck) {
        this.state.truck.x = this.state.player.x;
        this.state.truck.y = this.state.player.y;
        this.state.truck.facing = this.state.player.facing;
      }
    }

    // Doors are for walking through: the truck stays outside.
    if (!riding) this.handleDoorTransitions();
    this.updateNearestInteractable();
    if (expireFoxFinds(this.state, this.state.clock.totalMinutes) > 0) this.onStateTouched?.();
    this.noticeGoing(move.x !== 0 || move.y !== 0, dtSeconds);

    if (!this.state.player.inGreenhouse) {
      this.noticeNearbySports();
      const zone = zoneAt(Math.floor(this.state.player.x), Math.floor(this.state.player.y));
      const foxResult = tickFox(this.state, {
        playerZone: zone,
        playerX: this.state.player.x,
        playerY: this.state.player.y,
        inGreenhouse: false,
        dtSeconds,
        now: this.state.clock.totalMinutes,
        discoveryPoints: DISCOVERY_SPOTS,
        rand: Math.random,
        pickTrailDestination: (rand) => this.pickTrailDestination(rand),
        isOpen: (x, y) => this.isOpenGround(Math.floor(x), Math.floor(y)) && !isBlockedOutdoor(x, y, this.blockingSet, stallRect(this.state)),
      });
      if (foxResult.revealedDiscoveryId) {
        this.pushToast('The fox lingers here, watching something growing in the shadows.', 'discovery');
        this.audio.playToolChime();
      }
      if (foxResult.hunchDiscoveryId) {
        this.pushToast('The fox stops, nose low to something in the undergrowth, and looks back at you.', 'discovery');
        this.audio.playToolChime();
      }
      if (foxResult.trailEnded && foxResult.trailEnded.reward !== 'nothing') {
        const { x, y, reward } = foxResult.trailEnded;
        const z = zoneAt(Math.floor(x), Math.floor(y));
        if (z !== 'greenhouse') {
          const finds = createFoxFinds(
            this.state,
            x,
            y,
            z,
            reward,
            { night: isNight(this.state.clock.totalMinutes), rain: this.state.weather.condition === 'rain' },
            this.state.clock.totalMinutes,
            Math.random,
            (gx, gy) => this.isOpenGround(Math.floor(gx), Math.floor(gy))
          );
          // The den is wherever the valley has grown thickest: the fox lives in what you made.
          const den = finds.find((f) => f.curiosityId === 'foxDen');
          if (den) {
            const at = lushestTile(this.lush, (tx, ty) => this.isOpenGround(tx, ty) && !this.plantOnTile(tx, ty));
            if (at && at.lush > 0.4) {
              den.x = at.x + 0.5;
              den.y = at.y + 0.5;
              den.zone = zoneAt(at.x, at.y) as OutdoorZoneId;
            }
          }
        }
      }
      this.audio.setZone(zone, this.state.weather.condition === 'rain', dtSeconds);
    } else {
      this.audio.setZone('greenhouse', false, dtSeconds);
    }
    const me = this.state.player;
    this.audio.updateMusic(
      { started: true, room: this.currentRoom(), zone: me.inGreenhouse ? 'greenhouse' : zoneAt(Math.floor(me.x), Math.floor(me.y)), totalMinutes: this.state.clock.totalMinutes },
      dtSeconds
    );

    // In the greenhouse, Scout and the cat play chase instead of their usual routines.
    const playing = this.state.player.inGreenhouse && roomAt(this.state.player.x) === 'greenhouse';
    if (playing) {
      this.play ??= startPlay(Math.random);
      tickPlay(this.play, this.state.scout, this.state.cat, { dtSeconds, rand: Math.random, isOpen: this.isOpenIndoors });
    } else if (this.play) {
      this.play = null;
      endPlay(this.state.scout, this.state.cat, this.state.clock.totalMinutes);
    }

    this.tendScoutLead();
    if (this.riding() && this.state.truck) {
      // Scout rides in the back while Ellen drives, nose into the wind.
      const t = this.state.truck;
      const sc = this.state.scout;
      sc.x = t.x;
      sc.y = t.y;
      sc.facing = t.facing;
      sc.behavior = 'following';
    } else if (!playing && this.tendGatorRide(dtSeconds, move.x !== 0 || move.y !== 0)) {
      // Off to the alligator, or out on the creek on its back.
    } else if (!playing) {
      const frogs = this.state.player.inGreenhouse ? [] : this.visibleFrogs();
      const sc = this.state.scout;
      const chased = sc.frog !== undefined ? (frogs.find((f) => f.seed === sc.frog) ?? null) : null;
      const event = tickScout(sc, {
        playerX: this.state.player.x,
        playerY: this.state.player.y,
        playerFacing: this.state.player.facing,
        playerMoving: move.x !== 0 || move.y !== 0,
        dtSeconds,
        now: this.state.clock.totalMinutes,
        nearbyUndiscovered: this.state.player.inGreenhouse ? null : this.findNearbyUnseen(),
        rand: Math.random,
        indoors: this.state.player.inGreenhouse,
        nearbyFrog: this.nearestSittingFrog(frogs),
        chasedFrog: chased,
      });
      if (event === 'pounced' && chased) this.scoutPounced(chased);
    }
    const p = this.state.player;
    const kissing = !!this.chase.kiss;
    if (tickChase(this.chase, this.state.scott, { ellenX: p.x, ellenY: p.y, ellenIndoors: p.inGreenhouse, ellenMoving: move.x !== 0 || move.y !== 0, dtSeconds, rand: Math.random })) {
      p.facing = this.chase.kiss!.ellenLeft ? 'right' : 'left';
      if (this.tools.active) this.tools.cancel();
    }
    if (!kissing && !this.chase.kiss) {
      // The truck is Ellen's: he only gets his hands on it once she's bought it, and not while she's in it.
      const truck = this.state.player.riding ? null : this.state.truck;
      const extraSpots = [...eveningStroll(this.state, minuteOfDay(this.state.clock.totalMinutes)), ...companySpots(this.state), ...truckSpots(truck)];
      const summon = this.scottShowSpot();
      // Out on foot, Ellen and Scout are who he watches the road for (Scout's no worry out on the alligator).
      const me = this.state.player;
      const sc = this.state.scout;
      const onFoot = me.inGreenhouse ? [] : [{ x: me.x, y: me.y }, ...(sc.behavior === 'onGator' ? [] : [{ x: sc.x, y: sc.y }])];
      const event = tickScott(this.state.scott, { dtSeconds, now: this.state.clock.totalMinutes, rand: Math.random, offset: this.fixtureOffset, extraSpots, truck, summon, onFoot });
      if (event === 'baked' && this.state.player.inGreenhouse) this.pushToast('Scott’s taken a loaf out of the oven. The whole house smells of warm bread.', 'info');
      if (event === 'honk') {
        this.audio.playHorn();
        this.pushToast('Scott pulls up and gives a friendly toot of the horn. He’ll wait.', 'info');
      }
    }
    this.catInterestAcc += dtMs;
    if (this.catInterestAcc >= CAT_INTEREST_MS) {
      this.catInterestAcc = 0;
      this.catInterests = this.computeCatInterests();
    }
    if (!playing) tickCat(this.state.cat, { dtSeconds, now: this.state.clock.totalMinutes, rand: Math.random, interests: this.catInterests, offset: this.fixtureOffset });
    if (isOctober()) this.tickOctober(dtSeconds);
    else this.octView = null;
    this.tendMysteries(dtSeconds);
    const nowMs = performance.now();
    this.flourishes = this.flourishes.filter((f) => nowMs - f.start < 2600);

    this.autosaveAcc += dtMs;
    if (this.autosaveAcc > AUTOSAVE_MS) {
      this.autosaveAcc = 0;
      saveGame(this.state);
    }
  }

  /**
   * A region that has changed enough under the player's plants is worth a
   * word, and once, an offer of a name. Each tier is noticed once.
   */
  private noticeRegions() {
    for (const c of checkRegionTiers(this.state, this.lush)) {
      const label = regionLabel(this.state, c.zone);
      const what = describeRegion(this.lush.zoneCover[c.zone], this.lush.zoneCount[c.zone], c.character).replace(/\.$/, '').toLowerCase();
      if (c.tier === 1) {
        this.pushToast(`${label} is becoming ${what}.`, 'discovery', 'important');
        if (!Object.keys(this.state.regions).length) this.hint('regionName', 'A place that’s changed this much could have a name: Regions, in the journal.', 'important', () => Object.keys(this.state.regions).length === 0);
      } else this.pushToast(`${label} is ${what} now.`, 'discovery', 'major');
    }
  }

  /** Names a region (or renames it); the plaque goes up where the growth is thickest. */
  nameRegion(zone: OutdoorZoneId, raw: string): boolean {
    const r = nameRegion(this.state, zone, raw, this.lush, (tx, ty) => this.isOpenGround(tx, ty) && !this.plantOnTile(tx, ty), this.state.clock.totalMinutes);
    if (!r) return false;
    this.audio.playToolChime();
    this.pushToast(`${r.name}. The plaque is up where the growth is thickest.`, 'discovery', 'important');
    this.onStateTouched?.();
    saveGame(this.state);
    return true;
  }

  /** What the journal offers to call a region, before the player has. */
  suggestRegionName(zone: OutdoorZoneId): string {
    return suggestedName(this.lush.zoneCharacter[zone], this.state.regionTier[zone] ?? 1);
  }

  private plantOnTile(tx: number, ty: number): boolean {
    for (const p of Object.values(this.state.plants)) {
      if (p.location.kind === 'wild' && Math.floor(p.location.x) === tx && Math.floor(p.location.y) === ty) return true;
    }
    return false;
  }

  /**
   * The valley itself suggests the tools for it: after enough wading
   * through thick growth, a path; at the first dusk, that there's more to
   * find after dark. Both are single lines, only while they apply.
   */
  private noticeGoing(moving: boolean, dtSeconds: number) {
    const p = this.state.player;
    if (p.inGreenhouse) return;
    if (moving && !this.riding() && this.state.paths.length === 0 && this.groundSpeed() < 0.75) {
      this.thicketSeconds += dtSeconds;
      if (this.thicketSeconds > 4) this.hint('paths', 'Thick going. Carve a path (🌿) and the way stays clear.', 'important', () => this.outdoors() && this.state.paths.length === 0);
    }
    if (isNight(this.state.clock.totalMinutes) && !this.state.tools.lantern) {
      this.hint('dusk', 'Dark now. Some things only show themselves after dark.', 'normal', () => this.outdoors() && isNight(this.state.clock.totalMinutes));
    }
  }

  /**
   * Walking up to a sport that came up by itself among your plants is a
   * discovery in its own right: "what is that thing?"
   */
  private noticeNearbySports() {
    const p = this.state.player;
    for (const plant of Object.values(this.state.plants)) {
      if (!plant.unnoticed || plant.location.kind !== 'wild') continue;
      const range = PLANTS[plant.defId]?.secret ? SECRET_NOTICE_RANGE : NOTICE_RANGE;
      if (Math.hypot(plant.location.x - p.x, plant.location.y - p.y) > range) continue;
      plant.unnoticed = false;
      const found = recordFound(this.state, plant.defId, plant.variantId, this.state.clock.totalMinutes);
      const r = specimenRarity(plant.defId, plant.variantId);
      const rarity = RARITY_LABEL[r];
      this.audio.playDiscoveryChime();
      if (found.newSpecies) this.announce(`Something new has come up among your plants: ${fullName(plant.defId, plant.variantId)} (${rarity}).`, r);
      else if (found.newVariant) this.announce(`New variant: ${fullName(plant.defId, plant.variantId)} (${rarity}) — it sprouted by itself among your plants!`, r);
      else this.pushToast(`A ${specimenName(plant.defId, plant.variantId)} has come up among your plants.`, 'discovery', 'normal');
      this.flourish(plant.location.x, plant.location.y, r, found.newSpecies || found.newVariant);
      this.onStateTouched?.();
    }
  }

  private findNearbyUnseen(): { x: number; y: number } | null {
    const p = this.state.player;
    let best: { x: number; y: number } | null = null;
    let bestDist = 2.6;
    // After dark, Scout has a nose for the old lantern from further off.
    if (isNight(this.state.clock.totalMinutes)) {
      for (const tp of TOOL_PICKUPS) {
        if (this.state.tools[tp.tool]) continue;
        const d = Math.hypot(p.x - (tp.x + 0.5), p.y - (tp.y + 0.5));
        if (d < 9 && d < bestDist + 9) {
          bestDist = Math.max(bestDist, d);
          best = { x: tp.x + 0.5, y: tp.y + 0.5 };
        }
      }
    }
    for (const spot of DISCOVERY_SPOTS) {
      const d = Math.hypot(p.x - (spot.x + 0.5), p.y - (spot.y + 0.5));
      if (d >= bestDist) continue;
      const c = spotContent(this.state, spot);
      if (!c || hasFound(this.state, c.defId, c.variantId)) continue;
      bestDist = d;
      best = { x: spot.x + 0.5, y: spot.y + 0.5 };
    }
    return best;
  }

  private handleDoorTransitions() {
    const p = this.state.player;
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    if (!p.inGreenhouse) {
      const door = BUILDING_DOORS.find((d) => d.outside.x === tx && d.outside.y === ty);
      if (door) this.enterGreenhouse(door);
      else if (tx === HOUSE_DOOR.x && ty === HOUSE_DOOR.y) this.enterHouse();
    } else if (BUILDING_DOORS.some((d) => this.throughDoor(d, p.x, p.y))) {
      this.exitGreenhouse(BUILDING_DOORS.find((d) => this.throughDoor(d, p.x, p.y)));
    } else if (tx === FRONT_DOOR.x && ty >= FRONT_DOOR.y) {
      this.exitHouse();
    }
  }

  /** Standing in a greenhouse doorway, as far out as the wall. */
  private throughDoor(d: GreenhouseDoor, x: number, y: number): boolean {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (d.wall === 'south') return tx === d.inside.x && ty >= d.inside.y;
    if (d.wall === 'north') return tx === d.inside.x && ty <= d.inside.y;
    return ty === d.inside.y && tx <= d.inside.x;
  }

  /** In through one of the greenhouse's doors (the garden door unless told otherwise). */
  private enterGreenhouse(door: GreenhouseDoor = GREENHOUSE_DOORS[0]) {
    const p = this.state.player;
    // Anything being carried is left where it was last held.
    this.carryingDecorId = null;
    if (this.tools.active) this.tools.cancel();
    p.inGreenhouse = true;
    const o = DOOR_OUTWARD[door.wall];
    p.x = door.inside.x + 0.5 - o.x * 1.5;
    p.y = door.inside.y + 0.5 - o.y * 1.5;
    p.facing = door.wall === 'south' ? 'up' : door.wall === 'north' ? 'down' : 'right';
    this.fadeFrom = performance.now();
    this.bringScoutAlong();
    if (this.carryingCutting()) {
      if (this.nurseryFull()) this.hint('moreBeds', 'Every bed is full. The Plant Stand & Supply sells more.', 'important', () => this.carryingCutting() && this.nurseryFull());
      else this.hint('pot', 'Pot your cutting in a nursery bed, on the left. It roots on its own.', 'important', () => !this.outdoors() && this.carryingCutting() && !this.nurseryFull());
    }
  }

  /** In through the front door: home. */
  private enterHouse() {
    const p = this.state.player;
    // Anything being carried is left where it was last held.
    this.carryingDecorId = null;
    if (this.tools.active) this.tools.cancel();
    p.inGreenhouse = true;
    p.x = FRONT_DOOR.x + 0.5;
    p.y = FRONT_DOOR.y - 1.5;
    p.facing = 'up';
    this.fadeFrom = performance.now();
    this.bringScoutAlong();
  }

  private exitGreenhouse(door: GreenhouseDoor = GREENHOUSE_DOORS[0]) {
    const p = this.state.player;
    if (this.tools.active) this.tools.cancel();
    this.indoorFocus = null;
    p.inGreenhouse = false;
    const o = DOOR_OUTWARD[door.wall];
    p.x = door.outside.x + 0.5 + o.x * 1.5;
    p.y = door.outside.y + 0.5 + o.y * 1.5;
    p.facing = door.wall === 'south' ? 'down' : door.wall === 'north' ? 'up' : 'left';
    this.fadeFrom = performance.now();
    this.bringScoutAlong();
  }

  private exitHouse() {
    const p = this.state.player;
    if (this.tools.active) this.tools.cancel();
    this.indoorFocus = null;
    p.inGreenhouse = false;
    p.x = HOUSE_DOOR.x + 0.5;
    p.y = HOUSE_DOOR.y + 1.5;
    p.facing = 'down';
    this.fadeFrom = performance.now();
    this.bringScoutAlong();
  }

  // Indoor and outdoor coordinates are different spaces, so Scout is
  // placed beside Ellen rather than left at a position that means nothing
  // on the other side of the door.
  private bringScoutAlong() {
    const p = this.state.player;
    const scout = this.state.scout;
    scout.x = p.x - 0.7;
    scout.y = p.y + 0.5;
    scout.behavior = 'following';
  }

  private updateNearestInteractable() {
    const p = this.state.player;
    const now = this.state.clock.totalMinutes;
    // Everything within reach; the most important wins, nearest among equals.
    const candidates: { kind: InteractableKind; dist: number; item: Interactable }[] = [];

    const consider = (i: Interactable, cx: number, cy: number, range = INTERACT_RANGE) => {
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d < range) candidates.push({ kind: i.kind, dist: d, item: i });
    };

    if (!p.inGreenhouse && this.carryingDecorId) {
      const piece = this.state.decor.find((d) => d.id === this.carryingDecorId);
      if (piece) {
        const spot = this.carrySpot();
        piece.x = spot.x;
        piece.y = spot.y;
        const name = findShopItem(piece.decorId)?.name ?? 'it';
        const ok = this.canSetDecorHere(spot.x, spot.y, piece.id);
        this.nearest = { kind: 'setDown', id: piece.id, x: spot.x, y: spot.y, label: ok ? `Set the ${name} down here` : `No room for the ${name} here`, available: ok };
        return;
      }
      this.carryingDecorId = null;
    }

    if (!p.inGreenhouse) {
      for (const d of this.state.decor) {
        const name = findShopItem(d.decorId)?.name ?? 'decor';
        if (isGardenPlanter(d.decorId)) {
          // A garden trellis is a planter, like the one indoors: walking up to it opens it. It moves with the 🪑 button.
          const plant = occupantOf(this.state, { slotId: d.id });
          const label = plant ? `${specimenName(plant.defId, plant.variantId)} — ${STAGE_LABEL[stageName(plant)]}` : `Empty ${name.toLowerCase()}`;
          consider({ kind: 'display', id: d.id, x: d.x, y: d.y, label, available: true }, d.x, d.y, 1.0);
        } else if (d.decorId === 'gardenPond') {
          // A pond is tended, not carried (the garden's arrange mode still moves it).
          const cap = pondCapacity(d);
          const label = cap === 0 ? 'The pond — too small for koi' : `Tend the pond · ${d.koi?.length ?? 0} of ${cap} koi`;
          const size = pondSize(d);
          consider({ kind: 'pond', id: d.id, x: d.x, y: d.y, label, available: true }, d.x, d.y, Math.max(1.2, Math.max(size.w, size.h) / 2 + 0.3));
        } else consider({ kind: 'decor', id: d.id, x: d.x, y: d.y, label: `Move the ${name}`, available: true }, d.x, d.y, 1.0);
      }
      for (const spot of DISCOVERY_SPOTS) {
        const c = spotContent(this.state, spot);
        if (!c) continue;
        const seen = hasFound(this.state, c.defId, c.variantId);
        const known = hasFound(this.state, c.defId);
        const label = seen ? `Take a cutting — ${specimenName(c.defId, c.variantId)}` : known ? `Take a cutting — an unusual ${PLANTS[c.defId].name}?` : 'Take a cutting — something you’ve never seen';
        consider({ kind: 'spot', id: spot.id, x: spot.x, y: spot.y, label, available: true }, spot.x + 0.5, spot.y + 0.5);
      }
      for (const plant of Object.values(this.state.plants)) {
        if (plant.location.kind !== 'wild') continue;
        const block = cuttingBlockReason(this.state, plant, now);
        const name = specimenName(plant.defId, plant.variantId);
        const label =
          block === 'not-rooted'
            ? `${name} seedling — too young for cuttings`
            : block === 'recovering'
              ? `${name} — recovering from its last cutting`
              : `Take a cutting from ${name}`;
        consider({ kind: 'wildPlant', id: plant.id, x: plant.location.x, y: plant.location.y, label, available: !block || block === 'basket-full' }, plant.location.x, plant.location.y, 1.0);
      }
      for (const tp of TOOL_PICKUPS) {
        if (this.state.tools[tp.tool]) continue;
        consider({ kind: 'lantern', id: tp.id, x: tp.x, y: tp.y, label: 'Pick up the old lantern', available: true }, tp.x + 0.5, tp.y + 0.5);
      }
      for (const [zone, r] of Object.entries(this.state.regions)) {
        if (!r) continue;
        const days = Math.floor((now - r.namedAt) / 1440);
        consider({ kind: 'plaque', id: zone, x: r.x, y: r.y, label: `${r.name} · named ${days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}`, available: true }, r.x, r.y, 1.6);
      }
      for (const f of this.state.foxFinds) {
        const label = f.kind === 'curiosity' ? 'Something here… look closer' : 'Something unusual is growing here';
        consider({ kind: 'foxFind', id: f.id, x: f.x, y: f.y, label, available: true }, f.x, f.y, 1.2);
      }
      // Rocks, trees and bushes can be cleared, for a fee. Only the tiles right around her are checked.
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tx = Math.floor(p.x) + dx;
          const ty = Math.floor(p.y) + dy;
          const cost = clearCost(this.world, tx, ty);
          if (cost === null) continue;
          const kind = this.world.obstacleAt(tx, ty)!;
          const words = CLEAR_VERB[kind];
          const tooled = hasClearTool(this.state, kind);
          const afford = this.state.coins >= cost;
          const label = !tooled
            ? `${words.name} · needs a ${TOOL_NAME[CLEAR_TOOL[kind]]} from the stall`
            : afford
              ? `${words.label} · ${cost} coins`
              : `${words.name} · ${cost} coins to have it cleared`;
          consider({ kind: 'rock', id: `${tx},${ty}`, x: tx, y: ty, label, available: tooled && afford }, tx + 0.5, ty + 0.5, kind === 'tree' ? 1.6 : INTERACT_RANGE);
        }
      }
      if (isOctober()) {
        for (const pk of PUMPKINS) {
          const face = this.state.october.carved[pk.id];
          const name = face ? findFace(face)?.name.toLowerCase() : null;
          consider({ kind: 'pumpkin', id: pk.id, x: pk.x, y: pk.y, label: face ? `A ${name} jack-o’-lantern · carve another` : 'A pumpkin · carve it a face', available: true }, pk.x, pk.y, 1.0);
        }
        if (ghostApproachable(this.ghost, p.x, p.y)) {
          consider({ kind: 'ghost', id: 'ghost', x: this.ghost.x, y: this.ghost.y, label: 'Something small and pale, sitting by the jack-o’-lantern', available: true }, this.ghost.x, this.ghost.y, 1.8);
        }
      }
      // The little games around the property, each where it's set up.
      for (const g of MINI_GAMES) {
        if (g.where === 'ranger') continue;
        consider({ kind: 'miniGame', id: g.id, x: g.where.x, y: g.where.y, label: miniGameLabel(g, this.state.minigames[g.id]), available: true }, g.where.x, g.where.y, 1.3);
      }
      const stall = stallRect(this.state);
      const mx = stall.x + stall.w / 2;
      const my = stall.y + 1.1;
      consider({ kind: 'market', id: 'market', x: mx, y: my, label: 'Plant Stand & Supply', available: true }, mx, my, this.riding() ? 2.4 : 1.6);
      if (!this.riding()) {
        for (const d of BUILDING_DOORS) {
          consider({ kind: 'greenhouseDoor', id: d.id, x: d.outside.x, y: d.outside.y, label: d.id === 'house' ? 'In the back door — home' : 'Into the Greenhouse', available: true }, d.outside.x + 0.5, d.outside.y + 0.5);
        }
        consider({ kind: 'houseDoor', id: 'house', x: HOUSE_DOOR.x, y: HOUSE_DOOR.y, label: 'Go inside — home', available: true }, HOUSE_DOOR.x + 0.5, HOUSE_DOOR.y + 0.5);
      }
      const truck = this.state.truck;
      if (truck && !this.riding() && !scottDriving(this.state)) {
        const n = truck.bed.length;
        consider({ kind: 'truck', id: 'truck', x: truck.x, y: truck.y, label: `Get in the truck${n ? ` · ${n} in the back` : ''}`, available: true }, truck.x, truck.y - 0.3, 1.7);
      }
    } else {
      const occupants = occupantsByPlace(this.state);
      for (const bed of nurserySpots(this.state)) {
        const plant = occupants.beds.get(bed.id);
        const label = plant ? `${specimenName(plant.defId, plant.variantId)} — ${STAGE_LABEL[stageName(plant)]}` : 'Empty nursery bed';
        consider({ kind: 'bed', id: bed.id, x: bed.x, y: bed.y, label, available: true }, bed.x + 0.5, bed.y + 0.5);
      }
      for (const slot of displaySlots(this.state)) {
        const plant = occupants.slots.get(slot.id);
        const label = plant ? `${specimenName(plant.defId, plant.variantId)} — ${STAGE_LABEL[stageName(plant)]}` : 'Empty display spot';
        const cy = slot.kind === 'hanging' ? slot.y + 1.2 : slot.y + 0.5;
        consider({ kind: 'display', id: slot.id, x: slot.x, y: slot.y, label, available: true }, slot.x + 0.5, cy);
      }
      const mat = findFurniture(this.state, 'lr-putting');
      if (mat) {
        const fp = footprint(mat.kind, mat.x, mat.y, mat.rot ?? 0);
        const best = bestRound(this.state.putting);
        // Until every hole has been aced once, the mat says what an ace is worth.
        const acesLeft = this.state.putting.aces.length < COURSE.length;
        const label = best === null ? `Play putt-putt · a hole in one is worth ${ACE_REWARD} coins` : `Play putt-putt · best ${best} (${toPar(best, COURSE_PAR)})${acesLeft ? ` · an ace pays ${ACE_REWARD}` : ''}`;
        consider({ kind: 'puttingMat', id: mat.id, x: fp.x, y: fp.y, label, available: true }, fp.x + fp.w / 2, fp.y + fp.h / 2, 1.2);
      }
      // Ranger, wherever he's got to indoors: the laser pointer lives in Ellen's pocket.
      const laser = findMiniGame('catLaser')!;
      const cat = this.state.cat;
      // Not while he's hiding: he's not to be found.
      if (cat.activity !== 'hiding') consider({ kind: 'miniGame', id: laser.id, x: cat.x, y: cat.y, label: miniGameLabel(laser, this.state.minigames[laser.id]), available: true }, cat.x, cat.y, 1.1);
      for (const d of BUILDING_DOORS) {
        consider({ kind: 'greenhouseExit', id: d.id, x: d.inside.x, y: d.inside.y, label: d.label, available: true }, d.inside.x + 0.5, d.inside.y + 0.5);
      }
      consider({ kind: 'frontDoor', id: 'front', x: FRONT_DOOR.x, y: FRONT_DOOR.y, label: 'Out the front door', available: true }, FRONT_DOOR.x + 0.5, FRONT_DOOR.y + 0.5);
    }
    this.nearest = pickInteractable(candidates)?.item ?? null;
  }

  interactWithNearest() {
    this.audio.init();
    const n = this.nearest;
    if (!n) {
      // Nothing in reach: behind the wheel, that means stop here.
      if (this.riding()) this.parkTruck();
      return;
    }
    const now = this.state.clock.totalMinutes;
    if (n.kind === 'truck') {
      this.boardTruck();
    } else if (n.kind === 'spot') {
      const spot = DISCOVERY_SPOTS.find((d) => d.id === n.id)!;
      const result = collectSpot(this.state, spot, now);
      if (result.ok && result.content) {
        this.actionAnimUntil = now + 0.5;
        this.audio.playDiscoveryChime();
        const { defId, variantId } = result.content;
        const name = specimenName(defId, variantId);
        const rarity = specimenRarity(defId, variantId);
        const rare = rarityRank(rarity) >= 2 ? ` ${RARITY_LABEL[rarity]}!` : '';
        if (result.newSpecies) this.announce(`New discovery: ${name}.${rare}`, rarity);
        else if (result.newVariant) this.announce(`New variant: ${fullName(defId, variantId)}.${rare}`, rarity);
        else this.pushToast(`Took a cutting of ${name}.${this.stowedNote()}`, 'info');
        this.flourish(spot.x + 0.5, spot.y + 0.5, rarity, !!(result.newSpecies || result.newVariant));
        this.hint('firstCutting', 'Take it home and pot it in a nursery bed in the greenhouse.', 'important', () => this.carryingCutting());
        if (this.state.basket.length >= 3) this.hint('market', 'The Plant Stand & Supply by the house buys plants and sells kit.', 'important', () => this.state.basket.length > 0);
        this.lushDirty = true;
      } else if (result.reason === 'basket-full') {
        this.pushToast('Your basket is full.', 'info');
      }
    } else if (n.kind === 'wildPlant') {
      this.cutFrom(n.id);
    } else if (n.kind === 'lantern') {
      this.state.tools.lantern = 1;
      this.audio.playToolChime();
      this.pushToast(`Found an old lantern. ${TOOL_PICKUPS[0].flavor}`, 'discovery');
    } else if (n.kind === 'market') {
      this.onOpenMarket?.();
    } else if (n.kind === 'greenhouseDoor') {
      this.enterGreenhouse(BUILDING_DOORS.find((d) => d.id === n.id));
    } else if (n.kind === 'houseDoor') {
      this.enterHouse();
    } else if (n.kind === 'greenhouseExit') {
      this.exitGreenhouse(BUILDING_DOORS.find((d) => d.id === n.id));
    } else if (n.kind === 'frontDoor') {
      this.exitHouse();
    } else if (n.kind === 'foxFind') {
      this.collectFind(n.id);
    } else if (n.kind === 'plaque') {
      this.onOpenRegions?.();
    } else if (n.kind === 'rock') {
      this.haulRock(n.id);
    } else if (n.kind === 'decor') {
      this.carryingDecorId = n.id;
      this.pushToast('Carrying it. Walk to where it should go, then set it down.', 'info');
    } else if (n.kind === 'pond') {
      this.onOpenPond?.(n.id);
    } else if (n.kind === 'setDown') {
      this.setDownDecor();
    } else if (n.kind === 'bed' || n.kind === 'display') {
      this.onOpenGreenhouse?.({ kind: n.kind, id: n.id });
    } else if (n.kind === 'puttingMat') {
      this.onOpenPutting?.();
    } else if (n.kind === 'miniGame') {
      this.onOpenMiniGame?.(n.id as MiniGameId);
    } else if (n.kind === 'pumpkin') {
      this.carve(n.id);
    } else if (n.kind === 'ghost') {
      this.meetTheGhost();
    }
    this.onStateTouched?.();
  }

  // ---- Actions invoked by the UI ----

  cutFrom(plantId: string) {
    const plant = this.state.plants[plantId];
    if (!plant) return;
    const now = this.state.clock.totalMinutes;
    const block = cuttingBlockReason(this.state, plant, now);
    if (block === 'basket-full') return this.pushToast('Your basket is full.', 'info');
    if (block === 'not-rooted') return this.pushToast('It needs to root and grow a little before you can take cuttings.', 'info');
    if (block === 'recovering') return this.pushToast('It’s still recovering from the last cutting.', 'info');
    const res = takeCutting(this.state, plantId, now);
    if (!res) return;
    this.cutForMystery(plant);
    this.actionAnimUntil = now + 0.5;
    if (res.failed || !res.item) {
      this.pushToast(`The cutting didn’t take. Give the ${specimenName(plant.defId, plant.variantId)} a day to recover, then try again.`, 'info');
      this.onStateTouched?.();
      return;
    }
    this.audio.playDiscoveryChime();
    const name = specimenName(res.item.defId, res.item.variantId);
    if (res.sport) {
      const r = specimenRarity(res.item.defId, res.item.variantId);
      this.announce(`${res.newVariant ? 'New variant! ' : ''}This cutting came out different — a ${fullName(res.item.defId, res.item.variantId)} (${RARITY_LABEL[r]}).`, r);
      if (plant.location.kind === 'wild') this.flourish(plant.location.x, plant.location.y, r, res.newVariant);
    } else {
      this.pushToast(`Took a cutting of ${name}.${this.stowedNote()}`, 'info');
    }
    this.onStateTouched?.();
  }

  /** Where a carried garden piece would land: just in front of Ellen. */
  private carrySpot(): { x: number; y: number } {
    const p = this.state.player;
    const off = { up: [0, -0.7], down: [0, 0.8], left: [-0.8, 0.2], right: [0.8, 0.2] }[p.facing];
    return { x: p.x + off[0], y: p.y + off[1] };
  }

  private canSetDecorHere(x: number, y: number, ignoreId: string): boolean {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (!this.isOpenGround(tx, ty)) return false;
    return decorFits(this.state, x, y, ignoreId);
  }

  /** Puts the carried garden piece down where it's being held. */
  setDownDecor() {
    const id = this.carryingDecorId;
    if (!id) return;
    const spot = this.carrySpot();
    if (!this.canSetDecorHere(spot.x, spot.y, id)) return this.pushToast('No room for it just here.', 'info');
    moveDecor(this.state, id, spot.x, spot.y);
    this.carryingDecorId = null;
    this.audio.playToolChime();
    this.onStateTouched?.();
  }

  /** Pays to have a rock, tree or bush cleared and carted off. */
  haulRock(key: string) {
    const [tx, ty] = key.split(',').map(Number);
    const block = clearBlock(this.state, this.world, tx, ty);
    if (block === 'tool') {
      const kind = this.world.obstacleAt(tx, ty)!;
      return this.pushToast(`You’ll need a ${TOOL_NAME[CLEAR_TOOL[kind]]} for that. The Plant Stand & Supply sells them.`, 'info');
    }
    if (block === 'coins') {
      const kind = this.world.obstacleAt(tx, ty)!;
      return this.pushToast(`${CLEAR_VERB[kind].name.replace(/^A /, 'Clearing a ')} costs ${clearCost(this.world, tx, ty)} coins.`, 'info');
    }
    const res = clearObstacle(this.state, this.world, tx, ty);
    if (!res) return;
    this.refreshCleared();
    this.audio.playToolChime();
    this.pushToast(`${CLEAR_VERB[res.kind].done} for ${res.cost} coins. Open ground now.`, 'coins');
    this.onStateTouched?.();
  }

  /** Cross-pollinates a cannabis plant with its partner species; the hybrid seed goes in the basket. */
  crossFrom(plantId: string) {
    const plant = this.state.plants[plantId];
    if (!plant) return;
    const now = this.state.clock.totalMinutes;
    const block = crossBlockReason(this.state, plant, now);
    if (block === 'basket-full') return this.pushToast('Your basket is full.', 'info');
    if (block === 'not-rooted') return this.pushToast('It needs to root and grow a little before it can be crossed.', 'info');
    if (block === 'recovering') return this.pushToast('Both plants need to be rooted and rested to cross them.', 'info');
    if (block === 'no-partner') return this.pushToast(`You’d need a ${PLANTS[crossOf(plant.defId)!.partner].name} of your own to cross it with.`, 'info');
    const res = crossPollinate(this.state, plantId, now);
    if (!res) return;
    this.actionAnimUntil = now + 0.5;
    this.audio.playDiscoveryChime();
    const name = specimenName(res.item.defId, res.item.variantId);
    if (res.newSpecies) this.announce(`A cross! ${name}.`, specimenRarity(res.item.defId, res.item.variantId));
    else this.pushToast(`Crossed them: a ${name} seedling is in your basket.`, 'info');
    this.onStateTouched?.();
  }

  potInBed(uid: string, bedId: string) {
    const plant = potInNursery(this.state, uid, bedId, this.state.clock.totalMinutes);
    if (!plant) return;
    this.pushToast(`Potted ${specimenName(plant.defId, plant.variantId)} in the nursery.`, 'growth');
    if (this.carryingCutting() && this.nurseryFull()) this.hint('moreBeds', 'Every bed is full. The Plant Stand & Supply sells more.', 'important', () => this.carryingCutting() && this.nurseryFull());
    this.onStateTouched?.();
  }

  display(uid: string, slotId: string, potId: string) {
    const plant = placeOnDisplay(this.state, uid, slotId, potId, this.state.clock.totalMinutes);
    if (!plant) return;
    this.pushToast(`${specimenName(plant.defId, plant.variantId)} is on display. It will keep growing here.`, 'growth');
    this.onStateTouched?.();
  }

  lift(plantId: string) {
    const item = liftPlant(this.state, plantId, this.state.clock.totalMinutes);
    if (!item) return this.pushToast('Your basket is full.', 'info');
    this.pushToast(`Lifted ${specimenName(item.defId, item.variantId)} into your basket.`, 'info');
    this.onStateTouched?.();
  }

  changePot(plantId: string, potId: string) {
    setPot(this.state, plantId, potId);
    this.onStateTouched?.();
  }

  /** Where a plant would go if planted right now: just ahead of Ellen's feet. */
  plantingSpot(): { x: number; y: number; zone: OutdoorZoneId } | null {
    const p = this.state.player;
    if (p.inGreenhouse) return null;
    const off: Record<string, [number, number]> = { up: [0, -0.7], down: [0, 0.6], left: [-0.7, 0.1], right: [0.7, 0.1] };
    const [dx, dy] = off[p.facing];
    const x = p.x + dx;
    const y = p.y + dy;
    const zone = zoneAt(Math.floor(x), Math.floor(y));
    if (zone === 'greenhouse' || !canPlantAt(this.state, x, y, this.isOpenGround)) return null;
    return { x, y, zone };
  }

  plantHere(uid: string) {
    const where = this.plantingSpot();
    if (!where) return this.pushToast('There’s no room to plant right here. Try a patch of open ground.', 'info');
    const plant = plantOutdoors(this.state, uid, where.x, where.y, where.zone, this.state.clock.totalMinutes);
    if (!plant) return;
    this.lushDirty = true;
    this.lushAcc = LUSH_REFRESH_MS;
    this.actionAnimUntil = this.state.clock.totalMinutes + 0.5;
    const native = PLANTS[plant.defId].habitat.includes(where.zone);
    this.pushToast(
      `Planted ${specimenName(plant.defId, plant.variantId)} in ${zoneLabel(where.zone, this.state)}.${native ? ' It’s at home here and will grow fast.' : ''}`,
      'growth'
    );
    this.hint('plantedOut', 'It grows on its own now, and spreads once it’s large.', 'important', this.outdoors);
    this.onStateTouched?.();
  }

  /** Starts choosing exactly where a basket plant goes, beginning just ahead of Ellen. */
  beginPlanting(uid: string) {
    const p = this.state.player;
    if (p.inGreenhouse) return;
    const off: Record<string, [number, number]> = { up: [0, -1.1], down: [0, 1.0], left: [-1.1, 0.2], right: [1.1, 0.2] };
    const [dx, dy] = off[p.facing];
    this.tools.startPlanting(uid, p.x + dx, p.y + dy);
    this.hint('placing', 'Drag it to where it should grow, then ✓. They get big: give them room.', 'important', () => this.inTool('plant'));
  }

  beginTransplant(plantId: string) {
    if (this.tools.startTransplant(plantId)) this.hint('transplant', 'Drag it to its new spot. Only young plants move.', 'important', () => this.inTool('plant'));
  }

  /** Once, the first time the player edits something: zooming helps most here. */
  private zoomHint() {
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.hint('zoom', touch ? 'Pinch to zoom in and out, here or anywhere.' : 'Scroll, or press + and −, to zoom in and out.', 'normal', () => this.tools.active);
  }

  /** The 🪑 button: arrange the house indoors, or the garden outdoors. */
  beginArrange(stock?: FurnitureId, selectId?: string) {
    if (!this.state.player.inGreenhouse) return this.beginYard();
    this.indoorFocus = { x: this.state.player.x, y: this.state.player.y };
    this.tools.startArrange(stock, stock ? this.viewCentre() : undefined);
    if (selectId) this.tools.select(selectId);
    this.zoomHint();
  }

  /** Arranging outdoors: drag the garden decor and the market stall about. */
  beginYard(stock?: DecorId) {
    if (this.state.player.inGreenhouse) return;
    // Whatever was in Ellen's hands is set back where it was picked up from.
    this.carryingDecorId = null;
    this.outdoorFocus = { x: this.state.player.x, y: this.state.player.y };
    this.tools.startYard(stock, stock ? { x: this.state.player.x, y: this.state.player.y + 0.8 } : undefined);
    this.zoomHint();
    this.hint('yard', 'Drag any garden piece, or the stall itself, to move it.', 'important', () => this.inTool('yard'));
  }

  addDecorFromStock(id: DecorId) {
    this.tools.addDecorFromStock(id, this.viewCentre());
  }

  beginBed(shape: 'rect' | 'oval' = 'rect') {
    if (this.state.player.inGreenhouse) return;
    this.tools.startBed(shape);
    this.zoomHint();
    this.hint('bed', 'Drag across open ground to mark out a bed.', 'important', () => this.inTool('bed'));
  }

  beginClearing(shape: 'square' | 'circle' = 'square') {
    if (this.state.player.inGreenhouse) return;
    this.tools.startClearing(shape);
    this.zoomHint();
    this.hint('clearing', 'Drag out a square or a circle. Everything growing in it is cleared back to bare ground.', 'important', () => this.inTool('clear'));
  }

  beginPath() {
    if (this.state.player.inGreenhouse) return;
    this.tools.startPath();
    this.hint('path', 'Trace a route. It clears anything in the way, for a price.', 'important', () => this.inTool('path'));
  }

  addFromStock(kind: FurnitureId) {
    this.tools.addFromStock(kind, this.viewCentre());
  }

  /** ✓ in any tool. */
  confirmTool() {
    const res = this.tools.confirm();
    this.applyToolOutcome(res);
  }

  cancelTool() {
    this.tools.cancel();
    this.indoorFocus = null;
    this.outdoorFocus = null;
    this.onStateTouched?.();
  }

  private applyToolOutcome(res: ToolOutcome) {
    if (res.kind === 'none') return;
    const now = this.state.clock.totalMinutes;
    if (res.kind === 'planted') {
      const plant = res.plant;
      if (plant.location.kind !== 'wild') return;
      this.lushDirty = true;
      this.lushAcc = LUSH_REFRESH_MS;
      this.actionAnimUntil = now + 0.5;
      const zone = plant.location.zone;
      const native = PLANTS[plant.defId].habitat.includes(zone);
      const inBed = plant.location.bedId ? ' in your garden bed' : '';
      this.pushToast(`Planted ${specimenName(plant.defId, plant.variantId)}${inBed} in ${zoneLabel(zone, this.state)}.${native ? ' It’s at home here and will grow fast.' : ''}`, 'growth');
      this.hint('plantedOut', 'It grows on its own now, and spreads once it’s large.', 'important', this.outdoors);
      if (plant.location.bedId) this.hint('liveliness', 'Tap a bed to see how lively it is, and what it’s missing.', 'important', () => this.outdoors() && this.state.gardenBeds.length > 0);
    } else if (res.kind === 'transplanted') {
      this.lushDirty = true;
      const p = this.state.plants[res.plantId];
      if (p) this.pushToast(`Moved the ${specimenName(p.defId, p.variantId)}.`, 'growth');
    } else if (res.kind === 'placed') {
      this.refreshIndoor();
    } else if (res.kind === 'bed') {
      this.refreshCleared();
      const r = res.result;
      this.pushToast(`${r.bed.raised ? 'Set down a raised bed.' : `Dug a garden bed for ${r.bed.paid} coins.`}${r.adopted ? ` ${r.adopted} of your plants are in it now.` : ''}`, 'growth');
    } else if (res.kind === 'path') {
      this.refreshCleared();
      const r = res.result;
      const cleared: string[] = [];
      if (r.trees) cleared.push(`${r.trees} tree${r.trees === 1 ? '' : 's'}`);
      if (r.rocks) cleared.push(`${r.rocks} rock${r.rocks === 1 ? '' : 's'}`);
      if (r.dugUp) cleared.push(`${r.dugUp} of your plants`);
      this.pushToast(`Carved a path for ${r.cost} coins.${cleared.length ? ` Cleared ${cleared.join(', ')}.` : ''}`, 'growth');
    } else if (res.kind === 'clearing') {
      this.refreshCleared();
      const r = res.result;
      const cleared: string[] = [];
      if (r.trees) cleared.push(`${r.trees} tree${r.trees === 1 ? '' : 's'}`);
      if (r.rocks) cleared.push(`${r.rocks} rock${r.rocks === 1 ? '' : 's'}`);
      if (r.composted) cleared.push(`${r.composted} plant${r.composted === 1 ? '' : 's'}`);
      if (r.scrub) cleared.push(`${r.scrub} patch${r.scrub === 1 ? '' : 'es'} of scrub`);
      if (r.paths) cleared.push(`the path${r.paths === 1 ? '' : 's'} through it`);
      this.pushToast(`Cleared the ground back to bare earth for ${r.cost} coins.${cleared.length ? ` Out came ${cleared.join(', ')}.` : ''}`, 'growth');
    }
    this.onStateTouched?.();
  }

  /** Composts one of your outdoor plants, clearing its ground. */
  compost(plantId: string) {
    const p = this.state.plants[plantId];
    if (!p || p.location.kind !== 'wild') return;
    const res = compostPlant(this.state, plantId);
    if (!res) return;
    this.lushDirty = true;
    this.lushAcc = LUSH_REFRESH_MS;
    this.actionAnimUntil = this.state.clock.totalMinutes + 0.5;
    this.pushToast(`Composted the ${res.name}.`, 'info');
    this.onStateTouched?.();
  }

  /** Turns whatever's picked out or in hand while arranging, and says so when there's no room to. */
  rotateSelected(): boolean {
    const m = this.tools.mode;
    const holding = (m.kind === 'arrange' || m.kind === 'yard') && (!!m.pending || !!m.selectedId);
    const ok = this.tools.rotateSelected();
    if (!ok && holding) this.pushToast('No room to turn it here — move it somewhere clearer first.', 'info');
    return ok;
  }

  /** Turns a bed a quarter-turn where it lies, plants and all. */
  turnBed(id: string): boolean {
    const block = bedTurnBlock(this.state, id, this.world);
    if (block === 'square') return false;
    if (block) {
      this.pushToast(block === 'overlap' ? 'Turned that way it would run into another bed.' : block === 'patch' ? 'Turned that way it would cover a wild patch.' : 'No room to turn it that way.', 'info');
      return false;
    }
    if (!rotateBed(this.state, id, this.world)) return false;
    this.refreshCleared();
    this.onStateTouched?.();
    return true;
  }

  fillInBed(id: string) {
    const bed = findBed(this.state, id);
    if (bed && removeBed(this.state, id)) {
      this.refreshCleared();
      this.pushToast(bed.raised ? 'Took up the raised bed. It’s back in your basket.' : 'Filled the bed back in. Its plants stay, free to wander again.', 'info');
      this.onStateTouched?.();
    }
  }

  letPathGrowOver(id: string) {
    if (removePath(this.state, id)) {
      this.lushDirty = true;
      this.pushToast('You’ll let that path grow back over.', 'info');
      this.onStateTouched?.();
    }
  }

  private collectFind(id: string) {
    const now = this.state.clock.totalMinutes;
    const res = collectFoxFind(this.state, id, now);
    if (!res.ok || !res.find) {
      if (res.reason === 'basket-full') this.pushToast('Your basket is full.', 'info');
      return;
    }
    const f = res.find;
    this.actionAnimUntil = now + 0.5;
    this.audio.playDiscoveryChime();
    if (f.kind === 'curiosity' && res.golfBall) {
      this.announceGolfBall(res.golfBall, !!res.newCuriosity);
      this.flourish(f.x, f.y, GOLF_BALL_GAME_RARITY[res.golfBall.ball.rarity], res.golfBall.isNew);
    } else if (f.kind === 'curiosity') {
      const c = findCuriosity(f.curiosityId ?? '');
      if (c) {
        if (res.newCuriosity) {
          this.announce(`${c.name}. ${c.description}`, c.rarity);
          const keepsake = findKeepsake(c.id);
          if (keepsake) this.pushToast(keepsake.note, 'info');
        }
        else this.pushToast(`${c.name}.`, 'discovery', 'normal');
        this.flourish(f.x, f.y, c.rarity, !!res.newCuriosity);
      }
    } else if (f.defId && f.variantId) {
      const r = specimenRarity(f.defId, f.variantId);
      const name = fullName(f.defId, f.variantId);
      if (res.newSpecies) this.announce(`New discovery: ${name}.`, r);
      else if (res.newVariant) this.announce(`New variant: ${name}.`, r);
      else this.pushToast(`Took a cutting of ${specimenName(f.defId, f.variantId)}.`, 'info');
      this.flourish(f.x, f.y, r, !!(res.newSpecies || res.newVariant));
    }
    this.onStateTouched?.();
  }

  /**
   * A lost golf ball, and which kind it is. A kind never seen before gets a
   * little card of its own; another of one already found is just a line.
   */
  private announceGolfBall(g: GolfBallFind, firstEver: boolean) {
    const b = g.ball;
    const rarity = GOLF_BALL_GAME_RARITY[b.rarity];
    if (g.isNew) {
      const label = GOLF_BALL_RARITY_LABEL[b.rarity];
      const text = b.hidden ? `New golf ball found! The ${b.hidden.name}… it’s ${b.name}. ${label}.` : `New golf ball found! ${b.name}. ${label}.`;
      this.onToast?.({ id: makeUid('toast'), text, kind: 'discovery', significance: rarityRank(rarity) >= 2 ? 'major' : 'important', golfBall: b.id });
      if (rarityRank(rarity) >= 2) this.audio.music.playStinger();
      const keepsake = firstEver ? findKeepsake(GOLF_BALL_CURIOSITY) : undefined;
      if (keepsake) this.pushToast(keepsake.note, 'info');
    } else {
      this.pushToast(`A lost golf ball — ${b.name} (×${g.count}).`, 'discovery', 'normal');
    }
  }

  /** A discovery toast, with a quiet aside when it's a rare one. Rare finds are moments. */
  private announce(text: string, rarity: Rarity) {
    const aside = discoveryAside(rarity);
    this.pushToast(aside ? `${text} ${aside}` : text, 'discovery', rarityRank(rarity) >= 2 ? 'major' : 'important');
    // Only the finds that really matter get the motif, and never in a rush.
    if (rarityRank(rarity) >= 2) this.audio.music.playStinger();
  }

  /** Somewhere far off and overgrown for the fox to run to, or null. */
  private pickTrailDestination(rand: () => number): { x: number; y: number } | null {
    const p = this.state.player;
    let best: { x: number; y: number } | null = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 40; i++) {
      const a = rand() * Math.PI * 2;
      const r = 16 + rand() * 16;
      const x = p.x + Math.cos(a) * r;
      const y = p.y + Math.sin(a) * r;
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      if (!this.isOpenGround(tx, ty)) continue;
      const zone = zoneAt(tx, ty);
      if (zone === 'greenhouse') continue;
      if (onPath(this.state, x, y, this.state.clock.totalMinutes)) continue;
      // It likes the thick of things: old woods, the overgrown clearing, your own jungles.
      const wild = zone === 'overgrownClearing' || zone === 'woodland' || zone === 'dampForest' ? 1.5 : 0;
      const lush = this.lush.lush[ty * 90 + tx] ?? 0;
      const score = wild + lush * 1.5 + rand();
      if (score > bestScore) {
        bestScore = score;
        best = { x: tx + 0.5, y: ty + 0.5 };
      }
    }
    return best;
  }

  /** Scout and the cat's game of chase, while Ellen is in the greenhouse with them. */
  private play: PlayState | null = null;

  /** Open indoor floor: somewhere for a playing animal to run to. */
  private isOpenIndoors = (x: number, y: number) => !isBlockedIndoor(x, y, this.indoorSolid) && !isBlockedIndoor(x + 0.3, y, this.indoorSolid) && !isBlockedIndoor(x - 0.3, y, this.indoorSolid);

  /** How far a living-room piece has been moved, for the cat's and Scott's spots on it. */
  private fixtureOffset = (id: string) => fixtureOffset(this.state, id);

  /** Plants and trays around the house, for the cat to take an interest in. */
  private computeCatInterests(): CatInterest[] {
    const out: CatInterest[] = [];
    for (const p of Object.values(this.state.plants)) {
      if (p.location.kind === 'wild' || catAvoids(p.defId, p.variantId)) continue;
      const pieceId = p.location.kind === 'nursery' ? p.location.bedId : p.location.slotId;
      const piece = findFurniture(this.state, pieceId);
      if (!piece || FURNITURE_DEFS[piece.kind].layer === 'overhead') continue;
      out.push({ x: piece.x + 0.5, y: piece.y + 0.5, big: stageIndexOf(p.growth) >= 3 });
    }
    for (const n of nurserySpots(this.state)) {
      if (!occupantOf(this.state, { bedId: n.id })) out.push({ x: n.x + 0.5, y: n.y + 0.5, big: false, emptyTray: true });
    }
    return out;
  }

  /** How easily Ellen moves over the ground she's on. */
  /** Behind the wheel of the truck. */
  riding(): boolean {
    return !!this.state.truck && !!this.state.player.riding;
  }

  /** What stops her outdoors: the land, the stall, and the parked truck. */
  private blockedOutdoor(x: number, y: number): boolean {
    if (isBlockedOutdoor(x, y, this.blockingSet, stallRect(this.state))) return true;
    const t = this.state.truck;
    return !!t && !this.state.player.riding && !scottDriving(this.state) && truckCovers(t, x, y);
  }

  /** Whether she could stand here: open ground, nothing in the way. */
  private canStand(x: number, y: number): boolean {
    const r = 0.28;
    return !this.blockedOutdoor(x - r, y - r) && !this.blockedOutdoor(x + r, y - r) && !this.blockedOutdoor(x - r, y + r) && !this.blockedOutdoor(x + r, y + r);
  }

  /** Climbs into the truck. */
  boardTruck() {
    if (!this.state.truck || this.riding() || this.state.player.inGreenhouse) return;
    if (scottDriving(this.state)) {
      this.pushToast('Scott’s borrowed the truck for a drive. He’ll have it back where you left it.', 'info');
      return;
    }
    if (this.tools.active) this.tools.cancel();
    this.carryingDecorId = null;
    if (!boardTruck(this.state)) return;
    this.audio.playToolChime();
    this.pushToast('Driving — Scout’s jumped in the back. Thickets can’t slow the truck, and anything you gather rides in the back once your basket is full.', 'info');
    this.hint('truckPark', 'To get out, press E with nothing else in reach — or tap the 🚚 button.', 'important', () => this.riding());
    this.onStateTouched?.();
  }

  /** Parks the truck where she stopped and steps out. */
  parkTruck() {
    if (!this.riding()) return;
    if (!parkTruck(this.state, (x, y) => this.canStand(x, y))) {
      this.pushToast('No room to get out here.', 'info');
      return;
    }
    this.audio.playToolChime();
    // Scout jumps down after her.
    const sc = this.state.scout;
    sc.x = this.state.player.x - 0.7;
    sc.y = this.state.player.y + 0.4;
    sc.facing = 'down';
    const n = this.state.truck!.bed.length;
    this.pushToast(n ? `Parked. ${n} plant${n === 1 ? '' : 's'} in the back — they’re within reach while you’re beside it.` : 'Parked.', 'info');
    this.onStateTouched?.();
  }

  loadTruck() {
    const n = loadTruck(this.state, basketCapacity(this.state));
    if (n) this.pushToast(`Loaded ${n} plant${n === 1 ? '' : 's'} into the back.`, 'info');
    this.onStateTouched?.();
  }

  unloadTruck() {
    const n = unloadTruck(this.state, basketCapacity(this.state));
    if (n) this.pushToast(`Took ${n} plant${n === 1 ? '' : 's'} out of the truck.`, 'info');
    this.onStateTouched?.();
  }

  takeOutOfTruck(uid: string) {
    if (takeOut(this.state, uid, basketCapacity(this.state))) this.onStateTouched?.();
  }

  /** A note for the toast when something just went into the back of the truck rather than the basket. */
  private stowedNote(): string {
    return this.riding() && this.state.basket.length >= basketCapacity(this.state) && this.state.truck!.bed.length ? ' It rides in the back of the truck.' : '';
  }

  private groundSpeed(): number {
    const p = this.state.player;
    if (p.inGreenhouse) return 1;
    if (this.state.paths.length && onPath(this.state, p.x, p.y, this.state.clock.totalMinutes)) return PATH_SPEED;
    const lush = this.lush.lush[Math.floor(p.y) * 90 + Math.floor(p.x)] ?? 0;
    return 1 - Math.min(MAX_THICKET_SLOW, Math.max(0, lush - 0.25) * 0.35);
  }

  // ---- October ----

  private carve(id: string) {
    const res = carvePumpkin(this.state, id, Math.random);
    if (!res) return;
    markOnTrack(this.state, 'moonflower');
    this.actionAnimUntil = this.state.clock.totalMinutes + 0.5;
    const face = findFace(res.face)!;
    const lead = res.recarved ? 'A fresh pumpkin from the patch, and a new face:' : 'You carve it a face:';
    if (res.rare && res.newFace) {
      this.audio.playDiscoveryChime();
      this.pushToast(`${lead} ${face.name.toLowerCase()}. You’re not sure where that one came from.`, 'discovery');
    } else this.pushToast(`${lead} ${face.name.toLowerCase()}.${lanternsLit(1 - daylightFactor(this.state.clock.totalMinutes)) ? '' : ' It’ll light up after dark.'}`, 'info');
  }

  private meetTheGhost() {
    const g = this.ghost;
    const outcome = meetGhost(this.state, g);
    if (outcome === 'gift') {
      const zone = zoneAt(Math.floor(g.x), Math.floor(g.y));
      if (zone !== 'greenhouse') leaveFind(this.state, g.x - 0.2, g.y + 0.35, zone, 'moonflower', 'paleVisitor', Math.random);
      this.pushToast('It looks at you a long moment. Then it waves, and then it isn’t there. Where it sat, something small and pale is coming up.', 'discovery');
      this.audio.playSoftChime();
    } else {
      markOnTrack(this.state, 'moonflower');
      this.pushToast('It tilts its head at you, and waves.', 'info');
    }
  }

  // ---- The last mysteries ----

  /** Seconds until the world is next looked at for a moment to show a mystery's clue in. */
  private mysteryLookAcc = 0;
  /** Real seconds until another of the mysteries' observations may be shown: never two at once. */
  private mysteryQuiet = 0;
  /** Wild plants showing a mystery's clue right now, and how. */
  mysteryCues = new Map<string, 'star' | 'eclipse'>();

  /**
   * The last three forms: counts play toward their hints, and when one has a
   * step waiting, shows it the next time the player is somewhere it belongs.
   */
  private tendMysteries(dtSeconds: number) {
    const s = this.state;
    tickMysteries(s, dtSeconds);
    this.mysteryQuiet -= dtSeconds;
    this.mysteryLookAcc -= dtSeconds;
    if (this.mysteryLookAcc > 0) return;
    this.mysteryLookAcc = 1;
    this.mysteryCues = this.computeMysteryCues();
    if (this.mysteryQuiet > 0) return;
    for (const id of MYSTERY_IDS) {
      if (solutionUnannounced(s, id)) {
        markNudged(s, id, 4);
        this.pushToast(`You’ve written a guess about ${MYSTERIES[id].about} small at the bottom of a journal page. It’s there if you want it.`, 'info');
        this.mysteryQuiet = MYSTERY_QUIET_SECONDS;
        return;
      }
      const stage = pendingNudge(s, id);
      if (!stage) continue;
      const ctx = this.mysteryContext(id);
      const text = ctx ? nudgeText(id, ctx, stage) : null;
      if (!text) continue;
      markNudged(s, id, stage);
      this.pushToast(text, 'info');
      this.mysteryQuiet = MYSTERY_QUIET_SECONDS;
      return;
    }
  }

  private darkNow(): number {
    return 1 - daylightFactor(this.state.clock.totalMinutes);
  }

  /** Owned plants of this form, at least this big, near Ellen (outdoors) or under glass with her. */
  private nearForm(defId: string, variantId: string, minStage: number, range = 4): boolean {
    const p = this.state.player;
    return Object.values(this.state.plants).some((pl) => {
      if (pl.defId !== defId || pl.variantId !== variantId || stageIndexOf(pl.growth) < minStage) return false;
      if (pl.location.kind === 'wild') return !p.inGreenhouse && Math.hypot(pl.location.x - p.x, pl.location.y - p.y) < range;
      return p.inGreenhouse;
    });
  }

  /** Where Ellen is, as far as each mystery's clue is concerned: somewhere it could be noticed, or null. */
  private mysteryContext(id: MysteryId): NudgeContext | null {
    const s = this.state;
    const p = s.player;
    const night = this.darkNow() > 0.5;
    if (id === 'hoya') {
      if (!night) return null;
      if (this.nearForm('hoya', 'compacta', 3)) return 'plant';
      if (this.nearForm('hoya', 'compacta', 1)) return 'smallPlant';
      return null;
    }
    if (id === 'mooncap') {
      if (!night) return null;
      if (this.nearForm('mooncap', 'harvest', 1)) return 'plant';
      if (!isOctober() || p.inGreenhouse) return null;
      const view = this.camera.getViewportTileBounds(0);
      const lantern = this.octDirector.events.some((e) => e.kind === 'lantern' && e.going === null && e.age > 1 && e.x > view.minX && e.x < view.maxX && e.y > view.minY && e.y < view.maxY);
      if (lantern) return 'lantern';
      const zone = zoneAt(Math.floor(p.x), Math.floor(p.y));
      return zone === 'woodland' || zone === 'dampForest' || zone === 'creek' ? 'woods' : null;
    }
    // The moonflower's: only October has the pale thing and the pumpkins.
    if (!isOctober() || p.inGreenhouse) return null;
    const g = this.ghost;
    const view = this.camera.getViewportTileBounds(0);
    if (g.mode !== 'away' && g.mode !== 'greenhouse' && !g.going && g.shown > 0.6 && g.x > view.minX && g.x < view.maxX && g.y > view.minY && g.y < view.maxY) return 'ghost';
    if (this.darkNow() < 0.4) return null;
    const near = PUMPKINS.filter((pk) => Math.hypot(pk.x - p.x, pk.y - p.y) < 4);
    if (!near.length) return null;
    return near.some((pk) => s.october.carved[pk.id]) && lanternsLit(this.darkNow()) ? 'litPumpkin' : 'pumpkin';
  }

  /** A cutting from the form before a last one: the right thing to be doing, and a moment to notice something. */
  private cutForMystery(plant: { defId: string; variantId: string; growth: number }) {
    for (const id of MYSTERY_IDS) {
      const m = MYSTERIES[id];
      const want = ON_TRACK_CUTTING[id];
      if (plant.defId !== m.defId || plant.variantId !== want.variantId) continue;
      if (stageIndexOf(plant.growth) >= want.minStage) markOnTrack(this.state, id);
      const stage = pendingNudge(this.state, id);
      const ctx: NudgeContext | null = id === 'moonflower' ? null : id === 'hoya' && stageIndexOf(plant.growth) < 3 ? 'smallPlant' : 'plant';
      const text = stage && ctx ? nudgeText(id, ctx, stage) : null;
      if (text && this.mysteryQuiet <= 0) {
        markNudged(this.state, id, stage);
        this.pushToast(text, 'info');
        this.mysteryQuiet = MYSTERY_QUIET_SECONDS;
      }
    }
  }

  /** After dark, the big Hindu Ropes glint and the Harvest mooncaps now and then go dark in the middle, once the hints have begun. */
  private computeMysteryCues(): Map<string, 'star' | 'eclipse'> {
    const out = new Map<string, 'star' | 'eclipse'>();
    if (this.darkNow() < 0.5) return out;
    const star = mysteryStage(this.state, 'hoya') >= 1;
    const eclipse = mysteryStage(this.state, 'mooncap') >= 1;
    if (!star && !eclipse) return out;
    for (const pl of Object.values(this.state.plants)) {
      if (pl.location.kind !== 'wild') continue;
      if (star && pl.defId === 'hoya' && pl.variantId === 'compacta' && stageIndexOf(pl.growth) >= 3) out.set(pl.id, 'star');
      else if (eclipse && pl.defId === 'mooncap' && pl.variantId === 'harvest' && stageIndexOf(pl.growth) >= 1) out.set(pl.id, 'eclipse');
    }
    return out;
  }

  /** The animals see it first: they turn and look, and hold still. */
  private animalsLook(x: number, y: number, long: boolean) {
    const s = this.state;
    const now = s.clock.totalMinutes;
    const sc = s.scout;
    const sameSpace = !s.player.inGreenhouse || roomAt(sc.x) === roomAt(s.player.x);
    if (!sc.leadTo && sc.behavior !== 'leading' && sc.behavior !== 'pointing' && !this.riding() && sameSpace) {
      sc.behavior = 'idleLook';
      sc.facing = facingToward(x - sc.x, y - sc.y);
      sc.nextEventAt = now + (long ? 14 : 7);
    }
    if (!s.player.inGreenhouse && s.fox.visible && (s.fox.behavior === 'idle' || s.fox.behavior === 'wandering')) {
      s.fox.facing = x < s.fox.x ? 'left' : 'right';
    }
    if (s.player.inGreenhouse && s.cat.activity !== 'sleeping' && s.cat.activity !== 'hiding') {
      s.cat.facing = facingToward(x - s.cat.x, y - s.cat.y);
    }
  }

  /** Counts a creature as seen, once a visit. */
  private noticeCreature(id: string) {
    if (this.octNoticed.has(id)) return;
    this.octNoticed.add(id);
    noteSeen(this.state, id);
  }

  private tickOctober(dt: number) {
    const s = this.state;
    const p = s.player;
    const darkness = 1 - daylightFactor(s.clock.totalMinutes);
    const where: 'out' | 'greenhouse' | 'living' = p.inGreenhouse ? (roomAt(p.x) === 'living' ? 'living' : 'greenhouse') : 'out';
    const view = where === 'out' ? this.camera.getViewportTileBounds(0) : { minX: 0, maxX: 27, minY: 0, maxY: 12 };
    const inView = (x: number, y: number) => x > view.minX && x < view.maxX && y > view.minY && y < view.maxY;
    const near = (x: number, y: number, r: number) => Math.hypot(x - p.x, y - p.y) < r;
    const outdoors = where === 'out';
    const res = tickDirector(this.octDirector, {
      dt,
      darkness,
      where,
      px: p.x,
      py: p.y,
      view,
      rand: Math.random,
      trees: this.octTrees,
      bushes: this.octBushes,
      lanternsInView: outdoors && (LANTERN_POSTS.some((l) => inView(l.x, l.y)) || inView(PORCH_LANTERN.x, PORCH_LANTERN.y)),
      houseWindowInView: outdoors && inView(72.5, 37.5) && near(72.5, 37.5, 13),
      strayOut: !!strayPumpkin(s),
      isOpen: (x, y) => this.isOpenGround(Math.floor(x), Math.floor(y)) && !isBlockedOutdoor(x, y, this.blockingSet, stallRect(s)),
    });
    for (const kind of res.seen) noteSeen(s, kind);
    for (const e of res.begun) {
      if (e.kind === 'visitor') e.visits = s.october.seen.visitor ?? 0;
      this.octoberSound(e.kind);
    }
    if (res.react) this.animalsLook(res.react.x, res.react.y, res.react.long);
    if (res.stray) {
      s.october.stray = { x: res.stray.x, y: res.stray.y, face: Math.random() < 0.6 ? 'spooky' : 'verySpooky', until: nextDawn(s.clock.totalMinutes) };
    }
    if (res.lanternFind && outdoors) {
      markOnTrack(s, 'mooncap');
      const zone = zoneAt(Math.floor(res.lanternFind.x), Math.floor(res.lanternFind.y));
      const pick = zone !== 'greenhouse' ? pickLanternFind(s, zone, Math.random) : null;
      if (pick && zone !== 'greenhouse') leaveFind(s, res.lanternFind.x, res.lanternFind.y + 0.6, zone, pick.defId, pick.variantId, Math.random);
      this.audio.playSoftChime();
    }
    if (res.visitorLeft) {
      // Where it stood, the ground is warm, and something has come up.
      const { x, y } = res.visitorLeft;
      const zone = zoneAt(Math.floor(x), Math.floor(y));
      if (zone !== 'greenhouse' && !s.foxFinds.some((f) => f.defId === 'foxfireBonnet')) leaveFind(s, x, y + 0.2, zone, 'foxfireBonnet', 'ember', Math.random);
    }
    const lit = s.october.carved;
    const ghostRes = tickGhost(this.ghost, {
      dt,
      darkness,
      where,
      px: p.x,
      py: p.y,
      facing: p.facing,
      view,
      rand: Math.random,
      lit: lanternsLit(darkness) ? PUMPKINS.filter((pk) => lit[pk.id]).map((pk) => ({ id: pk.id, x: pk.x, y: pk.y })) : [],
    });
    if (ghostRes.seen) noteSeen(s, 'ghost');

    // October's creatures, each counted once a visit when properly seen.
    this.owlAlpha += ((darkness > 0.35 ? 1 : 0) - this.owlAlpha) * Math.min(1, dt * 0.8);
    const day = gameDay(s.clock.totalMinutes);
    const catOut = darkness > 0.5 && this.blackCatGoneDay !== day;
    this.blackCat += ((catOut ? 1 : 0) - this.blackCat) * Math.min(1, dt * (catOut ? 0.6 : 2.5));
    if (outdoors) {
      if (darkness > 0.4 && near(72.5, 33, 11)) this.noticeCreature('bats');
      if (this.owlAlpha > 0.6 && near(this.owlPerch.x, this.owlPerch.y, 7)) this.noticeCreature('owl');
      if (this.blackCat > 0.6 && near(BLACK_CAT_SPOT.x, BLACK_CAT_SPOT.y, 8)) this.noticeCreature('blackCat');
      if (this.blackCat > 0.3 && near(BLACK_CAT_SPOT.x, BLACK_CAT_SPOT.y, 3)) this.blackCatGoneDay = day;
      if (darkness > 0.45 && (near(PORCH_LANTERN.x, PORCH_LANTERN.y, 3.5) || near(LANTERN_POSTS[0].x, LANTERN_POSTS[0].y, 3) || near(LANTERN_POSTS[2].x, LANTERN_POSTS[2].y, 3))) this.noticeCreature('moth');
      if (near(PORCH_LANTERN.x, PORCH_LANTERN.y + 1, 2.4)) this.noticeCreature('spider');
      // Each stray pumpkin counts once, the first time it's seen.
      const stray = strayPumpkin(s);
      if (stray && stray.until !== this.strayNoticed && inView(stray.x, stray.y) && near(stray.x, stray.y, 9)) {
        this.strayNoticed = stray.until;
        noteSeen(s, 'stray');
      }
    }

    // The lanterns gutter when something's flickering them, or when the pale thing is close by one.
    let level = 1;
    const flicker = this.octDirector.events.find((e) => e.kind === 'flicker' && e.age >= 0);
    const g = this.ghost;
    const ghostByLantern = g.mode === 'haunt' && LANTERN_POSTS.some((l) => Math.hypot(l.x - g.x, l.y - g.y) < 3);
    if (flicker || ghostByLantern) {
      const t = performance.now();
      level = 0.25 + 0.75 * Math.abs(Math.sin(t * 0.021) * Math.sin(t * 0.0137 + 1.3));
    }
    const stray = strayPumpkin(s);
    const pumpkins = PUMPKINS.map((pk, i) => ({ id: pk.id, x: pk.x, y: pk.y, size: pk.size, face: s.october.carved[pk.id] ?? null, seed: i * 17 + 3 }));
    if (stray) pumpkins.push({ id: 'stray', x: stray.x, y: stray.y, size: 0.9, face: stray.face, seed: 99 });
    this.octView = {
      events: this.octDirector.events,
      ghost: this.ghost,
      pumpkins,
      owl: this.owlAlpha > 0.01 ? { ...this.owlPerch, alpha: this.owlAlpha } : null,
      blackCat: this.blackCat,
      webGrowth: ((day % 9) + 1) / 9,
      lanternLevel: level,
      darkness,
    };
    this.audio.octoberAmbience(dt, darkness, outdoors);
  }

  private octoberSound(kind: OctoberEventKind) {
    if (kind === 'rustle') this.audio.playRustle();
    else if (kind === 'nothing' && Math.random() < 0.4) this.audio.playDistantCall();
    else if (kind === 'visitor') this.audio.playHush();
  }

  // ---- Pointer: the finger as gardening tool ----

  /** The camera the current scene is drawn with. */
  sceneCamera(): CameraClass {
    if (!this.state.player.inGreenhouse) return this.camera;
    // A panned view belongs to arranging only; normal play always frames Ellen.
    const f = this.tools.mode.kind === 'arrange' && this.indoorFocus ? this.indoorFocus : this.state.player;
    return makeIndoorCamera(this.camera, f.x, f.y);
  }

  private viewCentre(): { x: number; y: number } {
    const cam = this.sceneCamera();
    return screenToTiles(cam, cam.viewW / 2, cam.viewH / 2);
  }

  private toWorld(sx: number, sy: number) {
    return screenToTiles(this.sceneCamera(), sx, sy);
  }

  private bindPointer() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', this.onPointerDown);
    c.addEventListener('pointermove', this.onPointerMove);
    c.addEventListener('pointerup', this.onPointerUp);
    c.addEventListener('pointercancel', this.onPointerCancel);
    c.addEventListener('wheel', this.onWheel, { passive: false });
    // iOS Safari ignores user-scalable=no and would zoom the whole page on a
    // pinch; the pinch is the game's to handle.
    document.addEventListener('gesturestart', preventDefault, { passive: false });
    document.addEventListener('gesturechange', preventDefault, { passive: false });
  }

  // ---- Zoom: pinch, scroll wheel, or + / − ----

  /** Zooms the view (outdoors, indoors and while editing alike) and remembers it. */
  setZoom(z: number) {
    const used = this.camera.setUserZoom(z);
    saveZoom(used);
  }

  zoomBy(factor: number) {
    this.setZoom(this.camera.userZoom * factor);
  }

  private pinchSpread(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    // Trackpad pinches arrive as ctrl+wheel with small deltas; mouse wheels as larger steps.
    const k = e.ctrlKey ? 0.01 : 0.0015;
    this.zoomBy(Math.exp(-e.deltaY * k));
  };

  private onZoomKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '+' || e.key === '=') this.zoomBy(1.15);
    else if (e.key === '-' || e.key === '_') this.zoomBy(1 / 1.15);
  };

  /** On touch, the plant preview floats a little above the fingertip so it isn't hidden under it. */
  private toolPoint(e: PointerEvent, touch: boolean) {
    const w = this.toWorld(e.clientX, e.clientY);
    if (touch && this.tools.mode.kind === 'plant') w.y -= 0.9;
    return w;
  }

  private onPointerDown = (e: PointerEvent) => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size >= 2) {
      // A second finger: it's a pinch, not a tap or a drag. Whatever the
      // first finger started is let go (a dragged piece springs back).
      if (!this.pinch) {
        if (this.press?.kind === 'tool' || this.press?.kind === 'pan') this.tools.cancelPress(this.press.prevSelected);
        this.press = null;
        this.pinch = { startDist: Math.max(1, this.pinchSpread()), startZoom: this.camera.userZoom };
      }
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic events in tests can't be captured; harmless.
      }
      return;
    }
    if (this.press || this.pinch) return;
    this.audio.init();
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    const base = { id: e.pointerId, sx: e.clientX, sy: e.clientY, lastSX: e.clientX, lastSY: e.clientY, moved: false, touch };
    if (this.tools.active) {
      const m = this.tools.mode;
      const prevSelected = m.kind === 'arrange' || m.kind === 'yard' ? m.selectedId : undefined;
      const w = this.toolPoint(e, touch);
      const r = this.tools.pointerDown(w.x, w.y);
      this.press = { ...base, kind: r === 'pan' ? 'pan' : 'tool', prevSelected };
    } else {
      this.press = { ...base, kind: 'tap' };
    }
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events in tests can't be captured; harmless.
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch) {
      if (this.pointers.size >= 2) this.setZoom(this.pinch.startZoom * (this.pinchSpread() / this.pinch.startDist));
      return;
    }
    const pr = this.press;
    if (!pr || pr.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - pr.sx, e.clientY - pr.sy) > 8) pr.moved = true;
    if (pr.kind === 'tool') {
      const w = this.toolPoint(e, pr.touch);
      this.tools.pointerMove(w.x, w.y);
    } else if (pr.kind === 'pan' && this.state.player.inGreenhouse && this.indoorFocus) {
      const cam = this.sceneCamera();
      const k = cam.zoom * 32;
      this.indoorFocus = { x: this.indoorFocus.x - (e.clientX - pr.lastSX) / k, y: this.indoorFocus.y - (e.clientY - pr.lastSY) / k };
      // Keep the focus inside the rooms so panning back is immediate.
      const c2 = makeIndoorCamera(this.camera, this.indoorFocus.x, this.indoorFocus.y);
      this.indoorFocus = { x: c2.x / 32, y: c2.y / 32 };
    } else if (pr.kind === 'pan' && !this.state.player.inGreenhouse && this.outdoorFocus) {
      const k = this.camera.zoom * TILE_SIZE;
      this.outdoorFocus = {
        x: Math.max(0, Math.min(GRID_W, this.outdoorFocus.x - (e.clientX - pr.lastSX) / k)),
        y: Math.max(0, Math.min(GRID_H, this.outdoorFocus.y - (e.clientY - pr.lastSY) / k)),
      };
    }
    pr.lastSX = e.clientX;
    pr.lastSY = e.clientY;
  };

  private onPointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pinch) {
      // The pinch ends when the fingers lift; the last one lifting does nothing else.
      if (this.pointers.size === 0) this.pinch = null;
      return;
    }
    const pr = this.press;
    if (!pr || pr.id !== e.pointerId) return;
    this.press = null;
    if (pr.kind === 'tool') {
      const w = this.toolPoint(e, pr.touch);
      this.applyToolOutcome(this.tools.pointerUp(w.x, w.y));
      if (this.state.player.inGreenhouse) this.refreshIndoor();
    } else if (pr.kind === 'pan') {
      this.tools.pointerUp(NaN, NaN);
    } else if (!pr.moved) {
      this.tapWorld(e.clientX, e.clientY);
    }
  };

  private onPointerCancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pinch) {
      if (this.pointers.size === 0) this.pinch = null;
      return;
    }
    if (this.press?.id !== e.pointerId) return;
    const kind = this.press.kind;
    this.press = null;
    // Cancelled by the system (a call, a gesture): don't commit a half-finished drag.
    if (kind === 'tool') this.tools.cancelPress();
  };

  private onToolKey = (e: KeyboardEvent) => {
    if (!this.tools.active) return;
    if (e.key === 'Escape') this.cancelTool();
    else if (e.key === 'Enter' && this.tools.canConfirm()) this.confirmTool();
    else if ((e.key === 'r' || e.key === 'R') && (this.tools.mode.kind === 'arrange' || this.tools.mode.kind === 'yard')) this.rotateSelected();
  };

  /** A tap on the world: look at the plant, bed or path under the finger. */
  tapWorld(sx: number, sy: number) {
    const w = this.toWorld(sx, sy);
    const p = this.state.player;
    if (p.inGreenhouse) {
      // Tapping a pot or tray opens it, same as walking up to it.
      const probe = new ToolController({ state: this.state, world: this.world, now: () => 0, player: () => p });
      const id = probe.pieceAt(w.x, w.y);
      if (!id) return;
      const piece = findFurniture(this.state, id);
      if (!piece) return;
      const role = FURNITURE_DEFS[piece.kind].role;
      if (role === 'nursery') this.onOpenGreenhouse?.({ kind: 'bed', id });
      else if (role === 'display') this.onOpenGreenhouse?.({ kind: 'display', id });
      return;
    }
    if (Math.hypot(w.x - p.x, w.y - p.y) > TAP_REACH) return;
    // Plants are drawn above their base, so tapping the leaves counts.
    let best: string | null = null;
    let bestD = Infinity;
    wildGrid(this.state).query(w.x, w.y + 0.4, 2, (plant) => {
      if (plant.location.kind !== 'wild') return;
      const r = Math.max(0.45, currentRadius(plant) * 0.8);
      const d = Math.min(Math.hypot(w.x - plant.location.x, w.y - plant.location.y), Math.hypot(w.x - plant.location.x, w.y - (plant.location.y - 0.45)));
      if (d < r && d < bestD) {
        bestD = d;
        best = plant.id;
      }
    });
    if (best) return this.onOpenPlantCard?.(best);
    const path = pathAt(this.state, w.x, w.y);
    if (path) return this.onOpenGroundCard?.({ kind: 'path', id: path.id });
    const bed = bedAt(this.state, w.x, w.y);
    if (bed) return this.onOpenGroundCard?.({ kind: 'bed', id: bed.id });
  }

  /** A hole in one on the living-room mat: the first on each hole is worth a few coins. */
  puttingAce(holeId: string): number {
    if (!recordAce(this.state.putting, holeId)) return 0;
    this.state.coins += ACE_REWARD;
    this.audio.playDiscoveryChime();
    this.onStateTouched?.();
    saveGame(this.state);
    return ACE_REWARD;
  }

  /** A full round of putt-putt finished; true if it's a new best. */
  finishPuttingRound(total: number): boolean {
    const best = recordRound(this.state.putting, total);
    if (best && this.state.putting.rounds > 1) this.audio.playToolChime();
    this.onStateTouched?.();
    saveGame(this.state);
    return best;
  }

  /**
   * One of the little games finished with this score: noted, saved, and the
   * first time past its goal paid the same as a first hole in one.
   */
  finishMiniGame(id: MiniGameId, score: number): MiniGameResult {
    const res = recordMiniGame(this.state.minigames, id, score);
    if (res.coins) {
      this.state.coins += res.coins;
      this.audio.playDiscoveryChime();
    } else if (res.best) this.audio.playToolChime();
    this.onStateTouched?.();
    saveGame(this.state);
    return res;
  }

  sell(uid: string) {
    const item = this.state.basket.find((i) => i.uid === uid);
    const price = sellItem(this.state, uid, this.state.clock.totalMinutes);
    if (price === null || !item) return;
    this.audio.playToolChime();
    this.pushToast(`Sold ${specimenName(item.defId, item.variantId)} for ${price} coins.`, 'coins');
    this.onStateTouched?.();
  }

  /** Sells something back to the market, at the resale price shown. */
  sellBack(kind: Resellable['kind'], id: string) {
    const name = resellables(this.state).find((r) => r.kind === kind && r.id === id)?.name;
    const paid = sellBack(this.state, kind, id);
    if (paid === null) return;
    this.audio.playToolChime();
    this.pushToast(`Sold the ${name ?? 'piece'} back for ${paid} coins.`, 'coins');
    this.onStateTouched?.();
  }

  /** Lets one of the player's koi go in a pond. */
  addKoi(pondId: string, koiId: string) {
    if (!addKoiToPond(this.state, pondId, koiId)) return;
    this.onStateTouched?.();
  }

  /** Nets a koi back out of a pond. */
  removeKoi(pondId: string, koiId: string) {
    if (!removeKoiFromPond(this.state, pondId, koiId)) return;
    this.onStateTouched?.();
  }

  /** Hands over the plant a request asked for. */
  fillCommission(uid: string) {
    const c = this.state.commission;
    const res = fillCommission(this.state, uid, this.state.clock.totalMinutes);
    if (!res || !c) return;
    this.audio.playDiscoveryChime();
    this.pushToast(`${res.pay} coins for the ${STAGE_LABEL[stageOf(res.item.growth)].toLowerCase()} ${specimenName(res.item.defId, res.item.variantId)}. “${res.note}”`, 'coins', 'important');
    this.onStateTouched?.();
  }

  buy(itemId: string, opts: BuyOptions = {}) {
    if (!buyItem(this.state, itemId, opts)) return;
    const item = findShopItem(itemId)!;
    this.refreshIndoor();
    this.audio.playToolChime();
    if (itemId === 'miniTruck') {
      deliverTruck(this.state, (tx, ty) => this.isOpenGround(tx, ty) && !this.plantOnTile(tx, ty) && !isBlockedOutdoor(tx + 0.5, ty + 0.5, this.blockingSet, stallRect(this.state)));
      this.pushToast(`Bought the Mini Truck. It’s parked in the lane by the house — room for ${TRUCK_BED_CAP} plants in the back.`, 'discovery');
      this.onStateTouched?.();
      return;
    }
    if (itemId === 'koi') {
      const k = this.state.koi[this.state.koi.length - 1];
      this.pushToast(`Bought a ${koiVariety(k.variety).name} koi. Let it go in a pond: walk up to one you’ve dug.`, 'coins');
      this.onStateTouched?.();
      return;
    }
    this.pushToast(
      item.category === 'garden'
        ? `Bought ${item.name}. Place it outdoors from your basket.`
        : item.category === 'greenhouse'
          ? item.repeatable
            ? `Bought a ${item.name}. Set it down indoors: tap the arrange button at home.`
            : `${item.name} — done. Go and see.`
          : `Bought ${item.name}.`,
      'coins',
      item.category === 'greenhouse' && !item.repeatable ? 'important' : 'minor'
    );
    this.onStateTouched?.();
  }

  /** Where a piece set down "in front of Ellen" would go. */
  furnitureTile(): { x: number; y: number } {
    const p = this.state.player;
    const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[p.facing];
    return { x: Math.round((p.x - 0.5 + dx) * 8) / 8, y: Math.round((p.y - 0.5 + dy) * 8) / 8 };
  }

  furnitureBlock(kind: FurnitureId) {
    if (!this.state.player.inGreenhouse) return 'outdoors' as const;
    const { x, y } = this.furnitureTile();
    return placeBlockReason(this.state, kind, x, y, { avoid: [this.state.player] });
  }

  placeFurnitureHere(kind: FurnitureId) {
    if (!this.state.player.inGreenhouse) return;
    const { x, y } = this.furnitureTile();
    const block = placeBlockReason(this.state, kind, x, y, { avoid: [this.state.player] });
    if (block === 'wall' || block === 'occupied') return this.pushToast('No room there. Face an open patch of floor.', 'info');
    if (block === 'doorway') return this.pushToast('Keep the doorway clear.', 'info');
    if (!placeFurniture(this.state, kind, x, y, { avoid: [this.state.player] })) return;
    this.refreshIndoor();
    this.onStateTouched?.();
  }

  pickUpFurniture(id: string) {
    if (!pickUpFurniture(this.state, id)) return;
    this.refreshIndoor();
    this.onStateTouched?.();
  }

  nearbyDecor() {
    if (this.state.player.inGreenhouse) return null;
    const d = nearestDecor(this.state, this.state.player.x, this.state.player.y + 0.4, 1.2);
    // A planter with a plant in it can't be picked up.
    return d && !occupantOf(this.state, { slotId: d.id }) ? d : null;
  }

  pickUpNearbyDecor() {
    const d = this.nearbyDecor();
    if (d && pickUpDecor(this.state, d.id)) this.onStateTouched?.();
  }

  /** The outdoor zone Ellen is standing in, or null while she's indoors. */
  currentOutdoorZone(): ZoneId | null {
    if (this.state.player.inGreenhouse) return null;
    return zoneAt(Math.floor(this.state.player.x), Math.floor(this.state.player.y));
  }

  isEstablished(defId: string) {
    return isEstablished(this.state, defId);
  }

  resetToNewGame() {
    this.state = resetGame();
    this.spreadCarry = 0;
    this.tools.cancel();
    this.tools = new ToolController({
      state: this.state,
      world: this.world,
      now: () => this.state.clock.totalMinutes,
      player: () => ({ x: this.state.player.x, y: this.state.player.y }),
      openGround: (tx, ty) => this.isOpenGround(tx, ty),
    });
    this.tools.onChange = () => {
      if (this.tools.mode.kind !== 'arrange') this.indoorFocus = null;
      if (this.tools.mode.kind !== 'yard') this.outdoorFocus = null;
      this.onToolsChanged?.();
    };
    this.refreshCleared();
    this.refreshIndoor();
    this.lush = computeLushness(this.state);
    saveGame(this.state);
    this.onStateTouched?.();
  }

  /**
   * Scout and the alligator: when it's sunning itself on its bank and she's
   * close by, now and then she trots down, climbs onto its back, and it
   * takes her for a turn round the creek before bringing her back to the
   * bank. Returns true while this is what Scout's doing (so her usual
   * routine is skipped).
   */
  private tendGatorRide(dtSeconds: number, ellenMoving: boolean): boolean {
    const now = performance.now();
    const sc = this.state.scout;
    const me = this.state.player;
    if (this.gatorRide !== null && now >= this.gatorRide + GATOR_RIDE_MS) {
      this.gatorRide = null;
      this.nextGatorRideAt = now + 150000 + Math.random() * 150000;
      if (sc.behavior === 'onGator') {
        // Set down on the bank, beside it, none the worse.
        sc.x = GATOR_BANK.x + 0.7;
        sc.y = GATOR_BANK.y + 0.45;
        sc.facing = 'left';
        sc.behavior = 'following';
        if (!me.inGreenhouse) this.pushToast('The alligator brings Scout back to the bank, safe and sound. Her tail hasn’t stopped wagging.', 'info');
        return true;
      }
    }
    // Indoors, or carried off in the truck: whatever she was up to is off.
    if (me.inGreenhouse || this.riding() || sc.leadTo) {
      if (sc.behavior === 'toGator' || sc.behavior === 'onGator') sc.behavior = 'following';
      return false;
    }
    if (sc.behavior === 'onGator') {
      if (this.gatorRide === null) {
        sc.behavior = 'following';
        return false;
      }
      const g = alligatorAt(now, this.gatorRide);
      sc.x = g.x;
      sc.y = g.y + 0.02;
      sc.facing = facingToward(-Math.sin(g.heading), Math.cos(g.heading));
      return true;
    }
    // Room for a whole ride before it would set off on its own swim.
    const time = gatorBaskLeftMs(now) > GATOR_RIDE_MS + 2000;
    if (sc.behavior === 'toGator') {
      const to = { x: GATOR_BANK.x + 0.15, y: GATOR_BANK.y };
      const d = Math.hypot(to.x - sc.x, to.y - sc.y);
      if (!time || this.gatorRide !== null || Math.hypot(me.x - sc.x, me.y - sc.y) > 14) {
        sc.behavior = 'following';
        return false;
      }
      if (d < 0.25) {
        sc.behavior = 'onGator';
        this.gatorRide = now;
        this.pushToast('Scout clambers up onto the alligator’s back, and off they go round the creek.', 'info');
        return true;
      }
      const wp = overlandWaypoint(sc.x, sc.y, to.x, to.y);
      const wd = Math.hypot(wp.x - sc.x, wp.y - sc.y) || 1;
      const step = Math.min(4.2 * dtSeconds, wd);
      sc.x += ((wp.x - sc.x) / wd) * step;
      sc.y += ((wp.y - sc.y) / wd) * step;
      sc.facing = facingToward(wp.x - sc.x, wp.y - sc.y);
      return true;
    }
    // Whether she goes: Ellen's stopped nearby, Scout's on the gator's side of the creek and not after a frog.
    if (this.gatorRide !== null || !time || now < this.nextGatorRideAt || ellenMoving || sc.frog !== undefined) return false;
    const near = Math.hypot(sc.x - GATOR_BANK.x, sc.y - GATOR_BANK.y) < 7 && Math.hypot(me.x - GATOR_BANK.x, me.y - GATOR_BANK.y) < 9;
    if (!near || sc.x < GATOR_BANK.x - 0.5) return false;
    // She likes it: a few seconds' standing about is usually enough.
    if (Math.random() < 0.25 * dtSeconds) {
      sc.behavior = 'toGator';
      return true;
    }
    return false;
  }

  /** The creek's frogs that are out right now (not off in the water after a fright, nor eaten). */
  private visibleFrogs(): FrogAt[] {
    const now = performance.now();
    for (const [seed, until] of this.frogsGone) if (now >= until) this.frogsGone.delete(seed);
    return riverFrogs(now, isNight(this.state.clock.totalMinutes)).filter((f) => !this.frogsGone.has(f.seed));
  }

  /** The closest frog sitting within Scout's sight, for her to go after. */
  private nearestSittingFrog(frogs: FrogAt[]): { x: number; y: number; seed: number } | null {
    const sc = this.state.scout;
    let best: FrogAt | null = null;
    let bestD = FROG_SIGHT;
    for (const f of frogs) {
      if (f.hop !== null) continue;
      const d = Math.hypot(f.x - sc.x, f.y - sc.y);
      if (d < bestD) {
        best = f;
        bestD = d;
      }
    }
    return best ? { x: best.x, y: best.y, seed: best.seed } : null;
  }

  /**
   * Scout's pounce: the frog's nearly always quicker, and plops into the
   * creek to sit out the fuss. Once in a long while, it isn't.
   */
  private scoutPounced(f: FrogAt) {
    const now = performance.now();
    if (Math.random() < FROG_CATCH_CHANCE) {
      // Gone for the rest of the day; another turns up on that bank tomorrow.
      this.frogsGone.set(f.seed, now + (MINUTES_PER_DAY / GAME_MINUTES_PER_REAL_SECOND) * 1000);
      this.pushToast('Scout actually caught a frog… and ate it. Oh, Scout.', 'info');
      return;
    }
    this.frogsGone.set(f.seed, now + 25000 + Math.random() * 20000);
    this.frogSplashes.push({ x: f.x, y: f.y, start: now });
  }

  private render(now: number) {
    // Arranging the garden, the view can be panned away from Ellen.
    const focus = this.tools.mode.kind === 'yard' && this.outdoorFocus ? this.outdoorFocus : this.state.player;
    this.camera.follow(focus.x, focus.y);
    const crouching = this.state.clock.totalMinutes < this.actionAnimUntil;
    this.frogSplashes = this.frogSplashes.filter((sp) => now - sp.start < 1200);
    const scene = { gatorRide: this.gatorRide, frogsGone: this.frogsGone, frogSplashes: this.frogSplashes, tools: this.tools.mode, flourishes: this.flourishes, cleared: this.cleared, fade: Math.max(0, 1 - (now - this.fadeFrom) / FADE_MS), kiss: this.chase.kiss, october: isOctober() ? this.octView : null, mysteryCues: this.mysteryCues };
    if (this.state.player.inGreenhouse) {
      this.renderer.renderIndoor(this.sceneCamera(), this.state, now, crouching, scene);
    } else {
      this.renderer.renderOutdoor(this.camera, this.state, this.obstacles, now, crouching, this.lush, scene);
    }
  }

  /** Which room Ellen is in, for the HUD. */
  currentRoom(): 'living' | 'greenhouse' | null {
    return this.state.player.inGreenhouse ? roomAt(this.state.player.x) : null;
  }
}

function stageName(plant: OwnedPlant) {
  return (['cutting', 'young', 'established', 'large', 'specimen'] as const)[stageIndexOf(plant.growth)];
}
