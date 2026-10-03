import type { ZoneId } from '../types';

// A single compact overworld grid divided into rectangular zone regions,
// plus a creek band running north-south through the middle. Coordinates are
// in tiles; TILE_SIZE (px) lives in the renderer/camera.

export const GRID_W = 90;
export const GRID_H = 64;
export const TILE_SIZE = 32;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const CREEK_BAND: Rect = { x: 38, y: 0, w: 8, h: GRID_H };
export const CREEK_WATER: Rect = { x: 40, y: 0, w: 4, h: GRID_H };
export const BRIDGES: Rect[] = [
  { x: 40, y: 13, w: 4, h: 3 },
  { x: 40, y: 49, w: 4, h: 3 },
];

export const ZONE_RECTS: { zone: ZoneId; rect: Rect }[] = [
  { zone: 'woodland', rect: { x: 0, y: 0, w: 38, h: 30 } },
  { zone: 'overgrownClearing', rect: { x: 0, y: 30, w: 38, h: 34 } },
  { zone: 'dampForest', rect: { x: 46, y: 0, w: 44, h: 24 } },
  { zone: 'meadow', rect: { x: 46, y: 24, w: 44, h: 22 } },
  { zone: 'rockyClearing', rect: { x: 46, y: 46, w: 44, h: 18 } },
];

export const GREENHOUSE_FOOTPRINT: Rect = { x: 60, y: 32, w: 10, h: 8 };
/** The garden door: the greenhouse opens straight onto the garden. */
export const GREENHOUSE_DOOR = { x: 65, y: 40 };
/** The back door, in the north glass: out toward the damp forest. */
export const GREENHOUSE_BACK_DOOR = { x: 65, y: 31 };
/** The side door, in the west glass: out toward the creek. */
export const GREENHOUSE_SIDE_DOOR = { x: 59, y: 35 };
/**
 * The house the greenhouse is attached to: a third of the building, on its
 * east side. Its front door opens into the living room.
 */
export const HOUSE_FOOTPRINT: Rect = { x: 70, y: 32, w: 5, h: 8 };
export const HOUSE_DOOR = { x: 72, y: 40 };
export const PLAYER_START = { x: 65, y: 43 };
/** The Plant Stand & Supply stall: two tiles wide, just down the path from home. */
export const MARKET_STALL: Rect = { x: 69, y: 42, w: 2, h: 1 };

export function rectContains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

function inBridge(x: number, y: number): boolean {
  return BRIDGES.some((b) => rectContains(b, x, y));
}

export function isWater(x: number, y: number): boolean {
  if (!rectContains(CREEK_WATER, x, y)) return false;
  return !inBridge(x, y);
}

export function isInsideGreenhouseFootprint(x: number, y: number): boolean {
  return rectContains(GREENHOUSE_FOOTPRINT, x, y) || rectContains(HOUSE_FOOTPRINT, x, y);
}

/** True on the tiles the building stands on, including the house. */
export function isInsideHomeFootprint(x: number, y: number): boolean {
  return isInsideGreenhouseFootprint(x, y);
}

/** The building with a little clearance round it: nobody walks through, or over, the house. */
const HOME_KEEPOUT: Rect = { x: GREENHOUSE_FOOTPRINT.x - 0.6, y: GREENHOUSE_FOOTPRINT.y - 0.6, w: GREENHOUSE_FOOTPRINT.w + HOUSE_FOOTPRINT.w + 1.2, h: GREENHOUSE_FOOTPRINT.h + 1.2 };

/**
 * The same, for the truck: it's long side-on and drawn standing up off the
 * ground, so it keeps further off — well clear at the sides and along the
 * front, where its cab would otherwise rise up over the glass.
 */
export const TRUCK_KEEPOUT: Rect = { x: HOME_KEEPOUT.x - 1.2, y: HOME_KEEPOUT.y - 0.4, w: HOME_KEEPOUT.w + 2.4, h: HOME_KEEPOUT.h + 1.7 };

function inRect(r: Rect, x: number, y: number): boolean {
  return x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
}

