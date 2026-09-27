import type { Game } from '../game/engine/Game';
import { Panel } from './Panel';
import { el } from './dom';
import { PLANTS, specimenName, specimenRarity } from '../game/data/plants';
import { SHOP_ITEMS, DECOR_IDS, FURNITURE_IDS, findPotStyle } from '../game/data/shop';
import { basketCapacity } from '../game/systems/basket';
import { TRUCK_BED_CAP, truckNear } from '../game/systems/truck';
import { ESTABLISH_THRESHOLD } from '../game/systems/collection';
import { placementBlockReason } from '../game/systems/propagation';
import { STAGE_LABEL, stageFloat, stageOf } from '../game/systems/growth';
import { button, note, portrait, rarityBadge } from './common';
import { FURNITURE_DEFS } from '../game/data/furniture';

export class BasketPanel {
  panel = new Panel('Basket');

  constructor(private game: Game) {}

  open() {
    this.render();
    this.panel.open();
  }

  refresh() {
    if (this.panel.isOpen) this.render();
  }

  private render() {
    const state = this.game.state;
    this.panel.clearBody();
    this.panel.setTitle(`Basket (${state.basket.length}/${basketCapacity(state)})`);
    const outdoors = !state.player.inGreenhouse;

    if (state.basket.length === 0) {
      this.panel.body.appendChild(el('div', 'empty-state', 'Empty. Go and see what’s growing out there.'));
    } else {
      const list = el('div', 'entry-list');
      for (const item of state.basket) {
        const row = el('div', 'entry-row plant-row');
        const info = el('div', 'entry-info');
        const stage = stageOf(item.growth);
        info.append(
          el('div', 'entry-name', specimenName(item.defId, item.variantId)),
          el('div', 'entry-sub', stage === 'cutting' ? 'Fresh cutting' : `${STAGE_LABEL[stage]} plant, potted${item.potId && item.potId !== 'terracotta' ? ` (${findPotStyle(item.potId).name.toLowerCase()})` : ''}`)
        );
        info.appendChild(rarityBadge(specimenRarity(item.defId, item.variantId)));
        const block = placementBlockReason(state, item);
        const actions = el('div', 'row-actions');
        if (block === 'not-rooted') {
          info.appendChild(note('Pot it in a nursery bed so it can root.', 'row-note'));
        } else if (block === 'not-established') {
          const grown = state.collection[item.defId]?.grown ?? 0;
          info.appendChild(note(`Grow ${ESTABLISH_THRESHOLD} ${PLANTS[item.defId].name} to establish it (${grown}/${ESTABLISH_THRESHOLD}) — then it can go on display or out in the wild.`, 'row-note'));
        } else if (outdoors) {
          actions.appendChild(
            button('Plant…', () => {
              this.panel.close();
              this.game.beginPlanting(item.uid);
            }, 'primary-btn small')
          );
        } else {
          info.appendChild(note('Ready: give it a display spot, or plant it out in the wild.', 'row-note'));
        }
        row.append(portrait(item.defId, item.variantId, Math.max(0.6, stageFloat(item.growth)), item.seed, 56), info, actions);
        list.appendChild(row);
      }
      this.panel.body.appendChild(list);
    }

    // The back of the truck: a second basket, within reach when you're beside it.
    const truck = state.truck;
    if (truck) {
      const near = truckNear(state);
      this.panel.body.appendChild(el('h4', 'section-head', `In the truck (${truck.bed.length}/${TRUCK_BED_CAP})`));
      if (!near) {
        this.panel.body.appendChild(note(truck.bed.length ? 'Parked out of reach. Walk back to the truck to get at what’s in the back.' : 'Parked out of reach. Drive it, and anything you gather rides in the back once your basket is full.', 'row-note'));
      } else {
        const row = el('div', 'action-row');
        if (state.basket.length) {
          row.appendChild(button(truck.bed.length >= TRUCK_BED_CAP ? 'Truck is full' : 'Load the truck', () => {
            this.game.loadTruck();
            this.render();
          }, 'secondary-btn', truck.bed.length >= TRUCK_BED_CAP));
        }
        if (truck.bed.length) {
          row.appendChild(button(state.basket.length >= basketCapacity(state) ? 'Basket is full' : 'Unload into basket', () => {
            this.game.unloadTruck();
            this.render();
          }, 'secondary-btn', state.basket.length >= basketCapacity(state)));
        }
        if (row.childElementCount) this.panel.body.appendChild(row);
      }
      if (truck.bed.length) {
        const list = el('div', 'entry-list');
        for (const item of truck.bed) {
          const row = el('div', 'entry-row plant-row');
          const info = el('div', 'entry-info');
          const stage = stageOf(item.growth);
          info.append(el('div', 'entry-name', specimenName(item.defId, item.variantId)), el('div', 'entry-sub', stage === 'cutting' ? 'Fresh cutting' : `${STAGE_LABEL[stage]} plant`));
          info.appendChild(rarityBadge(specimenRarity(item.defId, item.variantId)));
          const actions = el('div', 'row-actions');
          if (near) {
            actions.appendChild(button('Take out', () => {
              this.game.takeOutOfTruck(item.uid);
              this.render();
            }, 'secondary-btn small', state.basket.length >= basketCapacity(state)));
          }
          row.append(portrait(item.defId, item.variantId, Math.max(0.6, stageFloat(item.growth)), item.seed, 56), info, actions);
          list.appendChild(row);
        }
        this.panel.body.appendChild(list);
      }
    }

    // Garden decor bought at the market, waiting to be placed.
    const stocked = DECOR_IDS.filter((id) => (state.decorStock[id] ?? 0) > 0);
    const nearby = this.game.nearbyDecor();
    if (stocked.length || nearby) {
      this.panel.body.appendChild(el('h4', 'section-head', 'Garden Decor'));
      const list = el('div', 'entry-list');
      for (const id of stocked) {
        const item = SHOP_ITEMS.find((s) => s.id === id)!;
        const row = el('div', 'entry-row');
        const info = el('div', 'entry-info');
        info.append(el('div', 'entry-name', `${item.name} ×${state.decorStock[id]}`), el('div', 'entry-sub', outdoors ? 'Drag it exactly where you want it. Move it again any time.' : 'Step outside to place it.'));
        row.append(info, button('Place…', () => {
          this.panel.close();
          this.game.beginYard(id);
        }, 'secondary-btn', !outdoors));
        list.appendChild(row);
      }
      if (nearby) {
        const name = SHOP_ITEMS.find((s) => s.id === nearby.decorId)?.name ?? 'decor';
        const row = el('div', 'entry-row');
        const info = el('div', 'entry-info');
        info.append(el('div', 'entry-name', `Nearby: ${name}`), el('div', 'entry-sub', 'Pick it up to move it somewhere else.'));
        row.append(info, button('Pick up', () => {
          this.game.pickUpNearbyDecor();
          this.render();
        }, 'secondary-btn'));
        list.appendChild(row);
      }
      this.panel.body.appendChild(list);
    }

    // Greenhouse furniture waiting to be set down indoors.
    const furniture = FURNITURE_IDS.filter((id) => (state.furnitureStock[id] ?? 0) > 0);
    if (furniture.length) {
      this.panel.body.appendChild(el('h4', 'section-head', 'For the House'));
      const list = el('div', 'entry-list');
      for (const id of furniture) {
        const item = SHOP_ITEMS.find((s) => s.id === id)!;
        const name = item?.name ?? FURNITURE_DEFS[id].name;
        const sub = outdoors ? 'Take it indoors to set it down.' : 'Drag it exactly where you want it. Move it again any time.';
        const row = el('div', 'entry-row');
        const info = el('div', 'entry-info');
        info.append(el('div', 'entry-name', `${name} ×${state.furnitureStock[id]}`), el('div', 'entry-sub', sub));
        row.append(info, button('Place…', () => {
          this.panel.close();
          this.game.beginArrange(id);
        }, 'secondary-btn', outdoors));
        list.appendChild(row);
      }
      this.panel.body.appendChild(list);
    }

    if (state.tools.lantern) {
      this.panel.body.appendChild(note('You carry an old lantern: some plants only show themselves in its light, after dark.'));
    }
  }
}
