import type { FoxFind, FoxFindKind, GameState } from '../state';
import { makeUid } from '../state';
import type { OutdoorZoneId, PlantDef, Rarity } from '../types';
import { PLANTS, PLANT_LIST, rarityRank } from '../data/plants';
import { CURIOSITIES, findCuriosity, type CuriosityDef } from '../data/curiosities';
import { weightedPick } from '../engine/Random';
import { journalComplete, variantAllowed } from './lineage';
import { addToBasket, basketFull } from './basket';
import { hasFound, recordFound } from './collection';
import { GOLF_BALL_CURIOSITY } from '../data/golfBalls';
import { findGolfBallFor, type GolfBallFind } from './golfBalls';

// What's at the end of a fox's trail. Usually a plant — something rare, or
// something you've never seen, or once in a long while something that
// shouldn't be here at all — sometimes a little grove of them, sometimes a
// mushroom or a moth. It waits, half-hidden, for a day or so.

/** Game-minutes a find waits before the undergrowth closes over it. */
export const FOX_FIND_LIFETIME = 2160;
/** Found this many species, and very rarely the fox knows where something else grows. */
export const SECRET_FIND_CHANCE = 0.03;

/** How a lost golf ball's chance compares with any other common find's. */
export const GOLF_BALL_WEIGHT = 0.06;

const RARITY_WEIGHT: Record<Rarity, number> = { common: 100, uncommon: 40, rare: 14, veryRare: 5, extremelyRare: 1.5, unheardOf: 0, mythic: 0 };

export interface FindConditions {
  night: boolean;
  rain: boolean;
}

/** A plant worth being led to: the fox's own species, or an unusual form of something that grows here. */
export function pickFoxPlant(state: GameState, zone: OutdoorZoneId, rand: () => number): { defId: string; variantId: string } | null {
  const secrets = PLANT_LIST.filter((p) => p.secret && !p.parents && !p.season && p.habitat.includes(zone));
  const secret = secrets.length ? secrets[Math.floor(rand() * secrets.length) % secrets.length] : undefined;
  // The fox's own plants only once the field journal is complete: every listed plant, in every form, grown.
  if (secret && journalComplete(state) && rand() < SECRET_FIND_CHANCE) {
    return { defId: secret.id, variantId: secret.variants[0].id };
  }
  const options: { def: PlantDef; variantId: string; w: number }[] = [];
  for (const def of PLANT_LIST) {
    if (def.secret || def.season) continue;
    const native = def.habitat.includes(zone);
    if (!native && !def.foxOnly) continue;
    for (const v of def.variants) {
      // Even the fox has never seen the forms nature didn't make — and it
      // only shows you the next form along a line, never one further on.
      if (v.sportOnly || !variantAllowed(state, def.id, v.id)) continue;
      const rank = Math.max(rarityRank(v.rarity), rarityRank(def.rarity));
      // The fox doesn't bother with the everyday.
      if (!def.foxOnly && rank < 2) continue;
      let w = 30 / (1 + rank);
      if (!hasFound(state, def.id, v.id)) w *= 3;
      if (def.foxOnly) w *= 1.5;
      options.push({ def, variantId: v.id, w });
    }
  }
  const pick = weightedPick(options, (o) => o.w, rand);
  return pick ? { defId: pick.def.id, variantId: pick.variantId } : null;
}

export function pickCuriosity(state: GameState, zone: OutdoorZoneId, cond: FindConditions, rand: () => number): CuriosityDef | null {
  const eligible = CURIOSITIES.filter((c) => {
    if (!c.zones.includes(zone)) return false;
    if (c.when === 'night' && !cond.night) return false;
    if (c.when === 'day' && cond.night) return false;
    if (c.when === 'rain' && !cond.rain) return false;
    return true;
  });
  // Something not yet noted is twice as likely. A lost golf ball is a rare
  // turn-up whatever's been found: they're a treat, not what most scents lead to.
  const weight = (c: CuriosityDef) => (c.id === GOLF_BALL_CURIOSITY ? RARITY_WEIGHT[c.rarity] * GOLF_BALL_WEIGHT : RARITY_WEIGHT[c.rarity] * (state.curiosities[c.id] ? 1 : 2));
  return weightedPick(eligible, weight, rand) ?? null;
}

