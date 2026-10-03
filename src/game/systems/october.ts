import type { FoxFind, GameState } from '../state';
import { makeUid } from '../state';
import type { OutdoorZoneId } from '../types';
import { PLANT_LIST, rarityRank } from '../data/plants';
import { FOX_FIND_LIFETIME } from './foxFinds';
import { variantAllowed } from './lineage';
import { hasFound } from './collection';
import { weightedPick } from '../engine/Random';
import { FACES, HAUNTS, OCTOBER_NOTES, PUMPKINS, findFace, type FaceId, type OctoberNote } from '../data/october';
import { DAWN, MINUTES_PER_DAY, minuteOfDay } from '../engine/Clock';
import { isWater, GRID_W, GRID_H } from '../data/worldMap';

// October's strangeness, as pure state and rules: what turns up, where and
// how rarely, what makes it go, and what's remembered. Nothing here draws or
// speaks; the renderer shows it and the game only ever counts it quietly.
//
// Everything is on real seconds, not game time: a strange thing is a moment
// you happen to be there for, however fast the night is passing.

export type OctoberEventKind =
  | 'nothing' // the animals stare at something that isn't there
  | 'rustle'
  | 'fogPuff'
  | 'eyes'
  | 'shadow'
  | 'wisp'
  | 'flicker'
  | 'silhouette'
  | 'stray'
  | 'window'
  | 'watcher'
  | 'lantern'
  | 'shadowFox'
  | 'visitor'
  | 'glassShadow'
  | 'glassFigure';

export interface OctoberEvent {
  id: number;
  kind: OctoberEventKind;
  x: number;
  y: number;
  /** Seconds since it began; negative while it's still coming (the animals notice first). */
  age: number;
  /** How long it lasts once it's there, in seconds. */
  dur: number;
  seed: number;
  /** Which way it faces, or moves. */
  dir: 1 | -1;
  /** Where it's going, for the things that move. */
  tx?: number;
  ty?: number;
  /** Seconds since it started going (approached, lost, finished); null while it's still there. */
  going: number | null;
  /** Seconds it's been on screen while there. */
  watched: number;
  /** Counted as seen (once, after it's been there a moment). */
  counted: boolean;
  /** The lantern: what's at the end of it. */
  reward?: 'nothing' | 'find';
  /** The lantern: got where it was going. */
  arrived?: boolean;
  /** The lantern: seconds the player has been too far behind. */
  lostFor?: number;
  /** The visitor: how many times it had been seen before this. */
  visits?: number;
}

/** How long something takes to fade once it's going. */
export const GOING_SECONDS = 0.6;
/** The first strange thing waits a little; after that, they're spaced out. */
export const FIRST_GAP: [number, number] = [50, 120];
/** Seconds between strange things by day, at the least and most. Night shortens it. */
export const EVENT_GAP: [number, number] = [150, 330];
export const NIGHT_GAP_SCALE = 0.6;

interface KindRule {
  weight: number;
  /** How dark it must be (0 day … 1 night). */
  dark?: number;
  /** Real seconds since the last one of these before another may come. */
  gap?: number;
  where: 'out' | 'greenhouse' | 'living' | 'in';
  needs?: (c: OctoberContext, d: OctoberDirector) => boolean;
}

export const EVENT_RULES: Record<OctoberEventKind, KindRule> = {
  nothing: { weight: 8, where: 'out' },
  rustle: { weight: 10, where: 'out' },
  fogPuff: { weight: 6, where: 'out' },
  eyes: { weight: 10, dark: 0.55, where: 'out' },
  shadow: { weight: 7, dark: 0.3, where: 'out' },
  wisp: { weight: 6, dark: 0.55, where: 'out' },
  flicker: { weight: 5, dark: 0.45, where: 'out', needs: (c) => c.lanternsInView },
  silhouette: { weight: 4, dark: 0.3, where: 'out' },
  stray: { weight: 2, dark: 0.4, gap: 900, where: 'out', needs: (c) => !c.strayOut },
  window: { weight: 1, dark: 0.6, gap: 1200, where: 'out', needs: (c) => c.houseWindowInView },
  watcher: { weight: 6, dark: 0.6, gap: 420, where: 'out' },
  lantern: { weight: 5, dark: 0.6, gap: 540, where: 'out' },
  shadowFox: { weight: 1.6, dark: 0.7, gap: 1500, where: 'out' },
  visitor: { weight: 3, dark: 0.7, gap: 2400, where: 'out' },
  glassShadow: { weight: 6, dark: 0.3, where: 'greenhouse' },
  glassFigure: { weight: 2.5, dark: 0.6, gap: 600, where: 'greenhouse' },
};

