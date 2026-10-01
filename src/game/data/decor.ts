import { RAISED_BED, type DecorId } from './shop';

// What each piece of garden decor is and how much ground it stands on, the
// way furniture.ts does for the house. Pieces that are longer one way than
// the other can be turned a quarter-turn (their footprint swaps), so a bench
// can face the path and a fence can run either way along a bed.

export interface DecorDef {
  id: DecorId;
  /** Footprint at rotation 0, in tiles. */
  w: number;
  h: number;
  /** Where the piece's stored point sits in its footprint: at its base (most things stand) or in the middle (a pond is dug). */
  anchor: 'base' | 'centre';
  /** Can be turned a quarter-turn. */
  rotatable?: boolean;
}

/**
 * The flagstones down from the front door are the pattern every stepping
 * stone is cut to: the same size, the same spacing, the same zigzag.
 * Offsets are in tiles; `stagger` alternates stone by stone across the run.
 */
export const FLAGSTONE = { rx: 0.26, ry: 0.15, spacing: 0.62, stagger: [-0.1, 0.12] as const, colors: ['#b3ab96', '#a39c8a'] as const };
/** Stones in each shop piece: even, so one piece's zigzag picks up exactly where the last left off. */
export const STONES_PER_PIECE = 2;
/** The ground one piece of stepping stones covers, along the run and across it. */
export const STONE_PIECE = {
  w: FLAGSTONE.spacing * (STONES_PER_PIECE - 1) + FLAGSTONE.rx * 2,
  h: FLAGSTONE.ry * 2 + (FLAGSTONE.stagger[1] - FLAGSTONE.stagger[0]),
};

export const DECOR_DEFS: Record<DecorId, DecorDef> = {
  raisedBed: { id: 'raisedBed', w: RAISED_BED.w, h: RAISED_BED.h, anchor: 'centre', rotatable: true },
  steppingStones: { id: 'steppingStones', w: STONE_PIECE.w, h: STONE_PIECE.h, anchor: 'base', rotatable: true },
  picketFence: { id: 'picketFence', w: 1.0, h: 0.35, anchor: 'base', rotatable: true },
  gardenLantern: { id: 'gardenLantern', w: 0.4, h: 0.4, anchor: 'base' },
  birdbath: { id: 'birdbath', w: 0.6, h: 0.45, anchor: 'base' },
  gardenBench: { id: 'gardenBench', w: 0.95, h: 0.45, anchor: 'base', rotatable: true },
  gardenTrellis: { id: 'gardenTrellis', w: 0.9, h: 0.4, anchor: 'base', rotatable: true },
  pergola: { id: 'pergola', w: 1.7, h: 1.0, anchor: 'base', rotatable: true },
  gardenPond: { id: 'gardenPond', w: 2.2, h: 1.5, anchor: 'centre', rotatable: true },
};

/** A piece's footprint size once turned `rot` quarter-turns. */
export function decorSize(id: DecorId, rot = 0): { w: number; h: number } {
  const def = DECOR_DEFS[id];
  const turned = !!def.rotatable && rot % 2 === 1;
  return turned ? { w: def.h, h: def.w } : { w: def.w, h: def.h };
}

export function decorRotatable(id: DecorId): boolean {
  return !!DECOR_DEFS[id].rotatable;
}
