import { describe, it, expect, beforeEach } from 'vitest';
import { createNewGame, SAVE_KEY, SAVE_VERSION } from '../src/game/state';
import { loadGame, saveGame, loadOrCreate, resetGame, migrateSave, clearAllSaves } from '../src/game/engine/SaveManager';
import { findScottSpot } from '../src/game/data/scottSpots';
import { addToBasket } from '../src/game/systems/basket';
import { HOUSE_FOOTPRINT } from '../src/game/data/worldMap';

describe('save/load persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when there is no save yet', () => {
    expect(loadGame()).toBeNull();
  });

  it('round-trips a saved game exactly (basket, plants in every location, collection, money, clock)', () => {
    const state = createNewGame();
    addToBasket(state, { defId: 'pothos', variantId: 'neon', seed: 1, growth: 0, generation: 0, origin: 'wild', collectedAt: 0 });
    const base = { seed: 3, plantedAt: 0, lastCuttingAt: null, generation: 1, bornWild: false };
    state.plants.a = { ...base, id: 'a', defId: 'monstera', variantId: 'albo', growth: 900, location: { kind: 'display', slotId: 'stand1', potId: 'copper' } };
    state.plants.b = { ...base, id: 'b', defId: 'bostonFern', variantId: 'standard', growth: 4000, location: { kind: 'wild', x: 55.2, y: 14.1, zone: 'dampForest' } };
    state.plants.c = { ...base, id: 'c', defId: 'pothos', variantId: 'golden', growth: 10, location: { kind: 'nursery', bedId: 'bed1' } };
    state.collection.monstera = { foundAt: 0, variants: ['deliciosa', 'albo'], grown: 2, propagated: 3, sold: 1, earned: 400, plantedOut: 0, displayed: 1 };
    state.coins = 321;
    state.owned.push('growLights');
    state.tools.lantern = 1;
    state.clock.totalMinutes = 1234;

    saveGame(state);
    const loaded = loadGame();

    expect(loaded).not.toBeNull();
    expect(loaded!.basket[0].variantId).toBe('neon');
    expect(loaded!.plants.a.location).toEqual({ kind: 'display', slotId: 'stand1', potId: 'copper' });
    expect(loaded!.plants.b.location).toEqual({ kind: 'wild', x: 55.2, y: 14.1, zone: 'dampForest' });
    expect(loaded!.plants.c.growth).toBe(10);
    expect(loaded!.collection.monstera.variants).toEqual(['deliciosa', 'albo']);
    expect(loaded!.coins).toBe(321);
    expect(loaded!.owned).toContain('growLights');
    expect(loaded!.tools.lantern).toBe(1);
    expect(loaded!.clock.totalMinutes).toBe(1234);
  });

  it('drops anything referring to a species this build does not know, instead of breaking', () => {
    const state = createNewGame();
    state.plants.x = { id: 'x', defId: 'noSuchPlant', variantId: 'v', seed: 1, growth: 0, location: { kind: 'nursery', bedId: 'bed1' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false };
    state.basket.push({ uid: 'u', defId: 'bluebell', variantId: 'v', seed: 1, growth: 0, generation: 0, origin: 'wild', collectedAt: 0 });
    const migrated = migrateSave(JSON.parse(JSON.stringify(state)))!;
    expect(migrated.plants.x).toBeUndefined();
    expect(migrated.basket).toHaveLength(0);
  });

  it('loadOrCreate reports isNew correctly for fresh vs. existing saves', () => {
    const fresh = loadOrCreate();
    expect(fresh.isNew).toBe(true);
    saveGame(fresh.state);
    const existing = loadOrCreate();
    expect(existing.isNew).toBe(false);
  });

  it('resetGame clears the save and returns a brand-new game state', () => {
    const state = createNewGame();
    addToBasket(state, { defId: 'pothos', variantId: 'golden', seed: 1, growth: 0, generation: 0, origin: 'wild', collectedAt: 0 });
    saveGame(state);
    const reset = resetGame();
    expect(reset.basket.length).toBe(0);
    expect(loadGame()).toBeNull();
  });

  it('never loads a save written by a newer build', () => {
    const future = { ...createNewGame(), version: SAVE_VERSION + 1 };
    localStorage.setItem(SAVE_KEY, JSON.stringify(future));
    expect(loadGame()).toBeNull();
  });

  it('ignores stored data that is not a recognizable save', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1 }));
    localStorage.setItem('foxtrot-save-v1', 'not json');
    expect(loadGame()).toBeNull();
  });
});

