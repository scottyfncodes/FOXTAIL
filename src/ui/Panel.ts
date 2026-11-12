import { el, clear } from './dom';

// Every open panel, most recent last, so Escape closes the one on top. The
// key is caught in the capture phase, before the game's own tool shortcuts
// see it: with a panel up, Escape means "close this", nothing more.
const openPanels: Panel[] = [];

/** Tells whoever is listening (the HUD) when the first panel opens and the last one closes. */
function announceModal() {
  Panel.onModalChange?.(openPanels.length > 0);
}

window.addEventListener(
  'keydown',
  (e) => {
    if (e.key !== 'Escape' || openPanels.length === 0) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openPanels[openPanels.length - 1].close();
  },
  true
);

export class Panel {
  backdrop = el('div', 'panel-backdrop');
  panel = el('div', 'panel');
  header = el('div', 'panel-header');
  titleEl = el('h2');
  closeBtn = el('button', 'panel-close', '×');
  tabsEl = el('div', 'panel-tabs');
  body = el('div', 'panel-body');
  /** Called whenever the panel closes, however it was closed. */
  onClose?: () => void;
  /** With a panel up, what's behind it is out of reach: the HUD listens for this. */
  static onModalChange: ((anyOpen: boolean) => void) | null = null;

  constructor(title: string, opts: { tabs?: boolean } = {}) {
    this.titleEl.textContent = title;
    // A sheet over the game: its own landmark, named by its title.
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');
    this.panel.setAttribute('aria-label', title);
    // The mark is a multiplication sign: say what it does.
    this.closeBtn.setAttribute('aria-label', 'Close');
    this.closeBtn.addEventListener('click', () => this.close());
    this.header.append(this.titleEl, this.closeBtn);
    this.panel.append(this.header);
    if (opts.tabs) this.panel.append(this.tabsEl);
    this.panel.append(this.body);
    this.backdrop.append(this.panel);
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.close();
    });
    document.body.appendChild(this.backdrop);
  }

  setTitle(t: string) {
    this.titleEl.textContent = t;
    this.panel.setAttribute('aria-label', t);
  }

  clearBody() {
    clear(this.body);
  }

  open() {
    this.backdrop.classList.add('open');
    const i = openPanels.indexOf(this);
    if (i !== -1) openPanels.splice(i, 1);
    openPanels.push(this);
    announceModal();
  }

  close() {
    const wasOpen = this.isOpen;
    this.backdrop.classList.remove('open');
    const i = openPanels.indexOf(this);
    if (i !== -1) openPanels.splice(i, 1);
    announceModal();
    if (wasOpen) this.onClose?.();
  }

  /** Whether any panel is up (so world shortcuts can stand aside). */
  static anyOpen(): boolean {
    return openPanels.length > 0;
  }

  get isOpen() {
    return this.backdrop.classList.contains('open');
  }
}
