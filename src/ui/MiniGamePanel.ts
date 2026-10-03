import type { Game } from '../game/engine/Game';
import { button } from './common';
import { CanvasGamePanel } from './CanvasGamePanel';
import { MINI_GAME_REWARD, findMiniGame, type MiniGameDef, type MiniGameId } from '../game/systems/minigames';

// One of the little games around the property. On top of the shared frame
// it knows its own record: the best score in the corner, a "Play again" or
// "Done" at the end, and the one-off reward the first time the goal is
// reached — the same deal as a first hole in one on the putting mat.

export abstract class MiniGamePanel extends CanvasGamePanel {
  protected def: MiniGameDef;
  /** The session's over and the result is up. */
  protected finished = false;

  constructor(
    game: Game,
    protected id: MiniGameId
  ) {
    const def = findMiniGame(id)!;
    super(game, `${def.emoji} ${def.name}`, `mg-${id}`);
    this.def = def;
  }

  open() {
    this.finished = false;
    super.open();
  }

  protected restart() {
    this.finished = false;
    super.restart();
  }

  /**
   * On a small phone the default leaves only 240px: too little for rows of
   * twigs or a maze at a finger's width. Better the panel scrolls a little
   * below the canvas (the canvas itself never scrolls) than cramp the game.
   */
  protected canvasHeight(w: number): number {
    return Math.max(340, super.canvasHeight(w));
  }

  /** The best score so far, or null. */
  protected get best(): number | null {
    return this.game.state.minigames[this.id]?.best ?? null;
  }

  /** The standard buttons while playing: start over. Leaving is the panel's ×. */
  protected playingActions() {
    this.setActions(button('Start over', () => this.restart(), 'secondary-btn'));
  }

  /** "Best 12 skips", or what reaching the goal is worth if it hasn't been yet. */
  protected bestLine(): string {
    const rec = this.game.state.minigames[this.id];
    const parts: string[] = [];
    if (rec?.best != null) parts.push(`Best ${rec.best} ${this.def.unit}`);
    if (!rec?.goal) parts.push(`${this.def.goal} ${this.def.unit} earns ${MINI_GAME_REWARD} coins, once`);
    return parts.join(' · ');
  }

  /**
   * The session's over: record it and show the result. `summary` is a short
   * line about how it went ("4 of 6 targets on the first throw").
   */
  protected finish(score: number, summary = '') {
    if (this.finished) return;
    this.finished = true;
    const s = Math.max(0, Math.round(score));
    const res = this.game.finishMiniGame(this.id, s);
    const sub = res.coins ? `Past ${this.def.goal} for the first time: +${res.coins} coins` : res.first ? 'Your first go.' : res.best ? 'A new best!' : `Best: ${this.best} ${this.def.unit}`;
    this.banner = { text: `${s} ${this.def.unit}`, sub, until: Infinity };
    this.setCard(this.def.name, `${s} ${this.def.unit}`);
    this.setStatus(summary);
    this.setActions(button('Play again', () => this.restart()), button('Done', () => this.panel.close(), 'secondary-btn'));
  }
}