describe('save migration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function legacyV3Save() {
    const s = createNewGame() as unknown as Record<string, unknown>;
    // v3 had the husband NPC under a different key and no cat at all.
    const { scott, cat: _cat, ...rest } = s;
    return { ...rest, version: 3, theo: scott };
  }

  it("recovers an older build's save from its legacy key, keeping the world and its lantern", () => {
    const old = legacyV3Save() as ReturnType<typeof legacyV3Save> & Record<string, unknown>;
    // The old wildflower-and-ecosystem game's data: species that no longer exist.
    old.journal = { bluebell: { specimenId: 'bluebell', kind: 'plant', level: 'CULTIVATED' } };
    old.inventory = [{ uid: 'x', defId: 'bluebell', kind: 'plant', count: 1 }];
    old.tools = { basket: 2, shears: 1, lantern: 1 };
    (old.clock as { totalMinutes: number }).totalMinutes = 7777;
    localStorage.setItem('foxtrot-save-v3', JSON.stringify(old));

    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(SAVE_VERSION);
    expect(loaded!.clock.totalMinutes).toBe(7777);
    expect(loaded!.tools).toEqual({ lantern: 1 });
    expect(loaded!.basket).toEqual([]);
    expect(loaded!.coins).toBeGreaterThan(0);
    expect('journal' in (loaded as unknown as Record<string, unknown>)).toBe(false);
    expect(loaded!.cat.currentSpotId).toBeTruthy();
    expect(loaded!.scott.activity).toBeTruthy();
    expect('theo' in (loaded as unknown as Record<string, unknown>)).toBe(false);
  });

  it('prefers the current save over any legacy one', () => {
    const current = createNewGame();
    current.clock.totalMinutes = 5000;
    saveGame(current);
    localStorage.setItem('foxtrot-save-v3', JSON.stringify(legacyV3Save()));
    expect(loadGame()!.clock.totalMinutes).toBe(5000);
  });

  it('fills fields added to a record after the save was written', () => {
    const s = createNewGame() as unknown as { scout: Record<string, unknown> };
    delete s.scout.nextEventAt;
    expect(migrateSave(s)!.scout.nextEventAt).toBeTypeOf('number');
  });

  it('replaces a page-relative timestamp from older builds with wall-clock time', () => {
    const s = createNewGame();
    s.clock.lastRealTimestamp = 8714.8; // what older builds stored: performance.now()
    const migrated = migrateSave(s)!;
    expect(migrated.clock.lastRealTimestamp).toBeGreaterThan(1_000_000_000_000);
  });

  it("re-seats a settled NPC on its spot's current coordinates", () => {
    const s = createNewGame();
    s.scott.currentSpotId = 'greenhouse-tinker';
    s.scott.activity = 'tinkering';
    s.scott.x = 5;
    s.scott.y = 7;
    const migrated = migrateSave(s)!;
    const spot = findScottSpot('greenhouse-tinker')!;
    expect([migrated.scott.x, migrated.scott.y]).toEqual([spot.x, spot.y]);
  });

  it('starting a new game clears legacy saves too, so none resurface', () => {
    localStorage.setItem('foxtrot-save-v3', JSON.stringify(legacyV3Save()));
    saveGame(createNewGame());
    clearAllSaves();
    expect(loadGame()).toBeNull();
  });
});

