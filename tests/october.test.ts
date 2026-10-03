import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createNewGame, SAVE_VERSION } from '../src/game/state';
import { migrateSave, saveGame, loadGame } from '../src/game/engine/SaveManager';
import { PLANTS, PLANT_LIST } from '../src/game/data/plants';
import { DISCOVERY_SPOTS, SPOT_EPOCH_MINUTES } from '../src/game/data/discoveryPoints';
import { spotContent, spotPool, hunchTargets } from '../src/game/systems/spots';
import { collectionTotals } from '../src/game/systems/collection';
import { demandSpecies } from '../src/game/systems/market';
import { pickFoxPlant } from '../src/game/systems/foxFinds';
import { mulberry32 } from '../src/game/engine/Random';
import { getTheme, initTheme, isOctober, onThemeChange, preferredTheme, setTheme } from '../src/game/season';
import { FACES, PUMPKINS } from '../src/game/data/october';
import {
  newDirector,
  tickDirector,
  newGhost,
  tickGhost,
  ghostApproachable,
  meetGhost,
  carvePumpkin,
  pickFace,
  octoberNotes,
  noteSeen,
  nextDawn,
  strayPumpkin,
  pickLanternFind,
  EVENT_RULES,
  type OctoberContext,
  type OctoberEventKind,
  type GhostContext,
} from '../src/game/systems/october';

const OCTOBER_IDS = PLANT_LIST.filter((p) => p.season === 'october').map((p) => p.id);

function trees() {
  const out: { x: number; y: number }[] = [];
  for (let x = 5; x < 85; x += 3) for (let y = 5; y < 60; y += 3) out.push({ x: x + 0.5, y: y + 0.5 });
  return out;
}
const TREES = trees();

function ctx(over: Partial<OctoberContext> = {}): OctoberContext {
  return {
    dt: 0.1,
    darkness: 1,
    where: 'out',
    px: 45,
    py: 32,
    view: { minX: 30, maxX: 60, minY: 20, maxY: 44 },
    rand: mulberry32(7),
    trees: TREES,
    bushes: TREES.map((t) => ({ x: t.x + 1, y: t.y + 1 })),
    lanternsInView: true,
    houseWindowInView: true,
    strayOut: false,
    isOpen: () => true,
    ...over,
  };
}

/** Runs the director for `seconds` of real time, counting what began. */
function run(seconds: number, over: Partial<OctoberContext> = {}) {
  const c = ctx(over);
  const d = newDirector(c.rand);
  const counts: Partial<Record<OctoberEventKind, number>> = {};
  let maxAtOnce = 0;
  let total = 0;
  for (let t = 0; t < seconds; t += c.dt) {
    const r = tickDirector(d, c);
    for (const e of r.begun) {
      counts[e.kind] = (counts[e.kind] ?? 0) + 1;
      total++;
    }
    if (r.stray) {
      counts.stray = (counts.stray ?? 0) + 1;
      total++;
    }
    maxAtOnce = Math.max(maxAtOnce, d.events.length);
  }
  return { counts, total, maxAtOnce };
}

