import { describe, it, expect, beforeEach } from 'vitest';
import { MINI_GAMES, MINI_GAME_REWARD, findMiniGame, miniGameLabel, recordMiniGame } from '../src/game/systems/minigames';
import { ACE_REWARD } from '../src/game/systems/putting';
import { createNewGame, type MiniGameRecord } from '../src/game/state';
import { migrateSave, saveGame, loadGame } from '../src/game/engine/SaveManager';
import { generateObstacles, buildBlockingSet } from '../src/game/world/Obstacles';
import { isBlockedOutdoor } from '../src/game/world/Collision';
import { zoneAt, isWater, GREENHOUSE_FOOTPRINT, HOUSE_FOOTPRINT, rectContains } from '../src/game/data/worldMap';
import { DISCOVERY_SPOTS } from '../src/game/data/discoveryPoints';
import { SCOTT_SPOTS } from '../src/game/data/scottSpots';
import { pickInteractable, INTERACT_PRIORITY } from '../src/game/engine/Game';

describe('the little games around the property', () => {
  it('has eight of them, each with its own id, name and a goal worth reaching', () => {
    expect(MINI_GAMES).toHaveLength(8);
    expect(new Set(MINI_GAMES.map((g) => g.id)).size).toBe(8);
    for (const g of MINI_GAMES) {
      expect(g.name.length).toBeGreaterThan(0);
      expect(g.goal).toBeGreaterThan(0);
      expect(findMiniGame(g.id)).toBe(g);
    }
  });

  it('sets each one up on open ground in its own part of the property, clear of everything else', () => {
    const blocking = buildBlockingSet(generateObstacles());
    const outdoor = MINI_GAMES.flatMap((g) => (g.where === 'ranger' ? [] : [{ id: g.id, ...g.where }]));
    expect(outdoor).toHaveLength(7);
    for (const g of outdoor) {
      expect(zoneAt(g.x, g.y)).toBe(g.zone);
      expect(isWater(Math.floor(g.x), Math.floor(g.y))).toBe(false);
      expect(isBlockedOutdoor(g.x, g.y, blocking)).toBe(false);
      expect(rectContains(GREENHOUSE_FOOTPRINT, g.x, g.y) || rectContains(HOUSE_FOOTPRINT, g.x, g.y)).toBe(false);
      // Not on top of a cutting patch, or where Scott stands to do his own things.
      for (const s of DISCOVERY_SPOTS) expect(Math.hypot(s.x + 0.5 - g.x, s.y + 0.5 - g.y)).toBeGreaterThan(2);
      for (const s of SCOTT_SPOTS) if (s.zone !== 'greenhouse') expect(Math.hypot(s.x - g.x, s.y - g.y)).toBeGreaterThan(1.4);
      // …and far enough from each other that only one is ever in reach.
      for (const o of outdoor) if (o.id !== g.id) expect(Math.hypot(o.x - g.x, o.y - g.y)).toBeGreaterThan(3);
    }
  });

  it('keeps the laser pointer for Ranger, wherever he is', () => {
    expect(findMiniGame('catLaser')!.where).toBe('ranger');
  });

  it('never outranks a door, the stall, a bed or a fox find', () => {
    for (const k of ['greenhouseDoor', 'houseDoor', 'market', 'bed', 'display', 'puttingMat', 'foxFind'] as const) {
      expect(INTERACT_PRIORITY.miniGame).toBeGreaterThan(INTERACT_PRIORITY[k]);
      expect(pickInteractable([{ kind: 'miniGame' as const, dist: 0.1 }, { kind: k, dist: 1.2 }])?.kind).toBe(k);
    }
  });
});

describe('a little game’s record', () => {
  let records: Record<string, MiniGameRecord>;
  beforeEach(() => {
    records = {};
  });

  it('notes the first game as the best, without calling it a new best', () => {
    const r = recordMiniGame(records, 'rockSkip', 7);
    expect(r).toEqual({ best: false, first: true, coins: 0 });
    expect(records.rockSkip).toEqual({ plays: 1, best: 7, goal: false });
  });

  it('keeps the best and counts every game', () => {
    recordMiniGame(records, 'rockSkip', 7);
    expect(recordMiniGame(records, 'rockSkip', 5).best).toBe(false);
    expect(recordMiniGame(records, 'rockSkip', 9).best).toBe(true);
    expect(records.rockSkip).toMatchObject({ plays: 3, best: 9 });
  });

  it('pays once, the first time the goal is reached — the same as a first hole in one', () => {
    expect(MINI_GAME_REWARD).toBe(ACE_REWARD);
    const goal = findMiniGame('acornPitch')!.goal;
    expect(recordMiniGame(records, 'acornPitch', goal - 1).coins).toBe(0);
    expect(recordMiniGame(records, 'acornPitch', goal).coins).toBe(MINI_GAME_REWARD);
    expect(recordMiniGame(records, 'acornPitch', goal + 5).coins).toBe(0);
    expect(records.acornPitch.goal).toBe(true);
  });

  it('keeps each game to itself, and scores whole and never below nothing', () => {
    recordMiniGame(records, 'frogJump', -4);
    recordMiniGame(records, 'twigJenga', 3.6);
    expect(records.frogJump.best).toBe(0);
    expect(records.twigJenga.best).toBe(4);
    expect(records.rockSkip).toBeUndefined();
  });

  it('says what the goal pays until it has, then just the best', () => {
    const g = findMiniGame('stickFetch')!;
    expect(miniGameLabel(g, undefined)).toContain(`${MINI_GAME_REWARD} coins`);
    recordMiniGame(records, 'stickFetch', 40);
    expect(miniGameLabel(g, records.stickFetch)).toContain('best 40 points');
    recordMiniGame(records, 'stickFetch', g.goal);
    expect(miniGameLabel(g, records.stickFetch)).not.toContain('pays');
  });
});

describe('saving the little games', () => {
  beforeEach(() => localStorage.clear());

  it('starts a new game with no records', () => {
    expect(createNewGame().minigames).toEqual({});
  });

  it('round-trips records with the rest of the save', () => {
    const s = createNewGame();
    recordMiniGame(s.minigames, 'gardenMaze', 180);
    saveGame(s);
    expect(loadGame()!.minigames.gardenMaze).toEqual({ plays: 1, best: 180, goal: false });
  });

  it('gives an older save, from before the games, an empty record — everything else untouched', () => {
    const old = createNewGame() as unknown as Record<string, unknown>;
    delete old.minigames;
    old.coins = 77;
    const s = migrateSave(JSON.parse(JSON.stringify(old)))!;
    expect(s.minigames).toEqual({});
    expect(s.coins).toBe(77);
    expect(s.putting).toEqual({ rounds: 0, best: null, aces: [] });
  });

  it('tidies up a damaged record instead of trusting it', () => {
    const raw = JSON.parse(JSON.stringify(createNewGame())) as Record<string, unknown>;
    raw.minigames = { rockSkip: { plays: 'x', best: 12, goal: 1 }, frogJump: 'nonsense' };
    const s = migrateSave(raw)!;
    expect(s.minigames.rockSkip).toEqual({ plays: 0, best: 12, goal: false });
    expect(s.minigames.frogJump).toBeUndefined();
  });
});
