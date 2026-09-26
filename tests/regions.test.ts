import { describe, it, expect } from 'vitest';
import { createNewGame } from '../src/game/state';
import { coverTier, suggestedName, cleanName, regionLabel, lushestTile, nameRegion, checkRegionTiers, eveningStroll, NAME_MAX } from '../src/game/systems/regions';
import { computeLushness } from '../src/game/systems/wild';
import { tickScott } from '../src/game/systems/scott';
import { catAvoids } from '../src/game/systems/cat';
import { GRID_W } from '../src/game/data/worldMap';
import { migrateSave } from '../src/game/engine/SaveManager';

function grown(state: ReturnType<typeof createNewGame>, n: number, x0: number, y0: number) {
  for (let i = 0; i < n; i++) {
    const id = `p${x0}-${i}`;
    state.plants[id] = { id, defId: 'bostonFern', variantId: 'standard', seed: i, growth: 3600, location: { kind: 'wild', x: x0 + (i % 8) * 1.2, y: y0 + Math.floor(i / 8) * 1.2, zone: 'meadow' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false };
  }
}

describe('naming a region', () => {
  it('tiers cover the way the journal describes it, and suggests a name in that voice', () => {
    expect(coverTier(0.02)).toBe(0);
    expect(coverTier(0.1)).toBe(1);
    expect(coverTier(0.4)).toBe(2);
    expect(suggestedName('fern', 1)).toBe('Ellen’s Fern Glade');
    expect(suggestedName('fern', 2)).toBe('Ellen’s Sea of Fronds');
    expect(cleanName('   ')).toBeNull();
    expect(cleanName('  the   long   meadow ')).toBe('the long meadow');
    expect(cleanName('x'.repeat(60))!.length).toBe(NAME_MAX);
  });

  it('is only offered once the region has changed, puts the plaque where growth is thickest, and renames in place', () => {
    const state = createNewGame();
    let lush = computeLushness(state);
    expect(nameRegion(state, 'meadow', 'Ellen’s Fern Glade', lush, () => true, 0)).toBeNull();
    grown(state, 60, 48, 26);
    lush = computeLushness(state);
    expect(coverTier(lush.zoneCover.meadow)).toBeGreaterThanOrEqual(1);
    const r = nameRegion(state, 'meadow', 'Ellen’s Fern Glade', lush, () => true, 500)!;
    expect(r).not.toBeNull();
    const best = lushestTile(lush, () => true, 'meadow')!;
    expect(r.x).toBe(best.x + 0.5);
    expect(lush.lush[best.y * GRID_W + best.x]).toBeGreaterThan(0.5);
    expect(regionLabel(state, 'meadow')).toBe('Ellen’s Fern Glade');
    expect(regionLabel(state, 'woodland')).toBe('The Woodland');
    const again = nameRegion(state, 'meadow', 'The Fernery', lush, () => true, 900)!;
    expect(again.name).toBe('The Fernery');
    expect(again.x).toBe(r.x);
    expect(again.namedAt).toBe(500);
  });

  it('notices each cover tier once', () => {
    const state = createNewGame();
    grown(state, 60, 48, 26);
    const lush = computeLushness(state);
    const first = checkRegionTiers(state, lush);
    expect(first.map((c) => c.zone)).toEqual(['meadow']);
    expect(checkRegionTiers(state, lush)).toEqual([]);
  });
});

describe('what a name changes', () => {
  it('gives Scott somewhere to walk to in the evening, and only then', () => {
    const state = createNewGame();
    state.regions.meadow = { name: 'Ellen’s Fern Glade', x: 50.5, y: 30.5, namedAt: 0 };
    expect(eveningStroll(state, 12 * 60)).toEqual([]);
    const spots = eveningStroll(state, 18 * 60);
    expect(spots.length).toBe(1);
    expect(spots[0].zone).toBe('meadow');
    // He'll actually go there.
    state.scott.nextChangeAt = 0;
    state.scott.activity = 'tinkering';
    state.scott.zone = 'meadow';
    state.scott.currentSpotId = 'meadow-garden-tinker';
    let went = false;
    for (let i = 0; i < 200 && !went; i++) {
      state.scott.activity = 'tinkering';
      state.scott.nextChangeAt = 0;
      tickScott(state.scott, { dtSeconds: 0.1, now: 18 * 60 + i, rand: () => 0.99, extraSpots: spots });
      if (state.scott.targetSpotId === 'region-meadow') went = true;
    }
    expect(went).toBe(true);
    for (let i = 0; i < 400; i++) tickScott(state.scott, { dtSeconds: 0.2, now: 18 * 60 + 300, rand: () => 0.5, extraSpots: spots });
    expect(state.scott.currentSpotId).toBe('region-meadow');
    expect(state.scott.activity).toBe('snacking');
  });

  it('the cat keeps clear of carnivores', () => {
    expect(catAvoids('venusFlytrap', 'standard')).toBe(true);
    expect(catAvoids('sundew', 'standard')).toBe(true);
    expect(catAvoids('pothos', 'golden')).toBe(false);
  });

  it('older saves have no names yet', () => {
    const raw = JSON.parse(JSON.stringify(createNewGame())) as Record<string, unknown>;
    raw.version = 8;
    delete raw.regions;
    delete raw.regionTier;
    const state = migrateSave(raw)!;
    expect(state.regions).toEqual({});
    expect(state.regionTier).toEqual({});
  });
});

describe('walking round the house', () => {
  it('goes straight when the way is clear, and round a corner when the house is in the way', async () => {
    const { outdoorWaypoint, segmentHitsRect, GREENHOUSE_FOOTPRINT, HOUSE_FOOTPRINT } = await import('../src/game/data/worldMap');
    expect(segmentHitsRect({ x: 10, y: 10, w: 5, h: 5 }, 0, 0, 5, 5)).toBe(false);
    expect(segmentHitsRect({ x: 10, y: 10, w: 5, h: 5 }, 0, 12, 20, 12)).toBe(true);
    // Clear meadow: straight there.
    expect(outdoorWaypoint(50, 50, 55, 55)).toEqual({ x: 55, y: 55 });
    // From below the greenhouse to above it: the first step is a corner, not the roof.
    const wp = outdoorWaypoint(65, 44, 65, 28);
    expect(wp).not.toEqual({ x: 65, y: 28 });
    const inHome = (x: number, y: number) => x >= GREENHOUSE_FOOTPRINT.x && x < HOUSE_FOOTPRINT.x + HOUSE_FOOTPRINT.w && y >= GREENHOUSE_FOOTPRINT.y && y < GREENHOUSE_FOOTPRINT.y + GREENHOUSE_FOOTPRINT.h;
    expect(inHome(wp.x, wp.y)).toBe(false);
    // Walking the whole way step by step never crosses the building.
    let x = 65;
    let y = 44;
    for (let i = 0; i < 400; i++) {
      const w = outdoorWaypoint(x, y, 65, 28);
      const d = Math.hypot(w.x - x, w.y - y) || 1;
      x += ((w.x - x) / d) * Math.min(0.2, d);
      y += ((w.y - y) / d) * Math.min(0.2, d);
      expect(inHome(x, y)).toBe(false);
      if (Math.hypot(x - 65, y - 28) < 0.3) break;
    }
    expect(Math.hypot(x - 65, y - 28)).toBeLessThan(0.5);
  });
});
