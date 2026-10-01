// Greenhouse interior layout, in greenhouse tile coordinates.
//
// The room is part nursery, part gallery: nursery beds on the left are
// where cuttings root and young plants grow up; display spots on the right
// are the player's permanent, curated collection. Some spots only exist
// once the matching upgrade has been bought at the market.

export const GREENHOUSE_GRID_W = 18;
export const GREENHOUSE_GRID_H = 12;
export const GREENHOUSE_EXIT = { x: 9, y: 11 };
/** The back door (north wall) and side door (west wall), from inside. */
export const GREENHOUSE_BACK_EXIT = { x: 9, y: 0 };
export const GREENHOUSE_SIDE_EXIT = { x: 0, y: 4 };

export interface NurseryBed {
  id: string;
  x: number;
  y: number;
  requires?: string;
}

export type DisplayKind = 'stand' | 'hanging' | 'shelf' | 'tiered' | 'sunroom' | 'pedestal' | 'trellis' | 'planter' | 'table';

export interface DisplaySlot {
  id: string;
  x: number;
  y: number;
  kind: DisplayKind;
  requires?: string;
}

export const NURSERY_BEDS: NurseryBed[] = [
  { id: 'bed1', x: 2, y: 2 },
  { id: 'bed2', x: 4, y: 2 },
  { id: 'bed3', x: 2, y: 4 },
  { id: 'bed4', x: 4, y: 4 },
  // The old two-bed upgrades are no longer sold, but beds already bought with them stay.
  { id: 'bed5', x: 6, y: 2, requires: 'nurseryBeds' },
  { id: 'bed6', x: 6, y: 4, requires: 'nurseryBeds' },
  { id: 'bed7', x: 4, y: 6, requires: 'moreNurseryBeds' },
  { id: 'bed8', x: 6, y: 6, requires: 'moreNurseryBeds' },
  // The potting annex: a row along the north glass.
  { id: 'annex1', x: 1, y: 0.9, requires: 'pottingAnnex' },
  { id: 'annex2', x: 3, y: 0.9, requires: 'pottingAnnex' },
  { id: 'annex3', x: 5, y: 0.9, requires: 'pottingAnnex' },
  { id: 'annex4', x: 7, y: 0.9, requires: 'pottingAnnex' },
];

export const DISPLAY_SLOTS: DisplaySlot[] = [
  { id: 'stand1', x: 10, y: 3, kind: 'stand' },
  { id: 'stand2', x: 12, y: 3, kind: 'stand' },
  { id: 'stand3', x: 14, y: 3, kind: 'stand' },
  { id: 'stand4', x: 10, y: 6, kind: 'stand' },
  { id: 'stand5', x: 12, y: 6, kind: 'stand' },
  { id: 'stand6', x: 14, y: 6, kind: 'stand' },
  { id: 'hang1', x: 10, y: 1, kind: 'hanging', requires: 'hangingHooks' },
  { id: 'hang2', x: 12, y: 1, kind: 'hanging', requires: 'hangingHooks' },
  { id: 'hang3', x: 14, y: 1, kind: 'hanging', requires: 'hangingHooks' },
  { id: 'shelf1', x: 1, y: 6, kind: 'shelf', requires: 'plantShelf' },
  { id: 'shelf2', x: 1, y: 7, kind: 'shelf', requires: 'plantShelf' },
  { id: 'shelf3', x: 1, y: 8, kind: 'shelf', requires: 'plantShelf' },
  { id: 'tier1', x: 16, y: 2, kind: 'tiered', requires: 'tieredStand' },
  { id: 'tier2', x: 16, y: 4, kind: 'tiered', requires: 'tieredStand' },
  { id: 'tier3', x: 16, y: 6, kind: 'tiered', requires: 'tieredStand' },
  { id: 'sun1', x: 13, y: 8, kind: 'sunroom', requires: 'sunRoom' },
  { id: 'sun2', x: 15, y: 8, kind: 'sunroom', requires: 'sunRoom' },
  { id: 'sun3', x: 14, y: 10, kind: 'sunroom', requires: 'sunRoom' },
  { id: 'sun4', x: 16, y: 10, kind: 'sunroom', requires: 'sunRoom' },
  // The orangery: a row along the south glass, west of the garden door.
  { id: 'orang1', x: 2, y: 10, kind: 'pedestal', requires: 'orangery' },
  { id: 'orang2', x: 4, y: 10, kind: 'pedestal', requires: 'orangery' },
  { id: 'orang3', x: 6, y: 10, kind: 'pedestal', requires: 'orangery' },
  { id: 'orang4', x: 8, y: 9.4, kind: 'planter', requires: 'orangery' },
];

/** Stacked junk that fills the sun room until it's cleared out and fitted. */
export const STORAGE_CRATES = [
  { x: 13, y: 8 },
  { x: 15, y: 8 },
  { x: 14, y: 10 },
  { x: 16, y: 10 },
];

// Ground-level set dressing solid enough that walking through it should be
// blocked. Not interactable — just furniture that makes the room lived-in.
export const GREENHOUSE_FURNITURE = [
  { id: 'scoutBed', x: 7, y: 9 },
  { id: 'ellenDesk', x: 11, y: 9 },
] as const;