/** Things that only count as "seen" — and so only find a way into the journal — if they really were. */
export const NOTED: OctoberEventKind[] = ['eyes', 'shadow', 'wisp', 'silhouette', 'stray', 'window', 'watcher', 'lantern', 'shadowFox', 'visitor', 'glassFigure'];

/** Kinds the animals react to: they turn to look, sometimes before you see anything. */
const NOTICED_BY_ANIMALS: OctoberEventKind[] = ['nothing', 'rustle', 'eyes', 'shadow', 'wisp', 'watcher', 'shadowFox', 'visitor', 'glassShadow', 'glassFigure', 'silhouette', 'lantern'];

const DURATION: Record<OctoberEventKind, [number, number]> = {
  nothing: [6, 9],
  rustle: [1.4, 1.8],
  fogPuff: [8, 11],
  eyes: [3.2, 4.4],
  shadow: [2.4, 3.0],
  wisp: [5, 6.5],
  flicker: [2.2, 3.2],
  silhouette: [6, 7.5],
  stray: [0.1, 0.1],
  window: [2.6, 2.6],
  watcher: [22, 30],
  lantern: [90, 90],
  shadowFox: [3.6, 4.2],
  visitor: [11, 11],
  glassShadow: [2.8, 3.4],
  glassFigure: [18, 24],
};

/** How close is too close: within this, it's simply not there any more. */
export const SHY_RANGE: Partial<Record<OctoberEventKind, number>> = {
  eyes: 2.6,
  shadow: 2.4,
  watcher: 5,
  shadowFox: 4,
  visitor: 5,
  glassFigure: 3.2,
  wisp: 2.2,
};

export interface OctoberDirector {
  /** Real seconds until the next strange thing may begin. */
  cooldown: number;
  events: OctoberEvent[];
  /** Real seconds since each kind last happened. */
  since: Partial<Record<OctoberEventKind, number>>;
  nextId: number;
}

export interface ViewBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface OctoberContext {
  dt: number;
  /** 0 by day, 1 at night. */
  darkness: number;
  /** Outdoors, in the greenhouse, or in the living room. */
  where: 'out' | 'greenhouse' | 'living';
  px: number;
  py: number;
  view: ViewBounds;
  rand: () => number;
  /** Trees and bushes, by their centres. */
  trees: { x: number; y: number }[];
  bushes: { x: number; y: number }[];
  lanternsInView: boolean;
  houseWindowInView: boolean;
  strayOut: boolean;
  isOpen: (x: number, y: number) => boolean;
}

export interface DirectorResult {
  begun: OctoberEvent[];
  /** Kinds seen properly for the first time this tick (one count each). */
  seen: OctoberEventKind[];
  /** Something for the animals to look at. */
  react: { x: number; y: number; long: boolean } | null;
  /** A stray pumpkin to put down. */
  stray: { x: number; y: number } | null;
  /** Where a lantern went out, having led you somewhere worth being led. */
  lanternFind: { x: number; y: number } | null;
  /** Where the visitor stood, as it goes, if it leaves something behind. */
  visitorLeft: { x: number; y: number; visits: number } | null;
}

export function newDirector(rand: () => number = Math.random): OctoberDirector {
  return { cooldown: FIRST_GAP[0] + rand() * (FIRST_GAP[1] - FIRST_GAP[0]), events: [], since: {}, nextId: 1 };
}

function inView(v: ViewBounds, x: number, y: number, pad = 0): boolean {
  return x > v.minX + pad && x < v.maxX - pad && y > v.minY + pad && y < v.maxY - pad;
}

/** A tree or bush at the right distance, in view; `headroom` keeps a tall figure's head on screen. */
function pickAnchor(list: { x: number; y: number }[], c: OctoberContext, min: number, max: number, headroom = 0): { x: number; y: number } | null {
  const ok = list.filter((a) => {
    const d = Math.hypot(a.x - c.px, a.y - c.py);
    return d >= min && d <= max && inView(c.view, a.x, a.y, 1) && a.y > c.view.minY + 1 + headroom;
  });
  return ok.length ? ok[Math.floor(c.rand() * ok.length) % ok.length] : null;
}

