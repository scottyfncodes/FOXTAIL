import { describe, it, expect } from 'vitest';
import { createNewGame } from '../src/game/state';
import { CURIOSITIES } from '../src/game/data/curiosities';
import { KEEPSAKES, keepsakesOnShow, keepsakeLayoutProblems, hasKeepsake } from '../src/game/data/keepsakes';
import { collectFoxFind } from '../src/game/systems/foxFinds';

describe('curiosities, kept at home', () => {
  it('gives every curiosity its own place in the house, clear of windows, doorways and each other', () => {
    expect(keepsakeLayoutProblems()).toEqual([]);
    expect(KEEPSAKES).toHaveLength(CURIOSITIES.length);
  });

  it('shows nothing until it has been found, then shows it for good', () => {
    const state = createNewGame();
    expect(keepsakesOnShow(state)).toEqual([]);
    state.foxFinds.push({ id: 'f', kind: 'curiosity', x: 20, y: 20, zone: 'meadow', seed: 1, curiosityId: 'hedgehog', createdAt: 0, expiresAt: 9999 });
    expect(collectFoxFind(state, 'f', 1).ok).toBe(true);
    expect(keepsakesOnShow(state).map((k) => k.curiosityId)).toEqual(['hedgehog']);
    expect(hasKeepsake(state, 'hedgehog')).toBe(true);
    expect(hasKeepsake(state, 'splitGeode')).toBe(false);
  });
});