describe('the seasonal look', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => setTheme('classic', false));

  it('starts as Classic until the game picks a look', () => {
    expect(getTheme()).toBe('classic');
    expect(isOctober()).toBe(false);
  });

  it('follows the calendar until the player chooses, then remembers the choice on the device', () => {
    expect(preferredTheme(new Date(2026, 9, 3))).toBe('october');
    expect(preferredTheme(new Date(2026, 5, 3))).toBe('classic');
    setTheme('classic');
    expect(preferredTheme(new Date(2026, 9, 31))).toBe('classic');
    setTheme('october');
    expect(preferredTheme(new Date(2026, 2, 1))).toBe('october');
    expect(initTheme(new Date(2026, 2, 1))).toBe('october');
    expect(isOctober()).toBe(true);
  });

  it('tells whoever is listening when it changes, and can be switched back and forth', () => {
    const seen: string[] = [];
    const off = onThemeChange((t) => seen.push(t));
    setTheme('october');
    setTheme('october');
    setTheme('classic');
    off();
    setTheme('october');
    expect(seen).toEqual(['october', 'classic']);
  });

  it('is not part of the save: switching it changes nothing in the game state', () => {
    const state = createNewGame();
    state.october.carved['pk-porch-1'] = 'happy';
    const before = JSON.stringify(state);
    setTheme('october');
    setTheme('classic');
    setTheme('october');
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('October’s plants', () => {
  afterEach(() => setTheme('classic', false));

  it('are a handful, kept out of the journal’s collection and its totals', () => {
    expect(OCTOBER_IDS.length).toBeGreaterThanOrEqual(5);
    expect(OCTOBER_IDS.filter((id) => PLANTS[id].form === 'mushroom').length).toBeGreaterThanOrEqual(3);
    for (const id of OCTOBER_IDS) expect(PLANTS[id].unlisted, id).toBe(true);
    const state = createNewGame();
    for (const id of OCTOBER_IDS) state.collection[id] = { foundAt: 0, variants: PLANTS[id].variants.map((v) => v.id), grownVariants: PLANTS[id].variants.map((v) => v.id), grown: 2, propagated: 0, sold: 0, earned: 0, plantedOut: 0, displayed: 0 };
    expect(collectionTotals(state).species).toBe(0);
  });

  it('never come up in Classic: every patch grows exactly what it always did', () => {
    setTheme('classic', false);
    const state = createNewGame();
    for (const s of DISCOVERY_SPOTS) expect(spotPool(s).some((p) => p.season)).toBe(false);
    for (let e = 0; e < 120; e++) {
      state.clock.totalMinutes = e * SPOT_EPOCH_MINUTES + (e % 2 ? 22 * 60 : 12 * 60);
      for (const s of DISCOVERY_SPOTS) {
        const c = spotContent(state, s);
        if (c) expect(PLANTS[c.defId].season).toBeUndefined();
      }
    }
  });

  it('in October, now and then take a patch’s place — and otherwise the patch is as it would have been', () => {
    const state = createNewGame();
    let seasonal = 0;
    let total = 0;
    for (let e = 0; e < 200; e++) {
      state.clock.totalMinutes = e * SPOT_EPOCH_MINUTES + (e % 2 ? 22 * 60 : 12 * 60);
      for (const s of DISCOVERY_SPOTS) {
        setTheme('classic', false);
        const classic = spotContent(state, s);
        setTheme('october', false);
        const oct = spotContent(state, s);
        if (!oct) continue;
        total++;
        if (PLANTS[oct.defId].season) seasonal++;
        else expect(oct).toEqual(classic);
      }
    }
    expect(seasonal).toBeGreaterThan(0);
    // Not every plant becomes a Halloween prop: the ordinary valley stays dominant.
    expect(seasonal / total).toBeLessThan(0.2);
  });

  it('the strangest is never in a patch at all, and never what the market or the fox asks after', () => {
    setTheme('october', false);
    const state = createNewGame();
    for (let e = 0; e < 300; e++) {
      state.clock.totalMinutes = e * SPOT_EPOCH_MINUTES + 23 * 60;
      for (const s of DISCOVERY_SPOTS) expect(spotContent(state, s)?.defId).not.toBe('foxfireBonnet');
    }
    for (const id of OCTOBER_IDS) state.collection[id] = { foundAt: 0, variants: [], grown: 0, propagated: 0, sold: 0, earned: 0, plantedOut: 0, displayed: 0 };
    for (let d = 0; d < 100; d++) {
      state.clock.totalMinutes = d * 1440;
      expect(PLANTS[demandSpecies(state)].season).toBeUndefined();
    }
    const rand = mulberry32(3);
    for (let i = 0; i < 200; i++) {
      const p = pickFoxPlant(state, 'dampForest', rand);
      if (p) expect(PLANTS[p.defId].season).toBeUndefined();
    }
    expect(hunchTargets(state, 'dampForest').some((h) => PLANTS[h.defId].season)).toBe(false);
  });

  it('a lantern only ever leads to something of the season, next along its line', () => {
    const state = createNewGame();
    const rand = mulberry32(5);
    for (let i = 0; i < 100; i++) {
      const p = pickLanternFind(state, 'dampForest', rand)!;
      expect(PLANTS[p.defId].season).toBe('october');
      expect(PLANTS[p.defId].secret).toBeFalsy();
      expect(PLANTS[p.defId].variants[0].id).toBe(p.variantId);
    }
  });
});

describe('the save', () => {
  beforeEach(() => localStorage.clear());

  it('an older save loads with a fresh October log, and nothing else touched', () => {
    const old = createNewGame() as unknown as Record<string, unknown>;
    delete old.october;
    old.version = 11;
    (old as { coins: number }).coins = 777;
    const loaded = migrateSave(JSON.parse(JSON.stringify(old)))!;
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.coins).toBe(777);
    expect(loaded.october).toEqual({ seen: {}, carved: {}, faces: [], gifts: 0, giftDay: null, stray: null });
  });

  it('keeps what October has seen and carved, and puts right anything malformed', () => {
    const state = createNewGame();
    state.october.carved['pk-patch-1'] = 'fox';
    state.october.faces.push('fox');
    state.october.seen.visitor = 2;
    state.october.gifts = 1;
    state.october.giftDay = 4;
    state.october.stray = { x: 50, y: 30, face: 'spooky', until: 9999 };
    saveGame(state);
    const back = loadGame()!;
    expect(back.october).toEqual(state.october);

    const bad = JSON.parse(JSON.stringify(state));
    bad.october = { seen: { visitor: 'lots', eyes: 3 }, carved: [], faces: 'fox', gifts: NaN, stray: { x: 'a' } };
    const fixed = migrateSave(bad)!;
    expect(fixed.october).toEqual({ seen: { eyes: 3 }, carved: {}, faces: [], gifts: 0, giftDay: null, stray: null });
  });
});

describe('the strange things', () => {
  it('only one happens at a time, and they are spaced well apart', () => {
    const night = run(3600);
    expect(night.maxAtOnce).toBeLessThanOrEqual(1);
    // An hour of nothing but night: a few dozen small things at the very most.
    expect(night.total).toBeGreaterThan(12);
    expect(night.total).toBeLessThan(55);
    const day = run(3600, { darkness: 0 });
    expect(day.total).toBeLessThan(35);
  });

  it('the big ones are rare, and the rarest rarer still', () => {
    let watchers = 0;
    let visitors = 0;
    let foxes = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const r = run(3600, { rand: mulberry32(seed) });
      watchers += r.counts.watcher ?? 0;
      visitors += r.counts.visitor ?? 0;
      foxes += r.counts.shadowFox ?? 0;
      // Never more than its own gap allows.
      expect(r.counts.visitor ?? 0).toBeLessThanOrEqual(2);
      expect(r.counts.watcher ?? 0).toBeLessThanOrEqual(9);
    }
    // Six hours of solid night (in play, nights are short: far fewer than this).
    expect(watchers).toBeGreaterThan(0);
    expect(visitors).toBeLessThan(watchers);
    expect(foxes).toBeLessThan(watchers);
  });

  it('by day, nothing that needs the dark', () => {
    const day = run(7200, { darkness: 0 });
    for (const [kind, n] of Object.entries(day.counts)) {
      if (n) expect(EVENT_RULES[kind as OctoberEventKind].dark ?? 0, kind).toBe(0);
    }
  });

  it('indoors, only what belongs under glass; in the living room, nothing at all', () => {
    const gh = run(3600, { where: 'greenhouse', px: 9, py: 6, view: { minX: 0, maxX: 18, minY: 0, maxY: 12 } });
    for (const k of Object.keys(gh.counts)) expect(EVENT_RULES[k as OctoberEventKind].where).toBe('greenhouse');
    expect(gh.total).toBeGreaterThan(0);
    const lr = run(3600, { where: 'living', px: 22, py: 6, view: { minX: 0, maxX: 27, minY: 0, maxY: 12 } });
    expect(lr.total).toBe(0);
  });

  it('the one at the edge is gone when you go closer — and counted as seen', () => {
    const c = ctx();
    const d = newDirector(c.rand);
    d.cooldown = 0;
    d.since = {};
    // Only watchers are eligible for this test.
    const saved = { ...EVENT_RULES };
    for (const k of Object.keys(EVENT_RULES) as OctoberEventKind[]) if (k !== 'watcher') (EVENT_RULES as Record<string, { weight: number }>)[k] = { ...EVENT_RULES[k], weight: 0 };
    try {
      const r = tickDirector(d, c);
      const w = r.begun[0];
      expect(w.kind).toBe('watcher');
      let seen = false;
      for (let i = 0; i < 20; i++) if (tickDirector(d, c).seen.includes('watcher')) seen = true;
      expect(seen).toBe(true);
      c.px = w.x;
      c.py = w.y + 2;
      tickDirector(d, c);
      expect(w.going).not.toBeNull();
      for (let i = 0; i < 10; i++) tickDirector(d, c);
      expect(d.events).toHaveLength(0);
    } finally {
      Object.assign(EVENT_RULES, saved);
    }
  });

  it('the animals see it first', () => {
    const c = ctx();
    const d = newDirector(c.rand);
    let reacted = 0;
    let begun = 0;
    for (let t = 0; t < 3600; t += c.dt) {
      const r = tickDirector(d, c);
      if (r.react) reacted++;
      begun += r.begun.length;
      for (const e of r.begun) if (e.kind === 'eyes') expect(e.age).toBeLessThan(0);
    }
    expect(reacted).toBeGreaterThan(begun / 3);
  });
});