function pickOpen(c: OctoberContext, min: number, max: number, tries = 24): { x: number; y: number } | null {
  for (let i = 0; i < tries; i++) {
    const a = c.rand() * Math.PI * 2;
    const r = min + c.rand() * (max - min);
    const x = c.px + Math.cos(a) * r;
    const y = c.py + Math.sin(a) * r * 0.8;
    if (x < 1 || y < 1 || x > GRID_W - 1 || y > GRID_H - 1 || !inView(c.view, x, y, 1)) continue;
    if (c.isOpen(x, y)) return { x, y };
  }
  return null;
}

/** Whether a kind could happen right now (before it's been placed). */
export function eligible(kind: OctoberEventKind, c: OctoberContext, d: OctoberDirector): boolean {
  const r = EVENT_RULES[kind];
  if (r.where === 'out' ? c.where !== 'out' : r.where === 'in' ? c.where === 'out' : r.where !== c.where) return false;
  if (r.dark !== undefined && c.darkness < r.dark) return false;
  if (r.gap !== undefined && (d.since[kind] ?? Infinity) < r.gap) return false;
  if (r.needs && !r.needs(c, d)) return false;
  return true;
}

/** Places a strange thing of this kind, or null if there's nowhere for it to be right now. */
export function placeEvent(kind: OctoberEventKind, c: OctoberContext, d: OctoberDirector): OctoberEvent | null {
  const [lo, hi] = DURATION[kind];
  const ev = (x: number, y: number, extra: Partial<OctoberEvent> = {}): OctoberEvent => ({
    id: d.nextId++,
    kind,
    x,
    y,
    age: 0,
    dur: lo + c.rand() * (hi - lo),
    seed: Math.floor(c.rand() * 1e6),
    dir: c.rand() < 0.5 ? -1 : 1,
    going: null,
    watched: 0,
    counted: false,
    ...extra,
  });
  const cover = [...c.trees, ...c.bushes];
  switch (kind) {
    case 'nothing': {
      // Somewhere off toward the trees, or just off into the dark.
      const a = pickAnchor(cover, c, 6, 14) ?? pickOpen(c, 7, 12);
      return a ? ev(a.x, a.y) : null;
    }
    case 'rustle': {
      const a = pickAnchor(cover, c, 3, 8);
      return a ? ev(a.x, a.y) : null;
    }
    case 'fogPuff': {
      const a = pickOpen(c, 3, 7);
      return a ? ev(a.x, a.y) : null;
    }
    case 'eyes': {
      // The animals see it first: a beat of them looking, then the eyes.
      const a = pickAnchor(c.bushes.length ? [...c.bushes, ...c.bushes, ...c.trees] : c.trees, c, 4, 9);
      return a ? ev(a.x, a.y, { age: -1.4 }) : null;
    }
    case 'shadow': {
      const a = pickAnchor(c.trees, c, 4, 10);
      return a ? ev(a.x, a.y) : null;
    }
    case 'wisp': {
      const a = pickAnchor(c.trees, c, 6, 11);
      if (!a) return null;
      const near = c.trees.filter((t) => t !== a && Math.hypot(t.x - a.x, t.y - a.y) < 4.5 && Math.hypot(t.x - a.x, t.y - a.y) > 1.5);
      const b = near.length ? near[Math.floor(c.rand() * near.length) % near.length] : { x: a.x + 3, y: a.y };
      return ev(a.x, a.y, { tx: b.x, ty: b.y });
    }
    case 'flicker':
      return ev(c.px, c.py);
    case 'silhouette': {
      // Small, along the top of the view, walking across.
      const y = c.view.minY + 1.2 + c.rand() * 1.5;
      if (y > c.py - 5) return null;
      const dir = c.rand() < 0.5 ? -1 : 1;
      const x0 = dir > 0 ? c.view.minX + 1 : c.view.maxX - 1;
      return ev(x0, y, { dir, tx: x0 + dir * 6 });
    }
    case 'stray': {
      const a = pickOpen(c, 5, 9);
      return a ? ev(a.x, a.y) : null;
    }
    case 'window':
      return ev(0, 0);
    case 'watcher': {
      // At the edge of what you can see, where the trees start.
      const a = pickAnchor(c.trees, c, 8, 13, 1.6);
      return a ? ev(a.x + 0.7, a.y + 0.2) : null;
    }
    case 'lantern': {
      const start = pickOpen(c, 4, 6);
      if (!start) return null;
      // Somewhere a good way off, that can be walked to.
      for (let i = 0; i < 20; i++) {
        const a = c.rand() * Math.PI * 2;
        const r = 14 + c.rand() * 9;
        const tx = start.x + Math.cos(a) * r;
        const ty = start.y + Math.sin(a) * r;
        if (tx < 2 || ty < 2 || tx > GRID_W - 2 || ty > GRID_H - 2 || !c.isOpen(tx, ty)) continue;
        return ev(start.x, start.y, { tx, ty, reward: c.rand() < 0.5 ? 'find' : 'nothing', lostFor: 0 });
      }
      return null;
    }
    case 'shadowFox': {
      const a = pickAnchor(c.trees, c, 6, 9, 0.8) ?? pickOpen(c, 6, 9);
      return a ? ev(a.x + 0.6, a.y + 0.3) : null;
    }
    case 'visitor': {
      const a = pickAnchor(c.trees, c, 9, 13, 1.8);
      return a ? ev(a.x + 0.75, a.y + 0.25) : null;
    }
    case 'glassShadow': {
      // Along whichever glass wall she's nearer, so it can be seen.
      const dir = c.rand() < 0.5 ? -1 : 1;
      const y = c.py < 6 ? 0.5 : 11.5;
      return ev(dir > 0 ? 1 : 16, y, { dir, tx: dir > 0 ? 16 : 1, ty: y });
    }
    case 'glassFigure': {
      // Standing just outside the glass, as far along it from Ellen as it can.
      const x = c.px < 8.5 ? 11 + c.rand() * 4 : 2 + c.rand() * 4;
      return ev(x, c.py < 6 ? 0.35 : 11.35);
    }
  }
}

