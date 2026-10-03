import type { Game } from '../game/engine/Game';
import { el, clear } from './dom';
import { SHOP_ITEMS, FURNITURE_IDS, DECOR_IDS } from '../game/data/shop';
import { STALL_ID } from '../game/systems/yard';
import { FURNITURE_DEFS } from '../game/data/furniture';
import { findFurniture } from '../game/systems/furniture';
import { occupantOf } from '../game/systems/propagation';
import { specimenName } from '../game/data/plants';
import { pathToolsNeeded, toolList } from '../game/systems/landscape';

// The bar along the bottom of the screen while the player is using their
// hands on the world: what's happening, in a few words, and big ✓ / ✕
// buttons a thumb can't miss. It never explains the whole system — it only
// says what the finger is doing right now.

function bigButton(label: string, cls: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const b = el('button', `mode-btn ${cls}`, label);
  b.disabled = disabled;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

export class ModeBar {
  root = el('div', 'mode-bar');
  private sig = '';

  constructor(private game: Game) {
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  /** Re-renders only when what it shows would change. */
  update() {
    const m = this.game.tools.mode;
    const state = this.game.state;
    let sig: string = m.kind;
    if (m.kind === 'plant') sig += `${m.check.block}|${m.check.bedId}`;
    else if (m.kind === 'arrange') sig += `${m.selectedId}|${m.pending?.kind}|${m.pending?.block}|${m.pending?.rot}|${JSON.stringify(state.furnitureStock)}|${state.furniture.length}`;
    else if (m.kind === 'yard') sig += `${m.selectedId}|${m.pending?.decorId}|${m.pending?.block}|${JSON.stringify(state.decorStock)}|${state.decor.length}`;
    else if (m.kind === 'bed') sig += `${m.shape}|${m.block}|${this.game.tools.bedCost()}|${state.coins}|${!!m.a}`;
    else if (m.kind === 'path') sig += `${m.preview?.block}|${m.preview?.plants.length}|${m.preview?.cost}|${m.points.length > 0}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.render();
  }

  private render() {
    const m = this.game.tools.mode;
    const state = this.game.state;
    this.root.classList.toggle('open', m.kind !== 'play');
    this.root.classList.toggle('arranging', m.kind === 'arrange' || m.kind === 'yard');
    clear(this.root);
    if (m.kind === 'play') return;
    const status = el('div', 'mode-status');
    const row = el('div', 'mode-row');
    const cancel = bigButton('✕', 'cancel', () => this.game.cancelTool());
    cancel.setAttribute('aria-label', 'Cancel');

    if (m.kind === 'plant') {
      const name = specimenName(m.ghost.defId, m.ghost.variantId);
      status.textContent = m.check.block ? 'Not there — drag it somewhere else' : m.plantId ? `Move the ${name} here?` : `Plant the ${name} here?`;
      row.append(cancel, bigButton(m.plantId ? '✓ Move' : '✓ Plant', 'confirm', () => this.game.confirmTool(), !!m.check.block));
    } else if (m.kind === 'bed') {
      const cost = this.game.tools.bedCost();
      status.textContent = !m.a
        ? `Drag across the ground to mark out a bed · you have ${state.coins} coins`
        : m.block === 'coins'
          ? `Costs ${cost} coins — you have ${state.coins}`
          : m.block === 'too-small'
            ? 'Drag it a little bigger'
            : m.block
              ? 'Not there — try another stretch of ground'
              : `Dig it? ${cost} coins`;
      const shape = bigButton(m.shape === 'rect' ? '▭' : '◯', 'shape', () => this.game.tools.setBedShape(m.shape === 'rect' ? 'oval' : 'rect'));
      shape.setAttribute('aria-label', 'Change shape');
      row.append(cancel, shape, bigButton('✓ Dig', 'confirm', () => this.game.confirmTool(), !this.game.tools.canConfirm()));
    } else if (m.kind === 'path') {
      const p = m.preview;
      status.textContent = !m.points.length
        ? 'Trace where you want to walk'
        : !p || p.block === 'too-short'
          ? 'Keep tracing…'
          : p.block === 'bed'
            ? 'Paths go around garden beds, not through them'
            : p.block === 'coins'
              ? `Costs ${p.cost} coins — you have ${state.coins}`
              : p.block
                ? 'Water or the house is in the way'
                : `Carve it? ${p.cost} coins${p.trees.length || p.rocks.length ? ` · clears ${[p.trees.length ? `${p.trees.length} tree${p.trees.length === 1 ? '' : 's'}` : '', p.rocks.length ? `${p.rocks.length} rock${p.rocks.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ')}` : ''}${pathToolsNeeded(state, p).length ? ` (the crew brings ${toolList(pathToolsNeeded(state, p))} — cheaper with your own)` : ''}${p.plants.length ? ` · ${p.plants.length} of your plants dug up` : ''}`;
      row.append(cancel, bigButton('✓ Carve', 'confirm', () => this.game.confirmTool(), !this.game.tools.canConfirm()));
    } else if (m.kind === 'arrange') {
      this.renderArrange(m, status, row);
      return;
    } else if (m.kind === 'yard') {
      this.renderYard(m, status, row);
      return;
    }
    this.root.append(status, row);
  }

  private renderYard(m: Extract<Game['tools']['mode'], { kind: 'yard' }>, status: HTMLElement, row: HTMLElement) {
    const state = this.game.state;
    const done = bigButton('Done', 'confirm', () => this.game.cancelTool());
    const nameOf = (id: string) => SHOP_ITEMS.find((s) => s.id === id)?.name ?? 'piece';
    if (m.pending) {
      const name = nameOf(m.pending.decorId).toLowerCase();
      status.textContent = m.pending.block ? `Not there — drag the ${name} onto open ground` : `Set the ${name} down here?`;
      row.append(bigButton('↻', 'shape', () => this.game.rotateSelected()));
      row.append(bigButton('✕', 'cancel', () => this.game.tools.storeSelected()), bigButton('✓ Place', 'confirm', () => this.game.confirmTool(), !!m.pending.block));
      this.root.append(status, row);
      return;
    }
    if (m.selectedId === STALL_ID) {
      status.textContent = 'Plant Stand & Supply · drag to move the whole stall, ↻ to turn it round';
      row.append(bigButton('↻', 'shape', () => this.game.rotateSelected()), done);
      this.root.append(status, row);
      return;
    }
    const sel = m.selectedId ? state.decor.find((d) => d.id === m.selectedId) : undefined;
    if (sel) {
      const occupied = occupantOf(state, { slotId: sel.id });
      status.textContent = occupied ? `${nameOf(sel.decorId)} · with its ${specimenName(occupied.defId, occupied.variantId)} — drag to move them together` : `${nameOf(sel.decorId)} · drag to move`;
      row.append(bigButton('↻', 'shape', () => this.game.rotateSelected()));
      row.append(bigButton('Put away', 'secondary', () => this.game.tools.storeSelected(), !!occupied), done);
      this.root.append(status, row);
      return;
    }
    status.textContent = 'Drag anything to move it — the stall too. Drag the ground to look around.';
    const stocked = DECOR_IDS.filter((id) => (state.decorStock[id] ?? 0) > 0);
    if (stocked.length) {
      const tray = el('div', 'stock-tray');
      for (const id of stocked) tray.appendChild(bigButton(`${nameOf(id)} ×${state.decorStock[id]}`, 'stock', () => this.game.addDecorFromStock(id)));
      this.root.append(status, tray, row);
    } else this.root.append(status, row);
    row.append(done);
  }

  private renderArrange(m: Extract<Game['tools']['mode'], { kind: 'arrange' }>, status: HTMLElement, row: HTMLElement) {
    const state = this.game.state;
    const done = bigButton('Done', 'confirm', () => this.game.cancelTool());
    if (m.pending) {
      const def = FURNITURE_DEFS[m.pending.kind];
      status.textContent = m.pending.block ? `Not there — drag the ${def.name.toLowerCase()} somewhere clear` : `Set the ${def.name.toLowerCase()} down here?`;
      row.append(bigButton('↻', 'shape', () => this.game.rotateSelected()));
      row.append(bigButton('✕', 'cancel', () => this.game.tools.storeSelected()), bigButton('✓ Place', 'confirm', () => this.game.confirmTool(), !!m.pending.block));
      this.root.append(status, row);
      return;
    }
    const sel = m.selectedId ? findFurniture(state, m.selectedId) : undefined;
    if (sel) {
      const def = FURNITURE_DEFS[sel.kind];
      const occupied = occupantOf(state, { slotId: sel.id }) ?? occupantOf(state, { bedId: sel.id });
      status.textContent = occupied ? `${def.name} · with its ${specimenName(occupied.defId, occupied.variantId)} — drag to move them together` : `${def.name} · drag to move`;
      row.append(bigButton('↻', 'shape', () => this.game.rotateSelected()));
      // The living room's own furniture moves but stays: there's nowhere to put a couch away.
      if (!def.fixed) row.append(bigButton('Put away', 'secondary', () => this.game.tools.storeSelected(), !!occupied));
      row.append(done);
      this.root.append(status, row);
      return;
    }
    status.textContent = 'Drag anything to move it. Drag the floor to look around.';
    const stocked = FURNITURE_IDS.filter((id) => (state.furnitureStock[id] ?? 0) > 0);
    if (stocked.length) {
      const tray = el('div', 'stock-tray');
      for (const id of stocked) {
        const name = SHOP_ITEMS.find((s) => s.id === id)?.name ?? FURNITURE_DEFS[id].name;
        tray.appendChild(bigButton(`${name} ×${state.furnitureStock[id]}`, 'stock', () => this.game.addFromStock(id)));
      }
      this.root.append(status, tray, row);
    } else this.root.append(status, row);
    row.append(done);
  }
}
