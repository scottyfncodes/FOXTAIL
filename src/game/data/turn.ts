// How a piece turns when you rotate it, by what its art can show.
//
//  · 'art'    — it has a drawing of its own for being turned a quarter-turn
//               (a bed, a bench, a fence, the potting table): four turns,
//               the second pair mirrored.
//  · 'spin'   — it lies low and flat enough to simply spin on the floor (a
//               rug, the couch, a table, a pet bed): four quarter-turns.
//  · 'mirror' — it stands up (a lamp, the TV, a stand, the stall): turning it
//               the other way round flips it to face the other side, and its
//               footprint stays as it is.
//
// `rot` is stored as 0–3 quarter-turns; 'mirror' pieces use only 0 and 2.

export type TurnMode = 'art' | 'spin' | 'mirror';

/** The next turn when you press rotate. */
export function nextRot(mode: TurnMode, rot = 0): number {
  if (mode === 'mirror') return (rot ?? 0) >= 2 ? 0 : 2;
  return ((rot ?? 0) + 1) % 4;
}

/** Whether a turn swaps the piece's footprint (it's lying the other way). */
export function swapsFootprint(mode: TurnMode, rot = 0): boolean {
  return mode !== 'mirror' && (rot ?? 0) % 2 === 1;
}

/** Keeps a stored turn to what the piece can do. */
export function normalRot(mode: TurnMode, rot = 0): number {
  const r = (((rot ?? 0) % 4) + 4) % 4;
  return mode === 'mirror' ? (r >= 2 ? 2 : 0) : r;
}

/**
 * Where a point on a turned piece ends up, given as an offset from the
 * piece's centre: spun round for 'spin', mirrored side to side for the
 * second pair of turns otherwise.
 */
export function turnOffset(mode: TurnMode, rot: number, dx: number, dy: number): { dx: number; dy: number } {
  const r = normalRot(mode, rot);
  if (mode === 'spin') {
    if (r === 1) return { dx: -dy, dy: dx };
    if (r === 2) return { dx: -dx, dy };
    if (r === 3) return { dx: dy, dy: -dx };
    return { dx, dy };
  }
  return r >= 2 ? { dx: -dx, dy } : { dx, dy };
}