function pickKind(c: OctoberContext, d: OctoberDirector): OctoberEventKind | null {
  const kinds = (Object.keys(EVENT_RULES) as OctoberEventKind[]).filter((k) => eligible(k, c, d));
  const total = kinds.reduce((s, k) => s + EVENT_RULES[k].weight, 0);
  if (total <= 0) return null;
  let r = c.rand() * total;
  for (const k of kinds) {
    r -= EVENT_RULES[k].weight;
    if (r < 0) return k;
  }
  return kinds[kinds.length - 1];
}

export function nextGap(darkness: number, rand: () => number): number {
  const g = EVENT_GAP[0] + rand() * (EVENT_GAP[1] - EVENT_GAP[0]);
  return g * (1 - (1 - NIGHT_GAP_SCALE) * darkness);
}

/** Opacity of a strange thing right now: in, holding, and out (sooner, if it's been approached). */
export function eventAlpha(e: OctoberEvent): number {
  if (e.age < 0) return 0;
  const inA = Math.min(1, e.age / 0.5);
  const outA = e.going !== null ? Math.max(0, 1 - e.going / GOING_SECONDS) : 1;
  return inA * outA;
}

/** Where a moving strange thing is now. */
export function eventPos(e: OctoberEvent): { x: number; y: number } {
  if (e.tx === undefined || e.ty === undefined || e.kind === 'lantern') return { x: e.x, y: e.y };
  const t = Math.max(0, Math.min(1, e.age / e.dur));
  const k = t * t * (3 - 2 * t);
  return { x: e.x + (e.tx - e.x) * k, y: e.y + (e.ty - e.y) * k };
}

function emptyResult(): DirectorResult {
  return { begun: [], seen: [], react: null, stray: null, lanternFind: null, visitorLeft: null };
}

/**
 * Runs October's strangeness for one frame: ages what's happening, makes
 * shy things go when approached, and every so often lets something new
 * begin. Pure apart from `d`.
 */
