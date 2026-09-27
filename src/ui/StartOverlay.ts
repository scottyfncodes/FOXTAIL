import { el, clear } from './dom';

/** What a returning player sees at a glance before stepping back outside. */
export interface StartSummary {
  /** Game days since the valley was first walked into. */
  day: number;
  plants: number;
  species: number;
  coins: number;
  /** Real milliseconds since the last visit. */
  awayMs: number;
}

/** "3 days", "2 hours", "a few minutes". */
export function awayText(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 5) return 'a moment';
  if (m < 60) return `${m} minutes`;
  const h = Math.floor(m / 60);
  if (h < 48) return h === 1 ? 'an hour' : `${h} hours`;
  const d = Math.floor(h / 24);
  return `${d} days`;
}

/**
 * The valley at dusk, drawn once in SVG: a hazy far ridge, tree-lined hills,
 * the greenhouse spilling warm light onto a path, foxtail grass in the
 * foreground, and the fox on the hill, watching. The scene is 2400 wide so
 * a wide screen crops its sides rather than its sky; a phone sees roughly
 * x 1000–1400, so everything that matters sits around x 1200.
 */
const HILLS = `
<svg viewBox="0 0 2400 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <defs>
    <linearGradient id="sh-haze" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5fc9b8" stop-opacity="0"/>
      <stop offset="1" stop-color="#5fc9b8" stop-opacity="0.14"/>
    </linearGradient>
    <radialGradient id="sh-glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#f4c87a" stop-opacity="0.4"/>
      <stop offset="0.5" stop-color="#f4c87a" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#f4c87a" stop-opacity="0"/>
    </radialGradient>
    <g id="sh-tuft" stroke-width="1.6" stroke-linecap="round">
      <path d="M0 0 C -2 -14, -6 -22, -10 -30" fill="none"/><ellipse cx="-10.5" cy="-33" rx="2.6" ry="6" transform="rotate(20 -10.5 -33)"/>
      <path d="M0 0 C 1 -16, 0 -26, 2 -36" fill="none"/><ellipse cx="2.2" cy="-40" rx="2.6" ry="6.5" transform="rotate(-4 2.2 -40)"/>
      <path d="M0 0 C 4 -12, 9 -20, 14 -26" fill="none"/><ellipse cx="14.5" cy="-29" rx="2.4" ry="5.5" transform="rotate(-30 14.5 -29)"/>
      <path d="M0 0 C -1 -10, -3 -16, -5 -22" fill="none"/><ellipse cx="-5.5" cy="-25" rx="2" ry="4.5" transform="rotate(14 -5.5 -25)"/>
      <path d="M0 0 C 2 -8, 5 -14, 8 -18" fill="none"/><ellipse cx="8.5" cy="-21" rx="2" ry="4.5" transform="rotate(-24 8.5 -21)"/>
    </g>
    <g id="sh-tree"><ellipse cx="0" cy="0" rx="22" ry="28"/><ellipse cx="38" cy="8" rx="15" ry="20"/></g>
  </defs>
  <!-- The last of the light along the far ridge. -->
  <rect x="0" y="0" width="2400" height="118" fill="url(#sh-haze)"/>
  <path d="M0 92 C 150 100, 300 84, 450 100 C 560 112, 620 118, 700 112 C 790 96, 880 104, 970 90 C 1080 74, 1170 96, 1260 84 C 1380 70, 1480 92, 1580 78 C 1630 72, 1670 78, 1700 74 C 1800 70, 1900 90, 2050 80 C 2200 70, 2300 92, 2400 84 L2400 300 L0 300 Z" fill="#1b4b41" opacity="0.75"/>
  <!-- The middle hill, with its trees. -->
  <path d="M0 120 C 150 108, 300 140, 450 134 C 560 130, 640 146, 700 150 C 820 118, 920 136, 1030 122 C 1170 104, 1260 140, 1400 116 C 1520 96, 1600 112, 1700 104 C 1800 96, 1900 130, 2050 122 C 2200 114, 2300 132, 2400 118 L2400 300 L0 300 Z" fill="#163b34"/>
  <g fill="#0f2b26">
    <use href="#sh-tree" transform="translate(200 116)"/><use href="#sh-tree" transform="translate(520 132) scale(0.8)"/>
    <use href="#sh-tree" transform="translate(790 128)"/>
    <use href="#sh-tree" transform="translate(1038 122) scale(0.7)"/>
    <use href="#sh-tree" transform="translate(1348 120) scale(0.72)"/>
    <use href="#sh-tree" transform="translate(1490 108) scale(1.1)"/><use href="#sh-tree" transform="translate(1600 106)"/>
    <use href="#sh-tree" transform="translate(1900 106)"/><use href="#sh-tree" transform="translate(2250 120) scale(0.85)"/>
  </g>
  <!-- Warm light spilling from the greenhouse, and the greenhouse itself. -->
  <ellipse cx="1208" cy="128" rx="120" ry="64" fill="url(#sh-glow)"/>
  <g transform="translate(1170 108)">
    <path d="M0 44 L0 12 L38 -14 L76 12 L76 44 Z" fill="#1c4a41"/>
    <path d="M6 40 L6 16 L38 -6 L70 16 L70 40 Z" fill="#f4c87a" opacity="0.9"/>
    <path d="M38 -6 L38 40 M22 5 L22 40 M54 5 L54 40 M6 24 L70 24" stroke="#1c4a41" stroke-width="2"/>
    <rect x="34" y="24" width="8" height="16" fill="#3a2a18"/>
  </g>
  <ellipse cx="1208" cy="154" rx="44" ry="7" fill="#f4c87a" opacity="0.16"/>
  <!-- A path winding down from the door, lost behind the near hill. -->
  <path d="M1206 154 C 1178 170, 1142 184, 1106 218" stroke="#24493f" stroke-width="10" stroke-linecap="round" fill="none"/>
  <path d="M1206 154 C 1178 170, 1142 184, 1106 218" stroke="#d9c58c" stroke-width="1.8" stroke-dasharray="2 8" stroke-linecap="round" fill="none" opacity="0.4"/>
  <!-- The fox, sitting on the hill, watching the light. -->
  <g transform="translate(1312 140)">
    <path d="M6 0 C 22 4, 28 -8, 18 -16" stroke="#c25f2c" stroke-width="7" stroke-linecap="round" fill="none"/>
    <circle cx="18" cy="-16" r="3.6" fill="#f4e5c8"/>
    <ellipse cx="2" cy="-9" rx="9" ry="12" fill="#c25f2c"/>
    <ellipse cx="0" cy="-7" rx="4.5" ry="7" fill="#f4e5c8" opacity="0.85"/>
    <circle cx="-2" cy="-23" r="6.2" fill="#c25f2c"/>
    <path d="M-8 -26 L-10 -35 L-4 -29 Z M0 -28 L2 -35 L5 -27 Z" fill="#c25f2c"/>
    <path d="M-8 -22 L-14 -20 L-8 -18 Z" fill="#c25f2c"/>
  </g>
  <!-- The near hill, with foxtails along its crest. -->
  <path d="M0 214 C 150 230, 300 200, 450 216 C 560 228, 620 234, 700 226 C 850 200, 1000 236, 1150 214 C 1300 194, 1460 232, 1700 206 C 1850 190, 2000 236, 2150 214 C 2280 196, 2340 220, 2400 216 L2400 300 L0 300 Z" fill="#11302a"/>
  <g stroke="#11302a" fill="#11302a">
    <use href="#sh-tuft" transform="translate(150 224) scale(1.2)"/><use href="#sh-tuft" transform="translate(500 220) scale(1)"/>
    <use href="#sh-tuft" transform="translate(760 214) scale(1.2)"/>
    <use href="#sh-tuft" transform="translate(1000 228) scale(1.1)"/><use href="#sh-tuft" transform="translate(1034 226) scale(0.8)"/>
    <use href="#sh-tuft" transform="translate(1382 205) scale(1)"/><use href="#sh-tuft" transform="translate(1422 212) scale(1.25)"/>
    <use href="#sh-tuft" transform="translate(1660 208) scale(1.1)"/>
    <use href="#sh-tuft" transform="translate(1950 200) scale(1.1)"/><use href="#sh-tuft" transform="translate(2300 214) scale(1.2)"/>
  </g>
  <!-- The ground at our feet. -->
  <path d="M0 262 C 200 280, 400 258, 600 274 C 650 278, 680 278, 700 276 C 900 262, 1100 286, 1300 270 C 1480 254, 1600 276, 1700 264 C 1850 250, 2000 284, 2200 266 C 2300 258, 2350 270, 2400 262 L2400 300 L0 300 Z" fill="#0a211d"/>
  <g stroke="#0a211d" fill="#0a211d">
    <use href="#sh-tuft" transform="translate(300 266) scale(1.3)"/>
    <use href="#sh-tuft" transform="translate(900 268) scale(1.35)"/>
    <use href="#sh-tuft" transform="translate(1260 275) scale(1.25)"/><use href="#sh-tuft" transform="translate(1300 272) scale(0.9)"/>
    <use href="#sh-tuft" transform="translate(1560 266) scale(1.3)"/>
    <use href="#sh-tuft" transform="translate(2000 270) scale(1.3)"/><use href="#sh-tuft" transform="translate(2350 264) scale(1.1)"/>
  </g>
</svg>`;

