// Foxtail's own small icons, drawn for the game rather than borrowed from
// an emoji font: a soft ink line on a 24-unit square, round ends, in the
// text colour of whatever holds them. Few on purpose: only where a word
// won't fit (the HUD buttons, the clock chip, the journal's curiosities).

const PATHS = {
  /** Ellen's field journal: a notebook with a ribbon. */
  journal:
    '<path d="M6 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H6z"/><path d="M6 3.5v17"/><path d="M9.5 8h6M9.5 11h4.5"/><path d="M14.5 20.5v-3l1.25 1 1.25-1v3"/>',
  /** The basket on her arm. */
  basket:
    '<path d="M3.5 10.5h17l-1.8 8.2a1.5 1.5 0 0 1-1.5 1.3H6.8a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M7.5 10.5c0-3.6 2-6 4.5-6s4.5 2.4 4.5 6"/><path d="M9 13.5l.5 4M15 13.5l-.5 4M12 13.5v4"/>',
  /** The garden: a sprig of three leaves. */
  sprig:
    '<path d="M12 21V9"/><path d="M12 9c0-3 1.8-5 4.5-5.5C16.5 6.5 15 8.6 12 9z"/><path d="M12 14c-.5-2.8-2.4-4.5-5.5-4.6.3 2.9 2.4 4.6 5.5 4.6z"/><path d="M12 17c.5-2.3 2.2-3.6 4.8-3.6-.4 2.3-2.2 3.6-4.8 3.6z"/>',
  /** Arranging: a ladder-back chair. */
  chair:
    '<path d="M7 3.5v17M7 12.5h10M17 12.5v8M7 6.5h6.5M7 9.5h6.5"/><path d="M13.5 3.5v9"/>',
  /** The mini truck, from the side. */
  truck:
    '<path d="M2.5 16.5V9.5h10v7"/><path d="M12.5 11.5h4.2l3.3 3.2v1.8h-1.2"/><path d="M8.6 16.5h6"/><circle cx="6.5" cy="17" r="1.9"/><circle cx="16.5" cy="17" r="1.9"/>',
  /** Music: a pair of notes. */
  music: '<path d="M9 17.5V6l10-2v11"/><circle cx="6.75" cy="17.5" r="2.25"/><circle cx="16.75" cy="15" r="2.25"/><path d="M9 9.5l10-2"/>',
  /** Clear weather. */
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  /** Overcast. */
  cloud: '<path d="M7 18.5h10.5a3.5 3.5 0 0 0 .4-7A5.5 5.5 0 0 0 7.3 10 4.25 4.25 0 0 0 7 18.5z"/>',
  /** Rain. */
  rain: '<path d="M7 14.5h10.5a3.5 3.5 0 0 0 .4-7A5.5 5.5 0 0 0 7.3 6 4.25 4.25 0 0 0 7 14.5z"/><path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5"/>',
  /** After dark. */
  moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  /** Curiosities: a creature (a frog, from above). */
  frog:
    '<path d="M6 13c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5-2.7 5.5-6 5.5-6-2.2-6-5.5z"/><circle cx="8.5" cy="7.5" r="2"/><circle cx="15.5" cy="7.5" r="2"/><path d="M6.5 16l-3 2.5M17.5 16l3 2.5M7 11l-3.5-1M17 11l3.5-1"/>',
  /** An insect (a moth or butterfly). */
  butterfly:
    '<path d="M12 7.5v11"/><path d="M12 10C10 6 6.5 4.5 4.5 5.5S4 11 8 12c-3 1.2-3.2 4.6-1.3 5.3 2 .8 4-1.5 5.3-4.3"/><path d="M12 10c2-4 5.5-5.5 7.5-4.5S20 11 16 12c3 1.2 3.2 4.6 1.3 5.3-2 .8-4-1.5-5.3-4.3"/><path d="M12 7.5l-1.5-3M12 7.5l1.5-3"/>',
  /** An oddity (a strange stone). */
  stone: '<path d="M4 16.5c-.3-4 2.6-8.5 7-9.5 4.6-1 8.6 2.3 9 6.5.3 3.3-2.3 5.5-5.5 5.5H7c-1.7 0-2.9-.9-3-2.5z"/><path d="M9.5 12.5c1-1.2 2.6-1.6 4-1"/>',
} as const;

export type IconName = keyof typeof PATHS;

/** One of the game's icons, sized by the font size of wherever it sits. */
export function icon(name: IconName, className = 'ft-icon'): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = className;
  span.dataset.icon = name;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`;
  return span;
}

/** Swaps a holder's icon (or text) only when it changes: the HUD calls this every frame. */
export function setIcon(holder: HTMLElement, name: IconName | null, text = '') {
  const want = name ?? `text:${text}`;
  if (holder.dataset.showing === want) return;
  holder.dataset.showing = want;
  holder.textContent = '';
  if (name) holder.appendChild(icon(name));
  else holder.textContent = text;
}
