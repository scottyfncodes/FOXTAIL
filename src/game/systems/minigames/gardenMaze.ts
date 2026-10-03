// The garden maze: grown into the meadow west of the greenhouse out of the
// garden's own plants. Scott walks in under the hedge arch at the bottom
// and out the gap at the top; a swipe sends him along a corridor, round its
// bends, until he reaches a junction or a dead end.
//
// Pure simulation, no DOM. Mazes are perfect (exactly one way between any
// two cells) and grown by a seeded recursive backtracker, so a seed always
// grows the same maze. Cells are (col, row), row 0 at the top.

import { mulberry32 } from '../../engine/Random';

export type Dir = 'N' | 'E' | 'S' | 'W';
export const DIRS: Dir[] = ['N', 'E', 'S', 'W'];
export const DIR_BIT: Record<Dir, number> = { N: 1, E: 2, S: 4, W: 8 };
export const DIR_STEP: Record<Dir, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 },
};
export const OPPOSITE: Record<Dir, Dir> = { N: 'S', E: 'W', S: 'N', W: 'E' };

export interface Cell {
  x: number;
  y: number;
}

export type ItemKind = 'petals' | 'ball' | 'ladybird';

export interface Item extends Cell {
  kind: ItemKind;
  taken: boolean;
}

export interface Maze {
  cols: number;
  rows: number;
  /** Openings per cell (DIR_BIT flags), index y * cols + x. */
  open: number[];
  /** Where the arch lets you in (bottom row) and where the gap lets you out (top row). */
  entrance: Cell;
  exit: Cell;
  items: Item[];
  seed: number;
}

export interface MazeSpec {
  cols: number;
  rows: number;
  items: number;
}

/** Three mazes a session, growing as you go. */
export const MAZE_SPECS: MazeSpec[] = [
  { cols: 5, rows: 7, items: 2 },
  { cols: 7, rows: 9, items: 3 },
  { cols: 8, rows: 11, items: 4 },
];
export const SESSION_MAZES = MAZE_SPECS.length;

/** Points for walking out, before the clock. */
export const FINISH_POINTS = 100;
/** The clock takes a point every this many seconds… */
export const SECONDS_PER_POINT = 1;
/** …but never takes it below this. */
export const FINISH_FLOOR = 30;
export const ITEM_POINTS = 10;

const ITEM_KINDS: ItemKind[] = ['petals', 'ball', 'ladybird'];

export function idx(m: Maze, c: Cell): number {
  return c.y * m.cols + c.x;
}

export function inside(m: Maze, c: Cell): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < m.cols && c.y < m.rows;
}

export function isOpen(m: Maze, c: Cell, d: Dir): boolean {
  return inside(m, c) && (m.open[idx(m, c)] & DIR_BIT[d]) !== 0;
}

export function step(c: Cell, d: Dir): Cell {
  return { x: c.x + DIR_STEP[d].dx, y: c.y + DIR_STEP[d].dy };
}

/** The ways out of a cell (not counting the arch or the exit gap). */
export function openings(m: Maze, c: Cell): Dir[] {
  return DIRS.filter((d) => isOpen(m, c, d) && inside(m, step(c, d)));
}

export function generateMaze(spec: MazeSpec, seed: number): Maze {
  const { cols, rows } = spec;
  const rand = mulberry32(seed >>> 0);
  const open = new Array<number>(cols * rows).fill(0);
  const seen = new Array<boolean>(cols * rows).fill(false);
  // Grow from the arch: a depth-first wander, backing up from each dead end.
  const entrance = { x: Math.floor(cols / 2), y: rows - 1 };
  const stack: Cell[] = [entrance];
  seen[entrance.y * cols + entrance.x] = true;
  while (stack.length) {
    const c = stack[stack.length - 1];
    const next = DIRS.filter((d) => {
      const n = step(c, d);
      return n.x >= 0 && n.y >= 0 && n.x < cols && n.y < rows && !seen[n.y * cols + n.x];
    });
    if (!next.length) {
      stack.pop();
      continue;
    }
    const d = next[Math.floor(rand() * next.length)];
    const n = step(c, d);
    open[c.y * cols + c.x] |= DIR_BIT[d];
    open[n.y * cols + n.x] |= DIR_BIT[OPPOSITE[d]];
    seen[n.y * cols + n.x] = true;
    stack.push(n);
  }
  // The way out is somewhere along the top, not straight above the arch if it can help it.
  let ex = Math.floor(rand() * cols);
  if (cols > 2 && ex === entrance.x) ex = (ex + 1 + Math.floor(rand() * (cols - 1))) % cols;
  const exit = { x: ex, y: 0 };
  open[entrance.y * cols + entrance.x] |= DIR_BIT.S;
  open[exit.y * cols + exit.x] |= DIR_BIT.N;
  const maze: Maze = { cols, rows, open, entrance, exit, items: [], seed };
  // Things dropped in the dead ends: petals, one of Scout's tennis balls, a ladybird.
  const ends = deadEnds(maze);
  for (let i = ends.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ends[i], ends[j]] = [ends[j], ends[i]];
  }
  maze.items = ends.slice(0, spec.items).map((c, i) => ({ ...c, kind: ITEM_KINDS[(i + seed) % ITEM_KINDS.length], taken: false }));
  return maze;
}

