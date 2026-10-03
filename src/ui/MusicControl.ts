import type { MusicManager } from '../game/engine/MusicManager';
import { el } from './dom';
import { THEMES, getTheme, setTheme, onThemeChange } from '../game/season';

/**
 * A small music button in the HUD and the popover it opens: music on or off,
 * a volume slider, and the name of what's playing. Opening it never touches
 * the music itself.
 */
export class MusicControl {
  readonly button = el('button', 'icon-btn music-btn', '\u{1F3B5}');
  readonly menu = el('div', 'music-menu');
  private toggle = el('button', 'music-toggle');
  private slider = el('input', 'music-volume');
  private nowPlaying = el('div', 'music-now');
  private themeRow = el('div', 'theme-row');
  private open = false;

  constructor(private music: MusicManager) {
    this.button.setAttribute('aria-label', 'Music');
    this.button.setAttribute('aria-haspopup', 'true');
    this.button.addEventListener('click', () => this.setOpen(!this.open));

    const head = el('div', 'music-head');
    head.append(el('span', 'music-title', 'Music'), this.toggle);
    this.toggle.setAttribute('role', 'switch');
    this.toggle.addEventListener('click', () => {
      if (this.music.isMuted()) this.music.unmuteMusic();
      else this.music.muteMusic();
    });

    this.slider.type = 'range';
    this.slider.min = '0';
    this.slider.max = '100';
    this.slider.step = '1';
    this.slider.setAttribute('aria-label', 'Music volume');
    this.slider.addEventListener('input', () => {
      this.music.setMusicVolume(Number(this.slider.value) / 100);
      // Dragging the volume up is a clear wish to hear it.
      if (this.music.isMuted() && Number(this.slider.value) > 0) this.music.unmuteMusic();
    });

    // The season's look: Classic, or October. It only changes what the valley looks like.
    const themeHead = el('div', 'music-head theme-head');
    themeHead.append(el('span', 'music-title', 'Season'));
    for (const t of THEMES) {
      const b = el('button', 'theme-choice', `${t.icon} ${t.label}`);
      b.dataset.theme = t.id;
      b.setAttribute('role', 'radio');
      b.addEventListener('click', () => setTheme(t.id));
      this.themeRow.appendChild(b);
    }
    this.themeRow.setAttribute('role', 'radiogroup');
    this.themeRow.setAttribute('aria-label', 'Season');
    onThemeChange(() => this.refresh());
    this.menu.append(head, this.slider, this.nowPlaying, themeHead, this.themeRow);
    // Taps inside the popover mustn't reach the game world beneath it.
    this.menu.addEventListener('pointerdown', (e) => e.stopPropagation());
    window.addEventListener('pointerdown', (e) => {
      if (this.open && !this.menu.contains(e.target as Node) && !this.button.contains(e.target as Node)) this.setOpen(false);
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open) this.setOpen(false);
    });
    this.music.onChange = () => this.refresh();
    this.refresh();
  }

  setOpen(open: boolean) {
    this.open = open;
    this.menu.classList.toggle('open', open);
    this.button.setAttribute('aria-expanded', String(open));
    if (open) this.refresh();
  }

  refresh() {
    const muted = this.music.isMuted();
    this.toggle.textContent = muted ? 'Off' : 'On';
    this.toggle.classList.toggle('on', !muted);
    this.toggle.setAttribute('aria-checked', String(!muted));
    this.button.classList.toggle('muted', muted);
    const v = String(Math.round(this.music.getMusicVolume() * 100));
    if (this.slider.value !== v) this.slider.value = v;
    this.slider.style.setProperty('--fill', `${v}%`);
    this.menu.classList.toggle('is-muted', muted);
    const track = this.music.getWantedTrack();
    this.nowPlaying.textContent = muted ? 'Music is off' : `♪ ${track.title}`;
    const theme = getTheme();
    for (const b of Array.from(this.themeRow.children) as HTMLElement[]) {
      const on = b.dataset.theme === theme;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
  }
}
