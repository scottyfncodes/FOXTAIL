import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { DISCOVERY_SPOTS } from '../src/game/data/discoveryPoints';
import { PLANTS, PLANT_LIST } from '../src/game/data/plants';
import { spotPool, seasonalPool } from '../src/game/systems/spots';
import { setTheme } from '../src/game/season';
import { createNewGame, type OwnedPlant } from '../src/game/state';
import { occupantOf, occupantsByPlace } from '../src/game/systems/propagation';
import { groundCacheCovers, wildPlantOnScreen } from '../src/game/world/Renderer';
import { drawStringLights } from '../src/game/world/HalloweenArt';
import type { LushField } from '../src/game/systems/wild';
import { isNight } from '../src/game/engine/Clock';

// The optimisations that keep the phone cool must never change what's
// picked, found or drawn: these pin each one to what it replaced.

afterEach(() => setTheme('classic', false));

describe('patch pools, worked out once', () => {
  it('are exactly the species, in the same order, the patch always offered', () => {
    for (const spot of DISCOVERY_SPOTS) {
      const fresh = spot.pool ? spot.pool.map((id) => PLANTS[id]).filter(Boolean) : PLANT_LIST.filter((p) => !p.foxOnly && !p.secret && !p.season && p.habitat.includes(spot.zone));
      expect(spotPool(spot)).toEqual(fresh);
      // And it's the one list, not rebuilt each time it's asked for.
      expect(spotPool(spot)).toBe(spotPool(spot));
    }
  });

  it('October’s seasonal pool still follows the weather, the dark and the lantern', () => {
    setTheme('october', false);
    const state = createNewGame();
    for (const [lantern, minutes, weather] of [[0, 12 * 60, 'clear'], [1, 23 * 60, 'rain'], [0, 2 * 60, 'overcast']] as const) {
      state.tools.lantern = lantern;
      state.clock.totalMinutes = minutes;
      state.weather.condition = weather;
      for (const spot of DISCOVERY_SPOTS) {
        const fresh =
          spot.foxLed || spot.pool
            ? []
            : PLANT_LIST.filter(
                (p) =>
                  p.season === 'october' &&
                  !p.secret &&
                  p.habitat.includes(spot.zone) &&
                  !(p.needsLantern && !state.tools.lantern) &&
                  !(p.appearsWhen === 'night' && !isNight(minutes)) &&
                  !(p.appearsWhen === 'rain' && weather !== 'rain')
              );
        expect(seasonalPool(state, spot).map((p) => p.id)).toEqual(fresh.map((p) => p.id));
      }
    }
  });
});

describe('who is in each bed and spot, looked up together', () => {
  it('agrees with occupantOf everywhere, the first plant found winning', () => {
    const state = createNewGame();
    const plant = (id: string, location: OwnedPlant['location']): OwnedPlant => ({ id, defId: 'pothos', variantId: 'golden', seed: 1, growth: 0, location, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false });
    state.plants = {
      a: plant('a', { kind: 'nursery', bedId: 'n1' }),
      b: plant('b', { kind: 'display', slotId: 's1', potId: 'terracotta' }),
      c: plant('c', { kind: 'wild', x: 3, y: 4, zone: 'meadow' }),
      // Two claiming the same places (an old save, say): the first is the one shown.
      d: plant('d', { kind: 'nursery', bedId: 'n1' }),
      e: plant('e', { kind: 'display', slotId: 's1', potId: 'terracotta' }),
      f: plant('f', { kind: 'nursery', bedId: 'n2' }),
    };
    const occ = occupantsByPlace(state);
    for (const id of ['n1', 'n2', 'n3', 's1', 's2']) {
      expect(occ.beds.get(id)).toBe(occupantOf(state, { bedId: id }));
      expect(occ.slots.get(id)).toBe(occupantOf(state, { slotId: id }));
    }
    expect(occ.beds.get('n1')?.id).toBe('a');
    expect(occ.slots.get('s1')?.id).toBe('b');
  });
});

