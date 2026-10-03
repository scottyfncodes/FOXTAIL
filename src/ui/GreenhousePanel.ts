import type { Game } from '../game/engine/Game';
import type { OwnedPlant } from '../game/state';
import { Panel } from './Panel';
import { el } from './dom';
import { PLANTS, specimenName, specimenRarity, findVariant, latinLine } from '../game/data/plants';
import { POT_STYLES } from '../game/data/shop';
import { displaySlots, findFurniture } from '../game/systems/furniture';
import { gardenPlanter } from '../game/systems/decor';
import { ESTABLISH_THRESHOLD, isEstablished } from '../game/systems/collection';
import { STAGES, STAGE_LABEL, stageFloat, stageIndexOf, minutesToNextStage } from '../game/systems/growth';
import { cuttingBlockReason, occupantOf, placementBlockReason, cuttingCooldown, cuttingOdds } from '../game/systems/propagation';
import { reachable } from '../game/systems/truck';
import { button, note, portrait, rarityBadge, realTime, crossButton } from './common';

type Target = { kind: 'bed' | 'display'; id: string };

const SLOT_NAMES: Record<string, string> = {
  stand: 'Plant Stand',
  hanging: 'Hanging Hook',
  shelf: 'Wall Shelf',
  tiered: 'Tiered Stand',
  sunroom: 'Sun Room',
  pedestal: 'Iron Pedestal',
  trellis: 'Wall Trellis',
  planter: 'Floor Planter',
  table: 'Potting Table',
};

/** The nursery beds and the display gallery: where plants are raised, propagated and shown off. */
export class GreenhousePanel {
  panel = new Panel('Greenhouse');
  private target: Target | null = null;
  private potChoice = 'terracotta';

  constructor(private game: Game) {}

  open(target: Target) {
    this.target = target;
    this.render();
    this.panel.open();
  }

  refresh() {
    if (this.panel.isOpen && this.target) this.render();
  }

  private render() {
    if (!this.target) return;
    const t = this.target;
    this.panel.clearBody();
    const plant = t.kind === 'bed' ? occupantOf(this.game.state, { bedId: t.id }) : occupantOf(this.game.state, { slotId: t.id });
    if (t.kind === 'bed') {
      this.panel.setTitle('Nursery Bed');
      if (plant) this.renderPlant(plant);
      else this.renderPotting(t.id);
    } else {
      // Out in the garden, a garden trellis is a planter just like the one indoors.
      const garden = gardenPlanter(this.game.state, t.id);
      const slot = garden ? { kind: 'trellis' } : displaySlots(this.game.state).find((s) => s.id === t.id);
      this.panel.setTitle(garden ? 'Garden Trellis' : (SLOT_NAMES[slot?.kind ?? 'stand'] ?? 'Display'));
      if (slot?.kind === 'trellis' && !plant) this.panel.body.appendChild(note('Any vine or trailer potted here climbs the trellis.'));
      if (plant) this.renderPlant(plant);
      else this.renderDisplayChoice(t.id);
    }
    // Moving the piece (plant and all) lives in arrange mode, the 🪑 button.
  }