export function tickDirector(d: OctoberDirector, c: OctoberContext): DirectorResult {
  const out = emptyResult();
  for (const k of Object.keys(d.since) as OctoberEventKind[]) d.since[k]! += c.dt;

  for (const e of d.events) {
    e.age += c.dt;
    if (e.going !== null) {
      e.going += c.dt;
      continue;
    }
    const where = EVENT_RULES[e.kind].where;
    // Gone outside or in: what was out there is no longer there.
    if (where === 'out' ? c.where !== 'out' : where !== c.where) {
      e.going = GOING_SECONDS;
      continue;
    }
    if (e.age < 0) continue;
    const pos = eventPos(e);
    const dist = Math.hypot(pos.x - c.px, pos.y - c.py);
    if (inView(c.view, pos.x, pos.y)) e.watched += c.dt;
    if (!e.counted && NOTED.includes(e.kind) && e.watched > 0.8) {
      e.counted = true;
      out.seen.push(e.kind);
    }
    const shy = SHY_RANGE[e.kind];
    if (shy !== undefined && dist < shy) {
      e.going = 0;
      if (e.kind === 'visitor' && (e.visits ?? 0) >= 1) out.visitorLeft = { x: e.x, y: e.y, visits: e.visits ?? 0 };
      continue;
    }
    if (e.kind === 'lantern') {
      tickLantern(e, c, dist, out);
      continue;
    }
    if (e.age >= e.dur) {
      e.going = 0;
      if (e.kind === 'visitor' && (e.visits ?? 0) >= 1) out.visitorLeft = { x: e.x, y: e.y, visits: e.visits ?? 0 };
    }
  }
  d.events = d.events.filter((e) => e.going === null || e.going < GOING_SECONDS);

  d.cooldown -= c.dt;
  // One strange thing at a time.
  if (d.cooldown <= 0 && d.events.length === 0) {
    const kind = pickKind(c, d);
    const e = kind ? placeEvent(kind, c, d) : null;
    if (e && kind) {
      d.since[kind] = 0;
      if (kind === 'stray') {
        out.stray = { x: e.x, y: e.y };
      } else {
        d.events.push(e);
        out.begun.push(e);
      }
      if (NOTICED_BY_ANIMALS.includes(kind)) out.react = { x: e.x, y: e.y, long: kind === 'nothing' || kind === 'watcher' || kind === 'visitor' || kind === 'glassFigure' };
      d.cooldown = nextGap(c.darkness, c.rand);
    } else {
      // Nowhere for it just now: look again shortly.
      d.cooldown = 4 + c.rand() * 6;
    }
  }
  return out;
}

const LANTERN_SPEED = 1.5;

function tickLantern(e: OctoberEvent, c: OctoberContext, dist: number, out: DirectorResult) {
  if (e.arrived) {
    // It waits where it got to, a moment, then goes out.
    if (e.age > e.dur) e.going = 0;
    return;
  }
  // Too far behind for too long and it's lost.
  if (dist > 13) e.lostFor = (e.lostFor ?? 0) + c.dt;
  else e.lostFor = 0;
  if ((e.lostFor ?? 0) > 5 || e.age > e.dur) {
    e.going = 0;
    return;
  }
  // It only goes on while you're keeping up with it.
  if (dist < 7 && e.tx !== undefined && e.ty !== undefined) {
    const dx = e.tx - e.x;
    const dy = e.ty - e.y;
    const left = Math.hypot(dx, dy);
    const step = Math.min(left, LANTERN_SPEED * c.dt);
    if (left > 0.01) {
      e.x += (dx / left) * step;
      e.y += (dy / left) * step;
      e.dir = dx >= 0 ? 1 : -1;
    }
    if (left - step < 0.05) {
      e.arrived = true;
      // It lingers a few seconds where it stopped.
      e.age = 0;
      e.dur = 4;
      if (e.reward === 'find') out.lanternFind = { x: e.x, y: e.y };
    }
  }
}

// ---------------------------------------------------------------- the pale thing

export type GhostMode = 'away' | 'haunt' | 'follow' | 'pumpkin' | 'reflect' | 'greenhouse';

export interface GhostState {
  mode: GhostMode;
  x: number;
  y: number;
  /** 0..1: how there it is. */
  shown: number;
  /** Seconds in this mode. */
  age: number;
  /** How long it means to stay. */
  stay: number;
  /** Real seconds until it next turns up. */
  nextIn: number;
  /** Going (approached, or done). */
  going: boolean;
  /** Counted as seen this time. */
  counted: boolean;
  /** Turned toward Ellen (when she's close and it isn't running). */
  looking: boolean;
  /** The pumpkin it's sitting by. */
  pumpkinId?: string;
  /** It's just given something: it waves, then goes. */
  waving?: number;
  seed: number;
}

