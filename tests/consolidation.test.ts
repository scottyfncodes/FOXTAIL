import { describe, it, expect, vi } from 'vitest';
import { MINI_GAMES, RETIRED_MINI_GAMES, findMiniGame, isPlayableMiniGame, miniGameLabel } from '../src/game/systems/minigames';
import { createNewGame } from '../src/game/state';
import { migrateSave, saveGame, loadGame } from '../src/game/engine/SaveManager';
import { GARDEN_COURSE, GARDEN_TEE_SPOT, LIVING_ROOM_COURSE } from '../src/game/systems/puttingCourses';
import { generateObstacles, buildBlockingSet } from '../src/game/world/Obstacles';
import { isBlockedOutdoor } from '../src/game/world/Collision';
import { zoneAt, isWater, GREENHOUSE_FOOTPRINT, HOUSE_FOOTPRINT, rectContains } from '../src/game/data/worldMap';
import { DISCOVERY_SPOTS } from '../src/game/data/discoveryPoints';
import { SCOTT_SPOTS } from '../src/game/data/scottSpots';
import { puttingLabel } from '../src/game/engine/Game';

// Acorn Pitch, Twig Jenga and Slingshot Targets have been put away. What's
// left is putt-putt (two courses now), Cat Laser, Stick Fetch, and the
// three quieter games by the creek and in the meadow.

describe('the retired games', () => {
  it('are gone from the games you can find and play', () => {
    expect(RETIRED_MINI_GAMES).toEqual(['acornPitch', 'twigJenga', 'slingshot']);
    for (const id of RETIRED_MINI_GAMES) {
      expect(MINI_GAMES.some((g) => g.id === id)).toBe(false);
      expect(findMiniGame(id)).toBeUndefined();
      expect(isPlayableMiniGame(id)).toBe(false);
    }
    expect(MINI_GAMES.map((g) => g.id).sort()).toEqual(['catLaser', 'frogJump', 'gardenMaze', 'rockSkip', 'stickFetch']);
    for (const g of MINI_GAMES) expect(isPlayableMiniGame(g.id)).toBe(true);
  });

  it('leave no panels or simulations behind', () => {
    const sources = Object.keys(import.meta.glob('../src/**/*.ts')).map((f) => f.replace('../', ''));
    expect(sources).toContain('src/ui/minigames/StickFetchPanel.ts');
    for (const f of [
      'src/ui/minigames/AcornPitchPanel.ts',
      'src/ui/minigames/TwigJengaPanel.ts',
      'src/ui/minigames/SlingshotPanel.ts',
      'src/game/systems/minigames/acornPitch.ts',
      'src/game/systems/minigames/twigJenga.ts',
      'src/game/systems/minigames/slingshot.ts',
    ])
      expect(sources, f).not.toContain(f);
  });

  it('cannot be opened through a stale interaction', async () => {
    // Enough of a canvas for the game to be built on.
    const noop = () => {};
    const canvas = document.createElement('canvas');
    const ctx = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? canvas : k === 'getTransform' ? () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) : noop), set: () => true });
    vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    const { Game } = await import('../src/game/engine/Game');
    const game = new Game(canvas);
    const opened: string[] = [];
    game.onOpenMiniGame = (id) => opened.push(id);
    const putts: string[] = [];
    game.onOpenPutting = (c) => putts.push(c);
    for (const id of RETIRED_MINI_GAMES) {
      game.nearest = { kind: 'miniGame', id, x: 0, y: 0, label: '', available: true };
      game.interactWithNearest();
    }
    expect(opened).toEqual([]);
    game.nearest = { kind: 'miniGame', id: 'stickFetch', x: 0, y: 0, label: '', available: true };
    game.interactWithNearest();
    expect(opened).toEqual(['stickFetch']);
    // Both putting courses open from where they're found; anything else falls back to the mat.
    for (const id of ['livingRoom', 'garden', 'lr-putting']) {
      game.nearest = { kind: 'puttingMat', id, x: 0, y: 0, label: '', available: true };
      game.interactWithNearest();
    }
    expect(putts).toEqual(['livingRoom', 'garden', 'livingRoom']);
  });
});