describe('the world the player made persists', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips furniture positions, beds, paths, cleared scrub, fox history and curiosities', () => {
    const state = createNewGame();
    state.furniture.push({ id: 'bed1', kind: 'nurseryBed', x: 6.25, y: 6.5, rot: 1 });
    state.seededFixtures.push('bed1');
    state.furniture.push({ id: 'lamp', kind: 'growLamp', x: 12.125, y: 8.375 });
    state.gardenBeds.push({ id: 'gb', x: 50, y: 20, w: 3.5, h: 2.25, shape: 'oval', createdAt: 10 });
    state.paths.push({ id: 'pa', points: [50, 30, 51.5, 30.2, 53, 30.9], width: 1.15, createdAt: 20 });
    state.clearedObstacles.push('51,30');
    state.plants.w = { id: 'w', defId: 'pothos', variantId: 'golden', seed: 1, growth: 700, location: { kind: 'wild', x: 51.35, y: 21.05, zone: 'meadow', bedId: 'gb' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false };
    state.foxLog.trailsFollowed = 3;
    state.foxFinds.push({ id: 'f', kind: 'curiosity', x: 20, y: 20, zone: 'woodland', seed: 1, curiosityId: 'lunaMoth', createdAt: 0, expiresAt: 9999 });
    state.curiosities.treeFrog = { foundAt: 5, count: 2 };
    saveGame(state);
    const loaded = loadGame()!;
    expect(loaded.furniture).toEqual(state.furniture);
    expect(loaded.seededFixtures).toEqual(['bed1']);
    expect(loaded.gardenBeds).toEqual(state.gardenBeds);
    expect(loaded.paths).toEqual(state.paths);
    expect(loaded.clearedObstacles).toEqual(['51,30']);
    expect(loaded.plants.w.location).toEqual({ kind: 'wild', x: 51.35, y: 21.05, zone: 'meadow', bedId: 'gb' });
    expect(loaded.foxLog.trailsFollowed).toBe(3);
    expect(loaded.foxFinds).toHaveLength(1);
    expect(loaded.curiosities.treeFrog.count).toBe(2);
  });

  it('upgrades a save from before the house: new fields filled, and nothing left standing inside the house', () => {
    const old = createNewGame() as unknown as Record<string, unknown>;
    for (const k of ['seededFixtures', 'compost', 'gardenBeds', 'paths', 'clearedObstacles', 'foxFinds', 'foxLog', 'curiosities']) delete old[k];
    old.version = 5;
    (old.plants as Record<string, unknown>).inHouse = { id: 'inHouse', defId: 'pothos', variantId: 'golden', seed: 1, growth: 5, location: { kind: 'wild', x: 72.2, y: 35.1, zone: 'meadow' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false };
    (old.furniture as unknown[]).push({ id: 'old', kind: 'plantStand', x: 3, y: 6 });
    const migrated = migrateSave(JSON.parse(JSON.stringify(old)))!;
    expect(migrated.version).toBe(SAVE_VERSION);
    expect((migrated as unknown as Record<string, unknown>).compost).toBeUndefined();
    expect(migrated.gardenBeds).toEqual([]);
    expect(migrated.foxLog.trailsStarted).toBe(0);
    expect(migrated.furniture[0]).toMatchObject({ x: 3, y: 6 });
    const loc = migrated.plants.inHouse.location as { x: number; y: number };
    const inside = loc.x >= HOUSE_FOOTPRINT.x && loc.x < HOUSE_FOOTPRINT.x + HOUSE_FOOTPRINT.w && loc.y >= HOUSE_FOOTPRINT.y && loc.y < HOUSE_FOOTPRINT.y + HOUSE_FOOTPRINT.h + 1;
    expect(inside).toBe(false);
  });

  it('drops a plant’s link to a bed that no longer exists, and forgets a half-run fox trail', () => {
    const s = createNewGame();
    s.plants.w = { id: 'w', defId: 'pothos', variantId: 'golden', seed: 1, growth: 5, location: { kind: 'wild', x: 50, y: 20, zone: 'meadow', bedId: 'gone' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false };
    s.fox.behavior = 'fleeing';
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect((m.plants.w.location as { bedId?: string }).bedId).toBeUndefined();
    expect(m.fox.behavior).toBe('gone');
  });
});

describe('the market stall’s place', () => {
  it('is where the layout puts it in a save from before it could move, and survives a round trip once moved', () => {
    const old = createNewGame() as unknown as Record<string, unknown>;
    delete old.stall;
    expect(migrateSave(old)!.stall).toEqual({ x: 69, y: 42 });
    const state = createNewGame();
    state.stall = { x: 75, y: 47 };
    saveGame(state);
    expect(loadGame()!.stall).toEqual({ x: 75, y: 47 });
  });
});
