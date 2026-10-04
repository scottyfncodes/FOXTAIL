import type { Game, ToastEvent } from '../game/engine/Game';
import { el } from './dom';
import { ZONES } from '../game/data/zones';
import { regionLabel } from '../game/systems/regions';
import { zoneAt } from '../game/data/worldMap';
import { isNight, minuteOfDay } from '../game/engine/Clock';
import { ModeBar } from './ModeBar';
import { ToastScheduler } from '../game/systems/toasts';
import { coin, golfBallPortrait, golfRarityBadge } from './common';
import { findGolfBall } from '../game/data/golfBalls';
import { MusicControl } from './MusicControl';

function formatClock(totalMinutes: number): string {
  const m = minuteOfDay(totalMinutes);
  const h24 = Math.floor(m / 60);
  const min = Math.floor(m % 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  return `${h12}:${min.toString().padStart(2, '0')} ${ampm}`;
}

/** What the action button says for each kind of thing nearby. */
const ACTION_VERBS: Record<string, string> = {
  truck: 'RIDE',
  spot: 'SNIP',
  wildPlant: 'SNIP',
  lantern: 'TAKE',
  market: 'SHOP',
  bed: 'OPEN',
  display: 'OPEN',
  foxFind: 'LOOK',
  houseDoor: 'HOME',
  greenhouseDoor: 'IN',
  greenhouseExit: 'OUT',
  frontDoor: 'OUT',
  rock: 'CLEAR',
  decor: 'MOVE',
  setDown: 'DROP',
  puttingMat: 'PUTT',
  miniGame: 'PLAY',
  plaque: 'LOOK',
  pumpkin: 'CARVE',
  ghost: 'WAVE',
};

const WEATHER_ICON: Record<string, string> = { clear: '☀', rain: '☔', overcast: '☁' };

function setText(node: Node, text: string) {
  if (node.textContent !== text) node.textContent = text;
}

/** Writes an inline style or attribute only when it changes: the HUD is updated every frame. */
function setStyle(node: HTMLElement, prop: 'display' | 'opacity', value: string) {
  if (node.style[prop] !== value) node.style[prop] = value;
}
function setAttr(node: Element, name: string, value: string) {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}

/** NEW GOLF BALL FOUND!, with the ball itself, its name and its rarity: small, and gone in a few seconds. */
function golfBallToast(t: ToastEvent): HTMLElement {
  const ball = findGolfBall(t.golfBall ?? '');
  const node = el('div', `toast ${t.kind} sig-${t.significance} golf-toast`);
  if (!ball) {
    node.textContent = t.text;
    return node;
  }
  node.setAttribute('aria-label', t.text);
  const info = el('div', 'golf-toast-info');
  info.append(el('div', 'golf-toast-head', 'New golf ball found!'));
  if (ball.hidden) info.append(el('div', 'golf-toast-was', `The ${ball.hidden.name}…`));
  info.append(el('div', 'golf-toast-name', ball.name), golfRarityBadge(ball.rarity));
  node.append(golfBallPortrait(ball, 40), info);
  return node;
}

export class HUD {
  root = el('div', 'hud');
  private zoneChip = el('div', 'hud-chip');
  private timeChip = el('div', 'hud-chip');
  private coinChip = el('div', 'hud-chip coins');
  private coinText = document.createTextNode('');
  private journalBtn = el('button', 'icon-btn', '\u{1F4D3}');
  private basketBtn = el('button', 'icon-btn', '\u{1F9FA}');
  /**
   * One button for working the place with your hands. Outdoors it opens
   * the garden menu (bed, path, arrange); indoors it arranges the house.
   * While a tool is in hand it's the way to stop.
   */
  private toolBtn = el('button', 'icon-btn tool-btn', '\u{1F33F}');
  /** Shown only behind the wheel: park the truck and get out. */
  private truckBtn = el('button', 'icon-btn truck-btn', '\u{1F69A}');
  private landMenu = el('div', 'land-menu');
  private modeBar: ModeBar;
  private musicControl: MusicControl;
  private touch = el('div', 'touch-controls');
  private interactionPrompt = el('div', 'interaction-prompt');
  private promptLabel = document.createTextNode('');
  private toastStack = el('div', 'toast-stack');
  private toasts = new ToastScheduler<HTMLElement>();
  private joystickZone = el('div', 'joystick-zone');
  private joystickThumb = el('div', 'joystick-thumb');
  private actionBtn = el('button', 'action-btn', 'SNIP');

  onJournal: (() => void) | null = null;
  onBasket: (() => void) | null = null;
  private landMenuOpen = false;

  constructor(private game: Game) {
    const top = el('div', 'hud-top');
    const left = el('div', 'hud-chip-group');
    left.style.display = 'flex';
    left.style.gap = '8px';
    left.style.flexWrap = 'wrap';
    this.coinChip.append(coin(), this.coinText);
    left.append(this.zoneChip, this.timeChip, this.coinChip);
    const right = el('div', 'hud-buttons');
    this.musicControl = new MusicControl(game.audio.music);
    right.append(this.musicControl.button, this.truckBtn, this.toolBtn, this.journalBtn, this.basketBtn);
    this.truckBtn.setAttribute('aria-label', 'Park the truck');
    this.truckBtn.title = 'Park here and get out';
    this.truckBtn.style.display = 'none';
    this.truckBtn.addEventListener('click', () => this.game.parkTruck());
    top.append(left, right);
    this.journalBtn.setAttribute('aria-label', 'Field journal');
    this.basketBtn.setAttribute('aria-label', 'Basket');

    this.joystickZone.append(this.joystickThumb);
    const touch = this.touch;
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) {
      touch.append(this.joystickZone, this.actionBtn);
    }

    this.modeBar = new ModeBar(game);
    this.buildLandMenu();
    this.interactionPrompt.append(el('kbd', undefined, 'E'), this.promptLabel);
    this.root.append(top, this.interactionPrompt, touch, this.landMenu, this.musicControl.menu, this.modeBar.root);
    // Notifications sit above everything, open panels included, so news
    // still gets through while a plant, bed or planter is open.
    document.body.appendChild(this.toastStack);

    this.musicControl.button.addEventListener('click', () => this.setLandMenu(false));
    this.journalBtn.addEventListener('click', () => this.onJournal?.());
    this.basketBtn.addEventListener('click', () => this.onBasket?.());
    this.toolBtn.addEventListener('click', () => {
      if (this.game.tools.active) return this.game.cancelTool();
      if (this.game.state.player.inGreenhouse) {
        this.setLandMenu(false);
        this.game.beginArrange();
      } else this.setLandMenu(!this.landMenuOpen);
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.landMenuOpen) this.setLandMenu(false);
    });
    this.game.input.bindJoystick(this.joystickZone, this.joystickThumb);
    this.game.input.bindActionButton(this.actionBtn);
    this.game.onToast = (t) => this.showToast(t);
  }

  private buildLandMenu() {
    const item = (icon: string, label: string, onClick: () => void) => {
      const b = el('button', 'land-item');
      b.append(el('span', 'land-icon', icon), el('span', 'land-label', label));
      b.addEventListener('click', () => {
        this.setLandMenu(false);
        onClick();
      });
      return b;
    };
    this.landMenu.append(
      item('▭', 'Dig a bed', () => this.game.beginBed('rect')),
      item('◯', 'Round bed', () => this.game.beginBed('oval')),
      item('〰', 'Carve a path', () => this.game.beginPath()),
      item('◻', 'Clear a square', () => this.game.beginClearing('square')),
      item('○', 'Clear a circle', () => this.game.beginClearing('circle')),
      item('\u{1FA91}', 'Arrange the garden', () => this.game.beginArrange())
    );
    this.landMenu.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  private setLandMenu(open: boolean) {
    if (open) this.musicControl.setOpen(false);
    this.landMenuOpen = open;
    this.landMenu.classList.toggle('open', open);
  }

  private showToast(t: ToastEvent) {
    const node = t.golfBall ? golfBallToast(t) : el('div', `toast ${t.kind} sig-${t.significance}`, t.text);
    node.setAttribute('role', 'status');
    this.toasts.push(node, t.text, t.significance, performance.now(), t.opts);
    this.pumpToasts();
  }

  private pumpToasts() {
    const { show, hide } = this.toasts.tick(performance.now());
    for (const node of hide) {
      node.classList.add('leaving');
      setTimeout(() => node.remove(), 450);
    }
    for (const node of show) this.toastStack.appendChild(node);
  }

  // Called every frame: only touch the DOM when what's shown actually changes.
  update() {
    this.pumpToasts();
    const state = this.game.state;
    const zone = state.player.inGreenhouse ? 'greenhouse' : zoneAt(Math.floor(state.player.x), Math.floor(state.player.y));
    const cover = zone === 'greenhouse' ? 0 : this.game.lush.zoneCover[zone] ?? 0;
    const room = this.game.currentRoom();
    const place = room === 'living' ? 'Home' : zone === 'greenhouse' ? ZONES.greenhouse.name : regionLabel(state, zone);
    setText(this.zoneChip, cover >= 0.01 ? `${place} · ${Math.round(cover * 100)}% yours` : place);
    setText(this.coinText, String(state.coins));
    const tools = this.game.tools.active;
    setText(this.toolBtn, tools ? '✕' : state.player.inGreenhouse ? '\u{1FA91}' : '\u{1F33F}');
    setStyle(this.truckBtn, 'display', this.game.riding() ? '' : 'none');
    setAttr(this.toolBtn, 'aria-label', tools ? 'Stop' : state.player.inGreenhouse ? 'Arrange the house' : 'Garden');
    if (state.player.inGreenhouse && this.landMenuOpen) this.setLandMenu(false);
    this.root.classList.toggle('tool-active', tools);
    this.root.classList.toggle('arrange-active', this.game.tools.mode.kind === 'arrange' || this.game.tools.mode.kind === 'yard');
    this.modeBar.update();
    const night = isNight(state.clock.totalMinutes);
    setText(this.timeChip, `${WEATHER_ICON[state.weather.condition]} ${formatClock(state.clock.totalMinutes)}${night ? ' \u{1F319}' : ''}`);

    const n = tools ? null : this.game.nearest;
    this.interactionPrompt.classList.toggle('visible', !!n);
    setStyle(this.actionBtn, 'opacity', n ? '1' : '0.55');
    if (!n) return;
    setText(this.promptLabel, n.label);
    setText(this.actionBtn, ACTION_VERBS[n.kind] ?? 'GO');
  }
}