describe('the pale thing', () => {
  function gctx(over: Partial<GhostContext> = {}): GhostContext {
    return { dt: 0.1, darkness: 1, where: 'out', px: 66, py: 36, facing: 'down', view: { minX: 52, maxX: 80, minY: 24, maxY: 48 }, rand: mulberry32(11), lit: [], ...over };
  }

  it('is never about outdoors by day', () => {
    const g = newGhost(mulberry32(1));
    const c = gctx({ darkness: 0 });
    for (let t = 0; t < 3600; t += c.dt) {
      tickGhost(g, c);
      expect(g.mode).toBe('away');
    }
  });

  it('turns up now and then after dark, and is gone when approached', () => {
    const g = newGhost(mulberry32(1));
    const c = gctx();
    let appearances = 0;
    let last = 'away';
    for (let t = 0; t < 3600; t += c.dt) {
      tickGhost(g, c);
      if (g.mode !== 'away' && last === 'away') appearances++;
      last = g.mode;
      if (g.mode !== 'away' && g.mode !== 'pumpkin' && g.shown > 0.9 && !g.going) {
        // Walk straight up to it.
        tickGhost(g, { ...c, px: g.x + 1, py: g.y });
        expect(g.going).toBe(true);
      }
    }
    expect(appearances).toBeGreaterThan(3);
    expect(appearances).toBeLessThan(40);
  });

  it('by a lit jack-o’-lantern it stays, and once a night it leaves something', () => {
    const state = createNewGame();
    const pk = PUMPKINS[0];
    const g = newGhost(mulberry32(1));
    const c = gctx({ px: pk.x, py: pk.y + 6, lit: [{ id: pk.id, x: pk.x, y: pk.y }], rand: () => 0.1 });
    for (let t = 0; t < 200 && g.mode !== 'pumpkin'; t += c.dt) tickGhost(g, c);
    expect(g.mode).toBe('pumpkin');
    for (let i = 0; i < 30; i++) tickGhost(g, c);
    // Walk right up: it doesn't run.
    const close = { ...c, px: g.x - 1, py: g.y };
    tickGhost(g, close);
    expect(g.going).toBe(false);
    expect(ghostApproachable(g, close.px, close.py)).toBe(true);
    state.clock.totalMinutes = 3 * 1440 + 22 * 60;
    expect(meetGhost(state, g)).toBe('gift');
    expect(meetGhost(state, g)).toBe('tilt');
    expect(state.october.gifts).toBe(1);
    state.clock.totalMinutes += 1440;
    expect(meetGhost(state, g)).toBe('gift');
  });
});

