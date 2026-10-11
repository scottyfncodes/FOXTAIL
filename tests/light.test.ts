import { describe, it, expect } from 'vitest';
import { lightLevels, lightVisible, goldenHour } from '../src/game/world/LightArt';
import { MINUTES_PER_DAY } from '../src/game/engine/Clock';

// Classic's light: a golden hour at each end of the day, a night that gathers
// at the edges, and nothing at all drawn in plain daylight. It must never jump.

describe('the light over the valley', () => {
  it('draws nothing at midday, so the brightest hours cost nothing', () => {
    for (const h of [10, 12, 14, 16]) expect(lightVisible(lightLevels(h * 60))).toBe(false);
  });

  it('has a golden hour in the morning and a deeper one in the evening, and none at noon', () => {
    expect(goldenHour(7 * 60)).toBeGreaterThan(0.5);
    expect(goldenHour(19 * 60 + 10)).toBeGreaterThan(0.9);
    expect(goldenHour(12 * 60)).toBe(0);
    expect(goldenHour(2 * 60)).toBe(0);
  });

  it('is full dark at midnight, with the edges darker than the middle', () => {
    const l = lightLevels(0);
    expect(l.darkness).toBe(1);
    expect(l.edge).toBeGreaterThan(l.wash);
    // Never so dark the ground round Ellen can't be read.
    expect(l.wash).toBeLessThanOrEqual(0.45);
  });

  it('never jumps from one minute to the next, all day round (no flicker, no pop at the edges of the golden hours)', () => {
    let prev = lightLevels(0);
    for (let m = 1; m <= MINUTES_PER_DAY; m++) {
      const l = lightLevels(m);
      expect(Math.abs(l.edge - prev.edge)).toBeLessThan(0.02);
      expect(Math.abs(l.wash - prev.wash)).toBeLessThan(0.02);
      expect(Math.abs(l.gold - prev.gold)).toBeLessThan(0.02);
      prev = l;
    }
  });

  it('dims the golden hour under cloud', () => {
    expect(lightLevels(19 * 60, 1).gold).toBeLessThan(lightLevels(19 * 60, 0).gold);
  });
});
