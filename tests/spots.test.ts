import { describe, it, expect } from 'vitest';
import { listedSpecies } from '../src/game/systems/lineage';
import { createNewGame } from '../src/game/state';
import { spotContent, collectSpot, spotPool } from '../src/game/systems/spots';
import { DISCOVERY_SPOTS, SPOT_EPOCH_MINUTES } from '../src/game/data/discoveryPoints';
import { PLANTS, specimenRarity, rarityRank } from '../src/game/data/plants';
import type { DiscoverySpot } from '../src/game/types';
import { generateObstacles, buildBlockingSet } from '../src/game/world/Obstacles';
import { zoneAt } from '../src/game/data/worldMap';

const meadow = DISCOVERY_SPOTS.find((s) => s.id === 'sp-meadow-1')!;

describe('wild patches', () => {
  it('shows the same plant for the whole epoch, and something (possibly new) after it regrows', () => {
    const state = createNewGame();
    const a = spotContent(state, meadow);
    expect(spotContent(state, meadow)).toEqual(a);
    expect(a && PLANTS[a.defId].habitat).toContain('meadow');
    const seen = new Set<string>();
    for (let e = 0; e < 40; e++) {
      state.clock.totalMinutes = e * SPOT_EPOCH_MINUTES + 1;
      const c = spotContent(state, meadow)!;
      seen.add(`${c.defId}/${c.variantId}`);
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it('collecting takes a cutting, records the find, and empties the patch until the next epoch', () => {
    const state = createNewGame();
    const res = collectSpot(state, meadow, state.clock.totalMinutes);
    expect(res.ok).toBe(true);
    expect(res.newSpecies).toBe(true);
    expect(state.basket).toHaveLength(1);
    expect(state.basket[0].growth).toBe(0);
    expect(state.collection[res.content!.defId].variants).toContain(res.content!.variantId);
    expect(spotContent(state, meadow)).toBeNull();
    state.clock.totalMinutes += SPOT_EPOCH_MINUTES;
    expect(spotContent(state, meadow)).not.toBeNull();
  });

  it('commons are common and rarities are genuinely rare across the valley', () => {
    const state = createNewGame();
    // Every form in play: a patch only grows the forms found so far plus the next one along each line.
    for (const p of listedSpecies()) state.collection[p.id] = { foundAt: 0, variants: p.variants.map((v) => v.id), grown: 0, propagated: 0, sold: 0, earned: 0, plantedOut: 0, displayed: 0 };
    const counts = [0, 0, 0, 0, 0];
    for (let e = 0; e < 300; e++) {
      state.clock.totalMinutes = e * SPOT_EPOCH_MINUTES + 1;
      for (const spot of DISCOVERY_SPOTS) {
        const c = spotContent(state, spot);
        if (c) counts[rarityRank(specimenRarity(c.defId, c.variantId))]++;
      }
    }
    expect(counts[0]).toBeGreaterThan(counts[1]);
    expect(counts[1]).toBeGreaterThan(counts[2]);
    expect(counts[2]).toBeGreaterThan(counts[3]);
    expect(counts[3]).toBeGreaterThan(0);
    expect(counts[3]).toBeLessThan(counts[0] * 0.08);
  });

  it('keeps lantern-only plants hidden without a lantern, falling back to something ordinary', () => {
    const state = createNewGame();
    const spot: DiscoverySpot = { id: 'test-dark', zone: 'dampForest', x: 0, y: 0, pool: ['jewelOrchid', 'bostonFern'] };
    state.clock.totalMinutes = 23 * 60; // night
    let orchids = 0;
    for (let e = 0; e < 60; e++) {
      state.clock.totalMinutes = e * 1440 + 23 * 60;
      if (spotContent(state, spot)?.defId === 'jewelOrchid') orchids++;
    }
    expect(orchids).toBe(0);
    state.tools.lantern = 1;
    for (let e = 0; e < 60; e++) {
      state.clock.totalMinutes = e * 1440 + 23 * 60;
      if (spotContent(state, spot)?.defId === 'jewelOrchid') orchids++;
    }
    expect(orchids).toBeGreaterThan(0);
  });

  it('never offers fox-only species in ordinary patches, and hides fox patches until revealed', () => {
    for (const spot of DISCOVERY_SPOTS.filter((s) => !s.foxLed)) {
      expect(spotPool(spot).some((p) => p.foxOnly)).toBe(false);
    }
    const state = createNewGame();
    const fox = DISCOVERY_SPOTS.find((s) => s.foxLed)!;
    expect(spotContent(state, fox)).toBeNull();
    state.spots[fox.id] = { revealed: true };
    expect(spotContent(state, fox)).not.toBeNull();
  });

  it('puts every patch in its own region, on open ground', () => {
    const blocked = buildBlockingSet(generateObstacles());
    for (const spot of DISCOVERY_SPOTS) {
      expect(zoneAt(spot.x, spot.y)).toBe(spot.zone);
      expect(blocked.has(`${spot.x},${spot.y}`)).toBe(false);
    }
  });

  it('turns up cacti and succulents in the Rocky Clearing', () => {
    const state = createNewGame();
    const rocky = DISCOVERY_SPOTS.filter((s) => s.zone === 'rockyClearing');
    const seen = new Set<string>();
    for (let e = 0; e < 200; e++) {
      state.clock.totalMinutes = e * SPOT_EPOCH_MINUTES + 1;
      for (const spot of rocky) {
        const c = spotContent(state, spot);
        if (c) seen.add(PLANTS[c.defId].form);
      }
    }
    for (const form of ['column', 'globe', 'paddle', 'jade', 'spiky', 'stones']) expect(seen.has(form)).toBe(true);
  });
});
