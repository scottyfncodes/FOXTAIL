// The game's seasonal look. Classic is Foxtail as it always is; October is
// the same valley after sunset on Halloween night: deep autumn, fog in the
// hollows, pumpkins, and now and then something you're not sure you saw.
//
// The theme is a preference of the device, not part of the save: switching
// it never touches progression. Whatever October leaves behind in the save
// (pumpkins carved, strange things noted) waits there for next time.

export type SeasonTheme = 'classic' | 'october';

export const THEMES: { id: SeasonTheme; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'october', label: 'October' },
];

const THEME_KEY = 'foxtail-season';

/**
 * Whether the October look is offered at all. Off out of season: the game
 * always starts in Classic, whatever the calendar or the device remembers,
 * and the Season switch is hidden. Flip back on next October.
 */
export const SEASONAL_THEMES_ENABLED = false;

let active: SeasonTheme = 'classic';
const listeners = new Set<(t: SeasonTheme) => void>();

/** The theme to start in: whatever was last chosen on this device, or, never having chosen, the calendar's. */
export function preferredTheme(now: Date = new Date()): SeasonTheme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'classic' || saved === 'october') return saved;
  } catch {
    // Storage blocked: fall through to the calendar.
  }
  return now.getMonth() === 9 ? 'october' : 'classic';
}

export function initTheme(now: Date = new Date(), enabled: boolean = SEASONAL_THEMES_ENABLED): SeasonTheme {
  active = enabled ? preferredTheme(now) : 'classic';
  return active;
}

export function getTheme(): SeasonTheme {
  return active;
}

export function isOctober(): boolean {
  return active === 'october';
}

/** Switches the look (and remembers the choice on this device). */
export function setTheme(t: SeasonTheme, remember = true) {
  if (remember) {
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      // Not remembered, but still switched for this visit.
    }
  }
  if (t === active) return;
  active = t;
  for (const fn of listeners) fn(t);
}

export function onThemeChange(fn: (t: SeasonTheme) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
