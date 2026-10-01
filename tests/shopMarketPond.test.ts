import { describe, it, expect, beforeEach } from 'vitest';
import { createNewGame, type GameState } from '../src/game/state';
import { SHOP_ITEMS, findShopItem, POND_DEFAULT, POND_MAX, POND_MIN, POND_STEP, RESALE_RATE, DECOR_IDS } from '../src/game/data/shop';
import { DECOR_DEFS, FLAGSTONE, STONES_PER_PIECE, STONE_PIECE } from '../src/game/data/decor';
import { buyItem, buyBlockReason, itemPrice, clampPondSize, pondBasePrice, pondPrice, resellables, sellBack, resalePrice, stockedPonds } from '../src/game/systems/market';
import { CUTTING_FAIL, cuttingFailChance } from '../src/game/systems/propagation';
import { placeDecor, pickUpDecor } from '../src/game/systems/decor';
import { yardFootprint, yardPieces } from '../src/game/systems/yard';
import { riverKoi, RIVER_KOI, pondKoiAt, koiCapacity, pondCapacity, addKoiToPond, addKoiBlock, removeKoiFromPond, freeKoi, koiInPond, KOI_VARIETIES, pondSize, inPond } from '../src/game/systems/koi';
import { isWater, BRIDGES, rectContains } from '../src/game/data/worldMap';
import { drawFlagstone, drawSteppingStonePiece, stonePositions, drawMarketSign, MARKET_SIGN_TEXT } from '../src/game/world/GardenArt';
import { migrateSave } from '../src/game/engine/SaveManager';
import { checkPlanting } from '../src/game/systems/landscape';
import { MarketPanel } from '../src/ui/MarketPanel';
import type { Game } from '../src/game/engine/Game';

