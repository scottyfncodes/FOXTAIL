import type { Game } from '../game/engine/Game';
import { Panel } from './Panel';
import { el, clear } from './dom';
import { PLANT_LIST, PLANTS, rarityRank, findVariant, latinLine } from '../game/data/plants';
import { variantAllowed } from '../game/systems/lineage';
import { CURIOSITIES } from '../game/data/curiosities';
import { ZONES } from '../game/data/zones';
import type { OutdoorZoneId } from '../game/types';
import { collectionTotals, speciesCounts, isEstablished, ESTABLISH_THRESHOLD } from '../game/systems/collection';
import { describeRegion } from '../game/systems/wild';
import { canName, NAME_MAX, regionLabel } from '../game/systems/regions';
import { note, portrait, rarityBadge } from './common';

type Tab = 'plants' | 'regions' | 'curiosities';

const REGIONS: OutdoorZoneId[] = ['meadow', 'woodland', 'creek', 'dampForest', 'rockyClearing', 'overgrownClearing'];

/**
 * Ellen's field journal, now a collection: every species in the valley,
 * with the ones not yet found shown as silhouettes and every variant
 * slot visible as "???" until it's been seen — so there's always a gap
 * to wonder about.
 */
export class JournalPanel {
  panel = new Panel('Field Journal', { tabs: true });
  private tab: Tab = 'plants';
  private detail: string | null = null;

  constructor(private game: Game) {
    for (const [id, label] of [
      ['plants', 'Collection'],
      ['regions', 'Regions'],
      ['curiosities', 'Curiosities'],
    ] as [Tab, string][]) {
      const btn = el('button', 'panel-tab', label);
      btn.dataset.tab = id;
      btn.addEventListener('click', () => {
        this.tab = id;
        this.detail = null;
        this.render();
      });
      this.panel.tabsEl.appendChild(btn);
    }
  }

  open(tab?: Tab) {
    this.detail = null;
    if (tab) this.tab = tab;
    this.render();
    this.panel.open();
  }

  refresh() {
    if (this.panel.isOpen) this.render();
  }

  private render() {
    // Curiosities only get a page once there's something on it.
    const anyCurio = Object.keys(this.game.state.curiosities).length > 0;
    if (!anyCurio && this.tab === 'curiosities') this.tab = 'plants';
    for (const c of Array.from(this.panel.tabsEl.children) as HTMLElement[]) {
      c.classList.toggle('active', c.dataset.tab === this.tab);
      if (c.dataset.tab === 'curiosities') c.style.display = anyCurio ? '' : 'none';
    }
    this.panel.clearBody();
    if (this.tab === 'regions') return this.renderRegions();
    if (this.tab === 'curiosities') return this.renderCuriosities();
    if (this.detail) return this.renderDetail(this.detail);
    this.renderCollection();
  }