describe('pumpkins', () => {
  it('carve into jack-o’-lanterns, mostly the usual faces, the odd one a rare one', () => {
    const rand = mulberry32(9);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 5000; i++) {
      const f = pickFace(rand);
      counts[f] = (counts[f] ?? 0) + 1;
    }
    for (const f of ['happy', 'goofy', 'surprised', 'spooky', 'verySpooky']) expect(counts[f]).toBeGreaterThan(200);
    const rare = FACES.filter((f) => f.rare).reduce((s, f) => s + (counts[f.id] ?? 0), 0);
    expect(rare / 5000).toBeLessThan(0.05);
    expect(rare).toBeGreaterThan(0);
  });

  it('remember their faces, and every face ever carved', () => {
    const state = createNewGame();
    const a = carvePumpkin(state, 'pk-porch-1', () => 0.01)!;
    expect(a.face).toBe('happy');
    expect(a.recarved).toBe(false);
    expect(a.newFace).toBe(true);
    const b = carvePumpkin(state, 'pk-porch-1', () => 0.999)!;
    expect(b.face).toBe('fox');
    expect(b.recarved).toBe(true);
    expect(b.rare).toBe(true);
    expect(state.october.carved['pk-porch-1']).toBe('fox');
    expect(state.october.faces).toEqual(['happy', 'fox']);
    expect(carvePumpkin(state, 'not-a-pumpkin', () => 0.5)).toBeNull();
  });

  it('a stray one is gone by morning', () => {
    const state = createNewGame();
    state.clock.totalMinutes = 2 * 1440 + 23 * 60;
    state.october.stray = { x: 50, y: 30, face: 'spooky', until: nextDawn(state.clock.totalMinutes) };
    expect(state.october.stray.until).toBe(3 * 1440 + 5 * 60);
    expect(strayPumpkin(state)).not.toBeNull();
    state.clock.totalMinutes = 3 * 1440 + 6 * 60;
    expect(strayPumpkin(state)).toBeNull();
  });
});

