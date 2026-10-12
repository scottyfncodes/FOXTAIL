import type { DiscoverySpot } from '../types';

// Hand-placed patches of ground where wild plants turn up. What grows in a
// patch is re-rolled every SPOT_EPOCH_MINUTES (see systems/spots.ts), drawn
// from the region's own species, weighted by rarity — so walking a familiar
// path can still turn up something you've never seen. A few patches are
// only ever shown to you by the fox.

/** The patches the world's obstacles were laid out around (see world/Obstacles.ts). */
export const LAYOUT_SPOTS: DiscoverySpot[] = [
  // Meadow — right outside the greenhouse: the easy, friendly finds.
  { id: 'sp-meadow-home', zone: 'meadow', x: 62, y: 45 },
  { id: 'sp-meadow-1', zone: 'meadow', x: 58, y: 42 },
  { id: 'sp-meadow-2', zone: 'meadow', x: 73, y: 44 },
  { id: 'sp-meadow-3', zone: 'meadow', x: 62, y: 28 },
  { id: 'sp-meadow-4', zone: 'meadow', x: 76, y: 33 },
  { id: 'sp-meadow-5', zone: 'meadow', x: 84, y: 40 },
  { id: 'sp-meadow-6', zone: 'meadow', x: 52, y: 30 },
  { id: 'sp-meadow-7', zone: 'meadow', x: 81, y: 27 },
  { id: 'sp-meadow-8', zone: 'meadow', x: 49, y: 38 },

  // Woodland
  { id: 'sp-wood-1', zone: 'woodland', x: 10, y: 10 },
  { id: 'sp-wood-2', zone: 'woodland', x: 25, y: 20 },
  { id: 'sp-wood-3', zone: 'woodland', x: 18, y: 8 },
  { id: 'sp-wood-4', zone: 'woodland', x: 30, y: 25 },
  { id: 'sp-wood-5', zone: 'woodland', x: 6, y: 22 },
  { id: 'sp-wood-6', zone: 'woodland', x: 33, y: 12 },
  { id: 'sp-wood-fox', zone: 'woodland', x: 21, y: 16, foxLed: true, pool: ['foxglowAroid'] },

  // Creek banks
  { id: 'sp-creek-1', zone: 'creek', x: 39, y: 20 },
  { id: 'sp-creek-2', zone: 'creek', x: 44, y: 30 },
  { id: 'sp-creek-3', zone: 'creek', x: 39, y: 40 },
  { id: 'sp-creek-4', zone: 'creek', x: 45, y: 8 },
  { id: 'sp-creek-5', zone: 'creek', x: 44, y: 57 },

  // Damp Forest
  { id: 'sp-damp-1', zone: 'dampForest', x: 55, y: 15 },
  { id: 'sp-damp-2', zone: 'dampForest', x: 65, y: 18 },
  { id: 'sp-damp-3', zone: 'dampForest', x: 70, y: 10 },
  { id: 'sp-damp-4', zone: 'dampForest', x: 80, y: 6 },
  { id: 'sp-damp-5', zone: 'dampForest', x: 85, y: 18 },
  { id: 'sp-damp-6', zone: 'dampForest', x: 50, y: 21 },
  { id: 'sp-damp-fox', zone: 'dampForest', x: 76, y: 14, foxLed: true, pool: ['foxglowAroid'] },

  // Rocky Clearing
  { id: 'sp-rock-1', zone: 'rockyClearing', x: 55, y: 55 },
  { id: 'sp-rock-2', zone: 'rockyClearing', x: 62, y: 50 },
  { id: 'sp-rock-3', zone: 'rockyClearing', x: 75, y: 58 },
  { id: 'sp-rock-4', zone: 'rockyClearing', x: 83, y: 52 },
  { id: 'sp-rock-5', zone: 'rockyClearing', x: 68, y: 61 },
  { id: 'sp-rock-6', zone: 'rockyClearing', x: 50, y: 60 },

  // Overgrown Clearing
  { id: 'sp-over-1', zone: 'overgrownClearing', x: 10, y: 45 },
  { id: 'sp-over-2', zone: 'overgrownClearing', x: 20, y: 55 },
  { id: 'sp-over-3', zone: 'overgrownClearing', x: 15, y: 38 },
  { id: 'sp-over-4', zone: 'overgrownClearing', x: 6, y: 58 },
  { id: 'sp-over-5', zone: 'overgrownClearing', x: 32, y: 40 },
  { id: 'sp-over-fox', zone: 'overgrownClearing', x: 28, y: 50, foxLed: true, pool: ['anthurium'] },
];

// Patches added once the cacti and succulents moved into the Rocky Clearing.
// They sit on ground the obstacle layout already left clear, and are kept out
// of that layout's keepouts so existing saves don't see the rocks reshuffle.
const LATER_SPOTS: DiscoverySpot[] = [
  { id: 'sp-rock-7', zone: 'rockyClearing', x: 78, y: 48 },
  { id: 'sp-rock-8', zone: 'rockyClearing', x: 69, y: 52 },
  { id: 'sp-rock-9', zone: 'rockyClearing', x: 86, y: 57 },
  { id: 'sp-rock-10', zone: 'rockyClearing', x: 59, y: 60 },
  { id: 'sp-rock-11', zone: 'rockyClearing', x: 54, y: 50 },
];

// The Giants' own patches, one for each, in its home country. Like the
// later patches they sit on ground the layout already left clear. Nothing
// shows in them until the Giants have woken (see systems/giants.ts).
export const GIANT_SPOTS: DiscoverySpot[] = [
  { id: 'sp-giant-treeFern', zone: 'dampForest', x: 61, y: 5, pool: ['treeFern'], giant: true },
  { id: 'sp-giant-elephantEar', zone: 'creek', x: 38, y: 30, pool: ['giantElephantEar'], giant: true },
  { id: 'sp-giant-reed', zone: 'overgrownClearing', x: 24, y: 33, pool: ['giantReed'], giant: true },
  { id: 'sp-giant-gunnera', zone: 'creek', x: 45, y: 45, pool: ['giantGunnera'], giant: true },
  { id: 'sp-giant-canna', zone: 'meadow', x: 71, y: 25, pool: ['giantCanna'], giant: true },
  { id: 'sp-giant-hosta', zone: 'woodland', x: 26, y: 9, pool: ['titanHosta'], giant: true },
];

export const DISCOVERY_SPOTS: DiscoverySpot[] = [...LAYOUT_SPOTS, ...LATER_SPOTS, ...GIANT_SPOTS];

/** Game-minutes per spot "season": a picked patch regrows (as something new) after this. */
export const SPOT_EPOCH_MINUTES = 360;