export class StartOverlay {
  root = el('div', 'start-overlay');

  constructor(
    private onStart: () => void,
    private onReset: () => void,
    isNew: boolean,
    private summary: () => StartSummary | null = () => null
  ) {
    this.render(isNew);
    document.body.appendChild(this.root);
  }

  private render(isNew: boolean) {
    clear(this.root);
    // The scene: stars, drifting fireflies, the hills.
    const sky = el('div', 'start-sky');
    for (let i = 0; i < 40; i++) {
      const s = el('i', 'start-star');
      s.style.left = `${(i * 37 + 11) % 100}%`;
      s.style.top = `${((i * 53 + 7) % 38) + 2}%`;
      s.style.animationDelay = `${(i * 0.7) % 5}s`;
      s.style.opacity = `${0.35 + ((i * 29) % 60) / 100}`;
      sky.appendChild(s);
    }
    this.root.appendChild(sky);
    const hills = el('div', 'start-hills');
    hills.innerHTML = HILLS;
    this.root.appendChild(hills);
    const flies = el('div', 'start-fireflies');
    for (let i = 0; i < 14; i++) {
      const f = el('i', 'start-firefly');
      f.style.left = `${(i * 41 + 19) % 100}%`;
      f.style.top = `${55 + ((i * 23) % 35)}%`;
      f.style.animationDuration = `${6 + (i % 5) * 1.5}s`;
      f.style.animationDelay = `${(i * 1.3) % 6}s`;
      flies.appendChild(f);
    }
    this.root.appendChild(flies);

    const card = el('div', 'start-card');
    const hero = el('div', 'start-hero');
    const img = el('img');
    // Relative to the app's base, so it resolves when the game is served from a sub-path (GitHub Pages).
    img.src = `${import.meta.env.BASE_URL}icons/foxtail.svg`;
    img.alt = '';
    img.draggable = false;
    hero.appendChild(img);
    card.appendChild(hero);
    card.appendChild(el('h1', undefined, 'FOXTAIL'));
    card.appendChild(el('div', 'start-tagline', 'a quiet game about wild houseplants'));

    const sum = isNew ? null : this.summary();
    if (sum) {
      const row = el('div', 'start-stats');
      const stat = (value: number, label: string) => {
        const cell = el('div', 'start-stat');
        cell.appendChild(el('span', 'start-stat-value', value.toLocaleString('en-GB')));
        cell.appendChild(el('span', 'start-stat-label', label));
        row.appendChild(cell);
      };
      stat(sum.day, 'day');
      stat(sum.plants, 'growing');
      stat(sum.species, 'found');
      stat(sum.coins, 'coins');
      card.appendChild(row);
      card.appendChild(el('p', undefined, `You’ve been away ${awayText(sum.awayMs)}. Your plants have been growing without you, and the valley may look a little different.`));
    } else {
      card.appendChild(
        el(
          'p',
          undefined,
          'You’re Ellen, a plant collector, and Scout — scruffy, one-eyed, never far — is at your side. A little greenhouse, an empty market stall, and a whole valley of wild houseplants waiting to be found. Somewhere out there, a fox knows where the rarest ones grow.'
        )
      );
    }

    const btn = el('button', 'primary-btn', isNew ? 'Step Outside' : 'Continue');
    btn.addEventListener('click', () => {
      this.root.classList.add('leaving');
      window.setTimeout(() => this.root.remove(), 420);
      this.onStart();
    });
    card.appendChild(btn);

    if (!isNew) {
      const resetLink = el('button', 'start-reset', 'Start a new game');
      resetLink.addEventListener('click', () => {
        if (confirm('This will erase your current progress. Start fresh?')) {
          this.onReset();
          this.render(true);
        }
      });
      card.appendChild(resetLink);
    }
    this.root.appendChild(card);
    this.root.appendChild(el('div', 'start-foot', 'Ellen · Scout · Scott · Ranger · and the fox'));
  }
}
