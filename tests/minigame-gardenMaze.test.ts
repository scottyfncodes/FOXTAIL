import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../src/game/engine/Random';
import { findMiniGame } from '../src/game/systems/minigames';
import { PLANTS } from '../src/game/data/plants';
import {
  DIRS,
  FINISH_FLOOR,
  ITEM_POINTS,
  MAZE_SPECS,
  OPPOSITE,
  SESSION_MAZES,
  collect,
  deadEnds,
  finishPoints,
  generateMaze,
  glidePath,
  hedgeBloom,
  idx,
  isOpen,
  linePath,
  mazeFor,
  mazeScore,
  openings,
  same,
  sessionSeed,
  solve,
  step,
  type Cell,
  type Dir,
  type Maze,
} from '../src/game/systems/minigames/gardenMaze';

const GOAL = findMiniGame('gardenMaze')!.goal;
/** A person's pace: a moment to look and swipe, then Scott's walk. */
const THINK = 0.9;
const WALK = 1 / 6;

function walkTime(cells: number): number {
  return THINK + cells * WALK;
}

/**
 * A decent player: explores depth-first one swipe at a time, trying the ways
 * that head toward the exit first, backing out of dead ends.
 */
function decent(m: Maze): { seconds: number; items: number } {
  let at: Cell = { ...m.entrance };
  let seconds = 0;
  let items = 0;
  const seen = new Set<number>([idx(m, at)]);
  const trail: Cell[] = [];
  for (let moves = 0; moves < 400 && !same(at, m.exit); moves++) {
    const ways = openings(m, at)
      .map((d) => ({ d, path: glidePath(m, at, d) }))
      .filter((w) => w.path.length && !seen.has(idx(m, w.path[w.path.length - 1])));
    const score = (c: Cell) => c.y * 2 + Math.abs(c.x - m.exit.x);
    ways.sort((a, b) => score(a.path[a.path.length - 1]) - score(b.path[b.path.length - 1]));
    let path: Cell[];
    if (ways.length) {
      path = ways[0].path;
      trail.push(at);
    } else {
      const back = trail.pop()!;
      path = solve(m, at, back);
    }
    for (const c of path) seen.add(idx(m, c));
    items += collect(m, path).length;
    seconds += walkTime(path.length);
    at = path[path.length - 1];
  }
  return { seconds, items };
}

/** Swipes any old way until it happens to come out. */
function aimless(m: Maze, rand: () => number): { seconds: number; items: number } {
  let at: Cell = { ...m.entrance };
  let seconds = 0;
  let items = 0;
  while (!same(at, m.exit) && seconds < 600) {
    const d = DIRS[Math.floor(rand() * 4)];
    const path = glidePath(m, at, d);
    seconds += THINK * 0.8;
    if (!path.length) continue;
    items += collect(m, path).length;
    seconds += path.length * WALK;
    at = path[path.length - 1];
  }
  return { seconds, items };
}

function sessionScore(seed: number, play: (m: Maze) => { seconds: number; items: number }) {
  let total = 0;
  let seconds = 0;
  for (let i = 0; i < SESSION_MAZES; i++) {
    const r = play(mazeFor(i, sessionSeed(seed)));
    total += mazeScore(r.seconds, r.items);
    seconds += r.seconds;
  }
  return { total, seconds };
}

describe('garden maze: growing a maze', () => {
  it('is deterministic per seed', () => {
    expect(generateMaze(MAZE_SPECS[1], 7)).toEqual(generateMaze(MAZE_SPECS[1], 7));
    expect(generateMaze(MAZE_SPECS[1], 7).open).not.toEqual(generateMaze(MAZE_SPECS[1], 8).open);
  });

  it('is a perfect maze: every cell reachable, no loops', () => {
    for (let s = 0; s < 20; s++) {
      for (const spec of MAZE_SPECS) {
        const m = generateMaze(spec, s);
        let passages = 0;
        for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) passages += openings(m, { x, y }).length;
        // A tree: one fewer passage than cells.
        expect(passages / 2).toBe(m.cols * m.rows - 1);
        for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) expect(solve(m, m.entrance, { x, y }).length > 0 || same(m.entrance, { x, y })).toBe(true);
        // Walls agree from both sides.
        for (let y = 0; y < m.rows; y++)
          for (let x = 0; x < m.cols; x++)
            for (const d of openings(m, { x, y })) expect(isOpen(m, step({ x, y }, d), OPPOSITE[d])).toBe(true);
      }
    }
  });

  it('opens the arch at the bottom and the way out at the top', () => {
    const m = mazeFor(2, 3);
    expect(m.entrance.y).toBe(m.rows - 1);
    expect(m.exit.y).toBe(0);
    expect(isOpen(m, m.entrance, 'S')).toBe(true);
    expect(isOpen(m, m.exit, 'N')).toBe(true);
  });

  it('drops things only in dead ends, more in bigger mazes', () => {
    for (let i = 0; i < SESSION_MAZES; i++) {
      const m = mazeFor(i, 11);
      const ends = deadEnds(m);
      for (const it of m.items) expect(ends.some((c) => same(c, it))).toBe(true);
      expect(m.items.length).toBe(Math.min(MAZE_SPECS[i].items, ends.length));
    }
    expect(MAZE_SPECS[2].cols * MAZE_SPECS[2].rows).toBeGreaterThan(MAZE_SPECS[0].cols * MAZE_SPECS[0].rows);
  });
});

