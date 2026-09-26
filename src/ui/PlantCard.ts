import type { Game } from '../game/engine/Game';
import { Panel } from './Panel';
import { el } from './dom';
import { PLANTS, specimenName, specimenRarity, findVariant, latinLine, rarityRank } from '../game/data/plants';
import { STAGES, STAGE_LABEL, stageFloat, stageIndexOf, minutesToNextStage } from '../game/systems/growth';
import { cuttingBlockReason, cuttingCooldown } from '../game/systems/propagation';
import { canTransplant, findBed } from '../game/systems/landscape';
import { zoneLabel } from '../game/engine/Game';
import { button, note, portrait, rarityBadge, realTime, crossButton } from './common';

/**
 * A plant out in the landscape, looked at up close: how it's doing, and
 * what can be done with it — a cutting, a move while it's still young, or,
 * if it's in the wrong place, compost.
 */
export class PlantCard {
  panel = new Panel('');
  private plantId: string | null = null;
  private confirmCompost = false;

  constructor(private game: Game) {}

  open(plantId: string) {
    this.plantId = plantId;
    this.confirmCompost = false;
    this.render();
    this.panel.open();
  }

  refresh() {
    if (this.panel.isOpen) this.render();
  }

  private render() {
    const state = this.game.state;
    const plant = this.plantId ? state.plants[this.plantId] : undefined;
    this.panel.clearBody();
    if (!plant || plant.location.kind !== 'wild') {
      this.panel.close();
      return;
    }
    const loc = plant.location;
    const def = PLANTS[plant.defId];
    const variant = findVariant(plant.defId, plant.variantId);
    const body = this.panel.body;
    const now = state.clock.totalMinutes;
    this.panel.setTitle(plant.bornWild ? 'Came up by itself' : 'Planted out');

    const head = el('div', 'plant-head');
    const info = el('div', 'entry-info');
    info.append(el('h3', undefined, specimenName(plant.defId, plant.variantId)));
    const latin = latinLine(plant.defId);
    if (latin) info.appendChild(el('div', 'latin', latin));
    info.appendChild(rarityBadge(specimenRarity(plant.defId, plant.variantId)));
    if (variant) info.appendChild(note(variant.description, 'row-note'));
    head.append(portrait(plant.defId, plant.variantId, stageFloat(plant.growth), plant.seed, 110), info);
    body.appendChild(head);

    const idx = stageIndexOf(plant.growth);
    const track = el('div', 'growth-stage-track labelled');
    STAGES.forEach((st, i) => {
      const dot = el('div', `growth-stage-dot${i <= idx ? ' filled' : ''}`);
      dot.title = STAGE_LABEL[st];
      track.appendChild(dot);
    });
    body.appendChild(track);
    const next = minutesToNextStage(state, plant);
    const native = def.habitat.includes(loc.zone);
    const bed = loc.bedId ? findBed(state, loc.bedId) : undefined;
    const where = `${bed ? 'In your garden bed in' : 'Growing in'} ${zoneLabel(loc.zone, state)}${native ? ', where it’s at home' : ''}.`;
    body.appendChild(note(`${next === null ? `${STAGE_LABEL[STAGES[idx]]} — fully grown.` : `${STAGE_LABEL[STAGES[idx]]}. ${STAGE_LABEL[STAGES[idx + 1]]} in ${realTime(next)}.`} ${where}`, 'growth-note'));

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
    if (canTransplant(plant)) {
      actions.appendChild(button('Move it', () => {
        this.panel.close();
        this.game.beginTransplant(plant.id);
      }, 'secondary-btn'));
    }
    body.appendChild(actions);

    // Composting: a real decision, so it takes two taps.
    const compost = el('div', 'compost-box');
    const others = Object.values(state.plants).filter((p) => p !== plant && p.defId === plant.defId && p.variantId === plant.variantId).length + state.basket.filter((b) => b.defId === plant.defId && b.variantId === plant.variantId).length;
    if (!this.confirmCompost) {
      compost.appendChild(note(idx >= 3 ? 'Settled in for good now — too big to move. If it’s in the wrong place, it can go on the compost.' : 'Not where you wanted it? It can go on the compost.', 'row-note'));
      compost.appendChild(button('Compost…', () => {
        this.confirmCompost = true;
        this.render();
      }, 'secondary-btn compost-btn'));
    } else {
      const lines: string[] = ['It’ll be gone for good.'];
      if (idx >= 2) lines.push('You may manage to save a cutting — or you may not, and it may not come true.');
      if (rarityRank(specimenRarity(plant.defId, plant.variantId)) >= 2 && others === 0) lines.push('It’s the only one you have.');
      compost.appendChild(note(lines.join(' '), `row-note${others === 0 ? ' warn' : ''}`));
      const row = el('div', 'action-row');
      row.append(
        button('Keep it', () => {
          this.confirmCompost = false;
          this.render();
        }, 'secondary-btn'),
        button('Compost it', () => {
          this.game.compost(plant.id);
          this.panel.close();
        }, 'primary-btn danger')
      );
      compost.appendChild(row);
    }
    body.appendChild(compost);
  }
}
