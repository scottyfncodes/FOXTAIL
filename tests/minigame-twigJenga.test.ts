import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../src/game/engine/Random';
import { findMiniGame } from '../src/game/systems/minigames';
import {
  COLLAPSE_LEAN,
  PILE_SPECS,
  SESSION_PILES,
  canPull,
  layerHold,
  leanGuess,
  leanOf,
  makePile,
  pull,
  pullable,
  sessionSeed,
  type Pile,
} from '../src/game/systems/minigames/twigJenga';

const GOAL = findMiniGame('twigJenga')!.goal;

/** A neat pile with no awkward twigs and no jostle, for checking the rules on their own. */
function plainPile(layers: number): Pile {
  const p = makePile(0, 1);
  p.layers = Array.from({ length: layers }, () => Array.from({ length: 3 }, () => ({ kind: 'plain' as const, present: true, nudge: 0, shade: 0.5 })));
  p.baseLean = 0;
  return p;
}

/** Taps anything, never stops, until it falls. */
function aimless(p: Pile, rand: () => number): number {
  while (!p.collapsed) {
    const o = pullable(p);
    if (!o.length) break;
    const c = o[Math.floor(rand() * o.length)];
    pull(p, c.layer, c.slot);
  }
  return p.removed;
}

/** Holds each twig, watches where the guide says the pile would lean, takes the steadiest, and stops when it gets hairy. */
function careful(p: Pile): number {
  for (;;) {
    let best: { layer: number; slot: number; l: number } | null = null;
    for (const o of pullable(p)) {
      const g = leanGuess(p, o.layer, o.slot);
      if (g.collapsed || Math.abs(g.lean) > 0.75) continue;
      if (!best || Math.abs(g.lean) < best.l) best = { ...o, l: Math.abs(g.lean) };
    }
    if (!best) break;
    if (pull(p, best.layer, best.slot).collapsed) break;
  }
  return p.removed;
}

function session(seed: number, play: (p: Pile) => number): number {
  let total = 0;
  for (let i = 0; i < SESSION_PILES; i++) total += play(makePile(i, sessionSeed(seed)));
  return total;
}

describe('twig jenga: the rules', () => {
  it('is deterministic per seed', () => {
    expect(makePile(2, 42)).toEqual(makePile(2, 42));
    expect(makePile(2, 42)).not.toEqual(makePile(2, 43));
  });

  it('never lets the top layer be pulled', () => {
    const p = makePile(0, 5);
    expect(canPull(p, p.layers.length - 1, 1)).toBe(false);
    expect(pull(p, p.layers.length - 1, 1).ok).toBe(false);
  });

  it('holds on the middle twig, or on both ends', () => {
    const p = plainPile(5);
    pull(p, 1, 0);
    pull(p, 1, 2);
    expect(layerHold(p.layers[1])).toBe('narrow');
    expect(leanOf(p)).toBe(0);
    pull(p, 3, 1);
    expect(layerHold(p.layers[3])).toBe('solid');
    expect(leanOf(p)).toBe(0);
    expect(p.collapsed).toBe(false);
    expect(p.removed).toBe(3);
  });

  it('leans toward the one outer twig left, more so low down', () => {
    const low = plainPile(6);
    pull(low, 0, 1);
    pull(low, 0, 2);
    const high = plainPile(6);
    pull(high, 4, 1);
    pull(high, 4, 2);
    expect(layerHold(high.layers[4])).toBe('edge');
    expect(leanOf(high)).toBeLessThan(0);
    // Low down, with the whole pile on one edge, it's over.
    expect(low.collapsed || Math.abs(leanOf(low)) > Math.abs(leanOf(high))).toBe(true);
  });

  it('falls when a layer is left with nothing in it, and that twig does not count', () => {
    const p = plainPile(5);
    pull(p, 2, 0);
    pull(p, 2, 2);
    const r = pull(p, 2, 1);
    expect(r.collapsed).toBe(true);
    expect(r.reason).toBe('empty');
    expect(p.removed).toBe(2);
    expect(pull(p, 1, 0).ok).toBe(false);
  });

  it('two middle-only layers stacked pivot and lean', () => {
    const p = plainPile(6);
    for (const l of [1, 2]) {
      pull(p, l, 0);
      pull(p, l, 2);
    }
    expect(Math.abs(leanOf(p))).toBeGreaterThan(0.3);
  });

  it('a knotty edge twig holds better than a crooked one', () => {
    const a = plainPile(6);
    const b = plainPile(6);
    a.layers[3][0].kind = 'knotty';
    b.layers[3][0].kind = 'crooked';
    for (const p of [a, b]) {
      pull(p, 3, 1);
      pull(p, 3, 2);
    }
    expect(Math.abs(leanOf(a))).toBeLessThan(Math.abs(leanOf(b)));
  });

  it('piles get less steady as the session goes on', () => {
    expect(PILE_SPECS[2].layers).toBeGreaterThan(PILE_SPECS[0].layers);
    expect(Math.abs(makePile(2, 9).baseLean)).toBeGreaterThan(0);
    expect(PILE_SPECS[2].crooked).toBeGreaterThan(PILE_SPECS[0].crooked);
    // Lean always ends a pile before COLLAPSE_LEAN is passed silently.
    const p = makePile(1, 3);
    aimless(p, mulberry32(1));
    expect(p.collapsed).toBe(true);
    expect(COLLAPSE_LEAN).toBe(1);
  });
});

describe('twig jenga: the session', () => {
  it('a careful player reaches the goal', () => {
    const scores = Array.from({ length: 60 }, (_, s) => session(s, careful));
    expect(Math.min(...scores)).toBeGreaterThanOrEqual(GOAL);
  });

  it('an aimless tapper usually does not', () => {
    const scores = Array.from({ length: 200 }, (_, s) => {
      const rand = mulberry32(s * 31 + 7);
      return session(s, (p) => aimless(p, rand));
    });
    const reached = scores.filter((x) => x >= GOAL).length / scores.length;
    expect(reached).toBeLessThan(0.15);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(avg).toBeLessThan(GOAL * 0.85);
  });

  it('is bounded: a pile can only give up so many twigs', () => {
    let max = 0;
    for (let i = 0; i < SESSION_PILES; i++) max += (PILE_SPECS[i].layers - 1) * 2;
    expect(max).toBeLessThan(45);
    expect(session(3, careful)).toBeLessThanOrEqual(max);
  });
});