describe('the journal’s October page', () => {
  it('only has what has been seen, and the visitor only once it has come back', () => {
    const state = createNewGame();
    expect(octoberNotes(state)).toEqual([]);
    noteSeen(state, 'eyes');
    noteSeen(state, 'visitor');
    expect(octoberNotes(state).map((n) => n.note.id)).toEqual(['eyes']);
    noteSeen(state, 'visitor');
    const v = octoberNotes(state).find((n) => n.note.id === 'visitor')!;
    expect(v.lines).toHaveLength(1);
    noteSeen(state, 'visitor');
    expect(octoberNotes(state).find((n) => n.note.id === 'visitor')!.lines).toHaveLength(2);
  });

  it('says more about the pale thing the more it has been seen', () => {
    const state = createNewGame();
    for (let i = 0; i < 6; i++) noteSeen(state, 'ghost');
    expect(octoberNotes(state).find((n) => n.note.id === 'ghost')!.lines.join(' ')).toMatch(/lit/);
  });
});

describe('the yard dressed for Halloween', () => {
  it('everything stands on dry ground inside the valley, clear of the house and the greenhouse', async () => {
    const { HALLOWEEN_DECOR, STRING_LIGHTS } = await import('../src/game/data/october');
    const { isWater, isInsideHomeFootprint, GRID_W, GRID_H } = await import('../src/game/data/worldMap');
    for (const d of HALLOWEEN_DECOR) {
      expect(d.x > 0 && d.x < GRID_W && d.y > 0 && d.y < GRID_H, `${d.kind} ${d.x},${d.y}`).toBe(true);
      expect(isWater(Math.floor(d.x), Math.floor(d.y)), `${d.kind} in the creek`).toBe(false);
      // Crows sit up on the roof and the broom leans on the wall; everything else stands on the ground.
      if (d.kind !== 'crow' && d.kind !== 'broom') expect(isInsideHomeFootprint(Math.floor(d.x), Math.floor(d.y)), `${d.kind} inside the house`).toBe(false);
    }
    for (const line of STRING_LIGHTS) expect(line.length).toBeGreaterThanOrEqual(2);
  });
});
