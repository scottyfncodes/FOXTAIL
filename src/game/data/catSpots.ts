import { turnOffset, type TurnMode } from './turn';
// Interior tile coords (greenhouse and living room share one space — see
// interior.ts). The cat never goes outside. Kept clear of the fixed
// greenhouse stations and Scott's own spots so nobody visually overlaps.

export type CatSpotKind = 'perch' | 'sleep' | 'groom';

export interface CatSpot {
  id: string;
  kind: CatSpotKind;
  x: number;
  y: number;
  /** He's up on something here (the couch, a table, the TV): drawn raised, and in front of it. */
  lift?: number;
  /** Relative odds of picking this spot (default 1). Odd places are rare. */
  weight?: number;
  /** The living-room piece this spot belongs to: move it and the spot moves with it. */
  anchor?: string;
}

/**
 * How a piece of furniture has moved from its original place: how far, and,
 * if it's been turned, which way and about what centre (in its original
 * place), so spots on it turn with it.
 */
export interface AnchorShift {
  dx: number;
  dy: number;
  rot?: number;
  turn?: TurnMode;
  cx?: number;
  cy?: number;
}
export type AnchorOffset = (fixtureId: string) => AnchorShift;

/** Where a spot is right now, following the piece it belongs to — moved, and turned with it. */
export function spotPosition(spot: { x: number; y: number; anchor?: string }, offset?: AnchorOffset): { x: number; y: number } {
  if (!spot.anchor || !offset) return { x: spot.x, y: spot.y };
  const { dx, dy, rot, turn, cx, cy } = offset(spot.anchor);
  if (rot && turn && cx !== undefined && cy !== undefined) {
    const t = turnOffset(turn, rot, spot.x - cx, spot.y - cy);
    return { x: cx + t.dx + dx, y: cy + t.dy + dy };
  }
  return { x: spot.x + dx, y: spot.y + dy };
}

export const CAT_SPOTS: CatSpot[] = [
  // Greenhouse
  { id: 'sunny-perch', kind: 'perch', x: 16, y: 5 },
  { id: 'growbed-nap', kind: 'sleep', x: 4, y: 4, weight: 0.6 },
  { id: 'bench-groom', kind: 'groom', x: 13, y: 5 },
  { id: 'shelf-perch', kind: 'perch', x: 15.4, y: 7.1 },
  { id: 'door-sun-nap', kind: 'sleep', x: 8, y: 10 },
  // Living room
  { id: 'couch-nap', kind: 'sleep', x: 21.95, y: 3.5, lift: 0.22, weight: 1.6, anchor: 'lr-couch' },
  { id: 'cat-bed', kind: 'sleep', x: 25.15, y: 6.15, weight: 1.3, anchor: 'lr-catbed' },
  { id: 'window-perch', kind: 'perch', x: 25.35, y: 4.15, lift: 0.3 },
  { id: 'cattree-base', kind: 'groom', x: 25.3, y: 2.35, anchor: 'lr-cattree' },
  { id: 'rug-groom', kind: 'groom', x: 21.1, y: 4.6, anchor: 'lr-rug' },
  { id: 'coffee-table', kind: 'perch', x: 21.35, y: 2.42, lift: 0.28, weight: 0.35, anchor: 'lr-coffee' },
  { id: 'tv-top', kind: 'sleep', x: 21.35, y: 1.0, lift: 0.52, weight: 0.2, anchor: 'lr-tv' },
  { id: 'putting-mat', kind: 'groom', x: 22.1, y: 8.75, weight: 0.4, anchor: 'lr-putting' },
];

export function findCatSpot(id: string): CatSpot | undefined {
  return CAT_SPOTS.find((s) => s.id === id);
}