/** A canvas context that records what's drawn, for checking art without a real canvas. */
function recorder() {
  const calls: { fn: string; args: unknown[] }[] = [];
  const ctx = new Proxy(
    { font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textAlign: '', textBaseline: '', globalAlpha: 1 } as Record<string, unknown>,
    {
      get(target, prop: string) {
        if (prop in target) return target[prop];
        if (prop === 'measureText') return (t: string) => ({ width: t.length * 10 });
        return (...args: unknown[]) => calls.push({ fn: prop, args });
      },
      set(target, prop: string, v) {
        target[prop] = v;
        return true;
      },
    }
  );
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const OLD_CUTTING_FAIL = { common: 0.05, uncommon: 0.12, rare: 0.22, veryRare: 0.32, extremelyRare: 0.42, unheardOf: 0.5, mythic: 0.5 };

describe('stepping stones', () => {
  it('are cut to the flagstones in front of the house: same size, same spacing, same zigzag', () => {
    expect(FLAGSTONE.rx).toBe(0.26);
    expect(FLAGSTONE.ry).toBe(0.15);
    expect(FLAGSTONE.spacing).toBe(0.62);
    const { ctx, calls } = recorder();
    drawSteppingStonePiece(ctx, 100, 100, 50, false);
    const stones = calls.filter((c) => c.fn === 'ellipse');
    expect(stones).toHaveLength(STONES_PER_PIECE);
    for (const st of stones) {
      expect(st.args[2]).toBeCloseTo(FLAGSTONE.rx * 50);
      expect(st.args[3]).toBeCloseTo(FLAGSTONE.ry * 50);
    }
    // One drawn on its own (as the house path draws them) is exactly the same stone.
    const house = recorder();
    drawFlagstone(house.ctx, 0, 0, 50, 0);
    expect(house.calls.find((c) => c.fn === 'ellipse')!.args.slice(2, 4)).toEqual(stones[0].args.slice(2, 4));
  });

  it('come in an even number per piece, so pieces laid end to end continue the zigzag exactly', () => {
    expect(STONES_PER_PIECE % 2).toBe(0);
    const a = stonePositions(true);
    const b = stonePositions(true).map((p) => ({ dx: p.dx, dy: p.dy + STONES_PER_PIECE * FLAGSTONE.spacing }));
    const run = [...a, ...b];
    for (let i = 1; i < run.length; i++) {
      expect(run[i].dy - run[i - 1].dy).toBeCloseTo(FLAGSTONE.spacing);
      expect(run[i].dx).toBe(FLAGSTONE.stagger[i % 2]);
    }
  });

  it('take up the ground their stones cover, in the shop preview and in the garden alike', () => {
    expect(DECOR_DEFS.steppingStones.w).toBeCloseTo(STONE_PIECE.w);
    expect(DECOR_DEFS.steppingStones.h).toBeCloseTo(STONE_PIECE.h);
    expect(STONE_PIECE.w).toBeCloseTo(FLAGSTONE.spacing * (STONES_PER_PIECE - 1) + 2 * FLAGSTONE.rx);
    const fp = yardFootprint('steppingStones', 10, 10, 0);
    expect(fp.w).toBeCloseTo(STONE_PIECE.w);
    const turned = yardFootprint('steppingStones', 10, 10, 1);
    expect(turned.h).toBeCloseTo(STONE_PIECE.w);
    expect(findShopItem('steppingStones')!.price).toBe(6);
  });
});

describe('cuttings', () => {
  it('fail a little more often than before: a small step at every rarity, never a big one', () => {
    for (const [r, before] of Object.entries(OLD_CUTTING_FAIL)) {
      const now = CUTTING_FAIL[r as keyof typeof CUTTING_FAIL];
      expect(now, r).toBeGreaterThan(before);
      expect(now - before, r).toBeLessThanOrEqual(0.03 + 1e-9);
    }
    // Commons still take more than nine times in ten.
    expect(CUTTING_FAIL.common).toBeLessThan(0.1);
    const state = createNewGame();
    const p = { defId: 'pothos', variantId: 'golden' };
    expect(cuttingFailChance(state, p)).toBe(CUTTING_FAIL.common);
    state.owned.push('rootingKit');
    expect(cuttingFailChance(state, p)).toBeCloseTo(CUTTING_FAIL.common / 2);
  });
});

describe('ponds dug to size', () => {
  it('price by area: bigger always costs more, the original size still costs 3000, and nothing is free', () => {
    const state = createNewGame();
    expect(pondPrice(state, POND_DEFAULT.w, POND_DEFAULT.h)).toBe(3000);
    expect(itemPrice(state, 'gardenPond')).toBe(3000);
    const small = pondPrice(state, POND_MIN.w, POND_MIN.h);
    const medium = pondPrice(state, 3, 2);
    const large = pondPrice(state, POND_MAX.w, POND_MAX.h);
    expect(small).toBe(1360);
    expect(medium).toBe(5450);
    expect(large).toBe(18180);
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(medium);
    expect(medium).toBeLessThan(large);
    // Every step bigger costs more; the price per square tile is the same at every size.
    let last = 0;
    for (let w = POND_MIN.w; w <= POND_MAX.w; w += POND_STEP) {
      const p = pondBasePrice(w, 2);
      expect(p).toBeGreaterThan(last);
      last = p;
    }
    // Nonsense sizes are clamped to what the crew will dig, never priced at zero or below.
    expect(clampPondSize(-3, 0)).toEqual(POND_MIN);
    expect(clampPondSize(99, 99)).toEqual(POND_MAX);
    expect(clampPondSize(NaN, NaN)).toEqual(POND_MIN);
    expect(pondPrice(state, -5, -5)).toBe(small);
    // Ponds still compound, as before.
    state.purchases.gardenPond = 1;
    expect(pondPrice(state, 3, 2)).toBe(Math.round(medium * 1.3));
  });

  it('are bought at the chosen size, dug at that size, and keep it when picked up', () => {
    const state = createNewGame();
    state.coins = 1e6;
    expect(buyItem(state, 'gardenPond', { pond: { w: 4, h: 3 } })).toBe(true);
    expect(state.coins).toBe(1e6 - pondBasePrice(4, 3));
    expect(state.pondStock).toEqual([{ w: 4, h: 3 }]);
    const d = placeDecor(state, 'gardenPond', 50, 30)!;
    expect(d).toMatchObject({ w: 4, h: 3 });
    expect(state.pondStock).toEqual([]);
    const fp = yardFootprint('gardenPond', d.x, d.y, 0, yardPieces(state).find((p) => p.id === d.id)!.size);
    expect(fp.w).toBe(4);
    expect(fp.h).toBe(3);
    // Its water is as big as it was dug: nothing can be planted in it.
    expect(inPond(state, 51.5, 30.5)).toBe(true);
    expect(inPond(state, 52.5, 30)).toBe(false);
    expect(pickUpDecor(state, d.id)).toBe(true);
    expect(state.pondStock).toEqual([{ w: 4, h: 3 }]);
  });

  it('turned, it lies the other way', () => {
    expect(pondSize({ w: 4, h: 2, rot: 1 })).toEqual({ w: 2, h: 4 });
    expect(pondSize({})).toEqual(POND_DEFAULT);
  });
});

describe('koi in the creek', () => {
  it('a few of several varieties live there, always in the water and never under a bridge', () => {
    for (const t of [0, 12_345, 600_000, 3_600_000, 86_400_000]) {
      const fish = riverKoi(t);
      expect(fish).toHaveLength(RIVER_KOI);
      for (const k of fish) {
        expect(isWater(Math.floor(k.x), Math.floor(k.y)), `${k.x},${k.y}`).toBe(true);
        expect(BRIDGES.some((b) => rectContains(b, Math.floor(k.x), Math.floor(k.y)))).toBe(false);
      }
    }
    expect(RIVER_KOI).toBeLessThanOrEqual(10);
    expect(new Set(riverKoi(0).map((k) => k.variety)).size).toBeGreaterThanOrEqual(5);
    expect(KOI_VARIETIES.length).toBeGreaterThanOrEqual(6);
  });

  it('move smoothly: they get somewhere over time, but never jump between frames', () => {
    const a = riverKoi(10_000);
    const b = riverKoi(10_016);
    const later = riverKoi(40_000);
    a.forEach((k, i) => {
      expect(Math.hypot(b[i].x - k.x, b[i].y - k.y)).toBeLessThan(0.05);
      expect(Math.hypot(later[i].x - k.x, later[i].y - k.y)).toBeGreaterThan(0.05);
      // Facing the way it's going.
      const dx = b[i].x - k.x;
      const dy = b[i].y - k.y;
      expect(Math.cos(Math.atan2(-dx, dy) - k.heading)).toBeGreaterThan(0.9);
    });
  });
});

describe('koi in ponds', () => {
  function withPond(w: number, h: number): { state: GameState; pondId: string } {
    const state = createNewGame();
    state.coins = 1e6;
    // The original size is bought as-is (it predates the size steps).
    buyItem(state, 'gardenPond', w === POND_DEFAULT.w && h === POND_DEFAULT.h ? {} : { pond: { w, h } });
    const d = placeDecor(state, 'gardenPond', 50, 30)!;
    return { state, pondId: d.id };
  }

  it('the pond holds more koi the bigger it is, and none at all if it is tiny', () => {
    expect(koiCapacity(POND_MIN.w, POND_MIN.h)).toBe(0);
    expect(koiCapacity(POND_DEFAULT.w, POND_DEFAULT.h)).toBe(3);
    expect(koiCapacity(3, 2)).toBe(5);
    expect(koiCapacity(POND_MAX.w, POND_MAX.h)).toBe(12);
    let last = -1;
    for (const [w, h] of [[1.5, 1], [2, 1], [2, 1.5], [3, 2], [4, 3], [5, 4]]) {
      const c = koiCapacity(w, h);
      expect(c).toBeGreaterThanOrEqual(last);
      last = c;
    }
  });

  it('lets the player put their own koi in, up to the pond’s capacity, and take them out again', () => {
    const { state, pondId } = withPond(2.2, 1.5);
    for (let i = 0; i < 5; i++) expect(buyItem(state, 'koi')).toBe(true);
    expect(state.koi).toHaveLength(5);
    const pond = state.decor.find((d) => d.id === pondId)!;
    const cap = pondCapacity(pond);
    expect(cap).toBe(3);
    const ids = state.koi.map((k) => k.id);
    for (let i = 0; i < cap; i++) expect(addKoiToPond(state, pondId, ids[i])).toBe(true);
    expect(addKoiBlock(state, pondId, ids[cap])).toBe('full');
    expect(addKoiToPond(state, pondId, ids[cap])).toBe(false);
    expect(addKoiBlock(state, pondId, ids[0])).toBe('in-a-pond');
    expect(addKoiBlock(state, pondId, 'someone-elses-koi')).toBe('not-yours');
    expect(koiInPond(state, pond).map((k) => k.id)).toEqual(ids.slice(0, cap));
    expect(freeKoi(state)).toHaveLength(5 - cap);
    expect(removeKoiFromPond(state, pondId, ids[0])).toBe(true);
    expect(addKoiToPond(state, pondId, ids[cap])).toBe(true);
    // Each keeps its own markings.
    expect(new Set(state.koi.map((k) => k.seed)).size).toBe(5);
  });

  it('a pond too small for koi refuses them', () => {
    const { state, pondId } = withPond(POND_MIN.w, POND_MIN.h);
    buyItem(state, 'koi');
    expect(addKoiBlock(state, pondId, state.koi[0].id)).toBe('too-small');
  });

  it('they swim inside the water, and keep moving', () => {
    const pond = { x: 50, y: 30, w: 4, h: 3 };
    for (let k = 0; k < 12; k++) {
      for (const t of [0, 5000, 60_000, 999_999]) {
        const at = pondKoiAt(pond, k, t);
        const dx = (at.x - pond.x) / (pond.w / 2 - 0.15);
        const dy = (at.y - pond.y) / (pond.h / 2 - 0.15);
        expect(dx * dx + dy * dy).toBeLessThan(1);
      }
      const a = pondKoiAt(pond, k, 0);
      const b = pondKoiAt(pond, k, 4000);
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(0.05);
    }
  });

  it('nothing can be planted in a pond', () => {
    const { state } = withPond(4, 3);
    const world = { obstacleAt: () => null, isBuiltOrWater: () => false, isSpot: () => false };
    expect(checkPlanting(state, 'pothos', 51.2, 30.4, world, 0).block).toBe('decor');
  });
});

describe('selling back to the market', () => {
  it('pays half the list price for anything in stock, always less than it cost', () => {
    const state = createNewGame();
    state.coins = 1e6;
    const spent: Record<string, number> = {};
    for (const item of SHOP_ITEMS.filter((s) => s.repeatable)) {
      const before = state.coins;
      expect(buyItem(state, item.id), item.id).toBe(true);
      spent[item.stock ?? item.id] = (before - state.coins) / (item.pack ?? 1);
    }
    const list = resellables(state);
    expect(list.length).toBeGreaterThanOrEqual(SHOP_ITEMS.filter((s) => s.repeatable).length);
    for (const r of list) {
      const paid = r.kind === 'koi' ? findShopItem('koi')!.price : r.kind === 'pond' ? 3000 : spent[r.id];
      expect(r.value, r.name).toBeLessThan(paid);
      expect(r.value, r.name).toBeGreaterThanOrEqual(0);
      expect(r.value, r.name).toBeLessThanOrEqual(Math.floor(paid * RESALE_RATE));
    }
    expect(resalePrice(100)).toBe(50);
    expect(RESALE_RATE).toBe(0.5);
  });

  it('only sells what the player actually has: nothing placed, nothing bought as an upgrade, nothing twice', () => {
    const state = createNewGame();
    state.coins = 1000;
    expect(sellBack(state, 'decor', 'gardenBench')).toBeNull();
    expect(sellBack(state, 'koi', 'nope')).toBeNull();
    buyItem(state, 'gardenBench');
    buyItem(state, 'stallAwning');
    expect(resellables(state).some((r) => r.id === 'stallAwning')).toBe(false);
    const placed = placeDecor(state, 'gardenBench', 50, 30)!;
    expect(sellBack(state, 'decor', 'gardenBench')).toBeNull();
    pickUpDecor(state, placed.id);
    const coins = state.coins;
    expect(sellBack(state, 'decor', 'gardenBench')).toBe(30);
    expect(state.coins).toBe(coins + 30);
    expect(state.decorStock.gardenBench).toBe(0);
    expect(sellBack(state, 'decor', 'gardenBench')).toBeNull();
  });

  it('a koi in a pond can’t be sold until it is netted out', () => {
    const state = createNewGame();
    state.coins = 1e6;
    buyItem(state, 'gardenPond');
    const pond = placeDecor(state, 'gardenPond', 50, 30)!;
    buyItem(state, 'koi');
    const k = state.koi[0];
    addKoiToPond(state, pond.id, k.id);
    expect(sellBack(state, 'koi', k.id)).toBeNull();
    removeKoiFromPond(state, pond.id, k.id);
    expect(sellBack(state, 'koi', k.id)).toBe(60);
    expect(state.koi).toHaveLength(0);
  });

  it('sells a pond in stock at half its own size’s list price', () => {
    const state = createNewGame();
    state.coins = 1e6;
    buyItem(state, 'gardenPond', { pond: { w: 5, h: 4 } });
    buyItem(state, 'gardenPond', { pond: { w: 1.5, h: 1 } });
    expect(stockedPonds(state)).toEqual([{ w: 5, h: 4 }, { w: 1.5, h: 1 }]);
    const ponds = resellables(state).filter((r) => r.kind === 'pond');
    expect(ponds.map((p) => p.value)).toEqual([Math.floor(pondBasePrice(5, 4) / 2), Math.floor(pondBasePrice(1.5, 1) / 2)]);
    expect(sellBack(state, 'pond', '1')).toBe(680);
    expect(state.pondStock).toEqual([{ w: 5, h: 4 }]);
    expect(state.decorStock.gardenPond).toBe(1);
  });

  it('no buy-and-sell-back loop makes money: every round trip loses coins', () => {
    const state = createNewGame();
    state.coins = 1e7;
    for (let round = 0; round < 5; round++) {
      for (const item of SHOP_ITEMS.filter((s) => s.repeatable)) {
        const before = state.coins;
        const opts = item.id === 'gardenPond' ? { pond: { w: 5, h: 4 } } : {};
        if (!buyItem(state, item.id, opts)) continue;
        for (const r of resellables(state)) while (sellBack(state, r.kind, r.id) !== null && r.kind !== 'koi' && r.kind !== 'pond') {}
        // Sell anything left (koi, ponds) once.
        for (const r of resellables(state)) sellBack(state, r.kind, r.id);
        expect(state.coins, item.id).toBeLessThan(before);
      }
    }
    expect(resellables(state)).toEqual([]);
  });
});

describe('the market UI', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  function setup(state = createNewGame()) {
    const game = {
      state,
      buy: (id: string, opts?: Parameters<typeof buyItem>[2]) => buyItem(state, id, opts),
      sellBack: (kind: Parameters<typeof sellBack>[1], id: string) => sellBack(state, kind, id),
      onStateTouched: null,
    } as unknown as Game;
    const market = new MarketPanel(game);
    market.panel.open();
    const tab = (id: string) => (Array.from(market.panel.tabsEl.children).find((b) => (b as HTMLElement).dataset.tab === id) as HTMLElement).click();
    return { state, market, body: market.panel.body, tab };
  }

  it('shows the resale value first, and only sells on a second, confirming press', () => {
    const state = createNewGame();
    state.coins = 1000;
    buyItem(state, 'gardenLantern');
    const { body, tab } = setup(state);
    tab('resell');
    const row = () => Array.from(body.querySelectorAll('.resell-row')).find((r) => r.textContent!.includes('Garden Lantern'))!;
    expect(row().textContent).toContain('Sells back for 15 coins');
    (row().querySelector('.resell-btn') as HTMLButtonElement).click();
    expect(state.decorStock.gardenLantern).toBe(1);
    expect(row().textContent).toContain('Sell it for 15 coins?');
    (row().querySelector('.resell-cancel') as HTMLButtonElement).click();
    expect(row().querySelector('.resell-confirm')).toBeNull();
    (row().querySelector('.resell-btn') as HTMLButtonElement).click();
    const coins = state.coins;
    (row().querySelector('.resell-confirm') as HTMLButtonElement).click();
    expect(state.coins).toBe(coins + 15);
    expect(state.decorStock.gardenLantern).toBe(0);
  });

  it('offers one double nursery bed and no single or one-off pair, and lets the pond be sized before buying', () => {
    const state = createNewGame();
    state.coins = 1e6;
    const { body, tab } = setup(state);
    tab('shop');
    const names = Array.from(body.querySelectorAll('.shop-row .entry-name')).map((n) => n.textContent!);
    expect(names.filter((n) => /Nursery Bed/.test(n))).toEqual(['Double Nursery Bed']);
    const pondRow = () => Array.from(body.querySelectorAll('.shop-row')).find((r) => r.querySelector('.entry-name')!.textContent!.startsWith('Ornamental Pond'))!;
    const priceOf = () => Number(pondRow().querySelector(':scope > button')!.textContent!.replace(/\D/g, ''));
    const start = priceOf();
    (pondRow().querySelectorAll('.pond-more')[0] as HTMLButtonElement).click();
    expect(priceOf()).toBeGreaterThan(start);
    for (let i = 0; i < 20; i++) (pondRow().querySelectorAll('.pond-less')[0] as HTMLButtonElement).click();
    expect((pondRow().querySelectorAll('.pond-less')[0] as HTMLButtonElement).disabled).toBe(true);
    expect(priceOf()).toBeLessThan(start);
    (pondRow().querySelector(':scope > button') as HTMLButtonElement).click();
    expect(state.pondStock).toEqual([{ w: POND_MIN.w, h: 1.5 }]);
    expect(pondRow().textContent).toMatch(/koi/);
  });
});

