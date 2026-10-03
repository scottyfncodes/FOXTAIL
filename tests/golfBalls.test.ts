import { CURIOSITIES } from '../src/game/data/curiosities';
import { describe, it, expect, beforeEach } from 'vitest';
import { createNewGame, SAVE_KEY, type GameState } from '../src/game/state';
import { GOLF_BALLS, GOLF_BALL_RARITIES, GOLF_BALL_CURIOSITY, GOLF_BALL_TIER_WEIGHT, findGolfBall } from '../src/game/data/golfBalls';
import { golfBallTotals, golfBallDisplayName, golfCollectionComplete, hasGolfBall, markGolfBallsSeen, pickGolfBall, recordGolfBall } from '../src/game/systems/golfBalls';
import { collectFoxFind, pickCuriosity } from '../src/game/systems/foxFinds';
import { loadGame, migrateSave, saveGame } from '../src/game/engine/SaveManager';
import { mulberry32 } from '../src/game/engine/Random';
import { drawGolfBall } from '../src/game/world/GolfBallArt';
import { golfRailBalls, golfRailSlots } from '../src/game/world/KeepsakeArt';
import { JournalPanel } from '../src/ui/JournalPanel';
import { KEEPSAKES } from '../src/game/data/keepsakes';
import type { Game } from '../src/game/engine/Game';

/** A canvas context that accepts any drawing call, so the art can be exercised without a real canvas. */
function fakeCtx(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} };
  return new Proxy({} as Record<string, unknown>, {
    get: (t, k) => (k in t ? t[k as string] : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => gradient : () => {}),
    set: (t, k, v) => ((t[k as string] = v), true),
  }) as unknown as CanvasRenderingContext2D;
}

function leaveGolfBall(state: GameState, id = 'g'): void {
  state.foxFinds.push({ id, kind: 'curiosity', x: 20, y: 20, zone: 'meadow', seed: 1, curiosityId: GOLF_BALL_CURIOSITY, createdAt: 0, expiresAt: 9999 });
}

/** A rand that lands on the given ball (weights are positive, so a midpoint of its band always does). */
function randFor(state: GameState, id: string): () => number {
  for (let i = 0; i < 2000; i++) {
    const r = (i + 0.5) / 2000;
    if (pickGolfBall(state, () => r).id === id) return () => r;
  }
  throw new Error(`no roll lands on ${id}`);
}