/** Leaves something at the end of a trail. Returns what was left (possibly several plants, for a grove). */
export function createFoxFinds(
  state: GameState,
  x: number,
  y: number,
  zone: OutdoorZoneId,
  reward: FoxFindKind,
  cond: FindConditions,
  now: number,
  rand: () => number,
  isClear: (x: number, y: number) => boolean = () => true
): FoxFind[] {
  const make = (kind: FoxFindKind, fx: number, fy: number, extra: Partial<FoxFind>): FoxFind => ({
    id: makeUid('find'),
    kind,
    x: fx,
    y: fy,
    zone,
    seed: Math.floor(rand() * 1e9),
    createdAt: now,
    expiresAt: now + FOX_FIND_LIFETIME,
    ...extra,
  });
  const out: FoxFind[] = [];
  if (reward === 'curiosity') {
    const c = pickCuriosity(state, zone, cond, rand);
    if (c) out.push(make('curiosity', x, y, { curiosityId: c.id }));
    else reward = 'plant';
  }
  if (reward === 'plant') {
    const p = pickFoxPlant(state, zone, rand);
    if (p) out.push(make('plant', x, y, p));
  }
  if (reward === 'grove') {
    const centre = pickFoxPlant(state, zone, rand);
    if (centre && !PLANTS[centre.defId].secret) {
      out.push(make('grove', x, y, centre));
      const def = PLANTS[centre.defId];
      const n = 2 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand() * 0.8;
        const r = 0.9 + rand() * 0.5;
        const gx = x + Math.cos(a) * r;
        const gy = y + Math.sin(a) * r * 0.8;
        if (!isClear(gx, gy)) continue;
        const v = weightedPick(def.variants, (vv) => (vv.sportOnly || !variantAllowed(state, def.id, vv.id) ? 0 : (vv.id === centre.variantId ? 3 : 1) * (vv === def.variants[0] ? 2 : 1)), rand) ?? def.variants[0];
        out.push(make('grove', gx, gy, { defId: def.id, variantId: v.id }));
      }
    } else if (centre) out.push(make('plant', x, y, centre));
  }
  state.foxFinds.push(...out);
  return out;
}

export function expireFoxFinds(state: GameState, now: number): number {
  const before = state.foxFinds.length;
  state.foxFinds = state.foxFinds.filter((f) => f.expiresAt > now);
  return before - state.foxFinds.length;
}

export interface CollectFindResult {
  ok: boolean;
  reason?: 'basket-full' | 'gone';
  find?: FoxFind;
  newSpecies?: boolean;
  newVariant?: boolean;
  newCuriosity?: boolean;
  /** A lost golf ball: which kind it turned out to be. */
  golfBall?: GolfBallFind;
}

/** Takes a cutting from a plant the fox led you to, or notes down a curiosity. */
export function collectFoxFind(state: GameState, id: string, now: number, rand: () => number = Math.random): CollectFindResult {
  const idx = state.foxFinds.findIndex((f) => f.id === id);
  if (idx === -1) return { ok: false, reason: 'gone' };
  const find = state.foxFinds[idx];
  if (find.kind === 'curiosity') {
    const c = find.curiosityId ? findCuriosity(find.curiosityId) : undefined;
    if (!c) {
      state.foxFinds.splice(idx, 1);
      return { ok: false, reason: 'gone' };
    }
    const rec = state.curiosities[c.id];
    state.curiosities[c.id] = { foundAt: rec?.foundAt ?? now, count: (rec?.count ?? 0) + 1 };
    state.foxFinds.splice(idx, 1);
    state.foxLog.finds++;
    const golfBall = c.id === GOLF_BALL_CURIOSITY ? findGolfBallFor(state, now, rand) : undefined;
    return { ok: true, find, newCuriosity: !rec, golfBall };
  }
  if (!find.defId || !find.variantId || !PLANTS[find.defId]) {
    state.foxFinds.splice(idx, 1);
    return { ok: false, reason: 'gone' };
  }
  if (basketFull(state)) return { ok: false, reason: 'basket-full', find };
  addToBasket(state, { defId: find.defId, variantId: find.variantId, seed: find.seed, growth: 0, generation: 0, origin: 'wild', collectedAt: now });
  const found = recordFound(state, find.defId, find.variantId, now);
  state.foxFinds.splice(idx, 1);
  state.foxLog.finds++;
  return { ok: true, find, newSpecies: found.newSpecies, newVariant: found.newVariant };
}