  private renderCollection() {
    const state = this.game.state;
    const totals = collectionTotals(state);
    this.panel.body.appendChild(
      el('div', 'collection-summary', `${totals.species} of ${totals.totalSpecies} species · ${totals.variants} of ${totals.totalVariants} variants`)
    );
    const grid = el('div', 'collection-grid');
    const sorted = PLANT_LIST.filter((p) => !p.unlisted).sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity));
    for (const def of sorted) {
      const rec = state.collection[def.id];
      // Only what's been successfully grown counts as discovered.
      const grown = rec?.grownVariants ?? [];
      const card = el('div', `collection-card${grown.length ? ' found clickable' : ''}`);
      if (rec && grown.length) {
        // Show off the rarest variant grown.
        const best = [...grown].sort((a, b) => rarityRank(findVariant(def.id, b)!.rarity) - rarityRank(findVariant(def.id, a)!.rarity))[0] ?? def.variants[0].id;
        card.append(portrait(def.id, best, 3, 4, 76), el('div', 'card-name', def.name));
        const dots = el('div', 'variant-dots');
        for (const v of def.variants) dots.appendChild(el('span', grown.includes(v.id) ? 'vdot on' : 'vdot'));
        card.appendChild(dots);
        if (isEstablished(state, def.id)) card.appendChild(el('div', 'card-flag', 'Established'));
        card.addEventListener('click', () => {
          this.detail = def.id;
          this.render();
        });
      } else {
        // Found but not yet grown: still a silhouette, with a nudge to grow it.
        card.append(portrait(def.id, def.variants[0].id, 2.6, 4, 76, true), el('div', 'card-name unknown', '???'), el('div', 'card-hint', rec ? 'Found — grow it to record it.' : def.hint));
      }
      grid.appendChild(card);
    }
    this.panel.body.appendChild(grid);
  }

  private renderDetail(defId: string) {
    const state = this.game.state;
    const def = PLANTS[defId];
    const rec = state.collection[defId];
    const grown = rec?.grownVariants ?? [];
    if (!def || !rec || !grown.length || def.unlisted) return this.renderCollection();
    const body = this.panel.body;
    const back = el('button', 'back-link', '← Collection');
    back.addEventListener('click', () => {
      this.detail = null;
      this.render();
    });
    body.appendChild(back);

    const head = el('div', 'plant-head');
    const info = el('div', 'entry-info');
    info.append(el('h3', undefined, def.name));
    if (latinLine(def.id)) info.appendChild(el('div', 'latin', latinLine(def.id)));
    info.appendChild(rarityBadge(def.rarity));
    const habitat = el('div', 'entry-sub', `Grows wild in ${def.habitat.map((z) => ZONES[z].name.replace(/^The /, 'the ')).join(' and ')}`);
    info.appendChild(habitat);
    head.append(portrait(def.id, grown[0], 3.4, 4, 120), info);
    body.appendChild(head);
    body.appendChild(note(def.description));

    const est = isEstablished(state, defId);
    body.appendChild(
      el('div', `establish${est ? ' done' : ''}`, est ? 'Established — you can display it and plant it out.' : `${rec.grown} of ${ESTABLISH_THRESHOLD} grown — establish it to display it or plant it out.`)
    );

    // Variant checklist: grown ones are shown, the rest are "???" (a found one says so).
    body.appendChild(el('h4', 'section-head', 'Variants'));
    const vlist = el('div', 'variant-list');
    for (const v of def.variants) {
      const ok = grown.includes(v.id);
      const row = el('div', `variant-row${ok ? '' : ' missing'}`);
      if (ok) {
        row.append(portrait(def.id, v.id, 2.8, 7, 44), el('span', 'variant-name', `✓ ${v.name}`), rarityBadge(v.rarity));
        row.title = v.description;
      } else {
        const locked = !rec.variants.includes(v.id) && !variantAllowed(state, def.id, v.id);
        row.append(portrait(def.id, v.id, 2.8, 7, 44, true), el('span', 'variant-name', rec.variants.includes(v.id) ? '??? · found — grow it to record it' : locked ? '??? · after the one above' : '???'));
        if (locked) row.title = 'Each form comes after the last: find the one above first, or grow it on and see what its cuttings do.';
      }
      vlist.appendChild(row);
    }
    body.appendChild(vlist);

    const c = speciesCounts(state, defId);
    body.appendChild(el('h4', 'section-head', 'Your plants'));
    const stats = el('div', 'stat-grid');
    const stat = (label: string, value: string | number) => {
      const s = el('div', 'stat');
      s.append(el('div', 'stat-value', String(value)), el('div', 'stat-label', label));
      stats.appendChild(s);
    };
    stat('Grown', rec.grown);
    stat('Cuttings taken', rec.propagated);
    stat('In the nursery', c.inNursery);
    stat('On display', c.displayed);
    stat('Carrying', c.carrying);
    stat('Growing wild', c.wild);
    stat('Sold', rec.sold);
    stat('Earned', rec.earned);
    body.appendChild(stats);
    if (c.wild > 0) {
      body.appendChild(note(c.wildSprouted > 0 ? `${c.wildPlanted} you planted, and ${c.wildSprouted} that came up by themselves.` : `${c.wildPlanted} you planted out. Once they’re large, they’ll start to spread.`));
    }
  }

  /** Insects, creatures and oddities — the things at the end of a fox's trail. */
  private renderCuriosities() {
    const state = this.game.state;
    const body = this.panel.body;
    const found = CURIOSITIES.filter((c) => state.curiosities[c.id]).length;
    body.appendChild(el('div', 'collection-summary', `${found} of ${CURIOSITIES.length} noted`));
    const list = el('div', 'entry-list');
    const glyph = { creature: '\u{1F438}', insect: '\u{1F98B}', oddity: '\u{1FAA8}' } as const;
    for (const c of [...CURIOSITIES].sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity))) {
      const rec = state.curiosities[c.id];
      const row = el('div', `entry-row${rec ? '' : ' missing'}`);
      const icon = el('div', 'curio-icon', rec ? glyph[c.kind] : '?');
      const info = el('div', 'entry-info');
      if (rec) {
        info.append(el('div', 'entry-name', c.name), el('div', 'entry-sub', c.description), rarityBadge(c.rarity));
        if (rec.count > 1) info.appendChild(el('div', 'entry-sub dim', `Seen ${rec.count} times.`));
      } else {
        info.append(el('div', 'entry-name unknown', '???'));
      }
      row.append(icon, info);
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  /** A small field for what to call a region, prefilled with what it's turning into. */
  private nameField(z: OutdoorZoneId, current?: string): HTMLElement {
    const wrap = el('div', 'name-field');
    const input = el('input', 'name-input') as HTMLInputElement;
    input.maxLength = NAME_MAX;
    input.value = current ?? this.game.suggestRegionName(z);
    input.setAttribute('aria-label', 'Name for this region');
    const btn = el('button', 'secondary-btn small', current ? 'Rename' : 'Put up a plaque');
    const commit = () => {
      if (this.game.nameRegion(z, input.value)) this.render();
    };
    btn.addEventListener('click', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      e.stopPropagation();
    });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    wrap.append(input, btn);
    return wrap;
  }

  private renderRegions() {
    const lush = this.game.lush;
    const body = this.panel.body;
    body.appendChild(note('What your plants are doing to the valley. Plants grow fastest in their own kind of country.'));
    const list = el('div', 'entry-list');
    for (const z of REGIONS) {
      const cover = lush.zoneCover[z] ?? 0;
      const count = lush.zoneCount[z] ?? 0;
      const row = el('div', 'entry-row region-row');
      const info = el('div', 'entry-info');
      const named = this.game.state.regions[z];
      info.append(el('div', 'entry-name', regionLabel(this.game.state, z)), el('div', 'entry-sub', `${named ? `${ZONES[z].name}. ` : ''}${describeRegion(cover, count, lush.zoneCharacter[z])}`));
      // Changed enough to be worth a name: offer one, in the player's own words if they like.
      if (canName(lush, z)) info.appendChild(this.nameField(z, named?.name));
      const natives = PLANT_LIST.filter((p) => p.habitat.includes(z) && !p.foxOnly && this.game.state.collection[p.id]).map((p) => p.name);
      if (natives.length) info.appendChild(el('div', 'entry-sub dim', `Thrives here: ${natives.join(', ')}`));
      const bar = el('div', 'trait-bar-track');
      const fill = el('div', 'trait-bar-fill');
      fill.style.width = `${Math.round(Math.min(1, cover) * 100)}%`;
      bar.appendChild(fill);
      info.appendChild(bar);
      const right = el('div', 'region-stat');
      right.append(el('div', 'stat-value', `${Math.round(cover * 100)}%`), el('div', 'stat-label', `${count} plant${count === 1 ? '' : 's'}`));
      row.append(info, right);
      list.appendChild(row);
    }
    body.appendChild(list);
    void clear;
  }
}