describe('the ground, painted once and slid along', () => {
  const lush = {} as LushField;
  const painted = { key: 'k', lush, bounds: { minX: 10, maxX: 30, minY: 20, maxY: 50 } };

  it('serves while every tile that could show is in it', () => {
    expect(groundCacheCovers(painted, 'k', lush, { minX: 10, maxX: 30, minY: 20, maxY: 50 })).toBe(true);
    expect(groundCacheCovers(painted, 'k', lush, { minX: 12, maxX: 28, minY: 22, maxY: 48 })).toBe(true);
  });

  it('is repainted as soon as the view would reach past it', () => {
    expect(groundCacheCovers(painted, 'k', lush, { minX: 9, maxX: 29, minY: 22, maxY: 48 })).toBe(false);
    expect(groundCacheCovers(painted, 'k', lush, { minX: 12, maxX: 31, minY: 22, maxY: 48 })).toBe(false);
    expect(groundCacheCovers(painted, 'k', lush, { minX: 12, maxX: 28, minY: 19, maxY: 48 })).toBe(false);
    expect(groundCacheCovers(painted, 'k', lush, { minX: 12, maxX: 28, minY: 22, maxY: 51 })).toBe(false);
  });

  it('is repainted when the zoom, the look or the overgrowth changes', () => {
    const inside = { minX: 12, maxX: 28, minY: 22, maxY: 48 };
    expect(groundCacheCovers(painted, 'other zoom', lush, inside)).toBe(false);
    expect(groundCacheCovers(painted, 'k', {} as LushField, inside)).toBe(false);
    expect(groundCacheCovers(painted, 'k', null, inside)).toBe(false);
  });
});

describe('wild plants off the edge of the screen', () => {
  // A small deterministic generator, so the sweep is the same every run.
  function rng(seed: number) {
    return () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
  }

  it('are only skipped when nothing of them — shadow, sprite either way round and swaying, sparkle — could land on screen', () => {
    const rand = rng(7);
    const W = 402;
    const H = 874;
    let skipped = 0;
    for (let n = 0; n < 20000; n++) {
      const tile = 20 + rand() * 80;
      const x = -300 + rand() * (W + 600);
      const y = -300 + rand() * (H + 600);
      const spread = tile * (0.12 + rand() * 0.5);
      const w = tile * (0.3 + rand() * 3);
      const h = tile * (0.3 + rand() * 4);
      const sprite = rand() < 0.1 ? null : { w, h, ox: w / 2, oy: h * (0.5 + rand() * 0.5) };
      const sparkle = rand() < 0.3;
      if (wildPlantOnScreen(x, y, tile, spread, sprite, sparkle, W, H)) continue;
      skipped++;
      // Everything it would have drawn, as points.
      const pts: [number, number][] = [
        [x - spread, y + tile * 0.04],
        [x + spread, y + tile * 0.04],
        [x, y + tile * 0.04 - spread * 0.4],
        [x, y + tile * 0.04 + spread * 0.4],
      ];
      if (sprite) {
        const by = y + tile * 0.05;
        for (const sway of [-0.08, 0, 0.08])
          for (const flip of [1, -1])
            for (const [lx, ly] of [
              [-sprite.ox, -sprite.oy],
              [sprite.w - sprite.ox, -sprite.oy],
              [-sprite.ox, sprite.h - sprite.oy],
              [sprite.w - sprite.ox, sprite.h - sprite.oy],
            ])
              pts.push([x + flip * lx + sway * ly, by + ly]);
      }
      if (sparkle) {
        for (const sx of [-0.28 - 0.1, 0.28 + 0.1]) for (const sy of [-0.18 - 0.1, 0.18 + 0.1]) pts.push([x + sx * tile, y - tile * 0.35 + sy * tile]);
      }
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const off = Math.max(...xs) < 0 || Math.min(...xs) > W || Math.max(...ys) < 0 || Math.min(...ys) > H;
      expect(off).toBe(true);
    }
    // And the sweep did exercise the skipping.
    expect(skipped).toBeGreaterThan(1000);
  });
});

