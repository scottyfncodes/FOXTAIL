import type { Game } from '../game/engine/Game';
import { Panel } from './Panel';
import { el } from './dom';
import { PLANTS, specimenName, specimenRarity, rarityRank } from '../game/data/plants';
import { SHOP_ITEMS, PURPOSE_INFO, PURPOSE_ORDER, type ShopCategory, type ShopItem } from '../game/data/shop';
import { STAGE_LABEL, stageFloat, stageOf } from '../game/systems/growth';
import { basketPrices, demandSpecies, buyBlockReason, DEMAND_BONUS, soldToday, canSell, itemPrice, shopItemVisible, isShopItemNew, markShopSeen } from '../game/systems/market';
import { reachable } from '../game/systems/truck';
import { button, note, portrait, rarityBadge } from './common';
import { commissionPay, commissionPortrait, describeCommission, fitBlock, fittingItem, openCommission, COMMISSION_MULT, dayOf } from '../game/systems/commissions';
import { findPotStyle } from '../game/data/shop';
import { ZONES } from '../game/data/zones';

type Tab = 'sell' | 'shop';

/** Nearer misses first: a plant that only needs growing on is closer than the wrong species. */
function rank(block: ReturnType<typeof fitBlock>): number {
  return block === null ? 0 : block === 'stage' ? 1 : block === 'pot' ? 2 : block === 'variant' ? 3 : 4;
}

const CATEGORY_LABEL: Record<ShopCategory, string> = {
  greenhouse: 'Greenhouse',
  pots: 'Pots',
  garden: 'Garden',
  equipment: 'Equipment',
  stall: 'Market Stall',
};

export class MarketPanel {
  panel = new Panel('Plant Stand & Supply', { tabs: true });
  private tab: Tab = 'sell';
  /** Items shown in the Buy tab since it was last left; they stop being NEW once the player moves on. */
  private shown = new Set<string>();

  constructor(private game: Game) {
    this.panel.onClose = () => this.commitSeen();
    for (const [id, label] of [
      ['sell', 'Sell'],
      ['shop', 'Buy'],
    ] as [Tab, string][]) {
      const b = el('button', 'panel-tab', label);
      b.dataset.tab = id;
      b.addEventListener('click', () => {
        if (this.tab === 'shop' && id !== 'shop') this.commitSeen();
        this.tab = id;
        this.render();
      });
      this.panel.tabsEl.appendChild(b);
    }
  }

  open() {
    // Reading the board: the request stops being news.
    const c = this.game.state.commission;
    if (c && !c.seen) {
      c.seen = true;
      this.game.onStateTouched?.();
    }
    this.render();
    this.panel.open();
  }

  refresh() {
    if (this.panel.isOpen) this.render();
  }

  /** Everything the player has now had a look at stops showing NEW. */
  private commitSeen() {
    if (!this.shown.size) return;
    markShopSeen(this.game.state, [...this.shown]);
    this.shown.clear();
    this.game.onStateTouched?.();
  }

  private render() {
    for (const c of Array.from(this.panel.tabsEl.children) as HTMLElement[]) c.classList.toggle('active', c.dataset.tab === this.tab);
    this.panel.clearBody();
    this.panel.setTitle(`Plant Stand & Supply · ${this.game.state.coins} coins`);
    if (this.tab === 'sell') this.renderSell();
    else this.renderShop();
  }

