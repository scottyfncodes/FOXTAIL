import type { Game } from '../game/engine/Game';
import { Panel } from './Panel';
import { el } from './dom';
import { button, note } from './common';
import { addKoiBlock, freeKoi, koiInPond, koiVariety, pondCapacity, pondSize } from '../game/systems/koi';
import { drawKoi } from '../game/world/GardenArt';
import type { Koi } from '../game/state';

/** A little portrait of one koi, markings and all. */
function koiPortrait(k: Koi): HTMLElement {
  const c = el('canvas', 'koi-portrait');
  c.width = 56;
  c.height = 40;
  c.style.width = '56px';
  c.style.height = '40px';
  const ctx = c.getContext?.('2d');
  if (ctx) {
    ctx.fillStyle = '#3f7f86';
    ctx.fillRect(0, 0, 56, 40);
    drawKoi(ctx, 28, 20, -Math.PI / 2, 46, k.variety, k.seed, 0, 1);
  }
  return c;
}

/** Tending a pond: which koi are in it, and letting more go, up to what it can hold. */
export class PondPanel {
  panel = new Panel('The Pond');
  private pondId: string | null = null;

  constructor(private game: Game) {}

  open(pondId: string) {
    this.pondId = pondId;
    this.render();
    this.panel.open();
  }

  refresh() {
    if (this.panel.isOpen) this.render();
  }

  private render() {
    const state = this.game.state;
    const pond = state.decor.find((d) => d.id === this.pondId && d.decorId === 'gardenPond');
    this.panel.clearBody();
    const body = this.panel.body;
    if (!pond) {
      body.appendChild(note('The pond isn’t here any more.'));
      return;
    }
    const size = pondSize(pond);
    const cap = pondCapacity(pond);
    const inside = koiInPond(state, pond);
    this.panel.setTitle(`The Pond · ${size.w} × ${size.h}`);
    if (cap === 0) {
      body.appendChild(note('Too small to keep koi. A pond needs to be dug bigger than this before a fish could live in it.'));
      return;
    }
    body.appendChild(el('div', 'collection-summary', `${inside.length} of ${cap} koi`));
    const list = el('div', 'entry-list');
    for (const k of inside) {
      const row = el('div', 'entry-row koi-row in-pond');
      const info = el('div', 'entry-info');
      info.append(el('div', 'entry-name', `${koiVariety(k.variety).name}`), el('div', 'entry-sub', 'Swimming here.'));
      row.append(koiPortrait(k), info, button('Net it out', () => {
        this.game.removeKoi(pond.id, k.id);
        this.render();
      }, 'secondary-btn small'));
      list.appendChild(row);
    }
    body.appendChild(list);
    const waiting = freeKoi(state);
    body.appendChild(el('h4', 'section-head', 'Your koi, not in a pond'));
    if (!waiting.length) {
      body.appendChild(note('You have no koi waiting. The Plant Stand & Supply sells them.'));
      return;
    }
    const more = el('div', 'entry-list');
    for (const k of waiting) {
      const block = addKoiBlock(state, pond.id, k.id);
      const row = el('div', 'entry-row koi-row waiting');
      const info = el('div', 'entry-info');
      info.append(el('div', 'entry-name', koiVariety(k.variety).name), el('div', 'entry-sub', block === 'full' ? 'The pond is as full as it should be.' : 'In its bag, ready to let go.'));
      row.append(koiPortrait(k), info, button('Let it go here', () => {
        this.game.addKoi(pond.id, k.id);
        this.render();
      }, 'primary-btn small', !!block));
      more.appendChild(row);
    }
    body.appendChild(more);
  }
}
