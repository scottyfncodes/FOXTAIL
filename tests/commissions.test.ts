import { describe, it, expect } from 'vitest';
import { createNewGame } from '../src/game/state';
import { addToBasket } from '../src/game/systems/basket';
import { MINUTES_PER_DAY } from '../src/game/engine/Clock';
import { priceOf, demandSpecies } from '../src/game/systems/market';
import { migrateSave } from '../src/game/engine/SaveManager';
import { liftPlant } from '../src/game/systems/propagation';
import { PLANTS } from '../src/game/data/plants';
import {
  postCommission,
  tickCommissions,
  fillCommission,
  itemFits,
  fitBlock,
  fittingItem,
  commissionPay,
  describeCommission,
  openCommission,
  COMMISSION_MULT,
  COMMISSION_DAYS,
  BUYER_NOTES,
} from '../src/game/systems/commissions';

const item = (defId: string, growth: number, extra: Record<string, unknown> = {}) => ({ uid: `u-${defId}-${growth}`, defId, variantId: PLANTS[defId].variants[0].id, seed: 1, growth, generation: 0, origin: 'wild' as const, collectedAt: 0, ...extra });

describe('the board by the stall', () => {
  it('starts a new player off with something within reach: an established common', () => {
    const state = createNewGame();
    const c = postCommission(state, 0, () => 0.5);
    expect(c.minStage).toBe('established');
    expect(PLANTS[c.defId!].rarity).toBe('common');
    expect(c.zone).toBeUndefined();
    expect(c.potId).toBeUndefined();
    expect(describeCommission(c)).toMatch(/^an established .* or bigger$/);
  });

  it('only asks for what the player knows, once they know something', () => {
    const state = createNewGame();
    state.collection.monstera = { foundAt: 0, variants: ['standard'], grown: 1, propagated: 0, sold: 0, earned: 0, plantedOut: 0, displayed: 0 };
    state.commissions.filled = 1;
    for (let i = 0; i < 10; i++) expect(postCommission(state, 0, () => (i * 37) % 100 / 100).defId).toBe('monstera');
  });

  it('asks for a pot only when the player owns one', () => {
    const state = createNewGame();
    state.commissions.filled = 1;
    expect(postCommission(state, 0, () => 0.1).potId).toBeUndefined();
    state.owned.push('potCopper');
    const c = postCommission(state, 0, () => 0.1);
    expect(c.potId).toBe('copper');
    expect(describeCommission(c)).toMatch(/in a copper pot$/);
  });

  it('knows what fits, and says why something nearly does', () => {
    const state = createNewGame();
    const c = { id: 'r', defId: 'pothos', minStage: 'large' as const, postedAt: 0, expiresAt: 9999, seen: false };
    expect(itemFits(c, item('pothos', 1500))).toBe(true);
    expect(itemFits(c, item('pothos', 3600))).toBe(true);
    expect(fitBlock(c, item('pothos', 600))).toBe('stage');
    expect(fitBlock(c, item('spiderPlant', 1500))).toBe('species');
    expect(fitBlock({ ...c, potId: 'copper' }, item('pothos', 1500))).toBe('pot');
    expect(itemFits({ ...c, potId: 'copper' }, item('pothos', 1500, { potId: 'copper' }))).toBe(true);
    expect(fitBlock({ ...c, variantId: 'neon' }, item('pothos', 1500))).toBe('variant');
    const zoneReq = { ...c, defId: undefined, zone: 'rockyClearing' as const };
    expect(itemFits(zoneReq, item('snakePlant', 1500))).toBe(true);
    expect(fitBlock(zoneReq, item('pothos', 1500))).toBe('zone');
    void state;
  });

  it('pays three times the plant’s own worth and leaves a note the stall keeps', () => {
    const state = createNewGame();
    state.commission = { id: 'r1', defId: 'pothos', minStage: 'large', postedAt: 0, expiresAt: 9999, seen: true };
    // Not on a day the market is after pothos anyway: that would price the plant itself above the request.
    while (demandSpecies(state) === 'pothos') state.clock.totalMinutes += MINUTES_PER_DAY;
    const big = addToBasket(state, item('pothos', 1500))!;
    addToBasket(state, item('pothos', 3600));
    expect(fittingItem(state, state.commission)!.uid).toBe(big.uid);
    const worth = priceOf(state, big);
    const res = fillCommission(state, big.uid, 500)!;
    expect(res.pay).toBe(commissionPay(state, big));
    expect(res.pay).toBeGreaterThanOrEqual(worth * COMMISSION_MULT - 1);
    expect(BUYER_NOTES).toContain(res.note);
    expect(state.coins).toBe(20 + res.pay);
    expect(state.basket.length).toBe(1);
    expect(openCommission(state)).toBeNull();
    expect(state.commissions.filled).toBe(1);
    expect(state.commissions.notes[0].text).toBe(res.note);
    expect(state.collection.pothos.earned).toBe(res.pay);
    // Can't be filled twice.
    expect(fillCommission(state, state.basket[0].uid, 600)).toBeNull();
  });

  it('pins a new request the day after one is filled, or after two days unanswered', () => {
    const state = createNewGame();
    expect(tickCommissions(state, 0, () => 0.5)).not.toBeNull();
    const first = state.commission!;
    expect(tickCommissions(state, 100, () => 0.5)).toBeNull();
    expect(tickCommissions(state, COMMISSION_DAYS * MINUTES_PER_DAY, () => 0.5)).not.toBeNull();
    expect(state.commission!.id).not.toBe(first.id);
    const now = COMMISSION_DAYS * MINUTES_PER_DAY + 10;
    const it2 = addToBasket(state, item(state.commission!.defId!, 3600))!;
    expect(fillCommission(state, it2.uid, now)).not.toBeNull();
    expect(tickCommissions(state, now + 60, () => 0.5)).toBeNull();
    expect(tickCommissions(state, now + MINUTES_PER_DAY, () => 0.5)).not.toBeNull();
    expect(openCommission(state)).not.toBeNull();
  });

  it('a lifted display plant remembers its pot', () => {
    const state = createNewGame();
    state.plants.p = { id: 'p', defId: 'pothos', variantId: 'golden', seed: 1, growth: 1600, location: { kind: 'display', slotId: 'stand1', potId: 'copper' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false };
    expect(liftPlant(state, 'p', 0)!.potId).toBe('copper');
  });

  it('older saves get an empty board', () => {
    const raw = JSON.parse(JSON.stringify(createNewGame())) as Record<string, unknown>;
    raw.version = 7;
    delete raw.commission;
    delete raw.commissions;
    const state = migrateSave(raw)!;
    expect(state.commission).toBeNull();
    expect(state.commissions).toEqual({ filled: 0, notes: [] });
  });
});