describe('garden maze: walking it', () => {
  it('a swipe follows a corridor round its bends to a junction or dead end', () => {
    const m = mazeFor(1, 4);
    for (let y = 0; y < m.rows; y++)
      for (let x = 0; x < m.cols; x++)
        for (const d of DIRS) {
          const p = glidePath(m, { x, y }, d);
          if (!p.length) continue;
          const end = p[p.length - 1];
          const ends = openings(m, end).length;
          const stopped = ends !== 2 || same(end, m.exit) || same(end, m.entrance) || m.items.some((it) => same(it, end));
          expect(stopped).toBe(true);
          // Every step goes through an opening.
          let c: Cell = { x, y };
          for (const n of p) {
            const dir = (['N', 'E', 'S', 'W'] as Dir[]).find((k) => same(step(c, k), n))!;
            expect(isOpen(m, c, dir)).toBe(true);
            c = n;
          }
        }
  });

  it('will not walk through hedge', () => {
    const m = mazeFor(0, 5);
    for (const d of DIRS) if (!isOpen(m, m.entrance, d) || d === 'S') expect(glidePath(m, m.entrance, d)).toEqual([]);
    // A tap straight through a wall goes nowhere.
    const c = m.entrance;
    const blocked = DIRS.find((d) => d !== 'S' && !isOpen(m, c, d));
    if (blocked) {
      const target = step(step(c, blocked), blocked);
      expect(linePath(m, c, target)).toEqual([]);
    }
  });

  it('scores the finish gently, never under the floor, plus whatever was found', () => {
    expect(finishPoints(0)).toBe(100);
    expect(finishPoints(30)).toBeLessThan(100);
    expect(finishPoints(30)).toBeGreaterThan(FINISH_FLOOR);
    expect(finishPoints(999)).toBe(FINISH_FLOOR);
    expect(mazeScore(30, 2)).toBe(finishPoints(30) + 2 * ITEM_POINTS);
  });
});

describe('garden maze: the session', () => {
  it('a decent player reaches the goal in a few minutes at most', () => {
    const runs = Array.from({ length: 60 }, (_, s) => sessionScore(s, decent));
    const reached = runs.filter((r) => r.total >= GOAL).length / runs.length;
    expect(reached).toBeGreaterThan(0.8);
    for (const r of runs) expect(r.seconds).toBeLessThan(200);
  });

  it('an aimless swiper does not', () => {
    const runs = Array.from({ length: 60 }, (_, s) => {
      const rand = mulberry32(s + 100);
      return sessionScore(s, (m) => aimless(m, rand));
    });
    const reached = runs.filter((r) => r.total >= GOAL).length / runs.length;
    expect(reached).toBeLessThan(0.3);
  });
});

describe('garden maze: the hedges', () => {
  it('a new garden is plain box; a grown one flowers with its own plants', () => {
    const none = hedgeBloom([], PLANTS, 1);
    expect(none.amount).toBe(0);
    expect(none.named).toEqual([]);
    const ids = Object.keys(PLANTS).slice(0, 12);
    const lots = hedgeBloom(ids, PLANTS, 1);
    expect(lots.amount).toBeGreaterThan(0.5);
    expect(lots.colours.length).toBe(12);
    expect(lots.named.length).toBe(2);
    expect(ids).toContain(lots.named[0].id);
  });
});