export const GHOST_FIRST: [number, number] = [70, 160];
export const GHOST_GAP: [number, number] = [150, 330];
/** How dark it has to be before it's about, outdoors and under glass. */
export const GHOST_DARK_OUT = 0.5;
export const GHOST_DARK_IN = 0.3;
export const GHOST_SHY = 3.2;
/** How near you can be to talk to it, when it's by a lit pumpkin. */
export const GHOST_REACH = 1.7;

export function newGhost(rand: () => number = Math.random): GhostState {
  return { mode: 'away', x: 0, y: 0, shown: 0, age: 0, stay: 0, nextIn: GHOST_FIRST[0] + rand() * (GHOST_FIRST[1] - GHOST_FIRST[0]), going: false, counted: false, looking: false, seed: 1 };
}

export interface GhostContext {
  dt: number;
  darkness: number;
  where: 'out' | 'greenhouse' | 'living';
  px: number;
  py: number;
  facing: 'up' | 'down' | 'left' | 'right';
  view: ViewBounds;
  rand: () => number;
  /** Lit jack-o'-lanterns, where they stand. */
  lit: { id: string; x: number; y: number }[];
}

const FACE_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;

function ghostAppear(g: GhostState, c: GhostContext): boolean {
  g.age = 0;
  g.shown = 0;
  g.going = false;
  g.counted = false;
  g.looking = false;
  g.waving = undefined;
  g.pumpkinId = undefined;
  g.seed = Math.floor(c.rand() * 1e6);
  if (c.where === 'greenhouse') {
    if (c.darkness < GHOST_DARK_IN) return false;
    // Somewhere among the plants, well away from her.
    for (let i = 0; i < 12; i++) {
      const x = 2 + c.rand() * 13;
      const y = 2.5 + c.rand() * 6.5;
      if (Math.hypot(x - c.px, y - c.py) > 5) {
        g.mode = 'greenhouse';
        g.x = x;
        g.y = y;
        g.stay = 24 + c.rand() * 12;
        return true;
      }
    }
    return false;
  }
  if (c.where !== 'out' || c.darkness < GHOST_DARK_OUT) return false;
  const near = c.lit.filter((p) => Math.hypot(p.x - c.px, p.y - c.py) < 16);
  if (near.length && c.rand() < 0.6) {
    const p = near[Math.floor(c.rand() * near.length) % near.length];
    g.mode = 'pumpkin';
    g.pumpkinId = p.id;
    g.x = p.x + 0.75;
    g.y = p.y - 0.05;
    g.stay = 60 + c.rand() * 30;
    return true;
  }
  const r = c.rand();
  // The creek is in view: sometimes it's only in the water.
  const creekX = 41.2 + c.rand() * 1.6;
  if (r < 0.25 && creekX > c.view.minX + 1 && creekX < c.view.maxX - 1 && Math.abs(creekX - c.px) < 11) {
    const y = Math.max(c.view.minY + 2, Math.min(c.view.maxY - 2, c.py + (c.rand() - 0.5) * 6));
    if (isWater(Math.floor(creekX), Math.floor(y)) && Math.hypot(creekX - c.px, y - c.py) > GHOST_SHY + 1) {
      g.mode = 'reflect';
      g.x = creekX;
      g.y = y;
      g.stay = 16 + c.rand() * 8;
      return true;
    }
  }
  const haunts = HAUNTS.filter((h) => {
    const d = Math.hypot(h.x - c.px, h.y - c.py);
    return d > GHOST_SHY + 1.5 && d < 12 && inView(c.view, h.x, h.y, 1);
  });
  if (haunts.length && r < 0.7) {
    const h = haunts[Math.floor(c.rand() * haunts.length) % haunts.length];
    g.mode = 'haunt';
    g.x = h.x;
    g.y = h.y;
    g.stay = 20 + c.rand() * 12;
    return true;
  }
  // Behind her, a way back.
  const [fx, fy] = FACE_VEC[c.facing];
  const x = c.px - fx * 6;
  const y = c.py - fy * 6;
  if (x < 2 || y < 2 || x > GRID_W - 2 || y > GRID_H - 2) return false;
  g.mode = 'follow';
  g.x = x;
  g.y = y;
  g.stay = 35 + c.rand() * 15;
  return true;
}