/** Cells with only one way in, apart from the arch and the exit. */
export function deadEnds(m: Maze): Cell[] {
  const out: Cell[] = [];
  for (let y = 0; y < m.rows; y++)
    for (let x = 0; x < m.cols; x++) {
      const c = { x, y };
      if (same(c, m.entrance) || same(c, m.exit)) continue;
      if (openings(m, c).length === 1) out.push(c);
    }
  return out;
}

export function same(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Where a swipe takes Scott: one step that way, then on along the corridor
 * (round its bends) until a junction, a dead end, the exit, or something
 * lying on the path. Empty if there's hedge that way.
 */
export function glidePath(m: Maze, from: Cell, d: Dir): Cell[] {
  if (!isOpen(m, from, d) || !inside(m, step(from, d))) return [];
  const path: Cell[] = [];
  let c = from;
  let dir = d;
  for (let guard = 0; guard < m.cols * m.rows; guard++) {
    c = step(c, dir);
    path.push(c);
    if (same(c, m.exit) || same(c, m.entrance)) break;
    if (m.items.some((it) => !it.taken && same(it, c))) break;
    const ways = openings(m, c).filter((w) => w !== OPPOSITE[dir]);
    if (ways.length !== 1) break;
    dir = ways[0];
  }
  return path;
}

/** A straight walk to a tapped cell, if it's in line with Scott and nothing's in the way. */
export function linePath(m: Maze, from: Cell, to: Cell): Cell[] {
  if (same(from, to) || !inside(m, to)) return [];
  if (from.x !== to.x && from.y !== to.y) return [];
  const d: Dir = from.x === to.x ? (to.y < from.y ? 'N' : 'S') : to.x < from.x ? 'W' : 'E';
  const path: Cell[] = [];
  let c = from;
  while (!same(c, to)) {
    if (!isOpen(m, c, d)) return [];
    c = step(c, d);
    path.push(c);
  }
  return path;
}

/** The way from one cell to another (there's exactly one in a perfect maze). */
export function solve(m: Maze, from: Cell, to: Cell): Cell[] {
  const prev = new Array<number>(m.cols * m.rows).fill(-1);
  const start = idx(m, from);
  prev[start] = start;
  const queue = [from];
  while (queue.length) {
    const c = queue.shift()!;
    if (same(c, to)) break;
    for (const d of openings(m, c)) {
      const n = step(c, d);
      if (prev[idx(m, n)] !== -1) continue;
      prev[idx(m, n)] = idx(m, c);
      queue.push(n);
    }
  }
  const path: Cell[] = [];
  let i = idx(m, to);
  if (prev[i] === -1) return [];
  while (i !== start) {
    path.push({ x: i % m.cols, y: Math.floor(i / m.cols) });
    i = prev[i];
  }
  return path.reverse();
}

/** Picks up anything lying on these cells; returns how many. */
export function collect(m: Maze, cells: Cell[]): Item[] {
  const got: Item[] = [];
  for (const c of cells)
    for (const it of m.items)
      if (!it.taken && same(it, c)) {
        it.taken = true;
        got.push(it);
      }
  return got;
}

/** Points for walking out after `seconds`: the clock nibbles gently, never below the floor. */
export function finishPoints(seconds: number): number {
  return Math.max(FINISH_FLOOR, FINISH_POINTS - Math.floor(seconds / SECONDS_PER_POINT));
}

export function mazeScore(seconds: number, items: number): number {
  return finishPoints(seconds) + items * ITEM_POINTS;
}

export function sessionSeed(plays: number): number {
  return (Math.imul(plays + 7, 2246822519) ^ 0x6a2d) >>> 0;
}

export function mazeFor(index: number, seed: number): Maze {
  return generateMaze(MAZE_SPECS[Math.min(index, MAZE_SPECS.length - 1)], (seed + index * 7919) >>> 0);
}

// ------------------------------------------------------------ the hedges

/**
 * How the garden has come along, for the hedges: the species Ellen's grown.
 * A new garden's maze is plain clipped box; a well-stocked one flowers.
 */
export interface HedgeBloom {
  /** 0..1: how much of the hedge is in flower. */
  amount: number;
  /** Flower colours, as hsl() strings, from the plants she's grown. */
  colours: string[];
  /** A couple of her species, grown as named plants into the hedge. */
  named: { id: string; name: string; colour: string; leaf: string }[];
}

export interface BloomPlant {
  id: string;
  name: string;
  look: { hue: number; sat: number; light: number; accentHue: number; accentSat?: number; accentLight?: number };
}

export function hedgeBloom(collected: string[], plants: Record<string, BloomPlant>, seed: number): HedgeBloom {
  const known = collected.filter((id) => plants[id]).sort();
  const amount = Math.min(1, known.length / 16);
  const colours = known.map((id) => {
    const l = plants[id].look;
    return `hsl(${l.accentHue},${l.accentSat ?? 70}%,${Math.max(55, l.accentLight ?? 68)}%)`;
  });
  const rand = mulberry32(seed ^ 0xb100);
  const pick = [...known];
  const named: HedgeBloom['named'] = [];
  const want = known.length >= 8 ? 2 : known.length >= 3 ? 1 : 0;
  while (named.length < want && pick.length) {
    const id = pick.splice(Math.floor(rand() * pick.length), 1)[0];
    const l = plants[id].look;
    named.push({ id, name: plants[id].name, colour: `hsl(${l.accentHue},${l.accentSat ?? 70}%,${l.accentLight ?? 62}%)`, leaf: `hsl(${l.hue},${l.sat}%,${l.light}%)` });
  }
  return { amount, colours, named };
}