describe('string lights off the edge of the screen', () => {
  /** A stand-in canvas that writes down every call and every setting, in order. */
  function recorder() {
    const log: string[] = [];
    const props: Record<string, unknown> = { globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1 };
    const ctx = new Proxy(props, {
      get(t, k: string) {
        if (k in t) return t[k];
        return (...args: unknown[]) => log.push(`${k}(${args.map((a) => (typeof a === 'number' ? a.toFixed(3) : typeof a)).join(',')})`);
      },
      set(t, k: string, v) {
        t[k] = v;
        log.push(`${k}=${typeof v === 'number' ? v.toFixed(3) : String(v)}`);
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, log, props };
  }

  // jsdom has no real canvas: give the bulbs' glow sprite a stand-in one to be drawn on.
  beforeEach(() => {
    const fake = { createRadialGradient: () => ({ addColorStop: () => {} }), fillRect: () => {}, fillStyle: '' };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fake as unknown as CanvasRenderingContext2D);
  });
  afterEach(() => vi.restoreAllMocks());

  for (const lit of [0, 1]) {
    it(`draw exactly as before while they're all in view (${lit ? 'lit' : 'unlit'})`, () => {
      const pts = [{ x: 20, y: 40 }, { x: 180, y: 50 }, { x: 360, y: 40 }];
      const a = recorder();
      const b = recorder();
      drawStringLights(a.ctx, pts, 44, lit, 1234, 2);
      drawStringLights(b.ctx, pts, 44, lit, 1234, 2, { w: 402, h: 874 });
      expect(b.log).toEqual(a.log);
    });

    it(`leave the canvas just as drawing them all would have (${lit ? 'lit' : 'unlit'})`, () => {
      // Running far off to the right of a phone screen.
      const pts = [{ x: 20, y: 40 }, { x: 400, y: 50 }, { x: 1400, y: 40 }];
      const a = recorder();
      const b = recorder();
      drawStringLights(a.ctx, pts, 44, lit, 1234, 2);
      drawStringLights(b.ctx, pts, 44, lit, 1234, 2, { w: 402, h: 874 });
      expect(b.log.length).toBeLessThan(a.log.length);
      expect(b.props).toEqual(a.props);
      // What it did draw, it drew the same way, in the same order.
      let i = 0;
      for (const entry of b.log) {
        while (i < a.log.length && a.log[i] !== entry) i++;
        expect(i).toBeLessThan(a.log.length);
        i++;
      }
    });
  }
});

describe('the frame loop, out of sight', () => {
  function setVisibility(v: 'hidden' | 'visible') {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => v === 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  it('stops while the page is hidden and picks up again, once, when it’s back', async () => {
    // Enough of a canvas for the game to start on.
    const noop = () => {};
    const ctx = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? canvas : k === 'getTransform' ? () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) : noop), set: () => true });
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    const queued = new Map<number, FrameRequestCallback>();
    let nextId = 1;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      queued.set(nextId, cb);
      return nextId++;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => queued.delete(id));
    const { Game } = await import('../src/game/engine/Game');
    const game = new Game(canvas);
    let frames = 0;
    const g = game as unknown as { update: (dt: number) => void; render: (now: number) => void };
    g.update = () => {};
    g.render = () => {
      frames++;
    };
    const step = (t: number) => {
      const due = [...queued.entries()];
      queued.clear();
      for (const [, cb] of due) cb(t);
    };
    try {
      setVisibility('visible');
      game.start();
      step(16);
      step(32);
      expect(frames).toBe(2);
      expect(queued.size).toBe(1);

      setVisibility('hidden');
      expect(queued.size).toBe(0);
      step(48);
      expect(frames).toBe(2);

      // Back again: one loop, not two, however many times it's told.
      setVisibility('visible');
      setVisibility('visible');
      expect(queued.size).toBe(1);
      step(64);
      step(80);
      expect(frames).toBe(4);
      expect(queued.size).toBe(1);
    } finally {
      game.stop();
      setVisibility('visible');
      vi.unstubAllGlobals();
    }
  });
});
