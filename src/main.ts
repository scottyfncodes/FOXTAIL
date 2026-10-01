import './styles/main.css';
import { Game } from './game/engine/Game';
import { HUD } from './ui/HUD';
import { JournalPanel } from './ui/JournalPanel';
import { BasketPanel } from './ui/BasketPanel';
import { GreenhousePanel } from './ui/GreenhousePanel';
import { MarketPanel } from './ui/MarketPanel';
import { StartOverlay } from './ui/StartOverlay';
import { PlantCard } from './ui/PlantCard';
import { GroundCard } from './ui/GroundCard';
import { PuttingPanel } from './ui/PuttingPanel';
import { PondPanel } from './ui/PondPanel';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const game = new Game(canvas);

const hud = new HUD(game);
document.getElementById('app')!.appendChild(hud.root);

const journal = new JournalPanel(game);
const basket = new BasketPanel(game);
const greenhouse = new GreenhousePanel(game);
const market = new MarketPanel(game);
const plantCard = new PlantCard(game);
const groundCard = new GroundCard(game);
const putting = new PuttingPanel(game);
const pond = new PondPanel(game);

hud.onJournal = () => journal.open();
game.onOpenRegions = () => journal.open('regions');
hud.onBasket = () => basket.open();
game.onOpenGreenhouse = (target) => greenhouse.open(target);
game.onOpenMarket = () => market.open();
game.onOpenPond = (id) => pond.open(id);
game.onOpenPutting = () => putting.open();
game.onOpenPlantCard = (id) => plantCard.open(id);
game.onOpenGroundCard = (target) => groundCard.open(target);
game.onStateTouched = () => {
  journal.refresh();
  basket.refresh();
  greenhouse.refresh();
  market.refresh();
  plantCard.refresh();
  groundCard.refresh();
  pond.refresh();
};
game.onFrame = () => hud.update();

if (import.meta.env.DEV) {
  (window as unknown as { __foxtail: unknown }).__foxtail = { game, putting };
}

new StartOverlay(
  () => {
    game.audio.init();
    game.start();
  },
  () => game.resetToNewGame(),
  game.isNew,
  () => {
    const s = game.state;
    return {
      day: Math.floor(s.clock.totalMinutes / 1440) + 1,
      plants: Object.keys(s.plants).length,
      species: Object.keys(s.collection).length,
      coins: s.coins,
      awayMs: Math.max(0, Date.now() - s.clock.lastRealTimestamp),
    };
  }
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    import('virtual:pwa-register').then(({ registerSW }) => {
      registerSW({ immediate: true });
    }).catch(() => {
      // PWA plugin not available in this build mode; safe to ignore.
    });
  });
}