  private renderSell() {
    const state = this.game.state;
    const body = this.panel.body;
    this.renderBoard();
    const want = demandSpecies(state);
    const wanted = el('div', 'wanted');
    wanted.append(portrait(want, PLANTS[want].variants[0].id, 2.5, 3, 48), el('div', undefined, `People are also asking for ${PLANTS[want].name} today: ${Math.round((DEMAND_BONUS - 1) * 100)}% extra on any sale.`));
    body.appendChild(wanted);
    // Beside the stall with the truck, the whole load is for sale.
    const items = reachable(state);
    if (items.length === 0) {
      body.appendChild(el('div', 'empty-state', state.truck?.bed.length ? 'Nothing in your basket to sell. What’s in the truck is only for sale with the truck parked beside the stall.' : 'Nothing in your basket to sell. Bigger plants fetch far more than cuttings.'));
      return;
    }
    if (items.length > state.basket.length) body.appendChild(note(`${items.length - state.basket.length} of these are in the back of the truck.`, 'row-note'));
    const list = el('div', 'entry-list');
    const prices = basketPrices(state, items);
    const seen: Record<string, number> = {};
    items.forEach((item, i) => {
      const before = seen[item.defId] ?? 0;
      seen[item.defId] = before + 1;
      const row = el('div', 'entry-row plant-row');
      const info = el('div', 'entry-info');
      const rarity = specimenRarity(item.defId, item.variantId);
      info.append(el('div', 'entry-name', specimenName(item.defId, item.variantId)), el('div', 'entry-sub', item.growth === 0 ? 'Cutting' : STAGE_LABEL[stageOf(item.growth)]), rarityBadge(rarity));
      // Selling something irreplaceable should feel like a choice, not a click.
      const others =
        items.filter((b) => b !== item && b.defId === item.defId && b.variantId === item.variantId).length +
        Object.values(state.plants).filter((p) => p.defId === item.defId && p.variantId === item.variantId).length;
      if (rarityRank(rarity) >= 2 && others === 0) info.appendChild(note('Your only one. Propagate it first, and you could keep one and sell one.', 'row-note warn'));
      const glut = soldToday(state, item.defId);
      if (glut > 0) info.appendChild(note(`${glut} already sold today — buyers are paying less for more of the same. Prices recover tomorrow.`, 'row-note'));
      else if (before > 0) info.appendChild(note(`Priced as the ${before === 1 ? 'second' : before === 2 ? 'third' : `${before + 1}th`} ${PLANTS[item.defId].name} sold today — each one fetches a little less.`, 'row-note'));
      if (!canSell(item.defId)) {
        info.appendChild(note('The stall won’t take this one.', 'row-note'));
        row.append(portrait(item.defId, item.variantId, Math.max(0.6, stageFloat(item.growth)), item.seed, 56), info, button('Not for sale', () => {}, 'secondary-btn', true));
        list.appendChild(row);
        return;
      }
      const price = prices[i];
      const sell = button(`Sell · ${price}`, () => {
        this.game.sell(item.uid);
        this.render();
      }, 'primary-btn small');
      row.append(portrait(item.defId, item.variantId, Math.max(0.6, stageFloat(item.growth)), item.seed, 56), info, sell);
      list.appendChild(row);
    });
    body.appendChild(list);
  }

  /** The board: the request pinned up, or the note the last buyer left, and the notes the stall keeps. */
  private renderBoard() {
    const state = this.game.state;
    const body = this.panel.body;
    const c = state.commission;
    if (!c) return;
    const board = el('div', 'board');
    const head = el('div', 'board-head');
    const pic = commissionPortrait(c);
    if (pic) head.appendChild(portrait(pic.defId, pic.variantId, 3, 5, 56));
    const text = el('div', 'entry-info');
    const open = openCommission(state);
    if (open) {
      text.append(el('div', 'entry-name', 'Pinned on the board'), el('div', undefined, `Someone wants ${describeCommission(c)}. They’ll pay ${COMMISSION_MULT}× the usual.`));
      const daysLeft = Math.max(0, Math.ceil((c.expiresAt - state.clock.totalMinutes) / 1440));
      text.appendChild(el('div', 'entry-sub dim', daysLeft <= 1 ? 'Coming down tomorrow.' : `Up for another ${daysLeft} days.`));
      head.appendChild(text);
      board.appendChild(head);
      const fit = fittingItem(state, c);
      if (fit) {
        const pay = commissionPay(state, fit);
        const row = el('div', 'action-row');
        row.appendChild(button(`Hand over the ${specimenName(fit.defId, fit.variantId)} · ${pay}`, () => {
          this.game.fillCommission(fit.uid);
          this.render();
        }, 'primary-btn'));
        board.appendChild(row);
      } else if (state.basket.length) {
        // The nearest miss, in a few words.
        const closest = [...state.basket].sort((a, b) => rank(fitBlock(c, a)) - rank(fitBlock(c, b)))[0];
        const why = fitBlock(c, closest);
        const line =
          why === 'stage'
            ? `Your ${specimenName(closest.defId, closest.variantId)} isn’t big enough yet: grow it on to ${STAGE_LABEL[c.minStage].toLowerCase()}.`
            : why === 'pot'
              ? `It wants to be in a ${findPotStyle(c.potId!).name.toLowerCase()} pot: put it on display in one, then lift it.`
              : why === 'variant'
                ? `They’re after the ‘${PLANTS[c.defId!].variants.find((v) => v.id === c.variantId)?.name}’ form in particular.`
                : why === 'zone'
                  ? `Something that grows wild in ${ZONES[c.zone!].name.replace(/^The /, 'the ')}.`
                  : 'Nothing in your basket is what they’re after.';
        board.appendChild(note(line, 'row-note'));
      }
    } else {
      text.append(el('div', 'entry-name', `Filled: the ${c.filledWith ?? 'plant'}`), el('div', 'board-note', `“${c.note}”`), el('div', 'entry-sub dim', dayOf(state.clock.totalMinutes) > dayOf(c.filledAt!) ? 'A new request will be up soon.' : 'Another request will go up tomorrow.'));
      head.appendChild(text);
      board.appendChild(head);
    }
    const past = state.commissions.notes.filter((n) => n.text !== c.note || open);
    if (past.length) {
      const list = el('div', 'board-past');
      list.appendChild(el('div', 'entry-sub dim', 'Notes the stall has kept:'));
      for (const n of past.slice(0, 4)) list.appendChild(el('div', 'board-past-note', `“${n.text}” — the ${n.what}`));
      board.appendChild(list);
    }
    body.appendChild(board);
  }

