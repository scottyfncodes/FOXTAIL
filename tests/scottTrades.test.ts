import { describe, it, expect } from 'vitest';
import { tickScott, companySpots, scottTruck, DRIVE_SPEED, LOAF_MINUTES } from '../src/game/systems/scott';
import { DRIVE_ROUTE, SCOTT_SPOTS, SCOTT_TRUCK_PARK, findScottSpot } from '../src/game/data/scottSpots';
import { createNewGame } from '../src/game/state';
import { segmentHitsRect, isWater, zoneAt, GREENHOUSE_FOOTPRINT, HOUSE_FOOTPRINT, MARKET_STALL } from '../src/game/data/worldMap';
import { generateObstacles } from '../src/game/world/Obstacles';

describe('Scott, jack of all trades', () => {
  it('fishes the creek, splits wood, bakes, works on his truck and drives it', () => {
    const kinds = new Set(SCOTT_SPOTS.map((s) => s.kind));
    for (const k of ['fish', 'chop', 'bake', 'wrench', 'drive'] as const) expect(kinds.has(k)).toBe(true);
    const fishing = SCOTT_SPOTS.find((s) => s.kind === 'fish')!;
    expect(zoneAt(fishing.x, fishing.y)).toBe('creek');
    expect(isWater(fishing.x, fishing.y)).toBe(false);
    // Facing the water, which is to his left.
    expect(fishing.face).toBe('left');
    expect(isWater(fishing.x - 1.5, fishing.y)).toBe(true);
  });

  it('drives a loop that keeps clear of the house, the stall and the rocks, and parks where he started', () => {
    const route = [SCOTT_TRUCK_PARK, ...DRIVE_ROUTE];
    expect(route[route.length - 1]).toEqual(SCOTT_TRUCK_PARK);
    const pad = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 });
    const rocks = generateObstacles().filter((o) => o.kind === 'rock' || o.kind === 'tree');
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1];
      const b = route[i];
      for (const r of [GREENHOUSE_FOOTPRINT, HOUSE_FOOTPRINT, MARKET_STALL]) expect(segmentHitsRect(pad(r), a.x, a.y, b.x, b.y)).toBe(false);
      for (const o of rocks) expect(segmentHitsRect({ x: o.x, y: o.y, w: 1, h: 1 }, a.x, a.y, b.x, b.y)).toBe(false);
      expect(isWater(b.x, b.y)).toBe(false);
    }
  });

  it('gets in his truck, drives the loop, and climbs out again back where it lives', () => {
    const state = createNewGame();
    const s = state.scott;
    const door = findScottSpot('truck-drive')!;
    Object.assign(s, { zone: door.zone, x: door.x, y: door.y, activity: 'traveling', targetSpotId: door.id, currentSpotId: null });
    tickScott(s, { dtSeconds: 0.1, now: 100, rand: () => 0.5 });
    expect(s.activity).toBe('driving');
    expect(scottTruck(s)).toMatchObject({ x: s.x, y: s.y });
    let away = 0;
    let guard = 0;
    while (s.activity === 'driving' && guard < 5000) {
      tickScott(s, { dtSeconds: 0.1, now: 100 + guard * 0.1, rand: () => 0.5 });
      away = Math.max(away, Math.hypot(s.x - SCOTT_TRUCK_PARK.x, s.y - SCOTT_TRUCK_PARK.y));
      guard++;
    }
    expect(s.activity).not.toBe('driving');
    expect(away).toBeGreaterThan(20);
    // About as long as the loop takes at his speed.
    let len = 0;
    let p = SCOTT_TRUCK_PARK;
    for (const q of DRIVE_ROUTE) {
      len += Math.hypot(q.x - p.x, q.y - p.y);
      p = q;
    }
    expect(guard * 0.1).toBeCloseTo(len / DRIVE_SPEED, 0);
    expect(scottTruck(s)).toMatchObject(SCOTT_TRUCK_PARK);
    expect(Math.hypot(s.x - door.x, s.y - door.y)).toBeLessThan(0.01);
  });

  it('bakes a loaf, which cools on the coffee table for a while', () => {
    const state = createNewGame();
    const s = state.scott;
    const bake = findScottSpot('kitchen-bake')!;
    Object.assign(s, { zone: 'greenhouse', x: bake.x, y: bake.y, activity: 'traveling', targetSpotId: bake.id, currentSpotId: null });
    tickScott(s, { dtSeconds: 0.1, now: 100, rand: () => 0.5 });
    expect(s.activity).toBe('baking');
    expect(tickScott(s, { dtSeconds: 0.1, now: 101, rand: () => 0.5 })).toBeNull();
    expect(tickScott(s, { dtSeconds: 0.1, now: s.nextChangeAt, rand: () => 0.5 })).toBe('baked');
    expect(s.loafUntil).toBeGreaterThan(s.nextChangeAt);
    expect(s.loafUntil! - LOAF_MINUTES).toBeLessThanOrEqual(s.nextChangeAt);
  });
});

