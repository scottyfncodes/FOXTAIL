import { describe, it, expect, afterEach } from 'vitest';
import { createNewGame, type GameState, type OwnedPlant } from '../src/game/state';
import { migrateSave } from '../src/game/engine/SaveManager';
import { PLANTS } from '../src/game/data/plants';
import { recordFound, hasFound } from '../src/game/systems/collection';
import { takeCutting } from '../src/game/systems/propagation';
import { STAGE_AT } from '../src/game/systems/growth';
import { meetGhost, newGhost, leaveFind, pickLanternFind } from '../src/game/systems/october';
import { collectFoxFind } from '../src/game/systems/foxFinds';
import { mulberry32 } from '../src/game/engine/Random';
import { setTheme } from '../src/game/season';
import { MINUTES_PER_DAY } from '../src/game/engine/Clock';
import {
  MYSTERIES,
  MYSTERY_IDS,
  STAGE_AFTER,
  ON_TRACK_PACE,
  NUDGES,
  tickMysteries,
  mysteryOpen,
  mysteryStage,
  markOnTrack,
  pendingNudge,
  markNudged,
  solutionUnannounced,
  mysteryNotes,
  markSolutionRead,
  nudgeText,
  type MysteryId,
} from '../src/game/systems/mysteries';

/** Plays for this many real seconds, a second at a time. */
function play(state: GameState, seconds: number) {
  for (let i = 0; i < seconds; i++) tickMysteries(state, 1);
}

function openUp(state: GameState, id: MysteryId) {
  const m = MYSTERIES[id];
  for (const v of PLANTS[m.defId].variants) {
    if (v.id === m.target) break;
    recordFound(state, m.defId, v.id, 0);
  }
}