  private renderShop() {
    const state = this.game.state;
    const body = this.panel.body;
    const cats: ShopCategory[] = ['greenhouse', 'pots', 'garden', 'equipment', 'stall'];
    for (const cat of cats) {
      const items = SHOP_ITEMS.filter((s) => s.category === cat && shopItemVisible(state, s.id));
      if (!items.length) continue;
      body.appendChild(el('h4', 'section-head', CATEGORY_LABEL[cat]));
      if (cat !== 'greenhouse') {
        body.appendChild(this.itemList(items));
        continue;
      }
      // The greenhouse sells two very different things: capacity to grow
      // more, and places to show plants off. Group them so neither hides the other.
      for (const purpose of PURPOSE_ORDER) {
        const group = items.filter((s) => s.purpose === purpose);
        if (!group.length) continue;
        const info = PURPOSE_INFO[purpose];
        const sub = el('div', `shop-subhead purpose-${purpose}`);
        sub.append(el('span', 'purpose-icon', info.icon), document.createTextNode(info.label));
        body.appendChild(sub);
        body.appendChild(this.itemList(group));
      }
    }
  }

  private itemList(items: ShopItem[]): HTMLElement {
    const state = this.game.state;
    const list = el('div', 'entry-list');
    for (const item of items) {
      const row = el('div', `entry-row shop-row${item.purpose ? ` purpose-${item.purpose}` : ''}`);
      const info = el('div', 'entry-info');
      const stock = item.repeatable
        ? (state.decorStock[item.id as keyof typeof state.decorStock] ?? 0) + (state.furnitureStock[item.id as keyof typeof state.furnitureStock] ?? 0)
        : 0;
      const extra = stock ? ` (${stock} unplaced)` : '';
      const name = el('div', 'entry-name', item.name + extra);
      if (isShopItemNew(state, item.id)) name.appendChild(el('span', 'new-tag', 'NEW'));
      this.shown.add(item.id);
      info.appendChild(name);
      if (item.purpose || item.blurb) {
        const line = el('div', 'shop-blurb');
        if (item.purpose) {
          const p = PURPOSE_INFO[item.purpose];
          const badge = el('span', 'purpose-badge', p.icon);
          badge.title = p.label;
          badge.setAttribute('aria-label', p.label);
          line.appendChild(badge);
        }
        if (item.blurb) line.appendChild(document.createTextNode(item.blurb));
        info.appendChild(line);
      }
      info.appendChild(el('div', 'entry-sub', item.description));
      const block = buyBlockReason(state, item.id);
      const label = block === 'owned' ? 'Owned ✓' : `${itemPrice(state, item.id)} coins`;
      row.append(info, button(label, () => {
        this.game.buy(item.id);
        this.render();
      }, block === 'owned' ? 'secondary-btn' : 'primary-btn small', !!block));
      list.appendChild(row);
    }
    return list;
  }
}
