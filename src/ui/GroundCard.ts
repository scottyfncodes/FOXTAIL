import type { Game } from '../game/engine/Game';
import { Panel } from './Panel';
import { el } from './dom';
import { findBed, plantsInBed, bedRefund, routeLength } from '../game/systems/landscape';
import { bedLiveliness, ROLE_WANT, ROLE_HAS, LIVELY_TIER } from '../game/systems/beds';
import { MINUTES_PER_DAY } from '../game/engine/Clock';
import { button, note } from './common';

/** A garden bed or a path, tapped on: a few words about it, and the option to undo it. */
export class GroundCard {
  panel = new Panel('');
  private target: { kind: 'bed' | 'path'; id: string } | null = null;
  private confirm = false;

  constructor(private game: Game) {}

  open(target: { kind: 'bed' | 'path'; id: string }) {
    this.target = target;
    this.confirm = false;
    this.render();
    this.panel.open();
  }

  refresh() {
    if (this.panel.isOpen) this.render();
  }

  private age(createdAt: number): string {
    const days = Math.floor((this.game.state.clock.totalMinutes - createdAt) / MINUTES_PER_DAY);
    return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  }

  private render() {
    const t = this.target;
    const state = this.game.state;
    this.panel.clearBody();
    const body = this.panel.body;
    if (!t) return;
    if (t.kind === 'bed') {
      const bed = findBed(state, t.id);
      if (!bed) return this.panel.close();
      this.panel.setTitle(bed.raised ? 'Raised Bed' : 'Garden Bed');
      const plants = plantsInBed(state, bed.id);
      const life = bedLiveliness(state, bed.id);
      body.appendChild(note(`${bed.raised ? 'Set down' : 'Dug'} ${this.age(bed.createdAt)}. ${plants.length ? `${plants.length} plant${plants.length === 1 ? '' : 's'} of ${life.species} kind${life.species === 1 ? '' : 's'}${life.plants < plants.length ? ', some still rooting' : ''}.` : 'Nothing growing in it yet — plant something from your basket.'}`));
      // How much life is in it, in the same quiet pips as rarity, and what would bring more.
      const row = el('div', 'liveliness');
      row.append(el('span', 'rarity-pips', '●'.repeat(life.tier + 1) + '○'.repeat(4 - life.tier)), el('span', 'liveliness-word', life.word));
      body.appendChild(row);
      const names = life.roles.map((r) => ROLE_HAS[r]);
      const has = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '';
      const wants = life.missing.slice(0, 2).map((r) => ROLE_WANT[r]);
      body.appendChild(
        note(
          life.tier >= 4
            ? `Everything a bed could want: ${has}. Birds and insects come and go, and they bring things with them.`
            : life.tier >= LIVELY_TIER
              ? `A good mix: ${has}. Lively enough that sports come up more often, and the odd seed arrives with the visitors.${wants.length ? ` Livelier still with ${wants.join(' or ')}.` : ''}`
              : plants.length
                ? `It has ${has || 'plants still rooting'}. A mix of kinds draws more life: try ${wants.join(' and ')}.`
                : 'A mix of kinds — something that trails, something that flowers, a fern, a succulent — makes a bed come alive.',
          'row-note'
        )
      );
      body.appendChild(note('Whatever grows here spreads only within the bed.', 'row-note'));
      if (!this.confirm) {
        body.appendChild(button(bed.raised ? 'Take it up…' : 'Fill it in…', () => {
          this.confirm = true;
          this.render();
        }, 'secondary-btn'));
      } else {
        body.appendChild(note(bed.raised ? 'The plants stay where they are, free to wander. The bed goes back in your basket to set down somewhere else.' : `The plants stay where they are, free to wander. You’ll get ${bedRefund(bed)} coins back.`, 'row-note'));
        const row = el('div', 'action-row');
        row.append(
          button('Keep it', () => {
            this.confirm = false;
            this.render();
          }, 'secondary-btn'),
          button(bed.raised ? 'Take it up' : 'Fill it in', () => {
            this.game.fillInBed(bed.id);
            this.panel.close();
          }, 'primary-btn danger')
        );
        body.appendChild(row);
      }
    } else {
      const path = state.paths.find((p) => p.id === t.id);
      if (!path) return this.panel.close();
      this.panel.setTitle('Path');
      body.appendChild(note(`About ${Math.round(routeLength(path.points))} paces long, carved ${this.age(path.createdAt)}. The verges are slowly growing back in.`));
      if (!this.confirm) {
        body.appendChild(button('Let it grow over…', () => {
          this.confirm = true;
          this.render();
        }, 'secondary-btn'));
      } else {
        body.appendChild(note('Your plants will be free to spread across it again. You can always carve a new one.', 'row-note'));
        const row = el('div', 'action-row');
        row.append(
          button('Keep it', () => {
            this.confirm = false;
            this.render();
          }, 'secondary-btn'),
          button('Let it go', () => {
            this.game.letPathGrowOver(path.id);
            this.panel.close();
          }, 'primary-btn danger')
        );
        body.appendChild(row);
      }
    }
  }
}
