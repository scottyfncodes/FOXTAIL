import { GREENHOUSE_BACK_EXIT, GREENHOUSE_SIDE_EXIT } from '../src/game/data/stations';
import { GREENHOUSE_DOORS, BUILDING_DOORS, HOUSE_BACK_EXIT, DOOR_OUTWARD, isKeepClearTile } from '../src/game/data/interior';
import { isInsideHomeFootprint } from '../src/game/data/worldMap';
import { describe, it, expect } from 'vitest';
import { createNewGame } from '../src/game/state';
import { zoneAt, HOUSE_FOOTPRINT, HOUSE_DOOR, GREENHOUSE_FOOTPRINT, GREENHOUSE_DOOR } from '../src/game/data/worldMap';
import { isBlockedOutdoor, isBlockedIndoor, indoorSolids } from '../src/game/world/Collision';
import { generateObstacles, buildBlockingSet } from '../src/game/world/Obstacles';
import {
  INTERIOR_W,
  INTERIOR_H,
  PARTITION_X,
  PARTITION_DOOR_YS,
  FRONT_DOOR,
  GREENHOUSE_EXIT,
  LIVING_FIXTURES,
  isInteriorWallTile,
  interiorWaypoint,
  roomAt,
} from '../src/game/data/interior';
import { tryMove } from '../src/game/world/Movement';

