import type { GameState } from '../state';
import type { VariantDef } from '../types';
import { PLANTS, PLANT_LIST } from '../data/plants';
import { hasFound } from './collection';

/**
 * Every species' variants form a line: the everyday form first, then
 * each rarer one after the last. A form can only turn up — wild, at the
 * end of a trail, or as a sport — once the one before it has been found,
 * and a sport only ever takes the next step: a cutting from the second
 * form may come out as the third, never as the fourth.
 */

/** Where a variant sits in its species' line. 0 is the everyday form; -1 if unknown. */
export function variantIndex(defId: string, variantId: string): number {
  return PLANTS[defId]?.variants.findIndex((v) => v.id === variantId) ?? -1;
}

/** The form after this one in its species' line, if there is one. */
export function nextInLine(defId: string, fromVariantId: string): VariantDef | null {
  const def = PLANTS[defId];
  if (!def) return null;
  const i = variantIndex(defId, fromVariantId);
  return i >= 0 ? def.variants[i + 1] ?? null : null;
}

/** The first form of a species not yet found: the only one that can turn up next. Past the end once all are found. */
export function nextVariantIndex(state: GameState, defId: string): number {
  const def = PLANTS[defId];
  if (!def) return 0;
  const i = def.variants.findIndex((v) => !hasFound(state, defId, v.id));
  return i === -1 ? def.variants.length : i;
}

/** Whether this form can be found now: everything before it in the line has been. */
export function variantAllowed(state: GameState, defId: string, variantId: string): boolean {
  const i = variantIndex(defId, variantId);
  return i >= 0 && i <= nextVariantIndex(state, defId);
}

/** The forms of a species still waiting to be found, in the order they'll come. */
export function variantsAhead(state: GameState, defId: string): VariantDef[] {
  const def = PLANTS[defId];
  return def ? def.variants.slice(nextVariantIndex(state, defId)) : [];
}

/** The species the journal lists: everything that isn't a secret. */
export function listedSpecies() {
  return PLANT_LIST.filter((p) => !p.secret && !p.unlisted);
}

/** Every listed species, and every form of each, has been found. Only then does anything else grow here. */
export function everythingFound(state: GameState): boolean {
  return listedSpecies().every((p) => p.variants.every((v) => hasFound(state, p.id, v.id)));
}

/** How far along the whole collection is, by forms found, for the journal's quiet line. */
export function formsFound(state: GameState): { found: number; total: number } {
  let found = 0;
  let total = 0;
  for (const p of listedSpecies()) {
    for (const v of p.variants) {
      total++;
      if (hasFound(state, p.id, v.id)) found++;
    }
  }
  return { found, total };
}
