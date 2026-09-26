import { createNewGame, SAVE_KEY, SAVE_VERSION, type GameState } from '../state';
import { findScottSpot } from '../data/scottSpots';
import { findCatSpot, spotPosition } from '../data/catSpots';
import { fixtureOffset } from '../systems/furniture';
import { PLANTS } from '../data/plants';
import { FURNITURE_DEFS } from '../data/furniture';
import { SHOP_ITEMS, INTRODUCED_IN_V7 } from '../data/shop';
import { HOUSE_FOOTPRINT, HOUSE_DOOR } from '../data/worldMap';

// Older builds stored each schema version under its own key; they're read
// once as a fallback so those players' progress is recovered, not lost.
const LEGACY_KEYS = ['foxtrot-save-v3', 'foxtrot-save-v2', 'foxtrot-save-v1'];

// Fields that are small fixed-shape records: a field added to one of these
// later is filled from the defaults instead of being left undefined.
const STRUCT_FIELDS = ['stall', 'player', 'clock', 'weather', 'tools', 'fox', 'scout', 'scott', 'cat', 'market', 'foxLog', 'putting', 'commissions'] as const;
const ARRAY_FIELDS = ['basket', 'owned', 'decor', 'hints', 'furniture', 'seededFixtures', 'seenShop', 'gardenBeds', 'paths', 'clearedObstacles', 'foxFinds'] as const;
const RECORD_FIELDS = ['plants', 'collection', 'spots', 'decorStock', 'furnitureStock', 'curiosities', 'purchases', 'regions', 'regionTier'] as const;

/** Anything standing where the house now is gets moved out onto the lawn in front of it. */
function inHouse(x: number, y: number): boolean {
  return x >= HOUSE_FOOTPRINT.x - 0.3 && x < HOUSE_FOOTPRINT.x + HOUSE_FOOTPRINT.w + 0.3 && y >= HOUSE_FOOTPRINT.y - 0.3 && y < HOUSE_DOOR.y + 1.6;
}

// Anything below this can't be a wall-clock epoch in ms; older builds saved
// a page-relative performance.now() value here.
const MIN_EPOCH_MS = 1_000_000_000_000;

type Loose = Record<string, unknown>;

