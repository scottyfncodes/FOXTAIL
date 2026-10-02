import { describe, it, expect } from 'vitest';
import { riverTurtles, riverFrogs, pondTurtleAt, pondTurtleCount, pondFrogs, pondPads, pondFrogCount, fireflies, fireflyStrength, FIREFLY_AREAS, TURTLE_STONES } from '../src/game/systems/wildlife';
import { CREEK_WATER, BRIDGES, rectContains } from '../src/game/data/worldMap';
import { inPond } from '../src/game/systems/koi';
import type { PlacedDecor } from '../src/game/state';

const DEFAULT_AREA = 2.2 * 1.5;
const pond = (w: number, h: number): PlacedDecor => ({ id: 'p1', decorId: 'gardenPond', x: 50, y: 30, w, h }) as PlacedDecor;

describe('turtles', () => {
  it('bask on the creek stones and swim in its water, never on a bridge', () => {
    for (let now = 0; now < 400000; now += 1500) {
      for (const t of riverTurtles(now)) {
        expect(t.x).toBeGreaterThanOrEqual(CREEK_WATER.x);
        expect(t.x).toBeLessThanOrEqual(CREEK_WATER.x + CREEK_WATER.w);
        expect(BRIDGES.some((b) => rectContains(b, t.x, t.y))).toBe(false);
        if (t.basking) expect(TURTLE_STONES.some((s) => s.x === t.x && s.y === t.y)).toBe(true);
      }
    }
  });

  it('spend some of the time basking and some swimming', () => {
    let basking = 0;
    let swimming = 0;
    for (let now = 0; now < 600000; now += 1000) for (const t of riverTurtles(now)) (t.basking ? basking++ : swimming++);
    expect(basking).toBeGreaterThan(0);
    expect(swimming).toBeGreaterThan(0);
  });

  it('come to bigger ponds only, and keep to the water and its rim', () => {
    expect(pondTurtleCount(pond(1.5, 1))).toBe(0);
    expect(pondTurtleCount(pond(3, 2))).toBe(1);
    expect(pondTurtleCount(pond(5, 4))).toBe(2);
    const d = pond(5, 4);
    for (let now = 0; now < 200000; now += 2000) {
      for (let k = 0; k < 2; k++) {
        const t = pondTurtleAt(d, k, now);
        expect(inPond({ decor: [d] }, t.x, t.y)).toBe(true);
      }
    }
  });
});

describe('frogs', () => {
  it('sit along the creek banks and hop now and then', () => {
    let hops = 0;
    for (let now = 0; now < 120000; now += 100) {
      for (const f of riverFrogs(now, false)) {
        expect(Math.min(Math.abs(f.x - CREEK_WATER.x), Math.abs(f.x - CREEK_WATER.x - CREEK_WATER.w))).toBeLessThan(0.8);
        expect(BRIDGES.some((b) => rectContains(b, f.x, f.y))).toBe(false);
        if (f.hop !== null) hops++;
      }
    }
    expect(hops).toBeGreaterThan(0);
  });

  it('sit on a pond’s lily pads, one or more to every pond', () => {
    const d = pond(3, 2);
    const pads = pondPads(d, DEFAULT_AREA);
    expect(pondFrogCount(pond(1.5, 1))).toBe(1);
    expect(pondFrogCount(pond(5, 4))).toBe(4);
    for (let now = 0; now < 60000; now += 250) {
      for (const f of pondFrogs(d, DEFAULT_AREA, now, true)) {
        if (f.hop === null) expect(pads.some((p) => Math.hypot(p.x - f.x, p.y - f.y) < 1e-9)).toBe(true);
        expect(inPond({ decor: [d] }, f.x, f.y)).toBe(true);
      }
    }
  });

  it('croak more after dark', () => {
    const count = (night: boolean) => {
      let n = 0;
      for (let now = 0; now < 60000; now += 50) n += riverFrogs(now, night).filter((f) => f.croak > 0).length;
      return n;
    };
    expect(count(true)).toBeGreaterThan(count(false));
  });
});

describe('lightning bugs', () => {
  it('only come out in the dark, and not in the rain', () => {
    expect(fireflyStrength(0, 'clear')).toBe(0);
    expect(fireflyStrength(0.25, 'clear')).toBe(0);
    expect(fireflyStrength(0.9, 'clear')).toBe(1);
    expect(fireflyStrength(0.9, 'rain')).toBe(0);
    expect(fireflyStrength(0.9, 'overcast')).toBeGreaterThan(0);
  });

  it('keep to their own stretches of the valley and blink on and off', () => {
    for (const area of FIREFLY_AREAS) {
      let lit = 0;
      let dark = 0;
      for (let now = 0; now < 30000; now += 333) {
        for (const b of fireflies(area, now)) {
          expect(rectContains({ ...area.rect, w: area.rect.w + 1e-9, h: area.rect.h + 1e-9 }, b.x, b.y)).toBe(true);
          if (b.glow > 0.5) lit++;
          if (b.glow === 0) dark++;
        }
      }
      expect(lit).toBeGreaterThan(0);
      expect(dark).toBeGreaterThan(lit);
    }
  });
});
