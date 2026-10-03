import type { Facing } from '../state';
import type { ZoneId } from '../types';

export type ScottSpotKind =
  | 'tinker'
  | 'nap'
  | 'snack'
  | 'golf'
  | 'putt'
  | 'tv'
  | 'drink'
  | 'fish'
  | 'chop'
  | 'bake'
  | 'wrench'
  | 'drive'
  // Not fixed places: the truck, wherever Ellen left it, and company —
  // Ranger, Scout, or Ellen herself, wherever they are.
  | 'pet'
  | 'scout'
  | 'ellen';

export interface ScottSpot {
  id: string;
  kind: ScottSpotKind;
  zone: ZoneId;
  /** Overworld tile coords for outdoor zones, interior tile coords (greenhouse + living room) for the 'greenhouse' zone. */
  x: number;
  y: number;
  /** The living-room piece this spot belongs to: move it and the spot moves with it. */
  anchor?: string;
  /** Which way he faces once he's there, when it isn't the usual. */
  face?: Facing;
}

/**
 * His drive, in Ellen's truck: out across the meadow, along under the damp
 * forest, round by the creek and back the way he came — then home to
 * wherever she'd left it parked. Open grass the whole way: no rocks, no
 * house, nobody's stall.
 */
export const DRIVE_LOOP: { x: number; y: number }[] = (() => {
  const out = [
    { x: 85, y: 39 },
    { x: 85, y: 28 },
    { x: 70, y: 27 },
    { x: 55, y: 27.5 },
    { x: 49, y: 33 },
    { x: 51, y: 42 },
  ];
  return [...out, ...out.slice(0, -1).reverse()];
})();

// Ellen's husband doesn't follow anyone — he potters between a handful of
// favorite spots around the garden, the wilderness, and the house,
// each tied to one of his moods — including a patch of meadow he's quietly
// turned into a driving range, and a putting green by the greenhouse. He's a
// jack of all trades, master of a few: he fishes the creek, splits firewood
// in the woods, keeps the truck running (and borrows it for a drive),
// and every so often bakes a loaf of bread. Adding a new spot (or a new zone
// for him to loaf around in) is just a data entry, same as everything else.
export const SCOTT_SPOTS: ScottSpot[] = [
  { id: 'meadow-garden-tinker', kind: 'tinker', zone: 'meadow', x: 58, y: 44 },
  { id: 'meadow-snack', kind: 'snack', zone: 'meadow', x: 52, y: 36 },
  { id: 'woodland-snack', kind: 'snack', zone: 'woodland', x: 25, y: 8 },
  { id: 'overgrown-snack', kind: 'snack', zone: 'overgrownClearing', x: 20, y: 45 },
  { id: 'meadow-driving-range', kind: 'golf', zone: 'meadow', x: 79, y: 36 },
  { id: 'meadow-putting-green', kind: 'putt', zone: 'meadow', x: 54, y: 41 },
  { id: 'rocky-chipping', kind: 'golf', zone: 'rockyClearing', x: 71, y: 57 },
  // A quiet bend of the creek, rod out over the water.
  { id: 'creek-fishing', kind: 'fish', zone: 'creek', x: 45, y: 30, face: 'left' },
  // The chopping block and woodpile in the woods.
  { id: 'woodland-woodpile', kind: 'chop', zone: 'woodland', x: 29, y: 22 },
  { id: 'greenhouse-tinker', kind: 'tinker', zone: 'greenhouse', x: 8, y: 7 },
  { id: 'greenhouse-snack', kind: 'snack', zone: 'greenhouse', x: 9, y: 4 },
  // The living room: the ball game on the couch, a drink with his feet up,
  // the putting mat when it's raining — and the only place he naps,
  // stretched out along the couch.
  { id: 'living-couch-tv', kind: 'tv', zone: 'greenhouse', x: 21.35, y: 3.5, anchor: 'lr-couch' },
  { id: 'living-couch-drink', kind: 'drink', zone: 'greenhouse', x: 20.8, y: 3.5, anchor: 'lr-couch' },
  { id: 'living-couch-nap', kind: 'nap', zone: 'greenhouse', x: 21.35, y: 3.5, anchor: 'lr-couch' },
  { id: 'living-putting', kind: 'putt', zone: 'greenhouse', x: 19.7, y: 8.55, anchor: 'lr-putting' },
  // In the kitchen doorway, kneading a loaf.
  { id: 'kitchen-bake', kind: 'bake', zone: 'greenhouse', x: 18.95, y: 1.35 },
];

/** Spots where he's sitting on the couch, seen from behind. */
export function isCouchSpot(id: string | null): boolean {
  return id === 'living-couch-tv' || id === 'living-couch-drink';
}

/** Stretched out asleep along the couch. */
export function isCouchNap(id: string | null): boolean {
  return id === 'living-couch-nap';
}

/** Spots that are someone's company rather than a place, offered fresh each moment (see `companySpots`). The truck's own spots come from `truckSpots`. */
export const VISIT_KINDS: ScottSpotKind[] = ['pet', 'scout', 'ellen'];

export function findScottSpot(id: string): ScottSpot | undefined {
  return SCOTT_SPOTS.find((s) => s.id === id);
}