describe('golf ball definitions', () => {
  it('has the fifteen initial kinds, every one with an id, name, rarity, description and look', () => {
    expect(GOLF_BALLS).toHaveLength(15);
    expect(new Set(GOLF_BALLS.map((b) => b.id)).size).toBe(GOLF_BALLS.length);
    for (const b of GOLF_BALLS) {
      expect(b.name).toBeTruthy();
      expect(b.description).toBeTruthy();
      expect(GOLF_BALL_RARITIES).toContain(b.rarity);
      expect(b.look.base).toMatch(/^#[0-9a-f]{6}$/i);
      // Every kind can be drawn, found or not.
      expect(() => drawGolfBall(fakeCtx(), 10, 10, 8, b.look, { detail: true })).not.toThrow();
      expect(() => drawGolfBall(fakeCtx(), 10, 10, 8, b.look, { silhouette: true })).not.toThrow();
    }
    const by = (r: string) => GOLF_BALLS.filter((b) => b.rarity === r).map((b) => b.name);
    expect(by('common')).toEqual(['Old White', 'Scuffed White', 'Yellow Ball', 'Range Ball']);
    expect(by('uncommon')).toEqual(['Pink Ball', 'Orange Ball', 'Stripe Ball', 'Logo Ball']);
    expect(by('rare')).toEqual(['Vintage Ball', 'Tournament Ball', 'Glitter Ball', 'Numbered Ball']);
    expect(by('veryRare')).toEqual(['Golden Ball', 'Fox Ball']);
    expect(GOLF_BALLS.filter((b) => b.rarity === 'legendary').map((b) => b.hidden?.name)).toEqual(['Mystery Ball']);
  });

  it('counts the total from the definitions: 0 / 15 on a new game', () => {
    expect(golfBallTotals(createNewGame())).toEqual({ found: 0, total: GOLF_BALLS.length, balls: 0 });
  });
});

describe('finding golf balls', () => {
  it('counts a first find of a kind toward the collection, and a duplicate only toward its quantity', () => {
    const state = createNewGame();
    expect(recordGolfBall(state, 'goldenBall', 10)).toMatchObject({ isNew: true, count: 1 });
    expect(golfBallTotals(state)).toMatchObject({ found: 1, balls: 1 });
    expect(recordGolfBall(state, 'goldenBall', 20)).toMatchObject({ isNew: false, count: 2 });
    expect(recordGolfBall(state, 'goldenBall', 30)).toMatchObject({ isNew: false, count: 3 });
    expect(golfBallTotals(state)).toMatchObject({ found: 1, balls: 3 });
    expect(state.golfBalls.goldenBall.foundAt).toBe(10);
    recordGolfBall(state, 'pinkBall', 40);
    expect(golfBallTotals(state)).toMatchObject({ found: 2, balls: 4 });
    expect(recordGolfBall(state, 'noSuchBall', 50)).toBeNull();
  });

  it('turns each lost golf ball picked up into a kind of golf ball', () => {
    const state = createNewGame();
    leaveGolfBall(state, 'a');
    const first = collectFoxFind(state, 'a', 5, randFor(state, 'foxBall'));
    expect(first.ok).toBe(true);
    expect(first.newCuriosity).toBe(true);
    expect(first.golfBall).toMatchObject({ isNew: true, count: 1 });
    expect(first.golfBall!.ball.id).toBe('foxBall');
    leaveGolfBall(state, 'b');
    const again = collectFoxFind(state, 'b', 6, randFor(state, 'foxBall'));
    expect(again.newCuriosity).toBe(false);
    expect(again.golfBall).toMatchObject({ isNew: false, count: 2 });
    expect(state.curiosities[GOLF_BALL_CURIOSITY].count).toBe(2);
    expect(golfBallTotals(state)).toMatchObject({ found: 1, balls: 2 });
  });

  it('leaves the other curiosities alone', () => {
    const state = createNewGame();
    state.foxFinds.push({ id: 'h', kind: 'curiosity', x: 20, y: 20, zone: 'meadow', seed: 1, curiosityId: 'hedgehog', createdAt: 0, expiresAt: 9999 });
    expect(collectFoxFind(state, 'h', 1).golfBall).toBeUndefined();
    expect(state.golfBalls).toEqual({});
  });

  it('marks a new kind NEW until the journal page has been seen, and a duplicate does not bring the tag back', () => {
    const state = createNewGame();
    recordGolfBall(state, 'yellowBall', 1);
    expect(state.golfBalls.yellowBall.fresh).toBe(true);
    markGolfBallsSeen(state);
    expect(state.golfBalls.yellowBall.fresh).toBeUndefined();
    recordGolfBall(state, 'yellowBall', 2);
    expect(state.golfBalls.yellowBall.fresh).toBeUndefined();
  });

  it('weights the kinds by rarity tier, close to 60 / 25 / 10 / 4 / 1', () => {
    // Every kind already found, so the boost for unfound ones is out of the picture.
    const state = createNewGame();
    for (const b of GOLF_BALLS) recordGolfBall(state, b.id, 0);
    const rand = mulberry32(42);
    const tally: Record<string, number> = {};
    const n = 40000;
    for (let i = 0; i < n; i++) {
      const r = pickGolfBall(state, rand).rarity;
      tally[r] = (tally[r] ?? 0) + 1;
    }
    const sum = Object.values(GOLF_BALL_TIER_WEIGHT).reduce((a, b) => a + b, 0);
    for (const r of GOLF_BALL_RARITIES) expect(tally[r] / n).toBeCloseTo(GOLF_BALL_TIER_WEIGHT[r] / sum, 1);
    expect(tally.legendary).toBeGreaterThan(0);
  });

  it('favours kinds not yet found, so a Legendary turns up after a long while rather than never', () => {
    const rand = mulberry32(7);
    const finds: number[] = [];
    for (let run = 0; run < 300; run++) {
      const state = createNewGame();
      let n = 0;
      while (!golfCollectionComplete(state) && n < 5000) {
        n++;
        recordGolfBall(state, pickGolfBall(state, rand).id, 0);
      }
      finds.push(n);
    }
    finds.sort((a, b) => a - b);
    const median = finds[finds.length >> 1];
    // Neither handed out nor out of reach: dozens of balls, not a handful or thousands.
    expect(median).toBeGreaterThan(20);
    expect(median).toBeLessThan(90);
  });

  it('makes a lost golf ball a rare find, before and after you start collecting', () => {
    const state = createNewGame();
    const share = (zone: 'meadow' | 'rockyClearing') => {
      const rand = mulberry32(3);
      let hits = 0;
      for (let i = 0; i < 8000; i++) if (pickCuriosity(state, zone, { night: false, rain: false }, rand)?.id === GOLF_BALL_CURIOSITY) hits++;
      return hits / 8000;
    };
    // A new valley: a handful in a hundred finds, not most of them.
    expect(share('meadow')).toBeLessThan(0.06);
    expect(share('rockyClearing')).toBeLessThan(0.13);
    expect(share('meadow')).toBeGreaterThan(0.01);
    // Having found one makes it no more (or less) likely.
    const before = share('meadow');
    state.curiosities[GOLF_BALL_CURIOSITY] = { foundAt: 0, count: 1 };
    recordGolfBall(state, 'oldWhite', 0);
    expect(share('meadow')).toBeCloseTo(before, 2);
    // Even once everything else has been noted, it stays the odd one.
    for (const c of CURIOSITIES) state.curiosities[c.id] ??= { foundAt: 0, count: 1 };
    expect(share('meadow')).toBeLessThan(0.1);
    expect(share('rockyClearing')).toBeLessThan(0.22);
  });
});

describe('the Mystery Ball', () => {
  it('stays a Mystery Ball until it is found, then shows its real name', () => {
    const state = createNewGame();
    const mystery = GOLF_BALLS.find((b) => b.hidden)!;
    expect(golfBallDisplayName(state, mystery)).toBe('Mystery Ball');
    recordGolfBall(state, mystery.id, 1);
    expect(golfBallDisplayName(state, mystery)).toBe(mystery.name);
    expect(mystery.name).not.toBe('Mystery Ball');
  });
});

describe('golf balls in the save', () => {
  beforeEach(() => localStorage.clear());

  it('survives a save and a reload (and so a page refresh), kinds and quantities both', () => {
    const state = createNewGame();
    recordGolfBall(state, 'oldWhite', 1);
    recordGolfBall(state, 'oldWhite', 2);
    recordGolfBall(state, 'mysteryBall', 3);
    saveGame(state);
    const loaded = loadGame()!;
    expect(loaded.golfBalls.oldWhite.count).toBe(2);
    expect(hasGolfBall(loaded, 'mysteryBall')).toBe(true);
    expect(golfBallTotals(loaded)).toMatchObject({ found: 2, balls: 3 });
  });

  it('loads an older save with no golf balls in it', () => {
    const old = createNewGame() as unknown as Record<string, unknown>;
    delete old.golfBalls;
    old.version = 12;
    localStorage.setItem(SAVE_KEY, JSON.stringify(old));
    const loaded = loadGame()!;
    expect(loaded).not.toBeNull();
    expect(loaded.golfBalls).toEqual({});
    expect(golfBallTotals(loaded).found).toBe(0);
  });

  it('counts the lost golf balls an older save had already found as Scuffed Whites, so nothing is lost', () => {
    const old = createNewGame() as unknown as Record<string, unknown>;
    delete old.golfBalls;
    old.version = 12;
    old.curiosities = { lostGolfBall: { foundAt: 500, count: 3 }, hedgehog: { foundAt: 9, count: 1 } };
    const migrated = migrateSave(JSON.parse(JSON.stringify(old)))!;
    expect(migrated.golfBalls).toEqual({ scuffedWhite: { foundAt: 500, count: 3 } });
    expect(migrated.curiosities.lostGolfBall).toEqual({ foundAt: 500, count: 3 });
    // And it isn't done again on the next load.
    recordGolfBall(migrated, 'pinkBall', 600);
    const again = migrateSave(JSON.parse(JSON.stringify(migrated)))!;
    expect(again.golfBalls.scuffedWhite.count).toBe(3);
    expect(again.golfBalls.pinkBall.count).toBe(1);
  });

  it('drops malformed or unknown golf ball records instead of breaking', () => {
    const state = createNewGame() as unknown as Record<string, unknown>;
    state.golfBalls = { oldWhite: { foundAt: 1, count: 2 }, noSuchBall: { foundAt: 1, count: 1 }, pinkBall: 'yes', yellowBall: { count: 0 }, rangeBall: { count: 1.7 } };
    const migrated = migrateSave(JSON.parse(JSON.stringify(state)))!;
    expect(Object.keys(migrated.golfBalls).sort()).toEqual(['oldWhite', 'rangeBall']);
    expect(migrated.golfBalls.rangeBall.count).toBe(1);
    const bad = { ...createNewGame(), golfBalls: 'nope' };
    expect(migrateSave(JSON.parse(JSON.stringify(bad)))!.golfBalls).toEqual({});
  });
});

describe('the golf ball rail by the putting mat', () => {
  it('has a hollow for every kind and holds one of each kind found', () => {
    const state = createNewGame();
    expect(golfRailSlots(0, 100)).toHaveLength(GOLF_BALLS.length);
    expect(golfRailBalls(state).every((b) => b === null)).toBe(true);
    recordGolfBall(state, 'goldenBall', 1);
    recordGolfBall(state, 'goldenBall', 2);
    recordGolfBall(state, 'oldWhite', 3);
    const rail = golfRailBalls(state);
    expect(rail.filter(Boolean).map((b) => b!.id)).toEqual(['oldWhite', 'goldenBall']);
    expect(rail[GOLF_BALLS.findIndex((b) => b.id === 'goldenBall')]).toBe(findGolfBall('goldenBall'));
  });

  it('is where the lost golf ball keepsake lives', () => {
    expect(KEEPSAKES.find((k) => k.curiosityId === GOLF_BALL_CURIOSITY)?.place).toEqual({ kind: 'puttingMat' });
  });

  it('leaves the putt-putt record alone: finding balls is not playing, and playing does not spend them', () => {
    const state = createNewGame();
    leaveGolfBall(state);
    collectFoxFind(state, 'g', 1);
    expect(state.putting).toEqual(createNewGame().putting);
    expect(golfBallTotals(state).balls).toBe(1);
  });
});

describe('the Golf Balls page of the field journal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  function open(state: GameState) {
    const journal = new JournalPanel({ state } as unknown as Game);
    journal.open('golf');
    return journal;
  }

  it('is not offered until a golf ball has been found', () => {
    const journal = open(createNewGame());
    const tab = Array.from(journal.panel.tabsEl.children).find((b) => (b as HTMLElement).dataset.tab === 'golf') as HTMLElement;
    expect(tab.style.display).toBe('none');
    expect(journal.panel.body.querySelector('.golf-grid')).toBeNull();
  });

  it('shows progress and every kind, concealing the ones not yet found', () => {
    const state = createNewGame();
    recordGolfBall(state, 'oldWhite', 1);
    recordGolfBall(state, 'oldWhite', 2);
    const body = open(state).panel.body;
    expect(body.querySelector('.golf-title')!.textContent).toBe('Golf Ball Collection');
    expect(body.querySelector('.collection-summary')!.textContent).toContain(`Golf Balls 1 / ${GOLF_BALLS.length} discovered`);
    const cards = Array.from(body.querySelectorAll('.golf-card')) as HTMLElement[];
    expect(cards).toHaveLength(GOLF_BALLS.length);
    const found = cards.filter((c) => c.classList.contains('found'));
    expect(found.map((c) => c.dataset.ball)).toEqual(['oldWhite']);
    expect(found[0].querySelector('.golf-count')!.textContent).toBe('×2');
    expect(found[0].querySelector('.golf-new')).not.toBeNull();
    const mystery = cards.find((c) => c.dataset.ball === 'mysteryBall')!;
    expect(mystery.querySelector('.card-name')!.textContent).toBe('Mystery Ball');
    expect(mystery.querySelector('.rarity-word')!.textContent).toBe('???');
    // Nothing anywhere on the page gives the secret away.
    expect(body.textContent).not.toContain(findGolfBall('mysteryBall')!.name);
    expect(body.textContent).not.toContain('Legendary');
    // Seen: no longer NEW next time.
    expect(state.golfBalls.oldWhite.fresh).toBeUndefined();
  });

  it('reveals the Mystery Ball once found, with its details a tap away', () => {
    const state = createNewGame();
    recordGolfBall(state, 'mysteryBall', 1);
    const journal = open(state);
    const card = journal.panel.body.querySelector('[data-ball="mysteryBall"]') as HTMLElement;
    expect(card.classList.contains('found')).toBe(true);
    expect(card.querySelector('.card-name')!.textContent).toBe(findGolfBall('mysteryBall')!.name);
    expect(card.querySelector('.rarity-word')!.textContent).toBe('Legendary');
    card.click();
    const body = journal.panel.body;
    expect(body.querySelector('h3')!.textContent).toBe(findGolfBall('mysteryBall')!.name);
    expect(body.textContent).toContain('Once the Mystery Ball.');
    expect(body.textContent).toContain(findGolfBall('mysteryBall')!.description);
  });
});
