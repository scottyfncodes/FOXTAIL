import { describe, it, expect } from 'vitest';
import { tickScott, companySpots, truckSpots, LOAF_MINUTES } from '../src/game/systems/scott';
import { DRIVE_LOOP, SCOTT_SPOTS, findScottSpot } from '../src/game/data/scottSpots';
import { createNewGame, type TruckState } from '../src/game/state';
import { segmentHitsRect, isWater, zoneAt, GREENHOUSE_FOOTPRINT, HOUSE_FOOTPRINT, MARKET_STALL } from '../src/game/data/worldMap';
import { TRUCK_PARK, truckHitsBuilding, boardTruck } from '../src/game/systems/truck';
import { generateObstacles } from '../src/game/world/Obstacles';

describe('Scott, jack of all trades', () => {
  it('fishes the creek, splits wood and bakes, wherever the truck is', () => {
    const kinds = new Set(SCOTT_SPOTS.map((s) => s.kind));
    for (const k of ['fish', 'chop', 'bake'] as const) expect(kinds.has(k)).toBe(true);
    // The truck isn't his to keep: none of his fixed spots are about it.
    expect(kinds.has('wrench')).toBe(false);
    expect(kinds.has('drive')).toBe(false);
    const fishing = SCOTT_SPOTS.find((s) => s.kind === 'fish')!;
    expect(zoneAt(fishing.x, fishing.y)).toBe('creek');
    expect(isWater(fishing.x, fishing.y)).toBe(false);
    // Facing the water, which is to his left.
    expect(fishing.face).toBe('left');
    expect(isWater(fishing.x - 1.5, fishing.y)).toBe(true);
  });

  it('only has the truck to work on or drive once Ellen has bought it', () => {
    expect(truckSpots(null)).toEqual([]);
    const truck = { ...TRUCK_PARK, facing: 'left' as const };
    expect(truckSpots(truck).map((s) => s.kind).sort()).toEqual(['drive', 'wrench']);
    // Parked off in the woods, he'll tinker with it but not take it for a spin.
    expect(truckSpots({ x: 20, y: 10, facing: 'left' }).map((s) => s.kind)).toEqual(['wrench']);
  });

  it('drives a loop that keeps clear of the house, the stall and the rocks', () => {
    const pad = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 });
    const rocks = generateObstacles().filter((o) => o.kind === 'rock' || o.kind === 'tree');
    for (let i = 1; i < DRIVE_LOOP.length; i++) {
      const a = DRIVE_LOOP[i - 1];
      const b = DRIVE_LOOP[i];
      for (const r of [GREENHOUSE_FOOTPRINT, HOUSE_FOOTPRINT, MARKET_STALL]) expect(segmentHitsRect(pad(r), a.x, a.y, b.x, b.y)).toBe(false);
      for (const o of rocks) expect(segmentHitsRect({ x: o.x, y: o.y, w: 1, h: 1 }, a.x, a.y, b.x, b.y)).toBe(false);
      expect(isWater(b.x, b.y)).toBe(false);
    }
  });

  for (const parked of [
    { name: 'by the stall', x: TRUCK_PARK.x, y: TRUCK_PARK.y },
    { name: 'west of the greenhouse', x: 55, y: 36 },
    { name: 'right under the house', x: 72, y: 42.3 },
  ]) {
    it(`borrows Ellen's truck parked ${parked.name}, never drives it over the greenhouse, and puts it back`, () => {
      const state = createNewGame();
      const truck: TruckState = { x: parked.x, y: parked.y, facing: 'right', bed: [] };
      state.truck = truck;
      const s = state.scott;
      const door = truckSpots(truck).find((t) => t.kind === 'drive')!;
      Object.assign(s, { zone: 'meadow', x: door.x, y: door.y, activity: 'traveling', targetSpotId: door.id, currentSpotId: null });
      const ctx = (now: number) => ({ dtSeconds: 0.05, now, rand: () => 0.5, extraSpots: truckSpots(truck), truck });
      tickScott(s, ctx(100));
      expect(s.activity).toBe('driving');
      // Ellen can't hop in while he's out in it.
      expect(boardTruck(state)).toBe(false);
      let away = 0;
      let guard = 0;
      while (s.activity === 'driving' && guard < 20000) {
        tickScott(s, ctx(100 + guard * 0.05));
        expect(truckHitsBuilding(truck.x, truck.y, truck.facing)).toBe(false);
        away = Math.max(away, Math.hypot(truck.x - parked.x, truck.y - parked.y));
        guard++;
      }
      expect(s.activity).not.toBe('driving');
      expect(away).toBeGreaterThan(15);
      expect(truck).toMatchObject({ x: parked.x, y: parked.y, facing: 'right' });
      expect(Math.hypot(s.x - door.x, s.y - door.y)).toBeLessThan(0.01);
      expect(boardTruck(state)).toBe(true);
    });
  }

  it('gives up on a drive if Ellen gets in first', () => {
    const state = createNewGame();
    const truck: TruckState = { ...TRUCK_PARK, facing: 'left', bed: [] };
    const s = state.scott;
    const door = truckSpots(truck).find((t) => t.kind === 'drive')!;
    Object.assign(s, { zone: 'meadow', x: door.x - 3, y: door.y, activity: 'traveling', targetSpotId: door.id, currentSpotId: null });
    // She's in it: no truck on offer, so his spot is gone.
    tickScott(s, { dtSeconds: 0.05, now: 100, rand: () => 0.5, extraSpots: [], truck: null });
    expect(s.activity).not.toBe('traveling');
    expect(s.activity).not.toBe('driving');
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

describe('Scott and the creek', () => {
  it('never wades across: he walks round by a bridge, whichever side he starts on', async () => {
    const { isWater } = await import('../src/game/data/worldMap');
    const cases = [
      { from: { x: 60, y: 30 }, to: findScottSpotOrThrow('woodland-woodpile') },
      { from: { x: 29, y: 22 }, to: findScottSpotOrThrow('meadow-driving-range') },
      { from: { x: 20, y: 45 }, to: findScottSpotOrThrow('creek-fishing') },
    ];
    for (const { from, to } of cases) {
      const state = createNewGame();
      const s = state.scott;
      Object.assign(s, { zone: zoneAt(from.x, from.y), x: from.x, y: from.y, activity: 'traveling', targetSpotId: to.id, currentSpotId: null });
      let guard = 0;
      while (s.activity === 'traveling' && guard < 4000) {
        tickScott(s, { dtSeconds: 0.05, now: 100, rand: () => 0.5 });
        expect(isWater(Math.floor(s.x), Math.floor(s.y)), `${to.id} at ${s.x.toFixed(1)},${s.y.toFixed(1)}`).toBe(false);
        guard++;
      }
      expect(s.currentSpotId).toBe(to.id);
    }
  });
});

function findScottSpotOrThrow(id: string) {
  const s = findScottSpot(id);
  if (!s) throw new Error(id);
  return s;
}

describe('Scott at the wheel', () => {
  const start = () => {
    const state = createNewGame();
    const truck: TruckState = { x: TRUCK_PARK.x, y: TRUCK_PARK.y, facing: 'right', bed: [] };
    state.truck = truck;
    const s = state.scott;
    const door = truckSpots(truck).find((t) => t.kind === 'drive')!;
    Object.assign(s, { zone: 'meadow', x: door.x, y: door.y, activity: 'traveling', targetSpotId: door.id, currentSpotId: null });
    return { state, truck, s };
  };

  it('stops short of Ellen standing in the road, toots once, and drives on when she steps aside', () => {
    // Where the truck goes on its drive, with nobody about.
    const dry = start();
    const route: { x: number; y: number }[] = [];
    const dctx = (now: number) => ({ dtSeconds: 0.05, now, rand: () => 0.5, extraSpots: truckSpots(dry.truck), truck: dry.truck });
    tickScott(dry.s, dctx(100));
    for (let i = 0; dry.s.activity === 'driving' && i < 20000; i++) {
      tickScott(dry.s, dctx(100 + i * 0.05));
      route.push({ x: dry.truck.x, y: dry.truck.y });
    }
    // Ellen (and Scout beside her) stand right in his way, a third of the way round.
    const at = route[Math.floor(route.length / 3)];
    const ellen = { x: at.x, y: at.y };
    const scout = { x: at.x + 0.4, y: at.y + 0.2 };
    const { truck, s } = start();
    const ctx = (now: number, onFoot: { x: number; y: number }[]) => ({ dtSeconds: 0.05, now, rand: () => 0.5, extraSpots: truckSpots(truck), truck, onFoot });
    tickScott(s, ctx(100, [ellen, scout]));
    let honks = 0;
    for (let i = 0; i < 6000; i++) {
      if (tickScott(s, ctx(100 + i * 0.05, [ellen, scout])) === 'honk') honks++;
      for (const p of [ellen, scout]) {
        const fp = truckHitsBuilding(truck.x, truck.y, truck.facing, [{ x: p.x - 0.2, y: p.y - 0.2, w: 0.4, h: 0.4 }]);
        expect(fp).toBe(false);
      }
    }
    // Still out, waiting patiently, having tooted just the once.
    expect(s.activity).toBe('driving');
    expect(honks).toBe(1);
    // She steps out of the road; he carries on and gets home.
    for (let i = 0; s.activity === 'driving' && i < 20000; i++) tickScott(s, ctx(500 + i * 0.05, [{ x: 5, y: 5 }]));
    expect(s.activity).not.toBe('driving');
    expect(truck).toMatchObject({ x: TRUCK_PARK.x, y: TRUCK_PARK.y });
  });
});
