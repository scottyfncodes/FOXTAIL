import { describe, it, expect, afterEach } from 'vitest';
import { createNewGame, type GameState, type OwnedPlant } from '../src/game/state';
import { PLANTS } from '../src/game/data/plants';
import { recordFound, recordGrown, hasGrown, journalEntryNews } from '../src/game/systems/collection';
import { newDirector, tickDirector, pickLanternFind, LANTERN_DRAW, LANTERN_UNFOUND_CHANCE, type OctoberContext } from '../src/game/systems/october';
import { mysteryOpen, tickMysteries, mysteryStage, MYSTERIES, STAGE_AFTER } from '../src/game/systems/mysteries';
import { mulberry32 } from '../src/game/engine/Random';
import { setTheme } from '../src/game/season';
import { clockRate, daylightFactor, DAWN } from '../src/game/engine/Clock';
import { STAGE_AT } from '../src/game/systems/growth';
import { collectSpot, spotContent } from '../src/game/systems/spots';
import { DISCOVERY_SPOTS, SPOT_EPOCH_MINUTES } from '../src/game/data/discoveryPoints';
import { sellItem } from '../src/game/systems/market';
import { migrateSave } from '../src/game/engine/SaveManager';
import { spotMark } from '../src/game/world/Renderer';

// The three last forms of the collection (Mooncap Eclipse, Moonflower Pale
// Visitor, Wax Plant Star Cluster): the journal counts what's grown, and an
// October night lasts about two real minutes. These pin down the fixes that
// keep all three reachable at a human pace, and their hints honest.

afterEach(() => setTheme('classic', false));

function own(state: GameState, defId: string, variantId: string, growth: number): OwnedPlant {
  const p: OwnedPlant = { id: `p-${defId}-${variantId}`, defId, variantId, seed: 1, growth, location: { kind: 'nursery', bedId: 'bed-0' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false } as OwnedPlant;
  state.plants[p.id] = p;
  return p;
}

function openUp(state: GameState, defId: string, before: string) {
  for (const v of PLANTS[defId].variants) {
    recordFound(state, defId, v.id, 0);
    if (v.id === before) break;
  }
}

describe('the hints wait for the journal, not the basket', () => {
  for (const id of ['mooncap', 'moonflower', 'hoya'] as const) {
    it(`${id}: picking the last form doesn't close its hints; growing it does`, () => {
      const s = createNewGame();
      const m = MYSTERIES[id];
      openUp(s, m.defId, m.before);
      expect(mysteryOpen(s, id)).toBe(true);
      // Found (in the basket, then sold or lost): the journal doesn't have it, so the hints carry on.
      recordFound(s, m.defId, m.target, 0);
      expect(hasGrown(s, m.defId, m.target)).toBe(false);
      expect(mysteryOpen(s, id)).toBe(true);
      for (let i = 0; i < STAGE_AFTER[1] + 1; i++) tickMysteries(s, 1);
      expect(mysteryStage(s, id)).toBeGreaterThanOrEqual(1);
      // Rooted in her care: it's in the journal, and everything goes quiet.
      own(s, m.defId, m.target, STAGE_AT.young);
      recordGrown(s, 0);
      expect(hasGrown(s, m.defId, m.target)).toBe(true);
      expect(mysteryOpen(s, id)).toBe(false);
      expect(mysteryStage(s, id)).toBe(0);
    });
  }
});

describe('a lantern leads most often to a form not yet found', () => {
  it('with Harvest found, Eclipse is a large share of woodland lantern finds', () => {
    setTheme('october', false);
    const s = createNewGame();
    // Every other October form found, as a player who has been at it a while would have.
    for (const def of Object.values(PLANTS)) {
      if (def.season !== 'october') continue;
      for (const v of def.variants) if (!v.sportOnly && !(def.id === 'mooncap' && v.id === 'eclipse')) recordFound(s, def.id, v.id, 0);
    }
    const rand = mulberry32(17);
    let eclipse = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) if (pickLanternFind(s, 'woodland', rand)?.variantId === 'eclipse') eclipse++;
    // It used to be about one in seven.
    expect(eclipse / n).toBeGreaterThan(LANTERN_UNFOUND_CHANCE - 0.05);
  });

  it('with nothing left unfound, every form can still come up', () => {
    setTheme('october', false);
    const s = createNewGame();
    for (const def of Object.values(PLANTS)) if (def.season === 'october') for (const v of def.variants) if (!v.sportOnly) recordFound(s, def.id, v.id, 0);
    const rand = mulberry32(3);
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      const p = pickLanternFind(s, 'woodland', rand);
      if (p) seen.add(`${p.defId}:${p.variantId}`);
    }
    expect(seen.size).toBeGreaterThan(5);
  });
});

