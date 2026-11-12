/// <reference types="node" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { StartOverlay } from '../src/ui/StartOverlay';
import { Panel } from '../src/ui/Panel';
import { icon } from '../src/ui/icons';
import { tick, TICK_MS } from '../src/game/engine/Haptics';

// The finishing pass: nothing here changes what the game is. The title
// screen is the only thing there until you step outside, the notebook's
// serif holds on every device, the garden menu's marks are drawn, and a
// press in the open gets an answer.

/** Enough of a canvas for the game to be built on. */
async function makeGame() {
  const noop = () => {};
  const canvas = document.createElement('canvas');
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? canvas : k === 'getTransform' ? () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) : noop), set: () => true });
  vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  const { Game } = await import('../src/game/engine/Game');
  return new Game(canvas);
}

function press(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('the title screen', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('steps outside on Enter or Space when nothing else is chosen, once', () => {
    for (const key of ['Enter', ' ']) {
      document.body.innerHTML = '';
      const onStart = vi.fn();
      new StartOverlay(onStart, () => {}, true);
      press(key);
      expect(onStart, key).toHaveBeenCalledTimes(1);
      // It's on its way out: the key is the game's now.
      press(key);
      expect(onStart, key).toHaveBeenCalledTimes(1);
    }
  });

  it('leaves the key alone while something else on it is focused', () => {
    const onStart = vi.fn();
    const overlay = new StartOverlay(onStart, () => {}, true);
    (overlay.root.querySelector('[data-haveanapp]') as HTMLElement).focus();
    press('Enter');
    expect(onStart).not.toHaveBeenCalled();
  });

  it('takes no focus by itself, so no ring is drawn on a phone', () => {
    new StartOverlay(() => {}, () => {}, true);
    expect(document.activeElement).toBe(document.body);
  });

  it('keeps the name and the way in as two groups', () => {
    const overlay = new StartOverlay(() => {}, () => {}, false, () => ({ day: 3, plants: 4, species: 2, coins: 50, awayMs: 0 }));
    const brand = overlay.root.querySelector('.start-brand')!;
    const body = overlay.root.querySelector('.start-body')!;
    expect(brand.querySelector('h1')?.textContent).toBe('FOXTAIL');
    expect(brand.querySelector('.start-tagline')).not.toBeNull();
    expect(body.querySelector('.primary-btn')?.textContent).toBe('Continue');
    expect(body.querySelector('.start-stats')).not.toBeNull();
    expect(body.querySelector('.start-reset')).not.toBeNull();
  });

  it('breaks the cast between its halves, never at a dot', () => {
    const overlay = new StartOverlay(() => {}, () => {}, true);
    const cast = overlay.root.querySelector('.start-cast')!;
    expect(cast.textContent).toBe('Ellen · Scout · Scott · Ranger · and the fox');
    const parts = [...cast.querySelectorAll('.start-cast-part')].map((p) => p.textContent ?? '');
    expect(parts).toEqual(['Ellen · Scout · Scott', 'Ranger · and the fox']);
    for (const p of parts) expect(p).toMatch(/^[A-Za-z].*[a-z]$/);
  });
});

describe('the HUD behind the title', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
  });

  it('is inert until the game is live, and news sits in the game layer', async () => {
    const game = await makeGame();
    const { HUD } = await import('../src/ui/HUD');
    const hud = new HUD(game);
    hud.setLive(false);
    expect(hud.root.hasAttribute('inert')).toBe(true);
    hud.setLive(true);
    expect(hud.root.hasAttribute('inert')).toBe(false);
    expect(document.querySelector('#app > .toast-stack')).not.toBeNull();
  });

  it('draws every garden menu mark, and the stop mark, in the game’s own line', async () => {
    const game = await makeGame();
    const { HUD } = await import('../src/ui/HUD');
    const hud = new HUD(game);
    const rows = [...hud.root.querySelectorAll('.land-item')];
    expect(rows.map((r) => r.querySelector('.land-label')?.textContent)).toEqual(['Dig a bed', 'Round bed', 'Carve a path', 'Clear a square', 'Clear a circle', 'Arrange the garden']);
    expect(rows.map((r) => (r.querySelector('.land-icon') as HTMLElement)?.dataset.icon)).toEqual(['bedRect', 'bedRound', 'path', 'clearSquare', 'clearCircle', 'chair']);
    for (const r of rows) {
      expect(r.querySelector('.land-icon svg')).not.toBeNull();
      // The label is the only text: no symbol-font glyph standing in for a picture.
      expect(r.textContent).toBe(r.querySelector('.land-label')?.textContent);
    }
    expect(icon('stop').querySelector('svg path')).not.toBeNull();
  });

  it('lets an open garden menu sit over the news', async () => {
    const game = await makeGame();
    const { HUD } = await import('../src/ui/HUD');
    const hud = new HUD(game);
    const stack = document.querySelector('.toast-stack')!;
    const garden = hud.root.querySelector('.tool-btn') as HTMLButtonElement;
    garden.click();
    expect(hud.root.querySelector('.land-menu')!.classList.contains('open')).toBe(true);
    expect(stack.classList.contains('under-menu')).toBe(true);
    garden.click();
    expect(stack.classList.contains('under-menu')).toBe(false);
  });
});

