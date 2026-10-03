import { describe, it, expect, beforeEach } from 'vitest';
import { createNewGame } from '../src/game/state';
import { buyItem } from '../src/game/systems/market';
import { MarketPanel } from '../src/ui/MarketPanel';
import type { Game } from '../src/game/engine/Game';

function setup() {
  const state = createNewGame();
  const game = { state, buy: (id: string) => buyItem(state, id), onStateTouched: null } as unknown as Game;
  const market = new MarketPanel(game);
  const shopTab = Array.from(market.panel.tabsEl.children).find((b) => (b as HTMLElement).dataset.tab === 'shop') as HTMLElement;
  shopTab.click();
  market.panel.open();
  return { state, market, body: market.panel.body };
}

describe('market Buy tab', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('groups greenhouse items by purpose, production first, with an icon badge on every greenhouse row', () => {
    const { body } = setup();
    const subheads = Array.from(body.querySelectorAll('.shop-subhead')).map((h) => h.textContent);
    expect(subheads).toEqual(['🌱Production', '🏡Space', '🪴Display']);
    const production = Array.from(body.querySelectorAll('.shop-row.purpose-production .entry-name')).map((n) => n.textContent);
    expect(production).toEqual(expect.arrayContaining(['Double Nursery Bed', 'Grow Lights']));
    // The grow lamp waits until the grow lights are in.
    expect(production).not.toContain('Grow Lamp');
    expect(production).not.toContain('Nursery Bed');
    expect(production).not.toContain('Extra Nursery Beds');
    for (const row of Array.from(body.querySelectorAll('.shop-row[class*="purpose-"]'))) {
      const badge = row.querySelector('.purpose-badge')!;
      // Not colour alone: every badge has an icon and an accessible label.
      expect(badge.textContent).toBeTruthy();
      expect(badge.getAttribute('aria-label')).toBeTruthy();
    }
    // The other four categories are still there, ungrouped.
    const heads = Array.from(body.querySelectorAll('.section-head')).map((h) => h.textContent);
    expect(heads).toEqual(['Greenhouse', 'Pots', 'Garden', 'Equipment', 'Market Stall']);
  });

  it('shows the escalating nursery bed price, and folds a one-off away once it’s yours', () => {
    const { state, market, body } = setup();
    state.coins = 10_000;
    market.refresh();
    const row = (name: string) => Array.from(body.querySelectorAll('.shop-row')).find((r) => r.querySelector('.entry-name')!.textContent!.startsWith(name));
    expect(row('Double Nursery Bed')!.querySelector('button')!.textContent).toBe('113 coins');
    (row('Double Nursery Bed')!.querySelector('button') as HTMLButtonElement).click();
    expect(row('Double Nursery Bed')!.querySelector('button')!.textContent).toBe('253 coins');
    // The wall shelf only comes in once the hook rail is bought…
    expect(row('Wall Shelf')).toBeUndefined();
    (row('Hanging Hook Rail')!.querySelector('button') as HTMLButtonElement).click();
    // …and the rail, once bought, folds into a single line rather than a row.
    expect(row('Hanging Hook Rail')).toBeUndefined();
    expect(Array.from(body.querySelectorAll('.shop-owned')).some((n) => n.textContent!.includes('Hanging Hook Rail'))).toBe(true);
    expect(row('Wall Shelf')!.querySelector('.new-tag')).toBeTruthy();
    market.panel.close();
  });

  it('opens each line one step at a time: the pots come in one after another', () => {
    const { state, market, body } = setup();
    state.coins = 10_000;
    market.refresh();
    const potRows = () => Array.from(body.querySelectorAll('.shop-row')).map((r) => r.querySelector('.entry-name')!.textContent!).filter((n) => /Pots|Stoneware|Baskets|Copper|Porcelain|Urns|Stars/.test(n));
    expect(potRows()).toEqual([expect.stringContaining('Teal Glazed Pots')]);
    const buy = (name: string) => (Array.from(body.querySelectorAll('.shop-row')).find((r) => r.querySelector('.entry-name')!.textContent!.startsWith(name))!.querySelector('button') as HTMLButtonElement).click();
    buy('Teal Glazed Pots');
    expect(potRows()).toEqual([expect.stringContaining('Speckled Stoneware')]);
    buy('Speckled Stoneware');
    expect(potRows()).toEqual([expect.stringContaining('Woven Baskets')]);
    // What's still to come is counted, not listed.
    expect(Array.from(body.querySelectorAll('.shop-later')).some((n) => /4 more things come in/.test(n.textContent!))).toBe(true);
    market.panel.close();
  });

  it('tags unseen items NEW until the player has looked and moved on', () => {
    const { state, market, body } = setup();
    state.coins = 1000;
    buyItem(state, 'stallAwning');
    market.refresh();
    expect(body.querySelectorAll('.new-tag').length).toBe(1);
    market.refresh();
    expect(body.querySelectorAll('.new-tag').length).toBe(1);
    market.panel.close();
    expect(state.seenShop).toContain('stallCrates');
    market.open();
    expect(body.querySelectorAll('.new-tag').length).toBe(0);
  });

  it('keeps each row a single flex line of text then price, so it stacks cleanly on a phone', () => {
    const { body } = setup();
    for (const row of Array.from(body.querySelectorAll('.shop-row'))) {
      expect(row.children.length).toBe(2);
      expect(row.children[0].classList.contains('entry-info')).toBe(true);
      expect(row.children[1].tagName).toBe('BUTTON');
    }
  });
});