export interface GhostResult {
  /** Seen properly this time (counted once). */
  seen: boolean;
}

/** Moves the pale thing on by a frame. */
export function tickGhost(g: GhostState, c: GhostContext): GhostResult {
  const res: GhostResult = { seen: false };
  if (g.mode === 'away') {
    g.nextIn -= c.dt;
    if (g.nextIn > 0) return res;
    if (!ghostAppear(g, c)) {
      g.mode = 'away';
      g.nextIn = 8 + c.rand() * 12;
    }
    return res;
  }
  g.age += c.dt;
  const outdoors = g.mode !== 'greenhouse';
  const wrongPlace = outdoors ? c.where !== 'out' : c.where !== 'greenhouse';
  const dark = outdoors ? c.darkness >= GHOST_DARK_OUT - 0.1 : c.darkness >= GHOST_DARK_IN - 0.1;
  const dist = Math.hypot(g.x - c.px, g.y - c.py);
  if (!g.going) {
    if (wrongPlace || !dark || g.age > g.stay) g.going = true;
    else if (g.mode === 'pumpkin') {
      // By a lit pumpkin it isn't afraid: it turns to look when she comes near.
      g.looking = dist < 4;
      if (!c.lit.some((p) => p.id === g.pumpkinId) || dist > 18) g.going = true;
      if (g.waving !== undefined) {
        g.waving += c.dt;
        if (g.waving > 2.2) g.going = true;
      }
    } else if (dist < (g.mode === 'greenhouse' ? 2.8 : GHOST_SHY)) {
      g.going = true;
    } else if (g.mode === 'follow') {
      // Keeps its distance behind her, drifting after.
      const [fx, fy] = FACE_VEC[c.facing];
      const wx = c.px - fx * 5.5;
      const wy = c.py - fy * 5.5;
      const dx = wx - g.x;
      const dy = wy - g.y;
      const l = Math.hypot(dx, dy);
      const step = Math.min(l, 1.3 * c.dt);
      if (l > 0.05) {
        g.x += (dx / l) * step;
        g.y += (dy / l) * step;
      }
    }
  }
  if (g.going) {
    g.shown = Math.max(0, g.shown - c.dt / (g.waving !== undefined ? 1.2 : 0.45));
    if (g.shown <= 0) {
      const wasFollow = g.mode === 'follow';
      g.mode = 'away';
      // Now and then, it turns up again a little behind her.
      g.nextIn = !wasFollow && c.rand() < 0.3 ? 12 + c.rand() * 14 : GHOST_GAP[0] + c.rand() * (GHOST_GAP[1] - GHOST_GAP[0]);
    }
    return res;
  }
  g.shown = Math.min(1, g.shown + c.dt / 1.4);
  const visible = g.mode === 'reflect' || inView(c.view, g.x, g.y);
  if (!g.counted && visible && g.shown > 0.5) {
    g.counted = true;
    res.seen = true;
  }
  return res;
}

/** Whether she can talk to it now: it's sitting by a lit pumpkin, there, and she's close. */
export function ghostApproachable(g: GhostState, px: number, py: number): boolean {
  return g.mode === 'pumpkin' && !g.going && g.shown > 0.6 && Math.hypot(g.x - px, g.y - py) < GHOST_REACH;
}

export function gameDay(totalMinutes: number): number {
  return Math.floor((totalMinutes - DAWN) / MINUTES_PER_DAY);
}

export type GhostMeeting = 'gift' | 'tilt';

/** Meeting it by a pumpkin: once a night, it leaves something. */
export function meetGhost(state: GameState, g: GhostState): GhostMeeting {
  const day = gameDay(state.clock.totalMinutes);
  const log = state.october;
  g.waving = 0;
  if (log.giftDay !== day) {
    log.giftDay = day;
    log.gifts += 1;
    return 'gift';
  }
  return 'tilt';
}

// ---------------------------------------------------------------- pumpkins

export function pickFace(rand: () => number): FaceId {
  const total = FACES.reduce((s, f) => s + f.weight, 0);
  let r = rand() * total;
  for (const f of FACES) {
    r -= f.weight;
    if (r < 0) return f.id;
  }
  return 'happy';
}

export interface CarveResult {
  face: FaceId;
  /** A face never carved before. */
  newFace: boolean;
  rare: boolean;
  /** It was already a jack-o'-lantern: a fresh pumpkin from the patch, carved anew. */
  recarved: boolean;
}

