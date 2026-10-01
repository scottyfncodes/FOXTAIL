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
    expect(production).toEqual(expect.arrayContaining(['Double Nursery Bed', 'Grow Lights', 'Grow Lamp']));
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

  it('shows the escalating nursery bed price and owned state on one-offs', () => {
    const { state, market, body } = setup();
    state.coins = 10_000;
    market.refresh();
    const bedRow = () => Array.from(body.querySelectorAll('.shop-row')).find((r) => r.querySelector('.entry-name')!.textContent!.startsWith('Double Nursery Bed'))!;
    expect(bedRow().querySelector('button')!.textContent).toBe('113 coins');
    (bedRow().querySelector('button') as HTMLButtonElement).click();
    expect(bedRow().querySelector('button')!.textContent).toBe('253 coins');
    const shelf = Array.from(body.querySelectorAll('.shop-row')).find((r) => r.querySelector('.entry-name')!.textContent === 'Wall Shelf')!;
    (shelf.querySelector('button') as HTMLButtonElement).click();
    const shelfAfter = Array.from(body.querySelectorAll('.shop-row')).find((r) => r.querySelector('.entry-name')!.textContent!.startsWith('Wall Shelf'))!;
    expect(shelfAfter.querySelector('button')!.textContent).toBe('Owned ✓');
    expect((shelfAfter.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
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
