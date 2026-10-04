import { describe, it, expect, afterEach } from 'vitest';
import { PLANTS, rarityRank, lookFor } from '../src/game/data/plants';
import { DISCOVERY_SPOTS } from '../src/game/data/discoveryPoints';
import { seasonalPool, spotPool } from '../src/game/systems/spots';
import { plantRoles } from '../src/game/systems/beds';
import { matureRadius } from '../src/game/systems/landscape';
import { setTheme } from '../src/game/season';
import { createNewGame } from '../src/game/state';

const pumpkin = PLANTS.pumpkin;

describe('the pumpkin', () => {
  afterEach(() => setTheme('classic', false));

  it('carves a finer jack-o’-lantern the rarer the vine', () => {
    const ranks = pumpkin.variants.map((v) => rarityRank(v.rarity));
    // Plainest first, each one rarer than the last.
    for (let i = 1; i < ranks.length; i++) expect(ranks[i]).toBeGreaterThan(ranks[i - 1]);
    const looks = pumpkin.variants.map((v) => lookFor('pumpkin', v.id));
    // Every one has a face, and no two share one.
    expect(looks.every((l) => !!l.carving)).toBe(true);
    expect(new Set(looks.map((l) => l.carving)).size).toBe(looks.length);
    // The common ones are just carved; from rare up there's a candle in.
    pumpkin.variants.forEach((v, i) => expect(!!looks[i].candle).toBe(rarityRank(v.rarity) >= rarityRank('rare')));
    // And the very finest is the biggest of them all, short of the one only a sport can throw.
    const king = lookFor('pumpkin', 'pumpkinKing');
    expect(king.carving).toBe('king');
    expect(Math.max(...looks.map((l) => l.size))).toBe(king.size);
    expect(pumpkin.variants.find((v) => v.id === 'willOTheWisp')!.sportOnly).toBe(true);
  });

  it('comes up wild only while October is on, in the meadow and the overgrown clearing', () => {
    const state = createNewGame();
    const meadow = DISCOVERY_SPOTS.find((s) => s.zone === 'meadow' && !s.foxLed && !s.pool)!;
    const woods = DISCOVERY_SPOTS.find((s) => s.zone === 'woodland' && !s.foxLed && !s.pool)!;
    expect(spotPool(meadow).some((p) => p.id === 'pumpkin')).toBe(false);
    setTheme('classic', false);
    expect(seasonalPool(state, meadow).some((p) => p.id === 'pumpkin')).toBe(false);
    setTheme('october', false);
    expect(seasonalPool(state, meadow).some((p) => p.id === 'pumpkin')).toBe(true);
    expect(seasonalPool(state, woods).some((p) => p.id === 'pumpkin')).toBe(false);
  });

  it('grows like a vine in a bed and needs room to sprawl', () => {
    expect(plantRoles('pumpkin', 'sugarPie')).toContain('trailer');
    expect(matureRadius('pumpkin', 'pumpkinKing')).toBeGreaterThan(matureRadius('pumpkin', 'sugarPie'));
  });
});