describe('a press with nothing in reach', () => {
  it('is answered once, changes nothing, and stays quiet on the title screen', async () => {
    const game = await makeGame();
    const heard = vi.fn();
    game.onNothingInReach = heard;
    game.nearest = null;
    // Not started: that key belonged to the title screen.
    game.interactWithNearest();
    expect(heard).not.toHaveBeenCalled();

    (game as unknown as { started: boolean }).started = true;
    const before = JSON.stringify(game.state);
    game.interactWithNearest();
    expect(heard).toHaveBeenCalledTimes(1);
    // Mashed, it doesn't pile up.
    game.interactWithNearest();
    game.interactWithNearest();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(game.state)).toBe(before);
  });

  it('shows in the prompt for a moment, without the key cap', async () => {
    document.body.innerHTML = '<main id="app"></main>';
    const game = await makeGame();
    const { HUD } = await import('../src/ui/HUD');
    const hud = new HUD(game);
    (game as unknown as { started: boolean }).started = true;
    game.nearest = null;
    const prompt = hud.root.querySelector('.interaction-prompt')!;
    hud.update();
    expect(prompt.classList.contains('visible')).toBe(false);
    game.interactWithNearest();
    hud.update();
    expect(prompt.classList.contains('visible')).toBe(true);
    expect(prompt.classList.contains('nothing')).toBe(true);
    expect(prompt.textContent).toContain('Nothing in reach');
    // On a touch screen the button shakes its head too.
    expect((hud as unknown as { actionBtn: HTMLElement }).actionBtn.classList.contains('no')).toBe(true);
    // Something comes into reach: the prompt is its again at once.
    game.nearest = { kind: 'market', id: 'stall', x: 0, y: 0, label: 'The Plant Stand', available: true };
    hud.update();
    expect(prompt.classList.contains('nothing')).toBe(false);
    expect(prompt.textContent).toContain('The Plant Stand');
  });
});

describe('the tick under the thumb', () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'vibrate');
  afterEach(() => {
    if (original) Object.defineProperty(navigator, 'vibrate', original);
    else delete (navigator as unknown as { vibrate?: unknown }).vibrate;
  });

  it('is one short pulse where the phone can do it', () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    tick();
    expect(vibrate).toHaveBeenCalledWith(TICK_MS);
    expect(TICK_MS).toBeLessThanOrEqual(20);
  });

  it('is nothing at all where it can’t, or isn’t allowed', () => {
    delete (navigator as unknown as { vibrate?: unknown }).vibrate;
    expect(() => tick()).not.toThrow();
    Object.defineProperty(navigator, 'vibrate', { value: () => { throw new Error('not allowed'); }, configurable: true });
    expect(() => tick()).not.toThrow();
  });
});

describe('panels', () => {
  afterEach(() => {
    Panel.onModalChange = null;
  });

  it('say what the close mark does, and what they are', () => {
    const p = new Panel('Basket');
    expect(p.closeBtn.getAttribute('aria-label')).toBe('Close');
    expect(p.panel.getAttribute('role')).toBe('dialog');
    expect(p.panel.getAttribute('aria-modal')).toBe('true');
    expect(p.panel.getAttribute('aria-label')).toBe('Basket');
    p.setTitle('Basket (2/6)');
    expect(p.panel.getAttribute('aria-label')).toBe('Basket (2/6)');
  });

  it('put the HUD out of reach while any is open, and keep it in view', async () => {
    document.body.innerHTML = '<main id="app"></main>';
    const game = await makeGame();
    const { HUD } = await import('../src/ui/HUD');
    const hud = new HUD(game);
    Panel.onModalChange = (open) => hud.setBehindPanel(open);
    const a = new Panel('Field Journal');
    const b = new Panel('Plant');
    expect(hud.root.hasAttribute('inert')).toBe(false);
    a.open();
    b.open();
    expect(hud.root.hasAttribute('inert')).toBe(true);
    expect(hud.root.classList.contains('offstage')).toBe(false);
    b.close();
    expect(hud.root.hasAttribute('inert')).toBe(true);
    a.close();
    expect(hud.root.hasAttribute('inert')).toBe(false);
    // The title screen still wins: closing a panel can't bring the HUD back early.
    hud.setLive(false);
    a.open();
    a.close();
    expect(hud.root.hasAttribute('inert')).toBe(true);
    expect(hud.root.classList.contains('offstage')).toBe(true);
  });
});

describe('the notebook’s type', () => {
  // Read from disk: the test runner blanks stylesheet imports.
  const css = readFileSync('src/styles/main.css', 'utf8');
  const root = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')));
  const stack = /font-family:([^;]+);/.exec(root)![1].split(',').map((f) => f.trim().replace(/['"]/g, ''));

  it('is a book serif first, and ends on a serif wherever it lands', () => {
    expect(stack[0]).toBe('Iowan Old Style');
    expect(stack[stack.length - 1]).toBe('serif');
    expect(stack).toContain('Noto Serif');
  });

  it('never falls through to the system sans', () => {
    for (const sans of ['system-ui', 'sans-serif', 'Segoe UI', 'Inter', 'Roboto', 'Arial']) expect(stack, sans).not.toContain(sans);
  });
});
