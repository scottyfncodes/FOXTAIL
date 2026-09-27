import type { GameState, OwnedPlant } from '../state';
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
import { HOUSE_DOOR, GRID_W, GRID_H, TILE_SIZE, zoneAt, rectContains, isInBounds, isWater, isInsideHomeFootprint } from '../data/worldMap';
import { FRONT_DOOR, roomAt, GREENHOUSE_DOORS, DOOR_OUTWARD, type GreenhouseDoor } from '../data/interior';
import { FURNITURE_DEFS } from '../data/furniture';
import { displaySlots, nurserySpots, placeFurniture, placeBlockReason, pickUpFurniture, findFurniture, fixtureOffset, footprint } from '../systems/furniture';
import { ACE_REWARD, COURSE, COURSE_PAR, bestRound, recordAce, recordRound, toPar } from '../systems/putting';
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
  ROCK_REMOVAL_COST,
  rockRemovalBlock,
  removeRock,
} from '../systems/landscape';
import { createFoxFinds, collectFoxFind, expireFoxFinds } from '../systems/foxFinds';
import { findCuriosity } from '../data/curiosities';
import { discoveryFlourish, discoveryAside, type Flourish } from '../systems/rarity';
import type { CatInterest } from '../systems/cat';
import { KIND_SIGNIFICANCE, type Significance, type ToastKind, type ToastOptions } from '../systems/toasts';
import { isNight } from './Clock';
import type { Rarity } from '../types';
import { DISCOVERY_SPOTS } from '../data/discoveryPoints';
import { TOOL_PICKUPS } from '../data/toolPickups';
import { PLANTS, specimenName, specimenRarity, rarityRank, RARITY_LABEL, fullName } from '../data/plants';
import { findShopItem, type DecorId, type FurnitureId } from '../data/shop';
import { ZONES } from '../data/zones';
import type { OutdoorZoneId, ZoneId } from '../types';
import { tickFox } from '../systems/fox';
import { tickScout } from '../systems/scout';
import { tickScott, tickChase, newChase } from '../systems/scott';
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
  crossBlockReason,
  crossPollinate,
  crossOf,
} from '../systems/propagation';
import { sellItem, buyItem } from '../systems/market';
import { tickCommissions, fillCommission, openCommission } from '../systems/commissions';
import { tickBedCuriosities } from '../systems/beds';
import { checkRegionTiers, eveningStroll, lushestTile, nameRegion, regionLabel, suggestedName } from '../systems/regions';
import { describeRegion } from '../systems/wild';
import { catAvoids } from '../systems/cat';
import { minuteOfDay } from './Clock';
import { pickUpDecor, nearestDecor, moveDecor, decorFits, isGardenPlanter } from '../systems/decor';
import { stallRect } from '../systems/yard';
import { boardTruck, parkTruck, deliverTruck, truckCovers, loadTruck, unloadTruck, takeOut, TRUCK_SPEED, TRUCK_BED_CAP } from '../systems/truck';
import { basketCapacity } from '../systems/basket';

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
  | 'rock'
  | 'decor'
  | 'setDown'
  | 'truck';

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
  foxFind: 3,
  lantern: 3,
  plaque: 3,
  spot: 4,
  decor: 5,
  rock: 5,
  wildPlant: 6,
  truck: 1,
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
  onOpenPutting: (() => void) | null = null;
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
  private autosaveAcc = 0;
  private spreadCarry = 0;
  private lushAcc = 0;
  private lushDirty = true;
  private started = false;
  private rafId = 0;
  /** Game-minute timestamp until which Ellen renders in her brief collect/crouch pose. */
  actionAnimUntil = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.renderer = new Renderer(ctx);
    const { state, isNew } = loadOrCreate();
    this.state = state;
    this.isNew = isNew;
    this.obstacles = generateObstacles();
    for (const o of this.obstacles) this.obstacleMap.set(`${o.x},${o.y}`, o);
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
        GREENHOUSE_DOORS.some((d) => {
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
    const loop = (now: number) => {
      const dtMs = Math.min(100, now - this.lastFrame);
      this.lastFrame = now;
      this.update(dtMs);
      this.render(now);
      this.onFrame?.();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  onToolsChanged: (() => void) | null = null;

  stop() {
    cancelAnimationFrame(this.rafId);
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
    if (result.ups.length || result.spreads.length) this.lushDirty = true;
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
    const sports = result.spreads.filter((s) => this.state.plants[s.childId]?.unnoticed);
    if (!offline) {
      if (result.spreads.length > 0) {
        const child = this.state.plants[result.spreads[0].childId];
        if (child?.location.kind === 'wild') {
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
      const blocked = this.state.player.inGreenhouse ? (x: number, y: number) => isBlockedIndoor(x, y, this.indoorSolid) : (x: number, y: number) => this.blockedOutdoor(x, y);
      const next = tryMove(this.state.player.x, this.state.player.y, dx, dy, blocked);
      this.state.player.x = next.x;
      this.state.player.y = next.y;
      if (Math.abs(move.x) > Math.abs(move.y)) {
        this.state.player.facing = move.x > 0 ? 'right' : 'left';
      } else if (move.y !== 0) {
        this.state.player.facing = move.y > 0 ? 'down' : 'up';
      }
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

    // In the greenhouse, Scout and the cat play chase instead of their usual routines.
    const playing = this.state.player.inGreenhouse && roomAt(this.state.player.x) === 'greenhouse';
    if (playing) {
      this.play ??= startPlay(Math.random);
      tickPlay(this.play, this.state.scout, this.state.cat, { dtSeconds, rand: Math.random, isOpen: this.isOpenIndoors });
    } else if (this.play) {
      this.play = null;
      endPlay(this.state.scout, this.state.cat, this.state.clock.totalMinutes);
    }

    if (!playing) {
      tickScout(this.state.scout, {
        playerX: this.state.player.x,
        playerY: this.state.player.y,
        playerFacing: this.state.player.facing,
        playerMoving: move.x !== 0 || move.y !== 0,
        dtSeconds,
        now: this.state.clock.totalMinutes,
        nearbyUndiscovered: this.state.player.inGreenhouse ? null : this.findNearbyUnseen(),
        rand: Math.random,
        indoors: this.state.player.inGreenhouse,
      });
    }
    const p = this.state.player;
    const kissing = !!this.chase.kiss;
    if (tickChase(this.chase, this.state.scott, { ellenX: p.x, ellenY: p.y, ellenIndoors: p.inGreenhouse, ellenMoving: move.x !== 0 || move.y !== 0, dtSeconds })) {
      p.facing = this.chase.kiss!.ellenLeft ? 'right' : 'left';
      if (this.tools.active) this.tools.cancel();
    }
    if (!kissing && !this.chase.kiss) {
      tickScott(this.state.scott, { dtSeconds, now: this.state.clock.totalMinutes, rand: Math.random, offset: this.fixtureOffset, extraSpots: eveningStroll(this.state, minuteOfDay(this.state.clock.totalMinutes)) });
    }
    this.catInterestAcc += dtMs;
    if (this.catInterestAcc >= CAT_INTEREST_MS) {
      this.catInterestAcc = 0;
      this.catInterests = this.computeCatInterests();
    }
    if (!playing) tickCat(this.state.cat, { dtSeconds, now: this.state.clock.totalMinutes, rand: Math.random, interests: this.catInterests, offset: this.fixtureOffset });
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
      if (Math.hypot(plant.location.x - p.x, plant.location.y - p.y) > NOTICE_RANGE) continue;
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
      const door = GREENHOUSE_DOORS.find((d) => d.outside.x === tx && d.outside.y === ty);
      if (door) this.enterGreenhouse(door);
      else if (tx === HOUSE_DOOR.x && ty === HOUSE_DOOR.y) this.enterHouse();
    } else if (GREENHOUSE_DOORS.some((d) => this.throughDoor(d, p.x, p.y))) {
      this.exitGreenhouse(GREENHOUSE_DOORS.find((d) => this.throughDoor(d, p.x, p.y)));
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
      // Rocks can be hauled away, for a fee. Only the tiles right around her are checked.
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tx = Math.floor(p.x) + dx;
          const ty = Math.floor(p.y) + dy;
          if (this.world.obstacleAt(tx, ty) !== 'rock') continue;
          const afford = this.state.coins >= ROCK_REMOVAL_COST;
          const label = afford ? `Have this rock hauled away · ${ROCK_REMOVAL_COST} coins` : `A rock · ${ROCK_REMOVAL_COST} coins to have it hauled away`;
          consider({ kind: 'rock', id: `${tx},${ty}`, x: tx, y: ty, label, available: afford }, tx + 0.5, ty + 0.5);
        }
      }
      const stall = stallRect(this.state);
      const mx = stall.x + stall.w / 2;
      const my = stall.y + 1.1;
      consider({ kind: 'market', id: 'market', x: mx, y: my, label: 'Plant Stand & Supply', available: true }, mx, my, this.riding() ? 2.4 : 1.6);
      if (!this.riding()) {
        for (const d of GREENHOUSE_DOORS) {
          consider({ kind: 'greenhouseDoor', id: d.id, x: d.outside.x, y: d.outside.y, label: 'Into the Greenhouse', available: true }, d.outside.x + 0.5, d.outside.y + 0.5);
        }
        consider({ kind: 'houseDoor', id: 'house', x: HOUSE_DOOR.x, y: HOUSE_DOOR.y, label: 'Go inside — home', available: true }, HOUSE_DOOR.x + 0.5, HOUSE_DOOR.y + 0.5);
      }
      const truck = this.state.truck;
      if (truck && !this.riding()) {
        const n = truck.bed.length;
        consider({ kind: 'truck', id: 'truck', x: truck.x, y: truck.y, label: `Get in the truck${n ? ` · ${n} in the back` : ''}`, available: true }, truck.x, truck.y - 0.3, 1.7);
      }
    } else {
      for (const bed of nurserySpots(this.state)) {
        const plant = occupantOf(this.state, { bedId: bed.id });
        const label = plant ? `${specimenName(plant.defId, plant.variantId)} — ${STAGE_LABEL[stageName(plant)]}` : 'Empty nursery bed';
        consider({ kind: 'bed', id: bed.id, x: bed.x, y: bed.y, label, available: true }, bed.x + 0.5, bed.y + 0.5);
      }
      for (const slot of displaySlots(this.state)) {
        const plant = occupantOf(this.state, { slotId: slot.id });
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
      for (const d of GREENHOUSE_DOORS) {
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
      this.enterGreenhouse(GREENHOUSE_DOORS.find((d) => d.id === n.id));
    } else if (n.kind === 'houseDoor') {
      this.enterHouse();
    } else if (n.kind === 'greenhouseExit') {
      this.exitGreenhouse(GREENHOUSE_DOORS.find((d) => d.id === n.id));
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
    } else if (n.kind === 'setDown') {
      this.setDownDecor();
    } else if (n.kind === 'bed' || n.kind === 'display') {
      this.onOpenGreenhouse?.({ kind: n.kind, id: n.id });
    } else if (n.kind === 'puttingMat') {
      this.onOpenPutting?.();
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

  /** Pays to have a rock dug out and carted off. */
  haulRock(key: string) {
    const [tx, ty] = key.split(',').map(Number);
    const block = rockRemovalBlock(this.state, this.world, tx, ty);
    if (block === 'coins') return this.pushToast(`Hauling a rock away costs ${ROCK_REMOVAL_COST} coins.`, 'info');
    if (!removeRock(this.state, this.world, tx, ty)) return;
    this.refreshCleared();
    this.audio.playToolChime();
    this.pushToast(`Rock hauled away for ${ROCK_REMOVAL_COST} coins. Open ground now.`, 'coins');
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
    }
    this.onStateTouched?.();
  }

  /** Composts one of your outdoor plants, clearing its ground. */
  compost(plantId: string) {
    const p = this.state.plants[plantId];
    if (!p || p.location.kind !== 'wild') return;
    const where = { x: p.location.x, y: p.location.y };
    const res = compostPlant(this.state, plantId, this.state.clock.totalMinutes);
    if (!res) return;
    this.lushDirty = true;
    this.lushAcc = LUSH_REFRESH_MS;
    this.actionAnimUntil = this.state.clock.totalMinutes + 0.5;
    let msg = `Composted the ${res.name}.`;
    if (res.cutting) {
      const r = specimenRarity(res.cutting.defId, res.cutting.variantId);
      if (res.cutting.changed) msg += ` You saved a cutting — though it’s a ${fullName(res.cutting.defId, res.cutting.variantId)}, not quite the same.`;
      else msg += ' You saved a cutting from it.';
      this.flourish(where.x, where.y, r, res.cutting.newVariant);
    } else if (res.noRoom) msg += ' There was a cutting worth saving, but your basket was full.';
    this.pushToast(msg, 'info');
    this.onStateTouched?.();
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
    if (f.kind === 'curiosity') {
      const c = findCuriosity(f.curiosityId ?? '');
      if (c) {
        if (res.newCuriosity) this.announce(`${c.name}. ${c.description}`, c.rarity);
        else this.pushToast(`${c.name} again.`, 'discovery', 'normal');
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

  /** A discovery toast, with a quiet aside when it's a rare one. Rare finds are moments. */
  private announce(text: string, rarity: Rarity) {
    const aside = discoveryAside(rarity);
    this.pushToast(aside ? `${text} ${aside}` : text, 'discovery', rarityRank(rarity) >= 2 ? 'major' : 'important');
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
    return !!t && !this.state.player.riding && truckCovers(t, x, y);
  }

  /** Whether she could stand here: open ground, nothing in the way. */
  private canStand(x: number, y: number): boolean {
    const r = 0.28;
    return !this.blockedOutdoor(x - r, y - r) && !this.blockedOutdoor(x + r, y - r) && !this.blockedOutdoor(x - r, y + r) && !this.blockedOutdoor(x + r, y + r);
  }

  /** Climbs into the truck. */
  boardTruck() {
    if (!this.state.truck || this.riding() || this.state.player.inGreenhouse) return;
    if (this.tools.active) this.tools.cancel();
    this.carryingDecorId = null;
    if (!boardTruck(this.state)) return;
    this.audio.playToolChime();
    this.pushToast('Driving. Thickets can’t slow the truck, and anything you gather rides in the back once your basket is full.', 'info');
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
    else if ((e.key === 'r' || e.key === 'R') && this.tools.mode.kind === 'arrange') this.tools.rotateSelected();
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

  sell(uid: string) {
    const item = this.state.basket.find((i) => i.uid === uid);
    const price = sellItem(this.state, uid, this.state.clock.totalMinutes);
    if (price === null || !item) return;
    this.audio.playToolChime();
    this.pushToast(`Sold ${specimenName(item.defId, item.variantId)} for ${price} coins.`, 'coins');
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

  buy(itemId: string) {
    if (!buyItem(this.state, itemId)) return;
    const item = findShopItem(itemId)!;
    this.refreshIndoor();
    this.audio.playToolChime();
    if (itemId === 'miniTruck') {
      deliverTruck(this.state, (tx, ty) => this.isOpenGround(tx, ty) && !this.plantOnTile(tx, ty) && !isBlockedOutdoor(tx + 0.5, ty + 0.5, this.blockingSet, stallRect(this.state)));
      this.pushToast(`Bought the Mini Truck. It’s parked in the lane by the house — room for ${TRUCK_BED_CAP} plants in the back.`, 'discovery');
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

  private render(now: number) {
    // Arranging the garden, the view can be panned away from Ellen.
    const focus = this.tools.mode.kind === 'yard' && this.outdoorFocus ? this.outdoorFocus : this.state.player;
    this.camera.follow(focus.x, focus.y);
    const crouching = this.state.clock.totalMinutes < this.actionAnimUntil;
    const scene = { tools: this.tools.mode, flourishes: this.flourishes, cleared: this.cleared, fade: Math.max(0, 1 - (now - this.fadeFrom) / FADE_MS), kiss: this.chase.kiss };
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