function plant(state: GameState, defId: string, variantId: string, growth: number): OwnedPlant {
  const p: OwnedPlant = { id: `p-${defId}-${variantId}`, defId, variantId, seed: 1, growth, location: { kind: 'wild', x: 30, y: 30, zone: 'woodland' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false };
  state.plants[p.id] = p;
  return p;
}

/** Cuttings from one plant, a day apart, until a form turns up (or `max` tries). Returns the tries it took, or -1. */
function cutUntil(state: GameState, p: OwnedPlant, want: string, rand: () => number, max = 2000): number {
  for (let i = 1; i <= max; i++) {
    p.lastCuttingAt = null;
    state.basket = [];
    const res = takeCutting(state, p.id, state.clock.totalMinutes, rand);
    if (res?.item?.variantId === want) return i;
  }
  return -1;
}

afterEach(() => setTheme('classic', false));

describe('the last mysteries: what they are', () => {
  it('names the real last form of each line, and the form just before it', () => {
    for (const id of MYSTERY_IDS) {
      const m = MYSTERIES[id];
      const vs = PLANTS[m.defId].variants.map((v) => v.id);
      expect(vs[vs.length - 1]).toBe(m.target);
      expect(vs[vs.length - 2]).toBe(m.before);
    }
    expect(MYSTERIES.hoya.target).toBe('starCluster');
    expect(MYSTERIES.mooncap.target).toBe('eclipse');
    expect(MYSTERIES.moonflower.target).toBe('paleVisitor');
  });

  it('has an observation for every step in every place one can come up', () => {
    for (const id of MYSTERY_IDS) {
      for (const lines of Object.values(NUDGES[id])) {
        expect(lines).toHaveLength(3);
        for (const l of lines!) expect(l.length).toBeGreaterThan(10);
      }
    }
    // The early observations never give the answer away.
    for (const id of MYSTERY_IDS) {
      const name = PLANTS[MYSTERIES[id].defId].variants.find((v) => v.id === MYSTERIES[id].target)!.name;
      for (const lines of Object.values(NUDGES[id])) for (const l of lines!) expect(l).not.toContain(name);
      for (const l of MYSTERIES[id].notes) expect(l).not.toContain(name);
      expect(MYSTERIES[id].solution).toContain(name);
    }
  });
});

describe('the last mysteries: when the hints come', () => {
  it('a fresh game has nothing open, however long it is played', () => {
    const s = createNewGame();
    play(s, STAGE_AFTER[4] + 60);
    for (const id of MYSTERY_IDS) {
      expect(mysteryOpen(s, id)).toBe(false);
      expect(mysteryStage(s, id)).toBe(0);
      expect(mysteryNotes(s, id, true)).toBeNull();
    }
    expect(s.mysteries).toEqual({});
  });

  it('nothing until the form before the last is found', () => {
    const s = createNewGame();
    recordFound(s, 'hoya', 'carnosa', 0);
    recordFound(s, 'hoya', 'krimsonQueen', 0);
    play(s, STAGE_AFTER[4] + 60);
    expect(mysteryStage(s, 'hoya')).toBe(0);
  });

  it('steps up only after real play, one step at a time, never early', () => {
    for (const id of MYSTERY_IDS) {
      const s = createNewGame();
      openUp(s, id);
      expect(mysteryOpen(s, id)).toBe(true);
      play(s, STAGE_AFTER[1] - 1);
      expect(mysteryStage(s, id)).toBe(0);
      expect(pendingNudge(s, id)).toBe(0);
      play(s, 1);
      expect(mysteryStage(s, id)).toBe(1);
      play(s, STAGE_AFTER[2] - STAGE_AFTER[1] - 1);
      expect(mysteryStage(s, id)).toBe(1);
      play(s, 1);
      expect(mysteryStage(s, id)).toBe(2);
      play(s, STAGE_AFTER[3] - STAGE_AFTER[2]);
      expect(mysteryStage(s, id)).toBe(3);
      expect(solutionUnannounced(s, id)).toBe(false);
      play(s, STAGE_AFTER[4] - STAGE_AFTER[3]);
      expect(mysteryStage(s, id)).toBe(4);
      expect(solutionUnannounced(s, id)).toBe(true);
      play(s, 10_000);
      expect(mysteryStage(s, id)).toBe(4);
    }
  });

  it('a long pause or a dropped frame counts as no more than a second', () => {
    const s = createNewGame();
    openUp(s, 'hoya');
    tickMysteries(s, 3 * 3600);
    expect(mysteryStage(s, 'hoya')).toBe(0);
    expect(s.mysteries.hoya.played).toBe(1);
  });

  it('goes slower while the player is doing the right thing', () => {
    const s = createNewGame();
    openUp(s, 'mooncap');
    markOnTrack(s, 'mooncap');
    play(s, 600);
    expect(s.mysteries.mooncap.played).toBeCloseTo(600 * ON_TRACK_PACE, 5);
    play(s, 60);
    expect(s.mysteries.mooncap.played).toBeCloseTo(600 * ON_TRACK_PACE + 60, 5);
  });

  it('marking on track before a mystery opens does nothing', () => {
    const s = createNewGame();
    markOnTrack(s, 'hoya');
    expect(s.mysteries.hoya).toBeUndefined();
  });

  it('shows only the latest observation, each one once', () => {
    const s = createNewGame();
    openUp(s, 'hoya');
    play(s, STAGE_AFTER[2]);
    // Step 1 was never seen in the world: only step 2's is waiting, not both.
    expect(pendingNudge(s, 'hoya')).toBe(2);
    markNudged(s, 'hoya', 2);
    expect(pendingNudge(s, 'hoya')).toBe(0);
    play(s, STAGE_AFTER[3] - STAGE_AFTER[2]);
    expect(pendingNudge(s, 'hoya')).toBe(3);
    markNudged(s, 'hoya', 3);
    play(s, STAGE_AFTER[4] - STAGE_AFTER[3]);
    expect(pendingNudge(s, 'hoya')).toBe(0);
    expect(solutionUnannounced(s, 'hoya')).toBe(true);
    markNudged(s, 'hoya', 4);
    expect(solutionUnannounced(s, 'hoya')).toBe(false);
  });

  it('the journal grows a line a step, and keeps the answer behind a tap', () => {
    const s = createNewGame();
    openUp(s, 'moonflower');
    play(s, STAGE_AFTER[1]);
    expect(mysteryNotes(s, 'moonflower', true)!.lines).toHaveLength(1);
    play(s, STAGE_AFTER[3] - STAGE_AFTER[1]);
    const n3 = mysteryNotes(s, 'moonflower', true)!;
    expect(n3.lines).toHaveLength(3);
    expect(n3.solution).toBeNull();
    markSolutionRead(s, 'moonflower');
    expect(mysteryNotes(s, 'moonflower', true)!.read).toBe(false);
    play(s, STAGE_AFTER[4] - STAGE_AFTER[3]);
    const n4 = mysteryNotes(s, 'moonflower', true)!;
    expect(n4.lines).toHaveLength(3);
    expect(n4.solution).toContain('Pale Visitor');
    expect(n4.solution).not.toContain('October look');
    expect(n4.read).toBe(false);
    // Out of the October look, it says what needs it.
    expect(mysteryNotes(s, 'moonflower', false)!.solution).toContain('October look');
    markSolutionRead(s, 'moonflower');
    expect(mysteryNotes(s, 'moonflower', true)!.read).toBe(true);
  });

  it('everything goes quiet once the last form is found', () => {
    const s = createNewGame();
    openUp(s, 'hoya');
    play(s, STAGE_AFTER[4]);
    expect(mysteryStage(s, 'hoya')).toBe(4);
    recordFound(s, 'hoya', 'starCluster', 0);
    expect(mysteryStage(s, 'hoya')).toBe(0);
    expect(mysteryNotes(s, 'hoya', true)).toBeNull();
    expect(solutionUnannounced(s, 'hoya')).toBe(false);
    const before = s.mysteries.hoya.played;
    play(s, 100);
    expect(s.mysteries.hoya.played).toBe(before);
  });

  it('the three keep separate clocks', () => {
    const s = createNewGame();
    openUp(s, 'hoya');
    play(s, STAGE_AFTER[2]);
    openUp(s, 'mooncap');
    play(s, STAGE_AFTER[1]);
    expect(mysteryStage(s, 'hoya')).toBe(2);
    expect(mysteryStage(s, 'mooncap')).toBe(1);
    expect(mysteryStage(s, 'moonflower')).toBe(0);
  });

  it('nudge text lookup', () => {
    expect(nudgeText('hoya', 'plant', 1)).toContain('glints');
    expect(nudgeText('hoya', 'ghost', 1)).toBeNull();
    expect(nudgeText('moonflower', 'ghost', 1)).toContain('white');
  });
});

describe('the last mysteries: saves', () => {
  it('keeps the hints’ progress through a save, and an older save starts with none', () => {
    const s = createNewGame();
    openUp(s, 'mooncap');
    play(s, STAGE_AFTER[2]);
    const back = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(back.mysteries.mooncap.stage).toBe(2);
    expect(mysteryStage(back, 'mooncap')).toBe(2);

    const old = JSON.parse(JSON.stringify(createNewGame()));
    delete old.mysteries;
    const migrated = migrateSave(old)!;
    expect(migrated.mysteries).toEqual({});
  });

  it('a malformed record is put right rather than breaking anything', () => {
    const s = createNewGame();
    openUp(s, 'hoya');
    (s.mysteries as Record<string, unknown>).hoya = { played: 'lots' };
    play(s, STAGE_AFTER[1]);
    expect(mysteryStage(s, 'hoya')).toBe(1);
  });
});

describe('the last mysteries: every one is reachable from a fresh game', () => {
  it('Wax Plant: the whole line, by cuttings from big plants, all the way to Star Cluster', () => {
    const s = createNewGame();
    const rand = mulberry32(7);
    recordFound(s, 'hoya', 'carnosa', 0);
    let p = plant(s, 'hoya', 'carnosa', STAGE_AT.large);
    for (const next of ['krimsonQueen', 'compacta', 'starCluster']) {
      const tries = cutUntil(s, p, next, rand);
      expect(tries).toBeGreaterThan(0);
      expect(hasFound(s, 'hoya', next)).toBe(true);
      p = plant(s, 'hoya', next, STAGE_AT.large);
    }
    expect(mysteryOpen(s, 'hoya')).toBe(false);
  });

  it('Wax Plant: a small Hindu Rope never throws Star Cluster; a large one does', () => {
    const s = createNewGame();
    openUp(s, 'hoya');
    const small = plant(s, 'hoya', 'compacta', STAGE_AT.established);
    expect(cutUntil(s, small, 'starCluster', mulberry32(3), 600)).toBe(-1);
    const big = plant(s, 'hoya', 'compacta', STAGE_AT.large);
    expect(cutUntil(s, big, 'starCluster', mulberry32(3))).toBeGreaterThan(0);
  });

  it('Mooncap: an October lantern alone leads through Pale and Harvest to Eclipse, in order', () => {
    setTheme('october', false);
    const s = createNewGame();
    const rand = mulberry32(11);
    const order: string[] = [];
    for (let i = 0; i < 4000 && !hasFound(s, 'mooncap', 'eclipse'); i++) {
      const pick = pickLanternFind(s, 'woodland', rand);
      if (!pick) continue;
      const f = leaveFind(s, 30, 30, 'woodland', pick.defId, pick.variantId, rand);
      s.basket = [];
      collectFoxFind(s, f.id, 0, rand);
      if (pick.defId === 'mooncap' && !order.includes(pick.variantId)) order.push(pick.variantId);
    }
    expect(hasFound(s, 'mooncap', 'eclipse')).toBe(true);
    expect(order).toEqual(['pale', 'harvest', 'eclipse']);
  });

  it('Mooncap: cuttings from a Harvest mooncap throw Eclipse, in either look', () => {
    const s = createNewGame();
    openUp(s, 'mooncap');
    const p = plant(s, 'mooncap', 'harvest', STAGE_AT.young);
    expect(cutUntil(s, p, 'eclipse', mulberry32(5))).toBeGreaterThan(0);
    expect(mysteryOpen(s, 'mooncap')).toBe(false);
  });

  it('Moonflower: the pale thing’s gift is a Pale Visitor, once a night, from a fresh game', () => {
    const s = createNewGame();
    const g = newGhost(mulberry32(1));
    expect(meetGhost(s, g)).toBe('gift');
    // Only once a night.
    expect(meetGhost(s, g)).toBe('tilt');
    const f = leaveFind(s, 72, 41, 'meadow', 'moonflower', 'paleVisitor', Math.random);
    const res = collectFoxFind(s, f.id, s.clock.totalMinutes);
    expect(res.ok).toBe(true);
    expect(hasFound(s, 'moonflower', 'paleVisitor')).toBe(true);
    // The next night it can give again: a missed gift is never lost for good.
    s.clock.totalMinutes += MINUTES_PER_DAY;
    expect(meetGhost(s, g)).toBe('gift');
  });

  it('Moonflower: a large Silver Edge’s cuttings throw Pale Visitor too, in either look', () => {
    const s = createNewGame();
    openUp(s, 'moonflower');
    const p = plant(s, 'moonflower', 'silverEdge', STAGE_AT.large);
    expect(cutUntil(s, p, 'paleVisitor', mulberry32(9))).toBeGreaterThan(0);
  });
});