describe('older saves', () => {
  it('keep a retired game’s record untouched, and load without a hitch', () => {
    const raw = JSON.parse(JSON.stringify(createNewGame())) as Record<string, unknown>;
    raw.coins = 412;
    raw.minigames = {
      acornPitch: { plays: 9, best: 16, goal: true },
      twigJenga: { plays: 3, best: 12, goal: false },
      slingshot: { plays: 1, best: 4, goal: false },
      stickFetch: { plays: 2, best: 88, goal: false },
    };
    const s = migrateSave(raw)!;
    expect(s).not.toBeNull();
    expect(s.coins).toBe(412);
    expect(s.minigames.acornPitch).toEqual({ plays: 9, best: 16, goal: true });
    expect(s.minigames.stickFetch).toEqual({ plays: 2, best: 88, goal: false });
    // Nothing that's still played reads them.
    for (const g of MINI_GAMES) expect(miniGameLabel(g, s.minigames[g.id]).length).toBeGreaterThan(0);
    saveGame(s);
    expect(loadGame()!.minigames.twigJenga).toEqual({ plays: 3, best: 12, goal: false });
  });

  it('keep the living-room putting record, and gain per-hole and per-course records cleanly', () => {
    const raw = JSON.parse(JSON.stringify(createNewGame())) as Record<string, unknown>;
    raw.putting = { rounds: 7, best: 29, holes: 12, course: LIVING_ROOM_COURSE.recordId, aces: ['hallway', 'mug'] };
    const s = migrateSave(raw)!;
    expect(s.putting).toEqual({ rounds: 7, best: 29, holes: 12, course: LIVING_ROOM_COURSE.recordId, aces: ['hallway', 'mug'] });
    expect(puttingLabel(s.putting, LIVING_ROOM_COURSE, 'Play putt-putt')).toContain('best 29');
    expect(puttingLabel(s.putting, GARDEN_COURSE, 'Play the garden course')).toContain('a hole in one is worth');
  });

  it('tidy up damaged per-hole and per-course putting records', () => {
    const raw = JSON.parse(JSON.stringify(createNewGame())) as Record<string, unknown>;
    raw.putting = { rounds: 1, best: 30, aces: [], holeBests: { hallway: 2, mug: 'x', 'g-moss': -1, 'g-root': 1 }, courses: { 'garden-9': { rounds: 'two', best: 25 }, junk: 4 } };
    const s = migrateSave(raw)!;
    expect(s.putting.holeBests).toEqual({ hallway: 2, 'g-root': 1 });
    expect(s.putting.courses).toEqual({ 'garden-9': { rounds: 0, best: 25 } });
    raw.putting = { rounds: 1, best: 30, aces: [], holeBests: 'nonsense', courses: [1, 2] };
    const t = migrateSave(raw)!;
    expect(t.putting.holeBests).toEqual({});
    expect(t.putting.courses).toEqual({});
  });
});

describe('the garden course’s first tee', () => {
  it('stands on open ground at the woodland’s edge, clear of everything else', () => {
    const blocking = buildBlockingSet(generateObstacles());
    const g = GARDEN_TEE_SPOT;
    expect(zoneAt(g.x, g.y)).toBe(g.zone);
    expect(isWater(Math.floor(g.x), Math.floor(g.y))).toBe(false);
    expect(isBlockedOutdoor(g.x, g.y, blocking)).toBe(false);
    expect(rectContains(GREENHOUSE_FOOTPRINT, g.x, g.y) || rectContains(HOUSE_FOOTPRINT, g.x, g.y)).toBe(false);
    for (const s of DISCOVERY_SPOTS) expect(Math.hypot(s.x + 0.5 - g.x, s.y + 0.5 - g.y)).toBeGreaterThan(2);
    for (const s of SCOTT_SPOTS) if (s.zone !== 'greenhouse') expect(Math.hypot(s.x - g.x, s.y - g.y)).toBeGreaterThan(1.4);
    for (const m of MINI_GAMES) if (m.where !== 'ranger') expect(Math.hypot(m.where.x - g.x, m.where.y - g.y)).toBeGreaterThan(3);
  });
});