/** Lanterns begun per real hour on the real clock, following each one to its end. */
function lanternsPerHour(drawn: OctoberContext['drawn'], hours = 30): { lanterns: number; finds: number } {
  const rand = mulberry32(2024);
  const trees: { x: number; y: number }[] = [];
  for (let i = -14; i <= 14; i += 2) for (let j = -10; j <= 10; j += 3) trees.push({ x: 50 + i + 0.3, y: 30 + j + 0.2 });
  const d = newDirector(rand);
  let t = DAWN;
  const dt = 0.25;
  let lanterns = 0;
  let finds = 0;
  let px = 50;
  let py = 30;
  for (let sec = 0; sec < hours * 3600; sec += dt) {
    const darkness = 1 - daylightFactor(t);
    const res = tickDirector(d, {
      dt,
      darkness,
      where: 'out',
      px,
      py,
      view: { minX: px - 12, maxX: px + 12, minY: py - 8, maxY: py + 8 },
      rand,
      trees,
      bushes: [],
      lanternsInView: false,
      houseWindowInView: false,
      strayOut: false,
      isOpen: () => true,
      drawn,
    });
    for (const e of res.begun) if (e.kind === 'lantern') lanterns++;
    const lan = d.events.find((e) => e.kind === 'lantern' && e.going === null);
    if (lan) {
      px = lan.x;
      py = lan.y + 0.5;
    } else {
      px = 50;
      py = 30;
    }
    if (res.lanternFind) finds++;
    t += clockRate(t) * dt;
  }
  return { lanterns: lanterns / hours, finds: finds / hours };
}

describe('the lanterns come out often enough to be followed while a mooncap is still to find', () => {
  it('drawn, a player sees a lantern most real hours; otherwise the nights are as quiet as ever', () => {
    const quiet = lanternsPerHour(undefined);
    const drawn = lanternsPerHour({ lantern: LANTERN_DRAW });
    // Before: about one lantern every eight real hours, so an Eclipse took a hundred hours this way.
    expect(quiet.lanterns).toBeLessThan(0.5);
    expect(drawn.lanterns).toBeGreaterThan(quiet.lanterns * 3);
    expect(drawn.finds).toBeGreaterThan(0.5);
  });

  it('only while the mooncap mystery is open', () => {
    const s = createNewGame();
    expect(mysteryOpen(s, 'mooncap')).toBe(false);
    openUp(s, 'mooncap', 'harvest');
    expect(mysteryOpen(s, 'mooncap')).toBe(true);
  });
});

describe('a new form in the journal says how far along its species is', () => {
  it('counts grown forms against the species’ forms', () => {
    const s = createNewGame();
    own(s, 'hoya', 'carnosa', STAGE_AT.young);
    recordGrown(s, 0);
    expect(journalEntryNews(s, 'hoya', 'carnosa')).toEqual({ defId: 'hoya', variantId: 'carnosa', grown: 1, total: 4 });
    for (const v of ['krimsonQueen', 'compacta', 'starCluster']) {
      const p = own(s, 'hoya', v, STAGE_AT.young);
      p.id = `x-${v}`;
      s.plants[p.id] = p;
    }
    recordGrown(s, 0);
    expect(journalEntryNews(s, 'hoya', 'starCluster').grown).toBe(4);
  });
});