/** Carves a pumpkin into a jack-o'-lantern (or swaps a carved one for a fresh one, and carves that). */
export function carvePumpkin(state: GameState, id: string, rand: () => number): CarveResult | null {
  if (!PUMPKINS.some((p) => p.id === id)) return null;
  const log = state.october;
  const recarved = !!log.carved[id];
  const face = pickFace(rand);
  log.carved[id] = face;
  const newFace = !log.faces.includes(face);
  if (newFace) log.faces.push(face);
  return { face, newFace, rare: !!findFace(face)?.rare, recarved };
}

/** A carved pumpkin is lit from dusk to dawn. */
export function lanternsLit(darkness: number): boolean {
  return darkness > 0.35;
}

/** The game-minute of the next dawn: when a stray pumpkin is gone again. */
export function nextDawn(totalMinutes: number): number {
  const m = minuteOfDay(totalMinutes);
  return totalMinutes + (m < DAWN ? DAWN - m : MINUTES_PER_DAY - m + DAWN);
}

/** The stray pumpkin, if it's still about. */
export function strayPumpkin(state: GameState): GameState['october']['stray'] {
  const s = state.october.stray;
  return s && s.until > state.clock.totalMinutes ? s : null;
}

// ---------------------------------------------------------------- the journal

export interface NoteView {
  note: OctoberNote;
  lines: string[];
  count: number;
}

/** The journal's October page: only what's been seen, in the order it was written in. */
export function octoberNotes(state: GameState): NoteView[] {
  const seen = state.october.seen;
  const out: NoteView[] = [];
  for (const note of OCTOBER_NOTES) {
    const count = note.id === 'gift' ? state.october.gifts : seen[note.id] ?? 0;
    if (count < (note.after ?? 1)) continue;
    const lines = [note.text, ...(note.more ?? []).filter((m) => count >= m.after).map((m) => m.text)];
    out.push({ note, lines, count });
  }
  return out;
}

/** Counts one more sighting of something. Never announced. */
export function noteSeen(state: GameState, id: string) {
  state.october.seen[id] = (state.october.seen[id] ?? 0) + 1;
}

/** Everything the renderer needs to draw October this frame (absent in Classic). */
export interface OctoberView {
  events: OctoberEvent[];
  ghost: GhostState;
  pumpkins: { id: string; x: number; y: number; size: number; face: string | null; seed: number }[];
  /** The owl's perch (top of its tree), if it's out. */
  owl: { x: number; y: number; alpha: number } | null;
  /** The black cat among the pumpkins: how there it is. */
  blackCat: number;
  /** How far the lantern spider has got with its web, 0..1. */
  webGrowth: number;
  /** 1 steady … 0 out: the lanterns, flickering. */
  lanternLevel: number;
  darkness: number;
}

/** Leaves a plant where something was, the way the fox's finds are left: hidden, waiting, to be found. */
export function leaveFind(state: GameState, x: number, y: number, zone: OutdoorZoneId, defId: string, variantId: string, rand: () => number): FoxFind {
  const f: FoxFind = { id: makeUid('find'), kind: 'plant', x, y, zone, defId, variantId, seed: Math.floor(rand() * 1e9), createdAt: state.clock.totalMinutes, expiresAt: state.clock.totalMinutes + FOX_FIND_LIFETIME };
  state.foxFinds.push(f);
  return f;
}

/** What a lantern leads you to, when it leads you anywhere: something of the season, the next form along its line. */
export function pickLanternFind(state: GameState, zone: OutdoorZoneId, rand: () => number): { defId: string; variantId: string } | null {
  const options: { defId: string; variantId: string; w: number }[] = [];
  for (const def of PLANT_LIST) {
    if (def.season !== 'october' || def.secret) continue;
    for (const v of def.variants) {
      if (v.sportOnly || !variantAllowed(state, def.id, v.id)) continue;
      let w = (def.habitat.includes(zone) ? 3 : 1) / (1 + rarityRank(v.rarity));
      if (!hasFound(state, def.id, v.id)) w *= 3;
      options.push({ defId: def.id, variantId: v.id, w });
    }
  }
  const pick = weightedPick(options, (o) => o.w, rand);
  return pick ? { defId: pick.defId, variantId: pick.variantId } : null;
}