describe('Scott and his family', () => {
  it('wanders over to Scout and to Ellen outdoors, and to Ranger when she has settled indoors', () => {
    const state = createNewGame();
    state.player.inGreenhouse = false;
    state.cat.activity = 'sleeping';
    state.cat.currentSpotId = 'cat-bed';
    const spots = companySpots(state);
    expect(spots.map((s) => s.kind).sort()).toEqual(['ellen', 'pet', 'scout']);
    expect(spots.find((s) => s.kind === 'pet')!.zone).toBe('greenhouse');
    expect(spots.find((s) => s.kind === 'ellen')!.zone).not.toBe('greenhouse');
    state.cat.activity = 'wandering';
    expect(companySpots(state).some((s) => s.kind === 'pet')).toBe(false);
  });

  it('walks to Ellen, says hello, and moves on once she wanders off', () => {
    const state = createNewGame();
    const s = state.scott;
    Object.assign(s, { zone: 'meadow', x: 60, y: 44, activity: 'traveling', targetSpotId: 'visit-ellen', currentSpotId: null });
    const ellen = { x: 64, y: 44 };
    const spots = () => companySpots({ player: { ...ellen, inGreenhouse: false }, scout: { x: 63, y: 45 }, cat: state.cat });
    let guard = 0;
    while (s.activity === 'traveling' && guard < 200) {
      tickScott(s, { dtSeconds: 0.1, now: 100, rand: () => 0.5, extraSpots: spots() });
      guard++;
    }
    expect(s.activity).toBe('withEllen');
    expect(s.facing).toBe('left');
    expect(Math.hypot(s.x - ellen.x, s.y - ellen.y)).toBeLessThan(1.2);
    // She heads off: he doesn't trail after her.
    ellen.x = 75;
    tickScott(s, { dtSeconds: 0.1, now: 101, rand: () => 0.5, extraSpots: spots() });
    expect(s.activity).toBe('traveling');
  });

  it('never walks through a wall to someone on the other side of the door', () => {
    const state = createNewGame();
    const s = state.scott;
    Object.assign(s, { zone: 'meadow', x: 60, y: 44, activity: 'tinkering', currentSpotId: 'meadow-garden-tinker', nextChangeAt: 0 });
    const extra = companySpots({ player: { x: 10, y: 6, inGreenhouse: true }, scout: { x: 11, y: 6 }, cat: { ...state.cat, activity: 'sleeping' } });
    for (let i = 0; i < 40; i++) {
      Object.assign(s, { zone: 'meadow', x: 60, y: 44, activity: 'tinkering', currentSpotId: 'meadow-garden-tinker', nextChangeAt: 0 });
      tickScott(s, { dtSeconds: 0.1, now: 100, rand: () => i / 40, extraSpots: extra });
      expect(s.targetSpotId.startsWith('visit-')).toBe(false);
    }
    // And if she goes indoors while he's on his way, he gives it up.
    Object.assign(s, { zone: 'meadow', x: 60, y: 44, activity: 'traveling', targetSpotId: 'visit-ellen' });
    tickScott(s, { dtSeconds: 0.1, now: 100, rand: () => 0.5, extraSpots: extra });
    expect(s.activity).not.toBe('traveling');
    expect(s.x).toBe(60);
  });
});