describe('found, grown, sold, regrown, completed: the journal only ever counts what has been grown', () => {
  const meadow = DISCOVERY_SPOTS.find((s) => s.id === 'sp-meadow-1')!;

  it('a find is "ungrown" until it roots, and selling the cutting never credits it', () => {
    const s = createNewGame();
    const res = collectSpot(s, meadow, s.clock.totalMinutes);
    expect(res.ok).toBe(true);
    const { defId, variantId } = res.content!;
    expect(spotMark(s, defId, variantId)).toBe('ungrown');
    expect(hasGrown(s, defId, variantId)).toBe(false);
    expect(sellItem(s, s.basket[0].uid, s.clock.totalMinutes)).not.toBeNull();
    recordGrown(s, s.clock.totalMinutes);
    expect(hasGrown(s, defId, variantId)).toBe(false);
    expect(spotMark(s, defId, variantId)).toBe('ungrown');
  });

  it('a grown form stays in the journal after its plant is sold, and is marked known on its patch', () => {
    const s = createNewGame();
    const p = own(s, 'hoya', 'carnosa', STAGE_AT.young);
    recordFound(s, 'hoya', 'carnosa', 0);
    expect(recordGrown(s, 0)).toEqual([{ defId: 'hoya', variantId: 'carnosa' }]);
    delete s.plants[p.id];
    expect(hasGrown(s, 'hoya', 'carnosa')).toBe(true);
    expect(spotMark(s, 'hoya', 'carnosa')).toBe('known');
  });

  it('a patch that regrows and is picked again, and a second plant of the same form, never credit it twice', () => {
    const s = createNewGame();
    const first = collectSpot(s, meadow, s.clock.totalMinutes);
    const { defId, variantId } = first.content!;
    own(s, defId, variantId, STAGE_AT.young);
    expect(recordGrown(s, 0)).toHaveLength(1);
    // Picked this season: nothing there until the next.
    expect(spotContent(s, meadow)).toBeNull();
    s.clock.totalMinutes += SPOT_EPOCH_MINUTES;
    expect(spotContent(s, meadow)).not.toBeNull();
    collectSpot(s, meadow, s.clock.totalMinutes);
    const second = own(s, defId, variantId, STAGE_AT.young);
    second.id = 'second';
    s.plants.second = second;
    expect(recordGrown(s, 0)).toHaveLength(0);
    expect(s.collection[defId].grownVariants!.filter((v) => v === variantId)).toHaveLength(1);
    expect(journalEntryNews(s, defId, variantId).grown).toBe(1);
  });

  it('a species is complete only when every form is grown, not merely found', () => {
    const s = createNewGame();
    for (const v of PLANTS.mooncap.variants) recordFound(s, 'mooncap', v.id, 0);
    expect(journalEntryNews(s, 'mooncap', 'eclipse').grown).toBe(0);
    for (const v of PLANTS.mooncap.variants) {
      const p = own(s, 'mooncap', v.id, STAGE_AT.young);
      p.id = `m-${v.id}`;
      s.plants[p.id] = p;
    }
    recordGrown(s, 0);
    const news = journalEntryNews(s, 'mooncap', 'eclipse');
    expect(news.grown).toBe(news.total);
    expect(news.total).toBe(3);
  });

  it('the hints, the journal and a picked patch all survive a save and reload', () => {
    const s = createNewGame();
    openUp(s, 'hoya', 'compacta');
    for (let i = 0; i < STAGE_AFTER[2] + 1; i++) tickMysteries(s, 1);
    recordFound(s, 'hoya', 'starCluster', 0);
    collectSpot(s, meadow, s.clock.totalMinutes);
    const loaded = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(mysteryOpen(loaded, 'hoya')).toBe(true);
    expect(mysteryStage(loaded, 'hoya')).toBe(2);
    expect(hasGrown(loaded, 'hoya', 'starCluster')).toBe(false);
    expect(spotContent(loaded, meadow)).toBeNull();
  });
});