describe('the Plant Market sign', () => {
  it('reads PLANT MARKET, sits above the canopy, and is no wider than the stall', () => {
    const { ctx, calls } = recorder();
    const tile = 48;
    const stallW = 2 * tile;
    const rect = drawMarketSign(ctx, 200, 100, stallW + tile * 0.1, tile);
    const text = calls.find((c) => c.fn === 'fillText')!;
    expect(MARKET_SIGN_TEXT).toBe('PLANT MARKET');
    expect(text.args[0]).toBe('PLANT MARKET');
    expect(text.args[1]).toBe(200);
    expect(rect.y + rect.h).toBeLessThanOrEqual(100);
    expect(rect.w).toBeLessThanOrEqual(stallW + tile * 0.2);
    expect(rect.h).toBeLessThan(tile * 0.4);
  });

  it('is drawn on the stall itself', async () => {
    const src = (await import('../src/game/world/Renderer.ts?raw')).default as string;
    const stall = src.slice(src.indexOf('private drawMarketStall'), src.indexOf('private drawDecor'));
    expect(stall).toContain('drawMarketSign(');
  });
});

describe('saves', () => {
  it('older saves load with nothing lost: no koi, no pond sizes, ponds and beds as they were', () => {
    const raw = createNewGame() as unknown as Record<string, unknown>;
    delete raw.koi;
    delete raw.pondStock;
    raw.decor = [{ id: 'p1', decorId: 'gardenPond', x: 50, y: 30 }];
    raw.decorStock = { gardenPond: 1, steppingStones: 3 };
    raw.owned = ['nurseryBeds', 'moreNurseryBeds'];
    raw.furnitureStock = { nurseryBed: 2 };
    raw.purchases = { nurseryBed: 2, gardenPond: 2 };
    raw.coins = 1234;
    const state = migrateSave(JSON.parse(JSON.stringify(raw)))!;
    expect(state.koi).toEqual([]);
    expect(state.pondStock).toEqual([]);
    expect(state.coins).toBe(1234);
    expect(pondSize(state.decor[0])).toEqual(POND_DEFAULT);
    expect(pondCapacity(state.decor[0])).toBe(3);
    expect(stockedPonds(state)).toEqual([POND_DEFAULT]);
    expect(state.owned).toEqual(['nurseryBeds', 'moreNurseryBeds']);
    expect(state.furnitureStock.nurseryBed).toBe(2);
    // The next pair of beds is priced on from the singles already bought.
    expect(itemPrice(state, 'doubleNurseryBed')).toBe(Math.round(45 * 1.5 ** 2 + 45 * 1.5 ** 3));
    // An old unsized pond in stock is dug at the original size.
    const placed = placeDecor(state, 'gardenPond', 20, 20)!;
    expect(pondSize(placed)).toEqual(POND_DEFAULT);
    expect(DECOR_IDS).toContain('steppingStones');
  });

  it('koi, sized ponds and the koi in them round-trip', () => {
    const state = createNewGame();
    state.coins = 1e6;
    buyItem(state, 'gardenPond', { pond: { w: 3, h: 2 } });
    buyItem(state, 'gardenPond', { pond: { w: 4, h: 4 } });
    const pond = placeDecor(state, 'gardenPond', 50, 30)!;
    buyItem(state, 'koi');
    buyItem(state, 'koi');
    addKoiToPond(state, pond.id, state.koi[0].id);
    const loaded = migrateSave(JSON.parse(JSON.stringify(state)))!;
    expect(loaded.koi).toEqual(state.koi);
    expect(loaded.pondStock).toEqual([{ w: 4, h: 4 }]);
    expect(loaded.decor.find((d) => d.id === pond.id)).toMatchObject({ w: 3, h: 2, koi: [state.koi[0].id] });
    expect(buyBlockReason(loaded, 'koi')).toBeNull();
  });
});
