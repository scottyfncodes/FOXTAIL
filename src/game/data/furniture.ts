import type { FurnitureId } from './shop';
import type { DisplayKind } from './stations';
import type { TurnMode } from './turn';

// What each piece of indoor furniture is and how much floor it takes up.
// Positions are free (any fraction of a tile); footprints are what collide,
// both with each other and with whoever's walking around.

export type FurnitureRole = 'nursery' | 'display' | 'lamp' | 'decor';
/** floor: stands on the floor and blocks it; overhead: hangs from the roof; flat: lies flat, walked over. */
export type FurnitureLayer = 'floor' | 'overhead' | 'flat';

export interface FurnitureDef {
  id: FurnitureId;
  name: string;
  role: FurnitureRole;
  /** How a display piece presents its plant. */
  slotKind?: DisplayKind;
  /** Footprint at rotation 0, in tiles. */
  w: number;
  h: number;
  layer: FurnitureLayer;
  /** Has its own drawing for being turned a quarter-turn (its footprint swaps). */
  rotatable?: boolean;
  /** How it turns when it has no turned drawing of its own: spun flat on the floor, or flipped (the default). */
  turn?: TurnMode;
  /** Part of the house: it can be moved but never put away. */
  fixed?: boolean;
  /** Lies flat but keeps its floor to itself (the cat's bed, the putting mat). */
  reserves?: boolean;
}

export const FURNITURE_DEFS: Record<FurnitureId, FurnitureDef> = {
  plantStand: { id: 'plantStand', name: 'Plant Stand', role: 'display', slotKind: 'stand', w: 0.56, h: 0.4, layer: 'floor' },
  sunroomStand: { id: 'sunroomStand', name: 'Sun Room Stand', role: 'display', slotKind: 'sunroom', w: 0.56, h: 0.4, layer: 'floor' },
  ironPedestal: { id: 'ironPedestal', name: 'Iron Pedestal', role: 'display', slotKind: 'pedestal', w: 0.44, h: 0.32, layer: 'floor' },
  ceilingHook: { id: 'ceilingHook', name: 'Ceiling Hook', role: 'display', slotKind: 'hanging', w: 0.4, h: 0.4, layer: 'overhead' },
  wallTrellis: { id: 'wallTrellis', name: 'Wall Trellis', role: 'display', slotKind: 'trellis', w: 0.9, h: 0.3, layer: 'floor', rotatable: true },
  wallShelf: { id: 'wallShelf', name: 'Wall Shelf', role: 'display', slotKind: 'shelf', w: 0.9, h: 0.3, layer: 'floor' },
  tieredStand: { id: 'tieredStand', name: 'Tiered Stand', role: 'display', slotKind: 'tiered', w: 0.62, h: 0.34, layer: 'floor' },
  floorPlanter: { id: 'floorPlanter', name: 'Floor Planter', role: 'display', slotKind: 'planter', w: 0.7, h: 0.5, layer: 'floor' },
  pottingTable: { id: 'pottingTable', name: 'Potting Table', role: 'display', slotKind: 'table', w: 1.3, h: 0.55, layer: 'floor', rotatable: true },
  nurseryBed: { id: 'nurseryBed', name: 'Nursery Bed', role: 'nursery', w: 0.9, h: 0.45, layer: 'floor', rotatable: true },
  growLamp: { id: 'growLamp', name: 'Grow Lamp', role: 'lamp', w: 0.32, h: 0.32, layer: 'floor' },
  wateringCan: { id: 'wateringCan', name: 'Watering Can', role: 'decor', w: 0.36, h: 0.26, layer: 'floor' },
  houseRug: { id: 'houseRug', name: 'Woven Rug', role: 'decor', w: 1.8, h: 1.2, layer: 'flat', rotatable: true },
  // The living room. Sizes match the layout in interior.ts.
  tv: { id: 'tv', name: 'TV', role: 'decor', w: 1.3, h: 0.42, layer: 'floor', fixed: true },
  couch: { id: 'couch', name: 'Couch', role: 'decor', w: 2.0, h: 0.8, layer: 'floor', fixed: true, turn: 'spin' },
  coffeeTable: { id: 'coffeeTable', name: 'Coffee Table', role: 'decor', w: 0.95, h: 0.42, layer: 'floor', fixed: true, turn: 'spin' },
  sideTable: { id: 'sideTable', name: 'Side Table', role: 'decor', w: 0.5, h: 0.5, layer: 'floor', fixed: true, turn: 'spin' },
  catTree: { id: 'catTree', name: 'Cat Tree', role: 'decor', w: 0.6, h: 0.6, layer: 'floor', fixed: true },
  catBed: { id: 'catBed', name: 'Cat Bed', role: 'decor', w: 0.75, h: 0.5, layer: 'flat', fixed: true, reserves: true, turn: 'spin' },
  puttingMat: { id: 'puttingMat', name: 'Putting Mat', role: 'decor', w: 3.8, h: 0.6, layer: 'flat', fixed: true, reserves: true, turn: 'spin' },
  rug: { id: 'rug', name: 'Living Room Rug', role: 'decor', w: 3.5, h: 2.5, layer: 'flat', fixed: true, turn: 'spin' },
  bookshelf: { id: 'bookshelf', name: 'Bookshelf', role: 'decor', w: 1.0, h: 0.42, layer: 'floor', fixed: true },
  doormat: { id: 'doormat', name: 'Doormat', role: 'decor', w: 1.5, h: 0.5, layer: 'flat', fixed: true, reserves: true, turn: 'spin' },
  coatRack: { id: 'coatRack', name: 'Coat Rack', role: 'decor', w: 0.5, h: 0.5, layer: 'floor', fixed: true },
  floorLamp: { id: 'floorLamp', name: 'Floor Lamp', role: 'decor', w: 0.35, h: 0.35, layer: 'floor', fixed: true },
  // The greenhouse's own.
  scoutBed: { id: 'scoutBed', name: 'Scout’s Bed', role: 'decor', w: 0.7, h: 0.5, layer: 'flat', fixed: true, reserves: true, turn: 'spin' },
  ellenDesk: { id: 'ellenDesk', name: 'Ellen’s Desk', role: 'decor', w: 0.7, h: 0.6, layer: 'floor', fixed: true, turn: 'spin' },
};

/** How a piece of furniture turns: on its own turned drawing, spun flat, or flipped. */
export function furnitureTurn(kind: FurnitureId): TurnMode {
  const def = FURNITURE_DEFS[kind];
  return def?.rotatable ? 'art' : def?.turn ?? 'mirror';
}

/** How far a grow lamp's light reaches, in tiles, and how much it speeds things up. */
export const GROW_LAMP_RADIUS = 2.6;
export const GROW_LAMP_BOOST = 1.3;