/** Whether the straight line between two points crosses the rectangle. */
export function segmentHitsRect(r: Rect, ax: number, ay: number, bx: number, by: number): boolean {
  if (inRect(r, ax, ay) || inRect(r, bx, by)) return true;
  // Liang–Barsky clipping: any part of the segment inside the box?
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const checks: [number, number][] = [
    [-dx, ax - r.x],
    [dx, r.x + r.w - ax],
    [-dy, ay - r.y],
    [dy, r.y + r.h - ay],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * Where to head next on the way from (fx, fy) to (tx, ty) outdoors: straight
 * there, unless the house is in the way, in which case the nearest corner
 * of it to go round. Used by Scott and the fox, who otherwise walk in
 * straight lines and ended up on the roof.
 */
export function outdoorWaypoint(fx: number, fy: number, tx: number, ty: number, keepout: Rect = HOME_KEEPOUT): { x: number; y: number } {
  const r = keepout;
  if (!segmentHitsRect(r, fx, fy, tx, ty)) return { x: tx, y: ty };
  const m = 0.5;
  const corners = [
    { x: r.x - m, y: r.y - m },
    { x: r.x + r.w + m, y: r.y - m },
    { x: r.x - m, y: r.y + r.h + m },
    { x: r.x + r.w + m, y: r.y + r.h + m },
  ];
  // Shortest route through the corners: from → corner(s) → to, over a tiny graph.
  const nodes = [{ x: fx, y: fy }, ...corners, { x: tx, y: ty }];
  const n = nodes.length;
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  const best = new Array(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array(n).fill(false);
  best[0] = 0;
  for (let k = 0; k < n; k++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u === -1 || best[i] < best[u])) u = i;
    if (u === -1 || best[u] === Infinity) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v] || segmentHitsRect(r, nodes[u].x, nodes[u].y, nodes[v].x, nodes[v].y)) continue;
      const d = best[u] + dist(nodes[u], nodes[v]);
      if (d < best[v]) {
        best[v] = d;
        prev[v] = u;
      }
    }
  }
  // Walk back from the destination to find the first step after the start.
  let step = n - 1;
  if (prev[step] === -1) return { x: tx, y: ty };
  while (prev[step] !== 0 && prev[step] !== -1) step = prev[step];
  return nodes[step];
}

/**
 * Where someone on foot heads next from (fx, fy) toward (tx, ty) outdoors:
 * round the house, and over a bridge if the creek is in the way — nobody
 * wades across it. Picks whichever bridge makes the shorter walk.
 */
export function overlandWaypoint(fx: number, fy: number, tx: number, ty: number): { x: number; y: number } {
  const side = (x: number) => (x < CREEK_WATER.x + CREEK_WATER.w / 2 ? -1 : 1);
  const mid = (b: Rect) => b.y + b.h / 2;
  const overWater = (x: number) => x > CREEK_WATER.x && x < CREEK_WATER.x + CREEK_WATER.w;
  // Out on a bridge, bound for the bank: walk off its end first, rather than
  // stepping off the side into the creek.
  if (overWater(fx) && !overWater(tx)) {
    const deck = BRIDGES.find((b) => fy >= b.y - 0.3 && fy <= b.y + b.h + 0.3);
    if (deck) {
      const end = { x: side(tx) < 0 ? deck.x - 0.8 : deck.x + deck.w + 0.8, y: Math.min(deck.y + deck.h - 0.5, Math.max(deck.y + 0.5, fy)) };
      if (Math.abs(fx - end.x) > 0.3) return end;
    }
  }
  if (side(fx) === side(tx)) return outdoorWaypoint(fx, fy, tx, ty);
  const bridge = [...BRIDGES].sort((a, b) => Math.abs(mid(a) - fy) + Math.abs(mid(a) - ty) - (Math.abs(mid(b) - fy) + Math.abs(mid(b) - ty)))[0];
  const by = mid(bridge);
  // On the deck already, or lined up square at its end: straight across. Anywhere
  // else near it, first line up, so nobody cuts the corner through the water.
  const onDeck = fx >= bridge.x && fx <= bridge.x + bridge.w && Math.abs(fy - by) < 1.3;
  const atEnd = fx >= bridge.x - 0.5 && fx <= bridge.x + bridge.w + 0.5 && Math.abs(fy - by) < 0.3;
  const onBridge = onDeck || atEnd;
  if (onBridge) return { x: side(fx) < 0 ? bridge.x + bridge.w + 0.8 : bridge.x - 0.8, y: by };
  const entry = { x: side(fx) < 0 ? bridge.x - 0.3 : bridge.x + bridge.w + 0.3, y: by };
  return outdoorWaypoint(fx, fy, entry.x, entry.y);
}

export function zoneAt(x: number, y: number): ZoneId {
  if (isInsideGreenhouseFootprint(x, y)) return 'greenhouse';
  if (rectContains(CREEK_BAND, x, y)) return 'creek';
  for (const { zone, rect } of ZONE_RECTS) {
    if (rectContains(rect, x, y)) return zone;
  }
  return 'meadow';
}

export function isInBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
}
