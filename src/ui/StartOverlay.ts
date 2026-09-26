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

/** The valley at dusk, drawn once in SVG: hills, trees, the greenhouse lit from inside. */
const HILLS = `
<svg viewBox="0 0 1000 320" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <path d="M0 200 C 120 150, 220 170, 330 150 C 470 125, 560 170, 700 140 C 820 115, 900 130, 1000 120 L 1000 320 L 0 320 Z" fill="#163b34"/>
  <path d="M0 240 C 110 215, 200 232, 310 214 C 420 196, 520 226, 640 210 C 760 194, 880 220, 1000 200 L 1000 320 L 0 320 Z" fill="#11302a"/>
  <g fill="#0e2822">
    <ellipse cx="120" cy="228" rx="26" ry="30"/><ellipse cx="160" cy="236" rx="18" ry="22"/>
    <ellipse cx="760" cy="222" rx="30" ry="34"/><ellipse cx="810" cy="232" rx="20" ry="24"/><ellipse cx="880" cy="226" rx="26" ry="30"/>
  </g>
  <g transform="translate(470 196)">
    <path d="M0 40 L0 10 L38 -14 L76 10 L76 40 Z" fill="#1c4a41"/>
    <path d="M6 36 L6 14 L38 -6 L70 14 L70 36 Z" fill="#f4c87a" opacity="0.85"/>
    <path d="M38 -6 L38 36 M22 4 L22 36 M54 4 L54 36 M6 22 L70 22" stroke="#1c4a41" stroke-width="2"/>
    <rect x="34" y="20" width="8" height="16" fill="#3a2a18"/>
  </g>
  <path d="M0 282 C 200 262, 400 290, 600 270 C 780 252, 900 276, 1000 262 L 1000 320 L 0 320 Z" fill="#0a211d"/>
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
    img.src = '/icons/foxtail.svg';
    img.alt = '';
    img.draggable = false;
    hero.appendChild(img);
    card.appendChild(hero);
    card.appendChild(el('h1', undefined, 'FOXTAIL'));
    card.appendChild(el('div', 'start-tagline', 'a quiet game about wild houseplants'));

    const sum = isNew ? null : this.summary();
    if (sum) {
      const row = el('div', 'start-summary');
      const chip = (text: string) => row.appendChild(el('span', 'start-chip', text));
      chip(`Day ${sum.day}`);
      chip(`${sum.plants} plant${sum.plants === 1 ? '' : 's'} growing`);
      chip(`${sum.species} kind${sum.species === 1 ? '' : 's'} found`);
      chip(`${sum.coins} coins`);
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
      const resetLink = el('button', 'start-reset', 'Start a new game instead');
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
