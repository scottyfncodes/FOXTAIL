import type { GameState, NamedRegion } from '../state';
import type { LandscapeCharacter, OutdoorZoneId } from '../types';
import { ZONES } from '../data/zones';
import { GRID_W, GRID_H, zoneAt } from '../data/worldMap';
import type { LushField } from './wild';

// The valley remembers what you made of it. Once a region has changed
// enough under your plants, it can be given a name: a small wooden plaque
// goes up where the growth is thickest, the name is what the game calls
// the place from then on, and Scott takes to walking out there in the
// evening. Nothing asks you to name anything; the journal's Regions page
// simply offers it once there's something worth naming.

/** Cover tiers, matching the journal's descriptions: a few plants, taking hold, transformed. */
export const TIER_COVER = [0, 0.08, 0.28];

export function coverTier(cover: number): number {
  return cover >= TIER_COVER[2] ? 2 : cover >= TIER_COVER[1] ? 1 : 0;
}

export const NAME_MAX = 24;

/** A name to offer, in the voice the journal already uses for what a region is becoming. */
const SUGGESTED: Record<LandscapeCharacter, [string, string]> = {
  fern: ['Fern Glade', 'Sea of Fronds'],
  jungle: ['Leafy Thicket', 'Jungle'],
  vine: ['Vine Tangle', 'Vine Carpet'],
  flower: ['Flower Garden', 'Riot of Flowers'],
  arid: ['Succulent Garden', 'Desert Garden'],
  color: ['Painted Garden', 'Stained-Glass Garden'],
  strange: ['Uncanny Grove', 'Other World'],
};

export function suggestedName(character: LandscapeCharacter | undefined, tier: number): string {
  const [a, b] = SUGGESTED[character ?? 'jungle'];
  return `Ellen’s ${tier >= 2 ? b : a}`;
}

/** Tidies a name the player typed; null if there's nothing there. */
export function cleanName(raw: string): string | null {
  const s = raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
  return s.length ? s : null;
}

/** What the game calls a region: its given name, or the old one. */
export function regionLabel(state: Pick<GameState, 'regions'>, zone: OutdoorZoneId | 'greenhouse'): string {
  if (zone === 'greenhouse') return ZONES.greenhouse.name;
  return state.regions?.[zone]?.name ?? ZONES[zone].name;
}

/** Whether a region has changed enough to be worth naming. */
export function canName(lush: LushField, zone: OutdoorZoneId): boolean {
  return coverTier(lush.zoneCover[zone] ?? 0) >= 1;
}

/**
 * The thickest patch of the player's growth: in one region, or anywhere.
 * `free` says whether a tile can take something standing on it.
 */
export function lushestTile(lush: LushField, free: (tx: number, ty: number) => boolean, zone?: OutdoorZoneId): { x: number; y: number; lush: number } | null {
  let best: { x: number; y: number; lush: number } | null = null;
  for (let ty = 0; ty < GRID_H; ty++) {
    for (let tx = 0; tx < GRID_W; tx++) {
      const z = zoneAt(tx, ty);
      if (z === 'greenhouse' || (zone && z !== zone)) continue;
      const v = lush.lush[ty * GRID_W + tx];
      if (v <= 0 || (best && v <= best.lush) || !free(tx, ty)) continue;
      best = { x: tx, y: ty, lush: v };
    }
  }
  return best;
}

/** Puts the plaque up (or renames it, keeping it where it stands). */
export function nameRegion(state: GameState, zone: OutdoorZoneId, raw: string, lush: LushField, free: (tx: number, ty: number) => boolean, now: number): NamedRegion | null {
  const name = cleanName(raw);
  if (!name || !canName(lush, zone)) return null;
  const existing = state.regions[zone];
  if (existing) {
    existing.name = name;
    return existing;
  }
  const at = lushestTile(lush, free, zone);
  if (!at) return null;
  const r: NamedRegion = { name, x: at.x + 0.5, y: at.y + 0.5, namedAt: now };
  state.regions[zone] = r;
  return r;
}

export interface TierCrossing {
  zone: OutdoorZoneId;
  tier: number;
  character?: LandscapeCharacter;
}

/** Regions that have just reached a new cover tier since last checked. Each tier is reported once. */
export function checkRegionTiers(state: GameState, lush: LushField): TierCrossing[] {
  const out: TierCrossing[] = [];
  for (const zone of Object.keys(lush.zoneCover) as OutdoorZoneId[]) {
    const tier = coverTier(lush.zoneCover[zone] ?? 0);
    const seen = state.regionTier[zone] ?? 0;
    if (tier <= seen) continue;
    state.regionTier[zone] = tier;
    out.push({ zone, tier, character: lush.zoneCharacter[zone] });
  }
  return out;
}

/** Scott's evening spot in a named region: a little way from the plaque, facing what's grown. */
export function eveningStroll(state: Pick<GameState, 'regions'>, minuteOfDay: number): { id: string; kind: 'snack'; zone: OutdoorZoneId; x: number; y: number }[] {
  if (minuteOfDay < 17 * 60 || minuteOfDay >= 21 * 60) return [];
  return (Object.entries(state.regions) as [OutdoorZoneId, NamedRegion | undefined][])
    .filter((e): e is [OutdoorZoneId, NamedRegion] => !!e[1])
    .map(([zone, r]) => ({ id: `region-${zone}`, kind: 'snack' as const, zone, x: r.x + 1.1, y: r.y + 0.6 }));
}