  private renderPotting(bedId: string) {
    const state = this.game.state;
    const body = this.panel.body;
    body.appendChild(note('Nursery beds are where cuttings root and young plants grow up. Pot anything from your basket here.'));
    const items = reachable(state);
    if (items.length === 0) {
      body.appendChild(el('div', 'empty-state', state.truck?.bed.length ? 'Your basket is empty. Park the truck by the greenhouse door and what’s in the back is within reach here.' : 'Your basket is empty. Take cuttings in the wild, or from plants you’ve already grown.'));
      return;
    }
    if (items.length > state.basket.length) body.appendChild(note(`${items.length - state.basket.length} of these are in the truck, parked by the door.`, 'row-note'));
    const list = el('div', 'entry-list');
    for (const item of items) {
      const row = el('div', 'entry-row plant-row');
      const info = el('div', 'entry-info');
      info.append(el('div', 'entry-name', specimenName(item.defId, item.variantId)), el('div', 'entry-sub', item.growth === 0 ? 'Fresh cutting' : `${STAGE_LABEL[STAGES[stageIndexOf(item.growth)]]} plant`));
      info.appendChild(rarityBadge(specimenRarity(item.defId, item.variantId)));
      row.append(portrait(item.defId, item.variantId, Math.max(0.6, stageFloat(item.growth)), item.seed, 56), info, button('Pot here', () => {
        this.game.potInBed(item.uid, bedId);
        this.render();
      }, 'primary-btn small'));
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  private ownedPots() {
    return POT_STYLES.filter((p) => !p.requires || this.game.state.owned.includes(p.requires));
  }

  private potPicker(current: string, onPick: (id: string) => void): HTMLElement {
    const row = el('div', 'condition-row');
    for (const pot of this.ownedPots()) {
      const b = el('button', `pill-btn pot-pill${pot.id === current ? ' active' : ''}`);
      const sw = el('span', 'pot-swatch');
      sw.style.background = `linear-gradient(90deg, ${pot.shade}, ${pot.body} 40%, ${pot.shade})`;
      sw.style.borderTop = `3px solid ${pot.rim}`;
      b.append(sw, document.createTextNode(pot.name));
      b.addEventListener('click', () => onPick(pot.id));
      row.appendChild(b);
    }
    return row;
  }

  private renderDisplayChoice(slotId: string) {
    const state = this.game.state;
    const body = this.panel.body;
    body.appendChild(note('Your collection. Plants on display stay here for good and keep growing — the rarer, the better they look.'));
    const eligible = reachable(state).filter((i) => !placementBlockReason(state, i));
    if (eligible.length === 0) {
      const waiting = reachable(state).find((i) => placementBlockReason(state, i) === 'not-established');
      body.appendChild(
        el(
          'div',
          'empty-state',
          waiting
            ? `Establish a species first: grow ${ESTABLISH_THRESHOLD} ${PLANTS[waiting.defId].name} plants in the nursery. Then lift one and bring it here.`
            : 'Nothing ready to display. Lift an established plant from the nursery into your basket, then bring it here.'
        )
      );
      return;
    }
    body.appendChild(el('h4', 'section-head', 'Pot'));
    const pots = this.potPicker(this.potChoice, (id) => {
      this.potChoice = id;
      this.render();
    });
    body.appendChild(pots);
    if (this.ownedPots().length === 1) body.appendChild(note('More pot styles are sold at the Plant Stand & Supply.', 'row-note'));
    body.appendChild(el('h4', 'section-head', 'Choose a plant'));
    const list = el('div', 'entry-list');
    for (const item of eligible) {
      const row = el('div', 'entry-row plant-row');
      const info = el('div', 'entry-info');
      info.append(el('div', 'entry-name', specimenName(item.defId, item.variantId)), el('div', 'entry-sub', `${STAGE_LABEL[STAGES[stageIndexOf(item.growth)]]}`));
      info.appendChild(rarityBadge(specimenRarity(item.defId, item.variantId)));
      row.append(portrait(item.defId, item.variantId, stageFloat(item.growth), item.seed, 56), info, button('Display', () => {
        this.game.display(item.uid, slotId, this.potChoice);
        this.render();
      }, 'primary-btn small'));
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  private renderPlant(plant: OwnedPlant) {
    const state = this.game.state;
    const body = this.panel.body;
    const def = PLANTS[plant.defId];
    const variant = findVariant(plant.defId, plant.variantId);
    const now = state.clock.totalMinutes;

    const head = el('div', 'plant-head');
    const info = el('div', 'entry-info');
    info.append(el('h3', undefined, specimenName(plant.defId, plant.variantId)));
    if (latinLine(plant.defId)) info.appendChild(el('div', 'latin', latinLine(plant.defId)));
    info.appendChild(rarityBadge(specimenRarity(plant.defId, plant.variantId)));
    if (variant) info.appendChild(note(variant.description, 'row-note'));
    head.append(portrait(plant.defId, plant.variantId, stageFloat(plant.growth), plant.seed, 110), info);
    body.appendChild(head);

    // Growth track: five stages, filling as it grows.
    const idx = stageIndexOf(plant.growth);
    const track = el('div', 'growth-stage-track labelled');
    STAGES.forEach((st, i) => {
      const dot = el('div', `growth-stage-dot${i <= idx ? ' filled' : ''}`);
      dot.title = STAGE_LABEL[st];
      track.appendChild(dot);
    });
    body.appendChild(track);
    const next = minutesToNextStage(state, plant);
    body.appendChild(
      note(
        next !== null
          ? `${STAGE_LABEL[STAGES[idx]]}. ${STAGE_LABEL[STAGES[idx + 1]]} in ${realTime(next)}.`
          : `${STAGE_LABEL[STAGES[idx]]} — fully grown, and still filling out.`,
        'growth-note'
      )
    );

    const est = isEstablished(state, plant.defId);
    const grown = state.collection[plant.defId]?.grown ?? 0;
    if (!est) body.appendChild(note(`${def.name}: ${grown} of ${ESTABLISH_THRESHOLD} grown. Establish it by raising ${ESTABLISH_THRESHOLD} to “Established” — take a cutting from this one to get the second.`));

    if (plant.location.kind === 'display') {
      body.appendChild(el('h4', 'section-head', 'Pot'));
      body.appendChild(this.potPicker(plant.location.potId, (id) => {
        this.game.changePot(plant.id, id);
        this.render();
      }));
    }

    const actions = el('div', 'action-row');
    const block = cuttingBlockReason(state, plant, now);
    const cutLabel =
      block === 'not-rooted'
        ? 'Too young for cuttings'
        : block === 'recovering'
          ? `Recovering (${realTime(cuttingCooldown(state) - (now - (plant.lastCuttingAt ?? 0)))})`
          : block === 'basket-full'
            ? 'Basket full'
            : 'Take a cutting';
    actions.appendChild(button(cutLabel, () => {
      this.game.cutFrom(plant.id);
      this.render();
    }, 'primary-btn', !!block));
    const crossBtn = crossButton(this.game, plant, () => this.render());
    if (crossBtn) actions.appendChild(crossBtn);
    const odds = block === 'not-rooted' ? null : cuttingOdds(state, plant);
    if (odds) body.appendChild(note(odds, 'row-note'));
    const liftLabel = plant.location.kind === 'nursery' && est && idx >= 1 ? 'Lift — to display or plant out' : 'Lift into basket';
    actions.appendChild(button(liftLabel, () => {
      this.game.lift(plant.id);
      this.panel.close();
    }, 'secondary-btn'));
    body.appendChild(actions);
    if (plant.location.kind === 'nursery' && est && idx >= 1) {
      body.appendChild(note('Established and rooted: it’s ready to leave the nursery. A display spot keeps it forever in your collection; planted outdoors, it becomes part of the landscape and spreads.'));
    }
  }
}
