import type { GameState } from '../state';
import { PLANT_LIST } from '../data/plants';
import { stageIndexOf } from './growth';

// The Giants: six plants on another scale (data/plants.ts), each with a
// wild patch of its own (data/discoveryPoints.ts GIANT_SPOTS). Their
// patches stay bare until the Giants wake, which they do the first time
// one of your own plants out in the valley grows large: a garden that's
// taken hold draws them in. Once woken they stay woken.

export const GIANTS = PLANT_LIST.filter((p) => p.giant);

export function giantsAwake(state: Pick<GameState, 'giantsAwakeAt'>): boolean {
  return state.giantsAwakeAt != null;
}

/** Whether your garden has grown enough to wake them: a plant you set out, grown large. */
export function readyToWake(state: GameState): boolean {
  for (const p of Object.values(state.plants)) {
    if (p.location.kind === 'wild' && !p.bornWild && stageIndexOf(p.growth) >= 3) return true;
  }
  return false;
}

/** Wakes the Giants if it's time. Returns true only the moment they wake. */
export function wakeGiants(state: GameState, now: number): boolean {
  if (giantsAwake(state) || !readyToWake(state)) return false;
  state.giantsAwakeAt = now;
  return true;
}

export interface GiantTotals {
  /** Species with a form grown (in the journal). */
  grown: number;
  total: number;
  /** Forms grown, of all the Giants' forms. */
  forms: number;
  totalForms: number;
  /** Species that have grown a Titan of yours. */
  titans: number;
}

export function giantTotals(state: Pick<GameState, 'collection'>): GiantTotals {
  let grown = 0;
  let forms = 0;
  let totalForms = 0;
  let titans = 0;
  for (const def of GIANTS) {
    const rec = state.collection[def.id];
    const g = def.variants.filter((v) => rec?.grownVariants?.includes(v.id)).length;
    totalForms += def.variants.length;
    forms += g;
    if (g > 0) grown++;
    if (rec?.titan) titans++;
  }
  return { grown, total: GIANTS.length, forms, totalForms, titans };
}