function isRecord(v: unknown): v is Loose {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Brings any save from an older (or the current) schema up to date by
 * layering it over a fresh game's defaults. Returns null for anything that
 * isn't a recognizable save, or one written by a newer build.
 */
export function migrateSave(raw: unknown): GameState | null {
  if (!isRecord(raw) || typeof raw.version !== 'number' || raw.version > SAVE_VERSION) return null;
  if (!isRecord(raw.player) || !isRecord(raw.clock)) return null;

  const defaults = createNewGame() as unknown as Loose;
  const merged: Loose = {};
  for (const key of Object.keys(defaults)) {
    merged[key] = key in raw ? raw[key] : defaults[key];
  }
  for (const key of STRUCT_FIELDS) {
    merged[key] = { ...(defaults[key] as Loose), ...(isRecord(raw[key]) ? raw[key] : {}) };
  }
  for (const key of ARRAY_FIELDS) {
    if (!Array.isArray(merged[key])) merged[key] = defaults[key];
  }
  const putting = merged.putting as Loose;
  if (!Array.isArray(putting.aces)) putting.aces = [];
  if (typeof putting.rounds !== 'number') putting.rounds = 0;
  if (typeof putting.best !== 'number') putting.best = null;
  const commissions = merged.commissions as Loose;
  if (typeof commissions.filled !== 'number') commissions.filled = 0;
  if (!Array.isArray(commissions.notes)) commissions.notes = [];
  if (merged.commission !== null && !isRecord(merged.commission)) merged.commission = null;
  for (const key of RECORD_FIELDS) {
    if (!isRecord(merged[key])) merged[key] = defaults[key];
  }
  if (typeof merged.coins !== 'number' || !Number.isFinite(merged.coins)) merged.coins = defaults.coins;
  if (typeof merged.compost !== 'number' || !Number.isFinite(merged.compost)) merged.compost = defaults.compost;
  const fromVersion = raw.version;
  // Only the lantern survives from the old tool set; the rest of the old
  // collecting/ecosystem state (journal, inventory, populations) belonged
  // to species that no longer exist and is simply left behind.
  const oldTools = merged.tools as Loose;
  merged.tools = { lantern: typeof oldTools.lantern === 'number' ? oldTools.lantern : 0 };
  merged.version = SAVE_VERSION;

  const state = merged as unknown as GameState;
  // Anything referring to a species this build doesn't know is dropped
  // rather than left to break rendering.
  for (const [id, p] of Object.entries(state.plants)) {
    if (!isRecord(p) || !PLANTS[p.defId as string] || !isRecord(p.location)) delete state.plants[id];
  }
  state.basket = state.basket.filter((b) => isRecord(b) && !!PLANTS[b.defId]);
  // Builds before v7 sold propagation trays; nursery beds replaced them.
  // Trays already bought become beds where they stand (keeping their ids, so
  // anything rooting in one stays put) and count toward the beds' price.
  if (fromVersion < 7) {
    let trays = 0;
    for (const f of state.furniture as unknown as Loose[]) {
      if (isRecord(f) && f.kind === 'propagationTray') {
        f.kind = 'nurseryBed';
        trays++;
      }
    }
    const stock = state.furnitureStock as Record<string, number>;
    if (typeof stock.propagationTray === 'number') {
      trays += stock.propagationTray;
      stock.nurseryBed = (stock.nurseryBed ?? 0) + stock.propagationTray;
    }
    delete stock.propagationTray;
    if (trays > 0) state.purchases.nurseryBed = (state.purchases.nurseryBed ?? 0) + trays;
    // Everything this player could already buy has been seen; only what's
    // new to the market (or unlocks later) gets the NEW tag.
    const owned = Array.isArray(state.owned) ? state.owned : [];
    state.seenShop = SHOP_ITEMS.filter((s) => !INTRODUCED_IN_V7.includes(s.id) && (!s.after || owned.includes(s.after) || owned.includes(s.id))).map((s) => s.id);
  }
  state.furniture = state.furniture.filter((f) => isRecord(f) && !!FURNITURE_DEFS[f.kind] && Number.isFinite(f.x) && Number.isFinite(f.y));
  if (!Number.isInteger(state.stall.x) || !Number.isInteger(state.stall.y)) state.stall = createNewGame().stall;
  state.gardenBeds = state.gardenBeds.filter((b) => isRecord(b) && [b.x, b.y, b.w, b.h].every(Number.isFinite));
  state.paths = state.paths.filter((p) => isRecord(p) && Array.isArray(p.points) && p.points.length >= 4);
  state.foxFinds = state.foxFinds.filter((f) => isRecord(f) && (f.kind === 'curiosity' || !!PLANTS[f.defId ?? '']));
  for (const p of Object.values(state.plants)) {
    const loc = p.location;
    if (loc.kind === 'wild' && loc.bedId && !state.gardenBeds.some((b) => b.id === loc.bedId)) delete loc.bedId;
  }
  // A fox caught mid-trail when the page closed has long since gone.
  if (['fleeing', 'lookingBack', 'vanishing'].includes(state.fox.behavior)) {
    state.fox.behavior = 'gone';
    state.fox.visible = false;
  }

  // Builds before the house was added: nothing may be left standing inside it.
  if (fromVersion < 6) {
    let i = 0;
    for (const p of Object.values(state.plants)) {
      if (p.location.kind === 'wild' && inHouse(p.location.x, p.location.y)) {
        p.location.x = HOUSE_FOOTPRINT.x + HOUSE_FOOTPRINT.w + 0.7 + (i % 3) * 0.9;
        p.location.y = HOUSE_DOOR.y + 1.8 + Math.floor(i / 3) * 0.9;
        i++;
      }
    }
    for (const d of state.decor) {
      if (inHouse(d.x, d.y)) {
        d.x = HOUSE_FOOTPRINT.x + HOUSE_FOOTPRINT.w + 0.7 + (i % 3) * 0.9;
        d.y = HOUSE_DOOR.y + 1.8 + Math.floor(i / 3) * 0.9;
        i++;
      }
    }
  }
  if (!(state.clock.lastRealTimestamp >= MIN_EPOCH_MS)) state.clock.lastRealTimestamp = Date.now();

  // Spot coordinates are data, not save state: re-seat a settled NPC on
  // its spot's current position in case the layout moved since the save.
  const scottSpot = state.scott.currentSpotId ? findScottSpot(state.scott.currentSpotId) : undefined;
  // A spot that's since been removed (he no longer naps outdoors): he gets
  // up and moves on at once instead of staying put somewhere that's gone.
  if (state.scott.currentSpotId && !scottSpot && state.scott.activity !== 'traveling') state.scott.nextChangeAt = state.clock.totalMinutes;
  const offset = (id: string) => fixtureOffset(state, id);
  if (scottSpot && state.scott.activity !== 'traveling') {
    const at = spotPosition(scottSpot, offset);
    state.scott.x = at.x;
    state.scott.y = at.y;
    state.scott.zone = scottSpot.zone;
  }
  const catSpot = state.cat.currentSpotId ? findCatSpot(state.cat.currentSpotId) : undefined;
  if (catSpot && state.cat.activity !== 'wandering') {
    const at = spotPosition(catSpot, offset);
    state.cat.x = at.x;
    state.cat.y = at.y;
  }
  return state;
}

export function loadGame(): GameState | null {
  for (const key of [SAVE_KEY, ...LEGACY_KEYS]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const state = migrateSave(JSON.parse(raw));
      if (state) return state;
    } catch (err) {
      console.warn(`Foxtail: couldn't read save "${key}".`, err);
    }
  }
  return null;
}

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Foxtail: failed to save game.', err);
  }
}

export function clearAllSaves(): void {
  for (const key of [SAVE_KEY, ...LEGACY_KEYS]) localStorage.removeItem(key);
}

export function resetGame(): GameState {
  clearAllSaves();
  return createNewGame();
}

export function loadOrCreate(): { state: GameState; isNew: boolean } {
  const loaded = loadGame();
  if (loaded) return { state: loaded, isNew: false };
  return { state: createNewGame(), isNew: true };
}