describe('the house and the greenhouse', () => {
  it('is one building: a third house, two-thirds greenhouse, side by side', () => {
    expect(HOUSE_FOOTPRINT.x).toBe(GREENHOUSE_FOOTPRINT.x + GREENHOUSE_FOOTPRINT.w);
    expect(HOUSE_FOOTPRINT.w / (HOUSE_FOOTPRINT.w + GREENHOUSE_FOOTPRINT.w)).toBeCloseTo(1 / 3, 1);
    // Inside, the living room is the east third of one continuous interior.
    expect((INTERIOR_W - PARTITION_X) / INTERIOR_W).toBeCloseTo(1 / 3, 1);
    expect(roomAt(PARTITION_X + 2)).toBe('living');
    expect(roomAt(PARTITION_X - 2)).toBe('greenhouse');
  });

  it('can’t be walked through from outside, except by its two doors', () => {
    const blocked = buildBlockingSet(generateObstacles());
    for (let y = HOUSE_FOOTPRINT.y; y < HOUSE_FOOTPRINT.y + HOUSE_FOOTPRINT.h; y++) {
      for (let x = HOUSE_FOOTPRINT.x; x < HOUSE_FOOTPRINT.x + HOUSE_FOOTPRINT.w; x++) expect(isBlockedOutdoor(x + 0.5, y + 0.5, blocked)).toBe(true);
    }
    expect(zoneAt(HOUSE_FOOTPRINT.x + 1, HOUSE_FOOTPRINT.y + 1)).toBe('greenhouse');
    expect(isBlockedOutdoor(HOUSE_DOOR.x + 0.5, HOUSE_DOOR.y + 0.5, blocked)).toBe(false);
    expect(isBlockedOutdoor(GREENHOUSE_DOOR.x + 0.5, GREENHOUSE_DOOR.y + 0.5, blocked)).toBe(false);
  });

  it('leaves the rest of the valley’s trees and rocks exactly where they were', () => {
    const obs = generateObstacles();
    // Nothing grows on the house's own ground or in front of its door…
    expect(obs.some((o) => o.x >= HOUSE_FOOTPRINT.x && o.x < HOUSE_FOOTPRINT.x + HOUSE_FOOTPRINT.w && o.y >= HOUSE_FOOTPRINT.y && o.y <= HOUSE_DOOR.y + 1)).toBe(false);
    // …and the layout is deterministic, so old saves see the same world.
    expect(generateObstacles()).toEqual(obs);
    expect(obs.length).toBeGreaterThan(200);
  });

  it('has walls all round, a doorway between the rooms, and a way out of each', () => {
    for (let x = 0; x < INTERIOR_W; x++) {
      // The top wall is solid, bar the greenhouse's back door and the house's.
      expect(!isInteriorWallTile(x, 0)).toBe(x === GREENHOUSE_BACK_EXIT.x || x === HOUSE_BACK_EXIT.x);
    }
    for (let y = 1; y < INTERIOR_H - 1; y++) expect(!isInteriorWallTile(0, y)).toBe(y === GREENHOUSE_SIDE_EXIT.y);
    expect(isInteriorWallTile(GREENHOUSE_EXIT.x, GREENHOUSE_EXIT.y)).toBe(false);
    expect(isInteriorWallTile(FRONT_DOOR.x, FRONT_DOOR.y)).toBe(false);
    for (let y = 1; y < INTERIOR_H - 1; y++) expect(isInteriorWallTile(PARTITION_X, y)).toBe(!PARTITION_DOOR_YS.includes(y));
  });

  it('gives the greenhouse three doors and the house a back door, each open to walk through and kept clear of furniture', () => {
    const obstacles = buildBlockingSet(generateObstacles());
    expect(GREENHOUSE_DOORS.map((d) => d.id)).toEqual(['garden', 'back', 'side']);
    expect(BUILDING_DOORS.map((d) => d.id)).toEqual(['garden', 'back', 'side', 'house']);
    // The house's back door opens out of the living room.
    expect(roomAt(HOUSE_BACK_EXIT.x + 0.5)).toBe('living');
    for (const d of BUILDING_DOORS) {
      expect(isInteriorWallTile(d.inside.x, d.inside.y)).toBe(false);
      expect(isKeepClearTile(d.inside.x, d.inside.y)).toBe(true);
      const o = DOOR_OUTWARD[d.wall];
      // Outdoors, the door tile and the step beyond it are open ground next to the building.
      expect(isBlockedOutdoor(d.outside.x + 0.5, d.outside.y + 0.5, obstacles)).toBe(false);
      expect(isBlockedOutdoor(d.outside.x + o.x + 0.5, d.outside.y + o.y + 0.5, obstacles)).toBe(false);
      expect(isInsideHomeFootprint(d.outside.x - o.x, d.outside.y - o.y)).toBe(true);
    }
  });

  it('lets you walk from the front door through the living room into the greenhouse', () => {
    const state = createNewGame();
    const solids = indoorSolids(state);
    const blocked = (x: number, y: number) => isBlockedIndoor(x, y, solids);
    let p = { x: FRONT_DOOR.x + 0.5, y: FRONT_DOOR.y - 0.5 };
    const target = { x: 12.5, y: 7.9 };
    for (let i = 0; i < 2000 && Math.hypot(p.x - target.x, p.y - target.y) > 0.3; i++) {
      const wp = interiorWaypoint(p.x, p.y, target.x, target.y);
      const d = Math.hypot(wp.x - p.x, wp.y - p.y) || 1;
      const next = tryMove(p.x, p.y, ((wp.x - p.x) / d) * 0.05, ((wp.y - p.y) / d) * 0.05, blocked);
      if (next.x === p.x && next.y === p.y) {
        // Slide around furniture the simple way.
        p = tryMove(p.x, p.y, 0, -0.05, blocked);
      } else p = next;
    }
    expect(roomAt(p.x)).toBe('greenhouse');
  });

  it('furnishes the living room with a couch, a TV, a cat bed, a putting mat and doorways to the rest of the house', () => {
    const kinds = LIVING_FIXTURES.map((f) => f.kind);
    for (const k of ['couch', 'tv', 'coffeeTable', 'sideTable', 'catBed', 'catTree', 'puttingMat'] as const) expect(kinds).toContain(k);
    for (const f of LIVING_FIXTURES) {
      expect(f.x).toBeGreaterThan(PARTITION_X);
      expect(f.x + f.w).toBeLessThanOrEqual(INTERIOR_W - 1);
    }
  });
});
